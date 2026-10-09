// CharacterVerse Search — the AI chat search index.
//
// This is the retrieval half of SAA AlgorithmClaw. The skyscraper on the right of
// the workspace asks "what should I chat with next"; this asks "what is out there
// that matches these words". Same engine, two questions, and they are deliberately
// different questions: the rail ranks against your chat history, the index ranks
// against the text of the corpus. A search box that quietly re-ranked on taste
// would stop being a search box.
//
// Modeled off a web search engine, because that is the shape the problem has:
//
//   1. INGESTION   three document kinds land in one corpus — public characters,
//                  the searcher's own conversation threads, and external AI
//                  systems registered into the index by anyone.
//   2. PARSE       operators, quoted phrases, and an axis read of the rest. One
//                  query fans out into several subqueries with different intents.
//   3. RETRIEVAL   real BM25 over the corpus for precision on rare words, plus an
//                  axis-overlap score for the "vibes" a keyword match would miss.
//   4. RERANK      demand. An entry people actually open outranks one that only
//                  matched — and an embed that keeps getting refused by its own
//                  host is pushed down, because a result you cannot open is not
//                  a result.
//   5. SERVE       every hit carries the breakdown that produced it. No hidden
//                  score anywhere in this file.
//
// Pure: no database, no DOM, no clock, no Math.random. Same corpus and same query
// produce the same page of results on the server and on the client, which is what
// makes a ranking auditable after the fact instead of a thing that happened once.
//
// One honest limitation, stated here rather than buried: the "semantic" half is
// axis-lexicon overlap — the eight vibe axes AlgorithmClaw already uses — not a
// learned embedding. Nothing in this file calls an embedding model and nothing
// stores a vector. It is a hand-built taxonomy doing a small part of an
// embedding's job, and it is named `semantic` in the breakdown because that is
// the slot it fills, not because there is a vector behind it.

import { AXES, clamp, hash, jitter, readVibe, tokenize, type AxisId, type VibeRead } from './algorithmclaw'

/* ------------------------------------------------------------------ frames */

export type FrameId = 'inframe' | 'oframe'

/**
 * The two ways an external AI system can be attached to the workspace.
 *
 * This is the whole reason the index exists. CharacterVerse hosts the search
 * protocol, but the systems it indexes are hosted elsewhere, and there are only
 * two honest things you can do with something you do not host: embed it, or send
 * the person to it.
 */
export const FRAMES: Record<FrameId, {
  id: FrameId
  label: string
  /** What a tab of this kind does when it is opened. */
  verb: 'directs' | 'redirects'
  short: string
  blurb: string
  /** What the workspace tab strip does with it. */
  behaviour: string
}> = {
  inframe: {
    id: 'inframe',
    label: 'Inframe',
    verb: 'directs',
    short: 'Embedded tab',
    blurb: 'Runs inside the workspace in a sandboxed frame. The tab strip keeps it.',
    behaviour:
      'Opening it DIRECTS: a new tab appears in the strip and the external system renders inside it, sandboxed, beside your chats. You never leave CharacterVerse. Hosts that refuse to be embedded are recorded as blocked and offered as a redirect instead.',
  },
  oframe: {
    id: 'oframe',
    label: 'Oframe',
    verb: 'redirects',
    short: 'Hand-off tab',
    blurb: 'Hands off to the system in a new browser tab. Nothing is embedded.',
    behaviour:
      'Opening it REDIRECTS: the browser opens the external system in its own tab and CharacterVerse stays where it was. The index still counts the hand-off, so demand is measured even though the session continues somewhere we do not host.',
  },
}

export function coerceFrame(value: unknown): FrameId {
  return value === 'inframe' ? 'inframe' : 'oframe'
}

/* ------------------------------------------------------------- the corpus */

export type DocKind = 'character' | 'thread' | 'external'

/** Open/dismiss counters. The rerank reads these and nothing else. */
export type Demand = {
  impressions: number
  opens: number
  dismissals: number
  /** Inframe loads the host refused. Only ever non-zero for external docs. */
  blocks: number
}

export const NO_DEMAND: Demand = { impressions: 0, opens: 0, dismissals: 0, blocks: 0 }

/**
 * One indexable document.
 *
 * The three kinds are flattened into one shape on purpose. A search engine that
 * keeps its corpora separate has to decide up front which one you meant, and the
 * whole point of a single box is that you do not have to say.
 */
export type SearchDoc = {
  kind: DocKind
  /** Row id within its own kind. */
  id: number
  /** Stable cross-kind key, `kind:id`. Dedupe and telemetry both use it. */
  ref: string
  title: string
  /** Second line — a character's tagline, a thread's character, a system's host. */
  subtitle: string
  /** Where it goes. An internal route, or an absolute URL for external docs. */
  url: string
  /** The breadcrumb line, styled after a result's green URL. */
  host: string
  /** Only external docs carry a frame; '' everywhere else. */
  frame: FrameId | ''
  category: string
  icon: string
  /** The indexed body. Everything lexical scoring reads. */
  text: string
  tags: string[]
  demand: Demand
  /** Any monotonic key — a row id, a max(message id). Never a wall clock. */
  seq: number
}

/* -------------------------------------------------------------- the query */

export type QueryFilters = {
  /** `is:internal` / `is:external` / `is:character` / `is:thread`. */
  scope: 'all' | 'internal' | 'external' | 'character' | 'thread'
  /** `frame:inframe` / `frame:oframe`. */
  frame: FrameId | null
  /** `site:gemini.google.com` — matched as a substring of the host. */
  site: string
}

export type SubQuery = {
  /** What this branch of the fan-out is looking for. */
  intent: 'literal' | 'axis' | 'named' | 'external'
  /** Terms this branch scores with. */
  terms: string[]
  /** Its share of the final lexical score. Sums to 1 across the fan-out. */
  weight: number
  note: string
}

export type ParsedQuery = {
  raw: string
  /** Everything after operators are stripped. */
  body: string
  terms: string[]
  /** "quoted like this" — scored as a unit, and a phrase miss is disqualifying. */
  phrases: string[]
  filters: QueryFilters
  /** The axis read, borrowed wholesale from the rail's kernel. */
  vibe: VibeRead
  /** Names/proper nouns kept with their capitals, before lowercasing. */
  named: string[]
  fanOut: SubQuery[]
  /** 0-100, how legible the query is to the kernel. Not how good it is. */
  clarity: number
}

const OPERATOR = /\b(is|frame|site):([a-z0-9._:-]+)/gi

/**
 * Parse a query the way a search engine does: operators first, then phrases,
 * then whatever is left over as terms.
 *
 * The operators are the ones this corpus can actually answer. `is:external`
 * and `frame:inframe` exist because the interesting question about an indexed
 * AI system is usually not what it does but how it attaches.
 */
export function parseQuery(raw: string): ParsedQuery {
  const input = (raw || '').slice(0, 400)
  const filters: QueryFilters = { scope: 'all', frame: null, site: '' }

  let body = input.replace(OPERATOR, (_m, key: string, value: string) => {
    const k = key.toLowerCase()
    const v = value.toLowerCase()
    if (k === 'is') {
      if (v === 'internal' || v === 'external' || v === 'character' || v === 'thread') filters.scope = v
    } else if (k === 'frame') {
      if (v === 'inframe' || v === 'oframe') filters.frame = v
    } else if (k === 'site') {
      filters.site = v.replace(/^https?:\/\//, '').slice(0, 80)
    }
    return ' '
  })

  const phrases: string[] = []
  body = body.replace(/"([^"]{2,80})"/g, (_m, phrase: string) => {
    phrases.push(phrase.trim().toLowerCase())
    return ' '
  })

  // Capitalised words are kept before the lowercasing tokenizer eats the signal.
  // A character called "Byte" should be findable by typing Byte.
  const named = Array.from(
    new Set(
      (body.match(/\b[A-Z][a-zA-Z'-]{2,}\b/g) || [])
        .map((w) => w.toLowerCase())
        .filter((w) => w.length > 2),
    ),
  ).slice(0, 6)

  body = body.trim()
  const terms = Array.from(new Set(tokenize(body))).slice(0, 24)
  const vibe = readVibe(body)

  /**
   * Query fan-out.
   *
   * One typed line is several questions. "cozy sci-fi gemini" is a literal
   * keyword search, a request for an axis, and the name of an external system,
   * and scoring it as one bag of words answers none of the three well. Each
   * branch scores independently and the weights below decide how much each one
   * counts — derived from what the query actually contains rather than fixed,
   * so a query with no axis words does not pay for an axis branch.
   */
  const fanOut: SubQuery[] = []
  if (terms.length) {
    fanOut.push({
      intent: 'literal',
      terms,
      weight: 1,
      note: 'Exact words, scored with BM25 over the whole corpus.',
    })
  }
  if (vibe.axes.length) {
    fanOut.push({
      intent: 'axis',
      terms: vibe.axes.map((a) => a.id),
      weight: 0.8,
      note: `Vibe axes read from the query: ${vibe.axes.map((a) => a.label).join(', ')}.`,
    })
  }
  if (named.length) {
    fanOut.push({
      intent: 'named',
      terms: named,
      weight: 0.7,
      note: 'Capitalised words, matched against titles before bodies.',
    })
  }
  if (filters.scope === 'external' || filters.frame || filters.site) {
    fanOut.push({
      intent: 'external',
      terms: [filters.site].filter(Boolean),
      weight: 0.5,
      note: 'Restricted to externally hosted systems in the index.',
    })
  }
  const total = fanOut.reduce((s, q) => s + q.weight, 0) || 1
  for (const q of fanOut) q.weight = Math.round((q.weight / total) * 100) / 100

  return {
    raw: input,
    body,
    terms,
    phrases,
    filters,
    vibe,
    named,
    fanOut,
    clarity: clamp(
      Math.round(terms.length * 14 + phrases.length * 12 + vibe.axes.length * 10 + (filters.scope !== 'all' ? 10 : 0)),
      0,
      100,
    ),
  }
}

/* ------------------------------------------------------ lexical scoring */

/** Okapi BM25 term-frequency saturation. */
const K1 = 1.4
/** Okapi BM25 length normalization. */
const B = 0.72

type Posting = { tf: Map<string, number>; len: number; titleTokens: Set<string>; lower: string }

/**
 * Build the inverted index for one query's corpus pass.
 *
 * Rebuilt per search rather than cached, which is the right trade at this corpus
 * size: a few hundred short documents cost less to re-index than a stale index
 * costs to debug, and every document here changes under you — a thread grows a
 * message, an entry's counters move on every impression.
 */
export function buildPostings(docs: SearchDoc[]): {
  postings: Map<string, Posting>
  df: Map<string, number>
  avgLen: number
  n: number
} {
  const postings = new Map<string, Posting>()
  const df = new Map<string, number>()
  let lenSum = 0

  for (const doc of docs) {
    const tokens = tokenize(`${doc.title} ${doc.subtitle} ${doc.text} ${doc.tags.join(' ')} ${doc.category}`)
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1)
    lenSum += tokens.length
    postings.set(doc.ref, {
      tf,
      len: tokens.length,
      titleTokens: new Set(tokenize(`${doc.title} ${doc.subtitle}`)),
      lower: `${doc.title} ${doc.subtitle} ${doc.text} ${doc.tags.join(' ')}`.toLowerCase(),
    })
  }

  return { postings, df, avgLen: docs.length ? lenSum / docs.length : 1, n: docs.length }
}

function idf(df: number, n: number): number {
  return Math.log(1 + (n - df + 0.5) / (df + 0.5))
}

/** BM25 for one term list against one document. Returns the raw sum. */
function bm25(
  terms: string[],
  posting: Posting,
  df: Map<string, number>,
  n: number,
  avgLen: number,
): { score: number; matched: string[] } {
  let score = 0
  const matched: string[] = []
  for (const term of terms) {
    const tf = posting.tf.get(term) || 0
    if (!tf) continue
    matched.push(term)
    const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (posting.len / (avgLen || 1))))
    score += idf(df.get(term) || 0, n || 1) * norm
  }
  return { score, matched }
}

/* ------------------------------------------------- axis (semantic) scoring */

const AXIS_LEXICON: Record<AxisId, Set<string>> = Object.fromEntries(
  AXES.map((a) => [a.id, new Set(a.lexicon)]),
) as Record<AxisId, Set<string>>

/**
 * How strongly one document sits on the axes the query asked for.
 *
 * Counts lexicon hits per axis and weighs them by the query's own axis weights,
 * so "cozy sci-fi" rewards a cozy document more than a merely calm one. This is
 * the part that finds a character whose text never contains the word "cozy".
 */
function axisScore(vibe: VibeRead, posting: Posting): number {
  if (!vibe.axes.length) return 0
  let total = 0
  for (const { id, weight } of vibe.axes) {
    const lexicon = AXIS_LEXICON[id]
    if (!lexicon) continue
    let hits = 0
    for (const [token, tf] of posting.tf) {
      for (const word of lexicon) {
        if (token === word || token.startsWith(word) || word.startsWith(token)) {
          hits += Math.min(tf, 3)
          break
        }
      }
    }
    // Saturating: the tenth "warm" in a document says nothing the third did not.
    total += (weight / 100) * (hits / (hits + 4))
  }
  return total
}

/* --------------------------------------------------------- demand rerank */

/** Smoothing strength for the open rate. Higher = slower to trust a new entry. */
const DEMAND_PRIOR_WEIGHT = 8
/** The open rate a brand-new entry is assumed to have until it earns its own. */
const DEMAND_PRIOR = 0.25

/**
 * Demand — the measured half of the ranking, and the reason this index exists.
 *
 * The whole point of registering externally hosted AI systems here is to find out
 * whether anybody wants them. So the rate is Bayesian-smoothed rather than raw:
 * one open out of one impression is not a 100% open rate, it is one open, and a
 * new entry that got lucky once must not outrank a system with a thousand
 * measured hand-offs. As impressions accumulate the prior washes out and the
 * entry is ranked on its own record.
 *
 * Dismissals count against, and an inframe host that refuses to be embedded
 * counts harder against — a result that cannot open is worse than one nobody
 * wanted, because it wastes the click as well as the slot.
 */
export function demandScore(d: Demand): { rate: number; blocked: number; score: number } {
  const impressions = Math.max(0, d.impressions)
  const opens = Math.max(0, d.opens)
  const dismissals = Math.max(0, d.dismissals)
  const blocks = Math.max(0, d.blocks)

  const rate =
    (opens + DEMAND_PRIOR_WEIGHT * DEMAND_PRIOR) / (impressions + DEMAND_PRIOR_WEIGHT)
  const dismissRate = dismissals / (impressions + DEMAND_PRIOR_WEIGHT)
  const blocked = blocks / (opens + blocks + 1)

  return {
    rate: Math.round(rate * 1000) / 1000,
    blocked: Math.round(blocked * 1000) / 1000,
    score: clamp(rate - dismissRate * 0.5 - blocked * 0.6, 0, 1),
  }
}

/* ---------------------------------------------------------------- serving */

export type HitBreakdown = {
  /** BM25 across the fan-out, normalized against the best hit on the page. */
  lexical: number
  /** Axis overlap with the query's vibe read. */
  semantic: number
  /** Smoothed open rate, penalised by dismissals and refused embeds. */
  demand: number
  /** Corpus position — a newer thread or entry breaks an otherwise exact tie. */
  freshness: number
}

export type SearchHit = {
  ref: string
  kind: DocKind
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
  /** 0-100, for display. Relative to the best hit on this page, never absolute. */
  score: number
  breakdown: HitBreakdown
  matched: string[]
  /** One line naming the strongest reason this result is here. */
  why: string
}

/** Blend weights. They sum to 1, and the results page prints them. */
export const BLEND = {
  lexical: 0.52,
  semantic: 0.24,
  demand: 0.18,
  freshness: 0.06,
} as const

function passesFilters(doc: SearchDoc, f: QueryFilters): boolean {
  if (f.scope === 'internal' && doc.kind === 'external') return false
  if (f.scope === 'external' && doc.kind !== 'external') return false
  if (f.scope === 'character' && doc.kind !== 'character') return false
  if (f.scope === 'thread' && doc.kind !== 'thread') return false
  if (f.frame && doc.frame !== f.frame) return false
  if (f.site && !doc.host.toLowerCase().includes(f.site)) return false
  return true
}

/** A snippet centred on the first matched term, the way a result snippet is. */
function snippetFor(doc: SearchDoc, matched: string[]): string {
  const text = (doc.text || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const needle = matched[0]
  const at = needle ? text.toLowerCase().indexOf(needle) : -1
  if (at < 0) return text.slice(0, 190)
  const start = Math.max(0, at - 70)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 200).trim()}${start + 200 < text.length ? '…' : ''}`
}

function whyFor(b: HitBreakdown, doc: SearchDoc, matched: string[]): string {
  const parts: [number, string][] = [
    [b.lexical, matched.length ? `Matched ${matched.slice(0, 3).join(', ')}` : 'Matched the query text'],
    [b.semantic, 'Sits on the vibe the query asked for'],
    [b.demand, doc.kind === 'external' ? 'People open this one' : 'Opened often from search'],
    [b.freshness, 'Recently active in the corpus'],
  ]
  parts.sort((x, y) => y[0] - x[0])
  return parts[0][1]
}

export type SearchPage = {
  query: ParsedQuery
  hits: SearchHit[]
  /** Counts before the page was cut, per kind. Drives the filter chips. */
  facets: { all: number; character: number; thread: number; external: number; inframe: number; oframe: number }
  /** How many documents the retrieval stage actually scored. */
  scanned: number
  /** Deterministic, stored, replayable. */
  seed: string
}

/**
 * The most rows one search will ever return.
 *
 * Eighty because the results page pages at ten and its pager spells the brand
 * with one ring per page — eight rings is the row the design was drawn against,
 * so eighty is the number of rows that has to exist for it to be honest. The
 * ceiling is here rather than at the call site so no caller can quietly ask for
 * a deeper tail than the ranker is willing to stand behind.
 */
export const MAX_RESULTS = 80

/**
 * Run a search.
 *
 * `seed` only breaks ties — two documents that score identically are ordered by
 * a hash rather than by row id, so the fourth result is not permanently the same
 * document just because it was created first. Deterministic, so the same seed
 * replays the same page.
 */
export function search(input: {
  docs: SearchDoc[]
  query: string
  seed?: string
  limit?: number
}): SearchPage {
  const query = parseQuery(input.query)
  const seed = input.seed || String(hash(query.raw.toLowerCase()))
  const limit = Math.max(1, Math.min(input.limit || 24, MAX_RESULTS))

  const eligible = input.docs.filter((d) => passesFilters(d, query.filters))
  const facets = {
    all: eligible.length,
    character: eligible.filter((d) => d.kind === 'character').length,
    thread: eligible.filter((d) => d.kind === 'thread').length,
    external: eligible.filter((d) => d.kind === 'external').length,
    inframe: eligible.filter((d) => d.frame === 'inframe').length,
    oframe: eligible.filter((d) => d.frame === 'oframe').length,
  }

  // An empty query is a browse, not a search: rank by demand alone so the tile
  // row and the "everything in the index" view are ordered by what gets used.
  const browsing = !query.terms.length && !query.phrases.length && !query.named.length

  const { postings, df, avgLen, n } = buildPostings(eligible)
  const maxSeq = eligible.reduce((m, d) => Math.max(m, d.seq), 0) || 1

  type Raw = { doc: SearchDoc; lexical: number; semantic: number; demand: number; freshness: number; matched: string[] }
  const raw: Raw[] = []

  for (const doc of eligible) {
    const posting = postings.get(doc.ref)
    if (!posting) continue

    // A quoted phrase is a hard filter, not a boost. Someone who typed quotes
    // asked for that string, and a "close enough" result is a wrong answer.
    if (query.phrases.length && !query.phrases.every((p) => posting.lower.includes(p))) continue

    let lexical = 0
    const matched = new Set<string>()
    for (const branch of query.fanOut) {
      if (branch.intent === 'axis' || !branch.terms.length) continue
      const { score, matched: hits } = bm25(branch.terms, posting, df, n, avgLen)
      let branchScore = score
      // A named-branch hit in the title is worth more than one in the body —
      // typing a name means you want the thing with that name.
      if (branch.intent === 'named') {
        const inTitle = branch.terms.filter((t) => posting.titleTokens.has(t)).length
        branchScore += inTitle * 1.5
      }
      lexical += branch.weight * branchScore
      for (const h of hits) matched.add(h)
    }
    // Phrase matches carry their own weight once the filter above has passed.
    lexical += query.phrases.length * 2.5

    const semantic = axisScore(query.vibe, posting)
    const demand = demandScore(doc.demand).score
    const freshness = doc.seq / maxSeq

    if (!browsing && lexical <= 0 && semantic <= 0) continue
    raw.push({ doc, lexical, semantic, demand, freshness, matched: [...matched] })
  }

  // Normalize lexical against the best hit on the page. An absolute BM25 number
  // is meaningless to a reader; "how close to the best match" is not.
  const maxLexical = raw.reduce((m, r) => Math.max(m, r.lexical), 0) || 1
  const maxSemantic = raw.reduce((m, r) => Math.max(m, r.semantic), 0) || 1

  const scored = raw.map((r) => {
    const breakdown: HitBreakdown = {
      lexical: Math.round((r.lexical / maxLexical) * 100) / 100,
      semantic: Math.round((r.semantic / maxSemantic) * 100) / 100,
      demand: Math.round(r.demand * 100) / 100,
      freshness: Math.round(r.freshness * 100) / 100,
    }
    const blended = browsing
      ? breakdown.demand * 0.8 + breakdown.freshness * 0.2
      : BLEND.lexical * breakdown.lexical +
        BLEND.semantic * breakdown.semantic +
        BLEND.demand * breakdown.demand +
        BLEND.freshness * breakdown.freshness

    return {
      doc: r.doc,
      breakdown,
      matched: r.matched,
      blended,
      tie: jitter(`${seed}|${r.doc.ref}`),
    }
  })

  scored.sort((a, b) => b.blended - a.blended || b.tie - a.tie)

  const top = scored.slice(0, limit)
  const best = top[0]?.blended || 1

  const hits: SearchHit[] = top.map((s) => ({
    ref: s.doc.ref,
    kind: s.doc.kind,
    id: s.doc.id,
    title: s.doc.title,
    subtitle: s.doc.subtitle,
    snippet: snippetFor(s.doc, s.matched),
    url: s.doc.url,
    host: s.doc.host,
    frame: s.doc.frame,
    category: s.doc.category,
    icon: s.doc.icon,
    tags: s.doc.tags.slice(0, 6),
    score: Math.round((s.blended / best) * 100),
    breakdown: s.breakdown,
    matched: s.matched.slice(0, 6),
    why: whyFor(s.breakdown, s.doc, s.matched),
  }))

  return { query, hits, facets, scanned: eligible.length, seed }
}

/* ----------------------------------------------------- the manifest shape */

/**
 * The open registration manifest.
 *
 * CharacterVerse hosts the protocol but does not own what is in it: anyone can
 * publish an AI system into the index by posting this. It is kept deliberately
 * small — a name, where it lives, how it attaches, and the words it wants to be
 * found by. Notably absent is anything about the conversations that happen inside
 * the external system: the index records that a hand-off happened, never what was
 * said after it.
 */
/* ------------------------------------------------- delegated frame features */

/**
 * Browser capabilities an embedded system may ask the workspace to delegate.
 *
 * Deliberately a short allowlist rather than a free string. The `allow`
 * attribute on an iframe is a permissions-policy delegation: whatever is named
 * there, the frame may ask the browser for. An index anyone can publish into
 * cannot also let publishers write that attribute — `allow="camera; geolocation;
 * display-capture"` is a sentence a stranger should not be able to put in our
 * page.
 *
 * Nothing here is granted by publishing. A publisher declares what their system
 * needs; the person using it grants it, per system, in the frame's own header
 * bar. The browser then still asks. Three gates, and the publisher only controls
 * the first one.
 */
export const FRAME_FEATURES = [
  {
    id: 'microphone',
    label: 'Microphone',
    why: 'Voice input — talking to it instead of typing.',
  },
  {
    id: 'clipboard-write',
    label: 'Copy to clipboard',
    why: 'Its own copy buttons, for code blocks and replies.',
  },
  {
    id: 'fullscreen',
    label: 'Fullscreen',
    why: 'Letting it expand out of the pane to the whole screen.',
  },
  {
    id: 'autoplay',
    label: 'Autoplay audio',
    why: 'Speaking replies aloud without a click first.',
  },
] as const

export type FrameFeature = (typeof FRAME_FEATURES)[number]['id']

const FEATURE_IDS = FRAME_FEATURES.map((f) => f.id) as readonly string[]

/** Keep only recognised features. Anything else is dropped, not rejected. */
export function coercePermissions(value: unknown): FrameFeature[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',')
  const seen = list
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter((v): v is FrameFeature => FEATURE_IDS.includes(v))
  return Array.from(new Set(seen))
}

/**
 * Build the iframe `allow` attribute from what was requested and what the
 * viewer granted.
 *
 * The intersection, never the union. Each feature is scoped with `'src'` so the
 * grant follows the URL we registered and not wherever the frame navigates
 * itself to afterwards — without it, a chat that redirects to another host would
 * carry the microphone grant along.
 *
 * Returns '' when nothing is granted, and '' on an iframe `allow` means the
 * frame gets nothing, which is the correct default for a stranger's page.
 */
export function buildFrameAllow(requested: string[], granted: string[]): string {
  const want = new Set(coercePermissions(requested))
  return coercePermissions(granted)
    .filter((f) => want.has(f))
    .map((f) => `${f} 'src'`)
    .join('; ')
}

export type ChatManifest = {
  name: string
  tagline: string
  description: string
  url: string
  frame: FrameId
  provider: string
  icon: string
  category: string
  tags: string[]
  vibes: string[]
  /** Browser features the publisher says their system needs. Requests, not grants. */
  permissions: FrameFeature[]
}

export const MANIFEST_LIMITS = {
  name: 80,
  tagline: 140,
  description: 1200,
  url: 500,
  provider: 80,
  icon: 8,
  category: 40,
  tags: 12,
  tagLength: 32,
  vibes: 8,
  vibeLength: 80,
} as const

/**
 * Validate and normalize a submitted manifest.
 *
 * Writes are open, so this is the only thing standing between the index and
 * whatever arrives. It is a quality filter rather than a gate: it rejects what
 * cannot be indexed or cannot be opened, and trims the rest into shape.
 */
export function readManifest(input: unknown): { ok: true; manifest: ChatManifest } | { ok: false; error: string } {
  const raw = (input || {}) as Record<string, unknown>
  const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

  const name = str(raw.name, MANIFEST_LIMITS.name)
  if (name.length < 2) return { ok: false, error: 'A name is required — it is the title of the result.' }

  const urlText = str(raw.url, MANIFEST_LIMITS.url)
  if (!urlText) return { ok: false, error: 'A URL is required. An entry nobody can open is not a result.' }

  let url: URL
  try {
    url = new URL(urlText)
  } catch {
    return { ok: false, error: 'That URL could not be parsed. Include the scheme, e.g. https://…' }
  }
  // http(s) only. A javascript: or data: URL in an index that renders links is
  // not an external AI system, it is a script waiting for somebody to click it.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http and https URLs can be indexed.' }
  }
  // Credentials in the URL are almost always a paste accident, and an index
  // entry is public by definition — storing it would publish the password and
  // then print it in a green breadcrumb under every result.
  if (url.username || url.password) {
    return {
      ok: false,
      error: 'Remove the username and password from the URL. Index entries are public, so anything in the link is published with it.',
    }
  }

  const frame = coerceFrame(raw.frame)
  // An inframe entry has to be embeddable, and an embedded page served over
  // plain http inside an https workspace is blocked by the browser before the
  // host ever gets a say. Caught here rather than counted as a mystery block.
  if (frame === 'inframe' && url.protocol !== 'https:') {
    return { ok: false, error: 'An inframe entry must be https — browsers refuse to embed http pages in a secure page.' }
  }

  const tags = (Array.isArray(raw.tags) ? raw.tags : String(raw.tags ?? '').split(','))
    .map((t) => str(t, MANIFEST_LIMITS.tagLength).toLowerCase())
    .filter(Boolean)
    .slice(0, MANIFEST_LIMITS.tags)

  const vibes = (Array.isArray(raw.vibes) ? raw.vibes : String(raw.vibes ?? '').split(','))
    .map((v) => str(v, MANIFEST_LIMITS.vibeLength))
    .filter(Boolean)
    .slice(0, MANIFEST_LIMITS.vibes)

  return {
    ok: true,
    manifest: {
      name,
      tagline: str(raw.tagline, MANIFEST_LIMITS.tagline),
      description: str(raw.description, MANIFEST_LIMITS.description),
      url: url.toString(),
      frame,
      provider: str(raw.provider, MANIFEST_LIMITS.provider) || url.hostname.replace(/^www\./, ''),
      icon: str(raw.icon, MANIFEST_LIMITS.icon) || '🛰️',
      category: str(raw.category, MANIFEST_LIMITS.category) || 'Assistant',
      tags: Array.from(new Set(tags)),
      vibes,
      permissions: coercePermissions(raw.permissions),
    },
  }
}

/** The suggestion chips under the box. Same five the rail offers, by design. */
export const SEARCH_SUGGESTIONS = [
  'mysterious but slightly unhinged',
  'cozy sci-fi, nothing at stake',
  'someone who argues back',
  'tactical, give me a problem',
  'melancholy and quiet',
]

/** Operator help, printed under the box rather than hidden in a docs page. */
export const OPERATORS = [
  { op: 'is:external', means: 'Only AI systems hosted somewhere else.' },
  { op: 'is:character', means: 'Only CharacterVerse characters.' },
  { op: 'is:thread', means: 'Only your own conversations.' },
  { op: 'frame:inframe', means: 'Only entries that embed in a tab.' },
  { op: 'frame:oframe', means: 'Only entries that hand off to their own site.' },
  { op: 'site:example.com', means: 'Restrict to one host.' },
  { op: '"exact words"', means: 'Require the phrase. A near miss is dropped, not ranked lower.' },
]

/* ------------------------------------------------------ the sponsored slot */

/**
 * Paid placement, and the rules it is sold under.
 *
 * The rules are exported rather than buried in the handler because they are
 * printed on the page beside the slot. An advertising product whose rules live
 * only in the code is a promise nobody can hold you to.
 *
 * The load-bearing one is the second: a sponsored entry still has to match the
 * query. Money buys position among the results a query already deserved, not a
 * result the query did not ask for. An ad for something irrelevant is worse for
 * the advertiser than no ad — it is paying to be dismissed — and it is worse for
 * the index, because it teaches people that the top of the page is noise.
 */
export const SPONSOR_SLOTS = 2

/** 2 CVC a day — the price of two chat replies, priced to be legible. */
export const SPONSOR_RATE_MILLI = 2000

export const SPONSOR_DAYS = [7, 30, 90] as const

export function sponsorPrice(days: number): number {
  const d = Math.max(1, Math.min(Math.round(days) || 0, 365))
  return d * SPONSOR_RATE_MILLI
}

export const SPONSOR_RULES = [
  'Only your own entries, and only while they are live.',
  'A sponsored entry still has to match the query. Paying moves it up; it cannot put it somewhere it did not belong.',
  `At most ${SPONSOR_SLOTS} slots on a page, filled by cumulative spend. Everything else stays organic.`,
  'Labelled as sponsored, above the organic results, never mixed into them.',
  'Impressions, opens and dismissals are counted the same way as an organic row, in the same columns — so a slot can be judged and so can we.',
  'Charged once, up front, in CVC. Placement lapses on its own; nothing renews without you.',
]
