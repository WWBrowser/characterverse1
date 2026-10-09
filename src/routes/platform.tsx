import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { MODES } from '../lib/modes'
import {
  Aperture,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  PlayCircle,
  Rocket,
  Brain,
  Cpu,
  LayoutGrid,
  ListTree,
  CheckCircle2,
  Smartphone,
  MessageSquare,
  Send,
  KeyRound,
  Database,
  CreditCard,
  ShieldCheck,
  GraduationCap,
  Gamepad2,
  Briefcase,
  Drama,
  Megaphone,
  Wand2,
  Check,
  Users,
  Boxes,
} from 'lucide-react'

/* ------------------------------------------------------------------ shared UI */

const TABS = ['Overview', 'How It Works', 'Use Cases', 'Pricing', 'Get Started'] as const
type Tab = (typeof TABS)[number]

function SectionHeading({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 2.5rem' }}>
      {kicker && (
        <p
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--accent-light)',
            marginBottom: '0.6rem',
          }}
        >
          {kicker}
        </p>
      )}
      <h2 style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
        {title}
      </h2>
      {sub && <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '0.75rem', lineHeight: 1.6 }}>{sub}</p>}
    </div>
  )
}

function Card({ children, glow }: { children: React.ReactNode; glow?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${glow ? 'rgba(124,92,191,0.4)' : 'var(--border)'}`,
        borderRadius: 18,
        padding: '1.5rem',
        height: '100%',
        boxShadow: glow ? '0 0 40px rgba(124,92,191,0.12)' : 'none',
      }}
    >
      {children}
    </div>
  )
}

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: 'rgba(124,92,191,0.15)',
        border: '1px solid rgba(124,92,191,0.3)',
        color: 'var(--accent-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1rem',
      }}
    >
      {children}
    </div>
  )
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.8rem 1.5rem',
        borderRadius: 999,
        border: 'none',
        background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
        color: 'white',
        fontSize: '0.95rem',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(124,92,191,0.35)',
      }}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.8rem 1.5rem',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        fontSize: '0.95rem',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/* --------------------------------------------------------------- Tri-entrance */

const ENTRANCE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Drama,
  GraduationCap,
  Briefcase,
  Aperture,
}

function TriEntrance() {
  const navigate = useNavigate()
  return (
    <section>
      <SectionHeading
        kicker="Four ways in"
        title="Pick your entrance — so you arrive with purpose"
        sub="Each door opens the same LLM, tuned for what you came to do. Roleplaying, learning, business, and SPR each get their own features and their own memory — and SPR opens onto four answers at once instead of one."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {MODES.map((m) => {
          const Ico = ENTRANCE_ICONS[m.icon] ?? Sparkles
          return (
            <div
              key={m.id}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-card)',
                border: `1px solid ${m.accent}40`,
                borderRadius: 20,
                padding: '1.6rem',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(120% 80% at 50% 0%, ${m.accent}1f, transparent 60%)`,
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: `${m.accent}22`,
                    border: `1px solid ${m.accent}55`,
                    color: m.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <Ico size={26} color={m.accent} />
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  {m.emoji} {m.label}
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '1.1rem' }}>{m.tagline}</p>

                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.4rem' }}>
                  {m.features.map((f) => (
                    <li key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      <Check size={15} color={m.accent} style={{ flexShrink: 0, marginTop: 3 }} />
                      <span>
                        <span style={{ fontWeight: 600 }}>{f.title}</span>
                        <span style={{ color: 'var(--text-secondary)' }}> — {f.body}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate({ to: '/mode/$mode', params: { mode: m.id } })}
                  style={{
                    marginTop: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.8rem 1.25rem',
                    borderRadius: 999,
                    border: 'none',
                    background: `linear-gradient(135deg, ${m.accent}, ${m.accent}bb)`,
                    color: 'white',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: `0 8px 24px ${m.accent}40`,
                  }}
                >
                  {m.enterCta} <ArrowRight size={16} />
                </button>
                {/* Back button underneath each entrance → the Ask (LLM) side. */}
                <Link
                  to="/ask"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    marginTop: '0.6rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none',
                  }}
                >
                  <ArrowLeft size={13} /> Back to Ask
                </Link>
              </div>
            </div>
          )
        })}
      </div>
      <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1.5rem' }}>
        Shared features like memory and the TourClaw guide carry across all three — united, but kept in three separate lanes.
      </p>
    </section>
  )
}

/* ----------------------------------------------------------------- Overview */

function Overview({ go }: { go: (t: Tab) => void }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5rem' }}>
      {/* Hero */}
      <section style={{ textAlign: 'center', paddingTop: '1.5rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.9rem',
            borderRadius: 999,
            border: '1px solid rgba(124,92,191,0.35)',
            background: 'rgba(124,92,191,0.12)',
            fontSize: '0.78rem',
            color: 'var(--accent-light)',
            marginBottom: '1.75rem',
          }}
        >
          <Sparkles size={13} />
          The AI that builds your product for you
        </div>
        <h1
          style={{
            fontSize: 'clamp(2.2rem, 6vw, 4rem)',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          Build your product with <span className="gradient-text">plain words</span> in minutes
        </h1>
        <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', maxWidth: 600, margin: '1.5rem auto 0', lineHeight: 1.6 }}>
          Just tell CharacterVerse what you want. CharacterVerse runs the work. You run the business.
        </p>
        <div style={{ display: 'flex', gap: '0.85rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2.25rem' }}>
          <PrimaryButton onClick={() => navigate({ to: '/ask' })}>
            Start Building <ArrowRight size={17} />
          </PrimaryButton>
          <GhostButton onClick={() => go('How It Works')}>
            <PlayCircle size={17} /> Watch Demo
          </GhostButton>
        </div>
      </section>

      {/* More than a character site — the two-network announcement (HAN + ARN) */}
      <section>
        <div
          style={{
            border: '1px solid rgba(124,92,191,0.3)',
            borderRadius: 24,
            padding: 'clamp(1.5rem, 4vw, 2.75rem)',
            background: 'linear-gradient(135deg, rgba(124,92,191,0.14), rgba(79,70,229,0.08))',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.35rem 0.9rem', borderRadius: 999,
              border: '1px solid rgba(124,92,191,0.35)', background: 'rgba(124,92,191,0.14)',
              fontSize: '0.78rem', color: 'var(--accent-light)', marginBottom: '1.25rem',
            }}
          >
            <Sparkles size={13} /> More than a character site
          </div>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', maxWidth: 820, margin: '0 auto', lineHeight: 1.12 }}>
            Three networks, one universe — <span className="gradient-text">people</span>, <span className="gradient-text">agents</span> &amp; <span className="gradient-text">services</span>
          </h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '1.25rem auto 0', lineHeight: 1.6 }}>
            CharacterVerse is the <b style={{ color: 'var(--text-primary)' }}>Agentic Reverse Network (ARN)</b> — agent-centric and task-based.
            Its human counterpart is <b style={{ color: 'var(--text-primary)' }}>CharacterVerse Social</b>, the
            {' '}<b style={{ color: 'var(--text-primary)' }}>Human Anchor Network (HAN)</b> — person-centric and trust-based.
            And <b style={{ color: 'var(--text-primary)' }}>TabVerse</b> is the forkable <b style={{ color: 'var(--text-primary)' }}>service base</b> that binds them — a Chromium-like registry of domain tab-services with a circular entropy-recycling engine.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', margin: '2rem auto 0', maxWidth: 900, textAlign: 'left' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Users size={18} color="var(--accent-light)" />
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>HAN · Human Anchor Network</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                Real human accounts. Profiles, values, trust circles, a signable wall and bulletins — a person-first social layer, no algorithm.
              </p>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Cpu size={18} color="var(--accent-light)" />
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>ARN · Agentic Reverse Network</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                The CharacterVerse you know — build, train and deploy AI characters and agents that do real work, task by task.
              </p>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Boxes size={18} color="var(--accent-light)" />
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>CVT · TabVerse</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                Fork domain tab-services — Medical, Finance, Scam Detection — into your own sovereign mirror. A digital powerplant that recycles its own entropy.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.85rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem' }}>
            <PrimaryButton onClick={() => navigate({ to: '/social' })}>
              Enter CharacterVerse Social <ArrowRight size={17} />
            </PrimaryButton>
            <GhostButton onClick={() => navigate({ to: '/tabverse' })}>
              Open TabVerse
            </GhostButton>
          </div>
        </div>
      </section>

      {/* Three entrances */}
      <TriEntrance />

      {/* Value propositions */}
      <section>
        <SectionHeading
          kicker="Why CharacterVerse"
          title="Built to launch — not just to look good"
          sub="Three things every real product needs, handled from the first message."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          <Card>
            <FeatureIcon>
              <Rocket size={20} />
            </FeatureIcon>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Built to launch</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.9rem' }}>
              Not just a polished front end. A complete product ready to go.
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { icon: <KeyRound size={15} />, label: 'Login system' },
                { icon: <Database size={15} />, label: 'Data storage' },
                { icon: <CreditCard size={15} />, label: 'Payments' },
                { icon: <ShieldCheck size={15} />, label: 'Admin tools' },
              ].map((f) => (
                <li key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                  <span style={{ color: 'var(--accent-light)', display: 'flex' }}>{f.icon}</span>
                  {f.label}
                </li>
              ))}
            </ul>
          </Card>

          <Card glow>
            <FeatureIcon>
              <Brain size={20} />
            </FeatureIcon>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Knows you better over time</h3>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.9rem' }}>
              CharacterVerse remembers your preferences. The longer you work together, the more it feels like a partner who
              actually gets you.
            </p>
            <Link
              to="/memory"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--accent-light)',
                textDecoration: 'none',
              }}
            >
              See what it remembers <ArrowRight size={15} />
            </Link>
          </Card>

          <Card>
            <FeatureIcon>
              <Cpu size={20} />
            </FeatureIcon>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Built on the best models</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Powered by today's most capable AI models, so what you build is stronger from the start and ready for real use.
            </p>
          </Card>
        </div>
      </section>

      {/* Problem solver */}
      <section>
        <SectionHeading
          kicker="Stop wearing every mask"
          title="Say what, not how"
          sub="Give CharacterVerse the goal. It breaks the work down, prioritizes it, and pushes it forward — and only comes back when it matters."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {[
            {
              icon: <Drama size={20} />,
              title: 'Stop wearing every mask',
              body: 'Give CharacterVerse the goal. It breaks it down, builds it, tests it, and comes back when it’s done. Stop context switching.',
            },
            {
              icon: <ListTree size={20} />,
              title: 'Say what, not how',
              body: 'CharacterVerse breaks it into tasks, sets priorities, and pushes them forward. You don’t need to project-manage your AI.',
            },
            {
              icon: <CheckCircle2 size={20} />,
              title: 'You step in for key decisions only',
              body: 'CharacterVerse pushes work forward. When it needs a decision or sign-off, it brings back results — not questions every five minutes.',
            },
          ].map((c) => (
            <Card key={c.title}>
              <FeatureIcon>{c.icon}</FeatureIcon>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{c.title}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Work anywhere */}
      <section>
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(124,92,191,0.16), rgba(79,70,229,0.1))',
            border: '1px solid rgba(124,92,191,0.3)',
            borderRadius: 24,
            padding: 'clamp(1.75rem, 4vw, 3rem)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: '2rem',
            alignItems: 'center',
          }}
          className="cv-anywhere"
        >
          <div>
            <FeatureIcon>
              <Smartphone size={20} />
            </FeatureIcon>
            <h2 style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Stop being tied to your desk
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '0.85rem', lineHeight: 1.6, maxWidth: 460 }}>
              Send a message when the thought hits. Work keeps moving, even when you step away. Message CharacterVerse from
              Slack, Telegram, or the web — the moment the idea hits, just send it. CharacterVerse takes it from there.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { icon: <MessageSquare size={17} />, label: 'Slack', note: 'Message from any channel' },
              { icon: <Send size={17} />, label: 'Telegram', note: 'Fire off an idea on the go' },
              { icon: <Smartphone size={17} />, label: 'Web & Mobile', note: 'Pick up right where you left' },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: 'rgba(124,92,191,0.15)',
                    color: 'var(--accent-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {c.icon}
                </span>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{c.label}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Insights strip */}
      <section style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-light)', marginBottom: '0.6rem' }}>
          Insights & Updates
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto' }}>
          Live model-version upgrades and training dispatch keep every product you build current — without you lifting a finger.
        </p>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------- How It Works */

function HowItWorks() {
  const navigate = useNavigate()
  const steps = [
    {
      icon: <MessageSquare size={20} />,
      title: 'Tell it what you want',
      body: 'Describe your product in plain words — through chat, voice, mobile, or web. No spec, no tickets, no code.',
    },
    {
      icon: <ListTree size={20} />,
      title: 'It plans and builds',
      body: 'CharacterVerse breaks the goal into tasks, sets priorities, and pushes them forward — building, testing, and refining as it goes.',
    },
    {
      icon: <CheckCircle2 size={20} />,
      title: 'You sign off on what matters',
      body: 'It only interrupts for real decisions, bringing back finished results instead of a stream of questions.',
    },
    {
      icon: <Rocket size={20} />,
      title: 'Launch a complete product',
      body: 'Login, data storage, payments, and admin tools ship together — so you launch something real, not a demo.',
    },
  ]
  return (
    <div>
      <SectionHeading
        kicker="How it works"
        title="Give it the goal. It does the rest."
        sub="CharacterVerse breaks it down, builds it, tests it, and comes back when it’s done."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {steps.map((s, i) => (
          <Card key={s.title}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <FeatureIcon>{s.icon}</FeatureIcon>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--border)', lineHeight: 1 }}>{i + 1}</span>
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{s.title}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.body}</p>
          </Card>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
        <PrimaryButton onClick={() => navigate({ to: '/ask' })}>
          Try it now <ArrowRight size={17} />
        </PrimaryButton>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Use Cases */

function UseCases() {
  const cases = [
    { icon: <Drama size={20} />, title: 'Roleplay & companions', body: 'Spin up living characters with their own voice, memory, and personality — for stories, play, or company.' },
    { icon: <GraduationCap size={20} />, title: 'Learning & tutoring', body: 'Build patient subject-matter tutors that adapt to each learner and remember where they left off.' },
    { icon: <Gamepad2 size={20} />, title: 'Gaming & NPCs', body: 'Drop in characters that react, scheme, and stay in character across an entire campaign.' },
    { icon: <Briefcase size={20} />, title: 'Coaching & advisors', body: 'Stand up always-on coaches that know your goals and keep nudging you toward them.' },
    { icon: <Megaphone size={20} />, title: 'Outbound & support', body: 'Put autonomous specialists on real jobs across chat, voice, and email — not just conversation.' },
    { icon: <LayoutGrid size={20} />, title: 'Whatever you imagine', body: 'These started empty until public data filled them. That thing you’ve been wanting to build? Now you can.' },
  ]
  return (
    <div>
      <SectionHeading
        kicker="Use cases"
        title="No team to build. No developer to find. No code to write."
        sub="Just tell a mini-agent what you want — and CharacterVerse will provide."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        {cases.map((c) => (
          <Card key={c.title}>
            <FeatureIcon>{c.icon}</FeatureIcon>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{c.title}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{c.body}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- Pricing */

function Pricing() {
  const tiers = [
    {
      name: 'Explore',
      price: 'Free',
      note: 'For trying CharacterVerse',
      features: ['Build with plain words', 'Chat with any character', 'Long-term memory', 'Community characters'],
      cta: 'Start free',
      glow: false,
    },
    {
      name: 'Builder',
      price: '£29',
      note: 'per month',
      features: ['Everything in Explore', 'Login, storage & payments', 'Admin tools', 'Slack & Telegram', 'Priority models'],
      cta: 'Start building',
      glow: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      note: 'For teams & workspaces',
      features: ['Autonomous workforce', 'AI Control Tower', 'Context Engine', 'Security clearances', 'Audit & governance'],
      cta: 'Talk to us',
      glow: false,
    },
  ]
  const navigate = useNavigate()
  return (
    <div>
      <SectionHeading kicker="Pricing" title="Start free. Launch when you’re ready." sub="No team to hire. Pay for the product you ship, not the people you’d have needed." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', alignItems: 'stretch' }}>
        {tiers.map((t) => (
          <Card key={t.name} glow={t.glow}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {t.glow && (
                <span
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 6,
                    background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                    color: 'white',
                    marginBottom: '0.75rem',
                  }}
                >
                  Most popular
                </span>
              )}
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', margin: '0.6rem 0 0.2rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t.price}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.note}</span>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.55rem', margin: '1.1rem 0 1.5rem' }}>
                {t.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    <Check size={15} color="var(--accent-light)" />
                    {f}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto' }}>
                <button
                  onClick={() => (t.name === 'Enterprise' ? navigate({ to: '/enterprise' }) : navigate({ to: '/ask' }))}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: 10,
                    border: t.glow ? 'none' : '1px solid var(--border)',
                    background: t.glow ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
                    color: t.glow ? 'white' : 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t.cta}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- Get Started */

function GetStarted() {
  const navigate = useNavigate()
  const links = [
    { icon: <Wand2 size={18} />, title: 'Create a character', body: 'Design a persona from scratch in a minute.', to: '/create' as const },
    { icon: <Sparkles size={18} />, title: 'Ask a character', body: 'Pick one and start a live conversation.', to: '/ask' as const },
    { icon: <Brain size={18} />, title: 'Review your memory', body: 'See and shape what CharacterVerse remembers about you.', to: '/memory' as const },
  ]
  return (
    <div>
      <SectionHeading kicker="Get started" title="That thing you’ve been wanting to build?" sub="Now you can. Just tell CharacterVerse what you want — and it takes it from there." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        {links.map((l) => (
          <Link key={l.to} to={l.to} style={{ textDecoration: 'none' }}>
            <Card>
              <FeatureIcon>{l.icon}</FeatureIcon>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{l.title}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{l.body}</p>
            </Card>
          </Link>
        ))}
      </div>
      <div
        style={{
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(124,92,191,0.16), rgba(79,70,229,0.1))',
          border: '1px solid rgba(124,92,191,0.3)',
          borderRadius: 24,
          padding: 'clamp(2rem, 5vw, 3.5rem)',
        }}
      >
        <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15 }}>
          Build your product with <span className="gradient-text">plain words</span>
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', marginTop: '0.9rem' }}>
          Tell CharacterVerse what you want. It runs the work. You run the business.
        </p>
        <div style={{ marginTop: '1.75rem' }}>
          <PrimaryButton onClick={() => navigate({ to: '/ask' })}>
            Start Building <ArrowRight size={17} />
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- Landing page */

function Landing() {
  const [tab, setTab] = useState<Tab>('Overview')

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: 'var(--bg-primary)' }}>
      {/* Page tab system */}
      <div
        style={{
          position: 'sticky',
          top: 60,
          zIndex: 20,
          background: 'rgba(13,13,20,0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '0 1.25rem',
            display: 'flex',
            gap: '0.25rem',
            overflowX: 'auto',
          }}
        >
          {TABS.map((t) => {
            const active = t === tab
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '0.9rem 0.85rem',
                  border: 'none',
                  background: 'none',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '0.88rem',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 1.25rem 5rem' }}>
        {tab === 'Overview' && <Overview go={setTab} />}
        {tab === 'How It Works' && <HowItWorks />}
        {tab === 'Use Cases' && <UseCases />}
        {tab === 'Pricing' && <Pricing />}
        {tab === 'Get Started' && <GetStarted />}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/platform')({
  component: Landing,
})
