import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getStore } from '@netlify/blobs'
import { db } from '../../db/index.js'
import { cvvVideos, characters } from '../../db/schema.js'
import { produceReel } from '../lib/cvv-producer.js'
import { resolveOrCreateChannel } from '../lib/cvv-channels.js'
import { CVV_MAX_UPLOAD_BYTES, CVV_CATEGORIES } from '../lib/cvv.js'
import { mintCoins } from '../../db/coins.js'

// The broadcast desk — step 1 of two. Because Netlify functions cap a single
// request body at ~6 MB, the video file is NOT sent here. This JSON endpoint
// resolves/creates the channel and has ReelClaw produce the tape's package, then:
//   • no file → inserts the poster-only "archive reel" row immediately.
//   • with a file → stashes the metadata + reel under an upload id in Netlify
//     Blobs and returns that id; the client then streams the file in chunks to
//     /api/cvv/chunk/$id and finalizes there (see api.cvv.chunk.$id.ts).
export const Route = createFileRoute('/api/cvv/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request.' }, { status: 400 })

        const title = String(body.title || '').trim().slice(0, 140)
        const description = String(body.description || '').trim().slice(0, 2000)
        let category = String(body.category || 'Vlogs').trim()
        const poster = String(body.poster || '🎬').slice(0, 8) || '🎬'
        const durationLabel = String(body.durationLabel || '').trim().slice(0, 12)
        const sessionId = String(body.sessionId || '').trim()
        const channelName = String(body.channelName || '').trim().slice(0, 60)
        const channelHandleRaw = String(body.channelHandle || '').trim()
        const hasFile = !!body.hasFile
        const mimeType = String(body.mimeType || 'video/mp4').slice(0, 120)
        const sizeBytes = Math.max(0, Math.floor(Number(body.sizeBytes) || 0))

        if (!title) return Response.json({ error: 'Give your tape a title.' }, { status: 400 })
        if (!sessionId) return Response.json({ error: 'Missing session.' }, { status: 400 })
        if (!(CVV_CATEGORIES as readonly string[]).includes(category)) category = 'Vlogs'
        if (hasFile && sizeBytes > CVV_MAX_UPLOAD_BYTES) {
          return Response.json({ error: 'That tape is over the 50MB limit.' }, { status: 413 })
        }

        const channel = await resolveOrCreateChannel(sessionId, channelHandleRaw, channelName)

        // Agentic channel? Give ReelClaw the fronting character's persona.
        let agentPersona: string | undefined
        if (channel.isAgent && channel.agentCharacterId) {
          const [char] = await db
            .select({ persona: characters.persona, description: characters.description })
            .from(characters)
            .where(eq(characters.id, channel.agentCharacterId))
          if (char) agentPersona = `${char.description}\n${char.persona}`.trim()
        }

        const reel = await produceReel({
          title,
          description,
          category,
          channelName: channel.name,
          isAgent: channel.isAgent,
          agentPersona,
        })

        // Poster-only archive reel — no file to stream, so write it now.
        if (!hasFile) {
          const [video] = await db
            .insert(cvvVideos)
            .values({
              channelId: channel.id,
              title,
              description,
              category,
              poster,
              durationLabel,
              tags: reel.tags,
              reel,
              creatorSession: sessionId,
            })
            .returning({ id: cvvVideos.id })
          // Uploading a tape mints Character Video Coin (CV).
          mintCoins({ sessionId, coin: 'cv', coins: 2, source: 'cvv_upload', reason: title, refType: 'cvv_video', refId: video.id })
          return Response.json({ id: video.id, channelHandle: channel.handle, done: true }, { status: 201 })
        }

        // File upload: stash everything the finalize step needs, keyed by a fresh
        // upload id. The client uploads the bytes in chunks against this id.
        const uploadId = `${sessionId.slice(0, 8)}-${globalThis.crypto.randomUUID()}`
        await getStore('cvv-uploads').setJSON(`${uploadId}/meta`, {
          channelId: channel.id,
          title,
          description,
          category,
          poster,
          durationLabel,
          mimeType,
          sizeBytes,
          sessionId,
          reel,
        })

        return Response.json({ uploadId, channelHandle: channel.handle }, { status: 201 })
      },
    },
  },
})
