import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialMembers } from '../../db/schema.js'
import { getMember, publicMember } from '../lib/social-auth.js'
import { sanitizeCss } from '../lib/social-css.js'

// Who am I? Returns the current member (from the httpOnly session cookie) or null.
// PATCH lets a signed-in member edit their own profile info and page design.
export const Route = createFileRoute('/api/social/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const member = await getMember(request)
        return Response.json({ member: member ? publicMember(member) : null })
      },

      PATCH: async ({ request }) => {
        const member = await getMember(request)
        if (!member) return Response.json({ error: 'Sign in first.' }, { status: 401 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request' }, { status: 400 })

        const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)
        const update = {
          displayName: str(body.displayName, 60),
          accent: /^#[0-9a-fA-F]{6}$/.test(body.accent) ? body.accent : member.accent,
          mood: str(body.mood, 24),
          status: str(body.status, 140),
          headline: str(body.headline, 140),
          region: str(body.region, 60),
          pronouns: str(body.pronouns, 24),
          values: str(body.values, 200),
          interests: str(body.interests, 400),
          bio: str(body.bio, 2000),
          wantToMeet: str(body.wantToMeet, 1000),
          customCss: sanitizeCss(body.customCss),
          isPrivate: !!body.isPrivate,
          agentShadowing: !!body.agentShadowing,
        }

        const [updated] = await db
          .update(socialMembers)
          .set(update)
          .where(eq(socialMembers.id, member.id))
          .returning()

        return Response.json({ member: publicMember(updated) })
      },
    },
  },
})
