import { createFileRoute } from '@tanstack/react-router'
import {
  bindTabConversation,
  closeTab,
  focusTab,
  listTabs,
  openFrameTab,
  openTab,
} from '../../db/saa.js'

// The chat tab strip.
//
// Tabs are rows, not React state and not localStorage. A refresh, a second
// device or a crashed tab must not lose the workspace, and the platform's own
// rule is that anything meant to survive a request lives in the database.
//
// A tab is a VIEW onto a conversation, never a copy of one: opening a character
// that already has a thread in this session attaches to that thread, and closing
// the tab leaves the thread exactly where it was.
//
// The strip holds two kinds of tab. 'open' opens a chat tab on a character;
// 'openFrame' opens an inframe tab on a CharacterVerse Search entry, which
// embeds an externally hosted AI system beside the chats. There is deliberately
// no action for an oframe entry — an oframe entry redirects, and a redirect is
// the browser's job, not a row's.
export const Route = createFileRoute('/api/tabs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        if (!sessionId) return Response.json([])
        return Response.json(await listTabs(sessionId))
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const sessionId = String(body.sessionId || '').trim()
        if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 })
        const action = String(body.action || 'open')

        // The inframe half of the search index: embed an external system as a
        // tab. The server re-checks that the entry really is inframe, so a
        // hand-crafted request cannot frame a publisher who asked not to be.
        if (action === 'openFrame') {
          const entryId = Number(body.entryId)
          if (!Number.isFinite(entryId) || entryId <= 0) {
            return Response.json({ error: 'entryId is required' }, { status: 400 })
          }
          const { tabs, error } = await openFrameTab({
            sessionId,
            entryId,
            title: String(body.title || ''),
          })
          if (error) return Response.json({ error, tabs }, { status: 400 })
          return Response.json(tabs)
        }

        if (action === 'open') {
          const characterId = Number(body.characterId)
          if (!Number.isFinite(characterId)) {
            return Response.json({ error: 'characterId is required' }, { status: 400 })
          }
          const fromRecommendation = Number(body.fromRecommendation)
          return Response.json(
            await openTab({
              sessionId,
              characterId,
              title: String(body.title || ''),
              opener: String(body.opener || ''),
              fromRecommendation: Number.isFinite(fromRecommendation) && fromRecommendation > 0
                ? fromRecommendation
                : null,
            }),
          )
        }

        const id = Number(body.id)
        if (!Number.isFinite(id)) return Response.json({ error: 'id is required' }, { status: 400 })

        if (action === 'focus') return Response.json(await focusTab(id, sessionId))
        if (action === 'close') return Response.json(await closeTab(id, sessionId))
        if (action === 'bind') {
          const conversationId = Number(body.conversationId)
          if (!Number.isFinite(conversationId)) {
            return Response.json({ error: 'conversationId is required' }, { status: 400 })
          }
          await bindTabConversation(id, sessionId, conversationId)
          return new Response(null, { status: 204 })
        }

        return Response.json({ error: `Unknown action "${action}"` }, { status: 400 })
      },
    },
  },
})
