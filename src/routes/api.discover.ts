import { createFileRoute } from '@tanstack/react-router'
import { listEntries, loadCorpus } from '../../db/searchindex.js'
import { MAX_RESULTS, search } from '../lib/searchindex.js'
import { hash } from '../lib/algorithmclaw.js'
import { readIntent, screenEgress } from '../lib/securityclaw.js'
import { loadPolicy, logSecurity } from '../../db/saa.js'
import { buildDiscovery, mergeProse, prosePrompt, type Discovery } from '../lib/discover.js'
import { recoverMany } from '../lib/webrecover.js'

// The Discover engine — CharacterVerse Search's encyclopedia half.
//
//   GET /api/discover?q=…&sessionId=…&recover=1
//
// Pipeline, and the order is the whole design:
//
//   1. SecurityClaw screens the query (ingress). Same guardrail as /api/search,
//      because it is the same box.
//   2. The kernel runs the same search the results page ran, with the same seed,
//      so the article and the list underneath it describe the same page. An
//      encyclopedia entry ranked differently from the results it cites would be
//      describing a page nobody can see.
//   3. buildDiscovery writes the whole article, deterministically, with every
//      claim numbered against a row that exists.
//   4. Optionally, a few external hosts are asked what they say about
//      themselves — the "wider web" half — through the same SSRF screen the
//      frame probe uses. Capped at RECOVER_LIMIT. Failures are kept and printed.
//   5. Optionally, the gateway rewrites the drafts. It may improve prose and may
//      not add a fact or drop a citation; mergeProse enforces both, per section.
//   6. SecurityClaw screens what came back (egress) before it is served.
//
// Steps 4 and 5 are the only ones that can fail, and neither failure is fatal:
// the article that ships is the kernel's, which was already complete. That is
// deliberate. The failure state of an agentic encyclopedia should be a plainer
// encyclopedia, not an apology.
//
// What this endpoint will not do: answer the topic from the model's own
// knowledge. Not because the model does not know — because an article about
// "cozy sci-fi, nothing at stake" assembled from general knowledge is not about
// anything in this index, and cannot be clicked. The point of the Discover half
// is to end with somewhere to go, and only the index has those.

/** Hosts we will ask per article. An article is worth a handful of requests. */
const RECOVER_LIMIT = 4

const MODEL = 'claude-haiku-4-5'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { ...CORS, ...(init?.headers || {}) } })
}

/** One gateway call. Returns '' on any failure — the caller keeps the drafts. */
async function ask(system: string, user: string, maxTokens: number): Promise<string> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return ''
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return Array.isArray(data?.content)
      ? data.content.map((b: any) => b?.text || '').join('').trim()
      : ''
  } catch {
    return ''
  }
}

/**
 * Egress screen over the article's prose.
 *
 * Runs on the model's rewrites only. The kernel's drafts are built from rows
 * this index already serves and are not screened again here — they were
 * screened when they were published — but anything the writer touched is, and
 * a section that fails falls back to its draft rather than being blanked. A
 * screen whose failure mode is a hole in the middle of an article teaches the
 * reader to distrust the whole page.
 */
function screenProse(discovery: Discovery): { discovery: Discovery; dropped: string[] } {
  const written = discovery.sections.filter((s) => s.prose)
  if (!written.length) return { discovery, dropped: [] }

  const result = screenEgress(written, (s) => s.prose || '')
  const badIds = new Set(result.dropped.map((d) => d.item.id))
  if (!badIds.size) return { discovery, dropped: [] }

  const sections = discovery.sections.map((s) => (badIds.has(s.id) ? { ...s, prose: undefined } : s))
  const stillWritten = sections.some((s) => s.prose)
  return {
    discovery: { ...discovery, sections, written: stillWritten ? 'model' : 'kernel' },
    dropped: Array.from(badIds),
  }
}

export const Route = createFileRoute('/api/discover')({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 120)
        const q = (url.searchParams.get('q') || '').slice(0, 400)
        // Both default on. A reader who opened Discover asked for the expensive
        // version; the flags exist so the results page can ask for the cheap one
        // when it is only after the stepper.
        const wantRecover = url.searchParams.get('recover') !== '0'
        const wantProse = url.searchParams.get('write') !== '0'

        if (!q.trim()) {
          return json({ error: 'q is required — Discover describes a query, and there is no article about an empty box.' }, { status: 400 })
        }

        // Same ingress screen as /api/search. The Discover panel is a second
        // view of one query, not a second query, so it cannot be the softer door.
        const policy = await loadPolicy(sessionId).catch(() => null)
        if (policy) {
          const intent = readIntent(q, policy)
          void logSecurity({ sessionId, stage: 'ingress', read: intent, text: q }).catch(() => null)
          if (intent.verdict === 'refuse') {
            return json({ refused: true, verdict: intent.verdict, reasoning: intent.reasoning })
          }
        }

        const started = Date.now()
        const [corpus, entries] = await Promise.all([
          loadCorpus(sessionId),
          listEntries().catch(() => []),
        ])

        // The same seed /api/search uses for this session and query, so the
        // article describes the page the reader is looking at rather than a
        // second, differently-ordered one.
        const seed = String(hash(`${sessionId}|${q.toLowerCase()}`))
        const page = search({ docs: corpus, query: q, seed, limit: MAX_RESULTS })

        // The publisher's own description, where there is one. Better than a
        // snippet cut around a matched term, because it was written to describe
        // the thing rather than to contain the query.
        const descriptions: Record<string, string> = {}
        for (const row of entries) {
          if (row.description) descriptions[`external:${row.id}`] = String(row.description).slice(0, 400)
        }

        /* The wider web.
         *
         * Only hosts already in the result set, only their registered URLs,
         * capped. Nothing the reader typed becomes a fetch. */
        const externalHits = page.hits.filter((h) => h.kind === 'external' && /^https?:\/\//i.test(h.url))
        const wanted: { host: string; url: string }[] = []
        for (const h of externalHits) {
          if (wanted.length >= RECOVER_LIMIT) break
          if (wanted.some((w) => w.host === h.host)) continue
          wanted.push({ host: h.host, url: h.url })
        }
        const recovered = wantRecover && wanted.length
          ? await recoverMany({ urls: wanted, ownOrigin: url.origin, limit: RECOVER_LIMIT })
          : []

        let discovery = buildDiscovery({
          page,
          descriptions,
          recovered,
          corpusTotal: corpus.length,
        })

        /* The writer. Last, optional, and structurally unable to change the
         * article's shape — it receives drafts and returns prose. */
        let dropped: string[] = []
        if (wantProse && discovery.sections.length) {
          const { system, user } = prosePrompt(discovery)
          const raw = await ask(system, user, 1800)
          if (raw) {
            discovery = mergeProse(discovery, raw)
            const screened = screenProse(discovery)
            discovery = screened.discovery
            dropped = screened.dropped
          }
        }

        return json({
          discovery,
          meta: {
            took_ms: Date.now() - started,
            scanned: page.scanned,
            corpus: corpus.length,
            recovered: recovered.filter((r) => r.ok).length,
            recover_attempted: recovered.length,
            prose: discovery.written,
            // Named rather than hidden: a section that lost its rewrite is
            // showing the kernel's draft, and the reader is entitled to know
            // which of the two they are reading.
            screened_out: dropped,
          },
        })
      },
    },
  },
})
