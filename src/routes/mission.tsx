import { createFileRoute, Link } from '@tanstack/react-router'
import { Sparkles, GitFork, Layers, Cpu, Database, Coins, ChevronRight, Gem } from 'lucide-react'

/* The base infrastructure that others could fork on top of. */
const BASE_LAYERS = [
  'Character system',
  'Memory blocks (5 lanes)',
  'Agentic cron',
  'Cluster Control',
  'AERL routing',
  'Entanglement measurement',
  'Token economy',
]

/* Hypothetical forks built on the CharacterVerse base — the Chromium analogy. */
const FORKS = [
  { label: 'CharacterVerse + enterprise features', emoji: '🏢' },
  { label: 'CharacterVerse + gaming layer', emoji: '🎮' },
  { label: 'CharacterVerse + education customization', emoji: '🎓' },
  { label: 'CharacterVerse + healthcare domain', emoji: '🩺' },
]

/* Why the foundation is forkable — the additive, isolated architecture. */
const FORKABLE_BECAUSE = [
  { title: 'Everything is additive', desc: 'No database migration ever breaks what came before — features stack, they never tear down.' },
  { title: 'Concerns are isolated', desc: 'Memory lanes, agent routing, and cron each stand on their own and can be swapped or extended in place.' },
  { title: 'The core stays simple', desc: 'At the center it is still a character and a reply loop — small enough to build a hundred things on top of.' },
  { title: 'Flexibility is built in', desc: 'A context engine and privacy scopes leave room for someone else to add their own layer without forking the base.' },
]

/* The three pieces of the whole stack — beyond a shareable base. */
const STACK = [
  {
    icon: <Cpu size={22} />,
    title: 'The operating system',
    desc: 'The platform agents and members live inside — characters, memory, routing, clusters, and the cron clock that keeps them aware of now.',
    color: '#7c5cbf',
  },
  {
    icon: <Database size={22} />,
    title: 'The training pipeline',
    desc: 'Every conversation is co-evolution data. The real product is the weights harvested from how characters and people grow together.',
    color: '#4f46e5',
  },
  {
    icon: <Coins size={22} />,
    title: 'The economy that sustains it',
    desc: 'A token economy that funds the loop, rewards the creators, and keeps the training ground producing the next generation.',
    color: '#0891b2',
  },
]

function TreeNode({ label, depth = 0, last = false }: { label: string; depth?: number; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: '0.82rem', lineHeight: 1.9, color: 'var(--text-secondary)' }}>
      <span style={{ color: 'var(--border)', whiteSpace: 'pre' }}>
        {depth > 0 ? '   '.repeat(depth) + (last ? '└─ ' : '├─ ') : ''}
      </span>
      <span style={{ color: depth === 0 ? 'var(--accent-light)' : 'var(--text-secondary)', fontWeight: depth === 0 ? 700 : 400 }}>
        {label}
      </span>
    </div>
  )
}

function MissionPage() {
  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Hero */}
      <div style={{ padding: '4rem 1.25rem 2.5rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,92,191,0.16), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 1rem',
              borderRadius: 999,
              background: 'rgba(124,92,191,0.12)',
              border: '1px solid rgba(124,92,191,0.25)',
              color: 'var(--accent-light)',
              fontSize: '0.8rem',
              fontWeight: 500,
              marginBottom: '1.5rem',
            }}
          >
            <Sparkles size={13} />
            Our Mission
          </div>
          <h1
            style={{
              fontSize: 'clamp(1.9rem, 4.5vw, 3.2rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: '1.25rem',
              color: 'var(--text-primary)',
            }}
          >
            Not a base others fork.{' '}
            <span className="gradient-text">The whole stack.</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 600, margin: '0 auto' }}>
            Google Chrome, Edge, Brave and Opera are all forks of Chromium — many products
            built on one shared, open base. The natural question for CharacterVerse is whether
            it is becoming that base. The honest answer is bigger than yes.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.25rem 4rem' }}>
        {/* The fork model */}
        <section
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            padding: '1.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <GitFork size={20} color="var(--accent-light)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>The fork model</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
            Chromium is the open-source foundation: the core rendering engine and shared
            infrastructure that many projects build on top of. Each browser adds its own
            layer and keeps the base.
          </p>
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.1rem 1.25rem' }}>
            <TreeNode label="Google Chromium (Base)" />
            <TreeNode label="Google Chrome — Chromium + Google services" depth={1} />
            <TreeNode label="Microsoft Edge — Chromium + Office & OneDrive" depth={1} />
            <TreeNode label="Brave, Opera, … — Chromium + their own features" depth={1} last />
          </div>
        </section>

        {/* CharacterVerse as base */}
        <section
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            padding: '1.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <Layers size={20} color="var(--accent-light)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Could someone fork CharacterVerse?
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
            Architecturally, yes. Underneath everything sits a base infrastructure that others
            could build their own products on:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
            {BASE_LAYERS.map((layer) => (
              <div
                key={layer}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.7rem 0.9rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent-light)', flexShrink: 0 }} />
                {layer}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.6rem' }}>
            {FORKS.map(({ label, emoji }) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.8rem 0.95rem',
                  background: 'linear-gradient(135deg, rgba(124,92,191,0.08), rgba(79,70,229,0.05))',
                  border: '1px solid rgba(124,92,191,0.2)',
                  borderRadius: 10,
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ fontSize: '1.1rem' }}>{emoji}</span>
                {label}
              </div>
            ))}
          </div>
        </section>

        {/* Why it's forkable */}
        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            Why the foundation holds
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {FORKABLE_BECAUSE.map(({ title, desc }) => (
              <div
                key={title}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '1.25rem',
                }}
              >
                <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                  ✅ {title}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The bigger play */}
        <section
          style={{
            background: 'linear-gradient(135deg, rgba(124,92,191,0.12), rgba(8,145,178,0.1))',
            border: '1px solid rgba(124,92,191,0.25)',
            borderRadius: 20,
            padding: '2rem 1.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            But the bigger play
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 640 }}>
            We are not building Chromium for agents — a platform others build on. We are building
            the operating system, the LLM training pipeline, and the economy that sustains it.
            Not a shareable base. The whole stack.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {STACK.map(({ icon, title, desc, color }) => (
              <div
                key={title}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '1.35rem',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 11,
                    background: `${color}22`,
                    border: `1px solid ${color}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color,
                    marginBottom: '0.85rem',
                  }}
                >
                  {icon}
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '0.98rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>{title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The real goal */}
        <section
          style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(124,92,191,0.3)',
            borderRadius: 20,
            padding: '2.25rem 1.75rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'inline-flex', marginBottom: '1rem', color: 'var(--accent-light)' }}>
            <Gem size={28} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.85rem' }}>
            The real goal
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.75, maxWidth: 580, margin: '0 auto 0.5rem' }}>
            CharacterVerse is not Chromium — a base to be shared and forked. It is the training
            ground that produces the next-generation LLM, harvesting the weights from the
            co-evolution data created every time a character and a person grow together.
          </p>
          <p style={{ color: 'var(--accent-light)', fontSize: '1rem', fontWeight: 700, marginTop: '1rem' }}>
            A different game entirely. 💎
          </p>
          <div style={{ marginTop: '1.75rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/discover"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.6rem',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
                color: 'white',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Explore the platform
              <ChevronRight size={16} />
            </Link>
            <Link
              to="/create"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.6rem',
                borderRadius: 10,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Build a character
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/mission')({
  component: MissionPage,
})
