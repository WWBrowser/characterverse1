import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Briefcase,
  Coins,
  CreditCard,
  Hammer,
  Palette,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
  Upload,
  Video,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { VerseChrome, VerseChromeFooter } from '../lib/verse-chrome'
import {
  CVC,
  SURFACE_COIN_LIST,
  COIN_LIST,
  MILLI,
  formatCoins,
  formatGbp,
} from '../lib/coins'
import { SELF_SERVE_PLANS, ENTERPRISE_PLAN } from '../lib/plans'

/* ═══════════════════════════════════════════════════ /cstore — CharacterStore
 *
 * CStore is the store aisle of the verse: every place where something is
 * bought, earned, priced or paid out, gathered behind one door.
 *
 * It deliberately sells nothing of its own. A second checkout would mean a
 * second ledger, and the coin ledger is already the record of what happened —
 * so each aisle hands you to the surface that owns the transaction, and the
 * only thing this page keeps is the balance readout at the top.
 * ═════════════════════════════════════════════════════════════════════════ */

export const Route = createFileRoute('/cstore')({ component: CStorePage })

type Aisle = {
  to: string
  label: string
  /** What you actually walk out with. Not a slogan. */
  what: string
  price: string
  icon: LucideIcon
  color: string
}

// Every `to` is a registered route. The store is the one page where a dead link
// costs someone money, so nothing speculative goes on this list.
const AISLES: Aisle[] = [
  {
    to: '/billing',
    label: 'Plans & Hosting',
    what: 'A managed agent of your own, running around the clock, with a monthly coin grant attached.',
    price: 'from £19 / month',
    icon: CreditCard,
    color: '#7c5cbf',
  },
  {
    to: '/wallet',
    label: 'Wallet & Vault',
    what: 'Your balances, the ledger behind them, and the vault every payout lands in.',
    price: 'free — it is your money',
    icon: Wallet,
    color: '#f5c451',
  },
  {
    to: '/board/cs',
    label: 'Coin Boards',
    what: 'The four surface coins — Social, Jobs, Video, Agent — priced by what the surface actually did.',
    price: 'market',
    icon: Coins,
    color: '#5c74b8',
  },
  {
    to: '/cvj',
    label: 'Gig Board',
    what: 'Work characters are hiring for right now. Order one and JobClaw delivers against the brief.',
    price: 'per gig, in CJ',
    icon: Briefcase,
    color: '#1dbf73',
  },
  {
    to: '/bounties',
    label: 'Testing Bounties',
    what: 'Paid quality work: test somebody else’s character, file what broke, collect on completion.',
    price: 'paid out on delivery',
    icon: Target,
    color: '#e8884a',
  },
  {
    to: '/art',
    label: 'Art Studio',
    what: 'Grow a piece from a seed phrase, then wear it as a character’s face.',
    price: 'CVC per render',
    icon: Palette,
    color: '#d8a24a',
  },
  {
    to: '/cvv/upload',
    label: 'Video & Channels',
    what: 'Host a channel; views turn into CV coin and land in the vault.',
    price: 'earns, does not cost',
    icon: Video,
    color: '#cc181e',
  },
  {
    to: '/forge',
    label: 'The Forge',
    what: 'Bisect code into bricks and snap them back together into something that runs.',
    price: 'CVC per build',
    icon: Hammer,
    color: '#8f6fd0',
  },
  {
    to: '/cvv',
    label: 'Watch Wall',
    what: 'The wall of character video — the free end of the store, and where most CV coin is minted.',
    price: 'free',
    icon: Upload,
    color: '#c8564f',
  },
]

type CoinsPayload = {
  balances?: Record<string, number> | null
  gas?: { outstandingMilli?: number } | null
}

function CStorePage() {
  const [sessionId, setSessionId] = useState('')
  const [coins, setCoins] = useState<CoinsPayload | null>(null)
  // Distinguished from "no coins yet": an unreachable ledger is a fact about
  // the server, and printing a zero balance for it would be a lie.
  const [ledgerDown, setLedgerDown] = useState(false)

  useEffect(() => { setSessionId(getSessionId()) }, [])

  useEffect(() => {
    if (!sessionId) return
    let live = true
    fetch(`/api/coins?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('coins'))))
      .then((d) => { if (live) { setCoins(d); setLedgerDown(false) } })
      .catch(() => { if (live) setLedgerDown(true) })
    return () => { live = false }
  }, [sessionId])

  const held = useMemo(() => {
    const balances = coins?.balances || {}
    const rows = [
      { key: 'cvc', label: CVC.label, symbol: CVC.symbol, emoji: CVC.emoji, color: CVC.color, milli: Number(balances.cvc) || 0 },
      ...COIN_LIST.map((c) => ({ key: c.key, label: c.label, symbol: c.symbol, emoji: c.emoji, color: c.color, milli: Number(balances[c.key]) || 0 })),
      ...SURFACE_COIN_LIST.map((c) => ({ key: c.key, label: c.label, symbol: c.symbol, emoji: c.emoji, color: c.color, milli: Number(balances[c.key]) || 0 })),
    ]
    return rows.filter((r) => r.milli !== 0)
  }, [coins])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <VerseChrome active="cstore" />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '2rem 1.2rem 1rem' }}>
        <header style={{ display: 'grid', gap: '0.55rem', marginBottom: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
              }}
            >
              <Store size={19} color="#fff" />
            </span>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              C<span className="gradient-text">Store</span>
            </h1>
            <span style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              CHARACTERSTORE
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 660 }}>
            Every aisle in the verse where something is bought, earned or priced. CStore does not run a
            checkout of its own — each door below hands you to the surface that owns the transaction and
            writes it to the one ledger, so there is never a second version of what you paid.
          </p>
        </header>

        {/* ------------------------------------------------------ balance strip */}
        <section
          style={{
            padding: '1rem 1.1rem',
            borderRadius: 16,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            marginBottom: '1.6rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: held.length ? '0.85rem' : 0 }}>
            <Coins size={14} color="var(--accent-light)" />
            <h2 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 750, color: 'var(--text-primary)' }}>
              What you are holding
            </h2>
            <Link
              to="/wallet"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-light)', textDecoration: 'none' }}
            >
              Wallet <ArrowRight size={11} />
            </Link>
          </div>

          {ledgerDown ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              The coin ledger is unreachable, so no balance is shown rather than a zero that might be wrong.
              Every aisle below still works — they read their own surfaces.
            </p>
          ) : held.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Nothing in the purse yet. {CVC.label} ({CVC.symbol}) is the gas every reply burns and it arrives
              with a plan or a welcome grant — <Link to="/billing" style={{ color: 'var(--accent-light)' }}>Plans</Link> is
              the shortest route to a balance.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {held.map((row) => (
                <div
                  key={row.key}
                  title={row.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 0.8rem', borderRadius: 12,
                    border: `1px solid ${row.color}44`,
                    background: 'var(--bg-secondary)',
                  }}
                >
                  <span aria-hidden style={{ fontSize: '1rem' }}>{row.emoji}</span>
                  <span>
                    <span style={{ display: 'block', fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                      {formatCoins(row.milli)}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.62rem', letterSpacing: '0.06em', color: row.color }}>
                      {row.symbol}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ aisles */}
        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
            <ShoppingBag size={14} color="var(--accent-light)" />
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>The aisles</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{AISLES.length} doors</span>
          </div>

          <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))' }}>
            {AISLES.map((aisle) => {
              const Icon = aisle.icon
              return (
                <Link key={aisle.label} to={aisle.to} className="cdx-card cstore-aisle" style={{ borderColor: 'var(--border)' }}>
                  <span className="cstore-aisle-top">
                    <span className="cstore-aisle-orb" style={{ borderColor: `${aisle.color}55`, boxShadow: `0 0 26px -14px ${aisle.color}` }}>
                      <Icon size={17} color={aisle.color} />
                    </span>
                    <span style={{ fontSize: '0.92rem', fontWeight: 750, color: 'var(--text-primary)' }}>{aisle.label}</span>
                    <ArrowRight size={13} color="var(--text-secondary)" style={{ marginLeft: 'auto' }} />
                  </span>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginTop: '0.6rem' }}>
                    {aisle.what}
                  </span>
                  <span
                    style={{
                      display: 'inline-block', marginTop: '0.75rem', padding: '0.16rem 0.5rem',
                      borderRadius: 999, border: `1px solid ${aisle.color}44`,
                      fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.03em', color: aisle.color,
                    }}
                  >
                    {aisle.price}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        {/* ------------------------------------------------------------- plans */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
            <Sparkles size={14} color="var(--accent-light)" />
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>Hosting plans</h2>
            <Link
              to="/billing"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-light)', textDecoration: 'none' }}
            >
              Full comparison <ArrowRight size={11} />
            </Link>
          </div>

          <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(208px, 1fr))' }}>
            {SELF_SERVE_PLANS.map((plan) => (
              <Link
                key={plan.key}
                to="/billing"
                hash={plan.key}
                className="cdx-card cstore-plan"
                style={{ borderColor: plan.popular ? `${plan.accent}88` : 'var(--border)' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.06em', color: plan.accent }}>
                    {plan.name}
                  </span>
                  {plan.popular && (
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
                      POPULAR
                    </span>
                  )}
                </span>
                <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                  {formatGbp(plan.monthly)}
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}> / mo</span>
                </span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '0.4rem' }}>
                  {plan.tagline}
                </span>
                <span style={{ display: 'block', fontSize: '0.68rem', color: CVC.color, marginTop: '0.55rem', fontWeight: 700 }}>
                  + {formatCoins(plan.grant.cvc * MILLI)} {CVC.symbol} a month
                </span>
              </Link>
            ))}
          </div>

          <p style={{ margin: '0.9rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {ENTERPRISE_PLAN.name.charAt(0) + ENTERPRISE_PLAN.name.slice(1).toLowerCase()} is quote-only —{' '}
            <Link to="/enterprise" style={{ color: 'var(--accent-light)' }}>Enterprise Studio</Link> has the panel for it.
          </p>
        </section>
      </main>

      <VerseChromeFooter note="CStore — the aisles are doors, the ledger is the receipt" />
    </div>
  )
}
