import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  PawPrint, Radio, Power, Zap, Sparkles, Users, ChevronRight, Check,
  Send, MessageSquare, Hash, MessageCircle, Phone, Globe,
  Gauge, Clock, TrendingUp, Wifi, Repeat,
} from 'lucide-react'

type CharacterLite = { id: number; name: string; avatar: string; tagline: string; category: string }

const MODES = [
  { id: 'companion', label: 'Active Companion', icon: Radio, desc: 'Always on. Proactively chimes in and keeps the conversation alive across your linked apps.' },
  { id: 'ondemand', label: 'On-Demand Helper', icon: Power, desc: 'Stays quiet until summoned. Answers the moment you call, then steps back.' },
  { id: 'automator', label: 'Smart Automator', icon: Zap, desc: 'Detects intent and automates replies, reminders, and routine tasks for you.' },
  { id: 'roleplay', label: 'Roleplay', icon: Sparkles, desc: 'Keeps your character fully in-persona for immersive, story-driven chats anywhere.' },
  { id: 'conference', label: 'Conference', icon: Users, desc: 'Brings multiple characters into one room to brainstorm, debate, and collaborate.' },
] as const

const APPS = [
  { id: 'telegram', label: 'Telegram', icon: Send, color: '#229ED9' },
  { id: 'discord', label: 'Discord', icon: MessageSquare, color: '#5865F2' },
  { id: 'slack', label: 'Slack', icon: Hash, color: '#E01E5A' },
  { id: 'messenger', label: 'Messenger', icon: MessageCircle, color: '#A855F7' },
  { id: 'sms', label: 'SMS', icon: Phone, color: '#22C55E' },
  { id: 'web', label: 'Web Widget', icon: Globe, color: '#60A5FA' },
] as const

function ClawPage() {
  const [roster, setRoster] = useState<CharacterLite[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [mode, setMode] = useState<string>('companion')
  const [linked, setLinked] = useState<Record<string, boolean>>({ telegram: true, discord: true })

  useEffect(() => {
    fetch('/api/characters?limit=50')
      .then((r) => r.json())
      .then((data: CharacterLite[]) => {
        if (Array.isArray(data) && data.length) {
          setRoster(data)
          setActiveId(String(data[0].id))
        }
      })
      .catch(() => {})
  }, [])

  const active = useMemo(() => roster.find((c) => String(c.id) === activeId), [roster, activeId])
  const activeMode = MODES.find((m) => m.id === mode)!
  const linkedCount = Object.values(linked).filter(Boolean).length

  const toggleApp = (id: string) => setLinked((p) => ({ ...p, [id]: !p[id] }))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        <PawPrint size={14} color="var(--accent-light)" />
        <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>CharacterClaw</span>
        <ChevronRight size={12} />
        <span>Your Shadow Companion</span>
      </div>

      {/* Hero */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,420px)', gap: '2rem',
          alignItems: 'center', marginBottom: '2.5rem',
        }}
        className="claw-hero"
      >
        <div>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800, lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            One character.<br />
            <span className="gradient-text">Everywhere you go.</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 520, marginBottom: '1.5rem' }}>
            CharacterClaw forks any character from Discover and lets it shadow you across Telegram,
            Discord, Slack, and more. Switch characters on the fly, choose your mode, and link the apps
            you use every day.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {MODES.map((m) => {
              const on = mode === m.id
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem',
                    borderRadius: 999, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                    border: '1px solid', borderColor: on ? 'var(--accent)' : 'var(--border)',
                    background: on ? 'rgba(124,92,191,0.2)' : 'var(--bg-card)',
                    color: on ? 'var(--accent-light)' : 'var(--text-secondary)', transition: 'all 0.15s',
                  }}
                >
                  <Icon size={13} /> {m.label}
                </button>
              )
            })}
          </div>
          <Link
            to="/discover"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.4rem', borderRadius: 10,
              background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)', color: 'white', textDecoration: 'none',
              fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            <PawPrint size={16} /> Fork a character from Discover
          </Link>
        </div>

        {/* Live preview card */}
        <div
          style={{
            background: 'linear-gradient(165deg, rgba(124,92,191,0.18), rgba(79,70,229,0.06))',
            border: '1px solid rgba(124,92,191,0.35)', borderRadius: 18, padding: '1.1rem', minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
            <div
              style={{
                width: 38, height: 38, borderRadius: 11, fontSize: '1.2rem', flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(124,92,191,0.4), rgba(79,70,229,0.3))',
                border: '1px solid rgba(124,92,191,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {active?.avatar || '🐾'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {active?.name || 'CharacterClaw'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-light)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34d399', display: 'inline-block' }} />
                {activeMode.label} · live
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.85rem' }}>
            <div style={{ alignSelf: 'flex-end', maxWidth: '80%', background: 'var(--accent)', color: 'white', fontSize: '0.78rem', padding: '0.5rem 0.75rem', borderRadius: '12px 12px 4px 12px' }}>
              Hey, can you join me on Telegram?
            </div>
            <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: '0.78rem', padding: '0.5rem 0.75rem', borderRadius: '12px 12px 12px 4px' }}>
              {active ? `Shadowing as ${active.name} — ready and everywhere you are. 🐾` : 'Pick a character and I will shadow you everywhere. 🐾'}
            </div>
          </div>

          {/* Switch character */}
          <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
            <Repeat size={11} style={{ display: 'inline', marginRight: 4 }} /> Switch character on the fly
          </label>
          <select
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 9, padding: '0.5rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', marginBottom: '0.75rem' }}
          >
            {roster.length === 0 && <option value="">No characters yet</option>}
            {roster.map((c) => <option key={c.id} value={String(c.id)}>{c.avatar} {c.name}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center', padding: '0.55rem', borderRadius: 9, background: 'rgba(34,158,217,0.15)', border: '1px solid rgba(34,158,217,0.35)', color: '#7dd3fc', fontSize: '0.78rem', fontWeight: 600 }}>
            <Send size={13} /> Open in Telegram
          </div>
        </div>
      </div>

      {/* Operating Mode */}
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Operating Mode</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Choose how your shadow companion behaves once it is linked.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '2.5rem' }}>
        {MODES.map((m) => {
          const on = mode === m.id
          const Icon = m.icon
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                textAlign: 'left', padding: '1rem', borderRadius: 14, cursor: 'pointer',
                border: '1px solid', borderColor: on ? 'var(--accent)' : 'var(--border)',
                background: on ? 'rgba(124,92,191,0.16)' : 'var(--bg-card)', transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <Icon size={18} color={on ? 'var(--accent-light)' : 'var(--text-secondary)'} />
                {on && <Check size={15} color="var(--accent-light)" />}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{m.label}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{m.desc}</div>
            </button>
          )
        })}
      </div>

      {/* Performance Cluster */}
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Performance Cluster</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>A live snapshot of your companion across every linked surface.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '2.5rem' }}>
        {[
          { icon: Gauge, label: 'Active mode', value: activeMode.label },
          { icon: Wifi, label: 'Linked apps', value: `${linkedCount} / ${APPS.length}` },
          { icon: TrendingUp, label: 'Messages handled', value: '12.4k' },
          { icon: Clock, label: 'Uptime', value: '99.9%' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem' }}>
            <Icon size={16} color="var(--accent-light)" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Linked Software */}
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Linked Software</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Link the apps you use every day — your character shadows you in each one.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        {APPS.map((app) => {
          const on = !!linked[app.id]
          const Icon = app.icon
          return (
            <button
              key={app.id}
              onClick={() => toggleApp(app.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: 14, cursor: 'pointer',
                border: '1px solid', borderColor: on ? 'var(--accent)' : 'var(--border)',
                background: on ? 'rgba(124,92,191,0.12)' : 'var(--bg-card)', transition: 'all 0.15s', textAlign: 'left',
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${app.color}22`, border: `1px solid ${app.color}55` }}>
                <Icon size={17} color={app.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{app.label}</div>
                <div style={{ fontSize: '0.7rem', color: on ? '#34d399' : 'var(--text-secondary)' }}>{on ? 'Linked' : 'Tap to link'}</div>
              </div>
              <div
                style={{
                  width: 34, height: 20, borderRadius: 999, flexShrink: 0, position: 'relative', transition: 'background 0.15s',
                  background: on ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: 'white', transition: 'left 0.15s' }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/characterclaw')({
  component: ClawPage,
})
