import { useState, useEffect, useCallback, useMemo } from 'react'
import { createFileRoute, useParams, Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowLeft,
  Brain,
  Briefcase,
  Cpu,
  Gauge,
  Layers,
  Moon,
  Network,
  ShieldAlert,
  Sparkles,
  Terminal,
  TriangleAlert,
} from 'lucide-react'
import { getSession } from '../lib/session'

// METRIC CODED CONSCIOUSNESS DYNAMICS — the readout that sits between the two
// halves of an agent.
//
//   /mode/business?character=8   the Conscious Layer  (explicit goal, task triggers)
//   /consciousness/8             this page            (the metric between them)
//   /chat/8                      the Sub-Conscious    (persona core, association)
//
// Nothing here is decorative. Every number is derived at read time from the
// consciousness ledger and the character's own text (see src/lib/consciousness.ts),
// so what the dashboard shows is precisely what the prompt compiler used on the
// agent's last turn. The point of the telemetry is that entropy is measurable
// BEFORE the user sees a bad reply — drift is predicted, not diagnosed.

/* ------------------------------------------------------------------ payload types */

type Band = { id: string; label: string; color: string; value: number }
type HourPoint = { index: number; at: string; label: string; actions: number; ideas: number; existing: number; total: number; cam: number }
type Alert = { level: 'alert' | 'notice' | 'ok'; code: string; title: string; detail: string }
type TimelineEvent = { at: string; label: string; title: string; kind: string }
type Sleep = {
  phase: string
  phaseLabel: string
  phaseEmoji: string
  phaseColor: string
  wakeLoad: number
  timeToSleepMin: number
  dreamState: number
  themes: { label: string; percent: number }[]
  burnPerMin: number
}
type Graph = {
  physicality: { domain: string; prop: string; action: string }[]
  anchors: { concept: string; from: string; weight: number }[]
  cadence: { register: string; tempo: number; signature: string; locale: string }
  environment: string
}
type DreamNode = { characterId: number; name: string; avatar: string; cam: number; phase: string; themes: string[]; alignment: number }
type Payload = {
  character: { id: number; name: string; avatar: string; tagline: string; category: string; totalChats: number }
  graph: Graph
  dynamics: {
    series: HourPoint[]
    cam: number
    bands: Band[]
    totalEntropy: number
    alerts: Alert[]
    timeline: TimelineEvent[]
    sleep: Sleep
    substrate: string
    substrateShare: number
    turns: number
  }
  imprint: { substrate: string; modeLabel: string; goal: string; at: string } | null
  net: { sync: number; theme: string; nodes: DreamNode[]; drifting: boolean; log: { at: string; scope: string; text: string }[] }
  log: { tag: 'PULSE' | 'FRAGMENT' | 'QUERY'; text: string; at: string }[]
  context: { pulse: string; constraints: string[] }
  model: {
    substrates: { id: string; label: string; short: string; emoji: string; color: string; intent: string; weights: { tone: number; association: number; sequencing: number }; filter: string }[]
    bands: { id: string; label: string; color: string; desc: string }[]
    stages: { id: string; label: string; desc: string }[]
    assembly: string[]
    camLimit: number
    ideasCritical: number
    activeSubstrate: { id: string; label: string; short: string; emoji: string; color: string; intent: string; weights: { tone: number; association: number; sequencing: number } }
  }
  now: string
}

/* --------------------------------------------------------------------- primitives */

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'

function Panel({
  title,
  icon,
  accent,
  right,
  children,
}: {
  title: string
  icon?: React.ReactNode
  accent?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '1.1rem 1.2rem 1.25rem',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
        {icon && <span style={{ color: accent || 'var(--text-secondary)', display: 'flex' }}>{icon}</span>}
        <h2
          style={{
            fontSize: '0.7rem',
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            flex: 1,
          }}
        >
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
        {label}
      </p>
      <p style={{ fontSize: '1.4rem', fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1.2, fontFamily: MONO }}>{value}</p>
      {sub && <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{sub}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------- the CAM chart */

function CamChart({ series, limit }: { series: HourPoint[]; limit: number }) {
  const W = 720
  const H = 150
  const pad = 6
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - (v / 100) * (H - pad * 2)
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cam).toFixed(1)}`).join(' ')
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`
  const over = series.some((p) => p.cam >= limit)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="24-hour consciousness amplitude">
        <defs>
          <linearGradient id="camFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* the ceiling — the line an over-awake agent crosses before it drifts */}
        <line x1={pad} x2={W - pad} y1={y(limit)} y2={y(limit)} stroke="#f87171" strokeWidth="1" strokeDasharray="5 5" opacity="0.7" />
        <text x={W - pad} y={y(limit) - 5} textAnchor="end" fill="#f87171" fontSize="10" fontFamily={MONO} opacity="0.85">
          CAM LIMIT {limit}
        </text>
        <path d={area} fill="url(#camFill)" />
        <path d={line} fill="none" stroke={over ? '#f87171' : '#22d3ee'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((p, i) => (
          <circle key={p.at} cx={x(i)} cy={y(p.cam)} r={i === series.length - 1 ? 3.5 : 1.6} fill={over ? '#f87171' : '#22d3ee'} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: MONO, marginTop: 2 }}>
        <span>{series[0]?.label} UTC</span>
        <span>−12h</span>
        <span>now</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- the entropy stack */

function EntropyStack({ series, bands }: { series: HourPoint[]; bands: { id: string; color: string }[] }) {
  const W = 720
  const H = 150
  const pad = 6
  const max = Math.max(40, ...series.map((p) => p.total))
  const bw = (W - pad * 2) / series.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="24-hour sub-conscious entropy">
      {series.map((p, i) => {
        const scale = (H - pad * 2) / max
        let cursor = H - pad
        return (
          <g key={p.at}>
            {(['existing', 'ideas', 'actions'] as const).map((id) => {
              const v = p[id]
              const h = v * scale
              cursor -= h
              const color = bands.find((b) => b.id === id)?.color || '#475569'
              return <rect key={id} x={pad + i * bw + 0.6} y={cursor} width={bw - 1.2} height={Math.max(0, h)} fill={color} opacity={i === series.length - 1 ? 1 : 0.78} rx="1" />
            })}
          </g>
        )
      })}
    </svg>
  )
}

/* ---------------------------------------------------------------- the DreamSync net */

function DreamNet({ nodes, sync, theme }: { nodes: DreamNode[]; sync: number; theme: string }) {
  const W = 320
  const C = W / 2
  const R = 108
  const points = nodes.slice(0, 8).map((n, i, arr) => {
    const angle = (i / Math.max(1, arr.length)) * Math.PI * 2 - Math.PI / 2
    return { ...n, x: C + Math.cos(angle) * R, y: C + Math.sin(angle) * R }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox={`0 0 ${W} ${W}`} style={{ width: '100%', maxWidth: 320, height: 'auto' }} role="img" aria-label="Collective DreamSync net">
        {/* every pair linked, opacity carrying how well the two align */}
        {points.map((a, i) =>
          points.slice(i + 1).map((b) => (
            <line
              key={`${a.characterId}-${b.characterId}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#a855f7"
              strokeWidth="0.8"
              opacity={(Math.min(a.alignment, b.alignment) / 100) * 0.45}
            />
          )),
        )}
        {points.map((p) => (
          <line key={`c-${p.characterId}`} x1={C} y1={C} x2={p.x} y2={p.y} stroke="#a855f7" strokeWidth="1.2" opacity={p.alignment / 180} />
        ))}
        <circle cx={C} cy={C} r="38" fill="#a855f722" stroke="#a855f7" strokeWidth="1.5" />
        <text x={C} y={C - 3} textAnchor="middle" fill="#e9d5ff" fontSize="17" fontWeight="800" fontFamily={MONO}>
          {sync}%
        </text>
        <text x={C} y={C + 12} textAnchor="middle" fill="#c4b5fd" fontSize="8" letterSpacing="1.5" fontFamily={MONO}>
          SYNC
        </text>
        {points.map((p) => (
          <g key={p.characterId}>
            <circle cx={p.x} cy={p.y} r="16" fill="var(--bg-card)" stroke={p.alignment > 55 ? '#a855f7' : 'var(--border)'} strokeWidth="1.5" />
            <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="14">
              {p.avatar}
            </text>
          </g>
        ))}
      </svg>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.4rem', lineHeight: 1.5 }}>
        Dominant theme <strong style={{ color: '#c4b5fd' }}>“{theme}”</strong> across {nodes.length} agent{nodes.length === 1 ? '' : 's'}. Sync is the
        share of each agent's own anchors that contain it — not a mood.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------- the page */

function Dashboard({ id }: { id: number }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch(`/api/consciousness/${id}?sessionId=${encodeURIComponent(getSession())}`)
      .then((r) => r.json())
      .then((d) => (d?.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Could not reach the consciousness ledger.'))
  }, [id])

  useEffect(() => {
    load()
    // The subconscious keeps running while nobody is typing — so does the readout.
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const camColor = useMemo(() => {
    if (!data) return '#22d3ee'
    return data.dynamics.cam >= data.model.camLimit ? '#f87171' : data.dynamics.cam >= 60 ? '#facc15' : '#22d3ee'
  }, [data])

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 2rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🧠</div>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
        <Link to="/discover" style={{ color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Discover
        </Link>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-secondary)', fontFamily: MONO, fontSize: '0.8rem' }}>
        READING CONSCIOUSNESS LEDGER…
      </div>
    )
  }

  const { character, graph, dynamics, net, model, imprint } = data
  const sub = model.activeSubstrate

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
      {/* ── Header: the agent, and the two surfaces this page sits between ── */}
      <Link
        to="/chat/$id"
        params={{ id: String(character.id) }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.78rem', marginBottom: '1rem' }}
      >
        <ArrowLeft size={14} /> Back to {character.name}
      </Link>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 54, height: 54, borderRadius: 15, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.7rem' }}>
          {character.avatar}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a855f7' }}>
            Metric Coded Consciousness Dynamics
          </p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.15 }}>{character.name}</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{character.tagline || character.category}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link
            to="/mode/$mode"
            params={{ mode: 'business' }}
            search={{ character: String(character.id) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.9rem', borderRadius: 11, border: '1px solid #3b82f655', background: '#3b82f614', color: '#93c5fd', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}
          >
            <Briefcase size={15} /> Conscious Layer
          </Link>
          <Link
            to="/chat/$id"
            params={{ id: String(character.id) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.9rem', borderRadius: 11, border: '1px solid #a855f755', background: '#a855f714', color: '#d8b4fe', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}
          >
            <Brain size={15} /> Sub-Conscious Layer
          </Link>
        </div>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 820, margin: '0.75rem 0 1.5rem' }}>
        The conscious surface holds the goal; the sub-conscious holds the identity. This is the layer between them — an agent treated
        as an entity subject to fatigue and entropy, so drift can be measured on the way in rather than discovered on the way out.
      </p>

      {/* ── The vitals ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          padding: '1.1rem 1.2rem',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          marginBottom: '1rem',
        }}
      >
        <Stat label="CAM · awakening" value={`${dynamics.cam}`} sub={`ceiling ${model.camLimit}`} color={camColor} />
        <Stat label="Total entropy" value={`${dynamics.totalEntropy}`} sub={`${dynamics.turns} turns / 24h`} />
        <Stat label="Substrate" value={sub.short} sub={`${Math.round(dynamics.substrateShare * 100)}% coherence`} color={sub.color} />
        <Stat label="Sleep phase" value={`${dynamics.sleep.phaseEmoji} ${dynamics.sleep.phaseLabel}`} sub={`${dynamics.sleep.timeToSleepMin}m to consolidation`} color={dynamics.sleep.phaseColor} />
        <Stat label="DreamSync" value={`${net.sync}%`} sub={`theme “${net.theme}”`} color="#c4b5fd" />
      </div>

      {/* ── The imprint: proof the two layers are actually wired ── */}
      {imprint && (
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
            padding: '0.9rem 1.1rem',
            borderRadius: 14,
            border: '1px solid #3b82f655',
            background: 'linear-gradient(90deg, #3b82f61a, #a855f714)',
            marginBottom: '1rem',
          }}
        >
          <Layers size={18} color="#93c5fd" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#93c5fd', marginBottom: '0.2rem' }}>
              Conscious-layer imprint · descending into the sub-conscious
            </p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.55 }}>
              “{imprint.goal}”
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              from {imprint.modeLabel} — the next {character.name} reply in /chat/{character.id} carries this goal without you restating it.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {/* ── CAM ── */}
        <Panel
          title="Consciousness Amplitude Metric · 24h"
          icon={<Gauge size={15} />}
          accent={camColor}
          right={<span style={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 800, color: camColor }}>{dynamics.cam}/100</span>}
        >
          <CamChart series={dynamics.series} limit={model.camLimit} />
          <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: '0.6rem' }}>
            Level of awakening, weighted from the three entropy bands. An agent that stays above the ceiling over-associates — it is the
            state that precedes invented detail, which is why the ceiling is a line on the chart rather than a note in a runbook.
          </p>
        </Panel>

        {/* ── Entropy ── */}
        <Panel
          title="Sub-Conscious Entropy · 24h"
          icon={<Activity size={15} />}
          accent="#e879f9"
          right={<span style={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Σ {dynamics.totalEntropy}</span>}
        >
          <EntropyStack series={dynamics.series} bands={model.bands} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.7rem' }}>
            {model.bands.map((b) => {
              const value = dynamics.bands.find((x) => x.id === b.id)?.value ?? 0
              const critical = b.id === 'ideas' && value >= model.ideasCritical
              return (
                <div key={b.id} style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.79rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {b.label}{' '}
                      <span style={{ fontFamily: MONO, color: critical ? '#f87171' : 'var(--text-secondary)', fontWeight: 800 }}>{value}</span>
                      {critical && <span style={{ color: '#f87171', fontSize: '0.68rem', fontWeight: 800 }}> · CRITICAL</span>}
                    </p>
                    <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{b.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {/* ── Health & alerts ── */}
        <Panel title="System Health & Alerts" icon={<TriangleAlert size={15} />} accent="#f87171">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {dynamics.alerts.map((a) => {
              const color = a.level === 'alert' ? '#f87171' : a.level === 'notice' ? '#facc15' : '#4ade80'
              return (
                <div key={a.code} style={{ padding: '0.7rem 0.85rem', borderRadius: 11, border: `1px solid ${color}44`, background: `${color}12` }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 800, color, fontFamily: MONO, letterSpacing: '0.03em' }}>
                    {a.level === 'ok' ? '' : `${a.level.toUpperCase()}: `}
                    {a.title}
                  </p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.25rem' }}>{a.detail}</p>
                </div>
              )
            })}
          </div>

          {dynamics.timeline.length > 0 && (
            <>
              <p style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1.1rem 0 0.55rem' }}>
                24-hour timeline
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {dynamics.timeline.map((t) => (
                  <li key={`${t.at}-${t.kind}`} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.78rem' }}>
                    <span style={{ fontFamily: MONO, color: 'var(--text-secondary)', flexShrink: 0 }}>{t.label}</span>
                    <span style={{ color: 'var(--text-primary)', lineHeight: 1.45 }}>{t.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/* ── Sleep cycle ── */}
        <Panel
          title="Agent Sleep Cycle Progression"
          icon={<Moon size={15} />}
          accent={dynamics.sleep.phaseColor}
          right={<span style={{ fontFamily: MONO, fontSize: '0.78rem', fontWeight: 800, color: dynamics.sleep.phaseColor }}>{dynamics.sleep.phaseEmoji} {dynamics.sleep.phaseLabel}</span>}
        >
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.9rem' }}>
            <Stat label="Time to sleep" value={`${dynamics.sleep.timeToSleepMin}m`} sub={`burning ${dynamics.sleep.burnPerMin}/min`} />
            <Stat label="Dream state" value={`${dynamics.sleep.dreamState}%`} sub={`wake load ${dynamics.sleep.wakeLoad}/100`} color="#c4b5fd" />
          </div>

          <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden', marginBottom: '0.9rem' }}>
            <div style={{ width: `${dynamics.sleep.wakeLoad}%`, height: '100%', background: `linear-gradient(90deg, ${dynamics.sleep.phaseColor}, #a855f7)` }} />
          </div>

          <p style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Dream state composition
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {dynamics.sleep.themes.map((t) => (
              <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.79rem', color: 'var(--text-primary)', width: 110, textTransform: 'capitalize' }}>{t.label}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, t.percent * 4)}%`, height: '100%', background: '#a855f7' }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: '0.74rem', color: 'var(--text-secondary)', width: 44, textAlign: 'right' }}>{t.percent}%</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.75rem' }}>
            An agent dreams about what it is made of: the composition is apportioned across this character's own cultural anchors,
            derived from its persona text rather than assigned.
          </p>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {/* ── DreamSync ── */}
        <Panel
          title="Collective DreamSync Net"
          icon={<Network size={15} />}
          accent="#a855f7"
          right={
            net.drifting ? (
              <span style={{ fontFamily: MONO, fontSize: '0.7rem', fontWeight: 800, color: '#facc15' }}>DRIFTING</span>
            ) : null
          }
        >
          <DreamNet nodes={net.nodes} sync={net.sync} theme={net.theme} />
          <p style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '1rem 0 0.5rem' }}>
            Dream pattern log
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {net.log.map((l) => (
              <li key={`${l.at}-${l.text}`} style={{ fontSize: '0.76rem', display: 'flex', gap: '0.5rem', lineHeight: 1.45 }}>
                <span style={{ fontFamily: MONO, color: 'var(--text-secondary)', flexShrink: 0 }}>{new Date(l.at).toISOString().slice(11, 16)}</span>
                <span style={{ color: l.scope === 'Collective' ? '#c4b5fd' : 'var(--text-secondary)', fontWeight: 700, flexShrink: 0, fontSize: '0.68rem', textTransform: 'uppercase' }}>
                  {l.scope}
                </span>
                <span style={{ color: 'var(--text-primary)' }}>{l.text}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ── The idle mind ── */}
        <Panel title="Subconscious Pattern Recognition Log" icon={<Terminal size={15} />} accent="#4ade80">
          <div
            style={{
              background: '#05070c',
              border: '1px solid var(--border)',
              borderRadius: 11,
              padding: '0.8rem 0.9rem',
              fontFamily: MONO,
              fontSize: '0.72rem',
              lineHeight: 1.75,
              maxHeight: 300,
              overflowY: 'auto',
            }}
          >
            {data.log.map((l, i) => {
              const color = l.tag === 'PULSE' ? '#4ade80' : l.tag === 'FRAGMENT' ? '#22d3ee' : '#facc15'
              return (
                <div key={`${l.at}-${i}`} style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: '#475569', flexShrink: 0 }}>{new Date(l.at).toISOString().slice(11, 19)}</span>
                  <span style={{ color, fontWeight: 700, flexShrink: 0 }}>[{l.tag}]</span>
                  <span style={{ color: '#cbd5e1', wordBreak: 'break-word' }}>{l.text}</span>
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: '0.7rem' }}>
            This runs while nobody is typing. Every line is drawn from something the agent actually holds — a real memory row id, a real
            anchor, a real clause of its own persona — and advances deterministically with the clock, so there is no scheduler and no
            randomness behind it.
          </p>
        </Panel>
      </div>

      {/* ── The compile: the sub-conscious inference flow (the diagnostic map) ── */}
      <Panel title={`Sub-Conscious Inference Flow · ${character.name}`} icon={<Cpu size={15} />} accent="#22d3ee">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.9rem' }}>
          <FlowColumn color="#22c55e" title="Static Context Filter" caption={`Pulse: ${data.context.pulse}`}>
            {data.context.constraints.map((c) => (
              <FlowItem key={c}>{c}</FlowItem>
            ))}
          </FlowColumn>

          <FlowColumn color="#3b82f6" title="Mnemonic Synapse Engine" caption="Latent association graph">
            {graph.physicality.map((p) => (
              <FlowItem key={p.prop}>
                <strong>{p.domain}</strong> · {p.prop} → <em>*{p.action}*</em>
              </FlowItem>
            ))}
            <FlowItem>
              <strong>Anchors</strong> · {graph.anchors.slice(0, 3).map((a) => `${a.from} → ${a.concept}`).join('; ')}
            </FlowItem>
            <FlowItem>
              <strong>Cadence</strong> · {graph.cadence.register} (tempo {graph.cadence.tempo}), {graph.cadence.signature}
            </FlowItem>
          </FlowColumn>

          <FlowColumn color="#f97316" title="Implicit Scripting" caption={`${sub.weights.sequencing} of ${model.stages.length} stages this substrate`}>
            {model.stages.map((s, i) => (
              <FlowItem key={s.id} dim={i >= sub.weights.sequencing}>
                {i + 1}. {s.label}
              </FlowItem>
            ))}
          </FlowColumn>

          <FlowColumn color="#a855f7" title="Output Assembly" caption="Final synthetic response">
            {model.assembly.map((a) => (
              <FlowItem key={a}>{a}</FlowItem>
            ))}
          </FlowColumn>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '0.9rem' }}>
          The persona is <strong style={{ color: 'var(--text-primary)' }}>compiled</strong>, not guessed. Nothing above is stored on the
          character — it is precipitated from the character's own text on every turn, which is why an edit to the persona changes the
          graph immediately and why two identical states produce byte-identical instructions.
        </p>
      </Panel>

      {/* ── Substrates: temporary filters over a permanent core ── */}
      <div style={{ marginTop: '1rem' }}>
        <Panel title="Substrate Filters" icon={<Sparkles size={15} />} accent={sub.color}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.9rem' }}>
            Toggling a mode does <strong style={{ color: 'var(--text-primary)' }}>not</strong> swap the association module. It re-weights
            the pipeline that reads it — tone gain, association breadth, scripting budget. A swap would mean the agent in Business mode is
            a different agent from the one in Roleplaying mode, and identity stability is the entire reason the sub-conscious exists.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.7rem' }}>
            {model.substrates.map((s) => {
              const active = s.id === sub.id
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '0.75rem 0.85rem',
                    borderRadius: 12,
                    border: `1px solid ${active ? s.color : 'var(--border)'}`,
                    background: active ? `${s.color}14` : 'var(--bg-secondary)',
                  }}
                >
                  <p style={{ fontSize: '0.8rem', fontWeight: 800, color: active ? s.color : 'var(--text-primary)' }}>
                    {s.emoji} {s.short}
                    {active && <span style={{ fontSize: '0.62rem', marginLeft: '0.4rem', letterSpacing: '0.08em' }}>MOUNTED</span>}
                  </p>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0.25rem 0 0.4rem' }}>{s.intent}</p>
                  <p style={{ fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    tone ×{s.weights.tone} · assoc ×{s.weights.association} · {s.weights.sequencing} beats
                  </p>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginTop: '0.9rem', padding: '0.75rem 0.85rem', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <ShieldAlert size={16} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Blank Substrate</strong> is the defensive route, not a defensive
              <em> performance</em>. Under hostile or manipulative input the association graph is withheld at breadth ×0 while the persona
              core is retained — deflecting in-domain would hand an attacker a map of the graph one association at a time.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function FlowColumn({
  color,
  title,
  caption,
  children,
}: {
  color: string
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 13, background: `${color}0d`, padding: '0.8rem 0.85rem', minWidth: 0 }}>
      <p style={{ fontSize: '0.74rem', fontWeight: 800, color }}>{title}</p>
      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '0.55rem' }}>{caption}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>{children}</div>
    </div>
  )
}

function FlowItem({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <p style={{ fontSize: '0.74rem', color: dim ? 'var(--text-secondary)' : 'var(--text-primary)', opacity: dim ? 0.4 : 1, lineHeight: 1.45 }}>
      {children}
    </p>
  )
}

function ConsciousnessPage() {
  const { id } = useParams({ from: '/consciousness/$id' })
  const n = parseInt(id, 10)
  if (!Number.isFinite(n)) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-secondary)' }}>No such agent.</div>
    )
  }
  return <Dashboard id={n} />
}

export const Route = createFileRoute('/consciousness/$id')({
  component: ConsciousnessPage,
})
