import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from './index.js'
import { chunkBenches, chunkFrames, codeChunks } from './schema.js'
import {
  annotate,
  bisect,
  converge,
  fuse,
  pockets,
  repair,
  seal,
  validate,
  type Assembly,
  type Chunk,
  type ChunkKind,
  type SlotKind,
} from '../src/lib/chunkfusion.js'

// Chunk Fusion — server state.
//
// The division of labour is deliberate: the kernel in src/lib/chunkfusion.ts
// decides everything, this file only remembers. Every verdict a caller receives
// is recomputed from the stored chunks rather than read back from a cached
// column, so a stale `converged` flag can never make a broken bench look whole.
// The columns that do cache a verdict exist for listing, and nothing reads them
// to make a decision.

const LIBRARY_CAP = 400

function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 12)}`
}

/* -------------------------------------------------------------- row ↔ chunk */

type ChunkRow = typeof codeChunks.$inferSelect

function toChunk(row: ChunkRow): Chunk {
  return {
    id: row.publicId,
    kind: row.kind as ChunkKind,
    label: row.label,
    source: row.source,
    bindsIn: row.bindsIn ?? [],
    bindsOut: row.bindsOut ?? [],
    terminal: row.terminal,
    depth: row.depth,
    children: [],
    lines: [row.lineStart, row.lineEnd],
    fingerprint: row.fingerprint,
    shape: row.shape,
  }
}

/* ----------------------------------------------------------------- library */

/**
 * Cut source into bricks and keep them.
 *
 * Nested children are flattened into the library rather than stored as a tree.
 * A brick is only reusable if it can be picked up on its own, and a chunk that
 * exists solely as somebody else's interior is not a brick — but the SAME text
 * cut at depth 1 usually is, so it is stored as a peer with its depth recorded.
 * Duplicates are dropped by fingerprint within a session, which is what makes
 * the pocket counts mean something.
 */
export async function bisectInto(input: {
  sessionId: string
  source: string
  origin?: string
  maxDepth?: number
}): Promise<{ added: number; duplicates: number; chunks: Chunk[] }> {
  const top = bisect(input.source, { maxDepth: input.maxDepth ?? 2 })

  const flat: Chunk[] = []
  const walk = (list: Chunk[]) => {
    for (const c of list) {
      flat.push(c)
      walk(c.children)
    }
  }
  walk(top)

  const existing = await db
    .select({ fingerprint: codeChunks.fingerprint })
    .from(codeChunks)
    .where(eq(codeChunks.sessionId, input.sessionId))
  const seen = new Set(existing.map((r) => r.fingerprint))

  const fresh: Chunk[] = []
  let duplicates = 0
  for (const c of flat) {
    if (seen.has(c.fingerprint)) { duplicates++; continue }
    seen.add(c.fingerprint)
    fresh.push({ ...c, id: newId('ck_') })
  }

  if (fresh.length) {
    await db.insert(codeChunks).values(
      fresh.map((c) => ({
        sessionId: input.sessionId,
        publicId: c.id,
        kind: c.kind,
        label: c.label,
        source: c.source,
        bindsIn: c.bindsIn,
        bindsOut: c.bindsOut,
        terminal: c.terminal,
        depth: c.depth,
        lineStart: c.lines[0],
        lineEnd: c.lines[1],
        fingerprint: c.fingerprint,
        shape: c.shape,
        origin: (input.origin || 'pasted').slice(0, 200),
      })),
    )
  }

  return { added: fresh.length, duplicates, chunks: fresh }
}

export async function library(sessionId: string): Promise<Chunk[]> {
  const rows = await db
    .select()
    .from(codeChunks)
    .where(eq(codeChunks.sessionId, sessionId))
    .orderBy(desc(codeChunks.createdAt))
    .limit(LIBRARY_CAP)
  return rows.map(toChunk)
}

/** The library grouped by shape. This is the folder view the design asks for. */
export async function shelves(sessionId: string) {
  const chunks = await library(sessionId)
  return pockets(chunks).map((p) => ({
    shape: p.shape,
    kind: p.kind,
    label: p.exemplar.label,
    count: p.occupants.length,
    variants: p.variants,
    occupants: p.occupants.map((o) => o.id),
  }))
}

export async function forgetChunk(sessionId: string, publicId: string): Promise<boolean> {
  const gone = await db
    .delete(codeChunks)
    .where(and(eq(codeChunks.sessionId, sessionId), eq(codeChunks.publicId, publicId)))
    .returning({ id: codeChunks.id })
  return gone.length > 0
}

export async function emptyLibrary(sessionId: string): Promise<number> {
  const gone = await db
    .delete(codeChunks)
    .where(eq(codeChunks.sessionId, sessionId))
    .returning({ id: codeChunks.id })
  return gone.length
}

/* ------------------------------------------------------------------ benches */

export type LaneName = 'head' | 'body' | 'tail'

export type BenchState = {
  publicId: string
  title: string
  slot: SlotKind
  seed: string[]
  lanes: Record<LaneName, string[]>
}

/**
 * Everything a caller needs to render a bench, all of it recomputed. A chunk id
 * in a lane that no longer resolves is dropped and reported rather than
 * silently skipped — a bench quietly shrinking is exactly the kind of failure
 * that makes a verdict untrustworthy.
 */
export async function readBench(sessionId: string, publicId: string) {
  const [row] = await db
    .select()
    .from(chunkBenches)
    .where(and(eq(chunkBenches.sessionId, sessionId), eq(chunkBenches.publicId, publicId)))
    .limit(1)
  if (!row) return null

  const lanes: Record<LaneName, string[]> = {
    head: row.head ?? [],
    body: row.body ?? [],
    tail: row.tail ?? [],
  }
  const wanted = [...lanes.head, ...lanes.body, ...lanes.tail]
  const rows = wanted.length
    ? await db.select().from(codeChunks).where(inArray(codeChunks.publicId, wanted))
    : []
  const byId = new Map(rows.map((r) => [r.publicId, toChunk(r)]))

  const resolve = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is Chunk => !!c)
  const missing = wanted.filter((id) => !byId.has(id))

  const state: BenchState = {
    publicId: row.publicId,
    title: row.title,
    slot: row.slot as SlotKind,
    seed: row.seed ?? [],
    lanes,
  }
  return { state, chunks: { head: resolve(lanes.head), body: resolve(lanes.body), tail: resolve(lanes.tail) }, missing }
}

/**
 * The full verdict for a bench. Assembled here so the API, the page and any
 * future agent all read the same numbers from the same computation.
 */
export function verdictFor(input: {
  slot: SlotKind
  seed: string[]
  head: Chunk[]
  body: Chunk[]
  tail: Chunk[]
}) {
  const all: Assembly = {
    slot: input.slot,
    seed: input.seed,
    chunks: [...input.head, ...input.body, ...input.tail],
  }
  const v = validate(all)
  const c = converge(input)
  const r = repair(all)
  return {
    validation: {
      ok: v.ok,
      preserved: v.preserved,
      faults: v.faults,
      scope: v.scope,
      keep: v.keep,
      scrap: v.scrap,
    },
    convergence: c,
    repair: {
      preserved: r.preserved,
      note: r.note,
      plan: r.plan,
      scrap: r.scrap.map((s) => ({ index: s.index, chunkId: s.chunk.id, faults: s.faults })),
    },
    fused: fuse(all),
    annotation: annotate(all),
  }
}

export async function saveBench(input: {
  sessionId: string
  publicId?: string
  title?: string
  slot?: SlotKind
  seed?: string[]
  lanes: Record<LaneName, string[]>
}) {
  const publicId = input.publicId || newId('bn_')
  const wanted = [...input.lanes.head, ...input.lanes.body, ...input.lanes.tail]
  const rows = wanted.length
    ? await db.select().from(codeChunks).where(inArray(codeChunks.publicId, wanted))
    : []
  const byId = new Map(rows.map((r) => [r.publicId, toChunk(r)]))
  const resolve = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is Chunk => !!c)

  const slot = input.slot ?? 'body'
  const seed = input.seed ?? []
  const head = resolve(input.lanes.head)
  const body = resolve(input.lanes.body)
  const tail = resolve(input.lanes.tail)

  const verdict = verdictFor({ slot, seed, head, body, tail })
  const digest = await seal(verdict.fused)

  const values = {
    sessionId: input.sessionId,
    publicId,
    title: (input.title || 'Untitled bench').slice(0, 200),
    slot,
    seed,
    head: input.lanes.head,
    body: input.lanes.body,
    tail: input.lanes.tail,
    converged: verdict.convergence.converged,
    preserved: Math.round(verdict.validation.preserved * 100),
    sealDigest: digest,
    updatedAt: new Date(),
  }

  const [existing] = await db
    .select({ id: chunkBenches.id })
    .from(chunkBenches)
    .where(and(eq(chunkBenches.sessionId, input.sessionId), eq(chunkBenches.publicId, publicId)))
    .limit(1)

  if (existing) {
    await db.update(chunkBenches).set(values).where(eq(chunkBenches.id, existing.id))
  } else {
    await db.insert(chunkBenches).values(values)
  }

  return { publicId, digest, verdict }
}

export async function listBenches(sessionId: string) {
  return db
    .select({
      publicId: chunkBenches.publicId,
      title: chunkBenches.title,
      slot: chunkBenches.slot,
      converged: chunkBenches.converged,
      preserved: chunkBenches.preserved,
      sealDigest: chunkBenches.sealDigest,
      updatedAt: chunkBenches.updatedAt,
    })
    .from(chunkBenches)
    .where(eq(chunkBenches.sessionId, sessionId))
    .orderBy(desc(chunkBenches.updatedAt))
    .limit(30)
}

export async function deleteBench(sessionId: string, publicId: string): Promise<boolean> {
  const gone = await db
    .delete(chunkBenches)
    .where(and(eq(chunkBenches.sessionId, sessionId), eq(chunkBenches.publicId, publicId)))
    .returning({ id: chunkBenches.id })
  if (gone.length) await db.delete(chunkFrames).where(eq(chunkFrames.benchPublicId, publicId))
  return gone.length > 0
}

/* ------------------------------------------------------------------- frames */

/**
 * Append one collapse.
 *
 * The frame number is taken from the count already stored rather than from the
 * client, so two tabs collapsing at once cannot both claim frame 7. This is a
 * read-then-write and is therefore not atomic under real contention; the
 * consequence is a duplicate `n` in the history of a bench being driven from two
 * places at once, which is visible and harmless. It is not a uniqueness claim.
 */
export async function appendFrame(input: {
  benchPublicId: string
  chunkPublicId: string
  lane: LaneName
  position: number
  outcomes: number
  digest: string
}) {
  const prior = await db
    .select({ n: chunkFrames.n })
    .from(chunkFrames)
    .where(eq(chunkFrames.benchPublicId, input.benchPublicId))
    .orderBy(desc(chunkFrames.n))
    .limit(1)
  const n = (prior[0]?.n ?? 0) + 1
  const [row] = await db
    .insert(chunkFrames)
    .values({ ...input, n })
    .returning({ n: chunkFrames.n, digest: chunkFrames.digest })
  return row
}

export async function framesFor(benchPublicId: string) {
  return db
    .select()
    .from(chunkFrames)
    .where(eq(chunkFrames.benchPublicId, benchPublicId))
    .orderBy(asc(chunkFrames.n))
    .limit(200)
}
