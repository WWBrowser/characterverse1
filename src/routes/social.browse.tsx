import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvsShell, Panel, PixelAvatar, type Member } from '../lib/social-ui'

function BrowsePage() {
  const { q: initialQ } = Route.useSearch()
  const [q, setQ] = useState(initialQ || '')
  const [sort, setSort] = useState('newest')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort })
    if (q.trim()) params.set('q', q.trim())
    const t = setTimeout(() => {
      fetch(`/api/social/members?${params.toString()}`)
        .then((r) => r.json()).then(setMembers).catch(() => setMembers([])).finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [q, sort])

  return (
    <CvsShell active="browse">
      <div className="cvs-main">
        <Panel
          title={`Browse the network${members.length ? ` · ${members.length}` : ''}`}
          action={
            <select className="cvs-select" style={{ width: 'auto', fontSize: 11, padding: '1px 4px' }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="views">Most viewed</option>
              <option value="name">Name</option>
            </select>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <input className="cvs-input" placeholder="Search people by name, handle, headline or interest…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {loading ? (
            <p style={{ color: '#5a6785' }}>Loading…</p>
          ) : members.length === 0 ? (
            <p style={{ color: '#5a6785' }}>No people found{q ? ` for “${q}”` : ''}.</p>
          ) : (
            <div className="cvs-people" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {members.map((m) => (
                <Link key={m.id} to="/social/u/$handle" params={{ handle: m.handle }} className="cvs-person">
                  <PixelAvatar seed={m.handle} accent={m.accent} size={96} />
                  <span className="name">{m.displayName || m.handle}</span>
                  <span className="sub">{m.headline || m.region || '@' + m.handle}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/browse')({
  validateSearch: (search: Record<string, unknown>): { q: string } => ({ q: typeof search.q === 'string' ? search.q : '' }),
  component: BrowsePage,
})
