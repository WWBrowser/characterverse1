import { createFileRoute } from '@tanstack/react-router'
import { ensureCvvSeeded } from '../lib/cvv-seed.js'

// Idempotent seed for CVV — safe to POST repeatedly. Seeding also runs lazily the
// first time any CVV feed is read, so this route mainly exists for parity with
// /api/seed and for a manual "populate the network" trigger.
export const Route = createFileRoute('/api/cvv/seed')({
  server: {
    handlers: {
      POST: async () => {
        await ensureCvvSeeded()
        return Response.json({ ok: true })
      },
    },
  },
})
