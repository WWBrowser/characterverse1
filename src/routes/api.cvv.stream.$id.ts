import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getStore } from '@netlify/blobs'
import { db } from '../../db/index.js'
import { cvvVideos } from '../../db/schema.js'

// Streams a tape's bytes back from Netlify Blobs. Supports a single Range request
// (206 Partial Content) so the browser can seek within the <video> element, and
// falls back to a full 200 body otherwise.
export const Route = createFileRoute('/api/cvv/stream/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return new Response('Invalid ID', { status: 400 })

        const [video] = await db
          .select({ blobKey: cvvVideos.blobKey, mimeType: cvvVideos.mimeType })
          .from(cvvVideos)
          .where(eq(cvvVideos.id, id))
        if (!video || !video.blobKey) return new Response('No tape on file', { status: 404 })

        const buf = await getStore('cvv-videos').get(video.blobKey, { type: 'arrayBuffer' })
        if (!buf) return new Response('Tape missing', { status: 404 })

        const total = buf.byteLength
        const range = request.headers.get('range')
        const baseHeaders: Record<string, string> = {
          'Content-Type': video.mimeType || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        }

        if (range) {
          const match = /bytes=(\d*)-(\d*)/.exec(range)
          if (match) {
            const start = match[1] ? parseInt(match[1]) : 0
            const end = match[2] ? Math.min(parseInt(match[2]), total - 1) : total - 1
            if (start <= end && start < total) {
              const slice = buf.slice(start, end + 1)
              return new Response(slice, {
                status: 206,
                headers: {
                  ...baseHeaders,
                  'Content-Range': `bytes ${start}-${end}/${total}`,
                  'Content-Length': String(end - start + 1),
                },
              })
            }
          }
        }

        return new Response(buf, {
          status: 200,
          headers: { ...baseHeaders, 'Content-Length': String(total) },
        })
      },
    },
  },
})
