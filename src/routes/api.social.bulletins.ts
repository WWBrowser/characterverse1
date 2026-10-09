import { createFileRoute } from '@tanstack/react-router'
import { eq, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialBulletins, socialMembers } from '../../db/schema.js'
import { ensureSeeded } from '../lib/social-seed.js'
import { getMember } from '../lib/social-auth.js'
import { mintCoins } from '../../db/coins.js'

// The network-wide bulletin board — newest first, no ranking, no algorithm.
export const Route = createFileRoute('/api/social/bulletins')({
  server: {
    handlers: {
      GET: async () => {
        await ensureSeeded()
        const rows = await db
          .select({
            id: socialBulletins.id,
            body: socialBulletins.body,
            createdAt: socialBulletins.createdAt,
            handle: socialMembers.handle,
            displayName: socialMembers.displayName,
            accent: socialMembers.accent,
            mood: socialMembers.mood,
          })
          .from(socialBulletins)
          .innerJoin(socialMembers, eq(socialBulletins.memberId, socialMembers.id))
          .orderBy(desc(socialBulletins.createdAt))
          .limit(100)
        return Response.json(rows)
      },

      POST: async ({ request }) => {
        const member = await getMember(request)
        if (!member) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        const body = await request.json().catch(() => null)
        const text = String(body?.body || '').trim().slice(0, 500)
        if (!text) return Response.json({ error: 'Say something.' }, { status: 400 })
        const [row] = await db.insert(socialBulletins).values({ memberId: member.id, body: text }).returning()
        // Social engagement mints Character Social Coin (CS) to the device wallet.
        const sessionId = String(body?.sessionId || '').trim()
        if (sessionId) mintCoins({ sessionId, coin: 'cs', coins: 1, source: 'cvs_bulletin', reason: 'Posted a bulletin', refType: 'bulletin', refId: row.id })
        return Response.json(row, { status: 201 })
      },
    },
  },
})
