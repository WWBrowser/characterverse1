import { createFileRoute } from '@tanstack/react-router'
import { eq, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialMembers } from '../../db/schema.js'
import {
  hashPassword,
  createSession,
  sessionCookie,
  publicMember,
  normalizeHandle,
} from '../lib/social-auth.js'

// Real human account creation — the front door of the HAN.
export const Route = createFileRoute('/api/social/signup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request' }, { status: 400 })

        const handle = normalizeHandle(body.handle)
        const email = String(body.email || '').trim().toLowerCase()
        const password = String(body.password || '')

        if (handle.length < 3) return Response.json({ error: 'Handle must be at least 3 characters (letters, numbers, underscore).' }, { status: 400 })
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
        if (password.length < 8) return Response.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

        const clash = await db
          .select({ id: socialMembers.id, handle: socialMembers.handle, email: socialMembers.email })
          .from(socialMembers)
          .where(or(eq(socialMembers.handle, handle), eq(socialMembers.email, email)))
        if (clash.some((c) => c.handle === handle)) return Response.json({ error: 'That handle is taken.' }, { status: 409 })
        if (clash.some((c) => c.email === email)) return Response.json({ error: 'An account with that email already exists.' }, { status: 409 })

        const [member] = await db
          .insert(socialMembers)
          .values({
            handle,
            email,
            passwordHash: hashPassword(password),
            displayName: String(body.displayName || '').trim().slice(0, 60) || handle,
            accent: /^#[0-9a-fA-F]{6}$/.test(body.accent) ? body.accent : '#3b5998',
            mood: String(body.mood || 'online').slice(0, 24),
            status: String(body.status || '').slice(0, 140),
            headline: String(body.headline || '').slice(0, 140),
            region: String(body.region || '').slice(0, 60),
            pronouns: String(body.pronouns || '').slice(0, 24),
            values: String(body.values || '').slice(0, 200),
            interests: String(body.interests || '').slice(0, 200),
            bio: String(body.bio || '').slice(0, 2000),
            seeded: false,
          })
          .returning()

        const token = await createSession(member.id)
        return Response.json(
          { member: publicMember(member) },
          { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } },
        )
      },
    },
  },
})
