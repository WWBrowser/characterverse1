import { useState, useEffect, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Search, MessageCircle, Star, Sparkles, TrendingUp, Zap } from 'lucide-react'
import { AvatarFill } from '../lib/avatar'
import {
  AdvancedViewToggle,
  CodexBanner,
  CodexOverlay,
  DossierCard,
  useDossiers,
} from '../lib/character-codex'

const CATEGORIES = ['All', 'Roleplay', 'Learn', 'Gaming', 'Coaching', 'General']

type Character = {
  id: number
  name: string
  tagline: string
  avatar: string
  category: string
  totalChats: number
  description: string
}

function CharacterCard({ character }: { character: Character }) {
  return (
    <Link
      to="/characters/$id"
      params={{ id: String(character.id) }}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.25rem',
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          height: '100%',
        }}
        className="character-card"
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--accent)'
          el.style.transform = 'translateY(-2px)'
          el.style.boxShadow = '0 8px 24px rgba(124,92,191,0.15)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--border)'
          el.style.transform = 'translateY(0)'
          el.style.boxShadow = 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(124,92,191,0.2), rgba(79,70,229,0.2))',
              border: '1px solid rgba(124,92,191,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            <AvatarFill avatar={character.avatar} alt={character.name} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '0.25rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {character.name}
            </h3>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {character.tagline || character.description}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 500,
              padding: '0.2rem 0.6rem',
              borderRadius: 999,
              background: 'rgba(124,92,191,0.15)',
              color: 'var(--accent-light)',
              border: '1px solid rgba(124,92,191,0.25)',
            }}
          >
            {character.category}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <MessageCircle size={12} />
            {character.totalChats.toLocaleString()}
          </span>
        </div>
      </div>
    </Link>
  )
}

function HeroSection() {
  return (
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
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,92,191,0.15), transparent)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.375rem 1rem',
            borderRadius: 999,
            background: 'rgba(124,92,191,0.15)',
            border: '1px solid rgba(124,92,191,0.3)',
            color: 'var(--accent-light)',
            fontSize: '0.8rem',
            fontWeight: 500,
            marginBottom: '1.5rem',
          }}
        >
          <Sparkles size={13} />
          Powered by AI · Millions of characters
        </div>
        <h1
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: '1.25rem',
            color: 'var(--text-primary)',
          }}
        >
          Build, Play &amp; Learn with<br />
          <span className="gradient-text">AI Characters</span>
        </h1>
        <p
          style={{
            fontSize: 'clamp(1rem, 2vw, 1.2rem)',
            color: 'var(--text-secondary)',
            maxWidth: 560,
            margin: '0 auto 2rem',
            lineHeight: 1.7,
          }}
        >
          Supercharge your imagination. Connect with AI-powered characters for stories,
          learning, roleplay, and endless exploration.
        </p>
        <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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
              fontSize: '0.95rem',
            }}
          >
            <Sparkles size={16} />
            Create Character
          </Link>
          <a
            href="#discover"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.75rem',
              borderRadius: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}
          >
            <TrendingUp size={16} />
            Explore Characters
          </a>
        </div>
      </div>
    </div>
  )
}

function DiscoverPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  // The advanced view: cards become Agentic Character Dossiers. Off by default so
  // the plain grid stays plain — and so the batch dossier read never fires for
  // visitors who are only browsing.
  const [advanced, setAdvanced] = useState(false)
  const [codexId, setCodexId] = useState<number | null>(null)

  const ids = useMemo(() => characters.map((c) => c.id), [characters])
  const { dossiers } = useDossiers(ids, advanced)

  useEffect(() => {
    // Seed on first load
    fetch('/api/seed', { method: 'POST' }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (category !== 'All') params.set('category', category)
    if (search) params.set('search', search)

    fetch(`/api/characters?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setCharacters(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [category, search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setCategory('All')
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)' }}>
      <HeroSection />

      <div id="discover" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.25rem 4rem' }}>
        {/* Stats bar */}
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            padding: '1rem 1.5rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            marginBottom: '2rem',
            flexWrap: 'wrap',
          }}
        >
          {[
            { icon: <Star size={14} />, label: 'Featured Characters', value: '8+' },
            { icon: <MessageCircle size={14} />, label: 'Conversations', value: '∞' },
            { icon: <Zap size={14} />, label: 'Categories', value: CATEGORIES.length - 1 },
          ].map(({ icon, label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--accent-light)' }}>{icon}</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '0.625rem 1rem',
              gap: '0.75rem',
              maxWidth: 480,
            }}
          >
            <Search size={17} color="var(--text-secondary)" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search characters..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch('') }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            )}
          </div>
        </form>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setSearch(''); setSearchInput('') }}
              style={{
                padding: '0.375rem 1rem',
                borderRadius: 999,
                border: '1px solid',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
                borderColor: category === cat ? 'var(--accent)' : 'var(--border)',
                background: category === cat ? 'var(--accent)' : 'var(--bg-card)',
                color: category === cat ? 'white' : 'var(--text-secondary)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Character Codex. The switch is the second of the Codex's two documented
            access points: Advanced turns every card into a dossier, and each
            dossier's ADVANCED VIEW opens that character's Codex entry. */}
        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '2rem' }}>
          <AdvancedViewToggle
            advanced={advanced}
            onChange={setAdvanced}
            hint={
              advanced
                ? 'Cards show live training level, personality metrics and skill badges.'
                : 'Switch to Advanced for the Character Codex dossier on every card.'
            }
          />
          {advanced && <CodexBanner where="discover" />}
        </div>

        {/* Character grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: '1.25rem',
                  height: 140,
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        ) : characters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No characters found</p>
            <Link to="/create" style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>
              Create the first one →
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${advanced ? 288 : 260}px, 1fr))`,
              gap: '1rem',
            }}
          >
            {characters.map((char) => (
              <div key={char.id} className="animate-fade-in">
                {advanced ? (
                  <DossierCard
                    character={char}
                    dossier={dossiers[char.id]}
                    onOpen={setCodexId}
                    footer={
                      <Link
                        to="/characters/$id"
                        params={{ id: String(char.id) }}
                        style={{
                          display: 'block',
                          textAlign: 'center',
                          padding: '0.5rem',
                          borderRadius: 8,
                          background: 'var(--accent)',
                          color: '#fff',
                          textDecoration: 'none',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Open profile
                      </Link>
                    }
                  />
                ) : (
                  <CharacterCard character={char} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <CodexOverlay characterId={codexId} onClose={() => setCodexId(null)} />
    </div>
  )
}

export const Route = createFileRoute('/discover')({
  component: DiscoverPage,
})
