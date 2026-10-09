import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters, characterStats } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { creditsFor } from '../lib/credits.js'

// Best-character routing — the "LLM feel" behind Ask Mode 1.
//
// When someone asks a question on /ask without picking a character, this resolver
// chooses the best one for them so the picker can stay blank. Two rules from the
// brief:
//   1. Route to the best character for the question (relevance + earned quality).
//   2. When several characters share a name (e.g. 25–50 different "Pikachu"
//      personalities), keep only the best-performing personality of that name,
//      then rank those representatives. So the strongest Pikachu wins its name,
//      and the strongest match across all names is returned.
//
// Quality is the character's Character Credits (derived from its engagement stats)
// plus a little weight for total chats — the same signal the leaderboard uses.

type Body = { question?: unknown; category?: unknown }

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'be', 'do', 'you', 'me', 'my', 'i', 'we', 'it', 'this', 'that', 'how', 'what', 'who',
  'can', 'will', 'would', 'about', 'please', 'tell', 'give', 'help', 'want', 'need', 'get',
])

function tokenize(s: string): string[] {
  const m = String(s || '').toLowerCase().match(/[a-z0-9]+/g)
  if (!m) return []
  return m.filter((t) => t.length > 2 && !STOP.has(t))
}

export const Route = createFileRoute('/api/ask-route')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const question = String(body.question || '').trim()
        const category = String(body.category || '').trim()

        // Every public character with its (optional) engagement stats.
        const rows = await db
          .select({
            id: characters.id,
            name: characters.name,
            tagline: characters.tagline,
            description: characters.description,
            avatar: characters.avatar,
            category: characters.category,
            totalChats: characters.totalChats,
            chatMsgs: characterStats.chatMsgs,
            clawMsgs: characterStats.clawMsgs,
            conferenceMsgs: characterStats.conferenceMsgs,
            appConnections: characterStats.appConnections,
            externalPlatforms: characterStats.externalPlatforms,
          })
          .from(characters)
          .leftJoin(characterStats, eq(characterStats.characterId, characters.id))
          .where(eq(characters.isPublic, true))
          .limit(500)

        if (!rows.length) return Response.json({ character: null })

        const qSet = new Set(tokenize(question))
        const catLc = category && category !== 'All' ? category.toLowerCase() : ''

        type Scored = {
          row: (typeof rows)[number]
          quality: number
          relevance: number
          score: number
        }

        const scored: Scored[] = rows.map((row) => {
          // Earned quality: Character Credits + a nudge for raw chat volume.
          const quality =
            creditsFor({
              chatMsgs: row.chatMsgs,
              clawMsgs: row.clawMsgs,
              conferenceMsgs: row.conferenceMsgs,
              appConnections: row.appConnections,
              externalPlatforms: row.externalPlatforms,
            }).total +
            (row.totalChats ?? 0) * 0.5

          // Relevance: token overlap of the question with the character's words,
          // with a strong boost when the character's whole name is named, plus a
          // category-match bonus.
          const hay = new Set([
            ...tokenize(row.name),
            ...tokenize(row.tagline),
            ...tokenize(row.description),
            ...tokenize(row.category),
          ])
          let overlap = 0
          for (const t of qSet) if (hay.has(t)) overlap++

          const nameTokens = tokenize(row.name)
          const namedExplicitly = nameTokens.length > 0 && nameTokens.every((t) => qSet.has(t))
          const catBonus = catLc && row.category.toLowerCase() === catLc ? 1 : 0

          const relevance = overlap + (namedExplicitly ? 5 : 0) + catBonus
          // Relevance dominates; quality breaks ties and rules an empty question.
          const score = relevance * 1_000_000 + quality
          return { row, quality, relevance, score }
        })

        // Rule 2 — collapse same-named characters to their best personality
        // (highest earned quality), so a name is represented by its strongest.
        const bestByName = new Map<string, Scored>()
        const nameCounts = new Map<string, number>()
        for (const s of scored) {
          const key = s.row.name.toLowerCase().trim()
          nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
          const prev = bestByName.get(key)
          if (!prev || s.quality > prev.quality) bestByName.set(key, s)
        }

        // Rule 1 — among those representatives, the best match for the question.
        let winner: Scored | null = null
        for (const s of bestByName.values()) {
          if (!winner || s.score > winner.score) winner = s
        }
        if (!winner) return Response.json({ character: null })

        const key = winner.row.name.toLowerCase().trim()
        const sameNameCount = nameCounts.get(key) ?? 1
        const matched = winner.relevance > 0

        return Response.json({
          character: {
            id: winner.row.id,
            name: winner.row.name,
            avatar: winner.row.avatar,
            category: winner.row.category,
            tagline: winner.row.tagline,
            description: winner.row.description,
            totalChats: winner.row.totalChats ?? 0,
          },
          // Why this character won — surfaced to the user as a one-line note.
          matched,
          sameNameCount,
        })
      },
    },
  },
})
