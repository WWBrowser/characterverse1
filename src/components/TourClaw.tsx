import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouterState, Link } from '@tanstack/react-router'
import { PawPrint, X, Send, Compass, Sparkles } from 'lucide-react'
import { getMode, isModeId } from '../lib/modes'
import { getSession } from '../lib/session'

// TourClaw — a single agentic help marker that follows the user across every
// page. One floating guide that prompts the LLM with the user's current
// location, instead of scattering a million static markers around the site.

type Turn = { role: 'user' | 'claw'; content: string }

// Context-aware quick prompts so the user always has a relevant starting point.
function suggestionsFor(route: string, mode?: string): string[] {
  if (mode && isModeId(mode)) {
    const m = getMode(mode)!
    return [
      `What can I do in ${m.label.toLowerCase()} mode?`,
      `How does ${m.label.toLowerCase()} memory work?`,
      'Give me a good first prompt to try.',
    ]
  }
  switch (route) {
    case '/':
      return ['Which entrance is right for me?', 'How are the three modes different?', 'Where does my memory live?']
    case '/memory':
      return ['Why is memory split into lanes?', 'What is the Shared lane?', 'How do memories get added?']
    case '/ask':
      return ['How do I pick a character?', 'What is the difference from the modes?']
    default:
      return ['Where am I and what can I do here?', 'Take me to the right place for my goal.']
  }
}

export function TourClaw() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const mode = useMemo(() => {
    const m = pathname.match(/^\/mode\/([^/]+)/)
    return m && isModeId(m[1]) ? m[1] : undefined
  }, [pathname])

  const here = mode ? getMode(mode)!.modeLabel : pathname === '/' ? 'the entrances' : pathname

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy, open])

  const ask = async (question?: string) => {
    const q = (question ?? input).trim()
    if (busy) return
    setBusy(true)
    if (q) setTurns((t) => [...t, { role: 'user', content: q }])
    setInput('')
    try {
      const res = await fetch('/api/tourclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: pathname, mode, question: q, sessionId: getSession() }),
      })
      const data = await res.json()
      setTurns((t) => [
        ...t,
        { role: 'claw', content: res.ok && !data.error ? data.reply : data.error || 'I could not reach the guide just now.' },
      ])
    } catch {
      setTurns((t) => [...t, { role: 'claw', content: 'I could not reach the guide just now. Try again in a moment.' }])
    } finally {
      setBusy(false)
    }
  }

  const suggestions = suggestionsFor(pathname, mode)

  return (
    <>
      {/* Floating marker */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="TourClaw — your guide"
        aria-label="Open TourClaw guide"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 200,
          width: 54,
          height: 54,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 30px rgba(124,92,191,0.45)',
        }}
      >
        {open ? <X size={22} /> : <PawPrint size={24} />}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            right: 20,
            bottom: 86,
            zIndex: 200,
            width: 'min(370px, calc(100vw - 40px))',
            maxHeight: 'min(560px, calc(100vh - 120px))',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PawPrint size={18} color="white" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>TourClaw</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Following you · {here}
              </p>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            {turns.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  padding: '0.8rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  marginBottom: '0.9rem',
                }}
              >
                <Compass size={16} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  Hi — I follow you everywhere on CharacterVerse. Ask me anything, and I'll guide you based on where you are right now.
                </p>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '0.6rem' }}>
                <div
                  style={{
                    maxWidth: '88%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 13,
                    fontSize: '0.84rem',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    background: t.role === 'user' ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-secondary)',
                    border: t.role === 'user' ? 'none' : '1px solid var(--border)',
                    color: t.role === 'user' ? 'white' : 'var(--text-primary)',
                  }}
                >
                  {t.content}
                </div>
              </div>
            ))}

            {busy && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '0.6rem' }}>
                <div style={{ padding: '0.6rem 0.8rem', borderRadius: 13, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  Looking around…
                </div>
              </div>
            )}

            {/* Contextual suggestions */}
            {!busy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: turns.length ? '0.4rem' : 0 }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    style={{
                      textAlign: 'left',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '0.5rem 0.7rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                  >
                    <Sparkles size={13} color="var(--accent-light)" />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{ padding: '0.7rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.3rem 0.3rem 0.3rem 0.8rem' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ask()
                }}
                placeholder="Ask TourClaw…"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: 0 }}
              />
              <button
                onClick={() => ask()}
                disabled={!input.trim() || busy}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: 'none',
                  background: input.trim() && !busy ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
                  color: input.trim() && !busy ? 'white' : 'var(--text-secondary)',
                  cursor: input.trim() && !busy ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Send size={15} />
              </button>
            </div>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
              One guide, every page. <Link to="/" style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>See the entrances</Link>
            </p>
          </div>
        </div>
      )}
    </>
  )
}
