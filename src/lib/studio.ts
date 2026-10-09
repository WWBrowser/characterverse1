// CharacterVerse Studio — the shared vocabulary behind the admin operations deck.
// Pure (no database, no DOM) so it is safe to import from both the React page and
// the server API routes.
//
// The Studio, modeled on una.io's Studio, is the single place from which the
// whole platform is governed: a staff hierarchy of statuses, and a registry of
// every CharacterVerse surface ("module") with its admin settings and its
// chat / twin-chat / LLM feature set.

export const DEFAULT_WORKSPACE = 'default'

/* ------------------------------------------------------------------- statuses */
// The staff hierarchy. Three tracks, each pairing a worker with the supervisor
// directly above it, and a single Master ("me") above every track. `rank` is the
// numeric authority used to gate module governance — Master sits at the top.

export type Tier = 'worker' | 'supervisor' | 'master'

export type RoleMeta = {
  key: string
  label: string
  tier: Tier
  track: string
  // The worker this status supervises (supervisors only), for the org chart.
  supervises?: string
  rank: number
  icon: string
  color: string
  desc: string
}

export const ROLES: RoleMeta[] = [
  {
    key: 'moderator',
    label: 'Moderator',
    tier: 'worker',
    track: 'Moderation',
    rank: 10,
    icon: '🛡️',
    color: '#34d399',
    desc: 'Front-line moderation worker — reviews characters, chats and flags.',
  },
  {
    key: 'chief_moderator',
    label: 'Chief Moderator',
    tier: 'supervisor',
    track: 'Moderation',
    supervises: 'moderator',
    rank: 20,
    icon: '🛡️',
    color: '#10b981',
    desc: 'Supervises the moderation worker pool and sets moderation policy.',
  },
  {
    key: 'administration',
    label: 'Administration',
    tier: 'worker',
    track: 'Administration',
    rank: 30,
    icon: '🗂️',
    color: '#60a5fa',
    desc: 'Administration worker — manages members, content and configuration.',
  },
  {
    key: 'super_administration',
    label: 'Super Administration',
    tier: 'supervisor',
    track: 'Administration',
    supervises: 'administration',
    rank: 40,
    icon: '🗂️',
    color: '#3b82f6',
    desc: 'Supervises administration and owns platform-wide configuration.',
  },
  {
    key: 'operator',
    label: 'Operator',
    tier: 'worker',
    track: 'Operations',
    rank: 50,
    icon: '⚙️',
    color: '#fbbf24',
    desc: 'Operations worker — runs the agentic fleet, training and clusters.',
  },
  {
    key: 'master_operator',
    label: 'Master Operator',
    tier: 'supervisor',
    track: 'Operations',
    supervises: 'operator',
    rank: 60,
    icon: '⚙️',
    color: '#f59e0b',
    desc: 'Supervises operations and commands the autonomous workforce.',
  },
  {
    key: 'master',
    label: 'Master',
    tier: 'master',
    track: 'Owner',
    rank: 100,
    icon: '👑',
    color: '#a78bfa',
    desc: 'The owner. Outranks every track and governs all of CharacterVerse.',
  },
]

const ROLE_MAP: Record<string, RoleMeta> = Object.fromEntries(ROLES.map((r) => [r.key, r]))

export function roleMeta(key: string): RoleMeta {
  return ROLE_MAP[key] || ROLES[0]
}

export function roleRank(key: string): number {
  return roleMeta(key).rank
}

export function normalizeRole(key: unknown): string {
  const k = String(key || '').trim()
  return ROLE_MAP[k] ? k : 'moderator'
}

// The three worker‹‹supervisor tracks, for rendering the org chart. Master is
// presented separately, above all tracks.
export const TRACKS = ['Moderation', 'Administration', 'Operations'] as const

/* ----------------------------------------------------------------- LLM models */
// The models a module's chat / twin-chat feature set can be pointed at. Kept in
// sync with the Netlify AI Gateway supported list; the product default is the
// fast Haiku model the rest of CharacterVerse already uses.

export type ModelMeta = { id: string; label: string; provider: string; tier: string }

export const STUDIO_MODELS: ModelMeta[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic', tier: 'fast' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', tier: 'balanced' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'Anthropic', tier: 'frontier' },
  { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'OpenAI', tier: 'frontier' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'Google', tier: 'fast' },
]

const MODEL_IDS = new Set(STUDIO_MODELS.map((m) => m.id))
export const DEFAULT_MODEL = 'claude-haiku-4-5'

export function normalizeModel(id: unknown): string {
  const s = String(id || '').trim()
  return MODEL_IDS.has(s) ? s : DEFAULT_MODEL
}

/* ---------------------------------------------------------------- visibility */

export const VISIBILITIES = ['public', 'internal', 'staff'] as const
export function normalizeVisibility(v: unknown): string {
  const s = String(v || '').trim()
  return (VISIBILITIES as readonly string[]).includes(s) ? s : 'public'
}

/* ------------------------------------------------------- module feature blocks */

export type ModuleSettings = {
  visibility: string
  maintenance: boolean
  notes: string
}

export type ModuleLLM = {
  chat: boolean
  twinChat: boolean
  model: string
  temperature: number
  systemNote: string
}

export function defaultSettings(): ModuleSettings {
  return { visibility: 'public', maintenance: false, notes: '' }
}

export function defaultLLM(over: Partial<ModuleLLM> = {}): ModuleLLM {
  return {
    chat: true,
    twinChat: false,
    model: DEFAULT_MODEL,
    temperature: 0.7,
    systemNote: '',
    ...over,
  }
}

export function clampTemp(t: unknown): number {
  const n = Number(t)
  if (!Number.isFinite(n)) return 0.7
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}

// Coerce arbitrary stored/posted jsonb into a well-formed settings block.
export function coerceSettings(raw: any): ModuleSettings {
  const d = defaultSettings()
  if (!raw || typeof raw !== 'object') return d
  return {
    visibility: normalizeVisibility(raw.visibility ?? d.visibility),
    maintenance: Boolean(raw.maintenance),
    notes: String(raw.notes ?? '').slice(0, 600),
  }
}

export function coerceLLM(raw: any): ModuleLLM {
  const d = defaultLLM()
  if (!raw || typeof raw !== 'object') return d
  return {
    chat: raw.chat === undefined ? d.chat : Boolean(raw.chat),
    twinChat: Boolean(raw.twinChat),
    model: normalizeModel(raw.model ?? d.model),
    temperature: clampTemp(raw.temperature ?? d.temperature),
    systemNote: String(raw.systemNote ?? '').slice(0, 600),
  }
}

/* ---------------------------------------------------------- module registry */
// Every CharacterVerse surface brought under Studio governance, grouped the way
// the navigation presents them. The chat-workspace group registers the
// quick-access items (New chat, Search chats, Images, Library, Notebooks,
// Character notes, Recent character chats) so they are governed alongside the
// full pages even though they live inside the chat experience.
//   minRank  the default minimum staff rank allowed to administer the module
//   llm      the module's default chat / twin-chat / LLM feature set

export type ModuleSeed = {
  key: string
  label: string
  icon: string
  group: string
  path: string
  minRank: number
  llm: Partial<ModuleLLM>
}

export const STUDIO_MODULE_GROUPS = ['Platform', 'Agentic', 'Workspace', 'Chat Workspace'] as const

export const STUDIO_MODULES: ModuleSeed[] = [
  // Platform
  { key: 'discover', label: 'Discover', icon: '🧭', group: 'Platform', path: '/discover', minRank: 10, llm: { chat: true, twinChat: false } },
  { key: 'learn', label: 'Learn', icon: '📚', group: 'Platform', path: '/learn', minRank: 10, llm: { chat: true, twinChat: false } },
  { key: 'leaderboard', label: 'Leaderboard', icon: '🏆', group: 'Platform', path: '/leaderboard', minRank: 20, llm: { chat: false, twinChat: false } },
  { key: 'training', label: 'Training', icon: '🧪', group: 'Platform', path: '/training', minRank: 50, llm: { chat: true, twinChat: true } },
  { key: 'bounties', label: 'Bounties', icon: '🎯', group: 'Platform', path: '/bounties', minRank: 30, llm: { chat: true, twinChat: false } },
  // Agentic
  { key: 'routeclaw', label: 'RouteClaw', icon: '🐾', group: 'Agentic', path: '/routeclaw', minRank: 50, llm: { chat: true, twinChat: true, model: 'claude-sonnet-4-6' } },
  { key: 'controltower', label: 'Control Tower', icon: '📡', group: 'Agentic', path: '/controltower', minRank: 60, llm: { chat: true, twinChat: true, model: 'claude-sonnet-4-6' } },
  { key: 'clusters', label: 'Clusters', icon: '🧊', group: 'Agentic', path: '/clusters', minRank: 60, llm: { chat: true, twinChat: true } },
  { key: 'neural', label: 'Neural Training', icon: '🪐', group: 'Agentic', path: '/neural', minRank: 60, llm: { chat: true, twinChat: true, model: 'claude-opus-4-8' } },
  // Workspace
  { key: 'ask', label: 'Ask', icon: '✨', group: 'Workspace', path: '/ask', minRank: 10, llm: { chat: true, twinChat: true } },
  { key: 'create', label: '+Create', icon: '➕', group: 'Workspace', path: '/create', minRank: 30, llm: { chat: true, twinChat: false } },
  { key: 'memory', label: 'Memory', icon: '🧠', group: 'Workspace', path: '/memory', minRank: 30, llm: { chat: true, twinChat: false } },
  { key: 'collab', label: 'Collab', icon: '👥', group: 'Workspace', path: '/collab', minRank: 30, llm: { chat: true, twinChat: true } },
  { key: 'characterclaw', label: 'CharacterClaw', icon: '🐾', group: 'Workspace', path: '/characterclaw', minRank: 50, llm: { chat: true, twinChat: true } },
  { key: 'enterprise', label: 'Enterprise', icon: '🏢', group: 'Workspace', path: '/enterprise', minRank: 40, llm: { chat: true, twinChat: false } },
  { key: 'cabinet', label: 'Cabinet', icon: '🗄️', group: 'Workspace', path: '/cabinet', minRank: 40, llm: { chat: false, twinChat: false } },
  { key: 'filechat', label: 'FileChat', icon: '🗃️', group: 'Workspace', path: '/filechat', minRank: 40, llm: { chat: true, twinChat: false } },
  { key: 'audit', label: 'Audit', icon: '🛡️', group: 'Workspace', path: '/audit', minRank: 40, llm: { chat: false, twinChat: false } },
  // Chat Workspace — the quick-access items inside the chat experience
  { key: 'new_chat', label: 'New chat', icon: '💬', group: 'Chat Workspace', path: '', minRank: 10, llm: { chat: true, twinChat: true } },
  { key: 'search_chats', label: 'Search chats', icon: '🔎', group: 'Chat Workspace', path: '', minRank: 10, llm: { chat: false, twinChat: false } },
  { key: 'images', label: 'Images', icon: '🖼️', group: 'Chat Workspace', path: '', minRank: 30, llm: { chat: true, twinChat: false, model: 'gemini-3-flash-preview' } },
  { key: 'library', label: 'Library', icon: '📁', group: 'Chat Workspace', path: '', minRank: 30, llm: { chat: false, twinChat: false } },
  { key: 'notebooks', label: 'Notebooks', icon: '📓', group: 'Chat Workspace', path: '', minRank: 30, llm: { chat: true, twinChat: false } },
  { key: 'character_notes', label: 'Character notes', icon: '🗒️', group: 'Chat Workspace', path: '', minRank: 20, llm: { chat: true, twinChat: false } },
  { key: 'recent_chats', label: 'Recent character chats', icon: '🕑', group: 'Chat Workspace', path: '', minRank: 10, llm: { chat: false, twinChat: false } },
]
