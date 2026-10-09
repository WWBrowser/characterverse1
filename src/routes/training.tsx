import { useState, useEffect, useMemo, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { FlaskConical, Zap, Layers, Sparkles, ArrowRight, Search, BrainCircuit, ShieldAlert } from 'lucide-react'
import {
  TRAINING_KINDS,
  SUB_WEIGHTS,
  kindMeta,
  subWeightMeta,
  buildProfile,
  type TrainingKind,
  type TrainingMode,
} from '../lib/training'
import {
  PILLARS,
  SECURITY_PILLARS,
  OUTCOME_META,
  POL_TAGLINE,
  estimateCost,
  clampBudget,
  runReasoning,
  DEFAULT_BUDGET,
  MIN_BUDGET,
  MAX_BUDGET,
  type ReasoningOutcome,
} from '../lib/reasoning'
import { getSession } from '../lib/session'

export const Route = createFileRoute('/training')({ component: TrainingPage })

/* --------------------------------------------------------------------- types */

type Character = { id: number; name: string; avatar: string; category: string; tagline: string }

type Signal = {
  id: number
  characterId: number
  kind: string
  subWeight: string
  content: string
  mode: string
  weight: number
  applied: boolean
  sourceFeedbackId: number | null
  createdAt: string
}

type ReasoningCycle = {
  id: number
  characterId: number
  task: string
  costBudget: number
  costBurned: number
  outcome: ReasoningOutcome
  subWeight: string
  pol: number
  goldMilli: number
  gate: { intercepted?: boolean; scam?: boolean; blocked?: boolean; alerted?: boolean; reason?: string }
  signalId: number | null
  note: string
  createdAt: string
}

/* ------------------------------------------------------------------- helpers */

function avatarBox(size: number) {
  return {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
    fontSize: size * 0.5,
    flexShrink: 0,
    background: 'linear-gradient(135deg, rgba(124,92,191,0.4), rgba(79,70,229,0.25))',
    border: '1px solid rgba(124,92,191,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/* ====================================================================== page */

function TrainingPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [loadingSignals, setLoadingSignals] = useState(false)

  // compose state
  const [kind, setKind] = useState<TrainingKind>('correction')
  const [subWeight, setSubWeight] = useState('general')
  const [mode, setMode] = useState<TrainingMode>('realtime')
  const [weight, setWeight] = useState(3)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  // reasoning engine state
  const [cycles, setCycles] = useState<ReasoningCycle[]>([])
  const [task, setTask] = useState('')
  const [budget, setBudget] = useState(DEFAULT_BUDGET)
  const [reasoningSubWeight, setReasoningSubWeight] = useState('general')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    fetch('/api/characters')
      .then((r) => r.json())
      .then((d) => setCharacters(Array.isArray(d) ? d : []))
      .catch(() => setCharacters([]))
  }, [])

  const loadSignals = useCallback((cid: number) => {
    setLoadingSignals(true)
    fetch(`/api/training?characterId=${cid}`)
      .then((r) => r.json())
      .then((d) => setSignals(Array.isArray(d) ? d : []))
      .catch(() => setSignals([]))
      .finally(() => setLoadingSignals(false))
  }, [])

  const loadCycles = useCallback((cid: number) => {
    fetch(`/api/reasoning?characterId=${cid}`)
      .then((r) => r.json())
      .then((d) => setCycles(Array.isArray(d) ? d : []))
      .catch(() => setCycles([]))
  }, [])

  useEffect(() => {
    if (selectedId != null) {
      loadSignals(selectedId)
      loadCycles(selectedId)
    }
  }, [selectedId, loadSignals, loadCycles])

  const selected = characters.find((c) => c.id === selectedId) || null
  const profile = useMemo(() => buildProfile(signals), [signals])
  const pendingBatch = signals.filter((s) => s.mode === 'batch' && !s.applied)

  const visibleChars = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return characters
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        String(c.id) === q,
    )
  }, [characters, filter])

  const submit = async () => {
    if (selectedId == null || !content.trim() || saving) return
    setSaving(true)
    try {
      await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: selectedId,
          sessionId: getSession(),
          kind,
          subWeight,
          mode,
          weight,
          content: content.trim(),
        }),
      })
      setContent('')
      loadSignals(selectedId)
    } finally {
      setSaving(false)
    }
  }

  const applyBatch = async () => {
    if (selectedId == null) return
    await fetch('/api/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'applyBatch', characterId: selectedId }),
    })
    loadSignals(selectedId)
  }

  // Live preview of what the engine would do — the same pure evaluator the server
  // runs, so the estimate on screen matches the recorded outcome.
  const preview = useMemo(
    () => runReasoning({ task, costBudget: budget, subWeight: reasoningSubWeight }),
    [task, budget, reasoningSubWeight],
  )
  const cost = estimateCost(task)
  const polMined = useMemo(
    () => cycles.reduce((sum, c) => sum + (c.pol || 0), 0),
    [cycles],
  )

  const runCycle = async () => {
    if (selectedId == null || !task.trim() || running) return
    setRunning(true)
    try {
      await fetch('/api/reasoning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: selectedId,
          sessionId: getSession(),
          task: task.trim(),
          costBudget: clampBudget(budget),
          subWeight: reasoningSubWeight,
        }),
      })
      setTask('')
      loadCycles(selectedId)
      // A completed cycle emits a training signal — refresh the timeline so the
      // feeder stream into the synapse collectives shows up immediately.
      loadSignals(selectedId)
    } finally {
      setRunning(false)
    }
  }

  const activeKind = kindMeta(kind)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* ---------------------------------------------------------------- header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ ...avatarBox(40), borderRadius: 12 }}>
          <FlaskConical size={20} color="var(--accent-light)" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Training Control Room</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            The refinement layer — every character learns and improves continuously.
          </p>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: 760, marginBottom: '1.5rem' }}>
        Shape a character with real-time and batch training signals across seven actions, each targeting a
        named sub-weight. Feedback from <Link to="/bounties" style={{ color: 'var(--accent-light)' }}>Character
        Testing Bounties</Link> flows straight in here, closing the loop: Test → Train → Improve → Validate.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* ------------------------------------------------ character picker */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
            Character to train
          </div>
          <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-secondary)' }} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search characters…"
              style={{
                width: '100%',
                padding: '0.5rem 0.5rem 0.5rem 2rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 420, overflowY: 'auto' }}>
            {visibleChars.map((c) => {
              const active = c.id === selectedId
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.5rem',
                    borderRadius: 10,
                    border: active ? '1px solid var(--accent)' : '1px solid transparent',
                    background: active ? 'var(--bg-hover)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={avatarBox(34)}>{c.avatar}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{c.category} · #{c.id}</div>
                  </div>
                </button>
              )
            })}
            {visibleChars.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '0.5rem' }}>No characters found.</div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------ main column */}
        {selected == null ? (
          <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14, padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Sparkles size={28} color="var(--accent-light)" style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Pick a character to begin training</div>
            <div style={{ fontSize: '0.85rem' }}>Choose any character on the left to open its control room.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* selected header + maturity */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={avatarBox(48)}>{selected.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selected.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selected.tagline || selected.category}</div>
                </div>
                <Link
                  to="/chat/$id"
                  params={{ id: String(selected.id) }}
                  style={{ fontSize: '0.8rem', color: 'var(--accent-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  Open chat <ArrowRight size={14} />
                </Link>
              </div>

              {/* maturity bar */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <span>Training maturity</span>
                  <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>{profile.maturity}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 6, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{ width: `${profile.maturity}%`, height: '100%', background: 'linear-gradient(90deg, #7c5cbf, #4f46e5)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span><strong style={{ color: 'var(--text-primary)' }}>{profile.total}</strong> signals</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>{profile.applied}</strong> applied</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>{profile.pendingBatch}</strong> pending batch</span>
              </div>

              {/* sub-weight bars */}
              {Object.keys(profile.bySubWeight).length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>Sub-weights trained</div>
                  {(() => {
                    const max = Math.max(1, ...Object.values(profile.bySubWeight))
                    return SUB_WEIGHTS.filter((s) => profile.bySubWeight[s.slug]).map((s) => (
                      <div key={s.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 80, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.label}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                          <div style={{ width: `${(profile.bySubWeight[s.slug] / max) * 100}%`, height: '100%', background: s.color }} />
                        </div>
                        <span style={{ width: 22, textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{profile.bySubWeight[s.slug]}</span>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>

            {/* pending batch */}
            {pendingBatch.length > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Layers size={20} color="#f59e0b" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pendingBatch.length} batch signal{pendingBatch.length > 1 ? 's' : ''} waiting</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Accumulated learning — apply them together to fold into the character.</div>
                </div>
                <button
                  onClick={applyBatch}
                  style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#1a1a28', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Apply batch
                </button>
              </div>
            )}

            {/* compose */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>New training signal</div>

              {/* kind picker */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {TRAINING_KINDS.map((k) => {
                  const active = k.kind === kind
                  return (
                    <button
                      key={k.kind}
                      onClick={() => setKind(k.kind)}
                      title={k.desc}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '0.4rem 0.7rem',
                        borderRadius: 20,
                        border: `1px solid ${active ? k.color : 'var(--border)'}`,
                        background: active ? `${k.color}22` : 'var(--bg-secondary)',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: active ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      <span>{k.emoji}</span>
                      {k.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.9rem' }}>{activeKind.desc}</div>

              {/* sub-weight chips */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Sub-weight</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.9rem' }}>
                {SUB_WEIGHTS.map((s) => {
                  const active = s.slug === subWeight
                  return (
                    <button
                      key={s.slug}
                      onClick={() => setSubWeight(s.slug)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: 8,
                        border: `1px solid ${active ? s.color : 'var(--border)'}`,
                        background: active ? `${s.color}22` : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`What should ${selected.name} learn?`}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  marginBottom: '0.9rem',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                {/* mode toggle */}
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {(['realtime', 'batch'] as TrainingMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '0.45rem 0.8rem',
                        border: 'none',
                        background: mode === m ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: mode === m ? 'white' : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {m === 'realtime' ? <Zap size={13} /> : <Layers size={13} />}
                      {m === 'realtime' ? 'Real-time' : 'Batch'}
                    </button>
                  ))}
                </div>

                {/* weight */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Strength
                  <input type="range" min={1} max={5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
                  <span style={{ color: 'var(--accent-light)', fontWeight: 700, width: 12 }}>{weight}</span>
                </label>

                <div style={{ flex: 1 }} />

                <button
                  onClick={submit}
                  disabled={!content.trim() || saving}
                  style={{
                    padding: '0.55rem 1.2rem',
                    borderRadius: 8,
                    border: 'none',
                    background: !content.trim() || saving ? 'var(--bg-hover)' : 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: !content.trim() || saving ? 'default' : 'pointer',
                  }}
                >
                  {saving ? 'Training…' : mode === 'realtime' ? 'Train now' : 'Queue for batch'}
                </button>
              </div>
            </div>

            {/* reasoning training engine */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(124,92,191,0.4)', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <BrainCircuit size={20} color="var(--accent-light)" />
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>Reasoning Training Engine</div>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 1rem', maxWidth: 720 }}>
                {POL_TAGLINE} Each cycle clears the cognitive firewall and a compute-burn budget; a verified
                completed task records POL, mines Gold&nbsp;CC, and feeds a signal into the{' '}
                <Link to="/neural" style={{ color: 'var(--accent-light)' }}>synapse collectives</Link>.
              </p>

              {/* the eight-file Agentic OS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1.1rem' }}>
                {PILLARS.map((p) => (
                  <div key={p.file} title={p.role} style={{ border: `1px solid ${p.color}44`, background: `${p.color}11`, borderRadius: 10, padding: '0.5rem 0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: p.color }}>
                      <span>{p.emoji}</span> {p.label}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{p.file}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <ShieldAlert size={13} /> Cognitive firewall
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1.1rem' }}>
                {SECURITY_PILLARS.map((p) => (
                  <div key={p.file} title={p.role} style={{ border: `1px solid ${p.color}44`, background: `${p.color}11`, borderRadius: 10, padding: '0.5rem 0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: p.color }}>
                      <span>{p.emoji}</span> {p.label}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{p.file}</div>
                  </div>
                ))}
              </div>

              {/* task + budget */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Refines sub-weight</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.8rem' }}>
                {SUB_WEIGHTS.map((s) => {
                  const active = s.slug === reasoningSubWeight
                  return (
                    <button
                      key={s.slug}
                      onClick={() => setReasoningSubWeight(s.slug)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: 8,
                        border: `1px solid ${active ? s.color : 'var(--border)'}`,
                        background: active ? `${s.color}22` : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>

              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder={`The human-directed task ${selected.name} should reason over and complete…`}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  marginBottom: '0.8rem',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Compute budget
                  <input
                    type="range"
                    min={MIN_BUDGET}
                    max={MAX_BUDGET}
                    step={10}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                  <span style={{ color: 'var(--accent-light)', fontWeight: 700, width: 36 }}>{budget}</span>
                </label>
                <span style={{ fontSize: '0.78rem', color: cost > budget ? '#f59e0b' : 'var(--text-secondary)' }}>
                  est. burn <strong style={{ color: 'var(--text-primary)' }}>{cost}</strong>
                </span>
                {task.trim() && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.15rem 0.55rem',
                      borderRadius: 8,
                      fontWeight: 700,
                      background: `${OUTCOME_META[preview.outcome].color}22`,
                      color: OUTCOME_META[preview.outcome].color,
                    }}
                  >
                    {OUTCOME_META[preview.outcome].emoji} would {OUTCOME_META[preview.outcome].label.toLowerCase()}
                    {preview.outcome === 'completed' ? ` · +${preview.pol} POL` : ''}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <button
                  onClick={runCycle}
                  disabled={!task.trim() || running}
                  style={{
                    padding: '0.55rem 1.2rem',
                    borderRadius: 8,
                    border: 'none',
                    background: !task.trim() || running ? 'var(--bg-hover)' : 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: !task.trim() || running ? 'default' : 'pointer',
                  }}
                >
                  {running ? 'Reasoning…' : 'Run reasoning cycle'}
                </button>
              </div>

              {/* POL ledger */}
              {cycles.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
                      Proof-of-Labor ledger
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: '#f5c451' }}>{polMined}</strong> POL mined · {cycles.length} cycle{cycles.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {cycles.slice(0, 12).map((c) => {
                      const om = OUTCOME_META[c.outcome] || OUTCOME_META.completed
                      const sw = subWeightMeta(c.subWeight)
                      return (
                        <div key={c.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: om.color }}>{om.emoji} {om.label}</span>
                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: `${sw.color}22`, color: sw.color, fontWeight: 600 }}>{sw.label}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>burn {c.costBurned}/{c.costBudget}</span>
                            {c.pol > 0 && (
                              <span style={{ fontSize: '0.7rem', color: '#f5c451', fontWeight: 600 }}>+{c.pol} POL · 🥇 {c.goldMilli / 1000} gCC</span>
                            )}
                            {c.signalId && (
                              <span style={{ fontSize: '0.66rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 600 }}>
                                fed collectives
                              </span>
                            )}
                            {c.gate?.alerted && (
                              <span style={{ fontSize: '0.66rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>
                                🚨 alert
                              </span>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{timeAgo(c.createdAt)}</span>
                          </div>
                          {c.task && <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{c.task}</div>}
                          {c.note && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 3 }}>{c.note}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* timeline */}
            <div>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                Training history
              </div>
              {loadingSignals ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
              ) : signals.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem 0' }}>
                  No training signals yet — this character is untouched. Add the first one above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {signals.map((s) => {
                    const km = kindMeta(s.kind)
                    const sw = subWeightMeta(s.subWeight)
                    return (
                      <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.8rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: km.color }}>
                            {km.emoji} {km.label}
                          </span>
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: 6, background: `${sw.color}22`, color: sw.color, fontWeight: 600 }}>{sw.label}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {s.mode === 'realtime' ? '⚡ real-time' : '🗂 batch'} · strength {s.weight}
                          </span>
                          {s.sourceFeedbackId && (
                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 600 }}>
                              from bounty
                            </span>
                          )}
                          {!s.applied && (
                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600 }}>
                              queued
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{timeAgo(s.createdAt)}</span>
                        </div>
                        {s.content && <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{s.content}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
