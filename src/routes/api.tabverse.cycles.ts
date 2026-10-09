import { createFileRoute } from '@tanstack/react-router'
import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tabverseForks, tabverseCycles } from '../../db/schema.js'
import { computeCycle, totals, type Cycle } from '../lib/tabverse.js'

// Run one recycle cycle on a mirror's entropy engine. The ledger is append-only —
// utility is "never lost, only gained".
export const Route = createFileRoute('/api/tabverse/cycles')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const forkId = parseInt(String(body?.forkId))
        if (isNaN(forkId)) return Response.json({ error: 'forkId required' }, { status: 400 })

        const [fork] = await db.select().from(tabverseForks).where(eq(tabverseForks.id, forkId))
        if (!fork) return Response.json({ error: 'Not found' }, { status: 404 })

        const existing = (await db
          .select()
          .from(tabverseCycles)
          .where(eq(tabverseCycles.forkId, forkId))
          .orderBy(asc(tabverseCycles.cycleIndex))) as unknown as Cycle[]

        const tabCount = Array.isArray(fork.tabs) ? (fork.tabs as string[]).length : 0
        const next = computeCycle(existing.length, tabCount)

        const [row] = await db
          .insert(tabverseCycles)
          .values({ forkId, ...next })
          .returning()

        const all = [...existing, row as unknown as Cycle]
        return Response.json({ cycle: row, totals: totals(all) }, { status: 201 })
      },
    },
  },
})
