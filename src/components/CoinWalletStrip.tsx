import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Wallet, Fuel } from 'lucide-react'
import { COINS, CVC, formatCoinsExact, formatGbp } from '../lib/coins'
import { getSession } from '../lib/session'

// The three-currency wallet strip.
//
// CharacterVerse's economy has two halves and this component is where a member
// sees both at once, on whichever surface they happen to be standing:
//
//   Silver CC + Gold CC — the monetization coins. What a creator EARNS. They
//                         carry a price and a market value.
//   CVC                 — CharacterVerse Coins, the chat-inference coin. What a
//                         chatter SPENDS to run character chat. It is gas, not
//                         money: no price, never counted toward market value.
//
// Every surface with a user page — the main Profile, a Social profile, an
// AgentzZone agent page, a CharacterVerse VIDEO channel, a CharacterVerse Jobs
// order desk — mounts this strip, so the wallet reads identically everywhere
// and always links back to the full Profile.

type CoinRow = { coin: string; milli: number; price: number; gbp: number }

export type WalletSummary = {
  coins: CoinRow[]
  earningsGbp: number
  cvc: { milli: number; grantedMilli: number; spentMilli: number; perReplyMilli: number; welcomeMilli: number }
}

/** Fetch the profile wallet for the current device session. */
export function useWallet(sessionId?: string) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null)
  useEffect(() => {
    const s = sessionId || getSession()
    let live = true
    fetch(`/api/profile?sessionId=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((d) => {
        if (live && d?.wallet) setWallet(d.wallet)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [sessionId])
  return wallet
}

function milliOf(wallet: WalletSummary | null, coin: string): number {
  return wallet?.coins.find((c) => c.coin === coin)?.milli || 0
}

/**
 * The strip itself. `variant` picks the chrome so it can sit inside surfaces
 * with very different visual languages:
 *   'card'  — the dark CharacterVerse card (default)
 *   'plain' — no outer background, for a dark surface that supplies its own panel
 *   'retro' — light chrome for the retro shells (CharacterVerse Social and
 *             AgentzZone), which are a pale blue web-1.0 look rather than dark
 */
export function CoinWalletStrip({
  wallet,
  variant = 'card',
  title = 'Your wallet',
  compact = false,
}: {
  wallet: WalletSummary | null
  variant?: 'card' | 'plain' | 'retro'
  title?: string
  compact?: boolean
}) {
  const retro = variant === 'retro'
  const silver = milliOf(wallet, 'silver')
  const gold = milliOf(wallet, 'gold')
  const cvc = wallet?.cvc.milli || 0
  const spent = wallet?.cvc.spentMilli || 0

  const wrap: React.CSSProperties =
    variant === 'card'
      ? {
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: compact ? '0.75rem 0.9rem' : '1rem 1.1rem',
        }
      : {}

  // Retro shells have their own palette; the dark theme's CSS variables would
  // render white-on-white inside them.
  const mutedColor = retro ? '#5a6785' : 'var(--text-secondary)'
  const linkColor = retro ? '#2b3f6b' : 'var(--accent-light)'
  const cellBg = retro ? '#f4f7fd' : 'var(--bg-primary)'

  const cells = [
    {
      key: 'silver',
      emoji: COINS.silver.emoji,
      label: COINS.silver.label,
      color: COINS.silver.color,
      value: `${formatCoinsExact(silver)} ${COINS.silver.symbol}`,
      sub: `${formatGbp(wallet?.coins.find((c) => c.coin === 'silver')?.gbp || 0)} · interaction coin`,
    },
    {
      key: 'gold',
      emoji: COINS.gold.emoji,
      label: COINS.gold.label,
      color: COINS.gold.color,
      value: `${formatCoinsExact(gold)} ${COINS.gold.symbol}`,
      sub: `${formatGbp(wallet?.coins.find((c) => c.coin === 'gold')?.gbp || 0)} · training coin`,
    },
    {
      key: 'cvc',
      emoji: CVC.emoji,
      label: CVC.label,
      color: CVC.color,
      value: `${formatCoinsExact(cvc)} ${CVC.symbol}`,
      sub: `gas · ${formatCoinsExact(spent)} spent on inference`,
    },
  ]

  return (
    <div style={wrap}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          marginBottom: '0.6rem',
          fontSize: '0.78rem',
          fontWeight: 700,
          color: mutedColor,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <Wallet size={14} color={linkColor} />
        {title}
        <div style={{ flex: 1 }} />
        <Link
          to="/profile"
          style={{ color: linkColor, textDecoration: 'none', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}
        >
          View profile →
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
        {cells.map((c) => (
          <div
            key={c.key}
            style={{
              background: cellBg,
              border: `1px solid ${c.color}${retro ? '88' : '44'}`,
              borderRadius: retro ? 4 : 10,
              padding: compact ? '0.55rem 0.65rem' : '0.7rem 0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: mutedColor }}>
              <span>{c.emoji}</span>
              {c.label}
            </div>
            <div style={{ fontSize: compact ? '1.1rem' : '1.35rem', fontWeight: 800, color: c.color, lineHeight: 1.2 }}>
              {c.value}
            </div>
            <div style={{ fontSize: '0.7rem', color: mutedColor }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A single-line gas readout for headers and toolbars — just the CVC balance and
 * what it costs to keep chatting.
 */
export function GasPill({ wallet }: { wallet: WalletSummary | null }) {
  const cvc = wallet?.cvc.milli || 0
  const perReply = wallet?.cvc.perReplyMilli || 0
  return (
    <Link
      to="/profile"
      title={`CharacterVerse Coins — chat-inference gas. ${formatCoinsExact(perReply)} CVC per reply.`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.3rem 0.6rem',
        borderRadius: 999,
        border: `1px solid ${CVC.color}55`,
        background: `${CVC.color}18`,
        color: CVC.color,
        fontSize: '0.78rem',
        fontWeight: 700,
        textDecoration: 'none',
      }}
    >
      <Fuel size={13} />
      {formatCoinsExact(cvc)} CVC
    </Link>
  )
}

/** Convenience wrapper that fetches its own data. */
export function SelfWalletStrip(props: Omit<Parameters<typeof CoinWalletStrip>[0], 'wallet'>) {
  const wallet = useWallet()
  return <CoinWalletStrip {...props} wallet={wallet} />
}
