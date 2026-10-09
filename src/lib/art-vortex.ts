/**
 * Art Studio V1 · Station 02 — Vortex Harmonic Drift.
 *
 * Station 01 and this station are cousins, not clones. Both trace particles
 * through a rotational wave field and keep the light where the paths cross, and
 * both deposit into the same `Field` so the studio's two exposures stay honest.
 * Everything between those two ends is a different kernel:
 *
 *   |                | Station 01 · Symmetric Harmonic Flow | Station 02 · Vortex Harmonic Drift |
 *   |----------------|--------------------------------------|------------------------------------|
 *   | seeding        | fnv1a → one mulberry32 per particle  | cyrb128 → four words, four streams |
 *   | dials          | 16 named field params                | 8 bare coefficients A–H + zoom     |
 *   | integration    | polar: r and a advance directly      | Cartesian: a polar velocity is     |
 *   |                |                                      | rotated into the plane, then added |
 *   | at the edge    | reflected back off rim and centre    | respawned somewhere new            |
 *   | extra forces   | none                                 | rigid swirl + held-kick turbulence |
 *   | symmetry       | an explicit fold loop around centre  | inside the wave: sin(n·θ + …)      |
 *   | colour         | radial seat + time along the path    | direction of travel                |
 *   | deposit        | a point per step                     | a streak per step                  |
 *
 * Ported from the uploaded `CharacterVerseArt1.html` generator. Three things in
 * that file could not come across as-written and are called out where they
 * happen: `Math.random()` (the studio promises a seed paints one piece), the
 * fixed step size (the studio paints one piece at three resolutions), and the
 * cursor-gravity attractor (a piece nobody else can repaint cannot be claimed).
 */

import {
  REF_SIZE,
  formatCount,
  formatPoints,
  getStation,
  modeLabel,
  normalizeSeed,
  normalizeSymmetry,
  seedHash,
  shortHash,
  splat,
  type Field,
  type ReadRow,
  type Recipe,
  type RenderMode,
  type Take,
} from './art.js'

const TAU = Math.PI * 2

/* ------------------------------------------------------------------ seeding */

/**
 * cyrb128 — four 32-bit words from a string, transcribed from the upload.
 *
 * Station 01 hashes with fnv1a and gets one number. This gets four, and that is
 * the point: the coefficients, the particles, the turbulence and the respawns
 * each draw from their own stream, so none of them can walk into another's
 * numbers. Change the phrase and all four move at once.
 */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 2778083317
  let h3 = 1618033988
  let h4 = 2147483647
  for (let i = 0, k = 0; i < str.length; i++) {
    k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

/** splitmix32 — one 32-bit word in, an endless stream of 0–1 out. From the upload. */
export function splitmix32(a: number): () => number {
  let s = a | 0
  return function next(): number {
    s = (s + 0x9e3779b9) | 0
    let t = s ^ (s >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t = t ^ (t >>> 15)
    t = Math.imul(t, 0x735a2d97)
    t = t ^ (t >>> 15)
    return (t >>> 0) / 4294967296
  }
}

/** A per-particle stream: one word mixed with an index, so particle 9 is always particle 9. */
function streamFor(word: number, index: number): () => number {
  return splitmix32((word + Math.imul(index, 0x9e3779b9)) | 0)
}

/* ----------------------------------------------------------------- palettes */

/**
 * The six named palettes from the upload. A palette is a hue window, not a list
 * of colours: `base` is where the window opens and `range` is how wide it is,
 * and every particle picks a fixed offset inside it at birth. Which is why a
 * bioluminescence piece is recognisably teal without any two filaments in it
 * being the same teal.
 */
export type PaletteName = 'cyberpunk' | 'bioluminescence' | 'nebula' | 'solar' | 'pearl' | 'emerald'

export type VortexPalette = {
  name: PaletteName
  label: string
  /** Degrees. Where the hue window opens. */
  base: number
  /** Degrees. How wide the window is. */
  range: number
}

export const VORTEX_PALETTES: VortexPalette[] = [
  { name: 'cyberpunk', label: 'Cyberpunk', base: 320, range: 120 },
  { name: 'bioluminescence', label: 'Bioluminescence', base: 170, range: 80 },
  { name: 'nebula', label: 'Nebula', base: 240, range: 140 },
  { name: 'solar', label: 'Solar', base: 0, range: 65 },
  { name: 'pearl', label: 'Pearl', base: 180, range: 220 },
  { name: 'emerald', label: 'Emerald', base: 100, range: 90 },
]

export function getVortexPalette(name: PaletteName): VortexPalette {
  return VORTEX_PALETTES.find((p) => p.name === name) || VORTEX_PALETTES[0]
}

/**
 * Hue in degrees, saturation and lightness in 0–1 → linear rgb triple.
 *
 * HSL, not station 01's HSV, because the upload strokes `hsla(h, 100%, 65%)`.
 * At full saturation and 65% lightness no channel ever reaches zero, so the
 * filaments are bright and slightly pastel rather than pure hue — the look is in
 * that choice, and swapping in HSV would quietly lose it.
 */
function hslToRgb(hDeg: number, s: number, l: number, out: [number, number, number]): void {
  const h = ((((hDeg % 360) + 360) % 360) / 60) % 6
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 1) { r = c; g = x } else if (h < 2) { r = x; g = c } else if (h < 3) { g = c; b = x } else if (h < 4) { g = x; b = c } else if (h < 5) { r = x; b = c } else { r = c; b = x }
  out[0] = r + m
  out[1] = g + m
  out[2] = b + m
}

function hex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`
}

/* --------------------------------------------------------------------- plan */

/** The eight bare coefficients. No names, because they have no individual meaning. */
export type VortexCoefficients = {
  A: number
  B: number
  C: number
  D: number
  E: number
  F: number
  G: number
  H: number
}

export type VortexSpec = {
  seed: string
  symmetry: number
  /** Square edge in pixels. */
  size: number
}

export type VortexPlan = {
  station: 'vortex'
  seed: string
  hash: string
  symmetry: number
  size: number
  /** The four cyrb128 words. Streams, in order: coefficients, particles, turbulence, respawns. */
  words: [number, number, number, number]
  coeff: VortexCoefficients
  /** Half-width of the maths the frame shows. Bigger means more wave periods fit. */
  viewScale: number
  /** Rigid-body rotation added to every velocity. Negative winds clockwise. */
  swirl: number
  /** Brownian kick strength. Exactly 0 for a good share of seeds, which paint crisp. */
  turbulence: number
  palette: PaletteName
  baseHue: number
  hueRange: number
  exposure: number
  /** Counts at the reference size. The piece is defined here and rescaled from here. */
  refParticles: number
  refSteps: number
  particles: number
  steps: number
  /** Total maths-space time each particle is integrated over. `dt = span / steps`. */
  span: number
  /** Measured mean pixels lit per step. Sampled, not guessed — see `sampleTaps`. */
  tapsPerStep: number
  /** Total light quanta laid down: particles × steps × tapsPerStep. */
  points: number
  density: number
  gain: number
}

/** Mean of `baseAlpha × life` over the birth distribution. Divides out, so a deposit averages 1. */
const MEAN_WEIGHT = 0.07 * 0.7

/**
 * The upload's per-step displacement: `stepSize (0.006) × speedMultiplier (2.5)`.
 *
 * The upload integrates at this fixed step forever. A finite piece cannot: it
 * has to cover the same amount of maths-space time however many steps it is
 * given, or the 512px avatar and the 1440px print would be two different
 * pictures. So the constant becomes a *span* — `span = STEP_REF × refSteps` —
 * and `dt = span / steps` reproduces exactly this step at the reference size.
 */
const STEP_REF = 0.006 * 2.5

/** Fraction of the frame the maths disc fills. The upload's on-screen `size * 0.44`. */
const FRAME_FILL = 0.44

/** The upload's 10px escape margin at its 720px canvas, kept proportional. */
const MARGIN_FRAC = 10 / REF_SIZE

/** The upload's radians→degrees constant. Left approximate on purpose: it is the piece. */
const RAD_TO_DEG = 57.29

export function planVortex(spec: VortexSpec): VortexPlan {
  const seed = normalizeSeed(spec.seed)
  const symmetry = normalizeSymmetry(spec.symmetry)
  const size = Math.max(32, Math.round(spec.size))
  const words = cyrb128(seed)

  // Stream one. The first nine draws are the upload's, in the upload's order and
  // with the upload's ranges, so a phrase yields the same eight coefficients and
  // the same zoom here as it does in that file. Everything after is this
  // station's own, appended rather than interleaved for exactly that reason.
  const rand = splitmix32(words[0])
  const coeff: VortexCoefficients = {
    A: (rand() - 0.5) * 5.0,
    B: (rand() - 0.5) * 3.0,
    C: (rand() - 0.5) * 4.0,
    D: (rand() - 0.5) * 2.5,
    E: (rand() - 0.5) * 5.0,
    F: (rand() - 0.5) * 3.0,
    G: (rand() - 0.5) * 4.0,
    H: (rand() - 0.5) * 2.5,
  }
  const viewScale = 2.6 + rand() * 1.8

  const palette = VORTEX_PALETTES[Math.floor(rand() * VORTEX_PALETTES.length)].name
  const { base, range } = getVortexPalette(palette)
  const swirl = (rand() - 0.5) * 1.1

  // Turbulence is a slider in the upload, defaulting to off. Here it is seeded,
  // and deliberately dead below 0.4 of the draw: roughly two seeds in five paint
  // clean filaments, the rest fray. A dial that is always slightly on reads as
  // grain across the whole studio instead of as a property of one piece.
  const turbRoll = rand()
  const turbulence = turbRoll < 0.4 ? 0 : ((turbRoll - 0.4) / 0.6) * 0.3

  // Above station 01's 0.048–0.06, and measured rather than matched.
  //
  // Station 01 retraces the same folded curves symmetry × 2 times per step, so
  // its light piles into narrow ridges and roughly 1.3% of the canvas ends up
  // past `resolve`'s soft knee — which is the only place the two exposures can
  // differ. This kernel lays its light down along streaks that mostly do not
  // overlap, so at station 01's exposure some seeds put as little as 0.1% of the
  // canvas past the knee and the render-mode toggle becomes a control that
  // changes eighty pixels. At 1.5× the toggle moves 0.6–2.1% on every seed
  // tested, which is station 01's own range.
  const exposure = 0.075 + rand() * 0.021
  const refParticles = Math.round(11000 + rand() * 8000)
  const refSteps = Math.round(190 + rand() * 110)
  const span = STEP_REF * refSteps

  // Steps scale with the edge, so displacement per step — and therefore the
  // number of pixels a streak lights — stays put across sizes.
  const scale = size / REF_SIZE
  const steps = Math.max(8, Math.round(refSteps * scale))
  const particles = Math.max(1, Math.round((refParticles * refSteps * scale * scale) / steps))

  const head: VortexPlan = {
    station: 'vortex',
    seed,
    hash: seedHash(seed),
    symmetry,
    size,
    words,
    coeff,
    viewScale,
    swirl,
    turbulence,
    palette,
    baseHue: base,
    hueRange: range,
    exposure,
    refParticles,
    refSteps,
    particles,
    steps,
    span,
    tapsPerStep: 1,
    points: particles * steps,
    density: 1,
    gain: 1,
  }

  const tapsPerStep = sampleTaps(head)
  const points = particles * steps * tapsPerStep
  const density = points / (size * size)

  return { ...head, tapsPerStep, points, density, gain: exposure / Math.max(1e-6, density) }
}

/**
 * Measure how many pixels a step actually lights, by walking a few particles.
 *
 * Station 01 knows its deposit count before it starts: one point per step per
 * fold. This station strokes a *streak* per step, and how long that streak is
 * depends on how fast the field is moving there — which is a property of the
 * eight coefficients, not something to be assumed. So it gets measured. The
 * walk always happens at the reference size and always on the same particle
 * indices, so the answer is a function of the seed alone.
 */
function sampleTaps(plan: VortexPlan): number {
  const probe = { ...plan, size: REF_SIZE, steps: plan.refSteps }
  const n = Math.min(48, plan.refParticles)
  let taps = 0
  let walked = 0
  for (let i = 0; i < n; i++) {
    driftParticle(probe, i, (_x0, _y0, _x1, _y1, len) => {
      taps += Math.max(1, Math.ceil(len))
    })
    walked += plan.refSteps
  }
  return walked > 0 ? Math.max(1, taps / walked) : 1
}

/* -------------------------------------------------------------------- drift */

/** One traced step: screen-space segment, its length, its weight and its hue. */
type Emit = (x0: number, y0: number, x1: number, y1: number, len: number, weight: number, hue: number) => void

/**
 * Walk one particle and hand every step to `emit`.
 *
 * Both the painter and the sampler go through here. That is not tidiness — if
 * the two disagreed by a single term the measured deposit count would be
 * calibrating an exposure for a picture nobody paints.
 */
function driftParticle(plan: VortexPlan, index: number, emit: Emit): void {
  const { coeff, viewScale, swirl, turbulence, symmetry, steps, span, size, baseHue, hueRange, words } = plan
  const { A, B, C, D, E, F, G, H } = coeff

  // Stream two, sequential across all particles exactly as the upload's
  // `createParticle(randParticles)` loop is — which is also what makes a
  // 6,000-particle render a true prefix of a 24,000-particle one.
  const birth = streamFor(words[1], index)
  const angle = birth() * TAU
  const dist = (0.02 + birth() * 0.98) * viewScale
  let px = Math.cos(angle) * dist
  let py = Math.sin(angle) * dist
  const life = 0.4 + birth() * 0.6
  const baseAlpha = 0.04 + birth() * 0.06
  const hueOffset = birth() * 360
  const weight = (baseAlpha * life) / MEAN_WEIGHT

  const randTurb = streamFor(words[2], index)
  const randRespawn = streamFor(words[3], index)

  const dt = span / steps
  const half = size / 2
  const reach = size * FRAME_FILL
  const margin = size * MARGIN_FRAC
  const toScreen = (v: number) => (v / viewScale) * reach + half

  // Held-kick turbulence. The upload calls `Math.random()` per step, which would
  // make the piece unrepeatable *and* size-dependent: twice the steps, twice the
  // kicks, a different amount of fraying. Instead each kick is indexed by its
  // position along the reference path and held across the sub-steps that share
  // it — so the walk is deterministic, and doubling the resolution samples the
  // same frayed path more finely rather than fraying it twice as hard.
  let kickAt = -1
  let kx = 0
  let ky = 0

  for (let s = 0; s < steps; s++) {
    const r = Math.sqrt(px * px + py * py)
    const theta = Math.atan2(py, px)

    if (r < 0.008) {
      const a = randRespawn() * TAU
      px = Math.cos(a) * viewScale
      py = Math.sin(a) * viewScale
      continue
    }

    const vr = A * Math.sin(symmetry * theta + B * r) + C * Math.cos(D * r)
    const vt = E * Math.cos(symmetry * theta + F * r) + G * Math.sin(H * r)

    let dx = vr * Math.cos(theta) - vt * Math.sin(theta)
    let dy = vr * Math.sin(theta) + vt * Math.cos(theta)

    if (swirl !== 0) {
      dx += -py * swirl
      dy += px * swirl
    }

    if (turbulence > 0) {
      const at = Math.floor((s * plan.refSteps) / steps)
      while (kickAt < at) {
        kx = randTurb() - 0.5
        ky = randTurb() - 0.5
        kickAt++
      }
      dx += kx * turbulence * 4
      dy += ky * turbulence * 4
    }

    const oldX = toScreen(px)
    const oldY = toScreen(py)
    px += dx * dt
    py += dy * dt
    const newX = toScreen(px)
    const newY = toScreen(py)

    if (newX < -margin || newX > size + margin || newY < -margin || newY > size + margin || Number.isNaN(px)) {
      const a = randRespawn() * TAU
      const radius = (0.2 + randRespawn() * 0.8) * viewScale
      px = Math.cos(a) * radius
      py = Math.sin(a) * radius
      continue
    }

    // Colour from the direction of travel. This is the station's signature and
    // the sharpest break from station 01, where hue comes from where a particle
    // sits. Here two filaments crossing the same pixel from different headings
    // are different colours, so the field's shear shows up as hue.
    //
    // The raw signal is the upload's, term for term. What is NOT the upload's is
    // the last line: it reads that signal through the palette's window instead
    // of adding it to the base hue.
    //
    // The upload adds. `velocityAngle * 57.29` alone spans ±180°, so adding it
    // to a base hue sweeps the entire colour wheel and the base only rotates
    // where the sweep starts — every piece comes out the same full-gamut pastel
    // whichever palette is chosen, which is why that file carries a per-palette
    // background tint to tell them apart at all. Six named palettes that all
    // paint the same picture is a dead dial, and a canvas read reporting a 65°
    // solar window over a full-spectrum piece would be a false one. So the
    // excursion is mapped into `[base, base + range)`: heading still decides
    // hue, and a bioluminescence piece is now actually teal.
    const velocityAngle = Math.atan2(dy, dx)
    const raw = velocityAngle * RAD_TO_DEG + r * 32 + hueOffset
    const hue = baseHue + ((((raw % 360) + 360) % 360) / 360) * hueRange

    const ex = newX - oldX
    const ey = newY - oldY
    emit(oldX, oldY, newX, newY, Math.sqrt(ex * ex + ey * ey), weight, hue)
  }
}

/* -------------------------------------------------------------------- trace */

/**
 * Trace up to `count` more particles into the field.
 *
 * Same chunked contract as station 01's `traceParticles`, and the same `Field`,
 * so the page's progressive paint and both exposures work here untouched.
 */
export function traceVortex(field: Field, plan: VortexPlan, count: number): boolean {
  const acc = field.acc
  const size = plan.size
  const rgb: [number, number, number] = [0, 0, 0]
  const start = field.traced
  const end = Math.min(plan.particles, start + Math.max(1, Math.round(count)))

  for (let i = start; i < end; i++) {
    driftParticle(plan, i, (x0, y0, x1, y1, len, weight, hue) => {
      hslToRgb(hue, 1, 0.65, rgb)
      rgb[0] *= weight
      rgb[1] *= weight
      rgb[2] *= weight

      // A stroked line, not a point. At this step size a fast particle moves ten
      // pixels or more, so depositing once per step would draw the field as
      // dotted trails. Walking the segment at one deposit per pixel is what the
      // upload's `lineTo` + `lighter` actually does: brightness per pixel is the
      // particle's alpha, and a fast particle lays down more total light because
      // it covered more ground.
      const taps = Math.max(1, Math.ceil(len))
      const stepX = (x1 - x0) / taps
      const stepY = (y1 - y0) / taps
      for (let t = 0; t < taps; t++) {
        splat(acc, size, x0 + stepX * (t + 0.5), y0 + stepY * (t + 0.5), rgb)
      }
      field.deposited += taps
    })
  }

  field.traced = end
  return field.traced >= plan.particles
}

/**
 * Particles per animation frame.
 *
 * Budgeted in deposits rather than particles, because one particle here costs
 * `steps × tapsPerStep` splats and both of those move with the seed and the
 * size. A fixed particle count would stutter on a fast field at print size.
 */
export function vortexChunk(plan: VortexPlan): number {
  const perParticle = Math.max(1, plan.steps * plan.tapsPerStep)
  return Math.max(8, Math.min(plan.particles, Math.round(250_000 / perParticle)))
}

/* ---------------------------------------------------------------- reporting */

/** Swatches from the piece's own hue window, at the lightness it is painted at. */
export function vortexSwatches(plan: VortexPlan, n = 6): string[] {
  const rgb: [number, number, number] = [0, 0, 0]
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    hslToRgb(plan.baseHue + plan.hueRange * t, 1, 0.5 + 0.22 * t, rgb)
    out.push(hex(rgb))
  }
  return out
}

function signed(n: number, digits = 2): string {
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(digits)}`
}

/**
 * This station's canvas read.
 *
 * Station 01 reports particles, steps and points, because that is the whole of
 * what it did. This one has to report the eight coefficients, the zoom they are
 * read at, the two forces layered on top and the hue window — none of which
 * station 01 has — and reports the trace itself in streaks rather than points,
 * because a step here lights a line and not a dot.
 */
export function readVortex(plan: VortexPlan, progress = 1): ReadRow[] {
  const p = Math.max(0, Math.min(1, progress))
  const c = plan.coeff
  const pal = getVortexPalette(plan.palette)
  return [
    { label: 'Seed hash', value: shortHash(plan.hash) },
    { label: 'Station', value: getStation(plan.station)?.name || plan.station },
    {
      label: 'Streams',
      value: '4 words · coefficients, births, kicks, respawns',
      hint: 'cyrb128 splits the phrase four ways so no two forces share numbers',
    },
    {
      label: 'Coefficients',
      value: `A ${signed(c.A)}  B ${signed(c.B)}  C ${signed(c.C)}  D ${signed(c.D)}`,
      hint: `E ${signed(c.E)}  F ${signed(c.F)}  G ${signed(c.G)}  H ${signed(c.H)}`,
    },
    {
      label: 'Symmetry',
      value: `${plan.symmetry}-fold`,
      hint: 'inside the wave as sin(n·θ), not folded around the canvas afterwards',
    },
    { label: 'View scale', value: `${plan.viewScale.toFixed(2)}×`, hint: 'how much of the maths the frame holds' },
    {
      label: 'Forces',
      value: `swirl ${signed(plan.swirl)} · ${plan.turbulence > 0 ? `turbulence ${plan.turbulence.toFixed(2)}` : 'no turbulence'}`,
    },
    { label: 'Hue window', value: `${pal.label} · ${pal.base}° + ${pal.range}°`, hint: 'coloured by heading, not position' },
    { label: 'Drift', value: `${formatCount(plan.particles)} particles × ${formatCount(plan.steps)} steps` },
    {
      label: 'Streaks laid',
      value: p < 1 ? `${formatPoints(plan.points * p)} / ${formatPoints(plan.points)}` : formatPoints(plan.points),
      hint: `${plan.tapsPerStep.toFixed(1)} px lit per step, measured off this seed`,
    },
  ]
}

export function vortexRecipeOf(plan: VortexPlan, mode: RenderMode, take: Take): Recipe {
  return { station: plan.station, seed: plan.seed, symmetry: plan.symmetry, mode, take, size: plan.size }
}

export function vortexAvatarNote(plan: VortexPlan, mode: RenderMode): string {
  const station = getStation(plan.station)?.name || plan.station
  return `Card art painted in the CharacterVerse Art Studio — ${station}, seed phrase “${plan.seed}”, ${plan.symmetry}-fold symmetry, ${getVortexPalette(plan.palette).label} palette, ${modeLabel(mode)}.`
}
