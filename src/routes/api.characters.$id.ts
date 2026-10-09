import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters } from '../../db/schema.js'
import { eq, sql } from 'drizzle-orm'

export const Route = createFileRoute('/api/characters/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [character] = await db.select().from(characters).where(eq(characters.id, id))
        if (!character) return Response.json({ error: 'Not found' }, { status: 404 })

        return Response.json(character)
      },

      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const body = await request.json()

        if (body.incrementChats) {
          await db
            .update(characters)
            .set({ totalChats: sql`${characters.totalChats} + 1` })
            .where(eq(characters.id, id))
          return Response.json({ ok: true })
        }

        // Linking a twin pair after both characters exist.
        if (typeof body.twinId === 'number' && Object.keys(body).length === 1) {
          const [linked] = await db
            .update(characters)
            .set({ twinId: body.twinId })
            .where(eq(characters.id, id))
            .returning()
          return Response.json(linked)
        }

        const { name, tagline, description, persona, greeting, avatar, category } = body
        const [updated] = await db
          .update(characters)
          .set({ name, tagline, description, persona, greeting, avatar, category })
          .where(eq(characters.id, id))
          .returning()

        return Response.json(updated)
      },

      DELETE: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        await db.delete(characters).where(eq(characters.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
