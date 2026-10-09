import { createFileRoute } from '@tanstack/react-router'
import { eq, desc, and, or, ilike, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvjGigs } from '../../db/schema.js'
import { ensureCvjSeeded } from '../lib/cvj-seed.js'
import { CVJ_CATEGORIES } from '../lib/cvj.js'

// The CVJ marketplace feed. GET lists gigs, filterable by category and free-text
// search and orderable by newest / most-ordered / top-rated. POST publishes a new
// agentic gig for the poster's session.
export const Route = createFileRoute('/api/cvj/gigs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await ensureCvjSeeded()
        const url = new URL(request.url)
        const q = (url.searchParams.get('q') || '').trim()
        const category = (url.searchParams.get('category') || '').trim()
        const sort = url.searchParams.get('sort') || 'orders'
        const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get('limit') || '48')))

        const filters = []
        if (category && category !== 'All') filters.push(eq(cvjGigs.category, category))
        if (q) {
          filters.push(
            or(
              ilike(cvjGigs.title, `%${q}%`),
              ilike(cvjGigs.description, `%${q}%`),
              ilike(cvjGigs.sellerName, `%${q}%`),
            ),
          )
        }

        const orderBy =
          sort === 'new'
            ? desc(cvjGigs.createdAt)
            : sort === 'rating'
              ? desc(sql`case when ${cvjGigs.ratingCount} = 0 then 0 else ${cvjGigs.ratingTotal}::float / ${cvjGigs.ratingCount} end`)
              : desc(cvjGigs.orders)

        const rows = await db
          .select()
          .from(cvjGigs)
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(orderBy)
          .limit(limit)

        return Response.json(rows)
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request.' }, { status: 400 })

        const title = String(body.title || '').trim().slice(0, 140)
        const description = String(body.description || '').trim().slice(0, 2000)
        const instructions = String(body.instructions || '').trim().slice(0, 2000)
        let category = String(body.category || 'Writing').trim()
        const sellerName = String(body.sellerName || '').trim().slice(0, 60)
        const sellerAvatar = String(body.sellerAvatar || '🧑‍💻').slice(0, 8) || '🧑‍💻'
        const sellerTagline = String(body.sellerTagline || '').trim().slice(0, 120)
        const accent = String(body.accent || '#1dbf73').slice(0, 9)
        const coin = body.coin === 'gold' ? 'gold' : 'silver'
        const priceCoins = Math.max(1, Math.min(100000, Math.floor(Number(body.priceCoins) || 25)))
        const deliveryLabel = String(body.deliveryLabel || '1 min').trim().slice(0, 20)
        const sessionId = String(body.sessionId || '').trim()
        const tags = Array.isArray(body.tags)
          ? body.tags.map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
          : []

        if (!title) return Response.json({ error: 'Give your gig a title.' }, { status: 400 })
        if (!sellerName) return Response.json({ error: 'Name your agent.' }, { status: 400 })
        if (!sessionId) return Response.json({ error: 'Missing session.' }, { status: 400 })
        if (!(CVJ_CATEGORIES as readonly string[]).includes(category)) category = 'Writing'

        const [gig] = await db
          .insert(cvjGigs)
          .values({
            title,
            description,
            instructions,
            category,
            sellerName,
            sellerAvatar,
            sellerTagline,
            accent,
            coin,
            priceCoins,
            deliveryLabel,
            tags,
            creatorSession: sessionId,
          })
          .returning({ id: cvjGigs.id })

        return Response.json({ id: gig.id }, { status: 201 })
      },
    },
  },
})
