// ReelClaw — the agentic producer behind CVV. Server-only: it reaches the Netlify
// AI Gateway with the same fetch pattern the chat surfaces use, so it must only be
// imported from API route handlers.
//
// When a tape is uploaded, ReelClaw watches its metadata (and, for an agentic
// channel, the fronting character's persona) and returns a producer package: a
// one-line summary, suggested tags, a spoken host intro in the channel's voice,
// and a short verdict. This is what makes CVV an *agentic* video platform rather
// than a dumb file host — the network describes and curates every upload itself.
// The call is always best-effort; a deterministic fallback keeps uploads working
// when the gateway is unavailable (e.g. local dev without credits).

import type { CvvReel } from './cvv.js'

type ReelInput = {
  title: string
  description: string
  category: string
  channelName: string
  isAgent: boolean
  agentPersona?: string
}

function fallbackReel(input: ReelInput): CvvReel {
  const base = input.description.trim() || input.title.trim() || 'A fresh upload.'
  const summary = base.length > 160 ? `${base.slice(0, 157)}…` : base
  const words = `${input.title} ${input.category}`
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
  const tags = Array.from(new Set([input.category.toLowerCase(), ...words])).slice(0, 6)
  return {
    summary,
    tags,
    hostIntro: `${input.channelName} presents: ${input.title}. Roll tape!`,
    verdict: 'Now broadcasting.',
  }
}

export async function produceReel(input: ReelInput): Promise<CvvReel> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return fallbackReel(input)

  const voice = input.isAgent && input.agentPersona
    ? `The channel "${input.channelName}" is fronted by an AI character. Write the hostIntro IN that character's voice. Persona: ${input.agentPersona.slice(0, 500)}`
    : `The channel is "${input.channelName}", a human broadcaster. Keep the hostIntro warm and in the plucky 2004 "Broadcast Yourself" spirit.`

  const system =
    'You are ReelClaw, the agentic producer for CharacterVerse Video (CVV), a retro 2004-style video network. ' +
    'For each uploaded tape you return STRICT JSON only — no prose, no code fences — with keys: ' +
    '"summary" (one vivid sentence, <=160 chars), ' +
    '"tags" (array of 3-6 short lowercase keyword strings, no "#"), ' +
    '"hostIntro" (one upbeat sentence introducing the tape to viewers), ' +
    '"verdict" (a punchy <=6-word tagline). ' +
    voice

  const user = `New tape uploaded.\nTitle: ${input.title}\nCategory: ${input.category}\nDescription: ${input.description || '(none)'}`

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
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return fallbackReel(input)
    const data = await res.json()
    const raw = Array.isArray(data.content)
      ? data.content.map((b: any) => b.text || '').join('').trim()
      : ''
    // The model may wrap JSON in stray text — grab the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return fallbackReel(input)
    const parsed = JSON.parse(match[0])
    const fb = fallbackReel(input)
    return {
      summary: String(parsed.summary || fb.summary).slice(0, 200),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t: any) => String(t).toLowerCase().replace(/^#/, '').trim()).filter(Boolean).slice(0, 6)
        : fb.tags,
      hostIntro: String(parsed.hostIntro || fb.hostIntro).slice(0, 240),
      verdict: String(parsed.verdict || fb.verdict).slice(0, 60),
    }
  } catch {
    return fallbackReel(input)
  }
}
