import { createFileRoute } from '@tanstack/react-router'
import { getStore } from '@netlify/blobs'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { geneticQuirks, characters, trainingSignals } from '../../db/schema.js'
import { ensureCoinSettings, mintCoins } from '../../db/coins.js'
import { coerceSettings } from '../lib/coins.js'
import {
  DNA_FOLDERS,
  ICQE_ZONES,
  distilPathNote,
  motReport,
  readVitals,
  recommendZone,
  screenSample,
  traceGenealogy,
  verdictSignal,
  zoneMeta,
  type ZoneKey,
} from '../lib/icqe.js'
import { diagnoseQuirk, screenTrainingData, summariseMot } from '../lib/icqe-claws.js'

// ICQE API — Intercept Cluster Quirks at the Edge.
//
//   GET  /api/icqe?workspace=&characterId=
//     → { quirks, counts, folders }  the registry, the spectrum counts, and the
//       three agentic-DNA folders (note-only records).
//   GET  /api/icqe?archive=junk|dormant|blossomed
//     → { records, available }  the same folder read straight out of the Blobs
//       archive-of-record rather than the Postgres index.
//
//   POST /api/icqe
//     { action: 'doctor',      characterId?, subWeight, originType, mode, observation }
//        → DoctorClaw traces the quirk's birth origin, reads its vitals and
//          recommends a verdict. Lands in the registry as 'detected'.
//     { action: 'immigration', characterId?, subWeight, mode, sample }
//        → ImmigrationClaw scores how gamified the training data is and
//          recommends whether to admit, pen or deport it.
//     { action: 'file', id, zone: blossom|gray|terminate|onfile, note? }
//        → files the quirk into its DNA folder as a note-only record, and folds
//          the verdict back into the character's sub-weight training.
//     { action: 'mot', characterId }
//        → the Character MOT: one certifiable verdict plus a compression plan.
//
// Every AI call is best-effort narration over a deterministic result, so the
// workspace behaves identically when the gateway is unavailable.

const DEFAULT_WORKSPACE = 'default'
const ARCHIVE_STORE = 'icqe-dna'

const VALID_ZONES = new Set<string>(ICQE_ZONES.map((z) => z.key))
const VALID_FOLDERS = new Set<string>(DNA_FOLDERS.map((f) => f.key))

function clampText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

async function listQuirks(workspaceId: string, characterId: number | null) {
  const where = characterId
    ? and(eq(geneticQuirks.workspaceId, workspaceId), eq(geneticQuirks.characterId, characterId))
    : eq(geneticQuirks.workspaceId, workspaceId)
  return db.select().from(geneticQuirks).where(where).orderBy(desc(geneticQuirks.id)).limit(200)
}

type QuirkRow = Awaited<ReturnType<typeof listQuirks>>[number]

function buildCounts(rows: QuirkRow[]) {
  const counts = { total: rows.length, detected: 0, blossom: 0, gray: 0, terminate: 0, filed: 0 }
  for (const r of rows) {
    if (r.status === 'detected') counts.detected++
    else if (r.status === 'filed') counts.filed++
    else if (r.status === 'blossom' || r.status === 'gray' || r.status === 'terminate') counts[r.status]++
  }
  return counts
}

// The folder view is built from the Postgres index — the note is stored on the row
// as well as in Blobs, so a folder still reads correctly if the archive write was
// skipped (preview environments, transient storage errors).
function buildFolders(rows: QuirkRow[]) {
  const folders: Record<string, { id: number; name: string; note: string; characterId: number | null; zone: string; agent: string; filedAt: string | null; blobKey: string }[]> = {
    junk: [],
    dormant: [],
    blossomed: [],
  }
  for (const r of rows) {
    if (!r.folder || !VALID_FOLDERS.has(r.folder)) continue
    folders[r.folder].push({
      id: r.id,
      name: r.name,
      note: r.pathNote,
      characterId: r.characterId,
      zone: r.zone,
      agent: r.agent,
      filedAt: r.filedAt ? new Date(r.filedAt).toISOString() : null,
      blobKey: r.blobKey,
    })
  }
  return folders
}

/** Write the note-only record into the DNA archive. Best-effort by design. */
async function archiveNote(input: {
  workspaceId: string
  folder: string
  quirkId: number
  name: string
  zone: string
  note: string
  characterId: number | null
}): Promise<string> {
  const key = `${input.workspaceId}/${input.folder}/${input.quirkId}`
  try {
    // Only the note travels into the folder. Junk-DNA is the record of a failed
    // evolutionary path, not the failed sequence — so the raw observation, the
    // genealogy map, the screened sample and the vitals are all left behind here.
    await getStore(ARCHIVE_STORE).setJSON(key, {
      quirkId: input.quirkId,
      name: input.name,
      zone: input.zone,
      strand: zoneMeta(input.zone).strand,
      folder: input.folder,
      characterId: input.characterId,
      note: input.note,
      filedAt: new Date().toISOString(),
    })
    return key
  } catch {
    return ''
  }
}

export const Route = createFileRoute('/api/icqe')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const archive = url.searchParams.get('archive')

        // Read one DNA folder out of the Blobs archive-of-record.
        if (archive) {
          if (!VALID_FOLDERS.has(archive)) {
            return Response.json({ error: 'Unknown DNA folder' }, { status: 400 })
          }
          try {
            const store = getStore(ARCHIVE_STORE)
            const { blobs } = await store.list({ prefix: `${workspaceId}/${archive}/` })
            const records = (
              await Promise.all(
                blobs.slice(0, 60).map((b) => store.get(b.key, { type: 'json' }).catch(() => null)),
              )
            ).filter(Boolean)
            return Response.json({ records, available: true })
          } catch {
            return Response.json({ records: [], available: false })
          }
        }

        const characterIdParam = Number(url.searchParams.get('characterId'))
        const characterId = Number.isInteger(characterIdParam) && characterIdParam > 0 ? characterIdParam : null

        const rows = await listQuirks(workspaceId, characterId)
        return Response.json({ quirks: rows, counts: buildCounts(rows), folders: buildFolders(rows) })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const action = String(body?.action || '')
        const workspaceId = clampText(body?.workspaceId || DEFAULT_WORKSPACE, 60) || DEFAULT_WORKSPACE
        const sessionId = clampText(body?.sessionId, 120)
        const rawCharacterId = Number(body?.characterId)
        const characterId = Number.isInteger(rawCharacterId) && rawCharacterId > 0 ? rawCharacterId : null

        // The character, when the quirk is pinned to one rather than model-wide.
        let character: { id: number; name: string; avatar: string; persona: string } | null = null
        if (characterId) {
          const [row] = await db
            .select({ id: characters.id, name: characters.name, avatar: characters.avatar, persona: characters.persona })
            .from(characters)
            .where(eq(characters.id, characterId))
          if (!row) return Response.json({ error: 'Character not found' }, { status: 404 })
          character = row
        }

        /* ------------------------------------------------------- DoctorClaw */

        if (action === 'doctor') {
          const observation = clampText(body?.observation, 2000)
          if (!observation) {
            return Response.json({ error: 'Describe the observed quirk first' }, { status: 400 })
          }
          const subWeight = clampText(body?.subWeight, 40) || 'general'
          const originType = clampText(body?.originType, 40) || 'eccentricity'
          const mode = clampText(body?.mode, 40) || 'genealogy'

          const genealogy = traceGenealogy({ observation, subWeight, originType, characterId })
          const vitals = readVitals({ observation, originType, subWeight })
          const recommended = recommendZone({ originType, genealogy, vitals })
          const { name, diagnosis } = await diagnoseQuirk({
            observation,
            subWeight,
            originType,
            mode,
            characterName: character?.name || null,
            genealogy,
            vitals,
          })

          const [created] = await db
            .insert(geneticQuirks)
            .values({
              workspaceId,
              sessionId,
              characterId,
              agent: 'doctor',
              mode,
              name,
              subWeight,
              originType,
              observation,
              diagnosis,
              genealogy,
              vitals,
              gamified: -1,
              recommendation: recommended.zone,
              because: recommended.because,
              status: 'detected',
            })
            .returning()

          return Response.json(created, { status: 201 })
        }

        /* -------------------------------------------------- ImmigrationClaw */

        if (action === 'immigration') {
          const sample = clampText(body?.sample, 2000)
          if (!sample) {
            return Response.json({ error: 'Paste a training-data sample to screen' }, { status: 400 })
          }
          const subWeight = clampText(body?.subWeight, 40) || 'general'
          const mode = clampText(body?.mode, 40) || 'intake_screen'

          const screening = screenSample(sample)
          // Data customs work the origin backwards: a gamified sample is the seed
          // of a reward hack, a clean one the seed of a genuine capability.
          const originType =
            screening.zone === 'terminate'
              ? 'reward_hack'
              : screening.zone === 'blossom'
                ? 'emergent_capability'
                : 'eccentricity'
          const vitals = readVitals({ observation: sample, originType, subWeight })
          const { name, diagnosis } = await screenTrainingData({
            sample,
            subWeight,
            mode,
            characterName: character?.name || null,
            screening,
          })

          const [created] = await db
            .insert(geneticQuirks)
            .values({
              workspaceId,
              sessionId,
              characterId,
              agent: 'immigration',
              mode,
              name,
              subWeight,
              originType,
              observation: sample,
              diagnosis,
              genealogy: {
                gamifiedHits: screening.gamifiedHits,
                groundedHits: screening.groundedHits,
                verdict: screening.verdict,
              },
              vitals,
              gamified: screening.score,
              recommendation: screening.zone,
              because: screening.because,
              status: 'detected',
            })
            .returning()

          return Response.json(created, { status: 201 })
        }

        /* -------------------------------------------- file a verdict / on file */

        if (action === 'file') {
          const id = Number(body?.id)
          if (!Number.isInteger(id) || id <= 0) {
            return Response.json({ error: 'A quirk id is required' }, { status: 400 })
          }
          const [quirk] = await db.select().from(geneticQuirks).where(eq(geneticQuirks.id, id))
          if (!quirk) return Response.json({ error: 'Quirk not found' }, { status: 404 })

          const requested = String(body?.zone || '')
          const providedNote = clampText(body?.note, 600)

          // Kept on file as evolutionary insurance — caught, but deliberately not
          // judged, so no strand is claimed and no training signal is folded in.
          if (requested === 'onfile' || requested === 'filed') {
            const note =
              providedNote ||
              'Kept on file as evolutionary insurance — intercepted but not judged, so the path stays open.'
            const [updated] = await db
              .update(geneticQuirks)
              .set({ status: 'filed', zone: '', folder: '', pathNote: note, blobKey: '', filedAt: new Date() })
              .where(eq(geneticQuirks.id, id))
              .returning()
            return Response.json(updated)
          }

          if (!VALID_ZONES.has(requested)) {
            return Response.json({ error: 'Unknown evolutionary zone' }, { status: 400 })
          }
          const zone = requested as ZoneKey
          const meta = zoneMeta(zone)

          const note =
            providedNote ||
            distilPathNote({
              zone,
              name: quirk.name,
              subWeight: quirk.subWeight,
              originType: quirk.originType,
              agent: quirk.agent === 'immigration' ? 'immigration' : 'doctor',
              fixedPoint: (quirk.genealogy as any)?.fixedPoint,
              gamified: quirk.gamified >= 0 ? quirk.gamified : null,
            })

          const blobKey = await archiveNote({
            workspaceId: quirk.workspaceId,
            folder: meta.folder,
            quirkId: quirk.id,
            name: quirk.name,
            zone,
            note,
            characterId: quirk.characterId,
          })

          // Close the loop: a filed verdict is a real sub-weight training signal,
          // run through the machinery the Training Control Room already uses.
          let signalId: number | null = null
          if (quirk.characterId) {
            const sig = verdictSignal(zone)
            try {
              const [signal] = await db
                .insert(trainingSignals)
                .values({
                  characterId: quirk.characterId,
                  sessionId: sessionId || quirk.sessionId,
                  kind: sig.kind,
                  subWeight: quirk.subWeight,
                  content: `${sig.lead} the ${quirk.subWeight} sub-weight: ${quirk.name || 'intercepted quirk'} — ${note}`,
                  mode: 'realtime',
                  weight: sig.weight,
                  applied: true,
                })
                .returning()
              signalId = signal?.id ?? null

              // An applied signal on a character sub-weight mines Gold (CC), the
              // same as any other real-time training signal.
              ensureCoinSettings(quirk.workspaceId)
                .then((s) =>
                  mintCoins({
                    sessionId: sessionId || quirk.sessionId,
                    characterId: quirk.characterId as number,
                    coin: 'gold',
                    coins: coerceSettings(s).goldRates.character,
                    source: 'character',
                    reason: `ICQE ${meta.label} → ${meta.strand}`,
                    refType: 'training_signal',
                    refId: signalId ?? quirk.id,
                    workspaceId: quirk.workspaceId,
                  }),
                )
                .catch(() => {})
            } catch {
              signalId = null
            }
          }

          const [updated] = await db
            .update(geneticQuirks)
            .set({
              status: zone,
              zone,
              folder: meta.folder,
              pathNote: note,
              blobKey,
              signalId,
              filedAt: new Date(),
            })
            .where(eq(geneticQuirks.id, id))
            .returning()

          return Response.json({ ...updated, archived: Boolean(blobKey), signalId })
        }

        /* ------------------------------------------------------ Character MOT */

        if (action === 'mot') {
          if (!character) return Response.json({ error: 'Pick a character to certify' }, { status: 400 })
          const rows = await listQuirks(workspaceId, character.id)
          const report = motReport(
            rows.map((r) => ({
              status: r.status,
              zone: r.zone,
              subWeight: r.subWeight,
              vitals: (r.vitals as any) || null,
            })),
          )
          const { summary, narrated } = await summariseMot({
            characterName: character.name,
            characterPersona: character.persona,
            report,
          })
          return Response.json({
            character: { id: character.id, name: character.name, avatar: character.avatar },
            report,
            summary,
            narrated,
          })
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 })
      },
    },
  },
})
