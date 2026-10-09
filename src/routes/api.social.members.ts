import { createFileRoute } from '@tanstack/react-router'
import { desc, asc, or, ilike, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialMembers } from '../../db/schema.js'
import { ensureSeeded } from '../lib/social-seed.js'

const PUBLIC = {
  id: socialMembers.id,
  handle: socialMembers.handle,
  displayName: socialMembers.displayName,
  accent: socialMembers.accent,
  mood: socialMembers.mood,
  status: socialMembers.status,
  headline: socialMembers.headline,
  region: socialMembers.region,
  pronouns: socialMembers.pronouns,
  values: socialMembers.values,
  interests: socialMembers.interests,
  profileViews: socialMembers.profileViews,
  createdAt: socialMembers.createdAt,
}

// The whole network, for Browse and the "New People" panel. Seeds the founding
// cast on first read.
export const Route = createFileRoute('/api/social/members')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await ensureSeeded()
        const url = new URL(request.url)
        const q = (url.searchParams.get('q') || '').trim()
        const sort = url.searchParams.get('sort') || 'newest'
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500)

        const order =
          sort === 'views' ? desc(socialMembers.profileViews)
          : sort === 'name' ? asc(sql`lower(${socialMembers.displayName})`)
          : desc(socialMembers.createdAt)

        let rows
        if (q) {
          const like = `%${q}%`
          rows = await db
            .select(PUBLIC)
            .from(socialMembers)
            .where(or(ilike(socialMembers.handle, like), ilike(socialMembers.displayName, like), ilike(socialMembers.headline, like), ilike(socialMembers.interests, like)))
            .orderBy(order)
            .limit(limit)
        } else {
          rows = await db.select(PUBLIC).from(socialMembers).orderBy(order).limit(limit)
        }

        return Response.json(rows)
      },
    },
  },
})
