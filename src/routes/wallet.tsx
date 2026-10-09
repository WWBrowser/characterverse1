import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Wallet, Lock, Moon, ShieldCheck, Trophy, Fuel } from 'lucide-react'
import {
  ALL_COIN_KEYS, SURFACE_COIN_LIST, coinEmoji, coinLabel, coinColor, coinSymbol,
  formatCoins, formatCoinsExact, formatGbp, CVC,
} from '../lib/coins'
import { getSession } from '../lib/session'

type CoinRow = { coin: string; milli: number; price: number; gbp: number }
type Vault = { sealed: boolean; softLocked: boolean; sealedUntil: string | null; softLockUntil: string | null; note: string }
type Gas = { milli: number; perReplyMilli: number; welcomeMilli: number }
type WalletData = { coins: CoinRow[]; totalGbp: number; cvc?: Gas; vault: Vault }

function countdown(until: string | null, now: number): string {
  if (!until) return ''
  const ms = new Date(until).getTime() - now
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

const SEAL_OPTIONS = [
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
]

function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [sealHours, setSealHours] = useState(24)
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    const s = getSession()
    fetch(`/api/wallet?sessionId=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  // Live countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const act = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action)
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId: getSession(), ...extra }),
      })
      const d = await res.json().catch(() => null)
      if (res.ok && d?.vault) setData((prev) => (prev ? { ...prev, vault: d.vault } : prev))
    } finally {
      setBusy('')
    }
  }

  const vault = data?.vault
  const surfaceKeys = SURFACE_COIN_LIST.map((c) => c.key) as string[]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
        <Wallet size={20} color="var(--accent-light)" />
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-light)', letterSpacing: '0.04em' }}>SHARED WALLET</span>
      </div>
      <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', fontWeight: 800, marginBottom: '0.5rem' }}>
        Your <span className="gradient-text">Wallet &amp; Vault</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 680, marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Every coin you earn across CharacterVerse lives here in one shared wallet — the two base coins plus the four
        surface coins minted from real, high-signal engagement. A cryptographic vault with an agentic time-lock keeps
        the value safe.
      </p>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Opening your wallet…</p>
      ) : !data ? (
        <p style={{ color: 'var(--text-secondary)' }}>Couldn&apos;t open the wallet right now.</p>
      ) : (
        <>
          {/* Total */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.9rem 1.2rem', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1 }}>{formatGbp(data.totalGbp)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 3 }}>Total wallet value</div>
            </div>
            {/* CVC sits beside the total, never inside it: gas is usage, not value. */}
            <div
              title={`${formatCoinsExact(data.cvc?.perReplyMilli || 0)} CVC burns per character reply. New accounts are granted ${formatCoinsExact(data.cvc?.welcomeMilli || 0)} CVC on their first chat.`}
              style={{
                padding: '0.9rem 1.2rem', borderRadius: 14,
                border: `1px solid ${CVC.color}55`, background: `${CVC.color}12`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color: CVC.color }}>
                <Fuel size={18} />
                {formatCoinsExact(data.cvc?.milli || 0)} <span style={{ fontSize: '0.9rem' }}>CVC</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                Inference gas · no price, outside wallet value
              </div>
            </div>
            {vault?.sealed && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: 12, border: '1px solid #f5c451', background: 'rgba(245,196,81,0.12)', color: '#f5c451', fontWeight: 700, fontSize: '0.85rem' }}>
                <Lock size={15} /> Vault sealed · opens in {countdown(vault.sealedUntil, now)}
              </div>
            )}
            {vault?.softLocked && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: 12, border: '1px solid #60a5fa', background: 'rgba(96,165,250,0.12)', color: '#93c5fd', fontWeight: 700, fontSize: '0.85rem' }}>
                <Moon size={15} /> Sleep guard on · {countdown(vault.softLockUntil, now)}
              </div>
            )}
          </div>

          {/* Coin grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.9rem', marginBottom: '2rem' }}>
            {ALL_COIN_KEYS.map((coin) => {
              const row = data.coins.find((c) => c.coin === coin)
              const color = coinColor(coin)
              const isSurface = surfaceKeys.includes(coin)
              const inner = (
                <div
                  style={{
                    padding: '1rem', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)',
                    borderTop: `3px solid ${color}`, height: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.4rem' }}>{coinEmoji(coin)}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color, letterSpacing: '0.03em' }}>{coinSymbol(coin)}</span>
                    {vault?.sealed && <Lock size={12} color="#f5c451" style={{ marginLeft: 'auto' }} />}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1 }}>{formatCoins(row?.milli || 0)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 6px' }}>{coinLabel(coin)}</div>
                  <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>{formatGbp(row?.gbp || 0)}</div>
                  {isSurface && (
                    <div style={{ marginTop: 8, fontSize: '0.68rem', color: 'var(--accent-light)', fontWeight: 600 }}>
                      board →
                    </div>
                  )}
                </div>
              )
              return isSurface ? (
                <Link key={coin} to="/board/$coin" params={{ coin }} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
              ) : (
                <div key={coin}>{inner}</div>
              )
            })}
          </div>

          {/* Vault controls */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {/* Cryptographic vault */}
            <div style={{ padding: '1.2rem', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Lock size={17} color="#f5c451" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Cryptographic vault</h2>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
                A hard agentic time-lock. Seal the vault for a set period and it cannot be opened until the timer
                expires — a deliberate cooling-off a thief can&apos;t bypass. Hosted here in the leaderboards.
              </p>
              {vault?.sealed ? (
                <div style={{ padding: '0.8rem', borderRadius: 10, background: 'rgba(245,196,81,0.1)', border: '1px solid rgba(245,196,81,0.4)' }}>
                  <div style={{ fontWeight: 700, color: '#f5c451', marginBottom: 2 }}>🔒 Sealed</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Opens in <b style={{ color: 'var(--text-primary)' }}>{countdown(vault.sealedUntil, now)}</b>. The lock cannot be lifted early.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <select value={sealHours} onChange={(e) => setSealHours(Number(e.target.value))} style={selectStyle}>
                    {SEAL_OPTIONS.map((o) => <option key={o.hours} value={o.hours}>{o.label}</option>)}
                  </select>
                  <button onClick={() => act('seal', { hours: sealHours })} disabled={busy === 'seal'} style={btn('#f5c451')}>
                    {busy === 'seal' ? 'Sealing…' : 'Seal the vault'}
                  </button>
                </div>
              )}
            </div>

            {/* Sleep guard */}
            <div style={{ padding: '1.2rem', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Moon size={17} color="#60a5fa" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>12h sleep guard</h2>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
                A softer agentic time-lock for the logged-out, asleep window. Arm it and a hijacked, immobile account
                can&apos;t move value for 12 hours. You&apos;re present, so you can lift it any time.
              </p>
              {vault?.softLocked ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, fontSize: '0.82rem', color: '#93c5fd', fontWeight: 700 }}>🌙 Guard on · {countdown(vault.softLockUntil, now)} left</div>
                  <button onClick={() => act('liftSoft')} disabled={busy === 'liftSoft'} style={btn('#60a5fa')}>
                    {busy === 'liftSoft' ? '…' : "I'm here — lift it"}
                  </button>
                </div>
              ) : (
                <button onClick={() => act('armSoft')} disabled={busy === 'armSoft'} style={btn('#60a5fa')}>
                  {busy === 'armSoft' ? 'Arming…' : 'Arm sleep guard (12h)'}
                </button>
              )}
            </div>
          </div>

          {/* Surface coin legend */}
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>How the surface coins mint</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.9rem' }}>
            {SURFACE_COIN_LIST.map((c) => (
              <Link key={c.key} to="/board/$coin" params={{ coin: c.key }} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ padding: '0.9rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', borderLeft: `3px solid ${c.color}`, height: '100%' }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{c.emoji} {c.label} <span style={{ color: c.color }}>({c.symbol})</span></div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: 6 }}>{c.blurb}</div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    {c.mints.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ShieldCheck size={14} color="#34d399" /> More security features coming in future updates.</span>
            <Link to="/leaderboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--accent-light)', textDecoration: 'none' }}><Trophy size={14} /> Back to the leaderboards</Link>
          </div>
        </>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem',
}
function btn(color: string): React.CSSProperties {
  return {
    padding: '0.55rem 1rem', borderRadius: 10, border: `1px solid ${color}`, background: `${color}22`, color, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
  }
}

export const Route = createFileRoute('/wallet')({
  component: WalletPage,
})
