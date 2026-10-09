import { createFileRoute } from '@tanstack/react-router'
import { eq, and, or, desc, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import { socialMembers, socialComments, socialFriendships, socialAdoptions, characters } from '../../db/schema.js'
import { ensureSeeded } from '../lib/social-seed.js'
import { normalizeHandle, getMember } from '../lib/social-auth.js'
import { sanitizeCss } from '../lib/social-css.js'

export const Route = createFileRoute('/api/social/profile/$handle')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        await ensureSeeded()
        const handle = normalizeHandle(params.handle)

        const [member] = await db.select().from(socialMembers).where(eq(socialMembers.handle, handle))
        if (!member) return Response.json({ error: 'Not found' }, { status: 404 })

        // Who is looking? Owners and accepted friends can always see a private profile.
        const viewer = await getMember(request)
        const isOwner = viewer?.id === member.id
        let isFriend = false
        if (viewer && !isOwner) {
          const [f] = await db
            .select({ id: socialFriendships.id })
            .from(socialFriendships)
            .where(and(
              eq(socialFriendships.status, 'accepted'),
              or(
                and(eq(socialFriendships.requesterId, viewer.id), eq(socialFriendships.addresseeId, member.id)),
                and(eq(socialFriendships.requesterId, member.id), eq(socialFriendships.addresseeId, viewer.id)),
              ),
            ))
          isFriend = !!f
        }

        // A private profile shows only a locked stub to strangers.
        if (member.isPrivate && !isOwner && !isFriend) {
          return Response.json({
            private: true,
            member: { id: member.id, handle: member.handle, displayName: member.displayName, accent: member.accent, mood: member.mood },
          })
        }

        // Count this visit (only once it's actually viewable).
        await db
          .update(socialMembers)
          .set({ profileViews: sql`${socialMembers.profileViews} + 1` })
          .where(eq(socialMembers.id, member.id))

        // Accepted friends (either direction).
        const friendRows = await db
          .select({
            id: socialMembers.id,
            handle: socialMembers.handle,
            displayName: socialMembers.displayName,
            accent: socialMembers.accent,
            mood: socialMembers.mood,
          })
          .from(socialFriendships)
          .innerJoin(
            socialMembers,
            or(
              and(eq(socialFriendships.requesterId, member.id), eq(socialMembers.id, socialFriendships.addresseeId)),
              and(eq(socialFriendships.addresseeId, member.id), eq(socialMembers.id, socialFriendships.requesterId)),
            ),
          )
          .where(and(eq(socialFriendships.status, 'accepted'), or(eq(socialFriendships.requesterId, member.id), eq(socialFriendships.addresseeId, member.id))))

        // Wall comments, newest first, with author identity.
        const author = alias(socialMembers, 'author')
        const comments = await db
          .select({
            id: socialComments.id,
            body: socialComments.body,
            createdAt: socialComments.createdAt,
            authorHandle: author.handle,
            authorName: author.displayName,
            authorAccent: author.accent,
          })
          .from(socialComments)
          .innerJoin(author, eq(socialComments.authorId, author.id))
          .where(eq(socialComments.profileId, member.id))
          .orderBy(desc(socialComments.createdAt))
          .limit(100)

        // "My Characters" — the member's adopted-character roster (a public
        // showcase; chatting with them stays owner-only).
        const adoptions = await db
          .select({ id: characters.id, name: characters.name, avatar: characters.avatar, tagline: characters.tagline, category: characters.category })
          .from(socialAdoptions)
          .innerJoin(characters, eq(socialAdoptions.characterId, characters.id))
          .where(eq(socialAdoptions.memberId, member.id))
          .orderBy(desc(socialAdoptions.createdAt))

        const { passwordHash: _omit, email: _email, ...pub } = member
        return Response.json({
          member: { ...pub, customCss: sanitizeCss(member.customCss), profileViews: member.profileViews + 1 },
          friends: friendRows,
          comments,
          adoptions,
          isOwner,
        })
      },
    },
  },
})
