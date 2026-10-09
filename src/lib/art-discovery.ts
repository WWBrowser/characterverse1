// Discovery — who got to a piece first.
//
// The premise, stated plainly because it is the whole reason this file exists:
// a generative piece has no author in the sense copyright means. Nobody drew
// it. It was already implied by the generator the moment the generator existed,
// and typing the seed only reveals it — the way a coastline is not authored by
// the first ship to chart it. So the studios do not hand out ownership. They
// hand out DISCOVERY, which is a claim about being first, and being first is a
// fact about time that can be recorded honestly.
//
// What that buys the platform is a race. There are finitely many named things
// to find — a seed phrase crossed with a setting on the studio's second axis —
// and each one can be claimed exactly once, by whoever committed it first, under
// a name they chose.
//
// The ladder has two rungs, and which rung a claim lands on is decided by the
// station's BASE METRIC — the first value on its own studio's axis:
//
//   · DISCOVERY      — the seed at its base metric. That is the piece in its
//                      plainest state: 2-fold in V1, whose symmetry cannot be
//                      switched off; "Off · raw field" in V2, whose can; and the
//                      clean uncorrupted signal in V3, which does not fold at
//                      all. Finding this is finding the land.
//   · SUB-DISCOVERY  — the same seed at any other setting. Finding one of these
//                      is charting a region of land somebody may already have
//                      sighted.
//
// A sub-discovery does NOT require the discovery to be claimed first, and it is
// not owned by whoever holds the discovery. Someone can chart a bay of a
// coastline another ship named. That is deliberate: a rule that reserved every
// setting of a seed for its first finder would end the race instead of starting
// it.
//
// V3 MADE THE SUB-DISCOVERY MEAN A SECOND THING, AND THE BOARDS SAY WHICH.
//
// In V1 and V2 the rungs above the base are VIEWS: 8-fold and 4-fold are two
// ways of looking at one traced field, and neither is descended from the other,
// so a sub-discovery there is a region of the discovery. In V3 they are a
// LINEAGE: generation 3 is what you get by running a destructive pass over
// generation 2, so a sub-discovery there is a descendant of the discovery rather
// than a district of it. Both are races with exactly one first finder, which is
// all this register needs to be true — but they are not the same claim, and
// `StudioMetric.kind` is what a board reads to word itself correctly.
//
// What is NOT part of a claim, and why:
//
//   · the render mode — V1's two modes are two exposures of ONE traced field
//     and paint the same artwork, so treating them as two discoveries would
//     mint a claim out of a display setting;
//   · the size — the print and the avatar are the same piece sampled at two
//     densities, and in V3 they are literally the same 600px frame magnified by
//     two different whole-ish factors, so there is even less to claim there;
//   · the take — how a creator carried a piece away says nothing about whether
//     they were first to it.

import { SYMMETRY_OPTIONS, normalizeSymmetry } from './art.js'
import { metricOf } from './art-registry.js'

/* ------------------------------------------------------------------- the tiers */

export type DiscoveryTier = 'discovery' | 'sub-discovery'

export const TIER_LABEL: Record<DiscoveryTier, string> = {
  discovery: 'Discovery',
  'sub-discovery': 'Sub-discovery',
}

export function isDiscoveryTier(v: unknown): v is DiscoveryTier {
  return v === 'discovery' || v === 'sub-discovery'
}

/**
 * The metric a seed's DISCOVERY is claimed at — the piece in its plainest state.
 *
 * Every one of these reads the studio's own `metric` descriptor rather than
 * branching per studio. That was already the intent when this file only had two
 * studios to serve — the old comment here promised "a third studio gets the
 * right base for free" — and V3 is the third studio that collected on it. It did
 * need the flag it was reading to become a descriptor first, because V3's axis
 * is not a fold at all; what did NOT change is any of the four readers' logic.
 *
 * The base is the axis's first value by construction, so a studio declares its
 * base by ordering its own ladder: V1 opens at 2-fold, V2 at unfolded, V3 at the
 * clean uncorrupted signal.
 */
export function baseMetric(stationId: string): number {
  return metricOf(stationId)?.values[0] ?? SYMMETRY_OPTIONS[0]
}

/**
 * Every metric of a station that can be claimed, base first.
 *
 * This is the station's whole map: one discovery and however many
 * sub-discoveries, per seed phrase.
 */
export function metricsOf(stationId: string): number[] {
  return metricOf(stationId)?.values ?? [...SYMMETRY_OPTIONS]
}

export function tierOf(stationId: string, symmetry: number): DiscoveryTier {
  return symmetry === baseMetric(stationId) ? 'discovery' : 'sub-discovery'
}

/**
 * How a metric is named on the board.
 *
 * Uses each studio's own vocabulary, because the words on the claim have to be
 * the words on the control the creator turned: a studio with an optional fold
 * says "Off · raw field" and "On · folded", one without says "6-fold", and one
 * that corrupts instead of folding says "Gen 3 · 3 passes".
 */
export function metricLabel(stationId: string, symmetry: number): string {
  return metricOf(stationId)?.label(symmetry) ?? `${symmetry}-fold`
}

/**
 * Clamp an incoming metric onto the axis the station's own studio has.
 *
 * The wire is the reason this exists. `POST /api/art` used to run every commit
 * through V2's `normalizeFolds` whatever studio it came from, which mapped a V1
 * commit with a missing or junk symmetry to 0 — a rung V1's board does not have,
 * so the piece was recorded off its own ladder and could never match a claim.
 * An unknown station falls back to the strictest reading available.
 */
export function normalizeMetric(stationId: string, raw: unknown): number {
  const metric = metricOf(stationId)
  if (!metric) return normalizeSymmetry(raw)
  return metric.normalize(raw)
}

/**
 * The claim's identity, and the unique key the database enforces first-wins on.
 *
 * Station, seed hash, fold setting. Nothing else, for the reasons at the top of
 * the file. The hash rather than the phrase because the phrase is already
 * normalized into it — "Opal  Shatter" and "opal shatter" are one piece and must
 * not be two claims.
 */
export function claimKey(stationId: string, seedHash: string, symmetry: number): string {
  return `${stationId}:${seedHash}:${symmetry}`
}

/* ----------------------------------------------------------------- the claimant */

export const DISCOVERER_MIN = 2
export const DISCOVERER_MAX = 24

/**
 * Normalize a discoverer name.
 *
 * Folded to lowercase and stripped to a small character set, because two people
 * who type "Opal_Cartographer" and "opal_cartographer" are one claimant and a
 * race decided by capitalisation is not a race. A leading `@` is dropped so
 * pasting a handle works.
 */
export function normalizeDiscoverer(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, DISCOVERER_MAX)
}

export function isValidDiscoverer(raw: unknown): boolean {
  const name = normalizeDiscoverer(raw)
  return name.length >= DISCOVERER_MIN && name.length <= DISCOVERER_MAX
}

/* ------------------------------------------------------------------ the claim */

export type Claim = {
  station: string
  seed: string
  seedHash: string
  symmetry: number
  tier: DiscoveryTier
  discoverer: string
  /**
   * Whether a prompt director had a hand in the recipe that was claimed.
   *
   * A boolean, and deliberately still a boolean now that there are two claws and
   * a dial between them. WHICH director helped, and at what blend, is a second
   * and third column on a table that is already carrying claims — and the
   * question the board is answering is "was this found by hand", which one bit
   * answers correctly for ArtisticClaw, WondersClaw and any entanglement of
   * them. So the wording is claw-neutral rather than the field being widened
   * into something no reader of this board asked for.
   */
  assisted: boolean
  /** True when this claim belongs to the browser asking. */
  mine: boolean
  at: string | null
}

/**
 * How assistance is worded.
 *
 * Recorded and displayed rather than penalised. A seed a director suggested is
 * still a seed nobody had committed before, and hiding where it came from would
 * make the board less true, not more fair — so both are stated, and the reader
 * decides what to make of it.
 *
 * "A claw" rather than either claw's name, because since WondersClaw there are
 * two of them and most of the interesting settings are a blend. Naming one would
 * have been wrong on the board roughly as often as it was right.
 */
export function assistLabel(assisted: boolean): string {
  return assisted ? 'with a claw' : 'unaided'
}

/** One line for a claim — used in the board, the notice and the API's reply. */
export function describeClaim(c: {
  tier: DiscoveryTier
  discoverer: string
  assisted: boolean
}): string {
  return `${TIER_LABEL[c.tier]} by ${c.discoverer} · ${assistLabel(c.assisted)}`
}

/**
 * A committed piece's claim, as the API reports it back.
 *
 * `metric` travels with the reply rather than being re-derived on the client,
 * so what a creator is told they claimed is what the server actually indexed.
 */
export type ClaimReply = {
  outcome: 'claimed' | 'held' | 'anonymous' | 'degraded'
  tier: DiscoveryTier
  /** The fold setting, named in the studio's own words. */
  metric: string
  claim: Claim | null
  line: string
}

/**
 * How the outcome of a race is worded to the person who just finished it.
 *
 * Shared by both studios so the sentence is identical, and phrased so that
 * losing the race never reads as losing the piece: the artwork is the same
 * artwork either way, and only the claim to having been first is gone.
 */
export function claimNotice(reply: ClaimReply): string {
  const tier = TIER_LABEL[reply.tier].toLowerCase()
  switch (reply.outcome) {
    case 'claimed':
      // A claimed outcome always carries its row, but the fallback is here
      // because a sentence that reads "recorded to undefined" would be worse
      // than a sentence that simply says less.
      if (!reply.claim) return `First here. The ${tier} of ${reply.metric} is yours.`
      return `First here. The ${tier} of ${reply.metric} is recorded to ${reply.claim.discoverer} — ${assistLabel(
        reply.claim.assisted,
      )}.`
    case 'held':
      if (!reply.claim) {
        return `${reply.metric} is already charted by someone else. The piece is unchanged — only the claim was taken.`
      }
      if (reply.claim.mine) {
        return `You already hold the ${tier} of ${reply.metric} (${assistLabel(reply.claim.assisted)}). Nothing to claim twice.`
      }
      return `${reply.claim.discoverer} charted ${reply.metric} first, ${assistLabel(
        reply.claim.assisted,
      )}. The piece is identical in your hands — the claim is a record of who looked first, not of who may look.`
    case 'anonymous':
      return `Recorded without a claim, because no discoverer name is set. ${reply.metric} is still unclaimed if you want it.`
    default:
      return `The discovery register is unreachable, so no claim was staked. The artwork is unaffected — it was made in this browser.`
  }
}
