import { createFileRoute } from '@tanstack/react-router'
import { getChatSettings, updateChatSettings } from '../../db/chat-settings.js'

// Per-(session, character) chat customization behind the immersive chat's
// "Chat Settings" sheet and the Permanent Memory surface. GET returns the row
// (created with defaults on first read); PATCH applies a partial update.
export const Route = createFileRoute('/api/chat-settings/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const characterId = parseInt(params.id)
        if (isNaN(characterId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        if (!sessionId) return Response.json({ error: 'A session is required' }, { status: 400 })
        const row = await getChatSettings(sessionId, characterId)
        return Response.json(row)
      },

      PATCH: async ({ request, params }) => {
        const characterId = parseInt(params.id)
        if (isNaN(characterId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const sessionId = String(body.sessionId || '').trim()
        if (!sessionId) return Response.json({ error: 'A session is required' }, { status: 400 })
        const row = await updateChatSettings(sessionId, characterId, body)
        return Response.json(row)
      },
    },
  },
})
