import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { auditTrims, conversations, messages } from '../../db/schema.js'
import { and, eq, gt, desc } from 'drizzle-orm'

// Trims API — the quality-control gate before FileChat permanence.
//
//   GET  /api/trims?conversationId=N  → trims recorded for one conversation
//   POST /api/trims                   → revert a conversation to an earlier
//                                        message, moving the trailing messages
//                                        into the gated audit trail.
//
// "Trim the fat before posting the work to FileChat." Reverting to message #N
// removes everything after it from the live transcript (so the filed copy is
// clean) but preserves the removed messages in audit_trims — visible only to
// the boss and auditors, and searchable by AuditClaw.
export const Route = createFileRoute('/api/trims')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const conversationIdParam = url.searchParams.get('conversationId')
        if (!conversationIdParam || isNaN(Number(conversationIdParam))) {
          return Response.json({ error: 'conversationId is required' }, { status: 400 })
        }
        const conversationId = Number(conversationIdParam)
        const rows = await db
          .select()
          .from(auditTrims)
          .where(eq(auditTrims.conversationId, conversationId))
          .orderBy(desc(auditTrims.createdAt))
        return Response.json(rows)
      },

      // Body: { conversationId, keepMessageId, sessionId?, reason? }
      // Trims every message *after* keepMessageId (by chronological order).
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const conversationId = Number(body.conversationId)
        const keepMessageId = Number(body.keepMessageId)
        const sessionId = String(body.sessionId || 'anon')
        const reason = String(body.reason || '').trim().slice(0, 500)
        if (!conversationId || !keepMessageId) {
          return Response.json(
            { error: 'conversationId and keepMessageId are required' },
            { status: 400 },
          )
        }

        const [conversation] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1)
        if (!conversation) {
          return Response.json({ error: 'Conversation not found' }, { status: 404 })
        }

        // Load the full transcript in order to find the cut point.
        const all = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(messages.createdAt, messages.id)

        const cutIndex = all.findIndex((m) => m.id === keepMessageId)
        if (cutIndex === -1) {
          return Response.json({ error: 'keepMessageId not in this conversation' }, { status: 400 })
        }

        const removed = all.slice(cutIndex + 1)
        if (removed.length === 0) {
          return Response.json({ error: 'Nothing to trim after that message' }, { status: 400 })
        }

        // Preserve the removed messages in the gated audit trail.
        const trimmedMessages = removed.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
        }))

        const [trim] = await db
          .insert(auditTrims)
          .values({
            conversationId,
            characterId: conversation.characterId,
            sessionId,
            keptCount: cutIndex + 1,
            trimmedMessages,
            reason,
          })
          .returning()

        // Remove the trailing messages from the live transcript so FileChat
        // shows only the clean, vetted prefix.
        const cutTime = all[cutIndex].createdAt
        if (cutTime) {
          await db
            .delete(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                gt(messages.createdAt, cutTime as any),
              ),
            )
        }
        // Safety net for any message sharing the exact cut timestamp.
        for (const m of removed) {
          await db.delete(messages).where(eq(messages.id, m.id)).catch(() => {})
        }

        return Response.json({ trim, keptCount: cutIndex + 1, trimmedCount: removed.length })
      },
    },
  },
})
