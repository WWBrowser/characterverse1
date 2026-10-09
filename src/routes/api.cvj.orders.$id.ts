import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvjOrders } from '../../db/schema.js'

// A single order. PATCH advances its status (buyer marks it complete or cancels),
// gated to the order's own buyer session.
export const Route = createFileRoute('/api/cvj/orders/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const [order] = await db.select().from(cvjOrders).where(eq(cvjOrders.id, id))
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
        return Response.json(order)
      },

      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const body = await request.json().catch(() => ({}))
        const sessionId = String(body?.sessionId || '').trim()
        const status = String(body?.status || '')
        if (!['completed', 'cancelled'].includes(status)) {
          return Response.json({ error: 'Unknown status.' }, { status: 400 })
        }

        const [order] = await db.select().from(cvjOrders).where(eq(cvjOrders.id, id))
        if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
        if (!sessionId || order.buyerSession !== sessionId) {
          return Response.json({ error: 'Not your order.' }, { status: 403 })
        }

        const [updated] = await db
          .update(cvjOrders)
          .set({ status })
          .where(eq(cvjOrders.id, id))
          .returning({ id: cvjOrders.id, status: cvjOrders.status })
        return Response.json(updated)
      },
    },
  },
})
