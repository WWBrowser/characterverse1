import { useState, useEffect, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Clock,
  FolderOpen,
  ExternalLink,
  Inbox,
  Compass,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { EnterpriseGate } from '../components/EnterpriseGate'
import { ChatMarkBadges } from '../components/ChatMark'
import {
  SLOTS,
  slotColor,
  type ChatMark,
  type SlotKey,
} from '../lib/chatmarks'

/* ----------------------------------------------------------- Types & helpers */

type EnrichedMark = ChatMark & {
  character: {
    id: number
    name: string
    avatar: string
    category: string
    tagline: string
  } | null
  messageCount: number
  lastActivity: string | null
  preview: string
}

const UNSORTED = '__unsorted__'

function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const then = new Date(dateStr).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  if (diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  const yr = Math.floor(day / 365)
  return `${yr}y ago`
}

/* --------------------------------------------------------------- Thread card */

function ThreadCard({ mark }: { mark: EnrichedMark }) {
  const [open, setOpen] = useState(false)
  const character = mark.character
  const title = (mark.title || '').trim() || character?.name || 'Untitled thread'
  const subtitle = character ? (character.tagline || character.category) : 'Character unavailable'
  const hasDetail = Boolean((mark.preview || '').trim() || (mark.note || '').trim())

  return (
    <div
      className="animate-fade-in"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Card head */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', padding: '0.95rem 1rem' }}>
        {/* Avatar tile */}
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(124,92,191,0.2), rgba(79,70,229,0.2))',
            border: '1px solid rgba(124,92,191,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            flexShrink: 0,
          }}
        >
          {character?.avatar || '💬'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  marginTop: '0.1rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {character ? character.name : title} · {subtitle}
              </p>
            </div>

            {/* Collapse toggle */}
            {hasDetail && (
              <button
                onClick={() => setOpen((v) => !v)}
                title={open ? 'Hide details' : 'Show details'}
                aria-label={open ? 'Hide details' : 'Show details'}
                aria-expanded={open}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.3rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            )}
          </div>

          {/* All three slot badges */}
          <div style={{ marginTop: '0.6rem' }}>
            <ChatMarkBadges mark={mark} size="sm" emptyLabel="Untagged thread" />
          </div>

          {/* Meta row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              marginTop: '0.6rem',
              fontSize: '0.74rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <MessageCircle size={12} />
              {mark.messageCount} {mark.messageCount === 1 ? 'message' : 'messages'}
            </span>
            {mark.lastActivity && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <Clock size={12} />
                {formatRelative(mark.lastActivity)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable detail */}
      {open && hasDetail && (
        <div
          className="animate-fade-in"
          style={{
            padding: '0 1rem 0.5rem 1rem',
            borderTop: '1px solid var(--border)',
            paddingTop: '0.75rem',
            marginTop: '-0.1rem',
          }}
        >
          {(mark.preview || '').trim() && (
            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                fontStyle: 'italic',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {mark.preview}
            </p>
          )}
          {(mark.note || '').trim() && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
                lineHeight: 1.5,
                marginTop: (mark.preview || '').trim() ? '0.6rem' : 0,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.5rem 0.7rem',
              }}
            >
              {mark.note}
            </p>
          )}
        </div>
      )}

      {/* Actions row */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.6rem 1rem 0.85rem',
          flexWrap: 'wrap',
        }}
      >
        {character ? (
          <Link
            to="/chat/$id"
            params={{ id: String(character.id) }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.85rem',
              borderRadius: 9,
              background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
              color: 'white',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            <MessageCircle size={14} />
            Open chat
          </Link>
        ) : (
          <span
            title="Character is no longer available"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.85rem',
              borderRadius: 9,
              background: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'not-allowed',
              opacity: 0.7,
            }}
          >
            <MessageCircle size={14} />
            Open chat
          </span>
        )}
        <Link
          to="/filechat"
          search={{ open: String(mark.conversationId) }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.85rem',
            borderRadius: 9,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          <ExternalLink size={14} />
          View in FileChat
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Group section */

function GroupSection({
  slotKey,
  value,
  marks,
  defaultOpen,
}: {
  slotKey: SlotKey
  value: string
  marks: EnrichedMark[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isUnsorted = value === UNSORTED
  const slot = SLOTS.find((s) => s.key === slotKey)!
  const color = isUnsorted ? null : slotColor(slotKey, value)

  const headBg = color ? color.bg : 'var(--bg-secondary)'
  const headBorder = color ? color.border : 'var(--border)'
  const headText = color ? color.text : 'var(--text-secondary)'

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: '0.7rem 0.95rem',
          borderRadius: 12,
          border: `1px solid ${headBorder}`,
          background: headBg,
          cursor: 'pointer',
          textAlign: 'left',
          position: 'sticky',
          top: 8,
          zIndex: 2,
          backdropFilter: 'blur(8px)',
        }}
      >
        <span style={{ display: 'flex', color: headText, flexShrink: 0 }}>
          {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </span>
        {isUnsorted ? (
          <span style={{ fontSize: '0.95rem', flexShrink: 0, opacity: 0.7 }}>⚪</span>
        ) : (
          <span style={{ fontSize: '0.95rem', flexShrink: 0 }}>{slot.emoji}</span>
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '0.9rem',
            fontWeight: 700,
            color: isUnsorted ? 'var(--text-secondary)' : headText,
            fontStyle: isUnsorted ? 'italic' : 'normal',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {isUnsorted ? '— Unsorted in this view —' : value}
        </span>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            padding: '0.1rem 0.55rem',
            borderRadius: 999,
            background: color ? 'rgba(0,0,0,0.25)' : 'var(--bg-hover)',
            border: `1px solid ${headBorder}`,
            color: isUnsorted ? 'var(--text-secondary)' : headText,
            flexShrink: 0,
          }}
        >
          {marks.length}
        </span>
      </button>

      {open && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '0.85rem',
            marginTop: '0.85rem',
          }}
        >
          {marks.map((m) => (
            <ThreadCard key={m.conversationId} mark={m} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- Group-by control */

function GroupBySwitcher({
  active,
  onChange,
}: {
  active: SlotKey
  onChange: (k: SlotKey) => void
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: '0.3rem',
        padding: '0.3rem',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        flexWrap: 'wrap',
      }}
      role="tablist"
      aria-label="Group threads by"
    >
      {SLOTS.map((slot) => {
        const isActive = active === slot.key
        return (
          <button
            key={slot.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(slot.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.95rem',
              borderRadius: 9,
              border: '1px solid',
              borderColor: isActive ? 'var(--accent)' : 'transparent',
              background: isActive ? 'rgba(124,92,191,0.2)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '0.9rem' }}>{slot.emoji}</span>
            {slot.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ Stat pill */

function StatPill({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: color || 'var(--text-primary)' }}>{value}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  )
}

/* --------------------------------------------------------------- Empty state */

function EmptyState() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '3.5rem 1.5rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          margin: '0 auto 1.25rem',
          background: 'linear-gradient(135deg, rgba(124,92,191,0.2), rgba(79,70,229,0.2))',
          border: '1px solid rgba(124,92,191,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-light)',
        }}
      >
        <Inbox size={28} />
      </div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
        Nothing filed yet
      </h2>
      <p
        style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          maxWidth: 440,
          margin: '0 auto 1.5rem',
        }}
      >
        Open any chat, hit the 🔖 bookmark, and tag it by Character, Job or Division.
        Marked threads land here as filed assets — everything else stays an ephemeral sandbox.
      </p>
      <Link
        to="/discover"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.7rem 1.5rem',
          borderRadius: 10,
          background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
          color: 'white',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '0.9rem',
        }}
      >
        <Compass size={16} />
        Find a character
      </Link>
    </div>
  )
}

/* ----------------------------------------------------------------- Page */

function CabinetPage() {
  const [marks, setMarks] = useState<EnrichedMark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [groupBy, setGroupBy] = useState<SlotKey>('characterTag')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sessionId = getSessionId()
    setLoading(true)
    setError(false)
    fetch(`/api/chatmarks?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        setMarks(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  // Stats: distinct values per slot.
  const stats = useMemo(() => {
    const sets: Record<SlotKey, Set<string>> = {
      characterTag: new Set(),
      jobTag: new Set(),
      divisionTag: new Set(),
    }
    for (const m of marks) {
      for (const slot of SLOTS) {
        const v = ((m[slot.key] as string) || '').trim()
        if (v) sets[slot.key].add(v.toLowerCase())
      }
    }
    return {
      total: marks.length,
      characterTag: sets.characterTag.size,
      jobTag: sets.jobTag.size,
      divisionTag: sets.divisionTag.size,
    }
  }, [marks])

  // Build groups for the active slot. Preserves first-seen value casing.
  const groups = useMemo(() => {
    const byValue = new Map<string, { display: string; items: EnrichedMark[] }>()
    for (const m of marks) {
      const raw = ((m[groupBy] as string) || '').trim()
      const key = raw ? raw.toLowerCase() : UNSORTED
      const existing = byValue.get(key)
      if (existing) {
        existing.items.push(m)
      } else {
        byValue.set(key, { display: raw || UNSORTED, items: [m] })
      }
    }
    const sorted = [...byValue.entries()]
      .filter(([k]) => k !== UNSORTED)
      .sort((a, b) => {
        // Larger groups first, then alphabetical.
        if (b[1].items.length !== a[1].items.length) return b[1].items.length - a[1].items.length
        return a[1].display.localeCompare(b[1].display)
      })
    const unsorted = byValue.get(UNSORTED)
    if (unsorted) sorted.push([UNSORTED, unsorted])
    return sorted
  }, [marks, groupBy])

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,92,191,0.13), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.75rem 1.25rem 1.5rem', position: 'relative' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 0.9rem',
              borderRadius: 999,
              background: 'rgba(124,92,191,0.15)',
              border: '1px solid rgba(124,92,191,0.3)',
              color: 'var(--accent-light)',
              fontSize: '0.78rem',
              fontWeight: 500,
              marginBottom: '1rem',
            }}
          >
            <Archive size={13} />
            Active workspace
          </div>
          <h1
            style={{
              fontSize: 'clamp(1.8rem, 4vw, 2.75rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              color: 'var(--text-primary)',
              marginBottom: '0.75rem',
            }}
          >
            Chat<span className="gradient-text">Cabinet</span>
          </h1>
          <p style={{ fontSize: 'clamp(0.95rem, 2vw, 1.1rem)', color: 'var(--text-secondary)', maxWidth: 560, lineHeight: 1.6 }}>
            Your active workspace — every marked thread, organized as you go.
          </p>

          {/* Stats strip */}
          {!loading && !error && marks.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '1.75rem',
                flexWrap: 'wrap',
                marginTop: '1.5rem',
                padding: '1rem 1.5rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
              }}
            >
              <StatPill label="Filed threads" value={stats.total} />
              <StatPill label="🔵 Character tags" value={stats.characterTag} />
              <StatPill label="🟡 Job tags" value={stats.jobTag} />
              <StatPill label="🟣 Division tags" value={stats.divisionTag} />
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0.5rem 1.25rem 4rem' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1.5rem' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 120,
                  borderRadius: 14,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
            <p style={{ fontSize: '0.95rem' }}>Couldn&apos;t load your cabinet right now. Please refresh to try again.</p>
          </div>
        ) : marks.length === 0 ? (
          <div style={{ marginTop: '1rem' }}>
            <EmptyState />
          </div>
        ) : (
          <>
            {/* Group-by switcher */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
                marginTop: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                <FolderOpen size={15} />
                Group by
              </span>
              <GroupBySwitcher active={groupBy} onChange={setGroupBy} />
            </div>

            {/* Groups */}
            {groups.map(([key, group]) => (
              <GroupSection
                key={`${groupBy}:${key}`}
                slotKey={groupBy}
                value={group.display}
                marks={group.items}
                defaultOpen
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/cabinet')({
  component: () => (
    <EnterpriseGate surface="ChatCabinet">
      <CabinetPage />
    </EnterpriseGate>
  ),
})
