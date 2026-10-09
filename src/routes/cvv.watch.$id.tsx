import { useEffect, useState } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { CvvShell, VideoCard, type VideoListItem } from '../lib/cvv-ui'
import { formatViews, formatSubscribers, timeAgo, formatBytes, type CvvReel } from '../lib/cvv'
import { getSession } from '../lib/session'

type WatchVideo = {
  id: number
  channelId: number
  title: string
  description: string
  category: string
  blobKey: string
  mimeType: string
  sizeBytes: number
  durationLabel: string
  poster: string
  tags: string[]
  reel: Partial<CvvReel>
  views: number
  likes: number
  creatorSession: string
  createdAt: string | null
}
type WatchChannel = {
  id: number
  handle: string
  name: string
  tagline: string
  avatar: string
  accent: string
  isAgent: boolean
  subscriberCount: number
}
type Comment = { id: number; authorName: string; body: string; createdAt: string | null }

function WatchPage() {
  const { id } = useParams({ from: '/cvv/watch/$id' })
  const [video, setVideo] = useState<WatchVideo | null>(null)
  const [channel, setChannel] = useState<WatchChannel | null>(null)
  const [related, setRelated] = useState<VideoListItem[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [likes, setLikes] = useState(0)
  const [liked, setLiked] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [subCount, setSubCount] = useState(0)

  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  // Load the tape + its channel. The GET counts a view server-side.
  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    fetch(`/api/cvv/videos/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setVideo(data.video)
        setChannel(data.channel)
        setLikes(data.video.likes)
        setSubCount(data.channel.subscriberCount)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
    window.scrollTo(0, 0)
  }, [id])

  // Comments + subscription state + related tapes.
  useEffect(() => {
    fetch(`/api/cvv/comments/${id}`).then((r) => r.json()).then((c) => setComments(Array.isArray(c) ? c : [])).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!channel) return
    const s = getSession()
    fetch(`/api/cvv/channel/${channel.handle}?sessionId=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((data) => setSubscribed(!!data.subscribed))
      .catch(() => {})
    fetch(`/api/cvv/videos?category=${encodeURIComponent(channel ? video?.category || '' : '')}&limit=12`)
      .then((r) => r.json())
      .then((rows: VideoListItem[]) => setRelated((Array.isArray(rows) ? rows : []).filter((v) => String(v.id) !== id).slice(0, 8)))
      .catch(() => {})
  }, [channel, id, video?.category])

  function like() {
    if (liked) return
    setLiked(true)
    setLikes((n) => n + 1)
    fetch(`/api/cvv/videos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like' }),
    })
      .then((r) => r.json())
      .then((d) => typeof d.likes === 'number' && setLikes(d.likes))
      .catch(() => {})
  }

  function toggleSub() {
    if (!channel) return
    fetch(`/api/cvv/channel/${channel.handle}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSession() }),
    })
      .then((r) => r.json())
      .then((d) => {
        setSubscribed(!!d.subscribed)
        if (typeof d.subscriberCount === 'number') setSubCount(d.subscriberCount)
      })
      .catch(() => {})
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || posting) return
    setPosting(true)
    try {
      const res = await fetch(`/api/cvv/comments/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), authorName: name.trim() || 'guest', sessionId: getSession() }),
      })
      if (res.ok) {
        const row = await res.json()
        setComments((c) => [row, ...c])
        setBody('')
      }
    } finally {
      setPosting(false)
    }
  }

  if (loading) {
    return (
      <CvvShell active="watch">
        <p style={{ color: 'var(--text-secondary)' }}>Loading tape…</p>
      </CvvShell>
    )
  }
  if (notFound || !video || !channel) {
    return (
      <CvvShell active="watch">
        <div className="cvv-panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📺</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>This tape has been ejected.</p>
          <Link to="/cvv" className="cvv-btn">← Back to CVV</Link>
        </div>
      </CvvShell>
    )
  }

  const reel = video.reel || {}
  const tags = Array.isArray(video.tags) ? video.tags : []

  return (
    <CvvShell active="watch">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1.5rem', alignItems: 'start' }} className="cvv-watch-grid">
        {/* Main column */}
        <div style={{ minWidth: 0 }}>
          {/* Player */}
          {video.blobKey ? (
            <video
              controls
              autoPlay
              playsInline
              src={`/api/cvv/stream/${video.id}`}
              poster={undefined}
              style={{ width: '100%', borderRadius: 10, background: '#000', border: '1px solid var(--cvv-line)', aspectRatio: '16 / 9' }}
            />
          ) : (
            <div className="cvv-broadcast">
              <span className="rec"><i />REC · ARCHIVE REEL</span>
              <span className="big">{video.poster}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                poster-only broadcast — {reel.verdict || 'now playing'}
              </span>
            </div>
          )}

          {/* Title + stats */}
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0.9rem 0 0.4rem', lineHeight: 1.25 }}>{video.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="cvv-vmeta">
              {formatViews(video.views)} views · {timeAgo(video.createdAt)}
              {video.sizeBytes ? ` · ${formatBytes(video.sizeBytes)}` : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={like} className="cvv-btn" disabled={liked} title="Rate this tape">
                👍 {formatViews(likes)}
              </button>
            </div>
          </div>

          {/* Channel row */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12, margin: '1rem 0',
              padding: '0.9rem', border: '1px solid var(--cvv-line)', borderRadius: 10, background: 'var(--cvv-panel)',
            }}
          >
            <Link
              to="/cvv/channel/$handle"
              params={{ handle: channel.handle }}
              style={{
                width: 46, height: 46, borderRadius: 10, flexShrink: 0, fontSize: '1.6rem', textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: channel.accent + '22', border: `1px solid ${channel.accent}66`,
              }}
            >
              {channel.avatar}
            </Link>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link to="/cvv/channel/$handle" params={{ handle: channel.handle }} className="cvv-link" style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                {channel.name}
              </Link>
              {channel.isAgent && <span className="cvv-agentflag" style={{ position: 'static', marginLeft: 8 }}>Agent</span>}
              <div className="cvv-vmeta">{formatSubscribers(subCount)}</div>
            </div>
            <button onClick={toggleSub} className={`cvv-btn${subscribed ? '' : ' cvv-btn-red'}`}>
              {subscribed ? '✓ Subscribed' : 'Subscribe'}
            </button>
          </div>

          {/* ReelClaw producer package — the agentic touch */}
          {(reel.hostIntro || reel.summary) && (
            <div className="cvv-panel" style={{ borderColor: 'rgba(124,92,191,0.4)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '1.1rem' }}>🐾</span>
                <b style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-light)' }}>
                  ReelClaw · Producer's cut
                </b>
              </div>
              {reel.hostIntro && <p style={{ fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: 6 }}>“{reel.hostIntro}”</p>}
              {reel.summary && <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: tags.length ? 10 : 0 }}>{reel.summary}</p>}
              {tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {tags.map((t) => (
                    <span key={t} className="cvv-tagpill">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {video.description && (
            <div className="cvv-panel" style={{ marginBottom: '1.5rem', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              {video.description}
            </div>
          )}

          {/* Comments */}
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            {comments.length} comment{comments.length === 1 ? '' : 's'}
          </h2>
          <form onSubmit={postComment} style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="cvv-input" style={{ maxWidth: 200 }} placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </div>
            <textarea className="cvv-textarea" placeholder="Post a comment…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} style={{ minHeight: 70 }} />
            <div style={{ marginTop: 8 }}>
              <button type="submit" className="cvv-btn cvv-btn-red" disabled={!body.trim() || posting}>
                {posting ? 'Posting…' : 'Post comment'}
              </button>
            </div>
          </form>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                <div
                  style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-hover)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-light)',
                  }}
                >
                  {(c.authorName || 'g')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem' }}>
                    <b>{c.authorName || 'guest'}</b>{' '}
                    <span className="cvv-vmeta">· {timeAgo(c.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Related sidebar */}
        <div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.75rem' }}>Up next</h2>
          {related.length === 0 ? (
            <p className="cvv-vmeta">No related tapes yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {related.map((v) => (
                <Link key={v.id} to="/cvv/watch/$id" params={{ id: String(v.id) }} className="cvv-card" style={{ display: 'flex', gap: 10 }}>
                  <div className="cvv-poster" style={{ width: 130, flexShrink: 0, aspectRatio: '16 / 10', fontSize: '2rem' }}>
                    <span>{v.poster}</span>
                    {v.durationLabel && <span className="cvv-duration">{v.durationLabel}</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.25 }}>{v.title}</div>
                    <div className="cvv-vmeta">{v.channelName}</div>
                    <div className="cvv-vmeta">{formatViews(v.views)} views</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </CvvShell>
  )
}

export const Route = createFileRoute('/cvv/watch/$id')({
  component: WatchPage,
})
