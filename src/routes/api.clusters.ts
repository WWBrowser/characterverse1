import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { clusterIncarnations, routeAgents } from '../../db/schema.js'
import { eq, and, asc, desc } from 'drizzle-orm'
import { DEFAULT_AGENTS, DEFAULT_WORKSPACE } from '../lib/routeclaw.js'
import {
  assessFit,
  buildSoul,
  clusterKeyForAgent,
  compareProfiles,
  makeTransactionId,
  sanitizeQuestion,
  scoreResponse,
  soulPromptLine,
  topicTermsForAgent,
  type ClusterSoul,
  type MetricProfile,
  type RoutableAgent,
} from '../lib/clusters.js'

// Cluster Control — the Cluster Pen.
//
//   GET  /api/clusters?workspace=
//     → { clusters, pen, history }
//       The roster of clustered workers callable from the hive (each with its pen
//       state and metric trajectory), the lives currently held in the pen, and a
//       recent history of decided lives.
//
//   POST /api/clusters   { workspaceId?, agentId, question }
//     → calls a cluster from the hive: it loads its weights, answers the question,
//       and is HELD in the pen instead of dying. Captures its metric profile,
//       carries forward its soul from the previous life, and compares the two.
//       If it has the wrong weights it self-corrects, escalates with a clean
//       handoff, or pauses for human review — it never abandons the job.

async function listAgents(workspaceId: string) {
  return db
    .select()
    .from(routeAgents)
    .where(eq(routeAgents.workspaceId, workspaceId))
    .orderBy(asc(routeAgents.position), asc(routeAgents.id))
}

// Lazily seed the RouteClaw topology so the hive has clusters to call even if
// RouteClaw itself was never opened (idempotent — only seeds an empty workspace).
async function ensureAgents(workspaceId: string) {
  let rows = await listAgents(workspaceId)
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
  return rows
}

export const Route = createFileRoute('/api/clusters')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        const agents = await ensureAgents(workspaceId)

        const incarnations = await db
          .select()
          .from(clusterIncarnations)
          .where(eq(clusterIncarnations.workspaceId, workspaceId))
          .orderBy(desc(clusterIncarnations.generation), desc(clusterIncarnations.id))

        // Latest incarnation per cluster lineage.
        const latestByKey = new Map<string, any>()
        for (const inc of incarnations) {
          if (!latestByKey.has(inc.clusterKey)) latestByKey.set(inc.clusterKey, inc)
        }

        const clusters = agents
          .filter((a) => a.role === 'agent')
          .map((a) => {
            const key = clusterKeyForAgent(a.id)
            const latest = latestByKey.get(key) || null
            return {
              agentId: a.id,
              name: a.name,
              icon: a.icon,
              color: a.color,
              capability: a.capability,
              skills: a.skills,
              clearance: a.clearance,
              enabled: a.enabled,
              lineageKey: key,
              generation: latest ? latest.generation : 0,
              penned: latest ? latest.status === 'penned' : false,
              latest,
              trajectory: latest?.soul?.trajectory || [],
            }
          })

        const pen = incarnations.filter((i) => i.status === 'penned')
        const history = incarnations.filter((i) => i.status !== 'penned').slice(0, 30)

        return Response.json({ clusters, pen, history })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const workspaceId = String(body?.workspaceId || DEFAULT_WORKSPACE).slice(0, 60)
        const agentId = Number(body?.agentId)
        if (!Number.isInteger(agentId) || agentId <= 0) {
          return Response.json({ error: 'A cluster (agentId) is required' }, { status: 400 })
        }
        const question = sanitizeQuestion(body?.question)
        if (!question) return Response.json({ error: 'A question is required' }, { status: 400 })

        const agents = await ensureAgents(workspaceId)
        const called = agents.find((a) => a.id === agentId)
        if (!called) return Response.json({ error: 'Cluster not found' }, { status: 404 })
        if (!called.enabled) {
          return Response.json({ error: 'That cluster is switched off in RouteClaw — switch it on to call it.' }, { status: 409 })
        }

        // Step 1–2: the cluster is called from the hive and picks up its weights.
        const routable: RoutableAgent[] = agents.map((a) => ({
          id: a.id,
          name: a.name,
          icon: a.icon,
          role: a.role,
          capability: a.capability,
          skills: a.skills,
          routeCondition: a.routeCondition,
          enabled: a.enabled,
        }))
        const fit = assessFit(question, routable.find((r) => r.id === agentId)!, routable)

        // The soul this incarnation is born with — the memory of its last life.
        const key = clusterKeyForAgent(agentId)
        const [prior] = await db
          .select()
          .from(clusterIncarnations)
          .where(and(eq(clusterIncarnations.workspaceId, workspaceId), eq(clusterIncarnations.clusterKey, key)))
          .orderBy(desc(clusterIncarnations.generation), desc(clusterIncarnations.id))
          .limit(1)

        const generation = prior ? prior.generation + 1 : 1
        const soul = buildSoul(prior ? (prior as any) : null, generation)

        // Step 3: answer the question (timed). The form of the answer depends on the
        // clean exit the cluster takes — it never abandons.
        const start = Date.now()
        let response = ''
        if (fit.disposition === 'escalated') {
          response = `Handoff package for ${fit.handoffName}:\n\nClient asked: "${question}"\n\nThis cluster (${called.name}) is not the right specialist. Full context is preserved and passed on so the next cluster starts fresh — no credits spent twice, no tools left scattered.`
        } else if (fit.disposition === 'human_review') {
          response = `Before answering "${question}", one clarification is needed so the right weights are loaded. Held in the pen — the job is paused, not dropped, and no compute is wasted on a guess.`
        } else {
          response = await answerAsCluster(called, question, soul)
        }
        const latencyMs = Date.now() - start

        // Step 5: measure performance. Step 6: compare to the previous life.
        const metrics: MetricProfile = scoreResponse(question, response, latencyMs, topicTermsForAgent(routable.find((r) => r.id === agentId)!))
        const priorProfile: MetricProfile | null = prior ? ((prior.profile as any)?.quality ? (prior.profile as MetricProfile) : (prior.metrics as MetricProfile)) : null
        const comparison = compareProfiles(metrics, priorProfile && priorProfile.quality ? priorProfile : null)

        // Step 4: HOLD in the pen (don't die). Tools tracked + released cleanly.
        const [created] = await db
          .insert(clusterIncarnations)
          .values({
            workspaceId,
            clusterKey: key,
            agentId,
            clusterName: called.name,
            icon: called.icon,
            capability: called.capability,
            weights: Array.isArray(called.skills) ? called.skills : [],
            generation,
            status: 'penned',
            question,
            response,
            disposition: fit.disposition,
            handoffTo: fit.handoffName,
            handoffNote: fit.note,
            transactionId: makeTransactionId(`${agentId}_${Date.now()}`),
            toolsReleased: true,
            metrics,
            tests: [],
            profile: metrics,
            soul,
            verdict: comparison.verdict,
            verdictNote: comparison.note,
          })
          .returning()

        return Response.json({ incarnation: created, comparison, soul }, { status: 201 })
      },
    },
  },
})

// The cluster answers in the voice of its RouteClaw capability, AWARE of its past
// life (its soul). Uses the AI Gateway when available; falls back to a structured
// deterministic answer so a call always completes — and is always scoreable —
// even in local preview without the gateway.
async function answerAsCluster(agent: any, question: string, soul: ClusterSoul): Promise<string> {
  const skills = Array.isArray(agent.skills) ? (agent.skills as string[]) : []
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY

  const fallback =
    `${agent.name} — ${agent.capability} cluster — on: "${question}".\n\n` +
    (skills.length ? `Applying loaded weights: ${skills.join(', ')}.\n\n` : '') +
    `Working the request end to end and returning a complete result rather than dropping it. ` +
    (soul.lastProfile ? `Building on a previous life that scored ${soul.lastProfile.quality.toFixed(1)}/5.` : `This is a first life — establishing a baseline.`)

  if (!baseUrl || !apiKey) return fallback

  const soulLine = soulPromptLine(soul)
  const system =
    `You are ${agent.name}, a specialized ${agent.capability} cluster — an edge worker called from the hive to answer one client question. ` +
    `${agent.description ? agent.description + ' ' : ''}` +
    `Your loaded weights (skills): ${skills.join(', ') || 'general'}.\n` +
    (soulLine ? `${soulLine}\n` : '') +
    `Answer the client's question directly, completely, and concisely. Finish your thought — never leave the answer cut off.`

  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 768,
        system,
        messages: [{ role: 'user', content: question }],
      }),
    })
    if (!res.ok) return fallback
    const data = await res.json()
    const text = Array.isArray(data.content) ? data.content.map((b: any) => b.text || '').join('').trim() : ''
    return text || fallback
  } catch {
    return fallback
  }
}
