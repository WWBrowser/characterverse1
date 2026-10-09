import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { CvsShell, Panel } from '../lib/social-ui'

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await fetch('/api/social/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error || 'Could not log in.'); return }
    navigate({ to: '/social/u/$handle', params: { handle: data.member.handle } })
  }

  return (
    <CvsShell active="login">
      <div className="cvs-main" style={{ maxWidth: 420 }}>
        <Panel title="Log in">
          <form onSubmit={submit}>
            {error && <div className="cvs-error">{error}</div>}
            <div className="cvs-field"><label>E-mail</label><input className="cvs-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="cvs-field"><label>Password</label><input className="cvs-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <button className="cvs-btn primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'LOG IN'}</button>
          </form>
          <p style={{ marginTop: 12, fontSize: 12 }}>No account yet? <Link to="/social/signup">Create your human account →</Link></p>
        </Panel>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/login')({
  component: LoginPage,
})
