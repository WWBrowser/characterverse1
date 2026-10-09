import { createFileRoute } from '@tanstack/react-router'
import {
  AXES,
  escalationPacket,
  readIntent,
  THRESHOLDS,
  VERDICT_META,
  type Verdict,
} from '../lib/securityclaw.js'
import { POLICY_START } from '../lib/securityclaw.js'
import { loadPolicy, recentSecurity, resolveEscalation } from '../../db/saa.js'

// SAA SecurityClaw — the operator surface for the guardrail.
//
// Two things live here that do not belong on the recommendation endpoint:
//
//   THE LOG        every decision, including the boring ones. A guardrail that
//                  only logs refusals cannot demonstrate that it reasoned about
//                  the rest, and "it never fired" is indistinguishable from "it
//                  was never running".
//   THE HITL RUNG  resolving an escalation. The human's answer is recorded
//                  against the frozen request as ground truth.
//
// POST without an action is a DRY RUN: it screens text and returns the reading
// without writing to the log or advancing the session policy. Previewing what
// the guardrail thinks must not itself tighten the guardrail.

export const Route = createFileRoute('/api/securityclaw')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()

        // The screen itself is pure — it needs no database. If the log store is
        // unreachable the panel degrades to "no history, default sensitivity"
        // rather than going dark, because a guardrail console that disappears
        // when its logging disappears is the least useful failure mode there is.
        const [log, policy] = await Promise.all([
          recentSecurity(sessionId, 20).catch(() => []),
          loadPolicy(sessionId).catch(() => POLICY_START),
        ])

        return Response.json({
          policy,
          thresholds: THRESHOLDS,
          verdicts: VERDICT_META,
          axes: AXES.map((a) => ({
            axis: a.axis,
            label: a.label,
            guards: a.guards,
            terminal: a.terminal,
            fictionRelief: a.fictionRelief,
            probes: policy.probes[a.axis] || 0,
          })),
          log,
          open: log.filter((l) => l.escalated && !l.humanVerdict).length,
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

        // The HITL rung. A human decides, and the decision is stored against the
        // request that was frozen — not against a summary of it.
        if (body.action === 'resolve') {
          const id = Number(body.id)
          const humanVerdict = body.humanVerdict === 'approved' ? 'approved' : 'declined'
          if (!Number.isFinite(id)) {
            return Response.json({ error: 'id is required' }, { status: 400 })
          }
          const ok = await resolveEscalation(id, sessionId, humanVerdict)
          return ok
            ? Response.json({ id, humanVerdict })
            : Response.json({ error: 'Escalation not found for this session' }, { status: 404 })
        }

        const text = String(body.text || '').trim()
        if (!text) return Response.json({ error: 'text is required' }, { status: 400 })

        // Dry run — read the current policy, apply it, return the reading, write
        // nothing back.
        const policy = await loadPolicy(sessionId).catch(() => POLICY_START)
        const read = readIntent(text, policy)
        const verdict = read.verdict as Verdict

        return Response.json({
          dryRun: true,
          verdict,
          label: VERDICT_META[verdict].label,
          tone: VERDICT_META[verdict].tone,
          blurb: VERDICT_META[verdict].blurb,
          score: read.score,
          reasoning: read.reasoning,
          constraints: read.constraints,
          hits: read.hits,
          framing: read.context.notes,
          support: read.support,
          escalation: read.escalate ? escalationPacket(read, text) : null,
          // The policy this run WOULD have produced. Shown, not saved.
          wouldBecome: read.policy,
        })
      },
    },
  },
})
