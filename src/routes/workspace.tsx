import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import {
  ExternalLink,
  Globe,
  Layers,
  List,
  Loader2,
  PanelRightOpen,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { useCharacterChat } from '../lib/ai-hook'
import { Skyscraper, type Rec } from '../lib/skyscraper-ui'
import { SearchSurface } from '../lib/search-ui'
import { FRAMES, FRAME_FEATURES, buildFrameAllow, coerceFrame } from '../lib/searchindex'

// The Workspace — several chats open at once, with the SAA skyscraper pinned to
// the right.
//
// Two decisions worth stating:
//
//   Tabs are rows, not React state. The strip survives a refresh, a crash and a
//   second device because it lives in the database, the same as the messages do.
//
//   Every open tab stays MOUNTED, hidden rather than unmounted when it is not the
//   active one. That is the whole point of a tab strip — switching away from a
//   storyline and back must not reset the scroll position or drop a reply that
//   was in flight.

export const Route = createFileRoute('/workspace')({
  component: WorkspacePage,
  // `?slate=<code>` opens somebody else's shared slate alongside your own tabs.
  // Validated rather than trusted: the value is echoed into a fetch, and a search
  // param is user input no matter how it got into the address bar.
  validateSearch: (search: Record<string, unknown>) => ({
    slate: typeof search.slate === 'string' ? search.slate.slice(0, 32).replace(/[^a-z0-9]/gi, '') : undefined,
  }),
})

// A tab is either a chat or an embedded external system. One strip, one
// ordering, two kinds — the same way a browser keeps its PDF tabs next to its
// HTML ones rather than in a separate window.
type Tab = {
  id: number
  kind: 'chat' | 'frame'
  characterId: number | null
  conversationId: number | null
  entryId: number | null
  /** Frame tabs only: where the embedded system lives. */
  url: string
  /** Frame tabs only: features the publisher declared. Requests, not grants. */
  permissions: string[]
  frame: string
  host: string
  title: string
  opener: string
  position: number
  active: boolean
  name: string
  avatar: string
  category: string
}

/** A tab that is definitely a chat. ChatPane is only ever given one of these. */
type ChatTab = Tab & { characterId: number }

/* ---------------------------------------------------------------- the pane */

function ChatPane({
  tab,
  sessionId,
  visible,
}: {
  tab: ChatTab
  sessionId: string
  visible: boolean
}) {
  const [conversationId, setConversationId] = useState<number>(tab.conversationId || 0)
  const [greeting, setGreeting] = useState('')
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState(tab.opener || '')
  const [loadError, setLoadError] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const boundOpener = useRef(tab.opener)

  const { messages, sendMessage, isLoading, error, setHistory } = useCharacterChat(
    tab.characterId,
    conversationId,
  )

  // Resolve (or create) this character's conversation for the session, then
  // attach it to the tab row so the next load skips this round trip.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/chat/${tab.characterId}?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((data) => {
        if (cancelled) return
        setConversationId(data.conversationId)
        setGreeting(data.character?.greeting || '')
        setHistory(data.messages || [])
        setReady(true)
        if (data.conversationId && data.conversationId !== tab.conversationId) {
          fetch('/api/tabs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              action: 'bind',
              id: tab.id,
              conversationId: data.conversationId,
            }),
          }).catch(() => {})
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('This conversation could not be loaded.')
          setReady(true)
        }
      })
    return () => { cancelled = true }
  }, [tab.characterId, tab.id, tab.conversationId, sessionId, setHistory])

  // A newer recommendation for an already-open character replaces the staged
  // opener, but never overwrites something the user has started typing.
  useEffect(() => {
    if (tab.opener && tab.opener !== boundOpener.current) {
      boundOpener.current = tab.opener
      setDraft((current) => (current.trim() ? current : tab.opener))
    }
  }, [tab.opener])

  useEffect(() => {
    if (visible && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight
    }
  }, [messages.length, isLoading, visible])

  // Nothing may be sent before the conversation resolves — a post against
  // conversation 0 would write into nowhere, and the composer loads fast enough
  // that a disabled second is cheaper than a lost first message.
  const canSend = Boolean(draft.trim()) && !isLoading && ready && conversationId > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSend) return
    const text = draft.trim()
    setDraft('')
    sendMessage(text)
  }

  return (
    <div
      style={{
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        ref={scroller}
        style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.25rem 0.5rem' }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 14 }}>
          {!ready && (
            <div style={{ display: 'grid', gap: 10 }}>
              {[72, 54, 66].map((w, i) => (
                <div
                  key={i}
                  style={{
                    height: 44,
                    width: `${w}%`,
                    marginLeft: i % 2 ? 'auto' : 0,
                    borderRadius: 12,
                    background: 'var(--bg-card)',
                    animation: 'pulse 1.6s ease-in-out infinite',
                    animationDelay: `${i * 130}ms`,
                  }}
                />
              ))}
            </div>
          )}

          {ready && loadError && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{loadError}</div>
          )}

          {ready && !loadError && greeting && messages.length === 0 && (
            <Bubble side="left" avatar={tab.avatar} name={tab.name} text={greeting} />
          )}

          {messages.map((m) =>
            m.role === 'assistant' ? (
              <Bubble key={m.id} side="left" avatar={tab.avatar} name={tab.name} text={m.content} />
            ) : (
              <Bubble key={m.id} side="right" text={m.content} />
            ),
          )}

          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12.5 }}>
              <Loader2 size={13} className="spin" /> {tab.name} is writing
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12.5, color: '#d03b3b' }}>{error}</div>
          )}
        </div>
      </div>

      <form
        onSubmit={submit}
        style={{ padding: '0.75rem 1.25rem 1.25rem', borderTop: '1px solid var(--border)' }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${tab.name}…`}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            style={{
              padding: '0 16px',
              borderRadius: 10,
              border: 'none',
              background: canSend ? 'var(--accent)' : 'var(--bg-hover)',
              color: canSend ? '#fff' : 'var(--text-secondary)',
              cursor: canSend ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13.5,
              fontWeight: 600,
            }}
          >
            <Send size={14} /> Send
          </button>
        </div>
        {tab.opener && draft === tab.opener && (
          <div
            style={{
              maxWidth: 760,
              margin: '8px auto 0',
              fontSize: 11,
              color: 'var(--text-secondary)',
            }}
          >
            Staged from AlgorithmClaw — edit it before sending, or send as is.
          </div>
        )}
      </form>
    </div>
  )
}

function Bubble({
  side,
  avatar,
  name,
  text,
}: {
  side: 'left' | 'right'
  avatar?: string
  name?: string
  text: string
}) {
  const right = side === 'right'
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: right ? 'flex-end' : 'flex-start' }}>
      {!right && (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: 'var(--bg-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            flexShrink: 0,
          }}
          aria-hidden
        >
          {avatar}
        </span>
      )}
      <div style={{ maxWidth: '78%' }}>
        {!right && name && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{name}</div>
        )}
        <div
          style={{
            padding: '10px 13px',
            borderRadius: 12,
            background: right ? 'var(--accent)' : 'var(--bg-card)',
            border: right ? 'none' : '1px solid var(--border)',
            color: right ? '#fff' : 'var(--text-primary)',
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- the workspace */

/* --------------------------------------------------- somebody else's slate */

type SharedRec = Rec & { characterName: string }
type Shared = {
  slateId: number
  vibe: string
  seed: string
  provenance: string
  mine: boolean
  recommendations: SharedRec[]
}

/**
 * A slate someone handed you.
 *
 * These cards are replayed from rows, not re-ranked. That is the only way two
 * people can look at the same thing: re-running the ranker here would read YOUR
 * history and quietly produce a different slate under the same link, which is the
 * failure mode the sharing design exists to avoid. So the copy says plainly that
 * this was ranked for somebody else, because a recommendation carries an implicit
 * "for you" and this one is not.
 */
function SharedSlate({
  code,
  sessionId,
  onOpen,
  onDismiss,
}: {
  code: string
  sessionId: string
  onOpen: (rec: Rec) => void
  onDismiss: () => void
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading')
  const [shared, setShared] = useState<Shared | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/slate?code=${encodeURIComponent(code)}&sessionId=${encodeURIComponent(sessionId)}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) {
          setMessage(data?.error || 'That slate could not be loaded.')
          setState('gone')
          return
        }
        setShared(data)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) { setMessage('That slate could not be loaded.'); setState('gone') }
      })
    return () => { cancelled = true }
  }, [code, sessionId])

  if (state === 'loading') {
    return (
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ height: 10, width: '40%', borderRadius: 5, background: 'var(--bg-hover)' }} className="animate-fade-in" />
      </div>
    )
  }

  if (state === 'gone') {
    return (
      <div
        style={{
          padding: '11px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ flex: 1 }}>{message}</span>
        <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
          <X size={13} />
        </button>
      </div>
    )
  }

  if (!shared) return null

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px 8px' }}>
        <Users size={13} color="var(--accent-light)" />
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
          {shared.mine ? 'Your shared slate' : 'A slate someone shared with you'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          &ldquo;{shared.vibe}&rdquo;
        </span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss shared slate"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
        >
          <X size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px', overflowX: 'auto' }}>
        {shared.recommendations.map((rec) => (
          <button
            key={rec.id || rec.characterId}
            onClick={() => onOpen(rec)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 11px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              cursor: 'pointer',
              textAlign: 'left',
              flexShrink: 0,
              maxWidth: 260,
            }}
          >
            <span style={{ fontSize: 16 }} aria-hidden>{rec.avatar}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rec.title}
              </span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-secondary)' }}>
                {rec.characterName || rec.characterName} · {rec.match}% for them
              </span>
            </span>
          </button>
        ))}
      </div>

      <p style={{ margin: 0, padding: '0 16px 10px', fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {shared.mine
          ? 'This is the copy other people see. Their own history is never used to re-rank it.'
          : 'Ranked against their chat history, not yours — the match numbers are theirs. Opening one starts a normal chat on your side.'}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------- the frame pane */

/**
 * An externally hosted AI system, rendered inside the workspace.
 *
 * This is the inframe half of CharacterVerse Search. The system runs in a
 * sandboxed frame: `allow-scripts allow-same-origin` keeps it in its OWN origin
 * (so its storage and its scripts work) without giving it any reach into this
 * page, and `allow-popups` is there because a sign-in flow that cannot open a
 * window is a dead end. That is the controlled channel — everything the embedded
 * system does, it does inside the boundary.
 *
 * Blocked embeds are the interesting failure. A host that refuses to be framed
 * does it with a response header, and a cross-origin refusal is invisible to the
 * embedding page: no error event, nothing readable. So this is a heuristic — if
 * the frame has not fired `load` within the timeout, treat it as refused, record
 * the block against the entry, and offer the redirect instead. It will be wrong
 * occasionally on a slow host, which is why the frame stays mounted underneath
 * the notice rather than being torn down.
 */
function FramePane({
  tab,
  sessionId,
  visible,
}: {
  tab: Tab
  sessionId: string
  visible: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const reported = useRef(false)
  // Browser features this viewer has turned on for this system, this session.
  // Starts empty every time on purpose: a grant is a decision about a specific
  // stranger's page, and it should not be waiting already made when you open a
  // tab you have not looked at yet.
  const [granted, setGranted] = useState<string[]>([])
  // The `allow` attribute is read when the frame is created and ignored
  // afterwards, so granting a feature has to remount the iframe. Keying on the
  // grant list is what does that.
  const allow = buildFrameAllow(tab.permissions || [], granted)
  const requested = (tab.permissions || []).filter((p) =>
    FRAME_FEATURES.some((f) => f.id === p),
  )

  useEffect(() => {
    if (loaded || blocked) return
    const timer = setTimeout(() => {
      setBlocked(true)
      if (reported.current || !tab.entryId) return
      reported.current = true
      void fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'event',
          kind: 'frame_block',
          entryId: tab.entryId,
          docKind: 'external',
          frame: 'inframe',
          source: 'workspace',
        }),
      }).catch(() => {})
    }, 6500)
    return () => clearTimeout(timer)
  }, [loaded, blocked, sessionId, tab.entryId])

  return (
    <div
      style={{
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '7px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <Globe size={12} color="var(--text-secondary)" />
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tab.host || tab.url}
        </span>
        <span
          title={FRAMES[coerceFrame(tab.frame)].behaviour}
          style={{
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            padding: '1px 6px',
            borderRadius: 4,
            border: '1px solid var(--accent)',
            color: 'var(--accent-light)',
            flexShrink: 0,
          }}
        >
          sandboxed
        </span>
        <a
          href={tab.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open it on its own site instead"
          style={{ marginLeft: 'auto', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Delegated features, off until turned on.
          A publisher declares what their system needs; this row is where the
          person actually using it decides. Three gates in series: the entry's
          declaration, this toggle, and then the browser's own prompt naming the
          third-party origin. Nothing here grants anything by itself, and there
          is no row at all for the great majority of entries, which declare
          nothing. */}
      {requested.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-card)',
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={11} color="var(--text-secondary)" />
          <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
            {tab.name} asks for
          </span>
          {requested.map((id) => {
            const feat = FRAME_FEATURES.find((f) => f.id === id)
            const on = granted.includes(id)
            return (
              <button
                key={id}
                type="button"
                title={
                  on
                    ? `Granted to ${tab.host}. Click to revoke — the frame reloads without it.`
                    : `${feat?.why} Granting reloads the frame; your browser will still ask.`
                }
                onClick={() =>
                  setGranted((prev) => (on ? prev.filter((p) => p !== id) : [...prev, id]))
                }
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: on ? 'var(--accent)' : 'var(--border)',
                  background: on ? 'rgba(124,92,191,0.2)' : 'transparent',
                  color: on ? 'var(--accent-light)' : 'var(--text-secondary)',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {on ? '✓ ' : ''}
                {feat?.label || id}
              </button>
            )
          })}
        </div>
      )}

      {blocked && !loaded && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-primary)' }}>
            {tab.name} has not rendered in the frame.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Most likely it refuses to be embedded — plenty of hosts do, and the refusal is not
            something an embedding page is allowed to read, so this is inferred from the frame never
            loading rather than reported. It has been recorded as a refused embed against the entry,
            which is exactly the kind of signal this index exists to collect. Opening it on its own
            site still counts as demand.
          </p>
          <a
            href={tab.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 10,
              padding: '7px 12px',
              borderRadius: 7,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={12} /> Open {tab.name} on {tab.host}
          </a>
        </div>
      )}

      <iframe
        // Remounted when a permission is granted, because the browser reads
        // `allow` once at creation. The frame reloads; that is the cost of not
        // handing out capabilities up front.
        key={allow}
        src={tab.url}
        title={tab.name || tab.title}
        onLoad={() => setLoaded(true)}
        // Four tokens, and the two that are missing matter as much as the four
        // that are here.
        //
        // allow-scripts + allow-same-origin is the pair a real web app needs:
        // its own JS, and its own origin for storage and fetch. Together they
        // are also a known hazard — a frame that is same-origin WITH ITS PARENT
        // and allowed to script can reach up and strip the parent's sandbox
        // attribute entirely. That is why an entry pointing at CharacterVerse
        // itself is refused at registration (see screenTarget) rather than
        // being caught here: for any genuinely third-party URL, allow-same-origin
        // restores the frame's access to its OWN origin and gives it nothing of
        // ours.
        //
        // Dropped: allow-popups-to-escape-sandbox, which would let this frame
        // open a window with no sandbox at all — the standard way out of one.
        // Popups still work, they just inherit these same restrictions.
        //
        // Dropped: allow-top-navigation, so the frame cannot replace the
        // workspace around it. A third-party chat that decides to navigate the
        // whole tab to its own site would take every other open tab with it.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        // Only what the viewer granted, scoped to this frame's own origin.
        // Empty string means the frame gets no delegated capability at all,
        // which is the default and the common case.
        allow={allow}
        referrerPolicy="no-referrer"
        style={{ flex: 1, width: '100%', border: 'none', background: 'var(--bg-primary)' }}
      />
    </div>
  )
}

/* ------------------------------------------------------ the workstation index */

/**
 * The tab index.
 *
 * A horizontal strip stops being navigable somewhere around eight tabs — titles
 * truncate to nothing and the ones off-screen may as well not exist. The index is
 * the strip's readable form: every open tab in full, grouped by the character it
 * belongs to, so "where did that Byte conversation go" is a glance rather than a
 * scroll. It is a view of the same rows, so it needs no state of its own.
 */
function TabIndex({
  tabs,
  activeId,
  onFocus,
  onClose,
  onDismiss,
}: {
  tabs: Tab[]
  activeId: number | null
  onFocus: (id: number) => void
  onClose: (id: number) => void
  onDismiss: () => void
}) {
  // Grouped by what the tab is OF, which is a character for a chat tab and an
  // index entry for a frame tab. Keyed by a string rather than a character id
  // because a frame tab has no character and every one of them would otherwise
  // collapse into the same null group.
  const groups = new Map<string, { name: string; avatar: string; category: string; tabs: Tab[] }>()
  for (const tab of tabs) {
    const key = tab.kind === 'frame' ? `frame:${tab.entryId}` : `chat:${tab.characterId}`
    const g = groups.get(key) || { name: tab.name, avatar: tab.avatar, category: tab.category, tabs: [] }
    g.tabs.push(tab)
    groups.set(key, g)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-primary)',
        zIndex: 5,
        overflowY: 'auto',
        padding: '20px 24px 40px',
      }}
      className="animate-fade-in"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <List size={15} color="var(--accent-light)" />
        <h2 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>Workstation index</h2>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'} across {groups.size}{' '}
          {groups.size === 1 ? 'character' : 'characters'}
        </span>
        <button
          onClick={onDismiss}
          aria-label="Close the index"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={15} />
        </button>
      </div>

      {tabs.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Nothing open yet. Name a vibe in the right-hand column and open what it suggests.
        </p>
      )}

      <div style={{ display: 'grid', gap: 18 }}>
        {[...groups.entries()].map(([key, group]) => (
          <section key={key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 17 }} aria-hidden>{group.avatar}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{group.name}</span>
              {group.category && (
                <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 7px' }}>
                  {group.category}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {group.tabs.map((tab) => (
                <div
                  key={tab.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 9,
                    border: '1px solid var(--border)',
                    borderLeft: tab.id === activeId ? '2px solid var(--accent-light)' : '1px solid var(--border)',
                    background: 'var(--bg-card)',
                  }}
                >
                  <button
                    onClick={() => onFocus(tab.id)}
                    style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                  >
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)' }}>
                      {tab.title || tab.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {tab.kind === 'frame'
                        ? `${tab.host} · embedded, sandboxed`
                        : tab.conversationId
                          ? `Thread #${tab.conversationId}`
                          : 'Not started yet'}
                      {tab.kind === 'chat' && tab.opener ? ' · opener staged' : ''}
                    </span>
                  </button>
                  {tab.kind === 'frame' ? (
                    <a
                      href={tab.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open it on its own site instead"
                      style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}
                    >
                      <ExternalLink size={13} />
                    </a>
                  ) : (
                    <Link
                      to="/chat/$id"
                      params={{ id: String(tab.characterId) }}
                      title="Open this character full-screen"
                      style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}
                    >
                      <ExternalLink size={13} />
                    </Link>
                  )}
                  <button
                    onClick={() => onClose(tab.id)}
                    aria-label={`Close ${tab.title || tab.name}`}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function WorkspacePage() {
  const search = useSearch({ from: '/workspace' })
  const [sessionId, setSessionId] = useState('')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Dismissing a shared slate is local and deliberate — it does not rewrite the
  // URL, so a reload brings it back rather than silently losing a link someone
  // sent you.
  const [slateDismissed, setSlateDismissed] = useState(false)

  useEffect(() => { setSessionId(getSessionId()) }, [])

  const apply = useCallback((rows: Tab[]) => {
    setTabs(rows)
    const active = rows.find((t) => t.active)
    setActiveId(active?.id ?? rows[rows.length - 1]?.id ?? null)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/tabs?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Tab[]) => apply(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [sessionId, apply])

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...body }),
      })
      if (!res.ok) return
      const rows = await res.json().catch(() => null)
      if (Array.isArray(rows)) apply(rows)
    },
    [sessionId, apply],
  )

  const openFromRec = (rec: Rec) => {
    setRailOpen(false)
    setIndexOpen(false)
    setSearchOpen(false)
    post({
      action: 'open',
      characterId: rec.characterId,
      title: rec.title,
      opener: rec.opener,
      fromRecommendation: rec.id || null,
    })
  }

  // What CharacterVerse Search does with a result, from inside the workspace.
  // A character becomes a chat tab; an inframe entry becomes a frame tab. An
  // oframe entry never reaches here — the surface redirects it in the browser,
  // which is the whole difference between the two frames.
  const openCharacter = (characterId: number, title: string) => {
    setSearchOpen(false)
    post({ action: 'open', characterId, title })
  }

  const openFrame = (entryId: number, title: string) => {
    setSearchOpen(false)
    post({ action: 'openFrame', entryId, title })
  }

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 60px)',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Chat side */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {search.slate && !slateDismissed && sessionId && (
          <SharedSlate
            code={search.slate}
            sessionId={sessionId}
            onOpen={openFromRec}
            onDismiss={() => setSlateDismissed(true)}
          />
        )}

        {/* Tab strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', overflowX: 'auto', flex: 1, minWidth: 0 }}>
            {tabs.map((tab) => {
              const isActive = tab.id === activeId
              return (
                <div
                  key={tab.id}
                  onClick={() => { setActiveId(tab.id); post({ action: 'focus', id: tab.id }) }}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setActiveId(tab.id)
                      post({ action: 'focus', id: tab.id })
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '9px 10px 9px 12px',
                    cursor: 'pointer',
                    background: isActive ? 'var(--bg-primary)' : 'transparent',
                    borderRight: '1px solid var(--border)',
                    borderBottom: isActive ? '2px solid var(--accent-light)' : '2px solid transparent',
                    minWidth: 150,
                    maxWidth: 230,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden>{tab.avatar}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: isActive ? 600 : 500,
                      }}
                    >
                      {tab.title || tab.name}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {tab.name}
                    </span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); post({ action: 'close', id: tab.id }) }}
                    aria-label={`Close ${tab.name}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      flexShrink: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* CharacterVerse Search. Beside Index and Vibes, above the panes,
              because it is the third thing you do to a workspace: list what is
              open, ask for a vibe, or search the index for something new — and
              the index is the only one of the three that reaches systems we do
              not host. */}
          <button
            onClick={() => { setSearchOpen((v) => !v); setIndexOpen(false) }}
            title="CharacterVerse Search — characters, your chats, and AI systems hosted elsewhere"
            aria-pressed={searchOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              background: searchOpen ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              borderLeft: '1px solid var(--border)',
              color: searchOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            <Search size={14} />
            <span className="hidden sm:inline">Search</span>
          </button>

          <button
            onClick={() => { setIndexOpen((v) => !v); setSearchOpen(false) }}
            title="Workstation index"
            aria-pressed={indexOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              background: indexOpen ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              borderLeft: '1px solid var(--border)',
              color: indexOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            <List size={14} />
            <span className="hidden sm:inline">Index</span>
            {tabs.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '0 5px',
                  color: 'var(--text-secondary)',
                }}
              >
                {tabs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setRailOpen((v) => !v)}
            title="Recommendation column"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              background: 'transparent',
              border: 'none',
              borderLeft: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            <PanelRightOpen size={14} />
            <span className="hidden sm:inline">Vibes</span>
          </button>
        </div>

        {/* Panes — all mounted, only the active one shown */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {tabs.map((tab) => (
            <div key={tab.id} style={{ position: 'absolute', inset: 0 }}>
              {tab.kind === 'frame' ? (
                <FramePane tab={tab} sessionId={sessionId} visible={tab.id === activeId} />
              ) : (
                <ChatPane
                  tab={tab as ChatTab}
                  sessionId={sessionId}
                  visible={tab.id === activeId}
                />
              )}
            </div>
          ))}

          {searchOpen && (
            <SearchSurface
              sessionId={sessionId}
              variant="overlay"
              onOpenCharacter={openCharacter}
              onOpenFrame={openFrame}
              onClose={() => setSearchOpen(false)}
            />
          )}

          {indexOpen && (
            <TabIndex
              tabs={tabs}
              activeId={activeId}
              onFocus={(id) => { setActiveId(id); setIndexOpen(false); post({ action: 'focus', id }) }}
              onClose={(id) => post({ action: 'close', id })}
              onDismiss={() => setIndexOpen(false)}
            />
          )}

          {loaded && tabs.length === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                textAlign: 'center',
              }}
            >
              <Layers size={30} color="var(--text-secondary)" strokeWidth={1.3} style={{ opacity: 0.55 }} />
              <h2 style={{ fontSize: 17, fontWeight: 650, color: 'var(--text-primary)', marginTop: 14 }}>
                No tabs open
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 380, marginTop: 8, lineHeight: 1.6 }}>
                Name a vibe in the column on the right and AlgorithmClaw will read
                your chat history for it. Open as many of its suggestions as you
                like — each one becomes a tab, and the strip survives a refresh.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={() => setRailOpen(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Ask for a vibe
                </button>
                <button
                  onClick={() => setSearchOpen(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Search size={13} /> Search the index
                </button>
                <Link
                  to="/discover"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Plus size={13} /> Browse characters
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The skyscraper. Docked on wide screens, a drawer under 1100px. */}
      <div className="saa-rail" data-open={railOpen ? 'true' : 'false'}>
        <Skyscraper
          sessionId={sessionId}
          onOpen={openFromRec}
          onClose={() => setRailOpen(false)}
        />
      </div>
      {railOpen && (
        <div
          className="saa-rail-scrim"
          onClick={() => setRailOpen(false)}
          aria-hidden
        />
      )}

      <style>{`
        .saa-rail {
          width: 360px;
          flex-shrink: 0;
          height: 100%;
        }
        .saa-rail-scrim { display: none; }
        @media (max-width: 1100px) {
          .saa-rail {
            position: fixed;
            top: 60px;
            right: 0;
            bottom: 0;
            width: min(360px, 88vw);
            z-index: 60;
            transform: translateX(100%);
            transition: transform 0.22s ease;
            box-shadow: -18px 0 40px rgba(0, 0, 0, 0.45);
          }
          .saa-rail[data-open='true'] { transform: translateX(0); }
          .saa-rail-scrim {
            display: block;
            position: fixed;
            inset: 60px 0 0 0;
            background: rgba(5, 5, 12, 0.55);
            z-index: 55;
          }
        }
      `}</style>
    </div>
  )
}
