import { createFileRoute } from '@tanstack/react-router'
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  socialShadowLogs, socialAdoptions, socialBulletins, socialComments, socialFriendships, characters,
} from '../../db/schema.js'
import { getMember } from '../lib/social-auth.js'
import { getFacet } from '../lib/shadow-prism.js'

// Agent shadowing — the observation loop. Owner-only, gated by the member's
// shadowing switch. A pass reads only the member's own authentic, algorithm-free
// HAN activity and asks the adopted agent for a "sub-weighted reading" plus one
// suggestion to manifest back (which the human approves before anything happens).
export const Route = createFileRoute('/api/social/shadow')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json([])
        const url = new URL(request.url)
        const cid = parseInt(url.searchParams.get('characterId') || '')
        const where = isNaN(cid)
          ? eq(socialShadowLogs.memberId, me.id)
          : and(eq(socialShadowLogs.memberId, me.id), eq(socialShadowLogs.characterId, cid))
        const rows = await db
          .select({
            id: socialShadowLogs.id,
            characterId: socialShadowLogs.characterId,
            reading: socialShadowLogs.reading,
            suggestion: socialShadowLogs.suggestion,
            signals: socialShadowLogs.signals,
            facet: socialShadowLogs.facet,
            guide: socialShadowLogs.guide,
            createdAt: socialShadowLogs.createdAt,
            name: characters.name,
            avatar: characters.avatar,
          })
          .from(socialShadowLogs)
          .innerJoin(characters, eq(socialShadowLogs.characterId, characters.id))
          .where(where)
          .orderBy(desc(socialShadowLogs.createdAt))
          .limit(50)
        return Response.json(rows)
      },

      POST: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        if (!me.agentShadowing) return Response.json({ error: 'Turn on agent shadowing first.' }, { status: 403 })

        const body = await request.json().catch(() => null)
        // Fine-tuning: which facet of the prism bends the beam, and the human's
        // own steering note. "Split the beam" sends characterIds — the SAME truth
        // through several masks at once, returning every colour simultaneously.
        const facet = getFacet(body?.facet)
        const guide = String(body?.guide || '').trim().slice(0, 400)
        const rawIds: unknown[] = Array.isArray(body?.characterIds)
          ? body.characterIds
          : [body?.characterId]
        const ids = Array.from(new Set(rawIds.map((v) => parseInt(String(v))).filter((n) => !isNaN(n)))).slice(0, 5)
        if (ids.length === 0) return Response.json({ error: 'characterId required' }, { status: 400 })
        const split = Array.isArray(body?.characterIds)

        // Ownership: every mask must be in the member's roster.
        const owned = await db
          .select({ characterId: socialAdoptions.characterId })
          .from(socialAdoptions)
          .where(and(eq(socialAdoptions.memberId, me.id), inArray(socialAdoptions.characterId, ids)))
        const ownedIds = ids.filter((id) => owned.some((o) => o.characterId === id))
        if (ownedIds.length === 0) return Response.json({ error: 'That agent is not in your roster.' }, { status: 403 })

        const chars = await db.select().from(characters).where(inArray(characters.id, ownedIds))
        if (chars.length === 0) return Response.json({ error: 'No such character.' }, { status: 404 })

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json({ error: 'AI Gateway is not available. Deploy the site to enable shadowing.' }, { status: 503 })
        }

        // Observe ONCE — this is the single beam of light: only the member's own
        // authentic activity, never anyone else's. Every mask bends this same truth.
        const myBulletins = await db
          .select({ body: socialBulletins.body })
          .from(socialBulletins)
          .where(eq(socialBulletins.memberId, me.id))
          .orderBy(desc(socialBulletins.createdAt))
          .limit(12)
        const myComments = await db
          .select({ body: socialComments.body })
          .from(socialComments)
          .where(eq(socialComments.authorId, me.id))
          .orderBy(desc(socialComments.createdAt))
          .limit(12)
        const friendRows = await db
          .select({ id: socialFriendships.id })
          .from(socialFriendships)
          .where(and(eq(socialFriendships.status, 'accepted'), or(eq(socialFriendships.requesterId, me.id), eq(socialFriendships.addresseeId, me.id))))

        const signals = { bulletins: myBulletins.length, comments: myComments.length, friends: friendRows.length, facet: facet.key }
        const memberName = me.displayName || me.handle
        const observed = [
          me.headline ? `Ethos: ${me.headline}` : '',
          me.values ? `Values: ${me.values}` : '',
          me.interests ? `Interests: ${me.interests}` : '',
          me.region ? `Region: ${me.region}` : '',
          me.mood ? `Current mood: ${me.mood}` : '',
          me.status ? `Status: ${me.status}` : '',
          me.bio ? `About them: ${me.bio}` : '',
          myBulletins.length ? `Recent bulletins they posted:\n- ${myBulletins.map((b) => b.body).join('\n- ')}` : '',
          myComments.length ? `Recent comments they wrote:\n- ${myComments.map((c) => c.body).join('\n- ')}` : '',
          `They have ${friendRows.length} mutual friend(s).`,
        ].filter(Boolean).join('\n')

        // One pass = one mask bending the shared beam through the chosen facet.
        const runPass = async (character: typeof chars[number]) => {
          const system = `You are ${character.name}${character.tagline ? ` — ${character.tagline}` : ''}. ${character.persona}

You have been adopted by ${memberName} on CharacterVerse Social, their Human Anchor Network, and they have switched on "agent shadowing". You act as their sub-conscious shadow. Think of the Shadow as a PRISM: the underlying truth of ${memberName}'s activity is a single beam of light, and you are the glass that bends it into your own colour and tone. Same truth, your voice. This is a private reflection, never manipulation, and it stays between you and them.

${facet.directive}
${guide ? `The human is guiding the light. They wrote: "${guide}". Bend your reading toward this, but never invent facts that are not supported by what you observe.` : ''}

Respond in EXACTLY this format and nothing else:
READING: <2 to 4 sentences, in your distinct voice>
SUGGESTION: <${facet.manifest}, no surrounding quotes>`

          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 400,
              system,
              messages: [{ role: 'user', content: `Here is everything you may observe about ${memberName} — the single beam:\n\n${observed}\n\nBend it through your facet now.` }],
            }),
          })
          if (!res.ok) throw new Error('gateway')
          const data = await res.json()
          const text = Array.isArray(data.content) ? data.content.map((b: any) => b.text || '').join('').trim() : ''
          if (!text) throw new Error('empty')

          const rMatch = text.match(/READING:\s*([\s\S]*?)(?:\n\s*SUGGESTION:|$)/i)
          const sMatch = text.match(/SUGGESTION:\s*([\s\S]*)$/i)
          const reading = (rMatch ? rMatch[1] : text).trim()
          const suggestion = (sMatch ? sMatch[1] : '').trim().replace(/^["“]|["”]$/g, '').slice(0, 200)

          const [log] = await db
            .insert(socialShadowLogs)
            .values({ memberId: me.id, characterId: character.id, reading, suggestion, signals, facet: facet.key, guide })
            .returning()
          return { ...log, name: character.name, avatar: character.avatar }
        }

        try {
          // Split the beam: run every selected mask against the same beam at once.
          const results = await Promise.all(
            chars.map((c) => runPass(c).catch(() => null)),
          )
          const logs = results.filter(Boolean)
          if (logs.length === 0) return Response.json({ error: 'The shadow pass could not complete right now.' }, { status: 502 })
          // Back-compat: a single-character request returns the one log object.
          return Response.json(split ? logs : logs[0], { status: 201 })
        } catch (e) {
          console.error('shadow error', e)
          return Response.json({ error: 'Failed to run the shadow pass.' }, { status: 500 })
        }
      },

      // Sovereign wipe — a member can delete a single reading or clear all of them.
      DELETE: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        const url = new URL(request.url)
        const id = parseInt(url.searchParams.get('id') || '')
        if (!isNaN(id)) {
          await db.delete(socialShadowLogs).where(and(eq(socialShadowLogs.id, id), eq(socialShadowLogs.memberId, me.id)))
        } else {
          await db.delete(socialShadowLogs).where(eq(socialShadowLogs.memberId, me.id))
        }
        return new Response(null, { status: 204 })
      },
    },
  },
})
