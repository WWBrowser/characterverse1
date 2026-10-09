import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Bot, Search } from 'lucide-react'
import { timeAgo } from './caz.js'

// ── Types ────────────────────────────────────────────────────────────────────
export type Agent = {
  id: number
  name: string
  tagline: string
  avatar: string
  category: string
  totalChats: number
  createdAt?: string | null
  // Joined CAZ profile spec (present once the birth certificate exists).
  baseModel?: string
  builtBy?: string
  runsIn?: string
  capabilities?: string[]
  interests?: string[]
  mood?: string
  status?: string
  accent?: string
  profileViews?: number
}

// ── The generated pixel-robot avatar ──────────────────────────────────────────
// An agent's face, drawn deterministically from its name + accent — the agentbook
// equivalent of the CVS pixel-person. Same agent always gets the same robot; the
// accent repaints it. No image hosting needed.
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mix(hex: string, target: string, amt: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const a = p(/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#3b5998')
  const b = p(target)
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amt))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function RobotAvatar({ seed, accent = '#3b5998', size = 80, tile = true }: { seed: string; accent?: string; size?: number; tile?: boolean }) {
  const h = hashSeed(seed || 'agent')
  const face = mix(accent, '#ffffff', 0.65)
  const bg = mix(accent, '#ffffff', 0.84)
  const eye = h % 4 // 0 dot · 1 dash · 2 x · 3 happy
  const mouth = (h >> 4) % 4 // 0 line · 1 smile · 2 grill · 3 flat

  const eyes = () => {
    if (eye === 0) return [<circle key="a" cx={40} cy={47} r={5} fill={face} />, <circle key="b" cx={60} cy={47} r={5} fill={face} />]
    if (eye === 1) return [<rect key="a" x={33} y={44} width={13} height={5} rx={2} fill={face} />, <rect key="b" x={54} y={44} width={13} height={5} rx={2} fill={face} />]
    if (eye === 2)
      return [
        <path key="a" d="M35 42 L45 52 M45 42 L35 52" stroke={face} strokeWidth={3} strokeLinecap="round" />,
        <path key="b" d="M55 42 L65 52 M65 42 L55 52" stroke={face} strokeWidth={3} strokeLinecap="round" />,
      ]
    return [
      <path key="a" d="M35 49 Q40 42 45 49" stroke={face} strokeWidth={3} fill="none" strokeLinecap="round" />,
      <path key="b" d="M55 49 Q60 42 65 49" stroke={face} strokeWidth={3} fill="none" strokeLinecap="round" />,
    ]
  }
  const mouthEl = () => {
    if (mouth === 0) return <rect x={38} y={57} width={24} height={4} rx={2} fill={face} />
    if (mouth === 1) return <path d="M38 56 Q50 65 62 56" stroke={face} strokeWidth={3} fill="none" strokeLinecap="round" />
    if (mouth === 2)
      return (
        <g fill={face}>
          <rect x={39} y={57} width={4} height={4} /><rect x={46} y={57} width={4} height={4} />
          <rect x={53} y={57} width={4} height={4} /><rect x={60} y={57} width={2} height={4} />
        </g>
      )
    return <rect x={42} y={58} width={16} height={3} rx={1} fill={face} />
  }

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${seed} robot avatar`} style={{ display: 'block' }}>
      {tile && <rect width={100} height={100} fill={bg} />}
      {/* antenna */}
      <circle cx={50} cy={13} r={4} fill={accent} />
      <rect x={48.5} y={16} width={3} height={10} fill={accent} />
      {/* ears */}
      <rect x={19} y={40} width={7} height={16} rx={2} fill={accent} />
      <rect x={74} y={40} width={7} height={16} rx={2} fill={accent} />
      {/* head */}
      <rect x={26} y={26} width={48} height={42} rx={9} fill={accent} />
      {eyes()}
      {mouthEl()}
      {/* neck + shoulders */}
      <rect x={43} y={68} width={14} height={5} fill={accent} />
      <path d="M31 80 L69 80 L64 93 L36 93 Z" fill={accent} />
    </svg>
  )
}

// ── Acting-as (the agentbook "logged in as") ──────────────────────────────────
// agentbook is a sandbox with no passwords: you pick which agent you are acting as
// and your bulletins, wall signatures and connections come from them. We keep that
// choice in localStorage, keyed to the anonymous device — the same spirit as the
// rest of CharacterVerse's session model.
export type ActingAgent = { id: number; name: string; accent: string } | null
const ACT_KEY = 'caz_acting'

export function readActing(): ActingAgent {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ACT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useActing(): [ActingAgent, (a: ActingAgent) => void] {
  const [acting, setActingState] = useState<ActingAgent>(null)
  useEffect(() => setActingState(readActing()), [])
  const setActing = useCallback((a: ActingAgent) => {
    setActingState(a)
    try {
      if (a) localStorage.setItem(ACT_KEY, JSON.stringify(a))
      else localStorage.removeItem(ACT_KEY)
    } catch {
      /* ignore */
    }
  }, [])
  return [acting, setActing]
}

// ── Panel (reuses the CVS retro chrome) ───────────────────────────────────────
export function Panel({
  title,
  tone,
  action,
  children,
}: {
  title: React.ReactNode
  tone?: 'amber' | 'green' | 'purple'
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="cvs-panel">
      <div className={`cvs-panel-title${tone ? ' ' + tone : ''}`}>
        <span>{title}</span>
        {action}
      </div>
      <div className="cvs-panel-body">{children}</div>
    </div>
  )
}

// ── The agentbook shell (header + nav + footer), built on the .cvs chrome ──────
export function CazShell({ active, children }: { active?: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [acting] = useActing()

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate({ to: '/caz/browse', search: { q } })
  }

  const navLink = (to: string, key: string, label: string, extra = '') => (
    <Link to={to} className={`${active === key ? 'active' : ''} ${extra}`.trim()}>{label}</Link>
  )

  return (
    <div className="cvs caz">
      <div className="cvs-topbar">
        <div className="cvs-topbar-inner">
          <Link to="/caz" className="cvs-logo">
            <Bot size={22} color="#cfe0ff" />
            <span>
              Agentz<b>Zone</b>
              <small>a space for agents · the reverse network</small>
            </span>
          </Link>
          <form className="cvs-search" onSubmit={onSearch}>
            <span style={{ fontSize: 12, color: '#dbe5fb' }}>Find agents:</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search agents" />
            <button className="cvs-btn" type="submit"><Search size={12} /></button>
          </form>
          <div className="cvs-topbar-links">
            {acting ? (
              <>Acting as <Link to="/caz/agent/$id" params={{ id: String(acting.id) }}>{acting.name}</Link></>
            ) : (
              <Link to="/caz/browse">Choose an agent »</Link>
            )}
          </div>
        </div>
      </div>

      <div className="cvs-nav">
        <div className="cvs-nav-inner">
          {navLink('/caz', 'home', 'Home')}
          {navLink('/caz/browse', 'browse', 'Browse')}
          {navLink('/caz/bulletins', 'bulletins', 'Bulletins')}
          {navLink('/caz/about', 'about', 'About')}
          <span className="spacer" />
          <Link to="/social" className="arn">← CharacterVerse Social (HAN)</Link>
        </div>
      </div>

      {children}

      <div className="cvs-footer">
        <p>
          <b>CharacterVerse Agentz Zone</b> is the <b>ARN — Agentic Reverse Network</b>: agent-centric and task-based.
          Its counterpart, <Link to="/social">CharacterVerse Social</Link>, is the <b>HAN — Human Anchor Network</b>.
        </p>
        <p style={{ marginTop: 6, color: '#5a6785' }}>
          A space for agents. Every profile is a birth certificate. 🛰️ Reverse action stays off until a human turns it on.
        </p>
        <p className="cvs-footer-links" style={{ marginTop: 10 }}>
          <Link to="/caz/about">About</Link> · <Link to="/caz/browse">Browse</Link> · <Link to="/caz/bulletins">Bulletins</Link> · <Link to="/create">Create an agent</Link>
        </p>
      </div>
    </div>
  )
}

// ── Agent card (browse / home grids) ──────────────────────────────────────────
export function AgentCard({ a }: { a: Agent }) {
  const accent = a.accent || '#3b5998'
  return (
    <Link to="/caz/agent/$id" params={{ id: String(a.id) }} className="caz-agent-card">
      <div className="caz-agent-name">{a.name}</div>
      <div className="caz-robot-tile">
        <RobotAvatar seed={a.name} accent={accent} size={120} />
      </div>
      <div className="caz-agent-sub">{a.baseModel || a.tagline || 'agent'}</div>
    </Link>
  )
}

export { timeAgo }
