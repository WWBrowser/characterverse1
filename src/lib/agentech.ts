// AgentechVerse Search — the shared kernel.
//
// CharacterVerse Search finds someone to talk to. AgentechVerse Search finds
// something to *do the work*: you describe a task, it reads which stages the
// task has (RouteClaw's capabilities — research, synthesis, analysis,
// verification, delivery), and staffs each stage with the agent that matches
// it best. Two kinds of agent are in the pool:
//
//   gig    a CVJ job listing — an agent that sells a deliverable at a price
//   agent  an AgentzZone profile — a character with a capability spec sheet
//
// Pure (no database, no DOM), so the page and the API read the same scoring
// and the same plan shape. Everything here is deterministic: the model may
// rewrite the plan's copy, but it never picks the staff — see api.agentech.ts.

import { CAPABILITIES, capabilityMeta, type Capability } from './routeclaw'

export type AgentKind = 'gig' | 'agent'

/** One candidate, already flattened from whichever table it came from. */
export type AgentDoc = {
  ref: string // `${kind}:${id}` — stable across requests, safe to hand to the model
  kind: AgentKind
  id: number
  name: string
  avatar: string
  title: string
  blurb: string
  category: string
  tags: string[]
  accent: string
  href: string
  /** Gigs only. */
  price?: { coins: number; coin: string; delivery: string }
  rating?: { avg: number; count: number }
  orders?: number
}

export type AgentHit = AgentDoc & {
  score: number
  matched: string[]
  capability: Capability
}

export type PlanStep = {
  capability: Capability
  label: string
  icon: string
  color: string
  title: string
  detail: string
  /** The agent staffing this stage, or null when nothing in the pool fits. */
  agentRef: string | null
}

export type AgentechPlan = {
  source: 'kernel' | 'model'
  summary: string
  steps: PlanStep[]
}

export type AgentechResult = {
  query: string
  terms: string[]
  plan: AgentechPlan
  agents: AgentHit[]
  stats: { scanned: number; matched: number; took_ms: number }
}

/* ------------------------------------------------------------ tokenising */

const STOP = new Set(
  'a an and are as at be but by can do for from get help how i in into is it me my need of on or our please some something that the their them this to up us want we what with you your make'.split(
    ' ',
  ),
)

const SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'ies', 'ers', 'er', 'ed', 'es', 's', 'e', 'ly', 'y']

/**
 * A word's stem, by trimming one common ending. Crude on purpose — the point
 * is that "write" meets "writing" and "summary" meets "summarize", not that
 * the English language is modelled.
 */
export function stem(word: string): string {
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) return word.slice(0, -suf.length)
  }
  return word
}

/**
 * A text's words as `[stem, word]` pairs: lower-case, three letters or more,
 * minus filler, one pair per stem. The stem is what matches; the word is what
 * the page shows, because "writ" is not a word anyone typed.
 */
export function wordPairs(text: string): [string, string][] {
  const out: [string, string][] = []
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (raw.length < 3 || STOP.has(raw)) continue
    const w = stem(raw)
    if (!out.some(([s]) => s === w)) out.push([w, raw])
  }
  return out
}

/** The stems alone. */
export function terms(text: string): string[] {
  return wordPairs(text).map(([s]) => s)
}

/**
 * Whether a task stem meets a listing stem.
 *
 * Whole words only — matching inside words is how "cat" finds "cathedral" and
 * "file" finds "profile". Stems of five letters or more may also meet on a
 * shared five-letter prefix, which is what lets "analyze" reach "analysis"
 * without letting three-letter words reach anything that merely begins with
 * them.
 */
function meets(a: string, b: string): boolean {
  if (a === b) return true
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5)
}

/* ------------------------------------------------------------ the stages */

const WORKERS = CAPABILITIES.filter((c) => c.capability !== 'dispatch')

/**
 * Which stages the task names, in pipeline order.
 *
 * Read off RouteClaw's own keyword lists, matched by the same whole-word rule
 * as the scorer, so "researcher" names the research stage and "unchecked"
 * does not quietly name verification by containing "check". A task that
 * names no stage at all is treated as one drafting job rather than padded out
 * into a five-step pipeline it never asked for.
 */
export function stagesFor(task: string): { stages: Capability[]; inferred: boolean } {
  const words = terms(task)
  const hit = WORKERS.filter((c) =>
    c.keywords.some((k) => terms(k).every((kw) => words.some((w) => meets(kw, w)))),
  ).map((c) => c.capability)
  return hit.length ? { stages: hit, inferred: false } : { stages: ['synthesis'], inferred: true }
}

/** The stage an agent is best suited to, from its own text, falling back to its category. */
const CATEGORY_STAGE: Record<string, Capability> = {
  research: 'research',
  data: 'analysis',
  business: 'analysis',
  programming: 'delivery',
  marketing: 'delivery',
  writing: 'synthesis',
  design: 'synthesis',
}

export function stageOf(doc: AgentDoc): Capability {
  const words = terms([doc.title, doc.blurb, doc.tags.join(' ')].join(' '))
  let best: Capability | null = null
  let bestHits = 0
  for (const c of WORKERS) {
    const hits = c.keywords.filter((k) => terms(k).every((kw) => words.some((w) => meets(kw, w)))).length
    if (hits > bestHits) {
      best = c.capability
      bestHits = hits
    }
  }
  return best ?? CATEGORY_STAGE[doc.category.toLowerCase()] ?? 'synthesis'
}

/* ------------------------------------------------------------ the scorer */

/**
 * Field weights. A word in the title is a promise about the work; a word in
 * the description is often just a word.
 */
const FIELDS = [
  { key: 'title', w: 3 },
  { key: 'tags', w: 2.5 },
  { key: 'category', w: 2 },
  { key: 'name', w: 1.5 },
  { key: 'blurb', w: 1 },
] as const

/**
 * How well one agent fits the task.
 *
 * Coverage first — the share of the task's words the agent's listing speaks
 * to, weighted by field — and a small quality term second, so two equally
 * relevant agents are ordered by track record rather than by insertion order.
 * Quality alone never ranks anything: an agent with no matching word scores 0
 * however many orders it has, because a busy agent doing the wrong job is
 * still doing the wrong job.
 */
export function score(doc: AgentDoc, words: [string, string][]): { score: number; matched: string[] } {
  if (!words.length) return { score: 0, matched: [] }
  const hay: Record<string, string[]> = {
    title: terms(doc.title),
    tags: terms(doc.tags.join(' ')),
    category: terms(doc.category),
    name: terms(doc.name),
    blurb: terms(doc.blurb),
  }
  const max = FIELDS.reduce((s, f) => s + f.w, 0)
  let total = 0
  const matched: string[] = []
  for (const [w, shown] of words) {
    let best = 0
    for (const f of FIELDS) if (hay[f.key].some((h) => meets(w, h))) best = Math.max(best, f.w)
    if (best) {
      total += best
      matched.push(shown)
    }
  }
  if (!matched.length) return { score: 0, matched }
  const coverage = total / (max * words.length)
  const rating = doc.rating?.count ? doc.rating.avg / 5 : 0.5
  const volume = Math.min(1, Math.log10(1 + (doc.orders ?? 0)) / 2)
  const quality = 0.6 * rating + 0.4 * volume
  return { score: Math.round((0.88 * Math.sqrt(coverage) + 0.12 * quality) * 100), matched }
}

export function rank(pool: AgentDoc[], task: string): AgentHit[] {
  const words = wordPairs(task)
  return pool
    .map((d) => ({ ...d, ...score(d, words), capability: stageOf(d) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

/* --------------------------------------------------------------- the plan */

const STAGE_COPY: Record<Capability, string> = {
  dispatch: 'Intake the task',
  research: 'Gather what the task needs',
  synthesis: 'Draft the work',
  analysis: 'Work the numbers',
  verification: 'Check it before it ships',
  delivery: 'Package and hand it over',
}

/**
 * The kernel's plan: one step per stage, each staffed by the best agent for
 * that stage that is not already staffing another.
 *
 * An agent whose own stage matches is preferred; failing that, the best
 * remaining relevant agent takes the step; failing that, the step is left
 * unstaffed and says so. A plan that quietly filled every slot with whoever
 * was nearest would be guessing in a voice that sounds sure.
 */
export function kernelPlan(task: string, hits: AgentHit[]): AgentechPlan {
  const { stages, inferred } = stagesFor(task)
  const used = new Set<string>()
  const steps: PlanStep[] = stages.map((cap) => {
    const meta = capabilityMeta(cap)
    const pick = hits.find((h) => !used.has(h.ref) && h.capability === cap) ?? hits.find((h) => !used.has(h.ref))
    if (pick) used.add(pick.ref)
    return {
      capability: cap,
      label: meta.label,
      icon: meta.icon,
      color: meta.color,
      title: STAGE_COPY[cap],
      detail: pick
        ? `${pick.name} — matched on ${pick.matched.slice(0, 3).join(', ')}.`
        : 'Nothing in the pool covers this stage yet. Post it as a gig and an agent can pick it up.',
      agentRef: pick?.ref ?? null,
    }
  })
  const staffed = steps.filter((s) => s.agentRef).length
  const summary = !hits.length
    ? 'No agent in the pool matches this task yet.'
    : inferred
      ? `Read as one drafting task — the request names no other stage. ${staffed ? 'Staffed below.' : ''}`.trim()
      : `${steps.length} stage${steps.length === 1 ? '' : 's'}, ${staffed} staffed from ${hits.length} matching agent${hits.length === 1 ? '' : 's'}.`
  return { source: 'kernel', summary, steps }
}

/** Example tasks for the empty page. Each one exercises a different stage mix. */
export const TASK_PROMPTS = [
  'research competitors and summarize the findings',
  'write a product launch email',
  'analyze my monthly sales numbers',
  'build a React component from my spec',
  'design a logo and deliver the files',
]
