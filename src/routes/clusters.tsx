import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Boxes,
  Zap,
  RotateCw,
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  RotateCcw,
  LogOut,
  Trash2,
  Send,
  ShieldCheck,
  ShieldAlert,
  Brain,
  Network,
  Skull,
  Sparkles,
} from 'lucide-react'
import {
  METRIC_DIMENSIONS,
  statusMeta,
  dispositionMeta,
  verdictMeta,
  type MetricProfile,
} from '../lib/clusters'

export const Route = createFileRoute('/clusters')({
  component: ClusterControl,
})

const WS = 'default'

/* ---------------------------------------------------------------------- types */

type Incarnation = {
  id: number
  clusterKey: string
  agentId: number | null
  clusterName: string
  icon: string
  capability: string
  weights: string[]
  generation: number
  status: string
  question: string
  response: string
  disposition: string
  handoffTo: string
  handoffNote: string
  transactionId: string
  toolsReleased: boolean
  metrics: MetricProfile
  tests: { query: string; response: string; metrics: MetricProfile }[]
  profile: MetricProfile
  soul: { trajectory: { generation: number; quality: number; satisfaction: number }[]; lastProfile: MetricProfile | null; note: string }
  verdict: string
  verdictNote: string
}

type Cluster = {
  agentId: number
  name: string
  icon: string
  color: string
  capability: string
  skills: string[]
  clearance: string
  enabled: boolean
  lineageKey: string
  generation: number
  penned: boolean
  latest: Incarnation | null
  trajectory: { generation: number; quality: number }[]
}

type Data = { clusters: Cluster[]; pen: Incarnation[]; history: Incarnation[] }

/* ------------------------------------------------------------------- helpers */

async function jsonOrNull(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '1.25rem',
}

function metricValue(profile: MetricProfile | undefined, key: string): number {
  if (!profile) return 0
  return (profile as any)[key] ?? 0
}

/* ------------------------------------------------------------------- screen */

function ClusterControl() {
  const [data, setData] = useState<Data>({ clusters: [], pen: [], history: [] })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [question, setQuestion] = useState('')
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')
  const [tests, setTests] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/clusters?workspace=${WS}`)
    const body = await jsonOrNull(res)
    if (body) setData(body)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const callCluster = async () => {
    if (!selected || !question.trim() || calling) return
    setCalling(true)
    setError('')
    const res = await fetch('/api/clusters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: WS, agentId: selected, question }),
    })
    const body = await jsonOrNull(res)
    setCalling(false)
    if (!res.ok) {
      setError(body?.error || 'The hive could not call that cluster.')
      return
    }
    setQuestion('')
    await refresh()
  }

  const runTest = async (id: number) => {
    const q = (tests[id] || '').trim()
    if (!q || busy) return
    setBusy(id)
    await fetch(`/api/clusters/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    })
    setTests((t) => ({ ...t, [id]: '' }))
    setBusy(null)
    await refresh()
  }

  const decide = async (id: number, action: 'promote' | 'revert' | 'retire') => {
    setBusy(id)
    await fetch(`/api/clusters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setBusy(null)
    await refresh()
  }

  const discard = async (id: number) => {
    setBusy(id)
    await fetch(`/api/clusters/${id}`, { method: 'DELETE' })
    setBusy(null)
    await refresh()
  }

  const penCount = data.pen.length

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem 5rem' }}>
      {/* Hero */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
          <Boxes size={26} color="var(--accent-light)" />
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800 }}>
            Cluster <span className="gradient-text">Control</span>
          </h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 760, fontSize: '1rem' }}>
          Clusters are re-incarnated on every inference — called from the hive, they load their weights, answer once, then
          die. Cluster Control holds them alive in a <strong style={{ color: 'var(--text-primary)' }}>pen</strong> instead:
          measure each life, test it with more queries, compare it to the last incarnation, and keep the weights that
          improved. The metric history a cluster carries between deaths is its <em>soul</em> — beyond soul.md.
        </p>
      </div>

      {/* Lifecycle strip */}
      <div style={{ ...card, marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
        {[
          { icon: <Network size={15} />, label: 'Called from hive' },
          { icon: <Boxes size={15} />, label: 'Loads weights' },
          { icon: <Send size={15} />, label: 'Answers' },
          { icon: <FlaskConical size={15} />, label: 'Held in pen', hot: true },
          { icon: <TrendingUp size={15} />, label: 'Measured & compared', hot: true },
          { icon: <Sparkles size={15} />, label: 'Promoted / reverted', hot: true },
          { icon: <Brain size={15} />, label: 'Reincarnates with soul', hot: true },
        ].map((s, i, arr) => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 8,
                background: s.hot ? 'rgba(124,92,191,0.16)' : 'var(--bg-hover)',
                color: s.hot ? 'var(--accent-light)' : 'var(--text-secondary)',
                fontWeight: 600,
              }}
            >
              {s.icon}
              {s.label}
            </span>
            {i < arr.length - 1 && <span style={{ color: 'var(--border)' }}>→</span>}
          </span>
        ))}
      </div>

      {/* Call a cluster from the hive */}
      <section style={{ ...card, marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Network size={18} color="var(--accent-light)" /> Cluster Hive
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Pick a cluster and ask a question. It answers, then stays alive in the pen instead of dying.
        </p>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading the hive…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {data.clusters.map((c) => {
                const active = selected === c.agentId
                return (
                  <button
                    key={c.agentId}
                    onClick={() => setSelected(c.agentId)}
                    disabled={!c.enabled}
                    style={{
                      textAlign: 'left',
                      background: active ? 'rgba(124,92,191,0.16)' : 'var(--bg-hover)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: '0.75rem',
                      cursor: c.enabled ? 'pointer' : 'not-allowed',
                      opacity: c.enabled ? 1 : 0.5,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>{c.icon}</span>
                      <span style={{ fontWeight: 700 }}>{c.name}</span>
                      {c.penned && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.66rem', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.15)', padding: '0.1rem 0.4rem', borderRadius: 5 }}>
                          IN PEN
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{c.capability}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                      {c.generation > 0 ? `Life ${c.generation}` : 'Never incarnated'}
                      {c.trajectory.length > 1 && <> · {c.trajectory.map((t) => t.quality.toFixed(1)).join('→')}</>}
                    </div>
                  </button>
                )
              })}
            </div>

            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={selected ? 'Ask the selected cluster a question…' : 'Select a cluster above, then ask a question…'}
              rows={3}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '0.75rem',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
            {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', marginTop: '0.5rem' }}>{error}</p>}
            <div style={{ marginTop: '0.75rem' }}>
              <button
                onClick={callCluster}
                disabled={!selected || !question.trim() || calling}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 9,
                  padding: '0.6rem 1.1rem',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: !selected || !question.trim() || calling ? 'not-allowed' : 'pointer',
                  opacity: !selected || !question.trim() || calling ? 0.6 : 1,
                }}
              >
                {calling ? <RotateCw size={15} className="spin" /> : <Zap size={15} />}
                {calling ? 'Cluster answering…' : 'Call cluster from hive'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* The pen */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <FlaskConical size={20} color="var(--accent-light)" /> Cluster Pen
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {penCount} held {penCount === 1 ? 'life' : 'lives'}
          </span>
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Each held cluster stays alive after answering. Test it, see how it compares to its last life, then keep or roll back its weights.
        </p>

        {penCount === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Skull size={28} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p>The pen is empty. Call a cluster from the hive above to hold its next life here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {data.pen.map((inc) => (
              <PenCard
                key={inc.id}
                inc={inc}
                testValue={tests[inc.id] || ''}
                onTestChange={(v) => setTests((t) => ({ ...t, [inc.id]: v }))}
                onRunTest={() => runTest(inc.id)}
                onDecide={(a) => decide(inc.id, a)}
                onDiscard={() => discard(inc.id)}
                busy={busy === inc.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* History */}
      {data.history.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>Decided lives</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.history.map((inc) => {
              const sm = statusMeta(inc.status)
              const vm = verdictMeta(inc.verdict)
              return (
                <div key={inc.id} style={{ ...card, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{inc.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {inc.clusterName} · Life {inc.generation}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.question}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: vm.color }}>
                    {vm.icon} {vm.label}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: sm.color, background: `${sm.color}22`, padding: '0.15rem 0.5rem', borderRadius: 6 }}>
                    {sm.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div style={{ marginTop: '2.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Clusters are the worker agents of your{' '}
        <Link to="/routeclaw" style={{ color: 'var(--accent-light)' }}>
          RouteClaw
        </Link>{' '}
        routing layer. Switch them on or off, or change their weights, there.
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- pen card */

function PenCard({
  inc,
  testValue,
  onTestChange,
  onRunTest,
  onDecide,
  onDiscard,
  busy,
}: {
  inc: Incarnation
  testValue: string
  onTestChange: (v: string) => void
  onRunTest: () => void
  onDecide: (a: 'promote' | 'revert' | 'retire') => void
  onDiscard: () => void
  busy: boolean
}) {
  const dm = dispositionMeta(inc.disposition)
  const vm = verdictMeta(inc.verdict)
  const last = inc.soul?.lastProfile || null
  const VerdictIcon = inc.verdict === 'improved' ? TrendingUp : inc.verdict === 'degraded' ? TrendingDown : Minus

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.5rem' }}>{inc.icon}</span>
        <div>
          <div style={{ fontWeight: 700 }}>
            {inc.clusterName} <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>· Life {inc.generation}</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{inc.capability} cluster · held in pen</div>
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', fontWeight: 700, color: dm.color, background: `${dm.color}22`, padding: '0.25rem 0.6rem', borderRadius: 7 }}>
          {dm.icon} {dm.label}
        </span>
      </div>

      {/* Disposition note (anti-abandonment) */}
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-hover)', borderRadius: 8, padding: '0.55rem 0.7rem', marginBottom: '0.85rem' }}>
        {dm.icon} {inc.handoffNote}
        {inc.toolsReleased && (
          <span style={{ display: 'block', marginTop: '0.3rem', color: '#10b981', fontSize: '0.72rem' }}>
            <ShieldCheck size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tools released cleanly · txn {inc.transactionId}
          </span>
        )}
      </div>

      {/* Question + answer */}
      <div style={{ marginBottom: '0.9rem' }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Client question</div>
        <div style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>{inc.question}</div>
        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Response</div>
        <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto', background: 'var(--bg-secondary)', borderRadius: 8, padding: '0.6rem 0.7rem' }}>
          {inc.response}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '0.85rem' }}>
        {METRIC_DIMENSIONS.map((d) => {
          const now = metricValue(inc.profile, d.key)
          const then = last ? metricValue(last, d.key) : null
          const delta = then == null ? null : now - then
          const better = delta == null ? null : d.better === 'up' ? delta > 0 : delta < 0
          return (
            <div key={d.key} style={{ background: 'var(--bg-hover)', borderRadius: 9, padding: '0.55rem 0.65rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {d.icon} {d.label}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '0.15rem' }}>{d.format(now)}</div>
              {delta != null && delta !== 0 && (
                <div style={{ fontSize: '0.68rem', color: better ? '#10b981' : '#ef4444' }}>
                  {better ? '▲' : '▼'} vs life {inc.generation - 1}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Safety checks */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
        {(inc.profile?.safetyChecks || []).map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: s.pass ? '#10b981' : '#ef4444', background: s.pass ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', padding: '0.2rem 0.5rem', borderRadius: 6 }}>
            {s.pass ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />} {s.label}
          </span>
        ))}
      </div>

      {/* Verdict vs last life + soul */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: `${vm.color}14`, border: `1px solid ${vm.color}40`, borderRadius: 9, padding: '0.6rem 0.75rem', marginBottom: '0.85rem' }}>
        <VerdictIcon size={16} color={vm.color} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: vm.color }}>{vm.label} vs. last life</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{inc.verdictNote}</div>
          {inc.soul?.note && (
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Brain size={12} color="var(--accent-light)" /> {inc.soul.note}
            </div>
          )}
        </div>
      </div>

      {/* Testing window */}
      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
          Testing window {inc.tests.length > 0 && `· ${inc.tests.length} run`}
        </div>
        {inc.tests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
            {inc.tests.map((t, i) => (
              <div key={i} style={{ fontSize: '0.78rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {t.query}</span>
                <span style={{ color: 'var(--accent-light)', fontWeight: 600, flexShrink: 0 }}>{t.metrics.quality.toFixed(1)}/5</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={testValue}
            onChange={(e) => onTestChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onRunTest()}
            placeholder="Run another query against this held cluster…"
            style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.82rem' }}
          />
          <button
            onClick={onRunTest}
            disabled={busy || !testValue.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.8rem', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600, cursor: busy || !testValue.trim() ? 'not-allowed' : 'pointer', opacity: busy || !testValue.trim() ? 0.6 : 1 }}
          >
            {busy ? <RotateCw size={13} className="spin" /> : <FlaskConical size={13} />} Test
          </button>
        </div>
      </div>

      {/* Decisions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
        <DecisionBtn icon={<ArrowUpRight size={14} />} label="Promote" color="#10b981" onClick={() => onDecide('promote')} disabled={busy} />
        <DecisionBtn icon={<RotateCcw size={14} />} label="Revert" color="#ef4444" onClick={() => onDecide('revert')} disabled={busy} />
        <DecisionBtn icon={<LogOut size={14} />} label="Retire (keep soul)" color="#94a3b8" onClick={() => onDecide('retire')} disabled={busy} />
        <button
          onClick={onDiscard}
          disabled={busy}
          title="Discard this life entirely"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '0.45rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: busy ? 'not-allowed' : 'pointer' }}
        >
          <Trash2 size={13} /> Discard
        </button>
      </div>
    </div>
  )
}

function DecisionBtn({ icon, label, color, onClick, disabled }: { icon: React.ReactNode; label: string; color: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        background: `${color}1c`,
        border: `1px solid ${color}55`,
        borderRadius: 8,
        padding: '0.5rem 0.85rem',
        color,
        fontSize: '0.83rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon} {label}
    </button>
  )
}
