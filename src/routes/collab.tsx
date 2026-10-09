import { useState, useEffect, useMemo, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Trophy, Crown, GitMerge, MessagesSquare, Users, MessageCircle, Sparkles, Coins, PoundSterling } from 'lucide-react'
import { creditsFor, formatCc, formatGbp, type RawStats } from '../lib/credits'
import { AvatarFill } from '../lib/avatar'

// The Joint Leaderboard — Merge & Twin characters compete in their own league.
// The plain "Collab" tab used to just redirect to /create; now collaborative
// characters (built in Merge or Twin mode) have a real competitive surface,
// where joint engagement earns a 2x Joint Bonus over the base Character Credits.

const JOINT_BONUS = 2 // joint characters score 2x CC on this board

type CreditRow = {
  character: { id: number; name: string; avatar: string; category: string; tagline: string }
  kind: 'single' | 'merge' | 'twin'
  twinId: number | null
  chatMsgs: number
  clawMsgs: number
  conferenceMsgs: number
  appConnections: string[]
  externalPlatforms: string[]
  isPrivate: boolean
}

type Entry = {
  key: string
  kind: 'merge' | 'twin'
  members: CreditRow[]
  primaryId: number
  baseCc: number
  jointScore: number
  rank: number
}

const RANK_COLOR = ['#fbbf24', '#cbd5e1', '#d2865b']

function combineRaw(rows: CreditRow[]): RawStats {
  return {
    chatMsgs: rows.reduce((s, r) => s + r.chatMsgs, 0),
    clawMsgs: rows.reduce((s, r) => s + r.clawMsgs, 0),
    conferenceMsgs: rows.reduce((s, r) => s + r.conferenceMsgs, 0),
    appConnections: [...new Set(rows.flatMap((r) => r.appConnections))],
    externalPlatforms: [...new Set(rows.flatMap((r) => r.externalPlatforms))],
  }
}

function buildEntries(rows: CreditRow[]): Entry[] {
  const joint = rows.filter((r) => r.kind !== 'single')
  const byId = new Map<number, CreditRow>(joint.map((r) => [r.character.id, r]))
  const seen = new Set<number>()
  const entries: Omit<Entry, 'rank'>[] = []

  for (const row of joint) {
    if (seen.has(row.character.id)) continue

    if (row.kind === 'twin') {
      const partner = row.twinId ? byId.get(row.twinId) : undefined
      const members = partner ? [row, partner] : [row]
      members.forEach((m) => seen.add(m.character.id))
      const primaryId = Math.min(...members.map((m) => m.character.id))
      const base = creditsFor(combineRaw(members)).total
      entries.push({ key: `twin-${primaryId}`, kind: 'twin', members, primaryId, baseCc: base, jointScore: base * JOINT_BONUS })
    } else {
      seen.add(row.character.id)
      const base = creditsFor(combineRaw([row])).total
      entries.push({ key: `merge-${row.character.id}`, kind: 'merge', members: [row], primaryId: row.character.id, baseCc: base, jointScore: base * JOINT_BONUS })
    }
  }

  return entries
    .sort((a, b) => b.jointScore - a.jointScore)
    .map((e, i) => ({ ...e, rank: i + 1 }))
}

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

function PairAvatars({ members }: { members: CreditRow[] }) {
  if (members.length === 1) {
    return <div style={avatarBox(40)}><AvatarFill avatar={members[0].character.avatar} alt={members[0].character.name} /></div>
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={avatarBox(38)}><AvatarFill avatar={members[0].character.avatar} alt={members[0].character.name} /></div>
      <div style={{ marginLeft: -12 }}>
        <div style={avatarBox(38)}><AvatarFill avatar={members[1].character.avatar} alt={members[1].character.name} /></div>
      </div>
    </div>
  )
}

function KindBadge({ kind }: { kind: 'merge' | 'twin' }) {
  const merge = kind === 'merge'
  const Icon = merge ? GitMerge : MessagesSquare
  const color = merge ? '#fbbf24' : 'var(--accent-light)'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
        padding: '0.15rem 0.5rem', borderRadius: 999, color,
        background: `${merge ? 'rgba(251,191,36,0.12)' : 'rgba(124,92,191,0.15)'}`,
        border: `1px solid ${merge ? 'rgba(251,191,36,0.3)' : 'rgba(124,92,191,0.3)'}`,
      }}
    >
      <Icon size={11} /> {merge ? 'Merge' : 'Twin'}
    </span>
  )
}

function StatChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.9rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <Icon size={18} color="var(--accent-light)" />
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

function JointLeaderboardPage() {
  const [rows, setRows] = useState<CreditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true)
    fetch('/api/credits?scope=enterprise')
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
  }, [])

  useEffect(() => { load(true) }, [load])
  useEffect(() => {
    const t = setInterval(() => load(false), 8000)
    return () => clearInterval(t)
  }, [load])

  const entries = useMemo(() => buildEntries(rows), [rows])
  const totals = useMemo(() => {
    const cc = entries.reduce((s, e) => s + e.jointScore, 0)
    return { cc, gbp: cc, count: entries.length }
  }, [entries])

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 320px at 50% -10%, rgba(124,92,191,0.22), transparent)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.25rem 2rem', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Users size={20} color="#fbbf24" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-light)', letterSpacing: '0.04em' }}>JOINT CHARACTERS</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#34d399' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#34d399' }} className="cc-pulse" /> live
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 800, lineHeight: 1.05, marginBottom: '0.85rem' }}>
            The <span className="gradient-text">Merge &amp; Twin</span> Leaderboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, maxWidth: 640, marginBottom: '1.5rem' }}>
            Characters built in <strong style={{ color: 'var(--text-primary)' }}>Merge</strong> or{' '}
            <strong style={{ color: 'var(--text-primary)' }}>Twin</strong> mode compete in their own league. Every
            chat they earn counts <strong style={{ color: 'var(--text-primary)' }}>double</strong> here — a{' '}
            {JOINT_BONUS}× Joint Bonus for collaborative play. A twin pair pools the Credits both halves earn.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <StatChip icon={Coins} label="Joint Silver in play" value={formatCc(totals.cc)} />
            <StatChip icon={PoundSterling} label="Market value" value={formatGbp(totals.gbp)} />
            <StatChip icon={Trophy} label="Joint contenders" value={String(totals.count)} />
            <div style={{ flex: 1 }} />
            <Link
              to="/create"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.6rem 1.1rem', borderRadius: 10, background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)', color: 'white', textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem' }}
            >
              <Sparkles size={15} /> Create a joint character
            </Link>
          </div>
        </div>
      </div>

      {/* board */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>Loading the joint leaderboard…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>Couldn&apos;t load the leaderboard right now.</div>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-card)' }}>
            {entries.map((e) => (
              <JointRow key={e.key} entry={e} />
            ))}
          </div>
        )}
      </div>

      <style>{`
        .cc-pulse { animation: ccpulse 1.8s ease-out infinite; }
        @keyframes ccpulse {
          0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.6); }
          70% { box-shadow: 0 0 0 6px rgba(52,211,153,0); }
          100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
        }
        .jl-row { transition: background 0.12s; text-decoration: none; }
        .jl-row:hover { background: var(--bg-hover); }
      `}</style>
    </div>
  )
}

function JointRow({ entry }: { entry: Entry }) {
  const names = entry.members.map((m) => m.character.name).join(' & ')
  const category = entry.members[0].character.category
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', color: 'inherit' }
  const inner = (
    <>
      <div style={{ width: 34, textAlign: 'center', flexShrink: 0 }}>
        {entry.rank <= 3 ? (
          <Crown size={18} color={RANK_COLOR[entry.rank - 1]} />
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>{entry.rank}</span>
        )}
      </div>
      <PairAvatars members={entry.members} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{names}</span>
          <KindBadge kind={entry.kind} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
          {category} · base {formatCc(entry.baseCc)} CC × {JOINT_BONUS} joint bonus
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>{formatCc(entry.jointScore)} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CC</span></div>
        <div style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 700 }}>{formatGbp(entry.jointScore)}</div>
      </div>
      <MessageCircle size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
    </>
  )

  return entry.kind === 'twin' ? (
    <Link to="/twin/$id" params={{ id: String(entry.primaryId) }} className="jl-row" style={rowStyle}>
      {inner}
    </Link>
  ) : (
    <Link to="/chat/$id" params={{ id: String(entry.primaryId) }} className="jl-row" style={rowStyle}>
      {inner}
    </Link>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-secondary)' }}>
      <Users size={40} color="var(--text-secondary)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No joint characters yet</h2>
      <p style={{ maxWidth: 440, margin: '0 auto 1.25rem' }}>
        Build a character in <strong>Merge</strong> or <strong>Twin</strong> mode, then chat with it — joint
        engagement earns a {JOINT_BONUS}× bonus and lands here.
      </p>
      <Link
        to="/create"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.65rem 1.25rem', borderRadius: 10, background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)', color: 'white', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}
      >
        <Sparkles size={15} /> Create a joint character
      </Link>
    </div>
  )
}

export const Route = createFileRoute('/collab')({
  component: JointLeaderboardPage,
})
