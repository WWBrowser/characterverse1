import { createFileRoute } from '@tanstack/react-router'
import { loadSharedSlate, shareSlate, unshareSlate } from '../../db/saa.js'

// Shared recommendation slates.
//
// This answers a question the design note left open — whether the deterministic
// seed should be shareable as a URL parameter so two people can compare identical
// slates — and it answers it with a correction, because the premise does not hold.
//
// The seed alone CANNOT reproduce a slate for anybody else. Ranking takes the
// chatter's own history as an input, so handing someone your seed and vibe makes
// them a slate ranked against THEIR reading, not yours. Same seed, different
// output, which is the opposite of comparing.
//
// So there are two genuinely different things a person might want, and they are
// split rather than conflated:
//
//   • "See exactly what I saw."   → share the stored slate. The cards are replayed
//                                   from rows, identical for every viewer forever.
//   • "Try my vibe on your feed." → share the vibe text and re-rank locally. The
//                                   result differs, and differing IS the point.
//
// Sharing is opt-in and the code is random, because a slate carries the sentence
// someone typed about what they were in the mood for.
export const Route = createFileRoute('/api/slate')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = (url.searchParams.get('code') || '').trim()
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        if (!code) return Response.json({ error: 'a share code is required' }, { status: 400 })

        const slate = await loadSharedSlate(code, sessionId).catch(() => null)
        if (!slate) {
          // One message for "never existed" and "no longer shared" alike. Telling
          // the difference would confirm that a given code was once real, which is
          // the only fact an enumerator could extract from this endpoint.
          return Response.json({ error: 'That slate is not shared, or the link has been withdrawn.' }, { status: 404 })
        }
        return Response.json(slate)
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'expected a JSON body' }, { status: 400 })
        }

        const slateId = Number(body?.slateId)
        const sessionId = String(body?.sessionId || '').trim()
        if (!slateId || !sessionId) {
          return Response.json({ error: 'slateId and sessionId are required' }, { status: 400 })
        }

        if (body?.action === 'unshare') {
          const done = await unshareSlate(slateId, sessionId).catch(() => false)
          return Response.json({ ok: done })
        }

        const code = await shareSlate(slateId, sessionId).catch(() => null)
        if (!code) {
          // Not-yours and not-found collapse into one status on purpose.
          return Response.json({ error: 'That slate cannot be shared from here.' }, { status: 403 })
        }
        return Response.json({ code, url: `/workspace?slate=${code}` })
      },
    },
  },
})
