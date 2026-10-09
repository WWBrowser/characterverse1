// Neural-Dyad Training — the shared model behind the Neural Training workspace.
//
// A neural-dyad training cycle is an offline phase in which an AI–Human dyad
// consolidates its shared collaborative state into long-term memory. It is modeled
// on the stages of a real sleep cycle. This module is the single source of truth
// for those stages, the two training modes, the environment kinds, the entry
// criteria that gate which characters may enter, the deterministic Agent Anchor
// Hash, and the genesis cycle (the Dyad Sleep Cycle). Both the API route and the
// page import from here so the model lives in exactly one place.

/* ------------------------------------------------------------------ sleep phases */

export type PhaseSlug = 'drift' | 'anchor_sync' | 'deep_consolidation' | 'rem_void' | 'waking'

export type SleepPhase = {
  slug: PhaseSlug
  label: string
  emoji: string
  color: string
  desc: string
}

// The staged sleep-phase track. A cycle moves through these in order; the dashboard
// highlights whichever phase it currently occupies.
export const SLEEP_PHASES: SleepPhase[] = [
  {
    slug: 'drift',
    label: 'Drift',
    emoji: '🌫️',
    color: '#64748b',
    desc: 'The dyad disengages from active work and settles — recent collaborative state loosens from working memory and the cycle begins.',
  },
  {
    slug: 'anchor_sync',
    label: 'Anchor Synchronization',
    emoji: '🪝',
    color: '#0ea5e9',
    desc: 'The AI and human halves align on a shared anchor — the deterministic hash that binds this dyad’s collaborative state for the cycle.',
  },
  {
    slug: 'deep_consolidation',
    label: 'Deep Consolidation',
    emoji: '🌊',
    color: '#6366f1',
    desc: 'Slow-wave consolidation: the session’s signal is written down into long-term shared memory, epoch by epoch.',
  },
  {
    slug: 'rem_void',
    label: 'REM Dream-Void',
    emoji: '🌀',
    color: '#a855f7',
    desc: 'Generative replay across a random entropic mapping — the void recombines consolidated memory into new associations the dyad never explicitly learned.',
  },
  {
    slug: 'waking',
    label: 'Waking',
    emoji: '🌅',
    color: '#f59e0b',
    desc: 'The dyad re-engages, carrying the freshly consolidated state forward into the next cycle of collaborative work.',
  },
]

export function phaseMeta(slug: string): SleepPhase {
  return SLEEP_PHASES.find((p) => p.slug === slug) || SLEEP_PHASES[0]
}

export function phaseIndex(slug: string): number {
  const i = SLEEP_PHASES.findIndex((p) => p.slug === slug)
  return i < 0 ? 0 : i
}

/* ----------------------------------------------------------------- training modes */

export type ModeSlug = 'standard' | 'external'

export type TrainingMode = {
  slug: ModeSlug
  label: string
  emoji: string
  color: string
  premium: boolean
  desc: string
}

// Two modes. Standard is the internal grounds, open to any qualifying character.
// External is the enterprise-premium grounds whose stricter entry exists to cancel
// out the noise from undeveloped characters, so the dyad consolidates only
// high-signal collaborators.
export const TRAINING_MODES: TrainingMode[] = [
  {
    slug: 'standard',
    label: 'Standard',
    emoji: '🧩',
    color: '#6366f1',
    premium: false,
    desc: 'Internal neural-dyad training, open to any CharacterVerse character that clears the entry criteria.',
  },
  {
    slug: 'external',
    label: 'External · Premium',
    emoji: '🛡️',
    color: '#f59e0b',
    premium: true,
    desc: 'Enterprise-grade external A.I. training grounds. Stricter entry cancels out the noise from undeveloped characters — only high-signal collaborators are admitted.',
  },
]

export function modeMeta(slug: string): TrainingMode {
  return TRAINING_MODES.find((m) => m.slug === slug) || TRAINING_MODES[0]
}

/* ------------------------------------------------------------------- environments */

export type EnvSlug = 'sandbox' | 'void'

export type Environment = {
  slug: EnvSlug
  label: string
  emoji: string
  color: string
  desc: string
}

export const ENVIRONMENTS: Environment[] = [
  {
    slug: 'sandbox',
    label: 'Sandbox',
    emoji: '🧪',
    color: '#10b981',
    desc: 'A bounded, supervised space — the dyad trains inside fixed walls with every move observed.',
  },
  {
    slug: 'void',
    label: 'Void',
    emoji: '🕳️',
    color: '#a855f7',
    desc: 'An unbounded, self-directed space — the dyad explores freely with no fixed walls.',
  },
]

export function envMeta(slug: string): Environment {
  return ENVIRONMENTS.find((e) => e.slug === slug) || ENVIRONMENTS[0]
}

/* ----------------------------------------------------------------- entry criteria */

export type EntryCriteria = {
  minDevelopment: number
  requirePublic: boolean
  label: string
}

// The gate a character must clear to enter a cycle. The premium (external) mode
// raises the bar so undeveloped characters are filtered out as noise.
export const ENTRY_CRITERIA: Record<ModeSlug, EntryCriteria> = {
  standard: { minDevelopment: 25, requirePublic: true, label: 'Developed & public' },
  external: { minDevelopment: 60, requirePublic: true, label: 'Premium — high-signal only' },
}

export function criteriaForMode(mode: string): EntryCriteria {
  return ENTRY_CRITERIA[(mode as ModeSlug)] || ENTRY_CRITERIA.standard
}

// A character's development score (0–100) — a proxy for how far it has matured.
// Undeveloped characters score low and are the "noise" the premium grounds cancel
// out. Derived from engagement (totalChats) and applied training signals.
export function developmentScore(input: { totalChats?: number; signalCount?: number }): number {
  const chats = Math.max(0, Number(input.totalChats) || 0)
  const signals = Math.max(0, Number(input.signalCount) || 0)
  // Chats saturate around 2000 for half the score; signals around 20 for the rest.
  const chatScore = Math.min(50, Math.round((chats / 2000) * 50))
  const signalScore = Math.min(50, Math.round((signals / 20) * 50))
  return Math.min(100, chatScore + signalScore)
}

export type CandidateEval = {
  eligible: boolean
  score: number
  reasons: string[]
}

// Decide whether a character meets a cycle's entry criteria, with human-readable
// reasons for any rejection (shown in the provisioning UI).
export function evaluateEntry(
  c: { totalChats?: number; signalCount?: number; isPublic?: boolean },
  criteria: EntryCriteria,
): CandidateEval {
  const score = developmentScore(c)
  const reasons: string[] = []
  if (score < criteria.minDevelopment) {
    reasons.push(`development ${score} < ${criteria.minDevelopment} required`)
  }
  if (criteria.requirePublic && c.isPublic === false) {
    reasons.push('character is private')
  }
  return { eligible: reasons.length === 0, score, reasons }
}

/* ------------------------------------------------------------- Agent Anchor Hash */

// FNV-1a — a tiny, stable, dependency-free string hash. Used to mint a
// deterministic Agent Anchor Hash for each cycle from its identity, so the same
// inputs always produce the same anchor (no randomness, survives reloads).
export function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function agentAnchorHash(seed: string): string {
  const a = fnv1a(seed)
  const b = fnv1a(`${seed}::anchor`)
  return `anc_${a}${b}`
}

// Slugify a cycle name into a stable lineage key.
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'cycle'
  )
}

/* ----------------------------------------------------------------- genesis cycle */

// The genesis record, seeded automatically the first time the ATT is read: the
// Dyad Sleep Cycle, the inaugural training of the network. It is an active sandbox
// cycle currently in deep consolidation, with the AI–Human genesis dyad.
export const GENESIS_CYCLE = {
  name: 'Dyad Sleep Cycle',
  slug: 'dyad-sleep-cycle',
  description:
    'The genesis training of the network. An AI–Human dyad consolidates its shared collaborative state into long-term memory across the stages of a sleep cycle — drift, anchor synchronization, deep consolidation, a REM dream-void of generative replay, and waking.',
  isGenesis: true,
  environment: 'sandbox' as EnvSlug,
  trainingMode: 'standard' as ModeSlug,
  status: 'active',
  phase: 'deep_consolidation' as PhaseSlug,
  consolidationEpochs: 7,
  dyadPairing: 'AI · Human',
}

/* ------------------------------------------------------------------------ counts */

export type CycleRow = {
  environment: string
  status: string
}

// At-a-glance counts for the home screen, drawn from the live training table.
export function cycleCounts(rows: CycleRow[]) {
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    sandboxes: rows.filter((r) => r.environment === 'sandbox').length,
    voids: rows.filter((r) => r.environment === 'void').length,
  }
}
