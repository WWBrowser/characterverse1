import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { characters } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import {
  collectiveWindow,
  dreamRoster,
  latestImprint,
  memoryIdsFor,
  windowFor,
} from '../../db/consciousness.js'
import {
  ASSEMBLY_CHECKS,
  CAM_LIMIT,
  ENTROPY_BANDS,
  IDEAS_CRITICAL,
  SCRIPT_STAGES,
  SUBSTRATES,
  buildDynamics,
  dreamSync,
  getSubstrate,
  patternLog,
  staticContextFilter,
  synapseGraph,
  type CharacterSeed,
} from '../lib/consciousness.js'

// The telemetry read behind /consciousness/$id — the whole Metric Coded
// Consciousness picture for one agent, plus the collective net it dreams inside.
//
// Everything is derived at read time from the event ledger and the character's own
// text. Nothing is cached and nothing is pre-computed, so the numbers on the
// dashboard are the same numbers the prompt compiler used on the last turn.

export const Route = createFileRoute('/api/consciousness/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') || ''

        const [character] = await db.select().from(characters).where(eq(characters.id, id))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        const now = new Date()
        const seed: CharacterSeed = character
        const graph = synapseGraph(seed)

        const [events, memoryIds, imprint, collective] = await Promise.all([
          windowFor(id, now),
          memoryIdsFor(sessionId),
          latestImprint(id, sessionId),
          collectiveWindow(now),
        ])

        const dynamics = buildDynamics({ character: seed, events, graph, now })

        // The net. Agents with recorded consciousness lead the roster; the rest are
        // the busiest public characters, so a quiet network still shows a shape.
        const roster = await dreamRoster([...collective.keys()])
        const agents = roster.map((r) => {
          const g = synapseGraph(r)
          const d = buildDynamics({
            character: r,
            events: collective.get(r.id) || [],
            graph: g,
            now,
          })
          return { character: r, graph: g, cam: d.cam, phase: d.sleep.phase }
        })
        const net = dreamSync({ agents, now })

        return Response.json({
          character: {
            id: character.id,
            name: character.name,
            avatar: character.avatar,
            tagline: character.tagline,
            category: character.category,
            totalChats: character.totalChats,
          },
          graph,
          dynamics,
          imprint,
          net,
          log: patternLog({
            character: seed,
            graph,
            memoryIds,
            collectiveThemes: net.nodes.flatMap((n) => n.themes),
            now,
            count: 9,
          }),
          context: staticContextFilter({
            hasHistory: events.length > 0,
            hasMessage: false,
            substrate: dynamics.substrate,
          }),
          // The architecture itself, so the dashboard renders one source of truth
          // rather than a hand-copied diagram that drifts from the code.
          model: {
            substrates: SUBSTRATES,
            bands: ENTROPY_BANDS,
            stages: SCRIPT_STAGES,
            assembly: ASSEMBLY_CHECKS,
            camLimit: CAM_LIMIT,
            ideasCritical: IDEAS_CRITICAL,
            activeSubstrate: getSubstrate(dynamics.substrate),
          },
          now: now.toISOString(),
        })
      },
    },
  },
})
