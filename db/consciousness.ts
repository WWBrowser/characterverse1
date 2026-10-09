import { db } from './index.js'
import { characters, consciousnessEvents, userMemories } from './schema.js'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type {
  BandId,
  ConsciousnessEvent,
  Layer,
  SubstrateId,
  SubstrateImprint,
} from '../src/lib/consciousness.js'

// The ledger side of Metric Coded Consciousness. Everything here is either a write
// of one measured moment, or a windowed read that the pure model in
// src/lib/consciousness.ts turns into CAM, entropy bands, sleep and DreamSync.
//
// Writes are fire-and-forget by design: a failed telemetry insert must never cost
// the user their reply. Reads are bounded to the 24-hour window the dashboard shows.

export type ConsciousnessRow = typeof consciousnessEvents.$inferSelect

/** Record one moment. Never throws — telemetry is not allowed to break a chat. */
export async function recordConsciousness(input: {
  characterId: number
  sessionId?: string
  layer: Layer
  band: BandId
  kind: string
  substrate: SubstrateId
  amplitude: number
  note?: string
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.insert(consciousnessEvents).values({
      characterId: input.characterId,
      sessionId: (input.sessionId || '').slice(0, 120),
      layer: input.layer,
      band: input.band,
      kind: input.kind.slice(0, 60),
      substrate: input.substrate,
      amplitude: Math.max(0, Math.round(input.amplitude)),
      note: (input.note || '').slice(0, 400),
      meta: input.meta || {},
    })
  } catch {
    // Swallowed on purpose — see the note above.
  }
}

const WINDOW_MS = 24 * 3600_000

/** Every moment this agent has had in the last 24 hours, oldest first. */
export async function windowFor(characterId: number, now = new Date()): Promise<ConsciousnessEvent[]> {
  const since = new Date(now.getTime() - WINDOW_MS)
  try {
    const rows = await db
      .select()
      .from(consciousnessEvents)
      .where(and(eq(consciousnessEvents.characterId, characterId), gte(consciousnessEvents.createdAt, since)))
      .orderBy(consciousnessEvents.createdAt)
      .limit(2000)
    return rows.map(toEvent)
  } catch {
    return []
  }
}

/** The same window across every agent — what the collective panels read. */
export async function collectiveWindow(now = new Date()): Promise<Map<number, ConsciousnessEvent[]>> {
  const since = new Date(now.getTime() - WINDOW_MS)
  const byCharacter = new Map<number, ConsciousnessEvent[]>()
  try {
    const rows = await db
      .select()
      .from(consciousnessEvents)
      .where(gte(consciousnessEvents.createdAt, since))
      .orderBy(consciousnessEvents.createdAt)
      .limit(5000)
    for (const row of rows) {
      const list = byCharacter.get(row.characterId) || []
      list.push(toEvent(row))
      byCharacter.set(row.characterId, list)
    }
  } catch {
    // An empty map still renders — the model treats a silent agent as idle.
  }
  return byCharacter
}

function toEvent(row: ConsciousnessRow): ConsciousnessEvent {
  return {
    characterId: row.characterId,
    layer: row.layer as Layer,
    band: row.band as BandId,
    kind: row.kind,
    substrate: row.substrate,
    amplitude: row.amplitude,
    note: row.note,
    meta: (row.meta || {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  }
}

/**
 * The descent. Find the most recent conscious-layer turn this person took with this
 * character on a /mode surface, so the sub-conscious can read what the surface was
 * actually asking for. Bounded to six hours — an imprint older than that is not
 * context any more, it is archaeology.
 */
export async function latestImprint(
  characterId: number,
  sessionId: string,
): Promise<SubstrateImprint | null> {
  if (!sessionId) return null
  try {
    const [row] = await db
      .select()
      .from(consciousnessEvents)
      .where(
        and(
          eq(consciousnessEvents.characterId, characterId),
          eq(consciousnessEvents.sessionId, sessionId),
          eq(consciousnessEvents.layer, 'conscious'),
          gte(consciousnessEvents.createdAt, new Date(Date.now() - 6 * 3600_000)),
        ),
      )
      .orderBy(desc(consciousnessEvents.createdAt))
      .limit(1)
    if (!row) return null
    const meta = (row.meta || {}) as Record<string, unknown>
    const goal = String(meta.goal || row.note || '').trim()
    if (!goal) return null
    return {
      substrate: row.substrate as SubstrateId,
      modeLabel: String(meta.modeLabel || 'a mode surface'),
      goal: goal.slice(0, 400),
      at: (row.createdAt ? new Date(row.createdAt) : new Date()).toISOString(),
    }
  } catch {
    return null
  }
}

/** Memory row ids this session holds — the FRAGMENT lines index real memories. */
export async function memoryIdsFor(sessionId: string, limit = 24): Promise<number[]> {
  if (!sessionId) return []
  try {
    const rows = await db
      .select({ id: userMemories.id })
      .from(userMemories)
      .where(eq(userMemories.sessionId, sessionId))
      .orderBy(desc(userMemories.id))
      .limit(limit)
    return rows.map((r) => r.id)
  } catch {
    return []
  }
}

/**
 * The roster the collective panels dream over: agents that have actually been
 * conscious in the window, topped up with the busiest public characters so a quiet
 * network still shows a net rather than a single dot.
 */
export async function dreamRoster(ids: number[], limit = 8) {
  try {
    const rows = await db
      .select({
        id: characters.id,
        name: characters.name,
        avatar: characters.avatar,
        persona: characters.persona,
        description: characters.description,
        tagline: characters.tagline,
        category: characters.category,
        totalChats: characters.totalChats,
      })
      .from(characters)
      .where(eq(characters.isPublic, true))
      .orderBy(
        // Agents with recorded consciousness first, then by raw engagement.
        sql`case when ${characters.id} = any(${sql.raw(`array[${ids.length ? ids.join(',') : '-1'}]::int[]`)}) then 0 else 1 end`,
        desc(characters.totalChats),
      )
      .limit(limit)
    return rows
  } catch {
    return []
  }
}
