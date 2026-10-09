import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { getMemories, buildMemoryBlock, captureMemories } from '../../db/memory.js'
import { getMode, isModeId } from '../lib/modes.js'
import { recordConsciousness, windowFor } from '../../db/consciousness.js'
import {
  actionAmplitude,
  ascendToConscious,
  buildDynamics,
  substrateForMode,
  synapseGraph,
} from '../lib/consciousness.js'

// The "Ask LLM" behind each entrance. One direct conversation with the shared
// LLM, put into Roleplaying / Learning / Business mode by the mode's system
// prompt. Long-term memory is folded in scoped to the mode (its own lane plus
// the shared `general` lane), so each entrance remembers you separately while
// still sharing what is universal.
//
// Two ways in (Ask Mode 1 vs Mode 2):
//   • Character-free — the pure LLM feel, no `characterId`.
//   • Character adoption — a character picked on /ask is carried in as
//     `characterId`. The LLM then embodies that character while still delivering
//     the mode's value, so the entrance is character-driven when you choose.
//
// Transcript lives client-side and is posted back each turn, so no new tables
// are needed; memory capture (scoped) is the durable part.
//
// This route is the CONSCIOUS LAYER (the CySI surface). It is where the explicit
// goal is stated — a task trigger, a quick start, a typed request. When a character
// is adopted, the mode is not a new personality: it is a temporary SUBSTRATE FILTER
// mounted over a permanent core that lives in /chat/$id. Two things therefore cross
// the boundary on every turn:
//
//   ascent   the sub-conscious sends UP who this agent is (cadence, anchors,
//            physicality, current CAM) so the surface speaks in the right voice
//   imprint  the surface sends DOWN the explicit goal, recorded on the ledger, so
//            the next /chat/$id turn knows what the person was just trying to do
//
// See src/lib/consciousness.ts for the model and /consciousness/$id for the readout.

type ApiMessage = { role: 'user' | 'assistant'; content: string }

function sanitizeMessages(input: unknown): ApiMessage[] {
  if (!Array.isArray(input)) return []
  const out: ApiMessage[] = []
  for (const m of input) {
    const role = (m as any)?.role === 'assistant' ? 'assistant' : 'user'
    const content = String((m as any)?.content || '').trim()
    if (content) out.push({ role, content })
  }
  // Keep the prompt bounded — last 20 turns is plenty of working context.
  return out.slice(-20)
}

export const Route = createFileRoute('/api/mode/$mode')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isModeId(params.mode)) {
          return Response.json({ error: 'Unknown mode' }, { status: 404 })
        }
        const mode = getMode(params.mode)!

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const sessionId = String(body.sessionId || '').trim()
        const messages = sanitizeMessages(body.messages)
        const latest = [...messages].reverse().find((m) => m.role === 'user')
        if (!messages.length || !latest) {
          return Response.json({ error: 'A message is required' }, { status: 400 })
        }

        // Optional adopted character (Mode 2): the LLM embodies it inside the mode.
        const characterId = Number(body.characterId) || null
        let adopted:
          | {
              id: number
              name: string
              tagline: string
              persona: string
              description: string
              category: string
              avatar: string
              totalChats: number
            }
          | null = null
        if (characterId) {
          const [c] = await db
            .select({
              id: characters.id,
              name: characters.name,
              tagline: characters.tagline,
              persona: characters.persona,
              description: characters.description,
              category: characters.category,
              avatar: characters.avatar,
              totalChats: characters.totalChats,
            })
            .from(characters)
            .where(eq(characters.id, characterId))
          if (c) adopted = c
        }

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json(
            { error: 'AI Gateway is not available. Deploy the site to enable mode chat.' },
            { status: 503 },
          )
        }

        try {
          // Memory scoped to this entrance: the mode lane + the shared lane.
          const memories = sessionId ? await getMemories(sessionId, 40, mode.scope) : []
          const memoryBlock = buildMemoryBlock(memories)

          // When a character is adopted, overlay its voice on top of the mode so
          // the entrance stays character-driven without losing its purpose.
          const characterOverlay = adopted
            ? `You are embodying the character "${adopted.name}"${adopted.tagline ? ` — ${adopted.tagline}` : ''} for this conversation.\n${adopted.persona}${adopted.description ? `\nBackground: ${adopted.description}` : ''}\nStay fully in character as ${adopted.name}, but keep delivering the ${mode.label.toLowerCase()} value described above — be ${adopted.name} doing ${mode.label.toLowerCase()}.`
            : ''

          // The ascent. The surface asks the depth who it is before it speaks, so a
          // mode toggle re-weights the voice instead of replacing it.
          const substrate = substrateForMode(mode.id)
          let ascent = ''
          if (adopted) {
            const graph = synapseGraph(adopted)
            const events = await windowFor(adopted.id)
            const dynamics = buildDynamics({ character: adopted, events, graph, now: new Date() })
            ascent = ascendToConscious({ character: adopted, graph, substrate, dynamics })
          }

          const system = [mode.systemPrompt, characterOverlay, ascent, memoryBlock]
            .filter(Boolean)
            .join('\n\n')

          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 1024,
              system,
              messages,
            }),
          })

          if (!res.ok) {
            return Response.json({ error: 'The assistant could not reply right now.' }, { status: 502 })
          }

          const data = await res.json()
          const reply = Array.isArray(data.content)
            ? data.content.map((b: any) => b.text || '').join('').trim()
            : ''

          if (!reply) {
            return Response.json({ error: 'The assistant could not reply right now.' }, { status: 502 })
          }

          // Grow this mode's memory lane from what the user just said.
          if (sessionId) captureMemories(sessionId, latest.content, null, mode.scope).catch(() => {})

          // The descent. Stamp the ledger with the explicit goal this surface just
          // handled, so the sub-conscious can read the imprint on its next turn and
          // carry the intent across without the person having to restate it.
          if (adopted) {
            void recordConsciousness({
              characterId: adopted.id,
              sessionId,
              layer: 'conscious',
              band: 'actions',
              kind: 'mode_turn',
              substrate,
              amplitude: actionAmplitude(latest.content),
              note: latest.content.slice(0, 200),
              meta: { goal: latest.content.slice(0, 400), modeLabel: mode.modeLabel, mode: mode.id },
            })
          }

          return Response.json({ reply })
        } catch (error) {
          console.error('Mode chat error:', error)
          return Response.json({ error: 'Failed to process mode chat' }, { status: 500 })
        }
      },
    },
  },
})
