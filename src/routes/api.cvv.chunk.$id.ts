import { createFileRoute } from '@tanstack/react-router'
import { getStore } from '@netlify/blobs'
import { db } from '../../db/index.js'
import { cvvVideos, cvvChannels } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { mintCoins } from '../../db/coins.js'

// The broadcast desk — step 2 of two ($id is the upload id from /api/cvv/upload).
//   PUT  ?part=<i>&parts=<n>  — body is the raw bytes of chunk i; stored as a part.
//   POST ?parts=<n>           — reassembles every part into the final tape blob,
//                               writes the video row, and cleans up the parts.
// Splitting the file this way keeps each request well under Netlify's ~6 MB
// function body limit, which a whole-video upload would blow straight past.
export const Route = createFileRoute('/api/cvv/chunk/$id')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const uploadId = params.id
        const url = new URL(request.url)
        const part = parseInt(url.searchParams.get('part') || '')
        const sessionId = (url.searchParams.get('sessionId') || '').trim()

        if (!sessionId || !uploadId.startsWith(`${sessionId.slice(0, 8)}-`)) {
          return Response.json({ error: 'Not your upload.' }, { status: 403 })
        }
        if (!Number.isInteger(part) || part < 0 || part > 999) {
          return Response.json({ error: 'Bad part index.' }, { status: 400 })
        }

        const buf = await request.arrayBuffer()
        if (!buf.byteLength) return Response.json({ error: 'Empty chunk.' }, { status: 400 })

        await getStore('cvv-uploads').set(`${uploadId}/part-${part}`, new Uint8Array(buf))
        return Response.json({ ok: true, part })
      },

      POST: async ({ request, params }) => {
        const uploadId = params.id
        const url = new URL(request.url)
        const parts = parseInt(url.searchParams.get('parts') || '')
        const sessionId = (url.searchParams.get('sessionId') || '').trim()

        if (!sessionId || !uploadId.startsWith(`${sessionId.slice(0, 8)}-`)) {
          return Response.json({ error: 'Not your upload.' }, { status: 403 })
        }
        if (!Number.isInteger(parts) || parts < 1 || parts > 999) {
          return Response.json({ error: 'Bad part count.' }, { status: 400 })
        }

        const store = getStore('cvv-uploads')
        const meta = (await store.get(`${uploadId}/meta`, { type: 'json' }).catch(() => null)) as any
        if (!meta || meta.sessionId !== sessionId) {
          return Response.json({ error: 'Upload not found or expired.' }, { status: 404 })
        }

        // Pull every part in order and stitch them back into one buffer.
        const buffers: Uint8Array[] = []
        let total = 0
        for (let i = 0; i < parts; i++) {
          const chunk = await store.get(`${uploadId}/part-${i}`, { type: 'arrayBuffer' }).catch(() => null)
          if (!chunk) return Response.json({ error: `Missing chunk ${i}. Please re-upload.` }, { status: 400 })
          const view = new Uint8Array(chunk)
          buffers.push(view)
          total += view.byteLength
        }
        const merged = new Uint8Array(total)
        let offset = 0
        for (const b of buffers) {
          merged.set(b, offset)
          offset += b.byteLength
        }

        // Write the finished tape and record it. The upload id doubles as the
        // final blob key so the stream route can find it.
        await getStore('cvv-videos').set(uploadId, merged, {
          metadata: { mimeType: meta.mimeType, title: meta.title },
        })

        const [channel] = await db
          .select({ handle: cvvChannels.handle })
          .from(cvvChannels)
          .where(eq(cvvChannels.id, meta.channelId))

        const [video] = await db
          .insert(cvvVideos)
          .values({
            channelId: meta.channelId,
            title: meta.title,
            description: meta.description,
            category: meta.category,
            blobKey: uploadId,
            mimeType: meta.mimeType,
            sizeBytes: total,
            durationLabel: meta.durationLabel,
            poster: meta.poster,
            tags: Array.isArray(meta.reel?.tags) ? meta.reel.tags : [],
            reel: meta.reel || {},
            creatorSession: sessionId,
          })
          .returning({ id: cvvVideos.id })

        // Best-effort cleanup of the staging parts + metadata.
        store.delete(`${uploadId}/meta`).catch(() => {})
        for (let i = 0; i < parts; i++) store.delete(`${uploadId}/part-${i}`).catch(() => {})

        // Uploading a tape mints Character Video Coin (CV).
        mintCoins({ sessionId, coin: 'cv', coins: 2, source: 'cvv_upload', reason: meta.title, refType: 'cvv_video', refId: video.id })

        return Response.json({ id: video.id, channelHandle: channel?.handle }, { status: 201 })
      },
    },
  },
})
