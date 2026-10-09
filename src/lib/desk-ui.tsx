import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, Pin, PinOff, X, AlertTriangle, ShieldCheck, CircleAlert, Info } from 'lucide-react'
import {
  DESK_BUDGET,
  driftSeries,
  purgeLabel,
  type DeskAnchor,
  type DeskLane,
  type DeskPurge,
  type DeskReading,
  type DeskStat,
  type DriftPoint,
} from './desk'

// The Desk panel: the readout the Clear Desk button needs to be honest.
//
// Two lanes stacked — the active desk over cold storage — because that is the
// claim being made physical. Paper does not vanish when the desk is cleared, it
// moves down a lane. The metrics row above says what the desk currently costs;
// the sawtooth below says what clearing it buys.
//
// Colour is doing no load-bearing work here. Every status ships with an icon and
// a label, the chart carries one series named by its own title (so no legend),
// and the reference line is neutral grey rather than a series hue — the palette
// was validated against this surface before any of it was drawn.

/* ─────────────────────────────────────────────────────────────── palette */

// Validated against surface #1a1a28 (--bg-card) in dark mode: lightness band,
// chroma floor, adjacent CVD separation, normal-vision floor and contrast all
// pass. Do not substitute by eye.
const SERIES = '#3987e5'
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500']
const STATUS: Record<string, string> = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  neutral: '#9090b0',
}

function StatusIcon({ status, size = 13 }: { status: string; size?: number }) {
  const color = STATUS[status] ?? STATUS.neutral
  if (status === 'critical') return <CircleAlert size={size} color={color} aria-hidden />
  if (status === 'serious' || status === 'warning') return <AlertTriangle size={size} color={color} aria-hidden />
  if (status === 'good') return <ShieldCheck size={size} color={color} aria-hidden />
  return <Info size={size} color={color} aria-hidden />
}

/* ──────────────────────────────────────────────────────────── the payload */

export type DeskGuard = {
  refusesBoost: true
  verdict: 'clean' | 'anchor' | 'purge'
  headline: string
  reasoning: string
  prescription: string
}

export type DeskPayload = {
  conversationId: number
  characterId: number
  reading: DeskReading
  plan: {
    messagesFiled: number
    tokensReclaimed: number
    anchorsKept: number
    bandwidthAfter: number
    noiseAfter: number
    fidelityAfter: number
    clearedThroughMessageId: number
    summary: string
  }
  purgeLog: DeskPurge[]
  guard: DeskGuard
}

/* ─────────────────────────────────────────────────────────────── the lanes */

function Lane({ lane }: { lane: DeskLane }) {
  const cabinet = lane.key === 'cabinet'
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.35rem',
        }}
      >
        <span
          style={{
            fontSize: '0.6rem',
            fontWeight: 800,
            letterSpacing: '0.09em',
            color: cabinet ? 'var(--text-secondary)' : 'var(--text-primary)',
          }}
        >
          {lane.label}
        </span>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {lane.messages} turns · ~{lane.tokens.toLocaleString()} tok
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          // 2px surface gap between fills, so adjacent squares never merge.
          gap: 2,
          padding: '0.5rem',
          minHeight: 54,
          borderRadius: 10,
          background: cabinet ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.035)',
          border: `1px solid ${cabinet ? 'rgba(255,255,255,0.05)' : 'var(--border)'}`,
          alignContent: 'flex-start',
        }}
      >
        {lane.cells.length === 0 && (
          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {cabinet ? 'Nothing filed yet.' : 'Desk is clear.'}
          </span>
        )}
        {lane.cells.map((cell, i) => (
          <span
            key={`${cell.messageId}-${i}`}
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: cabinet ? 'rgba(144,144,176,0.22)' : SLOTS[cell.slot] ?? SLOTS[0],
              // Stale paper is drawn hollow: still on the desk, no longer read.
              opacity: cabinet ? 1 : cell.stale ? 0.4 : 1,
              outline: !cabinet && cell.stale ? '1px solid rgba(255,255,255,0.18)' : 'none',
            }}
          />
        ))}
        {lane.overflow > 0 && (
          <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginLeft: '0.3rem' }}>
            +{lane.overflow}
          </span>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── the stats */

function StatCell({ stat }: { stat: DeskStat }) {
  return (
    <div
      title={stat.hint}
      style={{
        flex: '1 1 88px',
        padding: '0.5rem 0.55rem',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.28rem', marginBottom: '0.2rem' }}>
        <StatusIcon status={stat.status} />
        <span
          style={{
            fontSize: '0.55rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
          }}
        >
          {stat.label}
        </span>
      </div>
      {/* Values wear text tokens, never the status hue — the icon carries state. */}
      <div
        style={{
          fontSize: '1.02rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {stat.value}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────── Context Drift vs. Anchoring */

const PAD = { top: 14, right: 12, bottom: 26, left: 40 }
const VB = { w: 620, h: 190 }

function seriesPath(points: DriftPoint[], x: (i: number) => number, y: (v: number) => number): string {
  let d = ''
  points.forEach((p, i) => {
    if (i === 0) {
      d += `M ${x(p.iteration)} ${y(p.fidelity)}`
      return
    }
    // An anchor is a reset, not a climb. Hold the previous value across to this
    // iteration and snap vertically, so the tooth has a corner instead of a ramp.
    if (p.anchored) d += ` L ${x(p.iteration)} ${y(points[i - 1].fidelity)}`
    d += ` L ${x(p.iteration)} ${y(p.fidelity)}`
  })
  return d
}

function DriftChart({
  iterations,
  anchorEvery,
  onIterations,
}: {
  iterations: number
  anchorEvery: number
  onIterations: (n: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [tableOpen, setTableOpen] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const points = useMemo(() => driftSeries(iterations, anchorEvery), [iterations, anchorEvery])
  const maxIter = Math.max(1, iterations)
  const x = useCallback(
    (i: number) => PAD.left + (i / maxIter) * (VB.w - PAD.left - PAD.right),
    [maxIter],
  )
  const y = useCallback((v: number) => PAD.top + (1 - v / 100) * (VB.h - PAD.top - PAD.bottom), [])

  const current = points[points.length - 1]
  const shown = hover !== null ? points[hover] : current

  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const box = svg.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * VB.w
    const frac = (px - PAD.left) / (VB.w - PAD.left - PAD.right)
    const idx = Math.round(frac * maxIter)
    setHover(idx >= 0 && idx < points.length ? idx : null)
  }

  return (
    <div>
      <div style={{ marginBottom: '0.45rem' }}>
        {/* One series, so the title names it and no legend box is needed. */}
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Context drift vs. anchoring
        </div>
        <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
          Fidelity score (%) over {iterations} iterations · anchored every {anchorEvery}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          width="100%"
          role="img"
          aria-label={`Fidelity score over ${iterations} iterations. Decays from 100% and resets to 100% at every anchor. Currently ${shown.fidelity.toFixed(1)}%.`}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseMove={move}
          onMouseLeave={() => setHover(null)}
        >
          {/* Recessive grid + the single y axis. */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={VB.w - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 7}
                y={y(v) + 3.5}
                textAnchor="end"
                fill="var(--text-secondary)"
                fontSize={9}
              >
                {v}
              </text>
            </g>
          ))}

          {/* Original intent: a reference line, so neutral and dashed — never a
              series colour, because it is not a series. */}
          <line
            x1={PAD.left}
            x2={VB.w - PAD.right}
            y1={y(100)}
            y2={y(100)}
            stroke="#9090b0"
            strokeWidth={1}
            strokeDasharray="5 4"
          />
          <text x={PAD.left + 4} y={y(100) - 5} fill="var(--text-secondary)" fontSize={9}>
            Original intent
          </text>

          <path
            d={seriesPath(points, x, y)}
            fill="none"
            stroke={SERIES}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Anchor resets get a marker: the teeth are the argument. */}
          {points
            .filter((p) => p.anchored)
            .map((p) => (
              <circle
                key={p.iteration}
                cx={x(p.iteration)}
                cy={y(p.fidelity)}
                r={4}
                fill={SERIES}
                stroke="#1a1a28"
                strokeWidth={2}
              />
            ))}

          {/* One selective direct label: the value the run ends on, so the chart
              reads without a hover. Text wears a text token, not the series hue. */}
          <text
            x={x(current.iteration) - 6}
            y={y(current.fidelity) - 9}
            textAnchor="end"
            fill="var(--text-primary)"
            fontSize={10}
            fontWeight={700}
          >
            {current.fidelity.toFixed(1)}%
          </text>

          {hover !== null && (
            <g>
              <line
                x1={x(points[hover].iteration)}
                x2={x(points[hover].iteration)}
                y1={PAD.top}
                y2={VB.h - PAD.bottom}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={1}
              />
              <circle
                cx={x(points[hover].iteration)}
                cy={y(points[hover].fidelity)}
                r={4.5}
                fill={SERIES}
                stroke="#1a1a28"
                strokeWidth={2}
              />
            </g>
          )}

          <text x={PAD.left} y={VB.h - 8} fill="var(--text-secondary)" fontSize={9}>
            0
          </text>
          <text x={VB.w - PAD.right} y={VB.h - 8} textAnchor="end" fill="var(--text-secondary)" fontSize={9}>
            {iterations} iterations
          </text>
        </svg>

        {hover !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${(x(points[hover].iteration) / VB.w) * 100}%`,
              top: 0,
              transform: 'translate(-50%, -108%)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              background: '#13131e',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.3rem 0.5rem',
              fontSize: '0.66rem',
              color: 'var(--text-primary)',
            }}
          >
            Iteration {points[hover].iteration} · {points[hover].fidelity.toFixed(1)}%
            {points[hover].anchored ? ' · anchored' : ''}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', marginTop: '0.55rem' }}>
        <label
          style={{
            fontSize: '0.6rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
          }}
          htmlFor="cv-desk-iters"
        >
          ITERATION COUNT
        </label>
        <input
          id="cv-desk-iters"
          type="range"
          min={5}
          max={80}
          step={1}
          value={iterations}
          onChange={(e) => onIterations(Number(e.target.value))}
          style={{ flex: 1, accentColor: SERIES }}
        />
        <span
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 22,
            textAlign: 'right',
          }}
        >
          {iterations}
        </span>
      </div>

      <button
        onClick={() => setTableOpen((v) => !v)}
        style={{
          marginTop: '0.4rem',
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: '0.64rem',
          color: 'var(--accent-light)',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {tableOpen ? 'Hide' : 'Show'} the numbers
      </button>

      {tableOpen && (
        <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: '0.4rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.64rem' }}>
            <caption style={{ textAlign: 'left', color: 'var(--text-secondary)', paddingBottom: '0.25rem' }}>
              Fidelity score by iteration
            </caption>
            <thead>
              <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.15rem 0' }}>Iteration</th>
                <th style={{ padding: '0.15rem 0' }}>Fidelity</th>
                <th style={{ padding: '0.15rem 0' }}>Event</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.iteration} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.15rem 0', color: 'var(--text-secondary)' }}>{p.iteration}</td>
                  <td style={{ padding: '0.15rem 0', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.fidelity.toFixed(1)}%
                  </td>
                  <td style={{ padding: '0.15rem 0', color: 'var(--text-secondary)' }}>
                    {p.anchored ? 'anchor reset' : 'drift'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────── the anchors */

function AnchorRow({
  anchor,
  onUnpin,
  busy,
}: {
  anchor: DeskAnchor
  onUnpin: (id: number) => void
  busy: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.5rem 0.6rem',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
      }}
    >
      <Pin size={13} color="var(--accent-light)" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {anchor.label}
        </div>
        <div
          style={{
            fontSize: '0.63rem',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {anchor.kind.toUpperCase()}
          {anchor.sourceRef ? ` · ${anchor.sourceRef}` : ''}
          {anchor.body ? ` — ${anchor.body}` : ''}
        </div>
      </div>
      <button
        onClick={() => onUnpin(anchor.id)}
        disabled={busy}
        aria-label={`Unpin ${anchor.label}`}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: busy ? 'wait' : 'pointer',
          flexShrink: 0,
          padding: 2,
        }}
      >
        <PinOff size={14} />
      </button>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────── the pill */

/**
 * The always-visible readout, next to the consciousness pill in the chat header.
 *
 * Bandwidth is the number worth surfacing because it is the one the user feels:
 * it falls turn by turn as the transcript grows, and it comes straight back when
 * the desk is cleared. Without it the top-up is invisible and the button reads as
 * a superstition.
 */
export function DeskPill({
  conversationId,
  refreshKey,
  onOpen,
}: {
  conversationId: number
  /** Bumped by the caller after each turn so the pill re-reads. */
  refreshKey: number
  onOpen: () => void
}) {
  const [v, setV] = useState<{ bandwidth: number; noise: number; status: string } | null>(null)

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    fetch(`/api/desk/${conversationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DeskPayload | null) => {
        if (cancelled || !d?.reading) return
        const stat = d.reading.stats.find((s) => s.key === 'bandwidth')
        setV({
          bandwidth: d.reading.bandwidthPct,
          noise: d.reading.noiseRiskPct,
          status: stat?.status ?? 'neutral',
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [conversationId, refreshKey])

  if (!v) return null

  return (
    <button
      onClick={onOpen}
      title={`Bandwidth ${v.bandwidth}% · noise risk ${v.noise}% — open the desk`}
      aria-label={`Desk bandwidth ${v.bandwidth} percent, noise risk ${v.noise} percent`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        height: 36,
        padding: '0 0.55rem',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(0,0,0,0.28)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.72rem',
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      <StatusIcon status={v.status} size={12} />
      {v.bandwidth}%
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────── the sheet */

export function DeskSheet({
  conversationId,
  characterName,
  sessionId,
  lastMessage,
  onClose,
  onCleared,
}: {
  conversationId: number
  characterName: string
  sessionId: string
  /** The most recent reply, offered as the obvious thing to pin. */
  lastMessage?: { id?: number; content: string } | null
  onClose: () => void
  onCleared?: (filed: number) => void
}) {
  const [desk, setDesk] = useState<DeskPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [iterations, setIterations] = useState(50)
  const [pinLabel, setPinLabel] = useState('')
  const [pinRef, setPinRef] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/desk/${conversationId}`)
      if (!res.ok) throw new Error(`${res.status}`)
      setDesk(await res.json())
      setError('')
    } catch {
      setError('The desk could not be read right now.')
    }
  }, [conversationId])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/desk/${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...body }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const next: DeskPayload = await res.json()
      setDesk(next)
      setError('')
      return next
    } catch {
      setError('That action did not go through. Nothing was changed.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    const filed = desk?.plan.messagesFiled ?? 0
    const next = await act({ action: 'clear', reason: 'manual' })
    if (next && filed) onCleared?.(filed)
  }

  const pin = async () => {
    const label = pinLabel.trim()
    if (!label) return
    await act({
      action: 'pin',
      kind: 'note',
      label,
      sourceRef: pinRef.trim() || null,
      body: lastMessage?.content?.slice(0, 4000) || '',
      messageId: lastMessage?.id ?? null,
    })
    setPinLabel('')
    setPinRef('')
  }

  // Anchors every ten iterations is the shape of the argument, not a setting:
  // it is what a working rhythm of "iterate, then pin" actually looks like.
  const anchorEvery = 10

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 160,
        background: 'rgba(4,4,10,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cv-sheet-up"
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#1a1a28',
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          border: '1px solid rgba(255,255,255,0.07)',
          borderBottom: 'none',
          padding: '1.1rem 1.1rem 2rem',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '0 auto 0.9rem' }} />

        <div style={{ position: 'relative', marginBottom: '0.9rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>Clear the desk</h2>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem', maxWidth: '90%' }}>
            {characterName} re-reads this whole thread before every reply. Filing it keeps every
            word in the log and takes it off the desk.
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: -2,
              right: 0,
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.7rem',
              color: 'var(--text-primary)',
              background: 'rgba(208,59,59,0.12)',
              border: '1px solid rgba(208,59,59,0.4)',
              borderRadius: 10,
              padding: '0.45rem 0.6rem',
              marginBottom: '0.8rem',
            }}
          >
            <CircleAlert size={14} color={STATUS.critical} aria-hidden />
            {error}
          </div>
        )}

        {!desk && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {/* Skeleton shaped like the lanes it replaces. */}
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: i === 2 ? 190 : 62,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                }}
              />
            ))}
          </div>
        )}

        {desk && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.9rem' }}>
              {desk.reading.stats.map((s) => (
                <StatCell key={s.key} stat={s} />
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '1rem' }}>
              {desk.reading.lanes.map((lane) => (
                <Lane key={lane.key} lane={lane} />
              ))}
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                One square ≈ 40 tokens. Hollow squares are on the desk but past the working
                window — the paper that answers old questions. Desk budget is{' '}
                {DESK_BUDGET.toLocaleString()} tokens.
              </div>
            </div>

            {desk.reading.warnings.map((w) => (
              <div
                key={w.key}
                style={{
                  display: 'flex',
                  gap: '0.45rem',
                  alignItems: 'flex-start',
                  fontSize: '0.7rem',
                  color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '0.5rem 0.6rem',
                  marginBottom: '0.5rem',
                }}
              >
                <StatusIcon status={w.severity} size={14} />
                <span>
                  <strong style={{ fontWeight: 700 }}>{w.title}.</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{w.detail}</span>
                </span>
              </div>
            ))}

            <button
              onClick={clear}
              disabled={busy || !desk.reading.clearable}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                padding: '0.7rem',
                marginTop: '0.4rem',
                borderRadius: 12,
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: desk.reading.clearable ? '#fff' : 'var(--text-secondary)',
                background: desk.reading.clearable
                  ? 'linear-gradient(135deg, var(--accent), #4f46e5)'
                  : 'rgba(255,255,255,0.06)',
                cursor: busy ? 'wait' : desk.reading.clearable ? 'pointer' : 'not-allowed',
              }}
            >
              <Eraser size={16} />
              {busy ? 'Filing…' : 'Clear the desk'}
            </button>
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                marginTop: '0.35rem',
                marginBottom: '1.1rem',
              }}
            >
              {desk.plan.summary}
              {desk.reading.clearable
                ? ` Bandwidth returns to ${desk.plan.bandwidthAfter}%.`
                : ''}
            </div>

            {/* The guard. It never offers to raise the number. */}
            <div
              style={{
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.025)',
                padding: '0.65rem 0.7rem',
                marginBottom: '1.1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                <StatusIcon
                  status={desk.guard.verdict === 'purge' ? 'serious' : desk.guard.verdict === 'anchor' ? 'warning' : 'good'}
                  size={14}
                />
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {desk.guard.headline}
                </span>
              </div>
              <p style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {desk.guard.prescription}
              </p>
              <p style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.35rem', fontStyle: 'italic' }}>
                {desk.guard.reasoning}
              </p>
            </div>

            <div style={{ marginBottom: '1.1rem' }}>
              <DriftChart iterations={iterations} anchorEvery={anchorEvery} onIterations={setIterations} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  letterSpacing: '0.09em',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.4rem',
                }}
              >
                PINNED ANCHORS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {desk.reading.anchors.length === 0 && (
                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-secondary)',
                      padding: '0.6rem',
                      borderRadius: 10,
                      border: '1px dashed var(--border)',
                      lineHeight: 1.5,
                    }}
                  >
                    Nothing pinned. An anchor is the one thing that crosses a purge — the last
                    stable answer, an image seed, a spec. Pin it and {characterName} drafts from
                    the artifact instead of from a memory of it.
                  </div>
                )}
                {desk.reading.anchors.map((a) => (
                  <AnchorRow
                    key={a.id}
                    anchor={a}
                    busy={busy}
                    onUnpin={(id) => void act({ action: 'unpin', anchorId: id })}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem' }}>
                <input
                  value={pinLabel}
                  onChange={(e) => setPinLabel(e.target.value)}
                  placeholder={lastMessage ? 'Pin the last reply as…' : 'Anchor label'}
                  style={{
                    flex: 2,
                    minWidth: 0,
                    padding: '0.45rem 0.55rem',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.72rem',
                  }}
                />
                <input
                  value={pinRef}
                  onChange={(e) => setPinRef(e.target.value)}
                  placeholder="seed / CID"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '0.45rem 0.55rem',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.72rem',
                  }}
                />
                <button
                  onClick={pin}
                  disabled={busy || !pinLabel.trim()}
                  style={{
                    padding: '0.45rem 0.7rem',
                    borderRadius: 9,
                    border: '1px solid var(--border)',
                    background: pinLabel.trim() ? 'rgba(124,92,191,0.22)' : 'rgba(255,255,255,0.04)',
                    color: pinLabel.trim() ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: pinLabel.trim() && !busy ? 'pointer' : 'not-allowed',
                    flexShrink: 0,
                  }}
                >
                  Pin
                </button>
              </div>
            </div>

            {desk.purgeLog.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    letterSpacing: '0.09em',
                    color: 'var(--text-secondary)',
                    marginBottom: '0.35rem',
                  }}
                >
                  PURGE LOG
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {desk.purgeLog.slice(0, 6).map((p) => (
                    <div key={p.id} style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      {purgeLabel(p)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
