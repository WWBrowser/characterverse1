import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { chatmarks, characters, messages } from '../../db/schema.js'
import { and, eq, desc, ilike, sql, inArray } from 'drizzle-orm'

// ChatMarks API — the persistence behind ChatCabinet (active workspace) and
// FileChat (the searchable archive). A mark is one bookmark per conversation.
export const Route = createFileRoute('/api/chatmarks')({
  server: {
    handlers: {
      // List + filter + search the session's marks. Each result is enriched with
      // its character, message count, last activity and a short preview snippet so
      // ChatCabinet and FileChat can render rich cards without extra round trips.
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || 'anon'
        const q = (url.searchParams.get('q') || '').trim()
        const characterTag = (url.searchParams.get('characterTag') || '').trim()
        const jobTag = (url.searchParams.get('jobTag') || '').trim()
        const divisionTag = (url.searchParams.get('divisionTag') || '').trim()
        const characterIdParam = url.searchParams.get('characterId')

        const conds = [eq(chatmarks.sessionId, sessionId)]
        if (characterTag) conds.push(eq(chatmarks.characterTag, characterTag))
        if (jobTag) conds.push(eq(chatmarks.jobTag, jobTag))
        if (divisionTag) conds.push(eq(chatmarks.divisionTag, divisionTag))
        if (characterIdParam && !isNaN(Number(characterIdParam))) {
          conds.push(eq(chatmarks.characterId, Number(characterIdParam)))
        }

        const rows = await db
          .select({
            mark: chatmarks,
            character: characters,
          })
          .from(chatmarks)
          .leftJoin(characters, eq(chatmarks.characterId, characters.id))
          .where(and(...conds))
          .orderBy(desc(chatmarks.updatedAt))

        const convIds = rows.map((r) => r.mark.conversationId)

        // Per-conversation message stats (count + last activity) in one query.
        const stats = convIds.length
          ? await db
              .select({
                conversationId: messages.conversationId,
                count: sql<number>`count(*)`,
                last: sql<string>`max(${messages.createdAt})`,
              })
              .from(messages)
              .where(inArray(messages.conversationId, convIds))
              .groupBy(messages.conversationId)
          : []
        const statById = new Map(stats.map((s) => [s.conversationId, s]))

        // A short text preview = the most recent message of each conversation.
        const previews = convIds.length
          ? await db
              .select({
                conversationId: messages.conversationId,
                content: messages.content,
                createdAt: messages.createdAt,
                role: messages.role,
              })
              .from(messages)
              .where(inArray(messages.conversationId, convIds))
              .orderBy(desc(messages.createdAt))
          : []
        const previewById = new Map<number, { content: string; role: string }>()
        for (const p of previews) {
          if (!previewById.has(p.conversationId)) {
            previewById.set(p.conversationId, { content: p.content, role: p.role })
          }
        }

        let results = rows.map((r) => {
          const stat = statById.get(r.mark.conversationId)
          const preview = previewById.get(r.mark.conversationId)
          return {
            ...r.mark,
            character: r.character
              ? {
                  id: r.character.id,
                  name: r.character.name,
                  avatar: r.character.avatar,
                  category: r.character.category,
                  tagline: r.character.tagline,
                }
              : null,
            messageCount: Number(stat?.count || 0),
            lastActivity: stat?.last || r.mark.updatedAt,
            preview: preview?.content ? preview.content.slice(0, 240) : '',
          }
        })

        // Free-text search runs server-side over mark text + character name. Deep
        // message-content search runs here too so FileChat can find a thread by
        // something said inside it.
        if (q) {
          const needle = q.toLowerCase()
          const matchedByMessage = convIds.length
            ? await db
                .select({ conversationId: messages.conversationId })
                .from(messages)
                .where(
                  and(
                    inArray(messages.conversationId, convIds),
                    ilike(messages.content, `%${q}%`),
                  ),
                )
                .groupBy(messages.conversationId)
            : []
          const msgHit = new Set(matchedByMessage.map((m) => m.conversationId))
          results = results.filter((r) => {
            const hay = [
              r.title,
              r.note,
              r.characterTag,
              r.jobTag,
              r.divisionTag,
              r.character?.name || '',
              r.character?.category || '',
            ]
              .join(' ')
              .toLowerCase()
            return hay.includes(needle) || msgHit.has(r.conversationId)
          })
        }

        return Response.json(results)
      },

      // Upsert the mark for a conversation. One mark per conversation per session.
      // When every slot/title/note is blank, the mark is removed (back to sandbox).
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const conversationId = Number(body.conversationId)
        const characterId = Number(body.characterId)
        const sessionId = String(body.sessionId || 'anon')
        if (!conversationId || !characterId) {
          return Response.json({ error: 'conversationId and characterId are required' }, { status: 400 })
        }

        const clean = (v: unknown) => String(v ?? '').trim()
        const fields = {
          title: clean(body.title),
          note: clean(body.note),
          characterTag: clean(body.characterTag),
          jobTag: clean(body.jobTag),
          divisionTag: clean(body.divisionTag),
        }
        const hasSignal =
          fields.title || fields.note || fields.characterTag || fields.jobTag || fields.divisionTag

        const [existing] = await db
          .select()
          .from(chatmarks)
          .where(and(eq(chatmarks.conversationId, conversationId), eq(chatmarks.sessionId, sessionId)))
          .limit(1)

        if (!hasSignal) {
          if (existing) {
            await db.delete(chatmarks).where(eq(chatmarks.id, existing.id))
          }
          return Response.json({ mark: null, deleted: true })
        }

        if (existing) {
          const [updated] = await db
            .update(chatmarks)
            .set({ ...fields, characterId, updatedAt: new Date() })
            .where(eq(chatmarks.id, existing.id))
            .returning()
          return Response.json({ mark: updated })
        }

        const [created] = await db
          .insert(chatmarks)
          .values({ conversationId, characterId, sessionId, ...fields })
          .returning()
        return Response.json({ mark: created }, { status: 201 })
      },
    },
  },
})
