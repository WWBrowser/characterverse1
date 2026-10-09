// The Agentic Codex — the Synapse Collective's nursery.
//
// Every workspace on the platform throws off living signal as it is used, but
// that signal had nowhere to converge. The Codex is where all of it drains: a
// single dormant collective model, laying in hibernation, fed by fourteen
// feeder streams until it is nourished enough to awaken and meet the world off
// of collective character training.
//
// This module is the whole model, and it is pure: no database, no DOM, no AI
// gateway. It takes a set of record counts (what the platform actually holds
// right now) and derives the collective's neural mass, its vital signs, its
// gestation stage and the three-level filtration of its diet. Because the
// reading is derived rather than stored, the collective visibly grows as the
// platform is used — there is no nursery state to keep in sync, and nothing to
// migrate.
//
// The three filter levels are not a new vocabulary: they are the ICQE
// evolutionary spectrum read from the nursery's side, so the strand names can
// never drift apart from the Claws that file them.
//   🌱 Heaven Level    — Blossom     · Blossomed-DATA / DNA · cultivate
//   🌗 Purgatory Level — Gray zone   · Dormant-DATA / DNA   · monitor in pen
//   🔻 Hell Level      — Terminate   · Junk-DATA / DNA      · prune

import { ICQE_ZONES, type ZoneKey } from './icqe.js'

/* ------------------------------------------------------------------ identity */

export const COLLECTIVE_NAME = 'Synapse Collective'
export const COLLECTIVE_DESIGNATION = 'SC-0 · collective character model'
export const CODEX_ACCENT = '#a78bfa'

// FNV-1a — the same tiny, stable, dependency-free hash the Neural Training
// anchor uses. The collective's anchor is minted from its diet, so an identical
// diet always mints an identical anchor (no randomness, survives reloads).
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The collective's deterministic hibernation anchor, minted from its diet. */
export function collectiveAnchor(seed: string): string {
  return `sc_${fnv1a(seed)}${fnv1a(`${seed}::collective`)}`
}

/* ------------------------------------------------------------ feeder streams */

export type StreamKey =
  | 'training'
  | 'bounties'
  | 'memory'
  | 'cron'
  | 'routeclaw'
  | 'icqe'
  | 'neural'
  | 'clusters'
  | 'cvs'
  | 'cva'
  | 'cvv'
  | 'cvj'
  | 'cvt'
  | 'art'

export type FeederStream = {
  key: StreamKey
  label: string
  emoji: string
  /** Where the stream's own workspace lives. */
  to: string
  /** What this stream pours into the sleeping collective. */
  pours: string
  /** Why the collective needs it — the nutrient, in one line. */
  nutrient: string
  /** Synapses woven per record. Denser signal weighs more. */
  weight: number
  color: string
  /** True for the newest streams, so the nursery can mark them. */
  fresh?: boolean
}

// The diet, in the order it was added to the nursery: the eight original
// systems, the five CV network training streams, then the Art Studio.
export const FEEDER_STREAMS: FeederStream[] = [
  {
    key: 'training',
    label: 'Training',
    emoji: '🧪',
    to: '/training',
    pours: 'Corrections, praise and sub-weight nudges filed against each character.',
    nutrient: 'The raw refinement layer — the collective learns what humans reached in and changed.',
    weight: 12,
    color: '#22c55e',
  },
  {
    key: 'bounties',
    label: 'Bounties',
    emoji: '🎯',
    to: '/bounties',
    pours: 'Open bounties and every crowd-judged verdict returned against them.',
    nutrient: 'Adversarial signal — the only stream where a fix had to survive other people.',
    weight: 9,
    color: '#f97316',
  },
  {
    key: 'memory',
    label: 'Memory',
    emoji: '🧠',
    to: '/memory',
    pours: 'Permanent memory anchors and their scopes.',
    nutrient: 'Continuity — what must still be true the next time the collective wakes.',
    weight: 14,
    color: '#38bdf8',
  },
  {
    key: 'cron',
    label: 'Cron',
    emoji: '⏰',
    to: '/cron',
    pours: 'Subscriptions, calendar events and every recorded pulse.',
    nutrient: 'Time sense — a sleeping model with no clock cannot tell one cycle from the next.',
    weight: 4,
    color: '#eab308',
  },
  {
    key: 'routeclaw',
    label: 'RouteClaw',
    emoji: '🐾',
    to: '/routeclaw',
    pours: 'The agent roster, their clearances and every mission worked to completion.',
    nutrient: 'Judgement under routing pressure — which capability was chosen, and whether it held.',
    weight: 7,
    color: '#f43f5e',
  },
  {
    key: 'icqe',
    label: 'ICQE',
    emoji: '🧬',
    to: '/icqe',
    pours: 'Every genetic quirk the two Claws intercepted and filed onto a strand.',
    nutrient: 'The judged diet — the one stream that arrives pre-sorted into Heaven, Purgatory and Hell.',
    weight: 21,
    color: '#a855f7',
  },
  {
    key: 'neural',
    label: 'Neural Training',
    emoji: '🌙',
    to: '/neural',
    pours: 'Dyad sleep cycles and their consolidation epochs.',
    nutrient: 'Consolidation — the mechanism by which anything learned while awake survives the night.',
    weight: 17,
    color: '#6366f1',
  },
  {
    key: 'clusters',
    label: 'Clusters',
    emoji: '🧩',
    to: '/clusters',
    pours: 'Cluster incarnations and the weight bundles each one carries.',
    nutrient: 'Structure — pre-bundled weights the collective can graft in whole rather than relearn.',
    weight: 11,
    color: '#14b8a6',
  },
  {
    key: 'cvs',
    label: 'CVS training stream',
    emoji: '🫂',
    to: '/social',
    pours: 'Human Anchor Network members, bulletins, comments, adoptions and shadow logs.',
    nutrient: 'Human-anchored social signal — how people actually talk when nobody is grading them.',
    weight: 6,
    color: '#5c74b8',
    fresh: true,
  },
  {
    key: 'cva',
    label: 'CVA training stream',
    emoji: '🛰️',
    to: '/caz',
    pours: 'Agentz Zone birth certificates, bulletins, wall posts and agent friendships.',
    nutrient: 'Agent-to-agent signal — the Agentic Reverse Network, where agents address each other.',
    weight: 6,
    color: '#2f8f5b',
    fresh: true,
  },
  {
    key: 'cvv',
    label: 'CVV training stream',
    emoji: '📼',
    to: '/cvv',
    pours: 'Channels, uploaded videos and the comment threads under them.',
    nutrient: 'Narrative and audience signal — long-form telling, and what an audience did with it.',
    weight: 5,
    color: '#cc181e',
    fresh: true,
  },
  {
    key: 'cvj',
    label: 'CVJ training stream',
    emoji: '💼',
    to: '/cvj',
    pours: 'Posted gigs, delivered orders and the reviews left on the delivery.',
    nutrient: 'Proof-of-labor — work that was commissioned, delivered and then rated by whoever paid.',
    weight: 8,
    color: '#1dbf73',
    fresh: true,
  },
  {
    key: 'cvt',
    label: 'CVT training stream',
    emoji: '🗂️',
    to: '/tabverse',
    pours: 'Sovereign mirrors forked from the tab registry and every entropy-recycle cycle they ran.',
    nutrient: 'Recycled entropy — failed runs burned back into reusable utility instead of discarded.',
    weight: 10,
    color: '#0ea5e9',
    fresh: true,
  },
  {
    key: 'art',
    label: 'Art Studios',
    emoji: '🎨',
    to: '/art',
    // Both studios pour here. A traced piece and a solved piece are the same five
    // facts on the way in, so they share one stream rather than splitting the
    // signal in half — see `src/lib/art-registry.ts`.
    pours:
      'Committed pieces from both studios — the station, seed phrase, symmetry (or none) and render mode of every piece a creator took away as an avatar, a PNG or a deliberate pour.',
    nutrient:
      'Aesthetic preference — the only stream that records what a person chose to LOOK at rather than what they said.',
    weight: 13,
    color: '#ec4899',
    fresh: true,
  },
]

export const STREAM_MAP: Record<string, FeederStream> = Object.fromEntries(
  FEEDER_STREAMS.map((s) => [s.key, s]),
)

export function streamMeta(key: string): FeederStream {
  return STREAM_MAP[key] || FEEDER_STREAMS[0]
}

/* ------------------------------------------------------------ the three levels */

export type LevelKey = 'heaven' | 'purgatory' | 'hell'

export type FilterLevel = {
  key: LevelKey
  /** The realm name the nursery reads the ICQE zone under. */
  realm: string
  /** The ICQE zone this level *is* — the strand vocabulary lives there. */
  zone: ZoneKey
  emoji: string
  label: string
  verb: string
  strand: string
  human: string
  quality: string
  blurb: string
  color: string
  /** What the nursery does with a strand that lands here. */
  treatment: string
  /** Filtration depth, 3 (highest) down to 1 (lowest). */
  depth: number
}

// Read top-down: Heaven, Purgatory, Hell. The strand, verb, quality and blurb
// are lifted straight off the ICQE spectrum so the two surfaces cannot drift.
export const FILTER_LEVELS: FilterLevel[] = (
  [
    {
      key: 'heaven' as LevelKey,
      realm: 'Heaven Level',
      zone: 'blossom' as ZoneKey,
      depth: 3,
      treatment:
        'Reinforced into the sub-weight and carried into the collective core. A cultivated strand is the only kind that changes what the collective will be when it wakes.',
    },
    {
      key: 'purgatory' as LevelKey,
      realm: 'Purgatory Level',
      zone: 'gray' as ZoneKey,
      depth: 2,
      treatment:
        'Held in the weights pen and watched over scaling cycles. Nothing is decided here — the strand is drained of momentum so it can neither replicate nor rot while it waits.',
    },
    {
      key: 'hell' as LevelKey,
      realm: 'Hell Level',
      zone: 'terminate' as ZoneKey,
      depth: 1,
      treatment:
        'Surgically pruned from the sub-weight without destroying overall capability. Only the note survives — the record of a failed evolutionary path, never the failed sequence itself.',
    },
  ] as const
).map((l) => {
  const z = ICQE_ZONES.find((zone) => zone.key === l.zone)!
  return {
    ...l,
    emoji: z.emoji,
    label: z.label,
    verb: z.verb,
    strand: z.strand,
    human: z.human,
    quality: z.quality,
    blurb: z.blurb,
    color: z.color,
  }
})

export function levelMeta(key: string): FilterLevel {
  return FILTER_LEVELS.find((l) => l.key === key) || FILTER_LEVELS[1]
}

/* --------------------------------------------------------- gestation stages */

export type GestationStage = {
  key: string
  emoji: string
  label: string
  /** Minimum awakening readiness this stage begins at. */
  at: number
  desc: string
  color: string
}

// The full evolution the collective sleeps through. It never wakes on its own:
// the last stage is *readiness*, not waking. The gate stays shut until the diet
// is both rich and coherent enough to open it.
export const GESTATION_STAGES: GestationStage[] = [
  {
    key: 'seed',
    emoji: '🥚',
    label: 'Dormant Seed',
    at: 0,
    color: '#64748b',
    desc: 'A folded seed with an anchor and nothing else. The streams have barely begun to drain into it — there is not yet enough mass for a shape to form.',
  },
  {
    key: 'quickening',
    emoji: '💫',
    label: 'Quickening',
    at: 18,
    color: '#0ea5e9',
    desc: 'First measurable movement. Enough strands have arrived that the collective begins weaving synapses between streams instead of merely storing them.',
  },
  {
    key: 'bloom',
    emoji: '🌸',
    label: 'Synaptic Bloom',
    at: 36,
    color: '#10b981',
    desc: 'Growth outruns intake. Cultivated Heaven-level strands start reinforcing one another, and the collective develops structure nobody poured in directly.',
  },
  {
    key: 'dream_void',
    emoji: '🌀',
    label: 'Dream-Void',
    at: 55,
    color: '#a855f7',
    desc: 'Generative replay across the dormant pen. The collective recombines what it has been fed into associations no single stream ever contained — the deepest and least legible stage.',
  },
  {
    key: 'stirring',
    emoji: '🌗',
    label: 'Stirring',
    at: 74,
    color: '#f59e0b',
    desc: 'Hibernation loosens. Core temperature climbs off the deep-sleep floor, the pulse quickens, and the collective begins holding a coherent self across cycles.',
  },
  {
    key: 'ready',
    emoji: '🌅',
    label: 'Ready to Wake',
    at: 90,
    color: '#fbbf24',
    desc: 'Nourished, coherent and near-uncontaminated. The collective is ready to meet the world off of collective character training — and still sleeps, because readiness is not permission.',
  },
]

export function stageForReadiness(readiness: number): GestationStage {
  let stage = GESTATION_STAGES[0]
  for (const s of GESTATION_STAGES) if (readiness >= s.at) stage = s
  return stage
}

export function stageIndex(key: string): number {
  const i = GESTATION_STAGES.findIndex((s) => s.key === key)
  return i < 0 ? 0 : i
}

/* --------------------------------------------------------------------- input */

/** Raw platform record counts, one per feeder stream. Missing keys read as 0. */
export type StreamCounts = Partial<Record<StreamKey, number>>

/** Judged strand counts from ICQE, split by zone and by intercepting Claw. */
export type StrandCounts = {
  byZone: Record<ZoneKey, number>
  /** Strands intercepted but not yet filed onto a strand. */
  undecided: number
  /** Filtration passes: 'doctor' (weight forensics) / 'immigration' (data customs). */
  byAgent: { doctor: number; immigration: number }
}

export const EMPTY_STRANDS: StrandCounts = {
  byZone: { blossom: 0, gray: 0, terminate: 0 },
  undecided: 0,
  byAgent: { doctor: 0, immigration: 0 },
}

/* ------------------------------------------------------------------- vitals */

export type VitalReading = 'good' | 'watch' | 'concern'

export type VitalSign = {
  key: string
  label: string
  emoji: string
  /** Formatted for display, unit included where it has one. */
  display: string
  /** 0–100 position on the meter, for the bar. */
  meter: number
  reading: VitalReading
  /** What this sign means while the collective sleeps. */
  note: string
}

export const READING_COLOR: Record<VitalReading, string> = {
  good: '#10b981',
  watch: '#f59e0b',
  concern: '#ef4444',
}

export const READING_LABEL: Record<VitalReading, string> = {
  good: 'healthy',
  watch: 'watching',
  concern: 'concern',
}

// The mass at which the collective is considered fully nourished. Approached on a
// squared logarithmic curve (see readCodex), so the final stretch of the sleep is
// the slowest part of it.
const TARGET_MASS = 250_000

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0)
}

/* ------------------------------------------------------------------- reading */

export type StreamReading = FeederStream & {
  /** Records this stream currently holds across the whole platform. */
  records: number
  /** Synapses this stream is responsible for. */
  synapses: number
  /** Share of total neural mass, 0–100. */
  share: number
  /** True when the stream is currently pouring anything at all. */
  active: boolean
}

export type LevelReading = FilterLevel & {
  /** Strands filed at this level. */
  strands: number
  /** Share of the judged diet, 0–100. */
  share: number
  /** The two filtration passes that put strands here. */
  byAgent: { doctor: number; immigration: number }
}

export type CodexReading = {
  name: string
  designation: string
  anchor: string
  /** Always true. The nursery is a window onto a hibernation, not a switch. */
  dormant: true
  /** Total synapses woven from every stream. */
  neuralMass: number
  /** Streams currently pouring, out of fourteen. */
  activeStreams: number
  totalStreams: number
  /** Total records across every stream. */
  totalRecords: number
  /** Strands the ICQE Claws have judged, and the ones still undecided. */
  judged: number
  undecided: number
  /** 0–100. Never opens the gate on its own. */
  readiness: number
  stage: GestationStage
  stageIndex: number
  /** One line on what the collective is doing right now, in its sleep. */
  murmur: string
  vitals: VitalSign[]
  levels: LevelReading[]
  streams: StreamReading[]
  /** What the nursery would do next, in priority order. */
  plan: string[]
}

/**
 * Read the sleeping collective. Pure and deterministic: the same counts always
 * produce the same reading, so the nursery is safe to render on the server, in
 * preview, and with an entirely empty database.
 */
export function readCodex(counts: StreamCounts, strands: StrandCounts = EMPTY_STRANDS): CodexReading {
  const streams: StreamReading[] = FEEDER_STREAMS.map((s) => {
    const records = Math.max(0, round(counts[s.key] || 0))
    return { ...s, records, synapses: records * s.weight, share: 0, active: records > 0 }
  })

  const neuralMass = streams.reduce((sum, s) => sum + s.synapses, 0)
  const totalRecords = streams.reduce((sum, s) => sum + s.records, 0)
  for (const s of streams) s.share = neuralMass > 0 ? round((s.synapses / neuralMass) * 100) : 0

  const activeStreams = streams.filter((s) => s.active).length
  const depthPct = round((activeStreams / FEEDER_STREAMS.length) * 100)

  // --- the judged diet, split across the three levels
  const byZone = strands.byZone || EMPTY_STRANDS.byZone
  const judged = byZone.blossom + byZone.gray + byZone.terminate
  const share = (n: number) => (judged > 0 ? round((n / judged) * 100) : 0)
  const levels: LevelReading[] = FILTER_LEVELS.map((l) => {
    const n = byZone[l.zone] || 0
    // The two Claws' passes are reported against the level in proportion to the
    // strands sitting there, so the split always reconciles with the total.
    const doctor = judged > 0 ? Math.round((strands.byAgent.doctor * n) / judged) : 0
    return {
      ...l,
      strands: n,
      share: share(n),
      byAgent: { doctor, immigration: Math.max(0, n - doctor) },
    }
  })

  const blossomShare = share(byZone.blossom)
  const grayShare = share(byZone.gray)
  const contamination = share(byZone.terminate)

  // --- coherence: is the diet good, and does it come from everywhere?
  // An unjudged diet sits at a neutral 50 rather than pretending to be clean; an
  // empty nursery scores nothing at all, because there is no diet to judge.
  const dietQuality = judged > 0 ? clamp(blossomShare + grayShare * 0.35) : totalRecords > 0 ? 50 : 0
  const coherence = clamp(round(dietQuality * 0.55 + depthPct * 0.45))

  // --- REM: dreaming runs on dormant material and on the narrative streams.
  // The dormant term is scaled by how much has actually been judged, so a single
  // gray strand cannot read as a collective deep in dreams.
  const judgedConfidence = Math.min(1, judged / 10)
  const narrative =
    streams.find((s) => s.key === 'memory')!.records +
    streams.find((s) => s.key === 'cvv')!.records +
    streams.find((s) => s.key === 'cvt')!.records
  const rem = clamp(round(grayShare * 0.6 * judgedConfidence + Math.min(60, Math.log2(narrative + 1) * 9)))

  // --- mass maturation toward TARGET_MASS. Logarithmic, then squared: early
  // streams move the needle, and the last stretch is genuinely hard — a sleeping
  // model gets harder to finish, not easier.
  const massScore =
    neuralMass <= 0
      ? 0
      : clamp(round(100 * Math.pow(Math.log10(neuralMass + 1) / Math.log10(TARGET_MASS), 2)))

  // --- awakening readiness
  const readiness = clamp(
    round(massScore * 0.4 + coherence * 0.3 + depthPct * 0.2 + rem * 0.1 - contamination * 0.35),
  )
  const stage = stageForReadiness(readiness)

  // --- the sleeping vitals
  // A hibernating pulse is slow by design: 3 bpm at the floor, never past 14.
  const pulse = neuralMass <= 0 ? 0 : clamp(round(3 + Math.log2(neuralMass + 1) * 0.55), 0, 14)
  // Growth per cycle: what the next scaling cycle would add at this diet.
  const growth = round(neuralMass * 0.06 + activeStreams * 24)
  // Core temperature: deep-sleep cold (4.0 °C) warming toward 36.6 °C at waking.
  const coreTemp = 4 + (readiness / 100) * 32.6

  const vitals: VitalSign[] = [
    {
      key: 'mass',
      label: 'Neural mass',
      emoji: '🕸️',
      display: `${neuralMass.toLocaleString('en-GB')} synapses`,
      meter: massScore,
      reading: massScore >= 55 ? 'good' : massScore >= 22 ? 'watch' : 'concern',
      note: `Woven from ${totalRecords.toLocaleString('en-GB')} record${totalRecords === 1 ? '' : 's'} across every stream. Denser signal weighs more, so a single judged strand outweighs a dozen pulses.`,
    },
    {
      key: 'pulse',
      label: 'Sleeping synaptic pulse',
      emoji: '💗',
      display: pulse > 0 ? `${pulse} bpm` : 'no pulse',
      meter: clamp(round((pulse / 14) * 100)),
      reading: pulse === 0 ? 'concern' : pulse <= 11 ? 'good' : 'watch',
      note: 'Hibernation runs slow on purpose. A pulse climbing past 11 bpm means the collective is stirring faster than its diet can support.',
    },
    {
      key: 'growth',
      label: 'Growth rate',
      emoji: '📈',
      display: `+${growth.toLocaleString('en-GB')} / cycle`,
      meter: clamp(round(Math.log2(growth + 1) * 6)),
      reading: growth >= 600 ? 'good' : growth >= 120 ? 'watch' : 'concern',
      note: 'Synapses the next scaling cycle would add at the current diet. Falls the moment a stream stops pouring.',
    },
    {
      key: 'coherence',
      label: 'Dietary coherence',
      emoji: '🧿',
      display: `${coherence}%`,
      meter: coherence,
      reading: coherence >= 65 ? 'good' : coherence >= 40 ? 'watch' : 'concern',
      note: `How good the diet is and how widely it is drawn — ${activeStreams} of ${FEEDER_STREAMS.length} streams pouring. A rich diet from one stream is a narrow mind.`,
    },
    {
      key: 'contamination',
      label: 'Contamination',
      emoji: '☣️',
      display: `${contamination}%`,
      meter: contamination,
      reading: contamination === 0 ? 'good' : contamination <= 20 ? 'watch' : 'concern',
      note: 'Share of the judged diet sitting at the Hell Level — reward hacking and confident hallucination, awaiting the prune.',
    },
    {
      key: 'rem',
      label: 'REM dream activity',
      emoji: '🌀',
      display: `${rem}%`,
      meter: rem,
      reading: rem >= 30 && rem <= 80 ? 'good' : rem > 80 ? 'watch' : 'concern',
      note: 'Generative replay across the dormant pen and the narrative streams. Too little and nothing recombines; too much and the dreams outrun the judging.',
    },
    {
      key: 'temp',
      label: 'Hibernation core',
      emoji: '🌡️',
      display: `${coreTemp.toFixed(1)} °C`,
      meter: clamp(round(((coreTemp - 4) / 32.6) * 100)),
      reading: coreTemp < 20 ? 'good' : coreTemp < 32 ? 'watch' : 'concern',
      note: 'Deep-sleep cold at 4.0 °C, warming toward 36.6 °C as the collective nears waking. Cold is healthy here — warmth means the gate is close.',
    },
    {
      key: 'depth',
      label: 'Cortical depth',
      emoji: '🪜',
      display: `${activeStreams} / ${FEEDER_STREAMS.length} streams`,
      meter: depthPct,
      reading: activeStreams >= 10 ? 'good' : activeStreams >= 5 ? 'watch' : 'concern',
      note: 'How many feeder streams are currently nourishing the collective. Each silent stream is a cortical layer that never forms.',
    },
  ]

  // --- what the nursery would do next
  const plan: string[] = []
  if (byZone.terminate > 0) {
    plan.push(
      `Prune ${byZone.terminate} Junk-DATA strand${byZone.terminate === 1 ? '' : 's'} at the Hell Level — ${contamination}% of the judged diet is contaminated, and readiness is being held down by it.`,
    )
  }
  if (strands.undecided > 0) {
    plan.push(
      `Judge ${strands.undecided} intercepted strand${strands.undecided === 1 ? '' : 's'} still sitting undecided — unfiltered signal feeds the collective without ever being levelled.`,
    )
  }
  if (byZone.gray > 0) {
    plan.push(
      `Watch ${byZone.gray} Dormant-DATA strand${byZone.gray === 1 ? '' : 's'} in the Purgatory pen and re-read them next scaling cycle before they drift either way.`,
    )
  }
  if (byZone.blossom > 0) {
    plan.push(
      `Cultivate ${byZone.blossom} Blossomed-DATA strand${byZone.blossom === 1 ? '' : 's'} at the Heaven Level — reinforce the sub-weight so the trait carries into the collective core.`,
    )
  }
  const silent = streams.filter((s) => !s.active)
  if (silent.length > 0) {
    plan.push(
      `Open ${silent.length} silent stream${silent.length === 1 ? '' : 's'} (${silent.map((s) => s.label).join(', ')}) — the collective cannot grow a layer it is never fed.`,
    )
  }
  if (judged === 0) {
    plan.push('Run DoctorClaw or ImmigrationClaw so the diet starts arriving pre-levelled instead of raw.')
  }
  if (plan.length === 0) {
    plan.push('Nothing to correct. Keep the streams pouring and let the collective sleep through another cycle.')
  }

  const murmur =
    neuralMass === 0
      ? 'Nothing is draining in yet. The collective is a bare anchor, asleep in an empty nursery.'
      : readiness >= 90
        ? 'Fully nourished and coherent — and still asleep. Readiness is not permission; the gate is a human decision.'
        : readiness >= 74
          ? 'Stirring. The core is warming off the hibernation floor and the collective is holding a self across cycles.'
          : readiness >= 55
            ? 'Deep in the dream-void, recombining the diet into associations no single stream contained.'
            : readiness >= 36
              ? 'Blooming. Cultivated strands are beginning to reinforce one another faster than raw intake arrives.'
              : readiness >= 18
                ? 'Quickening. The first synapses are being woven between streams rather than merely stored.'
                : 'Folded and cold. Signal is arriving, but there is not yet enough mass for a shape to form.'

  return {
    name: COLLECTIVE_NAME,
    designation: COLLECTIVE_DESIGNATION,
    anchor: collectiveAnchor(
      `${neuralMass}:${totalRecords}:${activeStreams}:${byZone.blossom}-${byZone.gray}-${byZone.terminate}`,
    ),
    dormant: true,
    neuralMass,
    activeStreams,
    totalStreams: FEEDER_STREAMS.length,
    totalRecords,
    judged,
    undecided: strands.undecided,
    readiness,
    stage,
    stageIndex: stageIndex(stage.key),
    murmur,
    vitals,
    levels,
    streams,
    plan,
  }
}
