import { createFileRoute } from '@tanstack/react-router'
import { readDiscoveries, EMPTY_REGISTER } from '../../db/art.js'
import { seedHash, normalizeSeed } from '../lib/art.js'
import { isKnownStation } from '../lib/art-registry.js'
import { metricLabel, metricsOf, tierOf } from '../lib/art-discovery.js'

// The discovery register, read-only.
//
//   GET /api/art/discoveries?session=…                    → the platform view
//   GET /api/art/discoveries?station=…&hash=…&session=…   → that, plus one seed's board
//   GET /api/art/discoveries?station=…&seed=…&session=…   → same, hashing the phrase here
//
// Claims are STAKED by POST /api/art, at the moment a creator commits a piece.
// There is no endpoint for claiming one on its own, and that is the point: a
// claim has to be attached to a piece somebody actually took away, or the race
// would be won by whoever could POST the fastest rather than by whoever looked.
//
// `map` is returned alongside the claims so the client can draw the whole board
// — every metric a station offers, not just the ones already taken. The unclaimed
// rows are the interesting ones.

export const Route = createFileRoute('/api/art/discoveries')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams
        const session = q.get('session') || ''
        const station = q.get('station') || ''
        const seed = normalizeSeed(q.get('seed') || '')

        // Either the hash directly or the phrase to hash. The phrase is
        // normalized first, so a board asked for by phrase and the claims staked
        // from that phrase agree on which piece they mean.
        const hash = q.get('hash') || (seed ? seedHash(seed) : '')

        // An unknown station has no map to draw, so it is answered as an empty
        // register rather than as an error — a stale bookmark should show a bare
        // board, not a failure.
        if (station && !isKnownStation(station)) {
          return Response.json({ ...EMPTY_REGISTER, station, hash: '', map: [] })
        }

        const register = await readDiscoveries({ sessionId: session, station, hash })

        const map =
          station && hash
            ? metricsOf(station).map((symmetry) => ({
                symmetry,
                tier: tierOf(station, symmetry),
                label: metricLabel(station, symmetry),
                claim: register.claims.find((c) => c.symmetry === symmetry) || null,
              }))
            : []

        return Response.json({ ...register, station, hash, map })
      },
    },
  },
})
