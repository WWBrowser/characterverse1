import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from './index.js'
import { artDiscoveries, artPieces } from './schema.js'
import { isTake, normalizeSeed, seedHash, type Recipe } from '../src/lib/art.js'
import { isKnownMode, isLiveStation } from '../src/lib/art-registry.js'
import {
  claimKey,
  isDiscoveryTier,
  isValidDiscoverer,
  normalizeDiscoverer,
  tierOf,
  type Claim,
  type DiscoveryTier,
} from '../src/lib/art-discovery.js'
import { normalizeFolds } from '../src/lib/artv2.js'

// Server-side bookkeeping for the Art Studios — both of them, through one table.
//
// The rule this module is built around: BOOKKEEPING NEVER COSTS A CREATOR THEIR
// ARTWORK. A piece is made in the browser and belongs to the person who made it
// the moment it is painted; recording it is a favour to the collective, not a
// condition of owning it. So every function here swallows its own failures and
// reports them as a `degraded` flag instead of throwing — a studio whose ledger
// is down still paints, still downloads, still hands an avatar to Create.

/** The ledger cap on what the studio shows back. The table itself is unbounded. */
const RECENT_CAP = 12

export type LedgerEntry = {
  id: number
  station: string
  seed: string
  hash: string
  symmetry: number
  mode: string
  take: string
  size: number
  /** The name it was committed under. Empty for an unnamed commit. */
  discoverer: string
  assisted: boolean
  mine: boolean
  createdAt: string | null
}

export type ArtLedger = {
  /** Committed pieces across the whole platform — what the Codex is fed. */
  poured: number
  /** Committed pieces from this browser session. */
  mine: number
  recent: LedgerEntry[]
  /** Claims staked across both studios — the size of the charted map. */
  discovered: number
  /** True when the ledger could not be read. The studio still works. */
  degraded: boolean
}

export const EMPTY_LEDGER: ArtLedger = { poured: 0, mine: 0, recent: [], discovered: 0, degraded: false }

/* ------------------------------------------------------------- the discovery */

export type ClaimOutcome =
  /** This commit was first. The claim is theirs. */
  | 'claimed'
  /** Somebody got here earlier. `claim` says who. */
  | 'held'
  /** No name was given, so nothing was claimed. The piece is unaffected. */
  | 'anonymous'
  /** The register could not be reached. Nothing was decided either way. */
  | 'degraded'

export type ClaimResult = {
  outcome: ClaimOutcome
  /** Which rung this metric sits on, whoever ends up holding it. */
  tier: DiscoveryTier
  /** The standing claim after this attempt — the winner's, not necessarily the caller's. */
  claim: Claim | null
}

/** Shape a register row into the claim the client displays. */
function toClaim(row: typeof artDiscoveries.$inferSelect, session: string): Claim {
  return {
    station: row.station,
    seed: row.seedPhrase,
    seedHash: row.seedHash,
    symmetry: row.symmetry,
    tier: isDiscoveryTier(row.tier) ? row.tier : 'sub-discovery',
    discoverer: row.discoverer,
    assisted: row.assisted,
    mine: !!session && row.sessionId === session,
    at: row.createdAt ? row.createdAt.toISOString() : null,
  }
}

/**
 * Stake a claim on this piece, if it is unclaimed and a name was given.
 *
 * The race is decided by the unique index on `claim_key`, not by a read
 * followed by a write: `onConflictDoNothing().returning()` comes back with the
 * row when the insert landed and with nothing when it did not, so two people
 * committing the same piece at the same instant cannot both be told they were
 * first. The loser is then told who won.
 *
 * A claim is never a condition of making art. No name means `anonymous` and the
 * piece is recorded regardless; an unreachable register means `degraded` and the
 * piece is still recorded. Neither costs the creator their artwork.
 */
async function claimDiscovery(input: {
  sessionId: string
  recipe: Recipe
  discoverer: string
  assisted: boolean
}): Promise<ClaimResult> {
  const r = input.recipe
  const seed = normalizeSeed(r.seed)
  const hash = seedHash(seed)
  const symmetry = normalizeFolds(r.symmetry)
  const tier = tierOf(r.station, symmetry)
  const discoverer = normalizeDiscoverer(input.discoverer)

  if (!isValidDiscoverer(discoverer)) return { outcome: 'anonymous', tier, claim: null }

  const key = claimKey(r.station, hash, symmetry)
  try {
    const landed = await db
      .insert(artDiscoveries)
      .values({
        claimKey: key,
        station: r.station,
        seedPhrase: seed.slice(0, 240),
        seedHash: hash,
        symmetry,
        tier,
        discoverer,
        assisted: input.assisted,
        sessionId: input.sessionId,
      })
      .onConflictDoNothing({ target: artDiscoveries.claimKey })
      .returning()

    if (landed[0]) return { outcome: 'claimed', tier, claim: toClaim(landed[0], input.sessionId) }

    // Lost the race — or already held it. Report the standing claim either way,
    // because "you were second" is only useful with a name attached to it.
    const held = await db.select().from(artDiscoveries).where(eq(artDiscoveries.claimKey, key)).limit(1)
    return {
      outcome: 'held',
      tier,
      claim: held[0] ? toClaim(held[0], input.sessionId) : null,
    }
  } catch {
    return { outcome: 'degraded', tier, claim: null }
  }
}

/**
 * Record a committed piece, and stake its discovery.
 *
 * The two halves are independent on purpose: the ledger row is what feeds the
 * Codex, the claim is what settles who was first, and one failing must not take
 * the other down with it.
 */
export async function commitArtPiece(input: {
  sessionId?: string
  recipe: Recipe
  discoverer?: string
  assisted?: boolean
}): Promise<{ recorded: boolean; claim: ClaimResult }> {
  const r = input.recipe
  const seed = normalizeSeed(r.seed)
  const session = (input.sessionId || '').slice(0, 120)
  const assisted = !!input.assisted
  const tier = tierOf(r.station, normalizeFolds(r.symmetry))
  const nothing: ClaimResult = { outcome: 'degraded', tier, claim: null }

  // A piece with no seed phrase is not a piece — there is nothing to repaint from.
  if (!seed) return { recorded: false, claim: nothing }
  if (!isLiveStation(r.station) || !isKnownMode(r.station, r.mode) || !isTake(r.take)) {
    return { recorded: false, claim: nothing }
  }

  const claim = await claimDiscovery({
    sessionId: session,
    recipe: r,
    discoverer: String(input.discoverer || ''),
    assisted,
  })

  try {
    await db.insert(artPieces).values({
      sessionId: session,
      station: r.station,
      seedPhrase: seed.slice(0, 240),
      seedHash: seedHash(seed),
      // 0 means a V2 piece painted with symmetry switched off — a real value.
      symmetry: normalizeFolds(r.symmetry),
      renderMode: r.mode,
      takenAs: r.take,
      size: Math.max(0, Math.min(8192, Math.round(Number(r.size) || 0))),
      discoverer: normalizeDiscoverer(input.discoverer),
      assisted,
    })
    return { recorded: true, claim }
  } catch {
    return { recorded: false, claim }
  }
}

export type DiscoveryLeader = {
  discoverer: string
  discoveries: number
  subDiscoveries: number
  /** How many of their claims ArtisticClaw had a hand in. */
  assisted: number
  total: number
}

export type DiscoveryRegister = {
  total: number
  /** Every claim standing against one seed, when a seed was asked about. */
  claims: Claim[]
  /** The latest claims anywhere, across both studios. */
  recent: Claim[]
  leaders: DiscoveryLeader[]
  degraded: boolean
}

export const EMPTY_REGISTER: DiscoveryRegister = {
  total: 0,
  claims: [],
  recent: [],
  leaders: [],
  degraded: false,
}

/**
 * Read the register: the board for one seed, the latest claims, and the leaders.
 *
 * `station` and `hash` are optional. With them the caller gets the race board
 * for the piece in front of them; without them, just the platform-wide view.
 */
export async function readDiscoveries(input: {
  sessionId?: string
  station?: string
  hash?: string
  limit?: number
}): Promise<DiscoveryRegister> {
  const session = (input.sessionId || '').slice(0, 120)
  const station = String(input.station || '')
  const hash = String(input.hash || '')
  const cap = Math.max(1, Math.min(RECENT_CAP, Math.round(input.limit || RECENT_CAP)))
  const wantsSeed = !!station && !!hash

  try {
    const [totals, claims, recent, leaders] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(artDiscoveries),
      wantsSeed
        ? db
            .select()
            .from(artDiscoveries)
            .where(and(eq(artDiscoveries.station, station), eq(artDiscoveries.seedHash, hash)))
            .orderBy(artDiscoveries.symmetry)
        : Promise.resolve([]),
      db.select().from(artDiscoveries).orderBy(desc(artDiscoveries.id)).limit(cap),
      db
        .select({
          discoverer: artDiscoveries.discoverer,
          discoveries: sql<number>`count(*) filter (where ${artDiscoveries.tier} = 'discovery')::int`,
          subDiscoveries: sql<number>`count(*) filter (where ${artDiscoveries.tier} <> 'discovery')::int`,
          assisted: sql<number>`count(*) filter (where ${artDiscoveries.assisted})::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(artDiscoveries)
        .where(ne(artDiscoveries.discoverer, ''))
        .groupBy(artDiscoveries.discoverer)
        .orderBy(desc(sql`count(*)`))
        .limit(cap),
    ])

    return {
      total: Number(totals?.[0]?.n) || 0,
      claims: claims.map((row) => toClaim(row, session)),
      recent: recent.map((row) => toClaim(row, session)),
      leaders: leaders.map((row) => ({
        discoverer: row.discoverer,
        discoveries: Number(row.discoveries) || 0,
        subDiscoveries: Number(row.subDiscoveries) || 0,
        assisted: Number(row.assisted) || 0,
        total: Number(row.total) || 0,
      })),
      degraded: false,
    }
  } catch {
    // An unreachable register reads as an empty map, never as an error. Every
    // metric shows unclaimed, which is honest about what is known rather than
    // pretending a claim exists or refusing to draw the board.
    return { ...EMPTY_REGISTER, degraded: true }
  }
}

/** The studio's own counter, plus the recipes it can offer back. */
export async function readArtLedger(sessionId: string): Promise<ArtLedger> {
  const session = (sessionId || '').slice(0, 120)
  try {
    const [totals, mine, recent, claimed] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(artPieces),
      session
        ? db.select({ n: sql<number>`count(*)::int` }).from(artPieces).where(eq(artPieces.sessionId, session))
        : Promise.resolve([{ n: 0 }]),
      db.select().from(artPieces).orderBy(desc(artPieces.id)).limit(RECENT_CAP),
      db.select({ n: sql<number>`count(*)::int` }).from(artDiscoveries),
    ])

    return {
      poured: Number(totals?.[0]?.n) || 0,
      mine: Number(mine?.[0]?.n) || 0,
      recent: recent.map((row) => ({
        id: row.id,
        station: row.station,
        seed: row.seedPhrase,
        hash: row.seedHash,
        symmetry: row.symmetry,
        mode: row.renderMode,
        take: row.takenAs,
        size: row.size,
        discoverer: row.discoverer,
        assisted: row.assisted,
        mine: !!session && row.sessionId === session,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      })),
      discovered: Number(claimed?.[0]?.n) || 0,
      degraded: false,
    }
  } catch {
    // The nursery reads an unreachable stream as empty rather than as broken,
    // and so does the studio. Reported, never fatal.
    return { ...EMPTY_LEDGER, degraded: true }
  }
}
