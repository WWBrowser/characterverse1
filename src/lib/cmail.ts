// CMail — the shared vocabulary. Pure, so the page and the API agree on what a
// folder is without either of them storing it.

export type FolderId = 'inbox' | 'starred' | 'snoozed' | 'important' | 'sent' | 'drafts' | 'all' | 'trash'

export type ThreadFlags = {
  starred: boolean
  important: boolean
  unread: boolean
  archived: boolean
  trashed: boolean
  snoozedUntil: string | null
  hasReceived: boolean
  hasSent: boolean
  hasDraft: boolean
}

export type ThreadSummary = ThreadFlags & {
  id: number
  characterId: number
  name: string
  avatar: string
  subject: string
  snippet: string
  lastAt: string | null
  lastAuthor: 'me' | 'character'
  messageCount: number
}

export type Adopted = {
  id: number
  name: string
  avatar: string
  tagline: string
  category: string
  via: string
}

export type MailMessage = {
  id: number
  author: 'me' | 'character'
  status: 'sent' | 'received' | 'draft'
  body: string
  voiceId: number | null
  voiceName: string | null
  createdAt: string | null
}

export const FOLDERS: { id: FolderId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'starred', label: 'Starred' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'important', label: 'Important' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'all', label: 'All Mail' },
  { id: 'trash', label: 'Trash' },
]

function snoozed(t: ThreadFlags, now: number): boolean {
  return Boolean(t.snoozedUntil && new Date(t.snoozedUntil).getTime() > now)
}

/**
 * Whether a thread belongs in a folder — the one definition both ends use.
 *
 * Inbox is mail that came *to* you and has not been put away: it has a reply,
 * and it is not archived, trashed or snoozed. A thread you only wrote, never
 * answered, lives in Sent; one you never finished lives in Drafts. Trash
 * hides a thread from everything but Trash.
 */
export function inFolder(t: ThreadFlags, folder: FolderId, now = Date.now()): boolean {
  if (folder === 'trash') return t.trashed
  if (t.trashed) return false
  switch (folder) {
    case 'inbox':
      return t.hasReceived && !t.archived && !snoozed(t, now)
    case 'starred':
      return t.starred
    case 'snoozed':
      return snoozed(t, now)
    case 'important':
      return t.important
    case 'sent':
      return t.hasSent
    case 'drafts':
      return t.hasDraft
    case 'all':
      return true
  }
}

/** Gmail's snooze menu, in our words. Each returns the moment it ends. */
export const SNOOZES: { label: string; at: (now: Date) => Date }[] = [
  { label: 'Later today', at: (n) => new Date(n.getTime() + 3 * 3600_000) },
  {
    label: 'Tomorrow',
    at: (n) => {
      const d = new Date(n)
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
      return d
    },
  },
  {
    label: 'Next week',
    at: (n) => {
      const d = new Date(n)
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
      d.setHours(8, 0, 0, 0)
      return d
    },
  },
]

/** "Sep 21" for older mail, "14:05" for today's — the way a mail list reads. */
export function mailDate(iso: string | null, now = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}
