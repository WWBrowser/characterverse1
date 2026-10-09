import { createFileRoute } from '@tanstack/react-router'
import {
  DEFAULT_SESSION,
  clearSession,
  listSuperpositions,
  newPublicId,
  readSession,
  recordCollapse,
  saveSessionControls,
  saveSuperposition,
  type SprSessionState,
} from '../../db/spr.js'
import {
  BASES,
  assemble,
  buildDispersionPrompt,
  climbTargets,
  getBasis,
  isBasisId,
  isTier,
  type RawAngle,
  type Superposition,
} from '../lib/spr.js'

// SPR — the dispersion endpoint.
//
// One model call produces the whole superposition. That is not an optimisation:
// four separate calls would be four independent answers that happen to be shown
// together, and this mode's claim is that they are four branches of one held
// state. Asking once, with all four instructions in the same context, is what
// makes them mutually aware — the Logic branch knows the Empathy branch exists
// and does not duplicate it.
//
// Persistence is best-effort and every response says so. When the database is
// unreachable the dispersion still happens and the page still works; what is lost
// is the substrate, which means the feedback loop stops learning. The `degraded`
// flag exists so the page can say that out loud rather than quietly forgetting.

const MODEL = 'claude-haiku-4-5'

type Degradable<T> = { value: T; degraded: boolean }

async function attempt<T>(fn: () => Promise<T>, fallback: T): Promise<Degradable<T>> {
  try {
    return { value: await fn(), degraded: false }
  } catch (error) {
    console.error('SPR store unavailable:', error)
    return { value: fallback, degraded: true }
  }
}

/** The model is asked for bare JSON; models sometimes fence it anyway. Recover
 *  the object rather than failing the turn over punctuation. */
function parseJson(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/**
 * Recover whatever angles are intact from a response that stopped mid-write.
 *
 * Four complete answers is a lot of tokens and the ceiling is a real ceiling, so
 * a long dispersion can be cut off inside the last branch — which makes the whole
 * payload unparseable and would otherwise throw away three finished answers over
 * one unfinished one. This walks the `angles` array balancing braces (strings and
 * escapes respected, so a `}` inside prose does not close an object early) and
 * keeps every object that closed. The half-written one is dropped rather than
 * patched: a truncated answer presented as an angle is a worse lie than a missing
 * angle, and the page is honest about holding three.
 */
function salvageAngles(text: string): any[] {
  const at = text.indexOf('"angles"')
  if (at < 0) return []
  const open = text.indexOf('[', at)
  if (open < 0) return []
  const out: any[] = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)))
        } catch {
          // Skip the fragment; a partial object is not an angle.
        }
        start = -1
      }
    } else if (c === ']' && depth === 0) break
  }
  return out
}

export const Route = createFileRoute('/api/spr')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = String(url.searchParams.get('session') || '').trim()
        if (!sessionId) {
          return Response.json({ session: DEFAULT_SESSION, superpositions: [], degraded: false })
        }

        // Read the two halves separately so a failure in one does not present the
        // other as empty. A lost palace camera and a lost history are different
        // losses and the page reports them the same way only because both are
        // recoverable; neither is silently rendered as "nothing here".
        const session = await attempt<SprSessionState>(() => readSession(sessionId), { ...DEFAULT_SESSION })
        const history = await attempt<Superposition[]>(() => listSuperpositions(sessionId), [])

        return Response.json({
          session: session.value,
          superpositions: history.value,
          degraded: session.degraded || history.degraded,
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
        const prompt = String(body.prompt || '').trim().slice(0, 2000)
        const basis = isBasisId(body.basis) ? body.basis : 'register'
        if (!prompt) {
          return Response.json({ error: 'A prompt is required to disperse.' }, { status: 400 })
        }

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!baseUrl || !apiKey) {
          return Response.json(
            { error: 'AI Gateway is not available. Deploy the site to run a dispersion.' },
            { status: 503 },
          )
        }

        // The climb reads from the substrate the person built, so it is only ever
        // as strong as their own repeated choices.
        const stored = sessionId
          ? await attempt<SprSessionState>(() => readSession(sessionId), { ...DEFAULT_SESSION })
          : { value: { ...DEFAULT_SESSION }, degraded: false }
        const climbing = climbTargets(stored.value.substrate)
        const angleNames: Record<string, string> = {}
        for (const b of BASES) for (const s of b.slots) angleNames[s.key] = s.label

        const system = buildDispersionPrompt({ basis, substrate: stored.value.substrate, climbing, angleNames })

        let data: any
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
              max_tokens: 4096,
              system,
              messages: [{ role: 'user', content: prompt }],
            }),
          })
          if (!res.ok) {
            return Response.json({ error: 'The dispersion could not be run right now.' }, { status: 502 })
          }
          data = await res.json()
        } catch (error) {
          console.error('SPR dispersion error:', error)
          return Response.json({ error: 'The dispersion could not be run right now.' }, { status: 502 })
        }

        const text = Array.isArray(data?.content)
          ? data.content.map((b: any) => b?.text || '').join('').trim()
          : ''
        const parsed = parseJson(text)
        const truncated = data?.stop_reason === 'max_tokens'
        const raw: RawAngle[] = Array.isArray(parsed?.angles) ? parsed.angles : salvageAngles(text)
        if (!raw.length) {
          // A dispersion with no branches is not a superposition, and dressing one
          // answer up as four would be exactly the dishonesty this mode removes.
          // The two ways to get here are different failures and are named as such:
          // a cut-off response is worth retrying verbatim, a malformed one is not.
          return Response.json(
            {
              error: truncated
                ? 'The dispersion ran past its length limit before a single branch finished. Nothing was filed — a shorter prompt will disperse.'
                : 'The model returned no branches. Nothing was filed — try the prompt again.',
            },
            { status: 502 },
          )
        }

        const superposition = assemble({
          id: newPublicId(),
          prompt,
          basis,
          raw,
          ambiguity: parsed?.ambiguity ?? null,
          createdAt: Date.now(),
        })

        const saved = sessionId
          ? await attempt(() => saveSuperposition(sessionId, superposition), undefined)
          : { value: undefined, degraded: false }

        return Response.json({
          superposition,
          basisLabel: getBasis(basis)?.label ?? 'Register',
          climbing,
          degraded: saved.degraded || stored.degraded,
        })
      },

      PATCH: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const sessionId = String(body.sessionId || '').trim()
        if (!sessionId) {
          return Response.json({ error: 'A session is required.' }, { status: 400 })
        }

        // A measurement.
        if (body.superpositionId) {
          const publicId = String(body.superpositionId)
          const angleKey = String(body.angleKey || '').trim()
          if (!angleKey) {
            return Response.json({ error: 'An angle is required to collapse.' }, { status: 400 })
          }
          const result = await attempt(
            () => recordCollapse({ sessionId, publicId, angleKey, at: Date.now() }),
            null,
          )
          if (result.degraded) {
            // The collapse is still real on the page — it just did not reach the
            // substrate, so the loop learned nothing from it. Say which.
            return Response.json({ collapsed: false, degraded: true }, { status: 200 })
          }
          if (!result.value) {
            return Response.json({ error: 'That superposition or angle is not on record.' }, { status: 404 })
          }
          return Response.json({
            collapsed: true,
            superposition: result.value.superposition,
            substrate: result.value.substrate,
            degraded: false,
          })
        }

        // The palace camera.
        const patch: { sessionId: string; basis?: any; tier?: any; gravity?: number } = { sessionId }
        if (isBasisId(body.basis)) patch.basis = body.basis
        if (isTier(body.tier)) patch.tier = body.tier
        if (typeof body.gravity === 'number' && Number.isFinite(body.gravity)) patch.gravity = body.gravity

        const saved = await attempt<SprSessionState>(() => saveSessionControls(patch), { ...DEFAULT_SESSION })
        return Response.json({ session: saved.value, degraded: saved.degraded })
      },

      DELETE: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = String(url.searchParams.get('session') || '').trim()
        if (!sessionId) {
          return Response.json({ error: 'A session is required.' }, { status: 400 })
        }
        const done = await attempt(() => clearSession(sessionId), undefined)
        if (done.degraded) {
          return Response.json({ error: 'The palace store is unreachable — nothing was cleared.' }, { status: 503 })
        }
        return new Response(null, { status: 204 })
      },
    },
  },
})
