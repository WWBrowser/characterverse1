import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { routeAgents } from '../../db/schema.js'
import { eq, asc } from 'drizzle-orm'
import { DEFAULT_AGENTS, DEFAULT_WORKSPACE, sanitizeAgentInput } from '../lib/routeclaw.js'

// RouteClaw agency network — the Agentic Edge Routing Layer (AERL).
//
//   GET  /api/routeclaw            → the workspace's routing topology (agents in
//                                     pipeline order). Seeds the default Warden +
//                                     five agents the first time it is opened.
//   POST /api/routeclaw            → add a new agent to the topology.
//
// The whole layer is editable from here and api.routeclaw.$id (rename, edit,
// switch on/off, take away). Every write is sanitized server-side
// (sanitizeAgentInput) so unknown capabilities/clearances can't slip into the
// router — that is what keeps the routing secure.

async function listAgents(workspaceId: string) {
  return db
    .select()
    .from(routeAgents)
    .where(eq(routeAgents.workspaceId, workspaceId))
    .orderBy(asc(routeAgents.position), asc(routeAgents.id))
}

export const Route = createFileRoute('/api/routeclaw')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        let rows = await listAgents(workspaceId)

        // Lazily seed the reference topology the first time this workspace's
        // routing layer is opened. Idempotent — only seeds an empty workspace.
        if (rows.length === 0) {
          await db.insert(routeAgents).values(
            DEFAULT_AGENTS.map((a, i) => ({
              workspaceId,
              name: a.name,
              role: a.role,
              capability: a.capability,
              description: a.description,
              routeCondition: a.routeCondition,
              skills: a.skills,
              icon: a.icon,
              color: a.color,
              clearance: a.clearance,
              requiresSignoff: a.requiresSignoff,
              position: i,
            })),
          )
          rows = await listAgents(workspaceId)
        }

        return Response.json({ agents: rows })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const workspaceId = String(body?.workspaceId || DEFAULT_WORKSPACE).slice(0, 60)
        const clean = sanitizeAgentInput(body)
        if (!clean.ok) return Response.json({ error: clean.error }, { status: 400 })

        // The Warden is the single dispatcher hub — there can only be one. A new
        // agent claiming 'warden' is demoted to a regular agent.
        const existing = await listAgents(workspaceId)
        let role = clean.value.role
        if (role === 'warden' && existing.some((a) => a.role === 'warden')) {
          role = 'agent'
        }

        const nextPosition = existing.reduce((max, a) => Math.max(max, a.position), -1) + 1

        const [created] = await db
          .insert(routeAgents)
          .values({
            workspaceId,
            name: clean.value.name,
            role,
            capability: clean.value.capability,
            description: clean.value.description,
            routeCondition: clean.value.routeCondition,
            skills: clean.value.skills,
            icon: clean.value.icon,
            color: clean.value.color,
            clearance: clean.value.clearance,
            requiresSignoff: clean.value.requiresSignoff,
            position: nextPosition,
          })
          .returning()

        return Response.json({ agent: created }, { status: 201 })
      },
    },
  },
})
