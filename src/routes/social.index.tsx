import { useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CvsShell, Panel, PixelAvatar, useMe, type Member } from '../lib/social-ui'

type Bulletin = { id: number; body: string; createdAt: string; handle: string; displayName: string; accent: string; mood: string }

function PersonTile({ m }: { m: Member }) {
  return (
    <Link to="/social/u/$handle" params={{ handle: m.handle }} className="cvs-person">
      <PixelAvatar seed={m.handle} accent={m.accent} size={90} />
      <span className="name">{m.displayName || m.handle}</span>
      <span className="sub">{m.region || '@' + m.handle}</span>
    </Link>
  )
}

function LoginBox({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/social/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error || 'Could not log in.'); return }
    onDone()
  }

  return (
    <Panel title="Member Login">
      <form onSubmit={submit}>
        {error && <div className="cvs-error">{error}</div>}
        <div className="cvs-field">
          <label>E-mail</label>
          <input className="cvs-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="cvs-field">
          <label>Password</label>
          <input className="cvs-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="cvs-btn primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'LOG IN'}
        </button>
      </form>
      <p style={{ marginTop: 10, fontSize: 12 }}>
        New here? <Link to="/social/signup">Create your human account →</Link>
      </p>
    </Panel>
  )
}

function YouBox({ me, onChange }: { me: Member; onChange: () => void }) {
  const [incoming, setIncoming] = useState<Member[]>([])
  useEffect(() => {
    fetch('/api/social/friends').then((r) => r.json()).then((d) => setIncoming(d.incoming || [])).catch(() => {})
  }, [me.id])

  const accept = async (handle: string) => {
    await fetch('/api/social/friends', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, action: 'accept' }),
    })
    setIncoming((prev) => prev.filter((m) => m.handle !== handle))
    onChange()
  }

  return (
    <Panel title="You" tone="green">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <PixelAvatar seed={me.handle} accent={me.accent} size={56} />
        <div>
          <Link to="/social/u/$handle" params={{ handle: me.handle }} style={{ fontWeight: 700 }}>{me.displayName || me.handle}</Link>
          <div style={{ fontSize: 11, color: '#5a6785' }}>@{me.handle}</div>
        </div>
      </div>
      {incoming.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', marginBottom: 6 }}>Friend requests</div>
          {incoming.map((m) => (
            <div key={m.handle} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <PixelAvatar seed={m.handle} accent={m.accent} size={24} />
              <Link to="/social/u/$handle" params={{ handle: m.handle }} style={{ flex: 1 }}>{m.displayName || m.handle}</Link>
              <button className="cvs-btn" onClick={() => accept(m.handle)}>Accept</button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function SocialHome() {
  const { me, refresh } = useMe()
  const [people, setPeople] = useState<Member[]>([])
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const navigate = useNavigate()

  const load = () => {
    fetch('/api/social/members?sort=newest&limit=8').then((r) => r.json()).then(setPeople).catch(() => {})
    fetch('/api/social/bulletins').then((r) => r.json()).then((d) => setBulletins(d.slice(0, 5))).catch(() => {})
  }
  useEffect(load, [])

  return (
    <CvsShell active="home">
      <div className="cvs-main">
        <div className="cvs-grid2">
          <div>
            <Panel title="Welcome to the Human Anchor Network" tone="green">
              <p style={{ marginBottom: 8 }}>
                This is <b>CharacterVerse Social</b> — a small, person-first corner of the web where <b>real humans</b> keep
                profiles, sign each other&apos;s walls, post bulletins, and build trust circles. No ranking. No algorithm.
              </p>
              <p style={{ marginBottom: 10 }}>
                It&apos;s the <b>anchor</b> to CharacterVerse&apos;s agents: people here, agents there — and you decide if and
                when the two ever talk.
              </p>
              {!me && (
                <button className="cvs-btn primary" onClick={() => navigate({ to: '/social/signup' })}>
                  Create your human account →
                </button>
              )}
            </Panel>

            <Panel title="✦ New People" action={<Link to="/social/browse" search={{ q: '' }}>Browse all »</Link>}>
              {people.length === 0 ? (
                <p style={{ color: '#5a6785' }}>Loading the network…</p>
              ) : (
                <div className="cvs-people">
                  {people.map((m) => <PersonTile key={m.id} m={m} />)}
                </div>
              )}
            </Panel>

            <Panel title="📢 Latest Bulletins" tone="amber" action={<Link to="/social/bulletins">See all »</Link>}>
              {bulletins.length === 0 ? (
                <p style={{ color: '#5a6785' }}>No bulletins yet.</p>
              ) : (
                bulletins.map((b) => (
                  <div key={b.id} style={{ padding: '7px 0', borderTop: '1px solid #eef1f8' }}>
                    <Link to="/social/u/$handle" params={{ handle: b.handle }} style={{ fontWeight: 700 }}>{b.displayName || b.handle}</Link>
                    <span style={{ color: '#5a6785' }}> — {b.body}</span>
                  </div>
                ))
              )}
            </Panel>
          </div>

          <div>
            {me ? <YouBox me={me} onChange={load} /> : <LoginBox onDone={() => { refresh(); load() }} />}
            <Panel title="Why CVS?" tone="purple">
              <p style={{ marginBottom: 6 }}>🔒 <b>Real accounts.</b> You sign up and log in as yourself.</p>
              <p style={{ marginBottom: 6 }}>🤝 <b>Trust-based.</b> Friendships are mutual, by request.</p>
              <p style={{ marginBottom: 6 }}>🧭 <b>Person-centric.</b> Identity &amp; values, not engagement metrics.</p>
              <p>🛰️ <b>Agent shadowing is off</b> until you choose to turn it on.</p>
            </Panel>
          </div>
        </div>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/')({
  component: SocialHome,
})
