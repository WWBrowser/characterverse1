import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { bounties, bountyFeedback, characters, trainingSignals } from '../../db/schema.js'
import { and, eq, desc } from 'drizzle-orm'
import { FEEDBACK_CATEGORIES } from '../lib/training.js'

// A single Character Testing Bounty.
//
//   GET  /api/bounties/$id  → the bounty, its character, all feedback and ROI
//   POST /api/bounties/$id   with { action }:
//        submitFeedback  a tester submits feedback (capped at the tester limit)
//        accept          the creator accepts feedback, awarding its CC to the tester
//        toTraining      convert accepted feedback into a training signal
//                        (Test → Train) — creates a real-time signal on the character
//        close           close the bounty to new submissions
//
// "Creator ROI" is the bounty's CC outlay (sum of awarded CC) shown against the
// character's improvement; the leaderboard tracks the earnings side separately.

const CATEGORY_SUBWEIGHT = new Map(FEEDBACK_CATEGORIES.map((c) => [c.slug, c.subWeight]))

async function loadBounty(id: number) {
  const [bounty] = await db.select().from(bounties).where(eq(bounties.id, id))
  if (!bounty) return null
  const [character] = await db.select().from(characters).where(eq(characters.id, bounty.characterId))
  const feedback = await db
    .select()
    .from(bountyFeedback)
    .where(eq(bountyFeedback.bountyId, id))
    .orderBy(desc(bountyFeedback.createdAt))

  const testers = new Set(feedback.map((f) => f.testerSession || `fb${f.id}`))
  const accepted = feedback.filter((f) => f.status !== 'pending')
  const spentCc = accepted.reduce((s, f) => s + (f.awardedCc || 0), 0)
  const avgRating = feedback.length
    ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length
    : 0

  return {
    bounty,
    character: character
      ? { id: character.id, name: character.name, avatar: character.avatar, category: character.category, tagline: character.tagline }
      : null,
    feedback,
    stats: {
      feedbackCount: feedback.length,
      testerCount: testers.size,
      acceptedCount: accepted.length,
      appliedCount: feedback.filter((f) => f.status === 'applied').length,
      spentCc,
      avgRating,
      slotsLeft: Math.max(0, bounty.testerLimit - testers.size),
    },
  }
}

export const Route = createFileRoute('/api/bounties/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = Number(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })
        const data = await loadBounty(id)
        if (!data) return Response.json({ error: 'Bounty not found' }, { status: 404 })
        return Response.json(data)
      },

      POST: async ({ request, params }) => {
        const id = Number(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const [bounty] = await db.select().from(bounties).where(eq(bounties.id, id))
        if (!bounty) return Response.json({ error: 'Bounty not found' }, { status: 404 })

        const action = String(body.action || '')

        switch (action) {
          case 'submitFeedback': {
            if (bounty.status !== 'open') {
              return Response.json({ error: 'This bounty is closed' }, { status: 409 })
            }
            const testerSession = String(body.testerSession || '')

            // Enforce the tester limit by distinct tester session.
            const existing = await db
              .select({ tester: bountyFeedback.testerSession })
              .from(bountyFeedback)
              .where(eq(bountyFeedback.bountyId, id))
            const testers = new Set(existing.map((e) => e.tester))
            if (!testers.has(testerSession) && testers.size >= bounty.testerLimit) {
              return Response.json({ error: 'Tester limit reached' }, { status: 409 })
            }

            const rating = Math.max(1, Math.min(5, Math.floor(Number(body.rating) || 3)))
            const category = CATEGORY_SUBWEIGHT.has(String(body.category)) ? String(body.category) : 'general'

            await db.insert(bountyFeedback).values({
              bountyId: id,
              characterId: bounty.characterId,
              testerSession,
              rating,
              category,
              content: String(body.content || '').slice(0, 2000),
              status: 'pending',
              awardedCc: 0,
            })
            break
          }

          case 'accept': {
            const feedbackId = Number(body.feedbackId)
            if (!feedbackId) return Response.json({ error: 'feedbackId is required' }, { status: 400 })
            // Award the bounty's CC to the tester; only ever pay a pending item once.
            await db
              .update(bountyFeedback)
              .set({ status: 'accepted', awardedCc: bounty.rewardCc })
              .where(and(eq(bountyFeedback.id, feedbackId), eq(bountyFeedback.status, 'pending')))
            break
          }

          case 'toTraining': {
            const feedbackId = Number(body.feedbackId)
            if (!feedbackId) return Response.json({ error: 'feedbackId is required' }, { status: 400 })
            const [fb] = await db.select().from(bountyFeedback).where(eq(bountyFeedback.id, feedbackId))
            if (!fb) return Response.json({ error: 'Feedback not found' }, { status: 404 })

            const subWeight = CATEGORY_SUBWEIGHT.get(fb.category) || 'general'
            // Tester feedback enters the control room as a real-time critique
            // signal targeting the relevant sub-weight — strength scales inversely
            // with the rating (harsher ratings train harder).
            const weight = Math.max(1, Math.min(5, 6 - fb.rating))

            await db.insert(trainingSignals).values({
              characterId: bounty.characterId,
              sessionId: bounty.creatorSession,
              kind: 'critique',
              subWeight,
              content: fb.content,
              mode: 'realtime',
              weight,
              applied: true,
              sourceFeedbackId: fb.id,
            })

            // Accept-on-apply if it wasn't already accepted, then mark applied.
            await db
              .update(bountyFeedback)
              .set({
                status: 'applied',
                awardedCc: fb.awardedCc || bounty.rewardCc,
              })
              .where(eq(bountyFeedback.id, feedbackId))
            break
          }

          case 'close': {
            await db.update(bounties).set({ status: 'closed' }).where(eq(bounties.id, id))
            break
          }

          case 'reopen': {
            await db.update(bounties).set({ status: 'open' }).where(eq(bounties.id, id))
            break
          }

          default:
            return Response.json({ error: 'Unknown action' }, { status: 400 })
        }

        const data = await loadBounty(id)
        return Response.json(data)
      },
    },
  },
})
