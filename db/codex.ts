import { desc, eq, inArray } from 'drizzle-orm'
import { db } from './index.js'
import { characters, characterSatellites, punkRecords, trainingSignals } from './schema.js'
import {
  CANON_NODES,
  CORE_NODE,
  METRICS,
  OPERATOR_NODES,
  SATELLITES,
  buildDossier,
  buildSatellitePrompt,
  readSync,
  satelliteMeta,
  type Dossier,
  type DossierSummary,
  type NodeReading,
  type RecordEntry,
  type SpawnedNode,
  type SyncReading,
} from '../src/lib/satellites.js'

// Server-side reads for the Character Codex.
//
// Two shapes, one derivation. `loadCodexReading` is the full entry behind an
// opened Codex; `loadDossierBatch` is the compact face a grid of advanced cards
// needs, so /discover and /ask can show real levels and real stats for eight
// characters in one request instead of eight.
//
// Neither caches. Levels, metrics, drift and badges are all recomputed from the
// satellite rows and the Punk Records ledger every time, which is what keeps a
// card's dossier identical to the reading inside the Codex it opens.

const KNOWN_NODES: Set<string> = new Set(SATELLITES.map((s) => s.id))

/** Satellite rows → the spawned-node list the pure model expects. */
function toSpawned(rows: (typeof characterSatellites.$inferSelect)[]): SpawnedNode[] {
  return rows
    .filter((r) => KNOWN_NODES.has(r.node) && r.node !== CORE_NODE)
    .map((r) => ({
      node: r.node,
      status: (r.status as SpawnedNode['status']) || 'online',
      syncWithheld: r.syncWithheld,
      personaOverride: r.personaOverride,
      lastSyncAt: r.lastSyncAt,
    }))
}

/** Punk Records rows → the ledger entries the pure model expects. */
function toEntries(rows: (typeof punkRecords.$inferSelect)[]): RecordEntry[] {
  return rows.map((r) => ({
    node: r.node,
    kind: (r.kind as RecordEntry['kind']) || 'reverse_action',
    targetNode: r.targetNode,
    title: r.title,
    weight: r.weight,
    sourceRef: r.sourceRef,
    createdAt: r.createdAt,
  }))
}

function derive(
  character: typeof characters.$inferSelect,
  satRows: (typeof characterSatellites.$inferSelect)[],
  recordRows: (typeof punkRecords.$inferSelect)[],
  trainingWeight: number,
): { sync: SyncReading; dossier: Dossier } {
  const seed = `${character.id}:${character.name}`
  const sync = readSync(seed, toSpawned(satRows), toEntries(recordRows))
  const dossier = buildDossier(
    {
      characterId: character.id,
      name: character.name,
      persona: character.persona,
      totalChats: character.totalChats,
      trainingWeight,
    },
    sync,
  )
  return { sync, dossier }
}

/** The whole Codex entry for one character. Returns null when the id is unknown. */
export async function loadCodexReading(id: number, now: Date) {
  const [character] = await db.select().from(characters).where(eq(characters.id, id))
  if (!character) return null

  const [satRows, recordRows, signals] = await Promise.all([
    db.select().from(characterSatellites).where(eq(characterSatellites.characterId, id)),
    db
      .select()
      .from(punkRecords)
      .where(eq(punkRecords.characterId, id))
      .orderBy(desc(punkRecords.createdAt))
      .limit(120),
    db.select().from(trainingSignals).where(eq(trainingSignals.characterId, id)),
  ])

  const trainingWeight = signals.filter((s) => s.applied).reduce((sum, s) => sum + (s.weight || 1), 0)
  const { sync, dossier } = derive(character, satRows, recordRows, trainingWeight)

  return {
    character: {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      tagline: character.tagline,
      description: character.description,
      persona: character.persona,
      greeting: character.greeting,
      category: character.category,
      totalChats: character.totalChats,
      twinId: character.twinId,
      createdAt: character.createdAt,
    },
    dossier,
    sync,
    // Newest first. Sealed entries are shown rather than hidden — the Codex
    // documents the hub's flaws, it does not paper over them.
    records: recordRows.slice(0, 40).map((r) => ({
      id: r.id,
      node: r.node,
      nodeName: satelliteMeta(r.node).name,
      kind: r.kind,
      targetNode: r.targetNode,
      targetName: r.targetNode ? satelliteMeta(r.targetNode).name : null,
      title: r.title,
      knowledge: r.knowledge,
      sourceRef: r.sourceRef,
      weight: r.weight,
      sealed: r.sealed,
      createdAt: r.createdAt,
    })),
    // The model travels with the read so every surface renders one source of
    // truth instead of a hand-copied roster that drifts from the code.
    model: {
      metrics: METRICS,
      satellites: SATELLITES,
      canon: CANON_NODES,
      operator: OPERATOR_NODES,
      core: CORE_NODE,
    },
    now: now.toISOString(),
  }
}

export type CodexReading = NonNullable<Awaited<ReturnType<typeof loadCodexReading>>>

/**
 * Compact dossiers for a grid of cards, in three queries regardless of how many
 * characters are asked for. Ids with no character are simply absent from the
 * result — a caller rendering a grid should fall back to the plain card.
 */
export async function loadDossierBatch(ids: number[]): Promise<Record<number, DossierSummary>> {
  const wanted = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60)
  if (wanted.length === 0) return {}

  const [rows, satRows, recordRows, signals] = await Promise.all([
    db.select().from(characters).where(inArray(characters.id, wanted)),
    db.select().from(characterSatellites).where(inArray(characterSatellites.characterId, wanted)),
    db.select().from(punkRecords).where(inArray(punkRecords.characterId, wanted)),
    db.select().from(trainingSignals).where(inArray(trainingSignals.characterId, wanted)),
  ])

  const group = <T extends { characterId: number | null }>(list: T[]) => {
    const map = new Map<number, T[]>()
    for (const item of list) {
      if (item.characterId == null) continue
      const bucket = map.get(item.characterId)
      if (bucket) bucket.push(item)
      else map.set(item.characterId, [item])
    }
    return map
  }

  const satsBy = group(satRows)
  const recordsBy = group(recordRows)
  const signalsBy = group(signals)

  const out: Record<number, DossierSummary> = {}
  for (const character of rows) {
    const trainingWeight = (signalsBy.get(character.id) || [])
      .filter((s) => s.applied)
      .reduce((sum, s) => sum + (s.weight || 1), 0)
    const { sync, dossier } = derive(
      character,
      satsBy.get(character.id) || [],
      recordsBy.get(character.id) || [],
      trainingWeight,
    )

    out[character.id] = {
      id: character.id,
      level: dossier.level,
      levelLabel: dossier.levelLabel,
      progress: dossier.progress,
      stats: dossier.stats,
      badges: dossier.badges,
      shared: sync.shared,
      reverseActions: sync.reverseActions,
      mirrors: sync.mirrors,
      integrity: sync.integrity,
      coordinator: sync.coordinator,
      warnings: sync.warnings.length,
      nodes: sync.nodes
        .filter((n) => n.spawned && n.satellite.id !== CORE_NODE && n.status !== 'dormant')
        .map((n) => ({
          node: n.satellite.id,
          name: n.satellite.name,
          designation: n.satellite.designation,
          color: n.satellite.color,
          status: n.status,
          dominant: n.satellite.dominant,
          overridden: n.overridden,
          driftPct: n.driftPct,
        })),
    }
  }
  return out
}

/* ─────────────────────────────────────────── speaking as a satellite */

export type SatelliteVoice = {
  node: string
  name: string
  designation: string
  dominant: string
  status: NodeReading['status']
  driftPct: number
  /** The system prompt this node speaks with — same knowledge, different temperament. */
  prompt: string
}

/**
 * Load one satellite's voice, ready to hand to the model.
 *
 * This is where the split stops being a diagram and starts being an inference
 * path. The knowledge is the character's own — the same Punk Records every other
 * node reads — and only the temperament is overridden, which is the entire claim
 * the Codex makes about cloning. A node that has not been spawned has no voice,
 * so this returns null rather than inventing one.
 */
export async function loadSatelliteVoice(
  characterId: number,
  node: string,
): Promise<SatelliteVoice | null> {
  if (!KNOWN_NODES.has(node)) return null

  const [character] = await db.select().from(characters).where(eq(characters.id, characterId))
  if (!character) return null

  const [satRows, recordRows] = await Promise.all([
    db.select().from(characterSatellites).where(eq(characterSatellites.characterId, characterId)),
    db
      .select()
      .from(punkRecords)
      .where(eq(punkRecords.characterId, characterId))
      .orderBy(desc(punkRecords.createdAt))
      .limit(120),
  ])

  const entries = toEntries(recordRows)
  const sync = readSync(`${character.id}:${character.name}`, toSpawned(satRows), entries)
  const reading = sync.nodes.find((n) => n.satellite.id === node)

  // Stella is always available: it is the original body, not a split, so it has
  // no row to spawn. Every other node must have been split off first.
  if (!reading || (node !== CORE_NODE && !reading.spawned)) return null
  if (reading.status === 'dormant') return null

  return {
    node,
    name: reading.satellite.name,
    designation: reading.satellite.designation,
    dominant: reading.satellite.dominant,
    status: reading.status,
    driftPct: reading.driftPct,
    prompt: buildSatellitePrompt(character, reading, entries),
  }
}

/**
 * File a reverse action from work a node just did.
 *
 * The Codex's reverse-action loop only closed by hand before this: a node could
 * do the work and the shared mind would never hear about it. Now a satellite
 * turn hands its own knowledge back up automatically, which is what makes the
 * record grow from use rather than from bookkeeping.
 *
 * Fire-and-forget by design — a failed filing must never cost the user a reply.
 */
export async function fileReverseAction(input: {
  characterId: number
  sessionId?: string
  node: string
  title: string
  knowledge?: string
  sourceRef?: string | null
  weight?: number
}): Promise<void> {
  if (!KNOWN_NODES.has(input.node)) return
  const title = input.title.trim().slice(0, 240)
  if (!title) return

  await db.insert(punkRecords).values({
    characterId: input.characterId,
    sessionId: input.sessionId ?? '',
    node: input.node,
    kind: 'reverse_action',
    title,
    knowledge: (input.knowledge ?? '').slice(0, 4000),
    sourceRef: input.sourceRef ? input.sourceRef.slice(0, 240) : null,
    weight: Math.max(1, Math.min(5, input.weight ?? 1)),
  })
}
