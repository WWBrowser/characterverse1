// Art Studio V2 — the Recursive Expression Field.
//
// A second studio, painting by a completely different method from the first.
// Station 01 of V1 traces particles and accumulates light where their paths
// cross. This one traces nothing: three recursive formulas — one per colour
// channel — are grown from the seed and then SOLVED at every pixel. The picture
// is the equation, evaluated.
//
// Three properties carry over from V1 unchanged, because they are the studio's
// promises rather than one station's implementation detail:
//
//   · DETERMINISM. Every piece is fixed entirely by its seed phrase. Same words,
//     same artwork, forever — so a piece is shareable by naming it.
//   · RESOLUTION INDEPENDENCE. Here it is exact rather than approximated: the
//     field is a function of normalized coordinates, so pixel (i,j) at 512px and
//     the same point at 1440px solve the same equation to the same value. V1 has
//     to hold traced density constant across sizes to get this; V2 gets it for
//     free, which is one of the ways the two stations genuinely differ.
//   · BROWSER-COMPUTED, PROGRESSIVELY. Solved in row bands while you watch, so
//     nothing is uploaded and nothing is cached server-side.
//
// What is new here is the SEED SPLIT. The phrase is cut in two: the first word
// seeds the COLOUR (the three channel phases), the second seeds the STYLE (the
// three formula trees). So "opal shatter" and "ember shatter" are the same
// structure in two different palettes, and "opal shatter" and "opal drift" are
// the same palette over two different structures. The read reports both words
// because that split is the thing a creator steers with.
//
// FIDELITY. The formula grammar, the RNG, the string hash, the tree depth and
// the sine colour mapping are a faithful port of the standalone generator this
// station was loaded from — same draw order, same operators, same arithmetic. A
// phrase painted there with symmetry off paints here byte-for-byte identically.
// Folding is the one thing added, and it is additive: folds = 0 is the original.

import { normalizeSeed, normalizeSymmetry, seedHash, shortHash, formatCount, type ReadRow, type StationCard, type Take } from './art.js'

/* ------------------------------------------------------------------ stations */

export type V2StationId = 'expression' | 'noise' | 'burst' | 'dna' | 'warp' | 'weave'

/**
 * A V2 station card, plus the one thing about a station's SEED that callers
 * outside the studio need to know.
 *
 * `seedWords` is how many words of a phrase the station actually reads — 0 means
 * "all of it, it is not a word list". It lives on the card rather than in the
 * engine because two places need it and they are not allowed to disagree: the
 * page trims a rolled or AI-written phrase to it, and `/api/claw` picks
 * the prompt grammar from it. That endpoint used to decide by asking whether the
 * station was in V2 at all, which was right for stations 01 and 03 and wrong for
 * 02 — it told the director to write a word pair for a station that hashes the
 * whole phrase — and would have been wrong for 04, which reads no words at all.
 * Deriving both from this field is what stops the next station repeating it.
 */
export type V2Station = StationCard & { id: V2StationId; seedWords: number }

export const V2_STATIONS: V2Station[] = [
  {
    id: 'expression',
    ordinal: '01',
    name: 'Recursive Expression Field',
    blurb:
      'Three recursive formulas — one per colour channel — grown from the seed and solved at every pixel. Nothing is traced; the field is the equation.',
    live: true,
    seedWords: 2, // a colour word and a style word
  },
  {
    id: 'noise',
    ordinal: '02',
    name: 'Psychedelic Noise Lattice',
    blurb:
      'A permutation table shuffled by the seed, gradients hung off an integer lattice, and several octaves summed. One field, read at three phases, banding into colour.',
    live: true,
    seedWords: 0, // the whole phrase, hashed into one lattice
  },
  {
    id: 'burst',
    ordinal: '03',
    name: 'Ballistic Ember Bloom',
    blurb:
      'Two thousand embers thrown from one point and left entirely alone — no field, no forces, no curve. Straight rays, fading as they fly, laid over each other in the order they were thrown.',
    live: true,
    seedWords: 2, // a colour word and a flow word
  },
  {
    id: 'dna',
    ordinal: '04',
    name: 'Chimeric Image Genome',
    blurb:
      'Several images spliced into one strand of DNA, and the strand grown into three formulas, crystallised into blocks and twisted around the centre. The pictures are the recipe; the field is what the recipe evaluates to.',
    live: true,
    seedWords: 0, // a strand, or a whole phrase to grow one from
  },
  {
    id: 'warp',
    ordinal: '05',
    name: 'Warped Domain Cascade',
    blurb: 'Upcoming station — the field feeds its own output back in as coordinates.',
    live: false,
    seedWords: 2, // planned as a pair
  },
  {
    id: 'weave',
    ordinal: '06',
    name: 'Chromatic Interference Weave',
    blurb: 'Upcoming station — three fields beat against each other for their colour.',
    live: false,
    seedWords: 0, // planned as a whole phrase
  },
]

export function getV2Station(id: string): V2Station | undefined {
  return V2_STATIONS.find((s) => s.id === id)
}

export function isV2StationId(id: string): id is V2StationId {
  return V2_STATIONS.some((s) => s.id === id)
}

/**
 * V2 has one light resolution, and that is not an oversight.
 *
 * V1 needs a toggle because its light accumulates into an unbounded buffer and
 * bleaches out where paths cross, so an exposure curve has to be chosen for it.
 * No station here has that problem — but each one avoids it by different
 * arithmetic, and this used to be written as though they all avoided it the same
 * way ("map every channel through a sine"). That was station 01's reason. Station
 * 03 accumulates and stays in range because source-over compositing cannot pass
 * full; station 04 is never wrapped through anything, because four contracting
 * operators cannot leave the range they were given, and its Neon dial CAN clip on
 * purpose — as a recorded part of the piece rather than as a view of it.
 *
 * So the mode's label and blurb say only what is true of every station, and the
 * per-station reason is `V2Piece.modeNote`. Inventing a second mode would still
 * be a control that changes nothing.
 */
export const V2_RENDER_MODES = [
  {
    id: 'direct' as const,
    label: 'Direct · one pass',
    blurb:
      'Every channel is already inside its range when it is written, so there is no exposure left to choose.',
  },
]

export type V2RenderMode = 'direct'

export const V2_MODE: V2RenderMode = 'direct'

export function isV2RenderMode(id: string): id is V2RenderMode {
  return id === 'direct'
}

/* -------------------------------------------------------------------- folding */

/**
 * Symmetry is optional in V2 — the headline control this studio adds.
 *
 * `0` means off: the raw expression field, exactly as the formula solves it,
 * asymmetric and organic. Any other value folds the SAMPLE COORDINATES around
 * the centre before the formula sees them, mirroring each wedge, which turns the
 * same equation into a kaleidoscope without altering it. The field underneath is
 * identical either way — folding changes where it is read, not what it says.
 */
export const FOLDS_OFF = 0

/** Symmetry starts off, because the unfolded field is what makes V2 look unlike V1. */
export const V2_DEFAULT_FOLDS = FOLDS_OFF

/** Accepts `0` (off) as well as the studio's shared 2–16 fold vocabulary. */
export function normalizeFolds(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 1) return FOLDS_OFF
  return normalizeSymmetry(v)
}

export function foldLabel(folds: number): string {
  return folds > 0 ? `${folds}-fold mirrored` : 'Off · unfolded field'
}

/* ------------------------------------------------------- the loaded generator */

/**
 * The standalone generator's own string hash — a 32-bit rolling shift, not the
 * studio's FNV. Kept exactly because the two seed words are hashed with it and
 * changing it would repaint every piece ever made in the original.
 */
export function hashWord(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return h
}

/**
 * Mulberry32, as a closure rather than a class. Identical sequence.
 *
 * Exported because station 03 was loaded from a generator that declares the very
 * same RNG — as a `class Mulberry32` with a mutating `this.seed` — and the same
 * `hashWord` rolling shift above it. Two copies of an RNG in one studio is how
 * two stations quietly drift onto different sequences; one copy, shared, is how
 * the studio can say the stations agree and mean it.
 */
export function mulberry32(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The operator set, in the order the generator declares it — the index is drawn
// from the RNG, so the order is load-bearing and must not be tidied.
export const OPERATORS = ['sin', 'cos', 'mul', 'avg', 'abs', 'mod'] as const

/**
 * How many arguments each operator takes, indexed alongside `OPERATORS`.
 *
 * Exported for station 04, which was loaded from a generator declaring a FOUR
 * operator set — `sin`, `cos`, `mul`, `avg`, with `Math.PI * a` inside the two
 * trigonometric ones — and that list is this one's exact prefix, in the same
 * order, with the same arities and the same arithmetic. So the two stations can
 * and do share one evaluator; only the grammar that grows a program differs.
 * Checked rather than assumed: the port test asserts the first four entries of
 * `OPERATORS` against the generator's own `fns` array and evaluates each against
 * its own `exec`.
 */
export const ARITY = [1, 1, 2, 2, 1, 2]

// Opcodes for the flat program: 0 pushes x, 1 pushes y, and 2+i applies
// OPERATORS[i]. One opcode is exactly one node of the formula tree, so the
// program's length IS the node count the read reports.
export const OP_X = 0
export const OP_Y = 1
/** Where the operators start in the opcode space — `OP_OFFSET + i` applies `OPERATORS[i]`. */
export const OP_OFFSET = 2

/** How many levels deep a formula is grown. The generator's own depth. */
export const FORMULA_DEPTH = 12

/** Chance of stopping early at any level, so trees vary in size and shape. */
const LEAF_CHANCE = 0.1

/**
 * Grow one channel's formula, emitted directly as a postfix program.
 *
 * Recursive-descent build, flat output: children are emitted before their
 * operator, so solving a pixel is a loop over a typed array with a small stack
 * rather than a walk over a tree of objects. That is the same formula — the RNG
 * is drawn in the generator's original order (leaf test, then operator index,
 * then each argument in turn) — about twice as fast to evaluate.
 */
function growProgram(rand: () => number, depth: number, out: number[]): void {
  if (depth <= 0 || rand() < LEAF_CHANCE) {
    out.push(rand() > 0.5 ? OP_X : OP_Y)
    return
  }
  const op = Math.floor(rand() * OPERATORS.length)
  for (let i = 0; i < ARITY[op]; i++) growProgram(rand, depth - 1, out)
  out.push(2 + op)
}

/**
 * Solve one channel's program at a point. `stack` is reused across pixels.
 *
 * Exported as `solveProgram` for station 04 — see `ARITY`. A restricted program
 * that only ever emits opcodes 0–5 lands in the first four cases and never
 * reaches `abs` or `mod`, so sharing this costs that station nothing and keeps
 * the studio to one evaluator instead of two that have to be kept in step.
 */
export function solveProgram(prog: Int32Array, stack: Float64Array, x: number, y: number): number {
  let sp = 0
  for (let i = 0; i < prog.length; i++) {
    switch (prog[i]) {
      case OP_X:
        stack[sp++] = x
        break
      case OP_Y:
        stack[sp++] = y
        break
      case 2: // sin
        stack[sp - 1] = Math.sin(Math.PI * stack[sp - 1])
        break
      case 3: // cos
        stack[sp - 1] = Math.cos(Math.PI * stack[sp - 1])
        break
      case 4: { // mul
        const b = stack[--sp]
        stack[sp - 1] = stack[sp - 1] * b
        break
      }
      case 5: { // avg
        const b = stack[--sp]
        stack[sp - 1] = (stack[sp - 1] + b) / 2
        break
      }
      case 6: // abs
        stack[sp - 1] = Math.abs(stack[sp - 1])
        break
      case 7: { // mod
        const b = stack[--sp]
        stack[sp - 1] = stack[sp - 1] % (b || 1)
        break
      }
    }
  }
  return stack[0]
}

/**
 * HSL to RGB, each component in 0..1.
 *
 * Lives in the studio's shared module rather than in a station kernel because
 * two of V2's stations need it and neither should import the other: station 03
 * strokes `hsl(h, 100%, 50%)` because the generator it came from does, and
 * station 04 needs it to synthesise a genome from a phrase when no images have
 * been spliced. One copy, so the two cannot drift.
 *
 * V1's vortex station keeps its own. That is a deliberate duplication rather
 * than an oversight — the two studios do not import each other's kernels, and a
 * twelve-line colour conversion is a smaller price than the dependency.
 */
export function hslToRgb(hDeg: number, s: number, l: number, out: [number, number, number]): void {
  const h = ((((hDeg % 360) + 360) % 360) / 60)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 1) { r = c; g = x } else if (h < 2) { r = x; g = c } else if (h < 3) { g = c; b = x }
  else if (h < 4) { g = x; b = c } else if (h < 5) { r = x; b = c } else { r = c; b = x }
  out[0] = r + m
  out[1] = g + m
  out[2] = b + m
}

/* ----------------------------------------------------------------- the plan */

export type V2Spec = {
  station: V2StationId
  seed: string
  /** 0 = symmetry off. */
  folds: number
  size: number
}

export type V2Plan = {
  station: V2StationId
  /** The normalized phrase. */
  seed: string
  hash: string
  /** First word — seeds the palette. */
  colorWord: string
  /** Second word — seeds the structure. */
  styleWord: string
  folds: number
  size: number
  depth: number
  /** The three channel programs, R then G then B. */
  programs: Int32Array[]
  /** Node count per channel — the read's headline number. */
  nodes: number[]
  /** Colour phase per channel, drawn from the colour word. */
  phases: number[]
  pixels: number
  /** Total node evaluations a full solve costs: nodes × pixels. */
  work: number
}

// The generator's stand-ins for a missing word. Kept verbatim: a one-word phrase
// has to paint the same here as it does there.
const FALLBACK_COLOR = 'Default1'
const FALLBACK_STYLE = 'Default2'

/** Split a phrase into its colour word and its style word. */
export function splitSeed(phrase: string): { colorWord: string; styleWord: string } {
  const words = String(phrase || '').trim().split(/\s+/).filter(Boolean)
  return {
    colorWord: words[0] || FALLBACK_COLOR,
    styleWord: words[1] || FALLBACK_STYLE,
  }
}

export function planV2(spec: V2Spec): V2Plan {
  const seed = normalizeSeed(spec.seed)
  const { colorWord, styleWord } = splitSeed(seed)
  const size = Math.max(16, Math.min(4096, Math.round(spec.size)))
  const folds = normalizeFolds(spec.folds)

  // Structure from the style word, colour from the colour word — two independent
  // streams, so changing one word leaves the other half of the piece alone.
  const styleRand = mulberry32(hashWord(styleWord))
  const colorRand = mulberry32(hashWord(colorWord))

  const programs = [0, 1, 2].map(() => {
    const out: number[] = []
    growProgram(styleRand, FORMULA_DEPTH, out)
    return Int32Array.from(out)
  })
  const phases = [colorRand() * Math.PI, colorRand() * Math.PI, colorRand() * Math.PI]
  const nodes = programs.map((p) => p.length)
  const pixels = size * size

  return {
    station: spec.station,
    seed,
    hash: seedHash(seed),
    colorWord,
    styleWord,
    folds,
    size,
    depth: FORMULA_DEPTH,
    programs,
    nodes,
    phases,
    pixels,
    work: pixels * nodes.reduce((a, b) => a + b, 0),
  }
}

/* --------------------------------------------------------------- the solving */

export type V2Surface = {
  size: number
  px: Uint8ClampedArray
  /**
   * How far this station's paint has got, counted in units of `size`.
   *
   * For the two solving stations that is literally rows: they fill the surface
   * top to bottom, so `solved` is the row cursor. Station 03 does not solve rows
   * — it composites a burst of particles step by step, and a deposit can land
   * anywhere in the frame, so there is no top-to-bottom cursor to report. It
   * spends the same counter on its step schedule instead.
   *
   * What the page needs is `solved / size` as honest progress, and both readings
   * give it that. Hence the unit rather than the row count.
   */
  solved: number
  /**
   * The unfolded surface, when a station needs to keep one.
   *
   * The two solving stations fold the COORDINATE before they read the field, so
   * they never hold an unfolded picture — the fold costs them nothing and needs
   * no buffer. A depositing station cannot do that: it has no sample point to
   * fold, and folding the deposit instead concentrates the whole burst into one
   * wedge rather than mirroring it out (measured, not assumed — the other eleven
   * sectors come back empty). So station 03 deposits here, unfolded, and gathers
   * from it into `px` through the same fold arithmetic the solvers use. Left
   * undefined by every station that does not need it, including station 03 with
   * symmetry off, where `px` is deposited into directly.
   */
  raw?: Uint8ClampedArray
}

export function createSurface(plan: V2Plan): V2Surface {
  const px = new Uint8ClampedArray(plan.size * plan.size * 4)
  return { size: plan.size, px, solved: 0 }
}

/**
 * Solve the next band of rows. Returns true once the surface is finished.
 *
 * Row-banded rather than all-at-once so a slow formula stays watchable instead
 * of freezing the tab — the same deal V1's chunked tracing makes.
 */
export function solveRows(surface: V2Surface, plan: V2Plan, rows: number): boolean {
  const { size, px } = surface
  const [pr, pg, pb] = plan.programs
  const [phR, phG, phB] = plan.phases
  const stack = new Float64Array(FORMULA_DEPTH * 4 + 16)
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
        // Fold the coordinate into one wedge and mirror it. The formula is never
        // told this happened, which is why the folded piece is recognisably the
        // same field as the unfolded one.
        const r = Math.sqrt(x * x + y * y)
        let a = Math.atan2(y, x)
        a -= Math.floor(a / step) * step
        if (a > half) a = step - a
        x = Math.cos(a) * r
        y = Math.sin(a) * r
      }

      const o = (i + j * size) * 4
      px[o] = (Math.sin(solveProgram(pr, stack, x, y) * Math.PI + phR) + 1) * 127.5
      px[o + 1] = (Math.sin(solveProgram(pg, stack, x, y) * Math.PI + phG) + 1) * 127.5
      px[o + 2] = (Math.sin(solveProgram(pb, stack, x, y) * Math.PI + phB) + 1) * 127.5
      px[o + 3] = 255
    }
  }
  surface.solved = end
  return surface.solved >= size
}

/** Solve the whole surface in one go. For off-screen sizes and for tests. */
export function solveField(plan: V2Plan): V2Surface {
  const surface = createSurface(plan)
  while (!solveRows(surface, plan, 64)) {
    /* keep going */
  }
  return surface
}

/**
 * A row band sized so one frame's work is roughly constant regardless of how
 * heavy the formula is — a 900-node piece gets fewer rows per frame than a
 * 120-node one, so neither stutters and neither crawls.
 */
export function bandSize(plan: V2Plan): number {
  const perRow = plan.size * plan.nodes.reduce((a, b) => a + b, 0)
  return Math.max(1, Math.min(plan.size, Math.round(2_500_000 / Math.max(1, perRow))))
}

/* ------------------------------------------------------------------ the read */

/**
 * V2's canvas read.
 *
 * Deliberately NOT V1's. The first two rows match so the two studios read as one
 * family, and then every quantity after them is particular to how this station
 * paints: there are no particles and no steps here to report, so it reports the
 * seed split, the size and shape of the formula, and how much of the field has
 * been solved. Each station declares its own rows — that is the point.
 */
export function readV2(plan: V2Plan, progress = 1): ReadRow[] {
  const done = Math.round(plan.pixels * Math.max(0, Math.min(1, progress)))
  return [
    { label: 'Seed hash', value: shortHash(plan.hash) },
    { label: 'Station', value: getV2Station(plan.station)?.name || plan.station },
    {
      label: 'Seed split',
      value: `${plan.colorWord} · ${plan.styleWord}`,
      hint: 'colour word · style word',
    },
    { label: 'Symmetry', value: foldLabel(plan.folds) },
    {
      label: 'Formula',
      value: plan.nodes.join(' / ') + ' nodes',
      hint: 'per R / G / B channel',
    },
    {
      label: 'Grown',
      value: `${plan.depth} levels · ${OPERATORS.length} operators`,
    },
    {
      label: 'Pixels solved',
      value:
        progress < 1
          ? `${formatCount(Math.round(done / 1000))}k / ${formatCount(Math.round(plan.pixels / 1000))}k`
          : `${formatCount(Math.round(plan.pixels / 1000))}k`,
    },
  ]
}

/**
 * Six colours taken out of the finished field itself.
 *
 * V1 can show a palette before it paints, because its palette is hashed from the
 * seed. V2 cannot: the colours are whatever three formulas happen to evaluate
 * to, so the only honest swatch strip is a sample of the real pixels. Walked on a
 * slanted path rather than straight across, so a folded piece is sampled from
 * several of its wedges instead of one.
 */
export function sampleSwatches(surface: V2Surface, n = 6): string[] {
  const { size, px } = surface
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const x = Math.min(size - 1, Math.floor(t * size))
    const y = Math.min(size - 1, Math.floor(((t * 2.5) % 1) * size))
    const o = (x + y * size) * 4
    out.push(`rgb(${px[o]}, ${px[o + 1]}, ${px[o + 2]})`)
  }
  return out
}

/* ---------------------------------------------------------------- the recipe */

/**
 * V2's recipe carries `folds` where V1 carries a fold count that is always on,
 * and `0` is a real value meaning unfolded. Everything else is the same shape,
 * so both studios pour into the same stream and the same table.
 */
export function v2RecipeOf(plan: V2Plan, take: Take) {
  return {
    station: plan.station,
    seed: plan.seed,
    symmetry: plan.folds,
    mode: V2_MODE,
    take,
    size: plan.size,
  }
}

export function v2AvatarNote(plan: V2Plan): string {
  const station = getV2Station(plan.station)?.name || plan.station
  return `Card art solved in the CharacterVerse Art Studio V2 — ${station}, seed phrase “${plan.seed}” (colour “${plan.colorWord}”, style “${plan.styleWord}”), ${foldLabel(plan.folds).toLowerCase()}.`
}

/** Roll a colour word and a style word. Deterministic on `entropy`. */
export function rollSeedPair(entropy: number, roll: (e: number) => string): string {
  return roll(entropy).split(' ').slice(0, 2).join(' ')
}
