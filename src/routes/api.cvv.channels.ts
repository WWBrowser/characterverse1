import { createFileRoute } from '@tanstack/react-router'
import { desc, sql, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvvChannels, cvvVideos } from '../../db/schema.js'
import { ensureCvvSeeded } from '../lib/cvv-seed.js'

// The channel directory — every broadcaster with its tape count and total views,
// most-subscribed first. Powers the "Channels" strip on the CVV home.
export const Route = createFileRoute('/api/cvv/channels')({
  server: {
    handlers: {
      GET: async () => {
        await ensureCvvSeeded()
        const rows = await db
          .select({
            id: cvvChannels.id,
            handle: cvvChannels.handle,
            name: cvvChannels.name,
            tagline: cvvChannels.tagline,
            avatar: cvvChannels.avatar,
            accent: cvvChannels.accent,
            isAgent: cvvChannels.isAgent,
            subscriberCount: cvvChannels.subscriberCount,
            videoCount: sql<number>`count(${cvvVideos.id})::int`,
            totalViews: sql<number>`coalesce(sum(${cvvVideos.views}), 0)::int`,
          })
          .from(cvvChannels)
          .leftJoin(cvvVideos, eq(cvvVideos.channelId, cvvChannels.id))
          .groupBy(cvvChannels.id)
          .orderBy(desc(cvvChannels.subscriberCount))
          .limit(60)
        return Response.json(rows)
      },
    },
  },
})
