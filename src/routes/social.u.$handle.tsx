import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvsShell, Panel, PixelAvatar, useMe, chips, type Member } from '../lib/social-ui'
import { sanitizeCss } from '../lib/social-css'
import { AvatarFill } from '../lib/avatar'
import { getSession } from '../lib/session'
import { SelfWalletStrip } from '../components/CoinWalletStrip'

type Friend = { id: number; handle: string; displayName: string; accent: string; mood: string }
type Comment = { id: number; body: string; createdAt: string; authorHandle: string; authorName: string; authorAccent: string }
type AdoptedChar = { id: number; name: string; avatar: string; tagline: string; category: string }
type Profile = { member: Member; friends?: Friend[]; comments?: Comment[]; adoptions?: AdoptedChar[]; private?: boolean; isOwner?: boolean }

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function ProfilePage() {
  const { handle } = Route.useParams()
  const { me } = useMe()
  const [data, setData] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [rel, setRel] = useState<'none' | 'friends' | 'outgoing' | 'incoming' | 'self'>('none')
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)

  const loadProfile = useCallback(() => {
    setLoading(true)
    fetch(`/api/social/profile/${handle}`)
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [handle])

  const loadRel = useCallback(() => {
    if (!me) { setRel('none'); return }
    if (me.handle === handle) { setRel('self'); return }
    fetch('/api/social/friends').then((r) => r.json()).then((d) => {
      if ((d.friends || []).some((m: Friend) => m.handle === handle)) setRel('friends')
      else if ((d.outgoing || []).some((m: Friend) => m.handle === handle)) setRel('outgoing')
      else if ((d.incoming || []).some((m: Friend) => m.handle === handle)) setRel('incoming')
      else setRel('none')
    }).catch(() => setRel('none'))
  }, [me, handle])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { loadRel() }, [loadRel])

  const friendAction = async (action: string) => {
    const res = await fetch('/api/social/friends', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, action }),
    })
    if (res.status === 401) { window.location.href = '/social/login'; return }
    loadRel(); loadProfile()
  }

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setPosting(true)
    const res = await fetch('/api/social/comments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, body: comment, sessionId: getSession() }),
    })
    setPosting(false)
    if (res.status === 401) { window.location.href = '/social/login'; return }
    if (res.ok) { setComment(''); loadProfile() }
  }

  const FriendButton = () => {
    if (rel === 'self') return <span style={{ fontSize: 12, color: '#5a6785' }}>This is you</span>
    if (rel === 'friends') return <><span className="cvs-mood" style={{ background: '#e6ffe9', borderColor: '#9ed6a8', color: '#176b2a' }}>✓ Friends</span> <button className="cvs-btn" onClick={() => friendAction('remove')}>Remove</button></>
    if (rel === 'outgoing') return <button className="cvs-btn" onClick={() => friendAction('remove')}>Request sent · cancel</button>
    if (rel === 'incoming') return <button className="cvs-btn primary" onClick={() => friendAction('accept')}>Accept friend request</button>
    return <button className="cvs-btn primary" onClick={() => friendAction('request')}>＋ Add as friend</button>
  }

  if (loading) return <CvsShell><div className="cvs-main"><p>Loading…</p></div></CvsShell>
  if (!data) return (
    <CvsShell>
      <div className="cvs-main"><Panel title="Not found"><p>No member with the handle “{handle}”. <Link to="/social/browse" search={{ q: '' }}>Browse the network »</Link></p></Panel></div>
    </CvsShell>
  )

  const m = data.member

  // Private profile — locked stub for strangers.
  if (data.private) {
    return (
      <CvsShell>
        <div className="cvs-main" style={{ maxWidth: 480, textAlign: 'center' }}>
          <Panel title="🔒 Private profile">
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}><PixelAvatar seed={m.handle} accent={m.accent} size={96} /></div>
            <div style={{ fontWeight: 700 }}>{m.displayName || m.handle}</div>
            <div style={{ fontSize: 11, color: '#5a6785', marginBottom: 10 }}>@{m.handle}</div>
            <p style={{ marginBottom: 12 }}>This profile is private and only visible to accepted friends.</p>
            <FriendButton />
            <div style={{ marginTop: 12 }}><Link to="/social/browse" search={{ q: '' }}>« Back to browse</Link></div>
          </Panel>
        </div>
      </CvsShell>
    )
  }

  const active = me?.handle === handle ? 'me' : undefined
  const friends = data.friends || []
  const comments = data.comments || []
  const adoptions = data.adoptions || []
  const isOwner = !!data.isOwner
  const css = sanitizeCss(m.customCss)

  return (
    <CvsShell active={active}>
      {/* The page designer: the member's own CSS, applied only while their profile
          is mounted. Sanitized on both write and read. */}
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <div className="cvs-main cvs-profile-root">
        {data.isOwner && (
          <div style={{ marginBottom: 10, textAlign: 'right' }}>
            <Link to="/social/settings" className="cvs-btn" style={{ textDecoration: 'none' }}>✎ Edit profile &amp; design</Link>
          </div>
        )}
        {/* The same three-currency wallet the member sees on every other
            surface — Silver and Gold they earn, CVC gas they spend. */}
        {isOwner && (
          <Panel title="Your wallet">
            <SelfWalletStrip variant="retro" title="Silver · Gold · CVC gas" compact />
          </Panel>
        )}
        <div className="cvs-grid2" style={{ gridTemplateColumns: '300px 1fr' }}>
          {/* Left column — identity card + spec sheet */}
          <div>
            <Panel title={m.displayName || m.handle}>
              <div style={{ textAlign: 'center' }}>
                <PixelAvatar seed={m.handle} accent={m.accent} size={180} />
                <div style={{ marginTop: 8, fontWeight: 700, fontSize: 15 }}>{m.displayName || m.handle}</div>
                <div style={{ fontSize: 11, color: '#5a6785' }}>@{m.handle}{m.pronouns ? ` · ${m.pronouns}` : ''}</div>
                <div style={{ margin: '8px 0' }}><span className="cvs-mood">mood: {m.mood}</span></div>
                {m.status && <div style={{ fontStyle: 'italic', fontSize: 12 }}>“{m.status}”</div>}
                <div style={{ marginTop: 10 }}><FriendButton /></div>
              </div>
            </Panel>

            <Panel title="Identity & Values" tone="purple">
              <table className="cvs-spec">
                <tbody>
                  <tr><td className="k">Ethos</td><td>{m.headline || '—'}</td></tr>
                  <tr><td className="k">Region</td><td>{m.region || '—'}</td></tr>
                  <tr><td className="k">Values</td><td>{chips(m.values).length ? chips(m.values).map((c) => <span key={c} className="cvs-chip">{c}</span>) : '—'}</td></tr>
                  <tr><td className="k">Member since</td><td>{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}</td></tr>
                  <tr><td className="k">Profile views</td><td>{m.profileViews.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </Panel>
          </div>

          {/* Right column — blurbs, interests, friends, wall */}
          <div>
            <Panel title={`About ${m.displayName || m.handle}`} tone="green">
              {m.headline && <p style={{ fontWeight: 700, marginBottom: 8 }}>{m.headline}</p>}
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.bio || 'This member hasn’t written a blurb yet.'}</p>
              {m.wantToMeet && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Who I&apos;d like to meet</div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.wantToMeet}</p>
                </div>
              )}
              {chips(m.interests).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', marginBottom: 4 }}>Interests</div>
                  {chips(m.interests).map((c) => <span key={c} className="cvs-chip">{c}</span>)}
                </div>
              )}
            </Panel>

            <Panel title={`${m.displayName || m.handle}'s Friends · ${friends.length}`}>
              {friends.length === 0 ? (
                <p style={{ color: '#5a6785' }}>No friends yet — be the first to connect.</p>
              ) : (
                <div className="cvs-people">
                  {friends.map((fr) => (
                    <Link key={fr.id} to="/social/u/$handle" params={{ handle: fr.handle }} className="cvs-person">
                      <PixelAvatar seed={fr.handle} accent={fr.accent} size={72} />
                      <span className="name">{fr.displayName || fr.handle}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <MyCharacters
              adoptions={adoptions}
              isOwner={isOwner}
              shadowing={!!m.agentShadowing}
              ownerName={m.displayName || m.handle}
              reload={loadProfile}
            />

            <Panel title={`Comment Wall · ${comments.length}`} tone="amber">
              {me ? (
                <form onSubmit={postComment} style={{ marginBottom: 10 }}>
                  <textarea className="cvs-textarea" style={{ minHeight: 50 }} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={`Leave a comment for ${m.displayName || m.handle}…`} />
                  <button className="cvs-btn primary" type="submit" disabled={posting}>{posting ? 'Posting…' : 'Post comment'}</button>
                </form>
              ) : (
                <div className="cvs-hero-note" style={{ marginBottom: 10 }}><Link to="/social/login">Log in</Link> to sign the wall.</div>
              )}
              {comments.length === 0 ? (
                <p style={{ color: '#5a6785' }}>No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="cvs-comment">
                    <Link to="/social/u/$handle" params={{ handle: c.authorHandle }}><PixelAvatar seed={c.authorHandle} accent={c.authorAccent} size={44} /></Link>
                    <div style={{ flex: 1 }}>
                      <div className="meta">
                        <Link to="/social/u/$handle" params={{ handle: c.authorHandle }} style={{ fontWeight: 700 }}>{c.authorName || c.authorHandle}</Link>
                        {' · '}{timeAgo(c.createdAt)}
                      </div>
                      <div>{c.body}</div>
                    </div>
                  </div>
                ))
              )}
            </Panel>
          </div>
        </div>
      </div>
    </CvsShell>
  )
}

// "My Characters" — the member's adopted-character roster. A public showcase;
// chatting and managing are owner-only, and adopting needs agent shadowing on.
function CharAvatar({ avatar, name, size = 64 }: { avatar: string; name: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size / 2.2, background: '#eef2fb', border: '1px solid #cdd6ec' }}>
      <AvatarFill avatar={avatar} alt={name} />
    </span>
  )
}

function MyCharacters({
  adoptions, isOwner, shadowing, ownerName, reload,
}: {
  adoptions: AdoptedChar[]
  isOwner: boolean
  shadowing: boolean
  ownerName: string
  reload: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AdoptedChar[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const adoptedIds = new Set(adoptions.map((a) => a.id))

  useEffect(() => {
    if (!adding) return
    const t = setTimeout(() => {
      fetch(`/api/characters?limit=24${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ''}`)
        .then((r) => r.json())
        .then((rows: any[]) => setResults(rows.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, tagline: c.tagline, category: c.category }))))
        .catch(() => {})
    }, 220)
    return () => clearTimeout(t)
  }, [adding, q])

  const adopt = async (id: number) => {
    setBusyId(id)
    await fetch('/api/social/adoptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: id, sessionId: getSession() }) }).catch(() => {})
    setBusyId(null)
    reload()
  }
  const release = async (id: number) => {
    await fetch(`/api/social/adoptions?characterId=${id}`, { method: 'DELETE' }).catch(() => {})
    reload()
  }

  const chatBtn = (id: number, mode: 'single' | 'group' | 'conference', label: string) => (
    <Link to="/social/agent" search={{ mode, c: id }} className="cvs-btn" style={{ textDecoration: 'none', fontSize: 10, padding: '2px 6px' }}>{label}</Link>
  )

  return (
    <Panel
      title={`My Characters · ${adoptions.length}`}
      tone="purple"
      action={isOwner && shadowing ? <Link to="/social/shadow">🛰️ Shadow room »</Link> : undefined}
    >
      {adoptions.length === 0 ? (
        <p style={{ color: '#5a6785', fontSize: 12 }}>
          {isOwner ? 'No characters adopted yet.' : `${ownerName} hasn’t adopted any characters yet.`}
        </p>
      ) : (
        <div className="cvs-people">
          {adoptions.map((ch) => (
            <div key={ch.id} className="cvs-person" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <CharAvatar avatar={ch.avatar} name={ch.name} />
              <span className="name" style={{ fontSize: 12 }}>{ch.name}</span>
              <span className="sub">{ch.category}</span>
              {isOwner && (
                <>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 }}>
                    {chatBtn(ch.id, 'single', '1:1')}
                    {chatBtn(ch.id, 'group', 'Group')}
                    {chatBtn(ch.id, 'conference', 'Conf')}
                  </div>
                  <button onClick={() => release(ch.id)} title="Release" style={{ background: 'none', border: 'none', color: '#a11', cursor: 'pointer', fontSize: 10 }}>release</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && !shadowing && (
        <div className="cvs-hero-note" style={{ marginTop: 10, fontSize: 12 }}>
          🛰️ Agent shadowing is off. <Link to="/social/settings">Turn it on in Settings</Link> to adopt characters and chat with them.
        </div>
      )}

      {isOwner && shadowing && (
        <div style={{ marginTop: 10 }}>
          {!adding ? (
            <button className="cvs-btn primary" onClick={() => setAdding(true)}>＋ Adopt a character</button>
          ) : (
            <div style={{ border: '1px solid #b9c6e8', borderRadius: 6, padding: 8 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input className="cvs-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search CharacterVerse characters…" style={{ flex: 1 }} autoFocus />
                <button className="cvs-btn" onClick={() => { setAdding(false); setQ('') }}>Done</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {results.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#5a6785' }}>No characters found.</p>
                ) : results.map((ch) => (
                  <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CharAvatar avatar={ch.avatar} name={ch.name} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{ch.name}</div>
                      <div style={{ fontSize: 10, color: '#5a6785', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.tagline || ch.category}</div>
                    </div>
                    {adoptedIds.has(ch.id)
                      ? <span style={{ fontSize: 11, color: '#2d8a57', fontWeight: 700 }}>✓ adopted</span>
                      : <button className="cvs-btn" disabled={busyId === ch.id} onClick={() => adopt(ch.id)}>{busyId === ch.id ? '…' : 'Adopt'}</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isOwner && adoptions.length > 0 && (
        <p style={{ fontSize: 11, color: '#5a6785', marginTop: 8 }}>These are {ownerName}&apos;s own agents — only {ownerName} can chat with them.</p>
      )}
    </Panel>
  )
}

export const Route = createFileRoute('/social/u/$handle')({
  component: ProfilePage,
})