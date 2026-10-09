import { useState, useEffect } from 'react'
import { HeadContent, Scripts, createRootRoute, Link, useRouterState } from '@tanstack/react-router'
import { Sparkles, Plus, Compass, Brain, Clock, Menu, X, Users, Boxes, Video, Briefcase, Bot, Wallet, ShieldCheck, CircleUser, CreditCard, Search } from 'lucide-react'
import { TourClaw } from '../components/TourClaw'
import { HUBS, findHub, isTabActive, type Hub } from '../lib/hubs'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'CharacterVerse — Build, Play & Learn with AI Characters' },
      { name: 'description', content: 'Create and chat with AI characters. Explore limitless stories, learn new things, and connect with a community of creators.' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

const SIDEBAR_WIDTH = 220
const HEADER_HEIGHT = 60

/* The marketing homepage ('/'), the Ask page ('/ask') and the per-mode
 * workspaces ('/mode/*') own their own full-bleed layout and have no left side
 * menu or hub band. The immersive chat surfaces (chat, twin, permanent memory,
 * history) do too — they fill the screen like a mobile app, as does the tabbed
 * workspace, which sizes its own panes against the viewport.
 *
 * The index trio — '/search', '/cstore' and '/cmail' — go further: see
 * CHROME_PATHS below. '/search/add' is deliberately in neither list, because
 * it is a form and a form is better off with the ordinary sidebar. */
const FULL_BLEED_PATHS = new Set<string>([
  '/',
  '/ask',
  '/search',
  '/cstore',
  '/cmail',
  '/cmail/notifications',
  '/history',
  '/workspace',
  '/signin',
  '/zkp',
  '/forge',
  '/lattice',
  '/spr',
])

/* The index trio wears its own chrome instead of this one: VerseChrome, in
 * src/lib/verse-chrome.tsx — a thin search-engine bar carrying About, CStore,
 * the Seven Entrances mark, CMail, and a launcher that opens the whole Verse
 * Wheel and any Sub-Wheel. So these three pages get no header from here at
 * all. A search page's most valuable asset is an empty page with one box in
 * the middle of it, and two stacked bars above that box spend it.
 *
 * Everything the app header reaches is still one click away inside the
 * launcher, which is generated from VERSES — so this cannot quietly become a
 * navigational dead end when a new Verse is added. */
// CMail's Notifications Zone wears the same chrome as the mailbox it belongs to.
const CHROME_PATHS = new Set<string>(['/search', '/cstore', '/cmail', '/cmail/notifications'])

function hasOwnChrome(pathname: string): boolean {
  return CHROME_PATHS.has(pathname)
}

function isFullBleed(pathname: string): boolean {
  return (
    FULL_BLEED_PATHS.has(pathname) ||
    pathname.startsWith('/mode/') ||
    pathname.startsWith('/chat/') ||
    pathname.startsWith('/twin/') ||
    pathname.startsWith('/permanent/') ||
    pathname.startsWith('/social') ||
    pathname.startsWith('/caz') ||
    pathname.startsWith('/tabverse') ||
    pathname.startsWith('/cvv') ||
    pathname.startsWith('/cvj')
  )
}

/* Quick actions sit beside the hubs in the header — the handful of things
 * you reach for constantly, regardless of which hub you are in. */
const QUICK_ACTIONS = [
  { to: '/search', label: 'Search', icon: Search },
  { to: '/social', label: 'Social', icon: Users },
  { to: '/caz', label: 'Agentz', icon: Bot },
  { to: '/cvv', label: 'Video', icon: Video },
  { to: '/cvj', label: 'Jobs', icon: Briefcase },
  { to: '/tabverse', label: 'TabVerse', icon: Boxes },
  { to: '/ask', label: 'Ask', icon: Sparkles },
  { to: '/create', label: 'Create', icon: Plus },
  { to: '/profile', label: 'Profile', icon: CircleUser },
] as const

/* The left workspace rail: a short, personal set of shortcuts. Everything else
 * now lives inside its hub, so this stays deliberately small. */
const SIDE_LINKS = [
  { to: '/search', label: 'Search', icon: Search },
  { to: '/profile', label: 'Profile', icon: CircleUser },
  { to: '/mission', label: 'Mission', icon: Compass },
  { to: '/social', label: 'Social', icon: Users },
  { to: '/caz', label: 'Agentz Zone', icon: Bot },
  { to: '/cvv', label: 'Video', icon: Video },
  { to: '/cvj', label: 'Jobs', icon: Briefcase },
  { to: '/tabverse', label: 'TabVerse', icon: Boxes },
  { to: '/ask', label: 'Ask', icon: Sparkles },
  { to: '/create', label: '+ Create', icon: Plus },
  { to: '/wallet', label: 'Wallet & Vault', icon: Wallet },
  { to: '/billing', label: 'Billing & Plans', icon: CreditCard },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/charter', label: 'Robots Charter', icon: ShieldCheck },
] as const

/* ---------------------------------------------------------------- Brand mark */

function Brand() {
  return (
    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', flexShrink: 0 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles size={16} color="white" />
      </div>
      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
        Character<span className="gradient-text">Verse</span>
      </span>
    </Link>
  )
}

/* ---------------------------------------------------------------- Header nav */

function NavBar({ activeHub, menuOpen, onToggleMenu }: { activeHub?: Hub; menuOpen: boolean; onToggleMenu: () => void }) {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(13,13,20,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem', height: HEADER_HEIGHT }}>
        <Brand />

        <div style={{ flex: 1 }} />

        {/* Desktop: hubs + quick actions */}
        <div className="cv-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {HUBS.map((hub) => {
            const Icon = hub.icon
            const active = activeHub?.key === hub.key
            return (
              <Link
                key={hub.key}
                to={hub.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Icon size={15} />
                {hub.nav}
              </Link>
            )
          })}

          <span style={{ width: 1, height: 20, background: 'var(--border)' }} />

          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}
              activeProps={{ style: { color: 'var(--accent-light)' } }}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </div>

        {/* Mobile: hamburger */}
        <button
          className="cv-hamburger"
          onClick={onToggleMenu}
          aria-label="Menu"
          style={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
    </nav>
  )
}

/* ---------------------------------------------------------------- Mobile menu */

function MobileMenu({ activeHub, onNavigate }: { activeHub?: Hub; onNavigate: () => void }) {
  const linkStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    padding: '0.75rem 0.75rem',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    textDecoration: 'none',
    fontSize: '0.95rem',
    fontWeight: 500,
  }
  const heading: React.CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-secondary)',
    opacity: 0.7,
    margin: '0.75rem 0.75rem 0.25rem',
  }
  return (
    <div
      className="cv-mobile-menu"
      style={{
        position: 'fixed',
        top: HEADER_HEIGHT,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 49,
        background: 'var(--bg-primary)',
        borderTop: '1px solid var(--border)',
        overflowY: 'auto',
        padding: '0.75rem',
      }}
    >
      <div style={heading}>Hubs</div>
      {HUBS.map((hub) => {
        const Icon = hub.icon
        const active = activeHub?.key === hub.key
        return (
          <Link
            key={hub.key}
            to={hub.to}
            onClick={onNavigate}
            style={{ ...linkStyle, color: active ? 'var(--accent-light)' : 'var(--text-secondary)', background: active ? 'var(--bg-hover)' : 'transparent' }}
          >
            <Icon size={17} />
            {hub.nav}
          </Link>
        )
      })}

      <div style={heading}>Quick actions</div>
      {SIDE_LINKS.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to} onClick={onNavigate} style={linkStyle} activeProps={{ style: { ...linkStyle, color: 'var(--accent-light)', background: 'var(--bg-hover)' } }}>
          <Icon size={17} />
          {label}
        </Link>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- Hub tab band */

function HubBand({ hub, pathname }: { hub: Hub; pathname: string }) {
  const Icon = hub.icon
  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1.25rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(124,92,191,0.3), rgba(79,70,229,0.3))',
              border: '1px solid rgba(124,92,191,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={16} color="var(--accent-light)" />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{hub.title}</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1rem', maxWidth: 760, lineHeight: 1.5 }}>
          {hub.subtitle}
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {hub.tabs.map((tab) => {
            const active = isTabActive(tab.to, pathname)
            return (
              <Link
                key={tab.to}
                to={tab.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.5rem 0.125rem 0.75rem',
                  color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: active ? 600 : 500,
                  borderBottom: active ? '2px solid var(--accent-light)' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Left side menu */

function SideMenu() {
  return (
    <aside
      className="cv-side"
      style={{
        position: 'fixed',
        top: HEADER_HEIGHT,
        left: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 40,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        padding: '1rem 0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', opacity: 0.6, padding: '0.25rem 0.75rem 0.5rem' }}>
        Workspace
      </div>
      {SIDE_LINKS.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: '0.625rem 0.75rem',
            borderRadius: 8,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
          activeProps={{ style: { color: 'var(--accent-light)', background: 'var(--bg-hover)' } }}
        >
          <Icon size={17} />
          {label}
        </Link>
      ))}
    </aside>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [menuOpen, setMenuOpen] = useState(false)
  const fullBleed = isFullBleed(pathname)
  const ownChrome = hasOwnChrome(pathname)
  const showSideMenu = !fullBleed
  const activeHub = findHub(pathname)
  const showBand = !!activeHub && !fullBleed

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {!ownChrome && (
          <NavBar activeHub={activeHub} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
        )}
        {!ownChrome && menuOpen && <MobileMenu activeHub={activeHub} onNavigate={() => setMenuOpen(false)} />}
        {showSideMenu && <SideMenu />}
        <main className={showSideMenu ? 'cv-main-inset' : undefined}>
          {showBand && <HubBand hub={activeHub} pathname={pathname} />}
          {children}
        </main>
        <TourClaw />
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '6rem 2rem' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔍</div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Page Not Found</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>The page you are looking for doesn&apos;t exist.</p>
      <Link to="/discover" style={{ color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 500 }}>
        ← Back to Discover
      </Link>
    </div>
  )
}
