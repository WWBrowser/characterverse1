// The claws — the Art Studios' prompt directors, and the machinery that
// entangles them.
//
// There are two, and they are not the same director with a different adjective
// on the button:
//
//   ARTISTICCLAW is CONVERGENT. One brief, five angles ON that brief. Its
//   vocabulary is materials and light — opal, nacre, refract, undertow — and its
//   job is that every one of the five is a defensible reading of what you asked
//   for. Nothing it hands back should surprise you; it should be better than what
//   you would have typed.
//
//   WONDERSCLAW is DIVERGENT. It treats the brief as a place to leave from. Its
//   vocabulary is incidents and collisions — kiln, ricochet, blackout, ballast —
//   and it aims at the far end of the studio's dial rather than the middle. Its
//   five are LONG SHOTS, and it says what it is risking on each one instead of
//   what each one will feel like, because most one-hit wonders miss. The one that
//   lands is the point.
//
// Those are different failure modes on purpose. ArtisticClaw's bad day is five
// tasteful variations on the same picture. WondersClaw's bad day is five pieces
// of mud. A creator who only ever had one of them would only ever have one of
// those problems, which is the argument for having both — and then for being
// able to sit anywhere between them.
//
// ENTANGLEMENT, AND WHY IT IS A DEAL RATHER THAN A CROSSFADE.
//
// The blend is 0–100. Zero is pure ArtisticClaw, one hundred is pure WondersClaw,
// and both endpoints are EXACT — at 0 not one long shot slips into the spread,
// and at 100 not one tasteful variation does. In between, the blend does two
// things, and the second is the one that makes it feel like a dial rather than a
// checkbox:
//
//   1. It sets the QUOTA. `round(blend × 5 / 100)` of the five slots belong to
//      WondersClaw, so the count only ever climbs as you push the dial right.
//
//   2. It RE-DEALS EVERY SLOT. Which slots those are is ranked by a hash that
//      includes the blend itself, so moving from 40 to 60 does not keep your
//      first two long shots and add a third — it deals all five again. A slot
//      that was ArtisticClaw's at 40 can be ArtisticClaw's at 60 and be a
//      different suggestion, because the claw writing it was asked at a
//      different blend.
//
// Point 2 is a deliberate trade and worth naming as one. The stable alternative —
// keep what you have, append the new one — makes the dial an accumulator: you
// could only ever discover more, never differently, and a creator hunting for one
// good phrase would ratchet to 100 and stop. Re-dealing means every position on
// the dial is its own spread of five. The cost is that you cannot nudge the dial
// to keep a phrase you liked; the answer to that is the Paint button next to it,
// which puts the phrase in the box where the dial cannot reach it.
//
// The dial suggestion is entangled too, and there it IS arithmetic rather than a
// deal: each claw picks an index into the studio's own axis, and the returned
// index is those two interpolated by the blend. See `entangleIndex`.

import { normalizeSeed } from './art.js'

/* ------------------------------------------------------------------ the claws */

export type ClawId = 'artistic' | 'wonders'

/**
 * What a piece's recipe records about who helped write it.
 *
 * `'entangled'` is not a third claw — it is the pair of them at a blend strictly
 * between the endpoints. It is a separate value rather than a flag because a
 * claim has to be able to say which, and "ArtisticClaw with some WondersClaw in
 * it" is a different provenance from either alone.
 */
export type AssistClaw = ClawId | 'entangled'

export type ClawCard = {
  id: ClawId
  name: string
  /** Three or four words for the button and the badge. */
  tagline: string
  /** One line on what this director is FOR, shown above the brief box. */
  blurb: string
  /** What its per-suggestion line is: what the piece will feel like, or what it risks. */
  lineKind: 'feeling' | 'wager'
}

export const CLAWS: ClawCard[] = [
  {
    id: 'artistic',
    name: 'ArtisticClaw',
    tagline: 'artistic flare',
    blurb:
      'Five readings of the brief you actually typed, in the studio’s own vocabulary of materials and light. Nothing here should surprise you — it should be better than what you would have written.',
    lineKind: 'feeling',
  },
  {
    id: 'wonders',
    name: 'WondersClaw',
    tagline: 'one hit wonders',
    blurb:
      'Five long shots that leave from the brief rather than land on it, in a vocabulary of incidents and collisions, aimed at the far end of the dial. Most will be mud. It tells you what each one is risking.',
    lineKind: 'wager',
  },
]

export function isClawId(v: unknown): v is ClawId {
  return v === 'artistic' || v === 'wonders'
}

export function clawCard(id: ClawId): ClawCard {
  return CLAWS.find((c) => c.id === id) || CLAWS[0]
}

/* ------------------------------------------------------------------ the blend */

export const BLEND_PURE_ARTISTIC = 0
export const BLEND_PURE_WONDERS = 100

/** How many suggestions a spread holds. The quota is a fraction of this. */
export const SPREAD_SIZE = 5

/**
 * Clamp an incoming blend to 0–100.
 *
 * Anything unreadable becomes 0 — pure ArtisticClaw — because that is the
 * behaviour every caller had before WondersClaw existed, so a client that does
 * not know about the dial gets exactly what it used to get.
 */
export function normalizeBlend(raw: unknown): number {
  const v = Math.round(Number(raw))
  if (!Number.isFinite(v)) return BLEND_PURE_ARTISTIC
  return Math.max(BLEND_PURE_ARTISTIC, Math.min(BLEND_PURE_WONDERS, v))
}

/** Which provenance a blend amounts to. The endpoints are pure; everything else is entangled. */
export function clawAt(blend: number): AssistClaw {
  const b = normalizeBlend(blend)
  if (b <= BLEND_PURE_ARTISTIC) return 'artistic'
  if (b >= BLEND_PURE_WONDERS) return 'wonders'
  return 'entangled'
}

/** How many of the five slots WondersClaw owns at this blend. Monotone in the dial. */
export function wondersQuota(blend: number, slots: number = SPREAD_SIZE): number {
  return Math.round((normalizeBlend(blend) * slots) / 100)
}

/** How a blend reads on a control, a claim or a notice. */
export function blendLabel(blend: number): string {
  const b = normalizeBlend(blend)
  if (b <= BLEND_PURE_ARTISTIC) return 'ArtisticClaw · pure'
  if (b >= BLEND_PURE_WONDERS) return 'WondersClaw · pure'
  return `Entangled · ${100 - b}% artistic / ${b}% wonders`
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Which claw writes each slot of the spread.
 *
 * Deterministic on (brief, blend), so pressing the button twice at one setting
 * gives the same deal — the spread that comes back has to be a property of what
 * you asked for, not of when you asked. And the blend is IN the key, which is
 * what makes every position on the dial its own deal rather than a superset of
 * the one below it. See the header.
 */
export function entangleDeal(brief: string, blend: number, slots: number = SPREAD_SIZE): ClawId[] {
  const b = normalizeBlend(blend)
  const quota = wondersQuota(b, slots)
  if (quota <= 0) return Array.from({ length: slots }, () => 'artistic' as ClawId)
  if (quota >= slots) return Array.from({ length: slots }, () => 'wonders' as ClawId)

  const key = `entangle:${normalizeSeed(brief)}:${b}`
  const ranked = Array.from({ length: slots }, (_, i) => ({ i, r: fnv1a(`${key}:${i}`) })).sort(
    (x, y) => x.r - y.r || x.i - y.i,
  )
  const out: ClawId[] = Array.from({ length: slots }, () => 'artistic' as ClawId)
  for (let k = 0; k < quota; k++) out[ranked[k].i] = 'wonders'
  return out
}

/**
 * Entangle the two claws' dial picks into one.
 *
 * This is the half of the blend that is genuine interpolation rather than a
 * deal, because a position on a ladder is a number and two numbers can be
 * averaged. `artistic` is the index ArtisticClaw wants, `wonders` the index
 * WondersClaw wants; the blend slides between them and both endpoints are exact.
 * Indices rather than values, so it works on an axis whose values are not evenly
 * spaced — V1's folds run 2,3,…,10,12,16, and interpolating those numbers
 * directly would land between rungs.
 */
export function entangleIndex(artistic: number, wonders: number, blend: number): number {
  const t = normalizeBlend(blend) / 100
  return Math.round(artistic + (wonders - artistic) * t)
}

/* ------------------------------------------------------------------- the axis */

/**
 * The studio's second axis, as a director needs to see it.
 *
 * Built from `StudioMetric` at the route rather than imported from the registry,
 * so the composers stay pure and testable and neither claw has to know that
 * studios exist. `kind` is what lets one sentence of prose serve both a fold
 * ladder and a decay lineage without lying about either.
 */
export type ClawAxis = {
  name: string
  kind: 'views' | 'lineage'
  values: number[]
  label: (v: number) => string
  /** Where the creator's dial is sitting right now. */
  current: number
}

/** The index of `current` on the axis, or the base rung if it is not on it. */
export function axisIndex(axis: ClawAxis): number {
  const i = axis.values.indexOf(axis.current)
  return i >= 0 ? i : 0
}

export type Suggestion = { name: string; seed: string; feeling: string; claw?: ClawId }

export type ClawSpread = {
  direction: string
  /** A value ON the axis — never an index. */
  symmetry: number
  suggestions: Suggestion[]
}
