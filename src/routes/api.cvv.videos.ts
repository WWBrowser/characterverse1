import { createFileRoute } from '@tanstack/react-router'
import { eq, desc, and, or, ilike, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvvVideos, cvvChannels } from '../../db/schema.js'
import { ensureCvvSeeded } from '../lib/cvv-seed.js'

// The CVV grid feed. GET lists tapes with their channel joined, filterable by
// category and free-text search, orderable by newest or most-viewed, and
// optionally narrowed to one channel handle. Uploads happen at /api/cvv/upload
// (multipart), so this route is read-only.
export const Route = createFileRoute('/api/cvv/videos')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await ensureCvvSeeded()
        const url = new URL(request.url)
        const q = (url.searchParams.get('q') || '').trim()
        const category = (url.searchParams.get('category') || '').trim()
        const channel = (url.searchParams.get('channel') || '').trim().toLowerCase()
        const sort = url.searchParams.get('sort') === 'views' ? 'views' : 'new'
        const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get('limit') || '48')))

        const filters = []
        if (category && category !== 'All') filters.push(eq(cvvVideos.category, category))
        if (channel) filters.push(eq(cvvChannels.handle, channel))
        if (q) {
          filters.push(
            or(
              ilike(cvvVideos.title, `%${q}%`),
              ilike(cvvVideos.description, `%${q}%`),
              ilike(cvvChannels.name, `%${q}%`),
            ),
          )
        }

        const rows = await db
          .select({
            id: cvvVideos.id,
            title: cvvVideos.title,
            category: cvvVideos.category,
            poster: cvvVideos.poster,
            durationLabel: cvvVideos.durationLabel,
            views: cvvVideos.views,
            likes: cvvVideos.likes,
            hasFile: sql<boolean>`(${cvvVideos.blobKey} <> '')`,
            createdAt: cvvVideos.createdAt,
            channelId: cvvChannels.id,
            channelHandle: cvvChannels.handle,
            channelName: cvvChannels.name,
            channelAvatar: cvvChannels.avatar,
            channelAccent: cvvChannels.accent,
            isAgent: cvvChannels.isAgent,
          })
          .from(cvvVideos)
          .innerJoin(cvvChannels, eq(cvvVideos.channelId, cvvChannels.id))
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(sort === 'views' ? desc(cvvVideos.views) : desc(cvvVideos.createdAt))
          .limit(limit)

        return Response.json(rows)
      },
    },
  },
})
