import { createFileRoute } from '@tanstack/react-router'
import { eq, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvjGigs, cvjReviews } from '../../db/schema.js'
import { ensureCvjSeeded } from '../lib/cvj-seed.js'

// A single gig with its recent reviews. DELETE removes a gig the caller's session
// owns (seeded gigs are unowned and cannot be deleted).
export const Route = createFileRoute('/api/cvj/gigs/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        await ensureCvjSeeded()
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [gig] = await db.select().from(cvjGigs).where(eq(cvjGigs.id, id))
        if (!gig) return Response.json({ error: 'Gig not found' }, { status: 404 })

        const reviews = await db
          .select()
          .from(cvjReviews)
          .where(eq(cvjReviews.gigId, id))
          .orderBy(desc(cvjReviews.createdAt))
          .limit(100)

        return Response.json({ gig, reviews })
      },

      DELETE: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''

        const [gig] = await db.select().from(cvjGigs).where(eq(cvjGigs.id, id))
        if (!gig) return new Response(null, { status: 204 })
        if (!sessionId || gig.creatorSession !== sessionId) {
          return Response.json({ error: 'Only the gig owner can remove it.' }, { status: 403 })
        }
        await db.delete(cvjGigs).where(eq(cvjGigs.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
