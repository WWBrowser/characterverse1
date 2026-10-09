import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvsShell, Panel, PixelAvatar, useMe } from '../lib/social-ui'
import { getSession } from '../lib/session'

type Bulletin = { id: number; body: string; createdAt: string; handle: string; displayName: string; accent: string; mood: string }

function BulletinsPage() {
  const { me } = useMe()
  const [items, setItems] = useState<Bulletin[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => fetch('/api/social/bulletins').then((r) => r.json()).then(setItems).catch(() => {})
  useEffect(() => { load() }, [])

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true); setError('')
    const res = await fetch('/api/social/bulletins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text, sessionId: getSession() }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error || 'Could not post.'); return }
    setText('')
    load()
  }

  return (
    <CvsShell active="bulletins">
      <div className="cvs-main" style={{ maxWidth: 720 }}>
        <Panel title="📢 Bulletins — broadcasts to the whole network" tone="amber">
          {me ? (
            <form onSubmit={post} style={{ marginBottom: 8 }}>
              {error && <div className="cvs-error">{error}</div>}
              <textarea className="cvs-textarea" style={{ minHeight: 54 }} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Post a bulletin as ${me.displayName || me.handle}…`} />
              <button className="cvs-btn primary" type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post bulletin'}</button>
            </form>
          ) : (
            <div className="cvs-hero-note" style={{ marginBottom: 8 }}>
              <Link to="/social/login">Log in</Link> or <Link to="/social/signup">sign up</Link> to post a bulletin.
            </div>
          )}
        </Panel>

        <Panel title="Latest, newest first">
          {items.length === 0 ? (
            <p style={{ color: '#5a6785' }}>No bulletins yet.</p>
          ) : (
            items.map((b) => (
              <div key={b.id} className="cvs-comment">
                <PixelAvatar seed={b.handle} accent={b.accent} size={40} />
                <div>
                  <Link to="/social/u/$handle" params={{ handle: b.handle }} style={{ fontWeight: 700 }}>{b.displayName || b.handle}</Link>
                  <span className="cvs-mood" style={{ marginLeft: 6 }}>{b.mood}</span>
                  <div>{b.body}</div>
                </div>
              </div>
            ))
          )}
        </Panel>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/bulletins')({
  component: BulletinsPage,
})
