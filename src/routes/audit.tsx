import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ShieldCheck,
  Lock,
  Search,
  Sparkles,
  AlertTriangle,
  Gem,
  Scissors,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  UserCog,
  RefreshCw,
  TrendingDown,
} from 'lucide-react'
import { EnterpriseGate } from '../components/EnterpriseGate'
import { getRole, setRole } from '../lib/enterprise'
import { AUDITCLAW_PRESETS, accessDef, FILE_CHAT_ACCESS, DEFAULT_WORKSPACE, type FileChatAccess, type AuditTrim } from '../lib/audit'

/* ------------------------------------------------------------------ types */

type EnrichedTrim = AuditTrim & {
  character: { id: number; name: string; avatar: string } | null
}

type Escalation = {
  conversationId: number
  characterId: number
  characterName: string
  characterAvatar: string
  sessionId: string
  title: string
  stuckMinutes: number
}

type CharBreakdown = { id: number; name: string; avatar: string; trims: number; trimmedMsgs: number; gems: number }

type AuditPayload = {
  settings: { workspaceId: string; orgName: string; seats: number; fileChatAccess: FileChatAccess; stuckThresholdMins: number }
  trims: EnrichedTrim[]
  characterBreakdown: CharBreakdown[]
  escalations: Escalation[]
  totals: { trims: number; trimmedMessages: number; hiddenGems: number; escalations: number }
}

type ClawResult = {
  trimId: number
  characterName: string
  characterAvatar: string
  excerpt: string
  why: string
  score: number
}

/* ------------------------------------------------------------------ role gate */

function BossGate({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<'boss' | 'staff' | null>(null)
  useEffect(() => {
    setRoleState(getRole())
    const sync = () => setRoleState(getRole())
    window.addEventListener('cv-enterprise-change', sync)
    return () => window.removeEventListener('cv-enterprise-change', sync)
  }, [])

  if (role === null) return null
  if (role === 'boss') return <>{children}</>

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '4rem 1.25rem', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(124,92,191,0.25), rgba(79,70,229,0.25))',
          border: '1px solid rgba(124,92,191,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
        }}
      >
        <Lock size={28} color="var(--accent-light)" />
      </div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.6rem' }}>
        The <span className="gradient-text">Audit Dashboard</span> is boss-only
      </h1>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        The audit trail of trimmed conversations, escalations and AuditClaw is visible to the boss and
        auditors only. Staff get a clean desk and their own FileChat search.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => { setRole('boss'); setRoleState('boss') }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.4rem',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            color: 'white',
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          <UserCog size={16} /> Act as boss / auditor
        </button>
        <Link
          to="/enterprise"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.75rem 1.4rem',
            borderRadius: 10,
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          Enterprise overview
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ helpers */

function gemFlag(trimId: number, hiddenGem: boolean, gemNote = '') {
  return fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'flagGem', trimId, hiddenGem, gemNote }),
  })
}

/* ------------------------------------------------------------------ AuditClaw */

function AuditClaw({ onGemFlagged }: { onGemFlagged: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ClawResult[] | null>(null)
  const [error, setError] = useState('')
  const [scanned, setScanned] = useState(0)
  const [flagged, setFlagged] = useState<Set<number>>(new Set())

  const run = async (p: string) => {
    const q = p.trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const res = await fetch('/api/auditclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'AuditClaw could not search right now.')
      } else {
        setResults(data.results || [])
        setScanned(data.scanned || 0)
      }
    } catch {
      setError('Something went wrong reaching AuditClaw.')
    } finally {
      setLoading(false)
    }
  }

  const flag = async (trimId: number) => {
    await gemFlag(trimId, true).catch(() => {})
    setFlagged((s) => new Set(s).add(trimId))
    onGemFlagged()
  }

  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1px solid rgba(124,92,191,0.35)',
        borderRadius: 16,
        padding: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <div
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Sparkles size={16} color="white" />
        </div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AuditClaw</h2>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          prompt-driven search over the trimmed trail
        </span>
      </div>
      <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
        Hunt for the "lightning in a bottle" — a buried insight inside a hallucination an employee trimmed
        away. AuditClaw surfaces high-signal matches so review time goes only to candidates.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'flex-end',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '0.5rem 0.5rem 0.5rem 0.9rem',
          marginBottom: '0.75rem',
        }}
      >
        <Search size={16} color="var(--text-secondary)" style={{ marginBottom: '0.55rem' }} />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(prompt) }
          }}
          placeholder="e.g. Find moments where the character suggested a novel architecture…"
          rows={1}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'none',
            fontFamily: 'inherit', lineHeight: 1.6, padding: '0.4rem 0', maxHeight: 100,
          }}
        />
        <button
          onClick={() => run(prompt)}
          disabled={!prompt.trim() || loading}
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: prompt.trim() && !loading ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
            border: 'none', color: prompt.trim() && !loading ? 'white' : 'var(--text-secondary)',
            cursor: prompt.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {loading ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        </button>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
        {AUDITCLAW_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => { setPrompt(p.prompt); run(p.prompt) }}
            disabled={loading}
            style={{
              fontSize: '0.74rem', fontWeight: 600, padding: '0.35rem 0.7rem', borderRadius: 999,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '0.7rem 1rem', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {results && !error && (
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
            {results.length === 0
              ? `No hidden gems matched · scanned ${scanned} trimmed ${scanned === 1 ? 'conversation' : 'conversations'}`
              : `${results.length} ${results.length === 1 ? 'candidate' : 'candidates'} · scanned ${scanned} trimmed ${scanned === 1 ? 'conversation' : 'conversations'}`}
          </div>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '0.9rem 1rem',
                  borderRadius: 12,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '1rem' }}>{r.characterAvatar}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.characterName}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--accent-light)', fontWeight: 700 }}>
                    {'★'.repeat(r.score)}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, fontStyle: 'italic', marginBottom: '0.4rem', borderLeft: '2px solid var(--accent)', paddingLeft: '0.7rem' }}>
                  “{r.excerpt}”
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.6rem' }}>{r.why}</p>
                <button
                  onClick={() => flag(r.trimId)}
                  disabled={flagged.has(r.trimId)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    fontSize: '0.76rem', fontWeight: 700, padding: '0.35rem 0.8rem', borderRadius: 999,
                    background: flagged.has(r.trimId) ? 'rgba(52,211,153,0.15)' : 'rgba(124,92,191,0.15)',
                    border: `1px solid ${flagged.has(r.trimId) ? 'rgba(52,211,153,0.4)' : 'rgba(124,92,191,0.4)'}`,
                    color: flagged.has(r.trimId) ? '#6ee7b7' : 'var(--accent-light)',
                    cursor: flagged.has(r.trimId) ? 'default' : 'pointer',
                  }}
                >
                  <Gem size={13} /> {flagged.has(r.trimId) ? 'Flagged as hidden gem' : 'Flag as hidden gem'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ access control */

function AccessControl({
  current,
  threshold,
  onChange,
}: {
  current: FileChatAccess
  threshold: number
  onChange: (a: FileChatAccess) => void
}) {
  const [saving, setSaving] = useState<FileChatAccess | null>(null)

  const set = async (a: FileChatAccess) => {
    if (a === current) return
    setSaving(a)
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setAccess', workspaceId: DEFAULT_WORKSPACE, fileChatAccess: a }),
      })
      if (res.ok) onChange(a)
    } finally {
      setSaving(null)
    }
  }

  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
        <ShieldCheck size={18} color="var(--accent-light)" />
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>FileChat access</h2>
      </div>
      <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
        Your management lever. Lock FileChat down if the team is leaning on characters as a crutch; open
        it when they're building institutional knowledge well.
      </p>
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {FILE_CHAT_ACCESS.map((a) => {
          const active = a.key === current
          return (
            <button
              key={a.key}
              onClick={() => set(a.key)}
              style={{
                textAlign: 'left', padding: '0.9rem 1rem', borderRadius: 12, cursor: 'pointer',
                background: active ? 'rgba(124,92,191,0.14)' : 'var(--bg-secondary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                color: 'inherit', transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: active ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                  {a.label}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>· {a.short}</span>
                {saving === a.key && <Loader2 size={13} className="spin" style={{ marginLeft: 'auto' }} />}
                {active && saving === null && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--accent-light)', fontWeight: 700 }}>ACTIVE</span>
                )}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{a.description}</div>
            </button>
          )
        })}
      </div>
      <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.9rem' }}>
        Employees idle on one conversation longer than <strong style={{ color: 'var(--text-primary)' }}>{threshold} minutes</strong> are flagged for escalation below.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ escalations */

function Escalations({ items }: { items: Escalation[] }) {
  const [sent, setSent] = useState<Set<number>>(new Set())
  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
        <AlertTriangle size={18} color="#fbbf24" />
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Escalations</h2>
        <span style={{ marginLeft: 'auto', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          the boss sees everything · only anomalies escalate
        </span>
      </div>
      <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
        Normal usage is archived, not escalated. These employees sat on one conversation past the
        threshold instead of refreshing the instance — send the division manager a heads-up.
      </p>
      {items.length === 0 ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
          ✅ No stuck workflows. The team is moving cleanly.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {items.map((e) => (
            <div
              key={e.conversationId}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.85rem 1rem', borderRadius: 12,
                background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{e.characterAvatar}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>
                  {e.title || `Thread with ${e.characterName}`}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  {e.characterName} · employee <code style={{ fontSize: '0.72rem' }}>{e.sessionId.slice(0, 10) || 'anon'}</code> stuck{' '}
                  <strong style={{ color: '#fbbf24' }}>{e.stuckMinutes} min</strong>
                </div>
              </div>
              <button
                onClick={() => setSent((s) => new Set(s).add(e.conversationId))}
                disabled={sent.has(e.conversationId)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
                  fontSize: '0.76rem', fontWeight: 700, padding: '0.4rem 0.8rem', borderRadius: 8,
                  background: sent.has(e.conversationId) ? 'rgba(52,211,153,0.15)' : 'var(--bg-card)',
                  border: `1px solid ${sent.has(e.conversationId) ? 'rgba(52,211,153,0.4)' : 'var(--border)'}`,
                  color: sent.has(e.conversationId) ? '#6ee7b7' : 'var(--text-primary)',
                  cursor: sent.has(e.conversationId) ? 'default' : 'pointer',
                }}
              >
                {sent.has(e.conversationId) ? 'Sent to manager' : 'Send to division manager'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ trimmed trail */

function TrimCard({ trim, onChanged }: { trim: EnrichedTrim; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const msgs = Array.isArray(trim.trimmedMessages) ? trim.trimmedMessages : []

  const toggleGem = async () => {
    setBusy(true)
    await gemFlag(trim.id, !trim.hiddenGem).catch(() => {})
    setBusy(false)
    onChanged()
  }

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${trim.hiddenGem ? 'rgba(52,211,153,0.4)' : 'var(--border)'}`, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.85rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span style={{ fontSize: '1.05rem' }}>{trim.character?.avatar || '🤖'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{trim.character?.name || 'Unknown character'}</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            {msgs.length} trimmed {msgs.length === 1 ? 'message' : 'messages'} · kept {trim.keptCount} · employee{' '}
            <code style={{ fontSize: '0.7rem' }}>{(trim.sessionId || 'anon').slice(0, 10)}</code>
          </div>
        </div>
        {trim.hiddenGem && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: '#6ee7b7' }}>
            <Gem size={12} /> gem
          </span>
        )}
      </button>
      {open && (
        <div style={{ padding: '0 1rem 1rem', display: 'grid', gap: '0.5rem' }}>
          {trim.reason && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Reason: {trim.reason}
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              style={{
                padding: '0.6rem 0.8rem', borderRadius: 9, fontSize: '0.82rem', lineHeight: 1.5,
                background: m.role === 'assistant' ? 'rgba(124,92,191,0.08)' : 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                {m.role === 'assistant' ? trim.character?.name || 'Character' : 'Employee'}
              </span>
              <div style={{ marginTop: '0.2rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
          ))}
          <button
            onClick={toggleGem}
            disabled={busy}
            style={{
              justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.76rem', fontWeight: 700, padding: '0.35rem 0.8rem', borderRadius: 999,
              background: trim.hiddenGem ? 'rgba(52,211,153,0.15)' : 'rgba(124,92,191,0.15)',
              border: `1px solid ${trim.hiddenGem ? 'rgba(52,211,153,0.4)' : 'rgba(124,92,191,0.4)'}`,
              color: trim.hiddenGem ? '#6ee7b7' : 'var(--accent-light)', cursor: busy ? 'wait' : 'pointer',
            }}
          >
            <Gem size={13} /> {trim.hiddenGem ? 'Unflag hidden gem' : 'Flag as hidden gem'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ page */

function AuditDashboard() {
  const [data, setData] = useState<AuditPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch(`/api/audit?workspaceId=${DEFAULT_WORKSPACE}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)' }}>
        <Loader2 size={24} className="spin" />
        <span style={{ fontSize: '0.9rem' }}>Loading audit trail…</span>
      </div>
    )
  }
  if (!data) return null

  const { settings, totals, escalations, trims, characterBreakdown } = data
  const ad = accessDef(settings.fileChatAccess)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.25rem 4rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.8rem', borderRadius: 999, background: 'rgba(124,92,191,0.15)', border: '1px solid rgba(124,92,191,0.3)', color: 'var(--accent-light)', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.7rem' }}>
            <ShieldCheck size={13} /> Boss & auditors · {settings.orgName}
          </div>
          <h1 style={{ fontSize: 'clamp(1.7rem, 3.5vw, 2.4rem)', fontWeight: 800, lineHeight: 1.1 }}>
            Audit <span className="gradient-text">Dashboard</span>
          </h1>
        </div>
        <button
          onClick={load}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: 9, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <TotalCard icon={Scissors} label="Trimmed threads" value={totals.trims} />
        <TotalCard icon={TrendingDown} label="Negatives captured" value={totals.trimmedMessages} />
        <TotalCard icon={Gem} label="Hidden gems" value={totals.hiddenGems} accent />
        <TotalCard icon={AlertTriangle} label="Escalations" value={totals.escalations} warn={totals.escalations > 0} />
        <TotalCard icon={ShieldCheck} label="FileChat" value={ad.label} text />
      </div>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <AuditClaw onGemFlagged={load} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <AccessControl current={settings.fileChatAccess} threshold={settings.stuckThresholdMins} onChange={load} />
          <Escalations items={escalations} />
        </div>

        {/* Trimmed trail */}
        <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <Scissors size={18} color="var(--accent-light)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Trimmed audit trail</h2>
          </div>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
            The negatives staff trimmed before filing clean work — visible only here. Expand any thread to
            read what was removed, and flag a buried insight as a hidden gem for character design.
          </p>
          {trims.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              Nothing trimmed yet. In FileChat, open a filed thread and use “Revert &amp; trim” to send
              hallucinations here.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {trims.map((t) => (
                <TrimCard key={t.id} trim={t} onChanged={load} />
              ))}
            </div>
          )}
        </section>

        {/* Character breakdown */}
        {characterBreakdown.length > 0 && (
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <TrendingDown size={18} color="var(--accent-light)" />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Where characters break down</h2>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Which characters get trimmed most — a signal for creators that their CC may stall until the
              issue is fixed.
            </p>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {characterBreakdown.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.85rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.05rem' }}>{c.avatar}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.86rem', flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{c.trims} trims · {c.trimmedMsgs} msgs</span>
                  {c.gems > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 700, color: '#6ee7b7' }}>
                      <Gem size={11} /> {c.gems}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function TotalCard({
  icon: Icon,
  label,
  value,
  accent,
  warn,
  text,
}: {
  icon: typeof Gem
  label: string
  value: number | string
  accent?: boolean
  warn?: boolean
  text?: boolean
}) {
  const color = warn ? '#fbbf24' : accent ? 'var(--accent-light)' : 'var(--text-primary)'
  return (
    <div style={{ padding: '0.9rem 1rem', borderRadius: 12, background: 'var(--bg-card)', border: `1px solid ${warn ? 'rgba(251,191,36,0.35)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
        <Icon size={14} />
        <span style={{ fontSize: '0.72rem' }}>{label}</span>
      </div>
      <div style={{ fontSize: text ? '1.1rem' : '1.5rem', fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

export const Route = createFileRoute('/audit')({
  component: () => (
    <EnterpriseGate surface="The Audit Dashboard">
      <BossGate>
        <AuditDashboard />
      </BossGate>
    </EnterpriseGate>
  ),
})
