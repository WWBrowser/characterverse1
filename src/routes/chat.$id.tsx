import { useState, useEffect, useRef, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  Menu,
  Bookmark,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  History as HistoryIcon,
  Trash2,
  FastForward,
  Eraser,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import { useCharacterChat } from '../lib/ai-hook'
import { getSessionId } from '../lib/create-ui'
import { ChatMarkEditor } from '../components/ChatMark'
import { markIsActive, type ChatMark } from '../lib/chatmarks'
import { ChatSettingsSheet } from '../components/ChatSettingsSheet'
import { DeskPill, DeskSheet } from '../lib/desk-ui'
import {
  backgroundCss,
  decorationTint,
  characterAccent,
  GO_ON_TOKEN,
  type ChatSettings,
} from '../lib/chat-experience'
import { RoomIcon, RoomView } from '../lib/room-ui'

type Character = {
  id: number
  name: string
  tagline: string
  avatar: string
  category: string
  greeting: string
  description: string
  persona: string
}

type InitMessage = { role: string; content: string }

function speak(text: string, voiceName: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const clean = text.replace(/[*_#`>~|]/g, '').slice(0, 600)
    if (!clean.trim()) return
    const utter = new SpeechSynthesisUtterance(clean)
    if (voiceName) {
      const match = window.speechSynthesis.getVoices().find((v) => v.name.toLowerCase().includes(voiceName.toLowerCase()))
      if (match) utter.voice = match
    }
    window.speechSynthesis.speak(utter)
  } catch {
    /* speech is best-effort */
  }
}

function AvatarBubble({ avatar, size = 32, accent }: { avatar: string; size?: number; accent: string }) {
  const isImg = avatar.startsWith('http') || avatar.startsWith('data:')
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.55,
        background: `linear-gradient(135deg, ${accent}55, ${accent}22)`,
        border: '1px solid rgba(255,255,255,0.14)',
      }}
    >
      {isImg ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatar}
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '0.3rem 0.2rem' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="typing-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-light)', animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------ sub-conscious telemetry */

// This screen is the SUB-CONSCIOUS LAYER — the persona core and its association
// graph. The pill reads the agent's measured state (see src/lib/consciousness.ts):
// CAM is the level of awakening, and the substrate is whichever filter descended
// from the conscious surface the person was last working on (/mode/$mode). Tapping
// it opens the full Metric Coded Consciousness readout.
function CamPill({ characterId, onOpen }: { characterId: number; onOpen: () => void }) {
  const [v, setV] = useState<{ cam: number; limit: number; short: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`/api/consciousness/${characterId}?sessionId=${encodeURIComponent(getSessionId())}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !d || d.error) return
          setV({ cam: d.dynamics.cam, limit: d.model.camLimit, short: d.model.activeSubstrate.short })
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [characterId])

  if (!v) return null
  const color = v.cam >= v.limit ? '#f87171' : v.cam >= 60 ? '#facc15' : '#22d3ee'

  return (
    <button
      onClick={onOpen}
      title={`CAM ${v.cam}/${v.limit} · ${v.short} substrate — open Metric Coded Consciousness`}
      aria-label="Consciousness metrics"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        height: 36,
        padding: '0 0.6rem',
        borderRadius: 999,
        border: `1px solid ${color}55`,
        background: 'rgba(0,0,0,0.28)',
        color,
        cursor: 'pointer',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.72rem',
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      {v.cam}
    </button>
  )
}

function ChatInterface({
  character,
  initialConversationId,
  initialMessages,
  autoSend,
  node,
}: {
  character: Character
  initialConversationId: number
  initialMessages: InitMessage[]
  autoSend?: string
  /** A Codex satellite id, when the room was entered as one of the splits. */
  node?: string
}) {
  const navigate = useNavigate()
  const accent = characterAccent(character.category)
  const [conversationId, setConversationId] = useState(initialConversationId)
  const [input, setInput] = useState('')
  const [introOpen, setIntroOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mark, setMark] = useState<ChatMark | null>(null)
  const [markOpen, setMarkOpen] = useState(false)
  const [settings, setSettings] = useState<ChatSettings | null>(null)
  const [deskOpen, setDeskOpen] = useState(false)
  // The character's room (SpatialVerse Rooms): open it and watch each reply
  // being worked — the door, the archive, the pinboard, the desk, the outbox.
  // Remembered across chats, because someone who likes watching likes watching.
  const [roomOpen, setRoomOpen] = useState(false)
  useEffect(() => { setRoomOpen(window.localStorage.getItem('cv_room_open') === '1') }, [])
  const toggleRoom = () =>
    setRoomOpen((v) => {
      window.localStorage.setItem('cv_room_open', v ? '0' : '1')
      return !v
    })
  // How many turns were on screen when the desk was last cleared, so the
  // transcript can show where the sweep line fell. The messages stay — that is
  // the whole point of filing rather than deleting.
  const [filedThrough, setFiledThrough] = useState(0)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const spokenCount = useRef(0)
  const sentAuto = useRef(false)
  const settingsRef = useRef<ChatSettings | null>(null)
  settingsRef.current = settings

  const { messages, sendMessage, isLoading, error, clearMessages, setHistory } = useCharacterChat(
    character.id,
    conversationId,
    {
      getUserPersona: () => settingsRef.current?.userPersona || '',
      getNode: () => node || '',
    },
  )

  // Hydrate persisted transcript on first load, then auto-send any question
  // handed in from the Ask box.
  useEffect(() => {
    if (initialMessages.length) setHistory(initialMessages)
    if (autoSend && !sentAuto.current) {
      sentAuto.current = true
      sendMessage(autoSend)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load chat settings + any existing ChatMark for this thread.
  useEffect(() => {
    const sessionId = getSessionId()
    fetch(`/api/chat-settings/${character.id}?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setSettings(d) })
      .catch(() => {})
    fetch(`/api/chatmarks/${conversationId}?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => setMark(data?.mark ?? null))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Voice Autoplay — speak each newly arrived character reply aloud.
  useEffect(() => {
    if (!settings?.voiceAutoplay) {
      spokenCount.current = messages.length
      return
    }
    const fresh = messages.slice(spokenCount.current)
    const lastChar = [...fresh].reverse().find((m) => m.role === 'assistant')
    if (lastChar) speak(lastChar.content, settings.customVoice)
    spokenCount.current = messages.length
  }, [messages, settings?.voiceAutoplay, settings?.customVoice])

  const patchSettings = useCallback(
    (patch: Partial<ChatSettings>) => {
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
      fetch(`/api/chat-settings/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), ...patch }),
      }).catch(() => {})
    },
    [character.id],
  )

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

  // Restart — abandon the current thread for a fresh conversation.
  const handleRestart = async () => {
    try {
      const sessionId = getSessionId()
      const res = await fetch(`/api/chat/${character.id}?sessionId=${encodeURIComponent(sessionId)}&new=1`)
      const data = await res.json()
      if (data?.conversationId) {
        clearMessages()
        setConversationId(data.conversationId)
        setIntroOpen(true)
      }
    } catch {
      /* ignore */
    }
  }

  // Delete — remove the conversation and its messages, then leave.
  const handleDelete = async () => {
    try {
      await fetch(`/api/chat/${character.id}?conversationId=${conversationId}`, { method: 'DELETE' })
    } catch {
      /* ignore */
    }
    navigate({ to: '/history' })
  }

  const lastIsCharacter = messages.length > 0 && messages[messages.length - 1].role === 'assistant'
  const showGoOn = settings?.goOnButton && !isLoading && (lastIsCharacter || (messages.length === 0 && character.greeting))

  const headerBtn: React.CSSProperties = {
    background: 'rgba(0,0,0,0.28)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    width: 36,
    height: 36,
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div
      style={{
        position: 'relative',
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Backdrop layers */}
      <div style={{ position: 'absolute', inset: 0, background: backgroundCss(settings?.background || 'default', accent) }} />
      {settings?.decoration && settings.decoration !== 'none' && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: decorationTint(settings.decoration) }} />
      )}
      {/* Giant translucent avatar watermark */}
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '13rem',
          opacity: 0.12,
          pointerEvents: 'none',
          filter: 'blur(1px)',
        }}
      >
        {!character.avatar.startsWith('http') && !character.avatar.startsWith('data:') ? character.avatar : '✦'}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,13,20,0.35) 0%, rgba(13,13,20,0.1) 40%, rgba(13,13,20,0.75) 100%)' }} />

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.8rem 1rem' }}>
        <button onClick={() => navigate({ to: '/discover' })} style={{ ...headerBtn, background: 'rgba(0,0,0,0.2)' }} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <AvatarBubble avatar={character.avatar} size={30} accent={accent} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{character.name}</div>
            {/* Which Codex split is answering. The knowledge is the character's
                either way — only the temperament changed. */}
            {node && (
              <div
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--accent-light)',
                  textTransform: 'uppercase',
                }}
              >
                via {node}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={toggleRoom}
          style={{ ...headerBtn, width: 'auto', padding: '0 0.55rem', background: roomOpen ? `${accent}33` : headerBtn.background, borderColor: roomOpen ? accent : undefined }}
          aria-label={roomOpen ? `Close ${character.name}'s room` : `Open ${character.name}'s room — watch the AI work`}
          aria-pressed={roomOpen}
          title={`${character.name}'s Room — watch each reply being worked`}
        >
          <RoomIcon size={20} />
        </button>

        <CamPill
          characterId={character.id}
          onOpen={() => navigate({ to: '/consciousness/$id', params: { id: String(character.id) } })}
        />

        {conversationId > 0 && (
          <DeskPill
            conversationId={conversationId}
            refreshKey={messages.length + filedThrough}
            onOpen={() => setDeskOpen(true)}
          />
        )}

        <div style={{ position: 'relative' }}>
          <button onClick={() => setMarkOpen((v) => !v)} style={{ ...headerBtn, color: markIsActive(mark) ? accent : '#fff' }} aria-label="Bookmark">
            <Bookmark size={16} fill={markIsActive(mark) ? 'currentColor' : 'none'} />
          </button>
          {markOpen && (
            <>
              <div onClick={() => setMarkOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 31 }}>
                <ChatMarkEditor
                  conversationId={conversationId}
                  characterId={character.id}
                  sessionId={getSessionId()}
                  initial={mark}
                  onSaved={(m) => setMark(m)}
                  onClose={() => setMarkOpen(false)}
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => navigate({ to: '/permanent/$id', params: { id: String(character.id) } })}
          style={headerBtn}
          aria-label="Permanent Memory"
        >
          <BookOpen size={17} />
        </button>
        <button onClick={() => setSheetOpen(true)} style={headerBtn} aria-label="Chat settings">
          <Menu size={18} />
        </button>
      </div>

      {roomOpen && (
        <div style={{ position: 'relative', zIndex: 4, padding: '0 1rem 0.5rem' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <RoomView key={character.id} roomId={`cv-${character.id}`} compact />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="cv-immersive-scroll" style={{ position: 'relative', zIndex: 3, flex: 1, overflowY: 'auto', padding: '0.5rem 1rem 1rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* Act / intro card */}
          {(character.description || character.persona) && (
            <div style={{ marginBottom: '1.25rem' }}>
              <button
                onClick={() => setIntroOpen((v) => !v)}
                className="cv-chat-bubble-char"
                style={{ width: '100%', textAlign: 'left', borderRadius: 14, padding: '0.85rem 1rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', gap: '0.6rem' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: introOpen ? '0.35rem' : 0, color: '#fff' }}>Act.</div>
                  {introOpen && (
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {character.description || character.persona}
                    </div>
                  )}
                </div>
                {introOpen ? <ChevronUp size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />}
              </button>
            </div>
          )}

          {/* Greeting before any messages */}
          {messages.length === 0 && character.greeting && (
            <CharacterMessage avatar={character.avatar} name={character.name} accent={accent} content={character.greeting} />
          )}

          {messages.map((m, i) => (
            <div key={m.id}>
              {m.role === 'user' ? (
                <UserMessage content={m.content} />
              ) : (
                <CharacterMessage avatar={character.avatar} name={character.name} accent={accent} content={m.content} />
              )}
              {/* The sweep line. Everything above it is still readable here and
                  in /history — it is simply no longer on the character's desk. */}
              {filedThrough > 0 && i === filedThrough - 1 && <FiledDivider count={filedThrough} />}
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', marginBottom: '1.1rem' }}>
              <AvatarBubble avatar={character.avatar} size={30} accent={accent} />
              <div className="cv-chat-bubble-char" style={{ borderRadius: '4px 16px 16px 16px', padding: '0.4rem 0.9rem' }}>
                <TypingDots />
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '0.7rem 1rem', borderRadius: 12, background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Go On */}
      {showGoOn && (
        <div style={{ position: 'relative', zIndex: 4, display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <button
            onClick={() => sendMessage(GO_ON_TOKEN)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1.1rem',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(0,0,0,0.45)',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            <FastForward size={14} /> Go on
          </button>
        </div>
      )}

      {/* Composer + action row */}
      <div style={{ position: 'relative', zIndex: 5, padding: '0.5rem 1rem 0.85rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-end',
              background: 'rgba(12,10,18,0.82)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16,
              padding: '0.4rem 0.4rem 0.4rem 1rem',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${character.name}`}
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.92rem',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.6,
                maxHeight: 120,
                padding: '0.45rem 0',
              }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              aria-label="Send"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                border: 'none',
                background: input.trim() && !isLoading ? `linear-gradient(135deg, ${accent}, #4f46e5)` : 'rgba(255,255,255,0.08)',
                color: input.trim() && !isLoading ? '#fff' : 'var(--text-secondary)',
                cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FastForward size={17} />
            </button>
          </div>

          {/* Restart / History / Delete */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.55rem' }}>
            <button className="cv-chat-actionbtn" onClick={handleRestart}>
              <RotateCcw size={17} />
              Restart
            </button>
            <button
              className="cv-chat-actionbtn"
              onClick={() => setDeskOpen(true)}
              disabled={!conversationId}
              title="File this thread and take it off the character's desk"
            >
              <Eraser size={17} />
              Clear desk
            </button>
            <button className="cv-chat-actionbtn" onClick={() => navigate({ to: '/history' })}>
              <HistoryIcon size={17} />
              History
            </button>
            <button className="cv-chat-actionbtn" onClick={handleDelete}>
              <Trash2 size={17} />
              Delete
            </button>
          </div>
        </div>
      </div>

      {deskOpen && conversationId > 0 && (
        <DeskSheet
          conversationId={conversationId}
          characterName={character.name}
          sessionId={getSessionId()}
          lastMessage={
            messages.length ? { content: messages[messages.length - 1].content } : null
          }
          onClose={() => setDeskOpen(false)}
          onCleared={() => setFiledThrough(messages.length)}
        />
      )}

      {sheetOpen && settings && (
        <ChatSettingsSheet
          characterName={character.name}
          settings={settings}
          onPatch={patchSettings}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}

function FiledDivider({ count }: { count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        margin: '0.4rem 0 1.1rem',
        color: 'var(--text-secondary)',
        fontSize: '0.62rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
      }}
    >
      <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <Eraser size={12} aria-hidden />
        DESK CLEARED · {count} TURN{count === 1 ? '' : 'S'} FILED
      </span>
      <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
    </div>
  )
}

function CharacterMessage({ avatar, name, accent, content }: { avatar: string; name: string; accent: string; content: string }) {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
      <AvatarBubble avatar={avatar} size={30} accent={accent} />
      <div style={{ maxWidth: '82%' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginBottom: '0.25rem' }}>{name}</div>
        <div className="cv-chat-bubble-char" style={{ borderRadius: '4px 16px 16px 16px', padding: '0.8rem 1rem', color: 'var(--text-primary)', fontSize: '0.92rem', lineHeight: 1.65 }}>
          <div className="prose"><Streamdown>{content}</Streamdown></div>
        </div>
      </div>
    </div>
  )
}

function UserMessage({ content }: { content: string }) {
  const isGoOn = content === GO_ON_TOKEN
  if (isGoOn) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.1rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>· continued ·</span>
      </div>
    )
  }
  return (
    <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.1rem' }}>
      <div
        style={{
          maxWidth: '80%',
          background: 'linear-gradient(135deg, #6d5bd0, #5b4fd6)',
          borderRadius: '16px 16px 4px 16px',
          padding: '0.8rem 1rem',
          color: '#fff',
          fontSize: '0.92rem',
          lineHeight: 1.6,
        }}
      >
        {content}
      </div>
    </div>
  )
}

function ChatPage() {
  const { id } = Route.useParams()
  const { q, node } = Route.useSearch()
  const navigate = useNavigate()
  const [character, setCharacter] = useState<Character | null>(null)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [initialMessages, setInitialMessages] = useState<InitMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sessionId = getSessionId()
    fetch(`/api/chat/${id}?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          navigate({ to: '/discover' })
          return
        }
        setCharacter(data.character)
        setConversationId(data.conversationId)
        setInitialMessages(Array.isArray(data.messages) ? data.messages : [])
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        navigate({ to: '/discover' })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '2rem' }} className="spin">✦</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Entering the room…</p>
      </div>
    )
  }

  if (!character || conversationId === null) return null

  return (
    <ChatInterface
      key={conversationId}
      character={character}
      initialConversationId={conversationId}
      initialMessages={initialMessages}
      autoSend={q}
      node={node}
    />
  )
}

export const Route = createFileRoute('/chat/$id')({
  validateSearch: (search: Record<string, unknown>): { q?: string; node?: string } => {
    const out: { q?: string; node?: string } = {}
    if (typeof search.q === 'string' && search.q.trim()) out.q = search.q
    // Which Codex satellite is answering. Validated server-side against the
    // roster — an unknown or unspawned node simply falls back to the character.
    if (typeof search.node === 'string' && /^[a-z]{2,16}$/.test(search.node)) out.node = search.node
    return out
  },
  component: ChatPage,
})
