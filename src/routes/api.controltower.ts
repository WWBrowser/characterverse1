import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters, routeAgents, missions, contextEntries } from '../../db/schema.js'
import { eq, asc, desc } from 'drizzle-orm'
import { DEFAULT_AGENTS } from '../lib/routeclaw.js'
import { DEFAULT_WORKSPACE, MODEL_REGISTRY } from '../lib/controltower.js'

// AI Control Tower feed — the single aggregate view of the autonomous workforce.
//
//   GET /api/controltower?workspace=
//     → { stats, agents, characters, models }
//
// Pulls the fleet into one payload: headline counts, the live RouteClaw agent
// roster, the characters available to operate missions, and the model registry.
// Lazily seeds the default routing layer so a workspace that opens the tower
// before RouteClaw still has agents ready to run missions (idempotent).

export const Route = createFileRoute('/api/controltower')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        let agents = await db
          .select()
          .from(routeAgents)
          .where(eq(routeAgents.workspaceId, workspaceId))
          .orderBy(asc(routeAgents.position), asc(routeAgents.id))

        if (agents.length === 0) {
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
          agents = await db
            .select()
            .from(routeAgents)
            .where(eq(routeAgents.workspaceId, workspaceId))
            .orderBy(asc(routeAgents.position), asc(routeAgents.id))
        }

        const chars = await db
          .select({
            id: characters.id,
            name: characters.name,
            avatar: characters.avatar,
            tagline: characters.tagline,
            category: characters.category,
            totalChats: characters.totalChats,
          })
          .from(characters)
          .orderBy(desc(characters.totalChats))
          .limit(40)

        const missionRows = await db
          .select({ status: missions.status, progress: missions.progress })
          .from(missions)
          .where(eq(missions.workspaceId, workspaceId))

        const ctxRows = await db
          .select({ kind: contextEntries.kind, pinned: contextEntries.pinned })
          .from(contextEntries)
          .where(eq(contextEntries.workspaceId, workspaceId))

        const missionsByStatus: Record<string, number> = {}
        for (const m of missionRows) missionsByStatus[m.status] = (missionsByStatus[m.status] || 0) + 1

        const contextByKind: Record<string, number> = {}
        for (const c of ctxRows) contextByKind[c.kind] = (contextByKind[c.kind] || 0) + 1

        const stats = {
          characters: chars.length,
          agentsEnabled: agents.filter((a) => a.enabled).length,
          agentsTotal: agents.length,
          missionsTotal: missionRows.length,
          missionsActive: missionRows.filter((m) => m.status === 'running' || m.status === 'review').length,
          missionsDone: missionRows.filter((m) => m.status === 'done').length,
          missionsByStatus,
          contextTotal: ctxRows.length,
          contextPinned: ctxRows.filter((c) => c.pinned).length,
          contextByKind,
          models: MODEL_REGISTRY.length,
        }

        return Response.json({ stats, agents, characters: chars, models: MODEL_REGISTRY })
      },
    },
  },
})
