import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { clusterIncarnations, routeAgents } from '../../db/schema.js'
import { eq, and, desc, lt } from 'drizzle-orm'
import {
  averageProfiles,
  compareProfiles,
  sanitizeQuestion,
  scoreResponse,
  soulPromptLine,
  topicTermsForAgent,
  type MetricProfile,
  type RoutableAgent,
} from '../lib/clusters.js'

// Test a cluster while it is held in the pen — the "testing window" that the old
// die-on-answer lifecycle never allowed.
//
//   POST /api/clusters/$id/test   { query }
//     → runs an additional query against the same held cluster (same weights, same
//       state), scores it, folds it into the life's running profile, and re-compares
//       that profile to the previous life. Returns the updated incarnation.

export const Route = createFileRoute('/api/clusters/$id/test')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const query = sanitizeQuestion(body?.query)
        if (!query) return Response.json({ error: 'A test query is required' }, { status: 400 })

        const [inc] = await db.select().from(clusterIncarnations).where(eq(clusterIncarnations.id, id))
        if (!inc) return Response.json({ error: 'Incarnation not found' }, { status: 404 })
        if (inc.status !== 'penned') {
          return Response.json({ error: 'This cluster has left the pen — only penned clusters can be tested.' }, { status: 409 })
        }

        const [agent] = inc.agentId
          ? await db.select().from(routeAgents).where(eq(routeAgents.id, inc.agentId))
          : []

        const routable: RoutableAgent | null = agent
          ? { id: agent.id, name: agent.name, icon: agent.icon, role: agent.role, capability: agent.capability, skills: agent.skills, routeCondition: agent.routeCondition, enabled: agent.enabled }
          : null
        const topicTerms = routable ? topicTermsForAgent(routable) : []

        // Answer from the same held weights and the same soul.
        const start = Date.now()
        const response = await answerAsCluster(agent || { name: inc.clusterName, capability: inc.capability, skills: inc.weights }, query, inc.soul as any)
        const latencyMs = Date.now() - start

        const testMetrics = scoreResponse(query, response, latencyMs, topicTerms)
        const tests = Array.isArray(inc.tests) ? [...(inc.tests as any[])] : []
        tests.push({ query, response, metrics: testMetrics })

        // Running profile across the primary answer + every test in the window.
        const allProfiles: MetricProfile[] = [inc.metrics as MetricProfile, ...tests.map((t) => t.metrics as MetricProfile)]
        const profile = averageProfiles(allProfiles)

        // Re-compare the running profile to the previous life.
        const [prior] = await db
          .select()
          .from(clusterIncarnations)
          .where(and(eq(clusterIncarnations.clusterKey, inc.clusterKey), lt(clusterIncarnations.generation, inc.generation)))
          .orderBy(desc(clusterIncarnations.generation))
          .limit(1)
        const priorProfile: MetricProfile | null = prior ? ((prior.profile as any)?.quality ? (prior.profile as MetricProfile) : (prior.metrics as MetricProfile)) : null
        const comparison = compareProfiles(profile, priorProfile && priorProfile.quality ? priorProfile : null)

        const [updated] = await db
          .update(clusterIncarnations)
          .set({ tests, profile, verdict: comparison.verdict, verdictNote: comparison.note, updatedAt: new Date() })
          .where(eq(clusterIncarnations.id, id))
          .returning()

        return Response.json({ incarnation: updated, comparison, test: { query, response, metrics: testMetrics } })
      },
    },
  },
})

// Same cluster, same loaded weights — answer a follow-up test query. Mirrors the
// generator in api.clusters.ts; uses the AI Gateway when available, deterministic
// otherwise so the testing window always works in local preview.
async function answerAsCluster(agent: any, question: string, soul: any): Promise<string> {
  const skills = Array.isArray(agent?.skills) ? (agent.skills as string[]) : []
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY

  const fallback =
    `${agent?.name || 'Cluster'} — ${agent?.capability || 'general'} cluster — on: "${question}".\n\n` +
    (skills.length ? `Applying loaded weights: ${skills.join(', ')}.\n\n` : '') +
    `Answering from the same held state and returning a complete result.`

  if (!baseUrl || !apiKey) return fallback

  const soulLine = soulPromptLine(soul)
  const system =
    `You are ${agent?.name || 'a cluster'}, a specialized ${agent?.capability || 'general'} cluster held in a testing pen. ` +
    `Your loaded weights (skills): ${skills.join(', ') || 'general'}.\n` +
    (soulLine ? `${soulLine}\n` : '') +
    `Answer the follow-up question directly, completely, and concisely. Finish your thought — never leave the answer cut off.`

  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 768, system, messages: [{ role: 'user', content: question }] }),
    })
    if (!res.ok) return fallback
    const data = await res.json()
    const text = Array.isArray(data.content) ? data.content.map((b: any) => b.text || '').join('').trim() : ''
    return text || fallback
  } catch {
    return fallback
  }
}
