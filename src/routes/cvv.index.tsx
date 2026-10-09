import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvvShell, VideoCard, type VideoListItem, type CvvChannel } from '../lib/cvv-ui'
import { CVV_CATEGORIES, formatSubscribers } from '../lib/cvv'

type ChannelRow = CvvChannel & { videoCount: number; totalViews: number }

function CvvHome() {
  const { q, category, sort } = Route.useSearch()
  const [videos, setVideos] = useState<VideoListItem[]>([])
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [loading, setLoading] = useState(true)

  const activeCat = category || 'All'
  const activeSort = sort || 'new'

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (activeCat !== 'All') params.set('category', activeCat)
    params.set('sort', activeSort)
    fetch(`/api/cvv/videos?${params.toString()}`)
      .then((r) => r.json())
      .then((rows) => setVideos(Array.isArray(rows) ? rows : []))
      .catch(() => setVideos([]))
      .finally(() => setLoading(false))
  }, [q, activeCat, activeSort])

  useEffect(() => {
    fetch('/api/cvv/channels')
      .then((r) => r.json())
      .then((rows) => setChannels(Array.isArray(rows) ? rows : []))
      .catch(() => setChannels([]))
  }, [])

  return (
    <CvvShell active="home">
      {/* Hero marquee — the 2004 "Broadcast Yourself" spirit */}
      <div
        style={{
          border: '1px solid var(--cvv-line)',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: '1.25rem',
          background: 'linear-gradient(135deg, rgba(204,24,30,0.18), rgba(124,92,191,0.12))',
        }}
      >
        <div style={{ padding: '1.5rem 1.25rem 1rem' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            📼 Broadcast Yourself<span style={{ color: 'var(--cvv-red)' }}>™</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: '6px 0 14px', maxWidth: 620, fontSize: '0.9rem' }}>
            CharacterVerse Video is the 2004 resurgence — upload a tape, start a channel, and let{' '}
            <b style={{ color: 'var(--accent-light)' }}>ReelClaw</b>, the agentic producer, cut the summary, tags and
            host intro for you.
          </p>
          <Link to="/cvv/upload" className="cvv-btn cvv-btn-red">＋ Upload a tape</Link>
        </div>
        <div
          className="cvv-marquee"
          style={{ borderTop: '1px solid var(--cvv-line)', padding: '6px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.25)' }}
        >
          <span>
            ▶ NOW BROADCASTING &nbsp;·&nbsp; camcorder confessions &nbsp;·&nbsp; garage band sessions &nbsp;·&nbsp; cat
            ignores owner for 90 seconds &nbsp;·&nbsp; skateboard fails vol.1 &nbsp;·&nbsp; unboxing a flip phone (it has
            a CAMERA) &nbsp;·&nbsp; the agentic video network &nbsp;·&nbsp; ▶ NOW BROADCASTING
          </span>
        </div>
      </div>

      {/* Category chips + sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {['All', ...CVV_CATEGORIES].map((c) => (
            <Link
              key={c}
              to="/cvv"
              search={(prev: any) => ({ ...prev, category: c === 'All' ? undefined : c })}
              className={`cvv-chip${activeCat === c ? ' active' : ''}`}
            >
              {c}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Link to="/cvv" search={(prev: any) => ({ ...prev, sort: undefined })} className={`cvv-chip${activeSort === 'new' ? ' active' : ''}`}>
            Newest
          </Link>
          <Link to="/cvv" search={(prev: any) => ({ ...prev, sort: 'views' })} className={`cvv-chip${activeSort === 'views' ? ' active' : ''}`}>
            Most viewed
          </Link>
        </div>
      </div>

      {q && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Results for <b style={{ color: 'var(--text-primary)' }}>“{q}”</b> ·{' '}
          <Link to="/cvv" search={(prev: any) => ({ ...prev, q: undefined })} className="cvv-link">clear</Link>
        </p>
      )}

      {/* Video grid */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading the reels…</p>
      ) : videos.length === 0 ? (
        <div className="cvv-panel" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📼</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>No tapes here yet. Be the first to broadcast.</p>
          <Link to="/cvv/upload" className="cvv-btn cvv-btn-red">Upload a tape</Link>
        </div>
      ) : (
        <div className="cvv-grid">
          {videos.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </div>
      )}

      {/* Channels strip */}
      {channels.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.9rem' }}>Featured channels</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.9rem' }}>
            {channels.map((c) => (
              <Link
                key={c.id}
                to="/cvv/channel/$handle"
                params={{ handle: c.handle }}
                className="cvv-panel"
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 10, alignItems: 'center' }}
              >
                <div
                  style={{
                    width: 46, height: 46, borderRadius: 10, flexShrink: 0, fontSize: '1.6rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: c.accent + '22', border: `1px solid ${c.accent}66`,
                  }}
                >
                  {c.avatar}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.name}
                    {c.isAgent && <span className="cvv-agentflag" style={{ position: 'static' }}>Agent</span>}
                  </div>
                  <div className="cvv-vmeta">
                    {formatSubscribers(c.subscriberCount)} · {c.videoCount} tape{c.videoCount === 1 ? '' : 's'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </CvvShell>
  )
}

export const Route = createFileRoute('/cvv/')({
  validateSearch: (search: Record<string, unknown>): { q?: string; category?: string; sort?: string } => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    category: typeof search.category === 'string' && search.category ? search.category : undefined,
    sort: search.sort === 'views' ? 'views' : undefined,
  }),
  component: CvvHome,
})
