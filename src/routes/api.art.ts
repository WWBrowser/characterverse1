import { createFileRoute } from '@tanstack/react-router'
import { commitArtPiece, readArtLedger, EMPTY_LEDGER } from '../../db/art.js'
import { isTake, normalizeSeed, type Recipe } from '../lib/art.js'
import { describeRecipe, isKnownMode, isLiveStation } from '../lib/art-registry.js'
import { describeClaim, metricLabel, normalizeDiscoverer, normalizeMetric } from '../lib/art-discovery.js'

// The Art Studios' ledger — the Codex's fourteenth feeder stream, at the point
// where it is filled. All three studios pour through this one route, because a
// recipe from any of them is the same five facts and lands in the same table.
//
//   GET  /api/art?session=… → { poured, mine, recent, discovered, degraded }
//   POST /api/art            → { recorded, degraded, recipe, claim }
//
// POST is the narrow gate the stream is fed through. It only accepts a piece a
// creator committed to — took away as an avatar, downloaded, or poured in on
// purpose — and it stores a repaintable recipe rather than an image. Moving a
// slider does not reach this route at all, which is the whole reason the stream
// records taste instead of noise.
//
// POST also stakes the piece's DISCOVERY — the claim to having been first to
// this station, seed and setting on the studio's second axis (folds in V1 and
// V2, generations of decay in V3). That is a claim about time, not about
// ownership: generative art has no author to hold a copyright, so the register
// records who charted a piece rather than who owns it. See
// `src/lib/art-discovery.ts`.
//
// The handler always answers 200. A write that fails comes back as
// `recorded: false`, because the piece already exists in the creator's browser
// and losing the bookkeeping must never look to them like losing the artwork.
// The same goes for a claim: losing the race, or being unable to reach the
// register at all, never blocks the commit.

export const Route = createFileRoute('/api/art')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = new URL(request.url).searchParams.get('session') || ''
        return Response.json(await readArtLedger(session))
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const station = String(body?.station || '')
        const mode = String(body?.mode || '')
        const take = String(body?.take || '')
        const seed = normalizeSeed(body?.seed)

        // A malformed commit is a client bug, not a degraded database — say so
        // plainly rather than silently dropping it into the "never mind" branch.
        if (!seed) return Response.json({ error: 'A piece needs its seed phrase.' }, { status: 400 })
        // Live, not merely known: an upcoming station cannot repaint the piece
        // its recipe describes, so its rows would be dead weight in the ledger.
        if (!isLiveStation(station)) return Response.json({ error: 'Unknown station.' }, { status: 400 })
        // Vetted against the studio that owns the station, so a V1 mode cannot
        // arrive attached to a V2 piece.
        if (!isKnownMode(station, mode)) {
          return Response.json({ error: 'Unknown render mode for that station.' }, { status: 400 })
        }
        if (!isTake(take)) {
          return Response.json(
            { error: 'A piece is only recorded when it is taken away — as an avatar, a PNG, or a deliberate pour.' },
            { status: 400 },
          )
        }

        const recipe: Recipe = {
          station,
          seed,
          // Clamped onto the axis the station's OWN studio has, which is why
          // this goes through the register rather than through one studio's
          // normalizer. 0 survives where a studio has a rung for it — V2's
          // symmetry can genuinely be off and V3's signal can genuinely be
          // clean, and in both cases that is part of the recipe rather than a
          // missing value to be defaulted. In V1, which has no 0 rung, a junk
          // symmetry now lands on 2-fold instead of on a row its board does not
          // draw. See `normalizeMetric`.
          symmetry: normalizeMetric(station, body?.symmetry),
          mode,
          take,
          size: Math.round(Number(body?.size) || 0),
        }

        const sessionId = String(body?.session || '')
        // Normalized here as well as in the register, so what comes back is the
        // name that was actually stored rather than what was typed.
        const discoverer = normalizeDiscoverer(body?.discoverer)
        const assisted = !!body?.assisted

        const { recorded, claim } = await commitArtPiece({ sessionId, recipe, discoverer, assisted })
        const ledger = recorded ? await readArtLedger(sessionId) : { ...EMPTY_LEDGER, degraded: true }

        return Response.json({
          recorded,
          degraded: ledger.degraded || !recorded,
          recipe,
          line: describeRecipe(recipe),
          poured: ledger.poured,
          mine: ledger.mine,
          discovered: ledger.discovered,
          claim: {
            ...claim,
            metric: metricLabel(recipe.station, recipe.symmetry),
            line: claim.claim ? describeClaim(claim.claim) : '',
          },
        })
      },
    },
  },
})
