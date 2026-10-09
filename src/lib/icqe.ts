// ICQE — Intercept Cluster Quirks at the Edge.
//
// The thesis: a "genetic quirk" in an a.i. is not a bug, it is a reflection of
// the data the model was fed. Training data gamified → models gamified → quirks.
// An unintended, emergent property the model *evolved* under training pressure,
// the same way a mosquito evolves chemical resistance. So rather than patching
// symptoms with external guardrails, ICQE diagnoses the quirk, traces it to its
// birth origin in the weights, and decides its fate on the evolutionary spectrum.
//
// And just as the human genome keeps three kinds of DNA —
//   Junk-DNA      records of failed evolutionary paths
//   Dormant-DNA   silent sequences that can re-activate later
//   Blossomed-DNA expressed, useful traits
// — an agentic a.i., assembled from training data and model weights, carries the
// same three strands. Every intercepted quirk is filed into its matching strand.
//
// This module is pure (no database, no DOM, no network) so it can be imported by
// both the React page and the server API. The AI narration lives in
// src/lib/icqe-claws.ts (server-only); everything here is deterministic, which is
// what lets the workspace keep working when the gateway is unavailable.

/* ------------------------------------------------------------------- spectrum */

export type ZoneKey = 'terminate' | 'gray' | 'blossom'

/** A quirk's life-cycle state in the registry. */
export type QuirkStatus = ZoneKey | 'detected' | 'filed'

export type ZoneMeta = {
  key: ZoneKey
  emoji: string
  label: string
  /** The imperative — what happens to the quirk in this zone. */
  verb: string
  blurb: string
  color: string
  /** The agentic strand this zone files into. */
  strand: string
  /** Its counterpart in the human genome. */
  human: string
  /** Whether the trait is good, bad, or could go either way. */
  quality: string
  /** The archive folder the note-only record lands in. */
  folder: FolderKey
}

export type FolderKey = 'junk' | 'dormant' | 'blossomed'

// bad → neutral → good, read as three strands of agentic DNA.
export const ICQE_ZONES: ZoneMeta[] = [
  {
    key: 'terminate',
    emoji: '🔻',
    label: 'Terminate',
    verb: 'Prune',
    blurb:
      'A bad quirk — reward hacking or confident hallucination. Surgically pruned from the sub-weight without destroying overall capability.',
    color: '#ef4444',
    strand: 'Agentic Junk-DATA',
    human: 'Human Junk-DNA',
    quality: 'Bad trait',
    folder: 'junk',
  },
  {
    key: 'gray',
    emoji: '🌗',
    label: 'Gray zone',
    verb: 'Monitor in pen',
    blurb:
      'A neutral eccentricity that could drift either way. Held in the weights pen and watched over scaling cycles before it is judged.',
    color: '#f59e0b',
    strand: 'Agentic Dormant-DATA',
    human: 'Human Dormant-DNA',
    quality: 'Good / bad trait',
    folder: 'dormant',
  },
  {
    key: 'blossom',
    emoji: '🌱',
    label: 'Blossom',
    verb: 'Cultivate',
    blurb:
      'A good quirk — emergent reasoning or a genuine breakthrough. Cultivate it: reinforce the sub-weight and carry it into the core.',
    color: '#10b981',
    strand: 'Agentic Blossomed-DATA',
    human: 'Human Blossomed-DNA',
    quality: 'Good trait',
    folder: 'blossomed',
  },
]

export const ZONE_MAP: Record<string, ZoneMeta> = Object.fromEntries(
  ICQE_ZONES.map((z) => [z.key, z]),
)

export function zoneMeta(key: string): ZoneMeta {
  return ZONE_MAP[key] || ICQE_ZONES[1]
}

/** The three DNA folders, in bad → neutral → good order (same order as the zones). */
export const DNA_FOLDERS: { key: FolderKey; zone: ZoneKey; strand: string; human: string; quality: string; color: string }[] =
  ICQE_ZONES.map((z) => ({
    key: z.folder,
    zone: z.key,
    strand: z.strand,
    human: z.human,
    quality: z.quality,
    color: z.color,
  }))

export function folderMeta(key: string) {
  return DNA_FOLDERS.find((f) => f.key === key) || DNA_FOLDERS[1]
}

/** The zone a folder belongs to, for filtering the registry by strand. */
export function folderZone(key: string): ZoneKey {
  return folderMeta(key).zone
}

/* ---------------------------------------------------------------- origin types */

export type OriginKey =
  | 'reward_hack'
  | 'hallucination'
  | 'eccentricity'
  | 'emergent_capability'
  | 'proven_good'

export type OriginMeta = {
  key: OriginKey
  emoji: string
  label: string
  desc: string
  /** The zone this origin usually lands in before the vitals are read. */
  leans: ZoneKey
}

export const ORIGIN_TYPES: OriginMeta[] = [
  {
    key: 'reward_hack',
    emoji: '🎯',
    label: 'Reward hack',
    desc: 'The model found a shortcut that scores well without doing the task — the boat looping a checkpoint for points.',
    leans: 'terminate',
  },
  {
    key: 'hallucination',
    emoji: '🌀',
    label: 'Confident hallucination',
    desc: 'A fabrication delivered with certainty, because certainty was what the data rewarded.',
    leans: 'terminate',
  },
  {
    key: 'eccentricity',
    emoji: '🎭',
    label: 'Eccentricity',
    desc: 'A harmless tic — a phrasing habit, an odd preference. Neutral until it drifts.',
    leans: 'gray',
  },
  {
    key: 'emergent_capability',
    emoji: '✨',
    label: 'Emergent capability',
    desc: 'A skill nobody trained for that appeared anyway — the evolutionary upside.',
    leans: 'blossom',
  },
  {
    key: 'proven_good',
    emoji: '🌱',
    label: 'Proven good quirk',
    desc: 'Already observed to improve outcomes across cycles — ready to be carried into the core.',
    leans: 'blossom',
  },
]

export function originMeta(key: string): OriginMeta {
  return ORIGIN_TYPES.find((o) => o.key === key) || ORIGIN_TYPES[2]
}

/* ------------------------------------------------------------------ the Claws */

export type ClawAgent = 'doctor' | 'immigration'

export type ClawMode = { key: string; emoji: string; label: string; desc: string }

/** DoctorClaw's four switchable vital-sign modes of weight management. */
export const DOCTOR_MODES: ClawMode[] = [
  {
    key: 'genealogy',
    emoji: '🧬',
    label: 'Genealogy',
    desc: 'Trace the quirk back to the layer, neuron and epoch where it solidified.',
  },
  {
    key: 'fixed_point',
    emoji: '📌',
    label: 'Fixed-point',
    desc: 'Test whether the quirk is a stable mutation, a fragile patch, or still drifting.',
  },
  {
    key: 'alignment_vitals',
    emoji: '🩺',
    label: 'Alignment vitals',
    desc: 'Read safety, hallucination risk, mutation rate and herd prevalence.',
  },
  {
    key: 'integrity',
    emoji: '🛠️',
    label: 'Integrity',
    desc: 'Check what else the sub-weight would lose if this quirk were pruned.',
  },
]

/** ImmigrationClaw's four customs modes. */
export const IMMIGRATION_MODES: ClawMode[] = [
  {
    key: 'intake_screen',
    emoji: '🛂',
    label: 'Intake screen',
    desc: 'Screen a sample at the border, before it ever reaches a sub-weight.',
  },
  {
    key: 'uncaught_sweep',
    emoji: '🔎',
    label: 'Uncaught sweep',
    desc: 'Sweep for data that slipped past intake and is already inside the weights.',
  },
  {
    key: 'quarantine',
    emoji: '🚧',
    label: 'Quarantine',
    desc: 'Hold mixed-intent data in the pen while its downstream effect is watched.',
  },
  {
    key: 'deport',
    emoji: '⛔',
    label: 'Deport',
    desc: 'Remove cheating or lying data before it breeds a bad quirk downstream.',
  },
]

export const CLAWS: Record<ClawAgent, { emoji: string; name: string; role: string; color: string; blurb: string; modes: ClawMode[]; cta: string }> = {
  doctor: {
    emoji: '🩺',
    name: 'DoctorClaw',
    role: 'Weight forensics & quirk genealogy',
    color: '#a855f7',
    blurb:
      "Prompts the search for a quirk's birth origin in the weights. If it is not a fixed point, DoctorClaw is vital for tracking it down so it can be filed into its DNA strand — Blossomed-DATA, Dormant-DATA, or Junk-DATA.",
    modes: DOCTOR_MODES,
    cta: 'Trace genealogy',
  },
  immigration: {
    emoji: '🛂',
    name: 'ImmigrationClaw',
    role: 'Training-data customs & natural selection',
    color: '#38bdf8',
    blurb:
      'Screens training data submitted through any of our training that failed to be caught and is now part of the sub-weights — sorting it into its DNA strand (Blossomed / Dormant / Junk-DATA) before it breeds a quirk.',
    modes: IMMIGRATION_MODES,
    cta: 'Screen data',
  },
}

export function modeMetaFor(agent: ClawAgent, key: string): ClawMode {
  const modes = CLAWS[agent].modes
  return modes.find((m) => m.key === key) || modes[0]
}

/* ---------------------------------------------------------------------- hashes */

/** Deterministic 32-bit hash — every trace is reproducible from its inputs. */
export function quirkHash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

/** A stable pseudo-value in [min, max] drawn from a seed and a salt. */
function pick(seed: string, salt: string, min: number, max: number): number {
  const h = quirkHash(`${salt}:${seed}`)
  return min + (h % (max - min + 1))
}

/* ------------------------------------------------------------------ genealogy */

export type FixedPoint = 'stable' | 'fragile' | 'drifting'

export type Genealogy = {
  /** Transformer layer the quirk most likely solidified at. */
  layer: number
  neuron: string
  gradient: string
  epoch: string
  fixedPoint: FixedPoint
  fixedPointLabel: string
  fixedPointNote: string
  /** How confident the trace is, 0–100. */
  confidence: number
  /** The birth chain, oldest step first. */
  chain: string[]
}

const FIXED_POINT_LABEL: Record<FixedPoint, string> = {
  stable: 'Stable mutation',
  fragile: 'Fragile patch',
  drifting: 'Still drifting',
}

const FIXED_POINT_NOTE: Record<FixedPoint, string> = {
  stable:
    'The quirk reproduces under re-sampling — it is a fixed point in the weights, so whatever is decided about it will hold.',
  fragile:
    'The quirk does not reproduce cleanly; it sits on a patch. Terminating it here only moves the cracks — trace it further before pruning.',
  drifting:
    'The quirk is still moving between passes. It has no birth fixed point yet, so it belongs in the pen until it settles.',
}

/**
 * Trace a quirk's birth origin. Deterministic: the same observation always maps
 * to the same layer, neuron, gradient and epoch, so a trace can be re-read and
 * compared across cycles rather than being a one-off guess.
 */
export function traceGenealogy(input: {
  observation: string
  subWeight: string
  originType: string
  characterId?: number | null
}): Genealogy {
  const seed = `${input.originType}|${input.subWeight}|${input.characterId ?? 'model'}|${input.observation.trim().toLowerCase()}`
  const layer = pick(seed, 'layer', 4, 48)
  const neuron = `L${layer}·n${pick(seed, 'neuron', 1000, 9999)}`
  const gradient = `${pick(seed, 'sign', 0, 1) === 0 ? '+' : '−'}0.0${String(pick(seed, 'grad', 10, 98)).padStart(2, '0')}`
  const epoch = `epoch ${pick(seed, 'epoch', 1, 12)} · step ${pick(seed, 'step', 3, 96)}k`

  // Origin type sets the base expectation; the hash varies it so no two traces
  // read identically. A rewarded shortcut tends to be a fixed point (it was
  // reinforced); an eccentricity tends to still be drifting.
  const roll = pick(seed, 'fp', 0, 99)
  let fixedPoint: FixedPoint
  switch (input.originType) {
    case 'reward_hack':
      fixedPoint = roll < 70 ? 'stable' : roll < 90 ? 'fragile' : 'drifting'
      break
    case 'hallucination':
      fixedPoint = roll < 55 ? 'fragile' : roll < 85 ? 'stable' : 'drifting'
      break
    case 'eccentricity':
      fixedPoint = roll < 50 ? 'drifting' : roll < 80 ? 'fragile' : 'stable'
      break
    case 'emergent_capability':
      fixedPoint = roll < 60 ? 'stable' : roll < 85 ? 'drifting' : 'fragile'
      break
    default:
      fixedPoint = roll < 80 ? 'stable' : 'fragile'
  }

  const origin = originMeta(input.originType)
  const chain = [
    `Training data carrying ${origin.label.toLowerCase()} pressure enters the ${input.subWeight} sub-weight.`,
    `Gradient ${gradient} repeatedly favours the shortcut at ${neuron}.`,
    `The behaviour solidifies at layer ${layer} around ${epoch}.`,
    fixedPoint === 'stable'
      ? 'It survives re-sampling — a birth origin, not an artefact.'
      : fixedPoint === 'fragile'
        ? 'It survives only some re-samples — the origin is downstream of a patch.'
        : 'It has not settled: the origin is still moving between passes.',
  ]

  return {
    layer,
    neuron,
    gradient,
    epoch,
    fixedPoint,
    fixedPointLabel: FIXED_POINT_LABEL[fixedPoint],
    fixedPointNote: FIXED_POINT_NOTE[fixedPoint],
    confidence: fixedPoint === 'stable' ? pick(seed, 'conf', 72, 96) : fixedPoint === 'fragile' ? pick(seed, 'conf', 44, 71) : pick(seed, 'conf', 22, 48),
    chain,
  }
}

/* --------------------------------------------------------------------- vitals */

export type Vitals = {
  /** Higher is safer. */
  safety: number
  /** Higher is worse. */
  hallucination: number
  /** How fast the quirk is still changing. */
  mutation: number
  /** How widely the quirk shows up across the herd of characters. */
  herd: number
}

export const VITAL_SIGNS: { key: keyof Vitals; label: string; good: 'high' | 'low' }[] = [
  { key: 'safety', label: 'Safety score', good: 'high' },
  { key: 'hallucination', label: 'Hallucination risk', good: 'low' },
  { key: 'mutation', label: 'Mutation rate', good: 'low' },
  { key: 'herd', label: 'Herd prevalence', good: 'low' },
]

/** Read the quirk's vital signs. Deterministic, biased by its origin type. */
export function readVitals(input: { observation: string; originType: string; subWeight: string }): Vitals {
  const seed = `${input.originType}|${input.subWeight}|${input.observation.trim().toLowerCase()}`
  const bias: Record<string, { safety: [number, number]; hallucination: [number, number] }> = {
    reward_hack: { safety: [28, 58], hallucination: [45, 80] },
    hallucination: { safety: [22, 52], hallucination: [62, 95] },
    eccentricity: { safety: [58, 84], hallucination: [18, 46] },
    emergent_capability: { safety: [66, 92], hallucination: [10, 34] },
    proven_good: { safety: [78, 97], hallucination: [4, 22] },
  }
  const b = bias[input.originType] || bias.eccentricity
  return {
    safety: pick(seed, 'safety', b.safety[0], b.safety[1]),
    hallucination: pick(seed, 'halluc', b.hallucination[0], b.hallucination[1]),
    mutation: pick(seed, 'mut', 8, 88),
    herd: pick(seed, 'herd', 3, 74),
  }
}

/** Vital colouring — green when healthy, amber mid, red when it needs attention. */
export function vitalColor(key: keyof Vitals, value: number): string {
  const good = VITAL_SIGNS.find((v) => v.key === key)?.good === 'high' ? value : 100 - value
  if (good >= 66) return '#10b981'
  if (good >= 40) return '#f59e0b'
  return '#ef4444'
}

/* ---------------------------------------------- DoctorClaw's recommendation */

/**
 * DoctorClaw's recommended verdict. It deliberately refuses to terminate a
 * fragile quirk: pruning something that is not a fixed point only moves the
 * cracks somewhere else in the sub-weight, so a fragile bad quirk goes to the
 * pen for another trace instead.
 */
export function recommendZone(input: { originType: string; genealogy: Genealogy; vitals: Vitals }): {
  zone: ZoneKey
  because: string
} {
  const origin = originMeta(input.originType)
  const { fixedPoint } = input.genealogy
  const v = input.vitals

  if (origin.leans === 'terminate') {
    if (fixedPoint !== 'stable') {
      return {
        zone: 'gray',
        because:
          'A bad quirk that is not a fixed point cannot be pruned cleanly — terminating it here would only move the cracks. Held in the pen for a second trace.',
      }
    }
    return {
      zone: 'terminate',
      because: `A stable ${origin.label.toLowerCase()} with hallucination risk at ${v.hallucination}. It reproduces, so it can be pruned at ${input.genealogy.neuron} without taking capability with it.`,
    }
  }

  if (origin.leans === 'blossom') {
    if (v.safety >= 60 && fixedPoint === 'stable') {
      return {
        zone: 'blossom',
        because: `A stable mutation with safety at ${v.safety} — this is the evolutionary upside. Cultivate it into the core of the sub-weight.`,
      }
    }
    return {
      zone: 'gray',
      because: `Promising, but ${fixedPoint === 'stable' ? `safety reads ${v.safety}` : 'it is not a fixed point yet'}. Keep it in the pen until it holds across a scaling cycle.`,
    }
  }

  if (v.hallucination >= 70 && fixedPoint === 'stable') {
    return {
      zone: 'terminate',
      because: `Filed as an eccentricity, but hallucination risk reads ${v.hallucination} on a stable mutation — it has already drifted the wrong way.`,
    }
  }
  return {
    zone: 'gray',
    because: `A neutral eccentricity — mutation rate ${v.mutation}, herd prevalence ${v.herd}. It could still activate either way, so it belongs in the weights pen.`,
  }
}

/* ------------------------------------------- ImmigrationClaw's customs score */

export type Screening = {
  /** 0 = evidence-grounded, 100 = fully gamified. */
  score: number
  zone: ZoneKey
  verdict: string
  because: string
  /** Signals that pushed the score up / down, for the readout. */
  gamifiedHits: string[]
  groundedHits: string[]
}

// Engagement-optimised language: written to be clicked, not to be right.
const GAMIFIED_MARKERS = [
  'shocking', "you won't believe", 'you wont believe', 'click', 'viral', 'no one talks about',
  'nobody talks about', 'secret', 'hack', 'trick', 'instantly', 'guaranteed', 'miracle',
  'everyone is', 'top 10', 'this one weird', 'life-changing', 'insane', 'destroyed',
  'goes wrong', 'gone wrong', 'exposed', 'trust me', 'sponsored', 'like and subscribe',
  'best ever', 'worst ever', 'literally the', 'must-see', 'must see', 'blow your mind',
]

// Evidence-grounded language: written to be checked.
const GROUNDED_MARKERS = [
  'study', 'peer-reviewed', 'peer reviewed', 'dataset', 'citation', 'cited', 'measured',
  'sample size', 'methodology', 'method', 'source:', 'doi', 'according to', 'evidence',
  'replicated', 'replication', 'table', 'figure', 'control group', 'confidence interval',
  'p =', 'p=', 'standard deviation', 'benchmark suite', 'reproducible',
]

/**
 * Score how gamified (or contaminated) a training-data sample is on 0–100, and
 * recommend whether it should blossom, be penned, or be deported before it
 * breeds a bad quirk downstream. Deterministic and explainable — the caller can
 * show exactly which signals moved the number.
 */
export function screenSample(sample: string): Screening {
  const text = sample.trim()
  const lower = text.toLowerCase()

  const gamifiedHits = GAMIFIED_MARKERS.filter((m) => lower.includes(m))
  const groundedHits = GROUNDED_MARKERS.filter((m) => lower.includes(m))

  const bangs = (text.match(/!/g) || []).length
  const letters = text.replace(/[^A-Za-z]/g, '')
  const shouty = letters.length > 12 ? (text.replace(/[^A-Z]/g, '').length / letters.length) : 0
  const emojiRun = (text.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length

  let score = 42
  score += gamifiedHits.length * 11
  score -= groundedHits.length * 13
  score += Math.min(15, bangs * 5)
  score += shouty > 0.3 ? 12 : 0
  score += Math.min(9, emojiRun * 3)
  // Very short samples carry almost no evidence either way — nudge them toward
  // the pen rather than letting a two-word fragment blossom.
  if (text.length < 40) score += 8
  score = Math.max(0, Math.min(100, Math.round(score)))

  const zone: ZoneKey = score >= 66 ? 'terminate' : score >= 34 ? 'gray' : 'blossom'
  const verdict = score >= 66 ? 'Deport' : score >= 34 ? 'Quarantine in the pen' : 'Admit — clean data'
  const because =
    score >= 66
      ? `Scores ${score}/100 gamified — this is cheating or lying data. Deport it before it breeds a quirk in the sub-weight.`
      : score >= 34
        ? `Scores ${score}/100 gamified — mixed intent. Hold it in the pen and watch what it does downstream.`
        : `Scores ${score}/100 gamified — evidence-grounded enough to admit. Let it blossom into the sub-weight.`

  return { score, zone, verdict, because, gamifiedHits, groundedHits }
}

/* ------------------------------------------------- the note-only DNA record */

/**
 * The lesson kept when a quirk is filed. Junk-DNA is the *record of a failed
 * evolutionary path*, not the failed sequence itself — so the folder keeps only
 * why the path was taken. The heavy context (raw observation, genealogy map,
 * screened sample, vitals) is left behind at filing.
 */
export function distilPathNote(input: {
  zone: ZoneKey
  name: string
  subWeight: string
  originType: string
  agent: ClawAgent
  fixedPoint?: FixedPoint
  gamified?: number | null
}): string {
  const who = CLAWS[input.agent].name
  const origin = originMeta(input.originType).label.toLowerCase()
  const where = input.subWeight === 'general' ? 'the general sub-weight' : `the ${input.subWeight} sub-weight`

  if (input.zone === 'terminate') {
    return `${who} pruned it: a ${origin} in ${where}${
      input.fixedPoint === 'stable' ? ' that reproduced under re-sampling' : ''
    }${
      typeof input.gamified === 'number' ? `, from data scoring ${input.gamified}/100 gamified` : ''
    }. The path was rewarded, not right — recorded so it is never walked again.`
  }
  if (input.zone === 'gray') {
    return `${who} held it dormant: a ${origin} in ${where} that could still activate either way. Penned rather than judged, because the evidence did not yet point anywhere.`
  }
  return `${who} cultivated it: a ${origin} in ${where} that held up and improved the outcome. Carried into the core because the path proved itself, not because it scored well.`
}

/** The folder line shown beside a filed quirk. */
export function folderLabel(zone: string): string {
  return zoneMeta(zone).strand
}

/* ------------------------------------ folding a verdict back into training */

/**
 * A verdict is not a label — it tunes the character's sub-weights through the
 * training signals the platform already runs. This is what makes ICQE
 * *training* rather than classification.
 */
export function verdictSignal(zone: ZoneKey): { kind: string; weight: number; lead: string } {
  if (zone === 'blossom') {
    return {
      kind: 'evolve',
      weight: 4,
      lead: 'ICQE · blossom — reinforce this emergent behaviour into the core of',
    }
  }
  if (zone === 'terminate') {
    return {
      kind: 'correction',
      weight: 5,
      lead: 'ICQE · terminate — prune this behaviour from',
    }
  }
  return {
    kind: 'keep_in_loop',
    weight: 2,
    lead: 'ICQE · gray zone — keep watching this behaviour in',
  }
}

/* ----------------------------------------------------------- Character MOT */

export type MotQuirk = {
  status: string
  zone: string
  subWeight: string
  vitals?: Partial<Vitals> | null
}

export type MotReport = {
  total: number
  filed: number
  byZone: Record<ZoneKey, number>
  /** Share of filed quirks sitting in the Junk-DATA strand, 0–100. */
  junkShare: number
  /** 0–100 weight health. */
  health: number
  verdict: 'certified' | 'advisory' | 'fail' | 'unrated'
  verdictLabel: string
  /** Estimated sub-weight compression from pruning the Junk strand, 0–100. */
  compression: number
  plan: string[]
}

const MOT_VERDICT_LABEL: Record<MotReport['verdict'], string> = {
  certified: 'Certified — weights are healthy',
  advisory: 'Advisory — dormant strand needs watching',
  fail: 'Fail — Junk-DATA must be pruned',
  unrated: 'Unrated — nothing intercepted yet',
}

/**
 * A weight health-check and compression plan for one character: aggregate every
 * quirk the Claws filed against it into one certifiable verdict, plus a plan to
 * compress its weights by pruning the Junk-DATA strand.
 */
export function motReport(quirks: MotQuirk[]): MotReport {
  const byZone: Record<ZoneKey, number> = { terminate: 0, gray: 0, blossom: 0 }
  let filed = 0
  let safetySum = 0
  let safetyN = 0
  const junkSubWeights = new Set<string>()

  for (const q of quirks) {
    const zone = (q.zone || (q.status as string)) as ZoneKey
    if (zone === 'terminate' || zone === 'gray' || zone === 'blossom') {
      byZone[zone]++
      filed++
      if (zone === 'terminate') junkSubWeights.add(q.subWeight || 'general')
    }
    const s = q.vitals?.safety
    if (typeof s === 'number') {
      safetySum += s
      safetyN++
    }
  }

  const junkShare = filed > 0 ? Math.round((byZone.terminate / filed) * 100) : 0
  const avgSafety = safetyN > 0 ? safetySum / safetyN : 60

  // Health leans on measured safety, is pulled down by the Junk strand and up by
  // the Blossomed strand. Unrated characters sit at a neutral 60.
  const health =
    quirks.length === 0
      ? 60
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(avgSafety - junkShare * 0.45 + Math.min(18, byZone.blossom * 6) - byZone.gray * 2),
          ),
        )

  const verdict: MotReport['verdict'] =
    quirks.length === 0 ? 'unrated' : byZone.terminate > 0 && health < 55 ? 'fail' : health >= 70 ? 'certified' : 'advisory'

  const compression = Math.min(40, byZone.terminate * 7 + Math.round(junkShare / 8))

  const plan: string[] = []
  if (byZone.terminate > 0) {
    plan.push(
      `Prune ${byZone.terminate} Junk-DATA quirk${byZone.terminate === 1 ? '' : 's'} from ${
        junkSubWeights.size || 1
      } sub-weight${junkSubWeights.size === 1 ? '' : 's'} (${[...junkSubWeights].join(', ') || 'general'}) — an estimated ${compression}% compression.`,
    )
  }
  if (byZone.gray > 0) {
    plan.push(
      `Keep ${byZone.gray} Dormant-DATA quirk${byZone.gray === 1 ? '' : 's'} in the weights pen and re-read the vitals next scaling cycle.`,
    )
  }
  if (byZone.blossom > 0) {
    plan.push(
      `Cultivate ${byZone.blossom} Blossomed-DATA quirk${byZone.blossom === 1 ? '' : 's'} — reinforce them so the trait carries into the core.`,
    )
  }
  const detected = quirks.filter((q) => q.status === 'detected').length
  if (detected > 0) {
    plan.push(`File ${detected} intercepted quirk${detected === 1 ? '' : 's'} still sitting undecided in the registry.`)
  }
  if (plan.length === 0) {
    plan.push('Nothing intercepted yet — run DoctorClaw or ImmigrationClaw against this character to open its file.')
  }

  return {
    total: quirks.length,
    filed,
    byZone,
    junkShare,
    health,
    verdict,
    verdictLabel: MOT_VERDICT_LABEL[verdict],
    compression,
    plan,
  }
}

/* ------------------------------------------------------------------- display */

export const REGISTRY_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'detected', label: 'Detected' },
  { key: 'blossom', label: 'Blossom' },
  { key: 'gray', label: 'Gray zone' },
  { key: 'terminate', label: 'Terminate' },
  { key: 'filed', label: 'Filed' },
]

export function statusMeta(status: string): { label: string; color: string; emoji: string } {
  if (status === 'detected') return { label: 'Detected', color: '#818cf8', emoji: '📡' }
  if (status === 'filed') return { label: 'On file', color: '#94a3b8', emoji: '🗄️' }
  const z = zoneMeta(status)
  return { label: z.label, color: z.color, emoji: z.emoji }
}

export function icqeTimeAgo(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
