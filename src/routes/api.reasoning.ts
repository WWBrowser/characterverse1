import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { reasoningCycles, trainingSignals, characters } from '../../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { ensureCoinSettings, mintCoins } from '../../db/coins.js'
import { MILLI } from '../lib/coins.js'
import { runReasoning, GOLD_PER_POL } from '../lib/reasoning.js'

// Reasoning Training Engine API — the agentic reasoning layer of the Training
// Control Room.
//
//   GET  /api/reasoning?characterId=N  → that character's reasoning cycles (newest first)
//   GET  /api/reasoning                → the 50 most recent cycles (global feed)
//   POST /api/reasoning  { characterId, task, costBudget?, subWeight?, sessionId? }
//        → runs one reasoning cycle. The task clears the cognitive firewall
//          (intercept/scam/block/alert) and the reasoning.md cost gate; a verified
//          completed task records Proof of Labor (POL) — which mines Gold (CC) and
//          emits a training signal that feeds the character's refinement layer and,
//          through it, the synapse collectives.
//
// Only a completed cycle pays out and feeds the collectives. Blocked cycles are
// halted pre-burn; escalated cycles raise question.md to the human. All three are
// recorded so the POL ledger tells the whole story.

export const Route = createFileRoute('/api/reasoning')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const characterIdParam = url.searchParams.get('characterId')

        if (characterIdParam && !isNaN(Number(characterIdParam))) {
          const cid = Number(characterIdParam)
          const rows = await db
            .select()
            .from(reasoningCycles)
            .where(eq(reasoningCycles.characterId, cid))
            .orderBy(desc(reasoningCycles.createdAt))
          return Response.json(rows)
        }

        const recent = await db
          .select()
          .from(reasoningCycles)
          .orderBy(desc(reasoningCycles.createdAt))
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

        const characterId = Number(body.characterId)
        const task = String(body.task || '').trim()
        if (!characterId) return Response.json({ error: 'characterId is required' }, { status: 400 })
        if (!task) return Response.json({ error: 'A task is required' }, { status: 400 })

        const [character] = await db.select().from(characters).where(eq(characters.id, characterId))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        const sessionId = String(body.sessionId || '')
        const subWeight = String(body.subWeight || 'general')

        // Run the cycle purely — same evaluator the client previews with.
        const result = runReasoning({ task, costBudget: body.costBudget, subWeight })

        // A completed, verified task feeds the refinement layer: emit a real-time
        // training signal. This is the feeder stream — the character's signal count
        // is what the synapse collectives (the ATT / neural candidates) read to
        // score who clears each cycle's entry criteria.
        let signalId: number | null = null
        if (result.outcome === 'completed') {
          try {
            const [signal] = await db
              .insert(trainingSignals)
              .values({
                characterId,
                sessionId,
                kind: 'inform',
                subWeight: result.subWeight,
                content: `Reasoning engine — verified completed task: ${task}`.slice(0, 2000),
                mode: 'realtime',
                weight: 3,
                applied: true,
              })
              .returning()
            signalId = signal?.id ?? null
          } catch {
            /* best-effort — a signal hiccup must not fail the cycle */
          }
        }

        // Proof of Labor pays out in Gold (CC). Value is minted only for a verified
        // completed task — never for blocked or escalated compute.
        let goldMilli = 0
        if (result.outcome === 'completed' && result.pol > 0) {
          const coins = result.pol * GOLD_PER_POL
          goldMilli = coins * MILLI
          ensureCoinSettings()
            .then(() =>
              mintCoins({
                sessionId,
                characterId,
                coin: 'gold',
                coins,
                source: 'reasoning',
                reason: `Proof of Labor: ${result.pol} POL from a verified reasoning task`,
                refType: 'reasoning_cycle',
                refId: characterId,
              }),
            )
            .catch(() => {})
        }

        const [created] = await db
          .insert(reasoningCycles)
          .values({
            characterId,
            sessionId,
            task: task.slice(0, 2000),
            costBudget: result.costBudget,
            costBurned: result.costBurned,
            outcome: result.outcome,
            subWeight: result.subWeight,
            pol: result.pol,
            goldMilli,
            gate: result.gate,
            signalId,
            note: result.note,
          })
          .returning()

        return Response.json(created, { status: 201 })
      },
    },
  },
})
