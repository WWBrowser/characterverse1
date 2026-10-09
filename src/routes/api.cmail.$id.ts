import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import { characters, cmailMessages, cmailThreads } from '../../db/schema.js'

// CMail — one thread.
//
//   GET    ?sessionId       the thread, its messages and its draft; opening it reads it
//   PATCH  { sessionId, … } star, mark important, mark unread, archive, trash,
//                           snooze (an ISO time) or unsnooze (null)
//   DELETE ?sessionId       delete forever — only from Trash, like Gmail

const voice = alias(characters, 'voice')

function readSession(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 120) : ''
}

async function own(sessionId: string, id: number) {
  const [t] = await db
    .select()
    .from(cmailThreads)
    .where(and(eq(cmailThreads.id, id), eq(cmailThreads.sessionId, sessionId)))
    .limit(1)
  return t ?? null
}

const FLAGS = ['starred', 'important', 'unread', 'archived', 'trashed'] as const

export const Route = createFileRoute('/api/cmail/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const sessionId = readSession(new URL(request.url).searchParams.get('sessionId'))
        const id = parseInt(params.id)
        const t = sessionId && Number.isFinite(id) ? await own(sessionId, id) : null
        if (!t) return Response.json({ error: 'No such thread.' }, { status: 404 })

        const [who] = await db
          .select({ id: characters.id, name: characters.name, avatar: characters.avatar, tagline: characters.tagline, category: characters.category })
          .from(characters)
          .where(eq(characters.id, t.characterId))
        const messages = await db
          .select({
            id: cmailMessages.id,
            author: cmailMessages.author,
            status: cmailMessages.status,
            body: cmailMessages.body,
            voiceId: cmailMessages.voiceId,
            voiceName: voice.name,
            createdAt: cmailMessages.createdAt,
          })
          .from(cmailMessages)
          .leftJoin(voice, eq(cmailMessages.voiceId, voice.id))
          .where(eq(cmailMessages.threadId, t.id))
          .orderBy(asc(cmailMessages.createdAt), asc(cmailMessages.id))

        if (t.unread) await db.update(cmailThreads).set({ unread: false }).where(eq(cmailThreads.id, t.id))

        return Response.json({
          thread: {
            id: t.id,
            subject: t.subject,
            starred: t.starred,
            important: t.important,
            archived: t.archived,
            trashed: t.trashed,
            snoozedUntil: t.snoozedUntil ? t.snoozedUntil.toISOString() : null,
          },
          character: who,
          messages: messages.filter((m) => m.status !== 'draft').map((m) => ({ ...m, createdAt: m.createdAt?.toISOString() ?? null })),
          draft: messages.find((m) => m.status === 'draft') ?? null,
        })
      },

      PATCH: async ({ request, params }) => {
        const body = await request.json().catch(() => null)
        const sessionId = readSession(body?.sessionId)
        const id = parseInt(params.id)
        const t = sessionId && Number.isFinite(id) ? await own(sessionId, id) : null
        if (!t) return Response.json({ error: 'No such thread.' }, { status: 404 })

        const set: Partial<typeof cmailThreads.$inferInsert> = {}
        for (const f of FLAGS) if (typeof body?.[f] === 'boolean') set[f] = body[f]
        if (body && 'snoozedUntil' in body) {
          if (body.snoozedUntil === null) set.snoozedUntil = null
          else {
            const at = new Date(String(body.snoozedUntil))
            if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
              return Response.json({ error: 'Snooze until a time in the future.' }, { status: 400 })
            }
            set.snoozedUntil = at
          }
        }
        if (!Object.keys(set).length) return Response.json({ error: 'Nothing to change.' }, { status: 400 })
        await db.update(cmailThreads).set(set).where(eq(cmailThreads.id, t.id))
        return new Response(null, { status: 204 })
      },

      DELETE: async ({ request, params }) => {
        const sessionId = readSession(new URL(request.url).searchParams.get('sessionId'))
        const id = parseInt(params.id)
        const t = sessionId && Number.isFinite(id) ? await own(sessionId, id) : null
        if (!t) return Response.json({ error: 'No such thread.' }, { status: 404 })
        if (!t.trashed) return Response.json({ error: 'Move it to Trash first.' }, { status: 409 })
        await db.delete(cmailMessages).where(eq(cmailMessages.threadId, t.id))
        await db.delete(cmailThreads).where(eq(cmailThreads.id, t.id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
