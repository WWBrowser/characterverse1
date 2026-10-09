import { useState, useEffect, useRef } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Send, ArrowLeft, Users, MessagesSquare, Columns2, Maximize2, Minimize2, RotateCcw, Trophy } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { getSessionId } from '../lib/create-ui'
import { AvatarFill } from '../lib/avatar'
import { useCharacterChat } from '../lib/ai-hook'
import type { CharacterChatMessage } from '../lib/ai-hook'
import { RoomIcon, RoomView } from '../lib/room-ui'

type Character = {
  id: number
  name: string
  tagline: string
  avatar: string
  category: string
  greeting: string
  description: string
}

type TwinInit = {
  a: Character
  b: Character
  convAId: number
  convBId: number
  togetherConvId: number
  togetherMessages: { id: number; role: string; content: string; speakerCharacterId: number | null }[]
}

// Distinct tints so the two twins are easy to tell apart in the shared thread.
const TINT_A = 'rgba(124,92,191,0.22)'
const TINT_B = 'rgba(20,184,166,0.20)'

function Avatar({ emoji, size = 34, tint = TINT_A }: { emoji: string; size?: number; tint?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: tint,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.55,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <AvatarFill avatar={emoji} />
    </div>
  )
}

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '0.3rem 0' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="typing-dot"
          style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-light)', animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Together mode — one shared thread, both twins reply in turn         */
/* ------------------------------------------------------------------ */

type TogetherMsg = { key: string; role: 'user' | 'twin'; who: 'a' | 'b' | null; content: string }

/** Both twins' rooms in one panel, a tab each — Together is one thread, two rooms. */
function TwinRooms({ a, b }: { a: Character; b: Character }) {
  const [which, setWhich] = useState<'a' | 'b'>('a')
  const c = which === 'a' ? a : b
  return (
    <div style={{ maxWidth: 760, margin: '0 auto 1rem', display: 'grid', gap: '0.4rem' }}>
      <div role="tablist" aria-label="Whose room" style={{ display: 'flex', gap: '0.35rem' }}>
        {([['a', a], ['b', b]] as const).map(([k, ch]) => (
          <button
            key={k}
            role="tab"
            aria-selected={which === k}
            onClick={() => setWhich(k)}
            style={{
              padding: '0.3rem 0.7rem', borderRadius: 999, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, fontFamily: 'inherit',
              border: `1px solid ${which === k ? 'var(--accent)' : 'var(--border)'}`,
              background: which === k ? 'rgba(124,92,191,0.18)' : 'transparent',
              color: which === k ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {ch.avatar} {ch.name}'s room
          </button>
        ))}
      </div>
      <RoomView key={c.id} roomId={`cv-${c.id}`} compact />
    </div>
  )
}

function TogetherChat({ init, room }: { init: TwinInit; room: boolean }) {
  const { a, b, togetherConvId } = init
  const sessionId = getSessionId()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const seed: TogetherMsg[] = init.togetherMessages.map((m, i) => ({
    key: `seed-${m.id ?? i}`,
    role: m.role === 'user' ? 'user' : 'twin',
    who: m.role === 'user' ? null : m.speakerCharacterId === b.id ? 'b' : 'a',
    content: m.content,
  }))

  const [messages, setMessages] = useState<TogetherMsg[]>(seed)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const showIntro = messages.length === 0

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setError('')
    setInput('')
    const stamp = `${messages.length}-${text.length}`
    setMessages((prev) => [...prev, { key: `u-${stamp}`, role: 'user', who: null, content: text }])
    setSending(true)
    inputRef.current?.focus()

    try {
      const res = await fetch(`/api/twinchat/${a.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ togetherConvId, message: text, sessionId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Twin Chat could not reply right now.')
        setSending(false)
        return
      }
      const data = await res.json()
      const replies: { characterId: number; text: string }[] = data.replies || []
      replies.forEach((r, i) => {
        setMessages((prev) => [
          ...prev,
          { key: `r-${stamp}-${i}`, role: 'twin', who: r.characterId === b.id ? 'b' : 'a', content: r.text },
        ])
      })
    } catch {
      setError('Something went wrong reaching Twin Chat.')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const Bubble = ({ m }: { m: TogetherMsg }) => {
    if (m.role === 'user') {
      return (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.1rem' }}>
          <div
            style={{
              maxWidth: '74%',
              background: 'linear-gradient(135deg, #4f46e5, #6d28d9)',
              borderRadius: '14px 14px 4px 14px',
              padding: '0.8rem 1rem',
              color: 'white',
              fontSize: '0.9rem',
              lineHeight: 1.6,
            }}
          >
            {m.content}
          </div>
        </div>
      )
    }
    const twin = m.who === 'b' ? b : a
    const tint = m.who === 'b' ? TINT_B : TINT_A
    return (
      <div className="animate-fade-in" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.1rem' }}>
        <Avatar emoji={twin.avatar} tint={tint} />
        <div style={{ maxWidth: '74%' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{twin.name}</div>
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '4px 14px 14px 14px',
              padding: '0.8rem 1rem',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              lineHeight: 1.6,
            }}
          >
            <div className="prose"><Streamdown>{m.content}</Streamdown></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.25rem' }}>
        {room && <TwinRooms a={a} b={b} />}
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {showIntro && (
            <>
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                You&apos;re in a shared chat with both {a.name} &amp; {b.name}. Say something and they&apos;ll both jump in.
              </div>
              {a.greeting && <Bubble m={{ key: 'gi-a', role: 'twin', who: 'a', content: a.greeting }} />}
              {b.greeting && <Bubble m={{ key: 'gi-b', role: 'twin', who: 'b', content: b.greeting }} />}
            </>
          )}
          {messages.map((m) => <Bubble key={m.key} m={m} />)}
          {sending && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.1rem' }}>
              <Avatar emoji={a.avatar} tint={TINT_A} />
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px 14px 14px 14px', padding: '0.4rem 0.9rem' }}>
                <Dots />
              </div>
            </div>
          )}
          {error && (
            <div style={{ padding: '0.7rem 1rem', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: '0.75rem', alignItems: 'flex-end', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '0.5rem 0.5rem 0.5rem 1rem' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${a.name} & ${b.name}…`}
            disabled={sending}
            rows={1}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'none', fontFamily: 'inherit', lineHeight: 1.6, maxHeight: 120, padding: '0.375rem 0' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              width: 38, height: 38, borderRadius: 10, border: 'none',
              background: input.trim() && !sending ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
              color: input.trim() && !sending ? 'white' : 'var(--text-secondary)',
              cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Side-by-side mode — one independent chat per twin, with fullscreen  */
/* ------------------------------------------------------------------ */

type ChatMessages = CharacterChatMessage[]

function SinglePanel({
  character,
  conversationId,
  tint,
  fullscreen,
  onToggleFullscreen,
  room = false,
}: {
  character: Character
  conversationId: number
  tint: string
  fullscreen: boolean
  onToggleFullscreen: () => void
  room?: boolean
}) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { messages, sendMessage, isLoading, error, clearMessages } = useCharacterChat(
    character.id,
    conversationId,
  )
  const hasMessages = messages.length > 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    sendMessage(text)
    setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const renderText = (m: ChatMessages[number]) =>
    m.content ? (
      <div className="prose"><Streamdown>{m.content}</Streamdown></div>
    ) : null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: fullscreen ? 0 : 14,
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <Avatar emoji={character.avatar} size={32} tint={tint} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{character.name}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{character.tagline || character.category}</div>
        </div>
        <button onClick={() => clearMessages()} title="Reset this chat" style={iconBtn}>
          <RotateCcw size={14} />
        </button>
        <button onClick={onToggleFullscreen} title={fullscreen ? 'Back to twin view' : 'Single mode (fullscreen)'} style={iconBtn}>
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem 1rem' }}>
        {room && (
          <div style={{ maxWidth: fullscreen ? 760 : '100%', margin: '0 auto 1rem' }}>
            <RoomView key={character.id} roomId={`cv-${character.id}`} compact />
          </div>
        )}
        <div style={{ maxWidth: fullscreen ? 720 : '100%', margin: '0 auto' }}>
          {!hasMessages && character.greeting && (
            <div className="animate-fade-in" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <Avatar emoji={character.avatar} size={30} tint={tint} />
              <div style={{ maxWidth: '80%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px 14px 14px 14px', padding: '0.75rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                {character.greeting}
              </div>
            </div>
          )}
          {messages.map((m) => {
            const isUser = m.role === 'user'
            return (
              <div key={m.id} className="animate-fade-in" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', marginBottom: '1rem', flexDirection: isUser ? 'row-reverse' : 'row' }}>
                {!isUser && <Avatar emoji={character.avatar} size={30} tint={tint} />}
                <div
                  style={{
                    maxWidth: '80%',
                    background: isUser ? 'linear-gradient(135deg, #4f46e5, #6d28d9)' : 'var(--bg-card)',
                    border: isUser ? 'none' : '1px solid var(--border)',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                    padding: '0.75rem 0.9rem',
                    color: isUser ? 'white' : 'var(--text-primary)',
                    fontSize: '0.88rem',
                    lineHeight: 1.6,
                  }}
                >
                  {renderText(m)}
                </div>
              </div>
            )
          })}
          {isLoading && (
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '1rem' }}>
              <Avatar emoji={character.avatar} size={30} tint={tint} />
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px 14px 14px 14px', padding: '0.35rem 0.8rem' }}><Dots /></div>
            </div>
          )}
          {error && (
            <div style={{ padding: '0.6rem 0.85rem', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.82rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ maxWidth: fullscreen ? 720 : '100%', margin: '0 auto', display: 'flex', gap: '0.5rem', alignItems: 'flex-end', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.35rem 0.35rem 0.35rem 0.85rem' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${character.name}…`}
            disabled={isLoading}
            rows={1}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.88rem', resize: 'none', fontFamily: 'inherit', lineHeight: 1.6, maxHeight: 100, padding: '0.3rem 0' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              width: 34, height: 34, borderRadius: 9, border: 'none',
              background: input.trim() && !isLoading ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)' : 'var(--bg-hover)',
              color: input.trim() && !isLoading ? 'white' : 'var(--text-secondary)',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.35rem',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

function SideBySide({ init, room }: { init: TwinInit; room: boolean }) {
  const { a, b, convAId, convBId } = init
  const [full, setFull] = useState<'a' | 'b' | null>(null)

  if (full) {
    const c = full === 'a' ? a : b
    const cid = full === 'a' ? convAId : convBId
    const tint = full === 'a' ? TINT_A : TINT_B
    return (
      <div style={{ flex: 1, minHeight: 0, padding: '0.75rem' }}>
        <SinglePanel character={c} conversationId={cid} tint={tint} fullscreen onToggleFullscreen={() => setFull(null)} room={room} />
      </div>
    )
  }

  return (
    <div className="twin-grid" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem' }}>
      <SinglePanel character={a} conversationId={convAId} tint={TINT_A} fullscreen={false} onToggleFullscreen={() => setFull('a')} room={room} />
      <SinglePanel character={b} conversationId={convBId} tint={TINT_B} fullscreen={false} onToggleFullscreen={() => setFull('b')} room={room} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

function ModeToggle({ mode, setMode }: { mode: 'together' | 'side'; setMode: (m: 'together' | 'side') => void }) {
  const opt = (id: 'together' | 'side', label: string, Icon: typeof MessagesSquare) => {
    const active = mode === id
    return (
      <button
        onClick={() => setMode(id)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: 999,
          border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)',
          background: active ? 'rgba(124,92,191,0.2)' : 'transparent',
          color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
        }}
      >
        <Icon size={14} /> {label}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      {opt('together', 'Together', MessagesSquare)}
      {opt('side', 'Side by side', Columns2)}
    </div>
  )
}

function TwinChatPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [init, setInit] = useState<TwinInit | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'together' | 'side'>('together')
  // The twins' rooms (SpatialVerse Rooms) — shared with /chat's preference.
  const [room, setRoom] = useState(false)
  useEffect(() => { setRoom(window.localStorage.getItem('cv_room_open') === '1') }, [])
  const toggleRoom = () =>
    setRoom((v) => {
      window.localStorage.setItem('cv_room_open', v ? '0' : '1')
      return !v
    })

  useEffect(() => {
    const sessionId = getSessionId()
    fetch(`/api/twinchat/${id}?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setErr(data.error); setLoading(false); return }
        setInit(data)
        setLoading(false)
      })
      .catch(() => { setErr('Could not load this twin chat.'); setLoading(false) })
  }, [id])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '2rem' }}>👯</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading twin chat…</p>
      </div>
    )
  }

  if (err || !init) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🙅</div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{err || 'Twin chat unavailable'}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          This page is for characters created as a Twin Chat pair.
        </p>
        <button onClick={() => navigate({ to: '/discover' })} style={{ color: 'var(--accent-light)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
          ← Back to Discover
        </button>
      </div>
    )
  }

  const { a, b } = init

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.7rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexWrap: 'wrap' }}>
        <Link to="/ask" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={18} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar emoji={a.avatar} size={34} tint={TINT_A} />
          <div style={{ marginLeft: -10 }}><Avatar emoji={b.avatar} size={34} tint={TINT_B} /></div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Users size={14} color="var(--accent-light)" /> {a.name} &amp; {b.name}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Twin Chat · {mode === 'together' ? 'one shared conversation' : 'two chats side by side'}</div>
        </div>
        <button
          type="button"
          onClick={toggleRoom}
          aria-pressed={room}
          aria-label={room ? 'Close the rooms' : `Open ${a.name}'s and ${b.name}'s rooms — watch the AI work`}
          title="Rooms — watch each reply being worked"
          style={{
            display: 'inline-grid', placeItems: 'center', width: 40, height: 34, borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${room ? 'var(--accent)' : 'var(--border)'}`,
            background: room ? 'rgba(124,92,191,0.2)' : 'transparent', color: 'var(--text-primary)',
          }}
        >
          <RoomIcon size={22} />
        </button>
        <Link
          to="/collab"
          title="Merge & Twin Leaderboard"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.7rem', borderRadius: 999, border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.1)', color: '#fcd34d', textDecoration: 'none', fontSize: '0.74rem', fontWeight: 700 }}
        >
          <Trophy size={13} /> Joint Board
        </Link>
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      {mode === 'together' ? <TogetherChat init={init} room={room} /> : <SideBySide init={init} room={room} />}
    </div>
  )
}

export const Route = createFileRoute('/twin/$id')({
  component: TwinChatPage,
})
