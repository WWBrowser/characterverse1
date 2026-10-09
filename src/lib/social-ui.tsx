import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Search, Sparkles } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────
export type Member = {
  id: number
  handle: string
  displayName: string
  accent: string
  mood: string
  status: string
  headline: string
  region: string
  pronouns: string
  values: string
  interests: string
  bio: string
  wantToMeet?: string
  customCss?: string
  isPrivate?: boolean
  agentShadowing?: boolean
  profileViews: number
  createdAt: string
}

// ── Deterministic pixel avatar ───────────────────────────────────────────────
// A one-of-a-kind blocky "pixel person" derived purely from the handle + accent,
// so no image hosting is needed and the same member always looks the same.
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function PixelAvatar({ seed, accent = '#3b5998', size = 80 }: { seed: string; accent?: string; size?: number }) {
  const h = hashSeed(seed || 'anon')
  const cells = 5
  const cell = Math.floor(size / cells)
  const dim = cell * cells
  const rects: { x: number; y: number }[] = []
  // Left three columns drive the pattern; mirror to columns 4 and 5 for symmetry.
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < 3; c++) {
      const on = (h >> (r * 3 + c)) & 1
      if (on) {
        rects.push({ x: c, y: r })
        if (c < 2) rects.push({ x: cells - 1 - c, y: r })
      }
    }
  }
  return (
    <svg width={dim} height={dim} className="cvs-pixel" role="img" aria-label={`${seed} avatar`}>
      <rect width={dim} height={dim} fill="#eef2fb" />
      {rects.map((p, i) => (
        <rect key={i} x={p.x * cell} y={p.y * cell} width={cell} height={cell} fill={accent} />
      ))}
    </svg>
  )
}

// ── Current member hook ───────────────────────────────────────────────────────
export function useMe() {
  const [me, setMe] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(() => {
    setLoading(true)
    return fetch('/api/social/me')
      .then((r) => r.json())
      .then((d) => setMe(d.member))
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return { me, loading, refresh, setMe }
}

// ── Panel ─────────────────────────────────────────────────────────────────────
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

// ── Retro shell (header + nav + footer) ───────────────────────────────────────
export function CvsShell({ active, children }: { active?: string; children: React.ReactNode }) {
  const { me } = useMe()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate({ to: '/social/browse', search: { q } })
  }

  const logout = async () => {
    await fetch('/api/social/logout', { method: 'POST' })
    window.location.href = '/social'
  }

  const navLink = (to: string, key: string, label: string, extra = '') => (
    <Link to={to} className={`${active === key ? 'active' : ''} ${extra}`.trim()}>{label}</Link>
  )

  return (
    <div className="cvs">
      <div className="cvs-topbar">
        <div className="cvs-topbar-inner">
          <Link to="/social" className="cvs-logo">
            <Sparkles size={22} color="#cfe0ff" />
            <span>
              Character<b>Verse</b> Social
              <small>a space for humans · the anchor network</small>
            </span>
          </Link>
          <form className="cvs-search" onSubmit={onSearch}>
            <span style={{ fontSize: 12, color: '#dbe5fb' }}>Find people:</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
            <button className="cvs-btn" type="submit"><Search size={12} /></button>
          </form>
          <div className="cvs-topbar-links">
            {me ? (
              <>
                Hi, <Link to="/social/u/$handle" params={{ handle: me.handle }}>{me.displayName || me.handle}</Link>
                {' · '}
                <a onClick={logout} style={{ cursor: 'pointer' }}>Log out</a>
              </>
            ) : (
              <>
                <Link to="/social/login">Log in</Link> | <Link to="/social/signup">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="cvs-nav">
        <div className="cvs-nav-inner">
          {navLink('/social', 'home', 'Home')}
          {navLink('/social/browse', 'browse', 'Browse')}
          {navLink('/social/bulletins', 'bulletins', 'Bulletins')}
          {me ? (
            <Link to="/social/u/$handle" params={{ handle: me.handle }} className={active === 'me' ? 'active' : ''}>My Profile</Link>
          ) : (
            navLink('/social/signup', 'join', 'Join')
          )}
          {me && navLink('/social/settings', 'settings', 'Settings')}
          <span className="spacer" />
          <Link to="/caz" className="arn">🛰️ Agentz Zone (ARN) →</Link>
        </div>
      </div>

      {children}

      <div className="cvs-footer">
        <p>
          <b>CharacterVerse Social</b> is the <b>HAN — Human Anchor Network</b>: person-centric and trust-based.
          Its counterpart, <Link to="/">CharacterVerse</Link>, is the <b>ARN — Agentic Reverse Network</b>: agent-centric and task-based.
        </p>
        <p style={{ marginTop: 6, color: '#5a6785' }}>A place for people. Real accounts, real friends, no algorithm.</p>
        <p className="cvs-footer-links" style={{ marginTop: 10 }}>
          <Link to="/social/info/$page" params={{ page: 'about' }}>About</Link> ·{' '}
          <Link to="/social/info/$page" params={{ page: 'rules' }}>Rules</Link> ·{' '}
          <Link to="/social/info/$page" params={{ page: 'terms' }}>Terms</Link> ·{' '}
          <Link to="/social/info/$page" params={{ page: 'privacy' }}>Privacy</Link> ·{' '}
          <Link to="/social/info/$page" params={{ page: 'contact' }}>Contact</Link> ·{' '}
          <Link to="/social/info/$page" params={{ page: 'help' }}>Help</Link>
        </p>
      </div>
    </div>
  )
}

export const MOODS = ['online', 'curious', 'grounded', 'making', 'reflective', 'hopeful', 'dreaming', 'steady', 'happy', 'tired', 'inspired', 'chill']
export const ACCENTS = ['#3b5998', '#b5179e', '#2d6a4f', '#f77f00', '#3a0ca3', '#e63946', '#0077b6', '#7209b7', '#06a77d', '#d90429']

export function chips(text: string) {
  return (text || '')
    .split(/[,·]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
