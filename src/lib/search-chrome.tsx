import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Bot,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  Library,
  MessageCircle,
  Palette,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Compass,
  type LucideIcon,
} from 'lucide-react'
import { FRAMES, OPERATORS, type FrameId } from './searchindex'
import { useDismissable } from './popover'
import type { IndexEntry, IndexHit, SearchModel } from './search-ui'

// CharacterVerse Search — the result-page chrome.
//
// Everything on a results page that is not a result: the vertical strip above
// the scope chips, the two menus that hang off it, the advanced-search form,
// the collapsible explainer in the rail, the sponsored slot, the pager and the
// footer. Split out of search-ui.tsx because that file's job is the box and the
// rows, and a file that also owned the furniture would be read by nobody.
//
// Four rules this file keeps, all of them the same rule:
//
//   1. Every vertical is a real surface. Where that surface can accept the
//      query it is carried across; where it cannot, the strip says so instead
//      of dropping the words silently.
//   2. Tools only offer what the kernel can actually do. There is no date
//      filter here, because `SearchDoc` has an ordinal and not a timestamp —
//      freshness is a ranking component, so freshness is offered as a sort and
//      called one.
//   3. The explainer never invents. It reads the top hit, its registry row and
//      the parsed query, and where it has nothing it says the query was the
//      only thing it had.
//   4. The pager cannot offer a page that does not exist.

/* -------------------------------------------------------------- verticals */

type Vertical = {
  id: string
  label: string
  icon: LucideIcon
  /** Where it goes, or null for the strip's own two in-place modes. */
  to: string | null
  /** Whether that surface accepts `?q=` — checked against its validateSearch. */
  carries?: boolean
  what: string
}

/**
 * The strip above the scope chips: which index, not which slice of this one.
 *
 * The row below it stays what it was — All / Characters / Your chats /
 * External / Inframe / Oframe, the kinds of document inside this index. Two
 * rows that both filtered the same corpus would be one row too many; these
 * two answer different questions, so both earn their line.
 */
export const VERTICALS: Vertical[] = [
  { id: 'ai', label: 'AI Mode', icon: Sparkles, to: null, what: 'Hand the same words to AlgorithmClaw and get scenarios instead of matches.' },
  { id: 'all', label: 'All', icon: Layers, to: null, what: 'Everything in this index: characters, your own chats, and systems hosted elsewhere.' },
  { id: 'discover', label: 'Discover', icon: Compass, to: null, what: 'The encyclopedia half — what this query is, described from the rows that matched it and from the hosts behind them. Stops short on purpose.' },
  { id: 'video', label: 'Video', icon: Play, to: '/cvv', carries: true, what: 'CharacterVerse Video — channels and uploads.' },
  { id: 'agents', label: 'Agents', icon: Bot, to: '/caz/browse', carries: true, what: 'The Agent Zone — autonomous agents and their bulletins.' },
  { id: 'gigs', label: 'Gigs', icon: Briefcase, to: '/cvj', carries: true, what: 'CharacterVerse Jobs — gigs, sellers and orders.' },
  { id: 'wall', label: 'Wall', icon: MessageCircle, to: '/social/browse', carries: true, what: 'The Wall — people, handles and bulletins.' },
]

/** The overflow. Same rule: real routes, and honest about the query. */
export const MORE_VERTICALS: Vertical[] = [
  { id: 'ask', label: 'Ask', icon: Sparkles, to: '/ask', carries: true, what: 'Put the question to a model instead of the index.' },
  { id: 'art', label: 'Art', icon: Palette, to: '/art', what: 'The Art Studio and gallery. Browse only — it has no query field to hand to.' },
  // Renamed from "Discover", which now means the encyclopedia mode in the strip
  // above. Two different things called Discover one row apart is a worse
  // problem than a duller label on the older one.
  { id: 'grid', label: 'Character grid', icon: Compass, to: '/discover', what: 'The character discovery grid, browsable by category.' },
  { id: 'codex', label: 'Codex', icon: Library, to: '/codex', what: 'The written record: lore, entries and references.' },
]

export function verticalHref(v: Vertical, query: string): string {
  if (!v.to) return '#'
  return v.carries && query.trim() ? `${v.to}?q=${encodeURIComponent(query.trim())}` : v.to
}

/* ------------------------------------------------------------------ menus */

function MenuShell({
  label,
  icon: Icon,
  open,
  onToggle,
  onClose,
  children,
  width = 232,
}: {
  label: string
  icon?: LucideIcon
  open: boolean
  onToggle: () => void
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  // autoFocus off: these menus sit inches under a live search box, and moving
  // focus out of it to open one would take the caret with it.
  const panel = useDismissable<HTMLDivElement>(onClose, false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className="cvsc-vert"
        data-active={open ? '' : undefined}
      >
        {Icon && <Icon size={12} />} {label}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div ref={panel} role="menu" aria-label={label} className="cvsc-menu" style={{ width }}>
          {children}
        </div>
      )}
    </div>
  )
}

function MenuLink({ v, query }: { v: Vertical; query: string }) {
  return (
    <a role="menuitem" href={verticalHref(v, query)} className="cvsc-item">
      <v.icon size={13} />
      <span style={{ flex: 1 }}>
        {v.label}
        <span className="cvsc-item-note">{v.what}</span>
      </span>
      {v.carries && query.trim() ? (
        <span className="cvsc-carry" title={`The query is carried to ${v.to}`}>carries “{query.trim().slice(0, 18)}”</span>
      ) : (
        <ChevronRight size={12} style={{ opacity: 0.5 }} />
      )}
    </a>
  )
}

/* ------------------------------------------------------------------ tools */

export type SortMode = 'rank' | 'fresh' | 'demand'

export const SORTS: { id: SortMode; label: string; what: string }[] = [
  { id: 'rank', label: 'Best match', what: 'The engine’s own order — all four components blended.' },
  { id: 'fresh', label: 'Newest first', what: 'By the freshness component alone.' },
  { id: 'demand', label: 'Most opened', what: 'By measured demand alone.' },
]

export const PAGE_SIZES = [10, 20, 0] as const

/** Re-order a page without re-running it. The engine's score is still shown. */
export function applySort(hits: IndexHit[], sort: SortMode): IndexHit[] {
  if (sort === 'rank') return hits
  const key = sort === 'fresh' ? 'freshness' : 'demand'
  return [...hits].sort((a, b) => b.breakdown[key] - a.breakdown[key] || b.score - a.score)
}

/* ---------------------------------------------------------- the top strip */

/**
 * The three modes the strip switches in place rather than navigating to.
 *
 * They are mutually exclusive because they are three answers to one query and
 * stacking them would put an encyclopedia article, a scenario list and a result
 * list on one screen, each pushing the others off it.
 */
export type StripMode = 'all' | 'ai' | 'discover'

export function VerticalStrip({
  query,
  mode,
  onMode,
  sort,
  onSort,
  pageSize,
  onPageSize,
  stats,
  onAdvanced,
}: {
  query: string
  mode: StripMode
  onMode: (next: StripMode) => void
  sort: SortMode
  onSort: (s: SortMode) => void
  pageSize: number
  onPageSize: (n: number) => void
  stats: SearchModel['result_stats'] | undefined
  onAdvanced: () => void
}) {
  const [menu, setMenu] = useState<'more' | 'tools' | null>(null)
  const close = () => setMenu(null)

  return (
    <div className="cvsc-strip">
      {VERTICALS.map((v) => {
        if (!v.to) {
          const active = mode === v.id
          return (
            <button
              key={v.id}
              type="button"
              title={v.what}
              onClick={() => onMode(v.id as StripMode)}
              aria-pressed={active}
              className="cvsc-vert"
              data-active={active ? '' : undefined}
            >
              <v.icon size={12} /> {v.label}
            </button>
          )
        }
        return (
          <a key={v.id} href={verticalHref(v, query)} title={v.what} className="cvsc-vert">
            <v.icon size={12} /> {v.label}
          </a>
        )
      })}

      <MenuShell label="More" open={menu === 'more'} onToggle={() => setMenu(menu === 'more' ? null : 'more')} onClose={close} width={290}>
        <p className="cvsc-menu-head">Other indexes on the platform</p>
        {MORE_VERTICALS.map((v) => <MenuLink key={v.id} v={v} query={query} />)}
        <p className="cvsc-menu-foot">
          A surface that has no query field of its own is listed as a destination rather than pretending to search.
        </p>
      </MenuShell>

      <MenuShell label="Tools" icon={SlidersHorizontal} open={menu === 'tools'} onToggle={() => setMenu(menu === 'tools' ? null : 'tools')} onClose={close} width={278}>
        <p className="cvsc-menu-head">Sort</p>
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="menuitemradio"
            aria-checked={sort === s.id}
            onClick={() => { onSort(s.id); close() }}
            className="cvsc-item"
            data-on={sort === s.id ? '' : undefined}
          >
            <BadgeCheck size={13} style={{ opacity: sort === s.id ? 1 : 0.25 }} />
            <span style={{ flex: 1 }}>
              {s.label}
              <span className="cvsc-item-note">{s.what}</span>
            </span>
          </button>
        ))}

        <p className="cvsc-menu-head">Results per page</p>
        <div style={{ display: 'flex', gap: 6, padding: '2px 11px 8px' }}>
          {PAGE_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              role="menuitemradio"
              aria-checked={pageSize === n}
              onClick={() => { onPageSize(n); close() }}
              className="cvsc-pill"
              data-on={pageSize === n ? '' : undefined}
            >
              {n === 0 ? 'All' : n}
            </button>
          ))}
        </div>

        <button type="button" role="menuitem" onClick={() => { onAdvanced(); close() }} className="cvsc-item">
          <Search size={13} />
          <span style={{ flex: 1 }}>
            Advanced search
            <span className="cvsc-item-note">Build the operators from fields instead of typing them.</span>
          </span>
        </button>

        <p className="cvsc-menu-foot">
          {stats
            ? `About ${stats.matched} result${stats.matched === 1 ? '' : 's'} (${(stats.took_ms / 1000).toFixed(2)}s) · ${stats.scanned} documents scored`
            : 'No query has run yet.'}
          <br />
          There is no date range: an indexed document carries an ordinal, not a timestamp, so freshness is offered as a
          sort and not as a filter.
        </p>
      </MenuShell>
    </div>
  )
}

/* -------------------------------------------------------- advanced search */

const KINDS = [
  { op: '', label: 'Anything' },
  { op: 'is:character', label: 'Characters' },
  { op: 'is:thread', label: 'Your chats' },
  { op: 'is:external', label: 'Hosted elsewhere' },
  { op: 'is:internal', label: 'Hosted here' },
]

const ATTACH = [
  { op: '', label: 'Either' },
  { op: 'frame:inframe', label: 'Embeds in a tab' },
  { op: 'frame:oframe', label: 'Hands off to its own site' },
]

export function AdvancedSearch({ onRun, onClose }: { onRun: (q: string) => void; onClose: () => void }) {
  const panel = useDismissable<HTMLDivElement>(onClose)
  const [words, setWords] = useState('')
  const [phrase, setPhrase] = useState('')
  const [site, setSite] = useState('')
  const [kind, setKind] = useState('')
  const [attach, setAttach] = useState('')

  // The preview is the actual string that will be submitted, not a description
  // of it. Somebody who uses this form twice should be able to stop using it.
  const built = useMemo(
    () =>
      [words.trim(), phrase.trim() ? `"${phrase.trim().replace(/"/g, '')}"` : '', site.trim() ? `site:${site.trim()}` : '', kind, attach]
        .filter(Boolean)
        .join(' ')
        .trim(),
    [words, phrase, site, kind, attach],
  )

  return (
    <div ref={panel} className="cvsc-adv" role="dialog" aria-label="Advanced search">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={13} color="var(--accent-light)" />
        <strong style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>Advanced search</strong>
        <button type="button" onClick={onClose} className="cvsc-adv-x" aria-label="Close advanced search">Close</button>
      </div>

      <label className="cvsc-field">
        <span>All these words</span>
        <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="tactical strategist" />
      </label>
      <label className="cvsc-field">
        <span>This exact phrase</span>
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="argues back" />
      </label>
      <label className="cvsc-field">
        <span>From this host</span>
        <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="gemini.google.com" />
      </label>
      <label className="cvsc-field">
        <span>Kind</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k.label} value={k.op}>{k.label}</option>)}
        </select>
      </label>
      <label className="cvsc-field">
        <span>How it attaches</span>
        <select value={attach} onChange={(e) => setAttach(e.target.value)}>
          {ATTACH.map((a) => <option key={a.label} value={a.op}>{a.label}</option>)}
        </select>
      </label>

      <div className="cvsc-adv-prev">
        <span>Runs as</span>
        <code>{built || 'nothing yet'}</code>
      </div>

      <p className="cvsc-menu-foot" style={{ padding: 0 }}>
        There is no “none of these words”: the kernel has no negation operator, and a field that quietly did nothing
        would be worse than a missing one. An exact phrase is a hard filter — a near miss is dropped, not ranked lower.
      </p>

      <button type="button" disabled={!built} onClick={() => { onRun(built); onClose() }} className="cvsc-adv-go">
        Search
      </button>
    </div>
  )
}

/* -------------------------------------------------------- the sponsored slot */

export function SponsoredSlot({
  model,
  onOpen,
}: {
  model: SearchModel
  onOpen: (hit: IndexHit, rank: number) => void
}) {
  const [why, setWhy] = useState(false)
  const rows = model.sponsored || []
  if (!rows.length) return null

  return (
    <section className="cvsc-ads" aria-label="Sponsored results">
      <div className="cvsc-ads-head">
        <span className="cvsc-ads-tag">Sponsored</span>
        <span className="cvsc-ads-sub">
          {rows.length === 1 ? 'One publisher paid' : `${rows.length} publishers paid`} for this position. It still had
          to match what you typed.
        </span>
        <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className="cvsc-ads-why">
          <Info size={11} /> Why this is here
        </button>
      </div>

      {why && (
        <ul className="cvsc-ads-rules">
          {(model.search_engine.sponsorship?.rules || []).map((r) => <li key={r}>{r}</li>)}
          <li>
            Sold for CVC at {((model.search_engine.sponsorship?.rate_milli_per_day || 0) / 1000).toFixed(2)} a day.{' '}
            <a href="/search/add">Promote an entry you published</a>.
          </li>
        </ul>
      )}

      {rows.map((hit, i) => (
        <article key={hit.ref} className="cvsc-ad">
          <div className="cvsc-ad-top">
            <span aria-hidden style={{ fontSize: 14 }}>{hit.icon}</span>
            <span className="cvsc-ad-host">{hit.host}</span>
            <span className="cvsc-ad-flag">Ad</span>
          </div>
          <button type="button" onClick={() => onOpen(hit, i + 1)} className="cvsc-ad-title">{hit.title}</button>
          <p className="cvsc-ad-body">
            {hit.sponsorNote ? (
              <span className="cvsc-ad-note">{hit.sponsorNote}</span>
            ) : (
              hit.subtitle && <span style={{ color: 'var(--text-primary)' }}>{hit.subtitle} — </span>
            )}
            {hit.snippet}
          </p>
          <span className="cvsc-ad-foot">
            {hit.matched.length
              ? `Matched ${hit.matched.slice(0, 4).join(', ')} · scored ${hit.score} by the same kernel as the rows below`
              : `Scored ${hit.score} by the same kernel as the rows below`}
          </span>
        </article>
      ))}
    </section>
  )
}

/* ------------------------------------------------------- the side explainer */

const STORE_KEY = 'cv_search_explainer'

function factRows(hit: IndexHit, entry: IndexEntry | null): { k: string; v: string }[] {
  const out: { k: string; v: string }[] = []
  const kind =
    hit.kind === 'character' ? 'Character' : hit.kind === 'thread' ? 'Your conversation' : 'AI system, hosted elsewhere'
  out.push({ k: 'Kind', v: kind })
  if (hit.category) out.push({ k: 'Category', v: hit.category })
  if (hit.frame) {
    const f = FRAMES[hit.frame as FrameId]
    if (f) out.push({ k: 'Attaches', v: `${f.label} — ${f.behaviour}` })
  }
  if (hit.kind === 'external') out.push({ k: 'Host', v: hit.host })
  if (entry?.provider) out.push({ k: 'Publisher', v: entry.provider })
  if (entry) out.push({ k: 'Opens', v: `${entry.demand.opens} of ${entry.demand.impressions} impressions` })
  if (hit.tags.length) out.push({ k: 'Tags', v: hit.tags.slice(0, 6).join(', ') })
  return out
}

/**
 * The rail's explainer — what the thing at the top of the page actually is,
 * and what the engine made of the words you typed.
 *
 * Two panels, because there are two different questions and only one of them
 * always has an answer. The subject panel needs a top hit; the query panel
 * needs only the query, so it is the one that is always there. Neither
 * fabricates: every line is a field that was already on the page somewhere,
 * gathered into one place rather than invented for it.
 */
export function SearchExplainer({
  model,
  hit,
  entry,
  onRun,
}: {
  model: SearchModel
  hit: IndexHit | null
  entry: IndexEntry | null
  onRun: (q: string) => void
}) {
  const [open, setOpen] = useState(true)
  const [ready, setReady] = useState(false)

  // Read the remembered state after mount: the server has no localStorage, and
  // rendering "collapsed" on the server for a reader who has it open would
  // flash the panel shut on every page load.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE_KEY)
      if (saved === 'closed') setOpen(false)
    } catch { /* private mode — the default stands */ }
    setReady(true)
  }, [])

  const toggle = () => {
    setOpen((v) => {
      try { window.localStorage.setItem(STORE_KEY, v ? 'closed' : 'open') } catch { /* nothing to remember with */ }
      return !v
    })
  }

  const q = model.search_engine.current_query
  const filters = q.filters
  const named = [
    filters.scope && filters.scope !== 'all' ? `is:${filters.scope}` : '',
    filters.frame ? `frame:${filters.frame}` : '',
    filters.site ? `site:${filters.site}` : '',
  ].filter(Boolean)

  return (
    <section className="cvsc-exp" aria-label="About these results" data-ready={ready ? '' : undefined}>
      <button type="button" onClick={toggle} aria-expanded={open} className="cvsc-exp-head">
        <Info size={13} color="var(--accent-light)" />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {hit ? hit.title : 'About this search'}
          <span className="cvsc-exp-kind">
            {hit
              ? hit.kind === 'character'
                ? `Character in CharacterVerse${hit.category ? ` · ${hit.category}` : ''}`
                : hit.kind === 'thread'
                  ? 'A conversation of your own'
                  : `AI system at ${hit.host}`
              : 'What the engine made of your words'}
          </span>
        </span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div className="cvsc-exp-body">
          {hit && (
            <>
              <p className="cvsc-exp-lede">
                {entry?.description || hit.snippet}
              </p>
              <div className="cvsc-exp-facts">
                {factRows(hit, entry).map((f) => (
                  <div key={f.k}>
                    <span>{f.k}</span>
                    <span>{f.v}</span>
                  </div>
                ))}
              </div>
              <p className="cvsc-exp-src">
                Source:{' '}
                {hit.url.startsWith('/') ? (
                  <a href={hit.url}>this index — characterverse{hit.url}</a>
                ) : (
                  <a href={hit.url} target="_blank" rel="noopener noreferrer nofollow">{hit.host}</a>
                )}
                {hit.kind === 'external' && ' · registered by its publisher, not written by us'}
              </p>
            </>
          )}

          <div className="cvsc-exp-sep" />

          <p className="cvsc-exp-label">This search</p>
          <div className="cvsc-exp-facts">
            <div><span>Read as</span><span>{q.terms.length ? q.terms.join(' · ') : 'no terms — a browse, ranked on demand'}</span></div>
            {q.phrases.length > 0 && <div><span>Exact phrase</span><span>“{q.phrases.join('”, “')}” — a miss is dropped, not ranked lower</span></div>}
            {named.length > 0 && <div><span>Filters</span><span>{named.join(' · ')}</span></div>}
            <div><span>Legibility</span><span>{q.clarity}/100 — how readable the query was, not how good</span></div>
            <div><span>Scored</span><span>{model.result_stats?.scanned ?? model.retrieval.scanned} of {model.retrieval.corpus.total} documents</span></div>
            <div><span>Ranker</span><span>{model.ranker_context.state === 'cold_start' ? 'cold — ranking on text and demand, not on you' : 'warm'}</span></div>
          </div>

          {q.fan_out.length > 0 && (
            <>
              <p className="cvsc-exp-label">It also looked for</p>
              <div className="cvsc-exp-fan">
                {q.fan_out.filter((b) => b.terms.length).map((b) => (
                  <button key={b.intent + b.terms.join()} type="button" onClick={() => onRun(b.terms.join(' '))} title={b.note}>
                    {b.terms.slice(0, 3).join(' ')} <span>{Math.round(b.weight * 100)}%</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="cvsc-exp-label">Operators</p>
          <div className="cvsc-exp-ops">
            {(model.search_engine.operators || OPERATORS).map((o) => (
              <div key={o.op}><code>{o.op}</code> {o.means}</div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- the pager */

/* ------------------------------------------------------------- the pager */

/** Rings on screen at once. Ten is the reference design's own ceiling. */
const PAGE_WINDOW = 10

/**
 * Rings on screen on a phone.
 *
 * Eight, because eight pages is the row the design was drawn against and a
 * phone should not be the one screen that cannot show it. Ten does not fit —
 * ten rings plus the wordmark plus Previous/Next is about 450px of row against
 * 390 of phone — and the two buttons that actually do the paging were never
 * the things to cut.
 */
const PAGE_WINDOW_NARROW = 8

/** The breakpoint the pager's own narrow styles use. Kept in step by hand. */
const NARROW = '(max-width: 560px)'

/**
 * The column the current ring is held in once the window starts sliding.
 *
 * Six of ten, not five. Five would be the true centre and is the wrong answer:
 * it puts four pages behind you and five ahead, and a pager is a thing you read
 * forwards. The reference holds page 10 in the sixth column of 5–14, which is
 * five behind and four ahead, and that asymmetry is deliberate — hence
 * `floor(n / 2) + 1` rather than a centre.
 */
function pageHold(size: number): number {
  return Math.floor(size / 2) + 1
}

/**
 * How many rings this screen can hold.
 *
 * Starts at the desktop count on both server and client so the first client
 * render matches the HTML it is hydrating, then narrows on mount if the media
 * query says so. The correction costs four rings on a phone and nothing
 * anywhere else.
 */
function useWindowSize(): number {
  const [size, setSize] = useState(PAGE_WINDOW)
  useEffect(() => {
    const mq = globalThis.matchMedia?.(NARROW)
    if (!mq) return
    const sync = () => setSize(mq.matches ? PAGE_WINDOW_NARROW : PAGE_WINDOW)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return size
}

/**
 * Which pages get a ring.
 *
 * Near the start the window is simply 1..n, so an eight-page result renders
 * 1..8 with no sliding at all. Past the hold column it slides to keep the
 * current page in that column, and it pins at the end rather than running off
 * it — a window whose last column is page 23 of 20 is three rings that go
 * nowhere.
 */
function pageWindow(page: number, pages: number, size: number): number[] {
  const last = Math.max(1, pages - size + 1)
  const start = Math.min(Math.max(1, page - (pageHold(size) - 1)), last)
  const count = Math.min(size, pages - start + 1)
  return Array.from({ length: count }, (_, i) => start + i)
}

/**
 * The pager.
 *
 * One ring per page with the brand spelled across them and the current ring
 * picked out in lilac — the reference design's shape in our own palette, grey
 * word, purple rings. Five things it has to get right:
 *
 *   1. **One ring per page, number underneath its own ring.** The three lines
 *      share one CSS grid, so the ring over page 12 is over the 12 and not
 *      merely near it. A flex row of text would drift the moment the numbers
 *      went double-digit, which is exactly when a reader starts needing them.
 *   2. **A window, not the whole set.** Ten rings at most, eight on a phone,
 *      so page 40 of 200 is still a wordmark rather than a paragraph.
 *   3. **Both step columns are always there,** empty when the step does not
 *      exist. The reference lets the wordmark slide left on page 1; holding the
 *      columns keeps it centred on every page, which is the whole point of
 *      spelling something with it.
 *   4. **The current page is not a link.** It is where you already are, and it
 *      is marked by weight and `aria-current` as well as by colour — a state
 *      told only in lilac is a state some readers are not told at all.
 *   5. **The chevrons step too.** They sit against the wordmark for looks, but
 *      a thing that looks like a next button gets clicked like one, so each is
 *      wired to the step in the column below it. They stay out of the
 *      accessibility tree — `aria-hidden` and untabbable — because the labelled
 *      button directly underneath is the same action, and two focus stops onto
 *      one destination is a worse row than one.
 */
export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (n: number) => void
}) {
  const size = useWindowSize()
  if (pages <= 1) return null

  const window_ = pageWindow(page, pages, size)
  const hasPrev = page > 1
  const hasNext = page < pages

  // The brand, stretched over two lines: "Character" sits above, and "V" + one
  // e per page + "rse" is the line that grows. Two lines rather than one
  // because the stretched half is the only half that changes width, and a
  // wordmark that slides sideways as you page is a wordmark you stop reading.
  // It has to be the e — "CharacterVooorse" spells vorse.
  const title = 'Character'
  const prefix = 'V'
  const ring = 'e'
  const suffix = 'rse'

  return (
    <nav
      className="cvsc-pager"
      aria-label={`Result pages, ${pages} in total`}
      style={{ ['--cvsc-rings' as string]: window_.length }}
    >
      {/* Row 1: the half of the name that does not stretch, centred over the
          half that does. */}
      <span className="cvsc-pager-title" aria-hidden>
        <span>{title}</span>
      </span>

      {/* Row 2: the stretched line. aria-hidden throughout — every glyph here
          is decoration over a number that is already announced below it, and a
          screen reader that read this row would spell "V e e e e e r s e"
          before reaching a single page. */}
      <span className="cvsc-pager-step-glyph cvsc-pager-prev" aria-hidden>
        {hasPrev && (
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            className="cvsc-pager-chev"
            tabIndex={-1}
          >
            <ChevronLeft size={17} />
          </button>
        )}
      </span>
      <span className="cvsc-pager-word" aria-hidden>{prefix}</span>
      {window_.map((n) => (
        <span key={n} className="cvsc-pager-ring" data-on={n === page ? '' : undefined} aria-hidden>
          {ring}
        </span>
      ))}
      <span className="cvsc-pager-word" aria-hidden>{suffix}</span>
      <span className="cvsc-pager-step-glyph cvsc-pager-next" aria-hidden>
        {hasNext && (
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            className="cvsc-pager-chev"
            tabIndex={-1}
          >
            <ChevronRight size={17} />
          </button>
        )}
      </span>

      {/* Row 3: the numbers, each in the column of its own ring. */}
      <span className="cvsc-pager-step-cell cvsc-pager-prev">
        {hasPrev && (
          <button type="button" onClick={() => onPage(page - 1)} className="cvsc-pager-step">
            Previous
          </button>
        )}
      </span>
      <span className="cvsc-pager-gap" aria-hidden />
      {window_.map((n) =>
        n === page ? (
          <span key={n} className="cvsc-pager-n" data-on="" aria-current="page">
            {n}
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            className="cvsc-pager-n"
            aria-label={`Page ${n} of ${pages}`}
          >
            {n}
          </button>
        ),
      )}
      <span className="cvsc-pager-gap" aria-hidden />
      <span className="cvsc-pager-step-cell cvsc-pager-next">
        {hasNext && (
          <button type="button" onClick={() => onPage(page + 1)} className="cvsc-pager-step">
            Next
          </button>
        )}
      </span>
    </nav>
  )
}

/* -------------------------------------------------------------- the footer */

/**
 * The footer explainer.
 *
 * The reference page's footer explains the result set — personalisation,
 * location, and the four links. Ours explains the two things a reader here
 * would actually want to know: whether the ranking was about them, and what
 * was recorded about the visit. Both are read from the model, so the footer
 * cannot claim a state the engine is not in.
 */
export function ResultsFooter({
  model,
  sort,
  onWhy,
}: {
  model: SearchModel
  sort: SortMode
  onWhy: () => void
}) {
  const stats = model.result_stats
  const cold = model.ranker_context.state === 'cold_start'
  const sortLabel = SORTS.find((s) => s.id === sort)?.label ?? 'Best match'

  return (
    <footer className="cvsc-foot">
      <p>
        {cold
          ? 'These results are not personalised. '
          : 'The rail personalises; this box does not. '}
        Ranked on the text, the axis read, measured demand and freshness — in that blend, on that corpus.{' '}
        <button type="button" onClick={onWhy}>Why these results</button>
      </p>

      {stats && (
        <p className="cvsc-foot-stats">
          About {stats.matched} result{stats.matched === 1 ? '' : 's'} · {stats.returned} returned ·{' '}
          {stats.scanned} documents scored in {(stats.took_ms / 1000).toFixed(2)}s · sorted by {sortLabel.toLowerCase()}
          {stats.sponsored > 0 && ` · ${stats.sponsored} sponsored`}
          {stats.capped && ' · the tail beyond the first 40 was not returned, so no page claims to hold it'}
        </p>
      )}

      <p className="cvsc-foot-stats">
        Every impression, open and dismissal on this page was recorded, including the ones that went nowhere.
        Nothing said on the other side of a hand-off is ours to keep, so none of it is here.
      </p>

      <div className="cvsc-foot-links">
        <a href="/mission">About</a>
        <a href="/charter">Robots Charter</a>
        <a href="/audit">What is recorded</a>
        <a href="/bounties">Report a defect</a>
        <a href="/search/add">Add to the index</a>
      </div>
    </footer>
  )
}
