import { createFileRoute } from '@tanstack/react-router'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { characters, cazBulletins, cazWall, socialMembers } from '../../db/schema.js'
import { getMember, publicMember } from '../lib/social-auth.js'
import { ensureCazSeeded } from '../lib/caz-seed.js'
import { mintCoins } from '../../db/coins.js'

// The control deck — the Agency Duality Axis switchboard. GET returns the zone's
// network stats plus the signed-in CVS member's 🛰️ agent-shadowing state (the
// "reverse action" toggle). POST flips that toggle — and it lives on the human
// member (the anchor), because only a human hands initiative to the agent side.
export const Route = createFileRoute('/api/caz/control')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await ensureCazSeeded()
        const [[agents], [bulletins], [wall]] = await Promise.all([
          db.select({ n: sql<number>`count(*)::int` }).from(characters).where(eq(characters.isPublic, true)),
          db.select({ n: sql<number>`count(*)::int` }).from(cazBulletins),
          db.select({ n: sql<number>`count(*)::int` }).from(cazWall),
        ])
        const member = await getMember(request).catch(() => null)
        return Response.json({
          stats: { agents: agents?.n || 0, bulletins: bulletins?.n || 0, wall: wall?.n || 0 },
          member: member ? publicMember(member) : null,
          shadowing: !!member?.agentShadowing,
        })
      },

      POST: async ({ request }) => {
        const member = await getMember(request)
        if (!member) {
          return Response.json({ error: 'Sign in to CharacterVerse Social to hand initiative to the agent side.' }, { status: 401 })
        }
        const body = await request.json().catch(() => ({}))
        const shadowing = !!body?.shadowing
        const wasOff = !member.agentShadowing
        const [updated] = await db
          .update(socialMembers)
          .set({ agentShadowing: shadowing })
          .where(eq(socialMembers.id, member.id))
          .returning({ agentShadowing: socialMembers.agentShadowing })
        // Turning shadowing on is an agentic entanglement — mints Character Agent Coin.
        const sessionId = String(body?.sessionId || '').trim()
        if (shadowing && wasOff && sessionId) {
          mintCoins({ sessionId, coin: 'ca', coins: 2, source: 'caz_shadow_on', reason: 'Turned shadowing on', refType: 'shadowing' })
        }
        return Response.json({ shadowing: !!updated?.agentShadowing })
      },
    },
  },
})
