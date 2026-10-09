import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { auditTrims, characters } from '../../db/schema.js'
import { eq, desc } from 'drizzle-orm'

// AuditClaw — the third Claw (after PromptClaw on create and CharacterClaw in
// chat). Data scientists write a search prompt; AuditClaw scans the trimmed
// audit trail for "lightning in a bottle" — a buried insight inside a
// hallucination that the employee trimmed away as noise. It returns high-signal
// matches so review time is spent only on candidates, not the whole corpus.
//
//   POST /api/auditclaw  { prompt }
//     → { results: [{ trimId, characterName, excerpt, why, score }], scanned }

const SYSTEM = `You are AuditClaw, an audit-intelligence engine for the CharacterVerse enterprise platform.
You are given a data scientist's SEARCH PROMPT and a numbered list of TRIMMED conversation excerpts — content an employee removed before filing clean work, often hallucinations or off-track tangents.
Your job: find the "lightning in a bottle" — buried insights, novel approaches, or unexpected connections inside that trimmed content that match the search prompt and would be worth feeding back into character design.
Respond with a single minified JSON object and nothing else — no markdown, no code fences.
Shape: {"results":[{"id":<the excerpt number>,"excerpt":"<<=160 char quote of the most interesting span>","why":"<one sentence: why this is a hidden gem worth reviewing>","score":<1-5 relevance>}]}
Only include genuinely interesting matches. If nothing matches, return {"results":[]}. Never invent excerpts that are not in the provided content.`

function extractJson(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON found in model output')
  return JSON.parse(text.slice(start, end + 1))
}

export const Route = createFileRoute('/api/auditclaw')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const prompt = String(body.prompt || '').trim()
        if (!prompt) return Response.json({ error: 'A search prompt is required' }, { status: 400 })

        // Build the corpus from the trimmed audit trail (most recent first).
        const rows = await db
          .select({ trim: auditTrims, character: characters })
          .from(auditTrims)
          .leftJoin(characters, eq(auditTrims.characterId, characters.id))
          .orderBy(desc(auditTrims.createdAt))
          .limit(60)

        // Each trim becomes one numbered excerpt (its trimmed text concatenated).
        const items = rows
          .map((r, i) => {
            const text = (Array.isArray(r.trim.trimmedMessages) ? (r.trim.trimmedMessages as any[]) : [])
              .map((m) => `${m.role === 'assistant' ? 'Character' : 'User'}: ${m.content}`)
              .join('\n')
              .slice(0, 1200)
            return {
              num: i + 1,
              trimId: r.trim.id,
              characterName: r.character?.name || 'Unknown',
              characterAvatar: r.character?.avatar || '🤖',
              text,
            }
          })
          .filter((it) => it.text.trim())

        if (items.length === 0) {
          return Response.json({ results: [], scanned: 0, empty: true })
        }

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json(
            { error: 'AI Gateway is not available. Deploy the site to enable AuditClaw.' },
            { status: 503 },
          )
        }

        const corpus = items
          .map((it) => `[${it.num}] (character: ${it.characterName})\n${it.text}`)
          .join('\n\n')
        const userPrompt = `SEARCH PROMPT:\n"""${prompt}"""\n\nTRIMMED EXCERPTS:\n${corpus}\n\nReturn the JSON object now.`

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
              max_tokens: 1024,
              system: SYSTEM,
              messages: [{ role: 'user', content: userPrompt }],
            }),
          })
          if (!res.ok) {
            return Response.json({ error: 'AuditClaw could not search right now.' }, { status: 502 })
          }
          const data = await res.json()
          const text = Array.isArray(data.content)
            ? data.content.map((b: any) => b.text || '').join('')
            : ''
          const parsed = extractJson(text)
          const raw = Array.isArray(parsed.results) ? parsed.results : []

          // Map model "id" (the excerpt number) back to the real trim + character.
          const byNum = new Map(items.map((it) => [it.num, it]))
          const results = raw
            .map((r: any) => {
              const it = byNum.get(Number(r.id))
              if (!it) return null
              return {
                trimId: it.trimId,
                characterName: it.characterName,
                characterAvatar: it.characterAvatar,
                excerpt: String(r.excerpt || '').slice(0, 200),
                why: String(r.why || '').slice(0, 240),
                score: Math.min(5, Math.max(1, Number(r.score) || 1)),
              }
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.score - a.score)

          return Response.json({ results, scanned: items.length })
        } catch {
          return Response.json({ error: 'AuditClaw failed to complete the search.' }, { status: 500 })
        }
      },
    },
  },
})
