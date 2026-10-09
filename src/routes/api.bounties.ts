import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { bounties, bountyFeedback, characters } from '../../db/schema.js'
import { eq, desc, inArray, sql } from 'drizzle-orm'

// Character Testing Bounties API — the quality-assurance layer.
//
//   GET  /api/bounties                    → open bounties (browse to test)
//   GET  /api/bounties?creatorSession=X   → a creator's own bounties (any status)
//   GET  /api/bounties?characterId=N      → bounties for one character
//   POST /api/bounties                    → create a bounty
//
// Each bounty is enriched with its character and a feedback summary so the
// listing pages don't need a second round-trip.

export const Route = createFileRoute('/api/bounties')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const creatorSession = url.searchParams.get('creatorSession')
        const characterIdParam = url.searchParams.get('characterId')

        let rows
        if (creatorSession) {
          rows = await db
            .select()
            .from(bounties)
            .where(eq(bounties.creatorSession, creatorSession))
            .orderBy(desc(bounties.createdAt))
        } else if (characterIdParam && !isNaN(Number(characterIdParam))) {
          rows = await db
            .select()
            .from(bounties)
            .where(eq(bounties.characterId, Number(characterIdParam)))
            .orderBy(desc(bounties.createdAt))
        } else {
          rows = await db
            .select()
            .from(bounties)
            .where(eq(bounties.status, 'open'))
            .orderBy(desc(bounties.createdAt))
        }

        if (rows.length === 0) return Response.json([])

        // Enrich with character + feedback summary in two batched queries.
        const charIds = [...new Set(rows.map((b) => b.characterId))]
        const bountyIds = rows.map((b) => b.id)

        const chars = await db.select().from(characters).where(inArray(characters.id, charIds))
        const charMap = new Map(chars.map((c) => [c.id, c]))

        const summary = await db
          .select({
            bountyId: bountyFeedback.bountyId,
            count: sql<number>`count(*)::int`,
            accepted: sql<number>`count(*) filter (where ${bountyFeedback.status} <> 'pending')::int`,
            avgRating: sql<number>`coalesce(avg(${bountyFeedback.rating}), 0)`,
          })
          .from(bountyFeedback)
          .where(inArray(bountyFeedback.bountyId, bountyIds))
          .groupBy(bountyFeedback.bountyId)
        const summaryMap = new Map(summary.map((s) => [s.bountyId, s]))

        const enriched = rows.map((b) => {
          const c = charMap.get(b.characterId)
          const s = summaryMap.get(b.id)
          return {
            ...b,
            character: c
              ? { id: c.id, name: c.name, avatar: c.avatar, category: c.category, tagline: c.tagline }
              : null,
            feedbackCount: s?.count ?? 0,
            acceptedCount: s?.accepted ?? 0,
            avgRating: s ? Number(s.avgRating) : 0,
          }
        })

        return Response.json(enriched)
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const characterId = Number(body.characterId)
        if (!characterId) return Response.json({ error: 'characterId is required' }, { status: 400 })

        const [character] = await db.select().from(characters).where(eq(characters.id, characterId))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        const rewardCc = Math.max(1, Math.min(1000, Math.floor(Number(body.rewardCc) || 10)))
        const testerLimit = Math.max(1, Math.min(100, Math.floor(Number(body.testerLimit) || 5)))

        const [created] = await db
          .insert(bounties)
          .values({
            characterId,
            creatorSession: String(body.creatorSession || ''),
            title: String(body.title || '').slice(0, 200),
            brief: String(body.brief || '').slice(0, 2000),
            rewardCc,
            testerLimit,
            status: 'open',
          })
          .returning()

        return Response.json(created, { status: 201 })
      },
    },
  },
})
