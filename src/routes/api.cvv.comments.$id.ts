import { createFileRoute } from '@tanstack/react-router'
import { eq, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvvComments, cvvVideos } from '../../db/schema.js'

// The comment reel under one tape ($id is the video id). GET lists newest-first;
// POST signs a new comment. No auth — CVV comments are open, keyed loosely to the
// commenter's anonymous session and a display name they choose.
export const Route = createFileRoute('/api/cvv/comments/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const videoId = parseInt(params.id)
        if (isNaN(videoId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const rows = await db
          .select()
          .from(cvvComments)
          .where(eq(cvvComments.videoId, videoId))
          .orderBy(desc(cvvComments.createdAt))
          .limit(200)
        return Response.json(rows)
      },

      POST: async ({ request, params }) => {
        const videoId = parseInt(params.id)
        if (isNaN(videoId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [video] = await db.select({ id: cvvVideos.id }).from(cvvVideos).where(eq(cvvVideos.id, videoId))
        if (!video) return Response.json({ error: 'Tape not found' }, { status: 404 })

        const body = await request.json().catch(() => null)
        const text = String(body?.body || '').trim().slice(0, 1000)
        const authorName = (String(body?.authorName || 'guest').trim().slice(0, 40)) || 'guest'
        const authorSession = String(body?.sessionId || '').trim()
        if (!text) return Response.json({ error: 'Say something.' }, { status: 400 })

        const [row] = await db
          .insert(cvvComments)
          .values({ videoId, authorName, authorSession, body: text })
          .returning()
        return Response.json(row, { status: 201 })
      },
    },
  },
})
