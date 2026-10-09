import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { missions, characters } from '../../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { DEFAULT_WORKSPACE, planMission, sanitizeMissionInput } from '../lib/controltower.js'

// Missions — the Autonomous Workforce roster.
//
//   GET  /api/missions?workspace=   → the workspace's missions, newest first,
//                                      each joined to its operating character.
//   POST /api/missions               → create a mission. The workflow plan is
//                                      computed server-side from the objective
//                                      (planMission) so a fresh mission already
//                                      knows its capability steps.

async function listMissions(workspaceId: string) {
  return db
    .select({
      mission: missions,
      characterName: characters.name,
      characterAvatar: characters.avatar,
    })
    .from(missions)
    .leftJoin(characters, eq(missions.characterId, characters.id))
    .where(eq(missions.workspaceId, workspaceId))
    .orderBy(desc(missions.createdAt))
}

export const Route = createFileRoute('/api/missions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        const rows = await listMissions(workspaceId)
        const list = rows.map((r) => ({
          ...r.mission,
          characterName: r.characterName,
          characterAvatar: r.characterAvatar,
        }))
        return Response.json({ missions: list })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const workspaceId = String(body?.workspaceId || DEFAULT_WORKSPACE).slice(0, 60)
        const clean = sanitizeMissionInput(body)
        if (!clean.ok) return Response.json({ error: clean.error }, { status: 400 })

        // If a character was named, make sure it exists before assigning it.
        let characterId = clean.value.characterId
        if (characterId) {
          const [char] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId))
          if (!char) characterId = null
        }

        const steps = planMission(clean.value.objective)

        const [created] = await db
          .insert(missions)
          .values({
            workspaceId,
            characterId,
            title: clean.value.title,
            objective: clean.value.objective,
            channel: clean.value.channel,
            autonomy: clean.value.autonomy,
            clearance: clean.value.clearance,
            contextRefs: clean.value.contextRefs,
            steps,
            status: 'draft',
            progress: 0,
          })
          .returning()

        return Response.json({ mission: created }, { status: 201 })
      },
    },
  },
})
