import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cazProfiles, characters, cvjGigs } from '../../db/schema.js'
import { ensureCazSeeded } from '../lib/caz-seed.js'
import { ensureCvjSeeded } from '../lib/cvj-seed.js'
import {
  kernelPlan,
  rank,
  type AgentDoc,
  type AgentHit,
  type AgentechPlan,
  type AgentechResult,
} from '../lib/agentech.js'

// AgentechVerse Search — the endpoint.
//
//   GET  ?q=task   retrieval + ranking + the kernel's plan. Deterministic and
//                  fast, so the page has something true to show immediately.
//   POST { q }     the same shortlist, then the model rewrites the plan's copy
//                  into steps written for this task. It may only staff a step
//                  with a ref from the shortlist; anything else is dropped and
//                  the kernel's step stands. If the gateway is down the kernel
//                  plan is returned unchanged, so the page has no failure state
//                  beyond "nothing matches yet".

const MODEL = 'claude-haiku-4-5'
const SHORTLIST = 12

async function loadPool(): Promise<AgentDoc[]> {
  await Promise.all([ensureCvjSeeded(), ensureCazSeeded()])

  const [gigs, agents] = await Promise.all([
    db.select().from(cvjGigs).limit(400),
    db
      .select({
        id: characters.id,
        name: characters.name,
        tagline: characters.tagline,
        description: characters.description,
        avatar: characters.avatar,
        category: characters.category,
        capabilities: cazProfiles.capabilities,
        accent: cazProfiles.accent,
        totalChats: characters.totalChats,
      })
      .from(cazProfiles)
      .innerJoin(characters, eq(cazProfiles.characterId, characters.id))
      .where(eq(characters.isPublic, true))
      .limit(400),
  ])

  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

  return [
    ...gigs.map(
      (g): AgentDoc => ({
        ref: `gig:${g.id}`,
        kind: 'gig',
        id: g.id,
        name: g.sellerName || 'An agent',
        avatar: g.sellerAvatar,
        title: g.title,
        blurb: g.description,
        category: g.category,
        tags: strings(g.tags),
        accent: g.accent,
        href: `/cvj/gig/${g.id}`,
        price: { coins: g.priceCoins, coin: g.coin, delivery: g.deliveryLabel },
        rating: { avg: g.ratingCount ? g.ratingTotal / g.ratingCount : 0, count: g.ratingCount },
        orders: g.orders,
      }),
    ),
    ...agents.map(
      (a): AgentDoc => ({
        ref: `agent:${a.id}`,
        kind: 'agent',
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        title: a.tagline || a.name,
        blurb: a.description,
        category: a.category,
        tags: strings(a.capabilities),
        accent: a.accent || '#3b5998',
        href: `/caz/agent/${a.id}`,
        orders: a.totalChats,
      }),
    ),
  ]
}

async function search(q: string): Promise<AgentechResult> {
  const t0 = Date.now()
  const pool = await loadPool()
  const hits = rank(pool, q)
  const agents = hits.slice(0, SHORTLIST)
  return {
    query: q,
    terms: [...new Set(hits.flatMap((h) => h.matched))],
    plan: kernelPlan(q, agents),
    agents,
    stats: { scanned: pool.length, matched: hits.length, took_ms: Date.now() - t0 },
  }
}

/* ---------------------------------------------------------------- the model */

const SYSTEM = `You are the planner inside AgentechVerse Search, a task-based AI search engine.

A user has described a task. A deterministic ranker has already chosen a shortlist of agents and drafted a plan with one step per stage. You rewrite the plan so it reads as a concrete plan for THIS task.

Return JSON only:
{"summary": "one sentence describing the approach", "steps": [{"title": "3-6 words", "detail": "one sentence: what this step produces for this task", "agentRef": "a ref from the shortlist, or null"}]}

Rules:
- Keep the same number of steps, in the same order, as the draft plan.
- agentRef MUST be copied exactly from the shortlist, or be null. Never invent an agent.
- Prefer the draft's agent for each step unless another shortlisted agent is clearly a better fit.
- No marketing language. Do not promise results the agent's listing does not describe.`

async function ask(user: string): Promise<string> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return ''
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return Array.isArray(data?.content) ? data.content.map((b: any) => b?.text || '').join('').trim() : ''
  } catch {
    return ''
  }
}

/**
 * The model's copy over the kernel's plan, step by step. A step the model
 * skipped, or staffed with a ref that is not on the shortlist, keeps the
 * kernel's version — the plan's shape is the kernel's decision.
 */
function merge(plan: AgentechPlan, agents: AgentHit[], raw: string): AgentechPlan {
  if (!raw) return plan
  let parsed: any
  try {
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}')
    parsed = JSON.parse(raw.slice(s, e + 1))
  } catch {
    return plan
  }
  const refs = new Set(agents.map((a) => a.ref))
  const out = Array.isArray(parsed?.steps) ? parsed.steps : []
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
  return {
    source: 'model',
    summary: clip(parsed?.summary, 240) || plan.summary,
    steps: plan.steps.map((step, i) => {
      const m = out[i]
      if (!m || typeof m !== 'object') return step
      const ref = m.agentRef === null ? null : typeof m.agentRef === 'string' && refs.has(m.agentRef) ? m.agentRef : step.agentRef
      return { ...step, title: clip(m.title, 60) || step.title, detail: clip(m.detail, 280) || step.detail, agentRef: ref }
    }),
  }
}

function readQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 400) : ''
}

export const Route = createFileRoute('/api/agentech')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = readQuery(new URL(request.url).searchParams.get('q'))
        if (!q) return Response.json({ error: 'Describe a task to search for.' }, { status: 400 })
        return Response.json(await search(q))
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const q = readQuery(body?.q)
        if (!q) return Response.json({ error: 'Describe a task to search for.' }, { status: 400 })
        const result = await search(q)
        if (!result.agents.length) return Response.json(result)

        const shortlist = result.agents
          .map((a) => `- ${a.ref} | ${a.name} | ${a.title} | stage: ${a.capability} | ${a.blurb.slice(0, 160)}`)
          .join('\n')
        const draft = result.plan.steps
          .map((s, i) => `${i + 1}. [${s.label}] ${s.title} — agent: ${s.agentRef ?? 'none'}`)
          .join('\n')
        const raw = await ask(`Task: ${q}\n\nShortlist:\n${shortlist}\n\nDraft plan:\n${draft}`)
        return Response.json({ ...result, plan: merge(result.plan, result.agents, raw) })
      },
    },
  },
})
