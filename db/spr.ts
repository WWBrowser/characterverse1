import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from './index.js'
import { sprSessions, sprSuperpositions } from './schema.js'
import {
  ANGLE_SLOTS,
  collapse,
  ingest,
  isBasisId,
  isTier,
  type Angle,
  type Ambiguity,
  type BasisId,
  type Measurement,
  type Substrate,
  type Superposition,
  type Tier,
} from '../src/lib/spr.js'

// SPR — server state.
//
// Same division as the rest of this codebase: the kernel in src/lib/spr.ts
// decides, this file remembers. Nothing here recomputes a collapse or invents an
// amplitude; it stores what the kernel produced and reads it back.
//
// Every read here is wrapped by the route rather than by this file, so a caller
// always learns whether it got real data or a degraded empty. Silently returning
// [] when the database is unreachable is how an unstored record starts looking
// like an empty one, and this mode's whole claim is that the alternatives are
// still there.

const HISTORY_CAP = 40

export function newPublicId(): string {
  const bytes = new Uint8Array(9)
  globalThis.crypto.getRandomValues(bytes)
  return 'sp_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type SprSessionState = {
  basis: BasisId
  tier: Tier
  gravity: number
  substrate: Substrate
}

export const DEFAULT_SESSION: SprSessionState = {
  basis: 'register',
  tier: 'prism',
  gravity: 0,
  substrate: {},
}

function toSessionState(row: typeof sprSessions.$inferSelect): SprSessionState {
  return {
    basis: isBasisId(row.basis) ? row.basis : 'register',
    tier: isTier(row.tier) ? row.tier : 'prism',
    gravity: Math.min(100, Math.max(0, row.gravity)) / 100,
    substrate: row.substrate ?? {},
  }
}

function toSuperposition(row: typeof sprSuperpositions.$inferSelect): Superposition {
  const measurements = (row.measurements ?? []).map((m) => ({
    key: String(m.key),
    at: Number(m.at) || 0,
    kind: m.kind === 'remeasure' ? 'remeasure' : 'collapse',
  })) as Measurement[]
  return {
    id: row.publicId,
    prompt: row.prompt,
    basis: isBasisId(row.basis) ? row.basis : 'register',
    angles: ((row.angles ?? []) as Angle[]).slice(0, ANGLE_SLOTS),
    ambiguity: (row.ambiguity ?? null) as Ambiguity | null,
    state: row.state === 'collapsed' ? 'collapsed' : 'superposed',
    collapsedKey: row.collapsedKey || null,
    measurements,
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
  }
}

/* ----------------------------------------------------------------- session */

export async function readSession(sessionId: string): Promise<SprSessionState> {
  const [row] = await db.select().from(sprSessions).where(eq(sprSessions.sessionId, sessionId))
  return row ? toSessionState(row) : { ...DEFAULT_SESSION }
}

/** Upsert the palace camera and axis. Substrate is deliberately NOT settable from
 *  here — it only ever moves through `recordCollapse`, so the feedback loop cannot
 *  be written to directly by a client that just wants a bigger number. */
export async function saveSessionControls(input: {
  sessionId: string
  basis?: BasisId
  tier?: Tier
  gravity?: number
}): Promise<SprSessionState> {
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (input.basis) patch.basis = input.basis
  if (input.tier) patch.tier = input.tier
  if (typeof input.gravity === 'number') {
    patch.gravity = Math.round(Math.min(1, Math.max(0, input.gravity)) * 100)
  }

  await db
    .insert(sprSessions)
    .values({
      sessionId: input.sessionId,
      basis: input.basis ?? DEFAULT_SESSION.basis,
      tier: input.tier ?? DEFAULT_SESSION.tier,
      gravity: typeof input.gravity === 'number' ? Math.round(Math.min(1, Math.max(0, input.gravity)) * 100) : 0,
      substrate: {},
    })
    .onConflictDoUpdate({ target: sprSessions.sessionId, set: patch })

  return readSession(input.sessionId)
}

/* ---------------------------------------------------------- superpositions */

export async function saveSuperposition(sessionId: string, sp: Superposition): Promise<void> {
  await db.insert(sprSuperpositions).values({
    sessionId,
    publicId: sp.id,
    prompt: sp.prompt,
    basis: sp.basis,
    angles: sp.angles,
    ambiguity: sp.ambiguity,
    state: sp.state,
    collapsedKey: sp.collapsedKey ?? '',
    measurements: sp.measurements,
  })

  // Keep the history bounded per session. Oldest first out; the palace is built
  // from the substrate, not from the transcript, so trimming loses no mass.
  const rows = await db
    .select({ id: sprSuperpositions.id })
    .from(sprSuperpositions)
    .where(eq(sprSuperpositions.sessionId, sessionId))
    .orderBy(desc(sprSuperpositions.id))
    .limit(HISTORY_CAP + 20)
  const excess = rows.slice(HISTORY_CAP)
  if (excess.length) {
    await db.delete(sprSuperpositions).where(
      sql`${sprSuperpositions.id} in (${sql.join(excess.map((r) => sql`${r.id}`), sql`, `)})`,
    )
  }
}

export async function listSuperpositions(sessionId: string): Promise<Superposition[]> {
  const rows = await db
    .select()
    .from(sprSuperpositions)
    .where(eq(sprSuperpositions.sessionId, sessionId))
    .orderBy(desc(sprSuperpositions.id))
    .limit(HISTORY_CAP)
  return rows.map(toSuperposition)
}

/**
 * The measurement, and the loop it closes.
 *
 * The collapse is computed by the kernel from the stored row — not taken from the
 * client — so a request cannot assert a state the kernel would not produce. The
 * substrate then gains mass on the chosen lane in the same round trip, because
 * ingestion that can fail separately from the collapse is ingestion that drifts.
 */
export async function recordCollapse(input: {
  sessionId: string
  publicId: string
  angleKey: string
  at: number
}): Promise<{ superposition: Superposition; substrate: Substrate } | null> {
  const [row] = await db
    .select()
    .from(sprSuperpositions)
    .where(and(eq(sprSuperpositions.publicId, input.publicId), eq(sprSuperpositions.sessionId, input.sessionId)))
  if (!row) return null

  const before = toSuperposition(row)
  const after = collapse(before, input.angleKey, input.at)
  // An unknown key leaves the superposition untouched; nothing is written and the
  // substrate does not move for a choice that was never available.
  if (after === before) return null

  await db
    .update(sprSuperpositions)
    .set({ state: after.state, collapsedKey: after.collapsedKey ?? '', measurements: after.measurements })
    .where(eq(sprSuperpositions.id, row.id))

  const current = await readSession(input.sessionId)
  const substrate = ingest(current.substrate, input.angleKey)

  await db
    .insert(sprSessions)
    .values({ sessionId: input.sessionId, basis: current.basis, tier: current.tier, gravity: Math.round(current.gravity * 100), substrate })
    .onConflictDoUpdate({ target: sprSessions.sessionId, set: { substrate, updatedAt: new Date() } })

  return { superposition: after, substrate }
}

/** A person throwing away their own palace. Visible, deliberate, and total —
 *  unlike an agent quietly editing one branch, which this schema has no path for. */
export async function clearSession(sessionId: string): Promise<void> {
  await db.delete(sprSuperpositions).where(eq(sprSuperpositions.sessionId, sessionId))
  await db.delete(sprSessions).where(eq(sprSessions.sessionId, sessionId))
}
