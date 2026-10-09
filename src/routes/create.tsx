import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { ChevronRight, ArrowLeft, Upload, Sparkles, User, GitMerge, Users, MessagesSquare, MessageCircle, RefreshCw, Trophy, Palette, Globe } from 'lucide-react'
import {
  CATEGORIES,
  KIND_OPTIONS,
  inputStyle,
  textareaStyle,
  getSessionId,
  FormField,
  SectionCard,
  PromptClawPanel,
  CharacterCard,
  type GeneratedCharacter,
  type CardCharacter,
} from '../lib/create-ui'
import { EMPTY_FORGE, SatelliteForge, applyForge, forgeCount, type ForgePicks } from '../lib/character-codex'
import { HANDOFF_KEY, type AvatarHandoff } from '../lib/art'
import {
  EMPTY_HOSTED,
  HostedFramePanel,
  hostedFilled,
  publishHosted,
  type HostedDraft,
} from '../lib/hostedframe'
import { FRAMES } from '../lib/searchindex'

type Mode = 'single' | 'merge' | 'twin'

const MODES: { id: Mode; label: string; icon: typeof User; desc: string }[] = [
  { id: 'single', label: 'Single', icon: User, desc: 'One character, one voice — built from scratch.' },
  { id: 'merge', label: 'Merge', icon: GitMerge, desc: 'Fuse two characters into one blended personality.' },
  { id: 'twin', label: 'Twin', icon: MessagesSquare, desc: 'A matched pair you can chat with together.' },
]

const KIND_BADGE_COLOR: Record<string, string> = {
  original: 'var(--accent-light)',
  ip: '#fbbf24',
  helper: '#34d399',
}

type Created = {
  mode: Mode
  cards: { card: CardCharacter; label: string }[]
  chat: { to: '/chat/$id' | '/twin/$id'; id: string }
  profileId: string
  /** Set when the creator also attached an externally hosted chat. */
  hosted?: {
    ok: boolean
    error?: string
    /** The host refused framing and the entry became a hand-off. Its reason. */
    demoted?: string | null
    frame: string
    name: string
    url: string
  }
}

function CreatePage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('single')
  const [kind, setKind] = useState('original')
  const [form, setForm] = useState({
    name: '',
    name2: '',
    tagline: '',
    description: '',
    description2: '',
    persona: '',
    persona2: '',
    greeting: '',
    avatar: '🤖',
    category: 'General',
  })
  const [avatarPreview, setAvatarPreview] = useState('')
  // Set when the avatar arrived from the Art Studio: the seed phrase that painted
  // it, recorded on the character so the piece stays re-paintable from its name.
  const [artNote, setArtNote] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)
  // The externally hosted chat, if this character has one. Empty for the vast
  // majority of characters, which are hosted here and need no frame at all.
  const [hosted, setHosted] = useState<HostedDraft>(EMPTY_HOSTED)

  // A piece handed over from the Art Studio. It travels through sessionStorage as
  // a data URL — computed in the browser, never uploaded — so this path touches
  // no table and no migration. Cleared on pickup so a reload does not re-apply it.
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(HANDOFF_KEY)
      if (raw) sessionStorage.removeItem(HANDOFF_KEY)
    } catch {
      return
    }
    if (!raw) return
    try {
      const handoff = JSON.parse(raw) as AvatarHandoff
      if (!handoff?.dataUrl?.startsWith('data:image/')) return
      setAvatarPreview(handoff.dataUrl)
      setArtNote(handoff.note || '')
    } catch {
      /* a malformed hand-off just means no art — the form is untouched */
    }
  }, [])
  // Satellite Forge: personalities to split off the moment the character exists.
  const [forge, setForge] = useState<ForgePicks>(EMPTY_FORGE)
  const avatarRef = useRef<HTMLInputElement>(null)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const applyGenerated = (c: GeneratedCharacter) => {
    setForm((prev) => ({
      ...prev,
      name: c.name || prev.name,
      tagline: c.tagline || prev.tagline,
      description: c.description || prev.description,
      persona: c.persona || prev.persona,
      greeting: c.greeting || prev.greeting,
      avatar: c.avatar || prev.avatar,
      category: c.category || prev.category,
      // Twin mode: PromptClaw returns a matched partner — fill character 2 too.
      name2: c.partner?.name || prev.name2,
      description2: c.partner?.description || prev.description2,
      persona2: c.partner?.persona || prev.persona2,
    }))
  }

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setAvatarPreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  const createCharacter = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, isPublic, creatorSession: getSessionId() }),
    })
    if (!res.ok) throw new Error('create failed')
    return res.json()
  }

  const resetForm = () => {
    setForm({ name: '', name2: '', tagline: '', description: '', description2: '', persona: '', persona2: '', greeting: '', avatar: '🤖', category: 'General' })
    setAvatarPreview('')
    setCreated(null)
    setForge(EMPTY_FORGE)
    setHosted(EMPTY_HOSTED)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'twin') {
      if (!form.name.trim() || !form.name2.trim() || !form.persona.trim() || !form.persona2.trim()) {
        setError('Both twin names and both personalities are required.')
        return
      }
    } else if (!form.name.trim() || !form.persona.trim()) {
      setError('Name and Personality & Instructions are required.')
      return
    }

    setSaving(true)
    try {
      const avatar = avatarPreview || form.avatar
      // The note is appended at save time rather than typed into the textarea, so
      // it records the seed without overwriting anything the creator wrote.
      const description = [form.description.trim(), artNote].filter(Boolean).join('\n\n')

      let next: Created

      if (mode === 'single') {
        const c = await createCharacter({
          name: form.name, tagline: form.tagline, category: form.category,
          description, persona: form.persona, greeting: form.greeting, avatar,
        })
        await applyForge(c.id, forge, getSessionId())
        next = {
          mode, profileId: String(c.id), chat: { to: '/chat/$id', id: String(c.id) },
          cards: [{ label: 'Single Character', card: c }],
        }
      } else if (mode === 'merge') {
        const c = await createCharacter({
          name: form.name, tagline: form.tagline, category: form.category, description,
          persona: `[Joint Merge — a single blended voice fusing two characters]\n\n${form.persona}`,
          greeting: form.greeting, avatar: avatarPreview || '🜂',
        })
        await applyForge(c.id, forge, getSessionId())
        next = {
          mode, profileId: String(c.id), chat: { to: '/chat/$id', id: String(c.id) },
          cards: [{ label: 'Joint Merge', card: c }],
        }
      } else {
        const a = await createCharacter({
          name: form.name, tagline: form.tagline, category: form.category, description: form.description,
          persona: `[Twin Chat — one half of a matched pair with ${form.name2}]\n\n${form.persona}`,
          greeting: form.greeting, avatar: '👯',
        })
        const b = await createCharacter({
          name: form.name2, tagline: form.tagline, category: form.category, description: form.description2,
          persona: `[Twin Chat — one half of a matched pair with ${form.name}]\n\n${form.persona2}`,
          greeting: form.greeting, avatar: '👯', twinId: a.id,
        })
        await fetch(`/api/characters/${a.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ twinId: b.id }),
        }).catch(() => {})
        await applyForge(a.id, forge, getSessionId())
        next = {
          mode, profileId: String(a.id), chat: { to: '/twin/$id', id: String(a.id) },
          cards: [{ label: 'Twin · One', card: a }, { label: 'Twin · Two', card: b }],
        }
      }

      // The hosted chat goes in after the character exists, because the entry is
      // attached to it. Failing to publish does NOT fail the creation: the
      // character is real and saved by this point, and throwing it away over a
      // rejected index listing would be a poor trade for the person who just
      // wrote a persona. The outcome is reported on the success screen instead.
      if (hostedFilled(hosted)) {
        const published = await publishHosted({
          draft: hosted,
          sessionId: getSessionId(),
          characterId: Number(next.profileId),
        })
        next.hosted = {
          ok: published.ok,
          error: published.error,
          demoted: published.demoted,
          // The frame that was actually recorded, which is not always the frame
          // that was asked for — a demotion means the host had the last word.
          frame: published.demoted ? 'oframe' : hosted.frame,
          name: hosted.name,
          url: hosted.url,
        }
      }

      setCreated(next)
    } catch {
      setError('Something went wrong while creating. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  /* --------------------------------------------------------- Success: cards */
  if (created) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: '0.4rem' }}>🎉</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {created.mode === 'twin' ? 'Your twins are ready' : 'Your character is ready'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.3rem' }}>
            Here&apos;s your character card. Jump straight into a chat.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.75rem' }}>
          {created.cards.map((c) => (
            <CharacterCard key={c.card.id} character={c.card} label={c.label} />
          ))}
        </div>

        {/* What happened to the hosted chat. A demotion is the interesting case
            and gets the most words: the entry published fine, it just published
            as a hand-off, and a creator who asked for an embed deserves the
            host's own reason rather than a silently different result. */}
        {created.hosted && (
          <div
            style={{
              textAlign: 'left',
              padding: '1rem 1.15rem',
              borderRadius: 14,
              marginBottom: '1.5rem',
              border: '1px solid',
              borderColor: created.hosted.ok ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
              background: created.hosted.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
              <Globe size={14} color={created.hosted.ok ? '#34d399' : '#fca5a5'} />
              <strong style={{ fontSize: '0.85rem', color: created.hosted.ok ? '#34d399' : '#fca5a5' }}>
                {created.hosted.ok ? 'Also in CharacterVerse Search' : 'Not added to the index'}
              </strong>
            </div>
            {created.hosted.ok ? (
              <>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.65 }}>
                  <strong>{created.hosted.name}</strong> is indexed as{' '}
                  <strong>({created.hosted.frame === 'inframe' ? 'iframe' : 'oframe'}) {FRAMES[created.hosted.frame === 'inframe' ? 'inframe' : 'oframe'].label}</strong>{' '}
                  — it {FRAMES[created.hosted.frame === 'inframe' ? 'inframe' : 'oframe'].verb} when somebody opens it from a
                  result.
                </p>
                {created.hosted.demoted && (
                  <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#fcd34d', lineHeight: 1.65 }}>
                    You asked for an embedded tab and the host declined: {created.hosted.demoted} So it went in as a
                    hand-off, which needs nothing from the host but the link. Nothing is lost — the index counts a
                    hand-off as demand exactly the same way.
                  </p>
                )}
                <Link
                  to="/search"
                  search={{ q: created.hosted.name }}
                  style={{ display: 'inline-block', marginTop: '0.65rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-light)', textDecoration: 'none' }}
                >
                  Find it in the index →
                </Link>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.65 }}>
                {created.hosted.error} Your character saved fine — only the index listing did not. You can add it
                from{' '}
                <Link to="/search/add" style={{ color: 'var(--accent-light)', fontWeight: 700 }}>
                  the add page
                </Link>{' '}
                whenever you like.
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <button
            onClick={() => navigate({ to: created.chat.to, params: { id: created.chat.id } })}
            style={{ width: '100%', padding: '0.95rem', borderRadius: 12, border: 'none', color: 'white', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <MessageCircle size={18} /> Start chatting
          </button>
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button
              onClick={() => navigate({ to: '/characters/$id', params: { id: created.profileId } })}
              style={{ flex: 1, padding: '0.8rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
            >
              View profile
            </button>
            <button
              onClick={resetForm}
              style={{ flex: 1, padding: '0.8rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={15} /> Create another
            </button>
          </div>
          <button
            onClick={() => navigate({ to: '/caz/agent/$id', params: { id: created.profileId } })}
            style={{ width: '100%', padding: '0.8rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            🛰️ View its Agentz Zone birth certificate
          </button>
        </div>
      </div>
    )
  }

  /* --------------------------------------------------------------- The form */
  const isTwin = mode === 'twin'
  const isCollab = mode !== 'single'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
      <Link
        to="/discover"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.8rem', marginBottom: '1.25rem' }}
      >
        <ArrowLeft size={14} /> Back to discover
      </Link>

      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontWeight: 600,
          padding: '0.2rem 0.7rem', borderRadius: 999, marginBottom: '0.75rem',
          background: 'rgba(124,92,191,0.15)', color: 'var(--accent-light)', border: '1px solid rgba(124,92,191,0.3)',
        }}
      >
        <Sparkles size={12} /> Character Studio
      </span>

      <h1 style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
        Create a Character
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
        Design a single character, merge two into one, or build a twin duo — all in one place.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Mode selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {MODES.map((m) => {
            const active = mode === m.id
            const Icon = m.icon
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                style={{
                  textAlign: 'left', padding: '0.9rem', borderRadius: 14, cursor: 'pointer',
                  border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: active ? 'rgba(124,92,191,0.18)' : 'var(--bg-card)', transition: 'all 0.15s',
                }}
              >
                <Icon size={18} color={active ? 'var(--accent-light)' : 'var(--text-secondary)'} />
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.4rem 0 0.2rem' }}>{m.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{m.desc}</div>
              </button>
            )
          })}
        </div>

        {isCollab && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', padding: '0.65rem 0.9rem', borderRadius: 10, marginBottom: '1.25rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fcd34d' }}>
            <Trophy size={14} /> Joint characters score 2x CC per message — they compete on the{' '}
            <Link to="/collab" style={{ color: '#fcd34d', fontWeight: 700, textDecoration: 'underline' }}>Joint Leaderboard</Link>.
          </div>
        )}

        {/* Kind selector — single only */}
        {mode === 'single' && (
          <>
            <h2 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>What kind of character is this?</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {KIND_OPTIONS.map((opt) => {
                const active = kind === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKind(opt.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
                      padding: '0.9rem 0.5rem', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                      border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)',
                      background: active ? 'rgba(124,92,191,0.18)' : 'var(--bg-card)',
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{opt.emoji}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: active ? 'var(--accent-light)' : 'var(--text-primary)' }}>{opt.label}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{opt.hint}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* PromptClaw */}
        <PromptClawPanel
          kind={kind}
          modeLabel={mode === 'merge' ? 'Joint Merge' : mode === 'twin' ? 'Twin Chat' : KIND_OPTIONS.find((k) => k.id === kind)?.label || 'Original Character'}
          modeColor={KIND_BADGE_COLOR[kind]}
          pair={isTwin}
          onGenerate={applyGenerated}
        />

        {/* Avatar — single & merge */}
        {!isTwin && (
          <SectionCard style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', overflow: 'hidden' }}
            >
              {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Upload size={20} color="var(--text-secondary)" />}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                Avatar
                {artNote && <Palette size={13} color="#ec4899" />}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {artNote || 'Upload an image for your character'}
              </div>
              {artNote && (
                <Link
                  to="/art"
                  style={{ fontSize: '0.72rem', color: '#f9a8d4', textDecoration: 'none', fontWeight: 600 }}
                >
                  Back to the studio →
                </Link>
              )}
            </div>
            <input ref={avatarRef} type="file" accept="image/*" hidden onChange={onAvatarFile} />
          </SectionCard>
        )}

        {/* Core fields */}
        <SectionCard>
          {isTwin ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Character 1 · Name" required>
                <input value={form.name} onChange={set('name')} placeholder="Character 1's name…" style={inputStyle} maxLength={80} />
              </FormField>
              <FormField label="Character 2 · Name" required>
                <input value={form.name2} onChange={set('name2')} placeholder="Character 2's name…" style={inputStyle} maxLength={80} />
              </FormField>
            </div>
          ) : (
            <FormField label="Name" required>
              <input value={form.name} onChange={set('name')} placeholder={mode === 'merge' ? 'The merged character’s name…' : 'e.g. Albert Einstein, Space Explorer…'} style={inputStyle} maxLength={80} />
            </FormField>
          )}

          <FormField label={isTwin ? 'Joint Tagline' : 'Tagline'} required>
            <input value={form.tagline} onChange={set('tagline')} placeholder="A short description that appears on the card" style={inputStyle} maxLength={120} />
          </FormField>

          <FormField label="Category" required>
            <select value={form.category} onChange={set('category')} style={inputStyle}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          {isTwin ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Character 1 · Description" accent="var(--accent-light)">
                <textarea value={form.description} onChange={set('description')} placeholder="Character 1's backstory…" style={textareaStyle} maxLength={1000} />
              </FormField>
              <FormField label="Character 2 · Description" accent="var(--accent-light)">
                <textarea value={form.description2} onChange={set('description2')} placeholder="Character 2's backstory…" style={textareaStyle} maxLength={1000} />
              </FormField>
            </div>
          ) : (
            <FormField label="Description">
              <textarea value={form.description} onChange={set('description')} placeholder="A longer backstory for your character…" style={textareaStyle} maxLength={1000} />
            </FormField>
          )}

          {isTwin ? (
            <>
              <FormField label="Character 1 · Personality & Instructions" required accent="var(--accent-light)">
                <textarea value={form.persona} onChange={set('persona')} placeholder="How does Character 1 speak, behave, and think?" style={{ ...textareaStyle, minHeight: 110 }} maxLength={2000} />
              </FormField>
              <FormField label="Character 2 · Personality & Instructions" required accent="var(--accent-light)">
                <textarea value={form.persona2} onChange={set('persona2')} placeholder="How does Character 2 speak, behave, and think?" style={{ ...textareaStyle, minHeight: 110 }} maxLength={2000} />
              </FormField>
            </>
          ) : (
            <FormField label="Personality & Instructions" required hint="This shapes how the AI responds in conversations.">
              <textarea
                value={form.persona}
                onChange={set('persona')}
                placeholder={mode === 'merge' ? 'Blend both personalities into one voice…' : "How should the character behave? e.g. 'You are a witty medieval knight…'"}
                style={{ ...textareaStyle, minHeight: 130 }}
                maxLength={2000}
              />
            </FormField>
          )}

          <FormField label={isTwin ? 'Joint Greeting Message' : 'Greeting Message'} required>
            <textarea value={form.greeting} onChange={set('greeting')} placeholder="The first message users see when they start a chat…" style={textareaStyle} maxLength={500} />
          </FormField>

          <FormField label="Visibility">
            <select value={isPublic ? 'public' : 'private'} onChange={(e) => setIsPublic(e.target.value === 'public')} style={inputStyle}>
              <option value="public">Public — anyone can chat</option>
              <option value="private">Private — only you</option>
            </select>
          </FormField>
        </SectionCard>

        {/* Satellite Forge — the Character Codex hook into creation. Overriding a
            clone here is what gives one knowledge base several personalities. */}
        <SectionCard>
          <SatelliteForge
            picks={forge}
            onChange={setForge}
            note={
              isTwin
                ? 'Applies to Character 1 — the half you land on. Character 2 can be split from its own Codex entry afterwards.'
                : 'You can split, override, resync or merge nodes at any time from the character’s Codex entry.'
            }
          />
        </SectionCard>

        {/* Hosted elsewhere — the inframe/oframe section. Optional, and last in
            the form on purpose: a character hosted here needs nothing from it,
            and a character hosted somewhere else still needs everything above. */}
        <SectionCard>
          <HostedFramePanel draft={hosted} onChange={setHosted} sessionId={getSessionId()} />
        </SectionCard>

        {error && (
          <div style={{ padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%', padding: '0.9rem', borderRadius: 12, border: 'none', color: 'white', fontSize: '1rem', fontWeight: 700,
            background: saving ? 'var(--bg-hover)' : 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}
        >
          {saving ? (
            hostedFilled(hosted) ? 'Creating & publishing…' : forgeCount(forge) > 0 ? 'Creating & splitting…' : 'Creating…'
          ) : (
            <>
              {isTwin ? <Users size={17} /> : <Sparkles size={17} />}{' '}
              {isTwin ? 'Create Twin Characters' : mode === 'merge' ? 'Create Joint Character' : 'Create Character'}
              {forgeCount(forge) > 0 && ` + ${forgeCount(forge)} satellite${forgeCount(forge) > 1 ? 's' : ''}`}
              {hostedFilled(hosted) && ' + index entry'}{' '}
              <ChevronRight size={17} />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export const Route = createFileRoute('/create')({
  component: CreatePage,
})
