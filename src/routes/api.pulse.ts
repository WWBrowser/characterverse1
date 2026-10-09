import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { cronSubscriptions } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { recordPulse, getLatestPulse, samplePulse } from '../../db/calendar.js'

// The pulse — the heartbeat of the agentic cron layer. GET returns the latest
// recorded pulse plus a fresh live shadow sample (what the agents currently know).
// POST fires a pulse by hand from the Cron page, recording it and stamping the
// member's subscription so their agents see the new "now" on their next reply.
export const Route = createFileRoute('/api/pulse')({
  server: {
    handlers: {
      GET: async () => {
        const [latestPulse, shadow] = await Promise.all([getLatestPulse(), samplePulse()])
        return Response.json({ latestPulse, shadow })
      },

      POST: async ({ request }) => {
        let body: any = {}
        try {
          body = await request.json()
        } catch {
          // a bodyless fire is fine
        }
        const sessionId = String(body.sessionId || '').trim()
        // The hourly scheduled function fires with source 'cron'; the Cron page's
        // "Fire pulse now" button fires 'manual'. The label is cosmetic.
        const source = body.source === 'cron' ? 'cron' : 'manual'
        const pulse = await recordPulse(source)
        if (sessionId) {
          await db
            .update(cronSubscriptions)
            .set({ lastFiredAt: new Date() })
            .where(eq(cronSubscriptions.sessionId, sessionId))
            .catch(() => {})
        }
        return Response.json({ pulse }, { status: 201 })
      },
    },
  },
})
