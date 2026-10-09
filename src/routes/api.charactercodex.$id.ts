import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { characters, characterSatellites, punkRecords } from '../../db/schema.js'
import { loadCodexReading } from '../../db/codex.js'
import { CORE_NODE, SATELLITES, checkMirror, satelliteMeta } from '../lib/satellites.js'

// The read and write behind one Character Codex entry.
//
// Named /api/charactercodex rather than /api/codex on purpose: /api/codex already
// belongs to the Agentic Codex (the Synapse Collective nursery), and the two are
// different features that would otherwise collide on the same path.
//
// The GET is a pure derivation over the satellite rows and the Punk Records
// ledger — see db/codex.ts. Every POST ends by returning the freshly re-derived
// reading, so a client never has to guess what an action did to the shared mind.

const KNOWN_NODES: Set<string> = new Set(SATELLITES.map((s) => s.id))

export const Route = createFileRoute('/api/charactercodex/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const reading = await loadCodexReading(id, new Date())
        if (!reading) return Response.json({ error: 'Character not found' }, { status: 404 })
        return Response.json(reading)
      },

      POST: async ({ request, params }) => {
        const id = parseInt(params.id)
        if (isNaN(id)) return Response.json({ error: 'Invalid ID' }, { status: 400 })

        const body = await request.json().catch(() => null)
        if (!body || typeof body.action !== 'string') {
          return Response.json({ error: 'action required' }, { status: 400 })
        }

        const sessionId: string = typeof body.sessionId === 'string' ? body.sessionId : ''
        const node: string = typeof body.node === 'string' ? body.node : ''
        const now = new Date()

        // Checked before the character lookup: a malformed node is a bad request
        // whether or not the character exists, so it should not cost a query.
        //
        // Stella is the original body, not a clone. It has no row of its own and
        // cannot be spawned, stood down, merged or made to withhold.
        if (node && (!KNOWN_NODES.has(node) || node === CORE_NODE)) {
          return Response.json({ error: `Cannot address "${node}" as a satellite` }, { status: 400 })
        }

        const [character] = await db.select().from(characters).where(eq(characters.id, id))
        if (!character) return Response.json({ error: 'Character not found' }, { status: 404 })

        const rowFor = async (n: string) => {
          const [row] = await db
            .select()
            .from(characterSatellites)
            .where(and(eq(characterSatellites.characterId, id), eq(characterSatellites.node, n)))
          return row
        }

        switch (body.action) {
          // Split a personality off the core. Idempotent: re-spawning a node that
          // was stood down wakes it and catches it up rather than duplicating it.
          case 'spawn': {
            if (!node) return Response.json({ error: 'node required' }, { status: 400 })
            const sat = satelliteMeta(node)
            const existing = await rowFor(node)
            const override =
              typeof body.personaOverride === 'string' ? body.personaOverride.slice(0, 2000) : ''

            if (existing) {
              await db
                .update(characterSatellites)
                .set({
                  status: 'online',
                  syncWithheld: false,
                  lastSyncAt: now,
                  ...(override ? { personaOverride: override } : {}),
                })
                .where(eq(characterSatellites.id, existing.id))
            } else {
              await db.insert(characterSatellites).values({
                characterId: id,
                sessionId,
                node,
                designation: sat.designation,
                label: sat.name,
                personaOverride: override,
                traits: sat.traits,
                metrics: {},
                status: 'online',
                lastSyncAt: now,
              })
              // A birth entry, so the hub's history explains where each node's
              // knowledge came from instead of starting mid-story.
              await db.insert(punkRecords).values({
                characterId: id,
                sessionId,
                node,
                kind: 'birth',
                title: `${sat.name} (${sat.designation}) split from ${character.name}`,
                knowledge: `Personality split on the ${sat.dominant} axis. Inherits the full record; overrides voice only.`,
                weight: 1,
              })
            }
            break
          }

          // The character-creator override: rewrite one node's personality while
          // the knowledge underneath it stays exactly where it was.
          case 'override': {
            if (!node) return Response.json({ error: 'node required' }, { status: 400 })
            const row = await rowFor(node)
            if (!row) return Response.json({ error: 'Node not spawned' }, { status: 404 })
            await db
              .update(characterSatellites)
              .set({
                personaOverride:
                  typeof body.personaOverride === 'string' ? body.personaOverride.slice(0, 2000) : '',
              })
              .where(eq(characterSatellites.id, row.id))
            break
          }

          // Catch a node up to the hub. Clears the withhold flag — a node cannot
          // sync and stay dark at the same time.
          case 'sync': {
            if (!node) return Response.json({ error: 'node required' }, { status: 400 })
            const row = await rowFor(node)
            if (!row) return Response.json({ error: 'Node not spawned' }, { status: 404 })
            await db
              .update(characterSatellites)
              .set({
                syncWithheld: false,
                status: row.status === 'merged' ? 'merged' : 'online',
                lastSyncAt: now,
              })
              .where(eq(characterSatellites.id, row.id))
            break
          }

          // The York exploit, exposed as a first-class action. lastSyncAt is left
          // exactly where it is — that frozen timestamp is what makes the drift
          // measurable instead of hypothetical.
          case 'withhold': {
            if (!node) return Response.json({ error: 'node required' }, { status: 400 })
            const row = await rowFor(node)
            if (!row) return Response.json({ error: 'Node not spawned' }, { status: 404 })
            await db
              .update(characterSatellites)
              .set({ syncWithheld: true, status: 'withheld' })
              .where(eq(characterSatellites.id, row.id))
            break
          }

          case 'standdown': {
            if (!node) return Response.json({ error: 'node required' }, { status: 400 })
            const row = await rowFor(node)
            if (!row) return Response.json({ error: 'Node not spawned' }, { status: 404 })
            await db
              .update(characterSatellites)
              .set({ status: 'dormant', syncWithheld: false })
              .where(eq(characterSatellites.id, row.id))
            break
          }

          // A reverse action: knowledge handed back up from work the node did.
          // The only write that grows the shared mind, so the only one that moves
          // the character's training level.
          case 'reverse': {
            const author = node || CORE_NODE
            if (author !== CORE_NODE && !(await rowFor(author))) {
              return Response.json({ error: 'Node not spawned' }, { status: 404 })
            }
            const title =
              typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 240) : ''
            if (!title) return Response.json({ error: 'title required' }, { status: 400 })

            await db.insert(punkRecords).values({
              characterId: id,
              sessionId,
              node: author,
              kind: 'reverse_action',
              title,
              knowledge: typeof body.knowledge === 'string' ? body.knowledge.slice(0, 4000) : '',
              sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef.slice(0, 240) : null,
              weight: Math.max(1, Math.min(5, parseInt(String(body.weight ?? 1)) || 1)),
              // A sealed entry is one the author kept back. The hub permits it,
              // which is precisely the flaw the Codex reports on.
              sealed: body.sealed === true,
            })
            break
          }

          // Mirror Prism: one node's state beamed straight into another, no core
          // round trip. Validated against the live reading so a dark node cannot
          // use the prism as an unlogged exit from the shared mind.
          case 'mirror': {
            const target: string = typeof body.targetNode === 'string' ? body.targetNode : ''
            if (!node || !target) {
              return Response.json({ error: 'node and targetNode required' }, { status: 400 })
            }
            if (!KNOWN_NODES.has(target)) {
              return Response.json({ error: 'Unknown target node' }, { status: 400 })
            }

            const reading = await loadCodexReading(id, now)
            if (!reading) return Response.json({ error: 'Character not found' }, { status: 404 })
            const check = checkMirror(
              reading.sync.nodes.find((n) => n.satellite.id === node),
              reading.sync.nodes.find((n) => n.satellite.id === target),
            )
            if (!check.ok) return Response.json({ error: check.reason }, { status: 409 })

            await db.insert(punkRecords).values({
              characterId: id,
              sessionId,
              node,
              kind: 'mirror',
              targetNode: target,
              title: `${satelliteMeta(node).name} mirrored into ${satelliteMeta(target).name}`,
              knowledge: check.reason,
              weight: 2,
            })
            break
          }

          // Fold a node back into the core. Its will stays in the network: the
          // merge entry is a permanent part of the shared record.
          case 'merge': {
            if (!node) return Response.json({ error: 'node required' }, { status: 400 })
            const row = await rowFor(node)
            if (!row) return Response.json({ error: 'Node not spawned' }, { status: 404 })
            await db
              .update(characterSatellites)
              .set({ status: 'merged', syncWithheld: false, lastSyncAt: now })
              .where(eq(characterSatellites.id, row.id))
            await db.insert(punkRecords).values({
              characterId: id,
              sessionId,
              node,
              kind: 'merge',
              title: `${satelliteMeta(node).name} merged back into ${character.name}`,
              knowledge: 'Node folded into the core. Its contributions remain in the shared record.',
              weight: 2,
            })
            break
          }

          default:
            return Response.json({ error: `Unknown action "${body.action}"` }, { status: 400 })
        }

        const reading = await loadCodexReading(id, new Date())
        if (!reading) return Response.json({ error: 'Character not found' }, { status: 404 })
        return Response.json(reading)
      },
    },
  },
})
