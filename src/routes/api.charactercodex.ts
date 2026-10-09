import { createFileRoute } from '@tanstack/react-router'
import { loadDossierBatch } from '../../db/codex.js'

// Batch dossier read for a grid of advanced character cards.
//
// /discover and the "Choose a character to ask" grid both draw eight cards at
// once. Each card shows a real training level, real stat bars and real skill
// badges, so without this the advanced view would fire eight requests to
// /api/charactercodex/$id on every filter change. One request, three queries.
//
// GET /api/charactercodex?ids=3,7,11
//   → { dossiers: { "3": {...}, "7": {...} } }
// Unknown ids are simply absent from the map; a caller should fall back to the
// plain card rather than blocking on them.

export const Route = createFileRoute('/api/charactercodex')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const raw = url.searchParams.get('ids') || ''
        const ids = raw
          .split(',')
          .map((part) => parseInt(part.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)

        if (ids.length === 0) return Response.json({ dossiers: {} })
        return Response.json({ dossiers: await loadDossierBatch(ids) })
      },
    },
  },
})
