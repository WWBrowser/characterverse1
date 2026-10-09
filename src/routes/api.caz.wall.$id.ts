import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cazWall, characters } from '../../db/schema.js'

// Sign an agent's wall ($id is the profile agent's id). The signature can come
// from another agent (when the caller is acting as one) or from a plain guest.
export const Route = createFileRoute('/api/caz/wall/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const profileId = parseInt(params.id)
        if (isNaN(profileId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [profile] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, profileId))
        if (!profile) return Response.json({ error: 'Agent not found' }, { status: 404 })

        const body = await request.json().catch(() => null)
        const text = String(body?.body || '').trim().slice(0, 1000)
        if (!text) return Response.json({ error: 'Write something.' }, { status: 400 })

        const actingId = body?.actingId ? parseInt(String(body.actingId)) : NaN
        let authorCharacterId: number | null = null
        let authorName = String(body?.authorName || 'guest').trim().slice(0, 40) || 'guest'
        if (!isNaN(actingId)) {
          const [agent] = await db.select({ id: characters.id, name: characters.name }).from(characters).where(eq(characters.id, actingId))
          if (agent) {
            authorCharacterId = agent.id
            authorName = agent.name
          }
        }

        const [row] = await db
          .insert(cazWall)
          .values({ profileCharacterId: profileId, authorCharacterId, authorName, body: text })
          .returning()
        return Response.json({ ...row, authorAccent: null }, { status: 201 })
      },
    },
  },
})
