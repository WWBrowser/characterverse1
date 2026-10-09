// Art Studio V3 — the Corruption Engine.
//
// A third studio, and the division between the three is a discipline rather than
// a station count.
//
//   · V1 ACCUMULATES. Particles are traced and light piles up where their paths
//     cross, without a ceiling, so an exposure curve has to be chosen for the
//     result — which is why V1 has four render modes and why its densest
//     structure can bleach.
//   · V2 WRITES BOUNDED COLOUR. Every station puts a value into the frame that
//     is already in range and can never climb past it, so there is no exposure
//     left to choose and V2 has exactly one mode.
//   · V3 CONSTRUCTS AND THEN DESTROYS. It is the only studio whose second phase
//     READS ITS OWN FINISHED FIRST PHASE. A composition is built — shapes,
//     blends, garbled type — and then a corruption pass walks it, tearing rows
//     sideways, splitting the channels, dragging bright pixels downward and
//     XOR-ing noise through the result. The destroying pass is not a filter
//     bolted on top: it samples the buffer it is writing into, one row above, so
//     a melt feeds on what the melt already did.
//
// Three consequences follow from that third discipline, and they are stated here
// rather than buried in the kernel because they change what this studio can
// promise. `/art-method` says the same things to creators.
//
//   1. DETERMINISM IS THE STUDIO'S, NOT THE BROWSER'S. The generator this
//      station was loaded from drew its composition with canvas
//      `globalCompositeOperation` and `fillText` in a system monospace font.
//      Neither is reproducible across machines: text rasterization and edge
//      antialiasing differ between browsers, and the corruption pass then READS
//      those pixels to decide where to melt, so a one-unit difference in a
//      glyph edge propagates into a different corruption. The original was
//      therefore never the same piece twice on two machines. This station keeps
//      the promise instead of the mechanism: the draw plan is bit-identical to
//      the original's, and the rasterizer underneath it is the studio's own —
//      hard-edged fills, arithmetic blend modes, a built-in 3x5 bitmap font. So
//      a seed here paints the same piece everywhere, forever, and that piece is
//      not byte-identical to any particular browser's render of the original.
//   2. THERE IS NO RESOLUTION INDEPENDENCE TO HAVE. The corruption pass draws
//      from the RNG once or twice PER PIXEL, and its choice of which branch to
//      take depends on the brightness it finds there. Change the pixel count and
//      the entire stream after the first row changes: a 512px render and a
//      1440px render of one seed would be two unrelated pieces, not two
//      samplings of one. So the piece is defined on a fixed reference grid
//      (`DECAY_REF`) and every requested size is a MAGNIFICATION of it — see
//      `magnify`. "Size is exposure" is a V1 and V2 fact and it is not true here.
//   3. THERE IS NOTHING TO FOLD. The corruption is directional: rows tear
//      sideways and the melt runs downward. A mirror would show light melting
//      upward out of a bright band, which is not a symmetry of the process but a
//      contradiction of it. So this studio's claim ladder is not made of folds.
//      It is made of GENERATIONS — how many times the corruption pass has run —
//      which is a real ladder with the same shape and an honestly different
//      meaning. See `DECAY_GENERATIONS`.

import { formatCount, seedHash, shortHash, type ReadRow, type StationCard, type Take } from './art.js'

/* ------------------------------------------------------------------ stations */

export type V3StationId = 'decay' | 'bleed' | 'dropout'

/** A V3 station card. `seedWords` has the same meaning it has in V2. */
export type V3Station = StationCard & { id: V3StationId; seedWords: number }

export const V3_STATIONS: V3Station[] = [
  {
    id: 'decay',
    ordinal: '01',
    name: 'Neural Decay Corruption Engine',
    blurb:
      'A composition of blended shapes and garbled type is built, and then a corruption pass tears its rows sideways, splits the channels apart, drags every bright pixel downward into the row below and XORs noise through what is left. The second phase reads the buffer it is writing into.',
    live: true,
    seedWords: 0, // the whole phrase, hashed into one stream
  },
  {
    id: 'bleed',
    ordinal: '02',
    name: 'Chroma Bleed Transport',
    blurb: 'Upcoming station — the channels are transported along their own gradients instead of offset as a block.',
    live: false,
    seedWords: 0,
  },
  {
    id: 'dropout',
    ordinal: '03',
    name: 'Packet Dropout Reassembly',
    blurb: 'Upcoming station — the frame is cut into packets, some are lost, and the receiver guesses what was in them.',
    live: false,
    seedWords: 0,
  },
]

export function getV3Station(id: string): V3Station | undefined {
  return V3_STATIONS.find((s) => s.id === id)
}

export function isV3StationId(id: string): id is V3StationId {
  return V3_STATIONS.some((s) => s.id === id)
}

/* --------------------------------------------------------------- render mode */

/**
 * V3 has one render mode, and its reason is not V2's reason.
 *
 * V2 has one because nothing it writes can leave the range it was given. V3
 * writes bytes that can be anything at all — the noise pass XORs a random byte
 * into a channel, which is as likely to send it to full as to zero. It stays a
 * byte because a byte XOR a byte is a byte, not because the arithmetic is
 * contracting.
 *
 * What removes the choice here is that there is no light being collected. V1's
 * modes exist because a traced field is a MEASUREMENT that needs an exposure
 * chosen for it. This station's buffer is a signal, and the piece is that signal
 * after it decayed. Brightening it would not be a different exposure of the same
 * artwork; it would be a different artwork.
 */
export const V3_RENDER_MODES = [
  {
    id: 'signal' as const,
    label: 'Signal · as received',
    blurb:
      'No light is being collected here, so there is no exposure to choose. The frame is the signal after the corruption pass finished with it.',
  },
]

export type V3RenderMode = 'signal'

export const V3_MODE: V3RenderMode = 'signal'

export function isV3RenderMode(id: string): id is V3RenderMode {
  return id === 'signal'
}

/* ------------------------------------------------------------- the ladder */

/**
 * Generations of decay — this studio's claim axis, in place of folds.
 *
 * `0` is the composition with the corruption pass never run: the signal intact,
 * every shape hard-edged and every blend clean. `1` is one pass, which is what
 * the generator this station was loaded from produced and what the studio opens
 * on. `2` and up run the pass again over its own output, each time drawing fresh
 * tear offsets, a fresh melt threshold and a fresh channel split from the
 * continuing stream — generation loss, the way a tape dubbed from a dub is worse
 * than the dub.
 *
 * It differs in KIND from V1's and V2's fold ladders, and pretending otherwise
 * would be the dishonest move. A fold changes WHERE a field is read and leaves
 * the field alone, so every rung of a fold ladder is a view of one artwork. A
 * generation changes the pixels and cannot be undone, so the rungs here are a
 * LINEAGE: generation 4 is a piece descended from generation 3, not another
 * angle on it. Both make a race worth running — there is exactly one first
 * person to each rung — but only one of them is a set of views, and the boards
 * word themselves accordingly.
 *
 * THE LADDER IS NOT MONOTONIC IN BRIGHTNESS, AND THIS WAS MEASURED RATHER THAN
 * ASSUMED. The obvious guess is that each pass is darker than the last until the
 * frame bottoms out, and it is wrong. Averaged over five seeds at 600px, the
 * clean composition sits at 119 per channel; one pass drops it to 32, because
 * the melt compounds a 0.7 scanline factor every third row and drags bright
 * structure down into darkness. Every pass after the first leaves the level
 * where it is — 27 to 31 from generation 2 to generation 8 — while still moving
 * 36 to 40 units per channel each time. The seed also keeps deciding the picture
 * the whole way down: two different seeds at the same generation stay 42 to 50
 * units apart, which is as far apart as adjacent generations of one seed. So no
 * generation is a darker version of the one below it.
 *
 * WHAT DOES DECAY MONOTONICALLY IS STRUCTURE, AND THAT IS WHAT SET THE CAP AT
 * FOUR. Measure the frame's contrast between 20px blocks — how much the picture
 * still has AREAS rather than grain — and it falls 80.2, 23.4, 13.7, 11.1, 7.7,
 * 5.0, 4.2 across generations 0, 1, 2, 3, 4, 6, 8. The first four rungs are each
 * visibly less composed than the one above; past four the number is small and
 * nearly flat, and the frames look it — rendered side by side, generations 6 and
 * 8 are two fields of fine noise that no one could tell apart or choose between.
 *
 * A board offering nine rungs where five of them are indistinguishable would be
 * nine races and four prizes. Five rungs is fewer than the twelve V1 offers and
 * the twelve V2 offers, and that is the honest number: the fifth pass is where
 * this generator stops making a different picture and starts making the same
 * static. Everything past it is still reachable by rendering — it is just not
 * something to plant a flag in.
 */
export const DECAY_CLEAN = 0

export const DECAY_MAX = 4

export const DECAY_GENERATIONS: number[] = [0, 1, 2, 3, 4]

/** One pass — the loaded generator's own output — is what the studio opens on. */
export const V3_DEFAULT_DECAY = 1

export function normalizeDecay(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return DECAY_CLEAN
  return Math.min(DECAY_MAX, v)
}

/** How a generation is named in a recipe line. */
export function decayLabel(gen: number): string {
  if (gen <= 0) return 'Clean · signal intact'
  return gen === 1 ? '1 generation of decay' : `${gen} generations of decay`
}

/** How a generation is named on the discovery board. */
export function decayBoardLabel(gen: number): string {
  if (gen <= 0) return 'Clean · signal intact'
  return `Gen ${gen} · ${gen === 1 ? 'one pass' : `${gen} passes`}`
}

/* ------------------------------------------------------------- the reference */

/**
 * The grid the piece is actually defined on.
 *
 * 600x600. The loaded generator was 900x600 and this studio's frame is square,
 * so the composition is planned into a square instead — which is a change of the
 * NUMBERS passed to the plan, not of the plan: every coordinate in the original
 * is a fraction of `width` or `height`, so a square frame is the same draw order
 * and the same random fractions over a different rectangle. Shapes come out
 * narrower relative to the frame than the original's and the glyph runs come out
 * at exactly the original's scale, because 600 was already the original's height
 * and `fillText` sizes in pixels rather than in fractions.
 *
 * Fixed rather than tracking the requested size for the reason in the file
 * header: the corruption pass consumes RNG per pixel, so the grid IS part of the
 * piece's identity.
 */
export const DECAY_REF = 600

/**
 * Blow the reference grid up to a requested size, by integer replication.
 *
 * Nearest-neighbour, deliberately, and not because it was easier. The piece is
 * made of tear seams one pixel wide and single pixels whose channels have been
 * XOR-ed to an unrelated value. Bilinear or bicubic would average those against
 * their neighbours — it would soften exactly the features that are the artwork,
 * and it would invent colours that the corruption pass never wrote. Replication
 * invents nothing: every pixel of a magnified piece is a pixel the generator
 * actually produced, and at 1440px it reads as a signal at its native resolution
 * held closer, which is what it is.
 */
export function magnify(ref: Uint8ClampedArray, refSize: number, out: Uint8ClampedArray, size: number, rows: number) {
  const end = Math.min(size, Math.max(0, rows))
  for (let j = 0; j < end; j++) {
    const sj = Math.min(refSize - 1, Math.floor((j * refSize) / size))
    const srcRow = sj * refSize
    const dstRow = j * size
    for (let i = 0; i < size; i++) {
      const si = Math.min(refSize - 1, Math.floor((i * refSize) / size))
      const s = (srcRow + si) * 4
      const d = (dstRow + i) * 4
      out[d] = ref[s]
      out[d + 1] = ref[s + 1]
      out[d + 2] = ref[s + 2]
      out[d + 3] = 255
    }
  }
}

/* ------------------------------------------------------------------- the spec */

export type V3Spec = {
  station: V3StationId
  seed: string
  /** Generations of decay. See `DECAY_GENERATIONS`. */
  decay: number
  size: number
}

/**
 * A V3 surface.
 *
 * Structurally like V2's, and deliberately its own type rather than an import:
 * the studios do not share kernels, and the fields mean different things. `px`
 * is at the requested size; `ref` is the grid the piece is defined on and the
 * only buffer the generator ever writes; `solved` is spent on the STAGE
 * schedule rather than on rows.
 *
 * Rows are not a usable unit of progress here. A shape can land anywhere in the
 * frame and the corruption pass has to finish a whole frame before any of it is
 * final, so there is no top-to-bottom cursor to report. What the page needs is
 * `solved / size` as honest progress, and the stage schedule gives it that: one
 * stage per group of shapes while the composition builds, then one stage per
 * generation while it rots. The reveal is the studio's discipline made visible —
 * you watch it get built and then watch it come apart.
 */
export type V3Surface = {
  size: number
  px: Uint8ClampedArray
  solved: number
  /** The reference grid, at `DECAY_REF`. */
  ref: Uint8ClampedArray
  /** Stages finished so far. */
  stage: number
  /** Stages in total, for this piece. */
  stages: number
}

/** Six exact colours, as CSS — this station knows its palette rather than sampling it. */
export function paletteSwatches(palette: number[][], n = 6): string[] {
  return palette.slice(0, Math.max(1, n)).map(([r, g, b]) => `rgb(${r},${g},${b})`)
}

/** Shared read rows every V3 station reports the same way. */
export function v3HeadRows(seed: string, decay: number): ReadRow[] {
  return [
    { label: 'Seed hash', value: shortHash(seedHash(seed)) },
    {
      label: 'Decay',
      value: decayBoardLabel(decay),
      hint: decay > 0 ? 'Each pass re-corrupts the previous pass’s output' : 'The composition before any pass ran',
    },
  ]
}

/** `formatCount` is re-exported so a station kernel needs one import for its read. */
export { formatCount }

export type V3Take = Take
