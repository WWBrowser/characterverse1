import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { clusterIncarnations } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { DECISIONS, type Decision } from '../lib/clusters.js'
import { ensureCoinSettings, mintCoins } from '../../db/coins.js'
import { coerceSettings } from '../lib/coins.js'

// A single penned incarnation.
//
//   GET    /api/clusters/$id            → the full life (answer, metrics, tests, soul)
//   PATCH  /api/clusters/$id  { action } → the operator's decision on the held cluster:
//       promote → improved on its last life; keep these weights as the new baseline
//       revert  → degraded; roll back to the previous life's weights
//       retire  → release from the pen; its soul carries to the next incarnation
//   DELETE /api/clusters/$id            → discard the life entirely (clears the pen slot)

const STATUS_FOR: Record<Decision, string> = {
  promote: 'promoted',
  revert: 'reverted',
  retire: 'retired',
}

export const Route = createFileRoute('/api/clusters/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const [inc] = await db.select().from(clusterIncarnations).where(eq(clusterIncarnations.id, id))
        if (!inc) return Response.json({ error: 'Incarnation not found' }, { status: 404 })
        return Response.json({ incarnation: inc })
      },

      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const action = body?.action as Decision
        if (!DECISIONS.includes(action)) {
          return Response.json({ error: `action must be one of: ${DECISIONS.join(', ')}` }, { status: 400 })
        }

        const [inc] = await db.select().from(clusterIncarnations).where(eq(clusterIncarnations.id, id))
        if (!inc) return Response.json({ error: 'Incarnation not found' }, { status: 404 })

        const [updated] = await db
          .update(clusterIncarnations)
          .set({ status: STATUS_FOR[action], updatedAt: new Date() })
          .where(eq(clusterIncarnations.id, id))
          .returning()

        // Gold (CC) is mined from cluster training success: a promotion means this
        // incarnation improved on its last life (measured from its sub-weights), so
        // the gain pays out the training coin. Mining and training data in one pass.
        if (action === 'promote') {
          ensureCoinSettings()
            .then((s) => {
              const rate = coerceSettings(s).goldRates.cluster
              return mintCoins({
                sessionId: String(body.sessionId || ''),
                coin: 'gold',
                coins: rate,
                source: 'cluster',
                reason: `${updated.clusterName || 'Cluster'} promoted (gen ${updated.generation})`,
                refType: 'cluster_incarnation',
                refId: id,
              })
            })
            .catch(() => {})
        }

        return Response.json({ incarnation: updated })
      },

      DELETE: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        await db.delete(clusterIncarnations).where(eq(clusterIncarnations.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
