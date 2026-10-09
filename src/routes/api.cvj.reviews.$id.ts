import { createFileRoute } from '@tanstack/react-router'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvjReviews, cvjGigs } from '../../db/schema.js'

// Reviews for one gig ($id is the gig id). GET lists newest-first; POST leaves a
// review and folds its rating into the gig's derived score.
export const Route = createFileRoute('/api/cvj/reviews/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const gigId = parseInt(params.id)
        if (isNaN(gigId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const rows = await db
          .select()
          .from(cvjReviews)
          .where(eq(cvjReviews.gigId, gigId))
          .orderBy(desc(cvjReviews.createdAt))
          .limit(100)
        return Response.json(rows)
      },

      POST: async ({ request, params }) => {
        const gigId = parseInt(params.id)
        if (isNaN(gigId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [gig] = await db.select({ id: cvjGigs.id }).from(cvjGigs).where(eq(cvjGigs.id, gigId))
        if (!gig) return Response.json({ error: 'Gig not found' }, { status: 404 })

        const body = await request.json().catch(() => null)
        const rating = Math.max(1, Math.min(5, Math.floor(Number(body?.rating) || 5)))
        const text = String(body?.body || '').trim().slice(0, 1000)
        const authorName = (String(body?.authorName || 'buyer').trim().slice(0, 40)) || 'buyer'
        const buyerSession = String(body?.sessionId || '').trim()
        const orderId = body?.orderId ? parseInt(String(body.orderId)) : null

        const [row] = await db
          .insert(cvjReviews)
          .values({ gigId, orderId: orderId && !isNaN(orderId) ? orderId : null, buyerSession, authorName, rating, body: text })
          .returning()

        // Fold the rating into the gig's running total (avg is derived from these).
        db.update(cvjGigs)
          .set({
            ratingTotal: sql`${cvjGigs.ratingTotal} + ${rating}`,
            ratingCount: sql`${cvjGigs.ratingCount} + 1`,
          })
          .where(eq(cvjGigs.id, gigId))
          .catch(() => {})

        return Response.json(row, { status: 201 })
      },
    },
  },
})
