import { createFileRoute } from '@tanstack/react-router'
import { ensureCazSeeded } from '../lib/caz-seed.js'

// Idempotent seed for CAZ — safe to POST repeatedly. Seeding also runs lazily the
// first time any CAZ feed is read.
export const Route = createFileRoute('/api/caz/seed')({
  server: {
    handlers: {
      POST: async () => {
        await ensureCazSeeded()
        return Response.json({ ok: true })
      },
    },
  },
})
