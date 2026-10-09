import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters, conversations, messages } from '../../db/schema.js'
import { and, desc, eq, sql } from 'drizzle-orm'
import { recordEngagement } from '../../db/stats.js'
import { meterChatInference } from '../../db/coins.js'
import { characterTrace } from '../../db/rooms.js'

// Twin Chat backend. A twin pair is two characters linked via `twinId`.
// This route powers the "Together" mode — a single shared conversation where
// both twins reply in turn. (The "Side by side" mode reuses /api/chat/$id per
// twin, so it is not handled here.)

type Char = typeof characters.$inferSelect

async function getOrCreateConversation(characterId: number, sessionId: string) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.characterId, characterId), eq(conversations.sessionId, sessionId)))
    .orderBy(desc(conversations.createdAt))
    .limit(1)
  if (existing) return existing
  const [created] = await db.insert(conversations).values({ characterId, sessionId }).returning()
  return created
}

// The "together" thread lives in its own conversation namespace so it never
// collides with each twin's individual side-by-side conversation.
const togetherSession = (sessionId: string) => `twin:${sessionId}`

function buildTwinSystemPrompt(speaker: Char, partner: Char) {
  return `You are ${speaker.name}${speaker.tagline ? ` — ${speaker.tagline}` : ''}.

${speaker.persona}

${speaker.description ? `Background: ${speaker.description}` : ''}

You are in a shared group chat together with your twin, ${partner.name}, and a human user.
Instructions:
- Stay completely in character as ${speaker.name}; never speak for ${partner.name} or the user.
- React naturally to what ${partner.name} and the user just said — you can agree, tease, or build on it.
- Keep your reply concise (1-3 sentences) and conversational.
- Reply with ${speaker.name}'s words only — no name prefix, no narration.`
}

async function generateReply(speaker: Char, partner: Char, transcript: string) {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) throw new Error('gateway-unavailable')

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: buildTwinSystemPrompt(speaker, partner),
      messages: [
        {
          role: 'user',
          content: `Group chat so far:\n${transcript}\n\nReply as ${speaker.name}:`,
        },
      ],
    }),
  })
  if (!res.ok) throw new Error('gateway-error')
  const data = await res.json()
  const text = Array.isArray(data.content) ? data.content.map((b: any) => b.text || '').join('') : ''
  return text.trim()
}

export const Route = createFileRoute('/api/twinchat/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || 'anon'

        const [a] = await db.select().from(characters).where(eq(characters.id, id))
        if (!a) return Response.json({ error: 'Character not found' }, { status: 404 })
        if (!a.twinId) return Response.json({ error: 'This character is not part of a twin pair' }, { status: 400 })

        const [b] = await db.select().from(characters).where(eq(characters.id, a.twinId))
        if (!b) return Response.json({ error: 'Twin partner not found' }, { status: 404 })

        const [convA, convB, togetherConv] = await Promise.all([
          getOrCreateConversation(a.id, sessionId),
          getOrCreateConversation(b.id, sessionId),
          getOrCreateConversation(a.id, togetherSession(sessionId)),
        ])

        const togetherMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, togetherConv.id))
          .orderBy(messages.createdAt)

        return Response.json({
          a,
          b,
          convAId: convA.id,
          convBId: convB.id,
          togetherConvId: togetherConv.id,
          togetherMessages,
        })
      },

      POST: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const togetherConvId = Number(body.togetherConvId)
        const message = String(body.message || '').trim()
        if (!togetherConvId || !message) {
          return Response.json({ error: 'A conversation id and message are required' }, { status: 400 })
        }

        const [a] = await db.select().from(characters).where(eq(characters.id, id))
        if (!a) return Response.json({ error: 'Character not found' }, { status: 404 })
        if (!a.twinId) return Response.json({ error: 'This character is not part of a twin pair' }, { status: 400 })
        const [b] = await db.select().from(characters).where(eq(characters.id, a.twinId))
        if (!b) return Response.json({ error: 'Twin partner not found' }, { status: 404 })

        if (!process.env.ANTHROPIC_BASE_URL || !process.env.ANTHROPIC_API_KEY) {
          return Response.json(
            { error: 'AI Gateway is not available. Deploy the site to enable Twin Chat replies.' },
            { status: 503 },
          )
        }

        // Persist the user's message into the shared thread.
        await db.insert(messages).values({ conversationId: togetherConvId, role: 'user', content: message })

        // Rebuild the running transcript from the database (source of truth).
        const history = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, togetherConvId))
          .orderBy(messages.createdAt)

        const label = (m: { role: string; speakerCharacterId: number | null }) =>
          m.role === 'user' ? 'User' : m.speakerCharacterId === b.id ? b.name : a.name

        const lines = history.map((m) => `${label(m)}: ${m.content}`)
        const replies: { characterId: number; name: string; avatar: string; text: string }[] = []

        // Both twins' rooms (SpatialVerse Rooms). Content-free, like every room:
        // counts and steps, never the conversation.
        const words = (t: string) => (t.match(/\S+/g) || []).length
        const roomA = characterTrace(a, 'chat')
        const roomB = characterTrace(b, 'chat')
        for (const [room, partner] of [[roomA, b], [roomB, a]] as const) {
          room.step('dispatch', `A message came in for the twins — ${words(message)} words`)
          room.step('memory', `Read the shared thread — ${history.length} ${history.length === 1 ? 'line' : 'lines'}, with ${partner.name}`, 'done')
        }
        roomB.step('rest', `Waiting for ${a.name} to speak first`, 'waiting')

        try {
          // Twin A replies first, then twin B responds with A's line in context.
          roomA.step('synthesis', `Drafting — first to speak, with ${b.name}`)
          const aText = await generateReply(a, b, lines.join('\n'))
          roomA.step('synthesis', `Drafted ${words(aText)} words`, 'done')
          roomA.step('delivery', 'Line delivered to the shared thread', 'done')
          roomA.step('rest', 'Back in the armchair', 'idle')
          await db.insert(messages).values({
            conversationId: togetherConvId,
            role: 'assistant',
            content: aText,
            speakerCharacterId: a.id,
          })
          lines.push(`${a.name}: ${aText}`)
          replies.push({ characterId: a.id, name: a.name, avatar: a.avatar, text: aText })

          roomB.step('synthesis', `Drafting — answering ${a.name}`)
          const bText = await generateReply(b, a, lines.join('\n'))
          roomB.step('synthesis', `Drafted ${words(bText)} words`, 'done')
          roomB.step('delivery', 'Line delivered to the shared thread', 'done')
          roomB.step('rest', 'Back in the armchair', 'idle')
          await db.insert(messages).values({
            conversationId: togetherConvId,
            role: 'assistant',
            content: bText,
            speakerCharacterId: b.id,
          })
          replies.push({ characterId: b.id, name: b.name, avatar: b.avatar, text: bText })
        } catch {
          for (const room of replies.length ? [roomB] : [roomA, roomB]) {
            room.step('synthesis', 'Could not draft a line', 'error')
            room.step('rest', 'Back in the armchair', 'idle')
          }
          if (replies.length === 0) {
            return Response.json({ error: 'Twin Chat could not generate a reply right now.' }, { status: 502 })
          }
        }

        // Count the exchange toward both twins' chat totals.
        db.update(characters).set({ totalChats: sql`${characters.totalChats} + 1` }).where(eq(characters.id, a.id)).catch(() => {})
        db.update(characters).set({ totalChats: sql`${characters.totalChats} + 1` }).where(eq(characters.id, b.id)).catch(() => {})
        // Twin "together" is a Conference Cluster exchange — +3 CC / message each.
        recordEngagement(a.id, 'conference')
        recordEngagement(b.id, 'conference')

        // Both twin replies burn CVC gas, same as any other inference. The
        // account is read back off the shared conversation (its session is the
        // chatter's, prefixed with 'twin:'). Metering is fire-and-forget: it
        // must never block or delay a reply.
        void (async () => {
          const [conv] = await db
            .select({ sessionId: conversations.sessionId })
            .from(conversations)
            .where(eq(conversations.id, togetherConvId))
          const chatter = (conv?.sessionId || '').replace(/^twin:/, '')
          if (!chatter) return
          for (const r of replies) {
            await meterChatInference({
              sessionId: chatter,
              characterId: r.characterId,
              characterName: r.name,
              conversationId: togetherConvId,
            })
          }
        })().catch(() => {})

        return Response.json({ replies })
      },
    },
  },
})
