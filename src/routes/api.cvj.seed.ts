import { createFileRoute } from '@tanstack/react-router'
import { ensureCvjSeeded } from '../lib/cvj-seed.js'

// Idempotent seed for CVJ — safe to POST repeatedly. Seeding also runs lazily the
// first time the marketplace or a gig is read.
export const Route = createFileRoute('/api/cvj/seed')({
  server: {
    handlers: {
      POST: async () => {
        await ensureCvjSeeded()
        return Response.json({ ok: true })
      },
    },
  },
})
