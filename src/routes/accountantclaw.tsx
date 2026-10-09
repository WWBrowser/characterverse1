import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Coins,
  PoundSterling,
  TrendingUp,
  Users,
  Send,
  Sparkles,
  Save,
  RotateCcw,
  Wand2,
  Pickaxe,
  Gift,
  Fuel,
  ShieldCheck,
  ShieldOff,
  Flame,
} from 'lucide-react'
import {
  COINS,
  COIN_LIST,
  SILVER_CHANNEL_LABEL,
  GOLD_SCOPE_LABEL,
  priceGbp,
  priceUplift,
  gbpFromMilli,
  formatGbp,
  formatCoinsExact,
  defaultSettings,
  defaultCvcSettings,
  CVC,
  MILLI,
  type CvcSettings,
  type CoinSettings,
  type Coin,
  type SilverChannel,
  type GoldScope,
} from '../lib/coins'
import { getSession } from '../lib/session'

export const Route = createFileRoute('/accountantclaw')({ component: AccountantClawPage })

/* --------------------------------------------------------------------- types */

type Summary = {
  totals: { silver: number; gold: number }
  counts: { silver: number; gold: number }
  bySource: Record<string, number>
  accounts: number
}

type LedgerRow = {
  id: number
  sessionId: string
  characterId: number | null
  coin: string
  amountMilli: number
  source: string
  reason: string
  createdAt: string
}

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string }

// The live CVC picture: how much gas has been issued into accounts versus how
// much has been burned running inference.
type GasSummary = {
  issuedMilli: number
  burnedMilli: number
  outstandingMilli: number
  grants: number
  spends: number
  accounts: number
}

/* ------------------------------------------------------------------- helpers */

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const s = Math.max(0, (Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '1.25rem',
} as const

const inputStyle = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  padding: '0.5rem 0.65rem',
  fontSize: '0.9rem',
  width: '100%',
} as const

function btn(primary = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.5rem 0.85rem',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-secondary)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  }
}

/* --------------------------------------------------------------------- page */

function AccountantClawPage() {
  const [settings, setSettings] = useState<CoinSettings>(defaultSettings())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [suggestion, setSuggestion] = useState<{ silver: number; gold: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [cvc, setCvc] = useState<CvcSettings>(defaultCvcSettings())
  const [gas, setGas] = useState<GasSummary | null>(null)

  const load = useCallback(async () => {
    const sid = getSession()
    const [main, led] = await Promise.all([
      fetch(`/api/coins?sessionId=${encodeURIComponent(sid)}`).then((r) => r.json()).catch(() => null),
      fetch('/api/coins?ledger=1').then((r) => r.json()).catch(() => null),
    ])
    if (main?.settings) setSettings(main.settings)
    if (main?.cvc) setCvc(main.cvc)
    if (main?.gas) setGas(main.gas)
    if (main?.summary) setSummary(main.summary)
    if (led?.ledger) setLedger(led.ledger)
    // Prefetch AccountantClaw's deterministic price suggestion.
    fetch('/api/accountantclaw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    })
      .then((r) => r.json())
      .then((d) => d?.suggestion && setSuggestion(d.suggestion))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const marketValueGbp = useMemo(() => {
    if (!summary) return 0
    return (
      gbpFromMilli(summary.totals.silver, settings.silverPrice) +
      gbpFromMilli(summary.totals.gold, settings.goldPrice)
    )
  }, [summary, settings])

  const save = useCallback(
    async (next: CoinSettings) => {
      setSaving(true)
      const res = await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateSettings', settings: next }),
      })
        .then((r) => r.json())
        .catch(() => null)
      if (res?.settings) setSettings(res.settings)
      setSaving(false)
      setSavedAt(Date.now())
      load()
    },
    [load],
  )

  const setPrice = (coin: Coin, price: number) => {
    setSettings((s) => ({ ...s, [coin === 'gold' ? 'goldPrice' : 'silverPrice']: price }) as CoinSettings)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.25rem 5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '0.4rem' }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #f5c451, #b8860b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Wand2 size={24} color="#1a1a28" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>
            Accountant<span className="gradient-text">Claw</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Monetization wizard for the two-coin character economy — admin control deck.
          </p>
        </div>
      </div>

      {/* Economy overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          margin: '1.25rem 0',
        }}
      >
        <Stat icon={Coins} tint={COINS.silver.color} label="Silver in circulation" value={`${formatCoinsExact(summary?.totals.silver ?? 0)} sCC`} sub={`across ${summary?.counts.silver ?? 0} mints`} />
        <Stat icon={Pickaxe} tint={COINS.gold.color} label="Gold mined" value={`${formatCoinsExact(summary?.totals.gold ?? 0)} gCC`} sub={`across ${summary?.counts.gold ?? 0} blocks`} />
        <Stat icon={PoundSterling} tint="#34d399" label="Total market value" value={formatGbp(marketValueGbp)} sub="at current prices" />
        <Stat icon={Users} tint="#60a5fa" label="Earning accounts" value={String(summary?.accounts ?? 0)} sub="hold a balance" />
      </div>

      {/* Coin price controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {COIN_LIST.map((meta) => {
          const coin = meta.key
          const price = coin === 'gold' ? settings.goldPrice : settings.silverPrice
          const uplift = priceUplift(coin, price)
          const suggested = suggestion ? suggestion[coin] : null
          return (
            <div key={coin} style={{ ...card, borderColor: meta.color + '55' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.7rem' }}>{meta.emoji}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{meta.label}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{meta.blurb}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: meta.color }}>{formatGbp(priceGbp(price))}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>per coin</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Fixed floor {formatGbp(priceGbp(meta.basePrice))}
                {uplift > 0 ? (
                  <span style={{ color: '#34d399', fontWeight: 700 }}> · +{uplift}% above floor</span>
                ) : (
                  <span> · at floor</span>
                )}
              </div>

              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Live price (milli-pounds, 1 = £0.001)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.35rem 0 0.6rem' }}>
                <button style={btn()} onClick={() => setPrice(coin, Math.max(meta.basePrice, price - 1))}>
                  −
                </button>
                <input
                  type="number"
                  min={meta.basePrice}
                  value={price}
                  onChange={(e) => setPrice(coin, Math.max(meta.basePrice, Math.floor(Number(e.target.value)) || meta.basePrice))}
                  style={{ ...inputStyle, textAlign: 'center', maxWidth: 110 }}
                />
                <button style={btn()} onClick={() => setPrice(coin, price + 1)}>
                  +
                </button>
                <button style={btn()} title="Reset to fixed floor" onClick={() => setPrice(coin, meta.basePrice)}>
                  <RotateCcw size={13} /> Floor
                </button>
              </div>

              {suggested != null && suggested !== price && (
                <button
                  style={{ ...btn(), borderColor: meta.color + '88', color: meta.color }}
                  onClick={() => setPrice(coin, suggested)}
                >
                  <TrendingUp size={13} /> AccountantClaw suggests {formatGbp(priceGbp(suggested))}
                </button>
              )}

              <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {formatCoinsExact(summary?.totals[coin] ?? 0)} {meta.symbol} in circulation ·{' '}
                <span style={{ color: '#34d399' }}>
                  {formatGbp(gbpFromMilli(summary?.totals[coin] ?? 0, price))}
                </span>{' '}
                value
              </div>
            </div>
          )
        })}
      </div>

      {/* Earning rates */}
      <div style={{ ...card, marginTop: '1rem' }}>
        <SectionTitle icon={Coins} title="Earning rates" hint="How many coins each action mints. Silver per interaction, Gold per training block." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginTop: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: COINS.silver.color }}>🥈 Silver — interactions</div>
            {(Object.keys(SILVER_CHANNEL_LABEL) as SilverChannel[]).map((ch) => (
              <RateRow
                key={ch}
                label={SILVER_CHANNEL_LABEL[ch]}
                value={settings.silverRates[ch]}
                onChange={(v) => setSettings((s) => ({ ...s, silverRates: { ...s.silverRates, [ch]: v } }))}
                suffix="sCC"
              />
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: COINS.gold.color }}>🥇 Gold — training success</div>
            {(Object.keys(GOLD_SCOPE_LABEL) as GoldScope[]).map((sc) => (
              <RateRow
                key={sc}
                label={GOLD_SCOPE_LABEL[sc]}
                value={settings.goldRates[sc]}
                onChange={(v) => setSettings((s) => ({ ...s, goldRates: { ...s.goldRates, [sc]: v } }))}
                suffix="gCC"
              />
            ))}
            <div style={{ marginTop: '0.9rem', fontWeight: 700, marginBottom: '0.4rem' }}>
              <Gift size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Ask page one-off bonus
            </div>
            <RateRow
              label="Welcome bonus per account"
              value={settings.askBonusMilli / MILLI}
              step={0.1}
              onChange={(v) => setSettings((s) => ({ ...s, askBonusMilli: Math.round(v * MILLI) }))}
              suffix="sCC"
            />
          </div>
        </div>

        {/* Pricing mode + save */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Pricing mode:</span>
          {(['fixed', 'dynamic'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSettings((s) => ({ ...s, pricingMode: m }))}
              style={{
                ...btn(settings.pricingMode === m),
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', maxWidth: 320 }}>
            {settings.pricingMode === 'fixed'
              ? 'Held at the fixed floor — Silver £0.001, Gold £0.01.'
              : 'AccountantClaw may raise prices above the floor as adoption grows.'}
          </span>
          <div style={{ flex: 1 }} />
          {savedAt > 0 && <span style={{ fontSize: '0.78rem', color: '#34d399' }}>Saved</span>}
          <button style={btn(true)} disabled={saving} onClick={() => save(settings)}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      {/* CVC — the chat-inference coin AccountantClaw is licensed to mint */}
      <CvcPanel cvc={cvc} gas={gas} onChange={setCvc} onReload={load} />

      {/* Advisor + ledger */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '1rem', marginTop: '1rem' }} className="ac-split">
        <Advisor onApply={(s) => setSuggestion(s)} />
        <LedgerPanel ledger={ledger} />
      </div>

      <style>{`@media (max-width: 820px){ .ac-split{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

/* ----------------------------------------------------------------- subviews */

function Stat({ icon: Icon, label, value, sub, tint }: { icon: any; label: string; value: string; sub?: string; tint: string }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
        <Icon size={15} color={tint} />
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.05rem' }}>
        <Icon size={17} color="var(--accent-light)" />
        {title}
      </div>
      {hint && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function RateRow({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix: string
  step?: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
      <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        style={{ ...inputStyle, maxWidth: 80, textAlign: 'center' }}
      />
      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', width: 32 }}>{suffix}</span>
    </div>
  )
}

function LedgerPanel({ ledger }: { ledger: LedgerRow[] }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <SectionTitle icon={Coins} title="Recent mints" hint="Every coin minted across the economy." />
      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 360, overflowY: 'auto' }}>
        {ledger.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>
            No coins minted yet. Chat with a character to mint Silver, or promote a cluster / apply training to mine Gold.
          </div>
        )}
        {ledger.map((row) => {
          const isGold = row.coin === 'gold'
          const meta = isGold ? COINS.gold : COINS.silver
          return (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.5rem 0.6rem',
                background: 'var(--bg-primary)',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{meta.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.reason || row.source}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {row.source} · {timeAgo(row.createdAt)}
                </div>
              </div>
              <span style={{ fontWeight: 800, color: meta.color, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                +{formatCoinsExact(row.amountMilli)} {meta.symbol}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Advisor({ onApply }: { onApply: (s: { silver: number; gold: number }) => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const counter = useRef(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return
      setInput('')
      const history = messages.map((m) => ({ role: m.role, content: m.content }))
      setMessages((p) => [...p, { id: `u${counter.current++}`, role: 'user', content: trimmed }])
      setLoading(true)
      try {
        const res = await fetch('/api/accountantclaw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, history }),
        })
        const data = await res.json().catch(() => ({}))
        if (data?.suggestion) onApply(data.suggestion)
        const reply = data?.reply || data?.error || 'AccountantClaw is unavailable right now.'
        setMessages((p) => [...p, { id: `a${counter.current++}`, role: 'assistant', content: reply }])
      } catch {
        setMessages((p) => [...p, { id: `a${counter.current++}`, role: 'assistant', content: 'Failed to reach AccountantClaw.' }])
      } finally {
        setLoading(false)
      }
    },
    [loading, messages, onApply],
  )

  const PROMPTS = [
    'Should I raise the Silver price yet?',
    'How do I keep the coins attractive to creators?',
    'Price both coins for 10 million chats a month.',
  ]

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
      <SectionTitle icon={Wand2} title="AccountantClaw advisor" hint="Ask the monetization wizard how to price the coins as you take off." />
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', margin: '0.7rem 0', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 320 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <p style={{ marginBottom: '0.6rem' }}>
              AccountantClaw reads the live economy and recommends a price for each coin. Try:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {PROMPTS.map((p) => (
                <button key={p} style={{ ...btn(), justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => send(p)}>
                  <Sparkles size={13} /> {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              padding: '0.55rem 0.75rem',
              borderRadius: 12,
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-primary)',
              color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
              border: m.role === 'user' ? 'none' : '1px solid var(--border)',
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            AccountantClaw is crunching the numbers…
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        style={{ display: 'flex', gap: '0.5rem' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AccountantClaw about pricing…"
          style={inputStyle}
        />
        <button type="submit" style={btn(true)} disabled={loading || !input.trim()}>
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}

/* --------------------------------------------------------------- CVC panel */

/* CharacterVerse Coins — the third coin, and the only one AccountantClaw can
 * mint out of thin air.
 *
 * CVC is deliberately not money. Silver and Gold are what a creator EARNS and
 * they carry a price; CVC is the GAS a chatter spends to run character chat.
 * Every reply burns a little, and every account is granted a starter balance
 * the first time it chats so it always has gas in the tank. Because it measures
 * usage rather than value it has no price at all and never counts toward market
 * value — which is what keeps earning and spending cleanly separated.
 *
 * The minting privilege is a real switch: revoke it and the server refuses to
 * mint no matter who asks. */
function CvcPanel({
  cvc,
  gas,
  onChange,
  onReload,
}: {
  cvc: CvcSettings
  gas: GasSummary | null
  onChange: (next: CvcSettings) => void
  onReload: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState(1000)
  const [minting, setMinting] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const saveCvc = async (next: CvcSettings) => {
    setSaving(true)
    setError('')
    const res = await fetch('/api/coins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateCvc', cvc: next }),
    })
      .then((r) => r.json())
      .catch(() => null)
    if (res?.cvc) onChange(res.cvc)
    setSaving(false)
    setSavedAt(Date.now())
    onReload()
  }

  const togglePrivilege = () => {
    const next = { ...cvc, accountantCanMintCvc: !cvc.accountantCanMintCvc }
    onChange(next)
    void saveCvc(next)
  }

  const mint = async () => {
    setMinting(true)
    setNote('')
    setError('')
    try {
      const res = await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mintCvc',
          sessionId: target.trim(),
          coins: amount,
          reason: 'AccountantClaw minted CVC',
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d?.error || 'Minting failed.')
        return
      }
      setNote(`Minted ${Number(d.coins).toLocaleString('en-GB')} CVC into ${target.trim()}.`)
      setTarget('')
      onReload()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setMinting(false)
    }
  }

  const granted = cvc.accountantCanMintCvc

  return (
    <div style={{ ...card, marginTop: '1rem', borderColor: `${CVC.color}55` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <SectionTitle
            icon={Fuel}
            title="CharacterVerse Coin — the inference gas"
            hint="Not money: CVC has no price and never counts toward market value. It is the gas a chatter spends to run character chat."
          />
        </div>
        {/* The privilege, shown as granted or revoked. */}
        <button
          onClick={togglePrivilege}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.55rem 0.9rem',
            borderRadius: 999,
            border: granted ? 'none' : '1px solid #f8717166',
            background: granted ? 'linear-gradient(135deg, #34d399, #059669)' : 'rgba(248,113,113,0.1)',
            color: granted ? '#04211a' : '#f87171',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: saving ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
          title={
            granted
              ? 'Minting privilege granted — click to revoke.'
              : 'Minting privilege revoked — click to grant it back.'
          }
        >
          {granted ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
          {granted ? 'Minting privilege granted' : 'Minting privilege revoked'}
        </button>
      </div>

      {/* The gas economics AccountantClaw controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: CVC.color }}>
            {CVC.emoji} Gas economics
          </div>
          <RateRow
            label="Burned per character reply"
            value={cvc.cvcPerReplyMilli / MILLI}
            step={0.1}
            onChange={(v) => onChange({ ...cvc, cvcPerReplyMilli: Math.round(v * MILLI) })}
            suffix="CVC"
          />
          <RateRow
            label="Welcome grant on first chat"
            value={cvc.cvcWelcomeMilli / MILLI}
            step={10}
            onChange={(v) => onChange({ ...cvc, cvcWelcomeMilli: Math.round(v * MILLI) })}
            suffix="CVC"
          />
          <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: '0.5rem' }}>
            At {formatCoinsExact(cvc.cvcPerReplyMilli)} CVC per reply, the welcome grant of{' '}
            {formatCoinsExact(cvc.cvcWelcomeMilli)} CVC covers roughly{' '}
            {cvc.cvcPerReplyMilli > 0
              ? Math.floor(cvc.cvcWelcomeMilli / cvc.cvcPerReplyMilli).toLocaleString('en-GB')
              : '∞'}{' '}
            replies before an account needs a top-up.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem' }}>
            {savedAt > 0 && <span style={{ fontSize: '0.78rem', color: '#34d399' }}>Saved</span>}
            <div style={{ flex: 1 }} />
            <button style={btn(true)} disabled={saving} onClick={() => saveCvc(cvc)}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save gas economics'}
            </button>
          </div>
        </div>

        {/* Live issued vs. burned */}
        <div>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: CVC.color }}>
            <Flame size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Issued vs. burned
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <GasStat label="Issued" value={`${formatCoinsExact(gas?.issuedMilli || 0)} CVC`} tint="#34d399" />
            <GasStat label="Burned on inference" value={`${formatCoinsExact(gas?.burnedMilli || 0)} CVC`} tint="#f87171" />
            <GasStat label="Outstanding in wallets" value={`${formatCoinsExact(gas?.outstandingMilli || 0)} CVC`} tint={CVC.color} />
            <GasStat label="Accounts holding gas" value={(gas?.accounts || 0).toLocaleString('en-GB')} tint="#60a5fa" />
          </div>
          {/* A simple fuel gauge: how much of everything issued is already gone. */}
          <div style={{ marginTop: '0.6rem' }}>
            <div style={{ height: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${gas && gas.issuedMilli > 0 ? Math.min(100, (gas.burnedMilli / gas.issuedMilli) * 100) : 0}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #f5c451, #f87171)',
                }}
              />
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {gas && gas.issuedMilli > 0
                ? `${Math.round((gas.burnedMilli / gas.issuedMilli) * 100)}% of all issued gas has been burned across ${gas.spends.toLocaleString('en-GB')} replies.`
                : 'No gas has been issued yet.'}
            </div>
          </div>
        </div>
      </div>

      {/* Mint fresh CVC into an account */}
      <div
        style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)',
          opacity: granted ? 1 : 0.55,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
          <Wand2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Mint CVC into an account
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Account session ID"
            style={{ ...inputStyle, flex: '1 1 260px', minWidth: 200 }}
          />
          <input
            type="number"
            min={1}
            max={10000000}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            style={{ ...inputStyle, width: 130 }}
          />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>CVC</span>
          <button
            style={btn(true)}
            disabled={!granted || minting || !target.trim() || !amount}
            onClick={mint}
            title={granted ? 'Mint fresh CVC straight into this account.' : 'The minting privilege is revoked.'}
          >
            <Sparkles size={14} /> {minting ? 'Minting…' : 'Mint CVC'}
          </button>
        </div>
        {!granted && (
          <p style={{ fontSize: '0.78rem', color: '#f87171', marginTop: '0.5rem' }}>
            Minting is blocked while the privilege is revoked — the server refuses it too, not just this form.
          </p>
        )}
        {note && <p style={{ fontSize: '0.8rem', color: '#34d399', marginTop: '0.5rem' }}>{note}</p>}
        {error && <p style={{ fontSize: '0.8rem', color: '#f87171', marginTop: '0.5rem' }}>{error}</p>}
      </div>
    </div>
  )
}

function GasStat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div style={{ background: 'var(--bg-primary)', border: `1px solid ${tint}44`, borderRadius: 9, padding: '0.5rem 0.6rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: tint, lineHeight: 1.25 }}>{value}</div>
    </div>
  )
}
