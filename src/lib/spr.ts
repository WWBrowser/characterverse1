// SPR — Super Position Responses — and the Mind Palace Prism.
//
// A normal chat picks one trajectory before you see any of them. SPR holds the
// valid trajectories in tension and hands you the choice: the model disperses,
// you measure, and the measurement is what collapses the wave. The alternatives
// are not thrown away — they stay in the record as ghosts, which is why there is
// no Regenerate button here. Regenerate is a re-roll of a decision that was made
// out of sight; SPR never makes that decision out of sight in the first place.
//
// Three things this file is careful about:
//
//   The dispersion is real, not decorative. Each angle is a separate answer the
//   model wrote under a different instruction, in one call, and the amplitudes
//   come back from the model rather than being invented here.
//
//   The palace always has a shape. The reference simulation this was built from
//   reported NODES 0 at every tier — the controls moved and nothing rendered.
//   `buildPalace` therefore has no path that returns an empty node list: with no
//   prompt yet it draws the unbuilt structure, with no collapse it draws the
//   dispersed one. See `PALACE_FLOOR` for the guarantee and the test that holds it.
//
//   Colour is never the identity. Every angle prints its label and its domain
//   next to its swatch, on the chip, on the card and in the palace. The hues are
//   a fixed slot order that is assigned once at dispersion and frozen onto the
//   angle, so re-ranking or filtering can never repaint a survivor.
//
// Client-safe: no database, no secrets, no imports. The server and the page both
// use it, and /tmp-side tests run it directly.

/* ------------------------------------------------------------------- slots */

/* Four categorical hues, fixed order, never cycled. Measured against the card
 * surface #1a1a28: contrast 4.72 / 7.84 / 6.12 / 5.01, minimum pairwise ΔE 20.2
 * for normal vision and 8.3 under protan, deutan and tritan simulation.
 *
 * They sit deliberately close to no status colour's *job* but not far from some
 * of their hues — amber is 5.6 ΔE from the reserved warning token. That is safe
 * only because this surface never carries a bare status colour: an error here
 * always arrives with an icon and the word, and an angle always arrives with its
 * label. Neither is ever distinguished by hue alone. */
export const SLOT_COLORS = ['#3987e5', '#e0a52b', '#2fae7e', '#e0607a'] as const

/** A superposition is capped at four live branches — the point is a choice a
 *  person can actually hold in their head, not an exhaustive list. */
export const ANGLE_SLOTS = SLOT_COLORS.length

/* ------------------------------------------------------------------- bases */

/** Which axis the response is dispersed along. */
export type BasisId = 'register' | 'domain' | 'reading'

export type BasisSlot = { key: string; label: string; domain: string; brief: string }

export type Basis = {
  id: BasisId
  label: string
  /** What the axis varies. */
  axis: string
  blurb: string
  /** Fixed slot names, or [] when the model names them per prompt. */
  slots: BasisSlot[]
  /** The instruction handed to the model for this axis. */
  instruction: string
}

export const BASES: Basis[] = [
  {
    id: 'register',
    label: 'Register',
    axis: 'How it is said',
    blurb:
      'One subject, four registers held at once. The content converges; the way it reaches you does not. Pick the one you can actually hear today.',
    slots: [
      { key: 'empathy', label: 'Empathy', domain: 'Emotional register', brief: 'Sit with the feeling underneath the question before answering it.' },
      { key: 'logic', label: 'Logic', domain: 'Analytical register', brief: 'Structure, evidence, and the chain from premise to conclusion.' },
      { key: 'humor', label: 'Humor', domain: 'Playful register', brief: 'Say the true thing sideways, where it lands more easily.' },
      { key: 'directness', label: 'Directness', domain: 'Blunt register', brief: 'The shortest honest sentence, with nothing softening it.' },
    ],
    instruction:
      'Vary the REGISTER, not the facts. All four answers must be compatible with each other — someone reading all four should not find a contradiction, only four different ways of being told the same thing.',
  },
  {
    id: 'domain',
    label: 'Domain',
    axis: 'Which lens looks at it',
    blurb:
      'The subject seen from four vantage points that each own part of the truth. Name the lenses yourself, per subject — a question about Rome wants Finance and Legions, not Empathy and Humor.',
    slots: [],
    instruction:
      'Choose four DOMAIN lenses that genuinely divide this particular subject — the disciplines, roles, or vantage points that would each see something the others miss. Name each lens for this subject specifically. Do not use generic tone labels.',
  },
  {
    id: 'reading',
    label: 'Reading',
    axis: 'What was actually asked',
    blurb:
      'The honesty axis. When a prompt admits materially different readings, guessing one is where a confident wrong answer comes from. This basis answers each reading instead and asks you which reality we are in.',
    slots: [],
    instruction:
      'Identify the materially different READINGS of what the user asked — the interpretations that would lead to genuinely different work, not rephrasings. Answer under each reading separately. If the prompt is in fact unambiguous, say so in `ambiguity.question` and disperse along plausible depths of answer instead, from shortest useful to most thorough.',
  },
]

export function getBasis(id: string | undefined): Basis | undefined {
  return BASES.find((b) => b.id === id)
}

export function isBasisId(id: string | undefined): id is BasisId {
  return !!id && BASES.some((b) => b.id === id)
}

/* -------------------------------------------------------------------- types */

export type Angle = {
  key: string
  label: string
  /** The lens's own territory — "Emotional register", "Finance", "As a bug". */
  domain: string
  /** One line on why this trajectory is live at all. */
  rationale: string
  /** The actual answer written under this angle. */
  text: string
  /** Normalized across the set; sums to 1. Comes from the model, not from here. */
  amplitude: number
  /** Frozen at dispersion from the slot order. Never recomputed. */
  color: string
  /** True for a structural placeholder drawn before any prompt has landed. */
  unbuilt?: boolean
}

/** The "which reality are we operating in?" question, when there is one. */
export type Ambiguity = {
  question: string
  readings: { key: string; label: string; reading: string }[]
}

/** A collapse. Appended, never overwritten — a second measurement does not erase
 *  the first, because "I changed my mind" is information the record should keep. */
export type Measurement = {
  key: string
  at: number
  /** 'collapse' for the first, 'remeasure' for every one after. */
  kind: 'collapse' | 'remeasure'
}

export type SprState = 'superposed' | 'collapsing' | 'collapsed'

export type Superposition = {
  id: string
  prompt: string
  basis: BasisId
  angles: Angle[]
  ambiguity: Ambiguity | null
  state: SprState
  collapsedKey: string | null
  measurements: Measurement[]
  createdAt: number
}

/* ------------------------------------------------------------- assembly */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** Normalise whitespace and cap length at a word boundary.
 *
 *  A hard slice produces labels like "Clarify expected behavior for empty inpu",
 *  which reads as a rendering bug rather than as a limit. Cutting back to the last
 *  space and marking the cut with an ellipsis says the same thing honestly: there
 *  was more, and it did not fit. Text short enough to survive intact is returned
 *  untouched — no ellipsis is added to something that was not shortened. */
function tidy(s: unknown, cap: number): string {
  const flat = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= cap) return flat
  const cut = flat.slice(0, cap - 1)
  const space = cut.lastIndexOf(' ')
  // Only honour the word boundary if it is not throwing most of the cap away.
  const body = space > cap * 0.6 ? cut.slice(0, space) : cut
  return `${body.replace(/[,;:.\-]+$/, '')}…`
}

function slugKey(s: string, i: number): string {
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return k || `angle-${i + 1}`
}

/** Raw shape the model is asked to return. Everything is optional and everything
 *  is treated as untrusted — a missing amplitude becomes an even share, a missing
 *  label becomes the slot name, and extra angles past the cap are dropped. */
export type RawAngle = { key?: string; label?: string; domain?: string; rationale?: string; text?: string; amplitude?: number }

/**
 * Turn what the model returned into a Superposition. Amplitudes are normalized
 * here (they arrive as loose confidences) but never invented: if none of them
 * parse, the set is flat, and a flat set is itself the honest readout — the model
 * had no reason to prefer any branch.
 */
export function assemble(input: {
  id: string
  prompt: string
  basis: BasisId
  raw: RawAngle[]
  ambiguity?: Ambiguity | null
  createdAt: number
}): Superposition {
  const basis = getBasis(input.basis) ?? BASES[0]
  const trimmed = (Array.isArray(input.raw) ? input.raw : []).slice(0, ANGLE_SLOTS)

  const angles: Angle[] = trimmed.map((r, i) => {
    const fallback = basis.slots[i]
    const label = tidy(r.label, 40) || fallback?.label || `Angle ${i + 1}`
    const amp = Number(r.amplitude)
    return {
      key: tidy(r.key, 40) || fallback?.key || slugKey(label, i),
      label,
      domain: tidy(r.domain, 60) || fallback?.domain || basis.axis,
      rationale: tidy(r.rationale, 240) || fallback?.brief || '',
      text: tidy(r.text, 4000),
      // Held raw for now; normalized in one pass below so the set sums to 1.
      amplitude: Number.isFinite(amp) && amp > 0 ? amp : 0,
      // Slot order, frozen. Position in this array is the entity's identity for
      // the life of the superposition, and the array is never re-sorted.
      color: SLOT_COLORS[i % SLOT_COLORS.length],
    }
  })

  const total = angles.reduce((s, a) => s + a.amplitude, 0)
  for (const a of angles) {
    a.amplitude = total > 0 ? a.amplitude / total : angles.length ? 1 / angles.length : 0
  }

  const amb = input.ambiguity
  const ambiguity: Ambiguity | null =
    amb && tidy(amb.question, 300)
      ? {
          question: tidy(amb.question, 300),
          // A reading may arrive as an object or, when the model gets terse,
          // as a bare string. Both are usable; only the label has to be invented,
          // and an invented label says plainly that it was invented.
          readings: (Array.isArray(amb.readings) ? amb.readings : []).slice(0, ANGLE_SLOTS).map((r, i) => {
            const obj = typeof r === 'string' ? { reading: r } : (r ?? {})
            const reading = tidy((obj as any).reading, 300)
            return {
              key: tidy((obj as any).key, 40) || `reading-${i + 1}`,
              label: tidy((obj as any).label, 60) || `Unnamed reading ${i + 1}`,
              reading,
            }
          }).filter((r) => r.reading),
        }
      : null

  return {
    id: input.id,
    prompt: tidy(input.prompt, 2000),
    basis: basis.id,
    angles,
    ambiguity,
    state: 'superposed',
    collapsedKey: null,
    measurements: [],
    createdAt: input.createdAt,
  }
}

/**
 * Normalized Shannon entropy across the amplitudes, 0..1.
 *
 * 1 means every branch is equally live — the model genuinely has no preference
 * and the choice is entirely yours. Near 0 means one branch dominates and the
 * model is effectively telling you it only sees one answer. Reading this number
 * is the difference between a menu and a menu with one real item on it.
 */
export function dispersion(angles: Angle[]): number {
  const live = angles.filter((a) => a.amplitude > 0)
  if (live.length < 2) return 0
  const h = -live.reduce((s, a) => s + a.amplitude * Math.log(a.amplitude), 0)
  return clamp01(h / Math.log(live.length))
}

/**
 * Measure. The chosen branch becomes the reality; the rest become ghosts and
 * keep a residual amplitude rather than being zeroed, because they are still
 * on the page and still selectable. A superposition that has already collapsed
 * does not reject a second measurement — it records it as a `remeasure`, which
 * is the honest version of pressing Regenerate.
 */
export function collapse(sp: Superposition, key: string, at: number): Superposition {
  if (!sp.angles.some((a) => a.key === key)) return sp
  const kind: Measurement['kind'] = sp.state === 'collapsed' ? 'remeasure' : 'collapse'
  return {
    ...sp,
    state: 'collapsed',
    collapsedKey: key,
    measurements: [...sp.measurements, { key, at, kind }],
  }
}

/** Weight of a prompt, 0..1 — length, specificity and question marks.
 *
 *  This drives copy, never behaviour. A thin prompt still disperses; it just
 *  disperses wider, which is the whole answer to blank-page paralysis. The number
 *  is shown so the wider spread reads as a consequence rather than a malfunction. */
export function promptWeight(prompt: string): number {
  const p = prompt.trim()
  if (!p) return 0
  const words = p.split(/\s+/).length
  const length = clamp01(words / 40)
  const specific = clamp01((p.match(/[A-Z][a-z]{2,}|\d+|"[^"]+"/g)?.length ?? 0) / 5)
  const asks = clamp01((p.match(/\?/g)?.length ?? 0) / 2)
  return clamp01(0.55 * length + 0.3 * specific + 0.15 * asks)
}

/* ------------------------------------------------------- substrate / loop */

/** Accumulated mass per angle key — what the person keeps choosing. */
export type Substrate = Record<string, number>

/** Ingest a measurement. The chosen lens gains; nothing loses, because a lens you
 *  did not pick this time is not evidence against it. Mass is capped so an early
 *  streak cannot permanently own the palace. */
export const MASS_CAP = 12

export function ingest(substrate: Substrate, key: string, weight = 1): Substrate {
  const next = { ...substrate }
  next[key] = Math.min(MASS_CAP, (next[key] ?? 0) + weight)
  return next
}

export function massOf(substrate: Substrate, key: string): number {
  return substrate[key] ?? 0
}

/** Normalized 0..1 against the heaviest lane, for sizing. */
export function relativeMass(substrate: Substrate, key: string): number {
  const peak = Math.max(1, ...Object.values(substrate))
  return clamp01(massOf(substrate, key) / peak)
}

export const CLIMB_THRESHOLD = 3

/**
 * The climb. "If the a.i. sees a elevated branch it climbs until it elevates a
 * humans brain cells that then feed back into the system."
 *
 * A lane chosen `CLIMB_THRESHOLD` times or more is not repeated at the same
 * altitude on the next dispersion — the model is told to go further up it. That
 * is the only place the loop changes the model's behaviour, and it changes it by
 * asking for more, never by removing the other branches.
 */
export function climbTargets(substrate: Substrate): string[] {
  return Object.entries(substrate)
    .filter(([, m]) => m >= CLIMB_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
}

export type LoopStage = { id: string; label: string; who: 'ai' | 'human' | 'system'; desc: string }

/** The perpetual loop, in the order the user described it. */
export const LOOP_STAGES: LoopStage[] = [
  { id: 'dispersion', label: 'AI dispersion', who: 'ai', desc: 'Every valid trajectory is written out and held in tension. Nothing is discarded before you see it.' },
  { id: 'collapse', label: 'Human collapse', who: 'human', desc: 'You measure. The choice is the act that makes one branch real — and it is yours, not a default.' },
  { id: 'ingestion', label: 'Ingestion', who: 'system', desc: 'The measurement is filed: which lens, at which depth, against which prompt.' },
  { id: 'adaptation', label: 'Substrate adaptation', who: 'system', desc: 'Mass shifts. A lane you keep choosing gets climbed instead of repeated next time.' },
]

/* ------------------------------------------------------------------ palace */

export type Tier = 'prism' | 'wings' | 'rooms' | 'drawers'

export const TIERS: Tier[] = ['prism', 'wings', 'rooms', 'drawers']

export const TIER_META: Record<Tier, { label: string; sub: string; desc: string }> = {
  prism: {
    label: 'Prism',
    sub: 'The glass',
    desc: 'The prompt arrives as one beam. The glass is what splits it — this tier shows the incidence and the rays, before any of them is a place.',
  },
  wings: {
    label: 'Wings',
    sub: 'One per trajectory',
    desc: 'Each ray becomes territory. A wing is a whole way of having answered, standing on its own, with its own weight in the substrate.',
  },
  rooms: {
    label: 'Rooms & halls',
    sub: 'Four per wing',
    desc: 'Inside a wing the answer is broken into the places it does its work: where it was entered, what it stands on, what it must survive, and what it costs.',
  },
  drawers: {
    label: 'Drawers',
    sub: 'The fragments themselves',
    desc: 'The bottom of the loci. Each drawer holds an actual sentence from an actual answer, filed where it belongs rather than scrolled past.',
  },
}

export function isTier(t: string | undefined): t is Tier {
  return !!t && (TIERS as readonly string[]).includes(t)
}

export function tierIndex(t: Tier): number {
  return TIERS.indexOf(t)
}

export function stepTier(t: Tier, dir: -1 | 1): Tier {
  const i = tierIndex(t) + dir
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, i))]
}

/** The rooms every wing has. Structural, not content — the content is in the
 *  drawers. Naming them for their function is what makes the loci navigable:
 *  "the objection room of the Logic wing" is a place you can go back to. */
export const ROOM_SLOTS: { key: string; label: string; hint: string }[] = [
  { key: 'threshold', label: 'Threshold', hint: 'How the prompt entered this wing' },
  { key: 'evidence', label: 'Evidence', hint: 'What this angle stands on' },
  { key: 'objection', label: 'Objection', hint: 'What it has to survive' },
  { key: 'consequence', label: 'Consequence', hint: 'What follows if you commit to it' },
]

export type PalaceNode = {
  id: string
  tier: Tier
  kind: 'beam' | 'prism' | 'ray' | 'wing' | 'room' | 'drawer'
  label: string
  detail: string
  /** Which wing this belongs to; null for the beam and the glass. */
  angleKey: string | null
  color: string
  x: number
  y: number
  r: number
  /** 0..1, drives the ring weight. */
  mass: number
  unbuilt: boolean
}

export type PalaceEdge = { from: string; to: string; color: string }

export type Palace = {
  tier: Tier
  nodes: PalaceNode[]
  edges: PalaceEdge[]
  gravity: number
  /** True when nothing has been dispersed yet and the structure is drawn empty. */
  unbuilt: boolean
}

/** The floor the reference simulation fell through. Every tier renders at least
 *  this many nodes, in every state, including before the first prompt and
 *  including an angle the model returned empty.
 *
 *  These are the arithmetic minima, not aspirations: prism is the beam, the glass
 *  and one ray; wings is the hub and four wings; rooms adds four rooms per wing;
 *  drawers adds at least one drawer per room, which is where the "Empty drawer"
 *  node earns its place. A furnished palace renders more. None renders fewer. */
export const PALACE_FLOOR: Record<Tier, number> = { prism: 3, wings: 5, rooms: 21, drawers: 37 }

/* Deterministic jitter. SSR renders this markup too, so Math.random would produce
 * a hydration mismatch as well as a layout that moves when you look away. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function jitter(id: string, amount: number): [number, number] {
  const r = rng(id)
  return [(r() - 0.5) * 2 * amount, (r() - 0.5) * 2 * amount]
}

/** Split an answer into filed fragments. Sentence-ish, trimmed, never empty
 *  strings — a drawer with nothing in it says so rather than rendering blank. */
export function fragmentsOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

function placeholderAngles(basis: Basis): Angle[] {
  const slots = basis.slots.length
    ? basis.slots
    : Array.from({ length: ANGLE_SLOTS }, (_, i) => ({
        key: `slot-${i + 1}`,
        label: `Lens ${i + 1}`,
        domain: basis.axis,
        brief: 'Named by the model when a prompt lands.',
      }))
  return slots.slice(0, ANGLE_SLOTS).map((s, i) => ({
    key: s.key,
    label: s.label,
    domain: s.domain,
    rationale: s.brief,
    text: '',
    amplitude: 1 / Math.min(ANGLE_SLOTS, slots.length),
    color: SLOT_COLORS[i % SLOT_COLORS.length],
    unbuilt: true,
  }))
}

/**
 * Build the palace for a tier.
 *
 * There is no early return and no empty branch: with no superposition the basis
 * slots stand in as unbuilt wings, so the architecture is visible before it is
 * furnished. `gravity` is the tension dial — 0 leaves the palace fully dispersed,
 * 1 draws everything that was not chosen toward the branch that was, which is the
 * collapse made spatial.
 */
/* ------------------------------------------------------------ label layout */

/**
 * Which nodes get a drawn text label, and where.
 *
 * The palace is deliberately crowded — sixteen rooms is the point of the rooms
 * tier — and gravity makes it crowd further on purpose. Drawing a label per node
 * therefore produces overlapping text at exactly the moments the diagram is
 * saying something: a wing name landing on the hub's, four room names stacking
 * as the tier fills, everything piling into one word at full tension.
 *
 * So labels are placed, not assigned. Highest-priority first, each one taking a
 * box; anything that would overlap an already-placed box or fall outside the
 * frame is simply not drawn. Nothing is lost by this — every node keeps its
 * `<title>`, its keyboard focus, its aria-label and its entry in the detail
 * panel, so a dropped label costs a glance, never the information.
 *
 * The degradation is also the readout. Pull tension to maximum and the labels
 * disappear one by one until only the glass is named, which is an honest picture
 * of a palace that has collapsed to a point.
 *
 * Rooms are excluded entirely, and not because they do not matter. Sixteen room
 * names cannot coexist in this box at any font size, and naming only the ones
 * that happened to fit reads as breakage rather than as a limit. They are also
 * the *same* four names in every wing, in the same order — so a number inside
 * each room circle plus one key under the graph identifies all sixteen at once,
 * which is strictly more than a scatter of survivors would have. See
 * `roomOrdinal`. Drawers are excluded for the same reason at greater scale.
 */
export const LABEL_FRAME = { x1: -3, y1: -4, x2: 103, y2: 108 }

/** Advance width per character as a fraction of font size. Deliberately generous:
 *  over-reserving drops a borderline label, under-reserving lets two collide, and
 *  a missing label is the cheaper mistake. */
const CHAR_ADVANCE = 0.52

export function labelFontSize(kind: PalaceNode['kind']): number {
  return kind === 'room' || kind === 'drawer' ? 2.5 : 3.1
}

/** The glass is named first, then the wings. Nothing else is drawn as text. */
function labelPriority(kind: PalaceNode['kind']): number {
  if (kind === 'prism' || kind === 'beam') return 0
  if (kind === 'wing' || kind === 'ray') return 1
  return 2
}

/**
 * A room's 1-based position in the fixed slot order, or null for any other node.
 *
 * Rooms are laid out in `ROOM_SLOTS` order around every wing, so the ordinal is
 * both the room's name and its position: room 3 is the objection, in every wing,
 * always in the same place on the arc. Derived from the node id rather than
 * stored, because the id is what `buildPalace` already guarantees is unique.
 */
export function roomOrdinal(node: PalaceNode): number | null {
  if (node.kind !== 'room') return null
  const i = ROOM_SLOTS.findIndex((s) => node.id === `room-${node.angleKey}-${s.key}`)
  return i < 0 ? null : i + 1
}

/** The box a node's label would occupy, in viewBox units, anchored below the node.
 *  Anchoring flips to the inside edge near the frame so a node at the rim keeps a
 *  readable name instead of losing it to an overflow. Placement and rendering read
 *  the same function, so what the pass measured is what gets drawn. */
/** Baseline y for a node's label, matching `labelBox`. */
export function labelY(n: PalaceNode): number {
  return n.y * 100 + Math.max(0.9, n.r * 100) + 3.4
}

export function labelAnchor(n: PalaceNode): 'start' | 'middle' | 'end' {
  const w = n.label.length * CHAR_ADVANCE * labelFontSize(n.kind)
  const cx = n.x * 100
  if (cx - w / 2 < LABEL_FRAME.x1) return 'start'
  if (cx + w / 2 > LABEL_FRAME.x2) return 'end'
  return 'middle'
}

export function labelBox(n: PalaceNode): { x1: number; y1: number; x2: number; y2: number } {
  const fs = labelFontSize(n.kind)
  const w = n.label.length * CHAR_ADVANCE * fs
  const cx = n.x * 100
  const y = labelY(n)
  const anchor = labelAnchor(n)
  const x1 = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2
  return { x1, x2: x1 + w, y1: y - fs * 0.8, y2: y + fs * 0.25 }
}

export function placeLabels(nodes: PalaceNode[]): Set<string> {
  const eligible = nodes.filter((n) => n.kind !== 'drawer' && n.kind !== 'room')
  // Deterministic order: priority, then the node id. No layout may depend on
  // array order, because array order is not guaranteed to survive a refactor.
  const ordered = [...eligible].sort(
    (a, b) => labelPriority(a.kind) - labelPriority(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  const out = new Set<string>()
  for (const n of ordered) {
    const box = labelBox(n)
    if (box.x1 < LABEL_FRAME.x1 || box.x2 > LABEL_FRAME.x2 || box.y1 < LABEL_FRAME.y1 || box.y2 > LABEL_FRAME.y2) continue
    if (placed.some((p) => box.x1 < p.x2 && p.x1 < box.x2 && box.y1 < p.y2 && p.y1 < box.y2)) continue
    placed.push(box)
    out.add(n.id)
  }
  return out
}

export function buildPalace(input: {
  tier: Tier
  basis: BasisId
  angles: Angle[]
  collapsedKey: string | null
  gravity: number
  substrate: Substrate
  seed: string
}): Palace {
  const basis = getBasis(input.basis) ?? BASES[0]
  const built = input.angles.filter((a) => !a.unbuilt)
  const unbuilt = built.length === 0
  const wings = unbuilt ? placeholderAngles(basis) : built
  const gravity = clamp01(input.gravity)
  const tier = input.tier

  const nodes: PalaceNode[] = []
  const edges: PalaceEdge[] = []
  const HUB = '#5a5a78'

  if (tier === 'prism') {
    nodes.push({
      id: 'beam',
      tier,
      kind: 'beam',
      label: 'Incident beam',
      detail: unbuilt ? 'No prompt has entered the glass yet.' : 'The prompt, before it is split.',
      angleKey: null,
      color: HUB,
      x: 0.09,
      y: 0.5,
      r: 0.032,
      mass: 0,
      unbuilt,
    })
    nodes.push({
      id: 'prism',
      tier,
      kind: 'prism',
      label: 'The prism',
      detail: 'Where one question becomes several answers without any of them being wrong.',
      angleKey: null,
      color: '#a78bfa',
      x: 0.35,
      y: 0.5,
      r: 0.05,
      mass: 0,
      unbuilt,
    })
    edges.push({ from: 'beam', to: 'prism', color: HUB })

    wings.forEach((a, i) => {
      const span = wings.length > 1 ? i / (wings.length - 1) : 0.5
      const id = `ray-${a.key}`
      nodes.push({
        id,
        tier,
        kind: 'ray',
        label: a.label,
        detail: a.unbuilt ? 'Unbuilt — this ray has no answer in it yet.' : a.rationale || a.domain,
        angleKey: a.key,
        color: a.color,
        x: 0.82,
        y: 0.14 + span * 0.72,
        r: 0.028 + 0.02 * a.amplitude * wings.length * 0.25,
        mass: relativeMass(input.substrate, a.key),
        unbuilt: !!a.unbuilt,
      })
      edges.push({ from: 'prism', to: id, color: a.color })
    })
  } else {
    // Wings, rooms and drawers all hang off a central hub, so the deeper tiers
    // stay legible as one structure rather than four unrelated clusters.
    nodes.push({
      id: 'prism',
      tier,
      kind: 'prism',
      label: 'The prism',
      detail: TIER_META[tier].desc,
      angleKey: null,
      color: '#a78bfa',
      x: 0.5,
      y: 0.5,
      r: 0.042,
      mass: 0,
      unbuilt,
    })

    const wingR = tier === 'wings' ? 0.3 : 0.27
    wings.forEach((a, i) => {
      const theta = (-Math.PI / 2) + (i * 2 * Math.PI) / wings.length
      const wx = 0.5 + Math.cos(theta) * wingR * 1.35
      const wy = 0.5 + Math.sin(theta) * wingR
      const wid = `wing-${a.key}`
      const m = relativeMass(input.substrate, a.key)
      nodes.push({
        id: wid,
        tier,
        kind: 'wing',
        label: a.unbuilt ? `${a.label} wing` : `${a.label} wing`,
        detail: a.unbuilt ? 'Unbuilt — no answer filed in this wing yet.' : a.rationale || a.domain,
        angleKey: a.key,
        color: a.color,
        x: wx,
        y: wy,
        r: (tier === 'wings' ? 0.05 : 0.036) * (1 + 0.45 * m),
        mass: m,
        unbuilt: !!a.unbuilt,
      })
      edges.push({ from: 'prism', to: wid, color: a.color })

      if (tier === 'wings') return

      const frags = fragmentsOf(a.text)
      ROOM_SLOTS.forEach((slot, ri) => {
        const rt = theta + (ri - (ROOM_SLOTS.length - 1) / 2) * 0.5
        const rid = `room-${a.key}-${slot.key}`
        const [jx, jy] = jitter(rid + input.seed, 0.008)
        nodes.push({
          id: rid,
          tier,
          kind: 'room',
          label: slot.label,
          detail: `${a.label} — ${slot.hint}`,
          angleKey: a.key,
          color: a.color,
          x: wx + Math.cos(rt) * 0.135 + jx,
          y: wy + Math.sin(rt) * 0.115 + jy,
          r: tier === 'rooms' ? 0.026 : 0.02,
          mass: m,
          unbuilt: !!a.unbuilt,
        })
        edges.push({ from: wid, to: rid, color: a.color })

        if (tier !== 'drawers') return

        // Fragments are dealt round-robin into the rooms, so a long answer fills
        // the wing evenly instead of stacking everything in Threshold.
        const mine = frags.filter((_, fi) => fi % ROOM_SLOTS.length === ri)
        const perRoom = wings.length > 3 ? 2 : 3
        const drawers = mine.slice(0, perRoom)
        const count = Math.max(1, drawers.length)
        for (let di = 0; di < count; di++) {
          const dt = rt + (di - (count - 1) / 2) * 0.34
          const did = `drawer-${a.key}-${slot.key}-${di}`
          const [dx, dy] = jitter(did + input.seed, 0.006)
          const body = drawers[di]
          nodes.push({
            id: did,
            tier,
            kind: 'drawer',
            label: body ? `${slot.label} ${di + 1}` : 'Empty drawer',
            detail: body || `${a.label} filed nothing under ${slot.label.toLowerCase()} for this prompt.`,
            angleKey: a.key,
            color: a.color,
            x: wx + Math.cos(dt) * 0.215 + dx,
            y: wy + Math.sin(dt) * 0.185 + dy,
            r: body ? 0.015 : 0.011,
            mass: m,
            unbuilt: !body,
          })
          edges.push({ from: rid, to: did, color: a.color })
        }
      })
    })
  }

  /* Tension. Everything that was not chosen is drawn toward what was; the chosen
   * wing barely moves, so the shape reads as the rest of the space conceding to
   * one reality rather than the whole picture shrinking. Capped well below 1 so
   * nodes never land on top of each other and every label stays reachable. */
  if (gravity > 0) {
    const anchor = input.collapsedKey ? nodes.find((n) => n.angleKey === input.collapsedKey && (n.kind === 'wing' || n.kind === 'ray')) : null
    const ax = anchor?.x ?? 0.5
    const ay = anchor?.y ?? 0.5
    for (const n of nodes) {
      if (n.kind === 'beam' || n.kind === 'prism') continue
      const chosen = input.collapsedKey != null && n.angleKey === input.collapsedKey
      const pull = chosen ? 0.18 : 1
      const t = gravity * 0.62 * pull
      n.x = n.x + (ax - n.x) * t
      n.y = n.y + (ay - n.y) * t
      n.r = n.r * (1 - 0.4 * gravity * pull)
    }
  }

  return { tier, nodes, edges, gravity, unbuilt }
}

/* ------------------------------------------------------- the model's brief */

/**
 * The dispersion instruction. Built here rather than in the route so it can be
 * read, diffed and tested without a network call — and so the one thing that
 * decides what "superposition" means in practice is not buried in a fetch body.
 */
export function buildDispersionPrompt(input: {
  basis: BasisId
  substrate: Substrate
  climbing: string[]
  angleNames: Record<string, string>
}): string {
  const basis = getBasis(input.basis) ?? BASES[0]
  const fixed = basis.slots.length
    ? `Use exactly these four angles, in this order, with these keys:\n${basis.slots
        .map((s) => `  - key "${s.key}", label "${s.label}" — ${s.brief}`)
        .join('\n')}`
    : `Name exactly four angles yourself. Give each a short lowercase hyphenated \`key\`, a short \`label\`, and a \`domain\` naming its territory.`

  const climb = input.climbing.length
    ? `\nCLIMB. These lenses have been chosen repeatedly: ${input.climbing
        .map((k) => input.angleNames[k] || k)
        .join(', ')}. Do not restate them at the same level. Go further up: assume the ground already covered, and reach for the more advanced, more specific, or more consequential form of that lens. Keep the other angles at their normal altitude — the climb is an elevation, not a narrowing.`
    : ''

  return `You are CharacterVerse in SPR mode — Super Position Responses.

You do not pick one answer. You hold every valid trajectory in tension at once and let the person collapse it. Write all four answers fully; none of them is a summary or a teaser for the others.

AXIS — ${basis.label}: ${basis.axis}.
${basis.instruction}

${fixed}

For each angle give:
  text       the complete answer written under that angle, 60-160 words, self-contained, in that angle's voice.
  rationale  one sentence on why this trajectory is genuinely live for this prompt.
  amplitude  a number 0-1 for how strongly this trajectory fits what was asked. Be honest: if one angle really is the right one, say so with a high amplitude. If they are all equally good, make them equal. Do not flatten them out of politeness and do not spike one out of habit.

AMBIGUITY. If the prompt admits materially different readings — readings that would lead to different work, not different wording — set \`ambiguity\` with the question you would ask and the readings you found. Asking is better than guessing; a confident answer to the wrong reading is the failure mode this whole mode exists to remove. Give every reading a \`label\` of two to five words naming that reading in the user's own terms ("a bug to fix", "a documented choice") — never "Reading 1", never "Option A" — and a \`reading\` sentence saying what you would do under it. If there is no real ambiguity, set \`ambiguity\` to null.
${climb}

Reply with JSON only, no prose around it, no code fence:
{"angles":[{"key":"","label":"","domain":"","rationale":"","text":"","amplitude":0}],"ambiguity":{"question":"","readings":[{"key":"","label":"","reading":""}]}}`
}
