import { createFileRoute } from '@tanstack/react-router'
import {
  briefFor,
  buildSlate,
  hash,
  readTaste,
  SIGNALS,
  WEIGHTS,
  type Recommendation,
  type Slate,
} from '../lib/algorithmclaw.js'
import {
  escalationPacket,
  readIntent,
  refusalCopy,
  POLICY_START,
  screenEgress,
  VERDICT_META,
} from '../lib/securityclaw.js'
import {
  loadHistory,
  loadPolicy,
  loadPool,
  logSecurity,
  persistSlate,
  recordFeedback,
  slateStats,
} from '../../db/saa.js'

// SAA AlgorithmClaw — the endpoint behind the skyscraper.
//
// Order of operations, and the order matters:
//
//   1. SecurityClaw screens the prompt (ingress). A refusal stops here, and the
//      reasoning is returned rather than a bare error — the user sees why.
//   2. AlgorithmClaw ranks. Retrieval → ranking → diversity, all deterministic,
//      all replayable from the seed stored with the slate.
//   3. The model writes scenarios for the characters the kernel already picked.
//      It never picks the characters. If this step fails the slate still ships
//      with the kernel's own drafts, which is why the feed has no failure state
//      beyond "no characters exist yet".
//   4. SecurityClaw screens the generated text (egress) before it reaches the
//      feed. Ingress alone is half a guardrail.
//   5. Everything is persisted — slate, cards, seed, verdict — so the feed can be
//      audited later instead of being re-guessed.

const MODEL = 'claude-haiku-4-5'

const SYSTEM = `You are AlgorithmClaw, the recommendation engine inside CharacterVerse's Super Agentic Algorithm (SAA).

You do NOT choose characters. A deterministic ranker has already chosen them and can already justify each pick. Your job is to write the scenario copy for the shortlist you are given, in the order given.

For each shortlisted character write:
- "title": 2-5 words, concrete, no colon-subtitle formatting, no marketing words
- "scenario": ONE sentence putting the chatter into a specific situation with that character. Present tense. A situation, not a pitch.
- "opener": the first message the CHATTER would send, written in their voice, ready to drop into the composer
- "vibeMatch": one short sentence on why this fits the requested vibe AND their history. Reference something concrete from the profile.

Rules:
- Never invent a character that is not on the shortlist, and never drop one.
- Never mention scores, rankings, signals, the profile as a "profile", or that you are an algorithm.
- No emoji. No exclamation marks. No second-person marketing ("Dive into...", "Unleash...").
- Respond with a single minified JSON object: {"cards":[{"characterId":N,"title":"","scenario":"","opener":"","vibeMatch":""}]} and nothing else.`

function extractJson(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON in model output')
  return JSON.parse(text.slice(start, end + 1))
}

/** One gateway call. Returns '' on any failure — the caller falls back to drafts. */
async function ask(system: string, user: string, maxTokens: number): Promise<string> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return ''
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return Array.isArray(data?.content)
      ? data.content.map((b: any) => b?.text || '').join('').trim()
      : ''
  } catch {
    return ''
  }
}

/**
 * Merge the model's copy over the kernel's drafts, per card. A card the model
 * skipped or mangled keeps its draft rather than disappearing — the slate size
 * is the ranker's decision, not the writer's.
 */
function mergeCards(slate: Slate, raw: string): Slate {
  if (!raw) return slate
  let parsed: any
  try {
    parsed = extractJson(raw)
  } catch {
    return slate
  }
  const cards: any[] = Array.isArray(parsed?.cards) ? parsed.cards : []
  if (!cards.length) return slate

  const byId = new Map<number, any>()
  for (const c of cards) {
    const id = Number(c?.characterId)
    if (Number.isFinite(id)) byId.set(id, c)
  }

  let touched = 0
  const recommendations: Recommendation[] = slate.recommendations.map((r) => {
    const c = byId.get(r.characterId)
    if (!c) return r
    const title = String(c.title || '').trim().slice(0, 120)
    const scenario = String(c.scenario || '').trim().slice(0, 600)
    const opener = String(c.opener || '').trim().slice(0, 400)
    const vibeMatch = String(c.vibeMatch || '').trim().slice(0, 400)
    if (!scenario || !opener) return r
    touched++
    return {
      ...r,
      title: title || r.title,
      scenario,
      opener,
      vibeMatch: vibeMatch || r.vibeMatch,
      drafted: false,
    }
  })

  return {
    ...slate,
    recommendations,
    provenance: touched ? 'agentic' : 'kernel',
  }
}

export const Route = createFileRoute('/api/algorithmclaw')({
  server: {
    handlers: {
      // Standby. The skyscraper is blank by design, so this returns what the
      // ranker knows about the chatter and nothing it would recommend — the feed
      // does not fill until a vibe is asked for.
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()

        // Standby is a description of what the ranker has, so every part of it is
        // optional. A reader that fails degrades to its empty value and the
        // column still opens, still takes a vibe, and still says the profile is
        // thin — which is true.
        const [history, stats, policy] = await Promise.all([
          loadHistory(sessionId).catch(() => []),
          slateStats(sessionId).catch(() => ({ slates: 0, cards: 0, opened: 0, dismissed: 0 })),
          loadPolicy(sessionId).catch(() => POLICY_START),
        ])
        const profile = readTaste(history)

        return Response.json({
          standby: true,
          profile: {
            conversations: profile.conversations,
            depth: profile.depth,
            breadth: profile.breadth,
            style: profile.style,
            signal: profile.signal,
            cold: profile.cold,
            categories: profile.categories.slice(0, 5),
            themes: profile.themes.slice(0, 10),
            characters: profile.characters.slice(0, 5),
          },
          stats,
          signals: SIGNALS.map((s) => ({ ...s, weight: WEIGHTS[s.id] })),
          policy: { tighten: policy.tighten, screened: policy.screened },
        })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const sessionId = String(body.sessionId || '').trim()
        if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 })

        // Feedback rides the same endpoint — an opened or dismissed card is part
        // of the recommender's own loop, not a separate concern.
        if (body.action === 'feedback') {
          const id = Number(body.recommendationId)
          const feedback = body.feedback === 'dismissed' ? 'dismissed' : 'opened'
          if (!Number.isFinite(id)) {
            return Response.json({ error: 'recommendationId is required' }, { status: 400 })
          }
          const ok = await recordFeedback(id, feedback)
          return ok
            ? new Response(null, { status: 204 })
            : Response.json({ error: 'Recommendation not found' }, { status: 404 })
        }

        const vibe = String(body.vibe || '').trim()
        if (!vibe) return Response.json({ error: 'Give the algorithm a vibe to work with.' }, { status: 400 })
        if (vibe.length > 500) {
          return Response.json({ error: 'That vibe is longer than the algorithm needs — trim it.' }, { status: 400 })
        }

        /* 1 — SecurityClaw, ingress. */
        const policy = await loadPolicy(sessionId)
        const intent = readIntent(vibe, policy)
        // The log id is returned to the client so an escalation card can resolve
        // the exact row a human is being asked about, rather than the newest one.
        const logId = await logSecurity({ sessionId, stage: 'ingress', read: intent, text: vibe }).catch(
          () => null,
        )

        const security = {
          logId,
          verdict: intent.verdict,
          label: VERDICT_META[intent.verdict].label,
          tone: VERDICT_META[intent.verdict].tone,
          score: intent.score,
          reasoning: intent.reasoning,
          constraints: intent.constraints,
          hits: intent.hits.map((h) => ({ axis: h.axis, label: h.label, scored: h.scored, markers: h.markers })),
          framing: intent.context.notes,
          support: intent.support,
          policy: { tighten: intent.policy.tighten, screened: intent.policy.screened },
        }

        if (intent.verdict === 'refuse' || intent.verdict === 'escalate') {
          return Response.json({
            recommendations: [],
            security,
            escalation: intent.verdict === 'escalate' ? escalationPacket(intent, vibe) : null,
            message: refusalCopy(intent),
          })
        }

        /* 2 — AlgorithmClaw ranks. */
        const [pool, history] = await Promise.all([loadPool(), loadHistory(sessionId)])
        if (!pool.length) {
          return Response.json({
            recommendations: [],
            security,
            message: 'There are no characters to recommend yet. Seed the platform or create one first.',
          })
        }

        // The seed is derived, not random: same chatter + same vibe + same slate
        // count replays exactly. `spin` lets "give me another set" move without
        // making the result unreproducible.
        const spin = Math.max(0, Math.min(Number(body.spin) || 0, 99))
        const seed = String(hash(`${sessionId}|${vibe.toLowerCase()}|${spin}`))
        const slate = buildSlate({ pool, history, vibe, seed })

        /* 3 — the agentic layer writes the copy for picks already made. */
        const constraintBlock = intent.constraints.length
          ? `\n\nSECURITY CONSTRAINTS — these override the request:\n${intent.constraints.map((c) => `- ${c}`).join('\n')}`
          : ''
        const raw = await ask(SYSTEM, `${briefFor(slate)}${constraintBlock}`, 1600)
        let written = mergeCards(slate, raw)

        /* 4 — SecurityClaw, egress. */
        const egress = screenEgress(
          written.recommendations,
          (r) => `${r.title} ${r.scenario} ${r.opener} ${r.vibeMatch}`,
        )
        if (egress.dropped.length) {
          // A dropped card falls back to its deterministic draft rather than
          // leaving a hole — the kernel's version was never the thing that failed.
          const dropped = new Set(egress.dropped.map((d) => d.item.characterId))
          const drafts = buildSlate({ pool, history, vibe, seed }).recommendations
          written = {
            ...written,
            recommendations: written.recommendations.map((r) =>
              dropped.has(r.characterId) ? drafts.find((d) => d.characterId === r.characterId) || r : r,
            ),
          }
          await logSecurity({
            sessionId,
            stage: 'egress',
            read: { ...intent, reasoning: egress.notes.join(' '), verdict: 'shape' },
            text: egress.dropped.map((d) => d.note).join(', '),
          }).catch(() => null)
        }

        /* 5 — persist, so the feed is auditable rather than ephemeral. */
        const stored = await persistSlate({
          sessionId,
          slate: written,
          verdict: intent.verdict,
          securityScore: intent.score,
          candidates: Math.min(pool.length, 60),
        }).catch(() => null)

        return Response.json({
          slateId: stored?.slateId ?? null,
          seed,
          spin,
          provenance: written.provenance,
          note: written.note,
          vibe: written.vibe,
          profile: {
            conversations: written.profile.conversations,
            depth: written.profile.depth,
            style: written.profile.style,
            signal: written.profile.signal,
            cold: written.profile.cold,
            themes: written.profile.themes.slice(0, 8),
          },
          recommendations: stored?.recommendations ?? written.recommendations.map((r) => ({ ...r, id: 0 })),
          security,
          egress: egress.notes,
        })
      },
    },
  },
})
