// Art Studio V1 — the engine layer.
//
// V1 now has two live stations that trace by genuinely unlike methods. Station
// 01 advances r and a directly through a polar wave and folds each point around
// the centre; station 02 rotates a polar velocity into the plane, adds a swirl
// and a held kick, and lets the symmetry live inside the wave instead. Their
// plans share four things — the seed, its hash, the fold count and the size —
// and nothing else: one carries sixteen named `params`, the other eight bare
// coefficients, a zoom, a hue window and a measured deposit rate.
//
// The page must not care. This is the same shape as `artv2-engine.ts`, for the
// same reason: a station is resolved ONCE into a piece — a closed-over object
// that knows how to trace itself and exposes only the shared facts. The concrete
// plan stays in the closure, so there is no union to narrow and no cast in this
// file. Adding station 03 means writing a kernel and adding one branch below.

import {
  avatarNote,
  createField,
  getStation,
  palette,
  planTrace,
  readTrace,
  recipeOf,
  resolve,
  traceParticles,
  type ArtSpec,
  type Field,
  type ReadRow,
  type Recipe,
  type RenderMode,
  type StationId,
  type Take,
} from './art.js'
import {
  planVortex,
  readVortex,
  traceVortex,
  vortexAvatarNote,
  vortexChunk,
  vortexRecipeOf,
  vortexSwatches,
} from './art-vortex.js'

/**
 * The shared facts. Deliberately the smallest set the page actually uses —
 * anything a station wants to show beyond this belongs in its canvas read.
 */
export type V1Facts = {
  station: StationId
  seed: string
  hash: string
  symmetry: number
  size: number
  /** Needed by the page only to turn `field.traced` into a progress bar. */
  particles: number
}

export type V1Piece = {
  facts: V1Facts
  /** Particles per animation frame, sized to this station's cost per particle. */
  chunk: number
  createField: () => Field
  /** Trace the next `count` particles. True once every particle is down. */
  trace: (field: Field, count: number) => boolean
  /** Resolve the field that is already in memory. Never re-traces. */
  resolve: (field: Field, mode: RenderMode) => Uint8ClampedArray
  read: (progress: number) => ReadRow[]
  swatches: (n?: number) => string[]
  recipe: (mode: RenderMode, take: Take) => Recipe
  avatarNote: (mode: RenderMode) => string
  /** What the fold actually does to THIS station's coordinate. */
  foldNote: string
  /** The seed-box paragraph, in this station's own terms. */
  seedNote: string
  /** What to tell the prompt director about this station. */
  seedHelp: string
}

/** Resolve a spec into a tracer. */
export function v1Piece(spec: ArtSpec): V1Piece {
  if (spec.station === 'vortex') {
    const plan = planVortex(spec)
    return {
      facts: {
        station: plan.station,
        seed: plan.seed,
        hash: plan.hash,
        symmetry: plan.symmetry,
        size: plan.size,
        particles: plan.particles,
      },
      chunk: vortexChunk(plan),
      createField: () => createField(plan),
      trace: (field, count) => traceVortex(field, plan, count),
      resolve: (field, mode) => resolve(field, plan, mode),
      read: (progress) => readVortex(plan, progress),
      swatches: (n) => vortexSwatches(plan, n),
      recipe: (mode, take) => vortexRecipeOf(plan, mode, take),
      avatarNote: (mode) => vortexAvatarNote(plan, mode),
      foldNote:
        'How many arms the wave itself has. The fold is a term inside the equation — sin(n·θ) — so raising it does not mirror a finished field, it changes which field gets traced in the first place.',
      seedNote:
        'The phrase is split four ways: one stream draws the eight coefficients, one gives every particle its birthplace and brightness, one shapes the turbulence and one decides where escaped particles come back. Move a letter and all four are dealt again.',
      seedHelp:
        "V1's vortex station reads the whole phrase and splits it four ways, so length is not wasted — a long, specific line moves as much of the piece as a short one.",
    }
  }

  // Station 01, and the fallback for anything not yet built: an unbuilt station
  // is never selectable in the grid, so landing here means a stale URL or a
  // hand-typed id, and the first station is a better answer than a blank canvas.
  const plan = planTrace(spec)
  return {
    facts: {
      station: plan.station,
      seed: plan.seed,
      hash: plan.hash,
      symmetry: plan.symmetry,
      size: plan.size,
      particles: plan.particles,
    },
    chunk: Math.max(16, Math.round(plan.particles / 36)),
    createField: () => createField(plan),
    trace: (field, count) => traceParticles(field, plan, count),
    resolve: (field, mode) => resolve(field, plan, mode),
    read: (progress) => readTrace(plan, progress),
    swatches: (n) => palette(plan.seed, n),
    recipe: (mode, take) => recipeOf(plan, mode, take),
    avatarNote: (mode) => avatarNote(plan, mode),
    foldNote: 'How many times the traced field is folded around its centre.',
    seedNote:
      'The whole piece is hashed from these words. The same seed always paints the same artwork, so a piece is shareable as a phrase.',
    seedHelp:
      "V1's first station hashes the phrase into sixteen field parameters at once, so a few vivid words move the whole picture.",
  }
}

/** The station's display name, for labels that sit outside the canvas read. */
export function v1StationName(id: StationId): string {
  return getStation(id)?.name || id
}
