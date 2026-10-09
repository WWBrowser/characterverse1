import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Building2,
  Lock,
  Coins,
  TrendingUp,
  ShieldCheck,
  Users,
  ArrowRight,
  Briefcase,
  UserCog,
  Eye,
  FolderOpen,
  Archive,
  Trophy,
} from 'lucide-react'
import { EnterpriseGate } from '../components/EnterpriseGate'
import { getRole, setRole, type Role } from '../lib/enterprise'
import { accessDef, ENTERPRISE_MSG_RATE, DEFAULT_WORKSPACE, type FileChatAccess } from '../lib/audit'
import { formatGbp, formatCc } from '../lib/credits'

/* ------------------------------------------------------------------ role switch */

function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const opts: { key: Role; label: string; icon: typeof UserCog; sub: string }[] = [
    { key: 'staff', label: 'Staff', icon: Users, sub: 'Use characters, file clean work' },
    { key: 'boss', label: 'Boss / Auditor', icon: UserCog, sub: 'Full visibility & governance' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
      {opts.map((o) => {
        const active = role === o.key
        const Icon = o.icon
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              textAlign: 'left',
              padding: '0.85rem 1rem',
              borderRadius: 12,
              cursor: 'pointer',
              background: active ? 'rgba(124,92,191,0.16)' : 'var(--bg-card)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              color: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <Icon size={16} color={active ? 'var(--accent-light)' : 'var(--text-secondary)'} />
              <span style={{ fontWeight: 700, fontSize: '0.92rem', color: active ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                {o.label}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{o.sub}</div>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ CC calculator */

function CreditCalculator() {
  const [seats, setSeats] = useState(100)
  const [perDay, setPerDay] = useState(20)
  // Staff use private characters → boss earns the Conference Cluster rate.
  const monthlyMsgs = seats * perDay * 22 // ~22 working days
  const monthlyCc = monthlyMsgs * ENTERPRISE_MSG_RATE
  const yearlyCc = monthlyCc * 12

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.1rem' }}>
        <Coins size={18} color="var(--accent-light)" />
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>The system pays for itself</h3>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
        Staff use private characters daily in ChatCabinet. Every message earns the boss{' '}
        <strong style={{ color: 'var(--text-primary)' }}>+{ENTERPRISE_MSG_RATE} CC</strong> (Conference Cluster rate),
        and 1&nbsp;CC&nbsp;=&nbsp;£0.01 — real money back against next year's subscription.
      </p>

      <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.25rem' }}>
        <Slider label="Employees" value={seats} min={1} max={500} step={1} suffix=" seats" onChange={setSeats} />
        <Slider label="Messages / employee / day" value={perDay} min={1} max={100} step={1} suffix=" msgs" onChange={setPerDay} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <Stat label="Messages / month" value={formatCc(monthlyMsgs)} />
        <Stat label="CC / month" value={`${formatCc(monthlyCc)} CC`} accent />
        <Stat label="£ back / month" value={formatGbp(monthlyCc)} />
        <Stat label="£ back / year" value={formatGbp(yearlyCc)} accent />
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--accent-light)', fontWeight: 700 }}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#7c5cbf' }}
      />
    </label>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        padding: '0.8rem',
        borderRadius: 10,
        background: accent ? 'rgba(124,92,191,0.12)' : 'var(--bg-secondary)',
        border: `1px solid ${accent ? 'rgba(124,92,191,0.3)' : 'var(--border)'}`,
      }}
    >
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: accent ? 'var(--accent-light)' : 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

function EnterprisePage() {
  const [role, setRoleState] = useState<Role>('staff')
  const [access, setAccess] = useState<FileChatAccess>('open')

  useEffect(() => {
    setRoleState(getRole())
    const sync = () => setRoleState(getRole())
    window.addEventListener('cv-enterprise-change', sync)
    fetch(`/api/audit?workspaceId=${DEFAULT_WORKSPACE}`)
      .then((r) => r.json())
      .then((d) => d?.settings?.fileChatAccess && setAccess(d.settings.fileChatAccess))
      .catch(() => {})
    return () => window.removeEventListener('cv-enterprise-change', sync)
  }, [])

  const changeRole = (r: Role) => {
    setRole(r)
    setRoleState(r)
  }

  const ad = accessDef(access)
  const isBoss = role === 'boss'

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Hero */}
      <div style={{ padding: '3rem 1.25rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,92,191,0.14), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto' }}>
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
              fontWeight: 600,
              marginBottom: '1rem',
            }}
          >
            <Building2 size={13} /> Enterprise tier
          </div>
          <h1 style={{ fontSize: 'clamp(1.9rem, 4vw, 3rem)', fontWeight: 800, lineHeight: 1.12, marginBottom: '0.85rem' }}>
            Private characters. <span className="gradient-text">Real money back.</span>
          </h1>
          <p style={{ fontSize: 'clamp(0.95rem, 2vw, 1.12rem)', color: 'var(--text-secondary)', maxWidth: 680, lineHeight: 1.6 }}>
            Buy a workspace for your team, build proprietary characters tuned to your work, and keep them
            locked down. Staff use them daily in ChatCabinet — and every message earns the boss CC that
            converts to £ against next year's subscription. The more you use it, the cheaper it gets.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.25rem 4rem', display: 'grid', gap: '1.5rem' }}>
        {/* Value props */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.9rem' }}>
          {[
            { icon: Lock, title: 'Proprietary & private', body: 'Build characters tuned to your codebase or playbook and keep them off the public leaderboard — a competitive advantage.' },
            { icon: TrendingUp, title: 'CC offsets the bill', body: `100 staff using private characters daily is thousands of CC monthly at the +${ENTERPRISE_MSG_RATE} CC Conference rate — real money back, year over year.` },
            { icon: ShieldCheck, title: 'Accountability built in', body: 'A lean desk plus a full audit trail: see how characters are reshaping the business without adding noise.' },
            { icon: Eye, title: 'Governance, not surveillance', body: 'The boss sees everything but escalates only what matters — a stuck workflow, not every interaction.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} style={{ padding: '1.1rem', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <Icon size={20} color="var(--accent-light)" style={{ marginBottom: '0.6rem' }} />
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{title}</div>
              <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{body}</div>
            </div>
          ))}
        </div>

        {/* Calculator */}
        <CreditCalculator />

        {/* Role + access row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <Briefcase size={18} color="var(--accent-light)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Your role in this workspace</h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
              Switch hats to preview each experience. The boss/auditor role unlocks the Audit Dashboard,
              AuditClaw and FileChat access control.
            </p>
            <RoleSwitch role={role} onChange={changeRole} />
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <Archive size={18} color="var(--accent-light)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>FileChat access</h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
              The boss's lever over the team's filed knowledge — set it in the Audit Dashboard.
            </p>
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 12,
                background: 'rgba(124,92,191,0.1)',
                border: '1px solid rgba(124,92,191,0.3)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--accent-light)', marginBottom: '0.2rem' }}>
                {ad.label} · {ad.short}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ad.description}</div>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
          <NavCard to="/audit" icon={ShieldCheck} title="Audit Dashboard" body="Trims, escalations & AuditClaw" highlight={isBoss} locked={!isBoss} />
          <NavCard to="/cabinet" icon={FolderOpen} title="ChatCabinet" body="The active workspace" />
          <NavCard to="/filechat" icon={Archive} title="FileChat" body="The institutional archive" />
          <NavCard to="/leaderboard" icon={Trophy} title="Leaderboard" body="CC flow & character merit" />
        </div>
      </div>
    </div>
  )
}

function NavCard({
  to,
  icon: Icon,
  title,
  body,
  highlight,
  locked,
}: {
  to: string
  icon: typeof ShieldCheck
  title: string
  body: string
  highlight?: boolean
  locked?: boolean
}) {
  return (
    <Link
      to={to}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        padding: '1.1rem',
        borderRadius: 14,
        background: highlight ? 'rgba(124,92,191,0.14)' : 'var(--bg-card)',
        border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Icon size={18} color="var(--accent-light)" />
        {locked ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
            <Lock size={11} /> boss only
          </span>
        ) : (
          <ArrowRight size={15} color="var(--text-secondary)" />
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{body}</div>
    </Link>
  )
}

export const Route = createFileRoute('/enterprise')({
  component: () => (
    <EnterpriseGate surface="The Enterprise tier">
      <EnterprisePage />
    </EnterpriseGate>
  ),
})
