import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { calendarEvents } from '../../db/schema.js'
import { normalizeCalendar, normalizeKind, defaultStatus } from '../../db/calendar.js'

// Add an event to a calendar. Member calendars ('datetime' | 'content') are owned
// by the posting session; the Studio master calendar is owned by the platform
// (sessionId = ''). Ownership is enforced on edit/delete in api.calendar.$id.ts.
export const Route = createFileRoute('/api/calendar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const calendar = normalizeCalendar(body.calendar)
        const title = String(body.title || '').trim().slice(0, 160)
        if (!title) return Response.json({ error: 'A title is required' }, { status: 400 })

        // Master (Studio) events belong to the platform; member events are owned
        // by the session that creates them.
        const sessionId = calendar === 'master' ? '' : String(body.sessionId || '').trim()
        if (calendar !== 'master' && !sessionId) {
          return Response.json({ error: 'A session is required' }, { status: 400 })
        }

        const note = String(body.note || '').trim().slice(0, 600)
        const kind = normalizeKind(calendar, body.kind)
        const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null
        const validDate = scheduledAt && !isNaN(scheduledAt.getTime()) ? scheduledAt : null

        const [row] = await db
          .insert(calendarEvents)
          .values({
            sessionId,
            calendar,
            kind,
            title,
            note,
            status: defaultStatus(calendar),
            scheduledAt: validDate,
          })
          .returning()
        return Response.json(row, { status: 201 })
      },
    },
  },
})
