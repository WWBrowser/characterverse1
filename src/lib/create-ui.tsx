import { useRef, useState } from 'react'
import { Wand2, Type, Image as ImageIcon, Layers, Tag, Upload, ChevronDown, ChevronUp, Info, Loader2, MessageSquare } from 'lucide-react'

export const CATEGORIES = ['General', 'Roleplay', 'Learn', 'Gaming', 'Coaching']

export const KIND_OPTIONS = [
  { id: 'original', label: 'Original Character', emoji: '✨', hint: 'Invented from scratch' },
  { id: 'ip', label: 'IP / Canon', emoji: '🎬', hint: 'Inspired by existing canon' },
  { id: 'helper', label: 'Digital Helper', emoji: '🤖', hint: 'A practical assistant' },
] as const

export const PROMPTCLAW_CATEGORIES = [
  'Education', 'Gaming', 'Storytelling', 'Creative', 'Comedy', 'Philosophy',
  'History', 'Science', 'Fantasy', 'Anime', 'Helper', 'Roleplay',
]

export const ARCHETYPES = [
  'Study Buddy', 'Productivity Coach', 'Creative Muse', 'Wellness Guide', 'Tech Wizard',
  'Writing Partner', 'Language Teacher', 'Finance Advisor',
]

export type GeneratedCharacter = {
  name: string
  tagline: string
  category: string
  description: string
  persona: string
  greeting: string
  avatar: string
  // Present only for Twin generation — the second character of the matched pair.
  partner?: {
    name: string
    description: string
    persona: string
    avatar: string
  }
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '0.75rem 1rem',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'border-color 0.15s',
}

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 100,
  fontFamily: 'inherit',
  lineHeight: 1.6,
}

export function getSessionId() {
  if (typeof window === 'undefined') return 'ssr'
  let id = localStorage.getItem('cv_session')
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('cv_session', id)
  }
  return id
}

export function FormField({
  label,
  hint,
  required,
  accent,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  accent?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: accent || 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}
      >
        {label}
        {required && <span style={{ color: '#f87171' }}>*</span>}
        {hint && (
          <span title={hint} style={{ cursor: 'help', color: 'var(--text-secondary)', display: 'inline-flex' }}>
            <Info size={12} />
          </span>
        )}
      </label>
      {children}
    </div>
  )
}

export function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '1.5rem',
        marginBottom: '1.25rem',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

const SUBMODES = [
  { id: 'text', label: 'From Text', icon: Type },
  { id: 'photo', label: 'From Photo', icon: ImageIcon },
  { id: 'text+photo', label: 'Text + Photo', icon: Layers },
  { id: 'category', label: 'From Category', icon: Tag },
] as const

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.3rem 0.75rem',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 500,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'rgba(124,92,191,0.2)' : 'var(--bg-hover)',
        color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

/**
 * PromptClaw — collapsible AI generation panel. Calls /api/promptclaw and hands
 * the generated character fields back via onGenerate.
 */
export function PromptClawPanel({
  kind,
  modeLabel,
  modeColor = 'var(--accent-light)',
  pair = false,
  onGenerate,
}: {
  kind: string
  modeLabel: string
  modeColor?: string
  pair?: boolean
  onGenerate: (c: GeneratedCharacter) => void
}) {
  const [open, setOpen] = useState(true)
  const [subMode, setSubMode] = useState<string>('text')
  const [text, setText] = useState('')
  const [category, setCategory] = useState<string>('')
  const [archetype, setArchetype] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const placeholders: Record<string, string> = {
    text: 'e.g. A chaotic goblin inventor from a steampunk city who invents things that almost work...',
    'text+photo': 'e.g. A warm productivity coach who specializes in ADHD-friendly task management and celebrates small wins...',
  }

  const generate = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/promptclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: subMode, kind, prompt: text, category, archetype, pair }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      onGenerate(data as GeneratedCharacter)
    } catch (err: any) {
      setError(err.message || 'PromptClaw could not generate right now. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, rgba(124,92,191,0.12), rgba(79,70,229,0.06))',
        border: '1px solid rgba(124,92,191,0.35)',
        borderRadius: 16,
        marginBottom: '1.25rem',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem 1.25rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Wand2 size={16} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>PromptClaw</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {pair
              ? 'AI-generate BOTH twin characters at once — text, photo, or category'
              : 'AI-generate your character fields — text, photo, or category'}
          </div>
        </div>
        {open ? <ChevronUp size={16} color="var(--text-secondary)" /> : <ChevronDown size={16} color="var(--text-secondary)" />}
      </button>

      {open && (
        <div style={{ padding: '0 1.25rem 1.25rem' }}>
          {/* Sub-mode tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
            {SUBMODES.map(({ id, label, icon: Icon }) => {
              const active = subMode === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSubMode(id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.6rem 0.4rem',
                    borderRadius: 10,
                    border: '1px solid',
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'rgba(124,92,191,0.22)' : 'var(--bg-hover)',
                    color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={15} />
                  {label}
                </button>
              )
            })}
          </div>

          {/* Mode-specific body */}
          {(subMode === 'text' || subMode === 'text+photo') && (
            <>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                {subMode === 'text' ? 'Describe your character in words' : 'Combine a description with a reference image'}
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholders[subMode]}
                style={{ ...textareaStyle, minHeight: 80, marginBottom: subMode === 'text+photo' ? '0.75rem' : '1rem' }}
              />
            </>
          )}

          {(subMode === 'photo' || subMode === 'text+photo') && (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '1px dashed var(--border)',
                borderRadius: 12,
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '1rem',
                background: 'var(--bg-hover)',
              }}
            >
              <Upload size={18} color="var(--text-secondary)" style={{ marginBottom: '0.4rem' }} />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {fileName || 'Upload reference image (character art, photo, sketch...)'}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
              />
            </div>
          )}

          {subMode === 'category' && (
            <>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Pick a category and let PromptClaw generate everything
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                {PROMPTCLAW_CATEGORIES.map((c) => (
                  <Chip key={c} label={c} active={category === c} onClick={() => setCategory((p) => (p === c ? '' : c))} />
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Quick archetype (optional):
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                {ARCHETYPES.map((a) => (
                  <Chip key={a} label={a} active={archetype === a} onClick={() => setArchetype((p) => (p === a ? '' : a))} />
                ))}
              </div>
            </>
          )}

          {/* Mode badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Mode:</span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '0.15rem 0.6rem',
                borderRadius: 999,
                border: '1px solid var(--border)',
                color: modeColor,
                background: 'var(--bg-hover)',
              }}
            >
              {modeLabel}
            </span>
          </div>

          {error && (
            <div
              style={{
                fontSize: '0.78rem',
                color: '#fca5a5',
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 8,
                padding: '0.5rem 0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
              color: 'white',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
            {loading ? 'Generating…' : pair ? 'Generate Twin Pair with PromptClaw' : 'Generate with PromptClaw'}
          </button>
        </div>
      )}
    </div>
  )
}

const CATEGORY_ACCENT: Record<string, string> = {
  Roleplay: '#a855f7',
  Learn: '#22c55e',
  Gaming: '#f97316',
  Coaching: '#3b82f6',
  General: '#7c5cbf',
}

export type CardCharacter = {
  id?: number
  name: string
  tagline?: string
  avatar: string
  category?: string
  greeting?: string
  description?: string
}

/**
 * The character card produced at the end of the creation flow — a polished
 * trading-card-style preview of the just-created character. Used on the create
 * page success screen.
 */
export function CharacterCard({ character, label }: { character: CardCharacter; label?: string }) {
  const accent = CATEGORY_ACCENT[character.category || 'General'] || '#7c5cbf'
  const isImg = character.avatar.startsWith('http') || character.avatar.startsWith('data:')
  return (
    <div
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'var(--bg-card)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
      }}
    >
      {/* Banner */}
      <div
        style={{
          position: 'relative',
          height: 120,
          background: `linear-gradient(135deg, ${accent}, #4f46e5)`,
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0 1.25rem',
        }}
      >
        {label && (
          <span
            style={{
              position: 'absolute', top: 12, left: 14, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.28)', padding: '0.2rem 0.6rem', borderRadius: 999,
            }}
          >
            {label}
          </span>
        )}
        <div
          style={{
            width: 78, height: 78, borderRadius: 20, transform: 'translateY(38px)', flexShrink: 0, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.6rem',
            background: 'var(--bg-card)', border: '3px solid var(--bg-card)', boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
          }}
        >
          {isImg ? <img src={character.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : character.avatar}
        </div>
      </div>

      <div style={{ padding: '3rem 1.25rem 1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{character.name}</h3>
          {character.category && (
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: accent, background: `${accent}22`, border: `1px solid ${accent}55`, padding: '0.15rem 0.55rem', borderRadius: 999 }}>
              {character.category}
            </span>
          )}
        </div>
        {character.tagline && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.35rem' }}>{character.tagline}</p>}

        {character.greeting && (
          <div
            style={{
              marginTop: '1rem', padding: '0.85rem 1rem', borderRadius: 12,
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
            }}
          >
            <MessageSquare size={15} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6, fontStyle: 'italic' }}>“{character.greeting}”</p>
          </div>
        )}
      </div>
    </div>
  )
}
