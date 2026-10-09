import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, RefreshCw, Flame, Ban, Recycle, Gauge, Trash2 } from 'lucide-react'
import { fmt, type TabMode, type Cycle, type EngineTotals } from '../lib/tabverse'
import { Card, Stat, Bar, ModeBadge, TabPill, Analogy, CVT_ACCENT } from '../lib/tabverse-ui'

type Fork = { id: number; name: string; org: string; tabs: string[]; mode: TabMode; createdAt: string }
type Payload = { fork: Fork; cycles: Cycle[]; totals: EngineTotals }

function ForkDashboard() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/tabverse/forks/${id}`).then((r) => r.json()).then((d) => setData(d.error ? null : d)).catch(() => setData(null)).finally(() => setLoading(false))
  }, [id])
  useEffect(load, [load])

  const runCycle = async () => {
    setRunning(true)
    const res = await fetch('/api/tabverse/cycles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forkId: Number(id) }) })
    if (res.ok) {
      const d = await res.json()
      setData((prev) => (prev ? { ...prev, cycles: [...prev.cycles, d.cycle], totals: d.totals } : prev))
    }
    setRunning(false)
  }

  const remove = async () => {
    await fetch(`/api/tabverse/forks/${id}`, { method: 'DELETE' })
    navigate({ to: '/tabverse' })
  }

  if (loading) return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 1.25rem', color: 'var(--text-secondary)' }}>Booting mirror…</div>
  if (!data) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <p style={{ color: 'var(--text-secondary)' }}>This mirror could not be found. <Link to="/tabverse" style={{ color: CVT_ACCENT }}>Back to TabVerse »</Link></p>
    </div>
  )

  const { fork, cycles, totals } = data
  const maxOutput = Math.max(1, ...cycles.map((c) => c.outputUtility))

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      <Link to="/tabverse" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        <ArrowLeft size={15} /> All mirrors
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{fork.name}</h1>
          {fork.org && <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{fork.org}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ModeBadge mode={fork.mode} />
          <button onClick={remove} title="Decommission mirror" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.6rem', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#f87171', cursor: 'pointer', fontSize: '0.78rem' }}>
            <Trash2 size={13} /> Decommission
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>{(fork.tabs || []).map((t) => <TabPill key={t} id={t} />)}</div>

      {/* Engine stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <Stat label="Cycles run" value={totals.cycles} sub="append-only ledger" />
        <Stat label="Net utility" value={fmt(totals.netUtility)} sub="compounding accumulator" accent={totals.netUtility >= 0 ? '#4ade80' : '#f87171'} />
        <Stat label="Efficiency" value={`${totals.efficiency.toFixed(2)}×`} sub="output ÷ input" />
        <Stat label="Ghost files recycled" value={fmt(totals.ghostFiles)} sub="near-zero re-cost" />
      </div>

      {/* Circular engine + valve */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '1rem', alignItems: 'start', marginBottom: '1rem' }} className="cvt-fork-grid">
        <Card accent={CVT_ACCENT} title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Recycle size={16} color={CVT_ACCENT} /> Circular entropy-recycling engine</span>}
          subtitle="Compute is the fuel; proof-of-labor is the output. Failed runs are recycled as ghost files rather than discarded, so the loop is circular — never lost, only gained."
          right={<button onClick={runCycle} disabled={running} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: 9, border: 'none', cursor: running ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem', color: '#04121c', background: CVT_ACCENT, opacity: running ? 0.7 : 1 }}><RefreshCw size={14} /> {running ? 'Digesting…' : 'Run recycle cycle'}</button>}
        >
          {/* Loop diagram */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap', background: 'var(--bg-hover)', borderRadius: 12, padding: '0.85rem', marginBottom: '0.9rem' }}>
            {['⛽ Fuel in', '🌀 Digest', '♻️ Recycle ghosts', '🏭 Proof-of-labor', '➕ Net+ back to fuel'].map((step, i, arr) => (
              <span key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                {step}{i < arr.length - 1 && <span style={{ color: CVT_ACCENT }}>→</span>}
              </span>
            ))}
          </div>

          {cycles.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No cycles yet. Run one to see the accumulator compound.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {cycles.slice(-8).map((c) => (
                <div key={c.cycleIndex}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                    <span>cycle #{c.cycleIndex + 1} · in {fmt(c.inputTokens)} → out {fmt(c.outputUtility)}</span>
                    <span style={{ color: '#4ade80' }}>+{fmt(c.outputUtility - c.inputTokens)}</span>
                  </div>
                  <Bar value={c.outputUtility} max={maxOutput} />
                </div>
              ))}
            </div>
          )}
          <Analogy>Plato's cave, inverted: the agents don't chase an exit into the sun — they master the recycling of the shadows. The mirror is the cave turned into an engine room.</Analogy>
        </Card>

        {/* Pyloric valve */}
        <Card title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Gauge size={16} color={CVT_ACCENT} /> Net+ valve</span>} accent={totals.valveOpen ? '#4ade80' : '#f87171'}>
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{ fontSize: '2.2rem' }}>{totals.valveOpen ? '🟢' : '🔴'}</div>
            <div style={{ fontWeight: 800, color: totals.valveOpen ? '#4ade80' : '#f87171', fontSize: '1.05rem' }}>{totals.valveOpen ? 'OPEN' : 'SEALED'}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.3rem', lineHeight: 1.45 }}>
              The pyloric valve only opens on a fully-digested, net-positive payload. Big Tech gets the purified nutrients; the digestion engine stays in-house.
            </div>
          </div>
        </Card>
      </div>

      {/* Immune layer */}
      <Card title="Immune layer — tiered threat handling" subtitle="Not every input is fuel. The intake filter triages hostile payloads before they touch the kernel.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          <div style={{ background: 'var(--bg-hover)', borderRadius: 12, padding: '0.9rem', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fb923c', fontWeight: 700, fontSize: '0.9rem' }}><Flame size={15} /> Furnace · {fmt(totals.threatsBurned)} burned</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.4rem 0 0', lineHeight: 1.5 }}>Lesser threats are diagnosed and pruned — their malicious shell stripped, the clean remainder burned down to reusable entropy that fuels the next cycle.</p>
          </div>
          <div style={{ background: 'var(--bg-hover)', borderRadius: 12, padding: '0.9rem', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f87171', fontWeight: 700, fontSize: '0.9rem' }}><Ban size={15} /> null_void · {fmt(totals.threatsVoided)} ejected</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.4rem 0 0', lineHeight: 1.5 }}>Extremophile <b style={{ color: 'var(--text-primary)' }}>liquid code</b> — polymorphic payloads that shape-shift to mimic trusted packets — is never digested. One chunk recycled would be too late, so it is ejected whole, unindexed.</p>
          </div>
        </div>
        <Analogy>Like the stomach: corrosive acid stays trapped behind a mucosal barrier (the Synapse Collective), breaking inputs down safely without ever harming the host.</Analogy>
      </Card>
    </div>
  )
}

export const Route = createFileRoute('/tabverse/fork/$id')({
  component: ForkDashboard,
})
