import { createFileRoute } from '@tanstack/react-router'
import { desc, gte, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../../db/index.js'
import { roomEvents, spatialRooms } from '../../db/schema.js'
import { ROOM_PROFILE, validateRoom } from '../lib/spatial-room.js'

// SpatialVerse Rooms — the directory.
//
//   GET  /api/rooms    the rooms with the most recent activity
//   POST /api/rooms    register a room from another system: { title, owner, doc }
//                      where doc is an SDOM Rooms-profile document. Returns the
//                      room id and a write token, shown this once and stored
//                      only as a hash.

const REGISTRATIONS_PER_HOUR = 60

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export const Route = createFileRoute('/api/rooms')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async () => {
        const rows = await db
          .select({
            roomId: roomEvents.roomId,
            actor: sql<string>`(array_agg(${roomEvents.actor} order by ${roomEvents.id} desc))[1]`,
            last: sql<string>`max(${roomEvents.createdAt})`,
            events: sql<number>`count(*)::int`,
          })
          .from(roomEvents)
          .groupBy(roomEvents.roomId)
          .orderBy(desc(sql`max(${roomEvents.id})`))
          .limit(24)
        return Response.json({ profile: ROOM_PROFILE, rooms: rows }, { headers: CORS })
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : ''
        if (!title) return Response.json({ error: 'title is required' }, { status: 400, headers: CORS })
        const checked = validateRoom(body?.doc)
        if (!checked.ok) return Response.json({ error: checked.error }, { status: 422, headers: CORS })

        // Registration is open, so it is capped: an open door with a turnstile.
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(spatialRooms)
          .where(gte(spatialRooms.createdAt, new Date(Date.now() - 3600_000)))
        if (n >= REGISTRATIONS_PER_HOUR) {
          return Response.json({ error: 'Too many rooms registered this hour — try again later.' }, { status: 429, headers: CORS })
        }

        const id = `ext-${randomBytes(8).toString('hex')}`
        const token = randomBytes(24).toString('hex')
        await db.insert(spatialRooms).values({
          id,
          title,
          owner: typeof body?.owner === 'string' ? body.owner.trim().slice(0, 60) : '',
          doc: checked.doc,
          tokenHash: createHash('sha256').update(token).digest('hex'),
        })
        return Response.json(
          {
            id,
            token,
            note: 'Keep the token: it is shown once and stored only as a hash. Post events to /api/rooms/' + id + ' with Authorization: Bearer <token>.',
            watch: `/room/${id}`,
          },
          { status: 201, headers: CORS },
        )
      },
    },
  },
})
