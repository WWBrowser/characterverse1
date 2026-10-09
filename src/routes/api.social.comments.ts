import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialComments, socialMembers } from '../../db/schema.js'
import { getMember, normalizeHandle } from '../lib/social-auth.js'
import { mintCoins } from '../../db/coins.js'

// Sign someone's comment wall. Requires a real signed-in member.
export const Route = createFileRoute('/api/social/comments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const member = await getMember(request)
        if (!member) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        const body = await request.json().catch(() => null)
        const text = String(body?.body || '').trim().slice(0, 500)
        const handle = normalizeHandle(body?.handle || '')
        if (!text) return Response.json({ error: 'Say something.' }, { status: 400 })

        const [profile] = await db.select({ id: socialMembers.id }).from(socialMembers).where(eq(socialMembers.handle, handle))
        if (!profile) return Response.json({ error: 'No such member.' }, { status: 404 })

        const [row] = await db
          .insert(socialComments)
          .values({ profileId: profile.id, authorId: member.id, body: text })
          .returning()
        // Signing a wall is social engagement — mints Character Social Coin (CS).
        const sessionId = String(body?.sessionId || '').trim()
        if (sessionId) mintCoins({ sessionId, coin: 'cs', coins: 1, source: 'cvs_wall', reason: 'Signed a wall', refType: 'comment', refId: row.id })
        return Response.json(row, { status: 201 })
      },
    },
  },
})
