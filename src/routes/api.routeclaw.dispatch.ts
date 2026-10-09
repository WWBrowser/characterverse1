import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { routeAgents } from '../../db/schema.js'
import { eq, asc } from 'drizzle-orm'
import {
  CAPABILITIES,
  capabilityMeta,
  clearanceMeta,
  isCleared,
  DEFAULT_WORKSPACE,
  CLEARANCE_SLUGS,
} from '../lib/routeclaw.js'

// RouteClaw dispatch — the Warden routing a live request through the edge layer.
//
//   POST /api/routeclaw/dispatch  { request, clearance?, workspaceId? }
//     → { analysis, classification, steps:[{capability, agent, skills, status}],
//         blocked:[...], delivered }
//
// Routing is deterministic and runs entirely server-side so the security model
// is provable rather than model-dependent: the Warden decomposes the request,
// matches each sub-task to an enabled agent by capability, and REFUSES to route
// any sub-task to an agent whose clearance is below the request's classification.
// That clearance check is what keeps the routing secure.

export const Route = createFileRoute('/api/routeclaw/dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const text = String(body?.request || '').trim().slice(0, 600)
        if (!text) return Response.json({ error: 'A request to route is required' }, { status: 400 })

        const classification = CLEARANCE_SLUGS.includes(body?.clearance) ? body.clearance : 'public'
        const workspaceId = String(body?.workspaceId || DEFAULT_WORKSPACE).slice(0, 60)

        const all = await db
          .select()
          .from(routeAgents)
          .where(eq(routeAgents.workspaceId, workspaceId))
          .orderBy(asc(routeAgents.position), asc(routeAgents.id))

        const enabled = all.filter((a) => a.enabled)
        const warden = enabled.find((a) => a.role === 'warden')
        if (!warden) {
          return Response.json(
            { error: 'No enabled Warden — the routing layer is offline. Switch a Warden on first.' },
            { status: 409 },
          )
        }
        if (!isCleared(warden.clearance, classification)) {
          return Response.json({
            analysis: `Warden (${clearanceMeta(warden.clearance).label} clearance) is not cleared to intake a ${clearanceMeta(classification).label} request.`,
            classification,
            warden: { name: warden.name, icon: warden.icon, clearance: warden.clearance },
            steps: [],
            blocked: [{ capability: 'dispatch', reason: 'Warden under-cleared for this classification' }],
            delivered: false,
          })
        }

        // Decompose — which capabilities does this request need? Match the
        // request text against each capability's keywords.
        const lower = text.toLowerCase()
        const wantsByKeyword = CAPABILITIES.filter(
          (c) => c.capability !== 'dispatch' && c.keywords.some((k) => lower.includes(k)),
        ).map((c) => c.capability)

        // Default path when nothing specific matched: research then synthesis.
        let needed = wantsByKeyword.length ? [...wantsByKeyword] : ['research', 'synthesis']
        // Every response flows back through the security gate and out the door:
        // Sentry (verification) signs off, Courier (delivery) ships it.
        if (!needed.includes('verification')) needed.push('verification')
        if (!needed.includes('delivery')) needed.push('delivery')
        // Order the sub-tasks along the pipeline.
        const order = CAPABILITIES.map((c) => c.capability)
        needed = order.filter((c) => c !== 'dispatch' && needed.includes(c))

        const steps: any[] = []
        const blocked: any[] = []

        for (const capability of needed) {
          const meta = capabilityMeta(capability)
          // Pick the first enabled agent serving this capability.
          const agent = enabled.find((a) => a.role === 'agent' && a.capability === capability)
          if (!agent) {
            blocked.push({ capability, reason: 'No enabled agent for this capability', label: meta.label })
            continue
          }
          // Security gate: the agent must be cleared for the request.
          if (!isCleared(agent.clearance, classification)) {
            blocked.push({
              capability,
              reason: `${agent.name} (${clearanceMeta(agent.clearance).label}) is below the ${clearanceMeta(classification).label} request clearance`,
              label: meta.label,
              agent: agent.name,
            })
            continue
          }
          steps.push({
            capability,
            label: meta.label,
            agent: { id: agent.id, name: agent.name, icon: agent.icon, color: agent.color, clearance: agent.clearance },
            skills: Array.isArray(agent.skills) ? agent.skills : [],
            requiresSignoff: agent.requiresSignoff,
            task: `${meta.label}: ${meta.desc}`,
          })
        }

        // Delivery only happens if a Courier actually ran AND every sign-off
        // agent in the chain approved (i.e. wasn't blocked).
        const deliveredStep = steps.find((s) => s.capability === 'delivery')
        const signoffBlocked = blocked.some((b) => b.capability === 'verification')
        const delivered = Boolean(deliveredStep) && !signoffBlocked

        const wardenTask =
          `Warden intake: classified ${clearanceMeta(classification).label}. ` +
          `Decomposed into ${needed.length} sub-task${needed.length === 1 ? '' : 's'} ` +
          `(${needed.map((c) => capabilityMeta(c).label).join(' → ')}). ` +
          `Routed ${steps.length}, blocked ${blocked.length} on clearance/staffing.`

        return Response.json({
          analysis: wardenTask,
          classification,
          warden: { name: warden.name, icon: warden.icon, clearance: warden.clearance },
          steps,
          blocked,
          delivered,
        })
      },
    },
  },
})
