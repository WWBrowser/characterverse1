import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { routeAgents } from '../../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import {
  CAPABILITY_SLUGS,
  CLEARANCE_SLUGS,
  ROLES,
} from '../lib/routeclaw.js'

// A single RouteClaw agent.
//
//   PATCH  /api/routeclaw/:id   → rename, edit, switch on/off, reorder, or
//                                  re-route (change capability/clearance) one
//                                  agent. Accepts any subset of editable fields.
//   DELETE /api/routeclaw/:id   → take an agent out of the topology entirely.
//
// Every editable field is validated here too, so a malformed edit can never put
// an unknown capability or clearance into the secure router.

export const Route = createFileRoute('/api/routeclaw/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const id = Number(params.id)
        if (!id || isNaN(id)) return Response.json({ error: 'Invalid agent id' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const [agent] = await db.select().from(routeAgents).where(eq(routeAgents.id, id)).limit(1)
        if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

        // Reorder via neighbor swap — "switch" the routing order of the pipeline.
        if (body.move === 'up' || body.move === 'down') {
          const siblings = await db
            .select()
            .from(routeAgents)
            .where(eq(routeAgents.workspaceId, agent.workspaceId))
            .orderBy(asc(routeAgents.position), asc(routeAgents.id))
          const idx = siblings.findIndex((s) => s.id === id)
          const swapIdx = body.move === 'up' ? idx - 1 : idx + 1
          if (idx !== -1 && swapIdx >= 0 && swapIdx < siblings.length) {
            const neighbor = siblings[swapIdx]
            await db
              .update(routeAgents)
              .set({ position: neighbor.position, updatedAt: new Date() })
              .where(eq(routeAgents.id, agent.id))
            await db
              .update(routeAgents)
              .set({ position: agent.position, updatedAt: new Date() })
              .where(eq(routeAgents.id, neighbor.id))
          }
          const [updated] = await db.select().from(routeAgents).where(eq(routeAgents.id, id)).limit(1)
          return Response.json({ agent: updated })
        }

        // Build a validated partial update from whichever fields were provided.
        const updates: Record<string, any> = {}

        if (typeof body.name === 'string') {
          const name = body.name.trim().slice(0, 40)
          if (!name) return Response.json({ error: 'Name cannot be empty' }, { status: 400 })
          updates.name = name
        }
        if (typeof body.enabled === 'boolean') updates.enabled = body.enabled
        if (typeof body.requiresSignoff === 'boolean') updates.requiresSignoff = body.requiresSignoff
        if (typeof body.description === 'string') updates.description = body.description.trim().slice(0, 280)
        if (typeof body.routeCondition === 'string') updates.routeCondition = body.routeCondition.trim().slice(0, 80)
        if (typeof body.icon === 'string') updates.icon = body.icon.trim().slice(0, 4) || agent.icon
        if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) updates.color = body.color
        if (CAPABILITY_SLUGS.includes(body.capability)) updates.capability = body.capability
        if (CLEARANCE_SLUGS.includes(body.clearance)) updates.clearance = body.clearance

        if (ROLES.includes(body.role)) {
          // Promoting to warden is only allowed if no other warden exists.
          if (body.role === 'warden' && agent.role !== 'warden') {
            const [otherWarden] = await db
              .select()
              .from(routeAgents)
              .where(and(eq(routeAgents.workspaceId, agent.workspaceId), eq(routeAgents.role, 'warden')))
              .limit(1)
            if (otherWarden) {
              return Response.json(
                { error: 'A workspace can only have one Warden. Demote the current one first.' },
                { status: 409 },
              )
            }
          }
          updates.role = body.role
        }

        if (Array.isArray(body.skills)) {
          updates.skills = body.skills.map((s: any) => String(s).trim().slice(0, 24)).filter(Boolean).slice(0, 8)
        }

        if (Object.keys(updates).length === 0) {
          return Response.json({ error: 'No valid fields to update' }, { status: 400 })
        }
        updates.updatedAt = new Date()

        const [updated] = await db.update(routeAgents).set(updates).where(eq(routeAgents.id, id)).returning()
        return Response.json({ agent: updated })
      },

      DELETE: async ({ params }) => {
        const id = Number(params.id)
        if (!id || isNaN(id)) return Response.json({ error: 'Invalid agent id' }, { status: 400 })

        const [agent] = await db.select().from(routeAgents).where(eq(routeAgents.id, id)).limit(1)
        if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

        // The Warden is the topology's entry point — it can't be removed, only
        // switched off or replaced. Disable it instead if you want it idle.
        if (agent.role === 'warden') {
          return Response.json(
            { error: 'The Warden is the routing entry point and cannot be removed.' },
            { status: 409 },
          )
        }

        await db.delete(routeAgents).where(eq(routeAgents.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
