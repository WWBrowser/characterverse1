import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvsShell, Panel, useMe } from '../lib/social-ui'
import { AvatarFill } from '../lib/avatar'

type Char = { id: number; name: string; avatar: string; tagline: string; category: string }
type Mode = 'single' | 'group' | 'conference'
type Msg = { kind: 'user' | 'char'; name?: string; avatar?: string; content: string }

const MODE_LABEL: Record<Mode, string> = { single: 'Single chat', group: 'Group chat', conference: 'Conference (enterprise)' }
const MODE_MAX: Record<Mode, number> = { single: 1, group: 5, conference: 5 }

function AgentChat() {
  const { mode: modeParam, c } = Route.useSearch()
  const { me, loading } = useMe()
  const [mode, setMode] = useState<Mode>(modeParam)
  const [roster, setRoster] = useState<Char[]>([])
  const [selected, setSelected] = useState<number[]>(c ? [c] : [])
  const [topic, setTopic] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/social/adoptions')
      .then((r) => r.json())
      .then((rows: Char[]) => {
        setRoster(rows)
        // Keep any preselected id only if it's really in the roster.
        setSelected((prev) => prev.filter((id) => rows.some((x) => x.id === id)))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Trim the selection when switching to a mode that allows fewer characters.
    setSelected((prev) => prev.slice(0, MODE_MAX[mode]))
  }, [mode])

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [messages, busy])

  const toggle = (id: number) => {
    setSelected((prev) => {
      if (mode === 'single') return [id]
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MODE_MAX[mode]) return prev
      return [...prev, id]
    })
  }

  const selectedChars = useMemo(() => selected.map((id) => roster.find((r) => r.id === id)).filter(Boolean) as Char[], [selected, roster])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    if (selected.length === 0) { setError('Pick at least one of your characters first.'); return }
    setError('')
    const next: Msg[] = [...messages, { kind: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    const reqMessages = next.map((m) =>
      m.kind === 'user'
        ? { role: 'user', content: m.content }
        : { role: 'assistant', content: mode === 'single' ? m.content : `${m.name}: ${m.content}` },
    )
    try {
      const res = await fetch('/api/social/agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, characterIds: selected, messages: reqMessages, topic }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not reach your agents.'); setBusy(false); return }
      setMessages((m) => [...m, ...(data.replies || []).map((r: any) => ({ kind: 'char' as const, name: r.name, avatar: r.avatar, content: r.reply }))])
    } catch {
      setError('Could not reach your agents.')
    }
    setBusy(false)
  }

  // Gates.
  if (!loading && !me) {
    return <CvsShell><div className="cvs-main" style={{ maxWidth: 480 }}><Panel title="Sign in"><p>Log in to chat with your agents. <Link to="/social/login">Log in »</Link></p></Panel></div></CvsShell>
  }
  if (me && !me.agentShadowing) {
    return (
      <CvsShell>
        <div className="cvs-main" style={{ maxWidth: 520 }}>
          <Panel title="🛰️ Agent shadowing is off">
            <p>Agent shadowing is off until you choose to turn it on. Enable it to chat with your adopted characters.</p>
            <p style={{ marginTop: 8 }}><Link to="/social/settings">Open Settings »</Link></p>
          </Panel>
        </div>
      </CvsShell>
    )
  }

  return (
    <CvsShell>
      <div className="cvs-main">
        <div className="cvs-grid2" style={{ gridTemplateColumns: '260px 1fr' }}>
          {/* Left — mode + roster picker */}
          <div>
            <Panel title="Chat mode">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(['single', 'group', 'conference'] as Mode[]).map((mo) => (
                  <button key={mo} className={`cvs-btn ${mode === mo ? 'primary' : ''}`} onClick={() => setMode(mo)}>{MODE_LABEL[mo]}</button>
                ))}
              </div>
              {mode === 'conference' && (
                <div style={{ marginTop: 10 }}>
                  <label className="cvs-field"><span style={{ fontWeight: 700, fontSize: 11 }}>Conference topic</span>
                    <input className="cvs-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Q3 fraud review" /></label>
                </div>
              )}
              <p style={{ fontSize: 11, color: '#5a6785', marginTop: 8 }}>
                {mode === 'single' ? 'Pick one of your characters.' : `Pick up to ${MODE_MAX[mode]} of your characters.`}
              </p>
            </Panel>

            <Panel title={`My Characters · ${roster.length}`}>
              {roster.length === 0 ? (
                <p style={{ fontSize: 12, color: '#5a6785' }}>You haven&apos;t adopted any characters yet. Adopt some from your <Link to="/social/u/$handle" params={{ handle: me?.handle || '' }}>profile</Link>.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {roster.map((ch) => {
                    const on = selected.includes(ch.id)
                    return (
                      <button key={ch.id} onClick={() => toggle(ch.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer', padding: 5, borderRadius: 6, border: `1px solid ${on ? '#4d66a6' : '#cdd6ec'}`, background: on ? '#e7edfb' : '#fff' }}>
                        <span style={{ width: 30, height: 30, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: '#eef2fb', flexShrink: 0 }}>
                          <AvatarFill avatar={ch.avatar} alt={ch.name} />
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{ch.name}</span>
                        {on && <span style={{ marginLeft: 'auto', color: '#2d8a57', fontWeight: 700 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* Right — transcript */}
          <Panel title={`${MODE_LABEL[mode]}${selectedChars.length ? ' · ' + selectedChars.map((c) => c.name).join(', ') : ''}`}>
            <div ref={scroller} style={{ height: 'min(60vh, 520px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }}>
              {messages.length === 0 && (
                <p style={{ fontSize: 12, color: '#5a6785' }}>
                  This is a private, owner-only chat with your agents — unlike the public /ask characters. Say hello to begin.
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, flexDirection: msg.kind === 'user' ? 'row-reverse' : 'row' }}>
                  {msg.kind === 'char' && (
                    <span style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: '#eef2fb', flexShrink: 0 }}>
                      <AvatarFill avatar={msg.avatar || ''} alt={msg.name || ''} />
                    </span>
                  )}
                  <div style={{ maxWidth: '78%' }}>
                    {msg.kind === 'char' && <div style={{ fontSize: 10, fontWeight: 700, color: '#4d66a6', marginBottom: 2 }}>{msg.name}</div>}
                    <div style={{ padding: '7px 11px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: msg.kind === 'user' ? 'linear-gradient(180deg,#5c74b8,#3b5998)' : '#eef2fb', color: msg.kind === 'user' ? '#fff' : '#14213d' }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {busy && <div style={{ fontSize: 12, color: '#5a6785' }}>…your agent{selected.length > 1 ? 's are' : ' is'} thinking</div>}
            </div>
            {error && <div className="cvs-error" style={{ marginTop: 8 }}>{error}</div>}
            <form onSubmit={(e) => { e.preventDefault(); send() }} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input className="cvs-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message your agents…" style={{ flex: 1 }} />
              <button className="cvs-btn primary" type="submit" disabled={busy}>Send</button>
            </form>
          </Panel>
        </div>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/agent')({
  validateSearch: (s: Record<string, unknown>): { mode: Mode; c: number } => ({
    mode: s.mode === 'group' || s.mode === 'conference' ? s.mode : 'single',
    c: typeof s.c === 'number' ? s.c : parseInt(String(s.c ?? '')) || 0,
  }),
  component: AgentChat,
})
