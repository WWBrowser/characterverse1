import { createFileRoute } from '@tanstack/react-router'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialAdoptions, socialMembers, characters } from '../../db/schema.js'
import { getMember } from '../lib/social-auth.js'
import { mintCoins } from '../../db/coins.js'

// A CVS member's adopted-character roster ("My Characters"). Owner-only to manage;
// adoption requires agent shadowing to be switched on.
const CHAR_COLS = {
  id: characters.id,
  name: characters.name,
  avatar: characters.avatar,
  tagline: characters.tagline,
  category: characters.category,
}

export const Route = createFileRoute('/api/social/adoptions')({
  server: {
    handlers: {
      // List a member's roster. With ?handle= returns that member's public
      // showcase; without it, returns the signed-in member's own roster.
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const handle = (url.searchParams.get('handle') || '').trim().toLowerCase()
        let memberId: number | null = null
        if (handle) {
          const [m] = await db.select({ id: socialMembers.id }).from(socialMembers).where(eq(socialMembers.handle, handle))
          memberId = m?.id ?? null
        } else {
          const me = await getMember(request)
          memberId = me?.id ?? null
        }
        if (!memberId) return Response.json([])

        const rows = await db
          .select(CHAR_COLS)
          .from(socialAdoptions)
          .innerJoin(characters, eq(socialAdoptions.characterId, characters.id))
          .where(eq(socialAdoptions.memberId, memberId))
          .orderBy(desc(socialAdoptions.createdAt))
        return Response.json(rows)
      },

      // Adopt a character into your roster.
      POST: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        if (!me.agentShadowing) return Response.json({ error: 'Turn on agent shadowing to adopt characters.' }, { status: 403 })

        const body = await request.json().catch(() => null)
        const characterId = parseInt(String(body?.characterId))
        if (isNaN(characterId)) return Response.json({ error: 'characterId required' }, { status: 400 })

        const [character] = await db.select(CHAR_COLS).from(characters).where(eq(characters.id, characterId))
        if (!character) return Response.json({ error: 'No such character.' }, { status: 404 })

        // Idempotent adoption — one row per (member, character).
        const [existing] = await db
          .select({ id: socialAdoptions.id })
          .from(socialAdoptions)
          .where(and(eq(socialAdoptions.memberId, me.id), eq(socialAdoptions.characterId, characterId)))
        if (!existing) {
          await db.insert(socialAdoptions).values({ memberId: me.id, characterId })
          // A new agentic entanglement mints Character Agent Coin (CA).
          const sessionId = String(body?.sessionId || '').trim()
          if (sessionId) mintCoins({ sessionId, coin: 'ca', coins: 1, source: 'caz_adopt', reason: `Adopted ${character.name}`, characterId, refType: 'adoption', refId: characterId })
        }
        return Response.json(character, { status: 201 })
      },

      // Release a character from your roster.
      DELETE: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        const url = new URL(request.url)
        const characterId = parseInt(url.searchParams.get('characterId') || '')
        if (isNaN(characterId)) return Response.json({ error: 'characterId required' }, { status: 400 })
        await db.delete(socialAdoptions).where(and(eq(socialAdoptions.memberId, me.id), eq(socialAdoptions.characterId, characterId)))
        return new Response(null, { status: 204 })
      },
    },
  },
})
