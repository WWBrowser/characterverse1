import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { auditTrims, characters, chatmarks, enterpriseSettings, messages } from '../../db/schema.js'
import { eq, desc, inArray } from 'drizzle-orm'
import { DEFAULT_WORKSPACE } from '../lib/audit.js'

// Audit API — the boss/auditor view. The boss sees everything; the dashboard
// only escalates what matters.
//
//   GET  /api/audit?workspaceId=default → full dashboard payload
//   POST /api/audit                      → { action: 'setAccess' | 'flagGem' }
//
// Settings (FileChat access, stuck threshold) live in enterprise_settings; trims
// are the gated negatives; escalations are computed live from message timing.

async function getSettings(workspaceId: string) {
  // Lazily create the workspace row with defaults on first read.
  await db
    .insert(enterpriseSettings)
    .values({ workspaceId })
    .onConflictDoNothing({ target: enterpriseSettings.workspaceId })
    .catch(() => {})
  const [row] = await db
    .select()
    .from(enterpriseSettings)
    .where(eq(enterpriseSettings.workspaceId, workspaceId))
  return {
    workspaceId: row?.workspaceId ?? workspaceId,
    orgName: row?.orgName ?? 'Your Organization',
    seats: row?.seats ?? 100,
    fileChatAccess: row?.fileChatAccess ?? 'open',
    stuckThresholdMins: row?.stuckThresholdMins ?? 50,
  }
}

export const Route = createFileRoute('/api/audit')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = url.searchParams.get('workspaceId') || DEFAULT_WORKSPACE

        const settings = await getSettings(workspaceId)

        // --- Trimmed negatives, enriched with their character ---
        const trimRows = await db
          .select({ trim: auditTrims, character: characters })
          .from(auditTrims)
          .leftJoin(characters, eq(auditTrims.characterId, characters.id))
          .orderBy(desc(auditTrims.createdAt))

        const trims = trimRows.map((r) => ({
          ...r.trim,
          character: r.character
            ? { id: r.character.id, name: r.character.name, avatar: r.character.avatar }
            : null,
        }))

        // --- Per-character hallucination breakdown (which characters break down) ---
        const charMap = new Map<number, { id: number; name: string; avatar: string; trims: number; trimmedMsgs: number; gems: number }>()
        for (const r of trimRows) {
          if (!r.character) continue
          const c = charMap.get(r.character.id) || {
            id: r.character.id,
            name: r.character.name,
            avatar: r.character.avatar,
            trims: 0,
            trimmedMsgs: 0,
            gems: 0,
          }
          c.trims += 1
          c.trimmedMsgs += Array.isArray(r.trim.trimmedMessages) ? (r.trim.trimmedMessages as any[]).length : 0
          if (r.trim.hiddenGem) c.gems += 1
          charMap.set(r.character.id, c)
        }
        const characterBreakdown = Array.from(charMap.values()).sort((a, b) => b.trims - a.trims)

        // --- Escalations: marked conversations where an employee sat past the
        // stuck threshold (a gap between consecutive messages), instead of
        // refreshing the instance. Computed from real message timing. ---
        const marks = await db
          .select({
            conversationId: chatmarks.conversationId,
            characterId: chatmarks.characterId,
            sessionId: chatmarks.sessionId,
            title: chatmarks.title,
          })
          .from(chatmarks)
        const convIds = marks.map((m) => m.conversationId)
        const charById = new Map<number, { name: string; avatar: string }>()
        if (convIds.length) {
          const cids = Array.from(new Set(marks.map((m) => m.characterId)))
          const chars = await db.select().from(characters).where(inArray(characters.id, cids))
          for (const c of chars) charById.set(c.id, { name: c.name, avatar: c.avatar })
        }

        const msgRows = convIds.length
          ? await db
              .select({
                conversationId: messages.conversationId,
                createdAt: messages.createdAt,
              })
              .from(messages)
              .where(inArray(messages.conversationId, convIds))
              .orderBy(messages.conversationId, messages.createdAt)
          : []

        const byConv = new Map<number, number[]>()
        for (const m of msgRows) {
          if (!m.createdAt) continue
          const t = new Date(m.createdAt).getTime()
          const arr = byConv.get(m.conversationId) || []
          arr.push(t)
          byConv.set(m.conversationId, arr)
        }

        const thresholdMs = settings.stuckThresholdMins * 60 * 1000
        const escalations: any[] = []
        for (const mark of marks) {
          const times = byConv.get(mark.conversationId)
          if (!times || times.length < 2) continue
          let maxGap = 0
          for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, times[i] - times[i - 1])
          if (maxGap >= thresholdMs) {
            const ch = charById.get(mark.characterId)
            escalations.push({
              conversationId: mark.conversationId,
              characterId: mark.characterId,
              characterName: ch?.name || 'Unknown',
              characterAvatar: ch?.avatar || '🤖',
              sessionId: mark.sessionId,
              title: mark.title,
              stuckMinutes: Math.round(maxGap / 60000),
            })
          }
        }
        escalations.sort((a, b) => b.stuckMinutes - a.stuckMinutes)

        const totals = {
          trims: trims.length,
          trimmedMessages: trims.reduce(
            (s, t) => s + (Array.isArray(t.trimmedMessages) ? (t.trimmedMessages as any[]).length : 0),
            0,
          ),
          hiddenGems: trims.filter((t) => t.hiddenGem).length,
          escalations: escalations.length,
        }

        return Response.json({ settings, trims, characterBreakdown, escalations, totals })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const action = String(body.action || '')
        const workspaceId = String(body.workspaceId || DEFAULT_WORKSPACE)

        if (action === 'setAccess') {
          const access = String(body.fileChatAccess || 'open')
          if (!['open', 'closed', 'hybrid'].includes(access)) {
            return Response.json({ error: 'Unknown access mode' }, { status: 400 })
          }
          await db
            .insert(enterpriseSettings)
            .values({ workspaceId, fileChatAccess: access })
            .onConflictDoUpdate({
              target: enterpriseSettings.workspaceId,
              set: { fileChatAccess: access, updatedAt: new Date() },
            })
          return Response.json(await getSettings(workspaceId))
        }

        if (action === 'flagGem') {
          const trimId = Number(body.trimId)
          if (!trimId) return Response.json({ error: 'trimId is required' }, { status: 400 })
          const [updated] = await db
            .update(auditTrims)
            .set({ hiddenGem: Boolean(body.hiddenGem), gemNote: String(body.gemNote || '').slice(0, 500) })
            .where(eq(auditTrims.id, trimId))
            .returning()
          return Response.json({ trim: updated })
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 })
      },
    },
  },
})
