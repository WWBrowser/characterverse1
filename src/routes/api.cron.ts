import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { calendarEvents, cronSubscriptions, characters } from '../../db/schema.js'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  getSubscription,
  getLatestPulse,
  samplePulse,
  normalizeCadence,
  normalizeScope,
} from '../../db/calendar.js'

// Agentic cron set-up. GET returns everything the Cron page renders for a member:
// their subscription, both of their calendars, the Studio master calendar, the
// live agentic shadow sample, and the latest recorded pulse. PUT upserts the
// member's single cron subscription (email, agents path, cadence, privacy lever).
export const Route = createFileRoute('/api/cron')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''

        const [subscription, masterEvents, shadow, latestPulse] = await Promise.all([
          getSubscription(sessionId),
          db
            .select()
            .from(calendarEvents)
            .where(eq(calendarEvents.calendar, 'master'))
            .orderBy(sql`${calendarEvents.scheduledAt} asc nulls last`, desc(calendarEvents.createdAt))
            .limit(50),
          samplePulse(),
          getLatestPulse(),
        ])

        let datetimeEvents: (typeof calendarEvents.$inferSelect)[] = []
        let contentEvents: (typeof calendarEvents.$inferSelect)[] = []
        if (sessionId) {
          const rows = await db
            .select()
            .from(calendarEvents)
            .where(
              and(
                eq(calendarEvents.sessionId, sessionId),
                inArray(calendarEvents.calendar, ['datetime', 'content']),
              ),
            )
            .orderBy(sql`${calendarEvents.scheduledAt} asc nulls last`, desc(calendarEvents.createdAt))
          datetimeEvents = rows.filter((r) => r.calendar === 'datetime')
          contentEvents = rows.filter((r) => r.calendar === 'content')
        }

        // The member's agents — their dedicated/worked-with characters — so the
        // page can offer a real choice for the "just one agent" privacy lever.
        const myAgents = sessionId
          ? await db
              .select({ id: characters.id, name: characters.name, avatar: characters.avatar })
              .from(characters)
              .where(eq(characters.creatorSession, sessionId))
              .orderBy(asc(characters.name))
              .limit(50)
          : []

        return Response.json({
          subscription,
          datetimeEvents,
          contentEvents,
          masterEvents,
          shadow,
          latestPulse,
          myAgents,
        })
      },

      PUT: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const sessionId = String(body.sessionId || '').trim()
        if (!sessionId) return Response.json({ error: 'A session is required' }, { status: 400 })

        const email = String(body.email || '').trim().slice(0, 200)
        const agentsPath = String(body.agentsPath || '/memory').trim().slice(0, 200) || '/memory'
        const cadence = normalizeCadence(body.cadence)
        const scope = normalizeScope(body.scope)
        const dedicatedAgentId =
          scope === 'one' && Number(body.dedicatedAgentId) ? Number(body.dedicatedAgentId) : null

        const values = { email, agentsPath, cadence, scope, dedicatedAgentId, updatedAt: new Date() }
        const [row] = await db
          .insert(cronSubscriptions)
          .values({ sessionId, ...values })
          .onConflictDoUpdate({ target: cronSubscriptions.sessionId, set: values })
          .returning()
        return Response.json(row)
      },
    },
  },
})
