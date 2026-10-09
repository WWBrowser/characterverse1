import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarClock,
  Mail,
  Radar,
  Crown,
  Zap,
  Plus,
  Trash2,
  ChevronRight,
  CalendarDays,
  NotebookPen,
  Users,
  UserCheck,
  Shield,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'

export const Route = createFileRoute('/cron')({
  component: CronPage,
})

/* ----------------------------------------------------------------- types */

type Sub = {
  id: number
  email: string
  agentsPath: string
  cadence: string
  scope: string
  dedicatedAgentId: number | null
  lastFiredAt: string | null
}

type Ev = {
  id: number
  sessionId: string
  calendar: string
  kind: string
  title: string
  note: string
  status: string
  scheduledAt: string | null
}

type Agent = { id: number; name: string; avatar: string }

type Shadow = {
  memberCalendars: number
  upcomingEvents: number
  soonest: { kind: string; calendar: string; scheduledAt: string | null }[]
}

type Pulse = { id: number; source: string; firedAt: string; sample: Shadow; note: string } | null

type CronData = {
  subscription: Sub | null
  datetimeEvents: Ev[]
  contentEvents: Ev[]
  masterEvents: Ev[]
  shadow: Shadow
  latestPulse: Pulse
  myAgents: Agent[]
}

/* ------------------------------------------------------------- constants */

const CADENCES = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
]

const SCOPES = [
  { id: 'all', label: 'All agents', hint: 'Every agent on the platform may know your business', icon: Users },
  { id: 'one', label: 'Just one', hint: 'Only your dedicated agent knows', icon: UserCheck },
  { id: 'worked', label: 'Worked with', hint: 'Only agents you have already chatted with', icon: Shield },
]

const KIND_LABEL: Record<string, string> = {
  appointment: 'Appointment',
  celebration: 'Celebration',
  brief: 'Brief',
  competition: 'Competition',
  announcement: 'Announcement',
  mailer: 'Mailer',
}

const STATUS_COLOR: Record<string, string> = {
  upcoming: '#60a5fa',
  today: '#fbbf24',
  idea: '#a78bfa',
  scheduled: '#60a5fa',
  in_progress: '#fbbf24',
  draft: '#9090b0',
  live: '#34d399',
  done: '#34d399',
}

/* ----------------------------------------------------------------- shared UI */

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '1.25rem',
}

const input: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.5rem 0.625rem',
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
}

function btn(primary = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.5rem 0.9rem',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-secondary)',
    color: primary ? 'white' : 'var(--text-secondary)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
  }
}

function fmt(iso: string | null): string {
  if (!iso) return 'Unscheduled'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Unscheduled'
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SectionHead({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: 'rgba(124,92,191,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={19} color="var(--accent-light)" />
      </div>
      <div>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{title}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: '0.2rem 0 0' }}>{sub}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

function CronPage() {
  const [data, setData] = useState<CronData | null>(null)
  const [loading, setLoading] = useState(true)
  const [firing, setFiring] = useState(false)

  const load = () => {
    const sessionId = getSessionId()
    fetch(`/api/cron?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const firePulse = async () => {
    setFiring(true)
    try {
      await fetch('/api/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId() }),
      })
      load()
    } finally {
      setFiring(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '3rem', color: 'var(--text-secondary)' }}>Loading the cron layer…</div>
  }
  if (!data) {
    return <div style={{ padding: '3rem', color: 'var(--text-secondary)' }}>Could not load the cron layer.</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      {/* Hero */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
          <CalendarClock size={26} color="var(--accent-light)" />
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, margin: 0 }}>Agentic Cron & Calendars</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 720, margin: 0 }}>
          Where you, your agents, and your calendars meet in the middle. Set up a pulse, keep two calendars your
          agents actually read, and let every party stay in the loop — transparent, real time, smarter characters.
        </p>
      </div>

      {/* Set-up + Fire */}
      <div style={{ ...card, marginBottom: '1.5rem' }}>
        <SectionHead
          icon={Mail}
          title="Your cron job set-up"
          sub="One subscription: the mailbox your calendars publish to, the path to your agents, the pulse cadence, and who may know your business."
        />
        <SubscriptionForm sub={data.subscription} agents={data.myAgents} onSaved={load} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button style={btn(true)} onClick={firePulse} disabled={firing}>
            <Zap size={15} /> {firing ? 'Firing…' : 'Fire pulse now'}
          </button>
          {data.subscription?.lastFiredAt && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Last fired {fmt(data.subscription.lastFiredAt)}
            </span>
          )}
        </div>
      </div>

      {/* Two member calendars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <CalendarPanel
          icon={CalendarDays}
          calendar="datetime"
          title="Date & time calendar"
          sub="Appointments and celebrations. Your agents plan around these real dates."
          kinds={['appointment', 'celebration']}
          events={data.datetimeEvents}
          scheduled
          onChanged={load}
        />
        <CalendarPanel
          icon={NotebookPen}
          calendar="content"
          title="Content calendar"
          sub="The briefs you hand the A.I. to work on. Advance each one as it moves."
          kinds={['brief']}
          events={data.contentEvents}
          onChanged={load}
        />
      </div>

      {/* Shadow calendars */}
      <div style={{ ...card, marginBottom: '1.5rem' }}>
        <SectionHead
          icon={Radar}
          title="Agentic shadow calendars"
          sub="A live, anonymised view of what the agents collectively know — the shape of the community, never anyone's private rows."
        />
        <ShadowView shadow={data.shadow} pulse={data.latestPulse} />
      </div>

      {/* Admin master calendar */}
      <div style={card}>
        <SectionHead
          icon={Crown}
          title="Studio master calendar"
          sub="The platform-wide cron: competitions, announcements and mailers that broadcast to every member's mailbox on the next pulse."
        />
        <CalendarPanel
          icon={Crown}
          calendar="master"
          title=""
          sub=""
          kinds={['competition', 'announcement', 'mailer']}
          events={data.masterEvents}
          scheduled
          bare
          onChanged={load}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------ subscription form */

function SubscriptionForm({
  sub,
  agents,
  onSaved,
}: {
  sub: Sub | null
  agents: Agent[]
  onSaved: () => void
}) {
  const [email, setEmail] = useState(sub?.email ?? '')
  const [agentsPath, setAgentsPath] = useState(sub?.agentsPath ?? '/memory')
  const [cadence, setCadence] = useState(sub?.cadence ?? 'daily')
  const [scope, setScope] = useState(sub?.scope ?? 'worked')
  const [dedicatedAgentId, setDedicatedAgentId] = useState<number | null>(sub?.dedicatedAgentId ?? null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/cron', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), email, agentsPath, cadence, scope, dedicatedAgentId }),
      })
      if (res.ok) {
        setSaved(true)
        onSaved()
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Calendar email address
          <input
            style={{ ...input, marginTop: '0.35rem' }}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Path to your agents section
          <input
            style={{ ...input, marginTop: '0.35rem' }}
            placeholder="/memory"
            value={agentsPath}
            onChange={(e) => setAgentsPath(e.target.value)}
          />
        </label>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Pulse cadence
          <select style={{ ...input, marginTop: '0.35rem' }} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {CADENCES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Privacy lever */}
      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Which of your agents may know your business?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.625rem' }}>
          {SCOPES.map((s) => {
            const active = scope === s.id
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                style={{
                  textAlign: 'left',
                  padding: '0.75rem',
                  borderRadius: 10,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(124,92,191,0.12)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                  <Icon size={15} color={active ? 'var(--accent-light)' : 'var(--text-secondary)'} />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s.label}</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.hint}</span>
              </button>
            )
          })}
        </div>
        {scope === 'one' && (
          <select
            style={{ ...input, marginTop: '0.625rem', maxWidth: 360 }}
            value={dedicatedAgentId ?? ''}
            onChange={(e) => setDedicatedAgentId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Choose your dedicated agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.avatar?.startsWith('data:') ? '' : a.avatar} {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button style={btn(true)} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : sub ? 'Update set-up' : 'Save set-up'}
        </button>
        {saved && <span style={{ color: '#34d399', fontSize: '0.8rem' }}>Saved ✓</span>}
      </div>
    </div>
  )
}

/* --------------------------------------------------------- calendar panel */

function CalendarPanel({
  icon: Icon,
  calendar,
  title,
  sub,
  kinds,
  events,
  scheduled = false,
  bare = false,
  onChanged,
}: {
  icon: any
  calendar: string
  title: string
  sub: string
  kinds: string[]
  events: Ev[]
  scheduled?: boolean
  bare?: boolean
  onChanged: () => void
}) {
  const [kind, setKind] = useState(kinds[0])
  const [titleVal, setTitleVal] = useState('')
  const [note, setNote] = useState('')
  const [when, setWhen] = useState('')
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (!titleVal.trim() || adding) return
    setAdding(true)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getSessionId(),
          calendar,
          kind,
          title: titleVal,
          note,
          scheduledAt: when ? new Date(when).toISOString() : null,
        }),
      })
      if (res.ok) {
        setTitleVal('')
        setNote('')
        setWhen('')
        onChanged()
      }
    } finally {
      setAdding(false)
    }
  }

  const advance = async (e: Ev) => {
    await fetch(`/api/calendar/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSessionId(), advance: true }),
    })
    onChanged()
  }

  const remove = async (e: Ev) => {
    await fetch(`/api/calendar/${e.id}?sessionId=${encodeURIComponent(getSessionId())}`, { method: 'DELETE' })
    onChanged()
  }

  const inner = (
    <>
      {!bare && <SectionHead icon={Icon} title={title} sub={sub} />}

      {/* Add form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {kinds.length > 1 && (
            <select style={{ ...input, width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          )}
          <input
            style={input}
            placeholder={calendar === 'content' ? 'What should the A.I. work on?' : 'Title…'}
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </div>
        {scheduled && (
          <input
            style={input}
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            style={input}
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={btn(true)} onClick={add} disabled={adding}>
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* List */}
      {events.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', textAlign: 'center', padding: '1rem 0' }}>
          Nothing here yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {events.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.625rem 0.75rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {KIND_LABEL[e.kind] || e.kind}
                  </span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      padding: '0.05rem 0.4rem',
                      borderRadius: 5,
                      color: STATUS_COLOR[e.status] || 'var(--text-secondary)',
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    {e.status.replace('_', ' ')}
                  </span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{fmt(e.scheduledAt)}</div>
              </div>
              {e.status !== 'done' && (
                <button
                  onClick={() => advance(e)}
                  title="Advance status"
                  style={{ ...btn(false), padding: '0.3rem 0.5rem' }}
                >
                  <ChevronRight size={14} />
                </button>
              )}
              <button
                onClick={() => remove(e)}
                title="Remove"
                style={{ ...btn(false), padding: '0.3rem 0.5rem', color: '#f87171' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )

  return bare ? <div>{inner}</div> : <div style={card}>{inner}</div>
}

/* ----------------------------------------------------------- shadow view */

function ShadowView({ shadow, pulse }: { shadow: Shadow; pulse: Pulse }) {
  const stat = (label: string, value: React.ReactNode) => (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--accent-light)' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {stat('Member calendars worldwide', shadow.memberCalendars)}
        {stat('Events coming up', shadow.upcomingEvents)}
        {stat('Soonest events sampled', shadow.soonest.length)}
      </div>
      {shadow.soonest.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {shadow.soonest.map((s, i) => (
            <span
              key={i}
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 999,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {KIND_LABEL[s.kind] || s.kind} · {fmt(s.scheduledAt)}
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {pulse ? (
          <>
            Latest pulse — <strong style={{ color: 'var(--text-primary)' }}>{pulse.source}</strong> at{' '}
            {fmt(pulse.firedAt)}. The cron fires hourly on published deploys; agents fold this sample into every reply.
          </>
        ) : (
          <>No pulse recorded yet. Fire one above, or wait for the hourly cron on the published deploy.</>
        )}
      </div>
    </div>
  )
}
