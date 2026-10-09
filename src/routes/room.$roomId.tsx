import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { RoomView } from '../lib/room-ui'

// /room/:roomId — watch one room, full size. `cv-<id>` is a CharacterVerse
// character's room; `ext-…` is a room another system registered (see /rooms).

export const Route = createFileRoute('/room/$roomId')({ component: RoomPage })

function RoomPage() {
  const { roomId } = Route.useParams()
  const characterId = /^cv-(\d+)$/.exec(roomId)?.[1]
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem 1rem 3rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link to="/rooms" className="rm-open" style={{ fontSize: '0.78rem' }}>
          <ArrowLeft size={13} /> All rooms
        </Link>
        <span style={{ flex: 1 }} />
        {characterId && (
          <Link to="/chat/$id" params={{ id: characterId }} className="rm-open" style={{ fontSize: '0.78rem' }}>
            <MessageSquare size={13} /> Chat — and watch the reply being worked
          </Link>
        )}
      </div>
      <RoomView roomId={roomId} />
      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        A room is public, so it shows the shape of the work and never its content: &ldquo;recalled 3 memories&rdquo;,
        not what they were. Every step is written by the pipeline that did it, as it did it — the timings in the feed
        are real; only the walking pace between stations is the viewer&rsquo;s.
      </p>
    </div>
  )
}
