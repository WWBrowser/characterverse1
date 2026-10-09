// Art Studio V2, station 04 — the Chimeric Image Genome.
//
// The first station in either studio whose seed is not something you type. You
// hand it pictures. It reduces them to a strand of DNA, and the strand is what
// paints.
//
// WHAT THIS STATION IS, AGAINST THE OTHER THREE
//
//   · station 01 grows three formulas from two words and solves them per pixel;
//   · station 02 shuffles a lattice from one phrase and interpolates gradients;
//   · station 03 throws two thousand embers and composites where they land;
//   · station 04 grows three formulas too — but from a number squeezed out of
//     your images, over a FOUR operator grammar rather than six, with no sine
//     wrap on the way out, and then crystallises, twists, brightens and sharpens
//     the result. Its colour comes from the images themselves.
//
// It is closest to station 01 and deliberately so: the generator it was loaded
// from is a cousin of station 01's, and its operator list — `sin`, `cos`, `mul`,
// `avg`, all with `Math.PI * a` inside the trigonometric two — is the exact
// prefix of station 01's six, in the same order, with the same arities. So this
// station shares station 01's evaluator rather than carrying a second copy of
// it, and only the grammar that grows a program is its own.
//
// WHY THE FOUR OPERATOR SET IS LOAD-BEARING
//
// With terminals in [-1,1], every one of those four operators is a contraction:
// sin and cos land in [-1,1] by definition, and a product or a mean of two
// values in [-1,1] stays in [-1,1]. So the field cannot leave the range, and the
// generator's `(v + 1) * 127.5` needs no sine wrap and no clamp to be safe.
// Station 01 needs its sine precisely because `mod` breaks that property. This is
// why the two stations look different even before a dial is touched: station 01's
// output is always wrapped through a sine, and this one's never is.
//
// THE SEED IS THE WHOLE RECIPE
//
// A studio built on "the seed IS the piece" cannot have a station whose piece
// also depends on six sliders and a file input — a claim on such a piece would
// name something nobody could repaint. So everything is in the seed. The strand
// carries the image sum, the image count, a sixteen-cell colour signature of the
// combined images, and all six dials, base32-encoded into the character set
// `normalizeSeed` allows. Paste a strand into any browser and you get the same
// piece back, with no images and no upload. That is what makes the Combined DNA
// Preview a recipe rather than a progress indicator: it is a render OF the
// strand, so what you see is exactly what was recorded.
//
// WHAT CAME OVER FROM THE GENERATOR
//
//   1. the `Mulberry32` class, as the studio's shared closure — identical draws;
//   2. the multi-image splice: a 20×20 canvas, each image drawn at
//      `globalAlpha = 1 / count`, and after EACH draw the whole canvas summed as
//      `data[j] * (j + 1) * (i + 1)`. Note what that means and is kept: the
//      canvas is read back cumulatively, so image 1's pixels are counted again
//      inside image 2's sum at a different weight. Order matters, and it matters
//      twice;
//   3. `combinedSeed = imageSum + variation` — one integer, seeding one RNG;
//   4. three depth-8 formulas over the four operator grammar, leaf chance 0.2,
//      terminal `rand() > 0.5 ? x : y`, drawn in the generator's order;
//   5. `(v + 1) * 127.5` per channel, with no wrap;
//   6. crystallise: quantise the coordinate to blocks of `105 - slider`;
//   7. twist: rotate the coordinate by `(slider / 10) × radius`;
//   8. neon: `pow(c / 255, 1.2) × 255 × mult`, clamped, and only when
//      `mult > 1` — the guard is the generator's, and it makes 1.0 a genuine
//      bypass rather than a no-op transform.
//
// WHAT WAS ADDED, AND WHY EACH ONE HAD TO BE
//
//   · SHARPEN was a dead control. The generator builds the slider, reads it,
//     prints its value — and never uses it. Implemented here as an unsharp mask,
//     the same way station 03's unimplemented tip was implemented rather than
//     deleted: a control that is visibly present and does nothing is worse than
//     either having it or not.
//   · GRAFT, which is the one genuinely new dial. Without it the images reach
//     the picture through a single integer, which means two unrelated image sets
//     with the same weighted sum paint the identical piece, and — worse — the
//     Combined DNA Preview is not recoverable from the recipe at all. Sixteen
//     colour anchors are carried in the strand and the field is graded through
//     them, so the images actually colour the result. Graft at 0 turns this off
//     completely and reproduces the generator's own output.
//   · RESOLUTION INDEPENDENCE. The generator crystallises in pixels of its own
//     500px canvas, so ported literally the blocks would shrink as the canvas
//     grew and the 1440px print would be a different piece from the 720px
//     screen. The quantiser is expressed as a fraction of the frame instead,
//     which is identical arithmetic at 500px and exact at every other size.
//   · THE FOLD, as everywhere in V2, and applied FIRST — before crystallising
//     and before twisting. Everything after the fold is "the field", so folding
//     ahead of all of it is what keeps V2's rule literally true, and it is also
//     what makes the block grid and the colour grade mirror with the rest of the
//     picture instead of lying across it.

import {
  formatCount,
  normalizeSeed,
  seedHash,
  shortHash,
  type ReadRow,
  type Take,
} from './art.js'
import {
  ARITY,
  OP_OFFSET,
  OP_X,
  OP_Y,
  getV2Station,
  foldLabel,
  hashWord,
  hslToRgb,
  mulberry32,
  normalizeFolds,
  solveProgram,
  type V2Spec,
  type V2StationId,
  type V2Surface,
} from './artv2.js'

/* ------------------------------------------------------------- the constants */

/** The generator's canvas, and the unit every one of its pixel lengths is in. */
export const REF_SIZE = 500
/** The generator's DNA thumbnail — 20×20, and the resolution the sum is taken at. */
export const THUMB = 20
/** The colour signature carried in the strand: a GRID×GRID lattice of anchors. */
export const GRID = 4
/** The generator's tree depth. Station 01's is 12; this is not that station. */
export const DNA_DEPTH = 8
/** The generator's early-stop probability. Station 01's is 0.1. */
export const DNA_LEAF_CHANCE = 0.2
/**
 * How many of `OPERATORS` this station's grammar may draw from.
 *
 * Four: `sin`, `cos`, `mul`, `avg`. The generator's `fns` array is that list, in
 * that order, and it is `OPERATORS`' exact prefix — which is the whole reason
 * `solveProgram` can be shared. Growing past 4 here would silently give this
 * station station 01's `abs` and `mod` and break the range guarantee that lets
 * the colour mapping skip its sine.
 */
export const DNA_OPS = 4

/** Every dial: its range, and what it is called. Drives the panel and the codec. */
export const DNA_DIALS = [
  {
    key: 'variation',
    label: 'Variation',
    min: 1,
    max: 1000,
    step: 1,
    bits: 10,
    /** How the value is shown next to its slider. */
    format: (v: number) => String(v),
    hint: 'Added to the image sum before the formulas are grown. The pictures pick the neighbourhood; this picks the house.',
  },
  {
    key: 'crystal',
    label: 'Crystallize',
    min: 5,
    max: 100,
    step: 1,
    bits: 7,
    format: (v: number) => (v >= 100 ? '5px blocks' : `${105 - v}px blocks`),
    hint: 'Quantises the coordinate into blocks before the formula sees it. Counter-intuitively, higher is finer — the generator sets its block size to 105 minus this, and that arithmetic is kept.',
  },
  {
    key: 'twist',
    label: 'Twist',
    min: 0,
    max: 100,
    step: 1,
    bits: 7,
    format: (v: number) => (v === 0 ? 'off' : `${(v / 10).toFixed(1)} rad at the rim`),
    hint: 'Rotates the coordinate by an angle proportional to its distance from the centre, so the middle stays put and the edges shear.',
  },
  {
    key: 'neon',
    label: 'Neon',
    min: 10,
    max: 100,
    step: 1,
    bits: 7,
    format: (v: number) => (v === 10 ? 'off · ×1.0' : `×${(v / 10).toFixed(1)}`),
    hint: 'A gamma of 1.2 and then a gain. The one dial in V2 that can clip a highlight to white — deliberately, and recorded in the strand, so a blown-out piece is a piece you chose rather than an exposure you were shown.',
  },
  {
    key: 'sharpen',
    label: 'Sharpen',
    min: 0,
    max: 100,
    step: 1,
    bits: 7,
    format: (v: number) => (v === 0 ? 'off' : `${v}% unsharp`),
    hint: 'An unsharp mask over the finished field. The generator ships this slider and never reads it; here it does what it says.',
  },
  {
    key: 'graft',
    label: 'Graft',
    min: 0,
    max: 100,
    step: 1,
    bits: 7,
    format: (v: number) => (v === 0 ? 'off · formula only' : `${v}% from the images`),
    hint: "How much of the colour comes from the images rather than from the formulas. At 0 this station paints exactly what the generator paints; above 0 the field is graded through the strand's sixteen anchors.",
  },
] as const

export type DnaDialKey = (typeof DNA_DIALS)[number]['key']

/* ----------------------------------------------------------------- the genome */

export type Genome = {
  /** The generator's `imageSeedValue`, folded to unsigned 32 bits. */
  sum: number
  /** How many images were spliced. 0 means the strand was synthesised from a phrase. */
  images: number
  /**
   * The colour signature: GRID×GRID RGB triples, row-major, 0..255.
   *
   * Always a multiple of 17 — sixteen levels per channel, which is what fits in
   * a strand. Snapped at construction rather than on the way into the codec,
   * which is the difference between an honest preview and a nearly honest one:
   * quantise late and the Combined DNA Preview shows colours a few levels away
   * from the ones actually recorded, and the piece shifts under you the moment
   * you copy the strand out and paste it back. Snapped early, encoding is
   * lossless and the preview is exact. The test suite checks that a spliced
   * genome and its strand paint byte-identical fields.
   */
  anchors: Uint8Array
  variation: number
  crystal: number
  twist: number
  neon: number
  sharpen: number
  graft: number
}

/** The dials a strand starts life with. The generator's own slider defaults. */
export const DNA_DEFAULTS: Record<DnaDialKey, number> = {
  variation: 1,
  crystal: 100,
  twist: 0,
  neon: 10,
  sharpen: 0,
  // The one departure from the generator's defaults, because the generator has
  // no such dial. Set high enough that the station's own character — images
  // colouring a formula field — is what you see when you arrive, rather than
  // something you have to go looking for.
  graft: 55,
}

function clampDial(key: DnaDialKey, v: number): number {
  const dial = DNA_DIALS.find((d) => d.key === key)!
  if (!Number.isFinite(v)) return DNA_DEFAULTS[key]
  return Math.max(dial.min, Math.min(dial.max, Math.round(v)))
}

/* ------------------------------------------------------------------ the codec */

/**
 * The strand alphabet.
 *
 * Base32 rather than the base64 the payload would prefer, because `normalizeSeed`
 * lowercases the phrase and strips everything outside `a-z0-9`, space, apostrophe
 * and hyphen. A base64 strand would arrive at the kernel with its case flattened
 * and its `_` and `+` replaced by spaces — decodable only by luck. These 32
 * characters survive normalization untouched, which is worth nine extra
 * characters of strand.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const STRAND_PREFIX = 'dna1-'

/** Total bits a strand carries: the header, the dials, then the anchors. */
const HEADER_BITS = 32 + 4
const DIAL_BITS = DNA_DIALS.reduce((n, d) => n + d.bits, 0)
const ANCHOR_BITS = GRID * GRID * 3 * 4
const STRAND_BITS = HEADER_BITS + DIAL_BITS + ANCHOR_BITS
const STRAND_CHARS = Math.ceil(STRAND_BITS / 5)

class BitWriter {
  private bits: number[] = []
  push(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i--) this.bits.push((value >>> i) & 1)
  }
  toBase32(): string {
    let out = ''
    for (let i = 0; i < this.bits.length; i += 5) {
      let v = 0
      for (let k = 0; k < 5; k++) v = (v << 1) | (this.bits[i + k] ?? 0)
      out += ALPHABET[v]
    }
    return out
  }
}

class BitReader {
  private bits: number[] = []
  private at = 0
  constructor(base32: string) {
    for (const ch of base32) {
      const v = ALPHABET.indexOf(ch)
      if (v < 0) throw new Error('bad strand character')
      for (let i = 4; i >= 0; i--) this.bits.push((v >>> i) & 1)
    }
  }
  take(width: number): number {
    if (this.at + width > this.bits.length) throw new Error('strand too short')
    let v = 0
    for (let i = 0; i < width; i++) v = v * 2 + this.bits[this.at++]
    return v
  }
}

/** 0..255 down to 4 bits. 17 × 15 = 255, so black and white are both exact. */
const quant4 = (v: number) => Math.max(0, Math.min(15, Math.round(v / 17)))

/**
 * Snap a colour signature onto the sixteen levels a strand can hold.
 *
 * Every genome goes through this before anything paints or previews it, so what
 * you see is what gets written down. See `Genome.anchors`.
 */
export function snapAnchors(anchors: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(GRID * GRID * 3)
  for (let i = 0; i < out.length; i++) out[i] = quant4(anchors[i] ?? 0) * 17
  return out
}

export function encodeStrand(g: Genome): string {
  const w = new BitWriter()
  w.push(g.sum >>> 0, 32)
  w.push(Math.max(0, Math.min(15, g.images)), 4)
  for (const d of DNA_DIALS) w.push(clampDial(d.key, g[d.key]) - d.min, d.bits)
  for (let i = 0; i < GRID * GRID * 3; i++) w.push(quant4(g.anchors[i] ?? 0), 4)
  // `quant4` here is idempotent: the anchors arrived snapped, so this re-derives
  // the same nibble rather than losing anything. Kept as a belt on the braces.
  return STRAND_PREFIX + w.toBase32()
}

/** Parse a strand. Returns null for anything that is not one — including a phrase. */
export function decodeStrand(text: string): Genome | null {
  const s = String(text || '').trim().toLowerCase()
  if (!s.startsWith(STRAND_PREFIX)) return null
  const body = s.slice(STRAND_PREFIX.length)
  if (body.length < STRAND_CHARS) return null
  try {
    const r = new BitReader(body.slice(0, STRAND_CHARS))
    const sum = r.take(32) >>> 0
    const images = r.take(4)
    const dials = {} as Record<DnaDialKey, number>
    for (const d of DNA_DIALS) dials[d.key] = d.min + r.take(d.bits)
    const anchors = new Uint8Array(GRID * GRID * 3)
    for (let i = 0; i < anchors.length; i++) anchors[i] = r.take(4) * 17
    return {
      sum,
      images,
      anchors,
      variation: clampDial('variation', dials.variation),
      crystal: clampDial('crystal', dials.crystal),
      twist: clampDial('twist', dials.twist),
      neon: clampDial('neon', dials.neon),
      sharpen: clampDial('sharpen', dials.sharpen),
      graft: clampDial('graft', dials.graft),
    }
  } catch {
    return null
  }
}

/**
 * Synthesise a genome from a phrase.
 *
 * So that the station is never a dead end: it has to paint something on first
 * load, the dice have to work, ArtisticClaw's phrases have to land somewhere,
 * and a hand-typed word should give a piece rather than an error. A phrase makes
 * a synthetic genome — the sum is the phrase's own hash and the sixteen anchors
 * are drawn as one coherent hue window rather than as confetti, so it reads as a
 * plausible set of images instead of noise. `images: 0` records that no picture
 * was ever involved, and the read says so.
 */
export function genomeFromPhrase(phrase: string): Genome {
  const seed = normalizeSeed(phrase) || 'default1'
  const rand = mulberry32(hashWord(seed))
  const hueBase = rand() * 360
  const hueSpan = 60 + rand() * 240
  const anchors = new Uint8Array(GRID * GRID * 3)
  const rgb: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < GRID * GRID; i++) {
    // Lightness deliberately kept in the upper half. These anchors are a SURFACE
    // that the field modulates, so a dark anchor is darkened again by the field
    // and the piece comes out murky — a rendered ladder of synthetic genomes at
    // the old 0.24 floor was a wall of near-identical teal. Saturation is held
    // high for the same reason: modulation cannot add chroma back.
    hslToRgb(hueBase + hueSpan * rand(), 0.55 + rand() * 0.45, 0.38 + rand() * 0.5, rgb)
    anchors[i * 3] = Math.round(rgb[0] * 255)
    anchors[i * 3 + 1] = Math.round(rgb[1] * 255)
    anchors[i * 3 + 2] = Math.round(rgb[2] * 255)
  }
  return { sum: hashWord(seed) >>> 0, images: 0, anchors: snapAnchors(anchors), ...DNA_DEFAULTS }
}

/** A strand if the seed is one, a synthetic genome from the phrase if it is not. */
export function genomeOf(seed: string): Genome {
  return decodeStrand(seed) ?? genomeFromPhrase(seed)
}

/** A genome with one dial moved, ready to be encoded back into a seed. */
export function withDial(g: Genome, key: DnaDialKey, value: number): Genome {
  return { ...g, [key]: clampDial(key, value) }
}

/* ---------------------------------------------------------------- the splice */

/**
 * The generator's index-weighted sum, over one read of the thumbnail canvas.
 *
 * `rgba` is the whole 20×20 RGBA buffer as `getImageData` returns it, and `index`
 * is which image was just drawn — both terms of `data[j] * (j + 1) * (i + 1)`.
 * Alpha is included, because the generator includes it: it walks `data.length`,
 * not the colour channels. That is not incidental here — the images are layered
 * at `1 / count` alpha onto a cleared canvas, so the canvas is genuinely
 * translucent and its alpha bytes carry how many images have landed.
 */
export function weightedSum(rgba: Uint8Array | Uint8ClampedArray, index: number): number {
  let sum = 0
  for (let j = 0; j < rgba.length; j++) sum += rgba[j] * (j + 1) * (index + 1)
  return sum
}

/**
 * The sixteen anchors, averaged out of the finished thumbnail.
 *
 * Composited over black on the way, because the thumbnail is translucent — the
 * generator draws each image at `1 / count` alpha and never flattens it — and
 * black is what the canvas underneath the finished piece actually is.
 */
export function anchorsFromThumb(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const anchors = new Uint8Array(GRID * GRID * 3)
  const cell = THUMB / GRID
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let y = Math.floor(gy * cell); y < Math.floor((gy + 1) * cell); y++) {
        for (let x = Math.floor(gx * cell); x < Math.floor((gx + 1) * cell); x++) {
          const o = (x + y * THUMB) * 4
          const a = rgba[o + 3] / 255
          r += rgba[o] * a
          g += rgba[o + 1] * a
          b += rgba[o + 2] * a
          n++
        }
      }
      const o = (gx + gy * GRID) * 3
      anchors[o] = Math.round(r / Math.max(1, n))
      anchors[o + 1] = Math.round(g / Math.max(1, n))
      anchors[o + 2] = Math.round(b / Math.max(1, n))
    }
  }
  return snapAnchors(anchors)
}

/**
 * The anchors, bilinearly sampled at a point in the unit square.
 *
 * The same function the field grades through and the same function the Combined
 * DNA Preview draws, which is the point: the preview is not an impression of the
 * recipe, it is a render of it at a different size.
 */
export function sampleAnchors(
  anchors: Uint8Array,
  u: number,
  v: number,
  out: [number, number, number],
): void {
  const fx = Math.max(0, Math.min(1, u)) * (GRID - 1)
  const fy = Math.max(0, Math.min(1, v)) * (GRID - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(GRID - 1, x0 + 1)
  const y1 = Math.min(GRID - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  for (let c = 0; c < 3; c++) {
    const a = anchors[(x0 + y0 * GRID) * 3 + c]
    const b = anchors[(x1 + y0 * GRID) * 3 + c]
    const d = anchors[(x0 + y1 * GRID) * 3 + c]
    const e = anchors[(x1 + y1 * GRID) * 3 + c]
    out[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty
  }
}

/* ------------------------------------------------------------------ the plan */

/**
 * Grow one channel's formula as a postfix program.
 *
 * The generator's own grammar: stop at depth 0 or on a `rand() < 0.2`, terminals
 * chosen by `rand() > 0.5`, otherwise an operator index off a four-entry list
 * and then one subtree per argument. The draw order is the generator's exactly —
 * leaf test, terminal pick or operator index, then the arguments in turn — which
 * is what makes the tree the same tree. Emitted flat, children before their
 * operator, so solving a pixel is a walk over a typed array; that is the same
 * arithmetic in a faster shape, and it is why `solveProgram` can be shared.
 */
function growDnaProgram(rand: () => number, depth: number, out: number[]): void {
  if (depth <= 0 || rand() < DNA_LEAF_CHANCE) {
    out.push(rand() > 0.5 ? OP_X : OP_Y)
    return
  }
  const op = Math.floor(rand() * DNA_OPS)
  for (let i = 0; i < ARITY[op]; i++) growDnaProgram(rand, depth - 1, out)
  out.push(OP_OFFSET + op)
}

export type DnaPlan = {
  station: V2StationId
  /** The normalized seed — a strand, or the phrase a strand was synthesised from. */
  seed: string
  hash: string
  genome: Genome
  /** True when the seed was a strand rather than a phrase. */
  strand: boolean
  folds: number
  size: number
  /** The three channel programs, R then G then B. */
  programs: Int32Array[]
  nodes: number[]
  /**
   * Block edge in pixels of THIS frame — `(105 - crystal) × size / 500`.
   *
   * Fractional at any size that is not a multiple of 500, and deliberately not
   * rounded: rounding it would make a 720px screen and a 1440px print
   * crystallise on slightly different grids, and the whole point of holding it
   * as a ratio is that they do not.
   */
  stepPx: number
  /** Radians of rotation per unit of radius. */
  twistRate: number
  /** The neon gain, as a multiplier. 1 means the transform is bypassed entirely. */
  neonMult: number
  /** Unsharp amount, 0 to 2. 0 means no second pass and no raw buffer. */
  sharpenAmount: number
  /** How much of the colour is graded through the anchors, 0 to 1. */
  graftMix: number
  pixels: number
  work: number
}

export function planDna(spec: V2Spec): DnaPlan {
  const seed = normalizeSeed(spec.seed)
  const decoded = decodeStrand(seed)
  const genome = decoded ?? genomeFromPhrase(seed)
  const size = Math.max(16, Math.min(4096, Math.round(spec.size)))
  const folds = normalizeFolds(spec.folds)

  // One integer, one stream, three trees — the generator's whole structural
  // input. `sum + variation` is its `combinedSeed`; the fold to 32 bits on the
  // way into the strand changes nothing, because every step of Mulberry32 is
  // taken modulo 2³² anyway.
  const rand = mulberry32((genome.sum + genome.variation) | 0)
  const programs = [0, 1, 2].map(() => {
    const out: number[] = []
    growDnaProgram(rand, DNA_DEPTH, out)
    return Int32Array.from(out)
  })
  const nodes = programs.map((p) => p.length)
  const pixels = size * size

  return {
    station: spec.station,
    seed,
    hash: seedHash(seed),
    genome,
    strand: decoded !== null,
    folds,
    size,
    programs,
    nodes,
    // `105 - slider` pixels of a 500px canvas, rescaled to this frame. At 500
    // this is exactly the generator's own integer, so the quantiser below is
    // bit-identical to it; at every other size it is the same fraction of the
    // frame, which is what keeps the print and the screen the same piece.
    stepPx: ((105 - genome.crystal) * size) / REF_SIZE,
    twistRate: genome.twist / 10,
    neonMult: genome.neon / 10,
    sharpenAmount: (genome.sharpen / 100) * 2,
    graftMix: genome.graft / 100,
    pixels,
    work: pixels * nodes.reduce((a, b) => a + b, 0),
  }
}

/* --------------------------------------------------------------- the solving */

/**
 * `raw` is allocated only when Sharpen is on.
 *
 * An unsharp mask needs a pixel's neighbours, so the field has to exist before it
 * can be sharpened. With the dial at 0 — the generator's default — there is no
 * second pass, no second buffer and nothing to pay for.
 */
export function createDnaSurface(plan: DnaPlan): V2Surface {
  const px = new Uint8ClampedArray(plan.size * plan.size * 4)
  const surface: V2Surface = { size: plan.size, px, solved: 0 }
  if (plan.sharpenAmount > 0) surface.raw = new Uint8ClampedArray(px.length)
  return surface
}

/** One pixel of the field, before sharpening. Writes three bytes into `target`. */
function shadePixel(plan: DnaPlan, target: Uint8ClampedArray, o: number, i: number, j: number, stack: Float64Array, dna: [number, number, number]): void {
  const { size, stepPx, twistRate, neonMult, graftMix, folds } = plan
  const [pr, pg, pb] = plan.programs

  // Carried in PIXELS of this frame, not in [-1,1], all the way to the
  // quantiser. That is not a stylistic choice: `(i / size) * 2 - 1` and back is
  // not an exact round trip in binary floating point, so quantising a
  // normalized coordinate puts the occasional block boundary one pixel away
  // from where the generator puts it. Held as pixels, `i` is still exactly `i`
  // when the fold is off, `stepPx` is exactly the generator's integer at 500px,
  // and the quantiser below is the generator's line character for character.
  let px = i
  let py = j
  const mid = size / 2

  // The fold first, so that everything downstream of it — the block grid, the
  // twist, the colour grade — is mirrored along with the field rather than laid
  // across it. V2's rule is that the field is asked about a folded point; here
  // "the field" is all four of those steps together. Folding in pixel units is
  // the same fold: it is a rotation and a reflection about the centre, and both
  // commute with a uniform scale.
  if (folds > 0) {
    const step = (Math.PI * 2) / folds
    const half = step / 2
    const dx = px - mid
    const dy = py - mid
    const r = Math.sqrt(dx * dx + dy * dy)
    let a = Math.atan2(dy, dx)
    a -= Math.floor(a / step) * step
    if (a > half) a = step - a
    px = mid + Math.cos(a) * r
    py = mid + Math.sin(a) * r
  }

  // Where the colour is graded from — taken here, after the fold but before the
  // block quantiser, so the grade is smooth across a block instead of flat.
  if (graftMix > 0) sampleAnchors(plan.genome.anchors, px / size, py / size, dna)

  if (stepPx > 0) {
    px = Math.floor(px / stepPx) * stepPx
    py = Math.floor(py / stepPx) * stepPx
  }

  let x = (px / size) * 2 - 1
  let y = (py / size) * 2 - 1

  if (twistRate !== 0) {
    const angle = twistRate * Math.sqrt(x * x + y * y)
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const nx = x * c - y * s
    y = x * s + y * c
    x = nx
  }

  // No sine wrap: four contracting operators over terminals in [-1,1] cannot
  // leave [-1,1], so this is already the full range. See the header.
  let r = (solveProgram(pr, stack, x, y) + 1) * 127.5
  let g = (solveProgram(pg, stack, x, y) + 1) * 127.5
  let b = (solveProgram(pb, stack, x, y) + 1) * 127.5

  // The generator's guard, kept: at exactly ×1.0 the transform is skipped, so
  // the gamma is not silently applied to every piece that never touched the dial.
  if (neonMult > 1) {
    r = Math.min(255, Math.pow(r / 255, 1.2) * 255 * neonMult)
    g = Math.min(255, Math.pow(g / 255, 1.2) * 255 * neonMult)
    b = Math.min(255, Math.pow(b / 255, 1.2) * 255 * neonMult)
  }

  if (graftMix > 0) {
    // Modulation, and nothing cleverer: the field becomes the LIGHT and the
    // images become the SURFACE it falls on. At a full-strength pixel the anchor
    // colour comes through exactly; below that it falls off toward black.
    //
    // The first version of this doubled — `min(255, 2 × t × dna)` — so that a
    // mid-grey field pixel would land exactly on the anchor colour. It was
    // rejected after looking at a rendered grid of it, which is the only way this
    // was ever going to be caught: doubling clips every highlight against a
    // bright anchor, and a whole grid of pieces came out high-key pastel with the
    // palette collapsed to a wash. Plain modulation cannot clip at all, darkens
    // the frame by about half, and gives back the saturation the doubling ate.
    const inv = 1 - graftMix
    r = r * inv + (r / 255) * dna[0] * graftMix
    g = g * inv + (g / 255) * dna[1] * graftMix
    b = b * inv + (b / 255) * dna[2] * graftMix
  }

  target[o] = r
  target[o + 1] = g
  target[o + 2] = b
  target[o + 3] = 255
}

/**
 * Sharpen rows `[from, to)` of `raw` into `px`.
 *
 * A 3×3 unsharp mask: the pixel plus `amount` times its difference from a box
 * blur of its neighbours. Edges clamp to themselves. A row on the leading edge of
 * a band reads a row that has not been solved yet, so the caller starts one row
 * back on the next band and that row is simply recomputed — cheaper than
 * carrying a cursor for it, and correct because the source rows never change
 * once solved.
 */
function sharpenRows(surface: V2Surface, amount: number, from: number, to: number): void {
  const { size, px } = surface
  const raw = surface.raw!
  for (let j = from; j < to; j++) {
    for (let i = 0; i < size; i++) {
      const o = (i + j * size) * 4
      for (let c = 0; c < 3; c++) {
        let acc = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.max(0, Math.min(size - 1, j + dy))
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.max(0, Math.min(size - 1, i + dx))
            acc += raw[(xx + yy * size) * 4 + c]
          }
        }
        const here = raw[o + c]
        px[o + c] = here + amount * (here - acc / 9)
      }
      px[o + 3] = 255
    }
  }
}

/** Solve the next band of rows. Returns true once the surface is finished. */
export function solveDnaRows(surface: V2Surface, plan: DnaPlan, rows: number): boolean {
  const { size } = surface
  const target = surface.raw ?? surface.px
  const stack = new Float64Array(DNA_DEPTH * 4 + 16)
  const dna: [number, number, number] = [0, 0, 0]

  const from = surface.solved
  const to = Math.min(size, from + Math.max(1, rows))
  for (let j = from; j < to; j++) {
    for (let i = 0; i < size; i++) {
      shadePixel(plan, target, (i + j * size) * 4, i, j, stack, dna)
    }
  }
  surface.solved = to

  if (surface.raw) sharpenRows(surface, plan.sharpenAmount, Math.max(0, from - 1), to)
  return surface.solved >= size
}

/** Solve the whole surface in one go. For off-screen sizes and for tests. */
export function solveDnaField(plan: DnaPlan): V2Surface {
  const surface = createDnaSurface(plan)
  while (!solveDnaRows(surface, plan, 64)) {
    /* keep going */
  }
  return surface
}

/**
 * A band sized so one frame's work is roughly constant.
 *
 * Same budget as station 01, halved when Sharpen is on: a sharpened row costs a
 * second pass of twenty-seven taps on top of solving the field, and a band that
 * ignored that would stutter exactly when the dial was turned up.
 */
export function dnaBandSize(plan: DnaPlan): number {
  const perRow = plan.size * plan.nodes.reduce((a, b) => a + b, 0)
  const budget = plan.sharpenAmount > 0 ? 1_250_000 : 2_500_000
  return Math.max(1, Math.min(plan.size, Math.round(budget / Math.max(1, perRow))))
}

/* ------------------------------------------------------------------ the read */

/** What the strand's origin should be called under the canvas. */
export function genomeLabel(plan: DnaPlan): string {
  const { images } = plan.genome
  if (images > 0) return `${images} image${images === 1 ? '' : 's'} spliced`
  return plan.strand ? 'strand, no images' : 'synthesised from a phrase'
}

/**
 * Station 04's canvas read.
 *
 * Shares its first two rows with every station and its `Symmetry` row with the
 * rest of V2. After that it reports what only this station has: where the genome
 * came from, the shape of the formulas grown out of it, and the four shaping
 * dials that stand between the formula and the pixel. There is no seed split row
 * because there is no seed split — the whole strand is one input.
 */
export function readDna(plan: DnaPlan, progress = 1): ReadRow[] {
  const g = plan.genome
  const done = Math.round(plan.pixels * Math.max(0, Math.min(1, progress)))
  const total = plan.nodes.reduce((a, b) => a + b, 0)
  return [
    { label: 'Seed hash', value: shortHash(plan.hash) },
    { label: 'Station', value: getV2Station(plan.station)?.name || plan.station },
    {
      label: 'Genome',
      value: genomeLabel(plan),
      hint: `sum ${(g.sum >>> 0).toString(16).padStart(8, '0')} · variation ${g.variation} · ${GRID * GRID} colour anchors`,
    },
    { label: 'Symmetry', value: foldLabel(plan.folds) },
    {
      label: 'Formula',
      value: `${formatCount(total)} nodes · depth ${DNA_DEPTH}`,
      hint: `${plan.nodes.join(' / ')} per channel · four operators, no sine wrap`,
    },
    {
      label: 'Crystal',
      value: `${(105 - g.crystal).toFixed(0)}px blocks`,
      hint: `${plan.stepPx.toFixed(2)}px at this size · ${((plan.stepPx / plan.size) * 100).toFixed(2)}% of the frame, held as a ratio so every size crystallises alike`,
    },
    {
      label: 'Shaping',
      value: `twist ${plan.twistRate.toFixed(1)} · neon ×${plan.neonMult.toFixed(1)} · sharpen ${g.sharpen}%`,
      hint: plan.neonMult > 1 ? 'neon is above 1, so highlights can clip' : 'neon at 1 bypasses the gain entirely',
    },
    {
      label: 'Graft',
      value: g.graft > 0 ? `${g.graft}% from the images` : 'off · formula only',
      hint:
        g.graft > 0
          ? "the field is the light, the strand's sixteen anchors are the surface"
          : 'the generator’s own colour, straight out of the three formulas',
    },
    {
      label: 'Pixels solved',
      value: `${formatCount(done)} of ${formatCount(plan.pixels)}`,
      hint: `${formatCount(plan.work)} node evaluations for the full field`,
    },
  ]
}

/* ---------------------------------------------------------- recipe and notes */

export function dnaRecipeOf(plan: DnaPlan, take: Take) {
  return {
    station: plan.station,
    seed: plan.seed,
    symmetry: plan.folds,
    mode: 'direct' as const,
    take,
    size: plan.size,
  }
}

export function dnaAvatarNote(plan: DnaPlan): string {
  return `${getV2Station(plan.station)?.name} — ${genomeLabel(plan)}, ${formatCount(
    plan.nodes.reduce((a, b) => a + b, 0),
  )} formula nodes, ${foldLabel(plan.folds).toLowerCase()}.`
}

/** Everything the codec round-trips, in one object, for the port tests. */
export const DNA_CONSTANTS = {
  REF_SIZE,
  THUMB,
  GRID,
  DNA_DEPTH,
  DNA_LEAF_CHANCE,
  DNA_OPS,
  STRAND_PREFIX,
  STRAND_CHARS,
  STRAND_BITS,
  ALPHABET,
}
