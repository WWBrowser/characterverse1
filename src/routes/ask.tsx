import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import {
  Sparkles,
  Plus,
  Search,
  Image as ImageIcon,
  Library,
  NotebookPen,
  MessageCircle,
  Mic,
  ArrowUp,
  ArrowRight,
  ChevronDown,
  PanelLeft,
  Hash,
  X,
  Compass,
  Wand2,
  MousePointerClick,
  Gift,
  Shuffle,
  Dna,
  Hexagon,
} from 'lucide-react'
import { getSession } from '../lib/session'
import { COINS, formatCoinsExact, formatGbp, priceGbp } from '../lib/coins'
import { MODES, type ModeId } from '../lib/modes'
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

type RecentChat = { id: number; name: string; avatar: string; category: string }

const RECENT_KEY = 'cv_recent_chats'
const NOTES_KEY = 'cv_character_notes'

function getRecents(): RecentChat[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function pushRecent(c: Character) {
  if (typeof window === 'undefined') return
  const entry: RecentChat = { id: c.id, name: c.name, avatar: c.avatar, category: c.category }
  const next = [entry, ...getRecents().filter((r) => r.id !== c.id)].slice(0, 8)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

/* ------------------------------------------------------------------ Sidebar */

function SidebarItem({
  icon,
  label,
  badge,
  onClick,
  active,
}: {
  icon: React.ReactNode
  label: string
  badge?: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%',
        padding: '0.55rem 0.7rem',
        borderRadius: 10,
        border: 'none',
        background: active ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: '0.875rem',
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {badge && (
        <span
          style={{
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            padding: '0.1rem 0.4rem',
            borderRadius: 6,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            color: 'white',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/* ------------------------------------------------------- the Agentic Codex entry */
// The nursery entrance. The Codex sits directly under the CharacterVerse LLM mark
// and above New chat, because it is the collective the chats eventually feed: a
// dormant Synapse Collective model gestating off every stream on the platform.
// The capsule reads its live vitals so the sidebar shows the sleep progressing.

function CodexEntry() {
  const [codex, setCodex] = useState<{
    readiness: number
    neuralMass: number
    stage: { emoji: string; label: string; color: string }
  } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/codex')
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.codex) setCodex(d.codex)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const accent = codex?.stage?.color || '#a78bfa'

  return (
    <Link
      to="/codex"
      title="The Agentic Codex — the Synapse Collective's nursery"
      style={{
        display: 'block',
        padding: '0.6rem 0.7rem',
        margin: '0.15rem 0 0.35rem',
        borderRadius: 11,
        border: '1px solid rgba(167,139,250,0.32)',
        background: 'linear-gradient(135deg, rgba(167,139,250,0.16), rgba(16,185,129,0.09))',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <Dna size={15} color="#c4b5fd" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.845rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          Agentic Codex
        </span>
        <span
          style={{
            fontSize: '0.58rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '0.1rem 0.35rem',
            borderRadius: 5,
            background: 'rgba(167,139,250,0.22)',
            color: '#c4b5fd',
          }}
        >
          asleep
        </span>
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
        {codex
          ? `${codex.stage.emoji} ${codex.stage.label} · ${codex.neuralMass.toLocaleString('en-GB')} synapses`
          : 'Synapse Collective · nursery'}
      </div>
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(148,163,184,0.2)', marginTop: '0.4rem', overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.max(2, Math.min(100, codex?.readiness ?? 0))}%`,
            height: '100%',
            borderRadius: 4,
            background: accent,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </Link>
  )
}

function Sidebar({

  recents,
  onNewChat,
  onSearchChats,
  onOpenNotes,
  onOpenChat,
  onGoLibrary,
  onOpenMode,
  adoptingName,
}: {
  recents: RecentChat[]
  onNewChat: () => void
  onSearchChats: () => void
  onOpenNotes: () => void
  onOpenChat: (id: number) => void
  onGoLibrary: () => void
  onOpenMode: (id: ModeId) => void
  adoptingName: string | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.85rem 0.7rem',
        gap: '0.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.3rem 0.5rem 0.8rem' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={15} color="white" />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
          CharacterVerse <span className="gradient-text">LLM</span>
        </span>
      </div>

      <CodexEntry />

      <SidebarItem icon={<Plus size={17} />} label="New chat" onClick={onNewChat} />
      <SidebarItem icon={<Search size={17} />} label="Search chats" onClick={onSearchChats} />
      <SidebarItem icon={<ImageIcon size={17} />} label="Images" badge="New" onClick={onGoLibrary} />
      <SidebarItem icon={<Library size={17} />} label="Library" onClick={onGoLibrary} />

      <div style={{ height: 1, background: 'var(--border)', margin: '0.6rem 0.5rem' }} />

      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '0 0.7rem 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Notebooks
      </p>
      <SidebarItem icon={<NotebookPen size={17} />} label="Character notes" onClick={onOpenNotes} />

      <div style={{ height: 1, background: 'var(--border)', margin: '0.6rem 0.5rem' }} />

      {/* The other side: mode entrances. Ask is the LLM side; these carry a chosen
          character into a roleplaying / learning / business workspace, or into SPR,
          which answers four ways at once instead of one. */}
      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '0 0.7rem 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {adoptingName ? `Take ${adoptingName} into` : 'Mode entrances'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', marginBottom: '0.3rem' }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onOpenMode(m.id)}
            title={adoptingName ? `Adopt ${adoptingName} into ${m.modeLabel}` : m.modeLabel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              width: '100%',
              padding: '0.5rem 0.7rem',
              borderRadius: 9,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '0.84rem',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{m.emoji}</span>
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
            <ArrowRight size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '0.6rem 0.5rem' }} />

      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '0 0.7rem 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Recent character chats
      </p>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
        {recents.length === 0 ? (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.4rem 0.7rem', lineHeight: 1.5, opacity: 0.8 }}>
            Chats you start appear here for quick access.
          </p>
        ) : (
          recents.map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenChat(r.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                width: '100%',
                padding: '0.45rem 0.7rem',
                borderRadius: 9,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{r.avatar}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Notes modal */

function NotesModal({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setNotes(localStorage.getItem(NOTES_KEY) || '')
  }, [])

  const save = (v: string) => {
    setNotes(v)
    localStorage.setItem(NOTES_KEY, v)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
          <NotebookPen size={18} color="var(--accent-light)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Character notes</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
          A private scratchpad for character ideas, personas, and conversation prompts. Saved on this device.
        </p>
        <textarea
          value={notes}
          onChange={(e) => save(e.target.value)}
          placeholder="Jot down a persona, a scene to roleplay, or questions to ask…"
          style={{
            width: '100%',
            minHeight: 220,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '0.85rem 1rem',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontFamily: 'inherit',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- Home page */

function HomePage() {
  const navigate = useNavigate()
  // The Verse Wheel's "Ask a character anything" box hands the question over in
  // the URL, so arriving from the home page lands with the box already filled.
  const { q: handoff } = Route.useSearch()
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Character | null>(null)
  const [question, setQuestion] = useState(handoff ?? '')
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [idInput, setIdInput] = useState('')
  const [idError, setIdError] = useState('')
  const [model, setModel] = useState<'Flash' | 'Flash Extended'>('Flash')
  const [modelOpen, setModelOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(false)
  const [recents, setRecents] = useState<RecentChat[]>([])
  const [notice, setNotice] = useState('')
  const [routing, setRouting] = useState(false)
  const [surprising, setSurprising] = useState(false)
  // Character Codex. The first of its two access points: every tile in "Choose a
  // character to ask" can open its own Codex entry, and Advanced swaps the tiles
  // for full dossier cards without touching what a tile click means.
  const [advanced, setAdvanced] = useState(false)
  const [codexId, setCodexId] = useState<number | null>(null)

  // Only the eight tiles actually on screen, so the batch dossier read stays one
  // request and never grows with the unfiltered character list.
  const visibleIds = useMemo(() => characters.slice(0, 8).map((c) => c.id), [characters])
  const { dossiers } = useDossiers(visibleIds, advanced)
  const searchRef = useRef<HTMLInputElement>(null)

  // One-off fractional Silver bonus — the Ask page grants every account a single
  // welcome task reward that seeds the coin economy. `bonus` holds the live state:
  // null = unknown, then { claimed, amountMilli, balance }.
  const [bonus, setBonus] = useState<{ claimed: boolean; amountMilli: number; balance: number } | null>(null)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    const sid = getSession()
    fetch(`/api/coins?sessionId=${encodeURIComponent(sid)}`)
      .then((r) => r.json())
      .then((d) =>
        setBonus({
          claimed: !!d?.askClaimed,
          amountMilli: d?.settings?.askBonusMilli ?? 500,
          balance: d?.balances?.silver ?? 0,
        }),
      )
      .catch(() => {})
  }, [])

  const claimBonus = useCallback(async () => {
    if (claiming || bonus?.claimed) return
    setClaiming(true)
    const res = await fetch('/api/coins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'claimAskBonus', sessionId: getSession(), task: 'Ask LLM welcome task' }),
    })
      .then((r) => r.json())
      .catch(() => null)
    if (res) {
      setBonus({
        claimed: true,
        amountMilli: res.amountMilli ?? bonus?.amountMilli ?? 500,
        balance: res.balances?.silver ?? bonus?.balance ?? 0,
      })
    }
    setClaiming(false)
  }, [claiming, bonus])

  // Seed initial characters once, then load recents.
  useEffect(() => {
    fetch('/api/seed', { method: 'POST' }).catch(() => {})
    setRecents(getRecents())
    if (typeof window !== 'undefined' && window.innerWidth < 860) setSidebarOpen(false)
  }, [])

  // Load characters for the picker whenever category/search changes.
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

  const startChat = useCallback(
    (char: Character, q?: string) => {
      pushRecent(char)
      const text = (q ?? '').trim()
      navigate({
        to: '/chat/$id',
        params: { id: String(char.id) },
        search: text ? { q: text } : {},
      })
    },
    [navigate],
  )

  // Mode 2 — carry the chosen character into a roleplaying / learning / business
  // entrance. The mode workspace embodies it while keeping its purpose.
  const adoptIntoMode = useCallback(
    (modeId: ModeId) => {
      if (selected) {
        pushRecent(selected)
        navigate({ to: '/mode/$mode', params: { mode: modeId }, search: { character: String(selected.id) } })
      } else {
        navigate({ to: '/mode/$mode', params: { mode: modeId }, search: {} })
      }
    },
    [navigate, selected],
  )

  // Mode 1 — the LLM feel. With a character picked, ask it directly. With none,
  // route to the best character for the question (the picker stays blank), and
  // among same-named characters the best-performing personality is chosen.
  const handleAsk = useCallback(async () => {
    if (selected) {
      startChat(selected, question)
      return
    }
    const q = question.trim()
    if (!q) {
      setNotice('Type a question to be routed to the best character — or pick one below.')
      return
    }
    if (routing) return
    setRouting(true)
    setNotice('Finding the best character for you…')
    try {
      const res = await fetch('/api/ask-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, category }),
      })
      const data = await res.json()
      if (data?.character) {
        const note =
          data.sameNameCount > 1
            ? ` (best of ${data.sameNameCount} ${data.character.name} personalities)`
            : ''
        setNotice(
          data.matched
            ? `Routing you to ${data.character.name}${note} — the best match.`
            : `No exact match — routing you to ${data.character.name}, our top character.`,
        )
        startChat(data.character, question)
      } else {
        setNotice('No characters yet. Create one to get started.')
      }
    } catch {
      setNotice('Could not route your question. Pick a character below to ask.')
    } finally {
      setRouting(false)
    }
  }, [selected, question, category, routing, startChat])

  // "Surprise me" — a novel pairing each press: a random character dropped into a
  // random mode entrance, tying the LLM and character sides together.
  const surprise = useCallback(async () => {
    if (surprising) return
    setSurprising(true)
    setNotice('')
    try {
      let pool = characters
      if (!pool.length) {
        pool = await fetch('/api/characters?limit=50')
          .then((r) => r.json())
          .catch(() => [])
      }
      if (Array.isArray(pool) && pool.length) {
        const char = pool[Math.floor(Math.random() * pool.length)]
        const mode = MODES[Math.floor(Math.random() * MODES.length)]
        pushRecent(char)
        navigate({ to: '/mode/$mode', params: { mode: mode.id }, search: { character: String(char.id) } })
      } else {
        setNotice('No characters to surprise you with yet — create one first.')
      }
    } finally {
      setSurprising(false)
    }
  }, [surprising, characters, navigate])

  const handleIdGo = async () => {
    const id = parseInt(idInput, 10)
    if (isNaN(id)) {
      setIdError('Enter a numeric character ID')
      return
    }
    setIdError('')
    try {
      const res = await fetch(`/api/characters/${id}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        setIdError(`No character with ID ${id}`)
        return
      }
      setSelected(data)
      setNotice('')
    } catch {
      setIdError('Could not look up that ID')
    }
  }

  const greetingName = typeof window !== 'undefined' ? localStorage.getItem('cv_name') : null

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside
        className="cv-sidebar"
        style={{
          width: sidebarOpen ? 264 : 0,
          flexShrink: 0,
          borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
          background: 'var(--bg-secondary)',
          overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}
      >
        <div style={{ width: 264, height: '100%' }}>
          <Sidebar
            recents={recents}
            onNewChat={() => {
              setSelected(null)
              setQuestion('')
              setCategory('All')
              setSearch('')
              setNotice('')
            }}
            onSearchChats={() => {
              setCategory('All')
              setSearch('')
              setTimeout(() => searchRef.current?.focus(), 0)
            }}
            onOpenNotes={() => setNotesOpen(true)}
            onOpenChat={(id) => navigate({ to: '/chat/$id', params: { id: String(id) }, search: {} })}
            onGoLibrary={() => navigate({ to: '/discover' })}
            onOpenMode={adoptIntoMode}
            adoptingName={selected?.name ?? null}
          />
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* Top row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.85rem 1.25rem',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-primary)',
            zIndex: 5,
          }}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle sidebar"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '0.3rem' }}
          >
            <PanelLeft size={18} />
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={surprise}
            disabled={surprising}
            title="Drop a random character into a random mode"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.9rem',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: surprising ? 'default' : 'pointer',
            }}
          >
            <Shuffle size={14} color="var(--accent-light)" />
            {surprising ? 'Surprising…' : 'Surprise me'}
          </button>
          <button
            onClick={() => navigate({ to: '/create' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.9rem',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Wand2 size={14} color="var(--accent-light)" />
            Create a character
          </button>
        </div>

        <div style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.25rem 4rem' }}>
          {/* Greeting */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <h1 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.25 }}>
              {greetingName ? (
                <>Hi {greetingName}, let&apos;s get started</>
              ) : (
                <>
                  Ask a character <span className="gradient-text">anything</span>
                </>
              )}
            </h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.6rem' }}>
              Ask the LLM and we route you to the best character — or take a character into a mode.
            </p>
          </div>

          {/* One-off fractional Silver bonus task — seeds the coin economy. */}
          {bonus && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                background: 'linear-gradient(135deg, rgba(192,199,209,0.12), rgba(124,92,191,0.10))',
                border: '1px solid rgba(192,199,209,0.3)',
                borderRadius: 16,
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
              }}
            >
              <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{COINS.silver.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {bonus.claimed ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Welcome bonus claimed</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Your account holds {formatCoinsExact(bonus.balance)} Silver CC. Earn more by chatting —
                      every message mints Silver.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      Claim your one-off Ask bonus: {formatCoinsExact(bonus.amountMilli)} Silver CC
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      A fractional welcome reward worth {formatGbp(priceGbp(COINS.silver.basePrice) * (bonus.amountMilli / 1000))} — one per account.
                    </div>
                  </>
                )}
              </div>
              {!bonus.claimed && (
                <button
                  onClick={claimBonus}
                  disabled={claiming}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem 0.9rem',
                    borderRadius: 999,
                    border: 'none',
                    background: 'linear-gradient(135deg, #c0c7d1, #8b93a1)',
                    color: '#1a1a28',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: claiming ? 'default' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Gift size={14} /> {claiming ? 'Claiming…' : 'Claim'}
                </button>
              )}
            </div>
          )}

          {/* Ask box */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 26,
              padding: '0.5rem 0.5rem 0.5rem 1.1rem',
              boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
            }}
          >
            {selected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.5rem 0 0.1rem' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.2rem 0.6rem 0.2rem 0.4rem',
                    borderRadius: 999,
                    background: 'rgba(124,92,191,0.18)',
                    border: '1px solid rgba(124,92,191,0.35)',
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span>{selected.avatar}</span>
                  <span style={{ fontWeight: 600 }}>{selected.name}</span>
                  <button
                    onClick={() => setSelected(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 0 }}
                  >
                    <X size={13} />
                  </button>
                </span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem' }}>
              <textarea
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value)
                  setNotice('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAsk()
                  }
                }}
                placeholder="Ask a character"
                rows={1}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.95rem',
                  resize: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.6,
                  padding: '0.7rem 0',
                  maxHeight: 140,
                  overflowY: 'auto',
                }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
                }}
              />
              {/* Model selector */}
              <div style={{ position: 'relative', alignSelf: 'center' }}>
                <button
                  onClick={() => setModelOpen((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.4rem 0.7rem',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {model}
                  <ChevronDown size={13} />
                </button>
                {modelOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '110%',
                      right: 0,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '0.3rem',
                      minWidth: 150,
                      zIndex: 20,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    }}
                  >
                    {(['Flash', 'Flash Extended'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setModel(m)
                          setModelOpen(false)
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.45rem 0.6rem',
                          borderRadius: 7,
                          border: 'none',
                          background: model === m ? 'var(--bg-hover)' : 'transparent',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                title="Voice input"
                onClick={() => setNotice('Voice input is coming soon — type your question for now.')}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Mic size={17} />
              </button>
              <button
                onClick={handleAsk}
                disabled={routing}
                title="Ask"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  background:
                    (selected || question.trim()) && !routing
                      ? 'linear-gradient(135deg, #7c5cbf, #4f46e5)'
                      : 'var(--bg-hover)',
                  color: (selected || question.trim()) && !routing ? 'white' : 'var(--text-secondary)',
                  cursor: routing ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>

          {notice && (
            <p style={{ fontSize: '0.82rem', color: 'var(--accent-light)', textAlign: 'center', marginTop: '0.75rem' }}>{notice}</p>
          )}

          {/* The other side — take a character into a mode entrance (Mode 2). */}
          <div
            style={{
              marginTop: '1.25rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '0.9rem 1.1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
              <Shuffle size={15} color="var(--accent-light)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {selected ? `Take ${selected.name} into a mode` : 'Or enter a mode — adopt a character into it'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.55rem' }}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => adoptIntoMode(m.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '0.25rem',
                    padding: '0.7rem 0.8rem',
                    borderRadius: 12,
                    border: `1px solid ${m.accent}40`,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = m.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${m.accent}40`)}
                >
                  <span style={{ fontSize: '1.1rem' }}>{m.emoji}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{m.label}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                    {selected ? 'Adopt here' : 'Enter'} <ArrowRight size={11} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Picker: categories / search / character id */}
          <div
            style={{
              marginTop: '1.5rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '1.1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
              <Compass size={16} color="var(--accent-light)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Choose a character to ask</span>
              <span style={{ marginLeft: 'auto' }}>
                <AdvancedViewToggle advanced={advanced} onChange={setAdvanced} />
              </span>
            </div>

            {advanced && (
              <div style={{ marginBottom: '0.85rem' }}>
                <CodexBanner where="ask" />
              </div>
            )}

            {/* Category chips */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat)
                    setSearch('')
                  }}
                  style={{
                    padding: '0.3rem 0.85rem',
                    borderRadius: 999,
                    border: '1px solid',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderColor: category === cat && !search ? 'var(--accent)' : 'var(--border)',
                    background: category === cat && !search ? 'var(--accent)' : 'var(--bg-card)',
                    color: category === cat && !search ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search + character id */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flex: '1 1 220px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '0.5rem 0.8rem',
                }}
              >
                <Search size={15} color="var(--text-secondary)" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search characters…"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: 0 }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '0 1 190px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    flex: 1,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '0.5rem 0.7rem',
                  }}
                >
                  <Hash size={15} color="var(--text-secondary)" />
                  <input
                    value={idInput}
                    onChange={(e) => {
                      setIdInput(e.target.value)
                      setIdError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleIdGo()
                    }}
                    placeholder="Character ID"
                    inputMode="numeric"
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: 0 }}
                  />
                </div>
                <button
                  onClick={handleIdGo}
                  style={{
                    padding: '0.5rem 0.85rem',
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'white',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Go
                </button>
              </div>
            </div>
            {idError && <p style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '-0.6rem', marginBottom: '0.85rem' }}>{idError}</p>}

            {/* Results */}
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.6rem' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ height: 64, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', opacity: 0.5 }} />
                ))}
              </div>
            ) : characters.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem 0' }}>
                No characters match. Try another category or create one.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${advanced ? 268 : 190}px, 1fr))`, gap: '0.6rem' }}>
                {characters.slice(0, 8).map((char) => {
                  const isSel = selected?.id === char.id

                  // Advanced: the whole dossier, with the tile's meaning preserved —
                  // the card body still selects the character to ask, ADVANCED VIEW
                  // opens the Codex, and the footer still starts the chat outright.
                  if (advanced) {
                    return (
                      <DossierCard
                        key={char.id}
                        character={char}
                        dossier={dossiers[char.id]}
                        selected={isSel}
                        onOpen={setCodexId}
                        onCardClick={() => {
                          setSelected(char)
                          setNotice('')
                        }}
                        footer={
                          <button
                            type="button"
                            onClick={() => startChat(char, question)}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              borderRadius: 8,
                              border: 'none',
                              background: 'var(--accent)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            Ask this one
                          </button>
                        }
                      />
                    )
                  }

                  return (
                    <div key={char.id} style={{ position: 'relative' }}>
                      <button
                        onClick={() => {
                          setSelected(char)
                          setNotice('')
                        }}
                        onDoubleClick={() => startChat(char, question)}
                        title="Click to select · double-click to start chatting"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          width: '100%',
                          padding: '0.6rem 1.9rem 0.6rem 0.7rem',
                          borderRadius: 12,
                          border: '1px solid',
                          borderColor: isSel ? 'var(--accent)' : 'var(--border)',
                          background: isSel ? 'rgba(124,92,191,0.12)' : 'var(--bg-card)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'border-color 0.15s',
                        }}
                      >
                        <span
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
                          }}
                        >
                          {char.avatar}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {char.name}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#{char.id} · {char.category}</span>
                          </span>
                        </span>
                      </button>

                      {/* A tile click already means "ask this one", so the Codex gets
                          its own affordance rather than stealing that gesture. */}
                      <button
                        type="button"
                        onClick={() => setCodexId(char.id)}
                        title={`Open ${char.name}'s Character Codex`}
                        aria-label={`Open ${char.name}'s Character Codex`}
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--accent-light)',
                          cursor: 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        <Hexagon size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* How it works */}
          <div style={{ marginTop: '2.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', textAlign: 'center' }}>How it works</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {[
                {
                  icon: <Compass size={18} />,
                  title: 'Pick a character',
                  body: 'Browse by category, search by name, or paste a character ID to jump straight to one.',
                },
                {
                  icon: <MessageCircle size={18} />,
                  title: 'Ask anything',
                  body: 'Type your opening message in the box. Roleplay, learn, brainstorm — whatever you need.',
                },
                {
                  icon: <MousePointerClick size={18} />,
                  title: 'Start chatting',
                  body: 'Send to open a live, streaming conversation. Your recent chats stay in the sidebar.',
                },
              ].map((step, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: 'rgba(124,92,191,0.15)',
                      border: '1px solid rgba(124,92,191,0.3)',
                      color: 'var(--accent-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '0.7rem',
                    }}
                  >
                    {step.icon}
                  </div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--accent-light)', marginRight: '0.4rem' }}>{i + 1}.</span>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {notesOpen && <NotesModal onClose={() => setNotesOpen(false)} />}

      <CodexOverlay characterId={codexId} onClose={() => setCodexId(null)} />
    </div>
  )
}

export const Route = createFileRoute('/ask')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  component: HomePage,
})
