import { useEffect, useMemo, useState, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Crown,
  Shield,
  Settings2,
  MessageSquare,
  Users2,
  Plus,
  Trash2,
  Lock,
  ChevronDown,
  ChevronRight,
  Send,
  Sparkles,
  Power,
  Bot,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import {
  ROLES,
  TRACKS,
  roleMeta,
  roleRank,
  STUDIO_MODELS,
  STUDIO_MODULE_GROUPS,
  VISIBILITIES,
  coerceSettings,
  coerceLLM,
} from '../lib/studio'

type Member = {
  id: number
  handle: string
  role: string
  isSelf: boolean
  avatar: string
  note: string
}

type Module = {
  id: number
  moduleKey: string
  label: string
  icon: string
  groupName: string
  path: string
  enabled: boolean
  minRank: number
  settings: any
  llm: any
  position: number
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
}

function StudioPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [me, setMe] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  // A client-side lens to view the Studio from any status without changing the
  // owner's true status (always Master). Drives governance gating and locks.
  const [previewRole, setPreviewRole] = useState<string>('master')

  const load = () => {
    const sessionId = getSessionId()
    fetch(`/api/studio?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        setMembers(Array.isArray(data.members) ? data.members : [])
        setModules(Array.isArray(data.modules) ? data.modules : [])
        setMe(data.me || null)
        setPreviewRole(data.me?.role || 'master')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const myRank = roleRank(previewRole)

  const patchModule = async (id: number, patch: any) => {
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...applyOptimistic(m, patch) } : m)))
    await fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateModule', id, patch }),
    }).catch(() => load())
  }

  const addMember = async (handle: string, role: string, note: string) => {
    const res = await fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addMember', handle, role, note }),
    })
    if (res.ok) {
      const row = await res.json()
      setMembers((prev) => [...prev, row])
    }
  }

  const updateMember = async (id: number, role: string) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)))
    await fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateMember', id, role }),
    }).catch(() => load())
  }

  const removeMember = async (id: number) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
    await fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'removeMember', id }),
    }).catch(() => load())
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '2.25rem 1.25rem 5rem' }}>
      <Header me={me} previewRole={previewRole} onPreview={setPreviewRole} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ ...card, height: 72, opacity: 0.5 }} />
          ))}
        </div>
      ) : (
        <>
          <Hierarchy members={members} myRole={previewRole} />
          <Roster
            members={members}
            myRank={myRank}
            onAdd={addMember}
            onUpdate={updateMember}
            onRemove={removeMember}
          />
          <Governance modules={modules} myRank={myRank} onPatch={patchModule} />
          <Assistant modules={modules} />
        </>
      )}
    </div>
  )
}

function applyOptimistic(_m: Module, patch: any): Partial<Module> {
  const out: Partial<Module> = {}
  if (patch.enabled !== undefined) out.enabled = patch.enabled
  if (patch.minRank !== undefined) out.minRank = patch.minRank
  if (patch.settings !== undefined) out.settings = patch.settings
  if (patch.llm !== undefined) out.llm = patch.llm
  return out
}

/* ----------------------------------------------------------------- Header */

function Header({ me, previewRole, onPreview }: { me: Member | null; previewRole: string; onPreview: (role: string) => void }) {
  const meta = me ? roleMeta(me.role) : roleMeta('master')
  const previewing = me ? previewRole !== me.role : false
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '0.5rem' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 30px rgba(124,92,191,0.4)',
          }}
        >
          <Crown size={24} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            CharacterVerse <span className="gradient-text">Studio</span>
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            The admin operations deck — govern every surface, status and feature set from one place.
          </p>
        </div>
      </div>

      {/* Your status */}
      <div
        style={{
          ...card,
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          padding: '0.85rem 1rem',
          background: `linear-gradient(120deg, ${meta.color}14, var(--bg-card))`,
          borderColor: `${meta.color}55`,
        }}
      >
        <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            Your status
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: meta.color }}>
            {meta.label}
            {me?.isSelf && <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}> · owner (you)</span>}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{meta.desc}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.72rem', color: previewing ? 'var(--accent-light)' : 'var(--text-secondary)' }}>
            {previewing ? 'Previewing as' : 'Govern as'}
          </span>
          <select
            value={previewRole}
            onChange={(e) => onPreview(e.target.value)}
            style={selectStyle}
            title="A preview lens — see what each status can govern. Your true status stays Master."
          >
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label} · rank {r.rank}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- Hierarchy chart */

function Hierarchy({ members, myRole }: { members: Member[]; myRole: string }) {
  const countByRole = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of members) c[m.role] = (c[m.role] || 0) + 1
    return c
  }, [members])

  const master = roleMeta('master')

  return (
    <Section icon={<Shield size={16} />} title="Status hierarchy" subtitle="Worker ‹‹ supervisor across three tracks, with Master above all">
      {/* Master node */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem' }}>
        <StatusNode roleKey="master" count={countByRole['master'] || 0} active={myRole === 'master'} wide />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--border)', marginBottom: '0.4rem' }}>
        <div style={{ width: 1, height: 18, background: master.color, opacity: 0.4 }} />
      </div>

      {/* Tracks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
        {TRACKS.map((track) => {
          const supervisor = ROLES.find((r) => r.track === track && r.tier === 'supervisor')!
          const worker = ROLES.find((r) => r.track === track && r.tier === 'worker')!
          return (
            <div
              key={track}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '0.85rem',
                background: 'var(--bg-secondary)',
              }}
            >
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.6rem', textAlign: 'center' }}>
                {track}
              </div>
              <StatusNode roleKey={supervisor.key} count={countByRole[supervisor.key] || 0} active={myRole === supervisor.key} />
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.68rem', padding: '0.25rem 0' }}>
                <span style={{ fontWeight: 700 }}>‹‹</span> supervises
              </div>
              <StatusNode roleKey={worker.key} count={countByRole[worker.key] || 0} active={myRole === worker.key} />
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function StatusNode({ roleKey, count, active, wide }: { roleKey: string; count: number; active?: boolean; wide?: boolean }) {
  const meta = roleMeta(roleKey)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.55rem 0.75rem',
        borderRadius: 10,
        border: '1px solid',
        borderColor: active ? meta.color : 'var(--border)',
        background: active ? `${meta.color}1f` : 'var(--bg-card)',
        boxShadow: active ? `0 0 0 1px ${meta.color}55` : 'none',
        maxWidth: wide ? 320 : undefined,
        margin: wide ? '0 auto' : undefined,
      }}
    >
      <span style={{ fontSize: '1.05rem' }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: meta.color }}>{meta.label}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{meta.tier} · rank {meta.rank}</div>
      </div>
      <span
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          background: 'var(--bg-hover)',
          borderRadius: 999,
          padding: '0.1rem 0.5rem',
          minWidth: 24,
          textAlign: 'center',
        }}
        title={`${count} member${count === 1 ? '' : 's'}`}
      >
        {count}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------- Staff roster */

function Roster({
  members,
  myRank,
  onAdd,
  onUpdate,
  onRemove,
}: {
  members: Member[]
  myRank: number
  onAdd: (handle: string, role: string, note: string) => void
  onUpdate: (id: number, role: string) => void
  onRemove: (id: number) => void
}) {
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState('moderator')
  const [note, setNote] = useState('')
  // Only Master may manage staff (rank 100).
  const canManage = myRank >= 100

  const ordered = useMemo(
    () => [...members].sort((a, b) => roleRank(b.role) - roleRank(a.role) || a.handle.localeCompare(b.handle)),
    [members],
  )

  const submit = () => {
    const h = handle.trim()
    if (!h) return
    onAdd(h, role, note.trim())
    setHandle('')
    setNote('')
    setRole('moderator')
  }

  return (
    <Section icon={<Users2 size={16} />} title="Staff" subtitle={`${members.length} member${members.length === 1 ? '' : 's'} across the hierarchy`}>
      {canManage && (
        <div style={{ ...card, padding: '0.85rem', marginBottom: '0.9rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Handle, e.g. nadia-k"
            style={{ ...inputStyle, flex: '1 1 160px' }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle}>
            {ROLES.filter((r) => r.key !== 'master').map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Note (optional)"
            style={{ ...inputStyle, flex: '1 1 160px' }}
          />
          <button onClick={submit} disabled={!handle.trim()} style={primaryBtn(!!handle.trim())}>
            <Plus size={15} /> Add
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {ordered.map((m) => {
          const meta = roleMeta(m.role)
          return (
            <div key={m.id} style={{ ...card, padding: '0.65rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>{m.avatar}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>
                  {m.handle}
                  {m.isSelf && <span style={{ color: meta.color, fontWeight: 600, fontSize: '0.78rem' }}> · you</span>}
                </div>
                {m.note && <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.note}</div>}
              </div>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: meta.color,
                  background: `${meta.color}1f`,
                  borderRadius: 6,
                  padding: '0.2rem 0.5rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {meta.label}
              </span>
              {canManage && !m.isSelf ? (
                <>
                  <select value={m.role} onChange={(e) => onUpdate(m.id, e.target.value)} style={{ ...selectStyle, padding: '0.35rem 0.5rem' }}>
                    {ROLES.filter((r) => r.key !== 'master').map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => onRemove(m.id)} title="Remove member" style={iconBtn}>
                    <Trash2 size={15} />
                  </button>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

/* ----------------------------------------------------------- Module governance */

function Governance({ modules, myRank, onPatch }: { modules: Module[]; myRank: number; onPatch: (id: number, patch: any) => void }) {
  const [open, setOpen] = useState<number | null>(null)

  const byGroup = useMemo(() => {
    const map: Record<string, Module[]> = {}
    for (const m of modules) (map[m.groupName] ||= []).push(m)
    return map
  }, [modules])

  return (
    <Section
      icon={<Settings2 size={16} />}
      title="Modules"
      subtitle="Every surface under governance — admin settings plus a chat / twin-chat / LLM feature set on each"
    >
      {STUDIO_MODULE_GROUPS.map((group) => {
        const list = byGroup[group]
        if (!list || list.length === 0) return null
        return (
          <div key={group} style={{ marginBottom: '1.1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', margin: '0 0.2rem 0.5rem' }}>
              {group}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {list.map((m) => (
                <ModuleRow
                  key={m.id}
                  module={m}
                  locked={myRank < m.minRank}
                  open={open === m.id}
                  onToggle={() => setOpen((o) => (o === m.id ? null : m.id))}
                  onPatch={(patch) => onPatch(m.id, patch)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </Section>
  )
}

function ModuleRow({
  module,
  locked,
  open,
  onToggle,
  onPatch,
}: {
  module: Module
  locked: boolean
  open: boolean
  onToggle: () => void
  onPatch: (patch: any) => void
}) {
  const settings = coerceSettings(module.settings)
  const llm = coerceLLM(module.llm)
  const minMeta = roleMeta(ROLES.find((r) => r.rank === module.minRank)?.key || 'moderator')

  return (
    <div style={{ ...card, overflow: 'hidden', opacity: module.enabled ? 1 : 0.7 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.7rem 0.85rem', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span style={{ fontSize: '1.15rem' }}>{module.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {module.label}
            {module.path && <code style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '0.05rem 0.35rem', borderRadius: 4 }}>{module.path}</code>}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span>min: <span style={{ color: minMeta.color }}>{minMeta.label}</span></span>
            {llm.chat && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><MessageSquare size={11} /> chat</span>}
            {llm.twinChat && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Users2 size={11} /> twin</span>}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Bot size={11} /> {modelLabel(llm.model)}</span>
          </div>
        </div>

        {locked ? (
          <span title={`Requires ${minMeta.label} or higher`} style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
            <Lock size={14} /> locked
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPatch({ enabled: !module.enabled })
            }}
            title={module.enabled ? 'Disable module' : 'Enable module'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.3rem 0.65rem',
              borderRadius: 999,
              border: '1px solid',
              borderColor: module.enabled ? '#34d39955' : 'var(--border)',
              background: module.enabled ? 'rgba(52,211,153,0.14)' : 'var(--bg-hover)',
              color: module.enabled ? '#34d399' : 'var(--text-secondary)',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Power size={12} /> {module.enabled ? 'On' : 'Off'}
          </button>
        )}
      </div>

      {open && (
        <div
          className="animate-fade-in"
          style={{ borderTop: '1px solid var(--border)', padding: '0.95rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.95rem' }}
        >
          {/* Admin settings */}
          <div>
            <PanelTitle icon={<Settings2 size={13} />} text="Admin Studio settings" />
            <Field label="Visibility">
              <select
                disabled={locked}
                value={settings.visibility}
                onChange={(e) => onPatch({ settings: { ...settings, visibility: e.target.value } })}
                style={selectStyle}
              >
                {VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Minimum status">
              <select
                disabled={locked}
                value={module.minRank}
                onChange={(e) => onPatch({ minRank: Number(e.target.value) })}
                style={selectStyle}
              >
                {ROLES.map((r) => (
                  <option key={r.key} value={r.rank}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <ToggleRow
              label="Maintenance mode"
              on={settings.maintenance}
              disabled={locked}
              onToggle={() => onPatch({ settings: { ...settings, maintenance: !settings.maintenance } })}
            />
            <Field label="Admin notes">
              <textarea
                disabled={locked}
                value={settings.notes}
                onChange={(e) => onPatch({ settings: { ...settings, notes: e.target.value } })}
                placeholder="Operational notes for this surface…"
                rows={2}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>
          </div>

          {/* LLM / chat feature set */}
          <div>
            <PanelTitle icon={<MessageSquare size={13} />} text="Chat · Twin Chat · LLM" />
            <ToggleRow label="Chat" on={llm.chat} disabled={locked} onToggle={() => onPatch({ llm: { ...llm, chat: !llm.chat } })} />
            <ToggleRow label="Twin Chat" on={llm.twinChat} disabled={locked} onToggle={() => onPatch({ llm: { ...llm, twinChat: !llm.twinChat } })} />
            <Field label="Model">
              <select disabled={locked} value={llm.model} onChange={(e) => onPatch({ llm: { ...llm, model: e.target.value } })} style={selectStyle}>
                {STUDIO_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {m.provider}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Temperature · ${llm.temperature.toFixed(2)}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={locked}
                value={llm.temperature}
                onChange={(e) => onPatch({ llm: { ...llm, temperature: Number(e.target.value) } })}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </Field>
            <Field label="System note">
              <textarea
                disabled={locked}
                value={llm.systemNote}
                onChange={(e) => onPatch({ llm: { ...llm, systemNote: e.target.value } })}
                placeholder="Steer this surface's character behaviour…"
                rows={2}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- Studio Assistant */

type ChatMsg = { role: 'user' | 'assistant'; content: string }

function Assistant({ modules }: { modules: Module[] }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('claude-haiku-4-5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setError('')
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/studio/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages, model, temperature: 0.4 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'The Studio Assistant could not reply right now.')
      } else {
        setMessages([...next, { role: 'assistant', content: data.reply || '' }])
      }
    } catch {
      setError('Something went wrong reaching the assistant.')
    } finally {
      setBusy(false)
    }
  }

  const suggestions = [
    'Who can administer the Neural Training module?',
    'Which modules have twin chat enabled?',
    'Summarize the status hierarchy.',
  ]

  return (
    <Section icon={<Sparkles size={16} />} title="Studio Assistant" subtitle="An admin co-pilot grounded in your live hierarchy and modules">
      <div style={{ ...card, overflow: 'hidden' }}>
        <div
          ref={scrollRef}
          style={{ maxHeight: 340, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', minHeight: 140 }}
        >
          {messages.length === 0 && !busy ? (
            <div style={{ textAlign: 'center', padding: '1rem 0.5rem', color: 'var(--text-secondary)' }}>
              <Bot size={26} color="var(--accent-light)" style={{ marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.88rem', marginBottom: '0.85rem' }}>Ask about who can govern what, or how a module is configured.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => setInput(s)} style={chipBtn}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Bubble key={i} msg={m} />)
          )}
          {busy && (
            <div style={{ display: 'flex', gap: '0.3rem', padding: '0.3rem 0.2rem' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-light)', display: 'inline-block' }} />
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '0.5rem 1rem', color: '#f87171', fontSize: '0.8rem', borderTop: '1px solid var(--border)' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.7rem', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...selectStyle, flexShrink: 0 }} title="Assistant model">
            {STUDIO_MODELS.filter((m) => m.provider === 'Anthropic').map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask the Studio Assistant…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={send} disabled={!input.trim() || busy} style={primaryBtn(!!input.trim() && !busy)}>
            <Send size={15} />
          </button>
        </div>
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
        Governing {modules.length} modules. The assistant answers from the same roster and registry shown above.
      </p>
    </Section>
  )
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '82%',
          padding: '0.6rem 0.85rem',
          borderRadius: 14,
          fontSize: '0.88rem',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          background: isUser ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
          color: isUser ? 'white' : 'var(--text-primary)',
          borderBottomRightRadius: isUser ? 4 : 14,
          borderBottomLeftRadius: isUser ? 14 : 4,
        }}
      >
        {msg.content}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- shared bits */

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem', marginBottom: '0.85rem' }}>
        <span style={{ color: 'var(--accent-light)', alignSelf: 'center', display: 'flex' }}>{icon}</span>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{title}</h2>
        {subtitle && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function PanelTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem', color: 'var(--accent-light)' }}>
      {icon}
      <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{text}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: '0.65rem' }}>
      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{label}</span>
      {children}
    </label>
  )
}

function ToggleRow({ label, on, disabled, onToggle }: { label: string; on: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{label}</span>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={on}
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          border: 'none',
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: on ? 'var(--accent)' : 'var(--bg-hover)',
          transition: 'background 0.15s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  )
}

function modelLabel(id: string) {
  return STUDIO_MODELS.find((m) => m.id === id)?.label || id
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  padding: '0.5rem 0.7rem',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  padding: '0.45rem 0.6rem',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  outline: 'none',
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.4rem',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'flex',
}

const chipBtn: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '0.35rem 0.75rem',
  color: 'var(--text-secondary)',
  fontSize: '0.76rem',
  cursor: 'pointer',
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.5rem 0.85rem',
    borderRadius: 9,
    border: 'none',
    background: enabled ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
    color: enabled ? 'white' : 'var(--text-secondary)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    flexShrink: 0,
  }
}

export const Route = createFileRoute('/studio')({
  component: StudioPage,
})
