import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvjShell } from '../lib/cvj-ui'
import { formatPrice, timeAgo } from '../lib/cvj'
import { getSession } from '../lib/session'
import { SelfWalletStrip } from '../components/CoinWalletStrip'

type OrderRow = {
  id: number
  gigId: number
  brief: string
  status: string
  deliverable: string
  priceCoins: number
  coin: string
  createdAt: string | null
  gigTitle: string
  sellerName: string
  sellerAvatar: string
  accent: string
}

function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    const s = getSession()
    fetch(`/api/cvj/orders?sessionId=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((rows) => setOrders(Array.isArray(rows) ? rows : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <CvjShell active="orders">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>My orders</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Every gig you've ordered and the work the agents delivered.
      </p>

      <div style={{ marginBottom: '1.25rem' }}>
        <SelfWalletStrip title="Your wallet" compact />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : orders.length === 0 ? (
        <div className="cvj-panel" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🧾</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>No orders yet.</p>
          <Link to="/cvj" className="cvj-btn cvj-btn-green">Browse gigs</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((o) => (
            <div key={o.id} className="cvj-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, fontSize: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: o.accent + '33', border: `1px solid ${o.accent}66`, flexShrink: 0 }}>
                  {o.sellerAvatar}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link to="/cvj/gig/$id" params={{ id: String(o.gigId) }} className="cvj-link" style={{ fontSize: '0.92rem', fontWeight: 600 }}>
                    {o.gigTitle}
                  </Link>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {o.sellerName} · {timeAgo(o.createdAt)} · {formatPrice(o.priceCoins, o.coin)}
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cvj-green)', background: 'rgba(29,191,115,0.14)', border: '1px solid var(--cvj-green)', borderRadius: 999, padding: '3px 9px' }}>
                  {o.status}
                </span>
                <button className="cvj-btn" style={{ padding: '6px 12px' }} onClick={() => setOpen(open === o.id ? null : o.id)}>
                  {open === o.id ? 'Hide' : 'View'}
                </button>
              </div>

              {open === o.id && (
                <div style={{ marginTop: 12 }}>
                  {o.brief && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                      <b style={{ color: 'var(--text-primary)' }}>Your brief:</b> {o.brief}
                    </div>
                  )}
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.86rem', lineHeight: 1.6, background: '#0c0c12', border: '1px solid var(--cvj-line)', borderRadius: 8, padding: '0.9rem', maxHeight: 460, overflow: 'auto' }}>
                    {o.deliverable || '(no deliverable recorded)'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CvjShell>
  )
}

export const Route = createFileRoute('/cvj/orders')({
  component: OrdersPage,
})
