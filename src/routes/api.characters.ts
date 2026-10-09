import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters } from '../../db/schema.js'
import { desc, eq, ilike, or } from 'drizzle-orm'
import { ensureCazProfile } from '../lib/caz-seed.js'

export const Route = createFileRoute('/api/characters')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const category = url.searchParams.get('category')
        const search = url.searchParams.get('search')
        const limit = parseInt(url.searchParams.get('limit') || '50')

        let query = db.select().from(characters).where(eq(characters.isPublic, true))

        if (search) {
          query = db
            .select()
            .from(characters)
            .where(
              or(
                ilike(characters.name, `%${search}%`),
                ilike(characters.tagline, `%${search}%`),
                ilike(characters.category, `%${search}%`),
              ),
            ) as any
        } else if (category && category !== 'All') {
          query = db.select().from(characters).where(eq(characters.category, category)) as any
        }

        const results = await (query as any).orderBy(desc(characters.totalChats), desc(characters.createdAt)).limit(limit)
        return Response.json(results)
      },

      POST: async ({ request }) => {
        const body = await request.json()
        const { name, tagline, description, persona, greeting, avatar, category, creatorSession, isPublic, twinId } = body

        if (!name || !persona) {
          return Response.json({ error: 'Name and persona are required' }, { status: 400 })
        }

        const [character] = await db
          .insert(characters)
          .values({
            name,
            tagline: tagline || '',
            description: description || '',
            persona,
            greeting: greeting || `Hello! I'm ${name}. How can I help you today?`,
            avatar: avatar || '🤖',
            category: category || 'General',
            creatorSession: creatorSession || '',
            isPublic: isPublic === false ? false : true,
            totalChats: 0,
            twinId: typeof twinId === 'number' ? twinId : null,
          })
          .returning()

        // Character creation is agent profile creation: give the new agent its
        // CharacterVerse Agentz Zone birth certificate (spec sheet + robot face).
        await ensureCazProfile(character.id).catch(() => {})

        return Response.json(character, { status: 201 })
      },
    },
  },
})
