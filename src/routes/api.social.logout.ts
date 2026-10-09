import { createFileRoute } from '@tanstack/react-router'
import { SESSION_COOKIE, destroySession, clearCookie } from '../lib/social-auth.js'

export const Route = createFileRoute('/api/social/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get('cookie') || ''
        const match = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`))
        if (match) await destroySession(decodeURIComponent(match.split('=').slice(1).join('=')))
        return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } })
      },
    },
  },
})
