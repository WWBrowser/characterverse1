// Art Studio V3 — the engine layer.
//
// The same shape as `artv2-engine.ts` and for the same reason: a station is
// resolved ONCE into a piece — a closed-over object that knows how to paint
// itself and exposes only the shared facts — so the concrete plan never leaves
// the closure and there is no union to narrow and no cast in this file. Adding a
// station means writing a kernel and adding one branch to `v3Piece`.
//
// WHY A SEPARATE ENGINE RATHER THAN A THIRD BRANCH IN V2's.
//
// It would compile. `V2Piece` has a `band`, a `createSurface`, a `solveRows` and
// a `read`, and a decay station can fill all four. But two of V2's fields would
// have to be lied about to get it in:
//
//   `folds` — V3 does not fold. Its second axis is a GENERATION COUNT, and a
//   generation is not a view of one artwork the way a fold count is: generation 3
//   is descended from generation 2. Calling it `folds` and then writing a
//   `foldNote` explaining that the fold is not a fold is how a field stops
//   meaning anything.
//
//   `V2Surface.raw` and the resolution-independence that goes with it — V2 solves
//   a pixel from its own coordinate, so any size is the same picture at a
//   different exposure. V3's corruption pass draws RNG per pixel and branches on
//   that pixel's brightness, so a 512px render and a 1440px render of one seed are
//   different pieces. V3 therefore paints one fixed 600px reference frame and
//   MAGNIFIES it. `V3Surface` carries that reference buffer and a stage counter;
//   `V2Surface` has nowhere to put either.
//
// So this is a third engine, and the page that drives it is a third page. What is
// genuinely shared — the studio registry, the discovery register, the ledger, the
// claws, the take actions, the avatar handoff — is shared at those layers instead,
// which is where sharing costs nothing.

import type { ReadRow, Take } from './art.js'
import {
  DECAY_GENERATIONS,
  V3_MODE,
  getV3Station,
  type V3Spec,
  type V3StationId,
  type V3Surface,
} from './artv3.js'
import {
  BLEND_MODES,
  createDecaySurface,
  decayAvatarNote,
  decayBandSize,
  decayRecipeOf,
  decayStats,
  decaySwatches,
  planDecay,
  readDecay,
  solveDecayStages,
} from './artv3-decay.js'

/** What a recipe pour needs. Identical in shape to V1's and V2's. */
export type V3Recipe = {
  station: V3StationId
  seed: string
  /** Generations of decay, carried on the shared `symmetry` column. */
  symmetry: number
  mode: typeof V3_MODE
  take: Take
  size: number
}

/** One line of the station's own detail panel, under the swatches. */
export type V3Fact = { label: string; value: string }

/**
 * The shared facts — the smallest set the page uses. `decay` sits where V2 puts
 * `folds`, under its own name, because it is not the same quantity.
 */
export type V3Facts = {
  station: V3StationId
  seed: string
  hash: string
  decay: number
  size: number
  /** The reference grid the piece is actually painted on, before magnification. */
  ref: number
}

export type V3Piece = {
  facts: V3Facts
  /**
   * Rows per animation frame. V3 does not solve rows — it builds a whole
   * composition and then rots it — so this is a row count the page can keep
   * asking for, converted to stages inside the kernel. See `decayBandSize`.
   */
  band: number
  createSurface: () => V3Surface
  /** Advance the surface. True once every stage has run. */
  solveRows: (surface: V3Surface, rows: number) => boolean
  /**
   * The canvas read. V3's read needs the SURFACE as well as the progress, which
   * V1's and V2's do not: half of what there is to say about a piece here —
   * where the melt threshold landed, how many rows tore, how dense the noise
   * came out — is not in the plan, because the pass decides it while it runs.
   * The page passes the surface it is showing and gets the numbers of the passes
   * that have actually happened.
   */
  read: (surface: V3Surface | null, progress: number) => ReadRow[]
  /**
   * The palette, which is known before the canvas is.
   *
   * The surface is optional here and V2's equivalent required one, because V2
   * has no palette until it has solved a field and this station is DEALT six
   * exact colours off the front of the stream before a single shape is placed.
   * The page can therefore show the palette of a piece that has not started
   * painting, and the swatches do not change while it does.
   */
  swatches: (surface?: V3Surface | null, n?: number) => string[]
  recipe: (take: Take) => V3Recipe
  avatarNote: () => string
  detail: () => V3Fact[]
  /** How many words of a phrase this station reads. 0 means all of them. */
  seedWords: number
  /** What to tell a claw about this station's seeds. */
  seedHelp: string
  seedPanel: { title: string; intro: string; placeholder: string }
  /**
   * What the second axis does here — V2's `foldNote` under the name of the thing
   * V3 actually has.
   */
  decayNote: string
  /** One sentence on how this station is built, for the studio footer. */
  methodNote: string
  /** Why this station has exactly one render mode. */
  modeNote: string
  /**
   * Why this station renders on a fixed grid and magnifies, when every station
   * in the other two studios renders at whatever size it was asked for. Stated
   * per station rather than per studio, because a later V3 station might not
   * consume RNG per pixel and would not need it.
   */
  gridNote: string
}

const CLAW_DECAY_SEED =
  "V3's corruption station hashes the WHOLE seed into one stream that deals the palette, the composition and every corruption pass in turn, so there is no half of the seed to hold still — a single letter re-deals the entire piece. The composition it builds is abstract: shapes and garbled type, never a scene. Write for colour and for force."

/** How many words this station reads, off its card. */
function seedWordsOf(station: V3StationId): number {
  return getV3Station(station)?.seedWords ?? 0
}

/** Resolve a spec into a painter. */
export function v3Piece(spec: V3Spec): V3Piece {
  // Station 01, and the fallback for anything not yet built: an unbuilt station
  // is never selectable in the grid, so landing here means a stale URL or a
  // hand-typed id, and the live station is a better answer than a blank canvas.
  const plan = planDecay(spec)
  return {
    facts: {
      station: plan.station,
      seed: plan.seed,
      hash: plan.hash,
      decay: plan.decay,
      size: plan.size,
      ref: plan.ref,
    },
    band: decayBandSize(plan),
    createSurface: () => createDecaySurface(plan),
    solveRows: (surface, rows) => solveDecayStages(surface, plan, rows),
    read: (surface, progress) => readDecay(plan, progress, surface ? decayStats(surface) : []),
    swatches: (_surface, n) => decaySwatches(plan, n),
    recipe: (take) => decayRecipeOf(plan, take),
    avatarNote: () => decayAvatarNote(plan),
    detail: () => [
      { label: 'stream', value: `mulberry32 ${plan.hash.slice(0, 8)}` },
      { label: 'elements', value: `${plan.shapes.length - 1} over a ground` },
      { label: 'type', value: plan.glyphRuns ? `${plan.glyphRuns} runs · ${plan.glyphChars} glyphs` : 'none dealt' },
      { label: 'blends', value: `${plan.blends.length} of ${BLEND_MODES.length} used` },
      { label: 'passes', value: plan.decay ? `${plan.decay} of ${DECAY_GENERATIONS.length - 1}` : 'none — signal intact' },
    ],
    seedWords: seedWordsOf(plan.station),
    seedHelp: CLAW_DECAY_SEED,
    seedPanel: {
      title: 'Seed phrase',
      intro:
        'One seed, doing every job. The phrase is hashed into a single number, that number seeds one stream, and the stream is drawn from in order: six palette colours, then every shape and every glyph, then each corruption pass. Nothing is held back for a second dial, which is why moving one letter deals the whole piece again rather than recolouring it.',
      placeholder: 'one phrase — a mood, a word, a name…',
    },
    decayNote:
      'At Clean the composition is shown as it was built: hard-edged blended shapes and garbled type, no corruption run. Every rung above it runs the corruption pass one more time, and the pass READS the frame it is writing — the melt copies from the row it just wrote — so each generation is grown from the one below it rather than being another view of the same picture. That is why the base discovery here is the clean signal and the corrupted rungs are its descendants.',
    methodNote:
      'Built in two phases from one stream: a composition of rects, discs, polygons and 3×5 bitmap type blended through five separable modes, then a corruption pass that tears rows sideways, offsets the red and blue channels apart, drags every pixel brighter than a seeded threshold down into the row below, and XORs noise through what is left.',
    modeNote:
      'V3 collects no light. There is no accumulation buffer to expose and no overflow to recover — the pass writes bytes that can be anything at all, and they stay bytes because a byte XOR a byte is a byte. The frame is the signal after the corruption pass finished with it, so there is no second reading of it to offer.',
    gridNote: `Painted on a fixed ${plan.ref}px grid and magnified nearest-neighbour to whatever size you take away. The corruption pass draws from the stream once or twice PER PIXEL, and which of the two it does depends on that pixel's own brightness, so a piece rendered at a different size would not be the same piece rendered larger — it would be an unrelated piece. Magnifying by replication keeps the tear seams and the noise speckle exactly as wide as the pass made them; averaging them into their neighbours would blur away the thing being magnified.`,
  }
}

/** Trim a phrase to what a station will actually read. `0` words means all of it. */
export function trimSeedFor(piece: V3Piece, phrase: string): string {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  if (piece.seedWords <= 0) return words.join(' ')
  return words.slice(0, piece.seedWords).join(' ')
}
