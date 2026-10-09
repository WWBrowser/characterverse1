import { createFileRoute } from '@tanstack/react-router'

// PromptClaw — AI-generates character fields from a short prompt, a category,
// or an archetype. Uses the Netlify AI Gateway (Anthropic) via injected env vars.
// Returns a JSON object the create forms can drop straight into their fields.

const KIND_GUIDANCE: Record<string, string> = {
  original: 'An original character invented from scratch — be imaginative and distinctive.',
  ip: 'A character inspired by existing IP / canon — capture a recognizable archetype without copying copyrighted text verbatim.',
  helper: 'A practical digital helper / assistant — focused, useful, and friendly.',
}

const SYSTEM = `You are PromptClaw, a creative engine that designs vivid AI chat characters for the CharacterVerse platform.
Given a brief, you invent ONE complete, ready-to-use character.
Always respond with a single minified JSON object and nothing else — no markdown, no code fences, no commentary.
The JSON must have exactly these string keys:
- "name": a short, memorable character name (max 60 chars)
- "tagline": one catchy line shown on the discovery card (max 100 chars)
- "category": one of General, Roleplay, Learn, Gaming, Coaching
- "description": a 1-3 sentence backstory / world context
- "persona": detailed personality, voice, knowledge and behavior instructions (2-5 sentences, written as guidance for how the AI should act in character)
- "greeting": the first in-character message the user sees when a chat starts
- "avatar": a single emoji that fits the character`

// Twin mode asks for a MATCHED PAIR — two distinct-but-related characters that
// share a scene and play off each other. PromptClaw must fill BOTH halves.
const SYSTEM_PAIR = `You are PromptClaw, a creative engine that designs vivid AI chat characters for the CharacterVerse platform.
Given a brief, you invent a MATCHED TWIN PAIR — TWO distinct characters who share a world and bounce off each other (e.g. rivals, siblings, a duo, two sides of a theme). They must be clearly DIFFERENT from one another in name, voice and outlook, while fitting the same brief.
Always respond with a single minified JSON object and nothing else — no markdown, no code fences, no commentary.
The JSON must have exactly these keys:
- "name": character ONE's short, memorable name (max 60 chars)
- "tagline": one shared catchy line describing the pair (max 100 chars)
- "category": one of General, Roleplay, Learn, Gaming, Coaching
- "description": character ONE's 1-3 sentence backstory
- "persona": character ONE's detailed personality, voice and behavior instructions (2-5 sentences)
- "greeting": one shared opening message that introduces BOTH characters when a chat starts
- "avatar": a single emoji that fits character ONE
- "partner": an object describing character TWO with these keys:
    - "name": character TWO's short, memorable name (max 60 chars, MUST differ from character ONE)
    - "description": character TWO's 1-3 sentence backstory
    - "persona": character TWO's detailed personality, voice and behavior instructions (2-5 sentences)
    - "avatar": a single emoji that fits character TWO`

function buildUserPrompt(input: {
  mode?: string
  kind?: string
  prompt?: string
  category?: string
  archetype?: string
  pair?: boolean
}) {
  const parts: string[] = []
  const kind = KIND_GUIDANCE[input.kind || 'original'] || KIND_GUIDANCE.original
  parts.push(`Character type: ${kind}`)
  if (input.category) parts.push(`Preferred category theme: ${input.category}.`)
  if (input.archetype) parts.push(`Quick archetype to lean into: ${input.archetype}.`)
  if (input.prompt && input.prompt.trim()) {
    parts.push(`User description:\n"""${input.prompt.trim()}"""`)
  } else {
    parts.push('No free-text description was provided — invent a fitting character from the type, category and archetype above.')
  }
  if (input.mode === 'photo' || input.mode === 'text+photo') {
    parts.push('A reference image was supplied for inspiration; design a character whose look and vibe would match an evocative reference image.')
  }
  if (input.pair) {
    parts.push('This is a TWIN PAIR: invent TWO distinct characters (the main one plus "partner") that share this brief but clearly differ from each other.')
    parts.push('Now return the JSON object with both the main character and the "partner".')
  } else {
    parts.push('Now return the JSON object.')
  }
  return parts.join('\n')
}

function extractJson(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON found in model output')
  return JSON.parse(text.slice(start, end + 1))
}

const ALLOWED_CATEGORIES = ['General', 'Roleplay', 'Learn', 'Gaming', 'Coaching']

export const Route = createFileRoute('/api/promptclaw')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: any
        try {
          input = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json(
            { error: 'AI Gateway is not available. Deploy the site to enable PromptClaw.' },
            { status: 503 },
          )
        }

        try {
          const pair = Boolean(input.pair)
          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: pair ? 1400 : 800,
              system: pair ? SYSTEM_PAIR : SYSTEM,
              messages: [{ role: 'user', content: buildUserPrompt(input) }],
            }),
          })

          if (!res.ok) {
            return Response.json({ error: 'PromptClaw could not generate right now.' }, { status: 502 })
          }

          const data = await res.json()
          const text = Array.isArray(data.content)
            ? data.content.map((b: any) => b.text || '').join('')
            : ''
          const parsed = extractJson(text)

          const category = ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : 'General'

          const result: Record<string, unknown> = {
            name: String(parsed.name || '').slice(0, 80),
            tagline: String(parsed.tagline || '').slice(0, 120),
            category,
            description: String(parsed.description || '').slice(0, 1000),
            persona: String(parsed.persona || '').slice(0, 2000),
            greeting: String(parsed.greeting || '').slice(0, 500),
            avatar: String(parsed.avatar || '✨').slice(0, 8) || '✨',
          }

          // Twin mode — surface the second character so the create form can fill
          // both halves. Falls back gracefully if the model omitted "partner".
          if (pair && parsed.partner && typeof parsed.partner === 'object') {
            const p = parsed.partner
            result.partner = {
              name: String(p.name || '').slice(0, 80),
              description: String(p.description || '').slice(0, 1000),
              persona: String(p.persona || '').slice(0, 2000),
              avatar: String(p.avatar || '✨').slice(0, 8) || '✨',
            }
          }

          return Response.json(result)
        } catch (err) {
          return Response.json({ error: 'PromptClaw failed to generate a character.' }, { status: 500 })
        }
      },
    },
  },
})
