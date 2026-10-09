import { useState, useEffect, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Network,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Power,
  ChevronUp,
  ChevronDown,
  Send,
  Loader2,
  Lock,
  X,
  Check,
  Zap,
  Radio,
  Save,
  AlertTriangle,
  GitBranch,
} from 'lucide-react'
import {
  CAPABILITIES,
  CLEARANCES,
  capabilityMeta,
  clearanceMeta,
  type Capability,
  type Clearance,
} from '../lib/routeclaw'

export const Route = createFileRoute('/routeclaw')({
  component: RouteClawPage,
})

/* --------------------------------------------------------------------- types */

type Agent = {
  id: number
  workspaceId: string
  name: string
  role: 'warden' | 'agent'
  capability: Capability
  description: string
  routeCondition: string
  skills: string[]
  icon: string
  color: string
  enabled: boolean
  position: number
  clearance: Clearance
  requiresSignoff: boolean
}

type DispatchStep = {
  capability: Capability
  label: string
  agent: { id: number; name: string; icon: string; color: string; clearance: Clearance }
  skills: string[]
  requiresSignoff: boolean
  task: string
}

type DispatchBlocked = { capability: string; reason: string; label?: string; agent?: string }

type DispatchResult = {
  analysis: string
  classification: Clearance
  warden: { name: string; icon: string; clearance: Clearance }
  steps: DispatchStep[]
  blocked: DispatchBlocked[]
  delivered: boolean
}

/* ----------------------------------------------------------------- small UI */

function ClearanceBadge({ clearance }: { clearance: string }) {
  const m = clearanceMeta(clearance)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: '0.7rem',
        fontWeight: 700,
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        color: m.color,
        background: `${m.color}1a`,
        border: `1px solid ${m.color}55`,
      }}
    >
      <Lock size={10} />
      {m.label}
    </span>
  )
}

function SkillChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: '0.68rem',
        fontWeight: 600,
        padding: '0.12rem 0.45rem',
        borderRadius: 6,
        color: 'var(--text-secondary)',
        background: 'var(--bg-hover)',
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ topology */

function Topology({ agents, onPick }: { agents: Agent[]; onPick: (id: number) => void }) {
  const warden = agents.find((a) => a.role === 'warden')
  const workers = agents.filter((a) => a.role === 'agent')

  const W = 820
  const H = 360
  const wardenX = W / 2
  const wardenY = 64
  const rowY = 268
  const n = Math.max(workers.length, 1)
  const slot = W / (n + 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560, display: 'block' }}>
        {/* edges from Warden to each worker */}
        {workers.map((a, i) => {
          const x = slot * (i + 1)
          const dim = !a.enabled || !(warden && warden.enabled)
          return (
            <g key={`edge-${a.id}`} opacity={dim ? 0.25 : 1}>
              <line
                x1={wardenX}
                y1={wardenY + 34}
                x2={x}
                y2={rowY - 34}
                stroke={a.color}
                strokeWidth={2}
                strokeDasharray={dim ? '4 4' : undefined}
              />
              <text
                x={(wardenX + x) / 2}
                y={(wardenY + rowY) / 2 - 4}
                fill="var(--text-secondary)"
                fontSize="10"
                textAnchor="middle"
                style={{ pointerEvents: 'none' }}
              >
                {a.routeCondition || `needs ${capabilityMeta(a.capability).label.toLowerCase()}`}
              </text>
            </g>
          )
        })}

        {/* Warden hub */}
        {warden && (
          <g
            style={{ cursor: 'pointer' }}
            opacity={warden.enabled ? 1 : 0.4}
            onClick={() => onPick(warden.id)}
          >
            <circle cx={wardenX} cy={wardenY} r={34} fill="var(--bg-card)" stroke={warden.color} strokeWidth={2.5} />
            <text x={wardenX} y={wardenY - 2} textAnchor="middle" fontSize="20">
              {warden.icon}
            </text>
            <text x={wardenX} y={wardenY + 16} textAnchor="middle" fontSize="10" fill="var(--text-primary)" fontWeight="700">
              {warden.name}
            </text>
          </g>
        )}

        {/* worker nodes */}
        {workers.map((a, i) => {
          const x = slot * (i + 1)
          return (
            <g key={a.id} style={{ cursor: 'pointer' }} opacity={a.enabled ? 1 : 0.35} onClick={() => onPick(a.id)}>
              <circle cx={x} cy={rowY} r={30} fill="var(--bg-card)" stroke={a.color} strokeWidth={2.5} />
              <text x={x} y={rowY - 2} textAnchor="middle" fontSize="18">
                {a.icon}
              </text>
              <text x={x} y={rowY + 15} textAnchor="middle" fontSize="9.5" fill="var(--text-primary)" fontWeight="700">
                {a.name}
              </text>
              <text x={x} y={rowY + 48} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">
                {capabilityMeta(a.capability).label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* -------------------------------------------------------------------- editor */

const EMPTY_DRAFT = {
  name: '',
  role: 'agent' as 'warden' | 'agent',
  capability: 'research' as Capability,
  clearance: 'internal' as Clearance,
  icon: '🐾',
  color: '#3b82f6',
  routeCondition: '',
  description: '',
  skillsText: '',
  requiresSignoff: false,
}

type Draft = typeof EMPTY_DRAFT

function AgentEditor({
  title,
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  title: string
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.65rem',
    borderRadius: 8,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 4,
    display: 'block',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '4vh 1rem',
        overflowY: 'auto',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Icon</label>
              <input style={{ ...inputStyle, textAlign: 'center' }} value={draft.icon} maxLength={4} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={draft.name} placeholder="e.g. Ferret" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Role</label>
              <select
                style={inputStyle}
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as 'warden' | 'agent' })}
              >
                <option value="agent">Agent (worker)</option>
                <option value="warden">Warden (dispatcher)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Capability</label>
              <select
                style={inputStyle}
                value={draft.capability}
                onChange={(e) => {
                  const cap = e.target.value as Capability
                  const m = capabilityMeta(cap)
                  // Offer the capability's default skills/colour when the agent
                  // hasn't been customised yet.
                  setDraft({
                    ...draft,
                    capability: cap,
                    color: draft.color === EMPTY_DRAFT.color || !draft.skillsText ? m.color : draft.color,
                    icon: draft.icon === EMPTY_DRAFT.icon ? m.icon : draft.icon,
                    skillsText: draft.skillsText ? draft.skillsText : m.skills.join(', '),
                    routeCondition: draft.routeCondition || `needs ${m.label.toLowerCase()}`,
                  })
                }}
              >
                {CAPABILITIES.map((c) => (
                  <option key={c.capability} value={c.capability}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Security clearance</label>
              <select
                style={inputStyle}
                value={draft.clearance}
                onChange={(e) => setDraft({ ...draft, clearance: e.target.value as Clearance })}
              >
                {CLEARANCES.map((c) => (
                  <option key={c.clearance} value={c.clearance}>
                    {c.label} — {c.desc}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Colour</label>
              <input type="color" style={{ ...inputStyle, padding: 2, height: 38 }} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Route condition</label>
            <input style={inputStyle} value={draft.routeCondition} placeholder="needs research" onChange={(e) => setDraft({ ...draft, routeCondition: e.target.value })} />
          </div>

          <div>
            <label style={labelStyle}>Skills (comma separated)</label>
            <input style={inputStyle} value={draft.skillsText} placeholder="web-search, retrieve, cite" onChange={(e) => setDraft({ ...draft, skillsText: e.target.value })} />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.requiresSignoff} onChange={(e) => setDraft({ ...draft, requiresSignoff: e.target.checked })} />
            Requires sign-off before delivery (security gate)
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '0.55rem 1rem', borderRadius: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !draft.name.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem 1.1rem',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
              border: 'none',
              color: 'white',
              fontWeight: 700,
              cursor: saving || !draft.name.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !draft.name.trim() ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            Save agent
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- agent card */

function AgentCard({
  agent,
  isFirst,
  isLast,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  busy,
}: {
  agent: Agent
  isFirst: boolean
  isLast: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (dir: 'up' | 'down') => void
  busy: boolean
}) {
  const cap = capabilityMeta(agent.capability)
  return (
    <div
      id={`agent-${agent.id}`}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${agent.enabled ? `${agent.color}44` : 'var(--border)'}`,
        borderLeft: `4px solid ${agent.color}`,
        borderRadius: 12,
        padding: '1rem 1.1rem',
        opacity: agent.enabled ? 1 : 0.55,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
        <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{agent.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>{agent.name}</span>
            {agent.role === 'warden' ? (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: agent.color, background: `${agent.color}1a`, border: `1px solid ${agent.color}55`, padding: '0.12rem 0.5rem', borderRadius: 999 }}>
                DISPATCHER
              </span>
            ) : (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cap.color, background: `${cap.color}1a`, border: `1px solid ${cap.color}55`, padding: '0.12rem 0.5rem', borderRadius: 999 }}>
                {cap.label}
              </span>
            )}
            <ClearanceBadge clearance={agent.clearance} />
            {agent.requiresSignoff && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, color: '#ef4444' }}>
                <ShieldCheck size={11} /> sign-off
              </span>
            )}
          </div>
          {agent.routeCondition && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 3 }}>
              <GitBranch size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              {agent.role === 'warden' ? 'receives ' : 'routed when '}
              <span style={{ color: 'var(--text-primary)' }}>{agent.routeCondition}</span>
            </div>
          )}
          {agent.description && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 6 }}>{agent.description}</p>
          )}
          {agent.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {agent.skills.map((s) => (
                <SkillChip key={s} label={s} color={agent.color} />
              ))}
            </div>
          )}
        </div>

        {/* controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button title="Move up" disabled={isFirst || busy} onClick={() => onMove('up')} style={iconBtn(isFirst || busy)}>
              <ChevronUp size={15} />
            </button>
            <button title="Move down" disabled={isLast || busy} onClick={() => onMove('down')} style={iconBtn(isLast || busy)}>
              <ChevronDown size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button title={agent.enabled ? 'Switch off' : 'Switch on'} disabled={busy} onClick={onToggle} style={iconBtn(busy, agent.enabled ? '#10b981' : undefined)}>
              <Power size={15} />
            </button>
            <button title="Edit / rename" disabled={busy} onClick={onEdit} style={iconBtn(busy)}>
              <Pencil size={15} />
            </button>
            <button
              title={agent.role === 'warden' ? 'The Warden cannot be removed' : 'Take away'}
              disabled={busy || agent.role === 'warden'}
              onClick={onDelete}
              style={iconBtn(busy || agent.role === 'warden', '#ef4444')}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function iconBtn(disabled: boolean, color?: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 28,
    borderRadius: 7,
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    color: color || 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  }
}

/* ----------------------------------------------------------------- dispatch */

function DispatchConsole() {
  const [text, setText] = useState('')
  const [clearance, setClearance] = useState<Clearance>('public')
  const [result, setResult] = useState<DispatchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const dispatch = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/routeclaw/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: text, clearance }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Dispatch failed')
      else setResult(data)
    } catch {
      setError('Could not reach the routing layer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.35rem' }}>
        <Zap size={18} color="var(--accent-light)" />
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Dispatch console</h2>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Send a request to the Warden. It decomposes the request, routes each sub-task to the best enabled agent, and
        <strong style={{ color: 'var(--text-primary)' }}> refuses any agent below the request's clearance</strong>.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Research the latest backend architectures, analyze the trade-offs, and draft a recommendation."
        style={{
          width: '100%',
          minHeight: 80,
          padding: '0.75rem',
          borderRadius: 10,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
          resize: 'vertical',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Classify request:</span>
        {CLEARANCES.map((c) => (
          <button
            key={c.clearance}
            onClick={() => setClearance(c.clearance)}
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.3rem 0.7rem',
              borderRadius: 999,
              cursor: 'pointer',
              color: clearance === c.clearance ? '#fff' : c.color,
              background: clearance === c.clearance ? c.color : `${c.color}1a`,
              border: `1px solid ${c.color}66`,
            }}
          >
            {c.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={dispatch}
          disabled={loading || !text.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0.5rem 1.1rem',
            borderRadius: 9,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            border: 'none',
            color: 'white',
            fontWeight: 700,
            cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !text.trim() ? 0.6 : 1,
          }}
        >
          {loading ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
          Dispatch
        </button>
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '1.25rem' }} className="animate-fade-in">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.85rem 1rem', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '1.3rem' }}>{result.warden.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>
                {result.warden.name} <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>· intake &amp; route</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{result.analysis}</div>
            </div>
          </div>

          {/* routed flow */}
          {result.steps.length > 0 && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {result.steps.map((s, i) => (
                <div key={`${s.capability}-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.85rem', borderRadius: 10, background: 'var(--bg-primary)', border: `1px solid ${s.agent.color}33` }}>
                    <span style={{ fontSize: '1.2rem' }}>{s.agent.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{s.agent.name}</span>
                        <span style={{ fontSize: '0.72rem', color: s.agent.color, fontWeight: 700 }}>{s.label}</span>
                        <ClearanceBadge clearance={s.agent.clearance} />
                        {s.requiresSignoff && <ShieldCheck size={12} color="#ef4444" />}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {s.skills.map((sk) => (
                          <SkillChip key={sk} label={sk} color={s.agent.color} />
                        ))}
                      </div>
                    </div>
                    <Check size={16} color="#10b981" />
                  </div>
                  {i < result.steps.length - 1 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1, padding: '2px 0' }}>↓</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* blocked — the security refusals */}
          {result.blocked.length > 0 && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.blocked.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.85rem', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertTriangle size={15} color="#ef4444" />
                  <span style={{ fontSize: '0.82rem', color: '#fca5a5' }}>
                    <strong>{b.label || b.capability}</strong> blocked — {b.reason}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, color: result.delivered ? '#10b981' : '#f59e0b' }}>
            {result.delivered ? <Check size={16} /> : <AlertTriangle size={16} />}
            {result.delivered ? 'Response signed off and delivered to user.' : 'Held — not delivered (a required step was blocked or unstaffed).'}
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- page */

function RouteClawPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [busyId, setBusyId] = useState<number | 'new' | null>(null)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/routeclaw')
    const data = await res.json()
    setAgents(data.agents || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const draftFromAgent = (a: Agent): Draft => ({
    name: a.name,
    role: a.role,
    capability: a.capability,
    clearance: a.clearance,
    icon: a.icon,
    color: a.color,
    routeCondition: a.routeCondition,
    description: a.description,
    skillsText: (a.skills || []).join(', '),
    requiresSignoff: a.requiresSignoff,
  })

  const openCreate = () => {
    setDraft(EMPTY_DRAFT)
    setCreating(true)
  }
  const openEdit = (a: Agent) => {
    setDraft(draftFromAgent(a))
    setEditing(a)
  }

  const draftToBody = (d: Draft) => ({
    name: d.name,
    role: d.role,
    capability: d.capability,
    clearance: d.clearance,
    icon: d.icon,
    color: d.color,
    routeCondition: d.routeCondition,
    description: d.description,
    requiresSignoff: d.requiresSignoff,
    skills: d.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
  })

  const saveNew = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/routeclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToBody(draft)),
      })
      if (res.ok) {
        setCreating(false)
        await load()
      } else {
        const d = await res.json()
        alert(d.error || 'Could not add agent')
      }
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/routeclaw/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToBody(draft)),
      })
      if (res.ok) {
        setEditing(null)
        await load()
      } else {
        const d = await res.json()
        alert(d.error || 'Could not save changes')
      }
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id: number, body: any) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/routeclaw/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || 'Action failed')
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (a: Agent) => {
    if (!confirm(`Take ${a.name} out of the routing layer?`)) return
    setBusyId(a.id)
    try {
      const res = await fetch(`/api/routeclaw/${a.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Could not remove agent')
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const enabledCount = agents?.filter((a) => a.enabled).length ?? 0
  const restrictedCount = agents?.filter((a) => a.clearance === 'restricted').length ?? 0

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2.5rem 1.25rem 5rem' }}>
      {/* hero */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Network size={21} color="white" />
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800 }}>
            Route<span className="gradient-text">Claw</span>
          </h1>
        </div>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 720 }}>
          The Agentic Edge Routing Layer 🌐⚡ — an intelligent dispatcher (the <strong style={{ color: 'var(--text-primary)' }}>Warden</strong>) that
          decomposes every request and routes it across a directed topology of specialized agents. Rename, edit, add,
          remove and switch agents on the fly, with a per-agent security clearance that keeps routing locked down.
        </p>

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {[
            { icon: <Radio size={13} />, label: 'Intelligent dispatch' },
            { icon: <GitBranch size={13} />, label: 'Directed topology' },
            { icon: <ShieldCheck size={13} />, label: 'Clearance-gated routing' },
            { icon: <Zap size={13} />, label: 'Runs at the edge' },
          ].map((c) => (
            <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '0.3rem 0.7rem', borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              {c.icon}
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {agents === null ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={28} className="spin" />
        </div>
      ) : (
        <>
          {/* topology */}
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Routing topology</h2>
              <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span><strong style={{ color: 'var(--text-primary)' }}>{enabledCount}</strong> active</span>
                <span><strong style={{ color: 'var(--text-primary)' }}>{agents.length}</strong> agents</span>
                <span><strong style={{ color: '#ef4444' }}>{restrictedCount}</strong> restricted</span>
              </div>
            </div>
            <Topology
              agents={agents}
              onPick={(id) => {
                const el = document.getElementById(`agent-${id}`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            />
          </section>

          {/* dispatch */}
          <section style={{ marginBottom: '1.5rem' }}>
            <DispatchConsole />
          </section>

          {/* registry */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Agent registry</h2>
              <button
                onClick={openCreate}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 9, background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}
              >
                <Plus size={16} />
                Add agent
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {agents.map((a, i) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  isFirst={i === 0}
                  isLast={i === agents.length - 1}
                  busy={busyId === a.id}
                  onToggle={() => patch(a.id, { enabled: !a.enabled })}
                  onEdit={() => openEdit(a)}
                  onDelete={() => remove(a)}
                  onMove={(dir) => patch(a.id, { move: dir })}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {creating && (
        <AgentEditor title="Add agent" draft={draft} setDraft={setDraft} onSave={saveNew} onCancel={() => setCreating(false)} saving={saving} />
      )}
      {editing && (
        <AgentEditor title={`Edit ${editing.name}`} draft={draft} setDraft={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} saving={saving} />
      )}
    </div>
  )
}
