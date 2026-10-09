import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { studioMembers, studioModules } from '../../db/schema.js'
import { eq, asc } from 'drizzle-orm'
import {
  DEFAULT_WORKSPACE,
  normalizeModel,
  clampTemp,
  roleMeta,
  coerceLLM,
} from '../lib/studio.js'

// Studio Assistant — the admin co-pilot. A grounded LLM chat scoped to the
// Studio: it answers questions about the staff hierarchy and the module registry
// using the live workspace state as context, so the "LLM feature set" of the
// Studio is real rather than a toggle. POST a question (and optional running
// history); the chosen model replies through the Netlify AI Gateway.

export const Route = createFileRoute('/api/studio/assistant')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const message = String(body.message || '').trim().slice(0, 2000)
        if (!message) return Response.json({ error: 'A message is required' }, { status: 400 })
        const model = normalizeModel(body.model)
        const temperature = clampTemp(body.temperature ?? 0.5)

        const history: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.history)
          ? body.history
              .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
              .slice(-8)
              .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
          : []

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        const isAnthropic = model.startsWith('claude')
        if (!isAnthropic || !baseUrl || !apiKey) {
          // Only the Anthropic gateway is wired for the assistant; other models
          // are selectable per-module but the co-pilot answers via Anthropic.
          if (!baseUrl || !apiKey) {
            return Response.json(
              { error: 'AI Gateway is not available. Deploy the site to enable the Studio Assistant.' },
              { status: 503 },
            )
          }
        }

        // Ground the co-pilot in the live Studio state.
        const members = await db
          .select()
          .from(studioMembers)
          .where(eq(studioMembers.workspaceId, workspaceId))
          .orderBy(asc(studioMembers.id))
        const modules = await db
          .select()
          .from(studioModules)
          .where(eq(studioModules.workspaceId, workspaceId))
          .orderBy(asc(studioModules.position))

        const rosterLines = members
          .map((m) => `- ${m.handle} — ${roleMeta(m.role).label}${m.isSelf ? ' (owner)' : ''}`)
          .join('\n')
        const moduleLines = modules
          .map((m) => {
            const llm = coerceLLM(m.llm)
            const feats = [llm.chat && 'chat', llm.twinChat && 'twin-chat'].filter(Boolean).join('+') || 'no-chat'
            return `- [${m.groupName}] ${m.label}: ${m.enabled ? 'enabled' : 'disabled'}, min-rank ${m.minRank}, ${feats}, model ${llm.model}`
          })
          .join('\n')

        const system = `You are the CharacterVerse Studio Assistant — an admin co-pilot for the platform's operations deck.
You help the owner and staff govern CharacterVerse: the staff status hierarchy and the registry of governable modules.

The status hierarchy, lowest to highest authority:
Moderator ‹‹ Chief Moderator, Administration ‹‹ Super Administration, Operator ‹‹ Master Operator, then Master (the owner) above all.

Current staff roster:
${rosterLines || '- (none)'}

Current modules under governance:
${moduleLines || '- (none)'}

Answer concisely and practically. When asked who can do something, reason from the status ranks and each module's min-rank. Stay focused on Studio administration.`

        const useModel = isAnthropic ? model : 'claude-haiku-4-5'

        try {
          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey as string,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: useModel,
              max_tokens: 1024,
              temperature,
              system,
              messages: [...history, { role: 'user', content: message }],
            }),
          })

          if (!res.ok) {
            return Response.json({ error: 'The Studio Assistant could not reply right now.' }, { status: 502 })
          }
          const data = await res.json()
          const reply = Array.isArray(data.content)
            ? data.content.map((b: any) => b.text || '').join('').trim()
            : ''
          if (!reply) {
            return Response.json({ error: 'The Studio Assistant could not reply right now.' }, { status: 502 })
          }
          return Response.json({ reply, model: useModel })
        } catch (error) {
          console.error('Studio assistant error:', error)
          return Response.json({ error: 'Failed to reach the Studio Assistant' }, { status: 500 })
        }
      },
    },
  },
})
