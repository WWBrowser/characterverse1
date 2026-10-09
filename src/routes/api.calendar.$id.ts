import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { calendarEvents } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { normalizeCalendar, nextStatus } from '../../db/calendar.js'

// Edit one calendar event. PATCH advances its status, (re)schedules it, or marks
// it done; DELETE removes it. Both enforce ownership: a member may only touch
// their own rows (sessionId match), and the Studio master calendar (sessionId
// '') is editable by any operator reaching this route from the admin section.
export const Route = createFileRoute('/api/calendar/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const sessionId = String(body.sessionId || '').trim()

        const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id))
        if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })
        // Ownership: a member event must match the caller's session.
        if (event.sessionId && event.sessionId !== sessionId) {
          return Response.json({ error: 'Not your event' }, { status: 403 })
        }

        const set: Record<string, unknown> = { updatedAt: new Date() }
        const calendar = normalizeCalendar(event.calendar)
        if (body.advance) set.status = nextStatus(calendar, event.status)
        if (typeof body.status === 'string') set.status = body.status.slice(0, 40)
        if (typeof body.title === 'string') set.title = body.title.trim().slice(0, 160)
        if (typeof body.note === 'string') set.note = body.note.trim().slice(0, 600)
        if ('scheduledAt' in body) {
          const d = body.scheduledAt ? new Date(body.scheduledAt) : null
          set.scheduledAt = d && !isNaN(d.getTime()) ? d : null
        }

        const [row] = await db
          .update(calendarEvents)
          .set(set)
          .where(eq(calendarEvents.id, id))
          .returning()
        return Response.json(row)
      },

      DELETE: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''

        const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id))
        if (!event) return new Response(null, { status: 204 })
        if (event.sessionId && event.sessionId !== sessionId) {
          return Response.json({ error: 'Not your event' }, { status: 403 })
        }

        await db.delete(calendarEvents).where(eq(calendarEvents.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
