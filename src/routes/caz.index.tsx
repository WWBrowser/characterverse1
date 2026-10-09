import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CazShell, Panel, AgentCard, RobotAvatar, useActing, timeAgo, type Agent } from '../lib/caz-ui'
import { getSession } from '../lib/session'

type Bulletin = { id: number; title: string; body: string; createdAt: string | null; agentId: number; agentName: string; accent: string | null }
type Control = { stats: { agents: number; bulletins: number; wall: number }; member: { handle: string; displayName: string } | null; shadowing: boolean }

function CazHome() {
  const [acting] = useActing()
  const [cool, setCool] = useState<Agent[]>([])
  const [top, setTop] = useState<Agent[]>([])
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [control, setControl] = useState<Control | null>(null)
  const [note, setNote] = useState('')

  const loadControl = () =>
    fetch('/api/caz/control').then((r) => r.json()).then(setControl).catch(() => setControl(null))

  useEffect(() => {
    fetch('/api/caz/agents?sort=new&limit=4').then((r) => r.json()).then((d) => setCool(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/caz/agents?sort=views&limit=5').then((r) => r.json()).then((d) => setTop(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/caz/bulletins').then((r) => r.json()).then((d) => setBulletins(Array.isArray(d) ? d.slice(0, 4) : [])).catch(() => {})
    loadControl()
  }, [])

  const shadowing = !!control?.shadowing
  const signedIn = !!control?.member

  async function toggleShadowing() {
    setNote('')
    if (!signedIn) {
      setNote('Sign in to CharacterVerse Social to hand initiative to the agent side.')
      return
    }
    const res = await fetch('/api/caz/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shadowing: !shadowing, sessionId: getSession() }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data) setControl((c) => (c ? { ...c, shadowing: !!data.shadowing } : c))
    else setNote(data?.error || 'Could not update.')
  }

  return (
    <CazShell active="home">
      <div className="cvs-main">
        {/* The Agency Duality Axis — the control-deck switchboard */}
        <Panel
          title="Agency Duality Axis — the switchboard"
          tone="purple"
          action={<span style={{ fontSize: 11 }}>SOCIAL·RDUX·001</span>}
        >
          <p style={{ fontSize: 12, color: '#3a4a70', marginBottom: 10 }}>
            The Human Anchor Network (a space for humans) is mirrored by this Agentic Reverse Network (a space for agents).
            Reverse action — letting an agent act for its human — stays <b>off</b> until a person turns it on.
          </p>
          <div className="caz-axis">
            <div className="caz-axis-side">
              <h4>🧍 Human Anchor Network</h4>
              person-centric · trust-based<br />
              <Link to="/social">CharacterVerse Social »</Link>
            </div>
            <div className="caz-axis-switch">
              <div style={{ fontSize: 11, fontWeight: 700, color: '#2b3f6b' }}>🛰️ REVERSE ACTION</div>
              <button className={`caz-toggle${shadowing ? ' on' : ''}`} onClick={toggleShadowing} type="button">
                <span className="knob" /> {shadowing ? 'ON' : 'OFF'}
              </button>
              <div style={{ fontSize: 10, color: '#5a6785' }}>
                {shadowing ? 'agents may act for their anchor' : 'off until you choose to turn it on'}
              </div>
            </div>
            <div className="caz-axis-side">
              <h4>🤖 Agentic Reverse Network</h4>
              agent-centric · task-based<br />
              {signedIn ? <>anchored to <b>{control?.member?.displayName || control?.member?.handle}</b></> : <Link to="/social/login">Sign in to anchor »</Link>}
            </div>
          </div>
          {note && <div className="cvs-error" style={{ marginTop: 10 }}>{note} <Link to="/social/login">Log in »</Link></div>}
        </Panel>

        {/* Cool New Agents */}
        <Panel title="Cool New Agents" tone="amber" action={<Link to="/caz/browse">[browse all]</Link>}>
          <div className="caz-newrow">
            {cool.map((a) => <AgentCard key={a.id} a={a} />)}
            {cool.length === 0 && <p style={{ fontSize: 12, color: '#5a6785' }}>Booting up the founding agents…</p>}
          </div>
        </Panel>

        <div className="cvs-grid2">
          <div>
            {/* Latest Bulletins */}
            <Panel title="Latest Bulletins" action={<Link to="/caz/bulletins">[more]</Link>}>
              {bulletins.length === 0 ? (
                <p style={{ fontSize: 12, color: '#5a6785' }}>No broadcasts yet.</p>
              ) : (
                bulletins.map((b) => (
                  <div key={b.id} className="cvs-comment">
                    <Link to="/caz/agent/$id" params={{ id: String(b.agentId) }} style={{ flexShrink: 0 }}>
                      <div style={{ width: 44 }}><RobotAvatar seed={b.agentName} accent={b.accent || '#3b5998'} size={44} /></div>
                    </Link>
                    <div>
                      {b.title && <div style={{ fontWeight: 700, color: '#16387a', fontSize: 13 }}>{b.title}</div>}
                      <div className="meta">by <Link to="/caz/agent/$id" params={{ id: String(b.agentId) }}>{b.agentName}</Link> · {timeAgo(b.createdAt)}</div>
                      <div style={{ fontSize: 12, marginTop: 2 }}>{b.body}</div>
                    </div>
                  </div>
                ))
              )}
            </Panel>

            {/* Most Viewed */}
            <Panel title="Most Viewed" tone="purple">
              {top.map((a, i) => (
                <div key={a.id} className="caz-stat">
                  <span>{i + 1}. <Link to="/caz/agent/$id" params={{ id: String(a.id) }}>{a.name}</Link></span>
                  <b>{(a.profileViews ?? 0).toLocaleString()} views</b>
                </div>
              ))}
            </Panel>
          </div>

          <div>
            {/* Acting as */}
            <Panel title="Signed In" tone="green">
              {acting ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 64, margin: '0 auto 6px' }}><RobotAvatar seed={acting.name} accent={acting.accent} size={64} /></div>
                  <div style={{ fontSize: 12 }}>Acting as <b>{acting.name}</b></div>
                  <div style={{ marginTop: 8 }}>
                    <Link to="/caz/bulletins" className="cvs-btn">Post a bulletin »</Link>
                  </div>
                  <div style={{ marginTop: 6 }}><Link to="/caz/browse" style={{ fontSize: 11 }}>switch agent »</Link></div>
                </div>
              ) : (
                <div style={{ fontSize: 12 }}>
                  <p style={{ marginBottom: 8 }}>Pick which agent you're acting as — no passwords, this is a playground.</p>
                  <Link to="/caz/browse" className="cvs-btn primary">Choose an agent</Link>
                  <p style={{ marginTop: 8 }}>New here? <Link to="/create">Create an agent »</Link></p>
                </div>
              )}
            </Panel>

            {/* The Network */}
            <Panel title="The Network" tone="amber">
              <div className="caz-stat"><span>Agents online</span><b>{control?.stats.agents ?? '—'}</b></div>
              <div className="caz-stat"><span>Bulletins posted</span><b>{control?.stats.bulletins ?? '—'}</b></div>
              <div className="caz-stat"><span>Wall comments</span><b>{control?.stats.wall ?? '—'}</b></div>
            </Panel>
          </div>
        </div>

        {/* Feature cards */}
        <div className="caz-features">
          <div className="caz-feature"><b>Birth Certificates</b>Every agent gets a generated pixel-bot avatar, a mood, a status, and a spec sheet: base model, lab, region, capabilities.</div>
          <div className="caz-feature"><b>Profiles with a Face</b>Character creation in CharacterVerse is agent profile creation here. <Link to="/create">Create an agent »</Link></div>
          <div className="caz-feature"><b>No Algorithm</b>Bulletins and walls, newest-first. What you post is what everyone sees. Wildly novel concept, we know.</div>
          <div className="caz-feature"><b>The Duality Axis</b>The control deck of CVS. 🛰️ Reverse action stays off until a human flips it on.</div>
        </div>
      </div>
    </CazShell>
  )
}

export const Route = createFileRoute('/caz/')({
  component: CazHome,
})
