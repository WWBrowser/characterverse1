import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ExternalLink,
  Globe,
  Layers,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { BLEND, FRAMES, OPERATORS, SEARCH_SUGGESTIONS, type FrameId } from './searchindex'
import { DiscoverPanel, type DiscoverPayload } from './discover-ui.js'
import {
  AdvancedSearch,
  Pager,
  ResultsFooter,
  SearchExplainer,
  SponsoredSlot,
  VerticalStrip,
  type StripMode,
  applySort,
  type SortMode,
} from './search-chrome'

// CharacterVerse Search — the surface.
//
// One component, two mounts: the full /search page and the overlay that drops
// out of the workspace tab strip beside Index and Vibes. It has to be one
// component, because the brief was that SAA AlgorithmClaw runs both the search
// box and the side rail — two engines wearing the same name would be a lie you
// could see in the results.
//
// Modelled on a search engine rather than a filter widget, deliberately:
//
//   The box is the whole interface. Wordmark, one input, chips underneath.
//   Nothing is behind a menu; the operators are printed under the box.
//
//   A result is a breadcrumb, a title and a snippet. The frame badge is the one
//   addition, because here a result can either open in a tab or send you away,
//   and you should know which before you click, not after.
//
//   Every result says why it ranked. Not a percentage with no provenance — the
//   four components that produced it, and the terms that matched.
//
// AI Mode is not a different search. Plain mode runs the index kernel over the
// corpus; AI Mode hands the same words to AlgorithmClaw's slate builder, which
// reads your chat history and writes scenarios. Same engine, two questions:
// "what matches these words" and "what should I do tonight".

/* ------------------------------------------------------------------ types */

export type IndexHit = {
  ref: string
  kind: 'character' | 'thread' | 'external'
  id: number
  title: string
  subtitle: string
  snippet: string
  url: string
  host: string
  frame: FrameId | ''
  category: string
  icon: string
  tags: string[]
  score: number
  breakdown: { lexical: number; semantic: number; demand: number; freshness: number }
  matched: string[]
  why: string
  /** Set only on a row served in the sponsored slot, by the API, never here. */
  sponsored?: boolean
  sponsorNote?: string
}

export type IndexEntry = {
  id: number
  name: string
  tagline: string
  description: string
  url: string
  host: string
  frame: FrameId
  provider: string
  icon: string
  category: string
  tags: string[]
  vibes: string[]
  status: string
  mine: boolean
  demand: { impressions: number; opens: number; dismissals: number; blocks: number; rate: number; blocked: number; score: number }
  lastOpenedAt: string | null
  /** Paid placement, read fresh on every request rather than stored as a flag. */
  sponsored?: boolean
  sponsoredUntil?: string | null
  sponsorMilli?: number
  sponsorNote?: string
}

export type SearchModel = {
  protocol: { name: string; version: string; host: string }
  search_engine: {
    name: string
    mode: string
    surfaces: string[]
    current_query: {
      raw: string
      terms: string[]
      phrases: string[]
      filters: { scope: string; frame: FrameId | null; site: string }
      axes: Record<string, number>
      clarity: number
      fan_out: { intent: string; terms: string[]; weight: number; note: string }[]
    }
    suggested_prompts: string[]
    operators: { op: string; means: string }[]
    sponsorship?: {
      slots: number
      rate_milli_per_day: number
      days: readonly number[]
      rules: string[]
    }
    blend: typeof BLEND
    seed: string
  }
  ranker_context: {
    state: string
    strategy: string
    metrics: {
      conversations_analyzed: number
      average_turns_per_conversation: number
      signal_strength_percentage: number
      detected_user_voice: string
    }
    note: string
  }
  retrieval: {
    corpus: { total: number; characters: number; threads: number; external: number }
    scanned: number
    facets: { all: number; character: number; thread: number; external: number; inframe: number; oframe: number }
  }
  results: IndexHit[]
  /** The paid rows, kept out of `results` so nothing can mix the two by accident. */
  sponsored?: IndexHit[]
  result_stats?: {
    matched: number
    returned: number
    sponsored: number
    scanned: number
    capped: boolean
    took_ms: number
  }
  telemetry_and_learning: {
    entries: number
    live: number
    inframe: number
    oframe: number
    impressions: number
    opens: number
    dismissals: number
    frameBlocks: number
    events: number
    queries: number
    searchers: number
    trending: { query: string; count: number }[]
    philosophy: string
    description: string
  }
  refused?: boolean
  reasoning?: string
}

type AiCard = {
  id: number
  characterId: number
  name: string
  avatar: string
  title: string
  scenario: string
  opener: string
  vibeMatch: string
  match: number
}

/* ------------------------------------------------------------ the filters */

/**
 * The result tabs.
 *
 * Each one is an operator, not a client-side array filter. Clicking "External"
 * literally types `is:external` into the query and re-runs it, so the tab and
 * the typed operator can never disagree, and the URL you copy reproduces the
 * page you were looking at.
 */
const SCOPES = [
  { key: '', label: 'All', op: '', icon: Layers },
  { key: 'character', label: 'Characters', op: 'is:character', icon: Users },
  { key: 'thread', label: 'Your chats', op: 'is:thread', icon: MessageSquare },
  { key: 'external', label: 'External', op: 'is:external', icon: Globe },
  { key: 'inframe', label: 'Inframe', op: 'frame:inframe', icon: Layers },
  { key: 'oframe', label: 'Oframe', op: 'frame:oframe', icon: ExternalLink },
] as const

const OPERATOR_RE = /\b(is|frame):[a-z]+/gi

function withScope(query: string, op: string): string {
  const bare = query.replace(OPERATOR_RE, '').replace(/\s+/g, ' ').trim()
  return op ? `${bare} ${op}`.trim() : bare
}

function scopeOf(query: string): string {
  const m = query.toLowerCase().match(/\b(?:is|frame):([a-z]+)/)
  return m ? m[1] : ''
}

/* ------------------------------------------------------------- the badges */

function FrameBadge({ frame, size = 10 }: { frame: FrameId; size?: number }) {
  const f = FRAMES[frame]
  const inframe = frame === 'inframe'
  return (
    <span
      title={f.behaviour}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: size,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: 4,
        border: `1px solid ${inframe ? 'var(--accent)' : 'var(--border)'}`,
        color: inframe ? 'var(--accent-light)' : 'var(--text-secondary)',
        background: inframe ? 'rgba(124, 92, 255, 0.08)' : 'transparent',
        flexShrink: 0,
      }}
    >
      {inframe ? <Layers size={size} /> : <ExternalLink size={size} />}
      {f.label} · {f.verb}
    </span>
  )
}

/* ------------------------------------------------------------ the surface */

export function SearchSurface({
  sessionId,
  variant = 'page',
  onOpenCharacter,
  onOpenFrame,
  onClose,
  initialQuery = '',
}: {
  sessionId: string
  variant?: 'page' | 'overlay'
  /** Workspace mounts pass these so a result becomes a tab instead of a page load. */
  onOpenCharacter?: (characterId: number, title: string) => void
  onOpenFrame?: (entryId: number, title: string) => void
  onClose?: () => void
  initialQuery?: string
}) {
  const [draft, setDraft] = useState(initialQuery)
  const [model, setModel] = useState<SearchModel | null>(null)
  const [entries, setEntries] = useState<IndexEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiCards, setAiCards] = useState<AiCard[] | null>(null)
  const [aiNote, setAiNote] = useState('')
  // Discover is its own request against its own endpoint, kept in its own
  // state. It is slower than the search — it can make outbound calls — and a
  // result list that waited for an encyclopedia article to be written before
  // rendering would have given up the thing it is best at.
  const [discoverOn, setDiscoverOn] = useState(false)
  const [discover, setDiscover] = useState<DiscoverPayload | null>(null)
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [searched, setSearched] = useState(Boolean(initialQuery))
  const [showAllTiles, setShowAllTiles] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rankerOpen, setRankerOpen] = useState(false)
  // Result-page furniture: how the returned page is ordered, how much of it is
  // shown at a time, and which slice is on screen. None of it re-runs the
  // query — a page that refetched to turn a page would be charging the index
  // for a scroll.
  const [sort, setSort] = useState<SortMode>('rank')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [advanced, setAdvanced] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const queryRef = useRef(initialQuery)
  const top = useRef<HTMLDivElement>(null)

  /** Fire-and-forget telemetry. A log that can break a click is worse than no log. */
  const event = useCallback(
    (body: Record<string, unknown>) => {
      void fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'event', ...body }),
      }).catch(() => {})
    },
    [sessionId],
  )

  const loadEntries = useCallback(() => {
    fetch(`/api/search?entries=1&sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEntries(Array.isArray(d?.entries) ? d.entries : []))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => { if (sessionId) loadEntries() }, [sessionId, loadEntries])

  const run = useCallback(
    async (q: string) => {
      queryRef.current = q
      setDraft(q)
      setSearched(true)
      setLoading(true)
      setExpanded(null)
      // A new query starts at page one. Landing on page 3 of a different result
      // set is the oldest bug in paginated search.
      setPage(1)
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&sessionId=${encodeURIComponent(sessionId)}&source=${variant === 'overlay' ? 'workspace' : 'search'}`,
        )
        const data = res.ok ? await res.json() : null
        // A stale response from a query the user has already replaced is dropped
        // rather than rendered — typing fast must not scramble the page.
        if (data && queryRef.current === q) setModel(data)
      } catch {
        /* the page keeps the last good model rather than blanking */
      } finally {
        setLoading(false)
      }

      if (!aiMode || !q.trim()) return
      setAiCards(null)
      setAiNote('')
      try {
        const res = await fetch('/api/algorithmclaw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, vibe: q }),
        })
        const data = res.ok ? await res.json() : null
        if (!data || queryRef.current !== q) return
        setAiCards(Array.isArray(data.recommendations) ? data.recommendations : [])
        setAiNote(data.message || data.note || '')
      } catch {
        setAiNote('AlgorithmClaw did not answer. The index results below are unaffected.')
      }
    },
    [aiMode, sessionId, variant],
  )

  useEffect(() => { if (sessionId && initialQuery) void run(initialQuery) }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Discover.
   *
   * Keyed on the query the model actually ran rather than on the draft in the
   * box, so the article and the list underneath it always describe the same
   * page. Firing on the draft would let a half-typed query produce an article
   * about a search nobody ran. */
  const ranQuery = model?.search_engine.current_query.raw || ''
  const discoverRef = useRef('')
  useEffect(() => {
    if (!discoverOn || !ranQuery.trim()) return
    const want = ranQuery
    discoverRef.current = want
    setDiscoverLoading(true)
    setDiscover(null)
    fetch(`/api/discover?q=${encodeURIComponent(want)}&sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        // Dropped rather than rendered if the query has moved on: an article is
        // a long enough request that this races in ordinary use.
        if (discoverRef.current !== want) return
        setDiscover(data && typeof data === 'object' ? data : { error: 'The Discover engine returned nothing readable.' })
      })
      .catch(() => {
        if (discoverRef.current !== want) return
        setDiscover({ error: 'The Discover engine could not be reached. The results are unaffected — they came from a different request.' })
      })
      .finally(() => {
        if (discoverRef.current === want) setDiscoverLoading(false)
      })
  }, [discoverOn, ranQuery, sessionId])

  /**
   * The strip's three in-place modes.
   *
   * One setter for all three so they cannot both be on. Turning Discover on
   * before anything has been searched runs the search too — the article is a
   * description of a result page, so there has to be one.
   */
  const mode: StripMode = aiMode ? 'ai' : discoverOn ? 'discover' : 'all'
  const setMode = useCallback(
    (next: StripMode) => {
      setAiMode(next === 'ai')
      setDiscoverOn(next === 'discover')
      if (next === 'ai') { void run(draft); return }
      if (next === 'discover') { if (!searched && draft.trim()) void run(draft); return }
      void run(withScope(draft, ''))
    },
    [draft, run, searched],
  )

  const hits = useMemo(
    () => (model?.results || []).filter((h) => !dismissed.includes(h.ref)),
    [model, dismissed],
  )

  const sorted = useMemo(() => applySort(hits, sort), [hits, sort])
  const pages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  // Clamped rather than trusted: dismissing the last two rows on the final page
  // shrinks the page count under the reader, and a page number that outlives
  // its page renders an empty list with no way back.
  const current = Math.min(page, pages)
  const paged = useMemo(
    () => (pageSize > 0 ? sorted.slice((current - 1) * pageSize, current * pageSize) : sorted),
    [sorted, pageSize, current],
  )

  const goPage = useCallback((n: number) => {
    setPage(Math.max(1, n))
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /** The explainer's subject: the top-ranked row, and its registry row if it has one. */
  const subject = sorted[0] ?? null
  const subjectEntry = useMemo(
    () => (subject && subject.kind === 'external' ? entries.find((e) => e.id === subject.id) ?? null : null),
    [subject, entries],
  )

  const tiles = useMemo(() => {
    const live = entries.filter((e) => e.status === 'live')
    // Ordered by measured demand, not by when they were added. The tile row is
    // the most valuable slot on the page, so it is earned.
    live.sort((a, b) => b.demand.score - a.demand.score || a.name.localeCompare(b.name))
    return showAllTiles ? live : live.slice(0, 8)
  }, [entries, showAllTiles])

  // Tiles are an impression too. One batched call for the whole row, once, so
  // the row cannot inflate its own numbers by re-rendering.
  const tilesLogged = useRef(false)
  useEffect(() => {
    if (tilesLogged.current || !sessionId || !tiles.length) return
    tilesLogged.current = true
    void fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        action: 'impressions',
        query: '',
        source: 'tiles',
        hits: tiles.map((t) => ({ ref: `external:${t.id}`, kind: 'external', id: t.id, frame: t.frame })),
      }),
    }).catch(() => {})
  }, [sessionId, tiles])

  const openExternal = useCallback(
    async (input: { id: number; title: string; url: string; frame: FrameId; rank: number; query: string }) => {
      event({ kind: 'open', entryId: input.id, docKind: 'external', frame: input.frame, query: input.query, rank: input.rank, source: variant === 'overlay' ? 'workspace' : 'search' })

      if (input.frame === 'oframe') {
        // The redirect half. CharacterVerse stays where it is; the browser takes
        // over. noopener because the opened page must not be able to reach back
        // into this one, and this is the one moment we hand off control.
        window.open(input.url, '_blank', 'noopener,noreferrer')
        return
      }

      // The direct half. An inframe entry becomes a tab in the strip.
      if (onOpenFrame) {
        onOpenFrame(input.id, input.title)
        return
      }
      try {
        const res = await fetch('/api/tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, action: 'openFrame', entryId: input.id, title: input.title }),
        })
        if (res.ok) {
          window.location.href = '/workspace'
          return
        }
      } catch {
        /* fall through to the hand-off */
      }
      // The tab could not be opened, so the honest fallback is the thing the
      // oframe half does anyway: send them there rather than show a dead tab.
      window.open(input.url, '_blank', 'noopener,noreferrer')
    },
    [event, onOpenFrame, sessionId, variant],
  )

  const openHit = useCallback(
    async (hit: IndexHit, rank: number) => {
      const query = model?.search_engine.current_query.raw || ''
      if (hit.kind === 'external') {
        await openExternal({
          id: hit.id,
          title: hit.title,
          url: hit.url,
          frame: hit.frame === 'inframe' ? 'inframe' : 'oframe',
          rank,
          query,
        })
        return
      }
      event({ kind: 'open', characterId: hit.kind === 'character' ? hit.id : null, docKind: hit.kind, query, rank, source: variant === 'overlay' ? 'workspace' : 'search' })
      if (hit.kind === 'character' && onOpenCharacter) {
        onOpenCharacter(hit.id, hit.title)
        return
      }
      window.location.href = hit.url
    },
    [event, model, onOpenCharacter, openExternal, variant],
  )

  const dismiss = useCallback(
    (hit: IndexHit, rank: number) => {
      setDismissed((d) => [...d, hit.ref])
      event({
        kind: 'dismiss',
        entryId: hit.kind === 'external' ? hit.id : null,
        characterId: hit.kind === 'character' ? hit.id : null,
        docKind: hit.kind,
        frame: hit.frame,
        query: model?.search_engine.current_query.raw || '',
        rank,
        source: variant === 'overlay' ? 'workspace' : 'search',
      })
    },
    [event, model, variant],
  )

  const scope = scopeOf(draft)
  const facets = model?.retrieval.facets

  /* ------------------------------------------------------------- the box */

  const box = (
    <form
      onSubmit={(e) => { e.preventDefault(); void run(draft) }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        maxWidth: 660,
        padding: '9px 14px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: '0 1px 6px rgba(0, 0, 0, 0.25)',
      }}
    >
      <a
        href="/search/add"
        title="Add an AI system or character to the index"
        aria-label="Add to the index"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 999,
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          flexShrink: 0,
          textDecoration: 'none',
        }}
      >
        <Plus size={14} />
      </a>

      <input
        ref={input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search characters, your chats, and AI systems hosted elsewhere"
        aria-label="Search CharacterVerse"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontSize: 14.5,
        }}
      />

      {draft && (
        <button
          type="button"
          onClick={() => { setDraft(''); input.current?.focus() }}
          aria-label="Clear"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={14} />
        </button>
      )}

      <button
        type="button"
        onClick={() => setAiMode((v) => !v)}
        aria-pressed={aiMode}
        title="AI Mode hands the same words to AlgorithmClaw, which reads your chat history and writes scenarios instead of matching text."
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 9px',
          borderRadius: 999,
          border: `1px solid ${aiMode ? 'var(--accent)' : 'var(--border)'}`,
          background: aiMode ? 'var(--accent)' : 'transparent',
          color: aiMode ? '#fff' : 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <Sparkles size={12} /> AI Mode
      </button>

      <button
        type="submit"
        aria-label="Search"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 999,
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
      </button>
    </form>
  )

  const chips = (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: variant === 'page' && !searched ? 'center' : 'flex-start' }}>
      {(model?.search_engine.suggested_prompts || SEARCH_SUGGESTIONS).map((s) => (
        <button
          key={s}
          onClick={() => void run(s)}
          style={{
            padding: '5px 11px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            fontSize: 11.5,
            cursor: 'pointer',
          }}
        >
          {s}
        </button>
      ))}
    </div>
  )

  const tileRow = tiles.length > 0 && (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
          AI systems in the index
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          hosted elsewhere · ordered by measured demand
        </span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {tiles.map((t, i) => (
          <button
            key={t.id}
            onClick={() => void openExternal({ id: t.id, title: t.name, url: t.url, frame: t.frame, rank: i + 1, query: '' })}
            title={`${t.tagline || t.name} — ${FRAMES[t.frame].behaviour}`}
            style={{
              width: 92,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <span
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                border: `1px solid ${t.frame === 'inframe' ? 'var(--accent)' : 'var(--border)'}`,
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
              aria-hidden
            >
              {t.icon}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.3 }}>
              {t.name}
            </span>
            <span style={{ fontSize: 9.5, letterSpacing: 0.3, textTransform: 'uppercase', color: t.frame === 'inframe' ? 'var(--accent-light)' : 'var(--text-secondary)' }}>
              {FRAMES[t.frame].verb}
            </span>
          </button>
        ))}
        {!showAllTiles && entries.filter((e) => e.status === 'live').length > 8 && (
          <button
            onClick={() => setShowAllTiles(true)}
            style={{
              width: 92,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 7,
              padding: 0,
            }}
          >
            <span
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                border: '1px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
              aria-hidden
            >
              <ChevronDown size={18} />
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Show more</span>
          </button>
        )}
        <a
          href="/search/add"
          style={{
            width: 92,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 7,
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              border: '1px dashed var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
            aria-hidden
          >
            <Plus size={18} />
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'center' }}>Add a system</span>
        </a>
      </div>
    </div>
  )

  /* --------------------------------------------------------- the results */

  const results = (
    <div style={{ display: 'grid', gap: 22 }}>
      {model?.refused && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', margin: 0, lineHeight: 1.6 }}>
          SecurityClaw refused that query. {model.reasoning}
        </p>
      )}

      {model && !aiMode && <SponsoredSlot model={model} onOpen={(hit, rank) => void openHit(hit, rank)} />}

      {aiMode && aiCards && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Sparkles size={13} color="var(--accent-light)" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>AI Mode — AlgorithmClaw</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              read your history for this, then wrote the scenarios
            </span>
          </div>
          {aiNote && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.6 }}>{aiNote}</p>}
          <div style={{ display: 'grid', gap: 9 }}>
            {aiCards.map((c) => (
              <button
                key={`${c.id}-${c.characterId}`}
                onClick={() => (onOpenCharacter ? onOpenCharacter(c.characterId, c.title) : (window.location.href = `/chat/${c.characterId}`))}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  borderLeft: '2px solid var(--accent-light)',
                  background: 'var(--bg-card)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }} aria-hidden>{c.avatar}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{c.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.name}</span>
                  {typeof c.match === 'number' && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent-light)' }}>{c.match}% match</span>
                  )}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                  {c.scenario}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {searched && !loading && hits.length === 0 && !model?.refused && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            Nothing in the index matched <strong style={{ color: 'var(--text-primary)' }}>{model?.search_engine.current_query.raw}</strong>.
          </p>
          {model && model.retrieval.corpus.total === 0 ? (
            <p style={{ margin: '8px 0 0' }}>
              The index is empty — no characters, no conversations, no registered systems. Seed it from the add page.
            </p>
          ) : (
            <p style={{ margin: '8px 0 0' }}>
              {model?.retrieval.scanned} documents were scanned. A quoted phrase is a hard filter, so dropping the quotes
              is usually the fix; so is dropping an <code>is:</code> operator.
            </p>
          )}
        </div>
      )}

      {paged.map((hit, i) => {
        const isOpen = expanded === hit.ref
        const internal = hit.url.startsWith('/')
        // The rank recorded is the rank on the result set, not the position in
        // the visible slice. Page 2 row 1 is result 11, and telemetry that
        // called it result 1 would report every page as a page of top hits.
        const rank = (pageSize > 0 ? (current - 1) * pageSize : 0) + i + 1
        return (
          <article key={hit.ref} style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 14 }} aria-hidden>{hit.icon}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {internal ? `characterverse${hit.url}` : hit.host}
                {hit.category ? ` › ${hit.category}` : ''}
              </span>
              {hit.frame && <FrameBadge frame={hit.frame === 'inframe' ? 'inframe' : 'oframe'} />}
              <button
                onClick={() => dismiss(hit, rank)}
                aria-label={`Dismiss ${hit.title}`}
                title="Not this. The dismissal is recorded — the ranker learns from misses as well as hits."
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
              >
                <X size={12} />
              </button>
            </div>

            <button
              onClick={() => void openHit(hit, rank)}
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', display: 'block' }}
            >
              <span style={{ fontSize: 17, color: 'var(--accent-light)', lineHeight: 1.35 }}>{hit.title}</span>
            </button>

            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '3px 0 0', lineHeight: 1.65 }}>
              {hit.subtitle && <span style={{ color: 'var(--text-primary)' }}>{hit.subtitle} — </span>}
              {hit.snippet}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setExpanded(isOpen ? null : hit.ref)}
                aria-expanded={isOpen}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
              >
                <span style={{ color: 'var(--accent-light)', fontVariantNumeric: 'tabular-nums' }}>{hit.score}</span>
                why this ranked
                <ChevronDown size={11} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {hit.matched.slice(0, 4).map((m) => (
                <span key={m} style={{ fontSize: 10.5, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 5px' }}>
                  {m}
                </span>
              ))}
            </div>

            {isOpen && (
              <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{hit.why}</p>
                <div style={{ display: 'grid', gap: 5, marginTop: 9 }}>
                  {(['lexical', 'semantic', 'demand', 'freshness'] as const).map((k) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 66, flexShrink: 0 }}>{k}</span>
                      <span style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--bg-primary)', overflow: 'hidden' }}>
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${Math.round(hit.breakdown[k] * 100)}%`,
                            background: 'var(--accent)',
                          }}
                        />
                      </span>
                      <span style={{ width: 62, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {hit.breakdown[k].toFixed(2)} × {BLEND[k]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        )
      })}

      {searched && model && (
        <>
          <Pager page={current} pages={pages} onPage={goPage} />
          <ResultsFooter
            model={model}
            sort={sort}
            onWhy={() => {
              setRankerOpen(true)
              // The rail is below the results on a narrow screen, so opening it
              // from down here has to bring it into view as well as expand it.
              window.setTimeout(() => document.getElementById('cv-ranker')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30)
            }}
          />
        </>
      )}
    </div>
  )

  /* ---------------------------------------------------------- the ranker */

  const ranker = model && (
    <aside id="cv-ranker" style={{ maxWidth: 300 }}>
      <button
        onClick={() => setRankerOpen((v) => !v)}
        aria-expanded={rankerOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          width: '100%',
          padding: '9px 12px',
          borderRadius: 9,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <Activity size={13} color="var(--accent-light)" />
        {model.search_engine.name}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-secondary)' }}>
          {model.ranker_context.state === 'cold_start' ? 'cold start' : 'warm'}
        </span>
        <ChevronDown size={12} style={{ transform: rankerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {rankerOpen && (
        <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {model.ranker_context.note}
          </p>

          <div>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>Blend</span>
            <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
              {Object.entries(model.search_engine.blend).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ flex: 1 }}>{k}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>Corpus</span>
            <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>characters</span><span style={{ color: 'var(--text-primary)' }}>{model.retrieval.corpus.characters}</span></div>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>your threads</span><span style={{ color: 'var(--text-primary)' }}>{model.retrieval.corpus.threads}</span></div>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>external systems</span><span style={{ color: 'var(--text-primary)' }}>{model.retrieval.corpus.external}</span></div>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>scanned this query</span><span style={{ color: 'var(--text-primary)' }}>{model.retrieval.scanned}</span></div>
            </div>
          </div>

          <div>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>Demand measured</span>
            <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>impressions</span><span style={{ color: 'var(--text-primary)' }}>{model.telemetry_and_learning.impressions}</span></div>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>opens</span><span style={{ color: 'var(--text-primary)' }}>{model.telemetry_and_learning.opens}</span></div>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>dismissals</span><span style={{ color: 'var(--text-primary)' }}>{model.telemetry_and_learning.dismissals}</span></div>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>refused embeds</span><span style={{ color: 'var(--text-primary)' }}>{model.telemetry_and_learning.frameBlocks}</span></div>
              <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>queries</span><span style={{ color: 'var(--text-primary)' }}>{model.telemetry_and_learning.queries}</span></div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {model.telemetry_and_learning.description}
            </p>
          </div>

          {model.telemetry_and_learning.trending.length > 0 && (
            <div>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>Trending</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {model.telemetry_and_learning.trending.slice(0, 6).map((t) => (
                  <button
                    key={t.query}
                    onClick={() => void run(t.query)}
                    style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    {t.query} · {t.count}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>Operators</span>
        <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {(model.search_engine.operators || OPERATORS).map((o) => (
            <div key={o.op} style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <code style={{ color: 'var(--accent-light)' }}>{o.op}</code> {o.means}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )

  /* ------------------------------------------------------------ assembly */

  /**
   * The two rows, in this order:
   *
   *   strip   which index — All, plus the other searchable surfaces, plus More
   *           and Tools. The verticals that leave this page carry the query
   *           where the destination can accept one.
   *   tabs    which slice of this index — the kinds of document in it.
   *
   * Stacked rather than merged because they filter different things. Merging
   * them would produce one row where "Video" and "Your chats" sat side by side
   * as if they were the same kind of choice, and they are not: one changes the
   * corpus, the other changes the cut.
   */
  const strip = searched && (
    <VerticalStrip
      query={draft}
      mode={mode}
      onMode={setMode}
      sort={sort}
      onSort={setSort}
      pageSize={pageSize}
      onPageSize={(n) => { setPageSize(n); setPage(1) }}
      stats={model?.result_stats}
      onAdvanced={() => setAdvanced(true)}
    />
  )

  /* The encyclopedia half, rendered in the results column above the rows it
   * describes. Above rather than beside: the right rail already holds the
   * explainer, which answers "how was this search run", and this answers "what
   * is this search about" — a different question, and the one a reader who
   * asked for Discover came for. */
  const discoverPanel = discoverOn && searched && (
    <DiscoverPanel
      payload={discover}
      loading={discoverLoading}
      query={ranQuery || draft}
      onRun={(q) => { setDraft(q); void run(q) }}
      // Closes the panel and nothing else. Routing this through setMode('all')
      // would re-run the search and strip the scope, which is a side effect
      // nobody asked for by pressing (x) on an article.
      onClose={() => setDiscoverOn(false)}
    />
  )

  const tabs = searched && (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
      {SCOPES.map(({ key, label, op, icon: Icon }) => {
        const active = scope === key
        const count = facets
          ? key === ''
            ? facets.all
            : key === 'character'
              ? facets.character
              : key === 'thread'
                ? facets.thread
                : key === 'external'
                  ? facets.external
                  : key === 'inframe'
                    ? facets.inframe
                    : facets.oframe
          : null
        return (
          <button
            key={label}
            onClick={() => void run(withScope(draft, op))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 999,
              border: '1px solid transparent',
              borderColor: active ? 'var(--accent)' : 'transparent',
              background: active ? 'rgba(124, 92, 255, 0.1)' : 'transparent',
              color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
              fontSize: 11.5,
              cursor: 'pointer',
            }}
          >
            <Icon size={12} /> {label}
            {count !== null && <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{count}</span>}
          </button>
        )
      })}
    </div>
  )

  if (variant === 'overlay') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--bg-primary)',
          zIndex: 5,
          overflowY: 'auto',
          padding: '16px 20px 40px',
        }}
        className="animate-fade-in"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Search size={14} color="var(--accent-light)" />
          <h2 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>CharacterVerse Search</h2>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            internal and external AI chat · one index
          </span>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close search"
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {box}
          {advanced && <AdvancedSearch onRun={(q) => void run(q)} onClose={() => setAdvanced(false)} />}
          {!searched && chips}
          {!searched && tileRow}
          {strip}
          {tabs}
          {discoverPanel}
          {results}
          {ranker}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {!searched ? (
        <div style={{ display: 'grid', gap: 20, justifyItems: 'center', paddingTop: 28 }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: 0, fontSize: 38, fontWeight: 700, letterSpacing: -1, color: 'var(--text-primary)' }}>
              CharacterVerse <span style={{ color: 'var(--accent-light)' }}>Search</span>
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 520 }}>
              One index over the characters here, your own conversations, and AI systems hosted somewhere
              else entirely. We host the protocol; we do not have to host the answer.
            </p>
          </div>
          {box}
          {chips}
          {tileRow}
        </div>
      ) : (
        <>
          <div ref={top} style={{ display: 'grid', gap: 12 }}>
            {box}
            {advanced && <AdvancedSearch onRun={(q) => void run(q)} onClose={() => setAdvanced(false)} />}
            {strip}
            {tabs}
          </div>
          <div style={{ display: 'flex', gap: 34, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300, display: 'grid', gap: 18 }}>
              {discoverPanel}
              {results}
            </div>
            <div style={{ display: 'grid', gap: 14, width: 300, maxWidth: '100%' }}>
              {model && (
                <SearchExplainer
                  model={model}
                  hit={subject}
                  entry={subjectEntry}
                  onRun={(q) => void run(q)}
                />
              )}
              {ranker}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
