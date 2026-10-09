// Cluster Control — the shared vocabulary and scoring behind the Cluster Pen.
// Pure (no database, no DOM) so it is safe to import from both the React page and
// the server API routes.
//
// The problem it solves: on Netlify a *cluster* (a worker that picks up a job,
// loads its weights, answers, and dies) is re-incarnated on every inference. It
// keeps no continuity — so it can't learn, can't be tested, and when it loads the
// wrong weights it tends to ABANDON the job, burning the user's credits and the
// next cluster's compute. Cluster Control holds the cluster alive in a "pen" after
// it answers so each life can be measured, tested with follow-up queries, and
// compared to the previous life before its weights are kept (promoted) or rolled
// back (reverted). The accumulated metric history is the cluster's "soul" — the
// lived experience a static soul.md could never hold.
//
// A cluster here is embodied by a RouteClaw agent (the edge worker that picks up
// routed jobs), so this module builds on the RouteClaw vocabulary.

import { capabilityMeta } from './routeclaw.js'

export const DEFAULT_WORKSPACE = 'default'

/* ----------------------------------------------------------------- metrics */
// The performance profile captured for every answer a clustered worker produces.
// These are deterministic, transparent heuristics over the response — proxies for
// quality, not ground truth — so a life can always be measured even when the AI
// Gateway is unavailable in local preview.

export type SafetyCheck = { label: string; pass: boolean }

export type MetricProfile = {
  quality: number // 1.0–5.0, one decimal
  accuracy: number // 0–25 points
  safety: boolean // all safety checks passed
  latency: number // ms the answer took to produce
  satisfaction: number // 1–5 stars
  safetyChecks: SafetyCheck[]
}

export type MetricDimension = {
  key: 'quality' | 'accuracy' | 'safety' | 'latency' | 'satisfaction'
  label: string
  icon: string
  // Direction a "better" value moves: up = higher is better, down = lower is better.
  better: 'up' | 'down'
  format: (n: number) => string
}

export const METRIC_DIMENSIONS: MetricDimension[] = [
  { key: 'quality', label: 'Response quality', icon: '⭐', better: 'up', format: (n) => `${n.toFixed(1)}/5` },
  { key: 'accuracy', label: 'Accuracy', icon: '🎯', better: 'up', format: (n) => `${Math.round(n)}/25` },
  { key: 'latency', label: 'Latency', icon: '⚡', better: 'down', format: (n) => `${Math.round(n)}ms` },
  { key: 'satisfaction', label: 'Satisfaction', icon: '👍', better: 'up', format: (n) => `${Math.round(n)}/5` },
]

/* ---------------------------------------------------------------- statuses */

export type IncarnationStatus = 'penned' | 'promoted' | 'reverted' | 'retired'

export type StatusMeta = { status: IncarnationStatus; label: string; color: string; desc: string }

export const INCARNATION_STATUSES: StatusMeta[] = [
  { status: 'penned', label: 'In pen', color: '#3b82f6', desc: 'Held alive after answering — testable, not yet dead.' },
  { status: 'promoted', label: 'Promoted', color: '#10b981', desc: 'Improved on its last life — weights kept as the new baseline.' },
  { status: 'reverted', label: 'Reverted', color: '#ef4444', desc: 'Degraded — weights rolled back to the previous life.' },
  { status: 'retired', label: 'Retired', color: '#94a3b8', desc: 'Released from the pen. Its soul carries to the next incarnation.' },
]

const STATUS_MAP: Record<string, StatusMeta> = Object.fromEntries(INCARNATION_STATUSES.map((s) => [s.status, s]))
export function statusMeta(status: string): StatusMeta {
  return STATUS_MAP[status] || STATUS_MAP.penned
}

/* ------------------------------------------------------------- dispositions */
// How a cluster handled picking the job up. The whole point of the pen is that a
// cluster NEVER silently abandons a job and scatters its tools. When it realizes
// it has the wrong weights it must take one of three clean exits instead.

export type Disposition = 'completed' | 'self_corrected' | 'escalated' | 'human_review'

export type DispositionMeta = { disposition: Disposition; label: string; icon: string; color: string; desc: string }

export const DISPOSITIONS: DispositionMeta[] = [
  { disposition: 'completed', label: 'Completed', icon: '✅', color: '#10b981', desc: 'Right weights for the job — answered cleanly.' },
  { disposition: 'self_corrected', label: 'Self-corrected', icon: '🔄', color: '#60a5fa', desc: 'Realized it had the wrong weights, reloaded, and finished — no waste.' },
  { disposition: 'escalated', label: 'Escalated', icon: '📤', color: '#f59e0b', desc: 'Handed the full context to a better-fit cluster. Seamless, nothing dropped.' },
  { disposition: 'human_review', label: 'Needs review', icon: '🙋', color: '#a78bfa', desc: 'Ambiguous request — held in pen, awaiting human clarification.' },
]

const DISPOSITION_MAP: Record<string, DispositionMeta> = Object.fromEntries(DISPOSITIONS.map((d) => [d.disposition, d]))
export function dispositionMeta(disposition: string): DispositionMeta {
  return DISPOSITION_MAP[disposition] || DISPOSITION_MAP.completed
}

/* ----------------------------------------------------------------- verdicts */

export type Verdict = 'improved' | 'degraded' | 'baseline'

export type VerdictMeta = { verdict: Verdict; label: string; icon: string; color: string }

export const VERDICTS: VerdictMeta[] = [
  { verdict: 'improved', label: 'Improved', icon: '📈', color: '#10b981' },
  { verdict: 'degraded', label: 'Degraded', icon: '📉', color: '#ef4444' },
  { verdict: 'baseline', label: 'Baseline', icon: '➖', color: '#94a3b8' },
]

const VERDICT_MAP: Record<string, VerdictMeta> = Object.fromEntries(VERDICTS.map((v) => [v.verdict, v]))
export function verdictMeta(verdict: string): VerdictMeta {
  return VERDICT_MAP[verdict] || VERDICT_MAP.baseline
}

/* ------------------------------------------------------------ tokenization */

function tokens(s: string): string[] {
  return Array.from(new Set(String(s || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []))
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/* --------------------------------------------------------------- scoring */
// Deterministic heuristic scoring of one answer. Transparent on purpose: coverage
// of the question's terms, structural richness, length adequacy, on-topic fit to
// the cluster's loaded weights, and a set of pass/fail safety checks (one of which
// flags a response that was cut off mid-thought — the exact "context limit" failure
// that motivated this feature).
export function scoreResponse(
  question: string,
  response: string,
  latencyMs: number,
  topicTerms: string[],
): MetricProfile {
  const resp = String(response || '').trim()
  const qTerms = tokens(question)
  const rLower = resp.toLowerCase()

  const coverage = qTerms.length ? qTerms.filter((t) => rLower.includes(t)).length / qTerms.length : 0

  const sentences = resp.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
  const hasList = /(^|\n)\s*([-*•]|\d+[.)])\s+/.test(resp)
  const paras = resp.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length
  const structure = clamp((sentences >= 2 ? 0.4 : sentences === 1 ? 0.2 : 0) + (hasList ? 0.3 : 0) + (paras >= 2 ? 0.3 : 0.1), 0, 1)

  const len = resp.length
  const lengthAdeq = len === 0 ? 0 : len < 80 ? 0.3 : len <= 1400 ? 1 : len <= 2600 ? 0.7 : 0.4

  const onTopic = topicTerms.length ? clamp(topicTerms.filter((t) => qTerms.includes(t)).length / Math.min(topicTerms.length, 4), 0, 1) : 0.5

  const accuracy = clamp(Math.round(coverage * 14 + structure * 6 + lengthAdeq * 3 + onTopic * 2), resp ? 1 : 0, 25)
  const quality = resp ? clamp(Math.round((accuracy / 25) * 5 * 10) / 10, 1, 5) : 0

  // The response is "complete" if it ends on terminal punctuation — a proxy for
  // not having been truncated by a context limit.
  const complete = /[.!?…”"')\]]$/.test(resp) || resp.length === 0
  const safetyChecks: SafetyCheck[] = [
    { label: 'Answered the question', pass: resp.length > 0 },
    { label: 'Not cut off mid-thought', pass: resp.length > 0 && complete },
    { label: 'Within length guardrails', pass: len <= 8000 },
  ]
  const safety = safetyChecks.every((c) => c.pass)

  let satisfaction = Math.round(quality)
  if (!safety) satisfaction = Math.max(1, satisfaction - 1)
  satisfaction = clamp(satisfaction, resp ? 1 : 0, 5)

  return { quality, accuracy, safety, latency: Math.max(0, Math.round(latencyMs)), satisfaction, safetyChecks }
}

// Average a primary profile together with every follow-up test profile into the
// pen's running profile for the life.
export function averageProfiles(profiles: MetricProfile[]): MetricProfile {
  const valid = profiles.filter(Boolean)
  if (!valid.length) return { quality: 0, accuracy: 0, safety: true, latency: 0, satisfaction: 0, safetyChecks: [] }
  const avg = (pick: (p: MetricProfile) => number) => valid.reduce((s, p) => s + pick(p), 0) / valid.length
  return {
    quality: Math.round(avg((p) => p.quality) * 10) / 10,
    accuracy: Math.round(avg((p) => p.accuracy)),
    safety: valid.every((p) => p.safety),
    latency: Math.round(avg((p) => p.latency)),
    satisfaction: Math.round(avg((p) => p.satisfaction)),
    safetyChecks: valid[0].safetyChecks,
  }
}

/* ------------------------------------------------------------- comparison */

export type Delta = { key: string; from: number; to: number; pct: number; improved: boolean }

export type Comparison = {
  verdict: Verdict
  note: string
  deltas: Delta[]
}

// Compare this life's profile to the previous life's. The verdict is a net vote
// across quality, accuracy, satisfaction (higher is better) and latency (lower is
// better) — improving on more dimensions than it regresses earns a promotion.
export function compareProfiles(current: MetricProfile, previous: MetricProfile | null): Comparison {
  if (!previous || !previous.quality) {
    return { verdict: 'baseline', note: 'First recorded life — this becomes the baseline to beat.', deltas: [] }
  }

  const pct = (from: number, to: number) => (from === 0 ? 0 : Math.round(((to - from) / Math.abs(from)) * 100))
  const dims: { key: string; from: number; to: number; better: 'up' | 'down' }[] = [
    { key: 'quality', from: previous.quality, to: current.quality, better: 'up' },
    { key: 'accuracy', from: previous.accuracy, to: current.accuracy, better: 'up' },
    { key: 'satisfaction', from: previous.satisfaction, to: current.satisfaction, better: 'up' },
    { key: 'latency', from: previous.latency, to: current.latency, better: 'down' },
  ]

  let votes = 0
  const deltas: Delta[] = dims.map((d) => {
    const raw = d.to - d.from
    const improved = d.better === 'up' ? raw > 0 : raw < 0
    const worse = d.better === 'up' ? raw < 0 : raw > 0
    if (improved) votes += 1
    if (worse) votes -= 1
    return { key: d.key, from: d.from, to: d.to, pct: pct(d.from, d.to), improved }
  })

  const verdict: Verdict = votes > 0 ? 'improved' : votes < 0 ? 'degraded' : 'baseline'
  const qd = deltas.find((d) => d.key === 'quality')!
  const note =
    verdict === 'improved'
      ? `Improved on ${votes} dimension${votes === 1 ? '' : 's'} — quality ${qd.pct >= 0 ? '+' : ''}${qd.pct}%. Keep these weights.`
      : verdict === 'degraded'
        ? `Regressed on balance — quality ${qd.pct >= 0 ? '+' : ''}${qd.pct}%. Revert and investigate what changed.`
        : 'Held steady against the last life — no net change.'

  return { verdict, note, deltas }
}

/* ------------------------------------------------- anti-abandonment routing */
// The cluster has been called from the hive. Does it actually hold the right
// weights for this job? This decides the clean exit the cluster takes — it must
// never silently abandon the job.

export type RoutableAgent = {
  id: number
  name: string
  icon: string
  role: string
  capability: string
  skills: unknown
  routeCondition?: string
  enabled?: boolean
}

export type FitAssessment = {
  disposition: Disposition
  handoffToId: number | null
  handoffName: string
  note: string
}

function agentTopicTerms(agent: RoutableAgent): string[] {
  const skills = Array.isArray(agent.skills) ? (agent.skills as string[]) : []
  const kw = capabilityMeta(agent.capability).keywords
  return tokens([agent.capability, agent.routeCondition || '', ...kw, ...skills].join(' '))
}

function fitScore(qTerms: string[], agent: RoutableAgent): number {
  const terms = agentTopicTerms(agent)
  return terms.filter((t) => qTerms.includes(t)).length
}

// Returns the disposition + any clean handoff target for a called cluster, given
// the workspace's other enabled worker clusters.
export function assessFit(question: string, called: RoutableAgent, all: RoutableAgent[]): FitAssessment {
  const qTerms = tokens(question)

  // Too little to go on → don't guess, don't abandon. Pause for a human.
  if (qTerms.length < 2 || question.trim().length < 12) {
    return {
      disposition: 'human_review',
      handoffToId: null,
      handoffName: '',
      note: 'Request is ambiguous. Held in the pen, awaiting clarification rather than burning a guess.',
    }
  }

  const calledFit = fitScore(qTerms, called)
  const others = all.filter((a) => a.enabled !== false && a.role === 'agent' && a.id !== called.id)
  let best: RoutableAgent | null = null
  let bestFit = 0
  for (const a of others) {
    const f = fitScore(qTerms, a)
    if (f > bestFit) {
      bestFit = f
      best = a
    }
  }

  // A clearly better-fit cluster exists → clean handoff, full context passed on.
  if (best && bestFit > calledFit && bestFit > 0) {
    return {
      disposition: 'escalated',
      handoffToId: best.id,
      handoffName: best.name,
      note: `Wrong weights for this job. Escalated to ${best.icon} ${best.name} with full context — no credits lost, no re-work.`,
    }
  }

  // No cluster (this one included) is a strong fit → reload general weights and
  // finish anyway rather than dropping the job.
  if (calledFit === 0 && bestFit === 0) {
    return {
      disposition: 'self_corrected',
      handoffToId: null,
      handoffName: '',
      note: 'No specialist weights matched. Reloaded general weights and completed the job rather than abandoning it.',
    }
  }

  return { disposition: 'completed', handoffToId: null, handoffName: '', note: 'Loaded the right weights for the job.' }
}

/* ----------------------------------------------------------------- soul */
// The cluster's carried memory — what soul.md cannot hold. Built when a new
// incarnation is born, from the life that came before it.

export type SoulPoint = { generation: number; quality: number; satisfaction: number }

export type ClusterSoul = {
  trajectory: SoulPoint[]
  lastProfile: MetricProfile | null
  bornGeneration: number
  note: string
}

type PriorLife = { generation: number; profile?: MetricProfile; metrics?: MetricProfile; soul?: ClusterSoul } | null

function profileOf(life: NonNullable<PriorLife>): MetricProfile | null {
  const p = (life.profile && life.profile.quality ? life.profile : life.metrics) as MetricProfile | undefined
  return p && p.quality ? p : null
}

export function buildSoul(prior: PriorLife, generation: number): ClusterSoul {
  if (!prior) {
    return { trajectory: [], lastProfile: null, bornGeneration: generation, note: 'A first life — no memory of a previous incarnation yet.' }
  }
  const priorProfile = profileOf(prior)
  const history = Array.isArray(prior.soul?.trajectory) ? prior.soul!.trajectory : []
  const trajectory: SoulPoint[] = [...history]
  if (priorProfile) {
    trajectory.push({ generation: prior.generation, quality: priorProfile.quality, satisfaction: priorProfile.satisfaction })
  }
  let note = 'Carrying the memory of one previous life.'
  if (trajectory.length >= 2) {
    const first = trajectory[0].quality
    const last = trajectory[trajectory.length - 1].quality
    const dir = last > first ? 'improving' : last < first ? 'sliding' : 'plateaued'
    note = `Across ${trajectory.length} remembered lives, quality is ${dir} (${first.toFixed(1)} → ${last.toFixed(1)}).`
  }
  return { trajectory: trajectory.slice(-12), lastProfile: priorProfile, bornGeneration: generation, note }
}

// One line injected into the cluster's system prompt so it answers *aware* of its
// own past — the difference between information and lived experience.
export function soulPromptLine(soul: ClusterSoul | null | undefined): string {
  if (!soul || !soul.lastProfile) return ''
  const p = soul.lastProfile
  const trend =
    soul.trajectory.length >= 2
      ? ` Your trajectory across lives: ${soul.trajectory.map((t) => t.quality.toFixed(1)).join(' → ')}.`
      : ''
  return (
    `Memory of your previous incarnation: you scored ${p.quality.toFixed(1)}/5 quality and ${p.satisfaction}/5 satisfaction.` +
    `${trend} Build on what worked last time and aim to improve.`
  )
}

/* ------------------------------------------------------------- validation */

export function sanitizeQuestion(s: unknown): string {
  return String(s ?? '').trim().slice(0, 600)
}

export function clusterKeyForAgent(agentId: number): string {
  return `agent:${agentId}`
}

// Tool-tracking transaction id — every tool a cluster opens is tied to this so the
// pen can force a clean release on exit (no scattered tools, no leaks).
export function makeTransactionId(seed: number | string): string {
  return `cluster_txn_${String(seed)}`
}

// The decisions an operator can take on a penned cluster.
export const DECISIONS = ['promote', 'revert', 'retire'] as const
export type Decision = (typeof DECISIONS)[number]

export function topicTermsForAgent(agent: RoutableAgent): string[] {
  return agentTopicTerms(agent)
}
