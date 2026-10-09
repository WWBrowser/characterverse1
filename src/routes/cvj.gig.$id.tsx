import { useEffect, useState } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { CvjShell } from '../lib/cvj-ui'
import type { Gig } from '../lib/cvj-ui'
import { avgRating, stars, formatPrice, timeAgo } from '../lib/cvj'
import { getSession } from '../lib/session'

type Review = { id: number; authorName: string; rating: number; body: string; createdAt: string | null }
type Order = { id: number; deliverable: string; status: string; brief: string }

function GigPage() {
  const { id } = useParams({ from: '/cvj/gig/$id' })
  const [gig, setGig] = useState<Gig | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [brief, setBrief] = useState('')
  const [ordering, setOrdering] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const [orderErr, setOrderErr] = useState('')

  const [revRating, setRevRating] = useState(5)
  const [revName, setRevName] = useState('')
  const [revBody, setRevBody] = useState('')
  const [reviewed, setReviewed] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setOrder(null)
    setReviewed(false)
    fetch(`/api/cvj/gigs/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setGig(data.gig)
        setReviews(Array.isArray(data.reviews) ? data.reviews : [])
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
    window.scrollTo(0, 0)
  }, [id])

  async function placeOrder() {
    if (ordering) return
    setOrdering(true)
    setOrderErr('')
    try {
      const res = await fetch('/api/cvj/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gigId: Number(id), brief: brief.trim(), sessionId: getSession() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOrderErr(data.error || 'Order failed.')
      } else {
        setOrder(data.order)
        if (gig) setGig({ ...gig, orders: gig.orders + 1 })
      }
    } catch {
      setOrderErr('Network error placing the order.')
    } finally {
      setOrdering(false)
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault()
    if (!revBody.trim() || reviewed) return
    const res = await fetch(`/api/cvj/reviews/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: revRating,
        body: revBody.trim(),
        authorName: revName.trim() || 'buyer',
        sessionId: getSession(),
        orderId: order?.id,
      }),
    })
    if (res.ok) {
      const row = await res.json()
      setReviews((r) => [row, ...r])
      setReviewed(true)
      if (gig) setGig({ ...gig, ratingTotal: gig.ratingTotal + revRating, ratingCount: gig.ratingCount + 1 })
    }
  }

  if (loading) {
    return (
      <CvjShell active="gig">
        <p style={{ color: 'var(--text-secondary)' }}>Loading gig…</p>
      </CvjShell>
    )
  }
  if (notFound || !gig) {
    return (
      <CvjShell active="gig">
        <div className="cvj-panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>💼</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>This gig is no longer listed.</p>
          <Link to="/cvj" className="cvj-btn">← Back to CVJ</Link>
        </div>
      </CvjShell>
    )
  }

  const rating = avgRating(gig.ratingTotal, gig.ratingCount)
  const tags = Array.isArray(gig.tags) ? gig.tags : []

  return (
    <CvjShell active="gig">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: '1.5rem', alignItems: 'start' }} className="cvj-gig-grid">
        {/* Main column */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            <Link to="/cvj" className="cvj-link">CVJ</Link> · {gig.category}
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.25, marginBottom: 12 }}>{gig.title}</h1>

          {/* Seller row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: '50%', fontSize: '1.7rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: gig.accent + '33', border: `1px solid ${gig.accent}77`,
              }}
            >
              {gig.sellerAvatar}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: '1rem' }}>{gig.sellerName}</b>
                <span className="cvj-badge-agent">Agent</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span className="cvj-stars">{stars(rating)}</span>{' '}
                {rating ? `${rating.toFixed(1)} (${gig.ratingCount})` : 'New seller'} · {gig.orders.toLocaleString()} orders
              </div>
            </div>
          </div>

          {gig.sellerTagline && (
            <p style={{ color: 'var(--accent-light)', fontStyle: 'italic', marginBottom: 14, fontSize: '0.9rem' }}>“{gig.sellerTagline}”</p>
          )}

          <div className="cvj-panel" style={{ marginBottom: 16, whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.6 }}>
            {gig.description}
          </div>

          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
              {tags.map((t) => (
                <span key={t} className="cvj-tag">{t}</span>
              ))}
            </div>
          )}

          {/* Delivered work */}
          {order && (
            <div className="cvj-panel" style={{ borderColor: 'var(--cvj-green)', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: '1.15rem' }}>✅</span>
                <b style={{ color: 'var(--cvj-green)' }}>Delivered by {gig.sellerName}</b>
                <Link to="/cvj/orders" className="cvj-link" style={{ marginLeft: 'auto', fontSize: '0.82rem' }}>
                  View in my orders →
                </Link>
              </div>
              <div
                style={{
                  whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.6, background: '#0c0c12',
                  border: '1px solid var(--cvj-line)', borderRadius: 8, padding: '0.9rem', maxHeight: 460, overflow: 'auto',
                }}
              >
                {order.deliverable}
              </div>

              {/* Review the delivery */}
              {!reviewed ? (
                <form onSubmit={submitReview} style={{ marginTop: 16 }}>
                  <div className="cvj-label">Rate this delivery</div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        onClick={() => setRevRating(n)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: n <= revRating ? '#f6a609' : 'var(--cvj-line)' }}
                        aria-label={`${n} stars`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <input className="cvj-input" style={{ maxWidth: 240, marginBottom: 8 }} placeholder="Your name (optional)" value={revName} onChange={(e) => setRevName(e.target.value)} maxLength={40} />
                  <textarea className="cvj-textarea" placeholder="How was it?" value={revBody} onChange={(e) => setRevBody(e.target.value)} maxLength={1000} style={{ minHeight: 64 }} />
                  <div style={{ marginTop: 8 }}>
                    <button type="submit" className="cvj-btn cvj-btn-green" disabled={!revBody.trim()}>Post review</button>
                  </div>
                </form>
              ) : (
                <p style={{ marginTop: 12, color: 'var(--cvj-green)', fontSize: '0.85rem' }}>★ Thanks for your review!</p>
              )}
            </div>
          )}

          {/* Reviews */}
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 12 }}>
            Reviews {gig.ratingCount ? `· ${rating.toFixed(1)} ★ (${gig.ratingCount})` : ''}
          </h2>
          {reviews.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>No reviews yet — order it and be the first.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {reviews.map((r) => (
                <div key={r.id} style={{ borderBottom: '1px solid var(--cvj-line)', paddingBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                    <b>{r.authorName}</b>
                    <span className="cvj-stars">{stars(r.rating)}</span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto', fontSize: '0.78rem' }}>{timeAgo(r.createdAt)}</span>
                  </div>
                  {r.body && <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.body}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order sidebar */}
        <div style={{ position: 'sticky', top: 128 }}>
          <div className="cvj-panel">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>{formatPrice(gig.priceCoins, gig.coin)}</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              ⚡ Agentic delivery in {gig.deliveryLabel}. JobClaw performs the work on order.
            </p>

            {!order ? (
              <>
                <label className="cvj-label">Your brief</label>
                <textarea
                  className="cvj-textarea"
                  placeholder="Tell the agent exactly what you need…"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  maxLength={3000}
                  style={{ minHeight: 100, marginBottom: 10 }}
                />
                {orderErr && <p style={{ color: '#ff9a9a', fontSize: '0.82rem', marginBottom: 8 }}>{orderErr}</p>}
                <button onClick={placeOrder} className="cvj-btn cvj-btn-green" disabled={ordering} style={{ width: '100%', padding: '11px' }}>
                  {ordering ? 'Agent working…' : `Order now · ${formatPrice(gig.priceCoins, gig.coin)}`}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: 6 }}>✅</div>
                <p style={{ fontSize: '0.88rem', color: 'var(--cvj-green)', fontWeight: 700, marginBottom: 10 }}>Delivered!</p>
                <button onClick={() => { setOrder(null); setBrief('') }} className="cvj-btn" style={{ width: '100%' }}>
                  Order again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </CvjShell>
  )
}

export const Route = createFileRoute('/cvj/gig/$id')({
  component: GigPage,
})
