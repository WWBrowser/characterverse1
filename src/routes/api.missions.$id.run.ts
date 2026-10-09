import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { missions, characters, contextEntries, routeAgents } from '../../db/schema.js'
import { eq, and, inArray, asc, or } from 'drizzle-orm'
import { isCleared, clearanceMeta } from '../lib/routeclaw.js'
import { stepProgress, channelMeta, type MissionStep } from '../lib/controltower.js'
import { characterTrace } from '../../db/rooms.js'
import { CAPABILITY_PURPOSE } from '../lib/spatial-room.js'

// Mission run — the autonomous workforce actually doing the work.
//
//   POST /api/missions/$id/run   { signoff?: boolean }
//     → advances the mission's workflow one or more steps and returns the updated
//       mission plus a per-run log.
//
// Advancement is deterministic and server-side so the security model is provable
// rather than model-dependent. Each pending step is routed to an enabled RouteClaw
// agent serving that capability, and the engine REFUSES to run a step on an agent
// whose clearance is below the mission's classification — the same gate that keeps
// RouteClaw secure. How far one call advances is set by the mission's autonomy:
//   • assist      — one step per call (a human drives each)
//   • supervised  — runs until a verification sign-off gate, then pauses (status
//                   "review"); a follow-up call with { signoff: true } continues
//   • autonomous  — runs the whole workflow end to end unless it hits a block
//
// When the workflow completes, the operating character drafts the outbound
// deliverable through the AI Gateway, grounded in the referenced Context Engine
// entries plus any pinned workspace context. If the gateway is unavailable (local
// preview), a deterministic summary is produced so a run always finishes cleanly.

export const Route = createFileRoute('/api/missions/$id/run')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any = {}
        try {
          body = await request.json()
        } catch {
          /* empty body is fine */
        }
        const signoff = Boolean(body?.signoff)

        const [mission] = await db.select().from(missions).where(eq(missions.id, id))
        if (!mission) return Response.json({ error: 'Mission not found' }, { status: 404 })

        if (mission.status === 'done') {
          return Response.json({ mission, log: ['Mission already delivered.'], done: true })
        }

        const steps: MissionStep[] = (Array.isArray(mission.steps) ? mission.steps : []).map(
          (s: any) => ({ ...s }),
        )
        if (!steps.length) {
          return Response.json({ error: 'Mission has no planned steps to run.' }, { status: 409 })
        }

        // Load the workspace's routing layer (the agents that execute steps).
        const agents = await db
          .select()
          .from(routeAgents)
          .where(eq(routeAgents.workspaceId, mission.workspaceId))
          .orderBy(asc(routeAgents.position), asc(routeAgents.id))
        const enabled = agents.filter((a) => a.enabled)
        const warden = enabled.find((a) => a.role === 'warden')

        const log: string[] = []

        // The operating character's room (SpatialVerse Rooms): each step walks to
        // the station named after its capability, so a mission can be watched as
        // it runs. Labels name steps and agents — the workspace's routing layer —
        // never the mission's objective, which is workspace business.
        let room: ReturnType<typeof characterTrace> | null = null
        if (mission.characterId) {
          const [op] = await db
            .select({ id: characters.id, name: characters.name, category: characters.category })
            .from(characters)
            .where(eq(characters.id, mission.characterId))
            .catch(() => [])
          if (op) room = characterTrace(op, 'mission')
        }

        // Intake — the Warden must be online and cleared to take the mission in.
        if (mission.status === 'draft') {
          if (!warden) {
            return Response.json(
              { error: 'No enabled Warden — the routing layer is offline. Switch a Warden on in RouteClaw first.' },
              { status: 409 },
            )
          }
          if (!isCleared(warden.clearance, mission.clearance)) {
            const [blockedMission] = await db
              .update(missions)
              .set({ status: 'blocked', updatedAt: new Date() })
              .where(eq(missions.id, id))
              .returning()
            return Response.json({
              mission: blockedMission,
              log: [
                `Warden ${warden.icon} (${clearanceMeta(warden.clearance).label}) is not cleared to intake a ${clearanceMeta(mission.clearance).label} mission.`,
              ],
              blocked: true,
            })
          }
          log.push(`${warden.icon} ${warden.name} intook the mission — classified ${clearanceMeta(mission.clearance).label}.`)
          room?.step('dispatch', `Took in a mission — ${clearanceMeta(mission.clearance).label}`, 'done', `via ${warden.name}`)
        }

        let blockedReason: string | null = null
        let pausedForSignoff = false

        for (const step of steps) {
          if (step.status === 'done') continue

          // Supervised missions pause at the verification gate for a human sign-off.
          if (step.capability === 'verification' && mission.autonomy === 'supervised' && !signoff) {
            step.status = 'active'
            pausedForSignoff = true
            log.push(`Paused at ${step.label} — awaiting sign-off before delivery.`)
            room?.step('verification', `Waiting for sign-off at ${step.label}`, 'waiting')
            break
          }

          const agent = enabled.find((a) => a.role === 'agent' && a.capability === step.capability)
          if (!agent) {
            step.status = 'blocked'
            blockedReason = `No enabled agent serves ${step.label}. Add or switch one on in RouteClaw.`
            log.push(`Blocked: ${blockedReason}`)
            room?.step(CAPABILITY_PURPOSE[step.capability] || 'rest', `Blocked at ${step.label} — no agent serves it`, 'blocked')
            break
          }
          if (!isCleared(agent.clearance, mission.clearance)) {
            step.status = 'blocked'
            blockedReason = `${agent.name} (${clearanceMeta(agent.clearance).label}) is below the ${clearanceMeta(mission.clearance).label} mission clearance.`
            log.push(`Blocked: ${blockedReason}`)
            room?.step(CAPABILITY_PURPOSE[step.capability] || 'rest', `Blocked at ${step.label} — clearance too low`, 'blocked')
            break
          }

          step.status = 'done'
          step.note = `${agent.icon} ${agent.name} ran ${step.label.toLowerCase()}.`
          log.push(`${agent.icon} ${agent.name} completed ${step.label}.`)
          room?.step(CAPABILITY_PURPOSE[step.capability] || 'rest', `Ran ${step.label}`, 'done', `by ${agent.name}`)

          // Assist advances exactly one step per call — a human drives the rest.
          if (mission.autonomy === 'assist') break
        }

        const allDone = steps.every((s) => s.status === 'done')
        let status: string
        let result = mission.result || ''

        if (blockedReason) {
          status = 'blocked'
        } else if (pausedForSignoff) {
          status = 'review'
        } else if (allDone) {
          status = 'done'
          room?.step('synthesis', 'Drafting the deliverable')
          result = await buildDeliverable(mission, log)
          room?.step('delivery', `Delivered over ${channelMeta(mission.channel).label}`, 'done')
        } else {
          status = 'running'
        }

        room?.step('rest', 'Back in the armchair', 'idle')

        const [updated] = await db
          .update(missions)
          .set({ steps, status, progress: stepProgress(steps), result, updatedAt: new Date() })
          .where(eq(missions.id, id))
          .returning()

        return Response.json({
          mission: updated,
          log,
          done: status === 'done',
          blocked: status === 'blocked',
          review: status === 'review',
        })
      },
    },
  },
})

// Compose the finished outbound work. Grounded in the operating character's voice,
// the mission objective, the chosen channel, and the Context Engine entries the
// mission acts on (its own references plus the workspace's pinned context).
async function buildDeliverable(mission: any, log: string[]): Promise<string> {
  const refs = Array.isArray(mission.contextRefs) ? (mission.contextRefs as number[]) : []

  // Pull referenced context OR pinned workspace context — the shared business
  // memory the agent acts on.
  const ctx = await db
    .select()
    .from(contextEntries)
    .where(
      and(
        eq(contextEntries.workspaceId, mission.workspaceId),
        refs.length
          ? or(inArray(contextEntries.id, refs), eq(contextEntries.pinned, true))
          : eq(contextEntries.pinned, true),
      ),
    )
    .catch(() => [])

  let character: any = null
  if (mission.characterId) {
    const [c] = await db.select().from(characters).where(eq(characters.id, mission.characterId)).catch(() => [])
    character = c || null
  }

  const ch = channelMeta(mission.channel)
  const contextBlock = ctx.length
    ? ctx.map((c: any) => `- [${c.kind}] ${c.title}: ${c.body}`).join('\n')
    : '- (no specific context attached)'

  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY

  // Deterministic fallback so a run always finishes, even without the gateway.
  const fallback =
    `${character ? `${character.name} ` : ''}completed the mission "${mission.title}" over ${ch.label}.\n\n` +
    `Objective: ${mission.objective}\n\n` +
    `Workflow: ${log.join(' ')}\n\n` +
    `Acted on ${ctx.length} context ${ctx.length === 1 ? 'entry' : 'entries'} from the Context Engine.`

  if (!baseUrl || !apiKey) return fallback

  const system =
    `You are ${character ? character.name : 'an AI specialist'}${character?.tagline ? ` — ${character.tagline}` : ''}, ` +
    `an autonomous agent completing an outbound mission for an enterprise workspace.\n` +
    `${character?.persona ? `Voice & persona: ${character.persona}\n` : ''}` +
    `Channel: ${ch.label} (${ch.desc}).\n\n` +
    `Shared business context you must respect:\n${contextBlock}\n\n` +
    `Write the finished deliverable for this mission — the actual outbound work product, ready to send. ` +
    `Be concise and grounded in the context above. Do not describe your process; produce the result itself.`

  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 768,
        system,
        messages: [{ role: 'user', content: `Mission: ${mission.title}\n\nObjective: ${mission.objective}` }],
      }),
    })
    if (!res.ok) return fallback
    const data = await res.json()
    const text = Array.isArray(data.content)
      ? data.content.map((b: any) => b.text || '').join('').trim()
      : ''
    return text || fallback
  } catch {
    return fallback
  }
}
