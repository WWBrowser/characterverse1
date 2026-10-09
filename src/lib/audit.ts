// Audit governance — the shared vocabulary behind the Audit Dashboard, AuditClaw
// and the FileChat access control. Pure (no DB, no DOM) so it imports cleanly
// into both the React pages and the server API.
//
// The enterprise governance idea: the boss sees everything, but only escalates
// what matters. Normal usage is archived; an anomaly (e.g. an employee stuck on
// one conversation past the threshold instead of refreshing the instance) is
// surfaced for escalation to a division manager. Before clean work is filed,
// hallucinations are trimmed into a gated audit trail; AuditClaw mines that
// trail for buried insight ("lightning in a bottle") so it isn't lost.

export const DEFAULT_WORKSPACE = 'default'

// 1 CC = £0.01; the boss earns the Conference Cluster rate (+3 CC / msg) on
// private enterprise character usage. Re-stated here so audit copy stays in sync
// with src/lib/credits.ts without importing it.
export const ENTERPRISE_MSG_RATE = 3

export type FileChatAccess = 'open' | 'closed' | 'hybrid'

export type AccessDef = {
  key: FileChatAccess
  label: string
  short: string
  description: string
  // Whether staff (non-boss) may use FileChat search in this mode.
  staffCanSearch: boolean
}

export const FILE_CHAT_ACCESS: AccessDef[] = [
  {
    key: 'open',
    label: 'Open',
    short: 'Trust model',
    description:
      'Staff can search and reference their own filed conversations. "Use characters as tools, learn from them."',
    staffCanSearch: true,
  },
  {
    key: 'closed',
    label: 'Closed',
    short: 'Accountability model',
    description:
      'Staff are locked out of FileChat — only the boss and auditors review. Use when the team is leaning on characters as a crutch.',
    staffCanSearch: false,
  },
  {
    key: 'hybrid',
    label: 'Hybrid',
    short: 'Balanced',
    description:
      'Staff keep personal search of their own work, while the boss retains full audit access across the team.',
    staffCanSearch: true,
  },
]

export const ACCESS_BY_KEY: Record<FileChatAccess, AccessDef> = {
  open: FILE_CHAT_ACCESS[0],
  closed: FILE_CHAT_ACCESS[1],
  hybrid: FILE_CHAT_ACCESS[2],
}

export function accessDef(key: string | null | undefined): AccessDef {
  return ACCESS_BY_KEY[(key as FileChatAccess) || 'open'] || ACCESS_BY_KEY.open
}

// AuditClaw — completes the Claw family (PromptClaw on create, CharacterClaw in
// chat, AuditClaw over the audit trail). A few ready-made search prompts so a
// data scientist can scan the trimmed corpus without writing one from scratch.
export const AUDITCLAW_PRESETS: { label: string; prompt: string }[] = [
  { label: 'Novel architecture', prompt: 'Find moments where the character suggested a novel architecture or design approach.' },
  { label: 'Creative problem-solving', prompt: 'Locate unexpected or creative problem-solving approaches worth exploring.' },
  { label: 'Surprising connections', prompt: 'Flag where a hallucination revealed an unexpected connection between ideas.' },
  { label: 'Reusable insight', prompt: 'Surface buried insights that could be fed back into character design.' },
]

// A trimmed message as stored in audit_trims.trimmedMessages.
export type TrimmedMessage = {
  role: 'user' | 'assistant' | string
  content: string
  createdAt?: string | null
}

export type AuditTrim = {
  id: number
  conversationId: number
  characterId: number
  sessionId: string
  keptCount: number
  trimmedMessages: TrimmedMessage[]
  reason: string
  hiddenGem: boolean
  gemNote: string
  createdAt?: string | null
}
