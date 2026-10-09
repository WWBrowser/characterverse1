// RouteClaw — the shared vocabulary behind the Agentic Edge Routing Layer (AERL).
// Pure (no database, no DOM) so it is safe to import from both the React page and
// the server API.
//
// RouteClaw is a directed workflow topology of specialized agents that runs at
// the edge. A request arrives; the Warden (dispatcher / hub) decomposes it and
// routes each sub-task to the best capability agent; the response flows back.
// The whole layer is editable — rename, edit, add, remove and switch agents —
// and every agent carries a security CLEARANCE so routing stays locked down.

export type Capability =
  | 'dispatch'
  | 'research'
  | 'synthesis'
  | 'analysis'
  | 'verification'
  | 'delivery'

export type Clearance = 'public' | 'internal' | 'restricted'

export type CapabilityMeta = {
  capability: Capability
  label: string
  // The Warden routes a sub-task here when it "needs <trigger>".
  trigger: string
  desc: string
  color: string
  icon: string
  // The default specialized skills an agent of this capability ships with.
  skills: string[]
  // Keywords the deterministic router matches a request against (so dispatch
  // works even when the AI Gateway is unavailable in local preview).
  keywords: string[]
}

// The six RouteClaw capabilities, in pipeline order. `dispatch` is the Warden's
// own capability; the rest are the worker agents it delegates to.
export const CAPABILITIES: CapabilityMeta[] = [
  {
    capability: 'dispatch',
    label: 'Dispatch',
    trigger: 'intake',
    desc: 'Intake, decompose, prioritize and route the request to the best agent.',
    color: '#a78bfa',
    icon: '🛡️',
    skills: ['analyze', 'decompose', 'route', 'prioritize'],
    keywords: [],
  },
  {
    capability: 'research',
    label: 'Research',
    trigger: 'research',
    desc: 'Gather sources, retrieve prior knowledge, cite and deduplicate.',
    color: '#3b82f6',
    icon: '🔎',
    skills: ['web-search', 'retrieve', 'cite', 'deduplicate'],
    keywords: ['research', 'find', 'search', 'gather', 'look up', 'sources', 'discover', 'investigate'],
  },
  {
    capability: 'synthesis',
    label: 'Synthesis',
    trigger: 'synthesis',
    desc: 'Summarize, outline, critique and draft a recommendation.',
    color: '#10b981',
    icon: '💡',
    skills: ['summarize', 'outline', 'critique', 'draft'],
    keywords: ['synthesize', 'summarize', 'draft', 'write', 'recommend', 'outline', 'explain', 'design'],
  },
  {
    capability: 'analysis',
    label: 'Analysis',
    trigger: 'analysis',
    desc: 'Compute, reconcile, chart and forecast over the findings.',
    color: '#f59e0b',
    icon: '📊',
    skills: ['compute', 'reconcile', 'chart', 'forecast'],
    keywords: ['analyze', 'compute', 'calculate', 'chart', 'forecast', 'compare', 'metrics', 'numbers', 'data'],
  },
  {
    capability: 'verification',
    label: 'Verification',
    trigger: 'verification',
    desc: 'Verify, refute, red-team and sign off before delivery.',
    color: '#ef4444',
    icon: '🛰️',
    skills: ['verify', 'refute', 'redteam', 'sign-off'],
    keywords: ['verify', 'check', 'validate', 'confirm', 'review', 'audit', 'secure', 'safe', 'correct'],
  },
  {
    capability: 'delivery',
    label: 'Delivery',
    trigger: 'delivery',
    desc: 'Format, publish, notify and archive the finished response.',
    color: '#06b6d4',
    icon: '📮',
    skills: ['format', 'publish', 'notify', 'archive'],
    keywords: ['deliver', 'format', 'publish', 'send', 'notify', 'export', 'archive', 'present'],
  },
]

export const CAPABILITY_MAP: Record<string, CapabilityMeta> = Object.fromEntries(
  CAPABILITIES.map((c) => [c.capability, c]),
)

export function capabilityMeta(capability: string): CapabilityMeta {
  return (
    CAPABILITY_MAP[capability] || {
      capability: capability as Capability,
      label: capability,
      trigger: capability,
      desc: '',
      color: '#94a3b8',
      icon: '🐾',
      skills: [],
      keywords: [],
    }
  )
}

// Security clearance — the lever that "keeps the routing secure". A request is
// classified at one of these levels; the Warden refuses to route it to any agent
// whose clearance sits below the request's classification, so sensitive work
// never reaches an under-cleared agent.
export type ClearanceMeta = {
  clearance: Clearance
  label: string
  // Higher rank = more sensitive. An agent may handle requests at its own rank
  // or below.
  rank: number
  color: string
  desc: string
}

export const CLEARANCES: ClearanceMeta[] = [
  {
    clearance: 'public',
    label: 'Public',
    rank: 0,
    color: '#10b981',
    desc: 'Open requests. Any agent may handle them.',
  },
  {
    clearance: 'internal',
    label: 'Internal',
    rank: 1,
    color: '#f59e0b',
    desc: 'Workspace-only requests. Routed to internal or restricted agents.',
  },
  {
    clearance: 'restricted',
    label: 'Restricted',
    rank: 2,
    color: '#ef4444',
    desc: 'Sensitive requests. Routed only to restricted-clearance agents.',
  },
]

export const CLEARANCE_MAP: Record<string, ClearanceMeta> = Object.fromEntries(
  CLEARANCES.map((c) => [c.clearance, c]),
)

export function clearanceMeta(clearance: string): ClearanceMeta {
  return CLEARANCE_MAP[clearance] || CLEARANCE_MAP.internal
}

// Is `agentClearance` cleared to handle a request classified at `requestClearance`?
// The agent must be at least as cleared as the request is sensitive.
export function isCleared(agentClearance: string, requestClearance: string): boolean {
  return clearanceMeta(agentClearance).rank >= clearanceMeta(requestClearance).rank
}

export const DEFAULT_WORKSPACE = 'default'

// ----------------------------------------------------------------- defaults

export type AgentSeed = {
  name: string
  role: 'warden' | 'agent'
  capability: Capability
  description: string
  routeCondition: string
  skills: string[]
  icon: string
  color: string
  clearance: Clearance
  requiresSignoff: boolean
}

// The starting RouteClaw agency network — the Warden hub plus the five worker
// agents from the reference topology. Seeded the first time the layer is opened;
// fully editable afterwards.
export const DEFAULT_AGENTS: AgentSeed[] = [
  {
    name: 'Warden',
    role: 'warden',
    capability: 'dispatch',
    description: 'Receives every request at the edge, decomposes it into sub-tasks, and routes each to the best agent by capability and clearance.',
    routeCondition: 'all requests',
    skills: ['analyze', 'decompose', 'route', 'prioritize'],
    icon: '🛡️',
    color: '#a78bfa',
    clearance: 'restricted',
    requiresSignoff: false,
  },
  {
    name: 'Ferret',
    role: 'agent',
    capability: 'research',
    description: 'Digs up sources, retrieves prior knowledge, cites references and removes redundancy.',
    routeCondition: 'needs research',
    skills: ['web-search', 'retrieve', 'cite', 'deduplicate'],
    icon: '🔎',
    color: '#3b82f6',
    clearance: 'internal',
    requiresSignoff: false,
  },
  {
    name: 'Lumen',
    role: 'agent',
    capability: 'synthesis',
    description: 'Turns raw findings into a structured recommendation: summarize, outline, critique, draft.',
    routeCondition: 'needs synthesis',
    skills: ['summarize', 'outline', 'critique', 'draft'],
    icon: '💡',
    color: '#10b981',
    clearance: 'internal',
    requiresSignoff: false,
  },
  {
    name: 'Tally',
    role: 'agent',
    capability: 'analysis',
    description: 'Runs the numbers — compute, reconcile, chart and forecast over the findings.',
    routeCondition: 'needs analysis',
    skills: ['compute', 'reconcile', 'chart', 'forecast'],
    icon: '📊',
    color: '#f59e0b',
    clearance: 'internal',
    requiresSignoff: false,
  },
  {
    name: 'Sentry',
    role: 'agent',
    capability: 'verification',
    description: 'The security gate — verify, refute, red-team and sign off before anything ships.',
    routeCondition: 'needs verification',
    skills: ['verify', 'refute', 'redteam', 'sign-off'],
    icon: '🛰️',
    color: '#ef4444',
    clearance: 'restricted',
    requiresSignoff: true,
  },
  {
    name: 'Courier',
    role: 'agent',
    capability: 'delivery',
    description: 'Packages and delivers the finished response: format, publish, notify, archive.',
    routeCondition: 'needs delivery',
    skills: ['format', 'publish', 'notify', 'archive'],
    icon: '📮',
    color: '#06b6d4',
    clearance: 'internal',
    requiresSignoff: false,
  },
]

// ----------------------------------------------------------------- validation

export const ROLES = ['warden', 'agent'] as const
export const CAPABILITY_SLUGS = CAPABILITIES.map((c) => c.capability)
export const CLEARANCE_SLUGS = CLEARANCES.map((c) => c.clearance)

// Server-side guard. Returns a cleaned, fully-typed agent payload or an error
// string. Keeps routing secure by rejecting unknown capabilities/clearances/roles
// and capping free-text and skill lists rather than trusting client input.
export function sanitizeAgentInput(
  body: any,
): { ok: true; value: CleanAgent } | { ok: false; error: string } {
  const name = String(body?.name ?? '').trim().slice(0, 40)
  if (!name) return { ok: false, error: 'An agent name is required' }

  const role = ROLES.includes(body?.role) ? body.role : 'agent'
  const capability = CAPABILITY_SLUGS.includes(body?.capability) ? body.capability : 'research'
  const clearance = CLEARANCE_SLUGS.includes(body?.clearance) ? body.clearance : 'internal'

  let skills: string[] = []
  if (Array.isArray(body?.skills)) {
    skills = body.skills
      .map((s: any) => String(s).trim().slice(0, 24))
      .filter(Boolean)
      .slice(0, 8)
  }

  const color = /^#[0-9a-fA-F]{6}$/.test(body?.color) ? body.color : capabilityMeta(capability).color
  const icon = String(body?.icon ?? capabilityMeta(capability).icon).trim().slice(0, 4) || '🐾'

  return {
    ok: true,
    value: {
      name,
      role,
      capability,
      clearance,
      skills,
      color,
      icon,
      description: String(body?.description ?? '').trim().slice(0, 280),
      routeCondition: String(body?.routeCondition ?? '').trim().slice(0, 80),
      requiresSignoff: Boolean(body?.requiresSignoff),
    },
  }
}

export type CleanAgent = {
  name: string
  role: 'warden' | 'agent'
  capability: Capability
  clearance: Clearance
  skills: string[]
  color: string
  icon: string
  description: string
  routeCondition: string
  requiresSignoff: boolean
}
