import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { formatViews, timeAgo } from './cvv.js'

// Shared retro chrome for every CVV surface — the "Broadcast Yourself" top bar,
// the video card used on the grid/channel pages, and the shared row types the
// pages fetch. Kept client-safe (no DB / node imports) so pages can import freely.

export type VideoListItem = {
  id: number
  title: string
  category: string
  poster: string
  durationLabel: string
  views: number
  likes: number
  hasFile?: boolean
  createdAt: string | null
  channelId?: number
  channelHandle?: string
  channelName?: string
  channelAvatar?: string
  channelAccent?: string
  isAgent?: boolean
}

export type CvvChannel = {
  id: number
  handle: string
  name: string
  tagline: string
  avatar: string
  accent: string
  isAgent: boolean
  subscriberCount: number
  agentCharacterId?: number | null
}

const NAV = [
  { to: '/cvv', label: 'Home' },
  { to: '/cvv/upload', label: 'Upload' },
]

export function CvvShell({
  active,
  children,
}: {
  active: 'home' | 'upload' | 'watch' | 'channel'
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  return (
    <div className="cvv">
      <div className="cvv-bar">
        <div className="cvv-wrap cvv-bar-inner">
          <Link to="/cvv" className="cvv-logo">
            <b>CharacterVerse</b>
            <span className="tv">VIDEO</span>
          </Link>
          <span className="cvv-tag" style={{ display: 'none' }}>Broadcast Yourself™</span>

          <form
            className="cvv-search"
            onSubmit={(e) => {
              e.preventDefault()
              navigate({ to: '/cvv', search: (prev: any) => ({ ...prev, q: q.trim() || undefined }) })
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tapes, channels…"
              aria-label="Search CVV"
            />
            <button type="submit">Search</button>
          </form>

          <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`cvv-navlink${
                  (active === 'home' && n.to === '/cvv') || (active === 'upload' && n.to === '/cvv/upload')
                    ? ' active'
                    : ''
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="cvv-wrap" style={{ padding: '1.25rem 1rem 4rem' }}>
        {children}
      </div>
    </div>
  )
}

export function VideoCard({ v }: { v: VideoListItem }) {
  return (
    <Link to="/cvv/watch/$id" params={{ id: String(v.id) }} className="cvv-card">
      <div className="cvv-poster">
        <span>{v.poster || '🎬'}</span>
        {v.isAgent && <span className="cvv-agentflag">Agent</span>}
        <div className="cvv-playbadge">
          <span style={{ fontSize: '2.4rem', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}>▶</span>
        </div>
        {v.durationLabel && <span className="cvv-duration">{v.durationLabel}</span>}
      </div>
      <div className="cvv-vtitle">{v.title}</div>
      {v.channelName && (
        <div className="cvv-vmeta" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>{v.channelAvatar}</span>
          <span>{v.channelName}</span>
        </div>
      )}
      <div className="cvv-vmeta">
        {formatViews(v.views)} views · {timeAgo(v.createdAt)}
      </div>
    </Link>
  )
}
