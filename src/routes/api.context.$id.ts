import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { contextEntries } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { sanitizeContextInput } from '../lib/controltower.js'

// A single Context Engine entry.
//
//   PATCH  /api/context/$id   → edit the entry (full sanitized replace of fields)
//   DELETE /api/context/$id   → remove it

export const Route = createFileRoute('/api/context/$id')({
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

        const clean = sanitizeContextInput(body)
        if (!clean.ok) return Response.json({ error: clean.error }, { status: 400 })

        const [updated] = await db
          .update(contextEntries)
          .set({ ...clean.value, updatedAt: new Date() })
          .where(eq(contextEntries.id, id))
          .returning()

        if (!updated) return Response.json({ error: 'Entry not found' }, { status: 404 })
        return Response.json({ entry: updated })
      },

      DELETE: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        await db.delete(contextEntries).where(eq(contextEntries.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
