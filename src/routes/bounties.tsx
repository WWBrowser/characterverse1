import { useState, useEffect, useMemo, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Target, Coins, Star, Plus, Users, CheckCircle2, FlaskConical, X, TrendingUp } from 'lucide-react'
import { formatGbp } from '../lib/credits'
import { FEEDBACK_CATEGORIES } from '../lib/training'
import { getSession } from '../lib/session'

export const Route = createFileRoute('/bounties')({ component: BountiesPage })

/* --------------------------------------------------------------------- types */

type CharacterLite = { id: number; name: string; avatar: string; category: string; tagline: string }

type BountyRow = {
  id: number
  characterId: number
  creatorSession: string
  title: string
  brief: string
  rewardCc: number
  testerLimit: number
  status: string
  createdAt: string
  character: CharacterLite | null
  feedbackCount: number
  acceptedCount: number
  avgRating: number
}

type Feedback = {
  id: number
  testerSession: string
  rating: number
  category: string
  content: string
  status: string
  awardedCc: number
  createdAt: string
}

type BountyDetail = {
  bounty: BountyRow
  character: CharacterLite | null
  feedback: Feedback[]
  stats: {
    feedbackCount: number
    testerCount: number
    acceptedCount: number
    appliedCount: number
    spentCc: number
    avgRating: number
    slotsLeft: number
  }
}

/* ------------------------------------------------------------------- helpers */

function avatarBox(size: number) {
  return {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
    fontSize: size * 0.5,
    flexShrink: 0,
    background: 'linear-gradient(135deg, rgba(124,92,191,0.4), rgba(79,70,229,0.25))',
    border: '1px solid rgba(124,92,191,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const
}

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={16}
          onClick={onChange ? () => onChange(n) : undefined}
          style={{ cursor: onChange ? 'pointer' : 'default' }}
          color={n <= value ? '#fbbf24' : 'var(--border)'}
          fill={n <= value ? '#fbbf24' : 'none'}
        />
      ))}
    </span>
  )
}

const catLabel = (slug: string) => FEEDBACK_CATEGORIES.find((c) => c.slug === slug)?.label || slug

/* ====================================================================== page */

function BountiesPage() {
  const [tab, setTab] = useState<'browse' | 'mine'>('browse')
  const [browse, setBrowse] = useState<BountyRow[]>([])
  const [mine, setMine] = useState<BountyRow[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const session = typeof window !== 'undefined' ? getSession() : 'anon'

  const loadBrowse = useCallback(() => {
    fetch('/api/bounties')
      .then((r) => r.json())
      .then((d) => setBrowse(Array.isArray(d) ? d : []))
      .catch(() => setBrowse([]))
  }, [])

  const loadMine = useCallback(() => {
    fetch(`/api/bounties?creatorSession=${encodeURIComponent(session)}`)
      .then((r) => r.json())
      .then((d) => setMine(Array.isArray(d) ? d : []))
      .catch(() => setMine([]))
  }, [session])

  useEffect(() => {
    loadBrowse()
    loadMine()
  }, [loadBrowse, loadMine])

  const refreshAll = () => {
    loadBrowse()
    loadMine()
  }

  const list = tab === 'browse' ? browse : mine

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ ...avatarBox(40), borderRadius: 12 }}>
          <Target size={20} color="var(--accent-light)" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Character Testing Bounties</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            The quality-assurance layer — testers earn CC, creators get a better character.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 1rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)', color: 'white', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          <Plus size={15} /> Post a bounty
        </button>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: 760, marginBottom: '1.25rem' }}>
        Post a bounty against your character, set the reward and tester limit, and testers earn CC for detailed
        feedback. Accept the best of it and push it straight into the{' '}
        <Link to="/training" style={{ color: 'var(--accent-light)' }}>Training Control Room</Link> — a closed loop
        where the bounty cost is paid back through the character's improved earnings.
      </p>

      {/* tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['browse', 'mine'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: tab === t ? 'var(--bg-hover)' : 'transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {t === 'browse' ? 'Open bounties' : 'My bounties'}
          </button>
        ))}
      </div>

      {/* list */}
      {list.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14, padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {tab === 'browse'
            ? 'No open bounties right now. Post one to invite testers.'
            : "You haven't posted any bounties yet."}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {list.map((b) => (
            <BountyCard key={b.id} bounty={b} mine={tab === 'mine'} onOpen={() => setOpenId(b.id)} />
          ))}
        </div>
      )}

      {creating && (
        <CreateBountyModal
          session={session}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            setTab('mine')
            refreshAll()
          }}
        />
      )}

      {openId != null && (
        <BountyDrawer
          bountyId={openId}
          session={session}
          onClose={() => {
            setOpenId(null)
            refreshAll()
          }}
        />
      )}
    </div>
  )
}

/* --------------------------------------------------------------- bounty card */

function BountyCard({ bounty, mine, onOpen }: { bounty: BountyRow; mine: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        textAlign: 'left',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '1.1rem',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div style={avatarBox(40)}>{bounty.character?.avatar || '🤖'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {bounty.title || `Test ${bounty.character?.name || 'character'}`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{bounty.character?.name}</div>
        </div>
        {bounty.status === 'closed' && (
          <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: 6, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>closed</span>
        )}
      </div>

      {bounty.brief && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {bounty.brief}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fbbf24', fontWeight: 700 }}>
          <Coins size={14} /> {bounty.rewardCc} CC
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={13} /> {bounty.feedbackCount}/{bounty.testerLimit}
        </span>
        {bounty.feedbackCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Star size={13} color="#fbbf24" fill="#fbbf24" /> {bounty.avgRating.toFixed(1)}
          </span>
        )}
        {mine && bounty.acceptedCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10b981' }}>
            <CheckCircle2 size={13} /> {bounty.acceptedCount} accepted
          </span>
        )}
      </div>
    </button>
  )
}

/* --------------------------------------------------------- create modal */

function CreateBountyModal({ session, onClose, onCreated }: { session: string; onClose: () => void; onCreated: () => void }) {
  const [characters, setCharacters] = useState<CharacterLite[]>([])
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [rewardCc, setRewardCc] = useState(25)
  const [testerLimit, setTesterLimit] = useState(5)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/characters')
      .then((r) => r.json())
      .then((d) => setCharacters(Array.isArray(d) ? d : []))
      .catch(() => setCharacters([]))
  }, [])

  const submit = async () => {
    if (characterId == null || saving) return
    setSaving(true)
    try {
      await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, creatorSession: session, title, brief, rewardCc, testerLimit }),
      })
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.6rem',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
  } as const

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem' }}>Post a testing bounty</h2>

      <Field label="Character">
        <select value={characterId ?? ''} onChange={(e) => setCharacterId(Number(e.target.value) || null)} style={inputStyle}>
          <option value="">Select a character…</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.avatar} {c.name} (#{c.id})</option>
          ))}
        </select>
      </Field>

      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Stress-test the coaching tone" style={inputStyle} />
      </Field>

      <Field label="What should testers look for?">
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="Describe the scenarios, edge cases or qualities to probe…" style={{ ...inputStyle, resize: 'vertical' }} />
      </Field>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <Field label={`Reward — ${rewardCc} CC (${formatGbp(rewardCc)}) per accepted`}>
          <input type="range" min={1} max={250} value={rewardCc} onChange={(e) => setRewardCc(Number(e.target.value))} style={{ width: '100%' }} />
        </Field>
        <Field label={`Tester limit — ${testerLimit}`}>
          <input type="range" min={1} max={50} value={testerLimit} onChange={(e) => setTesterLimit(Number(e.target.value))} style={{ width: '100%' }} />
        </Field>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Max payout if every accepted: <strong style={{ color: '#fbbf24' }}>{rewardCc * testerLimit} CC</strong> ({formatGbp(rewardCc * testerLimit)})
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={submit} disabled={characterId == null || saving} style={{ ...primaryBtn, opacity: characterId == null || saving ? 0.5 : 1 }}>
          {saving ? 'Posting…' : 'Post bounty'}
        </button>
      </div>
    </Overlay>
  )
}

/* --------------------------------------------------------- bounty drawer */

function BountyDrawer({ bountyId, session, onClose }: { bountyId: number; session: string; onClose: () => void }) {
  const [data, setData] = useState<BountyDetail | null>(null)
  const [busy, setBusy] = useState(false)

  // tester form
  const [rating, setRating] = useState(4)
  const [category, setCategory] = useState('general')
  const [content, setContent] = useState('')

  const load = useCallback(() => {
    fetch(`/api/bounties/${bountyId}`)
      .then((r) => r.json())
      .then((d) => setData(d && d.bounty ? d : null))
      .catch(() => setData(null))
  }, [bountyId])

  useEffect(() => {
    load()
  }, [load])

  const post = async (body: any) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/bounties/${bountyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d && d.bounty) setData(d)
      else load()
    } finally {
      setBusy(false)
    }
  }

  const submitFeedback = async () => {
    if (!content.trim()) return
    await post({ action: 'submitFeedback', testerSession: session, rating, category, content: content.trim() })
    setContent('')
  }

  if (!data) {
    return (
      <Overlay onClose={onClose} wide>
        <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      </Overlay>
    )
  }

  const { bounty, character, feedback, stats } = data
  const isOwner = bounty.creatorSession === session
  const alreadyTested = feedback.some((f) => f.testerSession === session)
  const myFeedback = feedback.filter((f) => f.testerSession === session)
  const canTest = !isOwner && bounty.status === 'open' && (alreadyTested || stats.slotsLeft > 0)

  // ROI: bounty CC outlay vs character improvement (applied feedback → training).
  const roi = useMemo(() => {
    const applied = feedback.filter((f) => f.status === 'applied').length
    return { spent: stats.spentCc, applied }
  }, [feedback, stats.spentCc])

  return (
    <Overlay onClose={onClose} wide>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={avatarBox(48)}>{character?.avatar || '🤖'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{bounty.title || `Test ${character?.name}`}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {character?.name} · {bounty.rewardCc} CC per accepted · {bounty.status}
          </div>
        </div>
        {character && (
          <Link to="/chat/$id" params={{ id: String(character.id) }} style={{ fontSize: '0.8rem', color: 'var(--accent-light)', textDecoration: 'none' }}>
            Open chat →
          </Link>
        )}
      </div>

      {bounty.brief && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.8rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          {bounty.brief}
        </div>
      )}

      {/* stats strip */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
        <Stat icon={<Users size={14} />} label="Testers" value={`${stats.testerCount}/${bounty.testerLimit}`} />
        <Stat icon={<Star size={14} color="#fbbf24" />} label="Avg rating" value={stats.avgRating ? stats.avgRating.toFixed(1) : '—'} />
        <Stat icon={<CheckCircle2 size={14} color="#10b981" />} label="Accepted" value={String(stats.acceptedCount)} />
        <Stat icon={<FlaskConical size={14} color="var(--accent-light)" />} label="Trained" value={String(stats.appliedCount)} />
      </div>

      {/* owner ROI panel */}
      {isOwner && (
        <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
            <TrendingUp size={15} color="#10b981" /> Creator ROI
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Spent <strong style={{ color: '#fbbf24' }}>{roi.spent} CC</strong> ({formatGbp(roi.spent)}) on accepted feedback ·{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{roi.applied}</strong> improvement{roi.applied === 1 ? '' : 's'} pushed to training.
            The character earns this back as engagement rises on the leaderboard.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <Link to="/training" style={{ ...miniBtn, textDecoration: 'none' }}>Open Training Room →</Link>
            {bounty.status === 'open' ? (
              <button onClick={() => post({ action: 'close' })} disabled={busy} style={miniGhost}>Close bounty</button>
            ) : (
              <button onClick={() => post({ action: 'reopen' })} disabled={busy} style={miniGhost}>Reopen</button>
            )}
          </div>
        </div>
      )}

      {/* tester submit form */}
      {canTest && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.6rem' }}>Submit feedback &amp; earn {bounty.rewardCc} CC</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Rating <Stars value={rating} onChange={setRating} />
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Be specific — what worked, what broke, and how it should behave instead."
            style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', marginBottom: '0.6rem' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={submitFeedback} disabled={!content.trim() || busy} style={{ ...primaryBtn, opacity: !content.trim() || busy ? 0.5 : 1 }}>
              {busy ? 'Submitting…' : 'Submit feedback'}
            </button>
          </div>
        </div>
      )}

      {!isOwner && !canTest && bounty.status === 'open' && stats.slotsLeft === 0 && !alreadyTested && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1rem' }}>This bounty has reached its tester limit.</div>
      )}

      {/* feedback list */}
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
        Feedback ({feedback.length})
      </div>
      {feedback.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No feedback yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {feedback.map((f) => {
            // Testers only see their own; owner sees all.
            if (!isOwner && f.testerSession !== session) return null
            return (
              <div key={f.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: 6, flexWrap: 'wrap' }}>
                  <Stars value={f.rating} />
                  <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.5rem', borderRadius: 6, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{catLabel(f.category)}</span>
                  {f.status === 'accepted' && <Badge color="#10b981">accepted · +{f.awardedCc} CC</Badge>}
                  {f.status === 'applied' && <Badge color="var(--accent-light)">trained</Badge>}
                  {f.testerSession === session && f.status === 'pending' && <Badge color="#f59e0b">pending review</Badge>}
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {f.testerSession === session ? 'you' : `tester ${String(f.testerSession || f.id).slice(-4)}`}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginBottom: isOwner ? '0.6rem' : 0 }}>{f.content}</div>
                {isOwner && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {f.status === 'pending' && (
                      <button onClick={() => post({ action: 'accept', feedbackId: f.id })} disabled={busy} style={miniBtn}>Accept &amp; pay</button>
                    )}
                    {f.status !== 'applied' && (
                      <button onClick={() => post({ action: 'toTraining', feedbackId: f.id })} disabled={busy} style={miniGhost}>
                        Send to training
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isOwner && myFeedback.length === 0 && !canTest && bounty.status === 'closed' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.5rem' }}>This bounty is closed.</div>
      )}
    </Overlay>
  )
}

/* ---------------------------------------------------------- small UI bits */

function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '4vh 1rem', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: wide ? 640 : 480, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', position: 'relative' }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.9rem', flex: 1 }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{label}</div>
      {children}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
      {icon}
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: `${color}22`, color, fontWeight: 600 }}>{children}</span>
  )
}

const primaryBtn = {
  padding: '0.55rem 1.1rem',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
  color: 'white',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
} as const

const ghostBtn = {
  padding: '0.55rem 1.1rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
} as const

const miniBtn = {
  padding: '0.35rem 0.7rem',
  borderRadius: 7,
  border: 'none',
  background: 'var(--accent)',
  color: 'white',
  fontWeight: 600,
  fontSize: '0.78rem',
  cursor: 'pointer',
} as const

const miniGhost = {
  padding: '0.35rem 0.7rem',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  fontSize: '0.78rem',
  cursor: 'pointer',
} as const
