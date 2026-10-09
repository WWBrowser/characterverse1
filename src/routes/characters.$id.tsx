import { useState, useEffect, useRef } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { MessageCircle, ArrowLeft, Share2, Heart, Users, Pencil, Upload, X } from 'lucide-react'
import { AvatarFill } from '../lib/avatar'
import { CATEGORIES, inputStyle, textareaStyle, getSessionId } from '../lib/create-ui'

type Character = {
  id: number
  name: string
  tagline: string
  description: string
  persona: string
  greeting: string
  avatar: string
  category: string
  creatorSession: string
  totalChats: number
  twinId: number | null
  createdAt: string
}

function CharacterProfile() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetch(`/api/characters/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) navigate({ to: '/' })
        else {
          setCharacter(data)
          // The edit control only appears for the character's own creator —
          // matched by the device-local session that created it.
          setCanEdit(!!data.creatorSession && data.creatorSession === getSessionId())
        }
        setLoading(false)
      })
      .catch(() => { setLoading(false); navigate({ to: '/' }) })
  }, [id])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading...</div>
      </div>
    )
  }

  if (!character) return null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      <Link
        to="/discover"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          fontSize: '0.875rem',
          marginBottom: '2rem',
        }}
      >
        <ArrowLeft size={15} />
        Back to Discover
      </Link>

      {/* Character hero */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '2rem',
          marginBottom: '1.5rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 120,
            background: 'linear-gradient(135deg, rgba(124,92,191,0.2), rgba(79,70,229,0.15))',
          }}
        />
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.5rem 0.875rem',
              borderRadius: 10,
              background: 'rgba(124,92,191,0.2)',
              border: '1px solid rgba(124,92,191,0.4)',
              color: 'var(--accent-light)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              zIndex: 2,
            }}
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(124,92,191,0.3), rgba(79,70,229,0.3))',
              border: '2px solid rgba(124,92,191,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.75rem',
              marginBottom: '1rem',
              overflow: 'hidden',
            }}
          >
            <AvatarFill avatar={character.avatar} alt={character.name} />
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '0.375rem',
            }}
          >
            {character.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1rem' }}>
            {character.tagline}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                padding: '0.25rem 0.75rem',
                borderRadius: 999,
                background: 'rgba(124,92,191,0.2)',
                color: 'var(--accent-light)',
                border: '1px solid rgba(124,92,191,0.3)',
              }}
            >
              {character.category}
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <MessageCircle size={13} />
              {character.totalChats.toLocaleString()} chats
            </span>
          </div>
        </div>
      </div>

      {/* Greeting preview */}
      {character.greeting && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Opening Message
          </p>
          <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(124,92,191,0.2), rgba(79,70,229,0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              <AvatarFill avatar={character.avatar} alt={character.name} />
            </div>
            <div
              style={{
                background: 'var(--bg-hover)',
                borderRadius: '4px 12px 12px 12px',
                padding: '0.875rem 1rem',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                flex: 1,
              }}
            >
              {character.greeting}
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {character.description && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            About
          </p>
          <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.7 }}>
            {character.description}
          </p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <Link
          to="/chat/$id"
          params={{ id: String(character.id) }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.875rem',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            color: 'white',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          <MessageCircle size={18} />
          Start Chatting
        </Link>
        <button
          onClick={() => setLiked((prev) => !prev)}
          style={{
            padding: '0.875rem',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: liked ? '#f87171' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Like"
        >
          <Heart size={18} fill={liked ? '#f87171' : 'none'} />
        </button>
        <button
          onClick={() => navigator.clipboard?.writeText(window.location.href)}
          style={{
            padding: '0.875rem',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Share"
        >
          <Share2 size={18} />
        </button>
      </div>

      {/* Twin Chat — only for characters created as a matched pair */}
      {character.twinId && (
        <Link
          to="/twin/$id"
          params={{ id: String(character.id) }}
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.875rem',
            borderRadius: 12,
            background: 'rgba(124,92,191,0.15)',
            border: '1px solid rgba(124,92,191,0.35)',
            color: 'var(--accent-light)',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          <Users size={18} />
          Open Twin Chat — together or side by side
        </Link>
      )}

      {editing && character && (
        <EditModal
          character={character}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setCharacter(updated)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

/* Creator-only edit form. Revises the character in place through the existing
 * PATCH endpoint, which already accepts these fields. */
function EditModal({
  character,
  onClose,
  onSaved,
}: {
  character: Character
  onClose: () => void
  onSaved: (c: Character) => void
}) {
  const [form, setForm] = useState({
    name: character.name,
    tagline: character.tagline,
    category: character.category,
    description: character.description,
    persona: character.persona,
    greeting: character.greeting,
    avatar: character.avatar,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const avatarRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((prev) => ({ ...prev, avatar: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setError('A name is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/characters/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('save failed')
      const updated = await res.json()
      onSaved(updated)
    } catch {
      setError('Could not save. Please try again.')
      setSaving(false)
    }
  }

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '0.375rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '2rem 1rem',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Edit character</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div
            onClick={() => avatarRef.current?.click()}
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              overflow: 'hidden',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <AvatarFill avatar={form.avatar} alt={form.name} />
          </div>
          <div>
            <button
              onClick={() => avatarRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 0.875rem',
                borderRadius: 10,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              <Upload size={15} />
              Upload image
            </button>
            <input
              value={form.avatar.startsWith('data:') || form.avatar.startsWith('http') ? '' : form.avatar}
              onChange={set('avatar')}
              placeholder="or an emoji"
              style={{ ...inputStyle, marginTop: '0.5rem', width: 120 }}
            />
            <input ref={avatarRef} type="file" accept="image/*" hidden onChange={onAvatarFile} />
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Name</label>
          <input value={form.name} onChange={set('name')} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Tagline</label>
          <input value={form.tagline} onChange={set('tagline')} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Category</label>
          <select value={form.category} onChange={set('category')} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Description</label>
          <textarea value={form.description} onChange={set('description')} style={{ ...textareaStyle, minHeight: 70 }} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={label}>Personality & instructions</label>
          <textarea value={form.persona} onChange={set('persona')} style={{ ...textareaStyle, minHeight: 100 }} />
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={label}>Greeting</label>
          <textarea value={form.greeting} onChange={set('greeting')} style={{ ...textareaStyle, minHeight: 70 }} />
        </div>

        {error && <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '0.875rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 1,
              padding: '0.875rem',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
              color: 'white',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.875rem 1.25rem',
              borderRadius: 12,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/characters/$id')({
  component: CharacterProfile,
})