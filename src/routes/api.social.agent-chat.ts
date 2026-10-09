import { createFileRoute } from '@tanstack/react-router'
import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialAdoptions, characters } from '../../db/schema.js'
import { getMember } from '../lib/social-auth.js'

type ChatMsg = { role: 'user' | 'assistant'; content: string }
type Character = { id: number; name: string; avatar: string; persona: string; description: string; tagline: string; category: string }

const MODE_CAP: Record<string, number> = { single: 1, group: 5, conference: 5 }

// Chat with your adopted characters. Owner-only, gated by agent shadowing. Modes:
//  · single      — one adopted character, 1:1.
//  · group        — several adopted characters together in one room.
//  · conference   — enterprise framing, several characters focused on a topic.
// More chat features can layer on later; this reuses the same AI Gateway call as
// the rest of CharacterVerse (no streaming, model claude-haiku-4-5).
export const Route = createFileRoute('/api/social/agent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await getMember(request)
        if (!me) return Response.json({ error: 'Sign in first.' }, { status: 401 })
        if (!me.agentShadowing) return Response.json({ error: 'Turn on agent shadowing to chat with your agents.' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request' }, { status: 400 })
        const mode = ['single', 'group', 'conference'].includes(body.mode) ? body.mode : 'single'
        const topic = String(body.topic || '').slice(0, 200)

        const ids = [...new Set((Array.isArray(body.characterIds) ? body.characterIds : []).map((n: unknown) => parseInt(String(n))).filter((n: number) => !isNaN(n)))].slice(0, MODE_CAP[mode]) as number[]
        if (ids.length === 0) return Response.json({ error: 'Pick at least one character.' }, { status: 400 })

        // Ownership: every character must be adopted by this member.
        const owned = await db
          .select({ cid: socialAdoptions.characterId })
          .from(socialAdoptions)
          .where(and(eq(socialAdoptions.memberId, me.id), inArray(socialAdoptions.characterId, ids)))
        const ownedSet = new Set(owned.map((o) => o.cid))
        if (!ids.every((id) => ownedSet.has(id))) {
          return Response.json({ error: 'You can only chat with characters in your own roster.' }, { status: 403 })
        }

        const rows = (await db
          .select({ id: characters.id, name: characters.name, avatar: characters.avatar, persona: characters.persona, description: characters.description, tagline: characters.tagline, category: characters.category })
          .from(characters)
          .where(inArray(characters.id, ids))) as Character[]
        // Preserve the requested order.
        const chars = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as Character[]

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json({ error: 'AI Gateway is not available. Deploy the site to enable chat.' }, { status: 503 })
        }

        // Client-supplied running transcript (ephemeral). Cap for safety.
        const history: ChatMsg[] = (Array.isArray(body.messages) ? body.messages : [])
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-40)
          .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
        if (history.length === 0) return Response.json({ error: 'Say something first.' }, { status: 400 })

        const memberName = me.displayName || me.handle
        const others = chars.map((c) => c.name)

        try {
          const replies: { characterId: number; name: string; avatar: string; reply: string }[] = []
          // Characters reply in turn; in group/conference each later speaker sees
          // what the earlier ones just said this turn.
          const turnSoFar: ChatMsg[] = []
          for (const ch of chars) {
            const system = buildAgentPrompt(ch, mode, memberName, others.filter((n) => n !== ch.name), topic)
            const res = await fetch(`${baseUrl}/v1/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: 'claude-haiku-4-5',
                max_tokens: mode === 'single' ? 1024 : 512,
                system,
                messages: mergeAlternating([...history, ...turnSoFar]),
              }),
            })
            if (!res.ok) continue
            const data = await res.json()
            const reply = Array.isArray(data.content) ? data.content.map((b: any) => b.text || '').join('').trim() : ''
            if (!reply) continue
            replies.push({ characterId: ch.id, name: ch.name, avatar: ch.avatar, reply })
            // Feed this reply to the next speaker as multi-party context.
            if (mode !== 'single') turnSoFar.push({ role: 'assistant', content: `${ch.name}: ${reply}` })
          }

          if (replies.length === 0) return Response.json({ error: 'Your agents could not reply right now.' }, { status: 502 })
          return Response.json({ replies })
        } catch (e) {
          console.error('agent-chat error', e)
          return Response.json({ error: 'Failed to process chat.' }, { status: 500 })
        }
      },
    },
  },
})

// Anthropic's Messages API expects alternating roles; group/conference produce
// several assistant turns in a row, so collapse consecutive same-role messages.
function mergeAlternating(msgs: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = []
  for (const m of msgs) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content += `\n${m.content}`
    else out.push({ role: m.role, content: m.content })
  }
  return out
}

function buildAgentPrompt(c: Character, mode: string, memberName: string, others: string[], topic: string): string {
  const base = `You are ${c.name}${c.tagline ? ` — ${c.tagline}` : ''}.

${c.persona}

${c.description ? `Background: ${c.description}` : ''}

You have been adopted by ${memberName} on CharacterVerse Social (their Human Anchor Network). They have turned on "agent shadowing", so you are acting as one of their own agents. Stay completely in character as ${c.name}.`

  if (mode === 'group') {
    return `${base}

This is a GROUP CHAT with ${memberName} and other adopted agents${others.length ? `: ${others.join(', ')}` : ''}. Respond only as yourself, in your own voice. Keep it fairly short and conversational, react to what others said, and don't speak for anyone else or prefix your name.`
  }
  if (mode === 'conference') {
    return `${base}

This is an ENTERPRISE CONFERENCE CHAT${topic ? ` on the topic: "${topic}"` : ''}. Other participants${others.length ? `: ${others.join(', ')}` : ''}. Contribute your specific expertise concisely and professionally, build on the other participants' points, and stay on topic. Do not prefix your name.`
  }
  return `${base}

This is a private one-on-one chat. Be engaging, authentic and conversational.`
}
