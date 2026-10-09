import type { ReactNode } from 'react'
import { TAB_BY_ID, type TabService } from './tabverse'

// Shared dark-theme primitives for the CVT surface. Kept visually part of the
// CharacterVerse app (not the retro CVS look) — this is infrastructure, not social.

export const CVT_ACCENT = '#38bdf8' // a cool "powerplant" cyan, distinct from CV's violet

export function Card({
  title,
  subtitle,
  right,
  accent,
  children,
  style,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  accent?: string
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '1.25rem',
        borderTop: accent ? `2px solid ${accent}` : undefined,
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: subtitle ? '0.25rem' : '0.9rem' }}>
          {title && <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>}
          {right}
        </div>
      )}
      {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 0.9rem' }}>{subtitle}</p>}
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, accent = CVT_ACCENT }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.9rem 1rem' }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export function Bar({ value, max, color = CVT_ACCENT }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
    </div>
  )
}

export function ModeBadge({ mode }: { mode: 'freedom' | 'deterministic' }) {
  const freedom = mode === 'freedom'
  return (
    <span
      style={{
        fontSize: '0.68rem',
        fontWeight: 700,
        padding: '0.15rem 0.55rem',
        borderRadius: 999,
        color: freedom ? '#c4b5fd' : '#7dd3fc',
        background: freedom ? 'rgba(124,92,191,0.16)' : 'rgba(56,189,248,0.14)',
        border: `1px solid ${freedom ? 'rgba(124,92,191,0.4)' : 'rgba(56,189,248,0.4)'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {freedom ? 'Character Freedom' : 'Deterministic API'}
    </span>
  )
}

export function TabPill({ id }: { id: string }) {
  const t: TabService | undefined = TAB_BY_ID[id]
  if (!t) return null
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        fontSize: '0.76rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 999,
        background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)',
      }}
    >
      <span>{t.emoji}</span>{t.name}
    </span>
  )
}

// A short philosophical note, rendered in the platform's own voice.
export function Analogy({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.55, borderLeft: `2px solid ${CVT_ACCENT}`, paddingLeft: '0.75rem', margin: '0.5rem 0 0' }}>
      {children}
    </p>
  )
}
