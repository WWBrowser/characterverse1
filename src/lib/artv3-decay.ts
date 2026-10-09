// Station 01 of Art Studio V3 — the Neural Decay Corruption Engine.
//
// Two phases, and the second one reads the first.
//
//   PHASE 1 · CONSTRUCT. A palette of six colours is derived from one hue: black,
//     white, that hue and its two triadic partners at full saturation, and one
//     muted dark. Then twenty to fifty elements are thrown down over a black
//     field — rectangles, discs, three-to-six-vertex polygons and runs of
//     garbled ASCII — each in one of the six colours and each composited through
//     one of five blend modes picked at random. Nothing is arranged. The
//     composition is what the blend stack happens to make of a pile of shapes.
//
//   PHASE 2 · DESTROY. One pass walks the finished frame:
//     · every row is displaced sideways by a tear offset that mostly persists,
//       occasionally jumps a quarter of the frame, and always has a per-row sine
//       wobble added — with the wobble's frequency AND amplitude drawn fresh for
//       each row, so it is not a coherent wave but a stagger;
//     · the red and blue channels are read from a different column than green,
//       so every edge splits into fringes;
//     · any pixel brighter than a threshold starts a MELT: the pixel below it
//       stops reading the source and instead copies the pixel above it in the
//       OUTPUT buffer, with one unit taken off green. A melt therefore drags a
//       bright pixel downward, shifting magenta as it goes, and compounding the
//       0.7 scanline factor every third row, so a long melt fades to black;
//     · finally a whole-frame pass XORs a random byte into each channel of a
//       small random fraction of pixels.
//
// FIDELITY, EXACTLY. The RNG, the string hash, the palette arithmetic, the draw
// ORDER and every number fed to it, and the whole of phase 2 are a faithful port
// of the standalone generator this station was loaded from — including three
// things that look like bugs and are not being fixed, because they are what the
// piece looks like:
//
//   · `for (p = 0; p < rng.int(3, 6); p++)` re-evaluates the bound every
//     iteration, so a polygon has 3 to 6 vertices with a fresh die roll deciding
//     each time whether to stop. The glyph-run length is written the same way.
//     Both are ported call-for-call, so the stream advances identically.
//   · the melt reads `newData`, the buffer being written, one row up. It is
//     genuine feedback and it is the signature of the station.
//   · whether the RNG is drawn once or twice for a pixel depends on that pixel's
//     BRIGHTNESS, so the stream after the first row depends on the picture. This
//     is why the piece is defined on a fixed grid: see `DECAY_REF`.
//
// What is NOT ported is the rasterizer. The original drew through canvas
// `globalCompositeOperation` and `fillText` in a system monospace font, and
// neither is reproducible across machines — and because phase 2 reads phase 1's
// pixels to decide where to melt, a one-unit difference in a glyph edge grows
// into a different corruption. So the shapes, the blends and the type are
// rasterized here: hard-edged coverage by pixel centre, the five blend modes as
// their separable arithmetic, and a built-in 3x5 bitmap font. The plan is the
// original's to the last digit; the pixels are the studio's own. A seed paints
// the same piece on every machine, which the original never did.

import { formatCount, seedHash, shortHash, type ReadRow, type Take } from './art.js'
import {
  DECAY_REF,
  V3_MODE,
  magnify,
  normalizeDecay,
  paletteSwatches,
  decayBoardLabel,
  type V3Spec,
  type V3Surface,
} from './artv3.js'
import { normalizeSeed } from './art.js'

/* ---------------------------------------------------------------- the random */

/**
 * Mulberry32, and the four helpers the generator declares on top of it.
 *
 * A closure rather than the original's class, which changes nothing: `next` is
 * the same arithmetic on the same accumulator, so the sequence is identical.
 * `range`, `int` and `chance` are kept as separate methods rather than inlined
 * because the number of `next()` calls each one makes is part of the piece.
 */
export type DecayRng = {
  next: () => number
  range: (min: number, max: number) => number
  int: (min: number, max: number) => number
  chance: (p: number) => boolean
}

export function decayRng(seed: number): DecayRng {
  let s = seed | 0
  const next = () => {
    let t = (s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const range = (min: number, max: number) => min + next() * (max - min)
  return {
    next,
    range,
    int: (min: number, max: number) => Math.floor(range(min, max + 1)),
    chance: (p: number) => next() < p,
  }
}

/**
 * The generator's own string hash — FNV-1a, 32-bit.
 *
 * The same constants the studio's `fnv1a` uses, which is a coincidence worth
 * naming rather than a shared function: this one is the seed of the piece's RNG
 * and must keep the original's arithmetic forever, while the studio's is the
 * identity of a claim. Wiring one to the other would let a change to either
 * repaint every piece in the other's studio.
 */
export function decayHash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/* -------------------------------------------------------------- the palette */

export type Rgb = [number, number, number]

/** The generator's HSL conversion, degrees in, rounded bytes out. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  h /= 360
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = l
    g = l
    b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * Six colours: pure black, pure white, a hue and its two triadic partners at
 * full chroma, and one dark muted accident.
 *
 * The black is not decoration — it is what the field is cleared to, and it is
 * also the colour the melt compounds down towards, so the piece has one colour
 * that means "nothing was received here".
 */
export function decayPalette(rng: DecayRng): Rgb[] {
  const baseHue = rng.range(0, 360)
  return [
    [0, 0, 0],
    [255, 255, 255],
    hslToRgb(baseHue % 360, 0.9, 0.5),
    hslToRgb((baseHue + 120) % 360, 0.9, 0.5),
    hslToRgb((baseHue + 240) % 360, 0.9, 0.5),
    hslToRgb(rng.range(0, 360), 0.5, 0.2),
  ]
}

/* ---------------------------------------------------------------- the blends */

export type BlendId = 'source-over' | 'screen' | 'difference' | 'exclusion' | 'overlay'

/** In the generator's own order — the index comes off the RNG, so it is fixed. */
export const BLEND_MODES: BlendId[] = ['source-over', 'screen', 'difference', 'exclusion', 'overlay']

/**
 * The five blend modes as arithmetic on two opaque bytes.
 *
 * These are the separable formulae CSS and PDF define, which is what canvas
 * implements — written out here because the composition has to be computed the
 * same way on every machine. Both operands are opaque (the field is cleared to
 * black and nothing is ever drawn with alpha), so the composite step collapses
 * to the blend itself and there is no premultiplication to get wrong.
 */
function blendChannel(mode: BlendId, s: number, b: number): number {
  switch (mode) {
    case 'screen':
      return s + b - (s * b) / 255
    case 'difference':
      return Math.abs(s - b)
    case 'exclusion':
      return s + b - (2 * s * b) / 255
    case 'overlay':
      // overlay(backdrop, source) is hard-light with the operands swapped.
      return b <= 127.5 ? (2 * s * b) / 255 : 255 - (2 * (255 - s) * (255 - b)) / 255
    default:
      return s
  }
}

/* ------------------------------------------------------------------ the font */

/**
 * A 3x5 bitmap font, because the original's `fillText` was not reproducible.
 *
 * Deliberately tiny and deliberately hard-edged: the glyph runs in this station
 * are not text to be read, they are typographic texture — five to twenty random
 * printable characters at ten to a hundred pixels, thrown at a coordinate that
 * is usually partly off-frame. A 3x5 cell scaled up by block replication reads
 * as corrupted terminal type, which is what the piece wants, and it fits in one
 * reviewable table.
 *
 * Lowercase shares the uppercase shapes. At three pixels wide there is no
 * x-height to draw with, so inventing one would be inventing detail; the
 * original's monospace lowercase is simply not recoverable and this says so
 * instead of pretending.
 */
const GLYPHS: Record<string, string> = {
  '!': '.X./.X./.X./.../.X.',
  '"': 'X.X/X.X/.../.../...',
  '#': 'X.X/XXX/X.X/XXX/X.X',
  $: 'XXX/XX./.X./.XX/XXX',
  '%': 'X.X/..X/.X./X../X.X',
  '&': '.X./X.X/.X./X.X/.XX',
  "'": '.X./.X./.../.../...',
  '(': '..X/.X./.X./.X./..X',
  ')': 'X../.X./.X./.X./X..',
  '*': 'X.X/.X./X.X/.../...',
  '+': '.../.X./XXX/.X./...',
  ',': '.../.../.../.X./X..',
  '-': '.../.../XXX/.../...',
  '.': '.../.../.../.../.X.',
  '/': '..X/..X/.X./X../X..',
  '0': 'XXX/X.X/X.X/X.X/XXX',
  '1': '.X./XX./.X./.X./XXX',
  '2': 'XXX/..X/XXX/X../XXX',
  '3': 'XXX/..X/XXX/..X/XXX',
  '4': 'X.X/X.X/XXX/..X/..X',
  '5': 'XXX/X../XXX/..X/XXX',
  '6': 'XXX/X../XXX/X.X/XXX',
  '7': 'XXX/..X/..X/..X/..X',
  '8': 'XXX/X.X/XXX/X.X/XXX',
  '9': 'XXX/X.X/XXX/..X/XXX',
  ':': '.../.X./.../.X./...',
  ';': '.../.X./.../.X./X..',
  '<': '..X/.X./X../.X./..X',
  '=': '.../XXX/.../XXX/...',
  '>': 'X../.X./..X/.X./X..',
  '?': 'XXX/..X/.XX/.../.X.',
  '@': 'XXX/X.X/XXX/XX./.XX',
  A: '.X./X.X/XXX/X.X/X.X',
  B: 'XX./X.X/XX./X.X/XX.',
  C: '.XX/X../X../X../.XX',
  D: 'XX./X.X/X.X/X.X/XX.',
  E: 'XXX/X../XX./X../XXX',
  F: 'XXX/X../XX./X../X..',
  G: '.XX/X../X.X/X.X/.XX',
  H: 'X.X/X.X/XXX/X.X/X.X',
  I: 'XXX/.X./.X./.X./XXX',
  J: '.XX/..X/..X/X.X/XX.',
  K: 'X.X/X.X/XX./X.X/X.X',
  L: 'X../X../X../X../XXX',
  M: 'X.X/XXX/XXX/X.X/X.X',
  N: 'X.X/XX./XXX/.XX/X.X',
  O: '.X./X.X/X.X/X.X/.X.',
  P: 'XXX/X.X/XXX/X../X..',
  Q: 'XXX/X.X/XXX/..X/..X',
  R: 'XXX/X.X/XX./X.X/X.X',
  S: '.XX/X../.X./..X/XX.',
  T: 'XXX/.X./.X./.X./.X.',
  U: 'X.X/X.X/X.X/X.X/XXX',
  V: 'X.X/X.X/X.X/X.X/.X.',
  W: 'X.X/X.X/XXX/XXX/X.X',
  X: 'X.X/X.X/.X./X.X/X.X',
  Y: 'X.X/X.X/.X./.X./.X.',
  Z: 'XXX/..X/.X./X../XXX',
  '[': 'XX./X../X../X../XX.',
  '\\': 'X../X../.X./..X/..X',
  ']': '.XX/..X/..X/..X/.XX',
  '^': '.X./X.X/.../.../...',
  _: '.../.../.../.../XXX',
  '`': 'X../.X./.../.../...',
  '{': '.XX/.X./XX./.X./.XX',
  '|': '.X./.X./.X./.X./.X.',
  '}': 'XX./.X./.XX/.X./XX.',
  '~': '.../XX./X.X/..X/...',
}

/** char code → 15 bits, row-major, bit 0 = top-left. Built once. */
const GLYPH_BITS = new Uint16Array(128)
for (const [ch, art] of Object.entries(GLYPHS)) {
  let bits = 0
  const rows = art.split('/')
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (rows[r][c] === 'X') bits |= 1 << (r * 3 + c)
  GLYPH_BITS[ch.charCodeAt(0)] = bits
  const lower = ch.toLowerCase()
  if (lower !== ch) GLYPH_BITS[lower.charCodeAt(0)] = bits
}

/* ------------------------------------------------------------------ the plan */

export type DecayShape =
  | { kind: 'rect'; blend: BlendId; color: Rgb; x: number; y: number; w: number; h: number }
  | { kind: 'disc'; blend: BlendId; color: Rgb; cx: number; cy: number; r: number }
  | { kind: 'poly'; blend: BlendId; color: Rgb; pts: number[] }
  | { kind: 'glyphs'; blend: BlendId; color: Rgb; x: number; y: number; px: number; text: string }

/**
 * Plan the composition — every draw the original makes, in its order.
 *
 * This is the whole of phase 1 except the pixels. Splitting it out is what makes
 * the port checkable: the plan can be compared digit-for-digit against the
 * original source running under a recording stub, which is exactly what the
 * station's tests do, and the rasterizer is then the only part that is new.
 */
export function planComposition(rng: DecayRng, width: number, height: number, palette: Rgb[]): DecayShape[] {
  const shapes: DecayShape[] = [
    { kind: 'rect', blend: 'source-over', color: palette[0], x: 0, y: 0, w: width, h: height },
  ]

  const numElements = rng.int(20, 50)
  for (let i = 0; i < numElements; i++) {
    const blend = BLEND_MODES[rng.int(0, BLEND_MODES.length - 1)]
    const color = palette[rng.int(1, palette.length - 1)]

    const type = rng.int(0, 3)
    const x = rng.range(-width * 0.2, width * 1.2)
    const y = rng.range(-height * 0.2, height * 1.2)
    const s1 = rng.range(20, width * 0.8)
    const s2 = rng.range(20, height * 0.8)

    if (type === 0) {
      shapes.push({ kind: 'rect', blend, color, x, y, w: s1, h: s2 })
    } else if (type === 1) {
      shapes.push({ kind: 'disc', blend, color, cx: x, cy: y, r: s1 / 2 })
    } else if (type === 2) {
      const pts = [x, y]
      // The bound is re-drawn every iteration, exactly as the original writes it.
      for (let p = 0; p < rng.int(3, 6); p++) pts.push(x + rng.range(-s1, s1), y + rng.range(-s2, s2))
      shapes.push({ kind: 'poly', blend, color, pts })
    } else {
      const px = rng.int(10, 100)
      let text = ''
      for (let c = 0; c < rng.int(5, 20); c++) text += String.fromCharCode(rng.int(33, 126))
      shapes.push({ kind: 'glyphs', blend, color, x, y, px, text })
    }
  }
  return shapes
}

/* ------------------------------------------------------------ the rasterizer */

function put(buf: Uint8ClampedArray, o: number, mode: BlendId, c: Rgb) {
  if (mode === 'source-over') {
    buf[o] = c[0]
    buf[o + 1] = c[1]
    buf[o + 2] = c[2]
  } else {
    buf[o] = blendChannel(mode, c[0], buf[o])
    buf[o + 1] = blendChannel(mode, c[1], buf[o + 1])
    buf[o + 2] = blendChannel(mode, c[2], buf[o + 2])
  }
  buf[o + 3] = 255
}

function spanRow(buf: Uint8ClampedArray, size: number, j: number, xa: number, xb: number, mode: BlendId, c: Rgb) {
  const i0 = Math.max(0, Math.ceil(xa - 0.5))
  const i1 = Math.min(size - 1, Math.ceil(xb - 0.5) - 1)
  const row = j * size
  for (let i = i0; i <= i1; i++) put(buf, (row + i) * 4, mode, c)
}

/**
 * Paint one planned shape into the reference buffer.
 *
 * Coverage is by pixel centre and nothing is antialiased. That is a deviation
 * from canvas and it is the right one here: an antialiased edge is a row of
 * pixels whose value depends on the rasterizer's subpixel arithmetic, and phase
 * 2 reads those values to decide where to melt. Hard edges make the corruption
 * a function of the plan alone.
 */
export function paintShape(buf: Uint8ClampedArray, size: number, shape: DecayShape) {
  if (shape.kind === 'rect') {
    const j0 = Math.max(0, Math.ceil(shape.y - 0.5))
    const j1 = Math.min(size - 1, Math.ceil(shape.y + shape.h - 0.5) - 1)
    for (let j = j0; j <= j1; j++) spanRow(buf, size, j, shape.x, shape.x + shape.w, shape.blend, shape.color)
    return
  }

  if (shape.kind === 'disc') {
    const { cx, cy, r } = shape
    if (r <= 0) return
    const j0 = Math.max(0, Math.ceil(cy - r - 0.5))
    const j1 = Math.min(size - 1, Math.ceil(cy + r - 0.5) - 1)
    const rr = r * r
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy
      const half = Math.sqrt(Math.max(0, rr - dy * dy))
      spanRow(buf, size, j, cx - half, cx + half, shape.blend, shape.color)
    }
    return
  }

  if (shape.kind === 'poly') {
    const pts = shape.pts
    const n = pts.length / 2
    if (n < 3) return
    let lo = Infinity
    let hi = -Infinity
    for (let k = 1; k < pts.length; k += 2) {
      if (pts[k] < lo) lo = pts[k]
      if (pts[k] > hi) hi = pts[k]
    }
    const j0 = Math.max(0, Math.ceil(lo - 0.5))
    const j1 = Math.min(size - 1, Math.ceil(hi - 0.5) - 1)
    const xs: number[] = []
    const ws: number[] = []
    for (let j = j0; j <= j1; j++) {
      const y = j + 0.5
      xs.length = 0
      ws.length = 0
      for (let e = 0; e < n; e++) {
        const ax = pts[e * 2]
        const ay = pts[e * 2 + 1]
        const b = (e + 1) % n
        const bx = pts[b * 2]
        const by = pts[b * 2 + 1]
        let dir = 0
        if (ay <= y && by > y) dir = 1
        else if (by <= y && ay > y) dir = -1
        else continue
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
        ws.push(dir)
      }
      if (xs.length < 2) continue
      // Sort crossings and their winding directions together.
      const order = xs.map((_, k) => k).sort((p, q) => xs[p] - xs[q])
      // Nonzero winding, which is canvas's default fill rule.
      let wind = 0
      let start = 0
      for (const k of order) {
        const before = wind
        wind += ws[k]
        if (before === 0 && wind !== 0) start = xs[k]
        else if (before !== 0 && wind === 0) spanRow(buf, size, j, start, xs[k], shape.blend, shape.color)
      }
    }
    return
  }

  // Glyph run. Monospace metrics approximated: advance 0.6em, ink 0.5em wide and
  // 0.7em tall, baseline at the given y — which is where `fillText` puts it.
  const adv = shape.px * 0.6
  const inkW = shape.px * 0.5
  const inkH = shape.px * 0.7
  for (let c = 0; c < shape.text.length; c++) {
    const bits = GLYPH_BITS[shape.text.charCodeAt(c) & 0x7f]
    if (!bits) continue
    const gx = shape.x + c * adv
    const gy = shape.y - inkH
    const i0 = Math.max(0, Math.ceil(gx - 0.5))
    const i1 = Math.min(size - 1, Math.ceil(gx + inkW - 0.5) - 1)
    const j0 = Math.max(0, Math.ceil(gy - 0.5))
    const j1 = Math.min(size - 1, Math.ceil(gy + inkH - 0.5) - 1)
    if (i1 < i0 || j1 < j0) continue
    for (let j = j0; j <= j1; j++) {
      const gr = Math.min(4, Math.max(0, Math.floor(((j + 0.5 - gy) * 5) / inkH)))
      const row = j * size
      for (let i = i0; i <= i1; i++) {
        const gc = Math.min(2, Math.max(0, Math.floor(((i + 0.5 - gx) * 3) / inkW)))
        if (bits & (1 << (gr * 3 + gc))) put(buf, (row + i) * 4, shape.blend, shape.color)
      }
    }
  }
}

/* --------------------------------------------------------------- the corruption */

/** What one corruption pass did, for the canvas read. */
export type PassStats = {
  meltThreshold: number
  offsetR: number
  offsetB: number
  noiseDensity: number
  /** Rows displaced by more than ten pixels — the visible tears. */
  tornRows: number
  /** The longest melt, in rows. */
  longestMelt: number
}

/**
 * One corruption pass: `src` in, `dst` out. A faithful port, feedback included.
 *
 * `dst` must be a distinct buffer from `src` — the melt reads `dst` one row
 * above while writing the current row, so aliasing them would corrupt the
 * corruption. Both are `Uint8ClampedArray` because the original's were
 * `ImageData`, and the rounding on assignment is part of the arithmetic: the
 * scanline factor writes `r * 0.7`, and whether that lands on 178 or 179 decides
 * what the melt below it copies.
 */
export function glitchPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  rng: DecayRng,
): PassStats {
  const meltThreshold = rng.range(100, 200)
  const rgbOffsetR = rng.int(-20, 20)
  const rgbOffsetB = rng.int(-20, 20)

  const tearOffsets = new Int32Array(height)
  let currentTear = 0
  let tornRows = 0
  for (let y = 0; y < height; y++) {
    if (rng.chance(0.05)) currentTear = rng.int(-width / 4, width / 4)
    else if (rng.chance(0.1)) currentTear = rng.int(-10, 10)
    else if (rng.chance(0.02)) currentTear = 0
    // Both the frequency and the amplitude are drawn INSIDE the loop, so this is
    // a per-row stagger rather than a wave. Two draws per row, in this order.
    tearOffsets[y] = currentTear + Math.sin(y * rng.range(0.01, 0.1)) * rng.range(0, 20)
    if (Math.abs(tearOffsets[y]) > 10) tornRows++
  }

  const meltLengths = new Int32Array(width)
  let longestMelt = 0

  for (let y = 0; y < height; y++) {
    const scanlineFactor = y % 3 === 0 ? 0.7 : 1.0
    for (let x = 0; x < width; x++) {
      let srcX = Math.floor(x + tearOffsets[y])
      if (srcX < 0) srcX = width + (srcX % width)
      if (srcX >= width) srcX = srcX % width

      const idx = (y * width + x) * 4
      const srcIdx = (y * width + srcX) * 4

      // Clamped rather than wrapped, unlike the tear — so the channel split
      // smears against the frame edges instead of wrapping around them.
      const rX = Math.min(width - 1, Math.max(0, srcX + rgbOffsetR))
      const bX = Math.min(width - 1, Math.max(0, srcX + rgbOffsetB))

      let r = src[(y * width + rX) * 4]
      let g = src[srcIdx + 1]
      let b = src[(y * width + bX) * 4 + 2]

      // Drawn from the split channels, before the melt overrides them.
      const brightness = (r + g + b) / 3
      if (brightness > meltThreshold && rng.chance(0.9)) meltLengths[x]++
      else if (rng.chance(0.1)) meltLengths[x] = 0

      if (meltLengths[x] > 0 && y > 0) {
        if (meltLengths[x] > longestMelt) longestMelt = meltLengths[x]
        const aboveIdx = ((y - 1) * width + x) * 4
        r = dst[aboveIdx]
        g = Math.max(0, dst[aboveIdx + 1] - 1)
        b = dst[aboveIdx + 2]
      }

      dst[idx] = r * scanlineFactor
      dst[idx + 1] = g * scanlineFactor
      dst[idx + 2] = b * scanlineFactor
      dst[idx + 3] = 255
    }
  }

  const noiseDensity = rng.range(0.01, 0.05)
  for (let i = 0; i < dst.length; i += 4) {
    if (rng.chance(noiseDensity)) {
      dst[i] ^= rng.int(0, 255)
      dst[i + 1] ^= rng.int(0, 255)
      dst[i + 2] ^= rng.int(0, 255)
    }
  }

  return { meltThreshold, offsetR: rgbOffsetR, offsetB: rgbOffsetB, noiseDensity, tornRows, longestMelt }
}

/* ------------------------------------------------------------------ the plan */

/** How many shapes are rasterized per stage. See `V3Surface` on the schedule. */
const SHAPES_PER_STAGE = 6

export type DecayPlan = {
  station: 'decay'
  seed: string
  hash: string
  decay: number
  size: number
  ref: number
  palette: Rgb[]
  shapes: DecayShape[]
  glyphRuns: number
  glyphChars: number
  /** Which of the five blend modes the composition actually used. */
  blends: BlendId[]
  shapeStages: number
  stages: number
  pixels: number
}

export function planDecay(spec: V3Spec): DecayPlan {
  const seed = normalizeSeed(spec.seed)
  const size = Math.max(16, Math.min(4096, Math.round(spec.size)))
  const decay = normalizeDecay(spec.decay)

  // ONE stream for the whole piece: the palette, then the composition, then every
  // corruption pass in turn. That is the original's order and it is why running
  // the pass a second time corrupts differently from the first.
  const rng = decayRng(decayHash(seed))
  const palette = decayPalette(rng)
  const shapes = planComposition(rng, DECAY_REF, DECAY_REF, palette)

  let glyphRuns = 0
  let glyphChars = 0
  const blends: BlendId[] = []
  for (const s of shapes) {
    if (s.kind === 'glyphs') {
      glyphRuns++
      glyphChars += s.text.length
    }
    if (!blends.includes(s.blend)) blends.push(s.blend)
  }

  const shapeStages = Math.ceil(shapes.length / SHAPES_PER_STAGE)
  return {
    station: 'decay',
    seed,
    hash: seedHash(seed),
    decay,
    size,
    ref: DECAY_REF,
    palette,
    shapes,
    glyphRuns,
    glyphChars,
    blends,
    shapeStages,
    stages: shapeStages + decay,
    pixels: DECAY_REF * DECAY_REF,
  }
}

/* --------------------------------------------------------------- the painting */

export function createDecaySurface(plan: DecayPlan): V3Surface {
  return {
    size: plan.size,
    px: new Uint8ClampedArray(plan.size * plan.size * 4),
    solved: 0,
    ref: new Uint8ClampedArray(plan.ref * plan.ref * 4),
    stage: 0,
    stages: plan.stages,
  }
}

/**
 * Rows per frame, translated into the stage schedule by `solveDecayStages`.
 *
 * Sized so one frame is one stage: a stage is already a chunk of work chosen to
 * be watchable, and subdividing it would only mean magnifying a half-drawn
 * buffer twice.
 */
export function decayBandSize(plan: DecayPlan): number {
  return Math.max(1, Math.ceil(plan.size / plan.stages))
}

/**
 * The pass stats of the pieces painted so far, kept per surface.
 *
 * A `WeakMap` rather than a field on `V3Surface`, because the stats are one
 * station's business and the surface type is the studio's. The read needs them
 * and the page must not have to know they exist.
 */
const PASS_STATS = new WeakMap<V3Surface, PassStats[]>()

export function decayStats(surface: V3Surface): PassStats[] {
  return PASS_STATS.get(surface) || []
}

/**
 * The RNG has to survive across calls, because the whole piece is one stream.
 *
 * Held per surface for the same reason as the stats. It is created lazily on the
 * first stage so that a plan can be made without paying for anything.
 */
const STREAMS = new WeakMap<V3Surface, { rng: DecayRng; scratch: Uint8ClampedArray }>()

/**
 * Advance the stage schedule, then magnify what exists so far.
 *
 * `rows` is the page's band, converted into stages. Returns true once the piece
 * is finished. The magnification is redone from scratch each stage rather than
 * incrementally, because a corruption pass rewrites the whole reference grid —
 * there is no such thing as a finished row until the last pass is done.
 */
export function solveDecayStages(surface: V3Surface, plan: DecayPlan, rows: number): boolean {
  let stream = STREAMS.get(surface)
  if (!stream) {
    // Re-seeded and fast-forwarded past the palette and the plan, so this stream
    // is at exactly the point the original's was when it started drawing.
    const rng = decayRng(decayHash(plan.seed))
    decayPalette(rng)
    planComposition(rng, plan.ref, plan.ref, plan.palette)
    stream = { rng, scratch: new Uint8ClampedArray(plan.ref * plan.ref * 4) }
    STREAMS.set(surface, stream)
    PASS_STATS.set(surface, [])
  }

  const todo = Math.max(1, Math.floor((Math.max(1, rows) * plan.stages) / Math.max(1, plan.size)))
  const target = Math.min(plan.stages, surface.stage + todo)

  while (surface.stage < target) {
    const stage = surface.stage
    if (stage < plan.shapeStages) {
      const from = stage * SHAPES_PER_STAGE
      const to = Math.min(plan.shapes.length, from + SHAPES_PER_STAGE)
      for (let k = from; k < to; k++) paintShape(surface.ref, plan.ref, plan.shapes[k])
    } else {
      // src is the previous generation, dst a distinct buffer — required, see
      // `glitchPass`. They are swapped rather than copied.
      const stats = glitchPass(surface.ref, stream.scratch, plan.ref, plan.ref, stream.rng)
      PASS_STATS.get(surface)?.push(stats)
      const done = stream.scratch
      stream.scratch = surface.ref
      surface.ref = done
    }
    surface.stage = stage + 1
  }

  magnify(surface.ref, plan.ref, surface.px, surface.size, surface.size)
  surface.solved = Math.round((surface.size * surface.stage) / plan.stages)
  return surface.stage >= plan.stages
}

/** Paint the whole piece in one go. For off-screen sizes and for tests. */
export function paintDecay(plan: DecayPlan): V3Surface {
  const surface = createDecaySurface(plan)
  while (!solveDecayStages(surface, plan, plan.size)) {
    /* keep going */
  }
  return surface
}

/* ------------------------------------------------------------------ the read */

export function decaySwatches(plan: DecayPlan, n = 6): string[] {
  return paletteSwatches(plan.palette, n)
}

export function readDecay(plan: DecayPlan, progress: number, stats: PassStats[]): ReadRow[] {
  const first = stats[0]
  const mag = plan.size / plan.ref
  const rows: ReadRow[] = [
    { label: 'Seed hash', value: shortHash(plan.hash) },
    { label: 'Station', value: 'Neural Decay Corruption Engine' },
    {
      label: 'Composition',
      value: `${plan.shapes.length - 1} elements · ${plan.glyphRuns} glyph runs`,
      hint: `${plan.blends.length} of 5 blend modes used · ${formatCount(plan.glyphChars)} characters`,
    },
    {
      label: 'Decay',
      value: decayBoardLabel(plan.decay),
      hint:
        plan.decay > 0
          ? 'Each pass re-corrupts the previous pass’s output'
          : 'The composition as built, before any pass ran',
    },
  ]

  if (first) {
    rows.push(
      {
        label: 'Channel split',
        value: `R ${first.offsetR >= 0 ? '+' : ''}${first.offsetR} · B ${first.offsetB >= 0 ? '+' : ''}${first.offsetB} px`,
        hint: 'Clamped at the edges, so the split smears rather than wraps',
      },
      {
        label: 'Melt threshold',
        value: `${Math.round(first.meltThreshold)} of 255`,
        hint: `Longest melt ${formatCount(first.longestMelt)} rows`,
      },
      {
        label: 'Torn rows',
        value: `${formatCount(first.tornRows)} of ${formatCount(plan.ref)}`,
        hint: 'Displaced more than ten pixels sideways',
      },
      {
        label: 'Noise',
        value: `${(first.noiseDensity * 100).toFixed(2)}% of pixels`,
        hint: 'One random byte XOR-ed into each channel',
      },
    )
  }

  rows.push({
    label: 'Native grid',
    value: `${plan.ref} px · ×${mag.toFixed(2)}`,
    hint:
      mag === 1
        ? 'The grid the piece is defined on'
        : 'Magnified by pixel replication — no colour is invented and none is averaged away',
  })

  rows.push({
    label: 'Painted',
    value: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}% · stage ${Math.min(
      plan.stages,
      Math.round(progress * plan.stages),
    )} of ${plan.stages}`,
    hint: `${plan.shapeStages} building, ${plan.decay} corrupting`,
  })

  return rows
}

export function decayRecipeOf(plan: DecayPlan, take: Take) {
  return {
    station: plan.station,
    seed: plan.seed,
    symmetry: plan.decay,
    mode: V3_MODE,
    take,
    size: plan.size,
  }
}

export function decayAvatarNote(plan: DecayPlan): string {
  return plan.decay > 0
    ? `Corrupted ${plan.decay === 1 ? 'once' : `${plan.decay} times`} from a ${plan.shapes.length - 1}-element composition on a ${plan.ref}px grid.`
    : `The composition as built — ${plan.shapes.length - 1} elements, no corruption pass run, on a ${plan.ref}px grid.`
}
