// Art Studio V2, station 03 — the Ballistic Ember Bloom.
//
// Loaded from a standalone generator that is, algorithmically, the plainest
// thing in either studio: two thousand particles are thrown from one point and
// then left completely alone. There is no field, no force, no curl, no
// attractor and no curve. `x += vx` every step, forever, until the particle's
// life runs out. Every path is a straight line.
//
// That is exactly why it earns a station. Held against what V2 already has —
//
//   station 01  three grown formulas, SOLVED at every pixel
//   station 02  a shuffled permutation lattice, SOLVED at every pixel
//   station 03  two thousand straight rays, COMPOSITED where they were thrown
//
// — it is the first station in this studio whose picture is a record of
// something that moved through the frame rather than an equation evaluated at a
// coordinate. It is also unlike either V1 station, which trace particles through
// wave fields and swirls: those have forces, and this has none at all. A pure
// ballistic burst is not a degenerate version of a vortex. It is a different
// picture, and it is the only one of the five whose geometry is a plain
// similarity transform (see RESOLUTION, below).
//
// ---------------------------------------------------------------- what came over
//
// Verbatim, because these ARE the generator:
//
//   · the string hash — a 32-bit rolling shift, `(h << 5) - h + c`. It is
//     already in this studio as `hashWord`: station 01 was loaded from the same
//     generator family and kept it for the same reason.
//   · Mulberry32, likewise already here, declared there as a class with a
//     mutating `this.seed`. Imported rather than re-typed, so the two stations
//     demonstrably draw from one sequence.
//   · 2000 particles, life 100, birth jittered in a 100-unit square at the
//     centre, velocity `(rand - 0.5) * 3` per axis, hue `rand * 360`, saturation
//     100%, lightness 50%, discs of radius 2.
//   · the step indexing. `update()` runs BEFORE `draw()`, so the first mark a
//     particle makes is at `p0 + v`, not at `p0`, and its alpha is already
//     `99/100` rather than 1. The last step has alpha exactly 0. Off by one in
//     either direction and the ray gains or loses its brightest deposit.
//   · alpha `life / maxLife` — a linear ramp down the ray, which is what makes
//     the burst read as thrown rather than drawn.
//   · SOURCE-OVER compositing, not addition. The generator sets `globalAlpha`
//     and fills; it does not add. This is the single most consequential thing
//     ported, because it is what lets the station keep V2's promise of one light
//     resolution: a weighted average of two bounded colours is bounded, so
//     nothing can bleach and there is no exposure to expose.
//   · STEP-MAJOR order — every particle advances one step, then every particle
//     advances again. Under source-over, order is the picture: later steps are
//     further out and fainter, so they lie over the bright core without erasing
//     it. Particle-major would paint 2000 whole rays one after another and give
//     a completely different image from identical numbers.
//   · the absence of a bounds check. Particles that leave the frame are simply
//     gone; their deposits are dropped rather than reflected or respawned. Both
//     V1 stations do something at their edge. This one does nothing, and some
//     seeds throw embers clean off the canvas.
//
// ------------------------------------------------------------ the tip, honoured
//
// The generator ships this line under its canvas:
//
//     First word controls colors, second word controls flow patterns!
//
// Its code does no such thing. There is one hash of the whole string and one
// RNG, so the two words are inseparable; and there is no flow of any kind to
// control. The claim is an intention, not a description.
//
// It is a good intention, and it is already this studio's house style — station
// 01 splits a phrase into a colour word and a style word for exactly this
// reason. So the tip is implemented here rather than dropped: the first word
// owns the palette, the second owns the throw. That has one unavoidable
// consequence, stated plainly because it is the largest deviation in the file:
// the generator draws all five of a particle's numbers from one stream, and
// splitting the streams means the particle sequence CANNOT match it. A station
// that hashed the phrase once, as the generator does, would be bit-identical to
// it and the first word would be a dead control. Both were not available.
//
// What "flow" means for a burst with no forces is the shape of the throw, so the
// second word draws reach, anisotropy and how far the ray lengths are feathered.
// It does not add a velocity field: that would make this the vortex station.
//
// -------------------------------------------------------------- what did not
//
//   · the animation loop, and with it the trail decay. The generator dims the
//     whole canvas by 10% every frame, which over its hundred frames attenuates
//     the first deposit by 0.9^100 — about 1 part in 38,000. Its terminal canvas
//     is very nearly black. There is no final image to claim, download or
//     rediscover; the piece only exists while it is playing. So the decay is
//     dropped and the whole flight is kept. The reveal on screen still plays the
//     burst forward step by step, which is the part of the animation that was
//     worth having.
//   · the fixed 800x600 frame. The studio paints square, at three sizes.
//   · `'Random'` as the seed when the box is empty — this studio's box is never
//     empty, and `splitSeed` already supplies station 01's stand-ins.
//
// RESOLUTION. Every length in the burst — birth jitter, velocity, disc radius —
// is stored in the generator's own units and multiplied by one `unit` scalar
// proportional to `size`. Nothing else changes: the same 2000 particles take the
// same 100 steps at every size. So the 1440px print is the 720px screen piece
// scaled exactly 2x, up to rasterisation. That is stronger than either V1
// station, which has to hold traced density constant across sizes to approximate
// the same property, and stronger in a different way than V2's solvers, which
// resample a continuous field on a finer grid. Here the picture is not resampled
// or re-approximated. It is the same drawing, drawn bigger.

import { formatCount, seedHash, shortHash, type ReadRow, type Take } from './art.js'
import {
  V2_MODE,
  foldLabel,
  getV2Station,
  hashWord,
  hslToRgb,
  mulberry32,
  normalizeFolds,
  splitSeed,
  type V2StationId,
  type V2Surface,
} from './artv2.js'
import { normalizeSeed } from './art.js'

/* ------------------------------------------------------ the generator's numbers */

/** Particles thrown. The generator's `particleCount`. */
const REF_PARTICLES = 2000

/** Life in steps. The generator's fixed `100`, and the longest a ray can be. */
const REF_LIFE = 100

/** Half-width of the birth square, in generator units — its `* 100` halved. */
const BIRTH_HALF = 50

/** Peak per-axis speed, in generator units per step — its `* 3` halved. */
const SPEED_MAX = 1.5

/** Disc radius, in generator units. Its `arc(x, y, 2, …)`. */
const DOT_RADIUS = 2

/**
 * The velocity draw is a SQUARE, not a disc.
 *
 * `(rand - 0.5) * 3` on each axis independently means the fastest embers go to
 * the corners at 1.5 * sqrt(2) while the fastest axis-aligned ones stop at 1.5.
 * The burst is therefore very slightly boxy, denser on the diagonals, and that
 * is a real and visible property of the generator rather than a bug in it.
 * Sampling a disc instead would round the bloom off and lose it.
 */
const VELOCITY_IS_SQUARE = true

/* ------------------------------------------------------------------- the plan */

export type BurstSpec = {
  station: V2StationId
  seed: string
  /** 0 = symmetry off. */
  folds: number
  size: number
}

export type BurstPlan = {
  station: V2StationId
  seed: string
  hash: string
  /** First word — owns the palette. */
  colorWord: string
  /** Second word — owns the throw. */
  styleWord: string
  folds: number
  size: number

  /* palette, from the colour word */
  hueBase: number
  hueSpan: number
  /** 0 = a continuous sweep of the window; otherwise this many discrete hues. */
  stops: number

  /* the throw, from the style word */
  /** Fraction of the half-frame the furthest ember reaches. */
  reach: number
  /** Per-axis stretch of the velocity square, area-preserving. */
  aspect: number
  /** 0 = every ray the same length, as the generator has it. */
  feather: number

  particles: number
  /** Longest life in the burst, and therefore the number of steps to schedule. */
  steps: number
  /** Pixels per generator unit. The only thing `size` changes. */
  unit: number
  dotRadius: number

  /* the particle table, in generator units — size-independent by construction */
  bx: Float32Array
  by: Float32Array
  vx: Float32Array
  vy: Float32Array
  life: Int32Array
  /** Premultiplied nothing — just the three bytes of each ember's hue. */
  rgb: Uint8Array
  /** Deposits the finished piece is made of. The read's headline number. */
  deposits: number
  /**
   * Where each output pixel reads from, once symmetry is on. Built on the first
   * band and kept for the rest of the paint; always null when symmetry is off.
   *
   * Lazily rather than in `planBurst` because the plan is also built during
   * server rendering, where nothing is ever painted — a size-squared sweep of
   * `atan2` on every SSR of the page, to produce a table the server has no use
   * for, is the kind of cost that is invisible until it is the page's slowest
   * thing. Mutating the plan on first paint is safe here for the same reason the
   * page can derive it during render: a plan belongs to exactly one paint.
   */
  foldMap: Int32Array | null
}

// `hslToRgb` is the studio's, not this station's — see `artv2.ts`. It matters
// here because the generator strokes `hsl(h, 100%, 50%)`: fully saturated, mid
// lightness, the pure spectral colour with one channel at full, one at zero and
// one ramping. That is why the bloom reads as confetti rather than as a palette
// — there is no tint and no shade anywhere in it.

export function planBurst(spec: BurstSpec): BurstPlan {
  const seed = normalizeSeed(spec.seed)
  const { colorWord, styleWord } = splitSeed(seed)
  const size = Math.max(16, Math.min(4096, Math.round(spec.size)))
  const folds = normalizeFolds(spec.folds)

  // Two streams, hashed the generator's way, one per word — this is the tip's
  // promise made real. Station 01 does the same thing with the same two
  // functions, which is the point of modelling this station off it.
  //
  // One small omission on purpose: the generator seeds with
  // `Math.abs(hashString(text))`, and this does not. `hashWord` can return a
  // negative number, and `Math.abs` of one is a different 32-bit value, so the
  // abs is not a no-op — it selects a different stream for roughly half of all
  // words. It is dropped because station 01 does not have it either, and the
  // studio's promise is that the same word means the same thing at both: the
  // colour word 'opal' has to seed one stream, not two depending on which
  // station read it. The RNG itself is the generator's, draw for draw, and is
  // checked against it under both seedings.
  const colorRand = mulberry32(hashWord(colorWord))
  const styleRand = mulberry32(hashWord(styleWord))

  /* --- the palette dials, drawn first so the per-ember hues follow them ---- */
  const hueBase = colorRand() * 360
  const hueSpan = 40 + colorRand() * 320
  // One draw does two jobs: a bit over a third of colour words give the
  // generator's own continuous sweep, and the rest quantise it. Quantising is
  // what makes the first word legible — a two-stop bloom and an eight-stop bloom
  // off the same throw are unmistakably different pieces, where two different
  // continuous sweeps of a full wheel are not.
  const stopRoll = colorRand()
  const stops = stopRoll < 0.35 ? 0 : 2 + Math.floor(((stopRoll - 0.35) / 0.65) * 7)

  /* --- the throw dials ---------------------------------------------------- */
  // Reach is bounded tightly and can exceed 1: a piece that fills a fifth of its
  // frame is not a usable card image, and the generator's own framing — a burst
  // about 400 units across in a 600-tall canvas — is exactly that. Over 1 throws
  // embers off the edge, which the generator permits and which crops well.
  const reach = 0.78 + styleRand() * 0.26
  const aspect = 0.74 + styleRand() * 0.52
  // 0 keeps the generator's uniform life, where every ray ends at the same
  // radius and the bloom has a hard rim. Feathering shortens some rays and
  // softens it. A third of style words leave it alone.
  const featherRoll = styleRand()
  const feather = featherRoll < 0.33 ? 0 : ((featherRoll - 0.33) / 0.67) * 0.72

  const aspectX = aspect
  const aspectY = 1 / aspect

  /* --- the particle table ------------------------------------------------- */
  const n = REF_PARTICLES
  const bx = new Float32Array(n)
  const by = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const life = new Int32Array(n)
  const rgb = new Uint8Array(n * 3)
  const col: [number, number, number] = [0, 0, 0]

  let deposits = 0
  let longest = 1
  for (let i = 0; i < n; i++) {
    // The generator's four geometry draws, in its order and with its arithmetic.
    bx[i] = (styleRand() - 0.5) * (BIRTH_HALF * 2)
    by[i] = (styleRand() - 0.5) * (BIRTH_HALF * 2)
    vx[i] = (styleRand() - 0.5) * (SPEED_MAX * 2) * aspectX
    vy[i] = (styleRand() - 0.5) * (SPEED_MAX * 2) * aspectY

    // Its fifth draw, from the other stream so the first word owns it.
    const hueRoll = colorRand()
    const t = stops > 0 ? Math.min(stops - 1, Math.floor(hueRoll * stops)) / (stops - 1) : hueRoll
    hslToRgb(hueBase + hueSpan * t, 1, 0.5, col)
    rgb[i * 3] = Math.round(col[0] * 255)
    rgb[i * 3 + 1] = Math.round(col[1] * 255)
    rgb[i * 3 + 2] = Math.round(col[2] * 255)

    // Added after the generator's draws rather than interleaved with them, so
    // `feather === 0` leaves the four above reading exactly as they do there.
    const l = feather > 0 ? Math.max(14, Math.round(REF_LIFE * (1 - feather * styleRand()))) : REF_LIFE
    life[i] = l
    if (l > longest) longest = l
    // Steps 1..l-1 are drawn; step l has alpha exactly 0 and is skipped.
    deposits += Math.max(0, l - 1)
  }

  // Reach is measured against the furthest an ember can possibly get: the corner
  // of the birth square plus a full life at peak speed on the stretched axis.
  const extent = BIRTH_HALF + SPEED_MAX * REF_LIFE * Math.max(aspectX, aspectY)
  const unit = ((size / 2) * reach) / extent

  return {
    station: spec.station,
    seed,
    hash: seedHash(seed),
    colorWord,
    styleWord,
    folds,
    size,
    hueBase,
    hueSpan,
    stops,
    reach,
    aspect,
    feather,
    particles: n,
    steps: longest,
    unit,
    dotRadius: DOT_RADIUS * unit,
    bx,
    by,
    vx,
    vy,
    life,
    rgb,
    deposits,
    foldMap: null,
  }
}

/* --------------------------------------------------------------- the painting */

export function createBurstSurface(plan: BurstPlan): V2Surface {
  // Opaque black, which is the generator's own opening `fillRect('#000')`. It
  // matters here rather than being cosmetic: source-over compositing reads what
  // is already in the pixel, so the starting colour is one of the operands.
  const px = new Uint8ClampedArray(plan.size * plan.size * 4)
  for (let o = 3; o < px.length; o += 4) px[o] = 255
  if (plan.folds <= 0) return { size: plan.size, px, solved: 0 }
  // Folding needs somewhere to deposit that is not what is on screen, because
  // the fold is a gather and a gather cannot read and write one buffer.
  const raw = new Uint8ClampedArray(plan.size * plan.size * 4)
  for (let o = 3; o < raw.length; o += 4) raw[o] = 255
  return { size: plan.size, px, solved: 0, raw }
}

/**
 * Build the fold's gather table: for each output pixel, which unfolded pixel it
 * shows.
 *
 * The arithmetic is stations 01 and 02's, character for character — wrap the
 * angle into one wedge, mirror the far half of it, keep the radius. The only
 * difference is what it is applied to. They fold the point they are about to
 * evaluate a field at; there is no such point here, so this folds the point each
 * pixel READS FROM instead. Same operation, same result: many output pixels come
 * to share one source, which is what a kaleidoscope is.
 *
 * Tabulated because it depends only on `size` and `folds`, never on the burst.
 * The alternative is a size-squared sweep of `atan2` on every band — about
 * fifteen milliseconds a frame at screen size, which is the whole frame budget
 * spent recomputing a constant.
 */
function buildFoldMap(size: number, folds: number): Int32Array {
  const map = new Int32Array(size * size)
  const wedge = (Math.PI * 2) / folds
  const halfWedge = wedge / 2
  const half = size / 2
  for (let y = 0; y < size; y++) {
    const dy = y + 0.5 - half
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - half
      const rad = Math.sqrt(dx * dx + dy * dy)
      let a = Math.atan2(dy, dx)
      a -= Math.floor(a / wedge) * wedge
      if (a > halfWedge) a = wedge - a
      const sx = Math.min(size - 1, Math.max(0, Math.round(half + Math.cos(a) * rad - 0.5)))
      const sy = Math.min(size - 1, Math.max(0, Math.round(half + Math.sin(a) * rad - 0.5)))
      map[x + y * size] = (sx + sy * size) * 4
    }
  }
  return map
}

/**
 * Composite one antialiased disc, source-over.
 *
 * Coverage rather than a hard circle: at these radii — three or four pixels — a
 * binary test leaves every ember visibly polygonal and the whole bloom crawls
 * with stair-steps. `radius + 0.5 - distance`, clamped, is the cheap standard
 * approximation of what the generator gets free from `ctx.arc`.
 */
function disc(
  px: Uint8ClampedArray,
  size: number,
  cx: number,
  cy: number,
  radius: number,
  alpha: number,
  r: number,
  g: number,
  b: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - radius - 1))
  const x1 = Math.min(size - 1, Math.ceil(cx + radius + 1))
  const y0 = Math.max(0, Math.floor(cy - radius - 1))
  const y1 = Math.min(size - 1, Math.ceil(cy + radius + 1))
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const d = Math.sqrt(dx * dx + dy * dy)
      const cov = radius + 0.5 - d
      if (cov <= 0) continue
      const a = alpha * (cov < 1 ? cov : 1)
      const o = (x + y * size) * 4
      const inv = 1 - a
      px[o] = px[o] * inv + r * a
      px[o + 1] = px[o + 1] * inv + g * a
      px[o + 2] = px[o + 2] * inv + b * a
    }
  }
}

/**
 * Advance the burst to the step `rows` more units of progress implies.
 *
 * `solved` is the page's shared 0..`size` progress counter. The solving stations
 * spend it on rows; this one spends it on steps, because it has no rows to
 * report — an ember at step 40 can land anywhere in the frame, so there is no
 * band of the surface that is finished while the rest is not. Deriving the step
 * cursor from `solved` rather than storing it keeps `V2Surface` the same three
 * fields for every station.
 *
 * Whatever the banding, the last call lands on `solved === size` and therefore
 * on `steps`, so every step is drawn exactly once.
 */
export function paintBurstSteps(surface: V2Surface, plan: BurstPlan, rows: number): boolean {
  const { size, px } = surface
  const { bx, by, vx, vy, life, rgb, unit, dotRadius, particles, steps } = plan
  const half = size / 2

  // Deposits always go down unfolded. With symmetry off that is the surface
  // itself; with symmetry on it is the scratch buffer the fold gathers from.
  const target = surface.raw ?? px

  const from = Math.round((surface.solved / size) * steps)
  const next = Math.min(size, surface.solved + Math.max(1, rows))
  const to = Math.round((next / size) * steps)

  for (let s = from + 1; s <= to; s++) {
    for (let i = 0; i < particles; i++) {
      const l = life[i]
      // Step `l` has alpha exactly 0 in the generator too — it is drawn and
      // contributes nothing. Skipped rather than composited with a no-op.
      if (s >= l) continue
      const alpha = (l - s) / l

      const cx = half + (bx[i] + vx[i] * s) * unit
      const cy = half + (by[i] + vy[i] * s) * unit
      // No bounds check beyond the disc's own clipping: the generator has none,
      // and embers thrown past the edge are meant to be gone rather than turned
      // back.
      const o = i * 3
      disc(target, size, cx, cy, dotRadius, alpha, rgb[o], rgb[o + 1], rgb[o + 2])
    }
  }

  surface.solved = next

  if (surface.raw) {
    // Refold the whole surface rather than only where new embers landed: a
    // deposit anywhere in the base wedge shows up in every wedge at once, so
    // there is no dirty region smaller than the frame. One indexed copy per
    // pixel, off a table built once.
    const map = plan.foldMap ?? (plan.foldMap = buildFoldMap(size, plan.folds))
    const raw = surface.raw
    for (let i = 0, o = 0; i < map.length; i++, o += 4) {
      const src = map[i]
      px[o] = raw[src]
      px[o + 1] = raw[src + 1]
      px[o + 2] = raw[src + 2]
    }
  }

  return surface.solved >= size
}

/** Paint the whole burst in one go. For off-screen sizes and for tests. */
export function paintBurst(plan: BurstPlan): V2Surface {
  const surface = createBurstSurface(plan)
  const band = burstBandSize(plan)
  while (!paintBurstSteps(surface, plan, band)) {
    /* keep going */
  }
  return surface
}

/**
 * A band sized by pixels composited per step rather than by rows.
 *
 * One step costs every live ember one disc, and a disc's area grows with `size`,
 * so a print-size step is four times a screen-size step. Banding on the step
 * cost keeps a frame's work roughly constant the way `bandSize` does for a heavy
 * formula, then converts back into the `solved` units the page counts in.
 */
export function burstBandSize(plan: BurstPlan): number {
  const perStep = plan.particles * Math.PI * (plan.dotRadius + 0.5) * (plan.dotRadius + 0.5)
  const stepsPerFrame = Math.max(1, Math.min(plan.steps, Math.round(1_400_000 / Math.max(1, perStep))))
  return Math.max(1, Math.ceil((stepsPerFrame * plan.size) / plan.steps))
}

/* ------------------------------------------------------------------ the read */

/** `stops` in words. `0` is the generator's own continuous wheel. */
export function stopsLabel(plan: BurstPlan): string {
  return plan.stops > 0 ? `${plan.stops} stops` : 'continuous'
}

/**
 * Station 03's canvas read.
 *
 * Shares four rows with station 01 and no more: the two the whole studio shares,
 * the seed split — earned, because this station really does divide the phrase
 * the same way — and the symmetry line. Everything after that is particular. A
 * formula has nodes and levels; a lattice has octaves and a zoom; a burst has
 * embers, a throw and a count of deposits, and nothing here has a node or an
 * octave to report.
 */
export function readBurst(plan: BurstPlan, progress = 1): ReadRow[] {
  const p = Math.max(0, Math.min(1, progress))
  const laid = Math.round(plan.deposits * p)
  return [
    { label: 'Seed hash', value: shortHash(plan.hash) },
    { label: 'Station', value: getV2Station(plan.station)?.name || plan.station },
    {
      label: 'Seed split',
      value: `${plan.colorWord} · ${plan.styleWord}`,
      hint: 'colour word · flow word',
    },
    { label: 'Symmetry', value: foldLabel(plan.folds) },
    {
      label: 'Hue window',
      value: `${Math.round(plan.hueBase)}° + ${Math.round(plan.hueSpan)}°`,
      hint: `${stopsLabel(plan)} · full saturation, no tint`,
    },
    {
      label: 'Throw',
      value: `${formatCount(plan.particles)} embers × ${plan.steps} steps`,
      hint: 'straight lines — no field, no forces',
    },
    {
      label: 'Spread',
      value: `${plan.reach.toFixed(2)} of the frame · ${plan.aspect.toFixed(2)}:1`,
      hint:
        plan.feather > 0
          ? `ray lengths feathered ${Math.round(plan.feather * 100)}%`
          : 'every ray the same length',
    },
    {
      label: 'Deposits laid',
      value:
        p < 1
          ? `${formatCount(Math.round(laid / 1000))}k / ${formatCount(Math.round(plan.deposits / 1000))}k`
          : `${formatCount(Math.round(plan.deposits / 1000))}k`,
      hint: 'composited source-over, oldest and brightest at the core',
    },
  ]
}

/**
 * Six colours off the hue window, not out of the finished pixels.
 *
 * The other two stations have to sample their own surface, because their colour
 * is whatever a formula or a lattice happens to evaluate to and cannot be known
 * before it is solved. This station is the exception: its palette is drawn from
 * the colour word before an ember is thrown, so it can be shown honestly and
 * immediately. Sampling the surface instead would be strictly worse here — most
 * of a burst's frame is black, so a slanted walk across it returns a strip of
 * near-blacks that says nothing about the piece.
 */
export function burstSwatches(plan: BurstPlan, n = 6): string[] {
  const out: string[] = []
  const rgb: [number, number, number] = [0, 0, 0]
  const count = plan.stops > 0 ? Math.min(n, plan.stops) : n
  for (let i = 0; i < count; i++) {
    const t = plan.stops > 0 ? (plan.stops > 1 ? i / (plan.stops - 1) : 0) : (i + 0.5) / count
    hslToRgb(plan.hueBase + plan.hueSpan * t, 1, 0.5, rgb)
    out.push(`rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`)
  }
  return out
}

/* ---------------------------------------------------------------- the recipe */

export function burstRecipeOf(plan: BurstPlan, take: Take) {
  return {
    station: plan.station,
    seed: plan.seed,
    symmetry: plan.folds,
    mode: V2_MODE,
    take,
    size: plan.size,
  }
}

export function burstAvatarNote(plan: BurstPlan): string {
  const station = getV2Station(plan.station)?.name || plan.station
  return `Card art thrown in the CharacterVerse Art Studio V2 — ${station}, seed phrase “${plan.seed}” (colour “${plan.colorWord}”, flow “${plan.styleWord}”), ${foldLabel(plan.folds).toLowerCase()}.`
}

/** Kept exported so a test can assert the velocity draw was not rounded off. */
export const BURST_CONSTANTS = {
  REF_PARTICLES,
  REF_LIFE,
  BIRTH_HALF,
  SPEED_MAX,
  DOT_RADIUS,
  VELOCITY_IS_SQUARE,
} as const
