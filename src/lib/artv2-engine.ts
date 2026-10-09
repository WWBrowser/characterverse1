// Art Studio V2 — the engine layer.
//
// V2 now has four live stations that paint by genuinely unlike methods. Station
// 01 grows three expression trees and solves them per pixel; station 02 shuffles
// a permutation table and interpolates gradients across a lattice; station 03
// solves nothing at all — it throws two thousand straight rays and composites
// them where they land; station 04 grows three trees like the first, but from a
// number squeezed out of uploaded images, and then crystallises, twists,
// brightens and sharpens what they solve to. Their plans have almost nothing in
// common: one carries `colorWord`/`styleWord`/`programs`, one carries
// `perm`/`octaves`/`scale`, one carries a table of birth points and velocities,
// one carries a genome and six dials. Only the seed, the hash, the fold count
// and the size are shared.
//
// The page must not care, and station 03 was the proof that it does not: it
// arrived as one branch here plus a kernel, and `artv2.tsx` did not change by a
// line. The alternative — `if (station === 'noise')` sprinkled through a render
// function that plans, sizes bands, solves rows, reads out, builds a recipe and
// names a download — is how a studio ends up with three stations and a page
// nobody can add a fourth to.
//
// STATION 04 IS WHERE THAT STOPPED BEING FREE, AND THIS SAYS SO PLAINLY.
//
// Everything about how station 04 PAINTS still comes through this file and
// changes nothing on the page. But station 04 is the first station whose INPUT
// is not a phrase in a text box — it takes image files, and it shows a preview of
// what it made of them. A new input modality is not a value a data-driven field
// can carry, so `artv2.tsx` grows exactly one conditional panel for it. The boast
// that the page never changes was true for three stations and is now true for
// everything except how a seed is typed. Faking it — pretending a file input and
// a live preview canvas can be described by another string field — would have
// been the worse outcome, so it is written down instead.
//
// So a station is resolved ONCE, into a piece: a closed-over object that knows
// how to paint itself and exposes only the shared facts. The concrete plan lives
// in the closure and never leaves it, which is what keeps this honest — there is
// no union to narrow and no cast anywhere in this file. Adding a station means
// writing a kernel and adding one branch to `v2Piece`.

import type { ReadRow, Take } from './art.js'
import {
  OPERATORS,
  V2_MODE,
  bandSize,
  createSurface,
  getV2Station,
  planV2,
  readV2,
  sampleSwatches,
  solveRows,
  v2AvatarNote,
  v2RecipeOf,
  type V2Spec,
  type V2StationId,
  type V2Surface,
} from './artv2.js'
import {
  createNoiseSurface,
  noiseAvatarNote,
  noiseBandSize,
  noiseRecipeOf,
  planNoise,
  readNoise,
  solveNoiseRows,
} from './artv2-noise.js'
import {
  DNA_DIALS,
  createDnaSurface,
  dnaAvatarNote,
  dnaBandSize,
  dnaRecipeOf,
  genomeLabel,
  planDna,
  readDna,
  solveDnaRows,
} from './artv2-dna.js'
import {
  burstAvatarNote,
  burstBandSize,
  burstRecipeOf,
  burstSwatches,
  createBurstSurface,
  paintBurstSteps,
  planBurst,
  readBurst,
  stopsLabel,
} from './artv2-burst.js'

/** What a recipe pour needs. Identical in shape for every station. */
export type V2Recipe = {
  station: V2StationId
  seed: string
  symmetry: number
  mode: typeof V2_MODE
  take: Take
  size: number
}

/** One line of the station's own detail panel, under the swatches. */
export type V2Fact = { label: string; value: string }

/**
 * The shared facts. Deliberately the smallest set the page actually uses —
 * anything a station wants to show beyond this goes through `facts()`, so a new
 * station never has to widen this type.
 */
export type V2Facts = {
  station: V2StationId
  seed: string
  hash: string
  folds: number
  size: number
}

export type V2Piece = {
  facts: V2Facts
  /** Rows per animation frame, sized to this station's cost per pixel. */
  band: number
  createSurface: () => V2Surface
  /** Solve the next `rows` rows. True once the surface is finished. */
  solveRows: (surface: V2Surface, rows: number) => boolean
  read: (progress: number) => ReadRow[]
  swatches: (surface: V2Surface, n?: number) => string[]
  recipe: (take: Take) => V2Recipe
  avatarNote: () => string
  /** The station-specific lines of the detail panel. */
  detail: () => V2Fact[]
  /**
   * How many words of a phrase this station reads. 0 means all of them.
   *
   * Station 01 splits the seed into a colour word and a style word, so a longer
   * phrase from ArtisticClaw or the dice has to be trimmed to two or the extra
   * words are silently ignored and the displayed seed lies about the piece.
   * Station 02 shuffles one table from the whole phrase, so trimming it would
   * throw away input that genuinely changes the picture. Hence a number rather
   * than a hardcoded `.slice(0, 2)` at the call site.
   *
   * Read off the station card rather than written out per branch below, because
   * `/api/claw` needs the same fact and cannot build a piece to ask. One
   * field, two readers — see `V2Station`.
   */
  seedWords: number
  /** What to tell the director about this station's seeds. */
  seedHelp: string
  /** Heading, intro and placeholder for the seed box. */
  seedPanel: { title: string; intro: string; placeholder: string }
  /** What the fold actually does to THIS station's coordinate. */
  foldNote: string
  /** One sentence on how this station is built, for the studio footer. */
  methodNote: string
  /**
   * Why this station has exactly one render mode.
   *
   * V1 offers four, because V1 accumulates into an unbounded buffer and the
   * result genuinely needs an exposure curve chosen for it. V2 does not — but the
   * REASON it does not differs per station, and the page used to state one
   * station's reason as if it were the studio's. It said "each pixel is solved
   * once and folded through a sine into its full range", which is true of station
   * 01, false of station 03 (which accumulates, and stays in range because
   * source-over cannot exceed full) and false of station 04 (which is never
   * wrapped through anything, and whose Neon dial can clip on purpose). So the
   * sentence belongs to the station, not to the page.
   */
  modeNote: string
}

const CLAW_SPLIT_SEED =
  "V2's first station splits the seed into a colour word and a style word, so the director writes them as a pair."
const CLAW_BURST_SEED =
  "V2's ember station splits the seed the same way as its first — a colour word and a flow word — but the flow word steers a throw rather than a formula, so blunt physical words land hardest."
const CLAW_WHOLE_SEED =
  "V2's noise station shuffles one lattice from the whole phrase, so a single evocative word — the way the generator's own field was written — lands hardest."
const CLAW_DNA_SEED =
  "V2's genome station normally reads a strand of encoded DNA rather than words, but a phrase is a legitimate starting point: it is hashed into a synthetic genome the director can then splice images into, so write a phrase with a strong colour in it."

/** How many words this station reads, off its card. See `V2Piece.seedWords`. */
function seedWordsOf(station: V2StationId): number {
  return getV2Station(station)?.seedWords ?? 0
}

/** Resolve a spec into a painter. */
export function v2Piece(spec: V2Spec): V2Piece {
  if (spec.station === 'noise') {
    const plan = planNoise(spec)
    return {
      facts: {
        station: plan.station,
        seed: plan.seed,
        hash: plan.hash,
        folds: plan.folds,
        size: plan.size,
      },
      band: noiseBandSize(plan),
      createSurface: () => createNoiseSurface(plan),
      solveRows: (surface, rows) => solveNoiseRows(surface, plan, rows),
      read: (progress) => readNoise(plan, progress),
      swatches: (surface, n) => sampleSwatches(surface, n),
      recipe: (take) => noiseRecipeOf(plan, take),
      avatarNote: () => noiseAvatarNote(plan),
      detail: () => [
        { label: 'lattice', value: `LCG ${plan.seedNumber}` },
        { label: 'octaves', value: String(plan.octaves) },
        { label: 'zoom', value: `${plan.scale.toFixed(2)} cells` },
        { label: 'bands', value: plan.bands.map((b) => b.toFixed(1)).join(' / ') },
      ],
      seedWords: seedWordsOf(plan.station),
      seedHelp: CLAW_WHOLE_SEED,
      seedPanel: {
        title: 'Seed phrase',
        intro:
          'One seed, doing one job. The whole phrase is hashed into a single number and that number shuffles the lattice, so there is no half of the piece to hold still — move a letter and the entire table is dealt again.',
        placeholder: 'one phrase — a mood, a word, a name…',
      },
      foldNote:
        'Switched off, the noise field is shown as the lattice generates it. Switched on, the coordinate is folded into one wedge before it is looked up, so the marbling repeats around the middle — the field underneath is unchanged, which is why the unfolded piece is the base discovery rather than a variant of the folded one.',
      methodNote:
        'Built from a 256-entry permutation table shuffled by the seed and doubled to 512 so the lattice wraps, then summed over octaves at doubling frequency and halving amplitude.',
      modeNote:
        'Nothing accumulates here — each pixel is one lattice lookup, mapped straight into its colour band — so a second exposure would repaint the identical image.',
    }
  }

  if (spec.station === 'burst') {
    const plan = planBurst(spec)
    return {
      facts: {
        station: plan.station,
        seed: plan.seed,
        hash: plan.hash,
        folds: plan.folds,
        size: plan.size,
      },
      band: burstBandSize(plan),
      createSurface: () => createBurstSurface(plan),
      solveRows: (surface, rows) => paintBurstSteps(surface, plan, rows),
      read: (progress) => readBurst(plan, progress),
      // The one station that can show its colours before it paints — see
      // `burstSwatches`. The surface it is handed is deliberately ignored.
      swatches: (_surface, n) => burstSwatches(plan, n),
      recipe: (take) => burstRecipeOf(plan, take),
      avatarNote: () => burstAvatarNote(plan),
      detail: () => [
        { label: 'colour', value: plan.colorWord },
        { label: 'flow', value: plan.styleWord },
        { label: 'palette', value: stopsLabel(plan) },
        { label: 'ember', value: `r ${plan.dotRadius.toFixed(1)}px` },
      ],
      seedWords: seedWordsOf(plan.station),
      seedHelp: CLAW_BURST_SEED,
      seedPanel: {
        title: 'Seed pair',
        intro:
          'Two words, and the generator this station came from promised exactly this without ever implementing it: the first word owns the colour, the second owns the throw. Change the flow word and the palette holds; change the colour word and every ember keeps its trajectory.',
        placeholder: 'two words — colour then flow…',
      },
      foldNote:
        'Switched off, the embers land where they were thrown. Switched on, every pixel is folded into one wedge before it is told which part of the burst it shows, so the bloom repeats around the middle. This station has no sample point to fold the way the other two do, so the fold is applied to the reading rather than to the throw: the burst underneath is thrown identically either way, ember for ember, which is why the unfolded piece is the base discovery rather than a variant of the folded one.',
      methodNote:
        'Built from 2,000 embers thrown from one point with no field and no forces at all, each fading linearly over its 100 steps and composited source-over in the order it was thrown.',
      modeNote:
        'This station does accumulate — two thousand embers, composited one over another — but it accumulates through source-over blending, which cannot carry a pixel past full however many embers land on it. There is no overflow for an exposure control to recover.',
    }
  }

  if (spec.station === 'dna') {
    const plan = planDna(spec)
    const g = plan.genome
    return {
      facts: {
        station: plan.station,
        seed: plan.seed,
        hash: plan.hash,
        folds: plan.folds,
        size: plan.size,
      },
      band: dnaBandSize(plan),
      createSurface: () => createDnaSurface(plan),
      solveRows: (surface, rows) => solveDnaRows(surface, plan, rows),
      read: (progress) => readDna(plan, progress),
      swatches: (surface, n) => sampleSwatches(surface, n),
      recipe: (take) => dnaRecipeOf(plan, take),
      avatarNote: () => dnaAvatarNote(plan),
      detail: () => [
        { label: 'genome', value: genomeLabel(plan) },
        { label: 'nodes', value: plan.nodes.join(' / ') },
        ...DNA_DIALS.map((d) => ({ label: d.label.toLowerCase(), value: d.format(g[d.key]) })),
      ],
      // The card says 0, and it has to: trimming a strand would cut it in half
      // and the halves would decode as a phrase instead — silently painting
      // something else while the box showed the strand.
      seedWords: seedWordsOf(plan.station),
      seedHelp: CLAW_DNA_SEED,
      seedPanel: {
        title: 'Strand',
        intro:
          'Not a phrase, but a recipe. Splice images in and the whole recipe — their combined sum, how many there were, a sixteen-cell reading of their colour, and every dial — is written into one strand of text. Paste that strand anywhere and the piece comes back without the images, which is the only way a claim on it could mean anything. Type words instead and they are hashed into a synthetic genome to start from.',
        placeholder: 'dna1-… or a phrase to grow one from',
      },
      foldNote:
        'Switched off, the field is crystallised and twisted straight from the pixel it is painting. Switched on, the pixel is folded into one wedge FIRST and everything after that — the block grid, the twist, and the colour graded out of the images — is mirrored along with it, so the piece repeats around the middle as one picture rather than as a symmetric field under an unsymmetric wash.',
      methodNote:
        'Grown from four operators — sin, cos, mul, avg — which cannot take a value outside the range they were given, so this station is the one that needs no sine wrap on the way out; then quantised into blocks, rotated by its own radius, and graded through the images it was spliced from.',
      modeNote:
        'Nothing accumulates and nothing is wrapped: four contracting operators cannot leave the range they started in, so the field arrives already inside it. Neon is the one dial in V2 that can drive a channel hard against full — though with Graft up it lands on the images’ own colour rather than on white, because modulating by a surface cannot brighten it. Either way it is a dial inside the strand rather than a view of the frame, so a blown-out piece is one somebody chose and recorded, not an exposure they happened to be shown.',
    }
  }

  // Station 01, and the fallback for anything not yet built: an unbuilt station
  // is never selectable in the grid, so landing here means a stale URL or a
  // hand-typed id, and the first station is a better answer than a blank canvas.
  const plan = planV2(spec)
  return {
    facts: {
      station: plan.station,
      seed: plan.seed,
      hash: plan.hash,
      folds: plan.folds,
      size: plan.size,
    },
    band: bandSize(plan),
    createSurface: () => createSurface(plan),
    solveRows: (surface, rows) => solveRows(surface, plan, rows),
    read: (progress) => readV2(plan, progress),
    swatches: (surface, n) => sampleSwatches(surface, n),
    recipe: (take) => v2RecipeOf(plan, take),
    avatarNote: () => v2AvatarNote(plan),
    detail: () => [
      { label: 'colour', value: plan.colorWord },
      { label: 'style', value: plan.styleWord },
      { label: 'nodes', value: plan.nodes.join(' / ') },
    ],
    seedWords: seedWordsOf(plan.station),
    seedHelp: CLAW_SPLIT_SEED,
    seedPanel: {
      title: 'Seed pair',
      intro:
        'Two words, and they do different jobs. The first grows the colour; the second grows the structure. Change one and the other half of the piece stays exactly where it was.',
      placeholder: 'two words — colour then style…',
    },
    foldNote:
      'Switched off, the formula field is shown as it solves, unmirrored. Switched on, the coordinate is folded into one wedge before the formula sees it, so the piece repeats around the middle without any of its colour changing.',
    methodNote: `Grown from ${OPERATORS.length} operators: ${OPERATORS.join(', ')}.`,
    modeNote:
      'Nothing accumulates here — each pixel is solved once and folded through a sine into its full range — so a second exposure would repaint the identical image.',
  }
}

/**
 * Trim a phrase to what a station will actually read. `0` words means "all of
 * it" — see `seedWords`.
 */
export function trimSeedFor(piece: V2Piece, phrase: string): string {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  if (piece.seedWords <= 0) return words.join(' ')
  return words.slice(0, piece.seedWords).join(' ')
}
