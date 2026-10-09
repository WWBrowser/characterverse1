import { useState } from 'react'
import { Bookmark, BookmarkX, Check, Loader2 } from 'lucide-react'
import {
  SLOTS,
  markTags,
  markIsActive,
  type ChatMark,
  type SlotKey,
} from '../lib/chatmarks'

/**
 * The colored slot badges of a ChatMark — renders one pill per set slot.
 * Used everywhere a mark is shown: ChatCabinet cards, FileChat documents, chat header.
 */
export function ChatMarkBadges({
  mark,
  size = 'md',
  emptyLabel,
}: {
  mark: Partial<ChatMark> | null | undefined
  size?: 'sm' | 'md'
  emptyLabel?: string
}) {
  const tags = markTags(mark)
  if (tags.length === 0) {
    if (!emptyLabel) return null
    return (
      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        {emptyLabel}
      </span>
    )
  }
  const pad = size === 'sm' ? '0.1rem 0.45rem' : '0.2rem 0.6rem'
  const font = size === 'sm' ? '0.68rem' : '0.75rem'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
      {tags.map(({ slot, value, color }) => (
        <span
          key={slot.key}
          title={`${slot.description}: ${value}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: pad,
            borderRadius: 999,
            fontSize: font,
            fontWeight: 600,
            background: color.bg,
            border: `1px solid ${color.border}`,
            color: color.text,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color.dot,
              flexShrink: 0,
            }}
          />
          {value}
        </span>
      ))}
    </div>
  )
}

function SlotRow({
  slotKey,
  value,
  onChange,
}: {
  slotKey: SlotKey
  value: string
  onChange: (v: string) => void
}) {
  const slot = SLOTS.find((s) => s.key === slotKey)!
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.85rem' }}>{slot.emoji}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {slot.label}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>· {slot.description}</span>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Leave blank if it doesn't apply"
        style={{
          width: '100%',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.5rem 0.7rem',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
        {slot.suggestions.map((s) => {
          const active = value.trim().toLowerCase() === s.toLowerCase()
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(active ? '' : s)}
              style={{
                padding: '0.15rem 0.5rem',
                borderRadius: 999,
                fontSize: '0.7rem',
                cursor: 'pointer',
                background: active ? 'var(--accent)' : 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: active ? 'white' : 'var(--text-secondary)',
              }}
            >
              {s}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The three-slot ChatMark editor. Self-persisting: saving upserts the mark via
 * POST /api/chatmarks; removing it deletes via DELETE /api/chatmarks/$conversationId.
 * A mark with every slot, title and note empty is treated as "no mark" (sandbox).
 */
export function ChatMarkEditor({
  conversationId,
  characterId,
  sessionId,
  initial,
  onSaved,
  onClose,
}: {
  conversationId: number
  characterId: number
  sessionId: string
  initial?: ChatMark | null
  onSaved?: (mark: ChatMark | null) => void
  onClose?: () => void
}) {
  const [title, setTitle] = useState(initial?.title || '')
  const [note, setNote] = useState(initial?.note || '')
  const [characterTag, setCharacterTag] = useState(initial?.characterTag || '')
  const [jobTag, setJobTag] = useState(initial?.jobTag || '')
  const [divisionTag, setDivisionTag] = useState(initial?.divisionTag || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const wasMarked = markIsActive(initial)

  const draft = { title, note, characterTag, jobTag, divisionTag }
  const canSave = markIsActive(draft)

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/chatmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, characterId, sessionId, ...draft }),
      })
      const data = await res.json().catch(() => null)
      setSaved(true)
      onSaved?.(data?.mark ?? null)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  const unmark = async () => {
    if (saving) return
    setSaving(true)
    try {
      await fetch(`/api/chatmarks/${conversationId}?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      })
      setCharacterTag('')
      setJobTag('')
      setDivisionTag('')
      setTitle('')
      setNote('')
      onSaved?.(null)
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        width: 320,
        maxWidth: '90vw',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '1rem',
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Bookmark size={16} color="var(--accent-light)" />
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>ChatMark</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          Bookmark this thread
        </span>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Auth refactor session)"
        style={{
          width: '100%',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.5rem 0.7rem',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          outline: 'none',
          marginBottom: '0.85rem',
        }}
      />

      <SlotRow slotKey="characterTag" value={characterTag} onChange={setCharacterTag} />
      <SlotRow slotKey="jobTag" value={jobTag} onChange={setJobTag} />
      <SlotRow slotKey="divisionTag" value={divisionTag} onChange={setDivisionTag} />

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note…"
        rows={2}
        style={{
          width: '100%',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.5rem 0.7rem',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
          outline: 'none',
          resize: 'vertical',
          fontFamily: 'inherit',
          marginBottom: '0.85rem',
        }}
      />

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            padding: '0.55rem',
            borderRadius: 9,
            border: 'none',
            cursor: canSave && !saving ? 'pointer' : 'not-allowed',
            background: canSave ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
            color: canSave ? 'white' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          {saving ? <Loader2 size={15} className="spin" /> : saved ? <Check size={15} /> : <Bookmark size={15} />}
          {saved ? 'Saved' : wasMarked ? 'Update mark' : 'Save mark'}
        </button>
        {wasMarked && (
          <button
            type="button"
            onClick={unmark}
            disabled={saving}
            title="Remove mark (return to sandbox)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.55rem 0.75rem',
              borderRadius: 9,
              border: '1px solid var(--border)',
              cursor: 'pointer',
              background: 'none',
              color: '#fca5a5',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <BookmarkX size={15} />
            Unmark
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.6rem', lineHeight: 1.4 }}>
        Marked threads are filed in ChatCabinet & FileChat. Unmarked threads stay an
        ephemeral sandbox.
      </p>
    </div>
  )
}
