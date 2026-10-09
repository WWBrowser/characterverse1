import { createFileRoute } from '@tanstack/react-router'
import { clearDesk, loadDesk, pinAnchor, unpinAnchor } from '../../db/desk.js'
import { fidelityGuard } from '../lib/desk.js'

// The Desk, behind one conversation. $id is a CONVERSATION id, not a character id
// — the desk belongs to the conversation, because that is what the paper on it is.
//
// GET returns the reading, the projected purge and the guard's verdict, so the
// panel can state what clearing would do before anything is cleared.
//
// POST takes one of four actions:
//   clear   commit the transcript to cold storage and flush the desk
//   pin     nail a static artifact to the desk so it survives the flush
//   unpin   stand an artifact down (the row stays; the audit trail matters)
//   refresh re-read without changing anything
//
// Every action ends by returning the freshly re-derived reading, for the same
// reason the Codex does: a client should never have to guess what its click did.

const CLEAR_REASONS: Set<string> = new Set(['manual', 'noise', 'anchor', 'handoff'])

function payload(desk: NonNullable<Awaited<ReturnType<typeof loadDesk>>>) {
  return { ...desk, guard: fidelityGuard(desk.reading) }
}

export const Route = createFileRoute('/api/desk/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const conversationId = parseInt(params.id)
        if (isNaN(conversationId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const desk = await loadDesk(conversationId)
        if (!desk) return Response.json({ error: 'Conversation not found' }, { status: 404 })
        return Response.json(payload(desk))
      },

      POST: async ({ request, params }) => {
        const conversationId = parseInt(params.id)
        if (isNaN(conversationId)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const body = await request.json().catch(() => null)
        if (!body || typeof body.action !== 'string') {
          return Response.json({ error: 'action required' }, { status: 400 })
        }
        const sessionId: string = typeof body.sessionId === 'string' ? body.sessionId : ''

        switch (body.action) {
          case 'clear': {
            const reason: string = typeof body.reason === 'string' ? body.reason : 'manual'
            const desk = await clearDesk(conversationId, {
              sessionId,
              node: typeof body.node === 'string' ? body.node : 'stella',
              reason: CLEAR_REASONS.has(reason) ? reason : 'manual',
            })
            if (!desk) return Response.json({ error: 'Conversation not found' }, { status: 404 })
            return Response.json(payload(desk))
          }

          case 'pin': {
            const label = typeof body.label === 'string' ? body.label.trim() : ''
            // An unlabelled artifact is not an anchor, it is just more paper.
            if (!label) return Response.json({ error: 'label required' }, { status: 400 })
            const kind = ['message', 'art', 'record', 'note'].includes(body.kind) ? body.kind : 'message'
            const messageId = Number.isFinite(Number(body.messageId)) ? Number(body.messageId) : null

            const desk = await pinAnchor(conversationId, {
              sessionId,
              kind,
              label,
              body: typeof body.body === 'string' ? body.body : '',
              messageId,
              sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef : null,
            })
            if (!desk) return Response.json({ error: 'Conversation not found' }, { status: 404 })
            return Response.json(payload(desk))
          }

          case 'unpin': {
            const anchorId = parseInt(String(body.anchorId))
            if (isNaN(anchorId)) return Response.json({ error: 'anchorId required' }, { status: 400 })
            const desk = await unpinAnchor(conversationId, anchorId)
            if (!desk) return Response.json({ error: 'Conversation not found' }, { status: 404 })
            return Response.json(payload(desk))
          }

          case 'refresh': {
            const desk = await loadDesk(conversationId)
            if (!desk) return Response.json({ error: 'Conversation not found' }, { status: 404 })
            return Response.json(payload(desk))
          }

          default:
            return Response.json({ error: `Unknown action "${body.action}"` }, { status: 400 })
        }
      },
    },
  },
})
