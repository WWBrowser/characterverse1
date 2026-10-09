import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  ChevronDown,
  Clock,
  File,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Menu,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { VerseChrome } from '../lib/verse-chrome'
import { FOLDERS, mailDate, SNOOZES, type Adopted, type FolderId, type MailMessage, type ThreadSummary } from '../lib/cmail'

/* ══════════════════════════════════════════════════════ /cmail — CharacterMail
 *
 * Mail with characters, laid out the way everyone already knows mail: compose
 * on the left, folders under it, a list of threads, a thread you open and
 * answer. What makes it CharacterMail is who is on the other end.
 *
 * Adoption is how a character gets here, in the two senses the verse already
 * uses:
 *
 *   - **As a correspondent** — the /social sense. Adopt a character and it moves
 *     into your mailbox: it writes first, with its own greeting, and from then
 *     on answers every mail you send it, in character. Your Social roster can
 *     be brought across in one click.
 *   - **As a voice** — the /ask sense, where a character is carried into a mode
 *     and the model embodies it. Here the mode is the compose window: pick an
 *     adopted character under "Write as" and it turns your notes into a mail in
 *     its voice. The mail records who wrote it, so nobody mistakes the voice
 *     for yours.
 *
 * The notifications that used to live here — the wall, the zone, orders, chats
 * — are the CharacterMail Notifications Zone now, one click away in the
 * sidebar. They are not mail, and a mailbox that pretended they were would be
 * lying about both.
 * ═════════════════════════════════════════════════════════════════════════ */

type Search = { folder?: FolderId; thread?: number; character?: number }

const FOLDER_IDS = FOLDERS.map((f) => f.id)

export const Route = createFileRoute('/cmail/')({
  component: CMailApp,
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {}
    if (typeof s.folder === 'string' && (FOLDER_IDS as string[]).includes(s.folder) && s.folder !== 'inbox') out.folder = s.folder as FolderId
    const thread = Number(s.thread)
    if (Number.isInteger(thread) && thread > 0) out.thread = thread
    const character = Number(s.character)
    if (Number.isInteger(character) && character > 0) out.character = character
    return out
  },
})

const FOLDER_ICONS: Record<FolderId, LucideIcon> = {
  inbox: Inbox,
  starred: Star,
  snoozed: Clock,
  important: Tag,
  sent: Send,
  drafts: File,
  all: Mail,
  trash: Trash2,
}

type Mailbox = {
  threads: ThreadSummary[]
  counts: Record<string, number>
  unreadByCharacter: Record<number, number>
  adopted: Adopted[]
}

type Compose = {
  threadId: number | null
  characterId: number | null
  subject: string
  body: string
  voiceId: number | null
  minimized: boolean
}

const EMPTY_COMPOSE: Compose = { threadId: null, characterId: null, subject: '', body: '', voiceId: null, minimized: false }

function CMailApp() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/cmail/' })
  const folder: FolderId = search.folder || 'inbox'

  const [sessionId, setSessionId] = useState('')
  const [box, setBox] = useState<Mailbox | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [ran, setRan] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [compose, setCompose] = useState<Compose | null>(null)
  const [adopting, setAdopting] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { setSessionId(getSessionId()) }, [])

  const say = useCallback((text: string) => {
    setToast(text)
    window.setTimeout(() => setToast((t) => (t === text ? '' : t)), 4200)
  }, [])

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ sessionId, folder })
      if (search.character) params.set('character', String(search.character))
      if (ran) params.set('q', ran)
      const res = await fetch(`/api/cmail?${params}`)
      if (!res.ok) throw new Error()
      setBox(await res.json())
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [sessionId, folder, search.character, ran])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setSelected(new Set()) }, [folder, search.character])

  const go = (s: Search) => void navigate({ search: s })

  const patch = useCallback(
    async (ids: number[], change: Record<string, unknown>, note?: string) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/cmail/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, ...change }),
          }),
        ),
      )
      setSelected(new Set())
      if (note) say(note)
      await load()
    },
    [sessionId, load, say],
  )

  const adopted = box?.adopted || []
  const activeCharacter = search.character ? adopted.find((a) => a.id === search.character) : undefined

  const openCompose = (init: Partial<Compose> = {}) => setCompose({ ...EMPTY_COMPOSE, ...init })

  /** Clicking a draft reopens it where it was written. */
  const openThread = (t: ThreadSummary) => {
    if (t.hasDraft && t.messageCount === 0) {
      void fetch(`/api/cmail/${t.id}?sessionId=${encodeURIComponent(sessionId)}`)
        .then((r) => r.json())
        .then((d) => openCompose({ threadId: t.id, characterId: t.characterId, subject: d.thread?.subject || '', body: d.draft?.body || '', voiceId: d.draft?.voiceId ?? null }))
      return
    }
    go({ ...search, thread: t.id })
  }

  return (
    <div className="cm-root">
      <VerseChrome active="cmail" />

      {/* -------------------------------------------------------- the top bar */}
      <div className="cm-top">
        <button type="button" className="cm-iconbtn" aria-label="Main menu" aria-expanded={!narrow} onClick={() => setNarrow((v) => !v)}>
          <Menu size={18} />
        </button>
        <Link to="/cmail" search={{}} className="cm-brand" aria-label="CMail inbox">
          <span className="cm-brand-mark" aria-hidden>
            <Mail size={16} color="#fff" />
          </span>
          <span>
            C<span className="gradient-text">Mail</span>
          </span>
        </Link>
        <form
          className="cm-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            setRan(query.trim())
            if (search.thread) go({ ...search, thread: undefined })
          }}
        >
          <Search size={16} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mail" aria-label="Search mail" />
          {(query || ran) && (
            <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); setRan('') }}>
              <X size={15} />
            </button>
          )}
        </form>
        <Link to="/cmail/notifications" className="cm-zone-link" title="CHARACTERMAIL Notifications Zone">
          <Bell size={15} /> <span>Notifications Zone</span>
        </Link>
      </div>

      <div className="cm-shell" data-narrow={narrow || undefined}>
        {/* ------------------------------------------------------- the sidebar */}
        <aside className="cm-side" aria-label="Mail folders">
          <button type="button" className="cm-compose" onClick={() => openCompose()}>
            <Pencil size={17} /> <span>Compose</span>
          </button>

          <nav className="cm-folders">
            {FOLDERS.map((f) => {
              const Icon = FOLDER_ICONS[f.id]
              const n = box?.counts[f.id] || 0
              const on = folder === f.id && !search.character
              return (
                <button
                  key={f.id}
                  type="button"
                  className="cm-folder"
                  data-on={on || undefined}
                  data-bold={(f.id === 'inbox' && n > 0) || undefined}
                  aria-current={on ? 'page' : undefined}
                  title={f.label}
                  onClick={() => go(f.id === 'inbox' ? {} : { folder: f.id })}
                >
                  <Icon size={16} />
                  <span className="cm-folder-label">{f.label}</span>
                  {n > 0 && f.id !== 'all' && f.id !== 'trash' && <span className="cm-folder-n">{n}</span>}
                </button>
              )
            })}
            <Link to="/cmail/notifications" className="cm-folder" title="Notifications Zone">
              <Bell size={16} />
              <span className="cm-folder-label">Notifications Zone</span>
            </Link>
          </nav>

          <div className="cm-side-head">
            <span className="cm-folder-label">Adopted characters</span>
            <button type="button" className="cm-iconbtn" aria-label="Adopt a character" title="Adopt a character" onClick={() => setAdopting(true)}>
              <Plus size={16} />
            </button>
          </div>
          <div className="cm-folders">
            {adopted.map((a) => {
              const n = box?.unreadByCharacter[a.id] || 0
              const on = search.character === a.id
              return (
                <button
                  key={a.id}
                  type="button"
                  className="cm-folder"
                  data-on={on || undefined}
                  data-bold={n > 0 || undefined}
                  title={`${a.name}${a.via === 'social' ? ' — from your Social roster' : ''}`}
                  onClick={() => go({ character: a.id })}
                >
                  <span className="cm-avatar-sm" aria-hidden>{a.avatar}</span>
                  <span className="cm-folder-label">{a.name}</span>
                  {n > 0 && <span className="cm-folder-n">{n}</span>}
                </button>
              )
            })}
            {!adopted.length && (
              <button type="button" className="cm-folder" onClick={() => setAdopting(true)}>
                <UserPlus size={16} />
                <span className="cm-folder-label">Adopt your first</span>
              </button>
            )}
          </div>
        </aside>

        {/* ---------------------------------------------------------- the main */}
        <main className="cm-main">
          {search.thread ? (
            <ThreadView
              key={search.thread}
              id={search.thread}
              sessionId={sessionId}
              adopted={adopted}
              onBack={() => go({ ...search, thread: undefined })}
              onChanged={load}
              say={say}
            />
          ) : (
            <ThreadList
              box={box}
              loading={loading}
              failed={failed}
              folder={folder}
              character={activeCharacter}
              searched={ran}
              selected={selected}
              setSelected={setSelected}
              onOpen={openThread}
              onRefresh={load}
              onPatch={patch}
              onAdopt={() => setAdopting(true)}
              onCompose={(characterId) => openCompose({ characterId })}
              onRelease={async (a) => {
                await fetch('/api/cmail', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId, action: 'release', characterId: a.id }),
                })
                say(`${a.name} has moved out. Your mail with them is kept.`)
                go({})
              }}
            />
          )}
        </main>
      </div>

      {compose && (
        <ComposeWindow
          value={compose}
          onChange={setCompose}
          adopted={adopted}
          sessionId={sessionId}
          onAdopt={() => setAdopting(true)}
          onDone={async (note) => {
            setCompose(null)
            if (note) say(note)
            await load()
          }}
        />
      )}

      {adopting && (
        <AdoptDialog
          sessionId={sessionId}
          adopted={adopted}
          onClose={() => setAdopting(false)}
          onAdopted={async (a, fresh) => {
            say(fresh ? `${a.name} moved in — and has already written to you.` : `${a.name} is already in your CMail.`)
            await load()
          }}
        />
      )}

      {toast && (
        <div className="cm-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ the list */

function ThreadList({
  box,
  loading,
  failed,
  folder,
  character,
  searched,
  selected,
  setSelected,
  onOpen,
  onRefresh,
  onPatch,
  onAdopt,
  onCompose,
  onRelease,
}: {
  box: Mailbox | null
  loading: boolean
  failed: boolean
  folder: FolderId
  character?: Adopted
  searched: string
  selected: Set<number>
  setSelected: (s: Set<number>) => void
  onOpen: (t: ThreadSummary) => void
  onRefresh: () => void
  onPatch: (ids: number[], change: Record<string, unknown>, note?: string) => Promise<void>
  onAdopt: () => void
  onCompose: (characterId: number) => void
  onRelease: (a: Adopted) => void
}) {
  const threads = box?.threads || []
  const ids = [...selected]
  const all = threads.length > 0 && threads.every((t) => selected.has(t.id))
  const inTrash = folder === 'trash' && !character
  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <section className="cm-panel" aria-label={character ? `Mail with ${character.name}` : FOLDERS.find((f) => f.id === folder)?.label}>
      {character && (
        <div className="cm-character-head">
          <span className="cm-avatar" aria-hidden>{character.avatar}</span>
          <div style={{ minWidth: 0 }}>
            <div className="cm-character-name">{character.name}</div>
            <div className="cm-character-sub">
              {character.tagline || character.category}
              {character.via === 'social' && ' · from your Social roster'}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="cm-pill" data-primary="" onClick={() => onCompose(character.id)}>
            <Pencil size={13} /> Write to {character.name}
          </button>
          <button type="button" className="cm-pill" onClick={() => onRelease(character)} title="Release from your CMail — your mail is kept">
            Release
          </button>
        </div>
      )}

      <div className="cm-toolbar">
        <input
          type="checkbox"
          className="cm-check"
          aria-label="Select all"
          checked={all}
          onChange={() => setSelected(all ? new Set() : new Set(threads.map((t) => t.id)))}
        />
        <button type="button" className="cm-iconbtn" aria-label="Refresh" title="Refresh" onClick={onRefresh}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
        {ids.length > 0 &&
          (inTrash ? (
            <button type="button" className="cm-iconbtn" title="Restore" aria-label="Restore" onClick={() => onPatch(ids, { trashed: false }, 'Restored.')}>
              <ArchiveRestore size={16} />
            </button>
          ) : (
            <>
              <button type="button" className="cm-iconbtn" title="Archive" aria-label="Archive" onClick={() => onPatch(ids, { archived: true }, 'Archived.')}>
                <Archive size={16} />
              </button>
              <button type="button" className="cm-iconbtn" title="Delete" aria-label="Delete" onClick={() => onPatch(ids, { trashed: true }, 'Moved to Trash.')}>
                <Trash2 size={16} />
              </button>
              <button type="button" className="cm-iconbtn" title="Mark as read" aria-label="Mark as read" onClick={() => onPatch(ids, { unread: false })}>
                <MailOpen size={16} />
              </button>
              <button type="button" className="cm-iconbtn" title="Mark as unread" aria-label="Mark as unread" onClick={() => onPatch(ids, { unread: true })}>
                <Mail size={16} />
              </button>
            </>
          ))}
        <span style={{ flex: 1 }} />
        <span className="cm-range">
          {searched && <>Results for &ldquo;{searched}&rdquo; · </>}
          {threads.length ? `1–${threads.length} of ${threads.length}` : ''}
        </span>
      </div>

      {failed && (
        <p className="cm-note" role="alert">
          CMail could not reach your mailbox. Nothing has been lost — try Refresh.
        </p>
      )}

      {!box && !failed ? (
        <p className="cm-note">Opening your mailbox…</p>
      ) : threads.length === 0 && !failed ? (
        <EmptyFolder folder={folder} character={character} searched={searched} hasAdopted={Boolean(box?.adopted.length)} onAdopt={onAdopt} />
      ) : (
        <ul className="cm-rows">
          {threads.map((t) => (
            <li key={t.id} className="cm-row" data-unread={t.unread || undefined} data-selected={selected.has(t.id) || undefined}>
              <input type="checkbox" className="cm-check" aria-label={`Select ${t.subject}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
              <button
                type="button"
                className="cm-star"
                data-on={t.starred || undefined}
                aria-label={t.starred ? 'Unstar' : 'Star'}
                aria-pressed={t.starred}
                onClick={() => onPatch([t.id], { starred: !t.starred })}
              >
                <Star size={16} />
              </button>
              <button type="button" className="cm-row-open" onClick={() => onOpen(t)}>
                <span className="cm-row-from">
                  <span aria-hidden>{t.avatar}</span> {t.lastAuthor === 'me' && !t.hasReceived ? `To: ${t.name}` : t.name}
                  {t.messageCount > 1 && <span className="cm-row-count">{t.messageCount}</span>}
                </span>
                <span className="cm-row-text">
                  {t.hasDraft && <span className="cm-draft-tag">Draft</span>}
                  {t.important && <span className="cm-imp" title="Important" aria-label="Important">›</span>}
                  <span className="cm-row-subject">{t.subject || '(no subject)'}</span>
                  <span className="cm-row-snippet"> — {t.snippet}</span>
                </span>
                <span className="cm-row-date">{t.snoozedUntil && folder === 'snoozed' ? `until ${mailDate(t.snoozedUntil)}` : mailDate(t.lastAt)}</span>
              </button>
              <span className="cm-row-hover">
                {inTrash ? (
                  <button type="button" className="cm-iconbtn" title="Restore" aria-label="Restore" onClick={() => onPatch([t.id], { trashed: false }, 'Restored.')}>
                    <ArchiveRestore size={15} />
                  </button>
                ) : (
                  <>
                    <button type="button" className="cm-iconbtn" title="Archive" aria-label="Archive" onClick={() => onPatch([t.id], { archived: true }, 'Archived.')}>
                      <Archive size={15} />
                    </button>
                    <button type="button" className="cm-iconbtn" title="Delete" aria-label="Delete" onClick={() => onPatch([t.id], { trashed: true }, 'Moved to Trash.')}>
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EmptyFolder({
  folder,
  character,
  searched,
  hasAdopted,
  onAdopt,
}: {
  folder: FolderId
  character?: Adopted
  searched: string
  hasAdopted: boolean
  onAdopt: () => void
}) {
  if (searched) return <p className="cm-note">No mail matched &ldquo;{searched}&rdquo;.</p>
  if (character) return <p className="cm-note">Nothing with {character.name} yet. Write to them — they write back.</p>
  if (folder === 'inbox' && !hasAdopted) {
    return (
      <div className="cm-welcome">
        <span className="cm-brand-mark" style={{ width: 46, height: 46, borderRadius: 14 }} aria-hidden>
          <Mail size={22} color="#fff" />
        </span>
        <h2>Your CharacterMail is empty</h2>
        <p>
          Adopt a character and it moves into your mailbox. It writes to you first, and answers every mail you send it — in
          character. Adopted characters can also lend you their voice: pick one under &ldquo;Write as&rdquo; when you
          compose.
        </p>
        <button type="button" className="cm-pill" data-primary="" onClick={onAdopt}>
          <UserPlus size={14} /> Adopt a character
        </button>
      </div>
    )
  }
  const copy: Record<FolderId, string> = {
    inbox: 'Inbox zero. Every character is up to date.',
    starred: 'No starred mail. Stars let you find a thread again.',
    snoozed: 'Nothing snoozed. Snoozed mail comes back to the inbox when its time is up.',
    important: 'Nothing marked important.',
    sent: 'Nothing sent yet.',
    drafts: 'No drafts. A mail you close without sending is kept here.',
    all: 'No mail at all yet.',
    trash: 'Trash is empty.',
  }
  return <p className="cm-note">{copy[folder]}</p>
}

/* ═════════════════════════════════════════════════════════════ the thread */

type ThreadData = {
  thread: { id: number; subject: string; starred: boolean; important: boolean; archived: boolean; trashed: boolean; snoozedUntil: string | null }
  character: { id: number; name: string; avatar: string; tagline: string; category: string }
  messages: MailMessage[]
  draft: MailMessage | null
}

function ThreadView({
  id,
  sessionId,
  adopted,
  onBack,
  onChanged,
  say,
}: {
  id: number
  sessionId: string
  adopted: Adopted[]
  onBack: () => void
  onChanged: () => Promise<void>
  say: (t: string) => void
}) {
  const [data, setData] = useState<ThreadData | null>(null)
  const [missing, setMissing] = useState(false)
  const [reply, setReply] = useState<{ body: string; voiceId: number | null } | null>(null)
  const [sending, setSending] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)

  const fetchThread = useCallback(async () => {
    if (!sessionId) return
    const res = await fetch(`/api/cmail/${id}?sessionId=${encodeURIComponent(sessionId)}`)
    if (!res.ok) { setMissing(true); return }
    const d: ThreadData = await res.json()
    setData(d)
    if (d.draft && !reply) setReply({ body: d.draft.body, voiceId: d.draft.voiceId })
  }, [id, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchThread().then(onChanged) }, [fetchThread]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (change: Record<string, unknown>, note?: string, leave = false) => {
    await fetch(`/api/cmail/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, ...change }) })
    if (note) say(note)
    if (leave) onBack()
    else await fetchThread()
    await onChanged()
  }

  if (missing) return <p className="cm-note">That mail is not in your mailbox. <button type="button" className="cm-link" onClick={onBack}>Back</button></p>
  if (!data) return <p className="cm-note">Opening…</p>

  const t = data.thread
  const who = data.character

  const sendReply = async () => {
    if (!reply?.body.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/cmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'send', threadId: id, body: reply.body, voiceId: reply.voiceId }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { say(d?.error || 'Not sent.'); return }
      setReply(null)
      say(d.replied ? `${who.name} wrote back.` : `Sent. ${who.name} could not write back just now — your mail is in Sent.`)
      await fetchThread()
      await onChanged()
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="cm-panel" aria-label={t.subject}>
      <div className="cm-toolbar">
        <button type="button" className="cm-iconbtn" aria-label="Back to the list" title="Back" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        {t.trashed ? (
          <>
            <button type="button" className="cm-iconbtn" title="Restore" aria-label="Restore" onClick={() => patch({ trashed: false }, 'Restored.')}>
              <ArchiveRestore size={16} />
            </button>
            <button
              type="button"
              className="cm-pill"
              onClick={async () => {
                await fetch(`/api/cmail/${id}?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
                say('Deleted forever.')
                onBack()
                await onChanged()
              }}
            >
              Delete forever
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cm-iconbtn" title={t.archived ? 'Move to Inbox' : 'Archive'} aria-label={t.archived ? 'Move to Inbox' : 'Archive'} onClick={() => patch({ archived: !t.archived }, t.archived ? 'Moved to Inbox.' : 'Archived.', !t.archived)}>
              {t.archived ? <Inbox size={16} /> : <Archive size={16} />}
            </button>
            <button type="button" className="cm-iconbtn" title="Delete" aria-label="Delete" onClick={() => patch({ trashed: true }, 'Moved to Trash.', true)}>
              <Trash2 size={16} />
            </button>
            <button type="button" className="cm-iconbtn" title="Mark as unread" aria-label="Mark as unread" onClick={() => patch({ unread: true }, undefined, true)}>
              <Mail size={16} />
            </button>
            <span style={{ position: 'relative' }}>
              <button type="button" className="cm-iconbtn" title="Snooze" aria-label="Snooze" aria-expanded={snoozeOpen} onClick={() => setSnoozeOpen((v) => !v)}>
                <Clock size={16} />
              </button>
              {snoozeOpen && (
                <span className="cm-menu" role="menu">
                  <span className="cm-menu-head">Snooze until…</span>
                  {SNOOZES.map((s) => {
                    const at = s.at(new Date())
                    return (
                      <button key={s.label} type="button" role="menuitem" onClick={() => { setSnoozeOpen(false); void patch({ snoozedUntil: at.toISOString() }, `Snoozed until ${at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`, true) }}>
                        {s.label} <span>{at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </button>
                    )
                  })}
                  {t.snoozedUntil && (
                    <button type="button" role="menuitem" onClick={() => { setSnoozeOpen(false); void patch({ snoozedUntil: null }, 'Unsnoozed.') }}>
                      Unsnooze
                    </button>
                  )}
                </span>
              )}
            </span>
          </>
        )}
      </div>

      <div className="cm-read">
        <div className="cm-subject-row">
          <h2 className="cm-subject">{t.subject || '(no subject)'}</h2>
          {t.trashed ? <span className="cm-chip">Trash</span> : t.archived ? <span className="cm-chip">Archived</span> : <span className="cm-chip">Inbox</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className="cm-star" data-on={t.important || undefined} aria-pressed={t.important} title="Important" aria-label={t.important ? 'Not important' : 'Mark important'} onClick={() => patch({ important: !t.important })}>
            <Tag size={16} />
          </button>
          <button type="button" className="cm-star" data-on={t.starred || undefined} aria-pressed={t.starred} aria-label={t.starred ? 'Unstar' : 'Star'} onClick={() => patch({ starred: !t.starred })}>
            <Star size={16} />
          </button>
        </div>

        {data.messages.map((m) => (
          <article key={m.id} className="cm-msg">
            <span className="cm-avatar" aria-hidden data-me={m.author === 'me' || undefined}>
              {m.author === 'me' ? 'Y' : who.avatar}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cm-msg-head">
                <strong>{m.author === 'me' ? 'You' : who.name}</strong>
                <span className="cm-msg-to">{m.author === 'me' ? `to ${who.name}` : 'to you'}</span>
                {m.voiceName && (
                  <span className="cm-voice" title={`Written as ${m.voiceName} with CharacterMail`}>
                    <Sparkles size={11} /> written as {m.voiceName}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <span className="cm-msg-date">{m.createdAt ? new Date(m.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
              </div>
              <div className="cm-body">{m.body}</div>
            </div>
          </article>
        ))}

        {reply ? (
          <div className="cm-reply">
            <div className="cm-reply-to">
              <span aria-hidden>{who.avatar}</span> Reply to {who.name}
            </div>
            <textarea
              autoFocus
              value={reply.body}
              onChange={(e) => setReply({ ...reply, body: e.target.value })}
              placeholder={`Write to ${who.name}…`}
              aria-label={`Reply to ${who.name}`}
              rows={6}
            />
            <ComposerFooter
              sessionId={sessionId}
              adopted={adopted}
              voiceId={reply.voiceId}
              toName={who.name}
              subject={t.subject}
              body={reply.body}
              onVoice={(voiceId) => setReply({ ...reply, voiceId })}
              onWritten={(body) => setReply({ ...reply, body })}
              sending={sending}
              onSend={sendReply}
              onDiscard={async () => {
                setReply(null)
                await fetch('/api/cmail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action: 'draft', threadId: id, body: '' }) })
                await onChanged()
              }}
              say={say}
            />
          </div>
        ) : (
          !t.trashed && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="cm-pill" onClick={() => setReply({ body: '', voiceId: null })}>
                <Send size={13} style={{ transform: 'scaleX(-1)' }} /> Reply
              </button>
            </div>
          )
        )}
        {sending && (
          <p className="cm-note" role="status">
            <Loader2 size={12} className="animate-spin" style={{ verticalAlign: -2 }} /> Sent — {who.name} is writing back…
          </p>
        )}
      </div>
    </section>
  )
}

/* ═════════════════════════════════════════════════════════════ composing */

/**
 * The bottom of every composer: Send, and "Write as" — the /ask adoption,
 * aimed at a draft. Only adopted characters can be written as.
 */
function ComposerFooter({
  sessionId,
  adopted,
  voiceId,
  toName,
  subject,
  body,
  onVoice,
  onWritten,
  sending,
  onSend,
  onDiscard,
  say,
}: {
  sessionId: string
  adopted: Adopted[]
  voiceId: number | null
  toName: string
  subject: string
  body: string
  onVoice: (id: number | null) => void
  onWritten: (body: string) => void
  sending: boolean
  onSend: () => void
  onDiscard: () => void
  say: (t: string, isError?: boolean) => void
}) {
  const [writing, setWriting] = useState(false)
  const voice = adopted.find((a) => a.id === voiceId)

  const writeAs = async () => {
    if (!voice || !body.trim()) return
    setWriting(true)
    try {
      const res = await fetch('/api/cmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'assist', voiceId: voice.id, toName, subject, body }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.body) { say(d?.error || `${voice.name} could not write this just now.`, true); return }
      onWritten(d.body)
      say(`Rewritten as ${voice.name}. Read it before you send — it goes out marked "written as ${voice.name}".`)
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="cm-compose-foot">
      <button type="button" className="cm-send" onClick={onSend} disabled={sending || !body.trim()}>
        {sending ? <Loader2 size={14} className="animate-spin" /> : null} Send
      </button>
      <label className="cm-voice-pick" title="Carry an adopted character into this mail: it rewrites your notes in its voice">
        <Sparkles size={13} />
        <span>Write as</span>
        <select value={voiceId ?? ''} onChange={(e) => onVoice(e.target.value ? Number(e.target.value) : null)} aria-label="Write as an adopted character">
          <option value="">Yourself</option>
          {adopted.map((a) => (
            <option key={a.id} value={a.id}>
              {a.avatar} {a.name}
            </option>
          ))}
        </select>
        <ChevronDown size={12} aria-hidden />
      </label>
      {voice && (
        <button type="button" className="cm-pill" onClick={writeAs} disabled={writing || !body.trim()} title={body.trim() ? `Rewrite your notes as ${voice.name}` : 'Jot down your notes first'}>
          {writing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {writing ? `${voice.name} is writing…` : `Rewrite as ${voice.name}`}
        </button>
      )}
      <span style={{ flex: 1 }} />
      <button type="button" className="cm-iconbtn" aria-label="Discard draft" title="Discard draft" onClick={onDiscard}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}

/** The floating "New Message" window, bottom right, as in every mail client since Gmail. */
function ComposeWindow({
  value,
  onChange,
  adopted,
  sessionId,
  onAdopt,
  onDone,
}: {
  value: Compose
  onChange: (c: Compose) => void
  adopted: Adopted[]
  sessionId: string
  onAdopt: () => void
  onDone: (note?: string) => void
}) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // A notice is not an error: "rewritten as Wren" is good news, and red says otherwise.
  const [notice, setNotice] = useState('')
  const to = adopted.find((a) => a.id === value.characterId)
  const set = (p: Partial<Compose>) => onChange({ ...value, ...p })

  const post = (action: 'send' | 'draft') =>
    fetch('/api/cmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, action, threadId: value.threadId, characterId: value.characterId, subject: value.subject, body: value.body, voiceId: value.voiceId }),
    })

  /** Closing keeps what was written, as Gmail does: it becomes a draft. */
  const close = async () => {
    if (value.characterId && (value.body.trim() || value.subject.trim())) {
      await post('draft')
      onDone('Saved to Drafts.')
    } else onDone()
  }

  const send = async () => {
    if (!value.characterId) { setError('Choose who this mail is to.'); return }
    setSending(true)
    setError('')
    try {
      const res = await post('send')
      const d = await res.json().catch(() => null)
      if (!res.ok) { setError(d?.error || 'Not sent.'); return }
      onDone(d.replied ? `Sent — and ${to?.name || 'they'} wrote back.` : `Sent. ${to?.name || 'They'} could not write back just now — it is in Sent.`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="cm-composer" role="dialog" aria-label="New message" data-min={value.minimized || undefined}>
      <div className="cm-composer-head">
        <button type="button" className="cm-composer-title" onClick={() => set({ minimized: !value.minimized })}>
          {value.subject || 'New Message'}
        </button>
        <button type="button" className="cm-iconbtn" aria-label={value.minimized ? 'Expand' : 'Minimise'} onClick={() => set({ minimized: !value.minimized })}>
          <Minus size={15} />
        </button>
        <button type="button" className="cm-iconbtn" aria-label="Save and close" title="Save and close" onClick={close}>
          <X size={15} />
        </button>
      </div>
      {!value.minimized && (
        <>
          <label className="cm-field">
            <span>To</span>
            <select
              value={value.characterId ?? ''}
              disabled={Boolean(value.threadId)}
              onChange={(e) => {
                if (e.target.value === 'adopt') { onAdopt(); return }
                set({ characterId: e.target.value ? Number(e.target.value) : null })
              }}
              aria-label="Recipient"
            >
              <option value="">Choose an adopted character…</option>
              {adopted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.avatar} {a.name}
                </option>
              ))}
              <option value="adopt">＋ Adopt someone new…</option>
            </select>
          </label>
          <label className="cm-field">
            <span className="cm-sr">Subject</span>
            <input value={value.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Subject" aria-label="Subject" />
          </label>
          <textarea
            className="cm-composer-body"
            value={value.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder={to ? `Write to ${to.name}… or jot notes and pick a voice under "Write as"` : 'Write your mail…'}
            aria-label="Message"
          />
          {error && <p className="cm-error" role="alert">{error}</p>}
          {notice && !error && <p className="cm-notice" role="status">{notice}</p>}
          <ComposerFooter
            sessionId={sessionId}
            adopted={adopted}
            voiceId={value.voiceId}
            toName={to?.name || ''}
            subject={value.subject}
            body={value.body}
            onVoice={(voiceId) => set({ voiceId })}
            onWritten={(body) => set({ body })}
            sending={sending}
            onSend={send}
            onDiscard={async () => {
              if (value.threadId) {
                await fetch('/api/cmail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action: 'draft', threadId: value.threadId, body: '' }) })
              }
              onDone(value.body.trim() ? 'Draft discarded.' : undefined)
            }}
            say={(t, isError) => {
              if (isError) { setNotice(''); setError(t) }
              else { setError(''); setNotice(t) }
            }}
          />
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ adoption */

type CharacterCard = { id: number; name: string; avatar: string; tagline: string; category: string }

/**
 * Adopt a character into CMail. Two shelves: every public character, searchable,
 * and — when you are signed in to CharacterVerse Social — the roster you already
 * adopted there, ready to bring across.
 */
function AdoptDialog({
  sessionId,
  adopted,
  onClose,
  onAdopted,
}: {
  sessionId: string
  adopted: Adopted[]
  onClose: () => void
  onAdopted: (a: CharacterCard, fresh: boolean) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<CharacterCard[] | null>(null)
  const [roster, setRoster] = useState<CharacterCard[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const have = useMemo(() => new Set(adopted.map((a) => a.id)), [adopted])

  useEffect(() => {
    panel.current?.querySelector('input')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // The Social roster is cookie-scoped; a signed-out visitor simply gets [].
    fetch('/api/social/adoptions')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setRoster(Array.isArray(rows) ? rows : []))
      .catch(() => {})
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const t = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: '40' })
      if (q.trim()) params.set('search', q.trim())
      fetch(`/api/characters?${params}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => setList(Array.isArray(rows) ? rows : []))
        .catch(() => setList([]))
    }, 180)
    return () => window.clearTimeout(t)
  }, [q])

  const adopt = async (c: CharacterCard, via: 'cmail' | 'social') => {
    setBusy(c.id)
    setError('')
    try {
      const res = await fetch('/api/cmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'adopt', characterId: c.id, via }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setError(d?.error || 'Could not adopt.'); return }
      await onAdopted(c, Boolean(d.fresh))
    } finally {
      setBusy(null)
    }
  }

  const Card = ({ c, via }: { c: CharacterCard; via: 'cmail' | 'social' }) => (
    <li className="cm-adopt-row">
      <span className="cm-avatar" aria-hidden>{c.avatar}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="cm-adopt-name">{c.name}</span>
        <span className="cm-adopt-sub">{c.tagline || c.category}</span>
      </span>
      {have.has(c.id) ? (
        <span className="cm-chip">In your CMail</span>
      ) : (
        <button type="button" className="cm-pill" data-primary="" disabled={busy === c.id} onClick={() => adopt(c, via)}>
          {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} {via === 'social' ? 'Bring across' : 'Adopt'}
        </button>
      )}
    </li>
  )

  return (
    <div className="cm-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panel} className="cm-dialog" role="dialog" aria-modal="true" aria-label="Adopt a character into CMail">
        <div className="cm-dialog-head">
          <h2>Adopt a character into CMail</h2>
          <button type="button" className="cm-iconbtn" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="cm-dialog-copy">
          An adopted character moves into your mailbox: it writes to you first, answers what you send it in character, and
          can lend you its voice when you compose.
        </p>
        <label className="cm-search" style={{ maxWidth: 'none' }}>
          <Search size={15} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search characters" aria-label="Search characters" />
        </label>
        {error && <p className="cm-error" role="alert">{error}</p>}

        <div className="cm-dialog-scroll">
          {roster.length > 0 && !q && (
            <>
              <h3>From your Social roster</h3>
              <ul className="cm-adopt-list">
                {roster.map((c) => <Card key={`s${c.id}`} c={c} via="social" />)}
              </ul>
            </>
          )}
          <h3>{q ? 'Matching characters' : 'Characters'}</h3>
          {list === null ? (
            <p className="cm-note">Loading…</p>
          ) : list.length === 0 ? (
            <p className="cm-note">No character matches &ldquo;{q}&rdquo;.</p>
          ) : (
            <ul className="cm-adopt-list">
              {list.map((c) => <Card key={c.id} c={c} via="cmail" />)}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
