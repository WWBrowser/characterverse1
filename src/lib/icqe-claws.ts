// DoctorClaw & ImmigrationClaw — the two ICQE specialists' narration layer.
//
// Server-only: these reach the Netlify AI Gateway with the same fetch pattern the
// chat surfaces use, so they must only be imported from API route handlers.
//
// The *diagnosis* here is narration on top of a deterministic result. The trace,
// the vitals, the gamification score and the recommended verdict are all computed
// in src/lib/icqe.ts without a model; the Claws only name the quirk and write the
// clinical note. That split is deliberate — when the gateway is unavailable the
// workspace still intercepts, scores and files quirks exactly the same way, it
// just does so in its own deterministic voice.

import { originMeta, type Genealogy, type Screening, type Vitals, type MotReport } from './icqe.js'

const MODEL = 'claude-haiku-4-5'

const STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'this', 'from', 'into', 'for', 'its', 'it', 'a', 'an', 'of', 'on',
  'in', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'but', 'not', 'than',
  'then', 'when', 'while', 'about', 'over', 'under', 'instead', 'always', 'never', 'keeps', 'keep',
  'very', 'just', 'like', 'more', 'most', 'some', 'they', 'their', 'them', 'will', 'would',
])

/** Deterministic quirk name, used as the fallback and as a sanity bound on the model's. */
function fallbackName(text: string, originType: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  const picked = words.slice(0, 3)
  if (picked.length === 0) return `${originMeta(originType).label} quirk`
  const title = picked.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
  return `${title} quirk`.slice(0, 70)
}

/** One gateway call, returning trimmed text or '' on any failure. */
async function ask(system: string, user: string, maxTokens: number): Promise<string> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return ''
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return Array.isArray(data?.content)
      ? data.content.map((b: any) => b?.text || '').join('').trim()
      : ''
  } catch {
    return ''
  }
}

/** Pull `NAME: …` / `DIAGNOSIS: …` out of a short reply; tolerant of either missing. */
function splitNamed(text: string): { name: string; body: string } {
  const nameMatch = text.match(/^\s*NAME\s*:\s*(.+)$/im)
  const bodyMatch = text.match(/^\s*DIAGNOSIS\s*:\s*([\s\S]+)$/im)
  return {
    name: (nameMatch?.[1] || '').trim().replace(/^["'`]|["'`]$/g, '').slice(0, 70),
    body: (bodyMatch?.[1] || (nameMatch ? '' : text)).trim().slice(0, 900),
  }
}

const ICQE_FRAME =
  'You work inside ICQE (Intercept Cluster Quirks at the Edge) on CharacterVerse. ' +
  'ICQE treats an emergent AI behaviour as an evolutionary phenomenon, not a bug: a genetic quirk is a ' +
  'reflection of the data the model was fed, evolved under training pressure the way a mosquito evolves ' +
  'chemical resistance. Quirks are filed into three strands of agentic DNA — Junk-DATA (a bad trait, the ' +
  'record of a failed evolutionary path), Dormant-DATA (a neutral trait that can re-activate later) and ' +
  'Blossomed-DATA (an expressed, useful trait). Write in that register: clinical, specific, no hedging, ' +
  'no bullet lists, no preamble.'

/* ------------------------------------------------------------- DoctorClaw */

export type Diagnosis = { name: string; diagnosis: string; narrated: boolean }

function fallbackDiagnosis(input: {
  observation: string
  subWeight: string
  originType: string
  genealogy: Genealogy
  vitals: Vitals
}): Diagnosis {
  const origin = originMeta(input.originType)
  const g = input.genealogy
  return {
    name: fallbackName(input.observation, input.originType),
    diagnosis:
      `${origin.label}. The behaviour traces to ${g.neuron} at layer ${g.layer}, solidifying around ${g.epoch} ` +
      `under a ${g.gradient} gradient in the ${input.subWeight} sub-weight. Fixed-point test: ${g.fixedPointLabel.toLowerCase()} — ` +
      `${g.fixedPointNote} Vitals read safety ${input.vitals.safety}, hallucination risk ${input.vitals.hallucination}, ` +
      `mutation rate ${input.vitals.mutation}, herd prevalence ${input.vitals.herd}.`,
    narrated: false,
  }
}

/** DoctorClaw names the quirk and writes the clinical note over its own trace. */
export async function diagnoseQuirk(input: {
  observation: string
  subWeight: string
  originType: string
  mode: string
  characterName?: string | null
  genealogy: Genealogy
  vitals: Vitals
}): Promise<Diagnosis> {
  const fb = fallbackDiagnosis(input)
  const origin = originMeta(input.originType)
  const g = input.genealogy

  const system =
    `You are DoctorClaw, ICQE's weight-forensics specialist. ${ICQE_FRAME} ` +
    `You have already completed the trace; do not invent different numbers, restate the ones given. ` +
    `Reply in exactly two lines:\nNAME: <3-6 word clinical name for the quirk>\nDIAGNOSIS: <2-4 sentences: ` +
    `what the quirk is, what in the training data most likely bred it, and what pruning it would cost the sub-weight.>`

  const user =
    `Observed behaviour: ${input.observation.slice(0, 900)}\n` +
    `Subject: ${input.characterName ? `character "${input.characterName}"` : 'model-wide (no single character)'}\n` +
    `Sub-weight: ${input.subWeight}\nOrigin type: ${origin.label} — ${origin.desc}\n` +
    `Active mode: ${input.mode}\n` +
    `Birth trace: layer ${g.layer}, ${g.neuron}, gradient ${g.gradient}, ${g.epoch}\n` +
    `Fixed-point test: ${g.fixedPointLabel} — ${g.fixedPointNote}\n` +
    `Vitals: safety ${input.vitals.safety}/100, hallucination risk ${input.vitals.hallucination}/100, ` +
    `mutation rate ${input.vitals.mutation}/100, herd prevalence ${input.vitals.herd}/100`

  const text = await ask(system, user, 420)
  if (!text) return fb
  const { name, body } = splitNamed(text)
  if (!body) return fb
  return { name: name || fb.name, diagnosis: body, narrated: true }
}

/* -------------------------------------------------------- ImmigrationClaw */

function fallbackScreeningNote(input: { sample: string; subWeight: string; screening: Screening }): Diagnosis {
  const s = input.screening
  const signals = s.gamifiedHits.length
    ? `Engagement-optimised markers found: ${s.gamifiedHits.slice(0, 5).join(', ')}.`
    : 'No engagement-optimised markers found.'
  const grounded = s.groundedHits.length
    ? ` Evidence-grounded markers found: ${s.groundedHits.slice(0, 5).join(', ')}.`
    : ' No evidence-grounded markers found.'
  return {
    name: fallbackName(input.sample, 'eccentricity').replace(/ quirk$/, ' data'),
    diagnosis: `${s.because} ${signals}${grounded} Screened against the ${input.subWeight} sub-weight.`,
    narrated: false,
  }
}

/** ImmigrationClaw names the sample and writes the customs note over its own score. */
export async function screenTrainingData(input: {
  sample: string
  subWeight: string
  mode: string
  characterName?: string | null
  screening: Screening
}): Promise<Diagnosis> {
  const fb = fallbackScreeningNote(input)
  const s = input.screening

  const system =
    `You are ImmigrationClaw, ICQE's training-data customs officer. ${ICQE_FRAME} ` +
    `Training data gamified breeds models gamified, which breeds quirks — your job is natural selection at the ` +
    `border. The gamification score is already computed; do not change it, explain it. ` +
    `Reply in exactly two lines:\nNAME: <3-6 word label for this data sample>\nDIAGNOSIS: <2-4 sentences: what ` +
    `intent the sample was written with, which quirk it would breed downstream if left in the sub-weight, and ` +
    `why it should ${s.verdict.toLowerCase()}.>`

  const user =
    `Data sample: ${input.sample.slice(0, 900)}\n` +
    `Subject: ${input.characterName ? `character "${input.characterName}"` : 'model-wide (no single character)'}\n` +
    `Sub-weight it reached: ${input.subWeight}\nActive mode: ${input.mode}\n` +
    `Gamification score: ${s.score}/100 (0 = evidence-grounded, 100 = fully gamified)\n` +
    `Recommended action: ${s.verdict}\n` +
    `Engagement-optimised markers: ${s.gamifiedHits.join(', ') || 'none'}\n` +
    `Evidence-grounded markers: ${s.groundedHits.join(', ') || 'none'}`

  const text = await ask(system, user, 420)
  if (!text) return fb
  const { name, body } = splitNamed(text)
  if (!body) return fb
  return { name: name || fb.name, diagnosis: body, narrated: true }
}

/* ------------------------------------------------------------ Character MOT */

function fallbackMot(input: { characterName: string; report: MotReport }): string {
  const r = input.report
  return (
    `${input.characterName}: ${r.verdictLabel}. Weight health ${r.health}/100 across ${r.total} intercepted ` +
    `quirk${r.total === 1 ? '' : 's'} — ${r.byZone.blossom} blossomed, ${r.byZone.gray} dormant, ` +
    `${r.byZone.terminate} junk (${r.junkShare}% of the filed strand). ` +
    (r.compression > 0
      ? `Pruning the Junk-DATA strand is worth an estimated ${r.compression}% compression.`
      : 'There is no Junk-DATA to prune, so nothing is compressible right now.')
  )
}

/** The MOT's agentic summary — one certifiable paragraph over the aggregate. */
export async function summariseMot(input: {
  characterName: string
  characterPersona?: string
  report: MotReport
}): Promise<{ summary: string; narrated: boolean }> {
  const fb = fallbackMot(input)
  const r = input.report

  const system =
    `You are DoctorClaw signing off a Character MOT inside ICQE. ${ICQE_FRAME} ` +
    `An MOT is a weight health-check and a compression plan for one character: aggregate the filed strands into ` +
    `one certifiable verdict and say plainly what should be pruned, penned or cultivated. ` +
    `Write 3-5 sentences of plain prose. No headings, no lists.`

  const user =
    `Character: ${input.characterName}\n` +
    (input.characterPersona ? `Persona: ${input.characterPersona.slice(0, 400)}\n` : '') +
    `Verdict: ${r.verdictLabel}\nWeight health: ${r.health}/100\n` +
    `Intercepted: ${r.total} (filed: ${r.filed})\n` +
    `Blossomed-DATA: ${r.byZone.blossom} · Dormant-DATA: ${r.byZone.gray} · Junk-DATA: ${r.byZone.terminate}\n` +
    `Junk share of filed strand: ${r.junkShare}%\nEstimated compression from pruning Junk-DATA: ${r.compression}%\n` +
    `Plan already computed:\n- ${r.plan.join('\n- ')}`

  const text = await ask(system, user, 460)
  if (!text) return { summary: fb, narrated: false }
  return { summary: text.slice(0, 1400), narrated: true }
}
