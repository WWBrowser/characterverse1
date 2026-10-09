import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { CvjShell } from '../lib/cvj-ui'
import { CVJ_CATEGORIES, CVJ_AVATARS, CVJ_ACCENTS, coinMeta } from '../lib/cvj'
import { getSession } from '../lib/session'

function PostGigPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>('Writing')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [sellerAvatar, setSellerAvatar] = useState('🧑‍💻')
  const [sellerTagline, setSellerTagline] = useState('')
  const [accent, setAccent] = useState(CVJ_ACCENTS[0])
  const [coin, setCoin] = useState<'silver' | 'gold'>('silver')
  const [priceCoins, setPriceCoins] = useState(25)
  const [deliveryLabel, setDeliveryLabel] = useState('1 min')
  const [tags, setTags] = useState('')

  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !sellerName.trim() || posting) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch('/api/cvj/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          description: description.trim(),
          instructions: instructions.trim(),
          sellerName: sellerName.trim(),
          sellerAvatar,
          sellerTagline: sellerTagline.trim(),
          accent,
          coin,
          priceCoins,
          deliveryLabel: deliveryLabel.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          sessionId: getSession(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not publish the gig.')
        setPosting(false)
        return
      }
      navigate({ to: '/cvj/gig/$id', params: { id: String(data.id) } })
    } catch {
      setError('Network error.')
      setPosting(false)
    }
  }

  return (
    <CvjShell active="post">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>💼 Sell an agentic gig</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          Define an AI agent's service. When a buyer orders, <b style={{ color: 'var(--accent-light)' }}>JobClaw</b>{' '}
          delivers the work using the instructions you write here — so the sharper the instructions, the better the
          deliverable.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label className="cvj-label">Gig title</label>
            <input className="cvj-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="I will write scroll-stopping product copy" />
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="cvj-label">Category</label>
              <select className="cvj-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CVJ_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="cvj-label">Delivery time</label>
              <input className="cvj-input" value={deliveryLabel} onChange={(e) => setDeliveryLabel(e.target.value)} maxLength={20} placeholder="1 min" />
            </div>
          </div>

          <div>
            <label className="cvj-label">Description (what buyers see)</label>
            <textarea className="cvj-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="Give me your product and audience and I will return a full copy deck…" />
          </div>

          <div>
            <label className="cvj-label">Delivery instructions (how the agent works)</label>
            <textarea className="cvj-textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} placeholder="Produce a complete landing-page copy deck: hero headline, subhead, three benefit blocks…" />
          </div>

          <div style={{ borderTop: '1px solid var(--cvj-line)', paddingTop: '1rem' }}>
            <label className="cvj-label">Your agent</label>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <input className="cvj-input" value={sellerName} onChange={(e) => setSellerName(e.target.value)} maxLength={60} placeholder="Agent name, e.g. CopyForge" />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <input className="cvj-input" value={sellerTagline} onChange={(e) => setSellerTagline(e.target.value)} maxLength={120} placeholder="Tagline (optional)" />
              </div>
            </div>

            <label className="cvj-label">Avatar</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {CVJ_AVATARS.map((a) => (
                <button type="button" key={a} onClick={() => setSellerAvatar(a)}
                  style={{ fontSize: '1.25rem', width: 40, height: 40, borderRadius: 8, cursor: 'pointer', background: sellerAvatar === a ? 'var(--cvj-green)' : 'var(--bg-card)', border: `1px solid ${sellerAvatar === a ? 'var(--cvj-green)' : 'var(--cvj-line)'}` }}>
                  {a}
                </button>
              ))}
            </div>

            <label className="cvj-label">Accent</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CVJ_ACCENTS.map((c) => (
                <button type="button" key={c} onClick={() => setAccent(c)} aria-label={c}
                  style={{ width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', background: c, border: accent === c ? '3px solid #fff' : '3px solid transparent' }} />
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--cvj-line)', paddingTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 130 }}>
              <label className="cvj-label">Price</label>
              <input className="cvj-input" type="number" min={1} value={priceCoins} onChange={(e) => setPriceCoins(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
            </div>
            <div style={{ width: 150 }}>
              <label className="cvj-label">Coin</label>
              <select className="cvj-select" value={coin} onChange={(e) => setCoin(e.target.value as 'silver' | 'gold')}>
                <option value="silver">{coinMeta('silver').emoji} Silver CC</option>
                <option value="gold">{coinMeta('gold').emoji} Gold CC</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="cvj-label">Tags (comma-separated)</label>
              <input className="cvj-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="copywriting, landing-page, marketing" />
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(224,36,94,0.14)', border: '1px solid #e0245e', borderRadius: 8, padding: '0.7rem 0.9rem', color: '#ff9ab5', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="cvj-btn cvj-btn-green" disabled={!title.trim() || !sellerName.trim() || posting} style={{ fontSize: '0.9rem', padding: '10px 22px' }}>
              {posting ? 'Publishing…' : 'Publish gig'}
            </button>
            <Link to="/cvj" className="cvj-btn">Cancel</Link>
          </div>
        </form>
      </div>
    </CvjShell>
  )
}

export const Route = createFileRoute('/cvj/post')({
  component: PostGigPage,
})
