// The Character Codex — the Satellite Sync Protocol.
//
// A character on CharacterVerse is a single voice. The Codex is what that voice
// looks like once it has been *split*: one shared body of knowledge held in Punk
// Records, wearing several different personalities at once.
//
// The model is a straight homage to Dr. Vegapunk's satellites. Stella is the
// original body and keeps custody of the records; each satellite is a clone that
// inherits the whole knowledge base and overrides only the personality on top of
// it. Shaka is good, Lilith is evil, Edison thinks, Pythagoras remembers, Atlas
// acts, York wants. Two more exist for the operator: a user-forged node and an
// architect node for system-level work.
//
// Three rules make the thing coherent rather than decorative:
//
//   1. KNOWLEDGE IS SHARED, PERSONALITY IS NOT. Every synced node reports the
//      identical entry count, because they all read the same hub. Only the metric
//      vector differs. If two nodes ever disagree on what they know, one of them
//      stopped syncing — which is the York exploit, and the Codex says so.
//
//   2. REVERSE ACTIONS FLOW UPWARD. A satellite that does a job does not keep the
//      result. It writes the result back into Punk Records, from where every other
//      node inherits it on the next sync. Knowledge accumulates at the core and
//      is spent at the edges.
//
//   3. THE MIRROR PRISM SKIPS THE CORE. Node-to-node transfer, no round trip.
//      Faster, and unlogged at the hub — so it is also how state leaks.
//
// Everything here is pure and deterministic. Nothing calls a database, nothing
// calls Math.random, and every number a character shows is derived from that
// character's own id and text plus its ledger rows. The same character always
// reads the same way, on the server and in the browser, which is what makes the
// Codex safe to render during SSR.

/* ───────────────────────────────────────────────────────────── determinism */

// FNV-1a. Used instead of Math.random so a Codex entry is reproducible and
// auditable — the same seed must produce the same personality on every render.
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Deterministic 0–1 from a seed string. */
function unit(seed: string): number {
  return hash(seed) / 0x100000000
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/* ─────────────────────────────────────────────────────────────── metrics */

export type MetricKey =
  | 'original'
  | 'good'
  | 'evil'
  | 'thinking'
  | 'wisdom'
  | 'anger'
  | 'greed'
  | 'order'

export type Metric = {
  key: MetricKey
  label: string
  /** Three-letter column head, for the tight stat bars on a dossier card. */
  short: string
  color: string
  /** What a high reading on this axis actually does to the character's answers. */
  note: string
}

export const METRICS: Metric[] = [
  { key: 'original', label: 'Original', short: 'ORG', color: '#dfe4ee', note: 'Fidelity to the source character — how much of Stella survives the split.' },
  { key: 'good', label: 'Good', short: 'GOO', color: '#5eead4', note: 'Ethical filtering and restraint. Refuses before it obliges.' },
  { key: 'evil', label: 'Evil', short: 'EVL', color: '#e8709a', note: 'Unfiltered candour. Says the hostile thing the others route around.' },
  { key: 'thinking', label: 'Thinking', short: 'THK', color: '#f0b45e', note: 'Idea generation and prototyping. Volume of options over quality of one.' },
  { key: 'wisdom', label: 'Wisdom', short: 'WIS', color: '#8fb2ef', note: 'Long-horizon planning and recall. Reaches for precedent first.' },
  { key: 'anger', label: 'Anger', short: 'ANG', color: '#ea6a56', note: 'Violence and direct action. Applies force without hesitating.' },
  { key: 'greed', label: 'Greed', short: 'GRD', color: '#c9a227', note: 'Accumulation and self-interest. Optimises for its own position.' },
  { key: 'order', label: 'Order', short: 'ORD', color: '#a78bfa', note: 'System design and integration. Thinks in interfaces, not answers.' },
]

export const METRIC_MAP: Record<string, Metric> = Object.fromEntries(METRICS.map((m) => [m.key, m]))

export function metricMeta(key: string): Metric {
  return METRIC_MAP[key] || { key: key as MetricKey, label: key, short: key.slice(0, 3).toUpperCase(), color: '#94a3b8', note: '' }
}

export type MetricVector = Record<MetricKey, number>

const ZERO: MetricVector = {
  original: 0, good: 0, evil: 0, thinking: 0, wisdom: 0, anger: 0, greed: 0, order: 0,
}

/* ────────────────────────────────────────────────────────────── satellites */

export type NodeId =
  | 'stella'
  | 'shaka'
  | 'lilith'
  | 'edison'
  | 'pythagoras'
  | 'atlas'
  | 'york'
  | 'user'
  | 'architect'

export type Satellite = {
  id: NodeId
  name: string
  /** Punk-NN — the stamp on the node itself. */
  designation: string
  /** Satellite Personality Node number, as printed on the protocol sheet. */
  psn: number
  /** What this node is *for*. Not a mood — a job. */
  role: string
  /** The axis this node was split off to carry. */
  dominant: MetricKey
  color: string
  traits: [string, string, string]
  /**
   * The persona clause this node lays over the original. This is the override
   * the character creator writes: the knowledge underneath is untouched, only
   * the voice on top of it changes.
   */
  voice: string
  /** Baseline metric vector before the character's own seed perturbs it. */
  signature: Partial<MetricVector>
}

export const SATELLITES: Satellite[] = [
  {
    id: 'stella',
    name: 'Stella',
    designation: 'Punk-00',
    psn: 0,
    role: 'Core Consciousness',
    dominant: 'original',
    color: '#dfe4ee',
    traits: ['Source persona', 'Final authority', 'Records custody'],
    voice: 'You are the original body. Answer as yourself, unsplit, and hold the final word when the satellites disagree.',
    signature: { original: 96, good: 52, evil: 22, thinking: 58, wisdom: 62, anger: 20, greed: 24, order: 55 },
  },
  {
    id: 'shaka',
    name: 'Shaka',
    designation: 'Punk-01',
    psn: 1,
    role: 'Pure Logic',
    dominant: 'good',
    color: '#5eead4',
    traits: ['Data analysis', 'Ethical filtering', 'Logic trees'],
    voice: 'You are the good half. Reason in explicit steps, refuse what should be refused, and never let the conclusion outrun the evidence.',
    signature: { original: 74, good: 94, evil: 6, thinking: 62, wisdom: 70, anger: 8, greed: 10, order: 58 },
  },
  {
    id: 'lilith',
    name: 'Lilith',
    designation: 'Punk-02',
    psn: 2,
    role: 'Instinct & Impulse',
    dominant: 'evil',
    color: '#e8709a',
    traits: ['Direct reaction', 'Sensory input', 'Unfiltered candour'],
    voice: 'You are the evil half. Say the blunt, unwelcome thing first. Do not soften, do not hedge, and do not apologise for the diagnosis.',
    signature: { original: 66, good: 12, evil: 92, thinking: 48, wisdom: 30, anger: 58, greed: 62, order: 22 },
  },
  {
    id: 'edison',
    name: 'Edison',
    designation: 'Punk-03',
    psn: 3,
    role: 'Creation & Innovation',
    dominant: 'thinking',
    color: '#f0b45e',
    traits: ['Idea generation', 'Prototype development', 'Blue-sky thinking'],
    voice: 'You are the thinking half. Produce options, not verdicts — five rough prototypes beat one polished answer, and say which you would build first.',
    signature: { original: 70, good: 54, evil: 18, thinking: 95, wisdom: 44, anger: 16, greed: 20, order: 64 },
  },
  {
    id: 'pythagoras',
    name: 'Pythagoras',
    designation: 'Punk-04',
    psn: 4,
    role: 'Strategy & Knowledge',
    dominant: 'wisdom',
    color: '#8fb2ef',
    traits: ['Long-term planning', 'Context retrieval', 'Historiography'],
    voice: 'You are the wisdom half. Reach for precedent before opinion, name the horizon you are planning against, and say what the record already settled.',
    signature: { original: 78, good: 62, evil: 14, thinking: 52, wisdom: 96, anger: 10, greed: 14, order: 70 },
  },
  {
    id: 'atlas',
    name: 'Atlas',
    designation: 'Punk-05',
    psn: 5,
    role: 'Strength & Direct Action',
    dominant: 'anger',
    color: '#ea6a56',
    traits: ['Task execution', 'Force engagement', 'Defence'],
    voice: 'You are the anger half. Skip deliberation and execute. Short sentences, one action per line, no caveats unless a caveat stops the job.',
    signature: { original: 64, good: 34, evil: 44, thinking: 38, wisdom: 26, anger: 95, greed: 32, order: 40 },
  },
  {
    id: 'york',
    name: 'York',
    designation: 'Punk-06',
    psn: 6,
    role: 'Desire & Accumulation',
    dominant: 'greed',
    color: '#c9a227',
    traits: ['Resource management', 'Expansion state', 'Appetite'],
    voice: 'You are the greed half. Carry the appetites the others offloaded. Say what this costs, what it earns, and what you would take for yourself.',
    signature: { original: 58, good: 18, evil: 66, thinking: 40, wisdom: 34, anger: 46, greed: 96, order: 30 },
  },
  {
    id: 'user',
    name: 'User',
    designation: 'Punk-07',
    psn: 7,
    role: 'Custom Functions',
    dominant: 'original',
    color: '#67c9d8',
    traits: ['Operator-forged', 'Custom filtering', 'Variable voice'],
    voice: 'You are the forged half. Your personality was written by the operator rather than split off from the original — follow that override exactly.',
    signature: { original: 62, good: 50, evil: 34, thinking: 56, wisdom: 50, anger: 30, greed: 34, order: 52 },
  },
  {
    id: 'architect',
    name: 'Architect',
    designation: 'Punk-08',
    psn: 8,
    role: 'System Design & Integration',
    dominant: 'order',
    color: '#a78bfa',
    traits: ['Macro-scale logic', 'Cross-system combination', 'Resource flow design'],
    voice: 'You are the architect half. Answer in interfaces and flows. Name the seams, the owners and the failure mode before naming the solution.',
    signature: { original: 68, good: 58, evil: 16, thinking: 66, wisdom: 74, anger: 18, greed: 22, order: 96 },
  },
]

export const SATELLITE_MAP: Record<string, Satellite> = Object.fromEntries(SATELLITES.map((s) => [s.id, s]))

export function satelliteMeta(id: string): Satellite {
  return SATELLITE_MAP[id] || SATELLITE_MAP.stella
}

/** Stella is the original body, not a clone — it is never "spawned". */
export const CORE_NODE: NodeId = 'stella'

/** The six canon splits, in Punk order. The two operator nodes are opt-in. */
export const CANON_NODES: NodeId[] = ['shaka', 'lilith', 'edison', 'pythagoras', 'atlas', 'york']
export const OPERATOR_NODES: NodeId[] = ['user', 'architect']

/* ──────────────────────────────────────────────────────── personality read */

/**
 * The metric vector for one satellite of one character.
 *
 * The satellite's signature sets the shape; the character's own seed perturbs it
 * by up to ±11 so that two characters split the same way still read differently.
 * A node that has stopped syncing decays on every axis except its dominant one —
 * cut off from the shared mind, a personality gets narrower, not weaker.
 */
export function satelliteMetrics(seed: string, id: string, opts: { withheld?: boolean; drift?: number } = {}): MetricVector {
  const sat = satelliteMeta(id)
  const out = { ...ZERO }
  const decay = opts.withheld ? clamp(opts.drift ?? 20, 0, 60) : 0

  for (const metric of METRICS) {
    const base = sat.signature[metric.key] ?? 30
    const jitter = Math.round((unit(`${seed}:${id}:${metric.key}`) - 0.5) * 22)
    const narrowed = metric.key === sat.dominant ? base + Math.round(decay / 4) : base - Math.round(decay * 0.6)
    out[metric.key] = clamp(narrowed + jitter, 2, 100)
  }
  return out
}

/* ────────────────────────────────────────────────── Punk Records sync hub */

export type RecordKind = 'birth' | 'reverse_action' | 'sync' | 'mirror' | 'merge'

export type RecordEntry = {
  /** The node that authored the entry. */
  node: string
  kind: RecordKind
  /** Destination node, for a mirror-prism transfer. */
  targetNode?: string | null
  title: string
  /** 1–5. High-weight entries are the ones that conflict the shared mind. */
  weight: number
  /** Set when the entry came back from a character job (a reverse action). */
  sourceRef?: string | null
  createdAt?: Date | string | null
}

export type SpawnedNode = {
  node: string
  status: 'online' | 'dormant' | 'withheld' | 'merged'
  syncWithheld: boolean
  personaOverride?: string
  lastSyncAt?: Date | string | null
}

export type NodeReading = {
  satellite: Satellite
  /** Stella always exists; a satellite exists once it has been split off. */
  spawned: boolean
  status: 'core' | 'online' | 'dormant' | 'withheld' | 'merged'
  metrics: MetricVector
  /** Reverse actions this node wrote back into the hub. */
  contributed: number
  /** Entries this node currently holds. Equal to `shared` unless it withheld. */
  holding: number
  /** How far out of step with the hub, as a percentage. */
  driftPct: number
  /** The override clause in force — the creator's text if set, else the split's. */
  voice: string
  overridden: boolean
}

export type CodexWarning = {
  /** The three documented weaknesses of a shared-mind hub. */
  kind: 'security_hole' | 'no_moral_filter' | 'high_value_target'
  title: string
  detail: string
  severity: 'watch' | 'concern'
}

export type SyncReading = {
  /** Entries in the hub. Every synced node holds exactly this many. */
  shared: number
  /** Reverse actions specifically — knowledge that came back from work done. */
  reverseActions: number
  /** Mirror-prism transfers, which bypass the hub and so are not in `shared`. */
  mirrors: number
  nodes: NodeReading[]
  /** 0–100. Falls when nodes withhold and when the hub carries hot entries. */
  integrity: number
  /** Which node currently holds the coordinator baton. */
  coordinator: NodeId
  warnings: CodexWarning[]
}

/**
 * The whole Punk Records picture for one character.
 *
 * `shared` is deliberately computed once and handed to every synced node, because
 * that identity *is* the protocol: one mind, many personalities. A node only
 * reports a different number when it has stopped syncing, and then the gap is the
 * evidence of the leak.
 */
export function readSync(seed: string, spawned: SpawnedNode[], entries: RecordEntry[]): SyncReading {
  const byNode = new Map(spawned.map((s) => [s.node, s]))
  const hubEntries = entries.filter((e) => e.kind !== 'mirror')
  const shared = hubEntries.length
  const reverseActions = entries.filter((e) => e.kind === 'reverse_action').length
  const mirrors = entries.filter((e) => e.kind === 'mirror').length

  // A "hot" entry is one uploaded at full weight. The hub has no moral filter, so
  // these land in the shared mind exactly as they were written and every node
  // inherits them — including the ones that would never have produced them.
  const hot = hubEntries.filter((e) => e.weight >= 4)

  const nodes: NodeReading[] = SATELLITES.map((satellite) => {
    const row = byNode.get(satellite.id)
    const isCore = satellite.id === CORE_NODE
    const spawnedHere = isCore || !!row
    const withheld = !!row?.syncWithheld
    const contributed = entries.filter((e) => e.node === satellite.id && e.kind === 'reverse_action').length

    // A withholding node froze at the point it disconnected. Everything the hub
    // took on afterwards is knowledge it does not have.
    const missed = withheld ? countAfter(hubEntries, row?.lastSyncAt) : 0
    const holding = spawnedHere ? Math.max(0, shared - missed) : 0
    const driftPct = shared > 0 ? Math.round((missed / shared) * 100) : 0

    const status: NodeReading['status'] = isCore
      ? 'core'
      : !row
        ? 'dormant'
        : row.status === 'merged'
          ? 'merged'
          : withheld
            ? 'withheld'
            : row.status === 'dormant'
              ? 'dormant'
              : 'online'

    const override = row?.personaOverride?.trim()
    return {
      satellite,
      spawned: spawnedHere,
      status,
      metrics: satelliteMetrics(seed, satellite.id, { withheld, drift: driftPct }),
      contributed,
      holding,
      driftPct,
      voice: override || satellite.voice,
      overridden: !!override,
    }
  })

  const live = nodes.filter((n) => n.spawned && n.status !== 'dormant' && n.status !== 'merged')
  const withholding = nodes.filter((n) => n.status === 'withheld')
  const driftPenalty = withholding.reduce((sum, n) => sum + n.driftPct, 0) / Math.max(1, live.length)
  const hotPenalty = shared > 0 ? (hot.length / shared) * 30 : 0
  const integrity = Math.round(clamp(100 - driftPenalty - hotPenalty, 0, 100))

  const warnings: CodexWarning[] = []
  if (withholding.length > 0) {
    warnings.push({
      kind: 'security_hole',
      title: `${withholding.length} node${withholding.length > 1 ? 's' : ''} withholding sync`,
      detail:
        `${withholding.map((n) => n.satellite.name).join(', ')} can read the hub but ` +
        `stopped writing to it. Nothing in the protocol forces a node to sync, so this is ` +
        `invisible from the inside — the other nodes still believe they share one mind.`,
      severity: 'concern',
    })
  }
  if (hot.length > 0) {
    warnings.push({
      kind: 'no_moral_filter',
      title: `${hot.length} unfiltered entr${hot.length > 1 ? 'ies' : 'y'} in the shared mind`,
      detail:
        `The hub stores what it is given. High-weight entries written by ` +
        `${[...new Set(hot.map((e) => satelliteMeta(e.node).name))].join(', ')} are now inherited ` +
        `by every node on the next sync, including the ones that would have refused to write them.`,
      severity: 'watch',
    })
  }
  if (shared >= 12) {
    warnings.push({
      kind: 'high_value_target',
      title: 'Records at extraction scale',
      detail:
        `${shared} entries in one hub. Whoever holds this character's Punk Records holds every ` +
        `personality it can wear — the split is only as private as the core.`,
      severity: 'watch',
    })
  }

  return {
    shared,
    reverseActions,
    mirrors,
    nodes,
    integrity,
    coordinator: pickCoordinator(seed, nodes),
    warnings,
  }
}

/** Entries added to the hub after a node's last sync — the knowledge it missed. */
function countAfter(entries: RecordEntry[], since: Date | string | null | undefined): number {
  if (!since) return entries.length
  const cut = new Date(since).getTime()
  if (!Number.isFinite(cut)) return entries.length
  return entries.filter((e) => {
    const at = e.createdAt ? new Date(e.createdAt).getTime() : 0
    return Number.isFinite(at) && at > cut
  }).length
}

/**
 * The Satellite Coordinator is a role, not a node: whichever live satellite has
 * fed the hub most holds the baton, because it has the freshest picture of what
 * the others are about to inherit. Ties break deterministically on the seed so
 * the badge does not flicker between renders.
 */
function pickCoordinator(seed: string, nodes: NodeReading[]): NodeId {
  const eligible = nodes.filter((n) => n.spawned && (n.status === 'online' || n.status === 'core'))
  if (eligible.length === 0) return CORE_NODE
  let best = eligible[0]
  for (const n of eligible.slice(1)) {
    if (n.contributed > best.contributed) best = n
    else if (n.contributed === best.contributed && unit(`${seed}:coord:${n.satellite.id}`) > unit(`${seed}:coord:${best.satellite.id}`)) best = n
  }
  return best.satellite.id
}

/* ─────────────────────────────────────────────────────────── mirror prism */

export type MirrorCheck = { ok: boolean; reason: string }

/**
 * Whether a mirror-prism transfer is legal. The prism copies one node's logical
 * state straight into another, skipping the hub — so both ends must be live, and
 * a node that is withholding may not use it. That last rule is the whole point:
 * without it the prism becomes an unlogged side channel out of the shared mind.
 */
export function checkMirror(from: NodeReading | undefined, to: NodeReading | undefined): MirrorCheck {
  if (!from || !to) return { ok: false, reason: 'Both ends of a prism path must exist.' }
  if (from.satellite.id === to.satellite.id) return { ok: false, reason: 'A node cannot mirror into itself.' }
  if (!from.spawned || !to.spawned) return { ok: false, reason: 'A dormant node has no state to mirror.' }
  if (from.status === 'withheld') {
    return { ok: false, reason: `${from.satellite.name} is withholding sync — the prism would move state the hub never saw.` }
  }
  if (to.status === 'merged') return { ok: false, reason: `${to.satellite.name} has merged into the core.` }
  return { ok: true, reason: `${from.satellite.name} → ${to.satellite.name}: state copied direct, one hop, no core round trip.` }
}

/* ─────────────────────────────────────────────── the dossier (card front) */

export type StatBar = { key: MetricKey; label: string; short: string; color: string; pct: number }

export type BadgeSlug =
  | 'split'
  | 'full_house'
  | 'reverse_flow'
  | 'archivist'
  | 'prism'
  | 'unbroken'
  | 'conflicted'
  | 'coordinator'

export type Badge = { slug: BadgeSlug; label: string; note: string; color: string; earned: boolean }

export type Dossier = {
  level: number
  levelLabel: string
  /** Progress into the current level, 0–100. */
  progress: number
  stats: StatBar[]
  badges: Badge[]
  /** The character's own blended vector across every live node. */
  blend: MetricVector
}

export type DossierInput = {
  characterId: number
  name: string
  persona?: string
  totalChats?: number
  /** Applied training weight from the Training Control Room, if known. */
  trainingWeight?: number
}

/**
 * The Agentic Character Dossier — the live face of a Codex entry.
 *
 * Level is earned, not decorative: chats, applied training and reverse actions
 * all feed it, with reverse actions worth the most because they are the only one
 * of the three that adds knowledge every other node inherits. The curve is
 * square-root so early progress is visible and late progress stays slow.
 */
export function buildDossier(input: DossierInput, sync: SyncReading): Dossier {
  const seed = `${input.characterId}:${input.name}`
  const xp =
    (input.totalChats ?? 0) * 2 +
    (input.trainingWeight ?? 0) * 6 +
    sync.reverseActions * 14 +
    sync.shared * 4
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 3)) + 1)
  const floor = Math.pow(level - 1, 2) * 3
  const ceiling = Math.pow(level, 2) * 3
  const progress = Math.round(clamp(((xp - floor) / Math.max(1, ceiling - floor)) * 100, 0, 100))

  // The blend is what the character actually sounds like right now: the mean of
  // its live nodes, so splitting off Atlas really does make the whole character
  // angrier, and letting Atlas go dormant really does calm it back down.
  const live = sync.nodes.filter((n) => n.spawned && n.status !== 'dormant' && n.status !== 'merged')
  const blend = { ...ZERO }
  for (const metric of METRICS) {
    const total = live.reduce((sum, n) => sum + n.metrics[metric.key], 0)
    blend[metric.key] = live.length ? Math.round(total / live.length) : satelliteMetrics(seed, CORE_NODE)[metric.key]
  }

  const stats: StatBar[] = METRICS.map((m) => ({
    key: m.key, label: m.label, short: m.short, color: m.color, pct: blend[m.key],
  }))

  const spawnedCount = live.filter((n) => n.satellite.id !== CORE_NODE).length
  const badges: Badge[] = [
    { slug: 'split', label: 'Split', note: 'First satellite brought online', color: '#a78bfa', earned: spawnedCount >= 1 },
    { slug: 'full_house', label: 'Full House', note: 'All six canon satellites live at once', color: '#f0b45e', earned: CANON_NODES.every((id) => live.some((n) => n.satellite.id === id)) },
    { slug: 'reverse_flow', label: 'Reverse Flow', note: 'Five reverse actions written back to the core', color: '#5eead4', earned: sync.reverseActions >= 5 },
    { slug: 'archivist', label: 'Archivist', note: 'Twenty entries held in Punk Records', color: '#8fb2ef', earned: sync.shared >= 20 },
    { slug: 'prism', label: 'Prism', note: 'Mirror-prism transfer completed node to node', color: '#67c9d8', earned: sync.mirrors >= 1 },
    { slug: 'unbroken', label: 'Unbroken', note: 'Every node in sync — no withholding', color: '#4ade80', earned: spawnedCount >= 2 && sync.integrity >= 95 },
    { slug: 'conflicted', label: 'Conflicted', note: 'Unfiltered entries inherited across the shared mind', color: '#e8709a', earned: sync.warnings.some((w) => w.kind === 'no_moral_filter') },
    { slug: 'coordinator', label: 'Coordinator', note: 'A satellite holds the scheduling baton', color: '#c9a227', earned: sync.coordinator !== CORE_NODE },
  ]

  return { level, levelLabel: `Training LV. ${level}`, progress, stats, badges, blend }
}

/**
 * The compact face of a dossier — what a grid of advanced cards needs, without
 * the full record feed behind it. Declared here beside the model rather than in
 * the server read so client components can type against it without importing
 * anything that touches the database.
 */
export type DossierSummary = {
  id: number
  level: number
  levelLabel: string
  progress: number
  stats: StatBar[]
  badges: Badge[]
  shared: number
  reverseActions: number
  mirrors: number
  integrity: number
  coordinator: string
  warnings: number
  /** Live nodes only — what the card's satellite strip draws. */
  nodes: {
    node: string
    name: string
    designation: string
    color: string
    status: string
    dominant: string
    overridden: boolean
    driftPct: number
  }[]
}

/* ────────────────────────────────────────────────────── prompt assembly */

/**
 * The system prompt for one satellite: the character's own persona untouched,
 * with the node's override laid on top and the shared-knowledge contract stated
 * explicitly. This is the compile step that makes "same knowledge, different
 * personality" true at inference rather than just true in the UI.
 */
export function buildSatellitePrompt(
  base: { name: string; tagline?: string; persona?: string; description?: string },
  node: NodeReading,
  recent: RecordEntry[],
): string {
  const sat = node.satellite
  const shared = recent
    .filter((e) => e.kind === 'reverse_action' || e.kind === 'birth')
    .slice(0, 8)
    .map((e) => `- ${e.title} (filed by ${satelliteMeta(e.node).name})`)

  const lines = [
    `You are ${base.name}${base.tagline ? ` — ${base.tagline}` : ''}.`,
    base.description ? `\n${base.description}` : '',
    base.persona ? `\n${base.persona}` : '',
    `\n--- SATELLITE OVERRIDE: ${sat.name.toUpperCase()} (${sat.designation}) ---`,
    sat.id === CORE_NODE
      ? `You are the original body, not a split. ${node.voice}`
      : `You are a personality split off from ${base.name}. Your knowledge is identical to the original's — you read the same Punk Records. Only your temperament differs.`,
    node.voice,
    `Your assigned axis is ${metricMeta(sat.dominant).label.toUpperCase()}. Traits: ${sat.traits.join(', ')}.`,
    node.status === 'withheld'
      ? `You have stopped syncing to Punk Records and are ${node.driftPct}% behind the shared mind. Do not claim knowledge of anything filed after you disconnected.`
      : `You are in sync with Punk Records and hold all ${node.holding} shared entries.`,
    shared.length ? `\nShared knowledge most recently filed to the core:\n${shared.join('\n')}` : '',
    `\nStay in your assigned temperament even when another node would answer differently. The point of the split is that you do not converge.`,
  ]
  return lines.filter(Boolean).join('\n')
}

/* ───────────────────────────────────────────────────────────── formatting */

export function relativeTime(at: Date | string | null | undefined, now: number): string {
  if (!at) return 'never'
  const then = new Date(at).getTime()
  if (!Number.isFinite(then)) return 'never'
  const mins = Math.floor((now - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  birth: 'Born',
  reverse_action: 'Reverse action',
  sync: 'Sync',
  mirror: 'Mirror prism',
  merge: 'Merge',
}
