import { createFileRoute } from '@tanstack/react-router'
import {
  createChain,
  deleteChain,
  edge,
  inspect,
  listChains,
  prove,
  publishAnchor,
  sealNext,
} from '../../db/lattice.js'
import { BANDS, type Claim, type Moment } from '../lib/lattice.js'

// The Dual+ Lattice — one endpoint.
//
// Every verdict on this route is recomputed by the kernel from the stored strata.
// Nothing trusts a cached column, and a refusal is returned with its code so the
// caller can say WHY a step was not allowed rather than just that it failed.

function readMoments(raw: any): Moment[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 200).map((m: any, i: number) => {
    const delta: Record<string, number> = {}
    const src = m?.delta && typeof m.delta === 'object' ? m.delta : {}
    for (const [k, v] of Object.entries(src).slice(0, 64)) {
      const key = String(k).slice(0, 40)
      const num = Number(v)
      if (/^[\w.:-]+$/.test(key) && Number.isFinite(num)) delta[key] = num
    }
    return { t: Number.isFinite(Number(m?.t)) ? Number(m.t) : i, delta, cause: String(m?.cause || '').slice(0, 200) }
  })
}

function readClaims(raw: any): Claim[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 40).map((c: any) => ({
    id: String(c?.id || '').slice(0, 60),
    text: String(c?.text || '').slice(0, 400),
    from: Array.isArray(c?.from) ? c.from.map((x: any) => String(x).slice(0, 60)).slice(0, 20) : [],
    grounds: Array.isArray(c?.grounds) ? c.grounds.map((x: any) => String(x).slice(0, 40)).slice(0, 40) : [],
    ...(c?.supersedes ? { supersedes: String(c.supersedes).slice(0, 60) } : {}),
  }))
}

function readNames(raw: any): string[] {
  if (Array.isArray(raw)) return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))].slice(0, 40)
  return [...new Set(String(raw || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 40)
}

export const Route = createFileRoute('/api/lattice')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        const chainId = (url.searchParams.get('chain') || '').trim()
        const claimId = (url.searchParams.get('claim') || '').trim()

        if (!sessionId) return Response.json({ chains: [], chain: null, bands: BANDS })

        // Readers degrade one at a time, and a reader that fell over is reported
        // as failed rather than as empty — an unreachable ledger and an empty one
        // must never look the same.
        let degraded = false
        const fall = async <T,>(p: Promise<T>, empty: T): Promise<T> => {
          try {
            return await p
          } catch {
            degraded = true
            return empty
          }
        }

        const chains = await fall(listChains(sessionId), [] as Awaited<ReturnType<typeof listChains>>)
        const detail = chainId ? await fall(inspect(sessionId, chainId), null) : null
        const proof = chainId && claimId ? await fall(prove(sessionId, chainId, claimId), null) : null

        return Response.json({ chains, chain: detail, proof, degraded, bands: BANDS })
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
        const action = String(body.action || '')
        const publicId = String(body.publicId || '')

        try {
          switch (action) {
            /* ---------------------------------------------------------- birth */
            case 'birth': {
              const weights: Record<string, number> = {}
              const src = body.weights && typeof body.weights === 'object' ? body.weights : {}
              for (const [k, v] of Object.entries(src).slice(0, 64)) {
                const num = Number(v)
                if (/^[\w.:-]+$/.test(k) && Number.isFinite(num)) weights[k.slice(0, 40)] = num
              }
              if (!Object.keys(weights).length) {
                return Response.json(
                  { error: 'Birth needs at least one sub-weight. A lattice with no math underneath it verifies nothing.' },
                  { status: 400 },
                )
              }
              const created = await createChain({
                sessionId,
                name: String(body.name || ''),
                weights,
                capabilities: readNames(body.capabilities),
                axioms: readClaims(body.axioms).filter((a) => a.id && a.text),
                tick: Number(body.tick) || 0,
              })
              return Response.json(created)
            }

            /* ----------------------------------------------------------- seal */
            case 'seal': {
              if (!publicId) return Response.json({ error: 'publicId is required' }, { status: 400 })
              const result = await sealNext({
                sessionId,
                publicId,
                moments: readMoments(body.moments),
                claims: readClaims(body.claims).filter((c) => c.id && c.text),
                capabilities: readNames(body.capabilities),
                budget: Math.max(0, Number(body.budget) || 0),
                tick: Number(body.tick) || 0,
              })
              // A refused seal is the system doing its job, so it answers 409
              // rather than 500 and carries the reason and the code.
              if (!result.ok) {
                return Response.json({ error: result.reason, code: result.code }, { status: result.code === 'missing' ? 404 : 409 })
              }
              return Response.json(result)
            }

            /* --------------------------------------------------------- anchor */
            case 'anchor': {
              if (!publicId) return Response.json({ error: 'publicId is required' }, { status: 400 })
              const result = await publishAnchor({
                sessionId,
                publicId,
                h: Math.max(0, Number(body.h) || 0),
                note: String(body.note || ''),
              })
              if (!result.ok) return Response.json({ error: result.reason }, { status: 409 })
              return Response.json(result)
            }

            /* ----------------------------------------------------------- edge */
            case 'edge': {
              if (!publicId) return Response.json({ error: 'publicId is required' }, { status: 400 })
              const live = await edge({
                sessionId,
                publicId,
                moments: readMoments(body.moments),
                budget: Math.max(0, Number(body.budget) || 0),
              })
              if (!live) return Response.json({ error: 'No such chain.' }, { status: 404 })
              return Response.json(live)
            }

            /* --------------------------------------------------------- delete */
            case 'delete': {
              const ok = await deleteChain(sessionId, publicId)
              return ok ? new Response(null, { status: 204 }) : Response.json({ error: 'No such chain.' }, { status: 404 })
            }

            default:
              return Response.json({ error: `Unknown action "${action}"` }, { status: 400 })
          }
        } catch {
          return Response.json({ error: 'The lattice could not complete that.' }, { status: 500 })
        }
      },
    },
  },
})
