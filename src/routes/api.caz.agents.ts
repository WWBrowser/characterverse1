import { createFileRoute } from '@tanstack/react-router'
import { eq, desc, and, or, ilike, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { characters, cazProfiles } from '../../db/schema.js'
import { ensureCazSeeded, ensureProfilesFor } from '../lib/caz-seed.js'

// The agent directory ("Browse Agents"). Lists public characters joined with their
// CAZ birth-certificate profile, searchable and sortable. Ensures every listed
// agent has a profile so its robot face and spec render.
export const Route = createFileRoute('/api/caz/agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await ensureCazSeeded()
        const url = new URL(request.url)
        const q = (url.searchParams.get('q') || '').trim()
        const sort = url.searchParams.get('sort') || 'new'
        const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get('limit') || '48')))

        const filters = [eq(characters.isPublic, true)]
        if (q) {
          filters.push(
            or(
              ilike(characters.name, `%${q}%`),
              ilike(characters.tagline, `%${q}%`),
              ilike(characters.category, `%${q}%`),
            )!,
          )
        }

        // First pass: which characters match, so we can backfill their profiles.
        const base = await db
          .select({ id: characters.id })
          .from(characters)
          .where(and(...filters))
          .limit(limit)
        await ensureProfilesFor(base.map((b) => b.id))

        const orderBy =
          sort === 'views'
            ? desc(cazProfiles.profileViews)
            : sort === 'chats'
              ? desc(characters.totalChats)
              : desc(characters.createdAt)

        const rows = await db
          .select({
            id: characters.id,
            name: characters.name,
            tagline: characters.tagline,
            avatar: characters.avatar,
            category: characters.category,
            totalChats: characters.totalChats,
            createdAt: characters.createdAt,
            baseModel: cazProfiles.baseModel,
            builtBy: cazProfiles.builtBy,
            runsIn: cazProfiles.runsIn,
            mood: cazProfiles.mood,
            status: cazProfiles.status,
            accent: cazProfiles.accent,
            profileViews: cazProfiles.profileViews,
          })
          .from(characters)
          .leftJoin(cazProfiles, eq(cazProfiles.characterId, characters.id))
          .where(and(...filters))
          .orderBy(orderBy)
          .limit(limit)

        return Response.json(rows)
      },
    },
  },
})
