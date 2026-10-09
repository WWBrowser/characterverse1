import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Radar,
  Cpu,
  Bot,
  Network,
  Workflow,
  Brain,
  Play,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  X,
  Pin,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Layers,
  Sparkles,
} from 'lucide-react'
import {
  CHANNELS,
  AUTONOMY_LEVELS,
  CONTEXT_KINDS,
  channelMeta,
  autonomyMeta,
  statusMeta,
  contextKindMeta,
  clearanceLabel,
  type MissionStep,
} from '../lib/controltower'

const WS = 'default'

/* ---------------------------------------------------------------------- types */

type Feed = {
  stats: {
    characters: number
    agentsEnabled: number
    agentsTotal: number
    missionsTotal: number
    missionsActive: number
    missionsDone: number
    contextTotal: number
    contextPinned: number
    models: number
  }
  agents: any[]
  characters: any[]
  models: { id: string; label: string; provider: string; role: string }[]
}

type Mission = {
  id: number
  title: string
  objective: string
  channel: string
  autonomy: string
  clearance: string
  status: string
  steps: MissionStep[]
  contextRefs: number[]
  progress: number
  result: string
  characterId: number | null
  characterName?: string | null
  characterAvatar?: string | null
}

type ContextEntry = {
  id: number
  kind: string
  title: string
  body: string
  tags: string[]
  source: string
  confidence: number
  pinned: boolean
}

/* ------------------------------------------------------------------- helpers */

async function jsonOrNull(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/* --------------------------------------------------------------------- atoms */

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.2rem 0.55rem',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 700,
        color,
        background: bg || `${color}1a`,
        border: `1px solid ${color}55`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const m = statusMeta(status)
  return <Pill color={m.color}>{m.label}</Pill>
}

function card(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '1.25rem',
    ...extra,
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  borderRadius: 10,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  marginBottom: '0.35rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

function btn(primary?: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.55rem 0.9rem',
    borderRadius: 10,
    border: `1px solid ${primary ? 'transparent' : 'var(--border)'}`,
    background: primary ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-secondary)',
    color: primary ? '#fff' : 'var(--text-primary)',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

/* ====================================================================== PAGE */

function ControlTowerPage() {
  const [tab, setTab] = useState<'overview' | 'missions' | 'context'>('overview')
  const [feed, setFeed] = useState<Feed | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [context, setContext] = useState<ContextEntry[]>([])

  const loadFeed = useCallback(async () => {
    const d = await fetch(`/api/controltower?workspace=${WS}`).then(jsonOrNull)
    if (d?.stats) setFeed(d)
  }, [])
  const loadMissions = useCallback(async () => {
    const d = await fetch(`/api/missions?workspace=${WS}`).then(jsonOrNull)
    if (d?.missions) setMissions(d.missions)
  }, [])
  const loadContext = useCallback(async () => {
    const d = await fetch(`/api/context?workspace=${WS}`).then(jsonOrNull)
    if (d?.entries) setContext(d.entries)
  }, [])

  useEffect(() => {
    loadFeed()
    loadMissions()
    loadContext()
  }, [loadFeed, loadMissions, loadContext])

  const refreshAll = useCallback(() => {
    loadFeed()
    loadMissions()
  }, [loadFeed, loadMissions])

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      <Hero stats={feed?.stats} />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 1.25rem 4rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { key: 'overview', label: 'Fleet overview', icon: Radar },
            { key: 'missions', label: 'Missions', icon: Workflow },
            { key: 'context', label: 'Context Engine', icon: Brain },
          ].map(({ key, label, icon: Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key as any)}
                style={{
                  ...btn(false),
                  background: active ? 'rgba(124,92,191,0.16)' : 'var(--bg-secondary)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                  padding: '0.6rem 1rem',
                }}
              >
                <Icon size={15} /> {label}
              </button>
            )
          })}
        </div>

        {tab === 'overview' && <Overview feed={feed} />}
        {tab === 'missions' && (
          <Missions
            feed={feed}
            context={context}
            missions={missions}
            onChanged={refreshAll}
          />
        )}
        {tab === 'context' && <ContextEngine entries={context} onChanged={() => { loadContext(); loadFeed() }} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- hero */

function Hero({ stats }: { stats?: Feed['stats'] }) {
  const kpis = [
    { icon: Bot, label: 'AI specialists', value: stats?.characters ?? '—' },
    { icon: Network, label: 'Agents online', value: stats ? `${stats.agentsEnabled}/${stats.agentsTotal}` : '—' },
    { icon: Cpu, label: 'Models', value: stats?.models ?? '—' },
    { icon: Workflow, label: 'Missions active', value: stats?.missionsActive ?? '—' },
    { icon: Brain, label: 'Context entries', value: stats?.contextTotal ?? '—' },
  ]
  return (
    <div style={{ padding: '2.75rem 1.25rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,92,191,0.16), transparent)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.9rem',
            borderRadius: 999,
            background: 'rgba(124,92,191,0.15)',
            border: '1px solid rgba(124,92,191,0.3)',
            color: 'var(--accent-light)',
            fontSize: '0.78rem',
            fontWeight: 700,
            marginBottom: '1rem',
          }}
        >
          <Radar size={13} /> Enterprise control deck
        </div>
        <h1 style={{ fontSize: 'clamp(1.9rem, 4vw, 3rem)', fontWeight: 800, lineHeight: 1.12, marginBottom: '0.7rem' }}>
          AI <span className="gradient-text">Control Tower</span>
        </h1>
        <p style={{ fontSize: 'clamp(0.95rem, 2vw, 1.1rem)', color: 'var(--text-secondary)', maxWidth: 720, lineHeight: 1.6 }}>
          See every AI agent, model and workflow in your enterprise — and run them from one platform. Outbound
          characters work autonomously across a planned workflow, grounded in shared business context, and report
          finished work, not just chat.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem',
            marginTop: '1.75rem',
          }}
        >
          {kpis.map(({ icon: Icon, label, value }) => (
            <div key={label} style={card({ padding: '1rem 1.1rem' })}>
              <Icon size={17} color="var(--accent-light)" style={{ marginBottom: '0.45rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* =================================================================== OVERVIEW */

function Overview({ feed }: { feed: Feed | null }) {
  if (!feed) return <Loading />

  const enabled = feed.agents.filter((a) => a.enabled)
  const warden = enabled.find((a) => a.role === 'warden')
  const workers = enabled.filter((a) => a.role === 'agent')

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Model registry */}
        <div style={card()}>
          <SectionHead icon={Cpu} title="Model registry" sub="Every model fronting the fleet" />
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {feed.models.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.7rem',
                  padding: '0.7rem 0.85rem',
                  borderRadius: 12,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '1.1rem' }}>🧠</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.label}</span>
                    <Pill color="#a78bfa">{m.provider}</Pill>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.5 }}>
                    {m.role}
                  </div>
                  <code style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{m.id}</code>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent roster */}
        <div style={card()}>
          <SectionHead
            icon={Network}
            title="Agent roster"
            sub="The RouteClaw layer that executes mission steps"
            right={
              <Link to="/routeclaw" style={{ fontSize: '0.76rem', color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 600 }}>
                Manage →
              </Link>
            }
          />
          {warden && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.6rem 0.75rem',
                borderRadius: 12,
                background: 'rgba(124,92,191,0.12)',
                border: '1px solid rgba(124,92,191,0.3)',
                marginBottom: '0.6rem',
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{warden.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                  {warden.name} <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>· Warden</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Intake & routing hub</div>
              </div>
              <Pill color="#ef4444">{clearanceLabel(warden.clearance)}</Pill>
            </div>
          )}
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {workers.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.5rem 0.7rem',
                  borderRadius: 10,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: '1.05rem' }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{a.name}</div>
                  <div style={{ fontSize: '0.72rem', color: a.color }}>{a.capability}</div>
                </div>
                <Pill color="#94a3b8">{clearanceLabel(a.clearance)}</Pill>
              </div>
            ))}
            {workers.length === 0 && <Empty>No worker agents online.</Empty>}
          </div>
        </div>
      </div>

      {/* How it works strip */}
      <div style={card()}>
        <SectionHead icon={Layers} title="How a mission runs" sub="Intent → planned workflow → finished work" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {[
            { n: '1', t: 'Brief the specialist', d: 'Pick an outbound character, set the objective, channel and autonomy level.' },
            { n: '2', t: 'Ground in context', d: 'Attach Context Engine entries — the shared business memory the agent acts on.' },
            { n: '3', t: 'Plan the workflow', d: 'The objective is decomposed into capability steps mapped to RouteClaw agents.' },
            { n: '4', t: 'Run & deliver', d: 'Steps run on cleared agents; the character drafts the finished outbound work.' },
          ].map((s) => (
            <div key={s.n} style={{ padding: '0.85rem', borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: 'rgba(124,92,191,0.18)',
                  color: 'var(--accent-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  marginBottom: '0.5rem',
                }}
              >
                {s.n}
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: '0.25rem' }}>{s.t}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* =================================================================== MISSIONS */

function Missions({
  feed,
  context,
  missions,
  onChanged,
}: {
  feed: Feed | null
  context: ContextEntry[]
  missions: Mission[]
  onChanged: () => void
}) {
  const [creating, setCreating] = useState(false)

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Autonomous workforce</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {missions.length} mission{missions.length === 1 ? '' : 's'} · specialists working outbound jobs end to end
          </p>
        </div>
        <button style={btn(true)} onClick={() => setCreating((v) => !v)}>
          {creating ? <X size={15} /> : <Plus size={15} />} {creating ? 'Cancel' : 'New mission'}
        </button>
      </div>

      {creating && (
        <MissionForm
          feed={feed}
          context={context}
          onDone={() => {
            setCreating(false)
            onChanged()
          }}
        />
      )}

      <div style={{ display: 'grid', gap: '0.9rem' }}>
        {missions.map((m) => (
          <MissionCard key={m.id} mission={m} onChanged={onChanged} />
        ))}
        {missions.length === 0 && !creating && (
          <div style={card({ textAlign: 'center', padding: '3rem 1rem' })}>
            <Workflow size={28} color="var(--text-secondary)" style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>No missions yet</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Brief an outbound specialist and let it run a workflow autonomously.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MissionForm({
  feed,
  context,
  onDone,
}: {
  feed: Feed | null
  context: ContextEntry[]
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [characterId, setCharacterId] = useState<string>('')
  const [channel, setChannel] = useState('email')
  const [autonomy, setAutonomy] = useState('supervised')
  const [clearance, setClearance] = useState('internal')
  const [refs, setRefs] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleRef = (id: number) => setRefs((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))

  const submit = async () => {
    setError('')
    if (!title.trim() || !objective.trim()) {
      setError('A title and objective are required.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: WS,
        title,
        objective,
        characterId: characterId ? Number(characterId) : null,
        channel,
        autonomy,
        clearance,
        contextRefs: refs,
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await jsonOrNull(res)
      setError(d?.error || 'Could not create the mission.')
      return
    }
    onDone()
  }

  return (
    <div style={card()}>
      <SectionHead icon={Sparkles} title="Brief a specialist" sub="The objective is decomposed into a workflow automatically" />
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <label style={labelStyle}>Mission title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Draft Q3 partner outreach" maxLength={100} />
        </div>
        <div>
          <label style={labelStyle}>Objective</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Describe the outbound job. Keywords (research, analyze, verify, deliver…) shape the workflow."
            maxLength={600}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Operating specialist</label>
            <select style={inputStyle} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
              <option value="">Auto / unassigned</option>
              {feed?.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.avatar} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Channel</label>
            <select style={inputStyle} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.channel} value={c.channel}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Clearance</label>
            <select style={inputStyle} value={clearance} onChange={(e) => setClearance(e.target.value)}>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Autonomy</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
            {AUTONOMY_LEVELS.map((a) => {
              const active = autonomy === a.autonomy
              return (
                <button
                  key={a.autonomy}
                  onClick={() => setAutonomy(a.autonomy)}
                  style={{
                    textAlign: 'left',
                    padding: '0.7rem 0.8rem',
                    borderRadius: 12,
                    cursor: 'pointer',
                    background: active ? `${a.color}1a` : 'var(--bg-secondary)',
                    border: `1px solid ${active ? a.color : 'var(--border)'}`,
                    color: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.84rem', marginBottom: '0.2rem' }}>
                    {a.icon} {a.label}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{a.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {context.length > 0 && (
          <div>
            <label style={labelStyle}>Ground in context ({refs.length} selected)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {context.map((c) => {
                const active = refs.includes(c.id)
                const km = contextKindMeta(c.kind)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleRef(c.id)}
                    style={{
                      padding: '0.4rem 0.7rem',
                      borderRadius: 999,
                      cursor: 'pointer',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      background: active ? `${km.color}22` : 'var(--bg-secondary)',
                      border: `1px solid ${active ? km.color : 'var(--border)'}`,
                      color: active ? km.color : 'var(--text-secondary)',
                    }}
                  >
                    {km.icon} {c.title}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</div>}
        <div>
          <button style={btn(true)} disabled={busy} onClick={submit}>
            {busy ? 'Planning…' : 'Create & plan workflow'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MissionCard({ mission, onChanged }: { mission: Mission; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const cm = channelMeta(mission.channel)
  const am = autonomyMeta(mission.autonomy)
  const steps = Array.isArray(mission.steps) ? mission.steps : []

  const run = async (signoff = false) => {
    setRunning(true)
    const res = await fetch(`/api/missions/${mission.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signoff }),
    })
    const d = await jsonOrNull(res)
    setRunning(false)
    if (d?.log) setLog(d.log)
    setOpen(true)
    onChanged()
  }

  const del = async () => {
    if (!confirm(`Delete mission "${mission.title}"?`)) return
    await fetch(`/api/missions/${mission.id}`, { method: 'DELETE' })
    onChanged()
  }

  const canRun = mission.status === 'draft' || mission.status === 'running' || mission.status === 'blocked'
  const needsSignoff = mission.status === 'review'

  return (
    <div style={card({ padding: '1.1rem 1.25rem' })}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
        <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{mission.characterAvatar || '🛰️'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>{mission.title}</span>
            <StatusPill status={mission.status} />
            <Pill color={am.color}>{am.icon} {am.label}</Pill>
            <Pill color="#9090b0">{cm.icon} {cm.label}</Pill>
            <Pill color="#94a3b8"><ShieldCheck size={11} /> {clearanceLabel(mission.clearance)}</Pill>
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{mission.objective}</div>
          {mission.characterName && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              Operated by <strong style={{ color: 'var(--text-primary)' }}>{mission.characterName}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginTop: '0.9rem' }}>
        <div style={{ height: 6, borderRadius: 6, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${mission.progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #7c5cbf, #60a5fa)',
              transition: 'width 0.4s',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          <span>{steps.filter((s) => s.status === 'done').length}/{steps.length} steps</span>
          <span>{mission.progress}%</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
        {needsSignoff ? (
          <button style={btn(true)} disabled={running} onClick={() => run(true)}>
            <CheckCircle2 size={14} /> {running ? 'Delivering…' : 'Sign off & deliver'}
          </button>
        ) : (
          canRun && (
            <button style={btn(true)} disabled={running} onClick={() => run(false)}>
              <Play size={14} /> {running ? 'Running…' : mission.status === 'draft' ? 'Run mission' : 'Advance'}
            </button>
          )
        )}
        <button style={btn(false)} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {open ? 'Hide' : 'Details'}
        </button>
        <div style={{ flex: 1 }} />
        <button style={{ ...btn(false), color: '#f87171', borderColor: 'transparent', background: 'transparent' }} onClick={del}>
          <Trash2 size={14} />
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          {/* Steps timeline */}
          <div>
            <div style={{ ...labelStyle, marginBottom: '0.6rem' }}>Workflow</div>
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              {steps.map((s, i) => {
                const done = s.status === 'done'
                const blocked = s.status === 'blocked'
                const active = s.status === 'active'
                const color = blocked ? '#ef4444' : done ? '#10b981' : active ? '#f59e0b' : '#9090b0'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                    <div style={{ marginTop: '0.15rem' }}>
                      {blocked ? <AlertTriangle size={15} color={color} /> : done ? <CheckCircle2 size={15} color={color} /> : <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${color}` }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem', color: done ? 'var(--text-primary)' : color }}>{s.label}</span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>{s.note}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Run log */}
          {log.length > 0 && (
            <div>
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>Last run</div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {log.map((l, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>· {l}</div>
                ))}
              </div>
            </div>
          )}

          {/* Deliverable */}
          {mission.result && (
            <div>
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>Deliverable</div>
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '0.9rem 1rem',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-primary)',
                }}
              >
                {mission.result}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ============================================================= CONTEXT ENGINE */

function ContextEngine({ entries, onChanged }: { entries: ContextEntry[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Context Engine</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Shared business context agents act on — {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <button style={btn(true)} onClick={() => setAdding((v) => !v)}>
          {adding ? <X size={15} /> : <Plus size={15} />} {adding ? 'Cancel' : 'Add context'}
        </button>
      </div>

      {adding && <ContextForm onDone={() => { setAdding(false); onChanged() }} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.9rem' }}>
        {entries.map((c) => (
          <ContextCard key={c.id} entry={c} onChanged={onChanged} />
        ))}
        {entries.length === 0 && !adding && <Empty>No context entries yet.</Empty>}
      </div>
    </div>
  )
}

function ContextForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState('fact')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [source, setSource] = useState('')
  const [confidence, setConfidence] = useState(3)
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!title.trim()) {
      setError('A title is required.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: WS,
        kind,
        title,
        body,
        source,
        confidence,
        pinned,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await jsonOrNull(res)
      setError(d?.error || 'Could not save the entry.')
      return
    }
    onDone()
  }

  return (
    <div style={card()}>
      <SectionHead icon={Brain} title="Add to the Context Engine" sub="Knowledge agents draw on before acting" />
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Kind</label>
            <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
              {CONTEXT_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.icon} {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Confidence (1–5)</label>
            <input style={inputStyle} type="number" min={1} max={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Restricted data never leaves the workspace" />
        </div>
        <div>
          <label style={labelStyle}>Detail</label>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Tags (comma separated)</label>
            <input style={inputStyle} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="security, brand" />
          </div>
          <div>
            <label style={labelStyle}>Source</label>
            <input style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} placeholder="Style guide" />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ accentColor: '#7c5cbf' }} />
          <Pin size={13} color="var(--accent-light)" /> Pin — inject into every mission in the workspace
        </label>
        {error && <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</div>}
        <div>
          <button style={btn(true)} disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ContextCard({ entry, onChanged }: { entry: ContextEntry; onChanged: () => void }) {
  const km = contextKindMeta(entry.kind)
  const del = async () => {
    if (!confirm(`Delete "${entry.title}"?`)) return
    await fetch(`/api/context/${entry.id}`, { method: 'DELETE' })
    onChanged()
  }
  const togglePin = async () => {
    await fetch(`/api/context/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, pinned: !entry.pinned }),
    })
    onChanged()
  }
  return (
    <div style={card({ padding: '1rem 1.1rem', borderColor: entry.pinned ? 'rgba(124,92,191,0.4)' : 'var(--border)' })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
        <Pill color={km.color}>{km.icon} {km.label}</Pill>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button onClick={togglePin} title={entry.pinned ? 'Unpin' : 'Pin'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: entry.pinned ? 'var(--accent-light)' : 'var(--text-secondary)' }}>
            <Pin size={14} fill={entry.pinned ? 'currentColor' : 'none'} />
          </button>
          <button onClick={del} title="Delete" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.3rem' }}>{entry.title}</div>
      {entry.body && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '0.5rem' }}>{entry.body}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
        {entry.tags?.map((t) => (
          <span key={t} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '0.15rem 0.45rem', borderRadius: 6 }}>
            #{t}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.6rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        {entry.source && <span>{entry.source}</span>}
        <span style={{ marginLeft: 'auto' }}>confidence {entry.confidence}/5</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- shared */

function SectionHead({
  icon: Icon,
  title,
  sub,
  right,
}: {
  icon: typeof Radar
  title: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <Icon size={17} color="var(--accent-light)" />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</div>
          {sub && <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  )
}

function Loading() {
  return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading the fleet…</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', padding: '0.5rem 0' }}>{children}</div>
}

export const Route = createFileRoute('/controltower')({
  component: ControlTowerPage,
})
