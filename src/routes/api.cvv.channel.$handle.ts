import { createFileRoute } from '@tanstack/react-router'
import { eq, desc, and } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvvChannels, cvvVideos, cvvSubscriptions } from '../../db/schema.js'
import { ensureCvvSeeded } from '../lib/cvv-seed.js'

// One channel by handle. GET returns the channel, whether the caller's session is
// subscribed, and the channel's tapes newest-first. POST toggles a subscription
// for the caller's session and keeps the channel's subscriber_count in step.
export const Route = createFileRoute('/api/cvv/channel/$handle')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await ensureCvvSeeded()
        const handle = params.handle.toLowerCase()
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''

        const [channel] = await db.select().from(cvvChannels).where(eq(cvvChannels.handle, handle))
        if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 })

        const videos = await db
          .select({
            id: cvvVideos.id,
            title: cvvVideos.title,
            category: cvvVideos.category,
            poster: cvvVideos.poster,
            durationLabel: cvvVideos.durationLabel,
            views: cvvVideos.views,
            likes: cvvVideos.likes,
            createdAt: cvvVideos.createdAt,
          })
          .from(cvvVideos)
          .where(eq(cvvVideos.channelId, channel.id))
          .orderBy(desc(cvvVideos.createdAt))

        let subscribed = false
        if (sessionId) {
          const [sub] = await db
            .select({ id: cvvSubscriptions.id })
            .from(cvvSubscriptions)
            .where(and(eq(cvvSubscriptions.channelId, channel.id), eq(cvvSubscriptions.sessionId, sessionId)))
          subscribed = !!sub
        }

        return Response.json({ channel, videos, subscribed })
      },

      POST: async ({ request, params }) => {
        const handle = params.handle.toLowerCase()
        const body = await request.json().catch(() => null)
        const sessionId = String(body?.sessionId || '').trim()
        if (!sessionId) return Response.json({ error: 'Missing session.' }, { status: 400 })

        const [channel] = await db.select().from(cvvChannels).where(eq(cvvChannels.handle, handle))
        if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 })

        const [existing] = await db
          .select({ id: cvvSubscriptions.id })
          .from(cvvSubscriptions)
          .where(and(eq(cvvSubscriptions.channelId, channel.id), eq(cvvSubscriptions.sessionId, sessionId)))

        let subscribed: boolean
        if (existing) {
          await db.delete(cvvSubscriptions).where(eq(cvvSubscriptions.id, existing.id))
          subscribed = false
        } else {
          await db.insert(cvvSubscriptions).values({ channelId: channel.id, sessionId })
          subscribed = true
        }

        const [updated] = await db
          .update(cvvChannels)
          .set({ subscriberCount: channel.subscriberCount + (subscribed ? 1 : -1) })
          .where(eq(cvvChannels.id, channel.id))
          .returning({ subscriberCount: cvvChannels.subscriberCount })

        return Response.json({ subscribed, subscriberCount: Math.max(0, updated.subscriberCount) })
      },
    },
  },
})
