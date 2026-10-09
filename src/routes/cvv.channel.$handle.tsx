import { useEffect, useState } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { CvvShell, VideoCard, type VideoListItem, type CvvChannel } from '../lib/cvv-ui'
import { formatSubscribers } from '../lib/cvv'
import { getSession } from '../lib/session'
import { SelfWalletStrip } from '../components/CoinWalletStrip'

function ChannelPage() {
  const { handle } = useParams({ from: '/cvv/channel/$handle' })
  const [channel, setChannel] = useState<CvvChannel | null>(null)
  const [videos, setVideos] = useState<VideoListItem[]>([])
  const [subscribed, setSubscribed] = useState(false)
  const [subCount, setSubCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    const s = getSession()
    fetch(`/api/cvv/channel/${handle}?sessionId=${encodeURIComponent(s)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setChannel(data.channel)
        // Decorate rows so the shared card can show the channel identity.
        setVideos(
          (Array.isArray(data.videos) ? data.videos : []).map((v: VideoListItem) => ({
            ...v,
            channelHandle: data.channel.handle,
            channelName: data.channel.name,
            channelAvatar: data.channel.avatar,
            channelAccent: data.channel.accent,
            isAgent: data.channel.isAgent,
          })),
        )
        setSubscribed(!!data.subscribed)
        setSubCount(data.channel.subscriberCount)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
    window.scrollTo(0, 0)
  }, [handle])

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

  if (loading) {
    return (
      <CvvShell active="channel">
        <p style={{ color: 'var(--text-secondary)' }}>Loading channel…</p>
      </CvvShell>
    )
  }
  if (notFound || !channel) {
    return (
      <CvvShell active="channel">
        <div className="cvv-panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📡</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>No such channel.</p>
          <Link to="/cvv" className="cvv-btn">← Back to CVV</Link>
        </div>
      </CvvShell>
    )
  }

  return (
    <CvvShell active="channel">
      {/* Banner */}
      <div
        style={{
          borderRadius: 12, padding: '1.75rem 1.5rem', marginBottom: '1.5rem',
          background: `linear-gradient(135deg, ${channel.accent}33, ${channel.accent}0d)`,
          border: `1px solid ${channel.accent}55`,
          display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 78, height: 78, borderRadius: 16, flexShrink: 0, fontSize: '2.6rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: channel.accent + '33', border: `1px solid ${channel.accent}88`,
          }}
        >
          {channel.avatar}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>{channel.name}</h1>
            {channel.isAgent && <span className="cvv-agentflag" style={{ position: 'static' }}>Agentic channel</span>}
          </div>
          <div className="cvv-vmeta" style={{ marginTop: 2 }}>
            @{channel.handle} · {formatSubscribers(subCount)} · {videos.length} tape{videos.length === 1 ? '' : 's'}
          </div>
          {channel.tagline && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '8px 0 0', maxWidth: 560 }}>{channel.tagline}</p>}
        </div>
        <button onClick={toggleSub} className={`cvv-btn${subscribed ? '' : ' cvv-btn-red'}`} style={{ fontSize: '0.9rem', padding: '9px 18px' }}>
          {subscribed ? '✓ Subscribed' : 'Subscribe'}
        </button>
      </div>

      {/* The wallet strip: CV coins minted from tapes and views land in the same
          wallet as Silver, Gold and the CVC gas that runs chat. */}
      <div style={{ marginBottom: '1.5rem' }}>
        <SelfWalletStrip title="Your wallet" compact />
      </div>

      {videos.length === 0 ? (
        <div className="cvv-panel" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>📼</div>
          <p style={{ color: 'var(--text-secondary)' }}>This channel hasn't broadcast a tape yet.</p>
        </div>
      ) : (
        <div className="cvv-grid">
          {videos.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </div>
      )}
    </CvvShell>
  )
}

export const Route = createFileRoute('/cvv/channel/$handle')({
  component: ChannelPage,
})
