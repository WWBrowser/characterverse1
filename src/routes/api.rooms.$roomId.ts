import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, gt, gte, sql } from 'drizzle-orm'
import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '../../db/index.js'
import { roomEvents, spatialRooms } from '../../db/schema.js'
import { resolveRoom } from '../../db/rooms.js'
import { cleanEventInput, ROOM_PROFILE, stationsOf, stationFor } from '../lib/spatial-room.js'

// SpatialVerse Rooms — one room.
//
//   GET  /api/rooms/:roomId            the room's document and its recent events
//   GET  /api/rooms/:roomId?after=ID   only events newer than ID — what a viewer polls
//   POST /api/rooms/:roomId            post an event (registered rooms only), with
//                                      Authorization: Bearer <write token>
//
// Reads are public and cross-origin: watching is the point, and events are
// content-free by rule. Writes to a character's room come only from this
// server's own chat and mission pipelines — nobody can post work a character
// did not do.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/** A burst limit per room: plenty for an agent at work, not enough to flood a viewer. */
const PER_MINUTE = 120

const COLS = {
  id: roomEvents.id,
  roomId: roomEvents.roomId,
  runId: roomEvents.runId,
  source: roomEvents.source,
  actor: roomEvents.actor,
  purpose: roomEvents.purpose,
  station: roomEvents.station,
  phase: roomEvents.phase,
  label: roomEvents.label,
  detail: roomEvents.detail,
  at: roomEvents.createdAt,
}

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest()
}

export const Route = createFileRoute('/api/rooms/$roomId')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request, params }) => {
        const room = await resolveRoom(params.roomId)
        if (!room) return Response.json({ error: 'No such room.' }, { status: 404, headers: CORS })
        const after = parseInt(new URL(request.url).searchParams.get('after') || '')

        if (Number.isFinite(after)) {
          const events = await db
            .select(COLS)
            .from(roomEvents)
            .where(and(eq(roomEvents.roomId, room.id), gt(roomEvents.id, after)))
            .orderBy(roomEvents.id)
            .limit(100)
          return Response.json({ events }, { headers: CORS })
        }

        const recent = await db.select(COLS).from(roomEvents).where(eq(roomEvents.roomId, room.id)).orderBy(desc(roomEvents.id)).limit(60)
        return Response.json(
          {
            profile: ROOM_PROFILE,
            room: { id: room.id, kind: room.kind, title: room.title, actor: room.actor, avatar: room.avatar, characterId: room.characterId },
            doc: room.doc,
            events: recent.reverse(),
          },
          { headers: CORS },
        )
      },

      POST: async ({ request, params }) => {
        const room = await resolveRoom(params.roomId)
        if (!room) return Response.json({ error: 'No such room.' }, { status: 404, headers: CORS })
        if (room.kind === 'character') {
          return Response.json(
            { error: "A character's room records only the work its own chat and mission pipelines do." },
            { status: 403, headers: CORS },
          )
        }

        const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
        const [row] = await db.select({ tokenHash: spatialRooms.tokenHash }).from(spatialRooms).where(eq(spatialRooms.id, room.id)).limit(1)
        const want = Buffer.from(row?.tokenHash || '', 'hex')
        const got = sha256(token)
        if (!token || want.length !== got.length || !timingSafeEqual(want, got)) {
          return Response.json({ error: 'Wrong or missing write token.' }, { status: 401, headers: CORS })
        }

        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(roomEvents)
          .where(and(eq(roomEvents.roomId, room.id), gte(roomEvents.createdAt, new Date(Date.now() - 60_000))))
        if (n >= PER_MINUTE) return Response.json({ error: `Slow down — ${PER_MINUTE} events a minute per room.` }, { status: 429, headers: CORS })

        const stations = stationsOf(room.doc)
        const body = await request.json().catch(() => null)
        const checked = cleanEventInput(body, stations)
        if (!checked.ok) return Response.json({ error: checked.error }, { status: 422, headers: CORS })
        const e = checked.event
        const [saved] = await db
          .insert(roomEvents)
          .values({
            roomId: room.id,
            runId: e.runId,
            source: 'external',
            actor: e.actor || room.actor,
            purpose: e.purpose,
            station: stationFor(stations, e.purpose)?.id ?? '',
            phase: e.phase,
            label: e.label,
            detail: e.detail,
          })
          .returning(COLS)
        return Response.json(saved, { status: 201, headers: CORS })
      },
    },
  },
})
