// Training Control Room — the shared vocabulary behind the refinement layer.
// Pure (no database, no DOM) so it is safe to import from both the React pages
// and the server API.
//
// A character improves continuously through training *signals*. Each signal is
// one of seven actions, targets a named *sub-weight* (a facet of the character),
// and is delivered either in real time (folded in immediately) or in a batch
// (accumulated, then applied together). Bounty feedback flows in as signals too,
// closing the Test → Train → Improve → Validate loop.

export type TrainingKind =
  | 'critique'
  | 'definition'
  | 'correction'
  | 'reference'
  | 'inform'
  | 'keep_in_loop'
  | 'evolve'

export type TrainingMode = 'realtime' | 'batch'

export type TrainingKindMeta = {
  kind: TrainingKind
  emoji: string
  label: string
  desc: string
  color: string
}

// The seven training actions, in the order shown in the control room.
export const TRAINING_KINDS: TrainingKindMeta[] = [
  {
    kind: 'critique',
    emoji: '🔍',
    label: 'Critique',
    desc: 'Point out where a reply fell short so the character can self-correct.',
    color: '#f59e0b',
  },
  {
    kind: 'definition',
    emoji: '📖',
    label: 'Definition',
    desc: 'Teach a term, concept or fact the character should know.',
    color: '#3b82f6',
  },
  {
    kind: 'correction',
    emoji: '✏️',
    label: 'Correction',
    desc: 'Replace a wrong answer with the right one.',
    color: '#ef4444',
  },
  {
    kind: 'reference',
    emoji: '🖼️',
    label: 'Reference',
    desc: 'Give an example, style or source to model future replies on.',
    color: '#8b5cf6',
  },
  {
    kind: 'inform',
    emoji: '📡',
    label: 'Inform',
    desc: 'Share new context or updated information.',
    color: '#06b6d4',
  },
  {
    kind: 'keep_in_loop',
    emoji: '🔄',
    label: 'Keep in Loop',
    desc: 'Mark something the character should carry forward across sessions.',
    color: '#10b981',
  },
  {
    kind: 'evolve',
    emoji: '🧬',
    label: 'Evolve',
    desc: 'A higher-level shift in personality, capability or direction.',
    color: '#ec4899',
  },
]

export const TRAINING_KIND_MAP: Record<string, TrainingKindMeta> = Object.fromEntries(
  TRAINING_KINDS.map((k) => [k.kind, k]),
)

export function kindMeta(kind: string): TrainingKindMeta {
  return (
    TRAINING_KIND_MAP[kind] || {
      kind: kind as TrainingKind,
      emoji: '•',
      label: kind,
      desc: '',
      color: '#94a3b8',
    }
  )
}

// Sub-weights — the per-character facets a signal can target. Each carries its
// own color so the training profile reads at a glance.
export const SUB_WEIGHTS: { slug: string; label: string; color: string }[] = [
  { slug: 'general', label: 'General', color: '#94a3b8' },
  { slug: 'tone', label: 'Tone', color: '#f59e0b' },
  { slug: 'accuracy', label: 'Accuracy', color: '#ef4444' },
  { slug: 'persona', label: 'Persona', color: '#8b5cf6' },
  { slug: 'knowledge', label: 'Knowledge', color: '#3b82f6' },
  { slug: 'safety', label: 'Safety', color: '#10b981' },
  { slug: 'style', label: 'Style', color: '#ec4899' },
]

export const SUB_WEIGHT_MAP: Record<string, { slug: string; label: string; color: string }> =
  Object.fromEntries(SUB_WEIGHTS.map((s) => [s.slug, s]))

export function subWeightMeta(slug: string) {
  return SUB_WEIGHT_MAP[slug] || { slug, label: slug, color: '#94a3b8' }
}

// Feedback categories testers pick when submitting bounty feedback. They map
// onto sub-weights so accepted feedback converts cleanly into a training signal.
export const FEEDBACK_CATEGORIES: { slug: string; label: string; subWeight: string }[] = [
  { slug: 'accuracy', label: 'Accuracy', subWeight: 'accuracy' },
  { slug: 'tone', label: 'Tone & voice', subWeight: 'tone' },
  { slug: 'persona', label: 'Persona consistency', subWeight: 'persona' },
  { slug: 'knowledge', label: 'Knowledge gaps', subWeight: 'knowledge' },
  { slug: 'safety', label: 'Safety', subWeight: 'safety' },
  { slug: 'general', label: 'General', subWeight: 'general' },
]

// ------------------------------------------------------------------- profile

export type RawSignal = {
  kind: string
  subWeight: string
  mode: string
  weight: number
  applied: boolean
}

export type TrainingProfile = {
  total: number
  applied: number
  pendingBatch: number
  // total applied weight, per sub-weight slug
  bySubWeight: Record<string, number>
  // count per training kind
  byKind: Record<string, number>
  // 0–100 "maturity": how much applied training a character has accumulated,
  // saturating so it reads as a smooth, ever-improving curve.
  maturity: number
}

export function buildProfile(signals: RawSignal[]): TrainingProfile {
  const bySubWeight: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  let applied = 0
  let pendingBatch = 0
  let appliedWeight = 0

  for (const s of signals) {
    const w = Number.isFinite(s.weight) ? Math.max(1, Math.min(5, Math.floor(s.weight))) : 1
    byKind[s.kind] = (byKind[s.kind] || 0) + 1
    if (s.applied) {
      applied++
      appliedWeight += w
      bySubWeight[s.subWeight] = (bySubWeight[s.subWeight] || 0) + w
    } else if (s.mode === 'batch') {
      pendingBatch++
    }
  }

  // Saturating maturity curve — each unit of applied weight adds less than the
  // last, so the character is always "improving" but never declared finished.
  const maturity = Math.round(100 * (1 - Math.exp(-appliedWeight / 40)))

  return {
    total: signals.length,
    applied,
    pendingBatch,
    bySubWeight,
    byKind,
    maturity,
  }
}
