import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { trainingCycles, characters, trainingSignals } from '../../db/schema.js'
import { eq, asc, sql } from 'drizzle-orm'
import {
  GENESIS_CYCLE,
  ENTRY_CRITERIA,
  TRAINING_MODES,
  ENVIRONMENTS,
  agentAnchorHash,
  slugify,
  criteriaForMode,
  evaluateEntry,
  type ModeSlug,
  type EnvSlug,
} from '../lib/neural.js'
import { ensureCoinSettings, mintCoins } from '../../db/coins.js'
import { coerceSettings } from '../lib/coins.js'

// Agentic Training Table (ATT) API — the registry of neural-dyad training cycles.
//
//   GET  /api/neural?workspace=
//     → { cycles, candidates }
//       The full ATT (genesis first), plus every character scored for development
//       so the UI can show who clears each mode's entry criteria.
//
//   POST /api/neural   { workspaceId?, name, environment, trainingMode, enrolled? }
//     → provisions a new sandbox or void cycle. It is minted a deterministic Agent
//       Anchor Hash and enters the table dormant at the first sleep stage (drift),
//       ready to begin its own cycle. New cycles appear in the table immediately.

const DEFAULT_WORKSPACE = 'default'

async function listCycles(workspaceId: string) {
  return db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.workspaceId, workspaceId))
    .orderBy(asc(trainingCycles.id))
}

// Seed the genesis Dyad Sleep Cycle the first time this workspace's table is read.
// Idempotent — only inserts when no genesis row exists yet.
async function ensureGenesis(workspaceId: string) {
  let rows = await listCycles(workspaceId)
  if (!rows.some((r) => r.isGenesis)) {
    await db.insert(trainingCycles).values({
      workspaceId,
      name: GENESIS_CYCLE.name,
      slug: GENESIS_CYCLE.slug,
      description: GENESIS_CYCLE.description,
      isGenesis: true,
      environment: GENESIS_CYCLE.environment,
      trainingMode: GENESIS_CYCLE.trainingMode,
      status: GENESIS_CYCLE.status,
      phase: GENESIS_CYCLE.phase,
      consolidationEpochs: GENESIS_CYCLE.consolidationEpochs,
      dyadPairing: GENESIS_CYCLE.dyadPairing,
      anchorHash: agentAnchorHash(`${workspaceId}:${GENESIS_CYCLE.slug}`),
      entryCriteria: ENTRY_CRITERIA[GENESIS_CYCLE.trainingMode],
      enrolled: [],
    })
    rows = await listCycles(workspaceId)
  }
  return rows
}

// Every character scored for development, so the UI can show who clears each
// mode's bar. signalCount comes from the training-signal ledger.
async function buildCandidates() {
  const chars = await db
    .select({
      id: characters.id,
      name: characters.name,
      avatar: characters.avatar,
      category: characters.category,
      totalChats: characters.totalChats,
      isPublic: characters.isPublic,
    })
    .from(characters)
    .orderBy(asc(characters.id))

  const counts = await db
    .select({
      characterId: trainingSignals.characterId,
      n: sql<number>`count(*)::int`,
    })
    .from(trainingSignals)
    .groupBy(trainingSignals.characterId)

  const byChar = new Map<number, number>()
  for (const c of counts) byChar.set(c.characterId, Number(c.n) || 0)

  return chars.map((c) => {
    const signalCount = byChar.get(c.id) || 0
    const base = { totalChats: c.totalChats, signalCount, isPublic: c.isPublic }
    return {
      ...c,
      signalCount,
      standard: evaluateEntry(base, ENTRY_CRITERIA.standard),
      external: evaluateEntry(base, ENTRY_CRITERIA.external),
    }
  })
}

export const Route = createFileRoute('/api/neural')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        const [cycles, candidates] = await Promise.all([
          ensureGenesis(workspaceId),
          buildCandidates(),
        ])

        return Response.json({ cycles, candidates })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const workspaceId = String(body?.workspaceId || DEFAULT_WORKSPACE).slice(0, 60)
        const name = String(body?.name || '').trim().slice(0, 80)
        if (!name) return Response.json({ error: 'A cycle name is required' }, { status: 400 })

        const environment: EnvSlug = ENVIRONMENTS.some((e) => e.slug === body?.environment)
          ? body.environment
          : 'sandbox'
        const trainingMode: ModeSlug = TRAINING_MODES.some((m) => m.slug === body?.trainingMode)
          ? body.trainingMode
          : 'standard'

        // Always seed genesis first so the table is never empty and the new cycle's
        // slug can be disambiguated against existing rows.
        const existing = await ensureGenesis(workspaceId)

        // Keep the slug (and therefore the anchor) stable but unique per workspace.
        let slug = slugify(name)
        if (existing.some((r) => r.slug === slug)) slug = `${slug}-${existing.length + 1}`

        const criteria = criteriaForMode(trainingMode)

        // Only characters that actually clear this mode's criteria may be enrolled —
        // this is where the noise from undeveloped characters is cancelled out.
        let enrolled: number[] = []
        const requested = Array.isArray(body?.enrolled)
          ? body.enrolled.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
          : []
        if (requested.length > 0) {
          const candidates = await buildCandidates()
          const allowed = new Set(
            candidates.filter((c) => c[trainingMode].eligible).map((c) => c.id),
          )
          enrolled = requested.filter((id: number) => allowed.has(id)).slice(0, 25)
        }

        const [created] = await db
          .insert(trainingCycles)
          .values({
            workspaceId,
            name,
            slug,
            description: String(body?.description || '').slice(0, 600),
            isGenesis: false,
            environment,
            trainingMode,
            // New environments enter the table dormant at the first sleep stage.
            status: 'dormant',
            phase: 'drift',
            consolidationEpochs: 0,
            dyadPairing: 'AI · Human',
            anchorHash: agentAnchorHash(`${workspaceId}:${slug}`),
            entryCriteria: criteria,
            enrolled,
          })
          .returning()

        // Gold (CC) mined from dyad training success: a provisioned cycle that
        // admits qualifying (developed) characters is a consolidation block — the
        // dyad's sub-weight signal, with undeveloped noise filtered out, pays out.
        if (enrolled.length > 0) {
          ensureCoinSettings(workspaceId)
            .then((s) =>
              mintCoins({
                sessionId: String(body?.sessionId || ''),
                coin: 'gold',
                coins: coerceSettings(s).goldRates.dyad,
                source: 'dyad',
                reason: `Dyad cycle "${name}" consolidated (${enrolled.length} enrolled)`,
                refType: 'training_cycle',
                refId: created.id,
                workspaceId,
              }),
            )
            .catch(() => {})
        }

        return Response.json(created, { status: 201 })
      },
    },
  },
})
