import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { spatialScenes } from '../../db/schema.js'
import { countNodes, indexScene, resolve, validateDocument, type SceneIndex, type SDocument } from '../lib/spatial-dom.js'
import { ensureSpatialSeeded } from '../lib/spatial-seed.js'

// SpatialVerse Search — the endpoint.
//
//   GET  ?q=…            resolve a spatial query over every indexed space
//   GET  ?scene=slug     one space's Spatial DOM document, exactly as published
//   GET  ?scenes=1       the list of indexed spaces
//   POST {action:'rewrite', q}   ask the model to restate a query the grammar
//                        could not read, then resolve the restatement. The model
//                        only ever writes words; the engine does the finding.
//   POST {action:'publish', doc} add a space to the index
//
// Reads are public and cross-origin, like the rest of the index: a standard
// that only our own page could read would not be much of a standard.

const MODEL = 'claude-haiku-4-5'
const CORS = { 'Access-Control-Allow-Origin': '*' }

/**
 * Indexes, cached per row version. The document in the table is the truth;
 * this is a derived view of it, rebuilt whenever the row changes, and a cold
 * start simply rebuilds it.
 */
const cache = new Map<string, { stamp: string; index: SceneIndex }>()

async function loadIndexes(): Promise<SceneIndex[]> {
  await ensureSpatialSeeded()
  const rows = await db
    .select({ slug: spatialScenes.slug, doc: spatialScenes.doc, updatedAt: spatialScenes.updatedAt })
    .from(spatialScenes)
    .orderBy(spatialScenes.id)
    .limit(200)
  return rows.map((r) => {
    const stamp = String(r.updatedAt?.valueOf() ?? '')
    const hit = cache.get(r.slug)
    if (hit && hit.stamp === stamp) return hit.index
    const index = indexScene(r.doc as SDocument)
    cache.set(r.slug, { stamp, index })
    return index
  })
}

function readQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 300) : ''
}

/* ---------------------------------------------------------------- the model */

function rewriteSystem(types: string[]): string {
  return `You restate searches for SpatialVerse, a search engine over 3D virtual spaces.

The engine reads one grammar:
  the [ordinal] [descriptors] TYPE [LABEL] [from the top|bottom|left|right|front|back]
  followed by any of:  on / in / near / above / below / left of / right of  the [ordinal] [descriptors] TYPE [LABEL]
  and any of:          about WORDS / called WORDS / by WORDS

Ordinals are words: first, second, third … tenth, last, middle, top, bottom.
LABEL is a single letter or number naming one of several, e.g. "bookcase b", "drawer 2".

TYPE must be one of: ${types.join(', ')}

Restate the user's search in that grammar, keeping its meaning. Use only the listed types.
Return JSON only: {"query": "the restated search"}. If it cannot be restated, return {"query": ""}.`
}

async function ask(system: string, user: string): Promise<string> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return ''
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 200, system, messages: [{ role: 'user', content: user }] }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    const text = Array.isArray(data?.content) ? data.content.map((b: any) => b?.text || '').join('') : ''
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    return readQuery(parsed?.query)
  } catch {
    return ''
  }
}

/* ---------------------------------------------------------------- handlers */

export const Route = createFileRoute('/api/spatial')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)

        const slug = url.searchParams.get('scene')
        if (slug) {
          await ensureSpatialSeeded()
          const [row] = await db.select({ doc: spatialScenes.doc }).from(spatialScenes).where(eq(spatialScenes.slug, slug)).limit(1)
          if (!row) return Response.json({ error: 'No space has that slug.' }, { status: 404, headers: CORS })
          return Response.json(row.doc, { headers: CORS })
        }

        if (url.searchParams.get('scenes')) {
          await ensureSpatialSeeded()
          const rows = await db
            .select({
              slug: spatialScenes.slug,
              title: spatialScenes.title,
              summary: spatialScenes.summary,
              nodeCount: spatialScenes.nodeCount,
              source: spatialScenes.source,
            })
            .from(spatialScenes)
            .orderBy(desc(spatialScenes.nodeCount))
            .limit(200)
          return Response.json({ scenes: rows }, { headers: CORS })
        }

        const q = readQuery(url.searchParams.get('q'))
        if (!q) return Response.json({ error: 'Describe what you are looking for, and where.' }, { status: 400, headers: CORS })
        return Response.json(resolve(q, await loadIndexes()), { headers: CORS })
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const action = body?.action

        if (action === 'rewrite') {
          const q = readQuery(body?.q)
          if (!q) return Response.json({ error: 'Describe what you are looking for, and where.' }, { status: 400 })
          const scenes = await loadIndexes()
          const original = resolve(q, scenes)
          const types = original.types
          const restated = await ask(rewriteSystem(types), q)
          if (!restated || restated.toLowerCase() === q.toLowerCase()) return Response.json({ ...original, rewrite: null })
          const second = resolve(restated, scenes)
          // Kept only if it finds more. A restatement that finds less is a
          // worse reading of the same words, however fluent it sounds.
          const better = second.exact.length > original.exact.length
          return Response.json(better ? { ...second, query: q, rewrite: { from: q, to: restated } } : { ...original, rewrite: null })
        }

        if (action === 'publish') {
          const checked = validateDocument(body?.doc)
          if (!checked.ok) return Response.json({ error: checked.error }, { status: 422 })
          const doc = checked.doc
          const [taken] = await db.select({ id: spatialScenes.id }).from(spatialScenes).where(eq(spatialScenes.slug, doc.slug)).limit(1)
          if (taken) return Response.json({ error: `A space called "${doc.slug}" is already indexed.` }, { status: 409 })
          const [row] = await db
            .insert(spatialScenes)
            .values({
              slug: doc.slug,
              title: doc.title,
              summary: doc.summary,
              doc,
              nodeCount: countNodes(doc.root),
              source: 'published',
              creatorSession: typeof body?.sessionId === 'string' ? body.sessionId.slice(0, 80) : '',
            })
            .returning({ slug: spatialScenes.slug, nodeCount: spatialScenes.nodeCount })
          return Response.json(row, { status: 201 })
        }

        return Response.json({ error: 'Unknown action.' }, { status: 400 })
      },
    },
  },
})
