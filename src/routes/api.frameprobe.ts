import { createFileRoute } from '@tanstack/react-router'
import { getEntry, recentEventCount, recordEvent, setEntryEmbedCheck } from '../../db/searchindex.js'
import { coerceFrame } from '../lib/searchindex.js'
import { probeFrame } from '../lib/frameprobe.js'

// Does this host allow itself to be embedded?
//
//   POST /api/frameprobe { sessionId, url, frame?, entryId? }
//
// Answers with a verdict, the framing headers behind it, and the frame the
// verdict implies. When `entryId` is given and the caller published that entry,
// the verdict is written to it and the frame moves with it.
//
// Unlike /api/search this endpoint sends NO CORS headers, deliberately. A GET
// that reads the index is something we want other people's software to be able
// to call; an endpoint that makes our server open a connection to a URL the
// caller chose is not. Same-origin only, session required, rate limited.
//
// The URL screening, redirect re-screening and header judging all live in
// src/lib/frameprobe.ts, with the reasoning next to the ranges. This file is
// the door: who may knock, how often, and what gets written down.
/**
 * Probes one session may run in an hour.
 *
 * Sized for the work it supports — testing a URL a few times while getting a
 * listing right, and re-testing entries occasionally — rather than for a script.
 */
const PROBE_LIMIT_PER_HOUR = 40

export const Route = createFileRoute('/api/frameprobe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const sessionId = String(body.sessionId || '').trim().slice(0, 80)
        if (!sessionId) {
          // Not authentication — this platform has sessions, not accounts. It is
          // attribution: an outbound fetch that nobody is on the hook for is the
          // kind of thing that ends up in somebody else's abuse report.
          return Response.json({ error: 'sessionId is required to run a probe.' }, { status: 400 })
        }

        const url = String(body.url || '').trim().slice(0, 500)
        if (!url) return Response.json({ error: 'A url is required.' }, { status: 400 })

        // Counted off the event log. Honest failure mode: before the index
        // migration lands there is no event table, the count is 0 and the limit
        // never trips. That is a deliberate fail-open on the ANTI-ABUSE control
        // only — the SSRF screen is not a counter and does not fail open.
        if ((await recentEventCount(sessionId, 'probe', 60)) >= PROBE_LIMIT_PER_HOUR) {
          return Response.json(
            { error: `That is ${PROBE_LIMIT_PER_HOUR} probes in an hour. Give it a rest and try again later.` },
            { status: 429 },
          )
        }

        const requested = coerceFrame(body.frame ?? 'inframe')
        const ownOrigin = new URL(request.url).origin
        const check = await probeFrame({ url, ownOrigin, requested })

        // Logged before the response is written, and logged whatever the verdict
        // was. A refused probe is the more interesting row of the two.
        void recordEvent({
          sessionId,
          kind: 'probe',
          entryId: Number(body.entryId) || null,
          docKind: 'external',
          // The event table's free-text column. A probe's "query" is the URL it
          // asked about; keeping it here means the abuse trail and the demand
          // trail are one table instead of two.
          query: `${check.verdict} ${check.finalUrl || url}`,
          frame: check.frame,
          source: 'probe',
        })

        // Re-probing something already in the index. Ownership is enforced by
        // the UPDATE's WHERE clause, so a caller naming somebody else's entry
        // gets the verdict for their own information and changes nothing.
        const entryId = Number(body.entryId)
        if (Number.isFinite(entryId) && entryId > 0) {
          const existing = await getEntry(entryId)
          const entry = await setEntryEmbedCheck(entryId, sessionId, check, requested)
          return Response.json({
            check,
            entry,
            // Said plainly rather than left to be inferred from a null.
            ...(entry
              ? {}
              : {
                  note: existing
                    ? 'The verdict is yours to read, but that entry was published by someone else, so nothing was changed.'
                    : 'That entry is not in the index, so there was nothing to update.',
                }),
          })
        }

        return Response.json({ check })
      },
    },
  },
})
