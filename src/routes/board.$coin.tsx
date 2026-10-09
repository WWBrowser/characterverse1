import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { Crown } from 'lucide-react'
import {
  SURFACE_COINS, coinEmoji, coinLabel, coinColor, coinSymbol, formatCoins, formatGbp, ALL_COIN_KEYS, type AnyCoin, type SurfaceCoin,
} from '../lib/coins'
import { getSession } from '../lib/session'

type Row = { rank: number; tag: string; isYou: boolean; total: number; events: number; gbp: number }
type Board = { coin: string; rows: Row[]; totals: { minted: number; gbp: number; accounts: number } }

const RANK_COLOR = ['#fbbf24', '#cbd5e1', '#d2865b']

function CoinBoardPage() {
  const { coin } = useParams({ from: '/board/$coin' })
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)

  const valid = (ALL_COIN_KEYS as string[]).includes(coin)
  const meta = SURFACE_COINS[coin as SurfaceCoin]

  const load = useCallback(() => {
    if (!valid) { setLoading(false); return }
    const s = getSession()
    fetch(`/api/wallet?board=${encodeURIComponent(coin)}&sessionId=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then(setBoard)
      .catch(() => setBoard(null))
      .finally(() => setLoading(false))
  }, [coin, valid])

  useEffect(() => { setLoading(true); load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  if (!valid) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.25rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Unknown coin. <Link to="/leaderboard" style={{ color: 'var(--accent-light)' }}>Back to the leaderboard »</Link></p>
      </div>
    )
  }

  const color = coinColor(coin as AnyCoin)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* tab strip across the coin boards */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {(['cs', 'cj', 'cv', 'ca'] as SurfaceCoin[]).map((k) => (
          <Link
            key={k}
            to="/board/$coin"
            params={{ coin: k }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.85rem', borderRadius: 999, textDecoration: 'none',
              fontSize: '0.8rem', fontWeight: 700,
              border: `1px solid ${k === coin ? coinColor(k) : 'var(--border)'}`,
              background: k === coin ? `${coinColor(k)}22` : 'var(--bg-card)',
              color: k === coin ? coinColor(k) : 'var(--text-secondary)',
            }}
          >
            {SURFACE_COINS[k].emoji} {SURFACE_COINS[k].symbol}
          </Link>
        ))}
        <Link to="/wallet" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.85rem', borderRadius: 999, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          Wallet &amp; Vault →
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '2rem' }}>{coinEmoji(coin as AnyCoin)}</span>
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.3rem)', fontWeight: 800, lineHeight: 1 }}>{coinLabel(coin as AnyCoin)} Board</h1>
          <div style={{ fontSize: '0.8rem', color, fontWeight: 700, marginTop: 3 }}>{coinSymbol(coin as AnyCoin)} · {meta?.surface}</div>
        </div>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: 640, margin: '0.5rem 0 1.25rem', lineHeight: 1.6 }}>
        {meta?.blurb} The board ranks accounts by {coinSymbol(coin as AnyCoin)} earned — engagement monetized through real,
        high-signal connections. <Link to="/wallet" style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>Open your wallet »</Link>
      </p>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading the board…</p>
      ) : !board || board.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-card)' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>{coinEmoji(coin as AnyCoin)}</div>
          <p style={{ marginBottom: 12 }}>No {coinSymbol(coin as AnyCoin)} minted yet. Be the first.</p>
          <Link to={meta?.surfacePath || '/'} style={{ color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 600 }}>Go to {meta?.surface} »</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <Stat label={`Total ${coinSymbol(coin as AnyCoin)} in play`} value={formatCoins(board.totals.minted)} />
            <Stat label="Market value" value={formatGbp(board.totals.gbp)} />
            <Stat label="Accounts ranked" value={String(board.totals.accounts)} />
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  <th style={{ ...th, textAlign: 'center', width: 56 }}>#</th>
                  <th style={{ ...th, textAlign: 'left' }}>Account</th>
                  <th style={th}>Events</th>
                  <th style={th}>{coinSymbol(coin as AnyCoin)}</th>
                  <th style={th}>Value</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((r) => (
                  <tr key={r.rank} style={{ borderBottom: '1px solid var(--border)', background: r.isYou ? 'rgba(124,92,191,0.12)' : 'transparent' }}>
                    <td style={{ padding: '0.7rem 0.5rem', textAlign: 'center' }}>
                      {r.rank <= 3 ? <Crown size={17} color={RANK_COLOR[r.rank - 1]} style={{ verticalAlign: 'middle' }} /> : <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>{r.rank}</span>}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                      {r.tag}{r.isYou && <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-light)', background: 'rgba(124,92,191,0.2)', borderRadius: 999, padding: '1px 8px' }}>YOU</span>}
                    </td>
                    <td style={cell}>{r.events}</td>
                    <td style={{ ...cell, color: 'var(--text-primary)', fontWeight: 800 }}>{formatCoins(r.total)}</td>
                    <td style={{ ...cell, color: '#34d399', fontWeight: 700 }}>{formatGbp(r.gbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '0.6rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', whiteSpace: 'nowrap' }
const cell: React.CSSProperties = { padding: '0.7rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.86rem', color: 'var(--text-secondary)' }

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '0.6rem 0.9rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export const Route = createFileRoute('/board/$coin')({
  component: CoinBoardPage,
})
