// The Art Studio kernel — Station 01, Symmetric Harmonic Flow.
//
// Everything a piece is lives in this file: a seed phrase goes in, a field of
// traced particle paths comes out, and that one field is resolved into pixels
// two different ways. The module is deliberately client-safe and
// dependency-free — no imports, no DOM, no `Math.random` — so the same code
// paints the on-screen canvas, the downloaded PNG, the 512px avatar handed to
// the Create page, and the numeric assertions that keep it honest.
//
// Three properties are load-bearing, and each one is a property of the code
// rather than a claim about it:
//
//   1. DETERMINISM. Every number a piece needs is derived from a hash of its
//      seed phrase. There is no randomness anywhere, so the same phrase always
//      paints the same artwork and a piece is shareable by naming its words.
//
//   2. ONE FIELD, TWO RESOLUTIONS. `traceField` deposits light into a float
//      accumulation buffer. `resolve` turns that buffer into bytes, and the
//      render mode only changes how the buffer's magnitudes are mapped onto the
//      0–255 rail. Flipping the toggle therefore repaints the *identical*
//      artwork — the geometry, the hues and the lit footprint are all untouched
//      because they were computed once, before the mode was consulted.
//
//   3. CONSTANT DENSITY ACROSS SIZES. Path integration runs for a fixed amount
//      of field time regardless of resolution, so a particle's trajectory is one
//      curve sampled more finely at larger sizes. Particle count is then solved
//      so that traced points per pixel stays put. The piece approved on screen
//      is the piece that comes out of the print.
//
// The white washout this fixes was real. Summing light on light means that
// wherever many paths cross — exactly where the interesting structure is — the
// channels each climb past 1.0 independently and all clamp to 255 together.
// Structure becomes a white hole. `fixed` keeps the hue direction of the
// accumulated light and compresses only its magnitude, so dense areas travel
// toward their own colour instead of toward white.

/* ------------------------------------------------------------------ stations */

export type StationId = 'harmonic' | 'vortex' | 'tidal' | 'lattice'

/**
 * What a station puts on its card. Shared across studios so one card component
 * renders any station from any of them.
 */
export type StationCard = {
  id: string
  /** Two-digit number shown on the card. */
  ordinal: string
  name: string
  blurb: string
  /** False for a station that is announced but not yet painting. */
  live: boolean
}

export type Station = StationCard & { id: StationId }

/**
 * One row of the strip under the canvas — the canvas read.
 *
 * This is a contract, not a fixed set of fields, because stations that paint by
 * different methods have different things worth reporting. A particle tracer
 * reports particles, steps and points; a formula field has none of those and
 * reports the shape of its formula instead. So each station declares its own
 * rows and no two stations read the same.
 */
export type ReadRow = {
  label: string
  value: string
  /** Optional second line, for a unit or a gloss. */
  hint?: string
}

// The studio is a collection with one station open, not a single toy. The two
// upcoming stations are listed rather than hidden so the shape of the collection
// is visible from the first visit.
export const STATIONS: Station[] = [
  {
    id: 'harmonic',
    ordinal: '01',
    name: 'Symmetric Harmonic Flow',
    blurb:
      'Thousands of particles traced through rotational wave equations into a stable, kaleidoscopic field.',
    live: true,
  },
  {
    id: 'vortex',
    ordinal: '02',
    name: 'Vortex Harmonic Drift',
    blurb:
      'The same harmonic field, advected in the plane instead of in polar — with a rigid swirl, seeded turbulence, and colour taken from each particle’s direction of travel.',
    live: true,
  },
  {
    id: 'tidal',
    ordinal: '03',
    name: 'Tidal Interference',
    blurb: 'Upcoming station — a different way of painting entirely.',
    live: false,
  },
  {
    id: 'lattice',
    ordinal: '04',
    name: 'Crystal Lattice Bloom',
    blurb: 'Upcoming station — a different way of painting entirely.',
    live: false,
  },
]

export function getStation(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id)
}

export function isStationId(id: string): id is StationId {
  return STATIONS.some((s) => s.id === id)
}

/* -------------------------------------------------------------- render modes */

export type RenderMode = 'fixed' | 'original'

export type RenderModeMeta = {
  id: RenderMode
  label: string
  /** What this mode does to the light, in one sentence. */
  blurb: string
}

export const RENDER_MODES: RenderModeMeta[] = [
  {
    id: 'fixed',
    label: 'Fixed · true colour',
    blurb:
      'Dense areas blend toward their own hue, so colour stays rich and the piece never washes out to white.',
  },
  {
    id: 'original',
    label: 'Original · additive glow',
    blurb:
      'The original drawing method: light sums on light, so the densest structure adds past white and bleaches out.',
  },
]

export const DEFAULT_MODE: RenderMode = 'fixed'

export function isRenderMode(id: string): id is RenderMode {
  return id === 'fixed' || id === 'original'
}

export function modeLabel(id: string): string {
  return RENDER_MODES.find((m) => m.id === id)?.label || RENDER_MODES[0].label
}

/* ----------------------------------------------------------------- symmetry */

/** How many times the traced field is folded around its centre. */
export const SYMMETRY_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16] as const

export const DEFAULT_SYMMETRY = 6

export function normalizeSymmetry(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_SYMMETRY
  let best = SYMMETRY_OPTIONS[0] as number
  for (const opt of SYMMETRY_OPTIONS) if (Math.abs(opt - v) < Math.abs(best - v)) best = opt
  return best
}

/* --------------------------------------------------------------- seed & hash */

const TAU = Math.PI * 2

/** FNV-1a. The same tiny stable hash the rest of the platform mints ids with. */
function fnv1a(str: string, offset = 0x811c9dc5): number {
  let h = offset >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic PRNG. Seeded from the phrase; never from the clock. */
function mulberry32(a: number): () => number {
  let t = a >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** Seed phrases compare on their words, not their whitespace or their case. */
export function normalizeSeed(phrase: string): string {
  return String(phrase ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The piece's identity, shown under the canvas. Sixteen hex characters so two
 * different phrases collide about as often as never.
 */
export function seedHash(phrase: string): string {
  const s = normalizeSeed(phrase)
  const a = fnv1a(s)
  const b = fnv1a(`${s}::harmonic`, 0x01000193)
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`
}

// A small vivid lexicon for the reroll button. Sensory rather than abstract —
// "opal shatter refract" paints; "concept system value" does not.
const LEXICON = [
  'opal', 'shatter', 'refract', 'nacre', 'shimmer', 'drift', 'prism', 'split',
  'echo', 'bloom', 'ember', 'frost', 'tide', 'lantern', 'obsidian', 'gilded',
  'velvet', 'copper', 'saffron', 'indigo', 'cinder', 'quartz', 'moth', 'vapour',
  'glass', 'break', 'scatter', 'light', 'unfold', 'breathe', 'float', 'fracture',
  'monsoon', 'aurora', 'basalt', 'lichen', 'salt', 'wake', 'hush', 'thrum',
  'kelp', 'antler', 'foxglove', 'static', 'solder', 'plume', 'gossamer', 'ferrous',
  'tallow', 'wren', 'undertow', 'spindle', 'radiant', 'coil', 'murmur', 'silt',
]

/**
 * Roll a seed phrase. Entropy is a parameter rather than a call to
 * `Math.random`, so this module stays pure and the caller decides where the
 * randomness comes from (a click handler, never a render).
 */
export function rollSeedPhrase(entropy: number): string {
  const rand = mulberry32(fnv1a(`roll:${Math.floor(entropy)}`))
  const words: string[] = []
  while (words.length < 3) {
    const w = LEXICON[Math.floor(rand() * LEXICON.length) % LEXICON.length]
    if (!words.includes(w)) words.push(w)
  }
  return words.join(' ')
}

/* ------------------------------------------------------------ field parameters */

/**
 * The flow field, derived whole from the seed.
 *
 * Every particle in a piece moves through ONE field — the wave numbers and
 * phases below are per-piece, not per-particle. That is what makes a piece read
 * as a single coherent structure rather than as a few thousand unrelated
 * squiggles.
 */
export type FieldParams = {
  /** Radial and angular velocity amplitudes. */
  ampR: number
  ampA: number
  /** Wave numbers: how many oscillations across the radius / around the turn. */
  waveR: number
  waveA: number
  /** Cross-coupling — the term that turns concentric rings into flow. */
  twistR: number
  twistA: number
  phaseR: number
  phaseA: number
  /** Outward bias, so paths sweep rather than orbit forever. */
  drift: number
  /** Palette. Hue in turns (0–1), spread across particles, drift along a path. */
  hue: number
  hueSpread: number
  hueDrift: number
  sat: number
  /** How much ink one point of density is worth. */
  exposure: number
  /** Particle and step counts at the reference size. */
  particles: number
  steps: number
  /** Field time one path is integrated for. Fixed per seed, size-independent. */
  span: number
}

/** Reference resolution. Counts below are quoted at this size and scale from it. */
export const REF_SIZE = 720

export function fieldParams(seed: string): FieldParams {
  const s = normalizeSeed(seed)
  const rand = mulberry32(fnv1a(`field:${s}`))
  const pick = (lo: number, hi: number) => lo + rand() * (hi - lo)
  const int = (lo: number, hi: number) => Math.round(pick(lo, hi))

  return {
    ampR: pick(0.16, 0.42),
    ampA: pick(0.9, 2.6),
    waveR: int(1, 5),
    waveA: int(1, 4),
    twistR: pick(0.6, 3.2),
    twistA: pick(0.4, 2.4),
    phaseR: pick(0, TAU),
    phaseA: pick(0, TAU),
    drift: pick(-0.06, 0.1),
    hue: rand(),
    hueSpread: pick(0.03, 0.15),
    hueDrift: pick(-0.12, 0.12),
    sat: pick(0.62, 0.95),
    exposure: pick(0.048, 0.06),
    particles: int(1600, 2900),
    steps: int(140, 230),
    span: pick(2.4, 4.6),
  }
}

/* --------------------------------------------------------------------- plan */

export type ArtSpec = {
  station: StationId
  seed: string
  symmetry: number
  /** Square edge in pixels. */
  size: number
}

export type TracePlan = {
  station: StationId
  seed: string
  hash: string
  symmetry: number
  size: number
  params: FieldParams
  /** Particles traced at this size. */
  particles: number
  /** Integration steps per particle at this size. */
  steps: number
  /** Copies each traced point is folded into: a rotation and its mirror. */
  folds: number
  /** Total points deposited: particles × steps × folds. */
  points: number
  /** Traced points per pixel. Held constant across sizes. */
  density: number
  /** Accumulation → light multiplier. Derived from density, so exposure matches. */
  gain: number
}

/**
 * Solve the counts for one render.
 *
 * `steps` scales with the linear dimension so points land about a pixel apart
 * along a path, and `particles` is then solved from the target density rather
 * than scaled independently — which is what pins points-per-pixel down instead
 * of letting two roundings drift apart.
 */
export function planTrace(spec: ArtSpec): TracePlan {
  const seed = normalizeSeed(spec.seed)
  const params = fieldParams(seed)
  const symmetry = normalizeSymmetry(spec.symmetry)
  const size = Math.max(32, Math.round(spec.size))
  const folds = symmetry * 2

  const scale = size / REF_SIZE
  const steps = Math.max(8, Math.round(params.steps * scale))

  // The density this seed paints at, fixed at the reference size.
  const target = (params.particles * params.steps * folds) / (REF_SIZE * REF_SIZE)
  const particles = Math.max(1, Math.round((target * size * size) / (steps * folds)))

  const points = particles * steps * folds
  const density = points / (size * size)

  return {
    station: spec.station,
    seed,
    hash: seedHash(seed),
    symmetry,
    size,
    params,
    particles,
    steps,
    folds,
    points,
    density,
    gain: params.exposure / Math.max(1e-6, density),
  }
}

/* -------------------------------------------------------------------- colour */

/** Hue in turns (wrapped), saturation and value in 0–1 → linear rgb triple. */
export function hsvToRgb(h: number, s: number, v: number, out: [number, number, number]): void {
  const hh = ((h % 1) + 1) % 1
  const i = Math.floor(hh * 6)
  const f = hh * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - s * f)
  const t = v * (1 - s * (1 - f))
  switch (i % 6) {
    case 0: out[0] = v; out[1] = t; out[2] = p; break
    case 1: out[0] = q; out[1] = v; out[2] = p; break
    case 2: out[0] = p; out[1] = v; out[2] = t; break
    case 3: out[0] = p; out[1] = q; out[2] = v; break
    case 4: out[0] = t; out[1] = p; out[2] = v; break
    default: out[0] = v; out[1] = p; out[2] = q; break
  }
}

/** Six swatches off a seed's palette, for the seed panel. */
export function palette(seed: string, n = 6): string[] {
  const p = fieldParams(seed)
  const rgb: [number, number, number] = [0, 0, 0]
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    hsvToRgb(p.hue + p.hueSpread * (t - 0.5) * 2, p.sat, 0.55 + 0.4 * t, rgb)
    out.push(
      `#${rgb
        .map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0'))
        .join('')}`,
    )
  }
  return out
}

/* --------------------------------------------------------------------- field */

/**
 * The traced field: raw accumulated light, three floats per pixel, before any
 * decision about how to resolve it into bytes has been made.
 *
 * This is the object both render modes read. It is the reason the toggle is a
 * genuine before-and-after of one piece: there is only ever one piece in
 * memory, and the mode is applied on the way out.
 */
export type Field = {
  size: number
  acc: Float32Array
  /** Particles traced so far, out of plan.particles. */
  traced: number
  /** Points deposited so far. */
  deposited: number
}

/**
 * Allocate an empty field.
 *
 * Takes `{ size }` rather than a whole `TracePlan` because V1 now has two live
 * stations whose plans share almost nothing. Both accumulate into this same
 * float buffer, which is what keeps `resolve`'s two exposures — and the
 * measurement that backs the studio's claim about them — true of every station
 * rather than of one.
 */
export function createField(plan: { size: number }): Field {
  return {
    size: plan.size,
    acc: new Float32Array(plan.size * plan.size * 3),
    traced: 0,
    deposited: 0,
  }
}

/**
 * Trace up to `count` more particles into the field.
 *
 * Chunked on purpose: the browser paints the piece as you watch, a few hundred
 * particles per frame, so a 1440px print does not lock the tab. Returns true
 * once every particle in the plan has been traced.
 */
export function traceParticles(field: Field, plan: TracePlan, count: number): boolean {
  const { params, symmetry, steps, size } = plan
  const acc = field.acc
  const half = size / 2
  const rgb: [number, number, number] = [0, 0, 0]
  const dt = params.span / steps
  const rotStep = TAU / symmetry
  const cosStep = Math.cos(rotStep)
  const sinStep = Math.sin(rotStep)

  const end = Math.min(plan.particles, field.traced + Math.max(1, count))

  for (let p = field.traced; p < end; p++) {
    // Per-particle state comes from (seed, index) alone, so the particle set at
    // a small size is a prefix of the set at a large one — more samples of the
    // same field, never a different field.
    const rand = mulberry32(fnv1a(`p:${plan.seed}:${p}`))
    let r = 0.1 + Math.sqrt(rand()) * 0.86
    let a = rand() * rotStep
    // Hue follows where the path lives in the field (plus a little jitter), so
    // neighbouring paths share a colour and their overlap stays saturated.
    const hueSeat = (r - 0.1) / 0.86 * 0.8 + rand() * 0.2

    for (let s = 0; s < steps; s++) {
      const t = s / steps

      // Rotational wave equations. The angular term is multiplied by the fold
      // count so the field itself is symmetric under the fold, which is what
      // makes the kaleidoscope lock into place instead of merely repeating.
      const dr =
        params.ampR *
          Math.sin(params.waveA * symmetry * a + params.twistR * r * TAU + params.phaseR) +
        params.drift
      const da =
        (params.ampA *
          Math.cos(params.waveR * r * TAU + params.twistA * symmetry * a + params.phaseA)) /
        (0.42 + r)

      r += dr * dt
      a += da * dt

      // Reflect at the rim and at the centre rather than clipping, so paths
      // stay inside the disc and keep their arc length.
      if (r > 0.98) { r = 1.96 - r }
      if (r < 0.08) { r = 0.16 - r }
      if (r > 0.98 || r < 0.08) r = 0.5

      hsvToRgb(params.hue + params.hueSpread * (hueSeat - 0.5) * 2 + params.hueDrift * t, params.sat, 1, rgb)

      // Fold: one rotation per symmetry order, each with its mirror. Both
      // copies are advanced by rotating the unit vector rather than calling
      // sin/cos per fold — the same points, a good deal cheaper.
      let cx = Math.cos(a)
      let cy = Math.sin(a)
      for (let k = 0; k < symmetry; k++) {
        splat(acc, size, half + cx * r * half, half + cy * r * half, rgb)
        splat(acc, size, half + cx * r * half, half - cy * r * half, rgb)
        const nx = cx * cosStep - cy * sinStep
        cy = cx * sinStep + cy * cosStep
        cx = nx
      }
      field.deposited += symmetry * 2
    }
  }

  field.traced = end
  return field.traced >= plan.particles
}

/**
 * Bilinear deposit. Sub-pixel positions spread across the four pixels they touch.
 *
 * Exported because it is the studio's deposit, not station 01's: any tracer that
 * puts light into a `Field` has to put it down the same way, or the two stations
 * would be measured against different definitions of a traced pixel.
 */
export function splat(acc: Float32Array, size: number, x: number, y: number, rgb: [number, number, number]): void {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 + 1 >= size || y0 + 1 >= size) return
  const fx = x - x0
  const fy = y - y0
  const w00 = (1 - fx) * (1 - fy)
  const w10 = fx * (1 - fy)
  const w01 = (1 - fx) * fy
  const w11 = fx * fy
  const i00 = (y0 * size + x0) * 3
  const i10 = i00 + 3
  const i01 = i00 + size * 3
  const i11 = i01 + 3
  for (let c = 0; c < 3; c++) {
    const v = rgb[c]
    acc[i00 + c] += v * w00
    acc[i10 + c] += v * w10
    acc[i01 + c] += v * w01
    acc[i11 + c] += v * w11
  }
}

/** Trace a whole field in one call. Used off the main thread of thought — tests. */
export function traceField(plan: TracePlan): Field {
  const field = createField(plan)
  while (!traceParticles(field, plan, 512));
  return field
}

/* ------------------------------------------------------------------ resolve */

/**
 * The soft knee the fixed mode compresses through.
 *
 * Below the knee the two modes are byte-for-byte identical: sparse and
 * mid-density light was never in danger, so it is left exactly where the
 * original put it. Above the knee the magnitude rolls off toward a ceiling that
 * is strictly under 1.0 — which is what makes "clips nothing" a property of the
 * code rather than a hope: no channel can reach 255, so no pixel can reach pure
 * white, so no structure can be lost to a white hole.
 *
 * The curve is C¹ at the knee (its slope there is exactly 1), so there is no
 * visible seam where the compression starts.
 */
const FIXED_KNEE = 0.55
const FIXED_CEILING = 0.96
const FIXED_ROLL = FIXED_CEILING - FIXED_KNEE

/**
 * Accumulation happens in linear light, so the buffer has to be gamma-encoded on
 * the way to the screen. This is the display transfer function, not a look: it
 * is applied identically in both modes, which is why it cannot be the thing that
 * makes them differ.
 */
function encode(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

/**
 * A traced pixel is never rendered as background. Both modes floor a positive
 * accumulation at byte 1, so the set of lit pixels is a property of the traced
 * field alone and is provably identical between the two modes.
 */
function toByte(v: number): number {
  if (v <= 0) return 0
  const b = Math.round(encode(v > 1 ? 1 : v) * 255)
  return b < 1 ? 1 : b > 255 ? 255 : b
}

/**
 * Resolve the traced field into RGBA bytes.
 *
 * Both branches read the same `field.acc`. Neither touches geometry, hue
 * assignment, or which pixels were traced — so the two modes are two exposures
 * of one negative, not two photographs.
 *
 *   original — each channel is scaled and clamped independently. Where paths
 *              pile up, all three channels pass 1.0 and clamp together: pure
 *              white, and the structure underneath is gone.
 *
 *   fixed    — the accumulated light is split into a direction (its hue) and a
 *              magnitude. Only the magnitude is compressed, through
 *              m/(1+m) — so density climbs toward the pixel's own colour at
 *              full strength and never toward white.
 */
export function resolve(field: Field, plan: { gain: number }, mode: RenderMode): Uint8ClampedArray {
  const n = field.size * field.size
  const out = new Uint8ClampedArray(n * 4)
  const acc = field.acc
  const gain = plan.gain
  const original = mode === 'original'

  for (let i = 0; i < n; i++) {
    const j = i * 3
    const r = acc[j] * gain
    const g = acc[j + 1] * gain
    const b = acc[j + 2] * gain
    const o = i * 4
    out[o + 3] = 255
    if (r <= 0 && g <= 0 && b <= 0) continue

    if (original) {
      out[o] = toByte(r)
      out[o + 1] = toByte(g)
      out[o + 2] = toByte(b)
    } else {
      const m = r > g ? (r > b ? r : b) : g > b ? g : b
      // Split the accumulated light into a direction (its hue) and a magnitude,
      // then compress only the magnitude. k ≤ 1 always, so the fixed mode is a
      // strict compression of the same light and can never invent brightness.
      const k =
        m <= FIXED_KNEE
          ? 1
          : (FIXED_KNEE + FIXED_ROLL * (1 - Math.exp(-(m - FIXED_KNEE) / FIXED_ROLL))) / m
      out[o] = toByte(r * k)
      out[o + 1] = toByte(g * k)
      out[o + 2] = toByte(b * k)
    }
  }
  return out
}

/* ------------------------------------------------------------------ measure */

/**
 * What the two modes actually do to a piece, in numbers.
 *
 * This exists because "it washes out" is an opinion until it is counted. The
 * studio's claim about itself is checked against these figures rather than
 * against a screenshot.
 */
export type Measurement = {
  /** Pixels carrying any traced light at all. Identical between modes. */
  litPx: number
  /** Pixels clipped to pure white — structure destroyed. */
  whitePx: number
  /** Pixels whose brightest channel is at least half strength. */
  brightPx: number
  /** Bright pixels that have lost their colour (saturation under WASHED). */
  washedPx: number
  /** Mean saturation across bright pixels, 0–1. */
  meanSat: number
}

// A pixel at half strength or more is a bright pixel; a bright pixel that has
// lost nearly all its colour is a washed one.
const BRIGHT = 128
const WASHED = 0.15

export function measure(px: Uint8ClampedArray): Measurement {
  let litPx = 0
  let whitePx = 0
  let brightPx = 0
  let washedPx = 0
  let satSum = 0

  for (let o = 0; o < px.length; o += 4) {
    const r = px[o]
    const g = px[o + 1]
    const b = px[o + 2]
    if (r === 0 && g === 0 && b === 0) continue
    litPx++
    const max = r > g ? (r > b ? r : b) : g > b ? g : b
    const min = r < g ? (r < b ? r : b) : g < b ? g : b
    if (r === 255 && g === 255 && b === 255) whitePx++
    if (max >= BRIGHT) {
      brightPx++
      const sat = (max - min) / max
      satSum += sat
      if (sat < WASHED) washedPx++
    }
  }

  return {
    litPx,
    whitePx,
    brightPx,
    washedPx,
    meanSat: brightPx > 0 ? satSum / brightPx : 0,
  }
}

/* --------------------------------------------------------------- formatting */

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** Points traced, in thousands — the figure under the canvas. */
export function formatPoints(n: number): string {
  return `${Math.round(n / 1000).toLocaleString('en-US')}k`
}

export function shortHash(hash: string): string {
  return hash.slice(0, 12)
}

/* ------------------------------------------------------------------ the take */

/**
 * What a creator took a piece away as. Only these three actions count as
 * committing to a piece — turning dials is not one of them, which is why idle
 * exploration feeds the collective nothing.
 */
export const TAKES = ['avatar', 'download', 'pour'] as const
export type Take = (typeof TAKES)[number]

export const TAKE_LABEL: Record<Take, string> = {
  avatar: 'taken as a character avatar',
  download: 'downloaded as a PNG',
  pour: 'poured into the Codex on purpose',
}

export function isTake(v: unknown): v is Take {
  return typeof v === 'string' && (TAKES as readonly string[]).includes(v)
}

/**
 * The re-paintable recipe. This — not a blob of pixels — is what a committed
 * piece is recorded as: a station, a phrase, a fold count and a light
 * resolution is enough to paint the piece again from nothing.
 */
export type Recipe = {
  /** A station id from any studio — see `src/lib/art-registry.ts`. */
  station: string
  seed: string
  /** Fold count, or 0 for a station whose symmetry can be switched off. */
  symmetry: number
  /** A render mode belonging to that station's studio. */
  mode: string
  take: Take
  size: number
}

export function recipeOf(plan: TracePlan, mode: RenderMode, take: Take): Recipe {
  return {
    station: plan.station,
    seed: plan.seed,
    symmetry: plan.symmetry,
    mode,
    take,
    size: plan.size,
  }
}

/**
 * This station's canvas read.
 *
 * A particle tracer's report: what was traced, how finely, and how many points
 * went down. Station 01 of V2 solves a formula instead and reports something
 * else entirely — see `readV2`. Same strip, different rows, on purpose.
 */
export function readTrace(plan: TracePlan, progress = 1): ReadRow[] {
  const p = Math.max(0, Math.min(1, progress))
  return [
    { label: 'Seed hash', value: shortHash(plan.hash) },
    { label: 'Station', value: getStation(plan.station)?.name || plan.station },
    { label: 'Symmetry', value: `${plan.symmetry}-fold` },
    {
      label: 'Trace',
      value: `${formatCount(plan.particles)} particles × ${formatCount(plan.steps)} steps`,
    },
    {
      label: 'Points traced',
      value: p < 1 ? `${formatPoints(plan.points * p)} / ${formatPoints(plan.points)}` : formatPoints(plan.points),
    },
  ]
}

/* --------------------------------------------------------- avatar & download */

/** The 512px square the Create page receives as a card image and avatar. */
export const AVATAR_SIZE = 512

/** The print. Big enough to hang, small enough that a laptop finishes it. */
export const PRINT_SIZE = 1440

/** The on-screen buffer. Everything above the canvas is CSS scaling. */
export const SCREEN_SIZE = 720

/** The hand-off the Create page picks up out of the page, with no database in between. */
export type AvatarHandoff = {
  /** A PNG data URL, ready to drop into the avatar field. */
  dataUrl: string
  recipe: Recipe
  hash: string
  /** The seed note recorded on the character. */
  note: string
}

export const HANDOFF_KEY = 'cv_art_avatar'

export function avatarNote(plan: TracePlan, mode: RenderMode): string {
  const station = getStation(plan.station)?.name || plan.station
  return `Card art painted in the CharacterVerse Art Studio — ${station}, seed phrase “${plan.seed}”, ${plan.symmetry}-fold symmetry, ${modeLabel(mode)}.`
}
