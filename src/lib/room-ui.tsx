import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { corners, iso } from './spatial-ui'
import type { SDocument, Vec3 } from './spatial-dom'
import { purposeMeta, standingPoint, stationFor, stationsOf, type RoomEvent, type Station } from './spatial-room'

// SpatialVerse Rooms — the viewer.
//
// The room is drawn in the same isometric projection as SpatialVerse Search,
// because it is the same kind of document. What is new is that it moves: the
// agent stands at the station of the last thing it did, walks to the next one
// as events arrive, and every station lights in its purpose's colour while it
// is in use. Events are polled, not pushed — a viewer is a reader, and a poll
// every second and a half is honest about how fresh what you see is.
//
// When a run lands in one poll (a fast chat turn writes its eight steps in a
// couple of seconds), the agent still walks them one at a time. The order and
// the timestamps are real; only the walking pace is the viewer's. The feed
// shows the real offsets, so nobody mistakes the pace for the timing.

const POLL_MS = 1500
const STEP_MS = 650

/* ------------------------------------------------------------------ icon */

/**
 * The Room mark: two walls meeting at a corner, a door on the left wall and a
 * window on the right, the floor below — the room every character has. Line
 * art in currentColor, with the door and window tinted when `color` is on.
 */
export function RoomIcon({ size = 20, color = true }: { size?: number; color?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden style={{ display: 'block' }}>
      {/* walls */}
      <path d="M5 8 L24 12 L43 8 L43 30 L24 38 L5 30 Z" fill={color ? 'rgba(167,139,250,0.14)' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M24 12 L24 30" stroke="currentColor" strokeWidth="2.4" />
      {/* floor */}
      <path d="M5 30 L24 30 L43 30 M5 30 L24 38 L43 30" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" fill={color ? 'rgba(79,195,161,0.16)' : 'none'} />
      {/* door, left wall */}
      <path d="M11 29 L11 15.5 L17 16.7 L17 30" stroke={color ? '#f59e0b' : 'currentColor'} strokeWidth="2.2" strokeLinejoin="round" fill={color ? 'rgba(245,158,11,0.25)' : 'none'} />
      <circle cx="15.6" cy="23.4" r="0.9" fill={color ? '#f59e0b' : 'currentColor'} />
      {/* window, right wall */}
      <path d="M29.5 15.6 L38.5 13.8 L38.5 20.4 L29.5 22.2 Z" stroke={color ? '#22d3ee' : 'currentColor'} strokeWidth="2" strokeLinejoin="round" fill={color ? 'rgba(34,211,238,0.22)' : 'none'} />
      <path d="M34 14.7 L34 21.3 M29.5 18.9 L38.5 17.1" stroke={color ? '#22d3ee' : 'currentColor'} strokeWidth="1.4" />
    </svg>
  )
}

/* ------------------------------------------------------------------ data */

type RoomPayload = {
  profile: string
  room: { id: string; kind: 'character' | 'external'; title: string; actor: string; avatar: string; characterId: number | null }
  doc: SDocument
  events: RoomEvent[]
}

function useRoom(roomId: string) {
  const [data, setData] = useState<RoomPayload | null>(null)
  const [events, setEvents] = useState<RoomEvent[]>([])
  const [error, setError] = useState('')
  const last = useRef(0)

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    last.current = 0
    setData(null)
    setEvents([])
    setError('')

    const poll = async () => {
      if (!alive) return
      if (document.visibilityState === 'visible' && last.current >= 0) {
        try {
          const r = await fetch(`/api/rooms/${encodeURIComponent(roomId)}?after=${last.current}`)
          const d = r.ok ? await r.json() : null
          if (alive && d?.events?.length) {
            last.current = d.events[d.events.length - 1].id
            setEvents((prev) => [...prev, ...d.events].slice(-200))
          }
        } catch {
          /* a missed poll is caught up by the next one */
        }
      }
      if (alive) timer = window.setTimeout(poll, POLL_MS)
    }

    fetch(`/api/rooms/${encodeURIComponent(roomId)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (!alive) return
        if (!r.ok || !d?.doc) {
          setError(d?.error || 'This room could not be opened.')
          return
        }
        setData(d)
        setEvents(d.events)
        last.current = d.events.length ? d.events[d.events.length - 1].id : 0
        timer = window.setTimeout(poll, POLL_MS)
      })
      .catch(() => alive && setError('This room could not be opened.'))

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [roomId])

  return { data, events, error }
}

/**
 * Which event the agent is acting out. Starts at the latest one (no replay of
 * history on open), then steps through every event that arrives after, one per
 * STEP_MS, so a burst is walked rather than jumped.
 */
function usePlayhead(events: RoomEvent[]) {
  const [head, setHead] = useState(-1)
  const seeded = useRef(false)
  useEffect(() => {
    if (!events.length) return
    if (!seeded.current) {
      seeded.current = true
      setHead(events.length - 1)
      return
    }
    if (head >= events.length - 1) return
    const t = window.setTimeout(() => setHead((h) => Math.min(events.length - 1, h + 1)), head < 0 ? 0 : STEP_MS)
    return () => window.clearTimeout(t)
  }, [events, head])
  return head >= 0 ? events[head] : null
}

/* ------------------------------------------------------------------ view */

export function RoomView({ roomId, compact = false, title }: { roomId: string; compact?: boolean; title?: string }) {
  const { data, events, error } = useRoom(roomId)
  const current = usePlayhead(events)
  const [hover, setHover] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const stations = useMemo(() => (data ? stationsOf(data.doc) : []), [data])
  const roomMax = data?.doc.root.size ?? ([7, 3, 5.5] as Vec3)

  if (error) return <div className="rm-card rm-note">{error}</div>
  if (!data) {
    return (
      <div className="rm-card rm-note">
        <Loader2 size={13} className="animate-spin" style={{ verticalAlign: -2 }} /> Opening the room…
      </div>
    )
  }

  const purpose = current?.purpose ?? 'rest'
  const here = stationFor(stations, purpose)
  const stand = here ? standingPoint(here, { max: roomMax }) : ([roomMax[0] / 2, 0, roomMax[2] / 2] as Vec3)
  // The token floats at head height over where the agent stands, tethered to
  // its spot on the floor — readable from across the room, and unmistakably
  // standing *at* the station rather than inside it.
  const [ax, ay] = iso([stand[0], 1.7, stand[2]])
  const [fx, fy] = iso([stand[0], 0, stand[2]])
  const meta = purposeMeta(purpose)
  const lastAt = events.length ? new Date(events[events.length - 1].at).getTime() : 0
  const live = now - lastAt < 8000
  const run = current ? events.filter((e) => e.runId === current.runId) : []
  const runStations = new Set(run.map((e) => e.station))

  // The view box: the whole room, floor to ceiling.
  const pts = corners([0, 0, 0], roomMax).map(iso)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const pad = 0.35
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad - 0.4, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2 + 0.4]

  const order = [...stations].sort((a, b) => a.min[0] + a.min[2] - (b.min[0] + b.min[2]) || a.min[1] - b.min[1])
  // One legend line per purpose, naming the station the agent actually walks
  // to for it — the first one carrying it, the same rule stationFor uses.
  const purposes = stations.filter((s, i) => s.purpose && stations.findIndex((o) => o.purpose === s.purpose) === i)

  return (
    <div className="rm-card" data-compact={compact || undefined}>
      <div className="rm-head">
        <span className="rm-icon"><RoomIcon size={18} /></span>
        <span className="rm-title">{title || data.room.title}</span>
        <span className="rm-live" data-live={live || undefined}>
          <span aria-hidden /> {live ? 'Working now' : current ? `Idle · last active ${ago(lastAt, now)}` : 'No work recorded yet'}
        </span>
        <span style={{ flex: 1 }} />
        {compact && (
          <Link to="/room/$roomId" params={{ roomId }} className="rm-open">
            Open room <ArrowUpRight size={12} />
          </Link>
        )}
      </div>

      <div className="rm-body">
        <svg
          viewBox={vb.join(' ')}
          className="rm-svg"
          role="img"
          aria-label={`${data.room.title}: ${data.room.actor} is ${meta.doing}${here ? ` at the ${here.name}` : ''}`}
        >
          {/* the floor */}
          <polygon
            points={[[0, 0, 0], [roomMax[0], 0, 0], [roomMax[0], 0, roomMax[2]], [0, 0, roomMax[2]]].map((v) => iso(v as Vec3).join(',')).join(' ')}
            fill="rgba(79,195,161,0.05)"
            stroke="rgba(167,139,250,0.25)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {order.map((s) => (
            <StationBox
              key={s.id}
              s={s}
              active={here?.id === s.id}
              used={runStations.has(s.id)}
              hovered={hover !== null && s.purpose === hover}
            />
          ))}

          {/* the agent */}
          <g className="rm-agent" style={{ transform: `translate(${fx}px, ${fy}px)` }}>
            <ellipse cx={0} cy={0} rx={0.36} ry={0.18} fill={meta.color} opacity={0.4} />
            {live && <ellipse className="rm-pulse" cx={0} cy={0} rx={0.36} ry={0.18} fill="none" stroke={meta.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          </g>
          <g className="rm-agent" style={{ transform: `translate(${ax}px, ${ay}px)` }}>
            <line x1={0} y1={0.42} x2={fx - ax} y2={fy - ay} stroke={meta.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" opacity={0.7} strokeDasharray="3 2" />
            <circle r={0.46} fill={meta.color} opacity={0.18} />
            <circle r={0.42} fill="#141422" stroke={meta.color} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
            {/* The character's avatar where it is an emoji; its initial otherwise. */}
            <text y={0.15} textAnchor="middle" fontSize={0.44} fill="#fff" fontWeight={800}>
              {/^\p{Extended_Pictographic}/u.test(data.room.avatar) ? data.room.avatar : data.room.actor.slice(0, 1).toUpperCase()}
            </text>
          </g>
        </svg>

        <div className="rm-bubble" style={{ borderColor: `${meta.color}88` }}>
          <span className="rm-dot" style={{ background: meta.color }} />
          <span>
            <strong>{data.room.actor}</strong> {current ? (current.phase === 'idle' ? 'is resting' : `is ${meta.doing}`) : 'has not worked here yet'}
            {here && current?.phase !== 'idle' && <> at the {here.name}</>}
            {current && <span className="rm-bubble-label"> — {current.label}</span>}
          </span>
        </div>
      </div>

      <div className="rm-cols">
        <section aria-label="What just happened">
          <h4>{current ? `This run · ${run[0]?.source === 'mission' ? 'mission' : run[0]?.source === 'external' ? 'external' : 'chat turn'}` : 'Activity'}</h4>
          {run.length ? (
            <ol className="rm-feed">
              {run.map((e) => {
                const m = purposeMeta(e.purpose)
                const t0 = new Date(run[0].at).getTime()
                return (
                  <li key={e.id} data-on={e.id === current?.id || undefined} data-phase={e.phase}>
                    <span className="rm-t">+{((new Date(e.at).getTime() - t0) / 1000).toFixed(2)}s</span>
                    <span className="rm-chip" style={{ color: m.color, borderColor: `${m.color}66` }}>{m.label}</span>
                    <span className="rm-l">{e.label}{e.detail && <span className="rm-d"> · {e.detail}</span>}</span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="rm-note" style={{ padding: 0 }}>
              Nothing yet. {data.room.kind === 'character' ? `Send ${data.room.actor} a message and watch it work through the room.` : 'The system that owns this room has not posted any work.'}
            </p>
          )}
        </section>
        {!compact && (
          <section aria-label="Every object has a purpose">
            <h4>Every object has a purpose</h4>
            <ul className="rm-legend">
              {purposes.map((s) => {
                const m = purposeMeta(s.purpose!)
                return (
                  <li key={s.purpose} onMouseEnter={() => setHover(s.purpose)} onMouseLeave={() => setHover(null)} data-on={here?.purpose === s.purpose || undefined}>
                    <span className="rm-dot" style={{ background: m.color }} />
                    <span>
                      <strong>{s.name}</strong> · {m.label}
                      <span className="rm-d"> — {m.desc}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function StationBox({ s, active, used, hovered }: { s: Station; active: boolean; used: boolean; hovered: boolean }) {
  const [x0, y0, z0] = s.min
  const [x1, y1, z1] = s.max
  const p = (v: Vec3) => iso(v).join(',')
  const faces = {
    right: [p([x1, y0, z0]), p([x1, y0, z1]), p([x1, y1, z1]), p([x1, y1, z0])].join(' '),
    front: [p([x0, y0, z1]), p([x1, y0, z1]), p([x1, y1, z1]), p([x0, y1, z1])].join(' '),
    top: [p([x0, y1, z0]), p([x1, y1, z0]), p([x1, y1, z1]), p([x0, y1, z1])].join(' '),
  }
  const wall = s.type === 'wall'
  const m = s.purpose ? purposeMeta(s.purpose) : null
  const colour = m && (active || hovered || used) ? m.color : wall ? '#4a4a6a' : '#6b6b90'
  const base = wall ? 0.06 : active ? 0.95 : hovered ? 0.8 : used ? 0.5 : 0.32
  return (
    <g data-station={s.id} data-active={active || undefined}>
      <title>{m ? `${s.name} — ${m.label}: ${m.desc}` : s.name}</title>
      {(['right', 'front', 'top'] as const).map((f) => (
        <polygon
          key={f}
          points={faces[f]}
          fill={colour}
          fillOpacity={base * (f === 'top' ? 1 : f === 'front' ? 0.78 : 0.6)}
          stroke={active ? '#fff3e0' : wall ? 'rgba(167,139,250,0.22)' : '#2b2b42'}
          strokeWidth={active ? 1.8 : 0.7}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
