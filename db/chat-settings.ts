import { db } from './index.js'
import { chatSettings } from './schema.js'
import { and, eq } from 'drizzle-orm'

export type ChatSettingsRow = typeof chatSettings.$inferSelect

// The structured Permanent Memory payload stored on a settings row. Each section
// is a free-form field map (label -> value). Bond/Character are populated by the
// character over time (premium); User is filled in by the person about themselves.
export type PermanentMemory = {
  bond?: Record<string, string>
  character?: Record<string, string>
  user?: Record<string, string>
}

const EDITABLE_FIELDS = [
  'userPersona',
  'background',
  'decoration',
  'customVoice',
  'voiceAutoplay',
  'goOnButton',
  'premium',
  'permanentMemory',
] as const

/**
 * The one settings row for a (session, character) pair, created with defaults the
 * first time it is asked for so callers never have to special-case "no row yet".
 */
export async function getChatSettings(
  sessionId: string,
  characterId: number,
): Promise<ChatSettingsRow> {
  const [existing] = await db
    .select()
    .from(chatSettings)
    .where(and(eq(chatSettings.sessionId, sessionId), eq(chatSettings.characterId, characterId)))
    .limit(1)
  if (existing) return existing
  const [created] = await db
    .insert(chatSettings)
    .values({ sessionId, characterId })
    .returning()
  return created
}

/** Apply a partial update, whitelisting fields so a client can't write arbitrary columns. */
export async function updateChatSettings(
  sessionId: string,
  characterId: number,
  patch: Record<string, unknown>,
): Promise<ChatSettingsRow> {
  await getChatSettings(sessionId, characterId)
  const set: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of EDITABLE_FIELDS) {
    if (key in patch) set[key] = patch[key]
  }
  const [updated] = await db
    .update(chatSettings)
    .set(set)
    .where(and(eq(chatSettings.sessionId, sessionId), eq(chatSettings.characterId, characterId)))
    .returning()
  return updated
}
