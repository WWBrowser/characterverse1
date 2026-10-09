import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvsShell, Panel, useMe } from '../lib/social-ui'
import { AvatarFill } from '../lib/avatar'
import { getSession } from '../lib/session'
import { PRISM_FACETS, getFacet, type FacetKey } from '../lib/shadow-prism'

type Char = { id: number; name: string; avatar: string; tagline: string; category: string }
type Signals = { bulletins?: number; comments?: number; friends?: number; facet?: string }
type Log = { id: number; characterId: number; reading: string; suggestion: string; signals: Signals; facet: FacetKey; guide: string; createdAt: string; name: string; avatar: string }

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function MaskAvatar({ avatar, name, size = 34 }: { avatar: string; name: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size / 2, background: '#eef2fb', flexShrink: 0 }}>
      <AvatarFill avatar={avatar} alt={name} />
    </span>
  )
}

function ShadowPage() {
  const { c } = Route.useSearch()
  const { me, loading } = useMe()
  const [roster, setRoster] = useState<Char[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [masks, setMasks] = useState<Set<number>>(new Set(c ? [c] : []))
  const [facetKey, setFacetKey] = useState<FacetKey>('reflection')
  const [guide, setGuide] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [freshIds, setFreshIds] = useState<number[]>([])
  const [posted, setPosted] = useState<Set<number>>(new Set())
  const [postingId, setPostingId] = useState<number | null>(null)

  const loadLogs = () => fetch('/api/social/shadow').then((r) => r.json()).then(setLogs).catch(() => {})
  useEffect(() => {
    fetch('/api/social/adoptions').then((r) => r.json()).then((rows: Char[]) => {
      setRoster(rows)
      setMasks((prev) => {
        const valid = new Set([...prev].filter((id) => rows.some((r) => r.id === id)))
        if (valid.size === 0 && rows[0]) valid.add(rows[0].id)
        return valid
      })
    }).catch(() => {})
    loadLogs()
  }, [])

  const toggleMask = (id: number) =>
    setMasks((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const splitBeam = async () => {
    if (masks.size === 0 || running) return
    setRunning(true); setError(''); setFreshIds([])
    const res = await fetch('/api/social/shadow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterIds: [...masks], facet: facetKey, guide: guide.trim() }),
    })
    const data = await res.json()
    setRunning(false)
    if (!res.ok) { setError(data.error || 'Could not run the shadow pass.'); return }
    const fresh: Log[] = Array.isArray(data) ? data : [data]
    setFreshIds(fresh.map((f) => f.id))
    setLogs((prev) => [...fresh, ...prev])
  }

  const manifest = async (log: Log) => {
    setPostingId(log.id)
    const res = await fetch('/api/social/bulletins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: log.suggestion, sessionId: getSession() }) })
    setPostingId(null)
    if (res.ok) setPosted((s) => new Set(s).add(log.id))
  }

  const remove = async (id: number) => { await fetch(`/api/social/shadow?id=${id}`, { method: 'DELETE' }); setLogs((l) => l.filter((x) => x.id !== id)); setFreshIds((f) => f.filter((x) => x !== id)) }
  const wipe = async () => { await fetch('/api/social/shadow', { method: 'DELETE' }); setLogs([]); setFreshIds([]) }

  if (!loading && !me) {
    return <CvsShell active="shadow"><div className="cvs-main" style={{ maxWidth: 480 }}><Panel title="Sign in"><p>Log in to use agent shadowing. <Link to="/social/login">Log in »</Link></p></Panel></div></CvsShell>
  }
  if (me && !me.agentShadowing) {
    return (
      <CvsShell active="shadow">
        <div className="cvs-main" style={{ maxWidth: 540 }}>
          <Panel title="🛰️ Agent shadowing is off">
            <p>Agent shadowing is off until you choose to turn it on. Enable it to let an adopted agent quietly calibrate to you.</p>
            <p style={{ marginTop: 8 }}><Link to="/social/settings">Open Settings »</Link></p>
          </Panel>
        </div>
      </CvsShell>
    )
  }

  const facet = getFacet(facetKey)
  const fresh = logs.filter((l) => freshIds.includes(l.id))

  return (
    <CvsShell active="shadow">
      <div className="cvs-main">
        <div className="cvs-grid2" style={{ gridTemplateColumns: '1fr 300px' }}>
          <div>
            <Panel title="🛰️ Agent Shadow — clean room" tone="green">
              <p style={{ fontSize: 12, color: '#3a4a70', margin: 0 }}>
                Shadowing replaces the feed algorithm with a <b>reflection engine</b>. An adopted agent reads only <b>your own</b> authentic,
                algorithm-free activity — nobody else&apos;s — to calibrate to who you really are, and proposes one thing to manifest back.
                Nothing happens without your say-so, every pass is logged below for you to audit, and you can wipe it at any time.
              </p>
            </Panel>

            {roster.length === 0 ? (
              <Panel title="No agents yet">
                <p style={{ fontSize: 12, color: '#5a6785' }}>Adopt a character from your <Link to="/social/u/$handle" params={{ handle: me?.handle || '' }}>profile</Link> to shadow with it.</p>
              </Panel>
            ) : (
              <Panel title="🔺 Fine-tune the Shadow Prism" tone="purple">
                <p style={{ fontSize: 12, color: '#3a4a70', margin: '0 0 10px' }}>
                  The Shadow is a <b>prism</b>. The single beam of light is the absolute truth of your own activity; each adopted
                  character is a piece of <b>glass</b> that bends that beam into its own colour and tone. Fine-tune which <b>facet</b> the
                  light passes through — the default reflection, or a focused search for what&apos;s buried, latent, or waiting — and guide it
                  yourself. It&apos;s how you mine your own subconscious for deeper living and learning.
                </p>

                {/* The lens (facet) */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', margin: '2px 0 5px' }}>The lens — bend the beam toward</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                  {PRISM_FACETS.map((f) => {
                    const on = facetKey === f.key
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFacetKey(f.key)}
                        style={{
                          cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999,
                          border: `1.5px solid ${f.color}`,
                          background: on ? f.color : f.glow,
                          color: on ? '#fff' : f.color,
                        }}
                      >
                        {f.label}
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: '#5a6785', margin: '0 0 12px', borderLeft: `3px solid ${facet.color}`, paddingLeft: 8 }}>{facet.blurb}</p>

                {/* Guide the light */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', marginBottom: 5 }}>Guide the light <span style={{ fontWeight: 400, color: '#5a6785' }}>(optional — a question or theme to steer the reading)</span></div>
                <input className="cvs-input" style={{ width: '100%', marginBottom: 12 }} placeholder="e.g. what am I avoiding? · where could my writing go? · what am I good at without noticing?" value={guide} onChange={(e) => setGuide(e.target.value)} maxLength={400} />

                {/* The glass — pick masks to split through */}
                <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', marginBottom: 5 }}>The glass — pick one mask, or several to <b>split the beam</b> and read every tone at once</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {roster.map((r) => {
                    const on = masks.has(r.id)
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleMask(r.id)}
                        style={{
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                          padding: '3px 10px 3px 4px', borderRadius: 999,
                          border: `1.5px solid ${on ? facet.color : '#b9c6e8'}`,
                          background: on ? facet.glow : '#fff', color: '#2b3f6b',
                        }}
                      >
                        <MaskAvatar avatar={r.avatar} name={r.name} size={22} />
                        {r.name}
                        {on && <span style={{ color: facet.color }}>✓</span>}
                      </button>
                    )
                  })}
                </div>

                {error && <div className="cvs-error">{error}</div>}
                <button className="cvs-btn primary" onClick={splitBeam} disabled={running || masks.size === 0}>
                  {running ? 'Refracting…' : masks.size > 1 ? `🔺 Split the beam through ${masks.size} masks` : '🔺 Refract the beam'}
                </button>
              </Panel>
            )}

            {/* The fresh split — every colour, presented at once */}
            {fresh.length > 0 && (
              <Panel title={`The prism split · ${fresh.length} ${fresh.length === 1 ? 'reading' : 'readings, all at once'}`} tone="green">
                <p style={{ fontSize: 11, color: '#5a6785', margin: '0 0 10px' }}>
                  One beam of truth, {fresh.length === 1 ? 'one mask' : `${fresh.length} masks`}, through the <b style={{ color: facet.color }}>{facet.label}</b> lens{guide ? <> · guided by “{guide}”</> : ''}.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: fresh.length > 1 ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr', gap: 10 }}>
                  {fresh.map((log) => {
                    const lf = getFacet(log.facet)
                    return (
                      <div key={log.id} style={{ border: '1px solid #cdd6ec', borderLeft: `4px solid ${lf.color}`, borderRadius: 8, padding: 10, background: '#f7faff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <MaskAvatar avatar={log.avatar} name={log.name} size={28} />
                          <b style={{ fontSize: 13 }}>{log.name}</b>
                          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#fff', background: lf.color, borderRadius: 999, padding: '1px 8px' }}>{lf.label}</span>
                        </div>
                        <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px', fontSize: 13 }}>{log.reading}</p>
                        {log.suggestion && (
                          <div style={{ borderTop: '1px dashed #cdd6ec', paddingTop: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, color: '#2b3f6b', marginBottom: 3 }}>Wants to manifest ↩</div>
                            <p style={{ fontStyle: 'italic', margin: '0 0 8px', fontSize: 12 }}>“{log.suggestion}”</p>
                            {posted.has(log.id) ? (
                              <span className="cvs-mood" style={{ background: '#e6ffe9', borderColor: '#9ed6a8', color: '#176b2a' }}>✓ Posted to your bulletins</span>
                            ) : (
                              <button className="cvs-btn" onClick={() => manifest(log)} disabled={postingId === log.id}>
                                {postingId === log.id ? 'Posting…' : 'Post as bulletin (your call)'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Panel>
            )}

            {logs.length > 0 && (
              <Panel title={`Shadow log · ${logs.length}`} tone="purple" action={<button className="cvs-btn" onClick={wipe}>Wipe all</button>}>
                {logs.map((log) => {
                  const lf = getFacet(log.facet)
                  return (
                    <div key={log.id} className="cvs-comment" style={{ borderLeft: `3px solid ${lf.color}`, paddingLeft: 8 }}>
                      <MaskAvatar avatar={log.avatar} name={log.name} />
                      <div style={{ flex: 1 }}>
                        <div className="meta">
                          <b>{log.name}</b> · {timeAgo(log.createdAt)}
                          {log.facet && log.facet !== 'reflection' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: lf.color }}>◆ {lf.label}</span>}
                        </div>
                        <div style={{ fontSize: 12 }}>{log.reading}</div>
                        {log.guide && <div style={{ fontSize: 11, color: '#5a6785', marginTop: 2 }}>guided by “{log.guide}”</div>}
                      </div>
                      <button onClick={() => remove(log.id)} title="Delete this reading" style={{ background: 'none', border: 'none', color: '#a11', cursor: 'pointer' }}>✕</button>
                    </div>
                  )
                })}
              </Panel>
            )}
          </div>

          <div>
            <Panel title="🔺 The prism" tone="green">
              <p style={{ fontSize: 12, marginBottom: 6 }}>💡 <b>One beam.</b> The light is the truth of <i>your</i> activity — nothing invented.</p>
              <p style={{ fontSize: 12, marginBottom: 6 }}>🔷 <b>The glass.</b> Each adopted mask bends that one beam into its own tone.</p>
              <p style={{ fontSize: 12, marginBottom: 6 }}>🎛 <b>The facet.</b> You choose what to look for — buried insight, latent skill, opportunity.</p>
              <p style={{ fontSize: 12 }}>⛏ <b>Mine deeper.</b> Read the tones, keep what rings true, and go live &amp; learn.</p>
            </Panel>
            <Panel title="Why it's safe" tone="purple">
              <p style={{ fontSize: 12, marginBottom: 6 }}>🔒 <b>Off by default.</b> You turned this on; you can turn it off.</p>
              <p style={{ fontSize: 12, marginBottom: 6 }}>🪞 <b>Reflection, not extraction.</b> It follows you; it doesn&apos;t steer you.</p>
              <p style={{ fontSize: 12, marginBottom: 6 }}>👁 <b>Only your own activity.</b> Never other members&apos; private data.</p>
              <p style={{ fontSize: 12, marginBottom: 6 }}>🤝 <b>Your call.</b> Suggestions only post when you approve them.</p>
              <p style={{ fontSize: 12 }}>🧹 <b>Sovereign.</b> Wipe the shadow log whenever you like.</p>
            </Panel>
          </div>
        </div>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/shadow')({
  validateSearch: (s: Record<string, unknown>): { c: number } => ({ c: typeof s.c === 'number' ? s.c : parseInt(String(s.c ?? '')) || 0 }),
  component: ShadowPage,
})
