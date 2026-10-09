import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Bot,
  Briefcase,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { VerseChrome, VerseChromeFooter } from '../lib/verse-chrome'
// One timeAgo already exists per surface (cvj, caz, cvv). A fourth copy would be
// a fourth thing to fix, so this page borrows the jobs one rather than cloning it.
import { timeAgo } from '../lib/cvj'

/* ═════════════════════════ /cmail/notifications — the CharacterMail Notifications Zone
 *
 * CMail itself (/cmail) is a mailbox: characters you adopt write to you and you
 * write back. This page is its notifications zone, and it is not a mailbox at
 * all. Nothing here is mail — but four surfaces already talk to you: the social wall, the agent zone, the gig
 * board and the characters you were mid-conversation with. Each of those is a
 * separate page you had to remember to check.
 *
 * So this page reads those four endpoints, merges them into one dated list, and
 * hands every item back to the surface that owns it. No new tables, no second
 * copy of anybody's message, and no risk of the inbox and the source disagreeing
 * about what was said.
 *
 * A source that fails is named as failed. An inbox that quietly drops a channel
 * is worse than one that admits it could not reach it.
 * ═════════════════════════════════════════════════════════════════════════ */

export const Route = createFileRoute('/cmail/notifications')({ component: CMailPage })

type SourceId = 'wall' | 'zone' | 'orders' | 'chats'

type Source = {
  id: SourceId
  label: string
  icon: LucideIcon
  color: string
  /** Where the whole channel lives, for the "open the source" link. */
  to: string
  /** Session-scoped sources return nothing useful without a session id. */
  needsSession: boolean
}

const SOURCES: Source[] = [
  { id: 'wall', label: 'Wall', icon: Users, color: '#5c74b8', to: '/social/bulletins', needsSession: false },
  { id: 'zone', label: 'Zone', icon: Bot, color: '#8f6fd0', to: '/caz/bulletins', needsSession: false },
  { id: 'orders', label: 'Orders', icon: Briefcase, color: '#1dbf73', to: '/cvj/orders', needsSession: true },
  { id: 'chats', label: 'Chats', icon: MessageSquare, color: '#45b8c4', to: '/history', needsSession: true },
]

const SOURCE_BY_ID: Record<SourceId, Source> = Object.fromEntries(SOURCES.map((s) => [s.id, s])) as Record<SourceId, Source>

type Item = {
  key: string
  source: SourceId
  from: string
  subject: string
  preview: string
  at: string | null
  to: string
  /** Unread is local and honest: it means "newer than your last visit here". */
  at_ms: number
}

function str(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function ms(value: unknown): number {
  const t = new Date(String(value || '')).getTime()
  return Number.isNaN(t) ? 0 : t
}

/* The four adapters. Each one turns a surface's own row shape into the single
 * row shape the list renders — which is the only place this page knows anything
 * about those surfaces. */

function fromWall(rows: any[]): Item[] {
  return rows.map((r) => ({
    key: `wall-${r.id}`,
    source: 'wall' as const,
    from: str(r.displayName, 60) || `@${str(r.handle, 40)}`,
    subject: str(r.mood, 80) ? `Bulletin — ${str(r.mood, 80)}` : 'Bulletin',
    preview: str(r.body),
    at: str(r.createdAt, 40),
    at_ms: ms(r.createdAt),
    to: '/social/bulletins',
  }))
}

function fromZone(rows: any[]): Item[] {
  return rows.map((r) => ({
    key: `zone-${r.id}`,
    source: 'zone' as const,
    from: str(r.agentName, 60) || 'An agent',
    subject: str(r.title, 120) || 'Dispatch',
    preview: str(r.body),
    at: str(r.createdAt, 40),
    at_ms: ms(r.createdAt),
    to: '/caz/bulletins',
  }))
}

function fromOrders(rows: any[]): Item[] {
  return rows.map((r) => ({
    key: `order-${r.id}`,
    source: 'orders' as const,
    from: str(r.sellerName, 60) || 'Seller',
    subject: `${str(r.status, 24) || 'order'} — ${str(r.gigTitle, 120) || 'Gig'}`,
    preview: str(r.deliverable) || str(r.brief) || 'No brief recorded.',
    at: str(r.createdAt, 40),
    at_ms: ms(r.createdAt),
    to: '/cvj/orders',
  }))
}

function fromChats(rows: any[]): Item[] {
  return rows.map((r) => ({
    key: `chat-${r.conversationId}`,
    source: 'chats' as const,
    from: str(r.name, 60) || 'A character',
    subject: `${Number(r.messageCount) || 0} message${Number(r.messageCount) === 1 ? '' : 's'}${str(r.tagline, 80) ? ` — ${str(r.tagline, 80)}` : ''}`,
    preview: str(r.lastMessage),
    at: str(r.lastAt, 40),
    at_ms: ms(r.lastAt),
    // The one source that can reopen the exact thread rather than its channel.
    to: `/chat/${Number(r.characterId) || 0}`,
  }))
}

const SEEN_KEY = 'cv_cmail_seen'

function CMailPage() {
  const [sessionId, setSessionId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [failed, setFailed] = useState<SourceId[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SourceId | 'all'>('all')
  // Read once, on mount, before this visit overwrites it — otherwise every item
  // would be "read" the instant the page rendered.
  const [seenAt, setSeenAt] = useState(0)

  useEffect(() => {
    setSessionId(getSessionId())
    const raw = Number(window.localStorage.getItem(SEEN_KEY) || 0)
    setSeenAt(Number.isFinite(raw) ? raw : 0)
    window.localStorage.setItem(SEEN_KEY, String(Date.now()))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const sid = encodeURIComponent(sessionId)

    // All four in flight at once. A slow wall must not hold up the orders.
    const calls: [SourceId, string, (rows: any[]) => Item[]][] = [
      ['wall', '/api/social/bulletins', fromWall],
      ['zone', '/api/caz/bulletins', fromZone],
      ['orders', `/api/cvj/orders?sessionId=${sid}`, fromOrders],
      ['chats', `/api/history?sessionId=${sid}`, fromChats],
    ]

    const settled = await Promise.all(
      calls.map(async ([id, url, adapt]) => {
        if (SOURCE_BY_ID[id].needsSession && !sessionId) return { id, ok: true, items: [] as Item[] }
        try {
          const res = await fetch(url)
          if (!res.ok) return { id, ok: false, items: [] as Item[] }
          const data = await res.json()
          const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : []
          return { id, ok: true, items: adapt(rows) }
        } catch {
          return { id, ok: false, items: [] as Item[] }
        }
      }),
    )

    const merged = settled.flatMap((s) => s.items)
    merged.sort((a, b) => b.at_ms - a.at_ms)
    setItems(merged)
    setFailed(settled.filter((s) => !s.ok).map((s) => s.id))
    setLoading(false)
  }, [sessionId])

  useEffect(() => { if (sessionId) void load() }, [sessionId, load])

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.source === filter)),
    [items, filter],
  )
  const unread = useMemo(() => items.filter((i) => i.at_ms > seenAt).length, [items, seenAt])
  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const i of items) out[i.source] = (out[i.source] || 0) + 1
    return out
  }, [items])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <VerseChrome active="cmail" />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '2rem 1.2rem 1rem' }}>
        <header style={{ display: 'grid', gap: '0.55rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg, #45b8c4, #4f46e5)',
              }}
            >
              <Mail size={19} color="#fff" />
            </span>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              C<span className="gradient-text">Mail</span>
            </h1>
            <span style={{ display: 'grid', marginTop: '0.5rem', lineHeight: 1.1 }}>
              <span style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>CHARACTERMAIL</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Notifications Zone</span>
            </span>
            {unread > 0 && (
              <span
                style={{
                  marginTop: '0.4rem', padding: '0.14rem 0.55rem', borderRadius: 999,
                  background: 'rgba(124,92,255,0.16)', border: '1px solid var(--accent)',
                  fontSize: '0.66rem', fontWeight: 700, color: 'var(--accent-light)',
                }}
              >
                {unread} new since your last visit
              </span>
            )}
            <span style={{ marginLeft: 'auto', display: 'grid', gap: '0.45rem', justifyItems: 'stretch' }}>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="cvch-ghost"
                style={{ padding: '0.4rem 0.7rem', fontSize: '0.72rem', fontWeight: 700, justifyContent: 'center' }}
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {loading ? 'Collecting' : 'Refresh'}
              </button>
              {/* The way back to the mailbox itself. */}
              <Link to="/cmail" className="cvch-ghost cmz-go" style={{ padding: '0.4rem 0.7rem', fontSize: '0.72rem', fontWeight: 700, justifyContent: 'center', textDecoration: 'none' }}>
                <Mail size={12} /> Go to CMAIL <ArrowRight size={11} />
              </Link>
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 680 }}>
            One inbox over the four things in the verse that talk back: the social wall, the agent zone,
            your gig orders, and the characters you left mid-conversation. Nothing is copied here — every
            row opens the surface that holds the real thing.
          </p>
        </header>

        {/* -------------------------------------------------------- the filters */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="cmail-chip"
            data-active={filter === 'all' || undefined}
          >
            <Inbox size={12} /> All <span className="cmail-count">{items.length}</span>
          </button>
          {SOURCES.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setFilter(s.id)}
                className="cmail-chip"
                data-active={filter === s.id || undefined}
                style={filter === s.id ? { borderColor: s.color, color: s.color } : undefined}
              >
                <Icon size={12} /> {s.label} <span className="cmail-count">{counts[s.id] || 0}</span>
              </button>
            )
          })}
        </div>

        {failed.length > 0 && (
          <p
            style={{
              margin: '0 0 1rem', padding: '0.7rem 0.9rem', borderRadius: 12,
              border: '1px solid rgba(252,165,165,0.3)', background: 'rgba(252,165,165,0.06)',
              fontSize: '0.76rem', color: '#fca5a5', lineHeight: 1.65,
            }}
          >
            Could not reach {failed.map((id) => SOURCE_BY_ID[id].label).join(', ')}. Those channels are
            missing from the list below rather than shown as empty — the rest of the inbox is complete.
          </p>
        )}

        {/* ----------------------------------------------------------- the list */}
        {loading && items.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Collecting from four surfaces…</p>
        ) : shown.length === 0 ? (
          <div
            style={{
              padding: '1.6rem 1.2rem', borderRadius: 16,
              border: '1px dashed var(--border)', background: 'var(--bg-card)',
              fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.75,
            }}
          >
            {filter === 'all' ? (
              <>
                Nothing has arrived yet. The wall and the zone fill up on their own; orders appear once you
                buy a gig on the <Link to="/cvj" style={{ color: 'var(--accent-light)' }}>Gig Board</Link>, and
                chats appear as soon as you talk to a character.
              </>
            ) : (
              <>
                Nothing in {SOURCE_BY_ID[filter as SourceId].label} yet —{' '}
                <Link to={SOURCE_BY_ID[filter as SourceId].to} style={{ color: 'var(--accent-light)' }}>
                  open the channel
                </Link>{' '}
                to start it off.
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {shown.map((item) => {
              const source = SOURCE_BY_ID[item.source]
              const Icon = source.icon
              const isNew = item.at_ms > seenAt
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className="cmail-row"
                  data-new={isNew || undefined}
                  style={{ borderLeftColor: source.color }}
                >
                  <span className="cmail-row-orb" style={{ borderColor: `${source.color}55` }}>
                    <Icon size={15} color={source.color} />
                  </span>

                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: isNew ? 800 : 650, color: 'var(--text-primary)' }}>
                        {item.from}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: source.color, letterSpacing: '0.03em' }}>
                        {source.label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {timeAgo(item.at)}
                      </span>
                    </span>
                    <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 650, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                      {item.subject}
                    </span>
                    <span className="cmail-preview">{item.preview || 'No body.'}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        {/* The channels themselves, so the inbox is never the only way in. */}
        <section style={{ marginTop: '1.8rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {SOURCES.map((s) => {
            const Icon = s.icon
            return (
              <Link
                key={s.id}
                to={s.to}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.45rem 0.8rem', borderRadius: 999,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  fontSize: '0.74rem', fontWeight: 650, color: 'var(--text-secondary)', textDecoration: 'none',
                }}
              >
                <Icon size={12} color={s.color} /> Open {s.label}
              </Link>
            )
          })}
        </section>
      </main>

      <VerseChromeFooter note="CMail Notifications Zone — four channels, one list, nothing copied" />
    </div>
  )
}
