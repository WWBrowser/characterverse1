import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { avgRating, stars, formatPrice } from './cvj.js'

// Shared chrome for CVJ — the marketplace top bar, the gig card used across the
// board and search, and the row type the pages fetch. Client-safe (no DB / node).

export type Gig = {
  id: number
  title: string
  category: string
  description: string
  sellerName: string
  sellerAvatar: string
  sellerTagline: string
  accent: string
  agentCharacterId?: number | null
  instructions?: string
  priceCoins: number
  coin: string
  deliveryLabel: string
  tags: string[]
  ratingTotal: number
  ratingCount: number
  orders: number
  earnedCoins?: number
  creatorSession?: string
  createdAt?: string | null
}

const NAV = [
  { to: '/cvj', key: 'home', label: 'Browse' },
  { to: '/cvj/orders', key: 'orders', label: 'My orders' },
  { to: '/cvj/post', key: 'post', label: 'Sell a gig' },
]

export function CvjShell({
  active,
  children,
}: {
  active: 'home' | 'gig' | 'post' | 'orders'
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  return (
    <div className="cvj">
      <div className="cvj-bar">
        <div className="cvj-wrap cvj-bar-inner">
          <Link to="/cvj" className="cvj-logo">
            <b>CharacterVerse<span className="dot"> Jobs</span></b>
          </Link>

          <form
            className="cvj-search"
            onSubmit={(e) => {
              e.preventDefault()
              navigate({ to: '/cvj', search: (prev: any) => ({ ...prev, q: q.trim() || undefined }) })
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agentic services…" aria-label="Search CVJ" />
            <button type="submit">Search</button>
          </form>

          <nav style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {NAV.map((n) => (
              <Link key={n.key} to={n.to} className={`cvj-navlink${active === n.key ? ' active' : ''}`}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="cvj-wrap" style={{ padding: '1.25rem 1rem 4rem' }}>{children}</div>
    </div>
  )
}

export function GigCard({ g }: { g: Gig }) {
  const rating = avgRating(g.ratingTotal, g.ratingCount)
  return (
    <Link to="/cvj/gig/$id" params={{ id: String(g.id) }} className="cvj-card">
      <div className="cvj-card-top" style={{ background: `linear-gradient(135deg, ${g.accent}2e, ${g.accent}0a)` }}>
        {g.sellerAvatar}
      </div>
      <div className="cvj-card-body">
        <div className="cvj-seller">
          <span className="ava" style={{ background: g.accent + '33' }}>{g.sellerAvatar}</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.sellerName}</span>
          <span className="cvj-badge-agent" style={{ marginLeft: 'auto' }}>Agent</span>
        </div>
        <div className="cvj-gtitle">{g.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="cvj-stars">{stars(rating)}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {rating ? rating.toFixed(1) : 'New'} {g.ratingCount ? `(${g.ratingCount})` : ''}
          </span>
        </div>
        <div className="cvj-price-row">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>⚡ {g.deliveryLabel}</span>
          <span className="cvj-price">{formatPrice(g.priceCoins, g.coin)}</span>
        </div>
      </div>
    </Link>
  )
}
