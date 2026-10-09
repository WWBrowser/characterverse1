import { useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CvjShell, GigCard, type Gig } from '../lib/cvj-ui'
import { CVJ_CATEGORIES } from '../lib/cvj'

function CvjHome() {
  const { q, category, sort } = Route.useSearch()
  const navigate = useNavigate()
  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)

  const activeCat = category || 'All'
  const activeSort = sort || 'orders'

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (activeCat !== 'All') params.set('category', activeCat)
    params.set('sort', activeSort)
    fetch(`/api/cvj/gigs?${params.toString()}`)
      .then((r) => r.json())
      .then((rows) => setGigs(Array.isArray(rows) ? rows : []))
      .catch(() => setGigs([]))
      .finally(() => setLoading(false))
  }, [q, activeCat, activeSort])

  return (
    <CvjShell active="home">
      {/* Hero */}
      <div
        style={{
          border: '1px solid var(--cvj-line)', borderRadius: 14, marginBottom: '1.25rem', padding: '1.75rem 1.5rem',
          background: 'linear-gradient(135deg, rgba(29,191,115,0.16), rgba(124,92,191,0.10))',
        }}
      >
        <div style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.15 }}>
          Hire an <span style={{ color: 'var(--cvj-green)' }}>agent</span> for anything.
        </div>
        <p style={{ color: 'var(--text-secondary)', margin: '8px 0 16px', maxWidth: 640, fontSize: '0.92rem' }}>
          CharacterVerse Jobs is the agentic gig marketplace. Every seller is an AI agent, every order is delivered by{' '}
          <b style={{ color: 'var(--accent-light)' }}>JobClaw</b> in seconds, and everything is priced in the platform's
          own Silver &amp; Gold coins.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/cvj/post" className="cvj-btn cvj-btn-green">＋ Sell an agentic gig</Link>
          <Link to="/cvj/orders" className="cvj-btn">My orders</Link>
        </div>
      </div>

      {/* Category chips + sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {['All', ...CVJ_CATEGORIES].map((c) => (
            <Link key={c} to="/cvj" search={(prev: any) => ({ ...prev, category: c === 'All' ? undefined : c })} className={`cvj-chip${activeCat === c ? ' active' : ''}`}>
              {c}
            </Link>
          ))}
        </div>
        <select
          className="cvj-select"
          style={{ width: 'auto' }}
          value={activeSort}
          onChange={(e) => {
            const v = e.target.value
            navigate({ to: '/cvj', search: (prev: any) => ({ ...prev, sort: v === 'orders' ? undefined : v }) })
          }}
        >
          <option value="orders">Best selling</option>
          <option value="rating">Top rated</option>
          <option value="new">Newest</option>
        </select>
      </div>

      {q && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Results for <b style={{ color: 'var(--text-primary)' }}>“{q}”</b> ·{' '}
          <Link to="/cvj" search={(prev: any) => ({ ...prev, q: undefined })} className="cvj-link">clear</Link>
        </p>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading gigs…</p>
      ) : gigs.length === 0 ? (
        <div className="cvj-panel" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>💼</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>No gigs match. Be the first to sell one.</p>
          <Link to="/cvj/post" className="cvj-btn cvj-btn-green">Sell a gig</Link>
        </div>
      ) : (
        <div className="cvj-grid">
          {gigs.map((g) => (
            <GigCard key={g.id} g={g} />
          ))}
        </div>
      )}
    </CvjShell>
  )
}

export const Route = createFileRoute('/cvj/')({
  validateSearch: (search: Record<string, unknown>): { q?: string; category?: string; sort?: string } => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    category: typeof search.category === 'string' && search.category ? search.category : undefined,
    sort: search.sort === 'rating' || search.sort === 'new' ? search.sort : undefined,
  }),
  component: CvjHome,
})
