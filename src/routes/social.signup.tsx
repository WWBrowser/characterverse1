import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { CvsShell, Panel, PixelAvatar, ACCENTS, MOODS } from '../lib/social-ui'

function SignupPage() {
  const navigate = useNavigate()
  const [f, setF] = useState({
    handle: '', email: '', password: '', displayName: '',
    region: '', pronouns: '', mood: 'online', accent: ACCENTS[0],
    headline: '', values: '', interests: '', bio: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await fetch('/api/social/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error || 'Could not create account.'); return }
    navigate({ to: '/social/u/$handle', params: { handle: data.member.handle } })
  }

  return (
    <CvsShell active="join">
      <div className="cvs-main" style={{ maxWidth: 760 }}>
        <Panel title="Create your human account — join the Human Anchor Network" tone="green">
          <p style={{ marginBottom: 12, fontSize: 12, color: '#3a4a70' }}>
            CVS is for real people. Pick a handle, anchor yourself with a few values and interests, and you&apos;re in.
          </p>
          <form onSubmit={submit}>
            {error && <div className="cvs-error">{error}</div>}
            <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <PixelAvatar seed={f.handle || 'you'} accent={f.accent} size={110} />
                <div style={{ fontSize: 11, color: '#5a6785', marginTop: 4 }}>live avatar</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 120, marginTop: 8 }}>
                  {ACCENTS.map((c) => (
                    <button type="button" key={c} onClick={() => setF((p) => ({ ...p, accent: c }))}
                      aria-label={`accent ${c}`}
                      style={{ width: 20, height: 20, background: c, border: f.accent === c ? '2px solid #14213d' : '1px solid #999', cursor: 'pointer', borderRadius: 3 }} />
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div className="cvs-field"><label>Handle *</label><input className="cvs-input" value={f.handle} onChange={set('handle')} placeholder="e.g. ada (letters, numbers, _)" required /></div>
                <div className="cvs-field"><label>Display name</label><input className="cvs-input" value={f.displayName} onChange={set('displayName')} /></div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="cvs-field" style={{ flex: 1 }}><label>E-mail *</label><input className="cvs-input" type="email" value={f.email} onChange={set('email')} required /></div>
                  <div className="cvs-field" style={{ flex: 1 }}><label>Password * (8+)</label><input className="cvs-input" type="password" value={f.password} onChange={set('password')} required /></div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="cvs-field" style={{ flex: 1, minWidth: 150 }}><label>Region</label><input className="cvs-input" value={f.region} onChange={set('region')} placeholder="City, Country" /></div>
              <div className="cvs-field" style={{ flex: 1, minWidth: 120 }}><label>Pronouns</label><input className="cvs-input" value={f.pronouns} onChange={set('pronouns')} /></div>
              <div className="cvs-field" style={{ minWidth: 130 }}><label>Mood</label>
                <select className="cvs-select" value={f.mood} onChange={set('mood')}>{MOODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              </div>
            </div>
            <div className="cvs-field"><label>Headline — your personal ethos</label><input className="cvs-input" value={f.headline} onChange={set('headline')} placeholder="One line that anchors you" /></div>
            <div className="cvs-field"><label>Core values (comma or · separated)</label><input className="cvs-input" value={f.values} onChange={set('values')} placeholder="Honesty · Curiosity · Craft" /></div>
            <div className="cvs-field"><label>Interests</label><input className="cvs-input" value={f.interests} onChange={set('interests')} placeholder="photography, tide pools, bread" /></div>
            <div className="cvs-field"><label>About you</label><textarea className="cvs-textarea" value={f.bio} onChange={set('bio')} /></div>

            <button className="cvs-btn primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account & enter'}</button>
            <span style={{ marginLeft: 12, fontSize: 12 }}>Already a member? <Link to="/social/login">Log in</Link></span>
          </form>
        </Panel>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/signup')({
  component: SignupPage,
})
