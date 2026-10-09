import { useState, useEffect, useMemo, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Trophy,
  Crown,
  MessageCircle,
  PawPrint,
  Users,
  Award,
  Plug,
  Globe,
  X,
  PoundSterling,
  Coins,
  Building2,
  ExternalLink,
} from 'lucide-react'
import {
  creditsFor,
  formatCc,
  formatGbp,
  CHANNEL_RATE,
  APP_RATE,
  EXTERNAL_RATE,
  APPS,
  EXTERNALS,
  type CreditBreakdown,
} from '../lib/credits'
import { AvatarFill } from '../lib/avatar'

/* --------------------------------------------------------------------- types */

type CreditRow = {
  character: { id: number; name: string; avatar: string; category: string; tagline: string }
  chatMsgs: number
  clawMsgs: number
  conferenceMsgs: number
  appConnections: string[]
  externalPlatforms: string[]
  isPrivate: boolean
}

type Computed = CreditRow & { cc: CreditBreakdown; engagementPct: number; rank: number }

/* ------------------------------------------------------------------- helpers */

const RANK_COLOR = ['#fbbf24', '#cbd5e1', '#d2865b'] // gold / silver / bronze

function avatarBox(size: number) {
  return {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
    fontSize: size * 0.5,
    flexShrink: 0,
    overflow: 'hidden',
    background: 'linear-gradient(135deg, rgba(124,92,191,0.4), rgba(79,70,229,0.25))',
    border: '1px solid rgba(124,92,191,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const
}

/* ====================================================================== page */

function LeaderboardPage() {
  const [rows, setRows] = useState<CreditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [scope, setScope] = useState<'public' | 'enterprise'>('public')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(
    (showSpinner = false) => {
      if (showSpinner) setLoading(true)
      fetch(`/api/credits?scope=${scope}`)
        .then((r) => r.json())
        .then((data) => {
          setRows(Array.isArray(data) ? data : [])
          setError(false)
          setLoading(false)
        })
        .catch(() => {
          setError(true)
          setLoading(false)
        })
    },
    [scope],
  )

  // Initial load + reload when scope changes.
  useEffect(() => {
    load(true)
  }, [load])

  // Real-time: poll every 8s so freshly earned CC shows up without a refresh.
  useEffect(() => {
    const t = setInterval(() => load(false), 8000)
    return () => clearInterval(t)
  }, [load])

  const computed = useMemo<Computed[]>(() => {
    const enriched = rows.map((r) => ({ ...r, cc: creditsFor(r) }))
    const totalEngagement = enriched.reduce((s, r) => s + r.cc.engagementCc, 0) || 1
    return enriched
      .map((r) => ({
        ...r,
        engagementPct: (r.cc.engagementCc / totalEngagement) * 100,
      }))
      .sort((a, b) => b.cc.total - a.cc.total)
      .map((r, i) => ({ ...r, rank: i + 1 }))
  }, [rows])

  const totals = useMemo(() => {
    const cc = computed.reduce((s, r) => s + r.cc.total, 0)
    return { cc, gbp: cc, characters: computed.length }
  }, [computed])

  const selected = computed.find((r) => r.character.id === selectedId) || null

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* ---------------------------------------------------------------- hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(900px 320px at 50% -10%, rgba(124,92,191,0.22), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.25rem 2rem', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Trophy size={20} color="#fbbf24" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-light)', letterSpacing: '0.04em' }}>
              CHARACTER CREDITS
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginLeft: '0.5rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#34d399',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#34d399', boxShadow: '0 0 0 0 rgba(52,211,153,0.7)' }} className="cc-pulse" />
              live
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 800, lineHeight: 1.05, marginBottom: '0.85rem' }}>
            The <span className="gradient-text">Leaderboard</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 640, marginBottom: '1.5rem' }}>
            Characters earn 🥈 Silver Character Credits (CC) every time they&apos;re engaged with — the
            more refined the personality, the higher the engagement, the more Silver. Silver is real
            value too:
            <strong style={{ color: 'var(--text-primary)' }}> 1&nbsp;Silver&nbsp;CC&nbsp;=&nbsp;£0.001</strong>.
            Training success mines 🥇 Gold CC (£0.01) — priced by AccountantClaw.
          </p>

          {/* earning-rate legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <RatePill icon={MessageCircle} color="#60a5fa" label="Direct Chat" rate={`+${CHANNEL_RATE.chat} sCC / msg`} />
            <RatePill icon={PawPrint} color="#fbbf24" label="CharacterClaw" rate={`+${CHANNEL_RATE.claw} sCC / msg`} />
            <RatePill icon={Users} color="#c084fc" label="Conference Cluster" rate={`+${CHANNEL_RATE.conference} sCC / msg`} />
            <RatePill icon={Award} color="#34d399" label="Chat Milestone" rate="+10–250 sCC" />
            <RatePill icon={Plug} color="#38bdf8" label="App Connected" rate={`+${APP_RATE} sCC once`} />
            <RatePill icon={Globe} color="#f472b6" label="External Platform" rate={`+${EXTERNAL_RATE} sCC once`} />
          </div>

          {/* totals + scope toggle */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <StatChip icon={Coins} label="Total Silver in play" value={formatCc(totals.cc)} />
            <StatChip icon={PoundSterling} label="Market value" value={formatGbp(totals.gbp)} />
            <StatChip icon={Trophy} label="Characters ranked" value={String(totals.characters)} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'inline-flex', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['public', 'enterprise'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.5rem 0.9rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: scope === s ? 'rgba(124,92,191,0.25)' : 'var(--bg-card)',
                    color: scope === s ? 'var(--accent-light)' : 'var(--text-secondary)',
                  }}
                >
                  {s === 'enterprise' && <Building2 size={13} />}
                  {s === 'public' ? 'Public' : 'Enterprise'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- board */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>Loading the leaderboard…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
            Couldn&apos;t load the leaderboard right now.
          </div>
        ) : computed.length === 0 ? (
          <EmptyState />
        ) : (
          <LeaderTable rows={computed} onSelect={(id) => setSelectedId(id)} />
        )}
      </div>

      {/* ---------------------------------------------------------- stat card */}
      {selected && (
        <StatCardModal
          row={selected}
          onClose={() => setSelectedId(null)}
          onMutated={() => load(false)}
        />
      )}

      <style>{`
        .cc-pulse { animation: ccpulse 1.8s ease-out infinite; }
        @keyframes ccpulse {
          0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.6); }
          70% { box-shadow: 0 0 0 6px rgba(52,211,153,0); }
          100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
        }
        .cc-row { transition: background 0.12s; }
        .cc-row:hover { background: var(--bg-hover); }
        @media (max-width: 720px) {
          .cc-hide-sm { display: none !important; }
        }
      `}</style>
    </div>
  )
}

/* ------------------------------------------------------------- small pieces */

function RatePill({
  icon: Icon,
  color,
  label,
  rate,
}: {
  icon: any
  color: string
  label: string
  rate: string
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.4rem 0.75rem',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        fontSize: '0.76rem',
      }}
    >
      <Icon size={13} color={color} />
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)' }}>{rate}</span>
    </div>
  )
}

function StatChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.6rem 0.9rem',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >
      <Icon size={18} color="var(--accent-light)" />
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-secondary)' }}>
      <Trophy size={40} color="var(--text-secondary)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
        No credits earned yet
      </h2>
      <p style={{ maxWidth: 420, margin: '0 auto 1.25rem' }}>
        Chat with a character, run a Conference Cluster, or connect a character to an app to start
        earning Character Credits.
      </p>
      <Link
        to="/discover"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.65rem 1.25rem',
          borderRadius: 10,
          background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
          color: 'white',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '0.9rem',
        }}
      >
        Explore characters
      </Link>
    </div>
  )
}

/* -------------------------------------------------------------- the table */

function LeaderTable({ rows, onSelect }: { rows: Computed[]; onSelect: (id: number) => void }) {
  const headCell: React.CSSProperties = {
    padding: '0.6rem 0.75rem',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-card)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <th style={{ ...headCell, textAlign: 'center', width: 56 }}>#</th>
              <th style={{ ...headCell, textAlign: 'left' }}>Character</th>
              <th style={headCell}>Total CC</th>
              <th style={{ ...headCell }} className="cc-hide-sm">Chat</th>
              <th style={{ ...headCell }} className="cc-hide-sm">Claw</th>
              <th style={{ ...headCell }} className="cc-hide-sm">Conf.</th>
              <th style={headCell}>Engage&nbsp;%</th>
              <th style={headCell}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cell: React.CSSProperties = {
                padding: '0.7rem 0.75rem',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.86rem',
                color: 'var(--text-secondary)',
              }
              return (
                <tr
                  key={r.character.id}
                  className="cc-row"
                  onClick={() => onSelect(r.character.id)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'center' }}>
                    {r.rank <= 3 ? (
                      <Crown size={18} color={RANK_COLOR[r.rank - 1]} style={{ verticalAlign: 'middle' }} />
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>{r.rank}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.7rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                      <div style={avatarBox(38)}><AvatarFill avatar={r.character.avatar} alt={r.character.name} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {r.character.name}
                          {r.isPrivate && (
                            <span title="Enterprise-private" style={{ display: 'inline-flex' }}>
                              <Building2 size={12} color="var(--accent-light)" />
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.character.category}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...cell, color: 'var(--text-primary)', fontWeight: 800 }}>{formatCc(r.cc.total)}</td>
                  <td style={cell} className="cc-hide-sm">{formatCc(r.cc.chatCc)}</td>
                  <td style={cell} className="cc-hide-sm">{formatCc(r.cc.clawCc)}</td>
                  <td style={cell} className="cc-hide-sm">{formatCc(r.cc.conferenceCc)}</td>
                  <td style={cell}>
                    <EngageBar pct={r.engagementPct} />
                  </td>
                  <td style={{ ...cell, color: '#34d399', fontWeight: 700 }}>{formatGbp(r.cc.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EngageBar({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'flex-end' }}>
      <div style={{ width: 54, height: 6, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }} className="cc-hide-sm">
        <div style={{ width: `${v}%`, height: '100%', background: 'linear-gradient(90deg, #7c5cbf, #a78bfa)' }} />
      </div>
      <span style={{ minWidth: 38, display: 'inline-block', color: 'var(--text-primary)', fontWeight: 600 }}>{v.toFixed(1)}%</span>
    </div>
  )
}

/* ---------------------------------------------------------- stat card modal */

function StatCardModal({
  row,
  onClose,
  onMutated,
}: {
  row: Computed
  onClose: () => void
  onMutated: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  // Local copy so toggles feel instant; refreshed from the server response.
  const [local, setLocal] = useState<CreditRow>(row)
  useEffect(() => setLocal(row), [row.character.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cc = useMemo(() => creditsFor(local), [local])
  const c = local.character

  const post = async (action: string, slug?: string) => {
    setBusy(slug ? `${action}:${slug}` : action)
    try {
      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: c.id, action, slug }),
      })
      if (res.ok) {
        const updated = await res.json()
        setLocal((prev) => ({ ...prev, ...updated }))
        onMutated()
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(null)
    }
  }

  const appsSet = new Set(local.appConnections)
  const extSet = new Set(local.externalPlatforms)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(5,5,10,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '4vh 1rem',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <div
          style={{
            position: 'relative',
            padding: '1.4rem 1.4rem 1.2rem',
            background: 'linear-gradient(165deg, rgba(124,92,191,0.22), rgba(79,70,229,0.05))',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div style={avatarBox(56)}><AvatarFill avatar={c.avatar} alt={c.name} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>{c.name}</h2>
                {row.rank <= 3 && <Crown size={18} color={RANK_COLOR[row.rank - 1]} />}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {c.category}
                {c.tagline ? ` · ${c.tagline}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', alignItems: 'baseline' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{formatCc(cc.total)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CC</span></div>
            <div style={{ fontSize: '1rem', color: '#34d399', fontWeight: 700 }}>= {formatGbp(cc.total)}</div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: '#34d399', fontWeight: 700 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#34d399' }} className="cc-pulse" /> realtime · #{row.rank}
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ padding: '1.2rem 1.4rem 1.5rem' }}>
          {/* raw activity */}
          <SectionLabel>Activity</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem', marginBottom: '1.3rem' }}>
            <MiniStat label="Chat msgs" value={formatCc(cc.chatMsgs)} />
            <MiniStat label="Claw msgs" value={formatCc(cc.clawMsgs)} />
            <MiniStat label="Conference replies" value={formatCc(cc.conferenceMsgs)} />
            <MiniStat label="Milestone bonus" value={`+${formatCc(cc.milestoneBonus)}`} hint={cc.milestone?.label} />
            <MiniStat label="App connections" value={`+${formatCc(cc.appCc)} CC`} hint={`${cc.apps.length} apps`} />
            <MiniStat label="External reach" value={`+${formatCc(cc.externalCc)} CC`} hint={`${cc.externals.length} platforms`} />
          </div>

          {/* cc breakdown */}
          <SectionLabel>CC breakdown</SectionLabel>
          <div style={{ marginBottom: '1.3rem', display: 'grid', gap: '0.4rem' }}>
            <BreakRow color="#60a5fa" label={`Chat CC (×${CHANNEL_RATE.chat})`} value={cc.chatCc} total={cc.total} />
            <BreakRow color="#fbbf24" label={`Claw CC (×${CHANNEL_RATE.claw})`} value={cc.clawCc} total={cc.total} />
            <BreakRow color="#c084fc" label={`Conference CC (×${CHANNEL_RATE.conference})`} value={cc.conferenceCc} total={cc.total} />
            <BreakRow color="#34d399" label="Milestone bonus" value={cc.milestoneBonus} total={cc.total} />
            <BreakRow color="#38bdf8" label="App bonus CC" value={cc.appCc} total={cc.total} />
            <BreakRow color="#f472b6" label="External CC" value={cc.externalCc} total={cc.total} />
          </div>

          {/* apps */}
          <SectionLabel>
            <Plug size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            Apps connected (+{APP_RATE} CC each)
          </SectionLabel>
          <ToggleGrid
            items={APPS}
            active={appsSet}
            busyKey={busy}
            onToggle={(slug) => post(appsSet.has(slug) ? 'disconnectApp' : 'connectApp', slug)}
            actionPrefix={(slug) => (appsSet.has(slug) ? 'disconnectApp' : 'connectApp') + ':' + slug}
          />

          {/* externals */}
          <div style={{ height: '1rem' }} />
          <SectionLabel>
            <Globe size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            External platforms reached (+{EXTERNAL_RATE} CC each)
          </SectionLabel>
          <ToggleGrid
            items={EXTERNALS}
            active={extSet}
            busyKey={busy}
            onToggle={(slug) => post(extSet.has(slug) ? 'disconnectExternal' : 'connectExternal', slug)}
            actionPrefix={(slug) => (extSet.has(slug) ? 'disconnectExternal' : 'connectExternal') + ':' + slug}
          />

          {/* actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1.4rem' }}>
            <Link
              to="/chat/$id"
              params={{ id: String(c.id) }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.6rem 1.1rem',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                color: 'white',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              <MessageCircle size={15} /> Chat &amp; earn CC
            </Link>
            <Link
              to="/characters/$id"
              params={{ id: String(c.id) }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.6rem 1.1rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              <ExternalLink size={15} /> View profile
            </Link>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => post('setPrivate', undefined)}
              disabled={busy === 'setPrivate'}
              title="Toggle whether this character is listed only in the enterprise view"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.6rem 0.9rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: local.isPrivate ? 'rgba(124,92,191,0.2)' : 'var(--bg-card)',
                color: local.isPrivate ? 'var(--accent-light)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.8rem',
              }}
            >
              <Building2 size={14} /> {local.isPrivate ? 'Enterprise-private' : 'Make private'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
      {children}
    </div>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ padding: '0.65rem 0.7rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', opacity: 0.7, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function BreakRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: 150, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, opacity: 0.8 }} />
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', width: 56, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {formatCc(value)}
      </span>
    </div>
  )
}

function ToggleGrid({
  items,
  active,
  busyKey,
  onToggle,
  actionPrefix,
}: {
  items: { slug: string; label: string; emoji: string }[]
  active: Set<string>
  busyKey: string | null
  onToggle: (slug: string) => void
  actionPrefix: (slug: string) => string
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {items.map((it) => {
        const on = active.has(it.slug)
        const isBusy = busyKey === actionPrefix(it.slug)
        return (
          <button
            key={it.slug}
            onClick={() => onToggle(it.slug)}
            disabled={isBusy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.8rem',
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 600,
              border: '1px solid',
              borderColor: on ? 'var(--accent)' : 'var(--border)',
              background: on ? 'rgba(124,92,191,0.22)' : 'var(--bg-secondary)',
              color: on ? 'var(--accent-light)' : 'var(--text-secondary)',
              opacity: isBusy ? 0.6 : 1,
              transition: 'all 0.12s',
            }}
          >
            <span>{it.emoji}</span> {it.label} {on && <span style={{ color: '#34d399' }}>✓</span>}
          </button>
        )
      })}
    </div>
  )
}

export const Route = createFileRoute('/leaderboard')({
  component: LeaderboardPage,
})
