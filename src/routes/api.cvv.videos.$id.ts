import { createFileRoute } from '@tanstack/react-router'
import { eq, sql } from 'drizzle-orm'
import { getStore } from '@netlify/blobs'
import { db } from '../../db/index.js'
import { cvvVideos, cvvChannels } from '../../db/schema.js'
import { mintCoins } from '../../db/coins.js'

// A single tape. GET returns the full watch payload (video + its channel) and
// counts a view. PATCH { action:'like' } bumps the like counter. DELETE removes
// the tape and, when it has one, its underlying blob — owner-gated by session.
export const Route = createFileRoute('/api/cvv/videos/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [row] = await db
          .select()
          .from(cvvVideos)
          .innerJoin(cvvChannels, eq(cvvVideos.channelId, cvvChannels.id))
          .where(eq(cvvVideos.id, id))
        if (!row) return Response.json({ error: 'Tape not found' }, { status: 404 })

        // Count the view (fire-and-forget so the read stays fast).
        db.update(cvvVideos)
          .set({ views: sql`${cvvVideos.views} + 1` })
          .where(eq(cvvVideos.id, id))
          .catch(() => {})

        // Each view mints Character Video Coin (CV) to the tape's creator.
        if (row.cvv_videos.creatorSession) {
          mintCoins({ sessionId: row.cvv_videos.creatorSession, coin: 'cv', coins: 1, source: 'cvv_view', reason: row.cvv_videos.title, refType: 'cvv_video', refId: id })
        }

        return Response.json({
          video: { ...row.cvv_videos, views: row.cvv_videos.views + 1 },
          channel: row.cvv_channels,
        })
      },

      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const body = await request.json().catch(() => ({}))
        if (body?.action !== 'like') return Response.json({ error: 'Unknown action' }, { status: 400 })
        const [row] = await db
          .update(cvvVideos)
          .set({ likes: sql`${cvvVideos.likes} + 1` })
          .where(eq(cvvVideos.id, id))
          .returning({ likes: cvvVideos.likes })
        if (!row) return Response.json({ error: 'Tape not found' }, { status: 404 })
        return Response.json({ likes: row.likes })
      },

      DELETE: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''

        const [video] = await db.select().from(cvvVideos).where(eq(cvvVideos.id, id))
        if (!video) return new Response(null, { status: 204 })
        if (!sessionId || video.creatorSession !== sessionId) {
          return Response.json({ error: 'Only the uploader can remove this tape.' }, { status: 403 })
        }

        if (video.blobKey) {
          await getStore('cvv-videos').delete(video.blobKey).catch(() => {})
        }
        await db.delete(cvvVideos).where(eq(cvvVideos.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
