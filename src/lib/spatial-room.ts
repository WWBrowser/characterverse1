// SpatialVerse Rooms — the profile, the standard room, and the event stream.
//
// A character home that is only decoration is a wallpaper. A Room is a working
// space: every object in it is a *station* with a purpose, and when the agent
// works — answering a chat, running a mission step — it moves to the station
// that step uses. Watch the room and you watch the work: it went to the
// archive (recalled memories), the pinboard (read what was pinned), the desk
// (drafted), the outbox (delivered).
//
// Three things live here, all pure so the API, the page and anyone else's
// system can share them:
//
//   1. **The Rooms profile of the Spatial DOM.** A Room is an SDOM 1.0 document
//      (src/lib/spatial-dom.ts) with one extra rule: every furniture, container
//      and object node carries a `purpose`. Walls and floors are structure and
//      are exempt. "All things have a purpose" is checked, not hoped for.
//   2. **The standard character room** — one layout, built for every character
//      from its id, so every CharacterVerse character has a room with the same
//      stations in the same places and can be watched the same way.
//   3. **Room events** — the stream a room is watched through. An event names a
//      purpose, never content: "recalled 3 memories", not what they were. A room
//      is public, so what crosses into it is the shape of the work, never the
//      conversation.
//
// The profile is how systems outside CharacterVerse adopt it: publish a Room in
// this shape, post events in this shape, and any viewer that speaks the profile
// can watch your agent work. See /rooms for the protocol in prose.

import { SDOM_VERSION, validateDocument, type SDocument, type SNode, type Vec3 } from './spatial-dom'

export const ROOM_PROFILE = 'sdom-room/1.0'

/* ════════════════════════════════════════════════════════════ the purposes */

export type PurposeMeta = {
  id: string
  /** What the station is, in the standard room. */
  object: string
  label: string
  /** What the agent is doing there, for the live feed. */
  doing: string
  desc: string
  color: string
}

/**
 * The standard purposes. The first six are RouteClaw's capabilities, so a
 * mission step lands on the station named after the capability that ran it;
 * the rest are the parts of a chat turn that are not a capability — the
 * clock, the pinboard, the archive, the armchair.
 */
export const PURPOSES: PurposeMeta[] = [
  { id: 'dispatch', object: 'Door', label: 'Intake', doing: 'taking the request in', desc: 'Where work arrives. Every chat turn and mission starts at the door.', color: '#a78bfa' },
  { id: 'research', object: 'Bookshelf', label: 'Research', doing: 'researching', desc: 'Gathering and retrieving. Mission research steps happen here.', color: '#3b82f6' },
  { id: 'analysis', object: 'Whiteboard', label: 'Analysis', doing: 'working it through', desc: 'Working the numbers and the structure of a problem.', color: '#22d3ee' },
  { id: 'synthesis', object: 'Writing Desk', label: 'Drafting', doing: 'drafting', desc: 'Where replies and deliverables are written — the model call itself.', color: '#f59e0b' },
  { id: 'verification', object: 'Inspection Bench', label: 'Checking', doing: 'checking', desc: 'Screening and sign-off. Every message is screened here before it is answered.', color: '#34d399' },
  { id: 'delivery', object: 'Outbox', label: 'Delivery', doing: 'delivering', desc: 'Finished work leaves through the outbox.', color: '#f472b6' },
  { id: 'awareness', object: 'Wall Clock', label: 'Awareness', doing: 'checking the time', desc: 'The clock, the window and the calendar: what time it is and what is coming up.', color: '#fbbf24' },
  { id: 'anchors', object: 'Pinboard', label: 'Anchors', doing: 'reading the pinboard', desc: 'What has been pinned to the desk as stated fact, read before drafting.', color: '#fb923c' },
  { id: 'memory', object: 'Archive Cabinet', label: 'Memory', doing: 'in the archive', desc: 'Long-term memory: recalled before replying, filed after.', color: '#c084fc' },
  { id: 'rest', object: 'Armchair', label: 'Resting', doing: 'resting', desc: 'Where the agent waits between jobs. Every room has one.', color: '#94a3b8' },
]

export const PURPOSE_BY_ID: Record<string, PurposeMeta> = Object.fromEntries(PURPOSES.map((p) => [p.id, p]))

/** A purpose this profile does not define — someone else's — gets a neutral reading. */
export function purposeMeta(id: string): PurposeMeta {
  return (
    PURPOSE_BY_ID[id] ?? {
      id,
      object: id.replace(/^x-/, ''),
      label: id.replace(/^x-/, '').replace(/-/g, ' '),
      doing: `at the ${id.replace(/^x-/, '').replace(/-/g, ' ')}`,
      desc: 'A station defined by the system that published this room.',
      color: '#a3a3c2',
    }
  )
}

/** RouteClaw capability → station. A mission step walks to the station it is. */
export const CAPABILITY_PURPOSE: Record<string, string> = {
  dispatch: 'dispatch',
  research: 'research',
  synthesis: 'synthesis',
  analysis: 'analysis',
  verification: 'verification',
  delivery: 'delivery',
}

/* ════════════════════════════════════════════════════ the standard room */

const n = (id: string, kind: SNode['kind'], type: string, name: string, pos: Vec3, size: Vec3, purpose?: string, extra: Partial<SNode> = {}): SNode => ({
  id,
  kind,
  type,
  name,
  pos,
  size,
  ...(purpose ? { purpose } : {}),
  ...extra,
})

export type RoomCharacter = { id: number; name: string; category?: string; tagline?: string }

export function characterRoomId(characterId: number): string {
  return `cv-${characterId}`
}

/**
 * The standard character room. Seven metres by five and a half, two walls,
 * the viewer at the open corner — the room in the icon. Every station is in
 * the same place in every character's room, so a person who has watched one
 * room can read all of them.
 */
export function characterRoom(c: RoomCharacter): SDocument {
  const R = `room-cv-${c.id}`
  return {
    sdom: SDOM_VERSION,
    slug: R,
    title: `${c.name}'s Room`,
    summary: `${c.name}'s working room${c.tagline ? ` — ${c.tagline}` : ''}. Every object is a station; watch it to watch ${c.name} work.`,
    root: n(R, 'space', 'home', `${c.name}'s Room`, [0, 0, 0], [7, 3, 5.5], undefined, {
      tags: [c.category || 'character', 'room'],
      children: [
        n(`${R}/work`, 'room', 'room', 'Workroom', [0, 0, 0], [7, 3, 5.5], undefined, {
          children: [
            // Structure: no purpose, and exempt — a wall is not a thing you use.
            n(`${R}/wall-back`, 'surface', 'wall', 'Back Wall', [0, 0, 0], [7, 3, 0.08], undefined, {
              children: [
                n(`${R}/pinboard`, 'object', 'pinboard', 'Pinboard', [0.9, 1.25, 0.08], [1.3, 0.85, 0.04], 'anchors'),
                n(`${R}/clock`, 'object', 'clock', 'Wall Clock', [3.0, 2.1, 0.08], [0.42, 0.42, 0.05], 'awareness'),
                n(`${R}/window`, 'object', 'window', 'Window', [5.9, 1.25, 0.08], [0.9, 0.85, 0.03], 'awareness'),
              ],
            }),
            n(`${R}/wall-left`, 'surface', 'wall', 'Left Wall', [0, 0, 0], [0.08, 3, 5.5], undefined, {
              children: [
                n(`${R}/door`, 'object', 'door', 'Door', [0.08, 0, 3.7], [0.05, 2.1, 0.95], 'dispatch'),
                n(`${R}/whiteboard`, 'object', 'whiteboard', 'Whiteboard', [0.08, 0.95, 1.4], [0.04, 1.05, 1.5], 'analysis'),
              ],
            }),
            n(`${R}/archive`, 'furniture', 'cabinet', 'Archive Cabinet', [0.25, 0, 0.25], [0.55, 1.35, 0.85], 'memory'),
            n(`${R}/bookshelf`, 'furniture', 'bookcase', 'Bookshelf', [3.7, 0, 0.12], [1.7, 2.0, 0.42], 'research'),
            n(`${R}/outbox`, 'container', 'outbox', 'Outbox', [6.0, 0, 0.18], [0.7, 0.85, 0.5], 'delivery'),
            n(`${R}/desk`, 'furniture', 'desk', 'Writing Desk', [2.3, 0, 1.7], [1.6, 0.76, 0.8], 'synthesis'),
            n(`${R}/bench`, 'furniture', 'bench', 'Inspection Bench', [5.5, 0, 2.3], [1.1, 0.9, 0.7], 'verification'),
            n(`${R}/armchair`, 'furniture', 'chair', 'Armchair', [4.6, 0, 4.1], [0.95, 0.95, 0.9], 'rest'),
          ],
        }),
      ],
    }),
  }
}

/* ═══════════════════════════════════════════════════════ reading a room */

export type Station = {
  id: string
  name: string
  type: string
  kind: SNode['kind']
  purpose: string | null
  min: Vec3
  max: Vec3
}

/** Every node in world coordinates, structure included, with its purpose. */
export function stationsOf(doc: SDocument): Station[] {
  const out: Station[] = []
  const walk = (node: SNode, origin: Vec3) => {
    const min: Vec3 = [origin[0] + node.pos[0], origin[1] + node.pos[1], origin[2] + node.pos[2]]
    const max: Vec3 = [min[0] + node.size[0], min[1] + node.size[1], min[2] + node.size[2]]
    if (node.kind !== 'space' && node.kind !== 'room') {
      out.push({ id: node.id, name: node.name, type: node.type, kind: node.kind, purpose: node.purpose ?? null, min, max })
    }
    for (const ch of node.children || []) walk(ch, min)
  }
  walk(doc.root, [0, 0, 0])
  return out
}

/** The station a purpose is served at: the first node carrying it, else the armchair. */
export function stationFor(stations: Station[], purpose: string): Station | undefined {
  return stations.find((s) => s.purpose === purpose) ?? stations.find((s) => s.purpose === 'rest')
}

/**
 * Where the agent stands to use a station: on the floor in front of it. Things
 * on the left wall are faced from the room side (+x); everything else from the
 * front (+z), which is where the viewer is.
 */
export function standingPoint(s: Station, room: { max: Vec3 }): Vec3 {
  const onLeftWall = s.max[0] - s.min[0] < 0.2 && s.min[0] < 0.3
  const cx = (s.min[0] + s.max[0]) / 2
  const cz = (s.min[2] + s.max[2]) / 2
  return onLeftWall
    ? [Math.min(room.max[0] - 0.4, s.max[0] + 0.55), 0, cz]
    : [cx, 0, Math.min(room.max[2] - 0.35, s.max[2] + 0.45)]
}

/**
 * Validate a Room: a valid SDOM document whose every furniture, container and
 * object node has a purpose, with at least one `rest` station for the agent to
 * wait at. The checks a viewer relies on, enforced at publish time so a room
 * that would draw an agent standing nowhere is never accepted.
 */
export function validateRoom(input: unknown): { ok: true; doc: SDocument } | { ok: false; error: string } {
  const base = validateDocument(input)
  if (!base.ok) return base
  const stations = stationsOf(base.doc)
  const purposeless = stations.find((s) => s.kind !== 'surface' && !s.purpose)
  if (purposeless) return { ok: false, error: `"${purposeless.name}" (${purposeless.id}) has no purpose — every object in a room is a station` }
  if (!stations.some((s) => s.purpose === 'rest')) return { ok: false, error: 'a room needs a station with purpose "rest" for the agent to wait at' }
  const unknown = stations.find((s) => s.purpose && !PURPOSE_BY_ID[s.purpose] && !s.purpose.startsWith('x-'))
  if (unknown) return { ok: false, error: `"${unknown.purpose}" is not a standard purpose — prefix custom ones with "x-"` }
  return base
}

/* ════════════════════════════════════════════════════════════ the events */

export const ROOM_PHASES = ['start', 'done', 'blocked', 'waiting', 'error', 'idle'] as const
export type RoomPhase = (typeof ROOM_PHASES)[number]

export type RoomEvent = {
  id: number
  roomId: string
  runId: string
  source: string
  actor: string
  purpose: string
  station: string
  phase: RoomPhase
  label: string
  detail: string
  at: string
}

/** The shape an outside system posts. Validated server-side; content-free by design. */
export type RoomEventInput = {
  purpose: string
  phase?: RoomPhase
  label: string
  detail?: string
  actor?: string
  runId?: string
}

export function cleanEventInput(raw: any, stations: Station[]): { ok: true; event: Required<RoomEventInput> } | { ok: false; error: string } {
  const purpose = typeof raw?.purpose === 'string' ? raw.purpose.trim() : ''
  if (!stations.some((s) => s.purpose === purpose)) return { ok: false, error: `this room has no "${purpose}" station` }
  const phase = (ROOM_PHASES as readonly string[]).includes(raw?.phase) ? (raw.phase as RoomPhase) : 'start'
  const label = typeof raw?.label === 'string' ? raw.label.trim().slice(0, 140) : ''
  if (!label) return { ok: false, error: 'label is required — a short, content-free line: "recalled 3 memories"' }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  return {
    ok: true,
    event: { purpose, phase, label, detail: str(raw?.detail, 280), actor: str(raw?.actor, 60), runId: str(raw?.runId, 60) },
  }
}
