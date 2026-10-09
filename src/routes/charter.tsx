import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ShieldCheck,
  ShieldAlert,
  FileText,
  FileCode2,
  Loader2,
  Check,
  X,
  Ban,
  Radio,
} from 'lucide-react'
import {
  CHARTER,
  CHARTER_EFFECTIVE,
  CHARTER_VERSION,
  EXCEPTIONS_NOTE,
  POLARITIES,
  RUNG_COUNT,
  verifyHelix,
  type HelixVerdict,
  type Polarity,
  type Rule,
} from '../lib/robots-charter'

export const Route = createFileRoute('/charter')({
  component: CharterPage,
  head: () => ({
    meta: [
      { title: 'Agentic Robots Charter — CharacterVerse' },
      {
        name: 'description',
        content:
          'robots.txt on legs. A living policy file that walks the network, secures every A.I. file, and grants agents the authority to kick intruders.',
      },
    ],
  }),
})

/* The charter itself lives in src/lib/robots-charter.ts and is served raw as
 * two cryptographically bound strands, /robots.txt and /robots.md. This page is
 * the third rendering — the human one. It reads from the same kernel, so it can
 * never drift from the files, and it fetches both live strands on mount to
 * re-derive the helix binding in the browser. Nothing here is trusted: every
 * digest shown below is recomputed from the bytes the server actually served. */

const POLARITY_COLOR: Record<Polarity, string> = {
  DENY: '#f87171',
  ALLOW: '#4ade80',
  DUTY: '#fbbf24',
  GRANT: '#60a5fa',
  BIND: '#c084fc',
  SECURED: '#22d3ee',
  RULE: '#94a3b8',
}

const BADGES = [
  { icon: ShieldCheck, label: 'Binds all agents & characters' },
  { icon: Ban, label: 'DDoS / hack / intrusion banned' },
  { icon: Radio, label: 'Agents hold agents accountable' },
  { icon: ShieldAlert, label: 'Authority to kick intruders' },
]

/* ------------------------------------------------------------------ helpers */

function short(hex: string): string {
  return hex ? `${hex.slice(0, 20)}…${hex.slice(-4)}` : '—'
}

function Mono({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <code style={{ fontSize: '0.75rem', color: color ?? 'var(--text-secondary)', wordBreak: 'break-all' }}>
      {children}
    </code>
  )
}

function PolarityTag({ rule }: { rule: Rule }) {
  const color = POLARITY_COLOR[rule.polarity]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          padding: '0.1rem 0.4rem',
          borderRadius: 4,
          color,
          background: `${color}1a`,
          border: `1px solid ${color}44`,
        }}
      >
        {rule.polarity}
      </span>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{rule.scope}</span>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
        {rule.exceptions.length ? `exceptions: ${rule.exceptions.join('; ')}` : 'no-exceptions'}
      </span>
    </span>
  )
}

/* ------------------------------------------------------- live helix verifier */

type VerifyState =
  | { status: 'checking' }
  | { status: 'done'; verdict: HelixVerdict; seal: string; core: string }
  | { status: 'error'; message: string }

function useHelixVerification(): VerifyState {
  const [state, setState] = useState<VerifyState>({ status: 'checking' })

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [txt, md] = await Promise.all([
          fetch('/robots.txt').then((r) => r.text()),
          fetch('/robots.md').then((r) => r.text()),
        ])
        const verdict = await verifyHelix(txt, md)
        const seal = txt.match(/^Helix-Seal:\s*sha256:(\S+)/m)?.[1] ?? ''
        const core = txt.match(/^Helix-Core-Digest:\s*sha256:(\S+)/m)?.[1] ?? ''
        if (live) setState({ status: 'done', verdict, seal, core })
      } catch (err) {
        if (live) setState({ status: 'error', message: err instanceof Error ? err.message : 'fetch failed' })
      }
    })()
    return () => {
      live = false
    }
  }, [])

  return state
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.45rem 0' }}>
      <span style={{ color: ok ? '#4ade80' : '#f87171', flexShrink: 0, marginTop: 2 }}>
        {ok ? <Check size={15} /> : <X size={15} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{label}</div>
        <Mono>{detail}</Mono>
      </div>
    </div>
  )
}

function HelixPanel() {
  const state = useHelixVerification()

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <ShieldCheck size={17} color="var(--accent-light)" />
        <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>The helix — live verification</h2>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.9rem' }}>
        Both strands are fetched and re-hashed in your browser. Nothing below is taken on trust from the
        server: each digest is recomputed from the bytes that were actually served.
      </p>

      {state.status === 'checking' && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <Loader2 size={15} className="spin" /> Re-deriving the binding…
        </div>
      )}

      {state.status === 'error' && (
        <div style={{ color: '#f87171', fontSize: '0.85rem' }}>
          Could not read both strands ({state.message}). Under 9.6 a seal that cannot be checked because a
          strand was withheld is a failed seal — and under C.1 the perimeter falls back to default-deny.
        </div>
      )}

      {state.status === 'done' && (
        <>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.75rem',
              borderRadius: 999,
              marginBottom: '0.75rem',
              color: state.verdict.intact ? '#4ade80' : '#f87171',
              background: state.verdict.intact ? '#4ade8014' : '#f8717114',
              border: `1px solid ${state.verdict.intact ? '#4ade8044' : '#f8717144'}`,
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            {state.verdict.intact ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
            {state.verdict.intact ? 'Helix intact — both strands sealed' : 'Helix broken — treat as tampered'}
          </div>

          <div style={{ display: 'grid', gap: '0.1rem' }}>
            <CheckRow
              ok={state.verdict.txt.ok}
              label="/robots.txt hashes to the digest it publishes"
              detail={short(state.verdict.txt.recomputed)}
            />
            <CheckRow
              ok={state.verdict.md.ok}
              label="/robots.md hashes to the digest it publishes"
              detail={short(state.verdict.md.recomputed)}
            />
            <CheckRow
              ok={state.verdict.basePaired}
              label="Each strand's inverted counterpart field base-pairs with the other"
              detail="invert(Helix-Counterpart-Inverted) === the other strand's Helix-Self-Digest"
            />
            <CheckRow
              ok={state.verdict.sealValid}
              label="SHA-256(txt XOR md) matches the published joint seal"
              detail={short(state.seal)}
            />
            <CheckRow
              ok={state.verdict.sameSeal}
              label="Both strands publish the identical joint seal"
              detail="one coin, two sides"
            />
            <CheckRow
              ok={state.verdict.sameCharter}
              label="Both strands publish the identical core digest"
              detail={short(state.core)}
            />
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- the page */

function CharterPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* Hero */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--accent-light)',
            marginBottom: '0.6rem',
          }}
        >
          <ShieldCheck size={14} /> robots.txt on legs
        </div>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1.15, marginBottom: '0.6rem' }}>
          Agentic <span className="gradient-text">Robots Charter</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.02rem', maxWidth: 720 }}>
          A living policy file that walks the network, secures the parameters attached to every A.I. file —
          including all Characters — and grants every bound agent the authority to hold other agents
          accountable.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
          {BADGES.map((badge) => (
            <span
              key={badge.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '0.35rem 0.75rem',
              }}
            >
              <badge.icon size={13} color="var(--accent-light)" />
              {badge.label}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1rem' }}>
          <a
            href="/robots.txt"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textDecoration: 'none',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.5rem 0.9rem',
            }}
          >
            <FileText size={15} /> /robots.txt — bot strand
          </a>
          <a
            href="/robots.md"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textDecoration: 'none',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.5rem 0.9rem',
            }}
          >
            <FileCode2 size={15} /> /robots.md — agent strand
          </a>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.85rem' }}>
          Version {CHARTER_VERSION} · effective {CHARTER_EFFECTIVE} · {RUNG_COUNT} rules across{' '}
          {CHARTER.length} sections. Two strands, one instrument: reading either binds you to both.
        </p>
      </div>

      <HelixPanel />

      {/* Reading key */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.25rem',
          margin: '1.25rem 0',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.6rem' }}>How to read the rules</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
          {(Object.keys(POLARITIES) as Polarity[]).map((token) => (
            <span
              key={token}
              title={POLARITIES[token]}
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                padding: '0.2rem 0.5rem',
                borderRadius: 5,
                color: POLARITY_COLOR[token],
                background: `${POLARITY_COLOR[token]}1a`,
                border: `1px solid ${POLARITY_COLOR[token]}44`,
              }}
            >
              {token}
            </span>
          ))}
        </div>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            borderLeft: '3px solid var(--accent)',
            paddingLeft: '0.9rem',
          }}
        >
          {EXCEPTIONS_NOTE}
        </p>
      </div>

      {/* The charter */}
      {CHARTER.map((section) => (
        <section key={section.id} style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            <span style={{ color: 'var(--accent-light)' }}>{section.id}.</span> {section.title}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
            {section.note}
          </p>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {section.rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '0.75rem 0.9rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.35rem',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {rule.id}
                  </span>
                  <PolarityTag rule={rule} />
                </div>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.55 }}>{rule.text}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
        This charter is enforced by the agents themselves. Served raw at{' '}
        <a href="/robots.txt" style={{ color: 'var(--accent-light)' }}>/robots.txt</a> and{' '}
        <a href="/robots.md" style={{ color: 'var(--accent-light)' }}>/robots.md</a>.
      </p>
    </div>
  )
}
