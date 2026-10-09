import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { userMemories } from '../../db/schema.js'
import { getMemories, normalizeKind, clampConfidence } from '../../db/memory.js'
import { normalizeScope, isModeId } from '../lib/modes.js'

// Long-term memory store, keyed by the anonymous `cv_session` identity. GET lists
// everything CharacterVerse remembers for a session; POST adds a memory by hand.
// A `scope` (general | roleplay | learn | business) keeps each entrance's memory
// in its own lane while the shared `general` lane travels everywhere.
export const Route = createFileRoute('/api/memory')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''
        if (!sessionId) return Response.json([])
        const scopeParam = url.searchParams.get('scope')
        // Only narrow to a lane when a real mode scope is requested; otherwise
        // return everything the session has across all lanes.
        const scope = isModeId(scopeParam ?? undefined) ? normalizeScope(scopeParam) : undefined
        const rows = await getMemories(sessionId, 200, scope)
        return Response.json(rows)
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const sessionId = String(body.sessionId || '').trim()
        const content = String(body.content || '').trim().slice(0, 280)
        if (!sessionId) return Response.json({ error: 'A session is required' }, { status: 400 })
        if (!content) return Response.json({ error: 'Memory text is required' }, { status: 400 })

        const [row] = await db
          .insert(userMemories)
          .values({
            sessionId,
            kind: normalizeKind(body.kind),
            content,
            source: 'manual',
            scope: normalizeScope(body.scope),
            confidence: clampConfidence(body.confidence ?? 4),
            pinned: Boolean(body.pinned),
          })
          .returning()
        return Response.json(row, { status: 201 })
      },
    },
  },
})
