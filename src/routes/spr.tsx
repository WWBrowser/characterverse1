import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Aperture, Archive, ArrowUp, Blend, Brain, Check, ChevronLeft, ChevronRight, CircleDot,
  DoorOpen, Focus, Gauge, GitBranch, Landmark, Layers, Lightbulb, Loader2, Repeat, ScanLine,
  Send, Sparkles, Split, Trash2, TriangleAlert, Zap,
} from 'lucide-react'
import {
  BASES, LOOP_STAGES, PALACE_FLOOR, ROOM_SLOTS, TIERS, TIER_META,
  buildPalace, climbTargets, collapse, dispersion, getBasis, labelAnchor, labelFontSize,
  labelY, placeLabels, promptWeight, relativeMass, roomOrdinal, stepTier, tierIndex,
  type Angle, type BasisId, type Substrate, type Superposition, type Tier,
} from '../lib/spr'
import { getSessionId } from '../lib/create-ui'

// SPR — Super Position Responses, and the Mind Palace Prism.
//
// The surface for a chat mode that refuses to pick for you. The model disperses
// into four branches, all four are on the page at once, and the branch you choose
// is what makes one of them the answer. The others do not disappear when you
// choose — which is the whole reason there is no Regenerate button here. Nothing
// was hidden, so there is nothing to re-roll.
//
// Three surfaces, matching the three the reference set was drawn in:
//
//   Legacy    one answer, no alternatives. Not a second model call — it is this
//             same dispersion with the other three branches concealed, which is
//             exactly what an ordinary chat does and does not tell you.
//   Default   the chosen branch in full, with the alternates standing beside it.
//   Advanced  all four literally superimposed and drifting, unreadable on
//             purpose, because that is what holding four answers at once is.
//
// The palace is the fourth piece and the one the reference never got working —
// its readout sat at NODES 0 through every tier. `buildPalace` in the kernel has
// no empty path and `PALACE_FLOOR` is asserted against it; this page renders
// whatever it returns and reports the count honestly beside the tier.
//
// Everything the kernel decides lives in src/lib/spr.ts so it can be tested
// without a browser. This file draws it and handles the network.

/* ------------------------------------------------------------------ tokens */

const GRID = '#2d2d45'
const INK = '#e8e8f5'
const MUTED = '#9090b0'
const CONNECT = '#5a5a78'
const GLASS = '#a78bfa'
const CRITICAL = '#d03b3b'
const WARNING = '#fab219'

const TIER_ICONS: Record<Tier, typeof Aperture> = {
  prism: Aperture,
  wings: DoorOpen,
  rooms: Landmark,
  drawers: Archive,
}

const LOOP_ICONS: Record<string, typeof Aperture> = {
  dispersion: Split,
  collapse: Focus,
  ingestion: Archive,
  adaptation: ArrowUp,
}

const BASIS_ICONS: Record<BasisId, typeof Aperture> = {
  register: Blend,
  domain: Layers,
  reading: Lightbulb,
}

/* ------------------------------------------------------------------ pieces */

function Readout({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: `1px solid ${GRID}`,
        borderRadius: 8,
        padding: '0.5rem 0.7rem',
        minWidth: 92,
      }}
    >
      <div style={{ fontSize: '0.58rem', letterSpacing: '0.09em', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: tone || INK, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.62rem', color: MUTED, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function Swatch({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }}
    />
  )
}

/** Amplitude as a bar. Always beside the number and the label — the bar is the
 *  quick read, the number is the actual claim. */
function AmplitudeBar({ angle }: { angle: Angle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: GRID, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(angle.amplitude * 100)}%`, height: '100%', background: angle.color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: '0.62rem', color: MUTED, fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>
        {Math.round(angle.amplitude * 100)}%
      </span>
    </div>
  )
}

function Notice({ tone, icon: Ico, title, children }: { tone: string; icon: typeof Aperture; title: string; children: React.ReactNode }) {
  return (
    <div
      role={tone === CRITICAL ? 'alert' : undefined}
      style={{
        display: 'flex',
        gap: '0.6rem',
        alignItems: 'flex-start',
        background: 'var(--bg-secondary)',
        border: `1px solid ${tone}55`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 8,
        padding: '0.7rem 0.85rem',
      }}
    >
      <Ico size={15} color={tone} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: INK, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------- superimposed view */

/**
 * The advanced surface. Four answers stacked in the same box, drifting, blended.
 *
 * It is deliberately unreadable — that is the honest picture of four live
 * trajectories, and making it tidy would be making it a menu again. Because it is
 * unreadable it is also `aria-hidden`, and the same text is published underneath
 * as a proper heading-and-paragraph list. Focusing or hovering a branch lifts it
 * clear of the others, so isolating a branch never requires a pointer.
 */
function SuperimposedPanel({
  sp,
  focused,
  onFocus,
}: {
  sp: Superposition
  focused: string | null
  onFocus: (key: string | null) => void
}) {
  const locked = sp.state === 'collapsed'
  return (
    <div>
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          minHeight: 260,
          borderRadius: 10,
          border: `1px solid ${GRID}`,
          background: 'linear-gradient(160deg, #14141f 0%, #191926 100%)',
          padding: '1.1rem 1.2rem',
          overflow: 'hidden',
        }}
      >
        {/* A sweep across the glass while the state is still undetermined. */}
        {!locked && (
          <div
            className="spr-sweep"
            style={{
              position: 'absolute',
              inset: '0 auto 0 -30%',
              width: '18%',
              background: `linear-gradient(90deg, transparent, ${GLASS}14, transparent)`,
              pointerEvents: 'none',
            }}
          />
        )}
        {sp.angles.map((a, i) => {
          const isFocused = focused === a.key
          const isChosen = sp.collapsedKey === a.key
          const dimmed = (focused && !isFocused) || (locked && !isChosen && !focused)
          const base = 0.32 + a.amplitude * 0.5
          return (
            <p
              key={a.key}
              className={locked || isFocused ? 'spr-locked' : 'spr-ghost'}
              style={{
                position: 'absolute',
                inset: '1.1rem 1.2rem',
                margin: 0,
                color: a.color,
                mixBlendMode: isFocused || isChosen ? 'normal' : 'screen',
                opacity: isFocused || isChosen ? 1 : dimmed ? 0.09 : base,
                fontSize: '0.84rem',
                lineHeight: 1.62,
                letterSpacing: '0.005em',
                transition: 'opacity 260ms ease',
                animationDelay: `${i * 0.7}s`,
              }}
            >
              {a.text}
            </p>
          )
        })}
      </div>

      <p style={{ fontSize: '0.68rem', color: MUTED, margin: '0.55rem 0 0', lineHeight: 1.55 }}>
        {locked
          ? 'Locked. The chosen branch is legible; the others are still here, greyed, and still selectable.'
          : 'Four answers occupying the same space. It is not meant to be readable — hold a branch below to lift it out, or choose one to collapse the rest into ghosts.'}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
        {sp.angles.map((a) => {
          const on = focused === a.key
          return (
            <button
              key={a.key}
              type="button"
              onMouseEnter={() => onFocus(a.key)}
              onMouseLeave={() => onFocus(null)}
              onFocus={() => onFocus(a.key)}
              onBlur={() => onFocus(null)}
              onClick={() => onFocus(on ? null : a.key)}
              aria-pressed={on}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.6rem',
                borderRadius: 999,
                border: `1px solid ${on ? a.color : GRID}`,
                background: on ? `${a.color}1f` : 'var(--bg-secondary)',
                color: INK,
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Swatch color={a.color} />
              Hold {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- angle cards */

function AngleCard({
  angle,
  active,
  locked,
  onCollapse,
  busy,
}: {
  angle: Angle
  active: boolean
  locked: boolean
  onCollapse: () => void
  busy: boolean
}) {
  return (
    <article
      style={{
        border: `1px solid ${active ? angle.color : GRID}`,
        background: active ? `${angle.color}12` : 'var(--bg-card)',
        borderRadius: 10,
        padding: '0.75rem 0.85rem',
        opacity: locked && !active ? 0.62 : 1,
        transition: 'opacity 200ms ease, border-color 200ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.15rem' }}>
        <Swatch color={angle.color} size={10} />
        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: INK }}>{angle.label}</h4>
        {active && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 700, color: angle.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <Check size={11} aria-hidden="true" /> Measured
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.64rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.45rem' }}>
        {angle.domain}
      </div>
      <AmplitudeBar angle={angle} />
      {angle.rationale && (
        <p style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0.5rem 0 0' }}>{angle.rationale}</p>
      )}
      <p style={{ fontSize: '0.76rem', color: INK, lineHeight: 1.62, margin: '0.5rem 0 0.6rem' }}>{angle.text}</p>
      <button
        type="button"
        onClick={onCollapse}
        disabled={busy}
        style={{
          width: '100%',
          padding: '0.42rem 0.6rem',
          borderRadius: 7,
          border: `1px solid ${angle.color}`,
          background: active ? angle.color : `${angle.color}1a`,
          color: active ? '#12121c' : INK,
          fontSize: '0.72rem',
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {active ? `Held: ${angle.label}` : locked ? `Re-measure into ${angle.label}` : `Lean into ${angle.label}`}
      </button>
    </article>
  )
}

/* ------------------------------------------------------------ mind palace */

function MindPalace({
  angles,
  basis,
  collapsedKey,
  substrate,
  tier,
  gravity,
  onTier,
  onGravity,
  seed,
}: {
  angles: Angle[]
  basis: BasisId
  collapsedKey: string | null
  substrate: Substrate
  tier: Tier
  gravity: number
  onTier: (t: Tier) => void
  onGravity: (g: number) => void
  seed: string
}) {
  const [picked, setPicked] = useState<string | null>(null)

  const palace = useMemo(
    () => buildPalace({ tier, basis, angles, collapsedKey, gravity, substrate, seed }),
    [tier, basis, angles, collapsedKey, gravity, substrate, seed],
  )

  // A node that vanished under a tier change should not keep its detail panel open.
  const selected = palace.nodes.find((n) => n.id === picked) ?? null

  // Which labels actually fit. Everything else stays reachable by hover, by
  // keyboard, and in the detail panel — see placeLabels in the kernel.
  const labelled = useMemo(() => placeLabels(palace.nodes), [palace])
  const hasRooms = palace.nodes.some((n) => n.kind === 'room')
  const meta = TIER_META[tier]
  const idx = tierIndex(tier)

  const legendAngles = palace.nodes
    .filter((n) => n.kind === 'wing' || n.kind === 'ray')
    .map((n) => ({ key: n.angleKey!, label: n.label.replace(/ wing$/, ''), color: n.color, unbuilt: n.unbuilt }))

  return (
    <section
      aria-label="Mind Palace Prism"
      style={{ background: 'var(--bg-card)', border: `1px solid ${GRID}`, borderRadius: 12, padding: '0.95rem' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
        <Brain size={16} color={GLASS} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: INK }}>Mind Palace Prism</h2>
        {(() => {
          const TierIcon = TIER_ICONS[tier]
          return <TierIcon size={14} color={MUTED} aria-hidden="true" style={{ marginLeft: 'auto' }} />
        })()}
      </header>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Readout label="Tier" value={meta.label} sub={meta.sub} />
        <Readout
          label="Nodes"
          value={String(palace.nodes.length)}
          sub={`floor ${PALACE_FLOOR[tier]}`}
          tone={palace.nodes.length >= PALACE_FLOOR[tier] ? INK : CRITICAL}
        />
        <Readout
          label="Tension"
          value={`${Math.round(gravity * 100)}%`}
          sub={collapsedKey ? 'toward the measured wing' : 'toward the glass'}
        />
      </div>

      <p style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 0.75rem' }}>{meta.desc}</p>

      {/* Focus level */}
      <div style={{ marginBottom: '0.7rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.35rem' }}>
          Focus level
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <button
            type="button"
            onClick={() => onTier(stepTier(tier, -1))}
            disabled={idx === 0}
            aria-label="Zoom out one tier"
            style={{
              width: 28, height: 28, borderRadius: 7, border: `1px solid ${GRID}`,
              background: 'var(--bg-secondary)', color: idx === 0 ? '#4a4a63' : INK,
              cursor: idx === 0 ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <div role="group" aria-label="Palace tier" style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
            {TIERS.map((t) => {
              const on = t === tier
              const Ico = TIER_ICONS[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTier(t)}
                  aria-pressed={on}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                    padding: '0.35rem 0.2rem', borderRadius: 7,
                    border: `1px solid ${on ? GLASS : GRID}`,
                    background: on ? `${GLASS}1f` : 'var(--bg-secondary)',
                    color: on ? INK : MUTED, fontSize: '0.64rem', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <Ico size={12} aria-hidden="true" />
                  {TIER_META[t].label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => onTier(stepTier(tier, 1))}
            disabled={idx === TIERS.length - 1}
            aria-label="Zoom in one tier"
            style={{
              width: 28, height: 28, borderRadius: 7, border: `1px solid ${GRID}`,
              background: 'var(--bg-secondary)', color: idx === TIERS.length - 1 ? '#4a4a63' : INK,
              cursor: idx === TIERS.length - 1 ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Tension */}
      <div style={{ marginBottom: '0.8rem' }}>
        <label
          htmlFor="spr-gravity"
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.3rem' }}
        >
          <Gauge size={12} aria-hidden="true" /> Gravity / tension
        </label>
        <input
          id="spr-gravity"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(gravity * 100)}
          onChange={(e) => onGravity(Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: GLASS }}
        />
        <p style={{ fontSize: '0.66rem', color: MUTED, margin: '0.2rem 0 0', lineHeight: 1.5 }}>
          {gravity < 0.05
            ? 'Slack. The palace is fully dispersed — every wing keeps its own ground.'
            : collapsedKey
              ? 'The unchosen wings are conceding toward the branch you measured. The measured one barely moves.'
              : 'Nothing measured yet, so the whole palace draws toward the glass rather than toward a wing.'}
        </p>
      </div>

      {/* Legend — identity is never the hue alone, but the hue still needs a key. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.7rem', marginBottom: '0.5rem' }}>
        {legendAngles.map((l) => (
          <span key={l.key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.64rem', color: l.unbuilt ? MUTED : 'var(--text-secondary)' }}>
            <Swatch color={l.color} size={8} />
            {l.label}
            {l.unbuilt && <span style={{ color: MUTED }}>(unbuilt)</span>}
          </span>
        ))}
      </div>

      <svg
        viewBox="-3 -4 106 112"
        role="img"
        aria-label={`${meta.label} tier of the mind palace, ${palace.nodes.length} nodes${palace.unbuilt ? ', unfurnished' : ''}`}
        style={{ width: '100%', aspectRatio: '1 / 0.82', background: '#12121c', border: `1px solid ${GRID}`, borderRadius: 9, display: 'block' }}
      >
        {palace.edges.map((e, i) => {
          const a = palace.nodes.find((n) => n.id === e.from)
          const b = palace.nodes.find((n) => n.id === e.to)
          if (!a || !b) return null
          return (
            <line
              key={i}
              className="spr-link"
              x1={a.x * 100}
              y1={a.y * 100}
              x2={b.x * 100}
              y2={b.y * 100}
              stroke={palace.unbuilt ? GRID : `${e.color}55`}
              strokeWidth={0.35}
            />
          )
        })}

        {palace.nodes.map((n) => {
          const isSel = n.id === picked
          const isMeasured = collapsedKey != null && n.angleKey === collapsedKey
          const r = Math.max(0.9, n.r * 100)
          const ord = r >= 1.8 ? roomOrdinal(n) : null
          return (
            <g
              key={n.id}
              tabIndex={0}
              role="button"
              aria-label={`${n.label}. ${n.detail}`}
              onClick={() => setPicked(isSel ? null : n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPicked(isSel ? null : n.id)
                }
              }}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              {isMeasured && n.kind !== 'drawer' && (
                <circle className="spr-ring" cx={n.x * 100} cy={n.y * 100} r={r + 1.4} fill="none" stroke={n.color} strokeWidth={0.4} />
              )}
              <circle
                className="spr-node"
                cx={n.x * 100}
                cy={n.y * 100}
                r={r + (isSel ? 1.6 : 0)}
                fill={n.unbuilt ? '#12121c' : n.kind === 'prism' ? `${GLASS}33` : `${n.color}2e`}
                stroke={n.unbuilt ? CONNECT : n.color}
                strokeWidth={isSel ? 0.9 : n.kind === 'wing' || n.kind === 'prism' ? 0.7 : 0.45}
                strokeDasharray={n.unbuilt ? '1.2 1' : undefined}
              />
              {/* Only the labels the placement pass could fit without a collision
                  or an overflow. A dropped label costs a glance, never the fact —
                  the node keeps its title, its focus stop and its detail panel. */}
              {labelled.has(n.id) && (
                <text
                  x={n.x * 100}
                  y={labelY(n)}
                  textAnchor={labelAnchor(n)}
                  fill={n.unbuilt ? MUTED : INK}
                  fontSize={labelFontSize(n.kind)}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {n.label}
                </text>
              )}
              {/* Rooms carry a number rather than a name — sixteen names cannot
                  share this box, but sixteen numbers plus one key can. */}
              {ord != null && (
                <text
                  x={n.x * 100}
                  y={n.y * 100 + 0.8}
                  textAnchor="middle"
                  fill={n.unbuilt ? MUTED : INK}
                  fontSize={2.3}
                  fontWeight={700}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {ord}
                </text>
              )}
              <title>{`${n.label} — ${n.detail}`}</title>
            </g>
          )
        })}
      </svg>

      {hasRooms && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.7rem', marginTop: '0.45rem' }}>
          {ROOM_SLOTS.map((slot, i) => (
            <span key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: '0.28rem', fontSize: '0.63rem', color: 'var(--text-secondary)' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 13, height: 13, borderRadius: 999, border: `1px solid ${GRID}`, background: 'var(--bg-secondary)',
                  fontSize: '0.55rem', fontWeight: 700, color: INK, display: 'grid', placeItems: 'center', flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              {slot.label}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: '0.55rem',
          minHeight: 62,
          background: 'var(--bg-secondary)',
          border: `1px solid ${GRID}`,
          borderRadius: 8,
          padding: '0.6rem 0.7rem',
        }}
      >
        {selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
              <Swatch color={selected.color} size={8} />
              <strong style={{ fontSize: '0.75rem', color: INK }}>{selected.label}</strong>
              <span style={{ fontSize: '0.6rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{selected.kind}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{selected.detail}</p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '0.71rem', color: MUTED, lineHeight: 1.55 }}>
            {palace.unbuilt
              ? 'The architecture is drawn but unfurnished — no prompt has passed through the glass yet. Disperse one and the drawers fill with the sentences that were actually written.'
              : 'Select a node — click it, or tab to it and press Enter — to read what is filed there.'}
          </p>
        )}
      </div>

      <p style={{ fontSize: '0.65rem', color: MUTED, margin: '0.5rem 0 0', lineHeight: 1.55 }}>
        Wings → rooms → drawers is the Method of Loci: the answer stops being a scroll position and becomes somewhere you can walk back to. Every wing
        holds the same four rooms —{' '}
        {ROOM_SLOTS.map((r) => r.label).join(', ').toLowerCase()} — in the same order and numbered the same way, so the same question is always in the
        same place and room 3 is the objection wherever you are standing.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------- the loop */

function LoopStrip({ sp, substrate, angles }: { sp: Superposition | null; substrate: Substrate; angles: Angle[] }) {
  const disp = sp ? dispersion(sp.angles) : 0
  const measures = sp?.measurements.length ?? 0
  const filed = Object.values(substrate).reduce((s, n) => s + n, 0)
  const climbing = climbTargets(substrate)
  const nameOf = (k: string) => angles.find((a) => a.key === k)?.label ?? k

  const values: Record<string, string> = {
    dispersion: sp ? `${Math.round(disp * 100)}% spread` : 'no beam yet',
    collapse: measures ? `${measures} measurement${measures === 1 ? '' : 's'}` : 'awaiting you',
    ingestion: filed ? `${filed} filed` : 'nothing filed',
    adaptation: climbing.length ? `climbing ${climbing.map(nameOf).join(', ')}` : 'no lane at threshold',
  }

  return (
    <section
      aria-label="The symbiotic loop"
      style={{ background: 'var(--bg-card)', border: `1px solid ${GRID}`, borderRadius: 12, padding: '0.95rem' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
        <Repeat size={15} color={GLASS} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: INK }}>The loop</h2>
      </header>
      <p style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 0.8rem' }}>
        Doorways of potential: the model climbs an elevated branch, the climb elevates you, and what you choose next feeds back down. Neither side is
        the author on its own.
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' }}>
        {LOOP_STAGES.map((s, i) => {
          const Ico = LOOP_ICONS[s.id] ?? CircleDot
          const tone = s.who === 'human' ? '#e0a52b' : s.who === 'ai' ? '#3987e5' : CONNECT
          return (
            <li
              key={s.id}
              style={{
                display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                background: 'var(--bg-secondary)', border: `1px solid ${GRID}`,
                borderLeft: `3px solid ${tone}`, borderRadius: 8, padding: '0.55rem 0.7rem',
              }}
            >
              <Ico size={14} color={tone} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.75rem', color: INK }}>
                    {i + 1}. {s.label}
                  </strong>
                  <span style={{ fontSize: '0.65rem', color: tone, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{values[s.id]}</span>
                </div>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <div style={{ marginTop: '0.8rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.4rem' }}>
          Substrate mass
        </div>
        {Object.keys(substrate).length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.7rem', color: MUTED, lineHeight: 1.5 }}>
            Empty. Mass only ever arrives from a choice you made — nothing here is seeded, inferred, or set by the model.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
            {Object.entries(substrate)
              .sort((a, b) => b[1] - a[1])
              .map(([k, m]) => {
                const colour = angles.find((a) => a.key === k)?.color ?? CONNECT
                return (
                  <li key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Swatch color={colour} size={8} />
                    <span style={{ fontSize: '0.7rem', color: INK, minWidth: 88 }}>{nameOf(k)}</span>
                    <div style={{ flex: 1, height: 4, background: GRID, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${relativeMass(substrate, k) * 100}%`, height: '100%', background: colour }} />
                    </div>
                    <span style={{ fontSize: '0.64rem', color: MUTED, fontVariantNumeric: 'tabular-nums', minWidth: 16, textAlign: 'right' }}>{m}</span>
                  </li>
                )
              })}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ page */

function SprPage() {
  const [sessionId, setSessionId] = useState('')
  const [basis, setBasis] = useState<BasisId>('register')
  const [tier, setTier] = useState<Tier>('prism')
  const [gravity, setGravity] = useState(0)
  const [substrate, setSubstrate] = useState<Substrate>({})
  const [history, setHistory] = useState<Superposition[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const [prompt, setPrompt] = useState('')
  const [view, setView] = useState<'default' | 'advanced'>('advanced')
  const [sprOn, setSprOn] = useState(true)
  const [focused, setFocused] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [dispersing, setDispersing] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [error, setError] = useState('')
  const [degraded, setDegraded] = useState(false)

  const gravityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSessionId(getSessionId())
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/spr?session=${encodeURIComponent(sessionId)}`)
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        if (!alive) return
        setBasis(data.session?.basis ?? 'register')
        setTier(data.session?.tier ?? 'prism')
        setGravity(Number(data.session?.gravity) || 0)
        setSubstrate(data.session?.substrate ?? {})
        setHistory(Array.isArray(data.superpositions) ? data.superpositions : [])
        setActiveId(data.superpositions?.[0]?.id ?? null)
        setDegraded(!!data.degraded)
      } catch {
        // The page is fully usable without the store; only the memory is lost.
        if (alive) setDegraded(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [sessionId])

  const active = history.find((h) => h.id === activeId) ?? null
  const activeBasis = getBasis(active?.basis ?? basis) ?? BASES[0]
  const weight = promptWeight(prompt)

  const saveControls = useCallback(
    (patch: { basis?: BasisId; tier?: Tier; gravity?: number }) => {
      if (!sessionId) return
      fetch('/api/spr', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...patch }),
      })
        .then((r) => r.json())
        .then((d) => setDegraded((prev) => prev || !!d?.degraded))
        .catch(() => setDegraded(true))
    },
    [sessionId],
  )

  const onTier = useCallback(
    (t: Tier) => {
      setTier(t)
      saveControls({ tier: t })
    },
    [saveControls],
  )

  // The slider fires continuously; the store hears the value it landed on.
  const onGravity = useCallback(
    (g: number) => {
      setGravity(g)
      if (gravityTimer.current) clearTimeout(gravityTimer.current)
      gravityTimer.current = setTimeout(() => saveControls({ gravity: g }), 400)
    },
    [saveControls],
  )

  const onBasis = useCallback(
    (b: BasisId) => {
      setBasis(b)
      saveControls({ basis: b })
    },
    [saveControls],
  )

  const disperse = useCallback(async () => {
    const text = prompt.trim()
    if (!text || dispersing) return
    setDispersing(true)
    setError('')
    try {
      const res = await fetch('/api/spr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, prompt: text, basis }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'The dispersion could not be run right now.')
        return
      }
      setHistory((h) => [data.superposition, ...h].slice(0, 40))
      setActiveId(data.superposition.id)
      setFocused(null)
      setPrompt('')
      setDegraded((prev) => prev || !!data.degraded)
    } catch {
      setError('The dispersion could not be reached. Nothing was filed.')
    } finally {
      setDispersing(false)
    }
  }, [prompt, dispersing, sessionId, basis])

  const measure = useCallback(
    async (key: string) => {
      if (!active || measuring) return
      setMeasuring(true)
      // The collapse is applied locally first so the page never waits to answer a
      // click; the server result replaces it when it lands, and if the store is
      // down the local collapse still stands — it just teaches the loop nothing.
      const local = collapse(active, key, Date.now())
      setHistory((h) => h.map((s) => (s.id === local.id ? local : s)))
      setFocused(null)
      try {
        const res = await fetch('/api/spr', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, superpositionId: active.id, angleKey: key }),
        })
        const data = await res.json()
        if (data?.collapsed) {
          setHistory((h) => h.map((s) => (s.id === data.superposition.id ? data.superposition : s)))
          setSubstrate(data.substrate ?? {})
        } else {
          setDegraded(true)
        }
      } catch {
        setDegraded(true)
      } finally {
        setMeasuring(false)
      }
    },
    [active, measuring, sessionId],
  )

  const clearAll = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/spr?session=${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
      if (res.status !== 204) {
        setDegraded(true)
        return
      }
      setHistory([])
      setActiveId(null)
      setSubstrate({})
    } catch {
      setDegraded(true)
    }
  }, [sessionId])

  const dominant = active ? [...active.angles].sort((a, b) => b.amplitude - a.amplitude)[0] : null
  const shown = active ? active.angles.find((a) => a.key === active.collapsedKey) ?? dominant : null
  const stateLabel = !active ? 'No beam' : active.state === 'collapsed' ? 'Collapsed' : 'Superposition'
  const disp = active ? dispersion(active.angles) : 0

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-primary)', padding: '1.5rem 1.5rem 3rem' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* ------------------------------------------------------- header */}
        <header style={{ marginBottom: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
            <Aperture size={22} color={GLASS} aria-hidden="true" />
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>SPR</h1>
            <span style={{ fontSize: '0.72rem', color: MUTED, fontWeight: 600 }}>Super Position Responses</span>
            <span
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem',
                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                color: active?.state === 'collapsed' ? MUTED : GLASS,
                border: `1px solid ${active?.state === 'collapsed' ? GRID : `${GLASS}66`}`,
                background: active?.state === 'collapsed' ? 'var(--bg-secondary)' : `${GLASS}14`,
                borderRadius: 999, padding: '0.3rem 0.7rem',
              }}
            >
              {active?.state === 'collapsed' ? (
                <>
                  <Check size={12} aria-hidden="true" /> Collapsed state lock
                </>
              ) : (
                <>
                  <span className={active ? 'spr-live' : undefined} style={{ display: 'inline-flex' }}>
                    <Sparkles size={12} aria-hidden="true" />
                  </span>
                  Superposition active
                </>
              )}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 900 }}>
            A chat mode that does not choose for you. One prompt is dispersed into four complete answers held in tension; your reading of them is the
            measurement that makes one real. The rest stay on the page — which is why nothing here needs a Regenerate button.
          </p>
        </header>

        {degraded && (
          <div style={{ marginBottom: '0.9rem' }}>
            <Notice tone={WARNING} icon={TriangleAlert} title="The palace store is unreachable">
              Dispersion still runs and a collapse still holds on this page, but nothing is being filed. The substrate will not gain mass from this
              session, so the loop is not learning and the climb will not trigger. Reload once the database is back to pick the palace up where it was.
            </Notice>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '0.9rem' }}>
            <Notice tone={CRITICAL} icon={TriangleAlert} title="Dispersion failed">
              {error}
            </Notice>
          </div>
        )}

        <div
          className="spr-grid"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(290px, 340px) minmax(420px, 1fr) minmax(320px, 400px)', gap: '1rem', alignItems: 'start' }}
        >
          {/* --------------------------------------------------- left rail */}
          <div style={{ display: 'grid', gap: '1rem' }}>
            <section style={{ background: 'var(--bg-card)', border: `1px solid ${GRID}`, borderRadius: 12, padding: '0.95rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.55rem' }}>
                <Split size={15} color={GLASS} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: INK }}>Dispersion axis</h2>
              </div>
              <div role="radiogroup" aria-label="Dispersion axis" style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.65rem' }}>
                {BASES.map((b) => {
                  const on = b.id === basis
                  const Ico = BASIS_ICONS[b.id]
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onBasis(b.id)}
                      style={{
                        textAlign: 'left', padding: '0.55rem 0.65rem', borderRadius: 8,
                        border: `1px solid ${on ? GLASS : GRID}`,
                        background: on ? `${GLASS}14` : 'var(--bg-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Ico size={13} color={on ? GLASS : MUTED} aria-hidden="true" />
                        <strong style={{ fontSize: '0.76rem', color: INK }}>{b.label}</strong>
                        <span style={{ fontSize: '0.63rem', color: MUTED }}>{b.axis}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: '0.69rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.25rem' }}>
                        {b.blurb}
                      </span>
                    </button>
                  )
                })}
              </div>

              <label htmlFor="spr-prompt" style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.3rem' }}>
                The beam
              </label>
              <textarea
                id="spr-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) disperse()
                }}
                rows={4}
                placeholder="Ask anything. A thin prompt still disperses — it just disperses wider."
                style={{
                  width: '100%', resize: 'vertical', padding: '0.6rem 0.7rem', borderRadius: 8,
                  border: `1px solid ${GRID}`, background: 'var(--bg-secondary)', color: INK,
                  fontSize: '0.8rem', lineHeight: 1.55, fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.45rem 0 0.6rem' }}>
                <span style={{ fontSize: '0.62rem', color: MUTED, whiteSpace: 'nowrap' }}>Prompt weight</span>
                <div style={{ flex: 1, height: 3, background: GRID, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(weight * 100)}%`, height: '100%', background: CONNECT }} />
                </div>
                <span style={{ fontSize: '0.62rem', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{Math.round(weight * 100)}%</span>
              </div>
              <p style={{ fontSize: '0.66rem', color: MUTED, margin: '0 0 0.6rem', lineHeight: 1.5 }}>
                Weight is shown, not enforced. A light prompt produces a wider spread rather than a worse answer — that is the whole cure for the blank
                page.
              </p>
              <button
                type="button"
                onClick={disperse}
                disabled={!prompt.trim() || dispersing}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  padding: '0.6rem', borderRadius: 8, border: 'none',
                  background: !prompt.trim() || dispersing ? GRID : GLASS,
                  color: !prompt.trim() || dispersing ? MUTED : '#14141f',
                  fontSize: '0.8rem', fontWeight: 700,
                  cursor: !prompt.trim() || dispersing ? 'not-allowed' : 'pointer',
                }}
              >
                {dispersing ? (
                  <>
                    <Loader2 size={14} className="spin" aria-hidden="true" /> Dispersing…
                  </>
                ) : (
                  <>
                    <Send size={14} aria-hidden="true" /> Disperse
                  </>
                )}
              </button>
              <p style={{ fontSize: '0.63rem', color: MUTED, margin: '0.4rem 0 0', textAlign: 'center' }}>⌘/Ctrl + Enter</p>
            </section>

            <section style={{ background: 'var(--bg-card)', border: `1px solid ${GRID}`, borderRadius: 12, padding: '0.95rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.55rem' }}>
                <ScanLine size={15} color={GLASS} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: INK }}>Beams</h2>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    title="Clear this palace"
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: `1px solid ${GRID}`, borderRadius: 6, color: MUTED, fontSize: '0.63rem', padding: '0.2rem 0.45rem', cursor: 'pointer' }}
                  >
                    <Trash2 size={11} aria-hidden="true" /> Clear
                  </button>
                )}
              </div>
              {loading ? (
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ height: 42, borderRadius: 8, background: 'var(--bg-secondary)', border: `1px solid ${GRID}`, opacity: 0.5 }} />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.71rem', color: MUTED, lineHeight: 1.55 }}>
                  Nothing has passed through the glass yet. The palace on the right is already drawn — it is just unfurnished.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem', maxHeight: 320, overflowY: 'auto' }}>
                  {history.map((h) => {
                    const on = h.id === activeId
                    const chosen = h.angles.find((a) => a.key === h.collapsedKey)
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(h.id)
                            setFocused(null)
                          }}
                          aria-current={on ? 'true' : undefined}
                          style={{
                            width: '100%', textAlign: 'left', padding: '0.45rem 0.55rem', borderRadius: 7,
                            border: `1px solid ${on ? GLASS : GRID}`,
                            background: on ? `${GLASS}12` : 'var(--bg-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ display: 'block', fontSize: '0.72rem', color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.prompt || '(empty prompt)'}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.62rem', color: MUTED, marginTop: 2 }}>
                            {chosen ? (
                              <>
                                <Swatch color={chosen.color} size={7} /> {chosen.label}
                              </>
                            ) : (
                              <>
                                <Sparkles size={10} aria-hidden="true" /> uncollapsed
                              </>
                            )}
                            <span style={{ marginLeft: 'auto' }}>{getBasis(h.basis)?.label}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* ------------------------------------------------------ centre */}
          <div style={{ display: 'grid', gap: '1rem' }}>
            <section style={{ background: 'var(--bg-card)', border: `1px solid ${GRID}`, borderRadius: 12, padding: '0.95rem' }}>
              {/* Mode strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                <Readout label="Active mode" value={sprOn ? 'SPR' : 'Legacy'} sub={sprOn ? activeBasis.label : 'monolithic'} tone={sprOn ? GLASS : MUTED} />
                <Readout label="State" value={stateLabel} sub={active ? `${active.angles.length} branches` : 'awaiting a beam'} />
                <Readout label="Spread" value={active ? `${Math.round(disp * 100)}%` : '—'} sub={active ? (disp > 0.85 ? 'evenly live' : disp > 0.5 ? 'leaning' : 'one dominant') : 'no beam'} />

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sprOn}
                    onClick={() => setSprOn((v) => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem',
                      borderRadius: 999, border: `1px solid ${sprOn ? GLASS : GRID}`,
                      background: sprOn ? `${GLASS}1a` : 'var(--bg-secondary)', color: INK,
                      fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ width: 24, height: 13, borderRadius: 999, background: sprOn ? GLASS : GRID, position: 'relative', flexShrink: 0 }}
                    >
                      <span style={{ position: 'absolute', top: 2, left: sprOn ? 13 : 2, width: 9, height: 9, borderRadius: 999, background: '#14141f', transition: 'left 160ms ease' }} />
                    </span>
                    SPR mode
                  </button>
                  {sprOn && (
                    <div role="group" aria-label="Response surface" style={{ display: 'flex', border: `1px solid ${GRID}`, borderRadius: 7, overflow: 'hidden' }}>
                      {(['default', 'advanced'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setView(v)}
                          aria-pressed={view === v}
                          style={{
                            padding: '0.35rem 0.6rem', border: 'none',
                            background: view === v ? `${GLASS}1f` : 'transparent',
                            color: view === v ? INK : MUTED, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          {v === 'default' ? 'Default' : 'Advanced'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {loading ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <div style={{ height: 220, borderRadius: 10, background: 'var(--bg-secondary)', border: `1px solid ${GRID}`, opacity: 0.5 }} />
                  <div style={{ height: 90, borderRadius: 10, background: 'var(--bg-secondary)', border: `1px solid ${GRID}`, opacity: 0.35 }} />
                </div>
              ) : !active ? (
                <div style={{ padding: '2.2rem 1rem', textAlign: 'center', border: `1px dashed ${GRID}`, borderRadius: 10 }}>
                  <Aperture size={26} color={CONNECT} aria-hidden="true" />
                  <p style={{ fontSize: '0.85rem', color: INK, fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>The glass is clear</p>
                  <p style={{ fontSize: '0.74rem', color: MUTED, margin: 0, lineHeight: 1.6, maxWidth: 420, marginInline: 'auto' }}>
                    Send a beam from the left. You will get four complete answers at once rather than one, and none of them is chosen until you choose
                    it.
                  </p>
                </div>
              ) : !sprOn ? (
                /* ------------------------------------------------ legacy */
                <div className="spr-settle">
                  <div style={{ border: `1px solid ${GRID}`, borderRadius: 10, background: 'var(--bg-secondary)', padding: '1rem 1.1rem' }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.5rem' }}>
                      Monolithic LLM response
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: INK, lineHeight: 1.68 }}>{shown?.text}</p>
                  </div>
                  <div style={{ marginTop: '0.7rem' }}>
                    <Notice tone={CONNECT} icon={GitBranch} title="Three answers are being withheld from you right now">
                      This is not a second call to the model. It is the same dispersion with the other branches hidden — which is precisely what an
                      ordinary chat does every time, without mentioning it. The one you are reading is{' '}
                      <strong style={{ color: INK }}>{shown?.label}</strong> at {Math.round((shown?.amplitude ?? 0) * 100)}% amplitude, picked because it
                      scored highest. Switch SPR back on to see what was cut.
                    </Notice>
                  </div>
                </div>
              ) : view === 'advanced' ? (
                /* ---------------------------------------------- advanced */
                <div className="spr-settle">
                  <SuperimposedPanel sp={active} focused={focused} onFocus={setFocused} />
                  <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.9rem' }}>
                    {active.angles.map((a) => (
                      <AngleCard
                        key={a.key}
                        angle={a}
                        active={active.collapsedKey === a.key}
                        locked={active.state === 'collapsed'}
                        busy={measuring}
                        onCollapse={() => measure(a.key)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* ----------------------------------------------- default */
                <div className="spr-settle" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(210px, 270px)', gap: '0.85rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      {shown && <Swatch color={shown.color} size={10} />}
                      <strong style={{ fontSize: '0.82rem', color: INK }}>{shown?.label}</strong>
                      <span style={{ fontSize: '0.64rem', color: MUTED }}>{shown?.domain}</span>
                      {active.state !== 'collapsed' && (
                        <span style={{ fontSize: '0.6rem', color: MUTED, marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          previewing the strongest
                        </span>
                      )}
                    </div>
                    <div style={{ border: `1px solid ${shown ? `${shown.color}44` : GRID}`, borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.9rem 1rem' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: INK, lineHeight: 1.68 }}>{shown?.text}</p>
                    </div>
                    {shown && (
                      <button
                        type="button"
                        onClick={() => measure(shown.key)}
                        disabled={measuring || active.collapsedKey === shown.key}
                        style={{
                          marginTop: '0.6rem', padding: '0.45rem 0.8rem', borderRadius: 7,
                          border: `1px solid ${shown.color}`,
                          background: active.collapsedKey === shown.key ? shown.color : `${shown.color}1a`,
                          color: active.collapsedKey === shown.key ? '#12121c' : INK,
                          fontSize: '0.73rem', fontWeight: 700,
                          cursor: active.collapsedKey === shown.key ? 'default' : 'pointer',
                        }}
                      >
                        {active.collapsedKey === shown.key ? `Held: ${shown.label}` : `Lean into ${shown.label}`}
                      </button>
                    )}
                  </div>

                  <aside aria-label="Alternate angles">
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.4rem' }}>
                      Alternate angles
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem', maxHeight: 460, overflowY: 'auto' }}>
                      {active.angles.map((a) => {
                        const on = shown?.key === a.key
                        return (
                          <li key={a.key}>
                            <button
                              type="button"
                              onClick={() => measure(a.key)}
                              disabled={measuring}
                              style={{
                                width: '100%', textAlign: 'left', padding: '0.55rem 0.6rem', borderRadius: 8,
                                border: `1px solid ${on ? a.color : GRID}`,
                                background: on ? `${a.color}14` : 'var(--bg-secondary)',
                                cursor: measuring ? 'wait' : 'pointer',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Swatch color={a.color} size={8} />
                                <strong style={{ fontSize: '0.73rem', color: INK }}>{a.label}</strong>
                              </span>
                              <span style={{ display: 'block', fontSize: '0.6rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.15rem 0 0.3rem' }}>
                                {a.domain}
                              </span>
                              <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                {a.rationale || a.text.slice(0, 90)}
                              </span>
                              <span style={{ display: 'block', marginTop: '0.35rem' }}>
                                <AmplitudeBar angle={a} />
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    <p style={{ fontSize: '0.64rem', color: MUTED, margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                      Already written, already here. Nothing to regenerate.
                    </p>
                  </aside>
                </div>
              )}
            </section>

            {/* Ambiguity — the honesty mechanism */}
            {active?.ambiguity && (
              <section style={{ background: 'var(--bg-card)', border: `1px solid ${WARNING}44`, borderLeft: `3px solid ${WARNING}`, borderRadius: 12, padding: '0.95rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <Lightbulb size={15} color={WARNING} aria-hidden="true" />
                  <h2 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: INK }}>Which reality are we operating in?</h2>
                </div>
                <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: INK, lineHeight: 1.6 }}>{active.ambiguity.question}</p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
                  {active.ambiguity.readings.map((r) => (
                    <li key={r.key} style={{ background: 'var(--bg-secondary)', border: `1px solid ${GRID}`, borderRadius: 8, padding: '0.5rem 0.65rem' }}>
                      <strong style={{ fontSize: '0.73rem', color: INK }}>{r.label}</strong>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{r.reading}</span>
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: '0.68rem', color: MUTED, margin: '0.6rem 0 0', lineHeight: 1.55 }}>
                  A confident answer to the wrong reading is what a hallucination usually is. Naming the split costs one question and removes the whole
                  failure mode.
                </p>
              </section>
            )}

            <LoopStrip sp={active} substrate={substrate} angles={active?.angles ?? []} />
          </div>

          {/* -------------------------------------------------- right rail */}
          <div style={{ display: 'grid', gap: '1rem' }}>
            <MindPalace
              angles={active?.angles ?? []}
              basis={active?.basis ?? basis}
              collapsedKey={active?.collapsedKey ?? null}
              substrate={substrate}
              tier={tier}
              gravity={gravity}
              onTier={onTier}
              onGravity={onGravity}
              seed={active?.id ?? 'unbuilt'}
            />

            <section style={{ background: 'var(--bg-card)', border: `1px solid ${GRID}`, borderRadius: 12, padding: '0.95rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Zap size={15} color={GLASS} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: INK }}>What this mode does not do</h2>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.05rem', display: 'grid', gap: '0.4rem' }}>
                <li style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  It does not make the model right. Four honest angles on a wrong premise are four wrong answers, laid out neatly.
                </li>
                <li style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  It is not quantum anything. Superposition is the metaphor the interface is built on, not a claim about how the model computes.
                </li>
                <li style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  The substrate is not a profile. It counts your collapses in this browser session and nothing else — no identity, no cross-site
                  history, and it is cleared by the Clear button above.
                </li>
                <li style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  The climb asks the model for more altitude on a lane you keep picking. It never removes the other lanes, so a habit cannot narrow what
                  you are shown.
                </li>
              </ul>
              <p style={{ fontSize: '0.7rem', color: MUTED, margin: '0.7rem 0 0', lineHeight: 1.55 }}>
                Legacy prompting hides the mechanics and hands you a finished thing. This hands you the terminal.{' '}
                <Link to="/lattice" style={{ color: 'var(--accent-light)' }}>
                  The Dual+ Lattice
                </Link>{' '}
                does the same for how an agent developed.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/spr')({ component: SprPage })
