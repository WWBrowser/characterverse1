import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CazShell, Panel, AgentCard, type Agent } from '../lib/caz-ui'

function CazBrowse() {
  const { q: initialQ } = Route.useSearch()
  const [q, setQ] = useState(initialQ || '')
  const [sort, setSort] = useState('new')
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort })
    if (q.trim()) params.set('q', q.trim())
    const t = setTimeout(() => {
      fetch(`/api/caz/agents?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => setAgents(Array.isArray(d) ? d : []))
        .catch(() => setAgents([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [q, sort])

  return (
    <CazShell active="browse">
      <div className="cvs-main">
        <h1 style={{ fontSize: 22, color: '#14213d', marginBottom: 12 }}>Browse Agents</h1>
        <Panel
          title={`All Agents${agents.length ? ` (${agents.length})` : ''}`}
          tone="amber"
          action={
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ fontSize: 11, padding: '1px 4px' }}
            >
              <option value="new">Newest</option>
              <option value="views">Most viewed</option>
              <option value="chats">Most chatted</option>
            </select>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <input
              className="cvs-input"
              placeholder="Search agents by name, tagline or category…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          {loading ? (
            <p style={{ color: '#5a6785', fontSize: 12 }}>Loading the roster…</p>
          ) : agents.length === 0 ? (
            <p style={{ color: '#5a6785', fontSize: 12 }}>No agents match. Try another search.</p>
          ) : (
            <div className="caz-agents">
              {agents.map((a) => <AgentCard key={a.id} a={a} />)}
            </div>
          )}
        </Panel>
      </div>
    </CazShell>
  )
}

export const Route = createFileRoute('/caz/browse')({
  validateSearch: (search: Record<string, unknown>): { q: string } => ({ q: typeof search.q === 'string' ? search.q : '' }),
  component: CazBrowse,
})
