import { createFileRoute } from '@tanstack/react-router'
import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tabverseForks, tabverseCycles } from '../../db/schema.js'
import { totals, type Cycle } from '../lib/tabverse.js'

export const Route = createFileRoute('/api/tabverse/forks/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

        const [fork] = await db.select().from(tabverseForks).where(eq(tabverseForks.id, id))
        if (!fork) return Response.json({ error: 'Not found' }, { status: 404 })

        const cycles = (await db
          .select()
          .from(tabverseCycles)
          .where(eq(tabverseCycles.forkId, id))
          .orderBy(asc(tabverseCycles.cycleIndex))) as unknown as Cycle[]

        return Response.json({ fork, cycles, totals: totals(cycles) })
      },

      DELETE: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
        // Remove the ledger first to satisfy the foreign key.
        await db.delete(tabverseCycles).where(eq(tabverseCycles.forkId, id))
        await db.delete(tabverseForks).where(eq(tabverseForks.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
