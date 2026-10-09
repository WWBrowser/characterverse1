import { createFileRoute } from '@tanstack/react-router'
import {
  entryDemand,
  entryToDoc,
  coerceEventKind,
  getEntry,
  indexTelemetry,
  listEntries,
  liveSponsors,
  loadCorpus,
  recentEntryCount,
  recordEvent,
  recordImpressions,
  registerEntry,
  removeEntry,
  seedEntries,
  setEntryStatus,
  sponsorEntry,
  topQueries,
  unsponsorEntry,
} from '../../db/searchindex.js'
import {
  BLEND,
  FRAMES,
  MAX_RESULTS,
  OPERATORS,
  SEARCH_SUGGESTIONS,
  SPONSOR_DAYS,
  SPONSOR_RATE_MILLI,
  SPONSOR_RULES,
  SPONSOR_SLOTS,
  coerceFrame,
  demandScore,
  readManifest,
  search,
  sponsorPrice,
} from '../lib/searchindex.js'
import { hash, readTaste, SIGNALS, WEIGHTS } from '../lib/algorithmclaw.js'
import { readIntent } from '../lib/securityclaw.js'
import { probeFrame } from '../lib/frameprobe.js'
import { loadHistory, loadPolicy, logSecurity } from '../../db/saa.js'

// CharacterVerse Search — the index protocol.
//
// Hosted here, open to everyone. Three things live on this one endpoint:
//
//   GET  /api/search?q=…&sessionId=…   run a query, get a ranked page
//   GET  /api/search?entries=1         read the registry (what is indexed)
//   POST /api/search { action: … }     register | update | mute | remove
//                                      | event | seed
//
// A register that asks for inframe is probed against the host first (see
// src/lib/frameprobe.ts) and lands as oframe if the host refuses to be framed.
// The publisher is told, in `demoted`.
//
// Reads are CORS-open, because an index nobody else can query is a directory.
// Writes are not anonymous — they carry the publishing session, are rate limited
// per session, and go through the manifest quality filter — because a write
// endpoint with neither is a spam target, and an index full of spam is worth
// less than no index at all. That is the answer to the open-writes question:
// open to everyone, attributable to someone.
//
// SecurityClaw screens the query before AlgorithmClaw ranks it, exactly as it
// does for the skyscraper. The search box and the side rail are the same engine
// asking two different questions, so they get the same guardrail.

/** Entries one session may publish in an hour. Generous, but not a firehose. */
const REGISTER_LIMIT_PER_HOUR = 12

/** Reads are open to any origin; writes are same-origin only. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { ...CORS, ...(init?.headers || {}) } })
}

/**
 * The index model.
 *
 * Deliberately shaped as one document describing the whole state of the search
 * surface rather than a bare results array: the query, what the ranker knows,
 * what it decided and what it has measured. An external node gets the same
 * document our own page renders from, which is what makes this a protocol and
 * not an internal JSON blob that happens to be reachable.
 */
type IndexModel = Awaited<ReturnType<typeof buildModel>>

async function buildModel(input: { sessionId: string; q: string; source: string }) {
  const { sessionId, q, source } = input

  const started = Date.now()

  const [corpus, history, telemetry, trending, sponsorRows] = await Promise.all([
    loadCorpus(sessionId),
    sessionId ? loadHistory(sessionId).catch(() => []) : Promise.resolve([]),
    indexTelemetry(),
    topQueries(),
    liveSponsors(),
  ])

  const seed = String(hash(`${sessionId}|${q.toLowerCase()}`))
  // MAX_RESULTS rather than the kernel's default 24 because the page paginates
  // now, and a "page 3" that does not exist is worse than no pagination at all.
  // The pager draws one ring per page up to eight and beyond; eighty rows at ten
  // a page is what makes those rings pages rather than decoration.
  const page = search({ docs: corpus, query: q, seed, limit: MAX_RESULTS })

  /* The sponsored slot.
   *
   * A paying entry is put through the same kernel, on its own, with the same
   * query and the same seed. That is the exact test the rules promise — "would
   * this entry have matched this query at all?" — rather than an approximation
   * of it, and because the kernel is pure it costs a pass over at most a dozen
   * documents. An empty box gets no sponsored slot: there is no query for an ad
   * to be relevant to, so it could only be relevant to the money. */
  const sponsorDocs = sponsorRows.map(entryToDoc)
  const sponsorHits = q.trim() && sponsorDocs.length
    ? search({ docs: sponsorDocs, query: q, seed, limit: SPONSOR_SLOTS * 3 }).hits
    : []
  const byRef = new Map(sponsorRows.map((r) => [`external:${r.id}`, r]))
  const sponsored = sponsorHits
    .map((hit) => ({ hit, row: byRef.get(hit.ref) }))
    .filter((x): x is { hit: typeof sponsorHits[number]; row: (typeof sponsorRows)[number] } => Boolean(x.row))
    // Cumulative spend decides the order between two entries that both matched.
    .sort((a, b) => (b.row.sponsorMilli || 0) - (a.row.sponsorMilli || 0))
    .slice(0, SPONSOR_SLOTS)
    .map(({ hit, row }) => ({
      ...hit,
      sponsored: true as const,
      sponsorNote: row.sponsorNote || '',
      sponsoredUntil: row.sponsoredUntil,
      provider: row.provider || row.host,
    }))

  // A row in the sponsored slot is not also listed organically. Paying for
  // position should move an entry, not print it twice.
  const sponsoredRefs = new Set(sponsored.map((s) => s.ref))
  const organic = page.hits.filter((h) => !sponsoredRefs.has(h.ref))

  // The ranker context — what the engine currently knows about the searcher, and
  // whether it is cold. Printed on the page rather than kept private: a cold
  // ranker that says so is more use than a warm-sounding one that is guessing.
  const taste = readTaste(history)

  return {
    protocol: { name: 'CharacterVerse Search', version: '1.0', host: 'characterverse' },
    search_engine: {
      name: 'SAA AlgorithmClaw',
      mode: q ? 'index_query' : 'standing_by',
      /** Both halves of the engine, named so the page can say which one ran. */
      surfaces: ['search_box', 'side_rail'],
      current_query: {
        raw: page.query.raw,
        terms: page.query.terms,
        phrases: page.query.phrases,
        filters: page.query.filters,
        axes: page.query.vibe.axes,
        clarity: page.query.clarity,
        fan_out: page.query.fanOut,
      },
      suggested_prompts: SEARCH_SUGGESTIONS,
      operators: OPERATORS,
      sponsorship: {
        slots: SPONSOR_SLOTS,
        rate_milli_per_day: SPONSOR_RATE_MILLI,
        days: SPONSOR_DAYS,
        rules: SPONSOR_RULES,
      },
      blend: BLEND,
      signals: SIGNALS,
      weights: WEIGHTS,
      seed: page.seed,
    },
    ranker_context: {
      state: taste.cold ? 'cold_start' : 'warm',
      strategy: taste.cold ? 'novelty_bias' : 'history_informed',
      metrics: {
        conversations_analyzed: taste.conversations,
        average_turns_per_conversation: taste.depth,
        signal_strength_percentage: taste.signal,
        detected_user_voice: taste.style,
      },
      note: taste.cold
        ? 'Cold start. The index ranks on the corpus text and measured demand — it is not personalising, and says so rather than pretending to know you.'
        : 'Warm. The rail personalises against your history; this box still ranks the corpus, because a search box that re-ranked on taste would stop being a search box.',
    },
    retrieval: {
      corpus: {
        total: corpus.length,
        characters: corpus.filter((d) => d.kind === 'character').length,
        threads: corpus.filter((d) => d.kind === 'thread').length,
        external: corpus.filter((d) => d.kind === 'external').length,
      },
      scanned: page.scanned,
      facets: page.facets,
      frames: FRAMES,
    },
    results: organic,
    sponsored,
    /* What the page is allowed to claim in its footer. `returned` is the number
     * of rows the reader can actually page through, which is not the same as
     * `matched` once the kernel's limit has cut the tail off — printing the
     * larger number beside ten rows would be the ordinary search-engine lie. */
    result_stats: {
      matched: page.facets.all,
      returned: organic.length,
      sponsored: sponsored.length,
      scanned: page.scanned,
      capped: page.hits.length >= MAX_RESULTS,
      took_ms: Date.now() - started,
    },
    telemetry_and_learning: {
      ...telemetry,
      trending,
      philosophy: 'retain_all',
      description:
        'Impressions, opens, dismissals and refused embeds are all kept. A recommender that only records its wins learns nothing, and the demand experiment this index is running needs the losses most of all.',
    },
    source,
  }
}

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 80)
        const source = (url.searchParams.get('source') || 'search').slice(0, 20)

        // The registry, for the add/manage page and for any node that wants to
        // know what is in here before querying it.
        if (url.searchParams.get('entries')) {
          const rows = await listEntries()
          const mine = sessionId ? rows.filter((r) => r.sessionId === sessionId) : []
          return json({
            frames: FRAMES,
            telemetry: await indexTelemetry(),
            entries: rows.map((r) => {
              const doc = entryToDoc(r)
              return {
                id: r.id,
                name: r.name,
                tagline: r.tagline,
                description: r.description,
                url: r.url,
                host: r.host,
                frame: coerceFrame(r.frame),
                provider: r.provider,
                icon: r.icon,
                category: r.category,
                tags: doc.tags,
                vibes: Array.isArray(r.vibes) ? r.vibes : [],
                status: r.status,
                mine: Boolean(sessionId) && r.sessionId === sessionId,
                demand: {
                  impressions: r.impressions,
                  opens: r.opens,
                  dismissals: r.dismissals,
                  blocks: r.frameBlocks,
                  ...demandScore(doc.demand),
                },
                lastOpenedAt: r.lastOpenedAt,
                // Read at render time, never stored as a boolean: a lapsed
                // placement has to read as lapsed the moment it lapses.
                sponsored: Boolean(r.sponsoredUntil && new Date(r.sponsoredUntil).getTime() > Date.now()),
                sponsoredUntil: r.sponsoredUntil,
                sponsorMilli: r.sponsorMilli || 0,
                sponsorNote: r.sponsorNote || '',
              }
            }),
            mine: mine.length,
            sponsorship: {
              slots: SPONSOR_SLOTS,
              rate_milli_per_day: SPONSOR_RATE_MILLI,
              days: SPONSOR_DAYS,
              prices: SPONSOR_DAYS.map((d) => ({ days: d, milli: sponsorPrice(d) })),
              rules: SPONSOR_RULES,
            },
          })
        }

        // A single entry's demand detail — which queries actually opened it.
        const detailId = Number(url.searchParams.get('entry'))
        if (Number.isFinite(detailId) && detailId > 0) {
          const row = await getEntry(detailId)
          if (!row) return json({ error: 'Not in the index.' }, { status: 404 })
          return json({
            entry: { id: row.id, name: row.name, frame: coerceFrame(row.frame), host: row.host },
            queries: await entryDemand(detailId),
          })
        }

        const q = (url.searchParams.get('q') || '').slice(0, 400)

        // SecurityClaw screens a real query before it is run or logged. An empty
        // box is the standby state and is not a request to screen.
        if (q.trim()) {
          const policy = await loadPolicy(sessionId).catch(() => null)
          if (policy) {
            const intent = readIntent(q, policy)
            void logSecurity({ sessionId, stage: 'ingress', read: intent, text: q }).catch(() => null)
            if (intent.verdict === 'refuse') {
              return json({
                refused: true,
                verdict: intent.verdict,
                reasoning: intent.reasoning,
                results: [],
              })
            }
          }
        }

        const model = await buildModel({ sessionId, q, source })

        // Impressions are recorded for a page that was actually served, after it
        // was built, and never awaited — a slow log must not slow a result page.
        if (q.trim() && (model.results.length || model.sponsored.length)) {
          void recordImpressions({
            sessionId,
            query: q.trim(),
            source,
            // The sponsored rows are in here too, counted in the same columns as
            // the organic ones. An advertising slot measured on its own numbers
            // is a slot nobody can compare with anything.
            hits: [...model.sponsored, ...model.results].map((h) => ({ ref: h.ref, kind: h.kind, id: h.id, frame: h.frame })),
          }).catch(() => {})
          void recordEvent({ sessionId, kind: 'query', query: q.trim(), source }).catch(() => {})
        }

        return json(model)
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const sessionId = String(body.sessionId || '').trim().slice(0, 80)
        const action = String(body.action || 'register')

        // Telemetry is the one write that needs no session: an external node
        // reporting a hand-off it served is still real demand, and refusing it
        // would leave the experiment measuring only our own page.
        if (action === 'event') {
          const kind = coerceEventKind(body.kind)
          if (!kind) return Response.json({ error: 'Unknown event kind' }, { status: 400 })
          await recordEvent({
            sessionId,
            kind,
            entryId: Number(body.entryId) || null,
            characterId: Number(body.characterId) || null,
            docKind: String(body.docKind || ''),
            query: String(body.query || ''),
            frame: body.frame === 'inframe' || body.frame === 'oframe' ? body.frame : '',
            source: String(body.source || 'search'),
            rank: Number(body.rank) || 0,
          })
          return new Response(null, { status: 204 })
        }

        // The tile row reports its own impressions in one call. A row of eight
        // tiles that fired eight requests would cost more than the clicks it is
        // trying to measure.
        if (action === 'impressions') {
          const hits = Array.isArray(body.hits) ? body.hits : []
          if (hits.length) {
            await recordImpressions({
              sessionId,
              query: String(body.query || ''),
              source: String(body.source || 'tiles'),
              hits: hits.slice(0, 40).map((h: any) => ({
                ref: String(h?.ref || ''),
                kind: String(h?.kind || ''),
                id: Number(h?.id) || 0,
                frame: h?.frame === 'inframe' ? 'inframe' : h?.frame === 'oframe' ? 'oframe' : '',
              })),
            })
          }
          return new Response(null, { status: 204 })
        }

        if (action === 'seed') {
          return Response.json(await seedEntries())
        }

        if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 })

        if (action === 'register' || action === 'update') {
          // Rate limit before validation, so a flood cannot be used to probe the
          // validator either.
          const recent = await recentEntryCount(sessionId)
          if (recent >= REGISTER_LIMIT_PER_HOUR) {
            return Response.json(
              {
                error: `That is ${recent} entries in the last hour, which is the limit. The index is open to everyone, which is exactly why one publisher cannot fill it.`,
              },
              { status: 429 },
            )
          }

          const read = readManifest(body.manifest ?? body)
          if (!read.ok) return Response.json({ error: read.error }, { status: 400 })

          // The manifest text is screened the same way a vibe is. A publisher
          // writes the description; a description is prose, and prose that
          // reaches a results page has been through egress screening everywhere
          // else on this platform.
          const policy = await loadPolicy(sessionId).catch(() => null)
          if (policy) {
            const intent = readIntent(
              `${read.manifest.name} ${read.manifest.tagline} ${read.manifest.description}`,
              policy,
            )
            if (intent.verdict === 'refuse') {
              void logSecurity({ sessionId, stage: 'ingress', read: intent, text: read.manifest.name }).catch(
                () => null,
              )
              return Response.json(
                { error: 'That listing was refused by SecurityClaw.', reasoning: intent.reasoning },
                { status: 400 },
              )
            }
          }

          // An inframe registration is a claim about somebody else's server, so
          // it gets checked against that server before it is believed. A caller
          // who already probed can pass the verdict back rather than making us
          // fetch twice — but only as a hint: the probe re-runs here regardless,
          // because "I checked, it's fine" arriving in a request body is not
          // evidence about anything.
          //
          // Oframe needs no probe. Nothing can refuse to be navigated to.
          const embed =
            read.manifest.frame === 'inframe'
              ? await probeFrame({
                  url: read.manifest.url,
                  ownOrigin: new URL(request.url).origin,
                  requested: 'inframe',
                })
              : null

          if (embed) {
            void recordEvent({
              sessionId,
              kind: 'probe',
              docKind: 'external',
              query: `${embed.verdict} ${embed.finalUrl || read.manifest.url}`,
              frame: embed.frame,
              source: 'register',
            })
          }

          const result = await registerEntry({
            sessionId,
            manifest: read.manifest,
            characterId: Number(body.characterId) || null,
            embed,
          })
          if (!result.entry) {
            return Response.json({ error: result.error || 'Could not register that entry.' }, { status: 400 })
          }
          return Response.json({
            created: result.created,
            entry: { ...result.entry, frame: coerceFrame(result.entry.frame) },
            check: embed,
            // Set when the publisher asked for inframe and the host said no. The
            // entry still went in; it just goes in as a hand-off, and saying so
            // is the difference between a fallback and a silent substitution.
            demoted: result.demoted || null,
          })
        }

        // The three actions that operate on an existing entry. Every one of them
        // is scoped to the publishing session inside the db layer, so an open
        // write endpoint still cannot let a stranger mute or delete somebody
        // else's entry.
        if (action === 'mute' || action === 'unmute' || action === 'remove') {
          const id = Number(body.id)
          if (!Number.isFinite(id) || id <= 0) {
            return Response.json({ error: 'id is required' }, { status: 400 })
          }

          if (action === 'remove') {
            const ok = await removeEntry(id, sessionId)
            return ok
              ? new Response(null, { status: 204 })
              : Response.json({ error: 'Not yours, or not in the index.' }, { status: 404 })
          }

          const row = await setEntryStatus(id, sessionId, action === 'mute' ? 'muted' : 'live')
          if (!row) return Response.json({ error: 'Not yours, or not in the index.' }, { status: 404 })
          return Response.json({ entry: row })
        }

        /* Buy or end a sponsored placement. Owner-only, and the ownership check
         * lives in the DB helper's WHERE clause rather than here — a check in
         * the handler can be forgotten by the next handler; one in the update
         * cannot be. */
        if (action === 'sponsor') {
          const id = Number(body.id)
          if (!Number.isFinite(id) || id <= 0) {
            return Response.json({ error: 'id is required' }, { status: 400 })
          }
          const result = await sponsorEntry({
            id,
            sessionId,
            days: Number(body.days),
            note: typeof body.note === 'string' ? body.note : undefined,
          })
          if (!result.ok) {
            return Response.json(
              { error: result.error, balanceMilli: result.balanceMilli },
              { status: 400 },
            )
          }
          return Response.json({
            entry: result.row,
            sponsoredUntil: result.row.sponsoredUntil,
            spentMilli: sponsorPrice(Number(body.days)),
          })
        }

        if (action === 'unsponsor') {
          const id = Number(body.id)
          if (!Number.isFinite(id) || id <= 0) {
            return Response.json({ error: 'id is required' }, { status: 400 })
          }
          const row = await unsponsorEntry(id, sessionId)
          return row
            ? Response.json({ entry: row })
            : Response.json({ error: 'Not yours, or not in the index.' }, { status: 404 })
        }

        return Response.json({ error: `Unknown action "${action}"` }, { status: 400 })
      },
    },
  },
})

export type { IndexModel }
