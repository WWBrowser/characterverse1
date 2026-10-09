import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { spatialScenes } from '../../db/schema.js'
import { countNodes, SDOM_VERSION } from './spatial-dom.js'
import { SEED_SCENES } from './spatial-scenes.js'

// Seeds the three SpatialVerse spaces. Upserted rather than inserted-once, so
// an edit to a seeded space in spatial-scenes.ts reaches the index on the next
// cold start — but only over rows that are still seeds. A published space that
// happens to share a slug is never overwritten by ours.

let seeding: Promise<void> | null = null

export function ensureSpatialSeeded(): Promise<void> {
  if (seeding) return seeding
  seeding = (async () => {
    for (const doc of SEED_SCENES) {
      await db
        .insert(spatialScenes)
        .values({
          slug: doc.slug,
          title: doc.title,
          summary: doc.summary,
          sdomVersion: SDOM_VERSION,
          doc,
          nodeCount: countNodes(doc.root),
          source: 'seed',
        })
        .onConflictDoUpdate({
          target: spatialScenes.slug,
          set: { title: doc.title, summary: doc.summary, doc, nodeCount: countNodes(doc.root), updatedAt: sql`now()` },
          setWhere: eq(spatialScenes.source, 'seed'),
        })
    }
  })().catch((err) => {
    // A failed seed is retried on the next request rather than cached forever.
    seeding = null
    throw err
  })
  return seeding
}
