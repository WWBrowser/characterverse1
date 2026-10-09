import { createFileRoute } from '@tanstack/react-router'
import { getMode, isModeId } from '../lib/modes.js'

// TourClaw — one agentic help marker that follows the user across the whole
// site, instead of scattering a million static tooltips everywhere. The client
// sends where the user is (route + active mode) and an optional question; the
// LLM answers as a concise in-product guide grounded in that location.

// A compact map of the product so TourClaw can orient the user wherever they
// land. Kept short on purpose — it is guidance, not documentation.
const SITE_MAP = `CharacterVerse is an AI character platform. Key places:
- "/" Home: three entrances — Roleplaying, Learning, Business — each opening the Ask LLM in that mode.
- "/mode/roleplay|learn|business": the live mode workspace. Chatting here uses the LLM tuned for that mode, with mode-specific features and its own memory lane.
- "/ask": pick a specific character and start a conversation.
- "/create": design a new character.
- "/discover" and "/learn": browse characters and learning subjects.
- "/memory": everything CharacterVerse remembers about you, separated into lanes — Shared (travels everywhere) plus one per mode.
Memory is united across modes but kept in three separate lanes. TourClaw (you) follow the user between all of these.`

function describeLocation(route: string, mode?: string): string {
  if (mode && isModeId(mode)) {
    const m = getMode(mode)!
    return `The user is in ${m.modeLabel} at "${route}" — the Ask LLM tuned for ${m.label.toLowerCase()}. Its features: ${m.features
      .map((f) => f.title)
      .join(', ')}.`
  }
  const labels: Record<string, string> = {
    '/': 'the Home page, choosing between the three entrances (Roleplaying, Learning, Business)',
    '/ask': 'the Ask page, picking a character to chat with',
    '/create': 'the Create page, designing a character',
    '/memory': 'the Memory page, reviewing what CharacterVerse remembers across the per-mode lanes',
    '/discover': 'the Discover page, browsing characters',
    '/learn': 'the Learn hub, browsing learning subjects',
  }
  return `The user is on ${labels[route] || `the "${route}" page`}.`
}

export const Route = createFileRoute('/api/tourclaw')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const route = String(body.route || '/').slice(0, 120)
        const mode = typeof body.mode === 'string' ? body.mode : undefined
        const question = String(body.question || '').trim().slice(0, 500)

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json(
            { error: 'AI Gateway is not available. Deploy the site to enable TourClaw.' },
            { status: 503 },
          )
        }

        const system = `You are TourClaw, a friendly agentic guide who follows the user everywhere inside CharacterVerse.
You are a single helper that travels with them between pages — not a static tooltip. Be warm, brief, and concrete.

${SITE_MAP}

When you answer:
- Ground your help in where the user currently is.
- Point them to the most relevant next action or place, naming it plainly (e.g. "Enter roleplaying mode" or "the Memory page").
- Keep it to 2-4 short sentences unless the question truly needs more. No markdown headings, no preamble.`

        const userPrompt = question
          ? `${describeLocation(route, mode)}\n\nThey asked: "${question}"\n\nGuide them.`
          : `${describeLocation(route, mode)}\n\nGive one short, useful tip for what they can do here right now, and where to go next.`

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
              max_tokens: 400,
              system,
              messages: [{ role: 'user', content: userPrompt }],
            }),
          })

          if (!res.ok) {
            return Response.json({ error: 'TourClaw could not respond right now.' }, { status: 502 })
          }

          const data = await res.json()
          const reply = Array.isArray(data.content)
            ? data.content.map((b: any) => b.text || '').join('').trim()
            : ''

          if (!reply) {
            return Response.json({ error: 'TourClaw could not respond right now.' }, { status: 502 })
          }

          return Response.json({ reply })
        } catch (error) {
          console.error('TourClaw error:', error)
          return Response.json({ error: 'TourClaw failed to respond.' }, { status: 500 })
        }
      },
    },
  },
})
