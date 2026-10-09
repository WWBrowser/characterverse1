import { createFileRoute } from '@tanstack/react-router'
import {
  appendFrame,
  bisectInto,
  deleteBench,
  emptyLibrary,
  forgetChunk,
  framesFor,
  library,
  listBenches,
  readBench,
  saveBench,
  shelves,
  verdictFor,
  type LaneName,
} from '../../db/chunkfusion.js'
import { KINDS, SUBSTRATE_QUOTE, superpose, type Assembly, type SlotKind } from '../lib/chunkfusion.js'

// Chunk Fusion — one endpoint, action verbs.
//
// Nothing here decides anything. Every route resolves chunks from the database
// and hands them to the kernel, so the answer a browser gets is the answer the
// kernel gives, and a client that lies about a verdict is contradicted the next
// time it asks.
//
// The GET degrades reader by reader. A bench that will not load should not take
// the library down with it, because the library is the part you can still work
// from.

const LANES: LaneName[] = ['head', 'body', 'tail']

function lanesFrom(raw: any): Record<LaneName, string[]> {
  const out = { head: [] as string[], body: [] as string[], tail: [] as string[] }
  for (const lane of LANES) {
    const list = Array.isArray(raw?.[lane]) ? raw[lane] : []
    out[lane] = list.map((v: any) => String(v)).filter(Boolean).slice(0, 120)
  }
  return out
}

function nameList(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean).slice(0, 60)
  return String(raw || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s))
    .slice(0, 60)
}

export const Route = createFileRoute('/api/chunkfusion')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        const benchId = (url.searchParams.get('bench') || '').trim()

        if (!sessionId) {
          return Response.json({
            chunks: [],
            pockets: [],
            benches: [],
            bench: null,
            frames: [],
            kinds: KINDS,
            quote: SUBSTRATE_QUOTE,
          })
        }

        // Each reader degrades on its own, and a reader that failed is reported
        // as failed rather than as empty. An empty library and an unreachable
        // one look identical from the outside otherwise, and the page would tell
        // the user their work was saved when it was not.
        let degraded = false
        const fall = <T,>(p: Promise<T>, empty: T): Promise<T> =>
          p.catch(() => {
            degraded = true
            return empty
          })

        const [chunks, pocketList, benches] = await Promise.all([
          fall(library(sessionId), [] as Awaited<ReturnType<typeof library>>),
          fall(shelves(sessionId), [] as Awaited<ReturnType<typeof shelves>>),
          fall(listBenches(sessionId), [] as Awaited<ReturnType<typeof listBenches>>),
        ])

        let bench = null
        let verdict = null
        let frames: any[] = []
        if (benchId) {
          const loaded = await fall(readBench(sessionId, benchId), null)
          if (loaded) {
            bench = { ...loaded.state, missing: loaded.missing }
            verdict = verdictFor({
              slot: loaded.state.slot,
              seed: loaded.state.seed,
              ...loaded.chunks,
            })
            frames = await fall(framesFor(benchId), [] as Awaited<ReturnType<typeof framesFor>>)
          }
        }

        return Response.json({
          chunks,
          pockets: pocketList,
          benches,
          bench,
          verdict,
          frames,
          degraded,
          kinds: KINDS,
          quote: SUBSTRATE_QUOTE,
        })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const sessionId = String(body.sessionId || '').trim()
        if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 })
        const action = String(body.action || '')

        try {
          switch (action) {
            /* ------------------------------------------------------- bisect */
            case 'bisect': {
              const source = String(body.source || '')
              if (!source.trim()) {
                return Response.json({ error: 'Paste some code to bisect.' }, { status: 400 })
              }
              if (source.length > 120_000) {
                return Response.json(
                  { error: 'That file is larger than the bisector will take in one pass.' },
                  { status: 400 },
                )
              }
              const depth = Math.max(0, Math.min(Number(body.maxDepth) || 2, 4))
              const result = await bisectInto({
                sessionId,
                source,
                origin: String(body.origin || 'pasted'),
                maxDepth: depth,
              })
              return Response.json({
                added: result.added,
                duplicates: result.duplicates,
                chunks: result.chunks,
              })
            }

            /* ---------------------------------------------------- superpose
             * Ask where a brick could land WITHOUT placing it. The whole point
             * is that this call writes nothing: it returns the outcome set and
             * leaves every one of them unrealised. */
            case 'superpose': {
              const chunkId = String(body.chunkId || '')
              const all = await library(sessionId)
              const chunk = all.find((c) => c.id === chunkId)
              if (!chunk) return Response.json({ error: 'No such chunk in this library.' }, { status: 404 })

              const lanes = lanesFrom(body.lanes)
              const byId = new Map(all.map((c) => [c.id, c]))
              const ordered = [...lanes.head, ...lanes.body, ...lanes.tail]
                .map((id) => byId.get(id))
                .filter((c): c is NonNullable<typeof c> => !!c)
              const assembly: Assembly = {
                slot: (body.slot === 'module' ? 'module' : 'body') as SlotKind,
                seed: nameList(body.seed),
                chunks: ordered,
              }
              return Response.json(superpose(chunk, assembly))
            }

            /* --------------------------------------------------------- save */
            case 'save': {
              const saved = await saveBench({
                sessionId,
                publicId: body.publicId ? String(body.publicId) : undefined,
                title: String(body.title || ''),
                slot: body.slot === 'module' ? 'module' : 'body',
                seed: nameList(body.seed),
                lanes: lanesFrom(body.lanes),
              })
              return Response.json(saved)
            }

            /* -------------------------------------------------------- frame */
            case 'frame': {
              const benchPublicId = String(body.publicId || '')
              if (!benchPublicId) return Response.json({ error: 'publicId is required' }, { status: 400 })
              const lane = LANES.includes(body.lane) ? (body.lane as LaneName) : 'body'
              const frame = await appendFrame({
                benchPublicId,
                chunkPublicId: String(body.chunkId || ''),
                lane,
                position: Math.max(0, Math.min(Number(body.position) || 0, 999)),
                outcomes: Math.max(0, Math.min(Number(body.outcomes) || 0, 999)),
                digest: String(body.digest || '').slice(0, 64),
              })
              return Response.json(frame)
            }

            /* ------------------------------------------------------- forget */
            case 'forget': {
              const ok = await forgetChunk(sessionId, String(body.chunkId || ''))
              return ok
                ? new Response(null, { status: 204 })
                : Response.json({ error: 'No such chunk.' }, { status: 404 })
            }

            case 'empty': {
              const removed = await emptyLibrary(sessionId)
              return Response.json({ removed })
            }

            case 'delete': {
              const ok = await deleteBench(sessionId, String(body.publicId || ''))
              return ok
                ? new Response(null, { status: 204 })
                : Response.json({ error: 'No such bench.' }, { status: 404 })
            }

            default:
              return Response.json({ error: `Unknown action "${action}"` }, { status: 400 })
          }
        } catch (err: any) {
          // Protocol messages are safe to return; anything else is a database or
          // runtime detail the browser has no business seeing.
          const safe = [
            'Paste some code to bisect.',
            'No such chunk in this library.',
            'No such bench.',
          ]
          const message = String(err?.message || '')
          return Response.json(
            { error: safe.includes(message) ? message : 'The forge could not complete that.' },
            { status: 500 },
          )
        }
      },
    },
  },
})
