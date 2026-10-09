import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters, conversations, messages } from '../../db/schema.js'
import { eq, desc, sql } from 'drizzle-orm'

// Chat History — every saved conversation for one anonymous session, newest first,
// each with its character and a preview of the last line. Conversations with no
// messages yet are skipped so the History page only lists real chats.
export const Route = createFileRoute('/api/history')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        if (!sessionId) return Response.json([])

        const rows = await db
          .select({
            conversationId: conversations.id,
            characterId: characters.id,
            name: characters.name,
            avatar: characters.avatar,
            tagline: characters.tagline,
            category: characters.category,
            messageCount: sql<number>`count(${messages.id})`,
            lastMessage: sql<string>`(select content from ${messages} m2 where m2.conversation_id = ${conversations.id} order by m2.created_at desc limit 1)`,
            lastAt: sql<string>`max(${messages.createdAt})`,
          })
          .from(conversations)
          .innerJoin(characters, eq(conversations.characterId, characters.id))
          .innerJoin(messages, eq(messages.conversationId, conversations.id))
          .where(eq(conversations.sessionId, sessionId))
          .groupBy(conversations.id, characters.id)
          .orderBy(desc(sql`max(${messages.createdAt})`))
          .limit(100)

        return Response.json(rows)
      },
    },
  },
})
