import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AvatarFill } from './avatar'
import {
  CANON_NODES,
  CORE_NODE,
  METRICS,
  OPERATOR_NODES,
  SATELLITES,
  RECORD_KIND_LABEL,
  metricMeta,
  relativeTime,
  satelliteMeta,
  type BadgeSlug,
  type DossierSummary,
} from './satellites'

// The Character Codex — the advanced view, shared by /discover and /ask.
//
// Two surfaces, one component set, because the Codex has two documented entry
// points and they must show the same numbers:
//
//   • the "Choose a character to ask" grid — a per-tile Codex action opens the
//     entry without disturbing the tile's existing select-to-ask behaviour
//   • the Discover character cards — an Advanced View switch turns the grid into
//     dossier cards, each with its own ADVANCED VIEW button into the entry
//
// The look is a console rather than a marketing card: monospaced designations,
// hairline rules, uppercase micro-labels, and one saturated colour per satellite
// against near-black. Nothing here invents data — every bar, level and badge
// comes from /api/charactercodex, which derives them from the ledger.

/* ─────────────────────────────────────────────────────────────────── types */

export type CodexCharacter = {
  id: number
  name: string
  avatar: string
  tagline?: string
  description?: string
  category?: string
  totalChats?: number
}

type NodeReadingDTO = {
  satellite: (typeof SATELLITES)[number]
  spawned: boolean
  status: 'core' | 'online' | 'dormant' | 'withheld' | 'merged'
  metrics: Record<string, number>
  contributed: number
  holding: number
  driftPct: number
  voice: string
  overridden: boolean
}

type RecordDTO = {
  id: number
  node: string
  nodeName: string
  kind: keyof typeof RECORD_KIND_LABEL
  targetNode: string | null
  targetName: string | null
  title: string
  knowledge: string
  sourceRef: string | null
  weight: number
  sealed: boolean
  createdAt: string | null
}

export type CodexReadingDTO = {
  character: CodexCharacter & { persona?: string; greeting?: string }
  dossier: {
    level: number
    levelLabel: string
    progress: number
    stats: { key: string; label: string; short: string; color: string; pct: number }[]
    badges: { slug: BadgeSlug; label: string; note: string; color: string; earned: boolean }[]
    blend: Record<string, number>
  }
  sync: {
    shared: number
    reverseActions: number
    mirrors: number
    nodes: NodeReadingDTO[]
    integrity: number
    coordinator: string
    warnings: { kind: string; title: string; detail: string; severity: string }[]
  }
  records: RecordDTO[]
  now: string
}

/* ───────────────────────────────────────────────────────────────── styling */

const MONO = "Menlo, Monaco, Consolas, 'Courier New', monospace"

const microLabel: React.CSSProperties = {
  fontSize: '0.6rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontWeight: 700,
}

const hairline = '1px solid var(--border)'

/* ───────────────────────────────────────────────────────────────── glyphs */

/**
 * Skill badges as line glyphs rather than emoji, so a badge reads as
 * instrumentation at 22px and keeps its meaning next to the metric bars.
 */
function BadgeGlyph({ slug, size = 15 }: { slug: BadgeSlug; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (slug) {
    case 'split': // one line becoming two
      return <svg {...common}><path d="M12 21V13" /><path d="M12 13 5 5" /><path d="M12 13l7-8" /></svg>
    case 'full_house': // six points on a ring
      return (
        <svg {...common}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2
            return <circle key={i} cx={12 + Math.cos(a) * 7.5} cy={12 + Math.sin(a) * 7.5} r={1.7} fill="currentColor" stroke="none" />
          })}
        </svg>
      )
    case 'reverse_flow': // return arrow, edge back to core
      return <svg {...common}><path d="M5 17h9a5 5 0 0 0 0-10H7" /><path d="M10 4 7 7l3 3" /></svg>
    case 'archivist': // stacked shelves
      return <svg {...common}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /><path d="M8 5v4" /><path d="M15 10v4" /></svg>
    case 'prism': // triangle splitting a ray
      return <svg {...common}><path d="M12 4 21 19H3z" /><path d="M2 12h6" /><path d="M16 12h6" /></svg>
    case 'unbroken': // closed ring
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></svg>
    case 'conflicted': // ring with a break, struck through
      return <svg {...common}><path d="M18.4 7.4A8 8 0 1 1 6.2 17.4" /><path d="M5 5l14 14" /></svg>
    case 'coordinator': // hub with spokes
      return <svg {...common}><circle cx="12" cy="12" r="2.6" /><path d="M12 9.4V4" /><path d="M14.3 13.4 19 16" /><path d="M9.7 13.4 5 16" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="7" /></svg>
  }
}

/* ────────────────────────────────────────────────────────────────── hooks */

/**
 * Compact dossiers for a grid, in one request. Skips the fetch entirely while
 * `enabled` is false so the plain Discover grid pays nothing for a feature the
 * visitor has not switched on.
 */
export function useDossiers(ids: number[], enabled: boolean) {
  const [dossiers, setDossiers] = useState<Record<number, DossierSummary>>({})
  const [loading, setLoading] = useState(false)
  const key = ids.join(',')

  useEffect(() => {
    if (!enabled || !key) {
      setDossiers({})
      return
    }
    let live = true
    setLoading(true)
    fetch(`/api/charactercodex?ids=${key}`)
      .then((r) => (r.ok ? r.json() : { dossiers: {} }))
      .then((data) => {
        if (live) setDossiers(data.dossiers || {})
      })
      .catch(() => {
        if (live) setDossiers({})
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [key, enabled])

  return { dossiers, loading }
}

/** The full Codex entry, plus the action dispatcher every control shares. */
export function useCodexReading(id: number | null) {
  const [reading, setReading] = useState<CodexReadingDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (id == null) {
      setReading(null)
      setError('')
      return
    }
    let live = true
    setLoading(true)
    setError('')
    fetch(`/api/charactercodex/${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error || 'Codex unavailable')
        return data
      })
      .then((data) => {
        if (live) setReading(data)
      })
      .catch((e: Error) => {
        if (live) setError(e.message)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [id])

  // Every action returns the re-derived reading, so the panel never has to guess
  // what a spawn or a withhold did to the shared mind — it just renders the truth.
  const act = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (id == null) return
      setBusy(action)
      setError('')
      try {
        const res = await fetch(`/api/charactercodex/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...payload }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Action rejected')
        setReading(data)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy('')
      }
    },
    [id],
  )

  return { reading, loading, busy, error, act, clearError: () => setError('') }
}

/* ───────────────────────────────────────────────────── advanced-view switch */

/**
 * The switch that turns a plain card grid into a dossier grid. Deliberately a
 * two-state segmented control rather than a checkbox — "Standard / Advanced" says
 * what you get, where a lone toggle would not.
 */
export function AdvancedViewToggle({
  advanced,
  onChange,
  hint,
}: {
  advanced: boolean
  onChange: (next: boolean) => void
  hint?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
      <div
        role="group"
        aria-label="Card detail level"
        style={{
          display: 'inline-flex',
          border: hairline,
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--bg-secondary)',
        }}
      >
        {[
          { key: false, label: 'Standard' },
          { key: true, label: 'Advanced' },
        ].map((opt) => (
          <button
            key={String(opt.key)}
            type="button"
            aria-pressed={advanced === opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              padding: '0.4rem 0.85rem',
              border: 'none',
              cursor: 'pointer',
              background: advanced === opt.key ? 'var(--accent)' : 'transparent',
              color: advanced === opt.key ? '#fff' : 'var(--text-secondary)',
              fontFamily: MONO,
              fontSize: '0.68rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{hint}</span>}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────── metric bars */

function StatBars({
  stats,
  dense = false,
}: {
  stats: { key: string; label: string; short: string; color: string; pct: number }[]
  dense?: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: dense ? '0.3rem' : '0.45rem' }}>
      {stats.map((s) => (
        <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '2.2rem 1fr 2.4rem', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontFamily: MONO, fontSize: '0.58rem', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            {dense ? s.short : s.short}
          </span>
          <span
            title={`${s.label} — ${metricMeta(s.key).note}`}
            style={{ height: dense ? 4 : 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'block' }}
          >
            <span
              className="cdx-bar"
              style={{
                display: 'block',
                height: '100%',
                width: `${s.pct}%`,
                background: s.color,
                borderRadius: 3,
                boxShadow: `0 0 8px ${s.color}55`,
              }}
            />
          </span>
          <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: 'var(--text-primary)', textAlign: 'right', opacity: 0.8 }}>
            {s.pct}%
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────── the dossier card */

/**
 * The Agentic Character Dossier as a card: designation, live training level,
 * training stats, earned skill badges and the satellite strip. Self-updating in
 * the only sense that matters — it is re-derived from the ledger on every read,
 * so a level-up or a new reverse action shows up without a backfill anywhere.
 */
export function DossierCard({
  character,
  dossier,
  onOpen,
  footer,
  onCardClick,
  selected,
}: {
  character: CodexCharacter
  dossier?: DossierSummary
  onOpen: (id: number) => void
  /** Extra controls under the card — /ask uses this for its ask/chat actions. */
  footer?: React.ReactNode
  /** When set the card body is clickable, for grids where a card means "pick me". */
  onCardClick?: (character: CodexCharacter) => void
  selected?: boolean
}) {
  const sat = dossier?.nodes ?? []
  const badges = useMemo(() => {
    if (!dossier) return []
    const earned = dossier.badges.filter((b) => b.earned)
    const locked = dossier.badges.filter((b) => !b.earned)
    return [...earned, ...locked].slice(0, 5)
  }, [dossier])

  // The designation on the card front: the coordinating satellite if the
  // character has been split, otherwise the core. #P01-style, per the Codex sheet.
  const lead = dossier && dossier.coordinator !== CORE_NODE ? satelliteMeta(dossier.coordinator) : satelliteMeta(CORE_NODE)
  const designation = `#P${String(lead.psn).padStart(2, '0')}`

  const clickable = !!onCardClick
  return (
    <article
      className="cdx-card"
      style={{
        background: 'var(--bg-card)',
        border: selected ? '1px solid var(--accent)' : hairline,
        borderRadius: 14,
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: selected ? '0 0 0 1px var(--accent), 0 10px 30px rgba(0,0,0,0.35)' : '0 10px 30px rgba(0,0,0,0.22)',
      }}
    >
      {/* A faint corner wash tinted by the lead satellite — the card's only
          decoration, and it carries information rather than mood. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(120% 80% at 100% 0%, ${lead.color}18, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />

      <header
        onClick={clickable ? () => onCardClick!(character) : undefined}
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-start',
          position: 'relative',
          cursor: clickable ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: 10,
            background: 'var(--bg-hover)',
            border: `1px solid ${lead.color}55`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            overflow: 'hidden',
          }}
        >
          <AvatarFill avatar={character.avatar} alt={character.name} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
            <h3
              style={{
                fontSize: '0.98rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {character.name}
            </h3>
            <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: lead.color, letterSpacing: '0.08em', flexShrink: 0 }}>
              {designation}
            </span>
          </div>
          <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
            #{character.id} · {character.category || 'General'}
            {sat.length > 0 && ` · ${sat.length} node${sat.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </header>

      {dossier ? (
        <>
          {/* Training level. The bar is progress into the level, not a fake 100%. */}
          <div
            style={{
              border: hairline,
              borderRadius: 9,
              padding: '0.5rem 0.65rem',
              background: 'rgba(255,255,255,0.02)',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
              <span style={{ fontFamily: MONO, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                {dossier.levelLabel}
              </span>
              <span style={{ ...microLabel, fontSize: '0.55rem' }}>{dossier.progress}% to next</span>
            </div>
            <span style={{ display: 'block', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <span
                className="cdx-bar"
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${dossier.progress}%`,
                  background: 'linear-gradient(90deg, var(--accent), var(--accent-light))',
                }}
              />
            </span>
          </div>

          <div>
            <p style={{ ...microLabel, marginBottom: '0.45rem' }}>Training stats</p>
            <StatBars stats={dossier.stats} dense />
          </div>

          <div>
            <p style={{ ...microLabel, marginBottom: '0.45rem' }}>Skill badges</p>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {badges.map((b) => (
                <span
                  key={b.slug}
                  title={`${b.label} — ${b.note}${b.earned ? '' : ' (locked)'}`}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    width: 48,
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      display: 'grid',
                      placeItems: 'center',
                      border: `1px solid ${b.earned ? b.color + '77' : 'var(--border)'}`,
                      background: b.earned ? b.color + '1a' : 'transparent',
                      color: b.earned ? b.color : 'var(--border)',
                    }}
                  >
                    <BadgeGlyph slug={b.slug} />
                  </span>
                  <span
                    style={{
                      fontSize: '0.5rem',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: b.earned ? 'var(--text-secondary)' : 'var(--border)',
                      textAlign: 'center',
                      lineHeight: 1.1,
                    }}
                  >
                    {b.label}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* The satellite strip: which personalities are live right now. */}
          {sat.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {sat.map((n) => (
                <span
                  key={n.node}
                  title={`${n.name} (${n.designation}) — ${n.status}${n.overridden ? ', overridden' : ''}${n.driftPct ? `, ${n.driftPct}% behind` : ''}`}
                  style={{
                    fontFamily: MONO,
                    fontSize: '0.55rem',
                    letterSpacing: '0.05em',
                    padding: '0.15rem 0.35rem',
                    borderRadius: 4,
                    border: `1px solid ${n.color}66`,
                    color: n.color,
                    background: n.color + '12',
                    textDecoration: n.status === 'withheld' ? 'line-through' : 'none',
                    opacity: n.status === 'merged' ? 0.5 : 1,
                  }}
                >
                  {n.designation}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <DossierSkeleton />
      )}

      <div style={{ marginTop: 'auto', display: 'grid', gap: '0.4rem', position: 'relative' }}>
        <button
          type="button"
          onClick={() => onOpen(character.id)}
          className="cdx-advanced-btn"
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: 8,
            border: `1px solid ${lead.color}66`,
            background: 'transparent',
            color: lead.color,
            cursor: 'pointer',
            fontFamily: MONO,
            fontSize: '0.63rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Advanced view
        </button>
        {footer}
      </div>
    </article>
  )
}

/** Shape-matched placeholder — the card does not resize when the dossier lands. */
function DossierSkeleton() {
  return (
    <div aria-hidden style={{ display: 'grid', gap: '0.7rem' }}>
      <div className="cdx-pulse" style={{ height: 44, borderRadius: 9, background: 'var(--bg-hover)' }} />
      <div style={{ display: 'grid', gap: '0.3rem' }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="cdx-pulse" style={{ height: 4, borderRadius: 2, background: 'var(--bg-hover)', animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="cdx-pulse" style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-hover)', animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────── the satellite ring */

const RING_RADIUS = 37

/**
 * The One Mind diagram: eight personality nodes on a ring around Punk Records.
 *
 * The lines carry the state. A synced node draws a solid tether to the core; a
 * withholding node's tether is dashed and stops short of it, which is the whole
 * security story in one stroke; a mirror-prism transfer draws node to node,
 * bypassing the core entirely.
 */
function SatelliteRing({
  nodes,
  mirrors,
  selected,
  onSelect,
  integrity,
}: {
  nodes: NodeReadingDTO[]
  mirrors: { from: string; to: string }[]
  selected: string
  onSelect: (id: string) => void
  integrity: number
}) {
  const ringNodes = nodes.filter((n) => n.satellite.id !== CORE_NODE)
  const pos = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {}
    ringNodes.forEach((n, i) => {
      const a = (i / ringNodes.length) * Math.PI * 2 - Math.PI / 2
      map[n.satellite.id] = { x: 50 + Math.cos(a) * RING_RADIUS, y: 50 + Math.sin(a) * RING_RADIUS }
    })
    map[CORE_NODE] = { x: 50, y: 50 }
    return map
  }, [ringNodes])

  return (
    <div className="cdx-ring" style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', maxWidth: 460, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--border)" strokeWidth="0.25" strokeDasharray="1 2" />
        {ringNodes.map((n) => {
          const p = pos[n.satellite.id]
          const live = n.spawned && n.status !== 'dormant'
          const dark = n.status === 'withheld'
          // A severed tether stops 8 units short of the core: the gap is the drift.
          const t = dark ? 0.68 : 1
          return (
            <line
              key={n.satellite.id}
              x1={50 + (p.x - 50) * 0.32}
              y1={50 + (p.y - 50) * 0.32}
              x2={50 + (p.x - 50) * (0.32 + (t - 0.32))}
              y2={50 + (p.y - 50) * (0.32 + (t - 0.32))}
              stroke={live ? n.satellite.color : 'var(--border)'}
              strokeWidth={live ? 0.45 : 0.25}
              strokeDasharray={dark ? '1.4 1.4' : undefined}
              opacity={live ? (dark ? 0.7 : 0.85) : 0.35}
            />
          )
        })}
        {mirrors.map((m, i) => {
          const a = pos[m.from]
          const b = pos[m.to]
          if (!a || !b) return null
          return (
            <line
              key={`${m.from}-${m.to}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={satelliteMeta(m.from).color}
              strokeWidth="0.35"
              strokeDasharray="0.8 1.6"
              opacity="0.55"
            />
          )
        })}
      </svg>

      {/* The core: Stella and the records she keeps custody of. */}
      <button
        type="button"
        onClick={() => onSelect(CORE_NODE)}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '30%',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          border: selected === CORE_NODE ? '2px solid #dfe4ee' : '1px solid var(--border)',
          background: 'radial-gradient(circle at 50% 35%, #23233a, #101018)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          gap: 0,
          padding: 0,
          boxShadow: `0 0 40px rgba(167,139,250,${0.1 + (integrity / 100) * 0.22})`,
        }}
      >
        <span style={{ display: 'grid', placeItems: 'center', lineHeight: 1.15 }}>
          <span style={{ fontFamily: MONO, fontSize: '0.52rem', letterSpacing: '0.14em', color: 'var(--text-secondary)' }}>ONE MIND</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.02em' }}>STELLA</span>
          <span style={{ fontFamily: MONO, fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--accent-light)' }}>PUNK RECORDS</span>
        </span>
      </button>

      {ringNodes.map((n) => {
        const p = pos[n.satellite.id]
        const live = n.spawned && n.status !== 'dormant' && n.status !== 'merged'
        const active = selected === n.satellite.id
        return (
          <button
            key={n.satellite.id}
            type="button"
            onClick={() => onSelect(n.satellite.id)}
            title={`${n.satellite.name} — ${n.satellite.role}`}
            className="cdx-node"
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: `translate(-50%, -50%) scale(${active ? 1.08 : 1})`,
              width: '22%',
              padding: '0.3rem 0.2rem',
              borderRadius: 10,
              cursor: 'pointer',
              border: `1px solid ${live ? n.satellite.color + (active ? 'ff' : '77') : 'var(--border)'}`,
              background: live ? n.satellite.color + (active ? '26' : '12') : 'var(--bg-secondary)',
              color: live ? n.satellite.color : 'var(--text-secondary)',
              opacity: n.spawned ? 1 : 0.45,
              display: 'grid',
              gap: 1,
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: '0.5rem', letterSpacing: '0.06em', opacity: 0.85 }}>{n.satellite.designation}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{n.satellite.name}</span>
            <span style={{ fontSize: '0.48rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>
              {n.status === 'withheld' ? `dark ${n.driftPct}%` : n.spawned ? n.status : 'dormant'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ──────────────────────────────────────────────────────── the node panel */

const STATUS_TONE: Record<string, string> = {
  core: '#dfe4ee',
  online: '#4ade80',
  dormant: '#6b7280',
  withheld: '#e8709a',
  merged: '#a78bfa',
}

function NodePanel({
  node,
  reading,
  busy,
  act,
}: {
  node: NodeReadingDTO
  reading: CodexReadingDTO
  busy: string
  act: (action: string, payload?: Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(node.overridden ? node.voice : '')
  const [mirrorTo, setMirrorTo] = useState('')
  const nodeId = node.satellite.id
  const isCore = nodeId === CORE_NODE

  // Reset the editor when the selection changes, so an override typed for Lilith
  // is never silently saved onto Atlas.
  const lastNode = useRef(nodeId)
  useEffect(() => {
    if (lastNode.current !== nodeId) {
      lastNode.current = nodeId
      setDraft(node.overridden ? node.voice : '')
      setMirrorTo('')
    }
  }, [nodeId, node.overridden, node.voice])

  const stats = METRICS.map((m) => ({ key: m.key, label: m.label, short: m.short, color: m.color, pct: node.metrics[m.key] ?? 0 }))
  const mirrorTargets = reading.sync.nodes.filter(
    (n) => n.satellite.id !== nodeId && n.spawned && n.status !== 'dormant' && n.status !== 'merged',
  )

  const btn = (label: string, action: string, payload: Record<string, unknown>, tone: string) => (
    <button
      key={action + label}
      type="button"
      disabled={!!busy}
      onClick={() => act(action, payload)}
      style={{
        padding: '0.35rem 0.6rem',
        borderRadius: 6,
        border: `1px solid ${tone}66`,
        background: tone + '14',
        color: tone,
        cursor: busy ? 'wait' : 'pointer',
        fontFamily: MONO,
        fontSize: '0.6rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 700,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy === action ? '…' : label}
    </button>
  )

  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: node.satellite.color, letterSpacing: '0.02em' }}>
            {node.satellite.name.toUpperCase()}
          </h3>
          <span style={{ fontFamily: MONO, fontSize: '0.65rem', color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>
            {node.satellite.designation} · PSN {node.satellite.psn}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: MONO,
              fontSize: '0.58rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: STATUS_TONE[node.status] || 'var(--text-secondary)',
              border: `1px solid ${(STATUS_TONE[node.status] || '#666') + '55'}`,
              borderRadius: 4,
              padding: '0.1rem 0.35rem',
            }}
          >
            {node.status}
          </span>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
          {node.satellite.role} · axis {metricMeta(node.satellite.dominant).label}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {node.satellite.traits.map((t) => (
          <span
            key={t}
            style={{
              fontSize: '0.66rem',
              padding: '0.15rem 0.45rem',
              borderRadius: 4,
              border: hairline,
              color: 'var(--text-secondary)',
            }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* The shared-knowledge contract, stated numerically. Two synced nodes must
          show the same "holding" figure; a gap is the evidence of a leak. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem' }}>
        {[
          { label: 'Holding', value: node.holding, sub: `of ${reading.sync.shared} shared` },
          { label: 'Filed', value: node.contributed, sub: 'reverse actions' },
          { label: 'Drift', value: `${node.driftPct}%`, sub: node.driftPct ? 'behind hub' : 'in sync' },
        ].map((s) => (
          <div key={s.label} style={{ border: hairline, borderRadius: 8, padding: '0.45rem 0.55rem', background: 'rgba(255,255,255,0.02)' }}>
            <p style={{ ...microLabel, fontSize: '0.52rem' }}>{s.label}</p>
            <p style={{ fontFamily: MONO, fontSize: '1rem', fontWeight: 700 }}>{s.value}</p>
            <p style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div>
        <p style={{ ...microLabel, marginBottom: '0.45rem' }}>Personality metrics</p>
        <StatBars stats={stats} />
      </div>

      {/* The override. This is the character-creator hook: the knowledge under it
          is untouched, only the voice on top changes. */}
      <div>
        <p style={{ ...microLabel, marginBottom: '0.35rem' }}>
          Personality override {node.overridden && <span style={{ color: 'var(--accent-light)' }}>· custom</span>}
        </p>
        {isCore ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>
            {node.voice} The core is the original body — it cannot be overridden, only answered to.
          </p>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={node.satellite.voice}
              rows={3}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: hairline,
                borderRadius: 8,
                color: 'var(--text-primary)',
                padding: '0.5rem 0.6rem',
                fontSize: '0.8rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
            <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Leave empty to keep the canon voice for this split. Knowledge is unaffected either way.
            </p>
          </>
        )}
      </div>

      {!isCore && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {!node.spawned
            ? btn('Split off', 'spawn', { node: nodeId, personaOverride: draft }, node.satellite.color)
            : [
                btn('Save override', 'override', { node: nodeId, personaOverride: draft }, 'var(--accent-light)'),
                node.status === 'withheld'
                  ? btn('Resync', 'sync', { node: nodeId }, '#4ade80')
                  : btn('Sync now', 'sync', { node: nodeId }, '#4ade80'),
                node.status !== 'withheld' && btn('Withhold sync', 'withhold', { node: nodeId }, '#e8709a'),
                node.status === 'dormant'
                  ? btn('Wake', 'spawn', { node: nodeId }, node.satellite.color)
                  : btn('Stand down', 'standdown', { node: nodeId }, '#6b7280'),
                node.status !== 'merged' && btn('Merge to core', 'merge', { node: nodeId }, '#a78bfa'),
              ].filter(Boolean)}
        </div>
      )}

      {/* The split at inference. Everything above configures a personality; this
          is where it answers. The node's override becomes the persona surface for
          the turn while the Punk Records underneath stay identical, so the same
          knowledge comes back in a different temperament. */}
      {node.spawned && node.status !== 'dormant' && (
        <a
          href={`/chat/${reading.character.id}?node=${nodeId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            padding: '0.55rem',
            borderRadius: 10,
            border: `1px solid ${node.satellite.color}66`,
            background: `${node.satellite.color}1f`,
            color: 'var(--text-primary)',
            fontSize: '0.78rem',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Speak with {node.satellite.name}
          <span style={{ fontFamily: MONO, fontSize: '0.62rem', opacity: 0.8 }}>{node.satellite.designation}</span>
        </a>
      )}

      {/* Mirror Prism: node to node, no core round trip. */}
      {!isCore && node.spawned && node.status === 'online' && mirrorTargets.length > 0 && (
        <div style={{ border: hairline, borderRadius: 10, padding: '0.6rem 0.7rem', background: 'rgba(255,255,255,0.02)' }}>
          <p style={{ ...microLabel, marginBottom: '0.35rem' }}>Mirror prism</p>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
            Beam this node's logical state straight into another. One hop, no core round trip — faster context, and
            unlogged at the hub.
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <select
              value={mirrorTo}
              onChange={(e) => setMirrorTo(e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: hairline,
                borderRadius: 6,
                color: 'var(--text-primary)',
                padding: '0.35rem 0.5rem',
                fontSize: '0.75rem',
              }}
            >
              <option value="">Target node…</option>
              {mirrorTargets.map((t) => (
                <option key={t.satellite.id} value={t.satellite.id}>
                  {t.satellite.name} ({t.satellite.designation})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!mirrorTo || !!busy}
              onClick={() => act('mirror', { node: nodeId, targetNode: mirrorTo })}
              style={{
                padding: '0.35rem 0.7rem',
                borderRadius: 6,
                border: '1px solid #67c9d866',
                background: '#67c9d814',
                color: '#67c9d8',
                cursor: mirrorTo && !busy ? 'pointer' : 'not-allowed',
                opacity: mirrorTo && !busy ? 1 : 0.5,
                fontFamily: MONO,
                fontSize: '0.6rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {busy === 'mirror' ? '…' : 'Beam'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────── reverse-action filer */

const KIND_TONE: Record<string, string> = {
  birth: '#a78bfa',
  reverse_action: '#5eead4',
  sync: '#8fb2ef',
  mirror: '#67c9d8',
  merge: '#c9a227',
}

function ReverseFiler({
  reading,
  node,
  busy,
  act,
}: {
  reading: CodexReadingDTO
  node: string
  busy: string
  act: (action: string, payload?: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState('')
  const [knowledge, setKnowledge] = useState('')
  const [sourceRef, setSourceRef] = useState('')
  const [weight, setWeight] = useState(2)
  const [sealed, setSealed] = useState(false)

  const author = reading.sync.nodes.find((n) => n.satellite.id === node)
  const canFile = node === CORE_NODE || (author?.spawned && author.status !== 'dormant')

  const submit = async () => {
    if (!title.trim()) return
    await act('reverse', { node, title, knowledge, sourceRef, weight, sealed })
    setTitle('')
    setKnowledge('')
    setSourceRef('')
    setSealed(false)
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        A reverse action is knowledge handed back up from work a node did — a job from CharacterVerse Jobs, an order, a
        chat that taught it something. Filed here it becomes shared: every synced node inherits it, whatever their
        temperament.
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What did this node learn?"
        style={{
          background: 'var(--bg-secondary)',
          border: hairline,
          borderRadius: 8,
          color: 'var(--text-primary)',
          padding: '0.5rem 0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'inherit',
        }}
      />
      <textarea
        value={knowledge}
        onChange={(e) => setKnowledge(e.target.value)}
        placeholder="The knowledge itself — what the other nodes will inherit."
        rows={3}
        style={{
          background: 'var(--bg-secondary)',
          border: hairline,
          borderRadius: 8,
          color: 'var(--text-primary)',
          padding: '0.5rem 0.6rem',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          resize: 'vertical',
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={sourceRef}
          onChange={(e) => setSourceRef(e.target.value)}
          placeholder="Provenance (job id, order, chat)"
          style={{
            flex: '1 1 180px',
            background: 'var(--bg-secondary)',
            border: hairline,
            borderRadius: 8,
            color: 'var(--text-primary)',
            padding: '0.4rem 0.6rem',
            fontSize: '0.78rem',
            fontFamily: MONO,
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Weight
          <select
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            style={{
              background: 'var(--bg-secondary)',
              border: hairline,
              borderRadius: 6,
              color: 'var(--text-primary)',
              padding: '0.3rem 0.4rem',
              fontFamily: MONO,
              fontSize: '0.75rem',
            }}
          >
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label
          title="The hub has no moral filter. A sealed entry is one the author kept back — permitted by the protocol, and exactly the flaw the Codex reports."
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}
        >
          <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.target.checked)} />
          Seal from sync
        </label>
      </div>
      {weight >= 4 && (
        <p style={{ fontSize: '0.7rem', color: '#e8709a', lineHeight: 1.5 }}>
          Weight {weight} uploads raw. The hub applies no moral filter, so every node — including the ones that would
          have refused to write this — inherits it verbatim on the next sync.
        </p>
      )}
      <button
        type="button"
        disabled={!title.trim() || !canFile || !!busy}
        onClick={submit}
        style={{
          padding: '0.5rem 0.8rem',
          borderRadius: 8,
          border: 'none',
          background: title.trim() && canFile ? 'var(--accent)' : 'var(--bg-hover)',
          color: title.trim() && canFile ? '#fff' : 'var(--text-secondary)',
          cursor: title.trim() && canFile && !busy ? 'pointer' : 'not-allowed',
          fontFamily: MONO,
          fontSize: '0.65rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 700,
          justifySelf: 'start',
        }}
      >
        {busy === 'reverse' ? 'Filing…' : `File as ${satelliteMeta(node).name}`}
      </button>
      {!canFile && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {satelliteMeta(node).name} is not live. Split it off or wake it before it can file anything.
        </p>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────── records feed */

function RecordsFeed({ records, now }: { records: RecordDTO[]; now: string }) {
  const nowMs = useMemo(() => new Date(now).getTime(), [now])
  if (records.length === 0) {
    return (
      <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '1.5rem 1rem', textAlign: 'center' }}>
        <p style={{ fontFamily: MONO, fontSize: '0.7rem', letterSpacing: '0.12em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Records empty
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem', lineHeight: 1.5 }}>
          Nothing has been filed to the hub yet. Split a satellite off, or file a reverse action, and the shared mind
          starts accumulating.
        </p>
      </div>
    )
  }
  return (
    <ol style={{ listStyle: 'none', display: 'grid', gap: '0.4rem' }}>
      {records.map((r) => {
        const tone = KIND_TONE[r.kind] || 'var(--text-secondary)'
        return (
          <li
            key={r.id}
            style={{
              border: hairline,
              borderLeft: `2px solid ${tone}`,
              borderRadius: '0 8px 8px 0',
              padding: '0.5rem 0.65rem',
              background: 'rgba(255,255,255,0.015)',
            }}
          >
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: tone }}>
                {RECORD_KIND_LABEL[r.kind] || r.kind}
              </span>
              <span style={{ fontFamily: MONO, fontSize: '0.58rem', color: 'var(--text-secondary)' }}>
                {r.nodeName}
                {r.targetName ? ` → ${r.targetName}` : ''}
              </span>
              {r.weight >= 4 && (
                <span style={{ fontFamily: MONO, fontSize: '0.55rem', color: '#e8709a', letterSpacing: '0.06em' }}>W{r.weight} UNFILTERED</span>
              )}
              {r.sealed && (
                <span style={{ fontFamily: MONO, fontSize: '0.55rem', color: '#c9a227', letterSpacing: '0.06em' }}>SEALED</span>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '0.55rem', color: 'var(--text-secondary)' }}>
                {relativeTime(r.createdAt, nowMs)}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.2rem', lineHeight: 1.45 }}>{r.title}</p>
            {r.knowledge && (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: 1.5 }}>{r.knowledge}</p>
            )}
            {r.sourceRef && (
              <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: 'var(--accent-light)', marginTop: '0.2rem' }}>ref {r.sourceRef}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/* ─────────────────────────────────────────────────────── the Codex entry */

/**
 * The Codex entry itself. One overlay, opened from either access point, showing
 * the whole shared-mind picture: the ring, the selected node, what the hub knows,
 * and the three standing weaknesses of running a mind this way.
 */
export function CodexOverlay({ characterId, onClose }: { characterId: number | null; onClose: () => void }) {
  const { reading, loading, busy, error, act, clearError } = useCodexReading(characterId)
  const [selected, setSelected] = useState<string>(CORE_NODE)
  const [tab, setTab] = useState<'records' | 'file'>('records')

  // Close on Escape, and restore the page's scroll lock on the way out.
  useEffect(() => {
    if (characterId == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [characterId, onClose])

  useEffect(() => {
    setSelected(CORE_NODE)
    setTab('records')
  }, [characterId])

  if (characterId == null) return null

  const node = reading?.sync.nodes.find((n) => n.satellite.id === selected)
  const mirrors = (reading?.records || [])
    .filter((r) => r.kind === 'mirror' && r.targetNode)
    .slice(0, 6)
    .map((r) => ({ from: r.node, to: r.targetNode as string }))

  return (
    <div
      className="cdx-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Character Codex"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(6,6,12,0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '1.25rem',
        overflowY: 'auto',
      }}
    >
      <div
        className="cdx-sheet"
        style={{
          width: '100%',
          maxWidth: 1080,
          background: 'var(--bg-primary)',
          border: hairline,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 30px 90px rgba(0,0,0,0.6)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            padding: '0.9rem 1.1rem',
            borderBottom: hairline,
            background: 'var(--bg-secondary)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ ...microLabel, fontSize: '0.55rem', color: 'var(--accent-light)' }}>Character Codex</span>
          {reading && (
            <>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'var(--bg-hover)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '1.05rem',
                  overflow: 'hidden',
                }}
              >
                <AvatarFill avatar={reading.character.avatar} alt={reading.character.name} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.2 }}>{reading.character.name}</h2>
                <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
                  #{reading.character.id} · {reading.dossier.levelLabel} · integrity {reading.sync.integrity}%
                </p>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Codex"
            style={{
              marginLeft: 'auto',
              width: 30,
              height: 30,
              borderRadius: 8,
              border: hairline,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: '1rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        {loading && (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
            <p style={{ fontFamily: MONO, fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Reading Punk Records…
            </p>
          </div>
        )}

        {!loading && error && !reading && (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <p style={{ color: '#e8709a', fontSize: '0.9rem' }}>{error}</p>
          </div>
        )}

        {reading && (
          <div className="cdx-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1.05fr)', gap: 0 }}>
            <section style={{ padding: '1.1rem', borderRight: hairline, display: 'grid', gap: '1rem', alignContent: 'start' }}>
              <div>
                <p style={microLabel}>Satellite sync protocol</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.55 }}>
                  {reading.sync.shared} entries in the hub, {reading.sync.reverseActions} of them reverse actions.
                  Every synced node holds all of them — only the personality on top differs.
                </p>
              </div>

              <SatelliteRing
                nodes={reading.sync.nodes}
                mirrors={mirrors}
                selected={selected}
                onSelect={setSelected}
                integrity={reading.sync.integrity}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.4rem' }}>
                {[
                  { label: 'Shared entries', value: reading.sync.shared },
                  { label: 'Reverse actions', value: reading.sync.reverseActions },
                  { label: 'Prism transfers', value: reading.sync.mirrors },
                  { label: 'Coordinator', value: satelliteMeta(reading.sync.coordinator).name },
                ].map((s) => (
                  <div key={s.label} style={{ border: hairline, borderRadius: 8, padding: '0.45rem 0.55rem' }}>
                    <p style={{ ...microLabel, fontSize: '0.5rem' }}>{s.label}</p>
                    <p style={{ fontFamily: MONO, fontSize: '0.9rem', fontWeight: 700 }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {reading.sync.warnings.length > 0 && (
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  <p style={microLabel}>Standing weaknesses</p>
                  {reading.sync.warnings.map((w) => {
                    const tone = w.severity === 'concern' ? '#e8709a' : '#c9a227'
                    return (
                      <div
                        key={w.kind}
                        style={{
                          border: `1px solid ${tone}44`,
                          background: tone + '0f',
                          borderRadius: 8,
                          padding: '0.5rem 0.6rem',
                        }}
                      >
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: tone }}>{w.title}</p>
                        <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: 1.5 }}>{w.detail}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              <div>
                <p style={microLabel}>Blended voice</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0.5rem', lineHeight: 1.5 }}>
                  What the character actually sounds like right now — the mean of its live nodes.
                </p>
                <StatBars stats={reading.dossier.stats} dense />
              </div>
            </section>

            <section style={{ padding: '1.1rem', display: 'grid', gap: '1rem', alignContent: 'start', minWidth: 0 }}>
              {error && (
                <div
                  role="alert"
                  style={{
                    border: '1px solid #e8709a55',
                    background: '#e8709a12',
                    borderRadius: 8,
                    padding: '0.5rem 0.6rem',
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'flex-start',
                  }}
                >
                  <p style={{ fontSize: '0.78rem', color: '#e8709a', flex: 1, lineHeight: 1.5 }}>{error}</p>
                  <button
                    type="button"
                    onClick={clearError}
                    style={{ background: 'none', border: 'none', color: '#e8709a', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              )}

              {node && <NodePanel node={node} reading={reading} busy={busy} act={act} />}

              <div style={{ borderTop: hairline, paddingTop: '0.85rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.7rem' }}>
                  {(
                    [
                      { key: 'records' as const, label: `Punk Records (${reading.sync.shared})` },
                      { key: 'file' as const, label: 'File reverse action' },
                    ]
                  ).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      style={{
                        padding: '0.3rem 0.6rem',
                        borderRadius: 6,
                        border: hairline,
                        background: tab === t.key ? 'var(--bg-hover)' : 'transparent',
                        color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontFamily: MONO,
                        fontSize: '0.6rem',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {tab === 'records' ? (
                  <div className="cdx-scroll" style={{ maxHeight: 340, overflowY: 'auto', paddingRight: '0.25rem' }}>
                    <RecordsFeed records={reading.records} now={reading.now} />
                  </div>
                ) : (
                  <ReverseFiler reading={reading} node={selected} busy={busy} act={act} />
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────── satellite forge */

export type ForgePicks = Record<string, { on: boolean; override: string }>

export const EMPTY_FORGE: ForgePicks = {}

/** How many nodes the forge will split off. */
export function forgeCount(picks: ForgePicks): number {
  return Object.values(picks).filter((p) => p.on).length
}

/**
 * Send a forge selection to the Codex after a character has been created.
 *
 * Sequential rather than parallel on purpose: each spawn also writes a birth
 * entry to Punk Records, and firing eight inserts at once would interleave the
 * hub's history into an order that does not match the order the operator chose.
 * Failures are swallowed — a character that exists with fewer satellites than
 * asked for is a far better outcome than a creation flow that reports failure
 * after the character is already saved.
 */
export async function applyForge(characterId: number, picks: ForgePicks, sessionId: string) {
  for (const sat of [...CANON_NODES, ...OPERATOR_NODES]) {
    const pick = picks[sat]
    if (!pick?.on) continue
    try {
      await fetch(`/api/charactercodex/${characterId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'spawn',
          node: sat,
          personaOverride: pick.override.trim(),
          sessionId,
        }),
      })
    } catch {
      // Keep going: one refused node should not strand the rest.
    }
  }
}

/**
 * The Satellite Forge — split personalities off a character at creation time.
 *
 * This is the "override the clones through the character creator" step. Choosing
 * a node splits it off the moment the character is born; the text box under it
 * replaces that split's canon voice. The knowledge base is untouched either way,
 * which is the point: one record, many temperaments.
 */
export function SatelliteForge({
  picks,
  onChange,
  note,
}: {
  picks: ForgePicks
  onChange: (next: ForgePicks) => void
  note?: string
}) {
  const roster = [...CANON_NODES, ...OPERATOR_NODES].map((id) => satelliteMeta(id))
  const count = forgeCount(picks)

  const toggle = (id: string) => {
    const current = picks[id] || { on: false, override: '' }
    onChange({ ...picks, [id]: { ...current, on: !current.on } })
  }
  const setOverride = (id: string, override: string) => {
    const current = picks[id] || { on: false, override: '' }
    onChange({ ...picks, [id]: { ...current, override } })
  }

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div>
        <p style={{ ...microLabel, color: 'var(--accent-light)' }}>Satellite forge · optional</p>
        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.6 }}>
          Split this character into satellite personalities at birth. Each one inherits the whole knowledge base and
          overrides only the voice on top of it — so the same character can answer as good, as evil, as thinking, as
          wisdom, as anger or as greed without ever knowing different things.
        </p>
        {note && (
          <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.3rem', fontStyle: 'italic' }}>
            {note}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {roster.map((sat) => {
          const pick = picks[sat.id] || { on: false, override: '' }
          const axis = metricMeta(sat.dominant)
          return (
            <div
              key={sat.id}
              style={{
                border: `1px solid ${pick.on ? sat.color + '77' : 'var(--border)'}`,
                borderRadius: 10,
                background: pick.on ? sat.color + '0d' : 'transparent',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => toggle(sat.id)}
                aria-pressed={pick.on}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.6rem 0.7rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    border: `1px solid ${pick.on ? sat.color : 'var(--border)'}`,
                    background: pick.on ? sat.color : 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#0d0d14',
                    fontSize: '0.6rem',
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {pick.on ? '✓' : ''}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: pick.on ? sat.color : 'var(--text-primary)' }}>
                      {sat.name}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
                      {sat.designation} · PSN {sat.psn}
                    </span>
                  </span>
                  <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    {sat.role} · axis {axis.label}
                  </span>
                </span>
              </button>

              {pick.on && (
                <div style={{ padding: '0 0.7rem 0.65rem' }}>
                  <textarea
                    value={pick.override}
                    onChange={(e) => setOverride(sat.id, e.target.value)}
                    placeholder={sat.voice}
                    rows={2}
                    maxLength={2000}
                    style={{
                      width: '100%',
                      background: 'var(--bg-secondary)',
                      border: hairline,
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      padding: '0.45rem 0.55rem',
                      fontSize: '0.79rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      lineHeight: 1.5,
                    }}
                  />
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Leave empty to use {sat.name}&rsquo;s canon voice.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ fontFamily: MONO, fontSize: '0.65rem', color: count ? 'var(--accent-light)' : 'var(--text-secondary)', letterSpacing: '0.05em' }}>
        {count === 0
          ? 'No satellites — the character stays a single voice.'
          : `${count} node${count > 1 ? 's' : ''} will be split off at birth, all sharing one Punk Records hub.`}
      </p>
    </div>
  )
}

/* ────────────────────────────────────────────────────────── shared blurb */

/**
 * The one-paragraph explanation of what the advanced view is, used above both
 * grids so the feature is not mysterious the first time someone flips the switch.
 */
export function CodexBanner({ where }: { where: 'ask' | 'discover' }) {
  return (
    <div
      style={{
        border: hairline,
        borderRadius: 12,
        padding: '0.75rem 0.9rem',
        background: 'linear-gradient(120deg, rgba(124,92,191,0.10), transparent 65%)',
        display: 'grid',
        gap: '0.3rem',
      }}
    >
      <p style={{ ...microLabel, color: 'var(--accent-light)' }}>Character Codex · advanced view</p>
      <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {where === 'ask'
          ? 'Every character here can be split into satellite personalities that share one knowledge base. Open a Codex entry from any tile to see its nodes, its Punk Records feed and the reverse actions feeding it.'
          : 'Switch to Advanced and each card becomes an Agentic Character Dossier: live training level, personality metrics and skill badges, all derived from that character’s Punk Records. ADVANCED VIEW opens the full Codex entry.'}
      </p>
      <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
        {CANON_NODES.length} canon splits · {OPERATOR_NODES.length} operator nodes · knowledge shared, personality not
      </p>
    </div>
  )
}
