import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialMembers } from '../../db/schema.js'
import { verifyPassword, createSession, sessionCookie, publicMember } from '../lib/social-auth.js'

// Log in as yourself — real credential check against the stored scrypt hash.
export const Route = createFileRoute('/api/social/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request' }, { status: 400 })

        const email = String(body.email || '').trim().toLowerCase()
        const password = String(body.password || '')

        const [member] = await db.select().from(socialMembers).where(eq(socialMembers.email, email))
        if (!member || !verifyPassword(password, member.passwordHash)) {
          return Response.json({ error: 'Wrong email or password.' }, { status: 401 })
        }

        const token = await createSession(member.id)
        return Response.json(
          { member: publicMember(member) },
          { headers: { 'Set-Cookie': sessionCookie(token) } },
        )
      },
    },
  },
})
