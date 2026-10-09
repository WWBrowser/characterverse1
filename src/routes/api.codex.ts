import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  trainingSignals,
  bounties,
  bountyFeedback,
  userMemories,
  cronSubscriptions,
  calendarEvents,
  cronPulses,
  routeAgents,
  missions,
  geneticQuirks,
  trainingCycles,
  reasoningCycles,
  clusterIncarnations,
  socialMembers,
  socialBulletins,
  socialComments,
  socialAdoptions,
  socialShadowLogs,
  cazProfiles,
  cazBulletins,
  cazWall,
  cazFriendships,
  cvvChannels,
  cvvVideos,
  cvvComments,
  cvjGigs,
  cvjOrders,
  cvjReviews,
  tabverseForks,
  tabverseCycles,
  artPieces,
} from '../../db/schema.js'
import { readCodex, EMPTY_STRANDS, type StreamCounts, type StrandCounts } from '../lib/codex.js'
import type { ZoneKey } from '../lib/icqe.js'

// The Agentic Codex feed — the Synapse Collective's nursery.
//
//   GET /api/codex → { counts, strands, codex }
//
// The collective trains off the whole population, not one workspace, so every
// count here is platform-wide. Nothing is stored: the reading is derived on each
// load from what the platform already holds, which is why the collective visibly
// grows as the platform is used and why no migration was needed to grow it.
//
// Every count is individually fault-tolerant. A stream that cannot be read reads
// as zero rather than failing the nursery — the page must still render (and the
// collective must still be visibly asleep) with an empty or partial database.

export const Route = createFileRoute('/api/codex')({
  server: {
    handlers: {
      GET: async () => {
        const [
          signals,
          bountyRows,
          bountyVerdicts,
          memories,
          cronSubs,
          cronEvents,
          pulses,
          agents,
          missionRows,
          quirks,
          neuralCycles,
          reasoning,
          clusters,
          cvsMembers,
          cvsBulletins,
          cvsComments,
          cvsAdoptions,
          cvsShadow,
          cvaProfiles,
          cvaBulletins,
          cvaWall,
          cvaFriends,
          cvvChans,
          cvvVids,
          cvvComs,
          cvjGigRows,
          cvjOrderRows,
          cvjReviewRows,
          cvtForks,
          cvtCycles,
          artCommits,
          strands,
        ] = await Promise.all([
          countOf(trainingSignals),
          countOf(bounties),
          countOf(bountyFeedback),
          countOf(userMemories),
          countOf(cronSubscriptions),
          countOf(calendarEvents),
          countOf(cronPulses),
          countOf(routeAgents),
          countOf(missions),
          countOf(geneticQuirks),
          countOf(trainingCycles),
          countOf(reasoningCycles),
          countOf(clusterIncarnations),
          countOf(socialMembers),
          countOf(socialBulletins),
          countOf(socialComments),
          countOf(socialAdoptions),
          countOf(socialShadowLogs),
          countOf(cazProfiles),
          countOf(cazBulletins),
          countOf(cazWall),
          countOf(cazFriendships),
          countOf(cvvChannels),
          countOf(cvvVideos),
          countOf(cvvComments),
          countOf(cvjGigs),
          countOf(cvjOrders),
          countOf(cvjReviews),
          countOf(tabverseForks),
          countOf(tabverseCycles),
          countOf(artPieces),
          readStrands(),
        ])

        // One number per feeder stream: everything that stream pours in, summed.
        const counts: StreamCounts = {
          training: signals,
          bounties: bountyRows + bountyVerdicts,
          memory: memories,
          cron: cronSubs + cronEvents + pulses,
          routeclaw: agents + missionRows,
          icqe: quirks,
          // Neural Training consolidates both the dyad sleep cycles and the
          // reasoning cycles the ICQE loop folds back into them.
          neural: neuralCycles + reasoning,
          clusters,
          cvs: cvsMembers + cvsBulletins + cvsComments + cvsAdoptions + cvsShadow,
          cva: cvaProfiles + cvaBulletins + cvaWall + cvaFriends,
          cvv: cvvChans + cvvVids + cvvComs,
          cvj: cvjGigRows + cvjOrderRows + cvjReviewRows,
          cvt: cvtForks + cvtCycles,
          // Only committed pieces are in this table at all — the studio records
          // nothing while a creator is merely turning dials, so this count is a
          // count of choices rather than of activity.
          art: artCommits,
        }

        return Response.json({ counts, strands, codex: readCodex(counts, strands) })
      },
    },
  },
})

/** A platform-wide row count that degrades to 0 instead of throwing. */
async function countOf(table: any): Promise<number> {
  try {
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table)
    return Number(rows?.[0]?.n) || 0
  } catch {
    return 0
  }
}

/**
 * The judged diet: every strand the two ICQE Claws filed, split across the three
 * filter levels and across the two filtration passes. Grouped in the database so
 * the registry is never pulled into memory.
 *
 * Older rows carry the verdict in `status` and leave `zone` empty, so both are
 * read — the same fallback the ICQE health-check uses.
 */
async function readStrands(): Promise<StrandCounts> {
  try {
    const rows = await db
      .select({
        zone: geneticQuirks.zone,
        status: geneticQuirks.status,
        agent: geneticQuirks.agent,
        n: sql<number>`count(*)::int`,
      })
      .from(geneticQuirks)
      .groupBy(geneticQuirks.zone, geneticQuirks.status, geneticQuirks.agent)

    const out: StrandCounts = {
      byZone: { blossom: 0, gray: 0, terminate: 0 },
      undecided: 0,
      byAgent: { doctor: 0, immigration: 0 },
    }

    for (const r of rows) {
      const n = Number(r.n) || 0
      const zone = (r.zone || r.status) as ZoneKey
      if (zone === 'blossom' || zone === 'gray' || zone === 'terminate') {
        out.byZone[zone] += n
        if (r.agent === 'immigration') out.byAgent.immigration += n
        else out.byAgent.doctor += n
      } else if (r.status === 'detected') {
        out.undecided += n
      }
    }
    return out
  } catch {
    return { ...EMPTY_STRANDS, byZone: { ...EMPTY_STRANDS.byZone }, byAgent: { ...EMPTY_STRANDS.byAgent } }
  }
}
