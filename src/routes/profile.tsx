import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Activity,
  Presentation,
  Headset,
  Bot,
  MessageSquare,
  Sparkles,
  PoundSterling,
  Users,
  Coins,
  Building2,
  TrendingUp,
  ShieldCheck,
  Radio,
  Eye,
  MonitorSmartphone,
  MessagesSquare,
  Wand2,
  ExternalLink,
  Fuel,
  Crown,
} from 'lucide-react'
import {
  COINS,
  CVC,
  SURFACE_COIN_LIST,
  anyCoinColor,
  anyCoinEmoji,
  anyCoinSymbol,
  formatCoinsExact,
  formatGbp,
} from '../lib/coins'
import { getRole, isEnterprise } from '../lib/enterprise'
import { getSession } from '../lib/session'
import { CoinWalletStrip, type WalletSummary } from '../components/CoinWalletStrip'

export const Route = createFileRoute('/profile')({ component: ProfilePage })

/* --------------------------------------------------------------------- types */

type CharacterPerf = {
  id: number
  name: string
  avatar: string
  category: string
  isPublic: boolean
  isPrivate: boolean
  chats: number
  msgs: number
  conversations: number
  credits: number
}

type ActivityRow = {
  id: number
  coin: string
  amountMilli: number
  source: string
  reason: string
  createdAt: string
}

type ProfileData = {
  wallet: WalletSummary
  stats: {
    charactersCreated: number
    totalChats: number
    totalMsgs: number
    liveConversations: number
    totalCredits: number
    earningsGbp: number
  }
  myCharacters: CharacterPerf[]
  activity: ActivityRow[]
  org: { orgName: string; seats: number }
  assistQueue: { characterId: number; name: string; avatar: string; conversations: number; chats: number }[]
  gasSummary: { issuedMilli: number; burnedMilli: number; outstandingMilli: number; accounts: number }
  subscription: { plan: string; cycle: string; status: string } | null
}

type View = 'activity' | 'deck' | 'staff'

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

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '1.25rem',
}

function tab(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.6rem 1rem',
    borderRadius: 10,
    border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: '0.9rem',
    fontWeight: 700,
    cursor: 'pointer',
  }
}

/* ---------------------------------------------------------------------- page */

function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  // The Profile opens on the presentation that fits the account: an enterprise
  // owner lands on the business deck, a staff member on the support console,
  // everyone else on their own activity. All three stay switchable.
  const [view, setView] = useState<View>('activity')
  const [identity, setIdentity] = useState<{ enterprise: boolean; role: 'boss' | 'staff' }>({
    enterprise: false,
    role: 'staff',
  })

  useEffect(() => {
    const enterprise = isEnterprise()
    const role = getRole()
    setIdentity({ enterprise, role })
    if (enterprise) setView(role === 'boss' ? 'deck' : 'staff')
  }, [])

  const load = useCallback(() => {
    fetch(`/api/profile?sessionId=${encodeURIComponent(getSession())}`)
      .then((r) => r.json())
      .then((d) => setData(d?.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const badge = identity.enterprise
    ? identity.role === 'boss'
      ? 'Enterprise · Owner'
      : 'Enterprise · Staff'
    : 'Member'

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.75rem 1.25rem 5rem' }}>
      {/* Identity header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 62,
            height: 62,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Crown size={30} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: '0.35rem' }}>
            Your <span className="gradient-text">Profile</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: 999,
                background: 'rgba(124,92,191,0.22)',
                border: '1px solid rgba(124,92,191,0.45)',
                color: 'var(--accent-light)',
              }}
            >
              {badge}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Every activity across CharacterVerse, in one place.
            </span>
          </div>
        </div>
      </div>

      {/* The three presentations */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <button style={tab(view === 'activity')} onClick={() => setView('activity')}>
          <Activity size={16} /> Activity
        </button>
        <button style={tab(view === 'deck')} onClick={() => setView('deck')}>
          <Presentation size={16} /> Business Deck
        </button>
        <button style={tab(view === 'staff')} onClick={() => setView('staff')}>
          <Headset size={16} /> Staff Assist
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Gathering your activity…</p>
      ) : !data ? (
        <p style={{ color: 'var(--text-secondary)' }}>Couldn&apos;t load your profile right now.</p>
      ) : view === 'activity' ? (
        <ActivityView data={data} />
      ) : view === 'deck' ? (
        <BusinessDeck data={data} />
      ) : (
        <StaffAssist data={data} role={identity.role} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------- activity view */

function ActivityView({ data }: { data: ProfileData }) {
  const { wallet, stats, myCharacters, activity } = data

  return (
    <>
      {/* Wallet across all three currencies */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem' }}>
        <BigCoin
          emoji={COINS.silver.emoji}
          label={COINS.silver.label}
          color={COINS.silver.color}
          value={`${formatCoinsExact(wallet.coins.find((c) => c.coin === 'silver')?.milli || 0)} ${COINS.silver.symbol}`}
          sub={`${formatGbp(wallet.coins.find((c) => c.coin === 'silver')?.gbp || 0)} · interaction coin`}
        />
        <BigCoin
          emoji={COINS.gold.emoji}
          label={COINS.gold.label}
          color={COINS.gold.color}
          value={`${formatCoinsExact(wallet.coins.find((c) => c.coin === 'gold')?.milli || 0)} ${COINS.gold.symbol}`}
          sub={`${formatGbp(wallet.coins.find((c) => c.coin === 'gold')?.gbp || 0)} · training coin`}
        />
        <BigCoin
          emoji={CVC.emoji}
          label={CVC.label}
          color={CVC.color}
          value={`${formatCoinsExact(wallet.cvc.milli)} ${CVC.symbol}`}
          sub={`gas · ${formatCoinsExact(wallet.cvc.spentMilli)} spent on inference`}
        />
      </div>

      {/* Surface coins — the rest of the wallet, if any has been minted */}
      {SURFACE_COIN_LIST.some((m) => (wallet.coins.find((c) => c.coin === m.key)?.milli || 0) > 0) && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          {SURFACE_COIN_LIST.map((m) => {
            const milli = wallet.coins.find((c) => c.coin === m.key)?.milli || 0
            if (!milli) return null
            return (
              <span
                key={m.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.7rem',
                  borderRadius: 999,
                  background: `${m.color}1a`,
                  border: `1px solid ${m.color}55`,
                  color: m.color,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                {m.emoji} {formatCoinsExact(milli)} {m.symbol}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>· {m.surface}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Headline stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.75rem',
          margin: '1rem 0',
        }}
      >
        <Stat icon={Bot} tint="#7c5cbf" label="Characters created" value={String(stats.charactersCreated)} />
        <Stat icon={MessageSquare} tint="#60a5fa" label="Total chats" value={stats.totalChats.toLocaleString('en-GB')} />
        <Stat icon={Sparkles} tint="#34d399" label="Messages engaged" value={stats.totalMsgs.toLocaleString('en-GB')} />
        <Stat
          icon={PoundSterling}
          tint="#f5c451"
          label="Earned (CC)"
          value={formatGbp(stats.earningsGbp)}
          sub={`${stats.totalCredits.toLocaleString('en-GB')} CC`}
        />
        <Stat icon={Users} tint="#e879f9" label="Live conversations" value={String(stats.liveConversations)} />
      </div>

      <div className="cv-profile-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: '1rem' }}>
        {/* Per-character performance */}
        <div style={card}>
          <SectionTitle icon={Bot} title="Your characters" hint="Everything you've created and how it's performing." />
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {myCharacters.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', padding: '1.25rem 0', textAlign: 'center' }}>
                No characters yet. <Link to="/create" style={{ color: 'var(--accent-light)' }}>Create your first one →</Link>
              </div>
            )}
            {myCharacters.map((c) => (
              <Link
                key={c.id}
                to="/characters/$id"
                params={{ id: String(c.id) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7rem',
                  padding: '0.65rem 0.75rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{c.avatar}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{c.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      · {c.isPrivate ? 'private' : c.isPublic ? 'public' : 'unlisted'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {c.category} · {c.chats} chats · {c.msgs} msgs
                  </div>
                </div>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: COINS.silver.color, whiteSpace: 'nowrap' }}>
                  {c.credits.toLocaleString('en-GB')} CC
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Coin activity feed */}
        <div style={card}>
          <SectionTitle icon={Coins} title="Recent activity" hint="Your coin ledger — CC earned and CVC spent." />
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 460, overflowY: 'auto' }}>
            {activity.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', padding: '1.25rem 0', textAlign: 'center' }}>
                No coin activity yet. Chat with a character to mint Silver and burn a little CVC gas.
              </div>
            )}
            {activity.map((row) => {
              const negative = row.amountMilli < 0
              const color = anyCoinColor(row.coin)
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.5rem 0.6rem',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 9,
                  }}
                >
                  <span style={{ fontSize: '1.05rem' }}>{anyCoinEmoji(row.coin)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.reason || row.source}
                    </div>
                    <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>
                      {row.source} · {timeAgo(row.createdAt)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      whiteSpace: 'nowrap',
                      color: negative ? '#f87171' : color,
                    }}
                  >
                    {negative ? '' : '+'}
                    {formatCoinsExact(row.amountMilli)} {anyCoinSymbol(row.coin)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Gas explainer — the honest shape of the economy */}
      <div style={{ ...card, marginTop: '1rem', borderColor: `${CVC.color}44` }}>
        <SectionTitle icon={Fuel} title="Money vs. usage" hint="Two halves of the economy that never blur." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Silver and Gold CC are money.</strong> They are what a creator
            earns — they hold a price, and they roll up into market value.
          </p>
          <p style={{ fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: CVC.color }}>CVC is gas.</strong> Every reply a character generates burns{' '}
            {formatCoinsExact(data.wallet.cvc.perReplyMilli)} CVC, and your account was granted{' '}
            {formatCoinsExact(data.wallet.cvc.welcomeMilli)} CVC the first time it chatted. It has no price and never counts
            toward market value — earning and spending stay separate.
          </p>
        </div>
        <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link to="/wallet" style={linkBtn()}>
            <Coins size={13} /> Wallet &amp; Vault
          </Link>
          <Link to="/billing" style={linkBtn()}>
            <TrendingUp size={13} /> Billing &amp; Plans
          </Link>
          <Link to="/accountantclaw" style={linkBtn()}>
            <Wand2 size={13} /> AccountantClaw
          </Link>
        </div>
      </div>

      <style>{`@media (max-width: 900px){ .cv-profile-split{ grid-template-columns: 1fr !important; } }`}</style>
    </>
  )
}

/* ------------------------------------------------------------- business deck */

/* Enterprise owners land here: a slide-style pitch deck that presents the
 * organization the way an enterprise buyer would want to see it, rather than a
 * stats dashboard. Each slide is one thing a buyer asks about. */
function BusinessDeck({ data }: { data: ProfileData }) {
  const { org, stats, wallet, gasSummary, myCharacters } = data

  const silverGbp = wallet.coins.find((c) => c.coin === 'silver')?.gbp || 0
  const goldGbp = wallet.coins.find((c) => c.coin === 'gold')?.gbp || 0
  // CVC is deliberately absent from market value: it is usage, not value.
  const marketValue = silverGbp + goldGbp
  const privateCount = myCharacters.filter((c) => c.isPrivate).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Slide n={1} title={org.orgName} kicker="The organization">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
          <DeckStat label="Licensed seats" value={org.seats.toLocaleString('en-GB')} tint="#60a5fa" />
          <DeckStat label="Characters in service" value={String(stats.charactersCreated)} tint="#7c5cbf" />
          <DeckStat label="Private to the org" value={String(privateCount)} tint="#e879f9" />
          <DeckStat label="Live conversations" value={String(stats.liveConversations)} tint="#34d399" />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginTop: '0.9rem' }}>
          {org.orgName} runs its own roster of characters inside CharacterVerse — private to the org, governed from one
          place, and measured against the seats it licenses.
        </p>
      </Slide>

      <Slide n={2} title="Market value" kicker="The monetization coins">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
          <DeckStat label="Silver CC value" value={formatGbp(silverGbp)} tint={COINS.silver.color} />
          <DeckStat label="Gold CC value" value={formatGbp(goldGbp)} tint={COINS.gold.color} />
          <DeckStat label="Total market value" value={formatGbp(marketValue)} tint="#34d399" />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginTop: '0.9rem' }}>
          Two coins carry value: Silver, minted from every interaction, and Gold, mined from measured training success.
          The inference coin (CVC) is usage rather than value and is excluded here by design — the deck never inflates
          the number with gas.
        </p>
      </Slide>

      <Slide n={3} title="Traction & usage" kicker="What the org is actually doing">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
          <DeckStat label="Total chats" value={stats.totalChats.toLocaleString('en-GB')} tint="#60a5fa" />
          <DeckStat label="Messages engaged" value={stats.totalMsgs.toLocaleString('en-GB')} tint="#34d399" />
          <DeckStat label="Earned back (CC)" value={formatGbp(stats.earningsGbp)} tint="#f5c451" />
          <DeckStat
            label="Gas burned on inference"
            value={`${formatCoinsExact(gasSummary.burnedMilli)} CVC`}
            tint={CVC.color}
          />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginTop: '0.9rem' }}>
          Every private character used by staff earns at the conference rate, so the organization accrues real money-back
          against its subscription while it works.
        </p>
      </Slide>

      <Slide n={4} title="The coin model" kicker="How the economy is shaped">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.75rem' }}>
          <DeckPoint
            emoji={COINS.silver.emoji}
            title="Silver CC — earn"
            body="Minted on every interaction. The everyday coin: engagement pays the creator."
            tint={COINS.silver.color}
          />
          <DeckPoint
            emoji={COINS.gold.emoji}
            title="Gold CC — earn"
            body="Mined from measured training success. Ten Silver by value; a subscription is the only other way to mint it."
            tint={COINS.gold.color}
          />
          <DeckPoint
            emoji={CVC.emoji}
            title="CVC — spend"
            body="The chat-inference coin. Gas burned per reply, granted on first chat. No price, never market value."
            tint={CVC.color}
          />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginTop: '0.9rem' }}>
          Revenue on one side, the cost of running inference on the other. Separating the two gives the economy an
          honest shape — and AccountantClaw holds the lever that keeps accounts topped up with the gas they need to chat.
        </p>
      </Slide>

      <Slide n={5} title="Governance" kicker="Built in, not bolted on">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
          <DeckLink to="/enterprise" icon={Building2} label="Enterprise workspace" body="Org, seats and access control." />
          <DeckLink to="/audit" icon={ShieldCheck} label="Audit dashboard" body="Trimmed negatives and escalation." />
          <DeckLink to="/controltower" icon={Radio} label="Control Tower" body="Every agent, one console." />
          <DeckLink to="/studio" icon={Presentation} label="Studio" body="Govern every surface of the platform." />
          <DeckLink to="/accountantclaw" icon={Wand2} label="AccountantClaw" body="Coin pricing and CVC minting." />
          <DeckLink to="/billing" icon={TrendingUp} label="Billing & Plans" body="Managed hosting and monthly grants." />
        </div>
      </Slide>
    </div>
  )
}

/* --------------------------------------------------------------- staff assist */

/* Members of staff get a support console instead of a deck: a role card, a
 * go-on-call switch, the remote-assistance tools they can arm, and a live queue
 * of conversations they can drop into. */

const ASSIST_TOOLS = [
  {
    key: 'copilot',
    icon: MonitorSmartphone,
    label: 'Remote co-pilot',
    body: 'Draft replies alongside a member in a live chat.',
  },
  { key: 'takeover', icon: Headset, label: 'Live takeover', body: 'Step in and drive a stuck conversation directly.' },
  {
    key: 'whisper',
    icon: MessagesSquare,
    label: 'Whisper suggestions',
    body: 'Send private hints the member sees but the user doesn’t.',
  },
  {
    key: 'screen',
    icon: MonitorSmartphone,
    label: 'Screen assist',
    body: 'Guide a member through their screen step by step.',
  },
  { key: 'panopticon', icon: Eye, label: 'Panopticon Watch', body: 'Observe flagged tasks and hold work that can’t be trusted.' },
] as const

function StaffAssist({ data, role }: { data: ProfileData; role: 'boss' | 'staff' }) {
  const [onCall, setOnCall] = useState(false)
  const [armed, setArmed] = useState<Record<string, boolean>>({})
  const [dispatched, setDispatched] = useState<{ id: string; name: string; tool: string }[]>([])

  const armedTools = useMemo(() => ASSIST_TOOLS.filter((t) => armed[t.key]), [armed])

  const dispatch = (name: string) => {
    const tool = armedTools[0]?.label || 'Remote co-pilot'
    setDispatched((prev) => [{ id: `${Date.now()}-${name}`, name, tool }, ...prev].slice(0, 8))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Role card + on-call switch */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #34d399, #0f766e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Headset size={24} color="#04211a" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Staff support console — {role === 'boss' ? 'Owner / auditor' : 'Staff member'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Remote assistance abilities for members who need a hand mid-conversation.
          </div>
        </div>
        <button
          onClick={() => setOnCall((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.6rem 1rem',
            borderRadius: 999,
            border: onCall ? 'none' : '1px solid var(--border)',
            background: onCall ? 'linear-gradient(135deg, #34d399, #059669)' : 'transparent',
            color: onCall ? '#04211a' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          <Radio size={15} /> {onCall ? 'On call' : 'Go on-call'}
        </button>
      </div>

      {/* Arm the remote-assistance tools */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.75rem' }}>
        {ASSIST_TOOLS.map((t) => {
          const on = !!armed[t.key]
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setArmed((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
              style={{
                ...card,
                textAlign: 'left',
                cursor: 'pointer',
                borderColor: on ? '#34d39988' : 'var(--border)',
                background: on ? 'rgba(52,211,153,0.08)' : 'var(--bg-card)',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <Icon size={16} color={on ? '#34d399' : 'var(--accent-light)'} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1 }}>{t.label}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: on ? '#34d399' : 'var(--text-secondary)' }}>
                  {on ? 'ARMED' : 'OFF'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t.body}</div>
            </button>
          )
        })}
      </div>

      <div className="cv-profile-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: '1rem' }}>
        {/* Live assist queue */}
        <div style={card}>
          <SectionTitle icon={Users} title="Assist queue" hint="Live conversations you can jump into." />
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.assistQueue.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', padding: '1.25rem 0', textAlign: 'center' }}>
                Nothing in the queue — no conversations are running right now.
              </div>
            )}
            {data.assistQueue.map((q) => (
              <div
                key={q.characterId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7rem',
                  padding: '0.6rem 0.75rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{q.avatar}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{q.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {q.conversations} conversation{q.conversations === 1 ? '' : 's'} · {q.chats} chats
                  </div>
                </div>
                <button onClick={() => dispatch(q.name)} style={linkBtn(true)}>
                  <Headset size={13} /> Assist
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* What has been dispatched this session */}
          <div style={card}>
            <SectionTitle icon={Radio} title="Dispatched assists" hint="What you've sent this session." />
            <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {dispatched.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
                  Pick a conversation from the queue to send a remote assist.
                  {armedTools.length === 0 && ' Arm a tool above first to choose how you help.'}
                </p>
              ) : (
                dispatched.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.45rem 0.6rem',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 9,
                      fontSize: '0.82rem',
                    }}
                  >
                    <Headset size={14} color="#34d399" />
                    <span style={{ flex: 1 }}>
                      {d.tool} → <strong>{d.name}</strong>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>sent</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick links through to the deeper control surfaces */}
          <div style={card}>
            <SectionTitle icon={ExternalLink} title="Remote surfaces" hint="Deeper tools for remote work." />
            <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link to="/controltower" style={linkBtn()}>Control Tower ↗</Link>
              <Link to="/audit" style={linkBtn()}>Audit ↗</Link>
              <Link to="/cabinet" style={linkBtn()}>ChatCabinet ↗</Link>
              <Link to="/studio" style={linkBtn()}>Studio ↗</Link>
            </div>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 900px){ .cv-profile-split{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ subviews */

function BigCoin({ emoji, label, color, value, sub }: { emoji: string; label: string; color: string; value: string; sub: string }) {
  return (
    <div style={{ ...card, borderColor: `${color}55` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '1.3rem' }}>{emoji}</span>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub, tint }: { icon: any; label: string; value: string; sub?: string; tint: string }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.76rem', marginBottom: '0.35rem' }}>
        <Icon size={14} color={tint} />
        {label}
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800, fontSize: '1.02rem' }}>
        <Icon size={17} color="var(--accent-light)" />
        {title}
      </div>
      {hint && <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function Slide({ n, title, kicker, children }: { n: number; title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        ...card,
        padding: '1.5rem',
        background: 'linear-gradient(160deg, var(--bg-card), rgba(124,92,191,0.06))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.15rem' }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: 'rgba(124,92,191,0.25)',
            border: '1px solid rgba(124,92,191,0.5)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.72rem',
            fontWeight: 800,
            color: 'var(--accent-light)',
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {kicker}
        </span>
      </div>
      <h2 style={{ fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)', fontWeight: 800, margin: '0 0 1rem' }}>{title}</h2>
      {children}
    </section>
  )
}

function DeckStat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div style={{ background: 'var(--bg-primary)', border: `1px solid ${tint}44`, borderRadius: 10, padding: '0.75rem 0.85rem' }}>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color: tint, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

function DeckPoint({ emoji, title, body, tint }: { emoji: string; title: string; body: string; tint: string }) {
  return (
    <div style={{ background: 'var(--bg-primary)', border: `1px solid ${tint}44`, borderRadius: 10, padding: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.92rem', color: tint }}>
        <span>{emoji}</span>
        {title}
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: '0.3rem' }}>{body}</div>
    </div>
  )
}

function DeckLink({ to, icon: Icon, label, body }: { to: string; icon: any; label: string; body: string }) {
  return (
    <Link
      to={to}
      style={{
        display: 'block',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '0.75rem 0.85rem',
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
        <Icon size={15} color="var(--accent-light)" />
        {label}
        <ExternalLink size={12} color="var(--text-secondary)" />
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{body}</div>
    </Link>
  )
}

function linkBtn(primary = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.45rem 0.8rem',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-secondary)',
    fontSize: '0.82rem',
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
  }
}

/* Re-exported so surface pages can drop the same wallet in without importing
 * from two places. */
export { CoinWalletStrip }
