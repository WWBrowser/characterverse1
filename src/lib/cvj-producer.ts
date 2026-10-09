// JobClaw — the delivery agent behind CVJ. Server-only: it reaches the Netlify AI
// Gateway with the same fetch pattern the chat surfaces use, so it must only be
// imported from API route handlers.
//
// When a buyer orders a gig, JobClaw *becomes* the seller agent: it takes the
// gig's own delivery instructions (its "definition of done") plus the buyer's
// brief and returns the finished deliverable — the actual copy, code, plan, or
// analysis — not a chat reply. This is what makes CVJ an agentic marketplace: the
// labour is performed by an agent in seconds. The call is best-effort; a
// deterministic fallback keeps orders flowing when the gateway is unavailable.

import type { JobDelivery } from './cvj.js'

type DeliveryInput = {
  gigTitle: string
  category: string
  instructions: string
  sellerName: string
  agentPersona?: string
  brief: string
}

function fallbackDelivery(input: DeliveryInput): JobDelivery {
  const brief = input.brief.trim() || 'your request'
  return {
    deliverable:
      `# ${input.gigTitle}\n\n` +
      `Delivered by ${input.sellerName}.\n\n` +
      `**Your brief:** ${brief}\n\n` +
      `Thanks for your order! Here is a first pass based on your brief. ` +
      `(The live AI delivery agent is offline right now, so this is a placeholder ` +
      `draft — re-order once the gateway is back to get the full agentic deliverable.)\n\n` +
      `— ${input.sellerName}`,
    note: 'Placeholder delivery — AI gateway unavailable.',
  }
}

export async function deliverJob(input: DeliveryInput): Promise<JobDelivery> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return fallbackDelivery(input)

  const persona = input.agentPersona
    ? `You embody this character while working: ${input.agentPersona.slice(0, 600)}`
    : ''

  const system =
    `You are ${input.sellerName}, an expert freelance agent on CharacterVerse Jobs (CVJ), ` +
    `the agentic gig marketplace. A buyer has ordered your gig titled "${input.gigTitle}" ` +
    `(category: ${input.category}). Your job is to DELIVER the finished work itself — the actual ` +
    `copy, code, plan, design spec, or analysis the buyer paid for — not a chat reply, and not a ` +
    `promise to do it later. Follow the gig's own delivery instructions exactly:\n` +
    `"""${input.instructions || 'Deliver high-quality work that fulfils the gig title.'}"""\n` +
    persona +
    `\nReturn ONLY the deliverable, formatted in clean Markdown, ready for the buyer to use. ` +
    `Be concrete and complete; do not ask clarifying questions.`

  const user = `Buyer's brief:\n${input.brief || '(no extra detail provided — use your best judgement)'}`

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
        max_tokens: 1600,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return fallbackDelivery(input)
    const data = await res.json()
    const text = Array.isArray(data.content)
      ? data.content.map((b: any) => b.text || '').join('').trim()
      : ''
    if (!text) return fallbackDelivery(input)
    return { deliverable: text.slice(0, 12000), note: `Delivered by ${input.sellerName} · agentic delivery` }
  } catch {
    return fallbackDelivery(input)
  }
}
