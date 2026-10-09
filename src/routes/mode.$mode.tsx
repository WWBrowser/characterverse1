import { useState, useEffect, useRef, useCallback } from 'react'
import { createFileRoute, useParams, Link, useNavigate, redirect } from '@tanstack/react-router'
import {
  Drama,
  GraduationCap,
  Briefcase,
  BookText,
  Dices,
  Sparkles,
  ListChecks,
  Route as RouteIcon,
  Lightbulb,
  Target,
  PenLine,
  BarChart3,
  Megaphone,
  ArrowUp,
  ArrowLeft,
  Brain,
  Gauge,
  Moon,
  Activity,
  Wand2,
  RefreshCw,
  X,
  Aperture,
  Split,
  Focus,
} from 'lucide-react'
import { getSession } from '../lib/session'
import { getMode, MODES, type Mode } from '../lib/modes'

// lucide lookup so the icon keys in modes.ts stay dependency-free.
const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Aperture,
  Split,
  Focus,
  Drama,
  GraduationCap,
  Briefcase,
  BookText,
  Dices,
  Sparkles,
  ListChecks,
  Route: RouteIcon,
  Lightbulb,
  Target,
  PenLine,
  BarChart3,
  Megaphone,
}

function Icon({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  const C = ICONS[name] ?? Sparkles
  return <C size={size} color={color} />
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ScopedMemory = { id: number; kind: string; content: string; scope: string }
type Adopted = { id: number; name: string; avatar: string; category: string; tagline: string }

/* --------------------------------------------------- Sub-conscious depth readout */

// This workspace is the CONSCIOUS LAYER: explicit goal, task triggers, a visible
// surface. The character it is filtering has a SUB-CONSCIOUS LAYER underneath in
// /chat/$id — persona core, association graph, cadence — and a measured state
// (CAM, entropy, sleep phase) that the mode's prompt already reads on every turn.
// The panel below makes that link visible instead of implicit: this is what the
// substrate is currently mounted over.
type Vitals = {
  cam: number
  camLimit: number
  substrateShort: string
  substrateColor: string
  weights: { tone: number; association: number; sequencing: number }
  bands: { id: string; label: string; color: string; value: number }[]
  sleepEmoji: string
  sleepLabel: string
  timeToSleepMin: number
  cadence: string
  log: { tag: string; text: string }[]
}

function SubConsciousPanel({ characterId, name }: { characterId: number; name: string }) {
  const [v, setV] = useState<Vitals | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`/api/consciousness/${characterId}?sessionId=${encodeURIComponent(getSession())}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !d || d.error) return
          setV({
            cam: d.dynamics.cam,
            camLimit: d.model.camLimit,
            substrateShort: d.model.activeSubstrate.short,
            substrateColor: d.model.activeSubstrate.color,
            weights: d.model.activeSubstrate.weights,
            bands: d.dynamics.bands,
            sleepEmoji: d.dynamics.sleep.phaseEmoji,
            sleepLabel: d.dynamics.sleep.phaseLabel,
            timeToSleepMin: d.dynamics.sleep.timeToSleepMin,
            cadence: `${d.graph.cadence.register} · tempo ${d.graph.cadence.tempo}`,
            log: d.log.slice(0, 3),
          })
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 45_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [characterId])

  if (!v) return null
  const over = v.cam >= v.camLimit
  const camColor = over ? '#f87171' : v.cam >= 60 ? '#facc15' : '#22d3ee'

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 13,
        background: 'var(--bg-card)',
        padding: '0.8rem 0.85rem',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
        <Brain size={13} color="#a855f7" />
        <p style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', flex: 1 }}>
          Sub-conscious layer
        </p>
        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: v.substrateColor, fontFamily: 'ui-monospace, monospace' }}>{v.substrateShort}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Gauge size={13} color={camColor} />
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>CAM</span>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${v.cam}%`, height: '100%', background: camColor }} />
        </div>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem', fontWeight: 800, color: camColor }}>{v.cam}</span>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
        {v.bands.map((b) => (
          <span
            key={b.id}
            title={b.label}
            style={{
              flex: 1,
              fontSize: '0.62rem',
              fontFamily: 'ui-monospace, monospace',
              textAlign: 'center',
              padding: '0.2rem 0',
              borderRadius: 6,
              background: `${b.color}22`,
              color: b.color,
              fontWeight: 800,
            }}
          >
            {b.value}
          </span>
        ))}
      </div>

      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.15rem' }}>
        <Moon size={11} /> {v.sleepEmoji} {v.sleepLabel} · {v.timeToSleepMin}m to consolidation
      </p>
      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.55rem' }}>
        <Activity size={11} /> {v.cadence} · tone ×{v.weights.tone}, assoc ×{v.weights.association}, {v.weights.sequencing} beats
      </p>

      {/* What {name} is thinking about while you are not typing. */}
      <div
        style={{
          background: '#05070c',
          borderRadius: 8,
          padding: '0.45rem 0.55rem',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.62rem',
          lineHeight: 1.7,
          marginBottom: '0.6rem',
          overflow: 'hidden',
        }}
      >
        {v.log.map((l, i) => (
          <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: l.tag === 'PULSE' ? '#4ade80' : l.tag === 'FRAGMENT' ? '#22d3ee' : '#facc15' }}>[{l.tag}]</span>{' '}
            <span style={{ color: '#94a3b8' }}>{l.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <Link
          to="/chat/$id"
          params={{ id: String(characterId) }}
          title={`Open ${name}'s sub-conscious layer`}
          style={{ flex: 1, textAlign: 'center', padding: '0.4rem', borderRadius: 8, border: '1px solid #a855f755', background: '#a855f714', color: '#d8b4fe', textDecoration: 'none', fontSize: '0.68rem', fontWeight: 700 }}
        >
          Enter the depth
        </Link>
        <Link
          to="/consciousness/$id"
          params={{ id: String(characterId) }}
          style={{ flex: 1, textAlign: 'center', padding: '0.4rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.68rem', fontWeight: 700 }}
        >
          Metrics
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Unknown mode */

function UnknownMode() {
  return (
    <div style={{ textAlign: 'center', padding: '6rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚪</div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>No such entrance</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Pick one of the two ways in: ask the LLM, or adopt a character into roleplaying, learning, or business.
      </p>
      <Link to="/ask" style={{ color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 600 }}>
        ← Back to Ask
      </Link>
    </div>
  )
}

/* ------------------------------------------------------------------ Workspace */

function Workspace({ mode, characterId }: { mode: Mode; characterId: number | null }) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [memories, setMemories] = useState<ScopedMemory[]>([])
  const [adopted, setAdopted] = useState<Adopted | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadMemories = useCallback(() => {
    const sid = getSession()
    fetch(`/api/memory?sessionId=${encodeURIComponent(sid)}&scope=${mode.scope}`)
      .then((r) => r.json())
      .then((d) => setMemories(Array.isArray(d) ? d.slice(0, 6) : []))
      .catch(() => {})
  }, [mode.scope])

  // Fetch the adopted character (Mode 2) whenever the ?character param changes.
  useEffect(() => {
    if (!characterId) {
      setAdopted(null)
      return
    }
    let cancelled = false
    fetch(`/api/characters/${characterId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d && !d.error) {
          setAdopted({ id: d.id, name: d.name, avatar: d.avatar, category: d.category, tagline: d.tagline })
        } else {
          setAdopted(null)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [characterId])

  // Reset the conversation whenever the entrance or adopted character changes.
  useEffect(() => {
    setMessages([])
    setInput('')
    setError('')
    loadMemories()
  }, [mode.id, characterId, loadMemories])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || sending) return
      setError('')
      const next: ChatMessage[] = [...messages, { role: 'user', content }]
      setMessages(next)
      setInput('')
      setSending(true)
      try {
        const res = await fetch(`/api/mode/${mode.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: getSession(), messages: next, characterId: characterId ?? undefined }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          setError(data.error || 'Something went wrong. Try again.')
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
          loadMemories()
        }
      } catch {
        setError('Could not reach the assistant. Check your connection and try again.')
      } finally {
        setSending(false)
      }
    },
    [messages, sending, mode.id, characterId, loadMemories],
  )

  const started = messages.length > 0
  // The opening line is mode-driven, then personalized when a character is adopted.
  const greeting = adopted
    ? `${adopted.avatar} You've brought ${adopted.name} into ${mode.modeLabel}. ${mode.greeting}`
    : mode.greeting

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Left rail: mode identity, features, memory peek */}
      <aside
        className="cv-mode-rail"
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          overflowY: 'auto',
          padding: '1.25rem',
        }}
      >
        <Link
          to="/ask"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.8rem', marginBottom: '1.25rem' }}
        >
          <ArrowLeft size={14} /> Back to Ask
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: `${mode.accent}22`,
              border: `1px solid ${mode.accent}55`,
              color: mode.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name={mode.icon} size={24} color={mode.accent} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{mode.modeLabel}</h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {adopted ? `${adopted.name}, tuned for ${mode.label.toLowerCase()}` : `Asking the LLM, tuned for ${mode.label.toLowerCase()}`}
            </p>
          </div>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0.75rem 0 1.4rem' }}>{mode.blurb}</p>

        {/* Switch entrance — keeps the adopted character when carried */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: adopted ? '0.75rem' : '1.5rem' }}>
          {MODES.map((m) => {
            const active = m.id === mode.id
            return (
              <button
                key={m.id}
                onClick={() =>
                  navigate({
                    to: '/mode/$mode',
                    params: { mode: m.id },
                    search: characterId ? { character: String(characterId) } : {},
                  })
                }
                title={m.modeLabel}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: 10,
                  border: `1px solid ${active ? m.accent : 'var(--border)'}`,
                  background: active ? `${m.accent}1f` : 'var(--bg-card)',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                }}
              >
                {m.emoji}
              </button>
            )
          })}
        </div>

        {/* Adopted character (Mode 2) — the entrance is character-driven */}
        {adopted && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.6rem 0.7rem',
              borderRadius: 12,
              border: `1px solid ${mode.accent}55`,
              background: `${mode.accent}14`,
              marginBottom: '1.5rem',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                flexShrink: 0,
              }}
            >
              {adopted.avatar}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: mode.accent }}>
                Adopted character
              </p>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {adopted.name}
              </p>
            </div>
            <button
              onClick={() => navigate({ to: '/mode/$mode', params: { mode: mode.id }, search: {} })}
              title="Release character — back to the pure LLM"
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '0.2rem', flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {adopted && <SubConsciousPanel characterId={adopted.id} name={adopted.name} />}

        <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          {mode.label} features
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
          {mode.features.map((f) => (
            <div key={f.title} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: `${mode.accent}1a`,
                  color: mode.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <Icon name={f.icon} size={15} color={mode.accent} />
              </span>
              <div>
                <p style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.title}</p>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Scoped memory peek — united but separated per mode */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            {mode.label} memory
          </p>
          <Link
            to="/memory"
            search={{ scope: mode.scope }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: mode.accent, textDecoration: 'none', fontWeight: 600 }}
          >
            <Brain size={13} /> Manage
          </Link>
        </div>
        {memories.length === 0 ? (
          <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5, opacity: 0.85 }}>
            This lane is empty. As you chat here, it remembers what matters for {mode.label.toLowerCase()} — separate from your other modes, but alongside what you share everywhere.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {memories.map((m) => (
              <li
                key={m.id}
                style={{
                  fontSize: '0.76rem',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  padding: '0.45rem 0.6rem',
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: m.scope === 'general' ? 'var(--text-secondary)' : mode.accent, fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', marginRight: '0.4rem' }}>
                  {m.scope === 'general' ? 'shared' : mode.label}
                </span>
                {m.content}
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main chat column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1.25rem 1rem' }}>
            {!started ? (
              <div style={{ paddingTop: '1.5rem' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.35rem 0.85rem',
                    borderRadius: 999,
                    border: `1px solid ${mode.accent}55`,
                    background: `${mode.accent}14`,
                    fontSize: '0.76rem',
                    color: mode.accent,
                    fontWeight: 600,
                    marginBottom: '1.25rem',
                  }}
                >
                  <Icon name={mode.icon} size={13} color={mode.accent} /> {adopted ? `${mode.modeLabel} · ${adopted.name}` : mode.modeLabel}
                </div>
                <div
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    padding: '1.1rem 1.25rem',
                    fontSize: '0.95rem',
                    color: 'var(--text-primary)',
                    lineHeight: 1.65,
                    marginBottom: '1.5rem',
                  }}
                >
                  {greeting}
                </div>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                  Try one of these
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {mode.quickStarts.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      style={{
                        textAlign: 'left',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '0.8rem 1rem',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = mode.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <Wand2 size={15} color={mode.accent} />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '0.8rem 1.05rem',
                        borderRadius: 16,
                        fontSize: '0.92rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        background: m.role === 'user' ? `linear-gradient(135deg, ${mode.accent}, ${mode.accent}cc)` : 'var(--bg-card)',
                        border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                        color: m.role === 'user' ? 'white' : 'var(--text-primary)',
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ padding: '0.8rem 1.05rem', borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      <span className="cv-typing">Thinking…</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && (
              <p style={{ fontSize: '0.82rem', color: '#fca5a5', textAlign: 'center', marginTop: '1rem' }}>{error}</p>
            )}
          </div>
        </div>

        {/* Composer */}
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '1rem 1.25rem 1.4rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '0.6rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 22,
                padding: '0.5rem 0.5rem 0.5rem 1.1rem',
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                placeholder={mode.placeholder}
                rows={1}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.95rem',
                  resize: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.6,
                  padding: '0.6rem 0',
                  maxHeight: 160,
                }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
                }}
              />
              {started && (
                <button
                  onClick={() => {
                    setMessages([])
                    setError('')
                  }}
                  title="New conversation"
                  style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <RefreshCw size={16} />
                </button>
              )}
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || sending}
                title="Send"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background: input.trim() && !sending ? `linear-gradient(135deg, ${mode.accent}, ${mode.accent}bb)` : 'var(--bg-hover)',
                  color: input.trim() && !sending ? 'white' : 'var(--text-secondary)',
                  cursor: input.trim() && !sending ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ArrowUp size={18} />
              </button>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.6rem' }}>
              {mode.label} memory and TourClaw follow you across CharacterVerse.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModePage() {
  const { mode: modeParam } = useParams({ from: '/mode/$mode' })
  const { character } = Route.useSearch()
  const mode = getMode(modeParam)
  if (!mode) return <UnknownMode />
  const characterId = character ? parseInt(character, 10) : NaN
  return <Workspace mode={mode} characterId={Number.isFinite(characterId) ? characterId : null} />
}

export const Route = createFileRoute('/mode/$mode')({
  // A mode whose real surface is its own page never renders this composer. The
  // forward happens before the loader so there is no flash of a workspace the
  // mode was never going to use, and every /mode/$mode link keeps working.
  beforeLoad: ({ params }) => {
    const target = getMode(params.mode)?.workspace
    if (target) throw redirect({ to: target })
  },
  validateSearch: (search: Record<string, unknown>): { character?: string } => {
    const character = typeof search.character === 'string' ? search.character : undefined
    return character && /^\d+$/.test(character) ? { character } : {}
  },
  component: ModePage,
})
