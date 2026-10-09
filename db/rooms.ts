import { db } from './index.js'
import { characters, roomEvents, spatialRooms } from './schema.js'
import { eq } from 'drizzle-orm'
import {
  characterRoom,
  characterRoomId,
  stationFor,
  stationsOf,
  type RoomPhase,
  type Station,
} from '../src/lib/spatial-room.js'
import type { SDocument } from '../src/lib/spatial-dom.js'

// SpatialVerse Rooms — the server half. Resolving a room id to its document,
// and the tracer that real work writes through.

export type ResolvedRoom = {
  id: string
  kind: 'character' | 'external'
  title: string
  actor: string
  avatar: string
  characterId: number | null
  doc: SDocument
}

/** `cv-<id>` is a character's standard room; anything else is a registered one. */
export async function resolveRoom(roomId: string): Promise<ResolvedRoom | null> {
  const cv = /^cv-(\d{1,9})$/.exec(roomId)
  if (cv) {
    const id = Number(cv[1])
    const [c] = await db
      .select({ id: characters.id, name: characters.name, avatar: characters.avatar, category: characters.category, tagline: characters.tagline })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!c) return null
    return { id: roomId, kind: 'character', title: `${c.name}'s Room`, actor: c.name, avatar: c.avatar, characterId: c.id, doc: characterRoom(c) }
  }
  if (!/^ext-[a-z0-9]{6,32}$/.test(roomId)) return null
  const [r] = await db.select().from(spatialRooms).where(eq(spatialRooms.id, roomId)).limit(1)
  if (!r) return null
  return { id: r.id, kind: 'external', title: r.title, actor: r.owner || r.title, avatar: '🤖', characterId: null, doc: r.doc as SDocument }
}

/**
 * A run's trace through a room.
 *
 * `step()` records that the agent went to a station and what it did there.
 * Writes are chained, so they land in the order they were made, and stamped
 * with the moment `step()` was called rather than the moment the insert ran —
 * the room shows when the work happened, not when the database caught up.
 * Never awaited by the caller and never thrown from: a room that could slow
 * down or break a reply would be the tail wagging the dog.
 */
export function roomTrace(roomId: string, opts: { actor: string; source: 'chat' | 'mission'; stations?: Station[] }) {
  const runId = `${opts.source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const stations = opts.stations
  let chain: Promise<unknown> = Promise.resolve()
  return {
    runId,
    step(purpose: string, label: string, phase: RoomPhase = 'start', detail = '') {
      const at = new Date()
      const station = stations ? stationFor(stations, purpose)?.id ?? '' : ''
      chain = chain
        .then(() =>
          db.insert(roomEvents).values({
            roomId,
            runId,
            source: opts.source,
            actor: opts.actor,
            purpose,
            station,
            phase,
            label: label.slice(0, 140),
            detail: detail.slice(0, 280),
            createdAt: at,
          }),
        )
        .catch(() => {})
    },
    /** Resolves once every step so far is written — for tests and for handlers that want it. */
    flush: () => chain,
  }
}

/** A character's room tracer, with its stations resolved for the station column. */
export function characterTrace(character: { id: number; name: string; category?: string }, source: 'chat' | 'mission') {
  const stations = stationsOf(characterRoom(character))
  return roomTrace(characterRoomId(character.id), { actor: character.name, source, stations })
}
