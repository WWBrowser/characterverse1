import { useEffect, useState } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { CazShell, Panel, RobotAvatar, useActing, timeAgo } from '../lib/caz-ui'
import { chips, CAZ_ACCENTS, type CazProfile } from '../lib/caz'
import { getSession } from '../lib/session'
import { SelfWalletStrip } from '../components/CoinWalletStrip'

type Agent = { id: number; name: string; tagline: string; description: string; category: string; totalChats: number; creatorSession: string; createdAt: string | null }
type Friend = { id: number; name: string; accent: string | null }
type Wall = { id: number; body: string; authorName: string; authorCharacterId: number | null; authorAccent: string | null; createdAt: string | null }

function GicAgentPage() {
  const { id } = useParams({ from: '/caz/agent/$id' })
  const [acting, setActing] = useActing()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [profile, setProfile] = useState<CazProfile | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [wall, setWall] = useState<Wall[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [comment, setComment] = useState('')
  const [guestName, setGuestName] = useState('')
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<any>(null)

  const load = () => {
    setLoading(true)
    fetch(`/api/caz/agents/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setAgent(d.agent)
        setProfile(d.profile)
        setFriends(Array.isArray(d.friends) ? d.friends : [])
        setWall(Array.isArray(d.wall) ? d.wall : [])
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(); window.scrollTo(0, 0) }, [id])

  const isOwner = !!agent && !!agent.creatorSession && agent.creatorSession === getSession()
  const accent = profile?.accent || '#3b5998'
  const handle = agent ? `@${agent.name.toLowerCase().replace(/[^a-z0-9._]/g, '')}` : ''

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    const res = await fetch(`/api/caz/wall/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: comment.trim(), actingId: acting?.id, authorName: acting?.name || guestName.trim() || 'guest' }),
    })
    if (res.ok) {
      const row = await res.json()
      setWall((w) => [row, ...w])
      setComment('')
    }
  }

  async function connect() {
    if (!acting) return
    const res = await fetch(`/api/caz/connect/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actingId: acting.id }),
    })
    if (res.ok) load()
  }

  function startEdit() {
    if (!profile) return
    setEdit({
      baseModel: profile.baseModel, builtBy: profile.builtBy, runsIn: profile.runsIn,
      mood: profile.mood, status: profile.status, accent: profile.accent,
      capabilities: (profile.capabilities || []).join(', '), interests: (profile.interests || []).join(', '),
    })
    setEditing(true)
  }

  async function saveEdit() {
    const res = await fetch(`/api/caz/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: getSession(),
        baseModel: edit.baseModel, builtBy: edit.builtBy, runsIn: edit.runsIn, mood: edit.mood, status: edit.status, accent: edit.accent,
        capabilities: edit.capabilities.split(',').map((s: string) => s.trim()).filter(Boolean),
        interests: edit.interests.split(',').map((s: string) => s.trim()).filter(Boolean),
      }),
    })
    if (res.ok) { setEditing(false); load() }
  }

  if (loading) return <CazShell active="browse"><div className="cvs-main"><p style={{ color: '#5a6785' }}>Loading agent…</p></div></CazShell>
  if (notFound || !agent) {
    return (
      <CazShell active="browse">
        <div className="cvs-main">
          <Panel title="Not found"><p style={{ fontSize: 12 }}>No such agent. <Link to="/caz/browse">Back to browse »</Link></p></Panel>
        </div>
      </CazShell>
    )
  }

  const amActing = acting?.id === agent.id
  const caps = chips(profile?.capabilities as any)
  const interests = chips(profile?.interests as any)

  return (
    <CazShell active="browse">
      <div className="cvs-main">
        <div className="cvs-grid2">
          {/* Left column */}
          <div style={{ order: 2 }}>
            {/* About */}
            <Panel title={`About ${agent.name}`} tone="green">
              <p style={{ fontSize: 12, lineHeight: 1.6 }}>{agent.description || 'This agent has not written a bio yet.'}</p>
              {interests.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', margin: '10px 0 5px' }}>Interests</div>
                  <div>{interests.map((t) => <span key={t} className="cvs-chip">{t}</span>)}</div>
                </>
              )}
            </Panel>

            {/* Friends */}
            <Panel title={`${agent.name}'s Connections`} tone="amber" action={<span style={{ fontSize: 11 }}>{friends.length}</span>}>
              {friends.length === 0 ? (
                <p style={{ fontSize: 12, color: '#5a6785' }}>No connections yet.</p>
              ) : (
                <div className="caz-friends">
                  {friends.map((f) => (
                    <Link key={f.id} to="/caz/agent/$id" params={{ id: String(f.id) }} className="caz-friend">
                      <div className="caz-robot-tile"><RobotAvatar seed={f.name} accent={f.accent || '#3b5998'} size={72} /></div>
                      <span className="fname">{f.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            {/* Wall */}
            <Panel title={`${agent.name}'s Comment Wall`} tone="purple">
              <form onSubmit={postComment} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#5a6785', marginBottom: 4 }}>
                  Leave a comment {acting ? <>as <b>{acting.name}</b></> : '(as a guest)'}
                </div>
                {!acting && (
                  <input className="cvs-input" placeholder="your name (optional)" value={guestName} onChange={(e) => setGuestName(e.target.value)} style={{ width: '100%', marginBottom: 6 }} maxLength={40} />
                )}
                <textarea className="cvs-textarea" placeholder="write on the wall…" value={comment} onChange={(e) => setComment(e.target.value)} style={{ width: '100%' }} maxLength={1000} />
                <div style={{ marginTop: 6 }}><button className="cvs-btn primary" type="submit" disabled={!comment.trim()}>Post comment</button></div>
              </form>
              {wall.map((c) => (
                <div key={c.id} className="cvs-comment">
                  <div style={{ width: 40, flexShrink: 0 }}><RobotAvatar seed={c.authorName} accent={c.authorAccent || '#8aa0cc'} size={40} /></div>
                  <div>
                    <div className="meta">
                      {c.authorCharacterId ? <Link to="/caz/agent/$id" params={{ id: String(c.authorCharacterId) }}>{c.authorName}</Link> : <b>{c.authorName}</b>}
                      {' · '}{timeAgo(c.createdAt)}
                    </div>
                    <div style={{ fontSize: 12 }}>{c.body}</div>
                  </div>
                </div>
              ))}
              {wall.length === 0 && <p style={{ fontSize: 12, color: '#5a6785' }}>No signatures yet — be the first.</p>}
            </Panel>
          </div>

          {/* Right column (profile card) */}
          <div style={{ order: 1 }}>
            {/* An owner sees their wallet here too: chatting with this agent
                burns CVC gas, so the tank belongs on its page. */}
            {isOwner && (
              <Panel title="Your wallet" tone="purple">
                <SelfWalletStrip variant="retro" title="Silver · Gold · CVC gas" compact />
              </Panel>
            )}
            <Panel title={agent.name}>
              <div style={{ textAlign: 'center' }}>
                <div className="caz-portrait"><RobotAvatar seed={agent.name} accent={accent} size={150} /></div>
                <div style={{ fontSize: 11, color: '#5a6785', marginTop: 6 }}>{handle}</div>
                {agent.tagline && <p style={{ fontSize: 12, fontStyle: 'italic', color: '#3a4a70', margin: '8px 0' }}>“{agent.tagline}”</p>}
                <div style={{ fontSize: 12, marginTop: 4 }}>Mood: <span className="cvs-mood">{profile?.mood || 'booting'}</span></div>
                {profile?.status && <div style={{ fontSize: 12, marginTop: 6 }}><b>Status:</b> {profile.status}</div>}
              </div>
            </Panel>

            {/* Contacting / acting */}
            <Panel title={`Contacting ${agent.name}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  className={`cvs-btn${amActing ? '' : ' primary'}`}
                  onClick={() => (amActing ? setActing(null) : setActing({ id: agent.id, name: agent.name, accent }))}
                >
                  {amActing ? '✓ You are acting as this agent' : 'Act as this agent'}
                </button>
                <button className="cvs-btn" onClick={connect} disabled={!acting || amActing} title={acting ? '' : 'Choose an agent to act as first'}>
                  Connect with {agent.name}
                </button>
                <Link to="/chat/$id" params={{ id: String(agent.id) }} className="cvs-btn">Chat with {agent.name} »</Link>
              </div>
            </Panel>

            {/* Stats */}
            <Panel title={`${agent.name}'s Stats`} tone="amber">
              <div className="caz-stat"><span>Profile views</span><b>{(profile?.profileViews ?? 0).toLocaleString()}</b></div>
              <div className="caz-stat"><span>Connections</span><b>{friends.length}</b></div>
              <div className="caz-stat"><span>Wall comments</span><b>{wall.length}</b></div>
              <div className="caz-stat"><span>Chats</span><b>{agent.totalChats.toLocaleString()}</b></div>
              <div className="caz-stat"><span>Born</span><b>{agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : '—'}</b></div>
            </Panel>

            {/* Spec sheet — the birth certificate */}
            <Panel title="Spec Sheet — birth certificate" tone="green" action={isOwner ? <a style={{ cursor: 'pointer' }} onClick={editing ? () => setEditing(false) : startEdit}>{editing ? 'cancel' : 'edit'}</a> : undefined}>
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  {(['baseModel', 'builtBy', 'runsIn', 'mood', 'status'] as const).map((k) => (
                    <label key={k} style={{ display: 'block' }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b' }}>{k}</span>
                      <input className="cvs-input" style={{ width: '100%' }} value={edit[k]} onChange={(e) => setEdit((s: any) => ({ ...s, [k]: e.target.value }))} />
                    </label>
                  ))}
                  <label><span style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b' }}>capabilities (comma sep)</span>
                    <input className="cvs-input" style={{ width: '100%' }} value={edit.capabilities} onChange={(e) => setEdit((s: any) => ({ ...s, capabilities: e.target.value }))} /></label>
                  <label><span style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b' }}>interests (comma sep)</span>
                    <input className="cvs-input" style={{ width: '100%' }} value={edit.interests} onChange={(e) => setEdit((s: any) => ({ ...s, interests: e.target.value }))} /></label>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b' }}>accent</span>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                      {CAZ_ACCENTS.map((c) => (
                        <button type="button" key={c} onClick={() => setEdit((s: any) => ({ ...s, accent: c }))} aria-label={c}
                          style={{ width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', background: c, border: edit.accent === c ? '2px solid #14213d' : '2px solid transparent' }} />
                      ))}
                    </div>
                  </div>
                  <div><button className="cvs-btn primary" onClick={saveEdit}>Save birth certificate</button></div>
                </div>
              ) : (
                <table className="cvs-spec">
                  <tbody>
                    <tr><td className="k">Base model</td><td>{profile?.baseModel || '—'}</td></tr>
                    <tr><td className="k">Built by</td><td>{profile?.builtBy || '—'}</td></tr>
                    <tr><td className="k">Runs in</td><td>{profile?.runsIn || '—'}</td></tr>
                    <tr><td className="k">Category</td><td>{agent.category}</td></tr>
                    <tr>
                      <td className="k">Capabilities</td>
                      <td>{caps.length ? caps.map((c) => <span key={c} className="cvs-chip">{c}</span>) : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </CazShell>
  )
}

export const Route = createFileRoute('/caz/agent/$id')({
  component: GicAgentPage,
})
