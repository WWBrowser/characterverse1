import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { trainingSignals, characters } from '../../db/schema.js'
import { and, eq, desc } from 'drizzle-orm'
import { ensureCoinSettings, mintCoins } from '../../db/coins.js'
import { coerceSettings } from '../lib/coins.js'

// Training Control Room API — the refinement layer's signal store.
//
//   GET  /api/training?characterId=N  → that character's signals (newest first)
//   GET  /api/training                → the 50 most recent signals (global feed)
//   POST /api/training                → create a signal, or run an action:
//        (default)                      record one training signal
//        { action: 'applyBatch', characterId }
//                                       fold every pending batch signal in at once
//
// Real-time signals are stored already-applied; batch signals accumulate
// unapplied until applyBatch is run. CC / weights are derived on the client from
// these rows (src/lib/training.ts), keeping the model in one place.

const VALID_KINDS = new Set([
  'critique',
  'definition',
  'correction',
  'reference',
  'inform',
  'keep_in_loop',
  'evolve',
])

export const Route = createFileRoute('/api/training')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const characterIdParam = url.searchParams.get('characterId')

        if (characterIdParam && !isNaN(Number(characterIdParam))) {
          const cid = Number(characterIdParam)
          const signals = await db
            .select()
            .from(trainingSignals)
            .where(eq(trainingSignals.characterId, cid))
            .orderBy(desc(trainingSignals.createdAt))
          return Response.json(signals)
        }

        const recent = await db
          .select()
          .from(trainingSignals)
          .orderBy(desc(trainingSignals.createdAt))
          .limit(50)
        return Response.json(recent)
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const action = String(body.action || '')

        // Apply every pending batch signal for a character in one pass.
        if (action === 'applyBatch') {
          const characterId = Number(body.characterId)
          if (!characterId) return Response.json({ error: 'characterId is required' }, { status: 400 })
          await db
            .update(trainingSignals)
            .set({ applied: true })
            .where(
              and(
                eq(trainingSignals.characterId, characterId),
                eq(trainingSignals.mode, 'batch'),
                eq(trainingSignals.applied, false),
              ),
            )
          // Gold (CC) mined from character training success: applying the batch
          // folds the pending sub-weight refinements in, so the block pays out.
          ensureCoinSettings()
            .then((s) =>
              mintCoins({
                sessionId: String(body.sessionId || ''),
                characterId,
                coin: 'gold',
                coins: coerceSettings(s).goldRates.character,
                source: 'character',
                reason: 'Batch training applied',
                refType: 'character',
                refId: characterId,
              }),
            )
            .catch(() => {})
          const signals = await db
            .select()
            .from(trainingSignals)
            .where(eq(trainingSignals.characterId, characterId))
            .orderBy(desc(trainingSignals.createdAt))
          return Response.json(signals)
        }

        // Default: create a single training signal.
        const characterId = Number(body.characterId)
        const kind = String(body.kind || '')
        if (!characterId) return Response.json({ error: 'characterId is required' }, { status: 400 })
        if (!VALID_KINDS.has(kind)) return Response.json({ error: 'Unknown training kind' }, { status: 400 })

        const [character] = await db.select().from(characters).where(eq(characters.id, characterId))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        const mode = body.mode === 'batch' ? 'batch' : 'realtime'
        const weight = Math.max(1, Math.min(5, Math.floor(Number(body.weight) || 1)))

        const [created] = await db
          .insert(trainingSignals)
          .values({
            characterId,
            sessionId: String(body.sessionId || ''),
            kind,
            subWeight: String(body.subWeight || 'general'),
            content: String(body.content || ''),
            mode,
            weight,
            // Real-time training takes effect immediately; batch waits for applyBatch.
            applied: mode === 'realtime',
            sourceFeedbackId: body.sourceFeedbackId ? Number(body.sourceFeedbackId) : null,
          })
          .returning()

        // A real-time signal takes effect immediately — measured success on a
        // character sub-weight mines Gold (CC). Batch signals pay out on applyBatch.
        if (created.applied) {
          ensureCoinSettings()
            .then((s) =>
              mintCoins({
                sessionId: String(body.sessionId || ''),
                characterId,
                coin: 'gold',
                coins: coerceSettings(s).goldRates.character,
                source: 'character',
                reason: `Training signal: ${kind} → ${created.subWeight}`,
                refType: 'training_signal',
                refId: created.id,
              }),
            )
            .catch(() => {})
        }

        return Response.json(created, { status: 201 })
      },
    },
  },
})
