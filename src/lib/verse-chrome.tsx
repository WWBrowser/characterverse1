import { useState, type CSSProperties } from 'react'
import { useDismissable } from './popover'
import { Link } from '@tanstack/react-router'
import { ArrowRight, CircleUser, Grid3x3, Star, X } from 'lucide-react'
import { VERSES, ringPoint, type Verse } from './verses'

/* ═════════════════════════════════════════════════════ CharacterVerse chrome
 *
 * The index reads like a dark-mode search engine, so it gets search-engine
 * chrome: a thin bar with a couple of named destinations on each side, an
 * apps launcher, and an account mark. Three pages share it — /search, /cstore
 * and /cmail — which is why it lives here instead of in any one of them.
 *
 * Two rules:
 *   1. Every label in the bar is a real route. A chrome that lies about what
 *      exists is worse than a chrome with three links in it.
 *   2. The launcher is generated from VERSES (src/lib/verses.ts), the same
 *      array the home wheel reads. The panel is the wheel, flattened — so it
 *      can never list a Verse the wheel does not have, or miss one it does.
 * ═══════════════════════════════════════════════════════════════════════ */

export type ChromeSlot = 'search' | 'cstore' | 'cmail' | null

/* ---------------------------------------------------------- the wheel mark */

/**
 * The Seven Entrances mark, without a wrapper.
 *
 * The Verse Wheel and its Sub-Wheel, drawn small enough to sit in a nav bar.
 * It is not a generic icon — the seven outer orbs carry the seven Verse
 * colours in wheel order, so the mark and the home page are recognisably the
 * same object at two sizes. It is the bar's Verses trigger — the mark is the
 * seven entrances, so pressing it should be what opens them.
 *
 * Exported because the home wheel wears it too, at its core and in the
 * how-it-works diagram. `x`/`y` place it when it is nested inside another SVG.
 */
export function VerseWheelFace({ size = 30, label = true, x, y }: { size?: number; label?: boolean; x?: number; y?: number }) {
  const outer = 15
  const inner = 7.6

  return (
    <>
      <svg x={x} y={y} width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ overflow: 'visible', display: 'block' }}>
        {/* Orbit and tick ring — the faint architecture the orbs ride on. */}
        <circle cx="20" cy="20" r={outer} fill="none" stroke="rgba(167,139,250,0.28)" strokeWidth="0.7" />
        <circle
          cx="20"
          cy="20"
          r={inner}
          fill="none"
          stroke="rgba(167,139,250,0.18)"
          strokeWidth="0.6"
          strokeDasharray="1.2 1.8"
        />

        {/* Sub-Wheel: four satellites, counter-turning, because on the home page
         * the inner ring belongs to whichever Verse is open rather than to the
         * outer ring's rotation. */}
        <g className="cvch-spin-rev" style={{ transformOrigin: '20px 20px' }}>
          {Array.from({ length: 4 }, (_, i) => {
            const p = ringPoint(i, 4, inner)
            return <circle key={i} cx={(p.x / 100) * 40} cy={(p.y / 100) * 40} r="1.05" fill="rgba(232,232,245,0.55)" />
          })}
        </g>

        {/* The seven Verses. */}
        <g className="cvch-spin" style={{ transformOrigin: '20px 20px' }}>
          {VERSES.map((verse, i) => {
            const p = ringPoint(i, VERSES.length, outer)
            return (
              <circle
                key={verse.id}
                cx={(p.x / 100) * 40}
                cy={(p.y / 100) * 40}
                r="2.1"
                fill={verse.color}
                opacity="0.95"
              />
            )
          })}
        </g>

        {/* The core. */}
        <circle cx="20" cy="20" r="2.6" fill="var(--bg-primary)" stroke="var(--accent-light)" strokeWidth="0.8" />
      </svg>

      {label && (
        <span className="cvch-mark-text" style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)', lineHeight: 1.1 }}>
          SEVEN
          <br />
          ENTRANCES
        </span>
      )}
    </>
  )
}

/* --------------------------------------------------------------- the panels */

/**
 * Both bar panels hang off the right end of the same cluster, so they share
 * one shell. Written once: two panels that drift apart by a pixel look like a
 * bug in the bar rather than two different menus.
 */
const PANEL: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  right: 0,
  width: 348,
  maxWidth: 'calc(100vw - 24px)',
  maxHeight: 'min(76vh, 620px)',
  overflowY: 'auto',
  padding: '1.05rem 1.1rem 1.2rem',
  borderRadius: 18,
  border: '1px solid var(--border)',
  background: 'rgba(19,19,30,0.97)',
  backdropFilter: 'blur(18px)',
  boxShadow: '0 26px 70px -20px rgba(0,0,0,0.85)',
  zIndex: 80,
}

/**
 * My Favorites — the grid button's new tenant.
 *
 * The grid used to open the Verses; the Seven Entrances mark does that now,
 * which frees the grid for pinned actions. Those actions do not exist yet, so
 * this says so. An empty state that names what will be here beats a panel
 * stocked with plausible-looking favourites nobody saved.
 */
function FavoritesPanel({ onClose }: { onClose: () => void }) {
  const panel = useDismissable<HTMLDivElement>(onClose)

  return (
    <div ref={panel} className="cvch-panel" role="dialog" aria-label="My Favorites" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>My Favorites</h2>
        <span style={{ marginLeft: 'auto' }}>
          <button type="button" onClick={onClose} className="cvch-ghost" aria-label="Close" style={{ padding: '0.3rem' }}>
            <X size={14} />
          </button>
        </span>
      </div>

      <div style={{ display: 'grid', justifyItems: 'center', gap: '0.55rem', padding: '1.5rem 0.5rem 1.2rem' }}>
        <span className="cvch-tile-orb" style={{ borderColor: 'rgba(167,139,250,0.35)' }}>
          <Star size={19} color="var(--accent-light)" />
        </span>
        <strong style={{ fontSize: '0.82rem', fontWeight: 750, color: 'var(--text-primary)' }}>
          No favorites added yet
        </strong>
        <p
          style={{
            margin: 0,
            maxWidth: 250,
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          Pinned actions will live here — the handful of things you reach for often, one tap from any page. Nothing
          has been pinned so far.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the launcher */

/**
 * The apps panel. Seven Verse tiles; picking one opens its Sub-Wheel in place,
 * so the two-step shape of the home wheel survives in a menu. Nothing here is
 * hand-written — it is VERSES, rendered.
 */
function VerseLauncher({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<Verse | null>(null)
  // Escape, outside-click and focus-on-open all live in useDismissable, which
  // the search chrome's menus share — see src/lib/popover.ts.
  const panel = useDismissable<HTMLDivElement>(onClose)

  return (
    <div ref={panel} className="cvch-panel" role="dialog" aria-label="The Verses" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          {open ? open.name : 'The Verses'}
        </h2>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
          {open && (
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="cvch-ghost"
              style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.25rem 0.55rem' }}
            >
              All seven
            </button>
          )}
          <button type="button" onClick={onClose} className="cvch-ghost" aria-label="Close" style={{ padding: '0.3rem' }}>
            <X size={14} />
          </button>
        </span>
      </div>

      {!open ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
            {VERSES.map((verse) => {
              const Icon = verse.icon
              return (
                <button
                  key={verse.id}
                  type="button"
                  onClick={() => setOpen(verse)}
                  className="cvch-tile"
                  title={verse.callout}
                  aria-label={`${verse.name} — open its Sub-Wheel`}
                >
                  <span
                    className="cvch-tile-orb"
                    style={{ borderColor: `${verse.color}55`, boxShadow: `0 0 22px -10px ${verse.color}` }}
                  >
                    <Icon size={19} color={verse.color} />
                  </span>
                  <span style={{ fontSize: '0.66rem', fontWeight: 650, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                    {verse.wheel[1] || verse.wheel[0]}
                  </span>
                </button>
              )
            })}
          </div>

          <Link to="/" onClick={onClose} className="cvch-panel-foot">
            Open the full wheel <ArrowRight size={12} />
          </Link>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 0.8rem', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {open.callout}
          </p>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            {open.pages.map((page) => {
              const Icon = page.icon
              return (
                <Link
                  key={page.to + (page.hash ?? '')}
                  to={page.to}
                  hash={page.hash}
                  onClick={onClose}
                  className="cvch-row"
                >
                  <span className="cvch-row-dot" style={{ borderColor: `${open.color}55` }}>
                    <Icon size={14} color={open.color} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 650, color: 'var(--text-primary)' }}>
                      {page.label}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {page.blurb}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>

          <Link to={open.to} onClick={onClose} className="cvch-panel-foot" style={{ color: open.color }}>
            Enter {open.name} <ArrowRight size={12} />
          </Link>
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- the bar */

const LEFT = [{ to: '/mission', label: 'About' }] as const

/**
 * The chrome. `active` underlines the page you are on rather than leaving the
 * bar looking identical everywhere — CStore and CMail are destinations, not
 * decorations, so the bar has to admit when you have arrived at one.
 */
export function VerseChrome({ active = null }: { active?: ChromeSlot }) {
  // One panel at a time. Both hang off the same cluster and would overlap.
  const [panel, setPanel] = useState<'verses' | 'favorites' | null>(null)
  const toggle = (which: 'verses' | 'favorites') => setPanel((p) => (p === which ? null : which))

  return (
    <header
      className="cvch-bar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: '1.1rem',
        padding: '0.7rem 1.1rem',
        background: 'rgba(13,13,20,0.86)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {LEFT.map((item) => (
        <Link key={item.to} to={item.to} className="cvch-link cvch-text">
          {item.label}
        </Link>
      ))}

      {/* CStore — CharacterStore. */}
      <Link
        to="/cstore"
        className="cvch-link cvch-text"
        aria-current={active === 'cstore' ? 'page' : undefined}
        data-active={active === 'cstore' || undefined}
        title="CharacterStore — plans, coins and everywhere value changes hands"
      >
        CStore
      </Link>

      <div style={{ flex: 1 }} />

      {/* CMail — CharacterMail. */}
      <Link
        to="/cmail"
        className="cvch-link cvch-text"
        aria-current={active === 'cmail' ? 'page' : undefined}
        data-active={active === 'cmail' || undefined}
        title="CharacterMail — bulletins, dispatches, orders and replies in one inbox"
      >
        CMail
      </Link>
      <Link to="/art" className="cvch-link cvch-text" title="Art Studio — images grown from a seed phrase">
        Art
      </Link>
      <Link
        to="/search"
        className="cvch-link cvch-text"
        aria-current={active === 'search' ? 'page' : undefined}
        data-active={active === 'search' || undefined}
      >
        Search
      </Link>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        {/* The grid, holding favourites. It opened the Verses until the mark
         * took that job — the mark *is* the seven entrances, so it should be
         * the thing that opens them. */}
        <button
          type="button"
          onClick={() => toggle('favorites')}
          className="cvch-icon"
          aria-expanded={panel === 'favorites'}
          aria-haspopup="dialog"
          aria-label="My Favorites — your pinned actions"
          title="My Favorites"
        >
          <Grid3x3 size={17} />
        </button>

        {/* Seven Entrances — the Verses panel's trigger. Home is still one tap
         * away inside it, through "Open the full wheel". */}
        <button
          type="button"
          onClick={() => toggle('verses')}
          className="cvch-mark cvch-mark-btn"
          aria-expanded={panel === 'verses'}
          aria-haspopup="dialog"
          aria-label="The Verses — jump to any entrance"
          title="Seven Entrances — the Verses"
        >
          <VerseWheelFace />
        </button>

        <Link to="/profile" className="cvch-avatar" aria-label="Your profile" title="Your profile">
          <CircleUser size={17} />
        </Link>

        {panel === 'verses' && <VerseLauncher onClose={() => setPanel(null)} />}
        {panel === 'favorites' && <FavoritesPanel onClose={() => setPanel(null)} />}
      </div>
    </header>
  )
}

/* --------------------------------------------------------------- the footer */

const FOOT = [
  { to: '/mission', label: 'Mission' },
  { to: '/charter', label: 'Robots Charter' },
  { to: '/search/add', label: 'Add to the index' },
  { to: '/cstore', label: 'CStore' },
  { to: '/cmail', label: 'CMail' },
] as const

/** The thin band at the bottom of a chrome page. Same links, same order, every page. */
export function VerseChromeFooter({ note }: { note?: string }) {
  return (
    <footer className="cvch-foot">
      <div className="cvch-foot-row">
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {note || 'CharacterVerse — seven entrances, one index'}
        </span>
        <span style={{ flex: 1 }} />
        {FOOT.map((f) => (
          <Link key={f.to + f.label} to={f.to} className="cvch-foot-link">
            {f.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
