// Art Studio V2, station 02 — the Psychedelic Noise Lattice.
//
// Modelled on station 01 (`artv2.ts`) and painting by a completely different
// method. Station 01 grows three expression trees and solves them at every
// pixel: the picture is an equation. This station has no equation. It builds a
// SHUFFLED PERMUTATION TABLE from the seed, hangs a pseudo-random gradient off
// every corner of an integer lattice, and interpolates between those gradients —
// the picture is a field of correlated randomness, summed over several octaves.
//
// The studio's three promises hold, for the same reasons they hold next door:
//
//   · DETERMINISM. The permutation table is shuffled by a seeded LCG, so the
//     lattice is fixed by the phrase and the piece is shareable by naming it.
//   · RESOLUTION INDEPENDENCE. Exact, as in station 01: the field is a function
//     of a continuous coordinate, so 512px and 1440px sample one function on two
//     grids rather than scaling an image.
//   · BROWSER-COMPUTED, PROGRESSIVELY. Solved in row bands while you watch.
//
// WHAT IS ACTUALLY DIFFERENT, since "another noisy square" is the easy mistake
// to make about a second station:
//
//   · The randomness is CORRELATED. Station 01's formula can swing between two
//     neighbouring pixels as violently as the operators allow. Gradient noise
//     cannot: it is smooth by construction, interpolated between lattice
//     corners, which is why this station produces flowing marbled structure
//     rather than interference fringes.
//   · The seed is NOT SPLIT. Station 01 cuts the phrase into a colour word and a
//     style word. Here the whole phrase is one seed, because the generator this
//     station was loaded from took one text field ("CyberWave") and shuffled a
//     single table with it. Colour and structure are not separable here — moving
//     one letter reshuffles the whole lattice.
//   · Detail is added by OCTAVES, not by depth. Station 01 grows a deeper tree.
//     This one sums the same noise function at doubling frequency and halving
//     amplitude, which is a completely different knob: it controls how rough the
//     field is, not how complicated the rule is.
//   · Colour comes from ONE field read three times. Station 01 solves three
//     independent programs, one per channel, so the channels are unrelated. Here
//     a single scalar field is tapped at three phases, so the channels are
//     locked together and the piece bands into rainbow contours instead of
//     going muddy. That banding is the "psychedelic" in the name.
//
// FIDELITY. `buildPermutation` is a verbatim port of the loaded generator,
// including its LCG constants and its `p.concat(p)` wrap — see the note on that
// function. The gradient-noise evaluation around it is reconstructed: the file
// that was loaded ends mid-declaration at `noise(x, y) {`, so the interpolation
// is the standard construction that its own permutation table demands rather
// than a copy of the original. Anything in the original beyond that point is not
// represented here, and the reconstruction is marked where it begins.

import {
  formatCount,
  normalizeSeed,
  seedHash,
  shortHash,
  type ReadRow,
  type Take,
} from './art.js'
import {
  FOLDS_OFF,
  V2_MODE,
  foldLabel,
  getV2Station,
  hashWord,
  normalizeFolds,
  type V2StationId,
  type V2Surface,
} from './artv2.js'

/* ----------------------------------------------------------- the seed number */

/**
 * The LCG's domain — the modulus the loaded generator's shuffle runs in.
 *
 * Named rather than inlined because the same number appears twice in
 * `buildPermutation`: once as the modulus and once as the divisor that turns the
 * state back into a fraction.
 */
const LCG_MODULUS = 233280

/**
 * Turn a phrase into a number the LCG can actually be started from.
 *
 * This step is missing from the loaded file — its HTML collects a text seed
 * ("CyberWave") and hands it to a constructor that immediately multiplies it, so
 * whatever bridged the two lived in the `generate()` function that was cut off.
 * Two things are needed of the bridge and neither is optional:
 *
 *   · a number, since `'CyberWave' * 9301` is NaN and a NaN seed shuffles the
 *     table into a row of `undefined`s and paints a black square;
 *   · a NON-NEGATIVE number below the modulus, because JavaScript's `%` keeps
 *     the sign of its left operand. A negative state makes `j` negative, `p[j]`
 *     undefined, and the swap silently destroys the table.
 *
 * `hashWord` is the studio's already-ported rolling hash — reused rather than
 * reinvented so the two V2 stations agree on what a phrase is worth — and the
 * result is folded into the LCG's own domain.
 */
export function seedNumber(phrase: string): number {
  return Math.abs(hashWord(phrase)) % LCG_MODULUS
}

/* ------------------------------------------------------- the loaded generator */

/**
 * The permutation table, shuffled by the seed. A verbatim port.
 *
 * Kept exactly as loaded — the LCG constants, the descending Fisher-Yates, and
 * the `(seed / 233280) * (i + 1)` index — because these are what decide the
 * piece. Changing any of them repaints every artwork this station could ever
 * make, so they are load-bearing in the way a hash is load-bearing.
 *
 * The doubling at the end is the one line worth explaining, since it looks like
 * a redundancy and is not. Evaluating a point needs `perm[perm[xi] + yi + 1]`,
 * and both terms can reach 255, so the index can reach 511. Concatenating the
 * table onto itself makes every one of those indices legal and wraps the lattice
 * seamlessly, which is why the original comment reads "Duplicate for wrapping".
 * It is also the strongest evidence about what the missing `noise(x, y)` did:
 * a table doubled to 512 is a table built for exactly this lookup.
 *
 * A `Uint8Array` rather than the original's plain array. The shuffle arithmetic
 * is unchanged and every value is a 0–255 index, so the sequence is identical;
 * the typed array is for the inner loop, which reads it a few million times.
 */
export function buildPermutation(seed: number): Uint8Array {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    p[i] = i
  }
  // Shuffle using seed
  let s = seed
  for (let i = 255; i > 0; i--) {
    s = (s * 9301 + 49297) % LCG_MODULUS
    const j = Math.floor((s / LCG_MODULUS) * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  // Duplicate for wrapping
  const doubled = new Uint8Array(512)
  doubled.set(p, 0)
  doubled.set(p, 256)
  return doubled
}

/* ------------------------------------------------- the reconstruction begins */

/**
 * Perlin's fade curve, 6t⁵ − 15t⁴ + 10t³.
 *
 * Smoothstep would interpolate perfectly well and look wrong: its second
 * derivative is discontinuous at the lattice lines, so a straight grid of faint
 * seams shows through the finished field. This curve is flat to second order at
 * both ends, which is the whole reason it is preferred over the cheaper one.
 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a)
}

/**
 * The gradient at a lattice corner, dotted with the offset to the sample point.
 *
 * The low bits of the permutation value pick one of four diagonal directions.
 * Four rather than eight because it is what a 2D lattice needs to avoid axis
 * bias, and diagonals rather than axis-aligned vectors because gradients that
 * point along the axes leave visible cross-hatching where they meet.
 */
function grad(hash: number, x: number, y: number): number {
  switch (hash & 3) {
    case 0:
      return x + y
    case 1:
      return -x + y
    case 2:
      return x - y
    default:
      return -x - y
  }
}

/**
 * One octave of gradient noise at a point. Returns roughly [-1, 1].
 *
 * The four corners of the containing lattice cell are hashed through the
 * permutation table into four gradients, each gradient is dotted with its offset
 * to the sample point, and the four results are interpolated with the faded
 * coordinates. Smoothness is structural: two nearby points share corners and
 * therefore share gradients, so the field cannot jump.
 */
export function noise2(perm: Uint8Array, x: number, y: number): number {
  const fx = Math.floor(x)
  const fy = Math.floor(y)
  // & 255 keeps the lookups inside the first half of the table; the doubled
  // second half absorbs the +1s below.
  const xi = fx & 255
  const yi = fy & 255
  const xf = x - fx
  const yf = y - fy

  const u = fade(xf)
  const v = fade(yf)

  const a = perm[xi] + yi
  const b = perm[xi + 1] + yi
  const aa = perm[a]
  const ab = perm[a + 1]
  const ba = perm[b]
  const bb = perm[b + 1]

  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
  return lerp(x1, x2, v)
}

/** Lacunarity and gain — the classic doubling/halving pair. */
const LACUNARITY = 2
const GAIN = 0.5

/**
 * Fractal Brownian motion: the same noise summed at doubling frequency.
 *
 * Normalized by the total amplitude so the result stays in roughly [-1, 1]
 * whatever the octave count. Without that division a six-octave field would sit
 * in a wider range than a three-octave one and the colour mapping would band
 * differently for a reason that has nothing to do with the seed.
 */
export function fbm(perm: Uint8Array, x: number, y: number, octaves: number): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += noise2(perm, x * freq, y * freq) * amp
    norm += amp
    amp *= GAIN
    freq *= LACUNARITY
  }
  return norm > 0 ? sum / norm : 0
}

/* ----------------------------------------------------------------- the plan */

/** Octave bounds. Below 2 there is no fractal detail; above 6 it is mud. */
const MIN_OCTAVES = 2
const MAX_OCTAVES = 6

export type NoiseSpec = {
  station: V2StationId
  seed: string
  /** 0 = symmetry off. */
  folds: number
  size: number
}

export type NoisePlan = {
  station: V2StationId
  seed: string
  hash: string
  folds: number
  size: number
  /** The LCG start, after folding the phrase into the modulus. */
  seedNumber: number
  perm: Uint8Array
  octaves: number
  /** Lattice cells across the canvas — how zoomed-in the field is. */
  scale: number
  /** Contour count per channel: how many colour bands the field is cut into. */
  bands: number[]
  /** Phase per channel, which is what separates the three taps. */
  phases: number[]
  pixels: number
  /**
   * Noise taps a full solve costs: pixels × octaves.
   *
   * NOT × 3 for the channels. The field is evaluated once per pixel and then
   * read at three phases, so tripling this would be counting three sines as if
   * they were three lattice traversals.
   */
  work: number
}

/**
 * Plan a piece.
 *
 * Everything is drawn off the one seed number, in a fixed order, so the plan is
 * pure and cheap enough to derive during render — the same deal station 01's
 * `planV2` makes. There is no second RNG stream here because there is no second
 * word to seed it with: this station's colour and structure come out of the same
 * shuffle, which is the difference the read reports.
 */
export function planNoise(spec: NoiseSpec): NoisePlan {
  const seed = normalizeSeed(spec.seed)
  const size = Math.max(16, Math.min(4096, Math.round(spec.size)))
  const folds = normalizeFolds(spec.folds)
  const n = seedNumber(seed)
  const perm = buildPermutation(n)

  // Drawn from the table itself rather than from a fresh RNG: the shuffled
  // permutation is already a well-mixed function of the phrase, so reading a few
  // of its entries is a free, deterministic way to vary the dials.
  const octaves = MIN_OCTAVES + (perm[7] % (MAX_OCTAVES - MIN_OCTAVES + 1))
  const scale = 2 + (perm[19] / 255) * 5.5
  // Three phases a third of a turn apart, nudged per channel. Evenly spread
  // gives the rainbow; the nudge stops every piece opening on the same hue.
  const drift = (perm[41] / 255) * Math.PI * 2
  const phases = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map(
    (base, c) => base + drift + (perm[53 + c] / 255) * 0.6,
  )
  // Channels band at slightly different rates, which is what turns concentric
  // contours into interleaved colour rather than three copies of one ring.
  const bands = [0, 1, 2].map((c) => 1.5 + (perm[71 + c * 13] / 255) * 3.5)

  const pixels = size * size
  return {
    station: spec.station,
    seed,
    hash: seedHash(seed),
    folds,
    size,
    seedNumber: n,
    perm,
    octaves,
    scale,
    bands,
    phases,
    pixels,
    work: pixels * octaves,
  }
}

/* --------------------------------------------------------------- the solving */

export function createNoiseSurface(plan: NoisePlan): V2Surface {
  const px = new Uint8ClampedArray(plan.size * plan.size * 4)
  return { size: plan.size, px, solved: 0 }
}

/**
 * Solve the next band of rows. Returns true once the surface is finished.
 *
 * The fold is applied to the sample coordinate before the lattice sees it,
 * exactly as station 01 folds before its formula sees the point — so the field
 * underneath is the same field either way and `Off · raw field` is genuinely the
 * unmodified piece rather than a different one.
 *
 * One field, three taps: `fbm` is evaluated ONCE per pixel and then read at
 * three phases. Calling it three times would treble the cost for three copies
 * of the same number.
 */
export function solveNoiseRows(surface: V2Surface, plan: NoisePlan, rows: number): boolean {
  const { size, px } = surface
  const { perm, octaves, scale } = plan
  const [bR, bG, bB] = plan.bands
  const [phR, phG, phB] = plan.phases
  const folds = plan.folds
  const step = folds > 0 ? (Math.PI * 2) / folds : 0
  const half = step / 2

  const end = Math.min(size, surface.solved + Math.max(1, rows))
  for (let j = surface.solved; j < end; j++) {
    const y0 = (j / size) * 2 - 1
    for (let i = 0; i < size; i++) {
      let x = (i / size) * 2 - 1
      let y = y0

      if (folds > 0) {
        const r = Math.sqrt(x * x + y * y)
        let a = Math.atan2(y, x)
        a -= Math.floor(a / step) * step
        if (a > half) a = step - a
        x = Math.cos(a) * r
        y = Math.sin(a) * r
      }

      const v = fbm(perm, x * scale, y * scale, octaves)
      const o = (i + j * size) * 4
      px[o] = (Math.sin(v * bR * Math.PI + phR) + 1) * 127.5
      px[o + 1] = (Math.sin(v * bG * Math.PI + phG) + 1) * 127.5
      px[o + 2] = (Math.sin(v * bB * Math.PI + phB) + 1) * 127.5
      px[o + 3] = 255
    }
  }
  surface.solved = end
  return surface.solved >= size
}

/** Solve the whole surface in one go. For off-screen sizes and for tests. */
export function solveNoiseField(plan: NoisePlan): V2Surface {
  const surface = createNoiseSurface(plan)
  while (!solveNoiseRows(surface, plan, 64)) {
    /* keep going */
  }
  return surface
}

/**
 * A row band sized so one frame's work is roughly constant.
 *
 * A smaller budget than station 01's, and not arbitrarily: one noise tap is a
 * fade curve, four gradient dots and three interpolations, so it costs roughly
 * five to six times what one expression node costs. 450k taps is station 01's
 * ~2.5M node budget divided by that ratio — budgeting them as if they were equal
 * would make a six-octave piece stutter.
 */
export function noiseBandSize(plan: NoisePlan): number {
  const perRow = plan.size * plan.octaves
  return Math.max(1, Math.min(plan.size, Math.round(450_000 / Math.max(1, perRow))))
}

/* ------------------------------------------------------------------ the read */

/**
 * This station's canvas read.
 *
 * The first two rows match its neighbours so the studios read as one family, and
 * everything after them is particular to this method. There are no formula nodes
 * to report and no seed split to report; what there is instead is a lattice, an
 * octave count and a zoom, which are the three things that actually decide what
 * this station paints.
 */
export function readNoise(plan: NoisePlan, progress = 1): ReadRow[] {
  const done = Math.round(plan.pixels * Math.max(0, Math.min(1, progress)))
  return [
    { label: 'Seed hash', value: shortHash(plan.hash) },
    { label: 'Station', value: getV2Station(plan.station)?.name || plan.station },
    {
      label: 'Seed',
      value: plan.seed,
      hint: 'one seed, not split — the whole phrase shuffles the lattice',
    },
    { label: 'Symmetry', value: foldLabel(plan.folds) },
    {
      label: 'Lattice',
      value: `256-entry permutation · LCG ${plan.seedNumber}`,
      hint: 'shuffled from the seed, doubled to 512 for wrapping',
    },
    {
      label: 'Octaves',
      value: `${plan.octaves} · ×${LACUNARITY} freq, ×${GAIN} amp`,
      hint: 'each octave is the same noise, twice as fine and half as strong',
    },
    { label: 'Zoom', value: `${plan.scale.toFixed(2)} cells across` },
    {
      label: 'Noise taps',
      value:
        progress < 1
          ? `${formatCount(Math.round((done * plan.octaves) / 1000))}k / ${formatCount(
              Math.round(plan.work / 1000),
            )}k`
          : `${formatCount(Math.round(plan.work / 1000))}k`,
      hint: 'pixels × octaves — the field is solved once and read three times',
    },
  ]
}

/* ---------------------------------------------------------------- the recipe */

export function noiseRecipeOf(plan: NoisePlan, take: Take) {
  return {
    station: plan.station,
    seed: plan.seed,
    symmetry: plan.folds,
    mode: V2_MODE,
    take,
    size: plan.size,
  }
}

export function noiseAvatarNote(plan: NoisePlan): string {
  const station = getV2Station(plan.station)?.name || plan.station
  return `Card art solved in the CharacterVerse Art Studio V2 — ${station}, seed phrase “${plan.seed}” over a ${plan.octaves}-octave noise lattice, ${foldLabel(plan.folds).toLowerCase()}.`
}

/** Re-exported so callers do not have to know which module owns "off". */
export { FOLDS_OFF }
