import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RoomIcon } from '../lib/room-ui'
import { characterRoom, PURPOSES, ROOM_PROFILE } from '../lib/spatial-room'

// /rooms — SpatialVerse Rooms: the rooms working right now, and the protocol
// another system follows to give its own agents a room anyone can watch.

export const Route = createFileRoute('/rooms')({ component: RoomsPage })

type Active = { roomId: string; actor: string; last: string; events: number }

function RoomsPage() {
  const [rooms, setRooms] = useState<Active[] | null>(null)
  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => (r.ok ? r.json() : { rooms: [] }))
      .then((d) => setRooms(Array.isArray(d.rooms) ? d.rooms : []))
      .catch(() => setRooms([]))
  }, [])
  const sample = useMemo(() => JSON.stringify(characterRoom({ id: 0, name: 'Your Agent' }), null, 2), [])
  const origin = typeof window === 'undefined' ? 'https://<this-site>' : window.location.origin

  return (
    <div className="rm-doc">
      <header style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
        <span className="rm-icon" style={{ width: 52, height: 52 }}><RoomIcon size={34} /></span>
        <div>
          <h1>SpatialVerse Rooms</h1>
          <p className="rm-lede">
            Every character has a room, and everything in it has a purpose. When the AI works — answering a chat,
            running a mission — it walks to the station each step uses, so you can watch the work instead of waiting
            behind a typing indicator.
          </p>
        </div>
      </header>

      <section>
        <h2>Working now</h2>
        {rooms === null ? (
          <p className="rm-note" style={{ padding: 0 }}>Looking…</p>
        ) : rooms.length === 0 ? (
          <p className="rm-note" style={{ padding: 0 }}>No room has recorded any work yet. Open a chat, press the room button, and send a message.</p>
        ) : (
          <ul className="rm-active">
            {rooms.map((r) => (
              <li key={r.roomId}>
                <Link to="/room/$roomId" params={{ roomId: r.roomId }}>
                  <RoomIcon size={18} /> <strong>{r.actor || r.roomId}</strong>
                  <span>{r.events} steps · last {new Date(r.last).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Every object has a purpose</h2>
        <p>
          The standard room has one station per purpose. The first six are RouteClaw&rsquo;s capabilities, so a
          mission step lands on the station named after the capability that ran it.
        </p>
        <table className="rm-table">
          <thead><tr><th>Purpose</th><th>Station</th><th>What happens there</th></tr></thead>
          <tbody>
            {PURPOSES.map((p) => (
              <tr key={p.id}>
                <td><code style={{ color: p.color }}>{p.id}</code></td>
                <td>{p.object}</td>
                <td>{p.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Bring your own room</h2>
        <p>
          Any system can give its characters or LLM agents a room in the same shape — profile <code>{ROOM_PROFILE}</code>.
          A room is a Spatial DOM 1.0 document (the format SpatialVerse Search indexes) with one rule added: every
          furniture, container and object node carries a <code>purpose</code>, and one of them is <code>rest</code>.
          Walls are structure and are exempt. Custom purposes are fine, prefixed <code>x-</code>.
        </p>
        <h3>1 · Register the room</h3>
        <pre>{`curl -X POST ${origin}/api/rooms \\
  -H 'Content-Type: application/json' \\
  -d '{ "title": "Ada's Lab", "owner": "Acme Agents", "doc": { …a Rooms-profile document… } }'

→ { "id": "ext-…", "token": "…", "watch": "/room/ext-…" }`}</pre>
        <p>The token is shown once and stored only as a hash. Keep it server-side.</p>
        <h3>2 · Post each step as your agent does it</h3>
        <pre>{`curl -X POST ${origin}/api/rooms/ext-… \\
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \\
  -d '{ "purpose": "research", "phase": "start", "label": "Searching 3 sources", "actor": "Ada", "runId": "task-42" }'`}</pre>
        <p>
          <code>phase</code> is one of start, done, blocked, waiting, error, idle. Labels are content-free — a room is
          public. The purpose must be one your room has a station for. Up to 120 events a minute per room.
        </p>
        <h3>3 · Watch it</h3>
        <p>
          Open <code>/room/ext-…</code>, or read <code>GET /api/rooms/ext-…</code> for the document and recent events and
          poll <code>?after=&lt;last id&gt;</code> for new ones. Reads are public and cross-origin, so your own viewer can
          watch rooms here, and ours can watch yours.
        </p>
        <details>
          <summary>The standard room, as a document to start from</summary>
          <pre style={{ maxHeight: 360 }}>{sample}</pre>
        </details>
      </section>
    </div>
  )
}
