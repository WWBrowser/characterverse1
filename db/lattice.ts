import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from './index.js'
import { latticeAnchors, latticeChains, latticeStrata } from './schema.js'
import {
  anchorAt,
  audit,
  birth,
  pending,
  profile,
  proveCognition,
  seal,
  type Chain,
  type Claim,
  type Moment,
  type Stratum,
} from '../src/lib/lattice.js'

// The Dual+ Lattice — server state.
//
// Same division as everywhere else in this codebase: the kernel decides, this
// file remembers. The stored `height` on a chain header is a listing convenience
// and nothing reads it to make a judgment; every audit re-derives the whole
// record from the strata rows, including digests that are already sitting in the
// column next door.
//
// Strata are INSERT-only. There is no update path here and there is no
// single-stratum delete, because the ability to quietly revise one step is the
// precise capability this table exists to remove. Deleting a whole chain is
// allowed — that is a person throwing away a record, which is visible, rather
// than an agent editing one, which is not.

const CHAIN_CAP = 40
const STRATA_CAP = 500

function newId(prefix: string): string {
  const bytes = new Uint8Array(9)
  globalThis.crypto.getRandomValues(bytes)
  return prefix + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toStratum(row: typeof latticeStrata.$inferSelect): Stratum {
  return {
    h: row.h,
    parent: row.parent,
    moments: row.moments ?? [],
    weights: row.weights ?? {},
    capabilities: row.capabilities ?? [],
    claims: row.claims ?? [],
    budget: row.budget,
    mathDigest: row.mathDigest,
    reasonDigest: row.reasonDigest,
    digest: row.digest,
    tick: row.tick,
  }
}

/* ------------------------------------------------------------------- chains */

export async function createChain(input: {
  sessionId: string
  name: string
  weights: Record<string, number>
  capabilities: string[]
  axioms: Claim[]
  tick: number
}) {
  const b = await birth({
    weights: input.weights,
    capabilities: input.capabilities,
    axioms: input.axioms,
    tick: input.tick,
  })
  const publicId = newId('lx_')

  await db.insert(latticeChains).values({
    sessionId: input.sessionId,
    publicId,
    name: input.name.slice(0, 120) || 'Untitled agent',
    birthDigest: b.digest,
    height: 0,
  })
  await db.insert(latticeStrata).values({
    chainPublicId: publicId,
    h: 0,
    parent: '',
    moments: [],
    weights: b.weights,
    capabilities: b.capabilities,
    claims: b.claims,
    budget: 0,
    mathDigest: b.mathDigest,
    reasonDigest: b.reasonDigest,
    digest: b.digest,
    tick: b.tick,
  })

  return { publicId, birthDigest: b.digest, height: 0 }
}

export async function listChains(sessionId: string) {
  return db
    .select({
      publicId: latticeChains.publicId,
      name: latticeChains.name,
      birthDigest: latticeChains.birthDigest,
      height: latticeChains.height,
      updatedAt: latticeChains.updatedAt,
    })
    .from(latticeChains)
    .where(eq(latticeChains.sessionId, sessionId))
    .orderBy(desc(latticeChains.updatedAt))
    .limit(CHAIN_CAP)
}

/** Load the full record. Ordered by height, which is the only order it has. */
export async function readChain(sessionId: string, publicId: string): Promise<{ name: string; chain: Chain } | null> {
  const [header] = await db
    .select()
    .from(latticeChains)
    .where(and(eq(latticeChains.sessionId, sessionId), eq(latticeChains.publicId, publicId)))
    .limit(1)
  if (!header) return null

  const [rows, anchors] = await Promise.all([
    db
      .select()
      .from(latticeStrata)
      .where(eq(latticeStrata.chainPublicId, publicId))
      .orderBy(asc(latticeStrata.h))
      .limit(STRATA_CAP),
    db
      .select({ h: latticeAnchors.h, digest: latticeAnchors.digest, note: latticeAnchors.note })
      .from(latticeAnchors)
      .where(eq(latticeAnchors.chainPublicId, publicId))
      .orderBy(asc(latticeAnchors.h)),
  ])

  return { name: header.name, chain: { strata: rows.map(toStratum), anchors } }
}

export async function deleteChain(sessionId: string, publicId: string): Promise<boolean> {
  const gone = await db
    .delete(latticeChains)
    .where(and(eq(latticeChains.sessionId, sessionId), eq(latticeChains.publicId, publicId)))
    .returning({ id: latticeChains.id })
  if (!gone.length) return false
  await db.delete(latticeStrata).where(eq(latticeStrata.chainPublicId, publicId))
  await db.delete(latticeAnchors).where(eq(latticeAnchors.chainPublicId, publicId))
  return true
}

/* ------------------------------------------------------------------ sealing */

/**
 * Collapse the pending moments into the next stratum and write it down.
 *
 * The kernel's refusal is returned verbatim. A refusal is not an error — it is
 * the system working, and it carries the reason the step was not allowed to
 * happen, which is the part worth showing somebody.
 */
export async function sealNext(input: {
  sessionId: string
  publicId: string
  moments: Moment[]
  claims: Claim[]
  capabilities: string[]
  budget: number
  tick: number
}): Promise<
  | { ok: false; reason: string; code: string }
  | { ok: true; h: number; digest: string; band: string; drift: number; overrun: number }
> {
  const loaded = await readChain(input.sessionId, input.publicId)
  if (!loaded) return { ok: false, code: 'missing', reason: 'No such chain.' }

  const result = await seal(loaded.chain, {
    moments: input.moments,
    claims: input.claims,
    capabilities: input.capabilities,
    budget: input.budget,
    tick: input.tick,
  })
  if (!result.ok) return { ok: false, code: result.code, reason: result.reason }

  const s = result.stratum
  await db.insert(latticeStrata).values({
    chainPublicId: input.publicId,
    h: s.h,
    parent: s.parent,
    moments: s.moments,
    weights: s.weights,
    capabilities: s.capabilities,
    claims: s.claims,
    budget: s.budget,
    mathDigest: s.mathDigest,
    reasonDigest: s.reasonDigest,
    digest: s.digest,
    tick: s.tick,
  })
  await db
    .update(latticeChains)
    .set({ height: s.h, updatedAt: new Date() })
    .where(eq(latticeChains.publicId, input.publicId))

  return { ok: true, h: s.h, digest: s.digest, band: result.profile.band, drift: result.profile.drift, overrun: result.overrun }
}

/* ------------------------------------------------------------------ anchors */

export async function publishAnchor(input: {
  sessionId: string
  publicId: string
  h: number
  note: string
}): Promise<{ ok: false; reason: string } | { ok: true; h: number; digest: string }> {
  const loaded = await readChain(input.sessionId, input.publicId)
  if (!loaded) return { ok: false, reason: 'No such chain.' }
  const a = anchorAt(loaded.chain, input.h, input.note)
  if (!a) return { ok: false, reason: `There is no stratum at height ${input.h}.` }

  // Re-anchoring the same height is a no-op rather than a second row, so an
  // anchor list cannot be padded to look better audited than it is.
  const existing = loaded.chain.anchors.find((x) => x.h === input.h)
  if (existing) {
    return existing.digest === a.digest
      ? { ok: true, h: a.h, digest: a.digest }
      : { ok: false, reason: `Height ${input.h} is already anchored to a different digest. That is the alarm, not a conflict to resolve.` }
  }

  await db.insert(latticeAnchors).values({
    chainPublicId: input.publicId,
    h: a.h,
    digest: a.digest,
    note: a.note,
  })
  return { ok: true, h: a.h, digest: a.digest }
}

/* -------------------------------------------------------------- the verdict */

/** Everything a caller needs about one chain, all of it re-derived. */
export async function inspect(sessionId: string, publicId: string) {
  const loaded = await readChain(sessionId, publicId)
  if (!loaded) return null
  const report = await audit(loaded.chain)
  return {
    name: loaded.name,
    publicId,
    audit: report,
    strata: loaded.chain.strata.map((s) => ({
      h: s.h,
      digest: s.digest,
      parent: s.parent,
      tick: s.tick,
      budget: s.budget,
      capabilities: s.capabilities,
      claims: s.claims,
      moments: s.moments.length,
      weights: s.weights,
      profile: profile(s.moments),
    })),
    anchors: loaded.chain.anchors,
  }
}

export async function prove(sessionId: string, publicId: string, claimId: string) {
  const loaded = await readChain(sessionId, publicId)
  if (!loaded) return null
  return proveCognition(loaded.chain, claimId)
}

/** The unsealed edge, evaluated against the stored record but written nowhere. */
export async function edge(input: {
  sessionId: string
  publicId: string
  moments: Moment[]
  budget: number
}) {
  const loaded = await readChain(input.sessionId, input.publicId)
  if (!loaded) return null
  return pending(loaded.chain, input.moments, input.budget)
}
