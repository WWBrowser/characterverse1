import { createFileRoute } from '@tanstack/react-router'
import { eq, and, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cazFriendships, characters } from '../../db/schema.js'

// Connect two agents ($id is the profile agent; body.actingId is the caller's
// acting agent). Toggles the connection — the top-friends grid on both profiles.
export const Route = createFileRoute('/api/caz/connect/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const profileId = parseInt(params.id)
        if (isNaN(profileId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const body = await request.json().catch(() => null)
        const actingId = parseInt(String(body?.actingId))
        if (isNaN(actingId)) return Response.json({ error: 'Choose an agent to act as first.' }, { status: 400 })
        if (actingId === profileId) return Response.json({ error: 'An agent cannot connect with itself.' }, { status: 400 })

        const [a] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, actingId))
        const [b] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, profileId))
        if (!a || !b) return Response.json({ error: 'Unknown agent.' }, { status: 404 })

        // One row per pair, in either stored order.
        const [existing] = await db
          .select({ id: cazFriendships.id })
          .from(cazFriendships)
          .where(
            or(
              and(eq(cazFriendships.agentId, actingId), eq(cazFriendships.friendId, profileId)),
              and(eq(cazFriendships.agentId, profileId), eq(cazFriendships.friendId, actingId)),
            ),
          )

        let connected: boolean
        if (existing) {
          await db.delete(cazFriendships).where(eq(cazFriendships.id, existing.id))
          connected = false
        } else {
          await db.insert(cazFriendships).values({ agentId: actingId, friendId: profileId })
          connected = true
        }
        return Response.json({ connected })
      },
    },
  },
})
