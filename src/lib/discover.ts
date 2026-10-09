/**
 * The Discover engine — CharacterVerse Search's encyclopedia half.
 *
 * A search page answers "what matched?". Discover answers "what is this, and
 * what else is there?" — the question an encyclopedia article answers, written
 * per query rather than per subject, because our subjects are queries. Type
 * "cozy sci-fi, nothing at stake" and there is no page in any encyclopedia
 * called that, but there is a topic there, and the index can describe it.
 *
 * Three rules hold this file together.
 *
 * 1. **The kernel writes the article; the model only rewrites it.** Every
 *    section below is drafted here, deterministically, from the search page and
 *    the registry. `/api/discover` may then hand those drafts to the gateway for
 *    better prose — but a gateway that is absent, slow, or wrong leaves the
 *    article standing, because the draft was already the article. This is the
 *    same arrangement AlgorithmClaw uses for its slate copy, for the same
 *    reason: an encyclopedia whose failure state is a blank page is not one.
 *
 * 2. **Nothing is asserted without a citation.** A section carries `cites`,
 *    which are indices into `citations`, which are rows that actually exist —
 *    a character, one of your threads, a registered external system, or a
 *    recovered host. The model is told it may reword a draft and may not add a
 *    fact to it. An agentic encyclopedia that invents a reference is worse than
 *    no encyclopedia, because it is wrong in the format of being right.
 *
 * 3. **It stops early, on purpose.** `stopLine()` is the last thing every
 *    article says, and it says the article could go further and is not going to.
 *    An explanation long enough to exhaust a topic is an explanation you never
 *    leave, and leaving is the entire discovery half of search. We would rather
 *    hand you four queries you had not thought of than one paragraph you did
 *    not need.
 */

import type { DocKind, ParsedQuery, SearchHit, SearchPage } from './searchindex.js'

/* ----------------------------------------------------------- the citations */

/**
 * One thing the article is allowed to lean on.
 *
 * `origin` is the honest part. 'index' means we hold the row and wrote the
 * description ourselves or the publisher did; 'host' means the text came back
 * off the wider web a moment ago, from the site's own markup. The reader should
 * never have to guess which, so the two never share a label.
 */
export type Citation = {
  n: number
  ref: string
  kind: DocKind | 'host'
  title: string
  detail: string
  url: string
  host: string
  origin: 'index' | 'host'
}

/* ------------------------------------------------------------- the reads */

/**
 * One pass the engine made over the topic — what the ↑/↓ stepper walks.
 *
 * The first read is always the query exactly as typed, because that is the one
 * the reader recognises. After it come the fan-out branches the kernel actually
 * scored with, then the vocabulary the results themselves turned out to share.
 * Every read is a runnable query, so stepping to one and pressing it is the
 * same act as typing it.
 */
export type DiscoverRead = {
  id: string
  /** Runnable. Put it in the box and you reproduce this read. */
  query: string
  label: string
  note: string
  /** Share of the lexical score this branch carried, 0-100. 0 for derived reads. */
  weight: number
  /** How many of the page's hits this read can claim. */
  hits: number
  origin: 'typed' | 'fan-out' | 'vocabulary' | 'corpus'
}

/* ---------------------------------------------------------- the sections */

export type SectionId =
  | 'lead'
  | 'holdings'
  | 'reading'
  | 'wider'
  | 'vocabulary'
  | 'absent'

/**
 * A section of the article.
 *
 * `draft` is the kernel's prose. `prose` is the model's, when there is one —
 * kept in a separate field rather than overwriting the draft so the UI can
 * always say which it is showing, and so a bad rewrite is recoverable rather
 * than destructive.
 */
export type DiscoverSection = {
  id: SectionId
  heading: string
  draft: string
  prose?: string
  cites: number[]
  /** Why this section exists at all, shown on hover. */
  basis: string
}

export type Discovery = {
  topic: string
  subtitle: string
  /** The reads, in stepper order. Never empty — index 0 is the typed query. */
  reads: DiscoverRead[]
  sections: DiscoverSection[]
  citations: Citation[]
  seeAlso: { query: string; why: string }[]
  facts: { k: string; v: string }[]
  /** The deliberate full stop. Always present, always last. */
  stop: string
  /** Where to go instead of reading more. Queries, not sentences. */
  trail: string[]
  /** 'kernel' when the gateway did not write; 'model' when it did. */
  written: 'kernel' | 'model'
  /** Hosts we tried to recover from, and whether they answered. */
  recovered: { host: string; ok: boolean; note: string }[]
  seed: string
}

/* -------------------------------------------------------------- helpers */

const TITLE_CASE_SKIP = new Set(['a', 'an', 'and', 'at', 'the', 'of', 'in', 'on', 'to', 'for', 'nothing'])

/** Trim to a word boundary rather than mid-word. */
function clip(text: string, max: number): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${cut.slice(0, at > max * 0.6 ? at : max).trim()}…`
}

/**
 * The article's title.
 *
 * Title-cased, operators stripped, but otherwise the reader's own words. A
 * topic the engine renamed is a topic the reader cannot tell they asked for —
 * the cheapest way to make an encyclopedia feel like it is answering somebody
 * else's question.
 */
export function topicOf(q: ParsedQuery): string {
  const bare = (q.body || q.raw || '').replace(/["']/g, '').replace(/\s+/g, ' ').trim()
  if (!bare) return 'Everything in the index'
  return bare
    .split(' ')
    .map((w, i) =>
      i > 0 && TITLE_CASE_SKIP.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ')
    .slice(0, 90)
}

function kindNoun(kind: DocKind, plural = false): string {
  if (kind === 'character') return plural ? 'characters' : 'character'
  if (kind === 'thread') return plural ? 'conversations of your own' : 'conversation of your own'
  return plural ? 'AI systems hosted elsewhere' : 'AI system hosted elsewhere'
}

/** Terms a read can claim, lowercased and deduped. */
function readTerms(read: DiscoverRead): string[] {
  return Array.from(new Set(read.query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)))
}

/**
 * How many hits a read can claim.
 *
 * Counted against `hit.matched` — the terms the scorer actually matched — not
 * against a fresh substring scan. A count computed a second, different way
 * from the ranking would eventually disagree with it, and the number sitting
 * next to a read is only worth printing if it is the ranker's number.
 */
function claimed(read: DiscoverRead, hits: SearchHit[]): number {
  const terms = readTerms(read)
  if (!terms.length) return hits.length
  return hits.filter((h) => {
    const matched = h.matched.map((m) => m.toLowerCase())
    return terms.some((t) => matched.some((m) => m.includes(t) || t.includes(m)))
  }).length
}

/** Tags that recur across the page, commonest first. Excludes the query's own terms. */
function vocabulary(hits: SearchHit[], q: ParsedQuery): { tag: string; count: number }[] {
  const typed = new Set(q.terms.map((t) => t.toLowerCase()))
  const counts = new Map<string, number>()
  for (const h of hits) {
    for (const raw of h.tags) {
      const tag = String(raw || '').toLowerCase().trim()
      if (!tag || tag.length < 3 || typed.has(tag)) continue
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .filter((t) => t.count > 1)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 8)
}

/* ------------------------------------------------------------- the stop */

/**
 * The full stop.
 *
 * Varied by how much the article managed to say, because the same sentence
 * every time reads as a disclaimer rather than a choice — and this is a choice.
 * Each one names the trade out loud: there is more, we are not printing it,
 * here is the door.
 */
export function stopLine(input: { sections: number; cited: number; trail: number }): string {
  if (input.cited === 0) {
    return 'Our A.I. could write you a confident page about this from general knowledge. It is not going to, because none of it would be about anything in here — and a description of a topic our index cannot show you is the opposite of discovery.'
  }
  if (input.sections <= 2) {
    return `Our A.I. could go further than ${input.cited} ${input.cited === 1 ? 'source' : 'sources'} allows. It is not going to. What it would be adding is guesswork dressed as an article, and the ${input.trail} ${input.trail === 1 ? 'query' : 'queries'} below are made of things that are actually here.`
  }
  return `Our A.I. could explain this a great deal further — and that is exactly where it stops, because an article long enough to finish a topic is an article you never leave. Discovery is the half of search that only happens when you go and look. ${input.trail} ${input.trail === 1 ? 'way' : 'ways'} in, below.`
}

/* ------------------------------------------------------------ the builder */

/**
 * Build the article.
 *
 * Pure: same page in, same article out. `/api/discover` does the I/O — corpus
 * load, host recovery, the gateway call — and hands the results here, so this
 * function is testable and the article is replayable from the seed.
 */
export function buildDiscovery(input: {
  page: SearchPage
  /** Descriptions from the registry, keyed `external:<id>`. Publisher's words. */
  descriptions?: Record<string, string>
  /** Text recovered off the wider web this request, keyed by hostname. */
  recovered?: { host: string; url: string; title: string; summary: string; ok: boolean; note: string }[]
  corpusTotal?: number
}): Discovery {
  const { page } = input
  const q = page.query
  const hits = page.hits
  const recovered = input.recovered || []
  const descriptions = input.descriptions || {}
  const topic = topicOf(q)

  /* ---- the citations, numbered once, in the order the article will meet them */

  const citations: Citation[] = []
  const citeOf = new Map<string, number>()
  const cite = (c: Omit<Citation, 'n'>): number => {
    const existing = citeOf.get(c.ref)
    if (existing) return existing
    const n = citations.length + 1
    citations.push({ ...c, n })
    citeOf.set(c.ref, n)
    return n
  }
  const citeHit = (h: SearchHit): number =>
    cite({
      ref: h.ref,
      kind: h.kind,
      title: h.title,
      detail: descriptions[h.ref] || h.subtitle || h.snippet,
      url: h.url,
      host: h.host,
      origin: 'index',
    })

  /* ---------------------------------------------------------- the reads */

  const reads: DiscoverRead[] = [
    {
      id: 'typed',
      query: q.raw,
      label: q.raw.trim() ? `“${clip(q.raw, 70)}”` : 'An empty box',
      note: q.raw.trim()
        ? 'The query as you typed it. Everything below is a pass over this.'
        : 'No query — the index ranked on measured demand alone.',
      weight: 100,
      hits: hits.length,
      origin: 'typed',
    },
  ]

  for (const branch of q.fanOut) {
    if (!branch.terms.length) continue
    const read: DiscoverRead = {
      id: `fan-${branch.intent}`,
      query: branch.terms.join(' '),
      label: branch.terms.slice(0, 4).join(' '),
      note: branch.note,
      weight: Math.round(branch.weight * 100),
      hits: 0,
      origin: 'fan-out',
    }
    read.hits = claimed(read, hits)
    reads.push(read)
  }

  const vocab = vocabulary(hits, q)
  for (const { tag, count } of vocab.slice(0, 4)) {
    reads.push({
      id: `vocab-${tag}`,
      query: tag,
      label: tag,
      note: `${count} of these results carry this tag, and you did not ask for it. That makes it the topic's own vocabulary rather than yours.`,
      weight: 0,
      hits: count,
      origin: 'vocabulary',
    })
  }

  /* ------------------------------------------------------- the sections */

  const sections: DiscoverSection[] = []
  const byKind = (k: DocKind) => hits.filter((h) => h.kind === k)
  const characters = byKind('character')
  const threads = byKind('thread')
  const external = byKind('external')

  /* Lead. What the index makes of the phrase, and how far that goes. */
  if (hits.length) {
    const lead = hits.slice(0, 3)
    const cites = lead.map(citeHit)
    const shape = [
      characters.length ? `${characters.length} ${kindNoun('character', characters.length !== 1)}` : '',
      threads.length ? `${threads.length} ${kindNoun('thread', threads.length !== 1)}` : '',
      external.length ? `${external.length} ${kindNoun('external', external.length !== 1)}` : '',
    ].filter(Boolean)
    sections.push({
      id: 'lead',
      heading: topic,
      draft:
        `**${topic}** is not a subject anybody has written an encyclopedia entry for. It is a query, and in CharacterVerse it resolves to ` +
        `${shape.join(', ').replace(/, ([^,]*)$/, ' and $1')} — ${page.facets.all} ${page.facets.all === 1 ? 'document' : 'documents'} out of ` +
        `${input.corpusTotal ?? page.scanned} scanned. The closest thing to a definition the index can give is its best match: ` +
        `${lead.map((h, i) => `*${h.title}* [${cites[i]}]`).join(', ')}.`,
      cites,
      basis: 'The top three ranked documents, and the facet counts behind the filter chips.',
    })
  }

  /* Holdings. One paragraph per kind that actually has rows. */
  const holdingCites: number[] = []
  const holdingParts: string[] = []
  for (const [group, noun] of [
    [characters, 'Characters here'],
    [threads, 'Your own conversations'],
    [external, 'Systems hosted elsewhere'],
  ] as const) {
    if (!group.length) continue
    const sample = group.slice(0, 4)
    const ns = sample.map(citeHit)
    holdingCites.push(...ns)
    holdingParts.push(
      `*${noun}.* ${sample.map((h, i) => `${h.title} [${ns[i]}]`).join(', ')}` +
        (group.length > sample.length ? `, and ${group.length - sample.length} more` : '') +
        `. ${clip(sample[0].snippet || sample[0].subtitle, 160)}`,
    )
  }
  if (holdingParts.length) {
    sections.push({
      id: 'holdings',
      heading: 'What the index holds',
      draft: holdingParts.join('\n\n'),
      cites: holdingCites,
      basis: 'Every ranked hit, grouped by kind. Nothing here is outside the result set.',
    })
  }

  /* The reading. How the kernel understood the words — the part only we can write. */
  const axes = q.vibe.axes.slice(0, 4)
  if (axes.length || q.terms.length) {
    const axisText = axes.length
      ? `It reads as ${axes.map((a) => `${a.label.toLowerCase()} (${a.weight}%)`).join(', ')}.`
      : 'It matched no axis the kernel knows, so it was scored on text alone.'
    sections.push({
      id: 'reading',
      heading: 'How the engine reads it',
      draft:
        `The kernel does not know what ${topic.toLowerCase()} means. It knows how the phrase decomposes. ` +
        `${axisText} ` +
        (q.phrases.length
          ? `The quoted part — “${q.phrases.join('”, “')}” — is a hard filter: a document missing it is dropped, not ranked lower. `
          : '') +
        `Legibility came out at ${q.clarity}/100, which measures how much of the phrase the kernel could use, not how good a query it is. ` +
        `The ${q.fanOut.length} ${q.fanOut.length === 1 ? 'branch' : 'branches'} it fanned into are in the stepper above.`,
      cites: [],
      basis: 'The parsed query: axes, phrases, legibility, fan-out. No document needed.',
    })
  }

  /* The wider web. External rows, plus whatever their hosts said for themselves. */
  if (external.length) {
    const hostLine = new Map<string, SearchHit>()
    for (const h of external) if (!hostLine.has(h.host)) hostLine.set(h.host, h)
    const cites: number[] = []
    const lines: string[] = []
    for (const [host, h] of Array.from(hostLine).slice(0, 6)) {
      const n = citeHit(h)
      cites.push(n)
      const rec = recovered.find((r) => r.host === host)
      if (rec?.ok && rec.summary) {
        const hn = cite({
          ref: `host:${host}`,
          kind: 'host',
          title: rec.title || host,
          detail: rec.summary,
          url: rec.url,
          host,
          origin: 'host',
        })
        cites.push(hn)
        lines.push(`*${host}* [${n}] — “${clip(rec.summary, 180)}” [${hn}], recovered from the host's own page just now.`)
      } else {
        const why = rec && !rec.ok ? ` The host did not answer: ${rec.note}` : ''
        lines.push(`*${host}* [${n}] — ${clip(descriptions[h.ref] || h.subtitle || h.snippet, 170)}${why}`)
      }
    }
    sections.push({
      id: 'wider',
      heading: 'On the wider web',
      draft:
        `${external.length} of these ${external.length === 1 ? 'is' : 'are'} not ours. They are registered by their publishers and hosted somewhere else entirely, which means two different things can be quoted about them and they should not be confused: what our index holds, and what the site itself says.\n\n` +
        lines.join('\n\n'),
      cites,
      basis: 'External rows in the result set, plus any host text recovered this request.',
    })
  }

  /* Vocabulary. The words the results share and you did not type. */
  if (vocab.length) {
    sections.push({
      id: 'vocabulary',
      heading: 'The words it travels with',
      draft:
        `You did not type any of these. They are what the matching documents tag themselves with, which makes them the nearest thing this index has to related topics: ` +
        `${vocab.map((v) => `**${v.tag}** (${v.count})`).join(', ')}. ` +
        `Each is a query. The ones with the highest counts are the ones most likely to be a better question than the one you asked.`,
      cites: [],
      basis: 'Tag frequency across the result set, with your own terms removed.',
    })
  }

  /* The absence. What a topic does not have is a finding, not an empty state. */
  const missing = ([['character', characters], ['thread', threads], ['external', external]] as const)
    .filter(([, group]) => group.length === 0)
    .map(([kind]) => kindNoun(kind, true))
  if (hits.length && missing.length) {
    sections.push({
      id: 'absent',
      heading: 'What is missing',
      draft:
        `Nothing in this topic came back as ${missing.join(' or ')}. On an index this size that is a gap rather than a verdict — ` +
        `it usually means nobody has published into it yet, and the add page is how that changes. ` +
        `It is recorded here because an article that only lists what exists quietly implies the rest was checked and rejected.`,
      cites: [],
      basis: 'Facet counts that came back zero.',
    })
  }

  /* -------------------------------------------------------- see also */

  const seeAlso: { query: string; why: string }[] = []
  for (const { tag, count } of vocab.slice(0, 5)) {
    seeAlso.push({ query: tag, why: `Shared by ${count} of these results` })
  }
  for (const branch of q.fanOut) {
    if (!branch.terms.length) continue
    const query = branch.terms.slice(0, 4).join(' ')
    if (seeAlso.some((s) => s.query === query)) continue
    seeAlso.push({ query, why: branch.note })
  }
  if (external.length && q.filters.scope !== 'external') {
    seeAlso.push({ query: `${q.body} is:external`.trim(), why: 'The same topic, hosted elsewhere only' })
  }
  if (characters.length && q.filters.scope !== 'character') {
    seeAlso.push({ query: `${q.body} is:character`.trim(), why: 'The same topic, characters only' })
  }

  /* ---------------------------------------------------------- the facts */

  const facts: { k: string; v: string }[] = [
    { k: 'Topic', v: topic },
    { k: 'Resolves to', v: `${page.facets.all} ${page.facets.all === 1 ? 'document' : 'documents'}` },
    { k: 'Kinds', v: [characters.length && `${characters.length} characters`, threads.length && `${threads.length} threads`, external.length && `${external.length} external`].filter(Boolean).join(' · ') || 'none' },
    { k: 'Hosts', v: external.length ? Array.from(new Set(external.map((h) => h.host))).slice(0, 3).join(', ') : 'all internal' },
    { k: 'Reads', v: `${reads.length} ${reads.length === 1 ? 'pass' : 'passes'} over the topic` },
    { k: 'Cited', v: `${citations.length} ${citations.length === 1 ? 'source' : 'sources'}, ${citations.filter((c) => c.origin === 'host').length} off the wider web` },
    { k: 'Legibility', v: `${q.clarity}/100` },
  ]

  const trail = seeAlso.slice(0, 4).map((s) => s.query)

  return {
    topic,
    subtitle: hits.length
      ? `A query, described from ${citations.length} ${citations.length === 1 ? 'source' : 'sources'} in and around this index`
      : 'A query with nothing behind it yet',
    reads,
    sections,
    citations,
    seeAlso: seeAlso.slice(0, 8),
    facts,
    stop: stopLine({ sections: sections.length, cited: citations.length, trail: trail.length }),
    trail,
    written: 'kernel',
    recovered: recovered.map((r) => ({ host: r.host, ok: r.ok, note: r.note })),
    seed: page.seed,
  }
}

/* ------------------------------------------------- merging the model's prose */

/**
 * Lay the model's paragraphs over the kernel's drafts, per section.
 *
 * Everything here is a refusal to trust the writer with anything structural.
 * A section the model skipped keeps its draft. A section it invented is
 * discarded — `sections` is the kernel's decision. A rewrite that drops a
 * citation the draft carried is discarded too, because the draft's claims and
 * its citations were built together and prose that keeps the claims while
 * losing the references is precisely the failure this design exists to prevent.
 */
export function mergeProse(
  discovery: Discovery,
  raw: string,
): Discovery {
  if (!raw.trim()) return discovery

  let parsed: unknown
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    parsed = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null
  } catch {
    return discovery
  }
  const body = parsed as { sections?: Record<string, string> } | null
  const written = body?.sections
  if (!written || typeof written !== 'object') return discovery

  let touched = 0
  const sections = discovery.sections.map((section) => {
    const next = written[section.id]
    if (typeof next !== 'string') return section
    const clean = next.replace(/\s+/g, ' ').trim()
    if (clean.length < 40) return section
    // Every citation the draft carried must survive the rewrite.
    const kept = section.cites.every((n) => clean.includes(`[${n}]`))
    if (!kept) return section
    touched += 1
    return { ...section, prose: clip(clean, 1400) }
  })

  return { ...discovery, sections, written: touched > 0 ? 'model' : 'kernel' }
}

/**
 * The prompt. Kept next to `mergeProse` because the two are one contract: what
 * we ask for, and what we will accept back.
 */
export function prosePrompt(discovery: Discovery): { system: string; user: string } {
  const system = `You are the Discover engine inside CharacterVerse Search — the encyclopedia half of a search index.

You are rewriting draft sections of an article about a SEARCH QUERY. A deterministic kernel has already decided which sections exist, what each one is allowed to claim, and which sources it cites. You are improving the prose and nothing else.

Hard rules:
- Return ONLY JSON: {"sections": {"<section-id>": "<rewritten prose>"}}
- Rewrite only the section ids you are given. Never add one.
- Every [n] citation marker in a draft MUST appear in your rewrite. Keep them attached to the same claim.
- Introduce NO fact that is not in the draft you were given. No outside knowledge about the topic, the hosts, or the named characters. If a draft is thin, write it more clearly — do not fill it.
- Keep *italics* and **bold** where the draft uses them for names and labels.
- Encyclopedic register. Plain, specific, present tense. No marketing words, no "dive into", no "in today's world", no second person except where the draft already addresses the reader about their own conversations.
- Each section: 2-4 sentences. Shorter than the draft is fine. Longer is not.

You are deliberately writing an article that stops short of exhausting its topic. Do not write a conclusion, do not summarise, and do not offer to explain further — the engine adds its own closing line and yours would collide with it.`

  const user = `TOPIC: ${discovery.topic}

SOURCES (cite by number, these are the only ones that exist):
${discovery.citations.map((c) => `[${c.n}] ${c.title} — ${c.origin === 'host' ? `recovered from ${c.host}` : `${c.kind} in our index`} — ${clip(c.detail, 200)}`).join('\n')}

DRAFT SECTIONS:
${discovery.sections.map((s) => `--- id: ${s.id}\nheading: ${s.heading}\nmust keep citations: ${s.cites.length ? s.cites.map((n) => `[${n}]`).join(' ') : 'none'}\n${s.draft}`).join('\n\n')}

Rewrite each section. JSON only.`

  return { system, user }
}
