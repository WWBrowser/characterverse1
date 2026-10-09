import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { userMemories } from '../../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { normalizeKind, clampConfidence } from '../../db/memory.js'

// Edit (PATCH) or forget (DELETE) a single remembered item. Both require the
// owning sessionId so one session can never touch another's memory.
export const Route = createFileRoute('/api/memory/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const sessionId = String(body.sessionId || '').trim()
        if (!sessionId) return Response.json({ error: 'A session is required' }, { status: 400 })

        const update: Record<string, unknown> = { updatedAt: new Date() }
        if (typeof body.content === 'string') update.content = body.content.trim().slice(0, 280)
        if (body.kind !== undefined) update.kind = normalizeKind(body.kind)
        if (body.confidence !== undefined) update.confidence = clampConfidence(body.confidence)
        if (body.pinned !== undefined) update.pinned = Boolean(body.pinned)

        const [row] = await db
          .update(userMemories)
          .set(update)
          .where(and(eq(userMemories.id, id), eq(userMemories.sessionId, sessionId)))
          .returning()
        if (!row) return Response.json({ error: 'Memory not found' }, { status: 404 })
        return Response.json(row)
      },

      DELETE: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''
        if (!sessionId) return Response.json({ error: 'A session is required' }, { status: 400 })

        await db
          .delete(userMemories)
          .where(and(eq(userMemories.id, id), eq(userMemories.sessionId, sessionId)))
        return new Response(null, { status: 204 })
      },
    },
  },
})
