// The studio registry — the one place that knows about every Art Studio.
//
// There are three studios now, painting by unrelated methods, and there will be
// more stations in each. Everything that has to reason across all of them lives
// here so no kernel has to import another: naming a station, checking a station
// id off the wire, labelling a render mode, describing a recipe for the Codex
// ledger, and — since V3 — saying what a studio's SECOND AXIS even is.
//
// All three studios pour into the same `art_pieces` table, because a recipe is a
// recipe: a station, a phrase, a number on the studio's second axis, a mode and
// what the creator took it away as. That is why V2 and V3 needed no new table.
//
// THE SECOND AXIS USED TO BE A BOOLEAN AND IS NOW A DESCRIPTOR.
//
// It was `foldsOptional: boolean`, and four readers branched on it — the base
// metric, the list of values, the board label and the recipe line. That worked
// while the only question was "can this studio's fold be switched off". V3 does
// not fold at all; its second axis counts GENERATIONS OF DECAY. A boolean cannot
// say that, and the honest failure mode of keeping it would have been V3 pieces
// labelled "On · folded — 3-fold" on a board where nothing is folded.
//
// So each studio now carries a `metric` that answers all four questions for
// itself. The readers in `art-discovery.ts` became one-liners, and the studio
// that knows what its axis means is the one that says so.

import { RENDER_MODES, STATIONS, SYMMETRY_OPTIONS, TAKE_LABEL, normalizeSymmetry, type Recipe, type StationCard } from './art.js'
import { V2_RENDER_MODES, V2_STATIONS, foldLabel, normalizeFolds } from './artv2.js'
import {
  DECAY_GENERATIONS,
  V3_RENDER_MODES,
  V3_STATIONS,
  decayBoardLabel,
  decayLabel,
  normalizeDecay,
} from './artv3.js'

export type StudioKey = 'v1' | 'v2' | 'v3'

/**
 * A studio's second axis — the thing that is claimed alongside the seed.
 *
 * Every studio has one and no two are the same quantity, which is exactly why
 * this is a descriptor rather than a flag. It is stored in one integer column
 * (`art_pieces.symmetry`) for all three, and that is fine: the column holds the
 * number, this descriptor holds what the number MEANS.
 *
 * `kind` is the part worth reading. A fold count is a SET OF VIEWS — 4-fold and
 * 8-fold are two ways of looking at one traced field, and neither is descended
 * from the other. A decay generation is a LINEAGE — generation 3 is grown from
 * generation 2 by running a destructive pass over it. Both give a discovery
 * board rungs worth racing for, but they do not mean the same thing, and the
 * boards word themselves off this field instead of pretending they do.
 */
export type StudioMetric = {
  /** The axis's name in prose, lowercase, for headings and sentences. */
  name: string
  /** Every value the axis offers, BASE FIRST — the base is the discovery. */
  values: number[]
  /** How a value reads on a discovery board, where it must stand alone. */
  label: (v: number) => string
  /** How a value reads inside a recipe line, where the station is already named. */
  short: (v: number) => string
  /**
   * Clamp an arbitrary incoming number onto this axis.
   *
   * This is the fix for a real latent bug rather than tidying. `POST /api/art`
   * ran every commit through V2's `normalizeFolds`, which maps anything ≤ 1 to
   * 0 — so a V1 commit arriving with a junk or missing symmetry was stored at 0,
   * a value V1's board has no row for, and the piece landed off its own ladder.
   * Each studio now clamps onto the axis it actually has.
   */
  normalize: (raw: unknown) => number
  /** Whether the rungs are views of one artwork or a descent from it. */
  kind: 'views' | 'lineage'
}

export type Studio = {
  key: StudioKey
  /** The page this studio's live station paints on. */
  to: string
  label: string
  /**
   * How the studio paints, in one clause — used where the studios are compared.
   *
   * A studio-level clause rather than a per-station one, so it has to describe
   * what all of a studio's stations have in common — which means it has to be
   * rewritten, not extended, whenever a station arrives that breaks the old
   * summary. It has been, twice. V2 used to be "solves a field at every pixel and
   * traces nothing", and its third station throws two thousand particles, so that
   * clause is gone.
   *
   * What divides the three is not the family of kernel — two of them have a
   * station that deposits moving particles — but WHAT HAPPENS TO THE FRAME.
   *
   * V1 ACCUMULATES: paths cross, the count climbs without a ceiling, and a
   * render mode has to bring it back into range, which is why V1 has four of
   * them and why its densest structure can bleach.
   *
   * V2 WRITES BOUNDED COLOUR: every station puts a value into the frame that is
   * already in [0,255] and can never climb past it — through a sine at the
   * expression and lattice stations, through source-over compositing at the
   * ember bloom, and at the genome station through an operator set where all
   * four operators are contractions, so nothing ever needed bringing back. That
   * is why V2 has exactly one render mode and no exposure *view* anywhere. One
   * caveat, stated because it is real: the genome station's Neon dial CAN drive
   * a channel to full. It is a dial inside the seed rather than a way of looking
   * at the frame, so a clipped piece is one somebody chose and recorded.
   *
   * V3 CONSTRUCTS AND THEN DESTROYS, and it is the only studio whose second
   * phase READS ITS OWN FINISHED FIRST PHASE. A composition is built, and then a
   * corruption pass tears it apart while sampling the buffer it is writing into.
   * It also has one render mode, but for a third reason: nothing is collecting
   * light here at all, so there is no exposure to choose. And it is the only
   * studio with no resolution independence to offer — its pass draws from its
   * random stream per pixel, so it paints one fixed grid and magnifies.
   *
   * The other half of the division is the second axis, which is what `metric`
   * below encodes: V1 is always folded, V2's fold can be switched off, and V3
   * does not fold — its rungs are generations of decay descended from one
   * another. Those facts — not the station count — are what make these three
   * studios rather than one with nine stations.
   * Per-station description lives on the station card's blurb.
   */
  method: string
  stations: StationCard[]
  modes: { id: string; label: string; blurb: string }[]
  /** What this studio's second axis is. See `StudioMetric`. */
  metric: StudioMetric
}

export const STUDIOS: Studio[] = [
  {
    key: 'v1',
    to: '/art',
    label: 'Art Studio',
    method:
      'traces particles and accumulates the light where their paths cross — a polar wave folded around the centre at one station, a vortex advected across the plane at the next',
    stations: STATIONS,
    modes: RENDER_MODES,
    metric: {
      name: 'symmetry',
      values: [...SYMMETRY_OPTIONS],
      label: (v) => `${v}-fold`,
      short: (v) => `${v}-fold`,
      normalize: normalizeSymmetry,
      kind: 'views',
    },
  },
  {
    key: 'v2',
    to: '/artv2',
    label: 'Art Studio V2',
    method:
      'writes bounded colour straight into the frame with no exposure step, and can show its field with the symmetry switched off — a grown formula solved at every pixel at one station, a shuffled noise lattice at the next, two thousand embers thrown from a single point at the third, and a stack of images spliced down to a sixteen-colour recipe at the fourth',
    stations: V2_STATIONS,
    modes: V2_RENDER_MODES,
    metric: {
      name: 'symmetry',
      values: [0, ...SYMMETRY_OPTIONS],
      label: (v) => (v === 0 ? 'Off · raw field' : `On · folded — ${v}-fold`),
      short: foldLabel,
      normalize: normalizeFolds,
      kind: 'views',
    },
  },
  {
    key: 'v3',
    to: '/artv3',
    label: 'Art Studio V3',
    method:
      'builds a composition and then corrupts it with a pass that reads the frame it is writing into, so nothing here is a view of anything — a blend of shapes and garbled type torn sideways, split into its channels, melted downward and XORed through with noise at its first station',
    stations: V3_STATIONS,
    modes: V3_RENDER_MODES,
    metric: {
      name: 'decay',
      values: [...DECAY_GENERATIONS],
      label: decayBoardLabel,
      short: decayLabel,
      normalize: normalizeDecay,
      kind: 'lineage',
    },
  },
]

/** Which studio a station belongs to. */
export function studioOf(stationId: string): Studio | undefined {
  return STUDIOS.find((s) => s.stations.some((st) => st.id === stationId))
}

export function findStation(stationId: string): StationCard | undefined {
  for (const studio of STUDIOS) {
    const hit = studio.stations.find((s) => s.id === stationId)
    if (hit) return hit
  }
  return undefined
}

/** True for a station id belonging to any studio. Used to vet incoming commits. */
/**
 * A station that is actually painting.
 *
 * The ledger holds recipes, not pixels, so a row is only worth anything if the
 * station named in it can still repaint the piece. An announced-but-upcoming
 * station cannot, so it is refused at the door — the studio pages already
 * disable those cards, and this makes the same rule true of the wire.
 */
export function isLiveStation(stationId: string): boolean {
  return findStation(stationId)?.live === true
}

export function isKnownStation(stationId: string): boolean {
  return !!studioOf(stationId)
}

/** True when `modeId` is a render mode of the studio that owns `stationId`. */
export function isKnownMode(stationId: string, modeId: string): boolean {
  return !!studioOf(stationId)?.modes.some((m) => m.id === modeId)
}

/**
 * How many words of a phrase a station actually reads. 0 means all of them.
 *
 * Lives here because the claws need it and cannot build a piece to ask — the
 * same fact `V2Piece.seedWords` and `V3Piece.seedWords` read off the same cards.
 * Written out per studio rather than added to `StationCard`, because V1 has no
 * station that splits its seed and giving every card a field two studios use
 * would put the answer in nine places instead of one.
 */
export function seedWordsFor(stationId: string): number {
  const v2 = V2_STATIONS.find((s) => s.id === stationId)
  if (v2) return v2.seedWords
  const v3 = V3_STATIONS.find((s) => s.id === stationId)
  if (v3) return v3.seedWords
  return 0
}

export function stationName(stationId: string): string {
  return findStation(stationId)?.name || stationId
}

export function modeLabelFor(stationId: string, modeId: string): string {
  const modes = studioOf(stationId)?.modes
  return modes?.find((m) => m.id === modeId)?.label || modeId
}

/**
 * One line describing a recipe, for the Codex ledger and the avatar note.
 *
 * Reads correctly for any studio, off the studio's own metric: a V1 piece is
 * always folded and says how many times, a V2 piece may be unfolded and says
 * that instead, and a V3 piece was never folded and says how many generations of
 * decay it is down.
 */
export function describeRecipe(r: Recipe): string {
  const metric = metricOf(r.station)?.short(r.symmetry) ?? `${r.symmetry}-fold`
  const take = TAKE_LABEL[r.take] || String(r.take)
  return `${stationName(r.station)} · “${r.seed}” · ${metric} · ${modeLabelFor(r.station, r.mode)} · ${take}`
}

/**
 * The second axis of the studio that owns `stationId`.
 *
 * Undefined for an unknown station, which every caller handles — a stale
 * bookmark should show a bare board rather than crash on a missing descriptor.
 */
export function metricOf(stationId: string): StudioMetric | undefined {
  return studioOf(stationId)?.metric
}
