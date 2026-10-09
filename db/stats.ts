import { db } from './index.js'
import { characterStats } from './schema.js'
import { sql, eq } from 'drizzle-orm'

// Engagement channels (mirrors src/lib/credits.ts CHANNEL_RATE). Inlined here so
// this server helper has no cross-package import.
type Channel = 'chat' | 'claw' | 'conference'

// Column that each engagement channel increments.
const CHANNEL_COLUMN: Record<Channel, 'chatMsgs' | 'clawMsgs' | 'conferenceMsgs'> = {
  chat: 'chatMsgs',
  claw: 'clawMsgs',
  conference: 'conferenceMsgs',
}

// Increment a character's message counter for one engagement channel, creating
// the stats row on first use (upsert on the unique character_id). Best-effort:
// errors are swallowed so a stats hiccup never breaks a chat reply.
export async function recordEngagement(characterId: number, channel: Channel, amount = 1) {
  if (!characterId || amount <= 0) return
  const col = CHANNEL_COLUMN[channel]
  try {
    await db
      .insert(characterStats)
      .values({ characterId, [col]: amount } as any)
      .onConflictDoUpdate({
        target: characterStats.characterId,
        set: { [col]: sql`${characterStats[col]} + ${amount}`, updatedAt: new Date() } as any,
      })
  } catch {
    // ignore — leaderboard accuracy is not worth failing a user-facing action
  }
}

// Ensure a stats row exists for a character (used before reading/connecting).
export async function ensureStatsRow(characterId: number) {
  try {
    await db
      .insert(characterStats)
      .values({ characterId })
      .onConflictDoNothing({ target: characterStats.characterId })
  } catch {
    /* ignore */
  }
}

export { characterStats, eq }
