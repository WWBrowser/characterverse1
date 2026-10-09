import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { studioMembers, studioModules } from '../../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import {
  DEFAULT_WORKSPACE,
  STUDIO_MODULES,
  ROLES,
  roleMeta,
  normalizeRole,
  coerceSettings,
  coerceLLM,
  defaultSettings,
  defaultLLM,
} from '../lib/studio.js'

// CharacterVerse Studio — the admin operations deck.
//
//   GET  /api/studio?workspace=&sessionId=
//        → { members, modules, me, roles }
//        Lazily seeds the staff hierarchy and the full module registry the first
//        time the Studio is opened (idempotent). If a sessionId is supplied and
//        the Master self-record has no session bound yet, it is claimed for that
//        session so the owner's profile carries Master status.
//
//   POST /api/studio   (action-dispatched, so member and module ids never clash)
//        { action: 'updateModule',  id, patch }
//        { action: 'addMember',     handle, role, note, avatar }
//        { action: 'updateMember',  id, role?, note? }
//        { action: 'removeMember',  id }

async function seedIfEmpty(workspaceId: string) {
  const existingModules = await db
    .select({ id: studioModules.id })
    .from(studioModules)
    .where(eq(studioModules.workspaceId, workspaceId))
    .limit(1)

  if (existingModules.length === 0) {
    await db.insert(studioModules).values(
      STUDIO_MODULES.map((m, i) => ({
        workspaceId,
        moduleKey: m.key,
        label: m.label,
        icon: m.icon,
        groupName: m.group,
        path: m.path,
        enabled: true,
        minRank: m.minRank,
        settings: defaultSettings(),
        llm: defaultLLM(m.llm),
        position: i,
      })),
    )
  }

  const existingMembers = await db
    .select({ id: studioMembers.id })
    .from(studioMembers)
    .where(eq(studioMembers.workspaceId, workspaceId))
    .limit(1)

  if (existingMembers.length === 0) {
    // The owner (Master, "me") plus one illustrative member per status so the
    // hierarchy reads as a populated org chart from the first open.
    await db.insert(studioMembers).values([
      { workspaceId, handle: 'You', role: 'master', isSelf: true, avatar: '👑', note: 'Owner of this CharacterVerse.' },
      { workspaceId, handle: 'op-lead', role: 'master_operator', avatar: '⚙️', note: 'Commands the autonomous workforce.' },
      { workspaceId, handle: 'ops-1', role: 'operator', avatar: '⚙️', note: 'Runs the agentic fleet.' },
      { workspaceId, handle: 'admin-lead', role: 'super_administration', avatar: '🗂️', note: 'Owns platform configuration.' },
      { workspaceId, handle: 'admin-1', role: 'administration', avatar: '🗂️', note: 'Manages members and content.' },
      { workspaceId, handle: 'mod-lead', role: 'chief_moderator', avatar: '🛡️', note: 'Leads the moderation pool.' },
      { workspaceId, handle: 'mod-1', role: 'moderator', avatar: '🛡️', note: 'Front-line moderation.' },
    ])
  }
}

async function loadState(workspaceId: string) {
  const members = await db
    .select()
    .from(studioMembers)
    .where(eq(studioMembers.workspaceId, workspaceId))
    .orderBy(asc(studioMembers.id))

  const modules = await db
    .select()
    .from(studioModules)
    .where(eq(studioModules.workspaceId, workspaceId))
    .orderBy(asc(studioModules.position), asc(studioModules.id))

  return { members, modules }
}

export const Route = createFileRoute('/api/studio')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 120)

        await seedIfEmpty(workspaceId)

        // Bind the owner's session to the Master self-record so their profile
        // carries Master status (only if it hasn't been claimed yet).
        if (sessionId) {
          const [self] = await db
            .select()
            .from(studioMembers)
            .where(and(eq(studioMembers.workspaceId, workspaceId), eq(studioMembers.isSelf, true)))
            .limit(1)
          if (self && !self.sessionId) {
            await db
              .update(studioMembers)
              .set({ sessionId, updatedAt: new Date() })
              .where(eq(studioMembers.id, self.id))
          }
        }

        const { members, modules } = await loadState(workspaceId)
        const me = members.find((m) => m.isSelf) || null

        return Response.json({
          members,
          modules,
          me,
          roles: ROLES,
        })
      },

      POST: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const action = String(body.action || '')

        await seedIfEmpty(workspaceId)

        if (action === 'updateModule') {
          const id = Number(body.id)
          if (!id) return Response.json({ error: 'A module id is required' }, { status: 400 })
          const patch = body.patch || {}
          const set: Record<string, any> = { updatedAt: new Date() }
          if (patch.enabled !== undefined) set.enabled = Boolean(patch.enabled)
          if (patch.minRank !== undefined) {
            const r = Number(patch.minRank)
            // Clamp to a known rank so the gate can never become unreachable.
            set.minRank = ROLES.some((x) => x.rank === r) ? r : 10
          }
          if (patch.settings !== undefined) set.settings = coerceSettings(patch.settings)
          if (patch.llm !== undefined) set.llm = coerceLLM(patch.llm)

          const [row] = await db
            .update(studioModules)
            .set(set)
            .where(and(eq(studioModules.id, id), eq(studioModules.workspaceId, workspaceId)))
            .returning()
          if (!row) return Response.json({ error: 'Module not found' }, { status: 404 })
          return Response.json(row)
        }

        if (action === 'addMember') {
          const handle = String(body.handle || '').trim().slice(0, 60)
          if (!handle) return Response.json({ error: 'A handle is required' }, { status: 400 })
          const role = normalizeRole(body.role)
          // Only the owner holds Master — new members cannot be minted as Master.
          if (role === 'master') {
            return Response.json({ error: 'Master status is reserved for the owner' }, { status: 400 })
          }
          const [row] = await db
            .insert(studioMembers)
            .values({
              workspaceId,
              handle,
              role,
              avatar: String(body.avatar || roleMeta(role).icon).slice(0, 8),
              note: String(body.note || '').slice(0, 280),
            })
            .returning()
          return Response.json(row, { status: 201 })
        }

        if (action === 'updateMember') {
          const id = Number(body.id)
          if (!id) return Response.json({ error: 'A member id is required' }, { status: 400 })
          const [target] = await db
            .select()
            .from(studioMembers)
            .where(and(eq(studioMembers.id, id), eq(studioMembers.workspaceId, workspaceId)))
            .limit(1)
          if (!target) return Response.json({ error: 'Member not found' }, { status: 404 })
          if (target.isSelf) {
            return Response.json({ error: 'The owner (Master) status cannot be changed' }, { status: 400 })
          }
          const set: Record<string, any> = { updatedAt: new Date() }
          if (body.role !== undefined) {
            const role = normalizeRole(body.role)
            if (role === 'master') {
              return Response.json({ error: 'Master status is reserved for the owner' }, { status: 400 })
            }
            set.role = role
          }
          if (body.note !== undefined) set.note = String(body.note).slice(0, 280)
          const [row] = await db.update(studioMembers).set(set).where(eq(studioMembers.id, id)).returning()
          return Response.json(row)
        }

        if (action === 'removeMember') {
          const id = Number(body.id)
          if (!id) return Response.json({ error: 'A member id is required' }, { status: 400 })
          const [target] = await db
            .select()
            .from(studioMembers)
            .where(and(eq(studioMembers.id, id), eq(studioMembers.workspaceId, workspaceId)))
            .limit(1)
          if (!target) return Response.json({ error: 'Member not found' }, { status: 404 })
          if (target.isSelf) return Response.json({ error: 'The owner cannot be removed' }, { status: 400 })
          await db.delete(studioMembers).where(eq(studioMembers.id, id))
          return new Response(null, { status: 204 })
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 })
      },
    },
  },
})
