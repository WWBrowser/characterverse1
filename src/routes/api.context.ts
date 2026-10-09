import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { contextEntries } from '../../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import {
  DEFAULT_WORKSPACE,
  DEFAULT_CONTEXT,
  CONTEXT_KIND_SLUGS,
  sanitizeContextInput,
} from '../lib/controltower.js'

// Context Engine — the shared business context the autonomous workforce acts on.
//
//   GET  /api/context?workspace=&kind=   → the workspace's context entries
//                                           (pinned first, then newest). Seeds a
//                                           starter set the first time it's opened.
//   POST /api/context                     → add a context entry.
//
// Every write is sanitized server-side so unknown kinds or oversized free text
// never reach the store.

async function listContext(workspaceId: string) {
  return db
    .select()
    .from(contextEntries)
    .where(eq(contextEntries.workspaceId, workspaceId))
    .orderBy(desc(contextEntries.pinned), desc(contextEntries.createdAt))
}

export const Route = createFileRoute('/api/context')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const kind = url.searchParams.get('kind') || ''

        let rows = await listContext(workspaceId)

        // Lazily seed demonstrative context the first time this workspace opens
        // the Context Engine. Idempotent — only seeds an empty workspace.
        if (rows.length === 0) {
          await db.insert(contextEntries).values(
            DEFAULT_CONTEXT.map((c) => ({ ...c, workspaceId })),
          )
          rows = await listContext(workspaceId)
        }

        if (kind && (CONTEXT_KIND_SLUGS as readonly string[]).includes(kind)) {
          rows = rows.filter((r) => r.kind === kind)
        }

        return Response.json({ entries: rows })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const workspaceId = String(body?.workspaceId || DEFAULT_WORKSPACE).slice(0, 60)
        const clean = sanitizeContextInput(body)
        if (!clean.ok) return Response.json({ error: clean.error }, { status: 400 })

        const [created] = await db
          .insert(contextEntries)
          .values({ workspaceId, ...clean.value })
          .returning()

        return Response.json({ entry: created }, { status: 201 })
      },
    },
  },
})
