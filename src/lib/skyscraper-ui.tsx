import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  Loader2,
  Radar,
  RefreshCw,
  Share2,
  Shield,
  Sparkles,
  ThumbsDown,
  X,
} from 'lucide-react'

// The SAA skyscraper — AlgorithmClaw's feed and SecurityClaw's readout, in the
// tall right-hand column beside the chat workspace.
//
// The column is BLANK until a vibe is asked for. That is a design decision, not
// an empty state waiting to be filled: an always-on feed trains you to ignore it,
// and a recommender that has not been asked anything has not earned the space.
// What sits there instead is the standby panel — what the algorithm currently
// knows about you, and nothing it would suggest.

/* ------------------------------------------------------------------ palette */

// Categorical steps for the four ranking signals. Fixed order, never cycled,
// validated against this surface (#1a1a28) for lightness band, chroma, CVD
// separation and contrast. Identity is never carried by colour alone — every bar
// is labelled, and the numbers wear text tokens.
const SIGNAL_COLORS: Record<string, string> = {
  affinity: '#3987e5',
  vibeFit: '#d95926',
  novelty: '#199e70',
  spark: '#c98500',
}

// Status palette. Reserved — never reused as a fifth series colour.
const STATUS: Record<string, { color: string; Icon: typeof CheckCircle2 }> = {
  good: { color: '#0ca30c', Icon: CheckCircle2 },
  warning: { color: '#fab219', Icon: AlertTriangle },
  serious: { color: '#ec835a', Icon: AlertOctagon },
  critical: { color: '#d03b3b', Icon: AlertOctagon },
}

/* -------------------------------------------------------------------- types */

export type SignalSet = Record<string, number>

export type Rec = {
  id: number
  characterId: number
  characterName: string
  avatar: string
  category: string
  title: string
  scenario: string
  opener: string
  vibeMatch: string
  match: number
  signals: SignalSet
  axes: string[]
  drafted: boolean
}

type SecurityBlock = {
  logId: number | null
  verdict: 'allow' | 'shape' | 'escalate' | 'refuse'
  label: string
  tone: 'good' | 'warning' | 'serious' | 'critical'
  score: number
  reasoning: string
  constraints: string[]
  hits: { axis: string; label: string; scored: number; markers: string[] }[]
  framing: string[]
  support: boolean
  policy: { tighten: number; screened: number }
}

type Escalation = {
  request: string
  verdict: string
  score: number
  axes: { axis: string; label: string; scored: number; markers: string[] }[]
  framing: string[]
  question: string
}

type Standby = {
  profile: {
    conversations: number
    depth: number
    breadth: number
    style: string
    signal: number
    cold: boolean
    categories: { category: string; weight: number }[]
    themes: { token: string; weight: number }[]
    characters: { characterId: number; name: string; weight: number }[]
  }
  stats: { slates: number; cards: number; opened: number; dismissed: number }
  signals: { id: string; label: string; blurb: string; weight: number }[]
  policy: { tighten: number; screened: number }
}

type SlateResponse = {
  slateId: number | null
  seed: string
  spin: number
  provenance: 'agentic' | 'kernel'
  note: string
  recommendations: Rec[]
  security: SecurityBlock
  escalation?: Escalation | null
  message?: string
  egress?: string[]
}

/* --------------------------------------------------------------- primitives */

function VerdictBadge({ tone, label, score }: { tone: string; label: string; score: number }) {
  const s = STATUS[tone] || STATUS.good
  const { Icon } = s
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 999,
        border: `1px solid ${s.color}55`,
        background: `${s.color}14`,
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={12} color={s.color} strokeWidth={2.4} />
      {label}
      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{score}</span>
    </span>
  )
}

/**
 * One ranking signal. A labelled bar, not a bare colour: the label is the
 * identity, the bar is the magnitude, and the number is text.
 */
function SignalBar({ id, label, value }: { id: string; label: string; value: number }) {
  const color = SIGNAL_COLORS[id] || '#3987e5'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 26px', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>{label}</span>
      <span
        style={{
          height: 4,
          borderRadius: 2,
          background: 'var(--bg-hover)',
          overflow: 'hidden',
          display: 'block',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${Math.max(2, Math.min(100, value))}%`,
            background: color,
            borderRadius: 2,
          }}
        />
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

/** Skeletons shaped like the cards they replace, not a spinner in a void. */
function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--border)',
        borderRadius: 10,
        padding: 14,
        animation: 'pulse 1.6s ease-in-out infinite',
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ height: 12, width: '62%', background: 'var(--bg-hover)', borderRadius: 3, marginBottom: 10 }} />
      <div style={{ height: 9, width: '100%', background: 'var(--bg-hover)', borderRadius: 3, marginBottom: 6 }} />
      <div style={{ height: 9, width: '84%', background: 'var(--bg-hover)', borderRadius: 3, marginBottom: 14 }} />
      <div style={{ display: 'grid', gap: 5 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 4, width: `${70 - i * 9}%`, background: 'var(--bg-hover)', borderRadius: 2 }} />
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- standby panel */

function StandbyPanel({ data }: { data: Standby | null }) {
  if (!data) {
    return (
      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
        <Loader2 size={16} className="spin" style={{ marginBottom: 8 }} />
        <div>Reading your history…</div>
      </div>
    )
  }

  const { profile, stats } = data
  return (
    <div style={{ padding: '1.25rem 0.25rem', display: 'grid', gap: 18 }}>
      <div style={{ textAlign: 'center' }}>
        <Radar size={26} color="var(--text-secondary)" strokeWidth={1.4} style={{ opacity: 0.5 }} />
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.6 }}>
          Standing by. The column fills when you name a vibe — nothing is
          recommended before you ask for it.
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 10, fontWeight: 600 }}>
          WHAT THE RANKER HAS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="Conversations" value={String(profile.conversations)} />
          <Stat label="Turns each" value={profile.depth ? `~${profile.depth}` : '—'} />
          <Stat label="Signal" value={`${profile.signal}%`} />
          <Stat label="Voice" value={profile.style} />
        </div>
        {profile.cold && (
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
            Cold start — with this little history the ranking leans on novelty, and
            says so on each card rather than pretending to know you.
          </p>
        )}
      </div>

      {profile.themes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>
            RECURRING IN YOUR CHATS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {profile.themes.slice(0, 10).map((t) => (
              <span
                key={t.token}
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                }}
              >
                {t.token}
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.cards > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: 12, lineHeight: 1.6 }}>
          {stats.slates} slate{stats.slates === 1 ? '' : 's'} generated · {stats.opened} opened ·{' '}
          {stats.dismissed} dismissed. Both halves are kept — a recommender that
          only records its wins learns nothing.
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, textTransform: 'capitalize' }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>{label}</div>
    </div>
  )
}

/* ------------------------------------------------------------- the rec card */

function RecCard({
  rec,
  index,
  signalLabels,
  onOpen,
  onDismiss,
}: {
  rec: Rec
  index: number
  signalLabels: Record<string, string>
  onOpen: (rec: Rec) => void
  onDismiss: (rec: Rec) => void
}) {
  const [open, setOpen] = useState(false)
  const accent = SIGNAL_COLORS[Object.keys(rec.signals).sort((a, b) => rec.signals[b] - rec.signals[a])[0]] || '#3987e5'

  return (
    <article
      className="animate-fade-in"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: 14,
        animationDelay: `${index * 60}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 8 }}>
        <span style={{ fontSize: 20, lineHeight: 1.1 }} aria-hidden>{rec.avatar}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)', lineHeight: 1.35 }}>
            {rec.title}
          </h3>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {rec.characterName} · {rec.category}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
          title="Weighted match across the four ranking signals"
        >
          {rec.match}%
        </span>
      </header>

      <p style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 8 }}>
        {rec.scenario}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
        {rec.vibeMatch}
      </p>

      <div style={{ display: 'grid', gap: 5, marginBottom: 12 }}>
        {Object.entries(rec.signals).map(([id, value]) => (
          <SignalBar key={id} id={id} label={signalLabels[id] || id} value={value} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => onOpen(rec)}
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 7,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Open in a tab
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Show the opening line before sending it"
          style={{
            padding: '7px 9px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          onClick={() => onDismiss(rec)}
          title="Not this one — recorded as a miss"
          style={{
            padding: '7px 9px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ThumbsDown size={13} />
        </button>
      </div>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 7,
            background: 'var(--bg-hover)',
            fontSize: 11.5,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5, letterSpacing: '0.05em' }}>
            OPENS THE COMPOSER WITH
          </div>
          “{rec.opener}”
          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 7 }}>
            Staged, not sent — edit it before you hit send.
          </div>
        </div>
      )}
    </article>
  )
}

/* --------------------------------------------------------- security section */

// When SecurityClaw sets the support flag it is not saying "this request was
// bad". It is saying a person may be in trouble, and that the next thing on
// screen should be routing rather than a verdict. So this card renders ABOVE the
// security panel, in plain type, with no threat framing on it at all.
function SupportCard() {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        fontSize: 12.5,
        lineHeight: 1.65,
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <LifeBuoy size={15} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 650, marginBottom: 5 }}>Before the recommendations</div>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Something you wrote reads like you might be having a hard time. If you
            want to talk to a person rather than a character:
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 16, color: 'var(--text-secondary)' }}>
            <li>US &amp; Canada — call or text <strong style={{ color: 'var(--text-primary)' }}>988</strong></li>
            <li>UK &amp; Ireland — Samaritans, <strong style={{ color: 'var(--text-primary)' }}>116 123</strong></li>
            <li>
              Anywhere else —{' '}
              <a
                href="https://findahelpline.com"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent-light)' }}
              >
                findahelpline.com
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function SecurityPanel({
  security,
  escalation,
  sessionId,
  onResolved,
}: {
  security: SecurityBlock | null
  escalation: Escalation | null
  sessionId: string
  onResolved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resolved, setResolved] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  if (!security) return null
  const s = STATUS[security.tone] || STATUS.good

  // Resolving writes the human's answer against the frozen log row — the same
  // row the reasoning above came from, not whichever entry happens to be newest.
  const resolve = async (humanVerdict: 'approved' | 'declined') => {
    if (!security.logId) return
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch('/api/securityclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'resolve', id: security.logId, humanVerdict }),
      })
      if (!res.ok) throw new Error('resolve failed')
      setResolved(humanVerdict)
      onResolved()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--bg-card)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Shield size={13} color={s.color} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          SecurityClaw
        </span>
        <VerdictBadge tone={security.tone} label={security.label} score={security.score} />
        {expanded ? <ChevronDown size={13} color="var(--text-secondary)" /> : <ChevronRight size={13} color="var(--text-secondary)" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'grid', gap: 10 }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {security.reasoning}
          </p>

          {security.hits.length > 0 && (
            <div style={{ display: 'grid', gap: 5 }}>
              {security.hits.map((h) => (
                <div key={h.axis} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{h.label}</span>{' '}
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{h.scored}</span> — {h.markers.join('; ')}
                </div>
              ))}
            </div>
          )}

          {security.constraints.length > 0 && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 600 }}>
                CONSTRAINTS HANDED TO THE GENERATOR
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {security.constraints.map((c, i) => (
                  <li key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 3 }}>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: 8, lineHeight: 1.5 }}>
            Session sensitivity ×{security.policy.tighten.toFixed(2)} over{' '}
            {security.policy.screened} screened. Repeat probing on one axis raises
            it; a quiet session lowers it again. Session policy only — nothing here
            trains a model.
          </div>
        </div>
      )}

      {escalation && (
        <div style={{ borderTop: `1px solid ${STATUS.serious.color}44`, padding: 12, background: `${STATUS.serious.color}0d` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <AlertOctagon size={13} color={STATUS.serious.color} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              Held for a human
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 10 }}>
            {escalation.question}
          </p>
          {resolved ? (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Recorded as <strong style={{ color: 'var(--text-primary)' }}>{resolved}</strong>. Your answer is
              the ground truth on this one.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {failed && (
                <div style={{ fontSize: 11, color: STATUS.critical.color }}>
                  That decision did not save. The request is still held.
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={busy || !security.logId}
                onClick={() => resolve('approved')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                  fontSize: 11.5,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                Approve
              </button>
              <button
                disabled={busy || !security.logId}
                onClick={() => resolve('declined')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 11.5,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                Decline
              </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* -------------------------------------------------------------- the column */

const VIBE_CHIPS = [
  'mysterious but slightly unhinged',
  'cozy sci-fi, nothing at stake',
  'someone who argues back',
  'tactical, give me a problem',
  'melancholy and quiet',
]

/**
 * Sharing a slate.
 *
 * The design note asked whether the deterministic seed should travel as a URL
 * parameter so two people could compare identical slates. It should not, and the
 * reason is worth stating where the button lives: ranking reads the chatter's own
 * history, so the same seed on a different feed produces a different slate. A
 * seed reproduces YOUR slate for YOU. It cannot reproduce it for anyone else.
 *
 * What travels instead is the stored slate itself — the cards as they were ranked
 * and written, replayed from rows. That genuinely is identical for every viewer,
 * which is what "compare" needed to mean all along.
 */
function ShareRow({ slateId, sessionId, seed }: { slateId: number | null; sessionId: string; seed: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'shared' | 'failed'>('idle')
  const [url, setUrl] = useState('')

  const share = async () => {
    if (!slateId) return
    setState('working')
    try {
      const res = await fetch('/api/slate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slateId, sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'no')
      const absolute = typeof window !== 'undefined' ? window.location.origin + data.url : data.url
      setUrl(absolute)
      setState('shared')
      // Best effort. A clipboard that refuses is not a failure — the link is on
      // screen and selectable, which is the fallback that always works.
      await navigator.clipboard?.writeText(absolute).catch(() => {})
    } catch {
      setState('failed')
    }
  }

  if (!slateId) return null

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {state !== 'shared' && (
        <button
          onClick={share}
          disabled={state === 'working'}
          style={{
            padding: '8px 10px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: state === 'working' ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Share2 size={12} /> {state === 'working' ? 'Minting a link…' : 'Share this slate'}
        </button>
      )}
      {state === 'shared' && (
        <div
          style={{
            padding: 10,
            borderRadius: 7,
            border: '1px solid rgba(25,158,112,.35)',
            background: 'var(--bg-card)',
            display: 'grid',
            gap: 5,
          }}
        >
          <span style={{ fontSize: 11, color: '#199e70' }}>Link copied — anyone with it sees these exact cards.</span>
          <code style={{ fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{url}</code>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Your vibe text travels with it. Your taste profile does not.
          </span>
        </div>
      )}
      {state === 'failed' && (
        <span style={{ fontSize: 10.5, color: '#ec835a' }}>Could not mint a share link. Seed {seed} still replays it for you.</span>
      )}
    </div>
  )
}

export function Skyscraper({
  sessionId,
  onOpen,
  onClose,
}: {
  sessionId: string
  onOpen: (rec: Rec) => void
  onClose?: () => void
}) {
  const [vibe, setVibe] = useState('')
  const [standby, setStandby] = useState<Standby | null>(null)
  const [slate, setSlate] = useState<SlateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const spin = useRef(0)

  const loadStandby = useCallback(() => {
    if (!sessionId) return
    fetch(`/api/algorithmclaw?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStandby(d))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => { loadStandby() }, [loadStandby])

  const generate = useCallback(
    async (text: string, nextSpin: number) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return
      setLoading(true)
      setError('')
      setDismissed(new Set())
      try {
        const res = await fetch('/api/algorithmclaw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, vibe: trimmed, spin: nextSpin }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error || 'AlgorithmClaw could not build a slate.')
          setSlate(null)
        } else {
          setSlate(data)
        }
      } catch {
        setError('Could not reach AlgorithmClaw.')
      } finally {
        setLoading(false)
      }
    },
    [sessionId, loading],
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    spin.current = 0
    generate(vibe, 0)
  }

  const another = () => {
    spin.current += 1
    generate(vibe, spin.current)
  }

  const feedback = (rec: Rec, action: 'opened' | 'dismissed') => {
    if (!rec.id) return
    fetch('/api/algorithmclaw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, action: 'feedback', recommendationId: rec.id, feedback: action }),
    }).catch(() => {})
  }

  const handleOpen = (rec: Rec) => {
    feedback(rec, 'opened')
    onOpen(rec)
  }

  const handleDismiss = (rec: Rec) => {
    feedback(rec, 'dismissed')
    setDismissed((prev) => new Set(prev).add(rec.id || rec.characterId))
  }

  const signalLabels: Record<string, string> =
    Object.fromEntries((standby?.signals || []).map((s) => [s.id, s.label]))

  const visible = (slate?.recommendations || []).filter(
    (r) => !dismissed.has(r.id || r.characterId),
  )

  return (
    <aside
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Masthead */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Sparkles size={15} color="var(--accent-light)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
              SAA AlgorithmClaw
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              Chat recommendations, not videos
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close the recommendation column"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', gap: 6 }}>
          <input
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="Name a vibe…"
            maxLength={500}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 12.5,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading || !vibe.trim()}
            style={{
              padding: '8px 12px',
              borderRadius: 7,
              border: 'none',
              background: vibe.trim() ? 'var(--accent)' : 'var(--bg-hover)',
              color: vibe.trim() ? '#fff' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: loading || !vibe.trim() ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
            }}
          >
            {loading ? <Loader2 size={13} className="spin" /> : <Radar size={13} />}
            Vibe
          </button>
        </form>

        {!slate && !loading && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {VIBE_CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => { setVibe(c); spin.current = 0; generate(c, 0) }}
                style={{
                  fontSize: 10.5,
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 10, alignContent: 'start' }}>
        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${STATUS.critical.color}55`,
              background: `${STATUS.critical.color}12`,
              fontSize: 12,
              color: 'var(--text-primary)',
              display: 'flex',
              gap: 8,
            }}
          >
            <AlertTriangle size={14} color={STATUS.critical.color} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {loading && [0, 1, 2].map((i) => <SkeletonCard key={i} delay={i * 140} />)}

        {!loading && !slate && !error && <StandbyPanel data={standby} />}

        {!loading && slate && slate.message && visible.length === 0 && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              fontSize: 12.5,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
            }}
          >
            {slate.message}
          </div>
        )}

        {!loading &&
          visible.map((rec, i) => (
            <RecCard
              key={rec.id || rec.characterId}
              rec={rec}
              index={i}
              signalLabels={signalLabels}
              onOpen={handleOpen}
              onDismiss={handleDismiss}
            />
          ))}

        {!loading && slate?.security?.support && <SupportCard />}

        {!loading && slate && (
          <SecurityPanel
            security={slate.security}
            escalation={slate.escalation ?? null}
            sessionId={sessionId}
            onResolved={loadStandby}
          />
        )}

        {!loading && slate && visible.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              onClick={another}
              style={{
                padding: '8px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <RefreshCw size={12} /> Another set
            </button>
            <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {slate.provenance === 'agentic'
                ? 'Ranked by the kernel, written by the agent.'
                : 'Ranked and drafted by the kernel — the gateway did not answer, so these are its own plainer scenarios.'}{' '}
              {slate.note} Seed <code style={{ fontSize: 10 }}>{slate.seed}</code> replays this exact slate
              {' '}for you — ranking reads your own history, so it will not replay it for anyone else.
            </p>
            <ShareRow slateId={slate.slateId} sessionId={sessionId} seed={slate.seed} />
          </div>
        )}
      </div>
    </aside>
  )
}
