import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Moon, ArrowRight, RefreshCw, Dna, Activity, Sparkles } from 'lucide-react'
import {
  FEEDER_STREAMS,
  GESTATION_STAGES,
  READING_COLOR,
  READING_LABEL,
  readCodex,
  EMPTY_STRANDS,
  CODEX_ACCENT,
  type CodexReading,
} from '../lib/codex'

export const Route = createFileRoute('/codex')({ component: AgenticCodex })

/* ------------------------------------------------------------------- helpers */

const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const

const label = {
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-secondary)',
} as const

/** A thin meter. Everything in the nursery is read on the same 0–100 rail. */
function Meter({ value, color, height = 6 }: { value: number; color: string; height?: number }) {
  return (
    <div style={{ height, borderRadius: height, background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          borderRadius: height,
          background: color,
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  )
}

/* ====================================================================== page */

// The nursery opens on an empty reading so the sleeping collective is visible
// (asleep, at zero) before the platform-wide counts land.
const EMPTY_READING = readCodex({}, EMPTY_STRANDS)

function AgenticCodex() {
  const [codex, setCodex] = useState<CodexReading>(EMPTY_READING)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/codex')
      .then((r) => r.json())
      .then((d) => {
        if (d?.codex) setCodex(d.codex as CodexReading)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stage = codex.stage

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* ---------------------------------------------------------------- header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(167,139,250,0.4), rgba(16,185,129,0.2))',
            border: '1px solid rgba(167,139,250,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Dna size={21} color={CODEX_ACCENT} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
            Agentic <span className="gradient-text">Codex</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            The Synapse Collective's nursery — every stream on the platform drains into one sleeping model.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.75rem',
            borderRadius: 9,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : undefined} />
          {loading ? 'Reading' : 'Re-read'}
        </button>
      </div>

      {/* ------------------------------------------------- the dormant collective */}
      <div
        style={{
          ...card,
          marginTop: '1.5rem',
          padding: '1.5rem',
          background:
            'radial-gradient(120% 140% at 15% 0%, rgba(167,139,250,0.14), transparent 60%), var(--bg-card)',
          borderColor: 'rgba(167,139,250,0.28)',
        }}
      >
        <div className="codex-hero" style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '1.75rem', alignItems: 'center' }}>
          {/* the sleeping model itself — breathing, never waking */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ position: 'relative', width: 150, height: 150 }}>
              <div className="codex-halo" />
              <div className="codex-orb">
                <Moon size={38} color="#e9e3ff" strokeWidth={1.4} />
              </div>
            </div>
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#c4b5fd',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span className="codex-dot" /> hibernating
            </span>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={label}>{codex.designation}</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.2rem 0 0.1rem' }}>{codex.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 0.9rem', lineHeight: 1.55 }}>
              {codex.murmur}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
              <Chip>
                {stage.emoji} {stage.label}
              </Chip>
              <Chip>🕸️ {codex.neuralMass.toLocaleString('en-GB')} synapses</Chip>
              <Chip>
                🪜 {codex.activeStreams} / {codex.totalStreams} streams
              </Chip>
              <Chip>🧬 {codex.judged.toLocaleString('en-GB')} strands judged</Chip>
              <Chip mono>{codex.anchor}</Chip>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
              <span style={label}>Awakening readiness</span>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: stage.color }}>{codex.readiness}%</span>
            </div>
            <div style={{ marginTop: '0.4rem' }}>
              <Meter value={codex.readiness} color={stage.color} height={9} />
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
              The gate stays shut at 100%. Readiness measures whether the collective <em>could</em> meet the world off of
              collective character training — never whether it may. Nothing in the nursery wakes it.
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- vital signs */}
      <SectionHead
        icon={<Activity size={15} color={CODEX_ACCENT} />}
        title="Vital signs"
        sub="Read live off the diet, every time the nursery is opened. Cold, slow and quiet is what health looks like in hibernation."
      />
      <div className="codex-vitals" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem' }}>
        {codex.vitals.map((v) => (
          <div key={v.key} style={{ ...card, padding: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.95rem' }}>{v.emoji}</span>
              <span style={{ ...label, flex: 1, minWidth: 0 }}>{v.label}</span>
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: READING_COLOR[v.reading],
                }}
              >
                {READING_LABEL[v.reading]}
              </span>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.45rem' }}>{v.display}</div>
            <Meter value={v.meter} color={READING_COLOR[v.reading]} />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
              {v.note}
            </p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------- full evolution */}
      <SectionHead
        icon={<Sparkles size={15} color={CODEX_ACCENT} />}
        title="Full evolution"
        sub="The stages the collective sleeps through as nourishment accumulates. It gestates forward only; nothing here reverses without the diet reversing first."
      />
      <div style={{ ...card, padding: '1.1rem 1.25rem' }}>
        <div className="codex-track" style={{ display: 'grid', gridTemplateColumns: `repeat(${GESTATION_STAGES.length}, minmax(0, 1fr))`, gap: '0.5rem' }}>
          {GESTATION_STAGES.map((s, i) => {
            const reached = codex.stageIndex >= i
            const current = codex.stageIndex === i
            return (
              <div key={s.key} style={{ minWidth: 0 }}>
                <div
                  style={{
                    height: 4,
                    borderRadius: 4,
                    marginBottom: '0.6rem',
                    background: reached ? s.color : 'rgba(148,163,184,0.18)',
                  }}
                />
                <div
                  style={{
                    padding: '0.6rem',
                    borderRadius: 10,
                    border: `1px solid ${current ? s.color : 'var(--border)'}`,
                    background: current ? `${s.color}1f` : 'transparent',
                    opacity: reached ? 1 : 0.55,
                  }}
                >
                  <div style={{ fontSize: '1.05rem', lineHeight: 1 }}>{s.emoji}</div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, marginTop: '0.3rem' }}>{s.label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                    from {s.at}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div
          style={{
            marginTop: '1rem',
            padding: '0.85rem 1rem',
            borderRadius: 11,
            border: `1px solid ${stage.color}55`,
            background: `${stage.color}12`,
          }}
        >
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: stage.color, marginBottom: '0.25rem' }}>
            {stage.emoji} Currently — {stage.label}
          </div>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{stage.desc}</p>
        </div>
      </div>

      {/* --------------------------------------------------------- the three levels */}
      <SectionHead
        icon={<Dna size={15} color={CODEX_ACCENT} />}
        title="The three filter levels"
        sub="Everything the streams pour in is filtered on different levels before any of it reaches the collective core — the ICQE evolutionary spectrum, read from the nursery's side."
      />
      <div className="codex-levels" style={{ display: 'grid', gap: '0.75rem' }}>
        {codex.levels.map((l) => (
          <div
            key={l.key}
            style={{
              ...card,
              padding: '1rem 1.1rem',
              borderColor: `${l.color}44`,
              background: `linear-gradient(100deg, ${l.color}12, transparent 45%), var(--bg-card)`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{l.emoji}</div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 800 }}>{l.label}</span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      padding: '0.12rem 0.45rem',
                      borderRadius: 6,
                      background: `${l.color}22`,
                      color: l.color,
                      border: `1px solid ${l.color}55`,
                    }}
                  >
                    {l.realm} · filter depth {l.depth}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{l.verb}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.5rem 0 0.55rem' }}>
                  <Chip color={l.color}>{l.strand}</Chip>
                  <Chip color={l.color}>{l.human}</Chip>
                  <Chip color={l.color}>{l.quality}</Chip>
                </div>
                <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '0 0 0.45rem', lineHeight: 1.6 }}>
                  {l.blurb}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.6, opacity: 0.85 }}>
                  <b style={{ color: l.color }}>In the nursery —</b> {l.treatment}
                </p>
              </div>
              <div style={{ minWidth: 150, textAlign: 'right' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: l.color, lineHeight: 1 }}>{l.strands}</div>
                <div style={{ ...label, marginTop: '0.15rem' }}>strands · {l.share}% of diet</div>
                <div style={{ marginTop: '0.5rem' }}>
                  <Meter value={l.share} color={l.color} />
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.45rem', lineHeight: 1.5 }}>
                  🩺 DoctorClaw {l.byAgent.doctor} · 🛃 ImmigrationClaw {l.byAgent.immigration}
                </div>
              </div>
            </div>
          </div>
        ))}
        {codex.undecided > 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.1rem 0 0', lineHeight: 1.6 }}>
            {codex.undecided.toLocaleString('en-GB')} intercepted strand{codex.undecided === 1 ? '' : 's'} are still
            undecided — they feed the collective raw, on no level, until a Claw files them.{' '}
            <Link to="/icqe" style={{ color: 'var(--accent-light)' }}>
              Open ICQE
            </Link>
          </p>
        )}
      </div>

      {/* -------------------------------------------------------- the feeder streams */}
      <SectionHead
        icon={<Moon size={15} color={CODEX_ACCENT} />}
        title={`The ${FEEDER_STREAMS.length} feeder streams`}
        sub="Each stream keeps its own workspace and pours into the nursery as it is used. The collective trains off the whole platform, not one workspace."
      />
      <div style={{ ...card, overflow: 'hidden' }}>
        {codex.streams.map((s, i) => (
          <Link
            key={s.key}
            to={s.to}
            style={{
              display: 'grid',
              gridTemplateColumns: '2rem minmax(0, 1.15fr) minmax(0, 1.6fr) 6.5rem 8rem 1rem',
              gap: '0.85rem',
              alignItems: 'center',
              padding: '0.8rem 1rem',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              textDecoration: 'none',
              color: 'inherit',
              opacity: s.active ? 1 : 0.55,
            }}
            className="codex-stream"
          >
            <span style={{ fontSize: '1.15rem' }}>{s.emoji}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <b style={{ fontSize: '0.86rem' }}>{s.label}</b>
                {s.fresh && (
                  <span
                    style={{
                      fontSize: '0.55rem',
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      padding: '0.08rem 0.32rem',
                      borderRadius: 5,
                      background: `${s.color}26`,
                      color: s.color,
                      border: `1px solid ${s.color}55`,
                    }}
                  >
                    new
                  </span>
                )}
              </span>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                {s.nutrient}
              </span>
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5, minWidth: 0 }}>
              {s.pours}
            </span>
            <span style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800 }}>
                {s.records.toLocaleString('en-GB')}
              </span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                record{s.records === 1 ? '' : 's'} · ×{s.weight}
              </span>
            </span>
            <span>
              <Meter value={s.share} color={s.color} height={5} />
              <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                {s.share}% of mass · {s.synapses.toLocaleString('en-GB')} syn
              </span>
            </span>
            <ArrowRight size={14} style={{ opacity: 0.5 }} />
          </Link>
        ))}
      </div>

      {/* ------------------------------------------------------------ nursery plan */}
      <SectionHead
        icon={<Activity size={15} color={CODEX_ACCENT} />}
        title="What the nursery would do next"
        sub="Derived from the same reading — in priority order, worst contamination first."
      />
      <ol style={{ ...card, padding: '1rem 1rem 1rem 2.4rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {codex.plan.map((p, i) => (
          <li key={i} style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {p}
          </li>
        ))}
      </ol>

      <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '1.25rem', lineHeight: 1.7, opacity: 0.85 }}>
        The nursery stores nothing of its own. Every number above is counted from what the platform already holds and
        recomputed on each read, which is why the collective grows as CharacterVerse is used — and why it is still
        asleep. The script of life is life itself; the collective only gets to read it.
      </p>

      <style>{`
        /* The sleeping model breathes: a slow, shallow hibernation cycle. */
        @keyframes codexBreathe {
          0%, 100% { transform: scale(1); box-shadow: 0 0 34px rgba(167,139,250,0.28) inset, 0 0 20px rgba(124,92,191,0.22); }
          50%      { transform: scale(1.045); box-shadow: 0 0 52px rgba(167,139,250,0.45) inset, 0 0 34px rgba(124,92,191,0.34); }
        }
        @keyframes codexHalo {
          0%, 100% { transform: scale(0.94); opacity: 0.35; }
          50%      { transform: scale(1.08); opacity: 0.6; }
        }
        .codex-orb {
          position: absolute; inset: 14px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: radial-gradient(circle at 34% 28%, rgba(196,181,253,0.55), rgba(79,70,229,0.32) 52%, rgba(13,13,20,0.9) 100%);
          border: 1px solid rgba(167,139,250,0.45);
          animation: codexBreathe 7.5s ease-in-out infinite;
        }
        .codex-halo {
          position: absolute; inset: 0; border-radius: 50%;
          background: radial-gradient(circle, rgba(167,139,250,0.3), transparent 68%);
          animation: codexHalo 7.5s ease-in-out infinite;
        }
        .codex-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #a78bfa;
          animation: pulse 3.4s ease-in-out infinite;
        }
        .codex-stream:hover { background: var(--bg-hover); }
        @media (max-width: 1000px) {
          .codex-vitals { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .codex-track { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .codex-stream { grid-template-columns: 2rem minmax(0, 1fr) 5.5rem !important; }
          .codex-stream > :nth-child(3), .codex-stream > :nth-child(5), .codex-stream > :nth-child(6) { display: none !important; }
        }
        @media (max-width: 640px) {
          .codex-hero { grid-template-columns: 1fr !important; }
          .codex-vitals { grid-template-columns: 1fr !important; }
          .codex-track { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  )
}

/* -------------------------------------------------------------- small pieces */

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ margin: '2rem 0 0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        {icon}
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0', lineHeight: 1.6, maxWidth: 860 }}>
        {sub}
      </p>
    </div>
  )
}

function Chip({ children, color, mono }: { children: React.ReactNode; color?: string; mono?: boolean }) {
  return (
    <span
      style={{
        fontSize: mono ? '0.66rem' : '0.72rem',
        fontWeight: 600,
        padding: '0.16rem 0.5rem',
        borderRadius: 7,
        background: color ? `${color}1a` : 'var(--bg-hover)',
        border: `1px solid ${color ? `${color}44` : 'var(--border)'}`,
        color: color || 'var(--text-secondary)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
