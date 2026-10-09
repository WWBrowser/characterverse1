import { createFileRoute } from '@tanstack/react-router'
import { eq, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tabverseForks } from '../../db/schema.js'
import { TAB_BY_ID } from '../lib/tabverse.js'

// A mirror = one enterprise fork of the TabVerse base.
export const Route = createFileRoute('/api/tabverse/forks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const session = (url.searchParams.get('session') || '').trim()
        const rows = session
          ? await db.select().from(tabverseForks).where(eq(tabverseForks.creatorSession, session)).orderBy(desc(tabverseForks.createdAt))
          : await db.select().from(tabverseForks).orderBy(desc(tabverseForks.createdAt)).limit(50)
        return Response.json(rows)
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Bad request' }, { status: 400 })

        const name = String(body.name || '').trim().slice(0, 80)
        const org = String(body.org || '').trim().slice(0, 80)
        // Keep only known tab ids; a mirror can only fork services that exist.
        const tabs = Array.isArray(body.tabs) ? [...new Set(body.tabs.filter((t: unknown) => typeof t === 'string' && TAB_BY_ID[t]))] : []
        const mode = body.mode === 'freedom' ? 'freedom' : 'deterministic'

        if (!name) return Response.json({ error: 'Name your mirror.' }, { status: 400 })
        if (tabs.length === 0) return Response.json({ error: 'Fork at least one tab-service.' }, { status: 400 })

        const [fork] = await db
          .insert(tabverseForks)
          .values({ name, org, tabs, mode, creatorSession: String(body.session || '').slice(0, 120) })
          .returning()
        return Response.json(fork, { status: 201 })
      },
    },
  },
})
