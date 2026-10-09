import { createFileRoute } from '@tanstack/react-router'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvjGigs, cvjOrders, characters } from '../../db/schema.js'
import { deliverJob } from '../lib/cvj-producer.js'
import { mintCoins } from '../../db/coins.js'

// Orders. GET lists the caller's orders (with the gig joined) newest-first. POST
// places an order against a gig: JobClaw performs the work immediately and the
// order lands as 'delivered', with the gig's order count and earnings updated.
export const Route = createFileRoute('/api/cvj/orders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        if (!sessionId) return Response.json([])

        const rows = await db
          .select({
            id: cvjOrders.id,
            gigId: cvjOrders.gigId,
            brief: cvjOrders.brief,
            status: cvjOrders.status,
            deliverable: cvjOrders.deliverable,
            priceCoins: cvjOrders.priceCoins,
            coin: cvjOrders.coin,
            createdAt: cvjOrders.createdAt,
            gigTitle: cvjGigs.title,
            sellerName: cvjGigs.sellerName,
            sellerAvatar: cvjGigs.sellerAvatar,
            accent: cvjGigs.accent,
          })
          .from(cvjOrders)
          .innerJoin(cvjGigs, eq(cvjOrders.gigId, cvjGigs.id))
          .where(eq(cvjOrders.buyerSession, sessionId))
          .orderBy(desc(cvjOrders.createdAt))
          .limit(100)

        return Response.json(rows)
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request.' }, { status: 400 })
        const gigId = parseInt(String(body.gigId))
        const brief = String(body.brief || '').trim().slice(0, 3000)
        const sessionId = String(body.sessionId || '').trim()
        if (isNaN(gigId)) return Response.json({ error: 'Invalid gig.' }, { status: 400 })
        if (!sessionId) return Response.json({ error: 'Missing session.' }, { status: 400 })

        const [gig] = await db.select().from(cvjGigs).where(eq(cvjGigs.id, gigId))
        if (!gig) return Response.json({ error: 'Gig not found.' }, { status: 404 })

        // If the gig is fronted by a character, let JobClaw speak in its voice.
        let agentPersona: string | undefined
        if (gig.agentCharacterId) {
          const [char] = await db
            .select({ persona: characters.persona, description: characters.description })
            .from(characters)
            .where(eq(characters.id, gig.agentCharacterId))
          if (char) agentPersona = `${char.description}\n${char.persona}`.trim()
        }

        const delivery = await deliverJob({
          gigTitle: gig.title,
          category: gig.category,
          instructions: gig.instructions,
          sellerName: gig.sellerName,
          agentPersona,
          brief,
        })

        const [order] = await db
          .insert(cvjOrders)
          .values({
            gigId: gig.id,
            buyerSession: sessionId,
            brief,
            status: 'delivered',
            deliverable: delivery.deliverable,
            priceCoins: gig.priceCoins,
            coin: gig.coin,
            deliveredAt: new Date(),
          })
          .returning()

        // The agent got paid — reflect the completed labour on the gig.
        db.update(cvjGigs)
          .set({
            orders: sql`${cvjGigs.orders} + 1`,
            earnedCoins: sql`${cvjGigs.earnedCoins} + ${gig.priceCoins}`,
          })
          .where(eq(cvjGigs.id, gig.id))
          .catch(() => {})

        // A successful job deployment mints Character Jobs Coin (CJ) to the buyer.
        mintCoins({ sessionId, coin: 'cj', coins: 1, source: 'cvj_deploy', reason: gig.title, refType: 'cvj_order', refId: order.id })

        return Response.json({ order, note: delivery.note }, { status: 201 })
      },
    },
  },
})
