import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Sparkles,
  Building2,
  Coins,
  Gift,
  Loader2,
  X,
} from 'lucide-react'
import {
  PLANS,
  SELF_SERVE_PLANS,
  ENTERPRISE_PLAN,
  COMPARE_ROWS,
  PRICING_FAQ,
  effectiveMonthly,
  headlineSavingPct,
  formatPlanPrice,
  findPlan,
  type Cycle,
  type Plan,
} from '../lib/plans'
import { COINS, CVC, formatCoinsExact } from '../lib/coins'
import { getSession } from '../lib/session'

export const Route = createFileRoute('/billing')({ component: BillingPage })

type Subscription = {
  plan: string
  cycle: string
  machineSize: string
  status: string
  lastGrantMonth: string
}

type BillingState = {
  subscription: Subscription | null
  balances: Record<string, number>
  month: string
  grantDue: boolean
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '1.4rem',
}

function BillingPage() {
  const [cycle, setCycle] = useState<Cycle>('yearly')
  const [state, setState] = useState<BillingState | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  // Ultra is the one tier where the subscriber picks their machine.
  const [ultraSize, setUltraSize] = useState(
    SELF_SERVE_PLANS.find((p) => p.machineSizes)?.machineSizes?.[1] || 'Ultra 32',
  )
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const load = useCallback(() => {
    fetch(`/api/billing?sessionId=${encodeURIComponent(getSession())}`)
      .then((r) => r.json())
      .then((d) => {
        setState(d)
        if (d?.subscription?.cycle === 'monthly' || d?.subscription?.cycle === 'yearly') {
          setCycle(d.subscription.cycle)
        }
        if (d?.subscription?.machineSize) setUltraSize(d.subscription.machineSize)
      })
      .catch(() => setState(null))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function post(action: string, extra: Record<string, unknown> = {}, label = action) {
    setBusy(label)
    setMsg('')
    setErr('')
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId: getSession(), ...extra }),
      })
      const d = await res.json()
      if (!res.ok) {
        setErr(d?.error || 'Something went wrong.')
        return
      }
      setState({
        subscription: d.subscription ?? null,
        balances: d.balances ?? {},
        month: d.month,
        grantDue: !!d.grantDue,
      })
      if (d.granted && d.grant) {
        setMsg(
          `Minted this month's grant: ${d.grant.silver} sCC + ${d.grant.gold} gCC + ${Number(
            d.grant.cvc,
          ).toLocaleString('en-GB')} CVC gas.`,
        )
      } else if (action === 'subscribe') {
        setMsg("Plan updated. This month's grant was already minted, so nothing was double-claimed.")
      } else if (action === 'collect') {
        setMsg('This month’s grant has already been collected.')
      } else if (action === 'cancel') {
        setMsg('Plan cancelled. You keep every coin already minted.')
      }
    } catch {
      setErr('Network error — please try again.')
    } finally {
      setBusy('')
    }
  }

  const current = state?.subscription && state.subscription.status === 'active' ? findPlan(state.subscription.plan) : undefined
  const saving = headlineSavingPct()

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '2rem 1.25rem 5rem' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.8rem',
            borderRadius: 999,
            background: 'rgba(124,92,191,0.2)',
            border: '1px solid rgba(124,92,191,0.45)',
            color: 'var(--accent-light)',
            fontSize: '0.78rem',
            fontWeight: 700,
            marginBottom: '0.75rem',
          }}
        >
          <Server size={14} /> Managed agent hosting
        </div>
        <h1 style={{ fontSize: 'clamp(1.9rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.08, marginBottom: '0.6rem' }}>
          Billing &amp; <span className="gradient-text">Plans</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
          Your own hosted agent, running around the clock. Zero setup, zero maintenance, fully private — and every plan
          mints real CharacterVerse currency into your wallet every month.
        </p>
      </div>

      {/* Billing cycle toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.3rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 999,
          }}
        >
          {(['monthly', 'yearly'] as Cycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1.1rem',
                borderRadius: 999,
                border: 'none',
                background: cycle === c ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'transparent',
                color: cycle === c ? '#fff' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {c}
              {c === 'yearly' && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.4rem',
                    borderRadius: 999,
                    background: cycle === 'yearly' ? 'rgba(255,255,255,0.22)' : 'rgba(52,211,153,0.18)',
                    color: cycle === 'yearly' ? '#fff' : '#34d399',
                  }}
                >
                  Save {saving}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Current plan / wallet / collect */}
      {state && (
        <CurrentPlanBar
          state={state}
          plan={current}
          busy={busy}
          onCollect={() => post('collect')}
          onCancel={() => post('cancel')}
        />
      )}

      {(msg || err) && (
        <div
          style={{
            ...card,
            padding: '0.7rem 1rem',
            marginBottom: '1rem',
            borderColor: err ? '#f8717166' : '#34d39966',
            background: err ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.88rem',
          }}
        >
          {err ? <X size={15} color="#f87171" /> : <Sparkles size={15} color="#34d399" />}
          <span style={{ flex: 1 }}>{err || msg}</span>
        </div>
      )}

      {/* The four self-serve plans */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {SELF_SERVE_PLANS.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            cycle={cycle}
            active={current?.key === plan.key}
            busy={busy === `subscribe:${plan.key}`}
            ultraSize={ultraSize}
            onUltraSize={setUltraSize}
            onSubscribe={() =>
              post(
                'subscribe',
                { plan: plan.key, cycle, machineSize: plan.machineSizes ? ultraSize : '' },
                `subscribe:${plan.key}`,
              )
            }
          />
        ))}
      </div>

      {/* Enterprise panel */}
      {ENTERPRISE_PLAN && (
        <EnterprisePanel
          plan={ENTERPRISE_PLAN}
          active={current?.key === 'enterprise'}
          busy={busy === 'subscribe:enterprise'}
          onSubscribe={() => post('subscribe', { plan: 'enterprise', cycle }, 'subscribe:enterprise')}
        />
      )}

      {/* Compare plans */}
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '2.5rem 0 1rem' }}>Compare plans</h2>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={thStyle('left')}>Feature</th>
              {PLANS.map((p) => (
                <th key={p.key} style={{ ...thStyle('center'), color: p.accent }}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, i) => (
              <tr key={row.label} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...tdStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{row.label}</td>
                {PLANS.map((p) => {
                  const v = row.value(p)
                  return (
                    <td key={p.key} style={{ ...tdStyle, textAlign: 'center' }}>
                      {v === 'Included' ? (
                        <Check size={15} color="#34d399" />
                      ) : v === '—' ? (
                        <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                      ) : (
                        v
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pricing FAQ */}
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '2.5rem 0 1rem' }}>Pricing FAQ</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {PRICING_FAQ.map((item, i) => {
          const open = openFaq === i
          return (
            <div key={item.q} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => setOpenFaq(open ? null : i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.95rem 1.1rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.94rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ flex: 1 }}>{item.q}</span>
                <ChevronDown
                  size={17}
                  color="var(--text-secondary)"
                  style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }}
                />
              </button>
              {open && (
                <div
                  style={{
                    padding: '0 1.1rem 1.1rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.88rem',
                    lineHeight: 1.65,
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '2rem' }}>
        Coins land in your <Link to="/wallet" style={{ color: 'var(--accent-light)' }}>Wallet</Link> and show up on your{' '}
        <Link to="/profile" style={{ color: 'var(--accent-light)' }}>Profile</Link> the moment they are minted.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- current plan */

function CurrentPlanBar({
  state,
  plan,
  busy,
  onCollect,
  onCancel,
}: {
  state: BillingState
  plan?: Plan
  busy: string
  onCollect: () => void
  onCancel: () => void
}) {
  const silver = state.balances?.silver || 0
  const gold = state.balances?.gold || 0
  const cvc = state.balances?.cvc || 0

  if (!plan) {
    return (
      <div style={{ ...card, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
        <Gift size={20} color="var(--accent-light)" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700 }}>No plan yet</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Pick a plan below — this month&apos;s coin grant is minted the moment you subscribe.
          </div>
        </div>
        <WalletChips silver={silver} gold={gold} cvc={cvc} />
      </div>
    )
  }

  return (
    <div
      style={{
        ...card,
        marginBottom: '1.25rem',
        borderColor: `${plan.accent}66`,
        background: `linear-gradient(135deg, var(--bg-card), ${plan.accent}12)`,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Current plan
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.25rem', color: plan.accent }}>
          {plan.name}
          {state.subscription?.machineSize ? (
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {' '}
              · {state.subscription.machineSize}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Billed {state.subscription?.cycle || 'monthly'} · grant last minted{' '}
          {state.subscription?.lastGrantMonth || '—'}
        </div>
      </div>

      <WalletChips silver={silver} gold={gold} cvc={cvc} />

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {state.grantDue && (
          <button
            onClick={onCollect}
            disabled={!!busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1rem',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #34d399, #059669)',
              color: '#04211a',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy === 'collect' ? <Loader2 size={14} className="cv-spin" /> : <Gift size={14} />}
            Collect {state.month} mint
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={!!busy}
          style={{
            padding: '0.6rem 0.9rem',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '0.84rem',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          Cancel plan
        </button>
      </div>
    </div>
  )
}

function WalletChips({ silver, gold, cvc }: { silver: number; gold: number; cvc: number }) {
  const chips = [
    { emoji: COINS.silver.emoji, color: COINS.silver.color, text: `${formatCoinsExact(silver)} ${COINS.silver.symbol}` },
    { emoji: COINS.gold.emoji, color: COINS.gold.color, text: `${formatCoinsExact(gold)} ${COINS.gold.symbol}` },
    { emoji: CVC.emoji, color: CVC.color, text: `${formatCoinsExact(cvc)} ${CVC.symbol}` },
  ]
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {chips.map((c) => (
        <span
          key={c.text}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.35rem 0.65rem',
            borderRadius: 999,
            background: `${c.color}18`,
            border: `1px solid ${c.color}55`,
            color: c.color,
            fontSize: '0.82rem',
            fontWeight: 800,
          }}
        >
          {c.emoji} {c.text}
        </span>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- plan cards */

function PlanCard({
  plan,
  cycle,
  active,
  busy,
  ultraSize,
  onUltraSize,
  onSubscribe,
}: {
  plan: Plan
  cycle: Cycle
  active: boolean
  busy: boolean
  ultraSize: string
  onUltraSize: (s: string) => void
  onSubscribe: () => void
}) {
  const monthly = effectiveMonthly(plan, cycle)

  return (
    <div
      style={{
        ...card,
        position: 'relative',
        borderColor: active ? plan.accent : plan.popular ? `${plan.accent}88` : 'var(--border)',
        boxShadow: plan.popular ? `0 0 0 1px ${plan.accent}44` : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {plan.popular && (
        <span
          style={{
            position: 'absolute',
            top: -11,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.2rem 0.7rem',
            borderRadius: 999,
            background: plan.accent,
            color: '#fff',
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Most popular
        </span>
      )}

      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: plan.accent }}>{plan.name}</div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', minHeight: '2.4em', lineHeight: 1.5 }}>
        {plan.tagline}
      </div>

      {/* Price */}
      <div style={{ margin: '0.75rem 0 0.25rem', display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
        <span style={{ fontSize: '2.1rem', fontWeight: 800, lineHeight: 1 }}>{formatPlanPrice(monthly)}</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>/ month</span>
      </div>
      {cycle === 'yearly' ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <s style={{ opacity: 0.65 }}>{formatPlanPrice(plan.monthly)}/mo</s> month-to-month ·{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{formatPlanPrice(plan.yearly)}</strong> billed yearly
        </div>
      ) : (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Billed monthly · {formatPlanPrice(plan.yearly)} if paid yearly
        </div>
      )}

      {/* Specs */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem',
          margin: '0.9rem 0',
          padding: '0.7rem 0.8rem',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: '0.82rem',
        }}
      >
        <Spec icon={Cpu} text={plan.specs.cores} />
        <Spec icon={MemoryStick} text={plan.specs.ram} />
        <Spec icon={HardDrive} text={plan.specs.ssd} />
      </div>

      {/* Ultra's machine-size selector */}
      {plan.machineSizes && (
        <div style={{ marginBottom: '0.9rem' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 700 }}>
            Machine size
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {plan.machineSizes.map((s) => (
              <button
                key={s}
                onClick={() => onUltraSize(s)}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.2rem',
                  borderRadius: 8,
                  border: `1px solid ${ultraSize === s ? plan.accent : 'var(--border)'}`,
                  background: ultraSize === s ? `${plan.accent}22` : 'transparent',
                  color: ultraSize === s ? plan.accent : 'var(--text-secondary)',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.replace('Ultra ', '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The monthly mint */}
      <GrantBlock plan={plan} />

      {/* Feature checklist */}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0.9rem 0 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: 'flex', gap: '0.45rem', fontSize: '0.82rem', lineHeight: 1.45 }}>
            <Check size={14} color={plan.accent} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSubscribe}
        disabled={busy}
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '0.7rem',
          borderRadius: 10,
          border: active ? `1px solid ${plan.accent}` : 'none',
          background: active ? 'transparent' : `linear-gradient(135deg, ${plan.accent}, ${plan.accent}bb)`,
          color: active ? plan.accent : '#0d0a17',
          fontWeight: 800,
          fontSize: '0.9rem',
          cursor: busy ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
        }}
      >
        {busy && <Loader2 size={14} className="cv-spin" />}
        {active ? 'Current plan — re-apply' : `Choose ${plan.name}`}
      </button>
    </div>
  )
}

function GrantBlock({ plan }: { plan: Plan }) {
  return (
    <div
      style={{
        padding: '0.7rem 0.8rem',
        background: 'rgba(245,196,81,0.07)',
        border: '1px solid rgba(245,196,81,0.3)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontSize: '0.72rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: COINS.gold.color,
          marginBottom: '0.35rem',
        }}
      >
        <Coins size={13} /> Minted every month
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.82rem' }}>
        <span>
          {COINS.silver.emoji} <strong>{plan.grant.silver}</strong> Silver CC
        </span>
        <span>
          {COINS.gold.emoji} <strong>{plan.grant.gold}</strong> Gold CC{' '}
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>(otherwise training-only)</span>
        </span>
        <span>
          {CVC.emoji} <strong>{plan.grant.cvc.toLocaleString('en-GB')}</strong> CVC{' '}
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>inference gas</span>
        </span>
      </div>
    </div>
  )
}

function Spec({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <Icon size={14} color="var(--accent-light)" style={{ flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  )
}

/* --------------------------------------------------------- enterprise panel */

function EnterprisePanel({
  plan,
  active,
  busy,
  onSubscribe,
}: {
  plan: Plan
  active: boolean
  busy: boolean
  onSubscribe: () => void
}) {
  return (
    <div
      style={{
        ...card,
        marginTop: '1rem',
        borderColor: `${plan.accent}66`,
        background: `linear-gradient(135deg, var(--bg-card), ${plan.accent}12)`,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.35fr)',
        gap: '1.5rem',
      }}
      className="cv-ent-panel"
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <Building2 size={20} color={plan.accent} />
          <span style={{ fontWeight: 800, fontSize: '1.35rem', color: plan.accent }}>{plan.name}</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '0.9rem' }}>
          {plan.tagline}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.9rem' }}>
          <span style={{ fontSize: '1.9rem', fontWeight: 800 }}>Custom</span>
          <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>quoted to your org</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.84rem', marginBottom: '1rem' }}>
          <Spec icon={Cpu} text={plan.specs.cores} />
          <Spec icon={MemoryStick} text={plan.specs.ram} />
          <Spec icon={HardDrive} text={plan.specs.ssd} />
        </div>
        <GrantBlock plan={plan} />
        <button
          onClick={onSubscribe}
          disabled={busy}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.7rem',
            borderRadius: 10,
            border: active ? `1px solid ${plan.accent}` : 'none',
            background: active ? 'transparent' : `linear-gradient(135deg, ${plan.accent}, #a855f7)`,
            color: active ? plan.accent : '#1a0d1f',
            fontWeight: 800,
            fontSize: '0.9rem',
            cursor: busy ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
          }}
        >
          {busy && <Loader2 size={14} className="cv-spin" />}
          {active ? 'Current plan — re-apply' : 'Start Enterprise'}
        </button>
        <Link
          to="/enterprise"
          style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--accent-light)' }}
        >
          Open the Enterprise workspace →
        </Link>
      </div>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '0.4rem',
          alignContent: 'start',
        }}
      >
        {plan.features.map((f) => (
          <li key={f} style={{ display: 'flex', gap: '0.45rem', fontSize: '0.84rem', lineHeight: 1.45 }}>
            <Check size={14} color={plan.accent} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
          </li>
        ))}
      </ul>

      <style>{`
        @media (max-width: 860px){ .cv-ent-panel{ grid-template-columns: 1fr !important; } }
        .cv-spin { animation: cv-spin 0.9s linear infinite; }
        @keyframes cv-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderTop: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

function thStyle(align: 'left' | 'center'): React.CSSProperties {
  return {
    padding: '0.75rem 0.8rem',
    textAlign: align,
    fontSize: '0.8rem',
    fontWeight: 800,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  }
}
