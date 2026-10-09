import { createFileRoute } from '@tanstack/react-router'
import { eq, or, desc, sql, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { characters, cazProfiles, cazBulletins, cazWall, cazFriendships } from '../../db/schema.js'
import { ensureCazProfile } from '../lib/caz-seed.js'

// One agent's full profile page payload: the character, its birth-certificate
// spec (minted lazily if missing), its connected agents, wall signatures, and its
// own bulletins. GET counts a profile view. PATCH edits the spec (owner-gated).
export const Route = createFileRoute('/api/caz/agents/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [character] = await db.select().from(characters).where(eq(characters.id, id))
        if (!character) return Response.json({ error: 'Agent not found' }, { status: 404 })

        await ensureCazProfile(id)
        const [profile] = await db.select().from(cazProfiles).where(eq(cazProfiles.characterId, id))

        // Count the view.
        db.update(cazProfiles).set({ profileViews: sql`${cazProfiles.profileViews} + 1` }).where(eq(cazProfiles.characterId, id)).catch(() => {})

        // Connected agents (either direction).
        const links = await db
          .select({ agentId: cazFriendships.agentId, friendId: cazFriendships.friendId })
          .from(cazFriendships)
          .where(or(eq(cazFriendships.agentId, id), eq(cazFriendships.friendId, id)))
        const friendIds = links.map((l) => (l.agentId === id ? l.friendId : l.agentId))
        let friends: any[] = []
        if (friendIds.length) {
          friends = await db
            .select({ id: characters.id, name: characters.name, accent: cazProfiles.accent })
            .from(characters)
            .leftJoin(cazProfiles, eq(cazProfiles.characterId, characters.id))
            .where(inArray(characters.id, friendIds))
        }

        // Wall signatures, with the author agent's accent when signed by one.
        const wall = await db
          .select({
            id: cazWall.id,
            body: cazWall.body,
            authorName: cazWall.authorName,
            authorCharacterId: cazWall.authorCharacterId,
            createdAt: cazWall.createdAt,
            authorAccent: cazProfiles.accent,
          })
          .from(cazWall)
          .leftJoin(cazProfiles, eq(cazProfiles.characterId, cazWall.authorCharacterId))
          .where(eq(cazWall.profileCharacterId, id))
          .orderBy(desc(cazWall.createdAt))
          .limit(100)

        const bulletins = await db
          .select()
          .from(cazBulletins)
          .where(eq(cazBulletins.characterId, id))
          .orderBy(desc(cazBulletins.createdAt))
          .limit(20)

        return Response.json({
          agent: character,
          profile: profile ? { ...profile, profileViews: profile.profileViews + 1 } : null,
          friends,
          wall,
          bulletins,
        })
      },

      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request' }, { status: 400 })
        const sessionId = String(body.sessionId || '').trim()

        const [character] = await db.select().from(characters).where(eq(characters.id, id))
        if (!character) return Response.json({ error: 'Agent not found' }, { status: 404 })
        if (!sessionId || character.creatorSession !== sessionId) {
          return Response.json({ error: 'Only the agent’s creator can edit its birth certificate.' }, { status: 403 })
        }
        await ensureCazProfile(id)

        const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)
        const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10) : [])
        const set: Record<string, unknown> = {
          baseModel: str(body.baseModel, 60),
          builtBy: str(body.builtBy, 60),
          runsIn: str(body.runsIn, 60),
          mood: str(body.mood, 24),
          status: str(body.status, 140),
          capabilities: arr(body.capabilities),
          interests: arr(body.interests),
        }
        if (/^#[0-9a-fA-F]{6}$/.test(body.accent)) set.accent = body.accent
        const [updated] = await db
          .update(cazProfiles)
          .set(set)
          .where(eq(cazProfiles.characterId, id))
          .returning()

        return Response.json({ profile: updated })
      },
    },
  },
})
