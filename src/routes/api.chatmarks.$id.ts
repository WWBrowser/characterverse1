import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { chatmarks, characters, conversations, messages } from '../../db/schema.js'
import { and, eq } from 'drizzle-orm'

// A single ChatMark, keyed by its conversation id.
// GET returns the full "document" — the mark, its character and the whole transcript —
// powering both the chat-header editor (which only needs the mark) and the FileChat
// document view (which renders the transcript). DELETE removes the mark (un-files it).
export const Route = createFileRoute('/api/chatmarks/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const conversationId = parseInt(params.id)
        if (isNaN(conversationId)) {
          return Response.json({ error: 'Invalid ID' }, { status: 400 })
        }
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || 'anon'

        const [mark] = await db
          .select()
          .from(chatmarks)
          .where(and(eq(chatmarks.conversationId, conversationId), eq(chatmarks.sessionId, sessionId)))
          .limit(1)

        const [conversation] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1)

        if (!conversation) {
          return Response.json({ mark: mark || null, character: null, messages: [] })
        }

        const [character] = await db
          .select()
          .from(characters)
          .where(eq(characters.id, conversation.characterId))
          .limit(1)

        const convMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(messages.createdAt)

        return Response.json({
          mark: mark || null,
          character: character || null,
          messages: convMessages,
          messageCount: convMessages.length,
        })
      },

      DELETE: async ({ request, params }) => {
        const conversationId = parseInt(params.id)
        if (isNaN(conversationId)) {
          return Response.json({ error: 'Invalid ID' }, { status: 400 })
        }
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || 'anon'

        await db
          .delete(chatmarks)
          .where(and(eq(chatmarks.conversationId, conversationId), eq(chatmarks.sessionId, sessionId)))

        return new Response(null, { status: 204 })
      },
    },
  },
})
