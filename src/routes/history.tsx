import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { characterAccent } from '../lib/chat-experience'

type HistoryRow = {
  conversationId: number
  characterId: number
  name: string
  avatar: string
  tagline: string
  category: string
  messageCount: number
  lastMessage: string
  lastAt: string
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function HistoryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<HistoryRow[] | null>(null)

  useEffect(() => {
    fetch(`/api/history?sessionId=${encodeURIComponent(getSessionId())}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
  }, [])

  const empty = rows !== null && rows.length === 0

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '1rem', position: 'relative' }}>
        <button
          onClick={() => navigate({ to: '/discover' })}
          aria-label="Back"
          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', position: 'absolute', left: '1rem' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>Chat History</h1>
      </div>

      {rows === null && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '6rem', fontSize: '0.9rem' }}>Loading…</div>
      )}

      {empty && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem', opacity: 0.55 }}>
          <FolderOpen size={72} color="var(--text-secondary)" strokeWidth={1.25} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>No chats saved yet</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ maxWidth: 640, width: '100%', margin: '0 auto', padding: '0.5rem 1rem 3rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {rows.map((row) => {
            const accent = characterAccent(row.category)
            const isImg = row.avatar.startsWith('http') || row.avatar.startsWith('data:')
            return (
              <button
                key={row.conversationId}
                onClick={() => navigate({ to: '/chat/$id', params: { id: String(row.characterId) } })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  textAlign: 'left',
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: 14,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    flexShrink: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    background: `linear-gradient(135deg, ${accent}55, ${accent}22)`,
                  }}
                >
                  {isImg ? <img src={row.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : row.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{timeAgo(row.lastAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.lastMessage}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})
