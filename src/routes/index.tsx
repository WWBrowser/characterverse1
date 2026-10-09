import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, CornerDownLeft, Search, X } from 'lucide-react'
import { VERSES, VERSE_BY_ID, ringPoint, type Verse, type VersePage } from '../lib/verses'
import { VerseWheelFace } from '../lib/verse-chrome'

/* ═══════════════════════════════════════════════════════ The Verse Wheel (/)
 *
 * The home page is a map, not a pitch. Seven Verses ride an orbit around the
 * core; selecting one collapses the outer ring to markers and explodes that
 * Verse's Sub-Wheel of common pages around the middle.
 *
 * Three rules hold the thing together:
 *   1. Every spoke on every wheel is a real route (see src/lib/verses.ts).
 *   2. The wheel is an *enhancement*. The link list under the wordmark and the
 *      Verse index at the foot are plain anchors, so every destination is
 *      reachable without JavaScript, without a pointer, and by a crawler.
 *   3. Nothing that moves touches layout — the orbit runs forever, so it is
 *      transform and opacity only.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Ring radii as a fraction of the (square) wheel box. */
const VERSE_RADIUS = 0.38
const PAGE_RADIUS = 0.26

/* A fixed starfield. Seeded rather than random so the server and the client
 * draw the same sky and hydration stays quiet. */
const STARS = (() => {
  let s = 20260813
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  return Array.from({ length: 74 }, () => ({
    x: rnd() * 100,
    y: rnd() * 100,
    size: 0.7 + rnd() * 1.9,
    delay: rnd() * 4,
  }))
})()

/* ------------------------------------------------------------- atmosphere */

function Backdrop() {
  return (
    <>
      <div className="vw-sky" aria-hidden>
        {STARS.map((star, i) => (
          <span
            key={i}
            className="vw-star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="vw-horizon" aria-hidden />
      <div className="vw-grain" aria-hidden />
    </>
  )
}

/* ------------------------------------------------------------- the wheel */

/**
 * Font size that keeps one word inside the core.
 *
 * The core is a circle, so a word wider than it does not wrap — it spills,
 * and a centred box that spills pushes everything after it off centre. That
 * was the drift: "CharacterVerse" is wider than the core at the old size, and
 * the longer a Verse's name, the further right its Sub-Wheel's middle sat.
 * Syne at 800 runs 0.86–0.97em a character (measured), so sizing by length
 * against the chord the word sits on keeps every name inside, however many
 * Verses — or pages — the wheel grows.
 */
function fitText(word: string, role: 'title' | 'eyebrow'): CSSProperties {
  const len = Math.max(1, word.length)
  return role === 'title'
    ? { fontSize: `${Math.min(15, 124 / len).toFixed(2)}px` }
    : { fontSize: `${Math.min(9, 112 / (len * 1.08)).toFixed(2)}px` }
}

function Wheel({
  selected,
  onSelect,
  onClear,
}: {
  selected: Verse | null
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(560)
  // Until the box has been measured the nodes sit at their estimated radius.
  // Transitions stay off for that first frame so the correction never reads as
  // a deliberate animation.
  const [measured, setMeasured] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setSize(entry.contentRect.width)
      setMeasured(true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const verseR = size * VERSE_RADIUS
  const pageR = size * PAGE_RADIUS
  const ease = measured ? undefined : 'none'

  return (
    <div className="vw-wheel" ref={box}>
      {/* Orbit, ticks and spokes. A square box means viewBox units are percent. */}
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        <circle cx="50" cy="50" r={VERSE_RADIUS * 100} fill="none" stroke="rgba(167,139,250,0.22)" strokeWidth="0.22" />
        <circle
          cx="50"
          cy="50"
          r={VERSE_RADIUS * 100 - 2.4}
          fill="none"
          stroke="rgba(167,139,250,0.1)"
          strokeWidth="0.15"
          strokeDasharray="1.4 2.2"
        />

        <g className="vw-ticks">
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2
            const inner = VERSE_RADIUS * 100 + 1.6
            const outer = inner + (i % 6 === 0 ? 2.2 : 1)
            return (
              <line
                key={i}
                x1={50 + Math.cos(a) * inner}
                y1={50 + Math.sin(a) * inner}
                x2={50 + Math.cos(a) * outer}
                y2={50 + Math.sin(a) * outer}
                stroke="rgba(167,139,250,0.3)"
                strokeWidth={i % 6 === 0 ? 0.28 : 0.13}
              />
            )
          })}
        </g>

        {/* Spokes: core to each Verse when idle, core to each page when open. */}
        {!selected &&
          VERSES.map((verse, i) => {
            const p = ringPoint(i, VERSES.length, VERSE_RADIUS * 100)
            return (
              <line
                key={verse.id}
                x1="50"
                y1="50"
                x2={p.x}
                y2={p.y}
                stroke={verse.color}
                strokeWidth="0.16"
                strokeDasharray="0.9 1.7"
                opacity="0.5"
              />
            )
          })}
        {selected &&
          selected.pages.map((page, i) => {
            const p = ringPoint(i, selected.pages.length, PAGE_RADIUS * 100)
            return (
              <line
                key={page.to + page.hash}
                x1="50"
                y1="50"
                x2={p.x}
                y2={p.y}
                stroke={selected.color}
                strokeWidth="0.2"
                strokeDasharray="0.9 1.5"
                opacity="0.65"
              />
            )
          })}
      </svg>

      <div className="vw-core-halo" aria-hidden />

      {/* The core: the words on top, the Seven Entrances mark turning beneath
       * them. The brand when idle; the open Verse when one is selected. */}
      <div className="vw-core" style={{ borderColor: selected ? `${selected.color}88` : undefined }}>
        <div className="vw-core-inner">
          {selected ? (
            <>
              {selected.wheel[1] && (
                <span className="vw-display vw-core-eyebrow" style={fitText(selected.wheel[0], 'eyebrow')}>
                  {selected.wheel[0]}
                </span>
              )}
              <span className="vw-display vw-core-title" style={{ ...fitText(selected.wheel[1] || selected.wheel[0], 'title'), color: selected.color }}>
                {selected.wheel[1] || selected.wheel[0]}
              </span>
              <span className="vw-core-mark">
                <VerseWheelFace size={54} label={false} />
              </span>
              <Link to={selected.to} className="vw-core-enter" style={{ color: selected.color }}>
                Enter <ArrowRight size={11} />
              </Link>
            </>
          ) : (
            <>
              <span className="vw-display vw-core-title" style={{ fontSize: '0.95rem' }}>
                Character
                <br />
                <span className="gradient-text">Verse</span>
              </span>
              <span className="vw-core-mark">
                <VerseWheelFace size={56} label={false} />
              </span>
              <span className="vw-core-tag">SEVEN ENTRANCES</span>
            </>
          )}
        </div>
      </div>

      {/* Outer ring — the Verses. When one is open the rest become markers you
       * can still click to switch, rather than disappearing entirely. */}
      {VERSES.map((verse, i) => {
        const p = ringPoint(i, VERSES.length, verseR)
        const dx = Math.cos(p.angle) * verseR
        const dy = Math.sin(p.angle) * verseR
        const isOpen = selected?.id === verse.id
        const dimmed = !!selected && !isOpen
        const Icon = verse.icon
        return (
          <button
            key={verse.id}
            type="button"
            className="vw-node"
            onClick={() => (isOpen ? onClear() : onSelect(verse.id))}
            aria-expanded={isOpen}
            aria-label={
              isOpen
                ? `Close the ${verse.name} sub-wheel`
                : `Open the ${verse.name} sub-wheel — ${verse.callout}`
            }
            style={{
              color: verse.color,
              transform: `translate(${dx}px, ${dy}px) scale(${isOpen ? 0.72 : dimmed ? 0.6 : 1})`,
              opacity: isOpen ? 0.95 : dimmed ? 0.34 : 1,
              transition: ease,
              zIndex: dimmed ? 1 : 3,
              animationDelay: `${0.15 + i * 0.07}s`,
            }}
          >
            <span className="vw-callout">{verse.callout}</span>
            <span className="vw-orb" style={{ boxShadow: dimmed ? 'none' : `0 0 26px -6px ${verse.color}` }}>
              <Icon size={24} color={verse.color} />
            </span>
            {!selected && (
              <span className="vw-display vw-label">
                {verse.wheel[0]}
                {verse.wheel[1] && (
                  <>
                    <br />
                    {verse.wheel[1]}
                  </>
                )}
              </span>
            )}
          </button>
        )
      })}

      {/* Inner ring — the Sub-Wheel of common pages for the open Verse. */}
      {selected &&
        selected.pages.map((page, i) => {
          const p = ringPoint(i, selected.pages.length, pageR)
          const Icon = page.icon
          return (
            <Link
              key={page.to + (page.hash ?? '')}
              to={page.to}
              hash={page.hash}
              className="vw-sat"
              title={page.blurb}
              style={{
                color: selected.color,
                transform: `translate(${Math.cos(p.angle) * pageR}px, ${Math.sin(p.angle) * pageR}px)`,
                animationDelay: `${i * 0.06}s`,
                zIndex: 4,
              }}
            >
              <span className="vw-sat-dot">
                <Icon size={18} color={selected.color} />
              </span>
              <span className="vw-display vw-sat-label">{page.label}</span>
            </Link>
          )
        })}
    </div>
  )
}

/* ------------------------------------------- small-screen equivalent wheel */

function VerseStack({
  selected,
  onSelect,
  onClear,
}: {
  selected: Verse | null
  onSelect: (id: string) => void
  onClear: () => void
}) {
  return (
    <div className="vw-stack">
      {VERSES.map((verse) => {
        const open = selected?.id === verse.id
        const Icon = verse.icon
        return (
          <div
            key={verse.id}
            style={{
              border: `1px solid ${open ? `${verse.color}66` : 'var(--border)'}`,
              borderRadius: 14,
              background: open ? 'rgba(26,26,40,0.9)' : 'rgba(19,19,30,0.72)',
              marginBottom: '0.6rem',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => (open ? onClear() : onSelect(verse.id))}
              aria-expanded={open}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.85rem 0.9rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text-primary)',
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  display: 'grid',
                  placeItems: 'center',
                  border: `1px solid ${verse.color}`,
                  flexShrink: 0,
                }}
              >
                <Icon size={18} color={verse.color} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="vw-display" style={{ display: 'block', fontWeight: 700, fontSize: '0.92rem' }}>
                  {verse.name}
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{verse.callout}</span>
              </span>
              <ArrowRight
                size={16}
                color={verse.color}
                style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }}
              />
            </button>

            {open && (
              <div style={{ padding: '0 0.9rem 0.9rem', display: 'grid', gap: '0.4rem' }}>
                <div style={{ fontSize: '0.66rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  SUB-WHEEL · {verse.pages.length} COMMON PAGES
                </div>
                {verse.pages.map((page) => (
                  <SubPageRow key={page.to + (page.hash ?? '')} page={page} color={verse.color} />
                ))}
                <Link
                  to={verse.to}
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: verse.color,
                    textDecoration: 'none',
                    marginTop: '0.2rem',
                  }}
                >
                  Enter {verse.name} →
                </Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SubPageRow({ page, color }: { page: VersePage; color: string }) {
  const Icon = page.icon
  return (
    <Link
      to={page.to}
      hash={page.hash}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.5rem 0.6rem',
        borderRadius: 10,
        background: 'var(--bg-hover)',
        textDecoration: 'none',
        color: 'var(--text-primary)',
      }}
    >
      <Icon size={15} color={color} style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600 }}>{page.label}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{page.blurb}</span>
      </span>
    </Link>
  )
}

/* ------------------------------------------------------------ console rail */

function AskBox() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        navigate({ to: '/ask', search: q.trim() ? { q: q.trim() } : {} })
      }}
    >
      <h2 className="vw-display" style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.6rem' }}>
        Ask a character <span className="gradient-text">anything</span>
      </h2>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.55rem 0.7rem',
          borderRadius: 12,
          background: 'rgba(19,19,30,0.85)',
          border: '1px solid var(--border)',
        }}
      >
        <Search size={15} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What should I ask?"
          aria-label="Ask a character anything"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          aria-label="Go to Ask"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 26,
            height: 26,
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--accent)',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <CornerDownLeft size={13} />
        </button>
      </div>
    </form>
  )
}

const GUIDE_STEPS = [
  'Click a Verse on the wheel — say TabVerse.',
  'Its Sub-Wheel expands around the core, showing the common pages of that Verse.',
  'Step straight into a page, or take the core link to enter the Verse itself.',
]

function InteractionGuide({ selected, onHowItWorks }: { selected: Verse | null; onHowItWorks: () => void }) {
  return (
    <div
      style={{
        position: 'relative',
        marginTop: '1.5rem',
        padding: '1rem 1.1rem 2.4rem',
        borderRadius: 14,
        background: 'rgba(19,19,30,0.85)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        className="vw-display"
        style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.09em', color: 'var(--accent-light)', marginBottom: '0.7rem' }}
      >
        EXPLODED SUB-VERSE
        <br />
        INTERACTION GUIDE
      </div>
      <ol style={{ listStyle: 'none', display: 'grid', gap: '0.6rem' }}>
        {GUIDE_STEPS.map((step, i) => (
          <li key={i} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <span
              style={{
                flexShrink: 0,
                width: 19,
                height: 19,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid var(--border)',
                fontSize: '0.66rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginTop: '0.1rem',
              }}
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)', fontSize: '0.74rem' }}>
        {selected ? (
          <span style={{ color: 'var(--text-secondary)' }}>
            Open:{' '}
            <b className="vw-display" style={{ color: selected.color }}>
              {selected.name}
            </b>{' '}
            — {selected.pages.length} common pages on the Sub-Wheel.
          </span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>
            Nothing open. The wheel is showing all {VERSES.length} Verses.
          </span>
        )}
      </div>

      {/* The long explanation lives in a popout now, hosted from this corner,
       * so the page under the wheel is the index rather than an essay. */}
      <button type="button" className="vw-display vw-how-link" onClick={onHowItWorks} aria-haspopup="dialog">
        HOW THE WHEEL WORKS
      </button>
    </div>
  )
}

/* ------------------------------- the explainer: one Verse, one Sub-Wheel */

/** A static schematic of the interaction, drawn rather than described. */
function SubWheelDiagram({ verse }: { verse: Verse }) {
  const count = verse.pages.length
  return (
    <svg viewBox="0 0 260 200" style={{ width: '100%', maxWidth: 420, overflow: 'visible' }} role="img" aria-label={`Schematic: the ${verse.name} Verse opening into ${count} common pages`}>
      {/* left: the Verse as it sits on the main wheel — wearing the Seven
       * Entrances mark, the same turning object the core and the bar carry. */}
      <circle cx="34" cy="100" r="17" fill="rgba(19,19,30,0.9)" stroke={verse.color} strokeWidth="1.2" />
      <circle cx="34" cy="100" r="23" fill="none" stroke={verse.color} strokeWidth="0.6" opacity="0.4" strokeDasharray="2 3" />
      <VerseWheelFace size={28} x={20} y={86} label={false} />
      <text x="34" y="140" textAnchor="middle" fill="var(--text-secondary)" fontSize="8" fontWeight="700">
        VERSE
      </text>

      {/* the transition */}
      <path d="M 64 100 L 96 100" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
      <path d="M 92 96 L 99 100 L 92 104 Z" fill={verse.color} />
      <text x="80" y="92" textAnchor="middle" fill="var(--text-secondary)" fontSize="7" fontWeight="700">
        CLICK
      </text>

      {/* right: the exploded sub-wheel */}
      <circle cx="176" cy="100" r="15" fill="rgba(19,19,30,0.94)" stroke={verse.color} strokeWidth="1.2" />
      {verse.pages.map((page, i) => {
        const p = ringPoint(i, count, 1)
        const cx = 176 + Math.cos(p.angle) * 52
        const cy = 100 + Math.sin(p.angle) * 52
        return (
          <g key={page.to + (page.hash ?? '')}>
            <line x1="176" y1="100" x2={cx} y2={cy} stroke={verse.color} strokeWidth="0.6" strokeDasharray="2 2.5" opacity="0.7" />
            <circle cx={cx} cy={cy} r="8.5" fill="rgba(26,26,40,0.96)" stroke={verse.color} strokeWidth="0.9" />
          </g>
        )
      })}
      <text x="176" y="176" textAnchor="middle" fill="var(--text-secondary)" fontSize="8" fontWeight="700">
        SUB-WHEEL · {count} PAGES
      </text>
    </svg>
  )
}

/**
 * How the wheel works — a popout, opened from the interaction guide's corner.
 *
 * A dialog rather than a section: it is a reference you check once, and as a
 * section it put a second wheel diagram between the real wheel and the index.
 * Escape, the close button and a click on the backdrop all close it; focus
 * goes to the dialog on open and back to the link that opened it on close.
 * Portalled to <body>: the page root isolates its own stacking context, and
 * inside it no z-index could lift the backdrop over the site's top bar.
 */
function Explainer({ verse, onSelect, onClose }: { verse: Verse; onSelect: (id: string) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className="vw-pop-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <section
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vw-how-title"
      className="vw-pop"
    >
      <button type="button" className="vw-pop-close" onClick={onClose} aria-label="Close how the wheel works">
        <X size={16} />
      </button>
      <div style={{ maxWidth: 640, marginBottom: '1.75rem' }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.11em', color: 'var(--accent-light)', marginBottom: '0.5rem' }}>
          HOW THE WHEEL WORKS
        </p>
        <h2 id="vw-how-title" className="vw-display" style={{ fontSize: 'clamp(1.35rem, 3.2vw, 1.9rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: '0.6rem' }}>
          One click in, and the Verse opens its own wheel
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
          The outer ring holds the seven Verses. Selecting one does not take you away — it keeps you at the core and
          fans that Verse's common pages out around you, so you can see everything inside before committing to any of
          it. Pick a page, or step into the Verse itself from the middle.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 420px) minmax(0, 1fr)', gap: '2rem', alignItems: 'center' }} className="vw-explain-grid">
        <SubWheelDiagram verse={verse} />

        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
            {VERSES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                style={{
                  padding: '0.28rem 0.6rem',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  background: v.id === verse.id ? `${v.color}22` : 'transparent',
                  border: `1px solid ${v.id === verse.id ? v.color : 'var(--border)'}`,
                  color: v.id === verse.id ? v.color : 'var(--text-secondary)',
                }}
              >
                {v.wheel[1] || v.wheel[0]}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {verse.pages.map((page) => (
              <SubPageRow key={page.to + (page.hash ?? '')} page={page} color={verse.color} />
            ))}
          </div>
        </div>
      </div>
    </section>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------ the plain, complete index */

const INDEX_KEY = 'cv_home_index_open'

/**
 * The full index, under a collapse/raise bar. The footer is not part of it and
 * never folds away with it.
 *
 * Open on the server and on first paint, whatever the visitor chose last time —
 * the index is the page's no-JavaScript, crawlable map (rule 2 above), so the
 * HTML always carries it. A visitor who folded it away gets it folded again on
 * their next visit, once the page has hydrated. Folded, it is `inert`: out of
 * the tab order and the accessibility tree, not merely out of sight.
 */
function VerseIndex() {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (window.localStorage.getItem(INDEX_KEY) === '0') setOpen(false)
  }, [])
  const toggle = () => {
    setOpen((v) => {
      window.localStorage.setItem(INDEX_KEY, v ? '0' : '1')
      return !v
    })
  }

  return (
    <section style={{ maxWidth: 1120, margin: '3rem auto 0', padding: '0 0.25rem' }}>
      <button
        type="button"
        className="vw-fold-bar"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="vw-index"
        title={open ? 'Collapse the index' : 'Raise the index'}
      >
        <span className="vw-fold-line" aria-hidden />
        <span className="vw-fold-knob">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        <span className="vw-fold-line" aria-hidden />
        <span className="vw-sr">{open ? 'Collapse' : 'Raise'} every Verse, every page</span>
      </button>
      <h2 className="vw-display" style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.11em', color: 'var(--text-secondary)', margin: '0.9rem 0 1rem' }}>
        EVERY VERSE, EVERY PAGE
      </h2>
      <div id="vw-index" className="vw-fold" data-open={open || undefined} inert={!open || undefined}>
      <div className="vw-fold-inner">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem 2rem' }}>
        {VERSES.map((verse) => (
          <div key={verse.id}>
            <Link
              to={verse.to}
              className="vw-display"
              style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, color: verse.color, textDecoration: 'none', marginBottom: '0.5rem' }}
            >
              {verse.name}
            </Link>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.3rem' }}>
              {verse.pages.map((page) => (
                <li key={page.to + (page.hash ?? '')}>
                  <Link
                    to={page.to}
                    hash={page.hash}
                    style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textDecoration: 'none' }}
                  >
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- the page */

function VerseHome() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  const closeHow = useCallback(() => setHowOpen(false), [])
  const selected = selectedId ? VERSE_BY_ID[selectedId] : null
  // The explainer always has a Verse to draw; it falls back to the first one
  // rather than emptying out when the wheel is closed.
  const explained = useMemo(() => selected ?? VERSES[0], [selected])

  // Escape closes an open Sub-Wheel, the same as the back control — unless the
  // how-it-works popout is open, in which case Escape is the popout's.
  useEffect(() => {
    if (!selectedId || howOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, howOpen])

  return (
    <div className="vw-root">
      <Backdrop />

      <header style={{ textAlign: 'center', maxWidth: 1120, margin: '0 auto 2.5rem' }}>
        <h1
          className="vw-display vw-rise"
          style={{
            // Sized to the space it actually has. The wordmark runs 12.24× its
            // font size (measured), so this keeps it inside the column at every
            // width instead of overflowing a fixed box — which is what clipped
            // it to "CharacterVer".
            fontSize: 'min(5.4rem, calc((100vw - 2.6rem) / 12.6))',
            whiteSpace: 'nowrap',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(103deg, #cbb6ff 4%, #f0e9ff 30%, #9fd8e8 58%, #d9a7e0 88%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 6px 34px rgba(139,111,208,0.45))',
            animationDelay: '0.04s',
          }}
        >
          CharacterVerse
        </h1>

        {/* The entrances, spelled out under the wordmark — real links, so this
         * page is fully navigable before a single pixel of the wheel loads. */}
        <nav
          className="vw-rise"
          aria-label="The seven Verses"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.15rem 0.55rem',
            maxWidth: 900,
            margin: '0.9rem auto 0',
            animationDelay: '0.16s',
          }}
        >
          {VERSES.map((verse, i) => (
            <span key={verse.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
              {i > 0 && <span style={{ color: 'var(--accent-light)', opacity: 0.5 }}>·</span>}
              <Link
                to={verse.to}
                onMouseEnter={() => setSelectedId(verse.id)}
                onFocus={() => setSelectedId(verse.id)}
                style={{
                  fontSize: 'clamp(0.78rem, 1.6vw, 1rem)',
                  fontWeight: 600,
                  color: selectedId === verse.id ? verse.color : 'var(--text-secondary)',
                  textDecoration: 'none',
                  transition: 'color 0.2s ease',
                }}
              >
                {verse.name}
              </Link>
            </span>
          ))}
        </nav>
      </header>

      <div className="vw-stage">
        <div>
          {/* Back control, present only while a Sub-Wheel is open. */}
          <div style={{ height: 34, display: 'flex', justifyContent: 'center', marginBottom: '0.25rem' }}>
            {selected && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="vw-rise"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.8rem',
                  borderRadius: 999,
                  cursor: 'pointer',
                  background: 'rgba(19,19,30,0.9)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                <ArrowLeft size={13} />
                Back to the Verse Wheel
                <kbd style={{ fontSize: '0.62rem', opacity: 0.6, border: '1px solid var(--border)', borderRadius: 4, padding: '0 0.25rem' }}>
                  esc
                </kbd>
              </button>
            )}
          </div>

          <Wheel selected={selected} onSelect={setSelectedId} onClear={() => setSelectedId(null)} />
          <VerseStack selected={selected} onSelect={setSelectedId} onClear={() => setSelectedId(null)} />
        </div>

        <aside className="vw-rise" style={{ animationDelay: '0.3s' }}>
          <AskBox />
          <InteractionGuide selected={selected} onHowItWorks={() => setHowOpen(true)} />
        </aside>
      </div>

      {howOpen && <Explainer verse={explained} onSelect={setSelectedId} onClose={closeHow} />}
      <VerseIndex />

      <footer style={{ maxWidth: 1120, margin: '3.5rem auto 0', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.78rem' }}>
        {[
          { to: '/platform', label: 'Platform tour' },
          { to: '/mission', label: 'Mission' },
          { to: '/charter', label: 'Agentic Robots Charter' },
          { to: '/enterprise', label: 'Enterprise' },
          { to: '/create', label: 'Create a character' },
        ].map((link) => (
          <Link key={link.to} to={link.to} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            {link.label}
          </Link>
        ))}
      </footer>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: VerseHome,
})
