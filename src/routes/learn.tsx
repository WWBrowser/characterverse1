import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpen, Brain, MessageCircle, Lightbulb, Globe, FlaskConical, ChevronRight } from 'lucide-react'

const LEARN_FEATURES = [
  {
    icon: <Brain size={24} />,
    title: 'Learn by Conversation',
    description: 'Talk with AI experts in science, history, philosophy, languages, and more. No lectures — just natural, engaging dialogue.',
    color: '#7c5cbf',
  },
  {
    icon: <Globe size={24} />,
    title: 'Language Practice',
    description: 'Practice any language with patient AI tutors who correct gently, explain grammar naturally, and make learning feel like chatting with a friend.',
    color: '#4f46e5',
  },
  {
    icon: <FlaskConical size={24} />,
    title: 'Science & Discovery',
    description: 'Explore quantum physics, astronomy, biology, and chemistry with enthusiastic AI professors who use real analogies to make concepts click.',
    color: '#0891b2',
  },
  {
    icon: <Lightbulb size={24} />,
    title: 'Critical Thinking',
    description: 'Sharpen your reasoning with AI philosophers and debate coaches who challenge your assumptions and guide you to sharper conclusions.',
    color: '#059669',
  },
]

const LEARN_CATEGORIES = [
  { emoji: '🌍', label: 'Languages', desc: 'Practice French, Spanish, Japanese & more' },
  { emoji: '⚛️', label: 'Science', desc: 'Physics, Chemistry, Biology, Astronomy' },
  { emoji: '🏛️', label: 'History', desc: 'Explore the past with historical experts' },
  { emoji: '🦉', label: 'Philosophy', desc: 'Ethics, logic, and life\'s big questions' },
  { emoji: '💻', label: 'Technology', desc: 'Coding, AI, and digital literacy' },
  { emoji: '📐', label: 'Mathematics', desc: 'From basics to advanced concepts' },
  { emoji: '🎨', label: 'Arts', desc: 'Art history, music theory, literature' },
  { emoji: '🧠', label: 'Psychology', desc: 'Mind, behavior, and mental wellness' },
]

function LearnPage() {
  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Hero */}
      <div
        style={{
          padding: '4rem 1.25rem 3rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(8,145,178,0.12), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 1rem',
              borderRadius: 999,
              background: 'rgba(8,145,178,0.12)',
              border: '1px solid rgba(8,145,178,0.25)',
              color: '#67e8f9',
              fontSize: '0.8rem',
              fontWeight: 500,
              marginBottom: '1.5rem',
            }}
          >
            <BookOpen size={13} />
            Curiosity-powered learning
          </div>
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 3rem)',
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: '1rem',
              color: 'var(--text-primary)',
            }}
          >
            Learn Anything Through{' '}
            <span style={{ color: '#67e8f9' }}>Conversation</span>
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '1rem',
              lineHeight: 1.7,
              marginBottom: '2rem',
            }}
          >
            The best way to learn is to ask questions freely, without judgment.
            CharacterVerse gives you expert AI teachers ready for any topic, any time.
          </p>
          <Link
            to="/discover"
            search={{ category: 'Learn' } as any}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.75rem',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0891b2, #4f46e5)',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <MessageCircle size={16} />
            Explore Learning Characters
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.25rem 4rem' }}>
        {/* Features */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
          {LEARN_FEATURES.map(({ icon, title, description, color }) => (
            <div
              key={title}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '1.5rem',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `${color}20`,
                  border: `1px solid ${color}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color,
                  marginBottom: '1rem',
                }}
              >
                {icon}
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                {title}
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.65 }}>
                {description}
              </p>
            </div>
          ))}
        </div>

        {/* Subject categories */}
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
            Explore Subjects
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {LEARN_CATEGORIES.map(({ emoji, label, desc }) => (
              <Link
                key={label}
                to="/discover"
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '1.1rem',
                    display: 'flex',
                    gap: '0.875rem',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{emoji}</span>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{label}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: '3rem',
            padding: '2.5rem',
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(124,92,191,0.12), rgba(79,70,229,0.12))',
            border: '1px solid rgba(124,92,191,0.25)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
            Don&apos;t see your subject?
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: 480, margin: '0 auto 1.5rem' }}>
            Create a custom learning character with any expertise, teaching style, and knowledge base you need.
          </p>
          <Link
            to="/create"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.75rem',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Create a Learning Character
          </Link>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/learn')({
  component: LearnPage,
})
