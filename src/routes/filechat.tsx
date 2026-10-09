import { useState, useEffect, useRef, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Search,
  Archive,
  X,
  FileText,
  MessageCircle,
  ArrowRight,
  Loader2,
  ChevronDown,
  Filter,
  Compass,
  Scissors,
  AlertTriangle,
  ShieldCheck,
  Lock,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import { getSessionId } from '../lib/create-ui'
import { EnterpriseGate } from '../components/EnterpriseGate'
import { ChatMarkBadges } from '../components/ChatMark'
import { SLOTS, slotColor, type ChatMark, type SlotKey } from '../lib/chatmarks'
import { getRole } from '../lib/enterprise'
import { accessDef, DEFAULT_WORKSPACE, type FileChatAccess } from '../lib/audit'

/* ----------------------------------------------------------------- types */

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

type DocCharacter = {
  id: number
  name: string
  avatar: string
  category: string
  tagline: string
  greeting?: string
}

type DocMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  speakerCharacterId?: number | null
}

type DocPayload = {
  mark: ChatMark | null
  character: DocCharacter | null
  messages: DocMessage[]
  messageCount: number
}

/* ----------------------------------------------------------------- helpers */

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

/* A distinct character entry derived from the unfiltered mark corpus. */
type CharacterOption = { id: number; name: string; avatar: string }

/* The active filter state for the three tag slots + character. */
type Filters = {
  characterTag: string
  jobTag: string
  divisionTag: string
  characterId: string
}

const EMPTY_FILTERS: Filters = {
  characterTag: '',
  jobTag: '',
  divisionTag: '',
  characterId: '',
}

/* ----------------------------------------------------------------- avatar */

function Avatar({ avatar, size = 44 }: { avatar?: string | null; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'linear-gradient(135deg, rgba(124,92,191,0.25), rgba(79,70,229,0.25))',
        border: '1px solid rgba(124,92,191,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        flexShrink: 0,
      }}
    >
      {avatar || '🗂️'}
    </div>
  )
}

/* --------------------------------------------------------- slot filter menu */

function SlotFilter({
  slotKey,
  values,
  selected,
  onSelect,
}: {
  slotKey: SlotKey
  values: string[]
  selected: string
  onSelect: (v: string) => void
}) {
  const slot = SLOTS.find((s) => s.key === slotKey)!
  const [open, setOpen] = useState(false)
  const disabled = values.length === 0
  const active = Boolean(selected)
  const color = active ? slotColor(slotKey, selected) : null

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? `No ${slot.label} tags filed yet` : `Filter by ${slot.label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.45rem 0.75rem',
          borderRadius: 10,
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: active && color ? color.bg : 'var(--bg-card)',
          border: `1px solid ${active && color ? color.border : 'var(--border)'}`,
          color: active && color ? color.text : 'var(--text-secondary)',
          opacity: disabled ? 0.45 : 1,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>{slot.emoji}</span>
        {active ? selected : slot.label}
        <ChevronDown size={13} style={{ opacity: 0.7 }} />
      </button>
      {open && !disabled && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              zIndex: 41,
              minWidth: 200,
              maxHeight: 320,
              overflowY: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '0.4rem',
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div
              style={{
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                padding: '0.35rem 0.55rem 0.45rem',
                fontWeight: 700,
              }}
            >
              {slot.emoji} {slot.label}
            </div>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  onSelect('')
                  setOpen(false)
                }}
                style={menuItemStyle(false)}
              >
                <X size={13} /> Clear {slot.label}
              </button>
            )}
            {values.map((v) => {
              const isSel = v === selected
              const c = slotColor(slotKey, v)
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    onSelect(isSel ? '' : v)
                    setOpen(false)
                  }}
                  style={menuItemStyle(isSel)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: c.dot,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function menuItemStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.45rem 0.55rem',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: active ? 700 : 500,
    background: active ? 'var(--bg-hover)' : 'none',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    textAlign: 'left',
  }
}

/* ----------------------------------------------------- character filter menu */

function CharacterFilter({
  characters,
  selected,
  onSelect,
}: {
  characters: CharacterOption[]
  selected: string
  onSelect: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const disabled = characters.length === 0
  const active = Boolean(selected)
  const current = characters.find((c) => String(c.id) === selected)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? 'No characters filed yet' : 'Filter by character'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.45rem 0.75rem',
          borderRadius: 10,
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: active ? 'rgba(124,92,191,0.18)' : 'var(--bg-card)',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
          color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
          opacity: disabled ? 0.45 : 1,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {current ? (
          <span style={{ fontSize: '0.9rem' }}>{current.avatar}</span>
        ) : (
          <MessageCircle size={14} />
        )}
        {current ? current.name : 'Character'}
        <ChevronDown size={13} style={{ opacity: 0.7 }} />
      </button>
      {open && !disabled && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              zIndex: 41,
              minWidth: 220,
              maxHeight: 320,
              overflowY: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '0.4rem',
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div
              style={{
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                padding: '0.35rem 0.55rem 0.45rem',
                fontWeight: 700,
              }}
            >
              Character
            </div>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  onSelect('')
                  setOpen(false)
                }}
                style={menuItemStyle(false)}
              >
                <X size={13} /> Clear character
              </button>
            )}
            {characters.map((c) => {
              const isSel = String(c.id) === selected
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(isSel ? '' : String(c.id))
                    setOpen(false)
                  }}
                  style={menuItemStyle(isSel)}
                >
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>{c.avatar}</span>
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- result card */

function DocumentTile({ mark, onOpen }: { mark: EnrichedMark; onOpen: () => void }) {
  const char = mark.character
  const title = (mark.title && mark.title.trim()) || char?.name || 'Untitled thread'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="character-card animate-fade-in"
      style={{
        textAlign: 'left',
        width: '100%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '1.1rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        height: '100%',
        color: 'inherit',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--accent)'
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = '0 8px 24px rgba(124,92,191,0.15)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--border)'
        el.style.transform = 'translateY(0)'
        el.style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <Avatar avatar={char?.avatar} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.15rem',
            }}
          >
            <span
              style={{
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {char?.name || 'Unknown character'}
            </span>
            {char?.category && (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  padding: '0.1rem 0.45rem',
                  borderRadius: 999,
                  background: 'rgba(124,92,191,0.15)',
                  color: 'var(--accent-light)',
                  border: '1px solid rgba(124,92,191,0.25)',
                  flexShrink: 0,
                }}
              >
                {char.category}
              </span>
            )}
          </div>
          <h3
            style={{
              fontSize: '0.98rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </h3>
        </div>
      </div>

      <ChatMarkBadges mark={mark} size="sm" />

      {mark.preview && (
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {mark.preview}
        </p>
      )}

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          paddingTop: '0.25rem',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <MessageCircle size={12} />
          {mark.messageCount} {mark.messageCount === 1 ? 'message' : 'messages'}
        </span>
        {mark.lastActivity && <span>{formatRelative(mark.lastActivity)}</span>}
      </div>
    </button>
  )
}

/* ----------------------------------------------------------- document view */

function DocumentDrawer({
  conversationId,
  onClose,
  onTrimmed,
}: {
  conversationId: number
  onClose: () => void
  onTrimmed?: () => void
}) {
  const [doc, setDoc] = useState<DocPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Trim state: the message id whose trailing messages are about to be trimmed.
  const [trimMode, setTrimMode] = useState(false)
  const [pendingTrim, setPendingTrim] = useState<number | null>(null)
  const [trimReason, setTrimReason] = useState('')
  const [trimming, setTrimming] = useState(false)

  const loadDoc = useCallback(() => {
    setLoading(true)
    setFailed(false)
    const sessionId = getSessionId()
    return fetch(`/api/chatmarks/${conversationId}?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then((data: DocPayload) => {
        setDoc(data)
        setLoading(false)
      })
      .catch(() => {
        setFailed(true)
        setLoading(false)
      })
  }, [conversationId])

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setTrimMode(false)
    setPendingTrim(null)
    const sessionId = getSessionId()
    setLoading(true)
    setFailed(false)
    fetch(`/api/chatmarks/${conversationId}?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then((data: DocPayload) => {
        if (cancelled) return
        setDoc(data)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const char = doc?.character || null
  const mark = doc?.mark || null
  const messages = doc?.messages || []
  const note = (mark?.note || '').trim()

  // How many messages would be trimmed if we revert to `pendingTrim`.
  const pendingIndex = pendingTrim != null ? messages.findIndex((m) => m.id === pendingTrim) : -1
  const wouldTrim = pendingIndex >= 0 ? messages.length - pendingIndex - 1 : 0

  const runTrim = async () => {
    if (pendingTrim == null || trimming) return
    setTrimming(true)
    try {
      const res = await fetch('/api/trims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          keepMessageId: pendingTrim,
          sessionId: getSessionId(),
          reason: trimReason.trim(),
        }),
      })
      if (res.ok) {
        setPendingTrim(null)
        setTrimReason('')
        setTrimMode(false)
        await loadDoc()
        onTrimmed?.()
      }
    } finally {
      setTrimming(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="animate-fade-in"
        style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,10,0.65)', backdropFilter: 'blur(2px)' }}
      />
      {/* Panel */}
      <div
        className="cv-doc-drawer"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(640px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.875rem',
            flexShrink: 0,
            background: 'var(--bg-secondary)',
          }}
        >
          <Avatar avatar={char?.avatar} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontWeight: 700,
                fontSize: '0.98rem',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {(mark?.title && mark.title.trim()) || char?.name || 'Filed thread'}
            </p>
            <p
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {char ? `${char.name}${char.category ? ` · ${char.category}` : ''}` : 'Archived document'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close document"
            aria-label="Close document"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.4rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Trim toolbar — the quality-control gate before FileChat permanence */}
        {!loading && !failed && messages.length > 1 && (
          <div
            style={{
              padding: '0.6rem 1.25rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              flexShrink: 0,
              background: trimMode ? 'rgba(251,191,36,0.06)' : 'transparent',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTrimMode((v) => !v)
                setPendingTrim(null)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '0.4rem 0.8rem',
                borderRadius: 8,
                cursor: 'pointer',
                flexShrink: 0,
                background: trimMode ? 'rgba(251,191,36,0.15)' : 'var(--bg-card)',
                border: `1px solid ${trimMode ? 'rgba(251,191,36,0.45)' : 'var(--border)'}`,
                color: trimMode ? '#fbbf24' : 'var(--text-secondary)',
              }}
            >
              <Scissors size={14} /> {trimMode ? 'Cancel trim' : 'Revert & trim'}
            </button>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {trimMode
                ? 'Pick the last good message — everything after it moves to the audit trail.'
                : 'Trim hallucinations before this thread becomes institutional knowledge.'}
            </span>
          </div>
        )}
        {(mark || note) && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              flexShrink: 0,
            }}
          >
            <ChatMarkBadges mark={mark} size="sm" emptyLabel="No tags on this thread" />
            {note && (
              <p
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.55,
                  margin: 0,
                  fontStyle: 'italic',
                  borderLeft: '2px solid var(--accent)',
                  paddingLeft: '0.7rem',
                }}
              >
                {note}
              </p>
            )}
          </div>
        )}

        {/* Transcript */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.25rem' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              <Loader2 size={22} className="spin" />
              <span style={{ fontSize: '0.85rem' }}>Opening document…</span>
            </div>
          ) : failed ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📄</div>
              <p style={{ fontSize: '0.95rem' }}>This document could not be loaded.</p>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💬</div>
              <p style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>This thread has no messages yet.</p>
              <p style={{ fontSize: '0.8rem' }}>Continue it to start building the record.</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <TranscriptBubble
                key={msg.id}
                message={msg}
                avatar={char?.avatar}
                trimMode={trimMode}
                isLast={i === messages.length - 1}
                selected={pendingTrim === msg.id}
                trailing={messages.length - i - 1}
                onPick={() => setPendingTrim(msg.id)}
              />
            ))
          )}
        </div>

        {/* Trim confirmation */}
        {trimMode && pendingTrim != null && wouldTrim > 0 && (
          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderTop: '1px solid rgba(251,191,36,0.4)',
              background: 'rgba(251,191,36,0.07)',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#fbbf24', fontWeight: 700 }}>
              <AlertTriangle size={15} />
              Trim {wouldTrim} {wouldTrim === 1 ? 'message' : 'messages'} after this point
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              The trimmed content stays visible to the boss and auditors in the Audit Dashboard — staff see
              only the clean thread.
            </p>
            <input
              value={trimReason}
              onChange={(e) => setTrimReason(e.target.value)}
              placeholder="Reason (optional) — e.g. character started hallucinating"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.5rem 0.7rem',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={runTrim}
                disabled={trimming}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.55rem 1rem',
                  borderRadius: 9,
                  border: 'none',
                  cursor: trimming ? 'wait' : 'pointer',
                  background: 'linear-gradient(135deg, #d97706, #b45309)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                {trimming ? <Loader2 size={14} className="spin" /> : <Scissors size={14} />}
                Trim & file clean
              </button>
              <button
                type="button"
                onClick={() => setPendingTrim(null)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: 9,
                  border: '1px solid var(--border)',
                  background: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {char && (
          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              background: 'var(--bg-secondary)',
            }}
          >
            <Link
              to="/chat/$id"
              params={{ id: String(char.id) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.7rem',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                color: 'white',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              Continue this thread
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function TranscriptBubble({
  message,
  avatar,
  trimMode,
  isLast,
  selected,
  trailing,
  onPick,
}: {
  message: DocMessage
  avatar?: string | null
  trimMode?: boolean
  isLast?: boolean
  selected?: boolean
  trailing?: number
  onPick?: () => void
}) {
  const isUser = message.role === 'user'
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-end',
        marginBottom: trimMode ? '0.4rem' : '1.1rem',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: isUser
            ? 'linear-gradient(135deg, #4f46e5, #7c5cbf)'
            : 'linear-gradient(135deg, rgba(124,92,191,0.25), rgba(79,70,229,0.25))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isUser ? '0.72rem' : '1rem',
          fontWeight: 700,
          color: 'white',
          flexShrink: 0,
        }}
      >
        {isUser ? 'You' : avatar || '🤖'}
      </div>
      <div
        style={{
          maxWidth: '78%',
          background: isUser ? 'linear-gradient(135deg, #4f46e5, #6d28d9)' : 'var(--bg-card)',
          border: isUser ? 'none' : '1px solid var(--border)',
          borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
          padding: '0.8rem 1rem',
          color: 'var(--text-primary)',
          fontSize: '0.88rem',
          lineHeight: 1.6,
          outline: selected ? '2px solid #fbbf24' : 'none',
        }}
      >
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
        ) : (
          <div className="prose">
            <Streamdown>{message.content}</Streamdown>
          </div>
        )}
      </div>
      {/* In trim mode, every message except the last offers "revert to here". */}
      {trimMode && !isLast && (
        <button
          type="button"
          onClick={onPick}
          title={`Revert here — trim ${trailing} after`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            alignSelf: 'center',
            flexShrink: 0,
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '0.3rem 0.55rem',
            borderRadius: 999,
            cursor: 'pointer',
            background: selected ? 'rgba(251,191,36,0.2)' : 'var(--bg-secondary)',
            border: `1px solid ${selected ? 'rgba(251,191,36,0.5)' : 'var(--border)'}`,
            color: selected ? '#fbbf24' : 'var(--text-secondary)',
          }}
        >
          <Scissors size={12} /> {selected ? 'selected' : 'revert here'}
        </button>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- chip row */

function ActiveChip({
  label,
  color,
  onRemove,
}: {
  label: React.ReactNode
  color: { bg: string; border: string; text: string; dot?: string } | null
  onRemove: () => void
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.25rem 0.4rem 0.25rem 0.6rem',
        borderRadius: 999,
        fontSize: '0.74rem',
        fontWeight: 600,
        background: color ? color.bg : 'rgba(124,92,191,0.18)',
        border: `1px solid ${color ? color.border : 'var(--accent)'}`,
        color: color ? color.text : 'var(--accent-light)',
      }}
    >
      {color?.dot && (
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color.dot, flexShrink: 0 }} />
      )}
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: 0,
          opacity: 0.8,
        }}
      >
        <X size={13} />
      </button>
    </span>
  )
}

/* ----------------------------------------------------------- page */

function FileChatPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const [mounted, setMounted] = useState(false)
  const [allMarks, setAllMarks] = useState<EnrichedMark[]>([])
  const [corpusLoaded, setCorpusLoaded] = useState(false)

  const [results, setResults] = useState<EnrichedMark[]>([])
  const [loading, setLoading] = useState(true)

  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const [openId, setOpenId] = useState<number | null>(
    typeof search.open === 'string' && search.open ? Number(search.open) || null : null,
  )

  // FileChat access is the boss's lever. When the workspace is "closed", staff
  // are locked out and only the boss/auditors review.
  const [access, setAccess] = useState<FileChatAccess>('open')
  const [isBoss, setIsBoss] = useState(false)

  // First client paint guard (session lives in localStorage).
  useEffect(() => {
    setMounted(true)
    setIsBoss(getRole() === 'boss')
    fetch(`/api/audit?workspaceId=${DEFAULT_WORKSPACE}`)
      .then((r) => r.json())
      .then((d) => d?.settings?.fileChatAccess && setAccess(d.settings.fileChatAccess))
      .catch(() => {})
  }, [])

  // Load the full unfiltered corpus once to derive distinct filter values.
  useEffect(() => {
    if (!mounted) return
    const sessionId = getSessionId()
    fetch(`/api/chatmarks?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        setAllMarks(Array.isArray(data) ? data : [])
        setCorpusLoaded(true)
      })
      .catch(() => {
        setAllMarks([])
        setCorpusLoaded(true)
      })
  }, [mounted])

  // Debounce the search input -> query (~300ms).
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Fetch results whenever query/filters change.
  const reqRef = useRef(0)
  useEffect(() => {
    if (!mounted) return
    const myReq = ++reqRef.current
    setLoading(true)
    const sessionId = getSessionId()
    const params = new URLSearchParams({ sessionId })
    if (query) params.set('q', query)
    if (filters.characterTag) params.set('characterTag', filters.characterTag)
    if (filters.jobTag) params.set('jobTag', filters.jobTag)
    if (filters.divisionTag) params.set('divisionTag', filters.divisionTag)
    if (filters.characterId) params.set('characterId', filters.characterId)

    fetch(`/api/chatmarks?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (myReq !== reqRef.current) return
        setResults(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        if (myReq !== reqRef.current) return
        setResults([])
        setLoading(false)
      })
  }, [mounted, query, filters])

  // Derive distinct slot values + characters from the unfiltered corpus.
  const slotValues = useCallback(
    (key: SlotKey): string[] => {
      const set = new Set<string>()
      for (const m of allMarks) {
        const v = ((m[key] as string) || '').trim()
        if (v) set.add(v)
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    },
    [allMarks],
  )

  const characterOptions: CharacterOption[] = (() => {
    const map = new Map<number, CharacterOption>()
    for (const m of allMarks) {
      if (m.character && !map.has(m.character.id)) {
        map.set(m.character.id, { id: m.character.id, name: m.character.name, avatar: m.character.avatar })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }))

  const anyActive =
    Boolean(query) ||
    Boolean(filters.characterTag) ||
    Boolean(filters.jobTag) ||
    Boolean(filters.divisionTag) ||
    Boolean(filters.characterId)

  const clearAll = () => {
    setSearchInput('')
    setQuery('')
    setFilters(EMPTY_FILTERS)
  }

  const openDoc = (id: number) => {
    setOpenId(id)
    navigate({ search: (prev: any) => ({ ...prev, open: String(id) }), replace: true }).catch(() => {})
  }
  const closeDoc = () => {
    setOpenId(null)
    navigate({ search: (prev: any) => ({ ...prev, open: undefined }), replace: true }).catch(() => {})
  }

  const selectedChar = characterOptions.find((c) => String(c.id) === filters.characterId)
  const hasCorpus = allMarks.length > 0

  /* ---- render ---- */

  const showFirstPaint = !mounted || (!corpusLoaded && loading)

  // Closed workspace: staff are locked out; only the boss/auditors review.
  if (mounted && access === 'closed' && !isBoss) {
    return <FileChatLocked />
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Hero */}
      <div style={{ padding: '3rem 1.25rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,92,191,0.13), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto' }}>
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
            The persistent archive
          </div>
          <h1
            style={{
              fontSize: 'clamp(1.9rem, 4vw, 2.9rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: '0.75rem',
              color: 'var(--text-primary)',
            }}
          >
            <span className="gradient-text">FileChat</span>
          </h1>
          <p
            style={{
              fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
              color: 'var(--text-secondary)',
              maxWidth: 620,
              lineHeight: 1.6,
            }}
          >
            Institutional memory — search and organize every conversation you've filed.
          </p>
          {mounted && access !== 'open' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '1rem',
                padding: '0.4rem 0.85rem',
                borderRadius: 999,
                background: 'rgba(124,92,191,0.12)',
                border: '1px solid rgba(124,92,191,0.3)',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={13} color="var(--accent-light)" />
              FileChat access: {accessDef(access).label}
              {isBoss && access === 'hybrid' ? ' · full audit access' : ''}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.25rem 4rem' }}>
        {/* Search bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '0.7rem 1rem',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <Search size={18} color="var(--text-secondary)" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search threads, characters, and message content…"
            aria-label="Search filed threads"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.92rem',
            }}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            marginBottom: anyActive ? '0.85rem' : '1.5rem',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              marginRight: '0.15rem',
            }}
          >
            <Filter size={14} />
            Lens
          </span>
          <SlotFilter
            slotKey="characterTag"
            values={slotValues('characterTag')}
            selected={filters.characterTag}
            onSelect={(v) => setFilter('characterTag', v)}
          />
          <SlotFilter
            slotKey="jobTag"
            values={slotValues('jobTag')}
            selected={filters.jobTag}
            onSelect={(v) => setFilter('jobTag', v)}
          />
          <SlotFilter
            slotKey="divisionTag"
            values={slotValues('divisionTag')}
            selected={filters.divisionTag}
            onSelect={(v) => setFilter('divisionTag', v)}
          />
          <CharacterFilter
            characters={characterOptions}
            selected={filters.characterId}
            onSelect={(v) => setFilter('characterId', v)}
          />
        </div>

        {/* Active filter chips */}
        {anyActive && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '1.5rem',
            }}
          >
            {query && (
              <ActiveChip
                label={
                  <>
                    <span style={{ opacity: 0.7 }}>search:</span> {query}
                  </>
                }
                color={null}
                onRemove={() => {
                  setSearchInput('')
                  setQuery('')
                }}
              />
            )}
            {(['characterTag', 'jobTag', 'divisionTag'] as SlotKey[]).map((key) => {
              const val = filters[key]
              if (!val) return null
              const slot = SLOTS.find((s) => s.key === key)!
              const c = slotColor(key, val)
              return (
                <ActiveChip
                  key={key}
                  label={
                    <>
                      {slot.emoji} {val}
                    </>
                  }
                  color={c}
                  onRemove={() => setFilter(key, '')}
                />
              )
            })}
            {selectedChar && (
              <ActiveChip
                label={
                  <>
                    {selectedChar.avatar} {selectedChar.name}
                  </>
                }
                color={null}
                onRemove={() => setFilter('characterId', '')}
              />
            )}
            <button
              type="button"
              onClick={clearAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.25rem 0.7rem',
                borderRadius: 999,
                fontSize: '0.74rem',
                fontWeight: 600,
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Result count */}
        {!showFirstPaint && hasCorpus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
            }}
          >
            <FileText size={14} />
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={13} className="spin" /> Searching…
              </span>
            ) : (
              <span>
                <strong style={{ color: 'var(--text-primary)' }}>{results.length}</strong>{' '}
                {results.length === 1 ? 'document' : 'documents'}
                {anyActive ? ' match your lens' : ' filed'}
              </span>
            )}
          </div>
        )}

        {/* Body */}
        {showFirstPaint ? (
          <SkeletonGrid />
        ) : !hasCorpus ? (
          <EmptyArchive />
        ) : results.length === 0 ? (
          <NoResults onClear={clearAll} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {results.map((mark) => (
              <DocumentTile key={mark.conversationId} mark={mark} onOpen={() => openDoc(mark.conversationId)} />
            ))}
          </div>
        )}
      </div>

      {openId !== null && (
        <DocumentDrawer
          conversationId={openId}
          onClose={closeDoc}
          onTrimmed={() => {
            // Refresh the corpus so trimmed message counts stay accurate.
            const sessionId = getSessionId()
            fetch(`/api/chatmarks?sessionId=${encodeURIComponent(sessionId)}`)
              .then((r) => r.json())
              .then((data) => setAllMarks(Array.isArray(data) ? data : []))
              .catch(() => {})
          }}
        />
      )}

      {/* Responsive helpers */}
      <style>{`
        @media (max-width: 640px) {
          .cv-doc-drawer { width: 100% !important; border-left: none !important; }
        }
      `}</style>
    </div>
  )
}

/* ----------------------------------------------------------- empty / skeleton */

function FileChatLocked() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '5rem 1.25rem', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(124,92,191,0.25), rgba(79,70,229,0.25))',
          border: '1px solid rgba(124,92,191,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
        }}
      >
        <Lock size={28} color="var(--accent-light)" />
      </div>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.6rem' }}>
        FileChat is <span className="gradient-text">closed</span> right now
      </h2>
      <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        Your workspace admin has temporarily locked FileChat search — a management lever to keep the team
        building independent problem-solving muscle rather than leaning on characters as a crutch. Your
        filed work is safe and the boss/auditors can still review it.
      </p>
      <Link
        to="/cabinet"
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
        Go to ChatCabinet
      </Link>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '1.1rem',
            height: 180,
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  )
}

function EmptyArchive() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '4rem 2rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        maxWidth: 540,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(124,92,191,0.25), rgba(79,70,229,0.25))',
          border: '1px solid rgba(124,92,191,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
        }}
      >
        <Archive size={28} color="var(--accent-light)" />
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
        Your archive is empty
      </h2>
      <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        FileChat is your institutional memory. Bookmark a conversation with a ChatMark — give it a
        title and tag it by Character, Job, or Division — and it becomes a searchable document here.
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
        Discover characters
      </Link>
    </div>
  )
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '3.5rem 2rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        maxWidth: 540,
        margin: '0 auto',
      }}
    >
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
        No filed threads match
      </h2>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        Try widening your filters or searching a different term.
      </p>
      <button
        type="button"
        onClick={onClear}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.6rem 1.3rem',
          borderRadius: 10,
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.88rem',
        }}
      >
        <X size={15} />
        Clear all filters
      </button>
    </div>
  )
}

/* ----------------------------------------------------------- route */

export const Route = createFileRoute('/filechat')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => {
    return typeof search.open === 'string' && search.open ? { open: search.open } : {}
  },
  component: () => (
    <EnterpriseGate surface="FileChat">
      <FileChatPage />
    </EnterpriseGate>
  ),
})
