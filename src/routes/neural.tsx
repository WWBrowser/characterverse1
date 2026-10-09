import { useState, useEffect, useMemo, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Orbit,
  Moon,
  Layers,
  CircleDashed,
  Hash,
  Users,
  ArrowRight,
  Plus,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react'
import {
  SLEEP_PHASES,
  TRAINING_MODES,
  ENVIRONMENTS,
  phaseIndex,
  modeMeta,
  envMeta,
  criteriaForMode,
  cycleCounts,
  type ModeSlug,
  type EnvSlug,
} from '../lib/neural'

export const Route = createFileRoute('/neural')({ component: NeuralTraining })

const WS = 'default'

/* --------------------------------------------------------------------- types */

type Cycle = {
  id: number
  name: string
  slug: string
  description: string
  isGenesis: boolean
  environment: string
  trainingMode: string
  status: string
  phase: string
  consolidationEpochs: number
  dyadPairing: string
  anchorHash: string
  entryCriteria: { minDevelopment: number; requirePublic: boolean; label: string }
  enrolled: number[]
  createdAt: string
}

type Eval = { eligible: boolean; score: number; reasons: string[] }

type Candidate = {
  id: number
  name: string
  avatar: string
  category: string
  totalChats: number
  isPublic: boolean
  signalCount: number
  standard: Eval
  external: Eval
}

/* ------------------------------------------------------------------- helpers */

const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const

const label = {
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-secondary)',
} as const

function statusPill(status: string) {
  const map: Record<string, { bg: string; fg: string; text: string }> = {
    active: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981', text: 'active' },
    dormant: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8', text: 'dormant' },
    consolidating: { bg: 'rgba(99,102,241,0.15)', fg: '#818cf8', text: 'consolidating' },
    complete: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b', text: 'complete' },
  }
  const m = map[status] || map.dormant
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.5rem', borderRadius: 6, background: m.bg, color: m.fg }}>
      {m.text}
    </span>
  )
}

/* ====================================================================== page */

function NeuralTraining() {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  // 'home' or a cycle id (as the active sub-tab).
  const [view, setView] = useState<'home' | number>('home')

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/neural?workspace=${WS}`)
      .then((r) => r.json())
      .then((d) => {
        setCycles(Array.isArray(d?.cycles) ? d.cycles : [])
        setCandidates(Array.isArray(d?.candidates) ? d.candidates : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const genesis = cycles.find((c) => c.isGenesis) || null
  const counts = useMemo(() => cycleCounts(cycles), [cycles])
  const activeCycle = typeof view === 'number' ? cycles.find((c) => c.id === view) || null : null

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* ---------------------------------------------------------------- header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(168,85,247,0.4), rgba(79,70,229,0.25))',
            border: '1px solid rgba(168,85,247,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Orbit size={21} color="var(--accent-light)" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Neural Training</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            The mini-agents &amp; external A.I. training grounds Network.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) 1fr', gap: '1.5rem', alignItems: 'start', marginTop: '1.5rem' }}>
        {/* ------------------------------------------------ sub-navigation */}
        <nav style={{ ...card, padding: '0.75rem', position: 'sticky', top: 76 }}>
          <div style={{ ...label, padding: '0.25rem 0.5rem 0.5rem' }}>Trainings</div>
          <SubNavItem
            active={view === 'home'}
            onClick={() => setView('home')}
            icon={<Sparkles size={16} />}
            title="Neural-Dyad Training"
            subtitle="Overview"
          />
          <div style={{ height: 1, background: 'var(--border)', margin: '0.4rem 0.3rem' }} />
          {cycles.map((c) => (
            <SubNavItem
              key={c.id}
              active={view === c.id}
              onClick={() => setView(c.id)}
              icon={c.isGenesis ? <Moon size={16} /> : <span style={{ fontSize: 14 }}>{envMeta(c.environment).emoji}</span>}
              title={c.isGenesis ? 'Dyad Sleep Cycle' : c.name}
              subtitle={c.isGenesis ? 'Genesis' : envMeta(c.environment).label}
              indent
            />
          ))}
        </nav>

        {/* ------------------------------------------------ main content */}
        <div>
          {loading ? (
            <div style={{ color: 'var(--text-secondary)', padding: '2rem 0' }}>Loading the training table…</div>
          ) : view === 'home' ? (
            <HomeView
              counts={counts}
              cycles={cycles}
              genesis={genesis}
              onOpen={(id) => setView(id)}
            />
          ) : activeCycle ? (
            <CycleView
              cycle={activeCycle}
              candidates={candidates}
              onProvisioned={(id) => {
                load()
                setView(id)
              }}
            />
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>Cycle not found.</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- sub-nav */

function SubNavItem({
  active,
  onClick,
  icon,
  title,
  subtitle,
  indent,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  indent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.5rem 0.6rem',
        paddingLeft: indent ? '1.1rem' : '0.6rem',
        borderRadius: 9,
        border: active ? '1px solid var(--accent)' : '1px solid transparent',
        background: active ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        textAlign: 'left',
        marginBottom: 2,
      }}
    >
      <span style={{ color: active ? 'var(--accent-light)' : 'var(--text-secondary)', display: 'flex' }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{subtitle}</span>
      </span>
    </button>
  )
}

/* --------------------------------------------------------------------- home */

function HomeView({
  counts,
  cycles,
  genesis,
  onOpen,
}: {
  counts: { total: number; active: number; sandboxes: number; voids: number }
  cycles: Cycle[]
  genesis: Cycle | null
  onOpen: (id: number) => void
}) {
  const stats = [
    { label: 'Total cycles', value: counts.total, icon: <Layers size={16} /> },
    { label: 'Active cycles', value: counts.active, icon: <CircleDashed size={16} /> },
    { label: 'Sandboxes', value: counts.sandboxes, icon: <span style={{ fontSize: 14 }}>🧪</span> },
    { label: 'Voids', value: counts.voids, icon: <span style={{ fontSize: 14 }}>🕳️</span> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* intro */}
      <div style={{ ...card, padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Neural-Dyad Training</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, maxWidth: 720 }}>
          A neural-dyad training cycle is an offline phase in which an AI–Human dyad consolidates its shared
          collaborative state into long-term memory — modeled on the stages of a real sleep cycle. Cycles are
          recorded in the <strong style={{ color: 'var(--text-primary)' }}>Agentic Training Table (ATT)</strong>, the
          persistent registry from which every future training environment is provisioned.
        </p>
      </div>

      {/* counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem' }}>
        {stats.map((s) => (
          <div key={s.label} style={{ ...card, padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: 6 }}>
              {s.icon}
              {s.label}
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* featured genesis */}
      {genesis && (
        <div
          style={{
            ...card,
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(79,70,229,0.06))',
            border: '1px solid rgba(168,85,247,0.35)',
          }}
        >
          <div style={{ ...label, color: 'var(--accent-light)', marginBottom: '0.6rem' }}>Featured · the inaugural training</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '2rem' }}>🌙</div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{genesis.name}</h3>
                {statusPill(genesis.status)}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: '0 0 0.9rem', maxWidth: 640 }}>
                {genesis.description}
              </p>
              <button
                onClick={() => onOpen(genesis.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0.55rem 1.1rem',
                  borderRadius: 9,
                  border: 'none',
                  background: 'linear-gradient(135deg, #a855f7, #4f46e5)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Open the Dyad Sleep Cycle <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* registry table */}
      <div>
        <div style={{ ...label, marginBottom: '0.6rem' }}>Agentic Training Table — registry</div>
        <div style={{ ...card, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 0.9fr 1fr 0.9fr 1.4fr',
              gap: '0.5rem',
              padding: '0.7rem 1rem',
              borderBottom: '1px solid var(--border)',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)',
            }}
          >
            <span>Cycle</span>
            <span>Env</span>
            <span>Mode</span>
            <span>Status</span>
            <span>Anchor</span>
          </div>
          {cycles.map((c) => {
            const env = envMeta(c.environment)
            const mode = modeMeta(c.trainingMode)
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 0.9fr 1fr 0.9fr 1.4fr',
                  gap: '0.5rem',
                  padding: '0.7rem 1rem',
                  borderBottom: '1px solid var(--border)',
                  background: 'transparent',
                  border: 'none',
                  borderBottomWidth: 1,
                  borderBottomStyle: 'solid',
                  borderBottomColor: 'var(--border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  alignItems: 'center',
                  color: 'var(--text-primary)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 15 }}>{c.isGenesis ? '🌙' : env.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                    {c.isGenesis && (
                      <span style={{ marginLeft: 6, fontSize: '0.62rem', color: 'var(--accent-light)', fontWeight: 700 }}>GENESIS</span>
                    )}
                  </span>
                </span>
                <span style={{ fontSize: '0.8rem', color: env.color }}>{env.label}</span>
                <span style={{ fontSize: '0.8rem', color: mode.color }}>{mode.premium ? 'Premium' : 'Standard'}</span>
                <span>{statusPill(c.status)}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.anchorHash}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- cycle view */

function CycleView({
  cycle,
  candidates,
  onProvisioned,
}: {
  cycle: Cycle
  candidates: Candidate[]
  onProvisioned: (id: number) => void
}) {
  const env = envMeta(cycle.environment)
  const mode = modeMeta(cycle.trainingMode)
  const current = phaseIndex(cycle.phase)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* header */}
      <div style={{ ...card, padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.6rem' }}>{cycle.isGenesis ? '🌙' : env.emoji}</span>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
            {cycle.isGenesis ? 'Dyad Sleep Cycle' : cycle.name}
          </h2>
          {statusPill(cycle.status)}
          {cycle.isGenesis && (
            <span style={{ fontSize: '0.62rem', color: 'var(--accent-light)', fontWeight: 700, border: '1px solid rgba(168,85,247,0.4)', borderRadius: 6, padding: '0.1rem 0.45rem' }}>
              GENESIS
            </span>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, maxWidth: 720 }}>{cycle.description || env.desc}</p>

        {/* meta chips */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.1rem' }}>
          <MetaChip icon={<Hash size={14} />} title="Agent Anchor Hash" value={cycle.anchorHash} mono />
          <MetaChip icon={<Users size={14} />} title="Dyad pairing" value={cycle.dyadPairing} />
          <MetaChip icon={<Layers size={14} />} title="Consolidation epochs" value={String(cycle.consolidationEpochs)} />
          <MetaChip
            icon={mode.premium ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            title="Training mode"
            value={mode.label}
            color={mode.color}
          />
        </div>
      </div>

      {/* phase track */}
      <div style={{ ...card, padding: '1.5rem' }}>
        <div style={{ ...label, marginBottom: '1rem' }}>Sleep-phase track — current phase highlighted</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {SLEEP_PHASES.map((p, i) => {
            const isCurrent = i === current
            const isPast = i < current
            return (
              <div
                key={p.slug}
                style={{
                  display: 'flex',
                  gap: '0.85rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 11,
                  border: `1px solid ${isCurrent ? p.color : 'var(--border)'}`,
                  background: isCurrent ? `${p.color}1a` : isPast ? 'var(--bg-secondary)' : 'transparent',
                  opacity: isPast ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 17,
                    background: isCurrent ? p.color : 'var(--bg-hover)',
                  }}
                >
                  {p.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: isCurrent ? p.color : 'var(--text-primary)' }}>
                      {i + 1}. {p.label}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: '0.64rem', fontWeight: 700, color: p.color, border: `1px solid ${p.color}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>
                        CURRENT
                      </span>
                    )}
                    {isPast && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>✓ consolidated</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{p.desc}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* enrolled dyad members */}
      <EnrolledPanel cycle={cycle} candidates={candidates} />

      {/* provision form */}
      <ProvisionForm candidates={candidates} onProvisioned={onProvisioned} />
    </div>
  )
}

function MetaChip({
  icon,
  title,
  value,
  mono,
  color,
}: {
  icon: React.ReactNode
  title: string
  value: string
  mono?: boolean
  color?: string
}) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.55rem 0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icon}
        {title}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: mono ? 'monospace' : undefined, marginTop: 3 }}>
        {value}
      </div>
    </div>
  )
}

function EnrolledPanel({ cycle, candidates }: { cycle: Cycle; candidates: Candidate[] }) {
  const enrolled = candidates.filter((c) => cycle.enrolled?.includes(c.id))
  return (
    <div style={{ ...card, padding: '1.25rem' }}>
      <div style={{ ...label, marginBottom: '0.7rem' }}>Dyad — enrolled characters</div>
      {enrolled.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
          No characters enrolled yet — this cycle trains the AI–Human anchor alone. Characters that meet the entry
          criteria can be admitted when a new environment is provisioned below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {enrolled.map((c) => (
            <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 20, padding: '0.3rem 0.7rem', fontSize: '0.82rem' }}>
              <span>{c.avatar}</span>
              {c.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- provision form */

function ProvisionForm({
  candidates,
  onProvisioned,
}: {
  candidates: Candidate[]
  onProvisioned: (id: number) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [environment, setEnvironment] = useState<EnvSlug>('sandbox')
  const [trainingMode, setTrainingMode] = useState<ModeSlug>('standard')
  const [enrolled, setEnrolled] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  const criteria = criteriaForMode(trainingMode)

  // Eligibility is evaluated per the chosen mode — switching to premium re-filters.
  const evaluated = useMemo(
    () =>
      candidates
        .map((c) => ({ c, ev: trainingMode === 'external' ? c.external : c.standard }))
        .sort((a, b) => b.ev.score - a.ev.score),
    [candidates, trainingMode],
  )
  const eligibleCount = evaluated.filter((e) => e.ev.eligible).length

  // Drop any now-ineligible selections when the mode tightens.
  useEffect(() => {
    setEnrolled((prev) => prev.filter((id) => evaluated.find((e) => e.c.id === id)?.ev.eligible))
  }, [trainingMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number, eligible: boolean) => {
    if (!eligible) return
    setEnrolled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submit = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/neural', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: WS, name: name.trim(), description, environment, trainingMode, enrolled }),
      })
      if (res.ok) {
        const created = await res.json()
        setName('')
        setDescription('')
        setEnrolled([])
        if (created?.id) onProvisioned(created.id)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ ...card, padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Plus size={17} color="var(--accent-light)" />
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Provision a new training environment</h3>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 1.1rem', maxWidth: 680 }}>
        Declare a sandbox or void, give it a training mode, and it enters the ATT dormant at the first sleep stage with
        its own deterministic Agent Anchor Hash — ready to begin its own cycle.
      </p>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Cycle name (e.g. Cohort Replay Void)"
        style={inputStyle}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What does this cycle consolidate? (optional)"
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
      />

      {/* environment */}
      <div style={{ ...label, margin: '0.4rem 0 0.4rem' }}>Environment</div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        {ENVIRONMENTS.map((e) => {
          const active = environment === e.slug
          return (
            <button
              key={e.slug}
              onClick={() => setEnvironment(e.slug)}
              style={{
                flex: '1 1 220px',
                textAlign: 'left',
                padding: '0.7rem 0.85rem',
                borderRadius: 11,
                border: `1px solid ${active ? e.color : 'var(--border)'}`,
                background: active ? `${e.color}1a` : 'var(--bg-secondary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: active ? e.color : 'var(--text-primary)' }}>
                {e.emoji} {e.label}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>{e.desc}</div>
            </button>
          )
        })}
      </div>

      {/* mode */}
      <div style={{ ...label, margin: '0.4rem 0 0.4rem' }}>Training mode</div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {TRAINING_MODES.map((m) => {
          const active = trainingMode === m.slug
          return (
            <button
              key={m.slug}
              onClick={() => setTrainingMode(m.slug)}
              style={{
                flex: '1 1 220px',
                textAlign: 'left',
                padding: '0.7rem 0.85rem',
                borderRadius: 11,
                border: `1px solid ${active ? m.color : 'var(--border)'}`,
                background: active ? `${m.color}1a` : 'var(--bg-secondary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: active ? m.color : 'var(--text-primary)' }}>
                {m.emoji} {m.label}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>{m.desc}</div>
            </button>
          )
        })}
      </div>

      {/* entry criteria + candidate gate */}
      <div style={{ ...label, margin: '0.4rem 0 0.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Entry — admit characters</span>
        <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {criteria.label} · development ≥ {criteria.minDevelopment} · {eligibleCount}/{evaluated.length} qualify
        </span>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.7rem' }}>
        Only characters that clear the criteria can enter — this is how the grounds cancel out the noise from
        undeveloped characters. Ineligible ones are shown locked.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 300, overflowY: 'auto', marginBottom: '1.1rem' }}>
        {evaluated.map(({ c, ev }) => {
          const selected = enrolled.includes(c.id)
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id, ev.eligible)}
              disabled={!ev.eligible}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.5rem 0.7rem',
                borderRadius: 10,
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                background: selected ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                cursor: ev.eligible ? 'pointer' : 'not-allowed',
                opacity: ev.eligible ? 1 : 0.55,
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18 }}>{c.avatar}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{c.name}</span>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {c.category} · {c.totalChats} chats · {c.signalCount} signals
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', color: ev.eligible ? '#10b981' : '#ef4444' }}>
                {ev.eligible ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                <span style={{ fontWeight: 700 }}>{ev.score}</span>
              </span>
            </button>
          )
        })}
        {evaluated.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '0.5rem' }}>No characters yet.</div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={!name.trim() || saving}
        style={{
          padding: '0.6rem 1.3rem',
          borderRadius: 9,
          border: 'none',
          background: !name.trim() || saving ? 'var(--bg-hover)' : 'linear-gradient(135deg, #a855f7, #4f46e5)',
          color: 'white',
          fontWeight: 700,
          fontSize: '0.88rem',
          cursor: !name.trim() || saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Provisioning…' : `Provision ${envMeta(environment).label.toLowerCase()}`}
      </button>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '0.65rem 0.8rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  marginBottom: '0.6rem',
} as const
