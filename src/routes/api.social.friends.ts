import { createFileRoute } from '@tanstack/react-router'
import { eq, and, or, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialMembers, socialFriendships } from '../../db/schema.js'
import { getMember, normalizeHandle } from '../lib/social-auth.js'

const PUB = {
  id: socialMembers.id,
  handle: socialMembers.handle,
  displayName: socialMembers.displayName,
  accent: socialMembers.accent,
  mood: socialMembers.mood,
}

// Mutual friendships via a request → accept handshake.
export const Route = createFileRoute('/api/social/friends')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json({ friends: [], incoming: [], outgoing: [] })

        const rels = await db
          .select()
          .from(socialFriendships)
          .where(or(eq(socialFriendships.requesterId, me.id), eq(socialFriendships.addresseeId, me.id)))

        const otherIds = [...new Set(rels.map((r) => (r.requesterId === me.id ? r.addresseeId : r.requesterId)))]
        const others = otherIds.length
          ? await db.select(PUB).from(socialMembers).where(inArray(socialMembers.id, otherIds))
          : []
        const map = new Map(others.map((m) => [m.id, m]))
        const other = (r: typeof rels[number]) => map.get(r.requesterId === me.id ? r.addresseeId : r.requesterId)

        return Response.json({
          friends: rels.filter((r) => r.status === 'accepted').map(other).filter(Boolean),
          incoming: rels.filter((r) => r.status === 'pending' && r.addresseeId === me.id).map(other).filter(Boolean),
          outgoing: rels.filter((r) => r.status === 'pending' && r.requesterId === me.id).map(other).filter(Boolean),
        })
      },

      POST: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        const body = await request.json().catch(() => null)
        const handle = normalizeHandle(body?.handle || '')
        const action = String(body?.action || 'request')

        const [target] = await db.select({ id: socialMembers.id }).from(socialMembers).where(eq(socialMembers.handle, handle))
        if (!target) return Response.json({ error: 'No such member.' }, { status: 404 })
        if (target.id === me.id) return Response.json({ error: "You can't friend yourself." }, { status: 400 })

        const between = or(
          and(eq(socialFriendships.requesterId, me.id), eq(socialFriendships.addresseeId, target.id)),
          and(eq(socialFriendships.requesterId, target.id), eq(socialFriendships.addresseeId, me.id)),
        )
        const [existing] = await db.select().from(socialFriendships).where(between)

        if (action === 'remove') {
          await db.delete(socialFriendships).where(between)
          return Response.json({ status: 'none' })
        }

        if (action === 'accept') {
          if (existing && existing.addresseeId === me.id) {
            await db.update(socialFriendships).set({ status: 'accepted' }).where(eq(socialFriendships.id, existing.id))
            return Response.json({ status: 'accepted' })
          }
          return Response.json({ error: 'No pending request to accept.' }, { status: 400 })
        }

        // action === 'request'
        if (existing) {
          if (existing.status === 'accepted') return Response.json({ status: 'accepted' })
          // A reverse pending request means the other side already asked — accept it.
          if (existing.addresseeId === me.id) {
            await db.update(socialFriendships).set({ status: 'accepted' }).where(eq(socialFriendships.id, existing.id))
            return Response.json({ status: 'accepted' })
          }
          return Response.json({ status: 'pending' })
        }

        await db.insert(socialFriendships).values({ requesterId: me.id, addresseeId: target.id, status: 'pending' })
        return Response.json({ status: 'pending' })
      },
    },
  },
})
