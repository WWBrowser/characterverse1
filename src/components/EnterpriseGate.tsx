import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2, Lock, Check, BarChart3, ShieldCheck, Compass } from 'lucide-react'
import { isEnterprise, setEnterprise } from '../lib/enterprise'

// EnterpriseGate wraps the ChatCabinet / FileChat surfaces. Until the workspace
// is switched into enterprise mode, it shows a focused unlock screen explaining
// why these tools are enterprise-only and offers a one-click switch. Once on,
// it simply renders its children.
export function EnterpriseGate({
  surface,
  children,
}: {
  surface: string
  children: React.ReactNode
}) {
  // Avoid an SSR/client flash by resolving the flag after mount.
  const [ready, setReady] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    const sync = () => setUnlocked(isEnterprise())
    sync()
    setReady(true)
    window.addEventListener('cv-enterprise-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('cv-enterprise-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (!ready) return null
  if (unlocked)
    return (
      <>
        <div style={{ position: 'fixed', top: 70, right: 14, zIndex: 60 }}>
          <EnterpriseBadge />
        </div>
        {children}
      </>
    )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '4rem 1.25rem 5rem' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.85rem',
          borderRadius: 999,
          border: '1px solid rgba(124,92,191,0.4)',
          background: 'rgba(124,92,191,0.14)',
          color: 'var(--accent-light)',
          fontSize: '0.75rem',
          fontWeight: 700,
          marginBottom: '1.5rem',
        }}
      >
        <Building2 size={14} /> Enterprise workspace
      </div>

      <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: '1rem' }}>
        {surface} is an <span className="gradient-text">enterprise</span> tool
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.02rem', lineHeight: 1.7, marginBottom: '2rem', maxWidth: 620 }}>
        Enterprise likes a lean desk — the job is messy enough. {surface} stays out
        of the everyday playground so the only conversations that get marked and
        filed are real work. That keeps signal high, and lets the workspace see how
        characters are actually reshaping the business.
      </p>

      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '2rem' }}>
        {[
          { icon: Lock, title: 'Lean by default', body: 'Casual testing stays in the sandbox; enterprise tools never add to the noise.' },
          { icon: BarChart3, title: 'Measurable engagement', body: 'Marked work feeds Character Credits, so you can see which characters deliver value.' },
          { icon: ShieldCheck, title: 'Built for teams', body: 'Organize curated knowledge by character, job and division across the team.' },
        ].map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            style={{
              display: 'flex',
              gap: '0.85rem',
              alignItems: 'flex-start',
              padding: '1rem 1.1rem',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
            }}
          >
            <Icon size={18} color="var(--accent-light)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.15rem' }}>{title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.55 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <button
          onClick={() => setEnterprise(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.8rem 1.5rem',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            color: 'white',
            fontWeight: 700,
            fontSize: '0.92rem',
          }}
        >
          <Check size={16} /> Enter enterprise workspace
        </button>
        <Link
          to="/discover"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.8rem 1.25rem',
            borderRadius: 10,
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          <Compass size={16} /> Back to Discover
        </Link>
      </div>
      <p style={{ color: 'var(--text-muted, var(--text-secondary))', fontSize: '0.78rem', marginTop: '1.25rem' }}>
        This unlocks the enterprise tools on this device. You can switch back anytime.
      </p>
    </div>
  )
}

// A compact "you're in enterprise mode" pill with an exit control, for the top of
// the gated pages.
export function EnterpriseBadge() {
  return (
    <button
      onClick={() => setEnterprise(false)}
      title="Leave enterprise workspace"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.3rem 0.7rem',
        borderRadius: 999,
        border: '1px solid rgba(124,92,191,0.4)',
        background: 'rgba(124,92,191,0.14)',
        color: 'var(--accent-light)',
        fontSize: '0.72rem',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <Building2 size={12} /> Enterprise · exit
    </button>
  )
}
