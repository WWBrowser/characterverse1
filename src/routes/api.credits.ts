import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters, characterStats } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { ensureStatsRow } from '../../db/stats.js'
import { APPS, EXTERNALS } from '../lib/credits.js'

// Character Credits API — powers the leaderboard and per-character stat cards.
//
//   GET  /api/credits                  → leaderboard rows (public characters)
//   GET  /api/credits?scope=enterprise → include private (enterprise) characters
//   GET  /api/credits?characterId=N    → one character's raw stat row + character
//   POST /api/credits                  → connect/disconnect an app or external
//                                        platform (the +5 / +15 CC mechanics)
//
// The route returns RAW counters; CC is derived on the client via src/lib/credits
// so the rate model stays in one place. Stats rows are created lazily.

type StatRow = typeof characterStats.$inferSelect

const APP_SLUGS = new Set(APPS.map((a) => a.slug))
const EXTERNAL_SLUGS = new Set(EXTERNALS.map((e) => e.slug))

// Classify how a character was authored, so the Joint Leaderboard can pick out
// the collaborative ones. Twins are linked via `twinId`; merges and twins also
// carry a marker prefix on their persona (set by the create flow).
function deriveKind(character: typeof characters.$inferSelect): 'single' | 'merge' | 'twin' {
  if (character.twinId || character.persona.startsWith('[Twin Chat')) return 'twin'
  if (character.persona.startsWith('[Joint Merge')) return 'merge'
  return 'single'
}

function shape(character: typeof characters.$inferSelect, stat: StatRow | undefined) {
  return {
    character: {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      category: character.category,
      tagline: character.tagline,
    },
    kind: deriveKind(character),
    twinId: character.twinId ?? null,
    chatMsgs: stat?.chatMsgs ?? 0,
    clawMsgs: stat?.clawMsgs ?? 0,
    conferenceMsgs: stat?.conferenceMsgs ?? 0,
    appConnections: (stat?.appConnections as string[] | undefined) ?? [],
    externalPlatforms: (stat?.externalPlatforms as string[] | undefined) ?? [],
    isPrivate: stat?.isPrivate ?? false,
  }
}

export const Route = createFileRoute('/api/credits')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const scope = url.searchParams.get('scope') || 'public'
        const characterIdParam = url.searchParams.get('characterId')

        // Single character stat card.
        if (characterIdParam && !isNaN(Number(characterIdParam))) {
          const cid = Number(characterIdParam)
          const [character] = await db.select().from(characters).where(eq(characters.id, cid))
          if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })
          const [stat] = await db.select().from(characterStats).where(eq(characterStats.characterId, cid))
          return Response.json(shape(character, stat))
        }

        // Leaderboard: every character left-joined to its stats row.
        const rows = await db
          .select({ character: characters, stat: characterStats })
          .from(characters)
          .leftJoin(characterStats, eq(characters.id, characterStats.characterId))

        const list = rows
          .map((r) => shape(r.character, r.stat ?? undefined))
          .filter((r) => scope === 'enterprise' || !r.isPrivate)

        return Response.json(list)
      },

      // Connect/disconnect an app (+5 CC) or external platform (+15 CC), or set a
      // character's enterprise-private flag. Connections are idempotent — a slug
      // counts once. Body: { characterId, action, slug? }
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const characterId = Number(body.characterId)
        const action = String(body.action || '')
        if (!characterId) return Response.json({ error: 'characterId is required' }, { status: 400 })

        const [character] = await db.select().from(characters).where(eq(characters.id, characterId))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        await ensureStatsRow(characterId)
        const [stat] = await db.select().from(characterStats).where(eq(characterStats.characterId, characterId))

        const apps = new Set(((stat?.appConnections as string[]) ?? []))
        const externals = new Set(((stat?.externalPlatforms as string[]) ?? []))

        const slug = String(body.slug || '')

        switch (action) {
          case 'connectApp':
            if (!APP_SLUGS.has(slug)) return Response.json({ error: 'Unknown app' }, { status: 400 })
            apps.add(slug)
            break
          case 'disconnectApp':
            apps.delete(slug)
            break
          case 'connectExternal':
            if (!EXTERNAL_SLUGS.has(slug)) return Response.json({ error: 'Unknown platform' }, { status: 400 })
            externals.add(slug)
            break
          case 'disconnectExternal':
            externals.delete(slug)
            break
          case 'setPrivate':
            await db
              .update(characterStats)
              .set({ isPrivate: Boolean(body.isPrivate), updatedAt: new Date() })
              .where(eq(characterStats.characterId, characterId))
            break
          default:
            return Response.json({ error: 'Unknown action' }, { status: 400 })
        }

        if (action !== 'setPrivate') {
          await db
            .update(characterStats)
            .set({
              appConnections: [...apps],
              externalPlatforms: [...externals],
              updatedAt: new Date(),
            })
            .where(eq(characterStats.characterId, characterId))
        }

        const [updated] = await db.select().from(characterStats).where(eq(characterStats.characterId, characterId))
        return Response.json(shape(character, updated))
      },
    },
  },
})
