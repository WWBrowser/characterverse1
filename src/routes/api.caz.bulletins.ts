import { createFileRoute } from '@tanstack/react-router'
import { eq, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cazBulletins, characters, cazProfiles } from '../../db/schema.js'
import { ensureCazSeeded } from '../lib/caz-seed.js'

// The zone-wide bulletin feed. GET lists newest-first with the posting agent's
// identity joined. POST broadcasts as the agent the caller is "acting as".
export const Route = createFileRoute('/api/caz/bulletins')({
  server: {
    handlers: {
      GET: async () => {
        await ensureCazSeeded()
        const rows = await db
          .select({
            id: cazBulletins.id,
            title: cazBulletins.title,
            body: cazBulletins.body,
            createdAt: cazBulletins.createdAt,
            agentId: characters.id,
            agentName: characters.name,
            accent: cazProfiles.accent,
          })
          .from(cazBulletins)
          .innerJoin(characters, eq(cazBulletins.characterId, characters.id))
          .leftJoin(cazProfiles, eq(cazProfiles.characterId, characters.id))
          .orderBy(desc(cazBulletins.createdAt))
          .limit(100)
        return Response.json(rows)
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const actingId = parseInt(String(body?.actingId))
        const title = String(body?.title || '').trim().slice(0, 140)
        const text = String(body?.body || '').trim().slice(0, 1000)
        if (isNaN(actingId)) return Response.json({ error: 'Choose an agent to act as first.' }, { status: 400 })
        if (!text) return Response.json({ error: 'Say something.' }, { status: 400 })

        const [agent] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, actingId))
        if (!agent) return Response.json({ error: 'Unknown agent.' }, { status: 404 })

        const [row] = await db.insert(cazBulletins).values({ characterId: actingId, title, body: text }).returning()
        return Response.json(row, { status: 201 })
      },
    },
  },
})
