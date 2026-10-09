import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import { Brain, Pin, PinOff, Trash2, Plus, Sparkles, MessageSquarePlus, Wand2 } from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { MEMORY_SCOPES, SCOPE_LABELS, isModeId, type MemoryScope } from '../lib/modes'

type Memory = {
  id: number
  sessionId: string
  kind: string
  content: string
  source: string
  characterId: number | null
  scope: string
  confidence: number
  pinned: boolean
  createdAt: string
  updatedAt: string
}

const KINDS = ['preference', 'fact', 'goal', 'style', 'context'] as const
type Kind = (typeof KINDS)[number]

const KIND_META: Record<Kind, { label: string; hint: string; color: string }> = {
  preference: { label: 'Preference', hint: 'Something you like or want', color: '#a78bfa' },
  fact: { label: 'Fact', hint: 'Something true about you', color: '#60a5fa' },
  goal: { label: 'Goal', hint: 'Something you’re working toward', color: '#34d399' },
  style: { label: 'Style', hint: 'How you like answers', color: '#fbbf24' },
  context: { label: 'Context', hint: 'Useful background to keep in mind', color: '#f472b6' },
}

function kindMeta(kind: string) {
  return KIND_META[(kind as Kind)] ?? { label: kind, hint: '', color: 'var(--accent-light)' }
}

function MemoryPage() {
  const search = useSearch({ from: '/memory' })
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [kind, setKind] = useState<Kind>('preference')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  // Which lane is in view: 'all' shows everything, otherwise a single lane.
  const [tab, setTab] = useState<'all' | MemoryScope>(isModeId(search.scope) ? search.scope : 'all')

  const load = () => {
    const sessionId = getSessionId()
    fetch(`/api/memory?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        setMemories(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    const text = content.trim()
    if (!text || saving) return
    // On the "all" tab, hand-added memories land in the shared lane.
    const scope: MemoryScope = tab === 'all' ? 'general' : tab
    setSaving(true)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), kind, content: text, pinned, scope }),
      })
      if (res.ok) {
        const row = await res.json()
        setMemories((prev) => [row, ...prev])
        setContent('')
        setPinned(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const togglePin = async (m: Memory) => {
    setMemories((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: !x.pinned } : x)))
    await fetch(`/api/memory/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSessionId(), pinned: !m.pinned }),
    }).catch(() => load())
  }

  const forget = async (m: Memory) => {
    setMemories((prev) => prev.filter((x) => x.id !== m.id))
    await fetch(`/api/memory/${m.id}?sessionId=${encodeURIComponent(getSessionId())}`, {
      method: 'DELETE',
    }).catch(() => load())
  }

  const visible = useMemo(
    () => (tab === 'all' ? memories : memories.filter((m) => (m.scope || 'general') === tab)),
    [memories, tab],
  )
  const pinnedList = useMemo(() => visible.filter((m) => m.pinned), [visible])
  const rest = useMemo(() => visible.filter((m) => !m.pinned), [visible])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of memories) c[m.scope || 'general'] = (c[m.scope || 'general'] || 0) + 1
    return c
  }, [memories])

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2.5rem 1.25rem 4rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.6rem' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Brain size={22} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            What CharacterVerse <span className="gradient-text">remembers</span>
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Knows you better over time — the longer you work together, the more it gets you.
          </p>
        </div>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
        These notes travel with you into every conversation, so characters pick up where you left off. CharacterVerse adds to
        this automatically as you chat (try saying “remember that…”, “I prefer…”, or “my goal is…”), and you can curate it here
        anytime. Pin the ones that always matter.
      </p>

      {/* Lane tabs — memory is united, but separated per entrance. The Shared
          lane travels into every mode; each mode lane stays in its own door. */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
        {(['all', ...MEMORY_SCOPES] as const).map((t) => {
          const active = t === tab
          const label = t === 'all' ? 'All' : SCOPE_LABELS[t as MemoryScope]
          const n = t === 'all' ? memories.length : counts[t] || 0
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.85rem',
                borderRadius: 999,
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'var(--accent)' : 'var(--bg-card)',
                color: active ? 'white' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {label}
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{n}</span>
            </button>
          )
        })}
      </div>

      {/* Add memory */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.1rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
          <MessageSquarePlus size={16} color="var(--accent-light)" />
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>Teach it something</span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {KINDS.map((k) => {
            const active = k === kind
            const meta = KIND_META[k]
            return (
              <button
                key={k}
                onClick={() => setKind(k)}
                title={meta.hint}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: active ? meta.color : 'var(--border)',
                  background: active ? `${meta.color}22` : 'var(--bg-hover)',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {meta.label}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>{KIND_META[kind].hint}</p>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add()
            }}
            placeholder="e.g. I prefer concise answers with examples"
            rows={2}
            style={{
              flex: '1 1 260px',
              minWidth: 0,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '0.7rem 0.9rem',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setPinned((v) => !v)}
              title={pinned ? 'Will be pinned' : 'Pin this memory'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.6rem 0.8rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: pinned ? 'rgba(124,92,191,0.18)' : 'var(--bg-hover)',
                color: pinned ? 'var(--accent-light)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Pin size={14} fill={pinned ? 'currentColor' : 'none'} />
              Pin
            </button>
            <button
              onClick={add}
              disabled={!content.trim() || saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1rem',
                borderRadius: 10,
                border: 'none',
                background: content.trim() && !saving ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
                color: content.trim() && !saving ? 'white' : 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: content.trim() && !saving ? 'pointer' : 'not-allowed',
              }}
            >
              <Plus size={15} />
              Remember
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 56, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', opacity: 0.5 }} />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border)',
            borderRadius: 16,
          }}
        >
          <Sparkles size={28} color="var(--accent-light)" style={{ marginBottom: '0.75rem' }} />
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>Nothing remembered yet</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Add a note above, or start a conversation and CharacterVerse will begin learning your preferences.
          </p>
          <Link
            to="/ask"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1.1rem',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
              color: 'white',
              fontSize: '0.85rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Wand2 size={15} /> Start a conversation
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2.5rem 1.5rem',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border)',
            borderRadius: 16,
          }}
        >
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            This lane is empty
          </p>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
            {tab === 'general'
              ? 'Shared memory travels into every mode. Add one above, or it fills in as you chat anywhere.'
              : `Chat in ${tab === 'all' ? 'a mode' : SCOPE_LABELS[tab as MemoryScope].toLowerCase() + ' mode'} and it starts remembering here — separately from your other modes.`}
          </p>
        </div>
      ) : (
        <>
          {pinnedList.length > 0 && (
            <Section title="Pinned" subtitle="Always brought into every conversation">
              {pinnedList.map((m) => (
                <MemoryRow key={m.id} memory={m} onPin={togglePin} onForget={forget} />
              ))}
            </Section>
          )}
          <Section title={pinnedList.length > 0 ? 'Everything else' : 'Remembered'} subtitle={`${visible.length} item${visible.length === 1 ? '' : 's'}${tab === 'all' ? ' in memory' : ' in this lane'}`}>
            {rest.map((m) => (
              <MemoryRow key={m.id} memory={m} onPin={togglePin} onForget={forget} />
            ))}
            {rest.length === 0 && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0.5rem 0.2rem' }}>All memories are pinned.</p>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{subtitle}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>{children}</div>
    </div>
  )
}

function MemoryRow({
  memory,
  onPin,
  onForget,
}: {
  memory: Memory
  onPin: (m: Memory) => void
  onForget: (m: Memory) => void
}) {
  const meta = kindMeta(memory.kind)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '0.75rem 0.9rem',
      }}
    >
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          padding: '0.2rem 0.5rem',
          borderRadius: 6,
          background: `${meta.color}22`,
          color: meta.color,
          flexShrink: 0,
        }}
      >
        {meta.label}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{memory.content}</span>
      {memory.scope && memory.scope !== 'general' && (
        <span
          title={`${SCOPE_LABELS[memory.scope as MemoryScope] ?? memory.scope} lane`}
          style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--accent-light)', flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {SCOPE_LABELS[memory.scope as MemoryScope] ?? memory.scope}
        </span>
      )}
      {memory.source === 'chat' && (
        <span title="Learned automatically from a conversation" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          auto
        </span>
      )}
      <button
        onClick={() => onPin(memory)}
        title={memory.pinned ? 'Unpin' : 'Pin'}
        style={{ background: 'none', border: 'none', color: memory.pinned ? 'var(--accent-light)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexShrink: 0, padding: '0.2rem' }}
      >
        {memory.pinned ? <Pin size={15} fill="currentColor" /> : <PinOff size={15} />}
      </button>
      <button
        onClick={() => onForget(memory)}
        title="Forget this"
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexShrink: 0, padding: '0.2rem' }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

export const Route = createFileRoute('/memory')({
  validateSearch: (search: Record<string, unknown>): { scope?: string } => {
    const scope = typeof search.scope === 'string' ? search.scope : undefined
    return scope ? { scope } : {}
  },
  component: MemoryPage,
})
