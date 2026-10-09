import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { missions, characters, contextEntries } from '../../db/schema.js'
import { eq, inArray } from 'drizzle-orm'
import { sanitizeMissionInput, planMission, stepProgress, type MissionStep } from '../lib/controltower.js'

// A single mission.
//
//   GET    /api/missions/$id   → the mission, its character, and the resolved
//                                Context Engine entries it acts on.
//   PATCH  /api/missions/$id    → edit it. Re-plans the workflow when the
//                                objective changes (only while still in draft, so
//                                a run in progress is never silently reset).
//   DELETE /api/missions/$id    → remove it.

export const Route = createFileRoute('/api/missions/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const [mission] = await db.select().from(missions).where(eq(missions.id, id))
        if (!mission) return Response.json({ error: 'Mission not found' }, { status: 404 })

        let character = null
        if (mission.characterId) {
          const [c] = await db.select().from(characters).where(eq(characters.id, mission.characterId))
          character = c || null
        }

        const refs = Array.isArray(mission.contextRefs) ? (mission.contextRefs as number[]) : []
        const context = refs.length
          ? await db.select().from(contextEntries).where(inArray(contextEntries.id, refs))
          : []

        return Response.json({ mission, character, context })
      },

      PATCH: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const [existing] = await db.select().from(missions).where(eq(missions.id, id))
        if (!existing) return Response.json({ error: 'Mission not found' }, { status: 404 })

        const clean = sanitizeMissionInput(body)
        if (!clean.ok) return Response.json({ error: clean.error }, { status: 400 })

        // Only re-plan a draft whose objective actually changed — never clobber a
        // workflow that has already started running.
        const objectiveChanged = clean.value.objective !== existing.objective
        const rePlan = existing.status === 'draft' && objectiveChanged
        const steps = rePlan ? planMission(clean.value.objective) : (existing.steps as MissionStep[])

        const [updated] = await db
          .update(missions)
          .set({
            characterId: clean.value.characterId,
            title: clean.value.title,
            objective: clean.value.objective,
            channel: clean.value.channel,
            autonomy: clean.value.autonomy,
            clearance: clean.value.clearance,
            contextRefs: clean.value.contextRefs,
            steps,
            progress: stepProgress(steps),
            updatedAt: new Date(),
          })
          .where(eq(missions.id, id))
          .returning()

        return Response.json({ mission: updated })
      },

      DELETE: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        await db.delete(missions).where(eq(missions.id, id))
        return new Response(null, { status: 204 })
      },
    },
  },
})
