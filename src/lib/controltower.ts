// Control Tower — the shared vocabulary behind the AI Enterprise Control Deck.
// Pure (no database, no DOM) so it is safe to import from both the React page and
// the server API routes.
//
// The Control Tower is the single pane of glass over the autonomous workforce:
// every character acting as an AI specialist, every model in flight, every
// RouteClaw agent, and every running Mission (workflow). It builds on two new
// primitives:
//   • Context Engine — shared business context (facts, decisions, relationships,
//     policies, metrics) that agents draw on before acting.
//   • Missions — outbound jobs a character works autonomously across a planned
//     workflow of RouteClaw capability steps, reporting finished work.

import { CAPABILITIES, type Capability, capabilityMeta, clearanceMeta } from './routeclaw.js'

export const DEFAULT_WORKSPACE = 'default'

// Display label for a security clearance slug — re-exported through the Control
// Tower vocabulary so the deck doesn't have to reach into RouteClaw directly.
export function clearanceLabel(clearance: string): string {
  return clearanceMeta(clearance).label
}

/* ----------------------------------------------------------------- channels */
// How a mission's work reaches people — the CharacterVerse LLM surfaces a request
// can arrive on and a finished result can be delivered through.

export type Channel = 'chat' | 'voice' | 'mobile' | 'web' | 'email'

export type ChannelMeta = { channel: Channel; label: string; icon: string; desc: string }

export const CHANNELS: ChannelMeta[] = [
  { channel: 'chat', label: 'Chat', icon: '💬', desc: 'In-product conversation thread.' },
  { channel: 'voice', label: 'Voice', icon: '🎙️', desc: 'Spoken request, spoken answer.' },
  { channel: 'mobile', label: 'Mobile', icon: '📱', desc: 'On-the-go from the mobile app.' },
  { channel: 'web', label: 'Web', icon: '🌐', desc: 'Public web touchpoint or form.' },
  { channel: 'email', label: 'Email', icon: '✉️', desc: 'Async outbound correspondence.' },
]

const CHANNEL_MAP: Record<string, ChannelMeta> = Object.fromEntries(CHANNELS.map((c) => [c.channel, c]))
export function channelMeta(channel: string): ChannelMeta {
  return CHANNEL_MAP[channel] || CHANNEL_MAP.chat
}

/* --------------------------------------------------------------- autonomy */
// How much rope the workspace gives a mission. The same security model as
// RouteClaw clearance still applies on every step; autonomy only decides how far
// the engine advances before handing control back to a human.

export type Autonomy = 'assist' | 'supervised' | 'autonomous'

export type AutonomyMeta = {
  autonomy: Autonomy
  label: string
  icon: string
  desc: string
  color: string
}

export const AUTONOMY_LEVELS: AutonomyMeta[] = [
  {
    autonomy: 'assist',
    label: 'Assist',
    icon: '✋',
    color: '#60a5fa',
    desc: 'Plans the workflow and waits. A human runs each step.',
  },
  {
    autonomy: 'supervised',
    label: 'Supervised',
    icon: '👁️',
    color: '#f59e0b',
    desc: 'Runs autonomously but pauses for sign-off at any verification gate.',
  },
  {
    autonomy: 'autonomous',
    label: 'Autonomous',
    icon: '⚡',
    color: '#10b981',
    desc: 'Runs the whole workflow end to end, only stopping if blocked.',
  },
]

const AUTONOMY_MAP: Record<string, AutonomyMeta> = Object.fromEntries(AUTONOMY_LEVELS.map((a) => [a.autonomy, a]))
export function autonomyMeta(autonomy: string): AutonomyMeta {
  return AUTONOMY_MAP[autonomy] || AUTONOMY_MAP.supervised
}

/* --------------------------------------------------------------- statuses */

export type MissionStatus = 'draft' | 'running' | 'blocked' | 'review' | 'done'

export type StatusMeta = { status: MissionStatus; label: string; color: string }

export const MISSION_STATUSES: StatusMeta[] = [
  { status: 'draft', label: 'Draft', color: '#94a3b8' },
  { status: 'running', label: 'Running', color: '#3b82f6' },
  { status: 'blocked', label: 'Blocked', color: '#ef4444' },
  { status: 'review', label: 'Awaiting sign-off', color: '#f59e0b' },
  { status: 'done', label: 'Delivered', color: '#10b981' },
]

const STATUS_MAP: Record<string, StatusMeta> = Object.fromEntries(MISSION_STATUSES.map((s) => [s.status, s]))
export function statusMeta(status: string): StatusMeta {
  return STATUS_MAP[status] || STATUS_MAP.draft
}

/* ------------------------------------------------------------ context kinds */

export type ContextKind = 'fact' | 'decision' | 'relationship' | 'policy' | 'metric'

export type ContextKindMeta = { kind: ContextKind; label: string; icon: string; color: string; desc: string }

export const CONTEXT_KINDS: ContextKindMeta[] = [
  { kind: 'fact', label: 'Fact', icon: '📌', color: '#60a5fa', desc: 'A stable truth about the business.' },
  { kind: 'decision', label: 'Decision', icon: '⚖️', color: '#a78bfa', desc: 'A choice already made, with its rationale.' },
  { kind: 'relationship', label: 'Relationship', icon: '🔗', color: '#10b981', desc: 'How two entities connect.' },
  { kind: 'policy', label: 'Policy', icon: '🛡️', color: '#f59e0b', desc: 'A standing rule agents must respect.' },
  { kind: 'metric', label: 'Metric', icon: '📈', color: '#06b6d4', desc: 'A tracked number that changes over time.' },
]

const CONTEXT_KIND_MAP: Record<string, ContextKindMeta> = Object.fromEntries(CONTEXT_KINDS.map((c) => [c.kind, c]))
export function contextKindMeta(kind: string): ContextKindMeta {
  return CONTEXT_KIND_MAP[kind] || CONTEXT_KIND_MAP.fact
}

export const CONTEXT_KIND_SLUGS = CONTEXT_KINDS.map((c) => c.kind)

/* --------------------------------------------------------------- models */
// The model registry the Control Tower reports on. CharacterVerse runs every
// character on the AI Gateway; the tower shows which model fronts which surface
// so an operator can see the whole fleet, not just one chat.

export type ModelEntry = {
  id: string
  label: string
  provider: string
  role: string
}

export const MODEL_REGISTRY: ModelEntry[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic', role: 'Character roleplay & mission narration — fast streaming' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'Anthropic', role: 'Reserved for deep synthesis & verification steps' },
]

/* ----------------------------------------------------------- mission steps */
// A planned step in a mission's workflow. Each maps to a RouteClaw capability so
// the deterministic dispatch engine can route it to a cleared agent.

export type StepStatus = 'pending' | 'active' | 'done' | 'blocked'

export type MissionStep = {
  capability: Capability
  label: string
  note: string
  status: StepStatus
}

// Deterministic mission planner. Reads the objective and assembles an ordered
// workflow of capability steps, mirroring how the RouteClaw Warden decomposes a
// request — but persisted as the mission's plan. Research/synthesis is the
// backbone; analysis/extra research is added when the objective calls for it; a
// verification sign-off and a delivery step always close the workflow so nothing
// ships unchecked. Runs without the AI Gateway so the plan is always available.
export function planMission(objective: string): MissionStep[] {
  const lower = String(objective || '').toLowerCase()

  const matched = CAPABILITIES.filter(
    (c) => c.capability !== 'dispatch' && c.keywords.some((k) => lower.includes(k)),
  ).map((c) => c.capability)

  const set = new Set<Capability>(matched.length ? matched : ['research', 'synthesis'])
  // Every outbound workflow gathers, then frames a recommendation, before it can
  // be signed off and delivered.
  set.add('research')
  set.add('synthesis')
  set.add('verification')
  set.add('delivery')

  const ordered = CAPABILITIES.map((c) => c.capability).filter(
    (c) => c !== 'dispatch' && set.has(c),
  )

  return ordered.map((capability) => {
    const meta = capabilityMeta(capability)
    return {
      capability,
      label: meta.label,
      note: meta.desc,
      status: 'pending' as StepStatus,
    }
  })
}

// Progress (0–100) from a step list.
export function stepProgress(steps: MissionStep[]): number {
  if (!steps.length) return 0
  const done = steps.filter((s) => s.status === 'done').length
  return Math.round((done / steps.length) * 100)
}

/* --------------------------------------------------------------- validation */

export const CHANNEL_SLUGS = CHANNELS.map((c) => c.channel)
export const AUTONOMY_SLUGS = AUTONOMY_LEVELS.map((a) => a.autonomy)
export const CLEARANCE_SLUGS_CT = ['public', 'internal', 'restricted'] as const

export type CleanMission = {
  characterId: number | null
  title: string
  objective: string
  channel: Channel
  autonomy: Autonomy
  clearance: 'public' | 'internal' | 'restricted'
  contextRefs: number[]
}

// Server-side guard for mission create/update. Returns a cleaned payload or an
// error string — rejects unknown channels/autonomy/clearance and caps free text.
export function sanitizeMissionInput(
  body: any,
): { ok: true; value: CleanMission } | { ok: false; error: string } {
  const title = String(body?.title ?? '').trim().slice(0, 100)
  if (!title) return { ok: false, error: 'A mission title is required' }

  const objective = String(body?.objective ?? '').trim().slice(0, 600)
  if (!objective) return { ok: false, error: 'A mission objective is required' }

  const channel = (CHANNEL_SLUGS as readonly string[]).includes(body?.channel) ? body.channel : 'chat'
  const autonomy = (AUTONOMY_SLUGS as readonly string[]).includes(body?.autonomy) ? body.autonomy : 'supervised'
  const clearance = (CLEARANCE_SLUGS_CT as readonly string[]).includes(body?.clearance) ? body.clearance : 'internal'

  const rawChar = Number(body?.characterId)
  const characterId = Number.isInteger(rawChar) && rawChar > 0 ? rawChar : null

  let contextRefs: number[] = []
  if (Array.isArray(body?.contextRefs)) {
    contextRefs = body.contextRefs
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n > 0)
      .slice(0, 30)
  }

  return {
    ok: true,
    value: { characterId, title, objective, channel, autonomy, clearance, contextRefs },
  }
}

export type CleanContext = {
  kind: ContextKind
  title: string
  body: string
  tags: string[]
  source: string
  confidence: number
  pinned: boolean
}

// Server-side guard for context-entry create/update.
export function sanitizeContextInput(
  body: any,
): { ok: true; value: CleanContext } | { ok: false; error: string } {
  const title = String(body?.title ?? '').trim().slice(0, 120)
  if (!title) return { ok: false, error: 'A title is required' }

  const kind = (CONTEXT_KIND_SLUGS as readonly string[]).includes(body?.kind) ? body.kind : 'fact'

  let tags: string[] = []
  if (Array.isArray(body?.tags)) {
    tags = body.tags
      .map((t: any) => String(t).trim().slice(0, 24))
      .filter(Boolean)
      .slice(0, 8)
  }

  let confidence = Number(body?.confidence)
  if (!Number.isInteger(confidence) || confidence < 1) confidence = 3
  if (confidence > 5) confidence = 5

  return {
    ok: true,
    value: {
      kind,
      title,
      body: String(body?.body ?? '').trim().slice(0, 1000),
      tags,
      source: String(body?.source ?? '').trim().slice(0, 80),
      confidence,
      pinned: Boolean(body?.pinned),
    },
  }
}

/* ----------------------------------------------------------------- defaults */
// Seed context that demonstrates the Context Engine the first time the tower is
// opened — the kind of shared business memory autonomous agents act on.

export type ContextSeed = {
  kind: ContextKind
  title: string
  body: string
  tags: string[]
  source: string
  confidence: number
  pinned: boolean
}

export const DEFAULT_CONTEXT: ContextSeed[] = [
  {
    kind: 'policy',
    title: 'Restricted data never leaves the workspace',
    body: 'Any mission touching customer PII or financials is classified restricted and may only run on restricted-clearance agents. No restricted output is delivered on a public channel.',
    tags: ['security', 'compliance'],
    source: 'Security charter',
    confidence: 5,
    pinned: true,
  },
  {
    kind: 'fact',
    title: 'Brand voice is warm, concise, never hypey',
    body: 'Outbound characters speak in plain, confident language. Short sentences. No exclamation-point marketing. Lead with the useful thing.',
    tags: ['brand', 'tone'],
    source: 'Style guide',
    confidence: 4,
    pinned: true,
  },
  {
    kind: 'decision',
    title: 'Haiku 4.5 is the default mission model',
    body: 'Chosen for fast streaming on roleplay and narration. Deeper synthesis or verification steps may escalate to Opus when sign-off requires it.',
    tags: ['models', 'cost'],
    source: 'Architecture review',
    confidence: 4,
    pinned: false,
  },
  {
    kind: 'relationship',
    title: 'Enterprise workspaces roll up to one account owner',
    body: 'The boss/auditor owns governance for every private character; staff usage earns the Conference Cluster credit rate back to that owner.',
    tags: ['org', 'billing'],
    source: 'Enterprise tier',
    confidence: 3,
    pinned: false,
  },
  {
    kind: 'metric',
    title: 'Stuck-mission threshold is 50 minutes',
    body: 'A mission sitting in one step past the workspace threshold is flagged for escalation to a division manager on the Audit dashboard.',
    tags: ['ops', 'sla'],
    source: 'Enterprise settings',
    confidence: 3,
    pinned: false,
  },
]
