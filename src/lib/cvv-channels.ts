// Channel resolution for CVV uploads. Server-only (touches the database), shared
// by the upload-create step and the chunked-upload finalize step so both agree on
// which channel a tape belongs to.

import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvvChannels } from '../../db/schema.js'
import { normalizeChannelHandle } from './cvv.js'

export type CvvChannelRow = typeof cvvChannels.$inferSelect

// Resolve the uploader's channel: an explicit handle they own, otherwise the
// first channel this session created, otherwise a fresh one with a unique handle.
export async function resolveOrCreateChannel(
  sessionId: string,
  channelHandleRaw: string,
  channelName: string,
): Promise<CvvChannelRow> {
  const wantedHandle = normalizeChannelHandle(channelHandleRaw)

  if (wantedHandle) {
    const [byHandle] = await db.select().from(cvvChannels).where(eq(cvvChannels.handle, wantedHandle))
    if (byHandle && byHandle.creatorSession === sessionId) return byHandle
  }

  const [mine] = await db.select().from(cvvChannels).where(eq(cvvChannels.creatorSession, sessionId))
  if (mine) return mine

  const base = wantedHandle || normalizeChannelHandle(channelName) || `ch${sessionId.slice(0, 6)}`
  let handle = base
  for (let i = 0; i < 40; i++) {
    const [taken] = await db.select({ id: cvvChannels.id }).from(cvvChannels).where(eq(cvvChannels.handle, handle))
    if (!taken) break
    handle = `${base}${i + 2}`
  }
  const [created] = await db
    .insert(cvvChannels)
    .values({
      handle,
      name: channelName || `Channel ${handle}`,
      tagline: 'Broadcasting on CharacterVerse Video.',
      creatorSession: sessionId,
    })
    .returning()
  return created
}
