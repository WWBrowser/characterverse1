// The Desk — working-memory accounting for a conversation.
//
// The premise this file implements: an AI's context window is a physical desk.
// Every turn that has ever happened gets stacked back onto it before each reply,
// so the desk fills, the signal-to-noise ratio collapses, and the model starts
// answering from stale paper instead of the question in front of it. That is a
// back-hallucination: not invented data, but *old* data resurfacing as current.
//
// Clearing the desk is the fix. The conversation is committed to a static log
// (nothing is deleted — the cabinet keeps every page), the desk is flushed, and
// the tokens that were being spent re-reading the whole transcript every turn
// come back. What survives the purge is only what was deliberately pinned: an
// anchor. An anchor is a cognitive artifact — a static, definitive statement of
// intent that cannot drift because it is not being rewritten by recall.
//
// The thing this file deliberately does NOT do is raise the fidelity score.
// Forcing a high fidelity number over a polluted desk produces over-correction
// artifacts — inverted hallucinations, the model straining to sound faithful to
// a context it can no longer read. Fidelity here is a *readout*, never a dial;
// see fidelityGuard(), which refuses the boost and prescribes the purge.
//
// Pure and deterministic: no DB, no clock reads, no Math.random. The same
// inputs read the same way on the server and in the browser, which is what lets
// the desk panel render during SSR. Persistence lives in db/desk.ts.

/* ───────────────────────────────────────────────────────────── determinism */

// FNV-1a, the same hash the Codex and Neural Training layers use. The desk
// needs it to colour token squares stably — a square must not change hue
// between the server render and hydration.
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const round1 = (n: number) => Math.round(n * 10) / 10

/* ──────────────────────────────────────────────────────────────── constants */

/** Rough token estimate: ~4 characters per token for English prose. */
export const CHARS_PER_TOKEN = 4

/**
 * How many tokens of transcript the desk holds before it is considered full.
 * Not the model's hard context limit — the *working* limit, past which the
 * oldest paper on the desk is competing with the newest for attention.
 */
export const DESK_BUDGET = 8000

/**
 * Turns within which a message is still "in hand". Beyond this it is on the
 * desk but no longer being looked at, which is exactly the paper that causes
 * back-hallucination when the model reaches for it anyway.
 */
export const WORKING_WINDOW = 12

/** Fidelity lost per turn of unanchored drift. */
export const DRIFT_PER_TURN = 4

/**
 * Fidelity does not decay to zero. A drifting model still holds the shape of
 * the task; what it loses is the *original intent*. The floor is where it
 * plateaus into confident wrongness.
 */
export const FIDELITY_FLOOR = 58

/** Tokens a pinned anchor costs on the desk, per anchor, as a system block. */
export const ANCHOR_OVERHEAD = 24

/* ──────────────────────────────────────────────────────────────────── types */

export type DeskRole = 'user' | 'assistant'

export type DeskMessage = {
  id: number
  role: string
  content: string | null
  createdAt: Date | string | null
}

export type AnchorKind = 'message' | 'art' | 'record' | 'note'

export type DeskAnchor = {
  id: number
  kind: AnchorKind
  label: string
  body: string
  messageId: number | null
  sourceRef: string | null
  active: boolean
  createdAt: Date | string | null
}

export type DeskPurge = {
  id: number
  clearedThroughMessageId: number | null
  messagesFiled: number
  tokensReclaimed: number
  reason: string | null
  createdAt: Date | string | null
}

/** One token square in the two-lane panel. */
export type TokenCell = {
  /** Categorical palette slot 0–3, or -1 for a cabinet (spent) cell. */
  slot: number
  /** True once the cell is beyond the working window — on the desk, unread. */
  stale: boolean
  messageId: number
  role: DeskRole
}

export type DeskLane = {
  key: 'desk' | 'cabinet'
  label: string
  cells: TokenCell[]
  /** Cells the lane holds beyond the ones rendered. */
  overflow: number
  tokens: number
  messages: number
}

export type DeskStat = {
  key: string
  label: string
  value: string
  /** Status role, for the icon + label pairing. Never colour alone. */
  status: 'good' | 'warning' | 'serious' | 'critical' | 'neutral'
  hint: string
}

export type DeskWarning = {
  key: string
  severity: 'warning' | 'serious' | 'critical'
  title: string
  detail: string
}

export type DriftPoint = {
  iteration: number
  fidelity: number
  anchored: boolean
}

export type DeskReading = {
  /** Message id the last purge cleared through; 0 when the desk has never been cleared. */
  epoch: number
  purges: number
  onDesk: DeskMessage[]
  filed: number
  deskTokens: number
  cabinetTokens: number
  anchorTokens: number
  /** Share of DESK_BUDGET in use, 0–100. */
  loadPct: number
  /** Share of DESK_BUDGET still free, 0–100 — what the spec calls BANDWIDTH. */
  bandwidthPct: number
  /** Probability-shaped estimate that the next reply reaches for stale paper. */
  noiseRiskPct: number
  /** Turns since the desk was last anchored or cleared. */
  turnsSinceAnchor: number
  /** 100 − fidelity. A readout, not a target. */
  driftPct: number
  fidelityPct: number
  anchors: DeskAnchor[]
  lanes: DeskLane[]
  stats: DeskStat[]
  warnings: DeskWarning[]
  /** True when clearing the desk would actually reclaim something. */
  clearable: boolean
}

export type ClearDeskPlan = {
  messagesFiled: number
  tokensReclaimed: number
  anchorsKept: number
  bandwidthAfter: number
  noiseAfter: number
  fidelityAfter: number
  clearedThroughMessageId: number
  summary: string
}

/* ─────────────────────────────────────────────────────────────── estimation */

export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function messageTokens(messages: DeskMessage[]): number {
  // +4 per message for the role envelope the API adds around each turn.
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0)
}

export function anchorTokens(anchors: DeskAnchor[]): number {
  return anchors
    .filter((a) => a.active)
    .reduce((sum, a) => sum + estimateTokens(a.label) + estimateTokens(a.body) + ANCHOR_OVERHEAD, 0)
}

const normRole = (role: string): DeskRole => (role === 'assistant' ? 'assistant' : 'user')

/* ────────────────────────────────────────────────────────────────── the read */

/**
 * Split a transcript at the desk epoch and measure both halves.
 *
 * `epoch` is the id the last purge cleared *through* — everything at or below
 * it is in the cabinet, everything above it is on the desk. Derived rather than
 * stored mutably, so replaying the purge log always reproduces the same desk.
 */
export function readDesk(
  messages: DeskMessage[],
  epoch: number,
  anchors: DeskAnchor[] = [],
  purges: DeskPurge[] = [],
): DeskReading {
  const ordered = [...messages].sort((a, b) => a.id - b.id)
  const onDesk = ordered.filter((m) => m.id > epoch && m.content)
  const inCabinet = ordered.filter((m) => m.id <= epoch && m.content)
  const active = anchors.filter((a) => a.active)

  const deskTokens = messageTokens(onDesk)
  const cabinetTokens = messageTokens(inCabinet)
  const anchorCost = anchorTokens(active)

  const loadPct = clamp(Math.round(((deskTokens + anchorCost) / DESK_BUDGET) * 100), 0, 100)
  const bandwidthPct = 100 - loadPct

  // A message is stale once WORKING_WINDOW newer messages sit on top of it.
  const staleCount = Math.max(0, onDesk.length - WORKING_WINDOW)

  // Staleness saturates at a full window's worth of buried paper. Measured as a
  // share of the desk it never could: the newest WORKING_WINDOW turns are always
  // fresh, so the ratio has a ceiling below 1 and the risk could never read 100
  // however bad the desk got. What matters is not the proportion that is buried
  // but whether there is *enough* buried paper to answer with, and one window's
  // worth is enough.
  const stalePct = clamp((staleCount / WORKING_WINDOW) * 100, 0, 100)

  // Noise risk is volume *and* age. A short desk of old paper is as dangerous as
  // a long desk of fresh paper, so both terms contribute — and a full desk with a
  // window of buried paper behind it reads exactly 100.
  const noiseRiskPct = clamp(Math.round(loadPct * 0.7 + stalePct * 0.3), 0, 100)

  // Drift is counted from whichever came later: the purge or the newest anchor.
  // Both are anchoring events — one empties the desk, the other nails a fact to it.
  const lastAnchorId = active.reduce((max, a) => Math.max(max, a.messageId ?? 0), 0)
  const anchoredFrom = Math.max(epoch, lastAnchorId)
  const turnsSinceAnchor = ordered.filter((m) => m.id > anchoredFrom && m.content).length

  const fidelityPct = fidelityAt(turnsSinceAnchor)
  const driftPct = round1(100 - fidelityPct)

  return {
    epoch,
    purges: purges.length,
    onDesk,
    filed: inCabinet.length,
    deskTokens,
    cabinetTokens,
    anchorTokens: anchorCost,
    loadPct,
    bandwidthPct,
    noiseRiskPct,
    turnsSinceAnchor,
    driftPct,
    fidelityPct,
    anchors: active,
    lanes: buildLanes(onDesk, inCabinet, deskTokens, cabinetTokens),
    stats: buildStats(noiseRiskPct, bandwidthPct, driftPct, fidelityPct, deskTokens, active.length),
    warnings: buildWarnings(noiseRiskPct, bandwidthPct, driftPct, onDesk.length, active.length),
    clearable: onDesk.length > 1,
  }
}

/**
 * Fidelity after n unanchored turns. Linear decay to a floor — the model does
 * not forget the task, it forgets the *original* phrasing of the task, and then
 * plateaus into confident approximation.
 */
export function fidelityAt(turns: number): number {
  return round1(clamp(100 - turns * DRIFT_PER_TURN, FIDELITY_FLOOR, 100))
}

/* ─────────────────────────────────────────────────────────────────── lanes */

/** Cells drawn per lane before the rest is summarised as an overflow count. */
const LANE_CELLS = 72

/** One square per ~40 tokens, so a long turn visibly occupies more desk. */
const TOKENS_PER_CELL = 40

function cellsFor(messages: DeskMessage[], cabinet: boolean): TokenCell[] {
  const cells: TokenCell[] = []
  const total = messages.length
  messages.forEach((m, i) => {
    const count = clamp(Math.ceil((estimateTokens(m.content) + 4) / TOKENS_PER_CELL), 1, 12)
    // Stale = beyond the working window counted back from the newest message.
    const stale = !cabinet && total - i > WORKING_WINDOW
    for (let c = 0; c < count; c++) {
      cells.push({
        // Four categorical slots, picked from the message id so the desk keeps
        // the same speckle across renders. Cabinet cells are spent — no hue.
        slot: cabinet ? -1 : hash(`${m.id}:${c}`) % 4,
        stale,
        messageId: m.id,
        role: normRole(m.role),
      })
    }
  })
  return cells
}

function buildLanes(
  onDesk: DeskMessage[],
  inCabinet: DeskMessage[],
  deskTokens: number,
  cabinetTokens: number,
): DeskLane[] {
  const deskCells = cellsFor(onDesk, false)
  const cabinetCells = cellsFor(inCabinet, true)
  return [
    {
      key: 'desk',
      label: 'ACTIVE CONTEXT (DESK)',
      // Newest paper is on top of the pile, so the tail is what we draw.
      cells: deskCells.slice(-LANE_CELLS),
      overflow: Math.max(0, deskCells.length - LANE_CELLS),
      tokens: deskTokens,
      messages: onDesk.length,
    },
    {
      key: 'cabinet',
      label: 'COLD STORAGE (CABINET)',
      cells: cabinetCells.slice(-LANE_CELLS),
      overflow: Math.max(0, cabinetCells.length - LANE_CELLS),
      tokens: cabinetTokens,
      messages: inCabinet.length,
    },
  ]
}

/* ─────────────────────────────────────────────────────────────────── stats */

function noiseStatus(pct: number): DeskStat['status'] {
  if (pct >= 80) return 'critical'
  if (pct >= 55) return 'serious'
  if (pct >= 30) return 'warning'
  return 'good'
}

function bandwidthStatus(pct: number): DeskStat['status'] {
  if (pct <= 10) return 'critical'
  if (pct <= 30) return 'serious'
  if (pct <= 55) return 'warning'
  return 'good'
}

function buildStats(
  noise: number,
  bandwidth: number,
  drift: number,
  fidelity: number,
  deskTokens: number,
  anchors: number,
): DeskStat[] {
  return [
    {
      key: 'noise',
      label: 'NOISE RISK',
      value: `${noise}%`,
      status: noiseStatus(noise),
      hint: 'Chance the next reply reaches for stale paper instead of the question.',
    },
    {
      key: 'bandwidth',
      label: 'BANDWIDTH',
      value: `${bandwidth}%`,
      status: bandwidthStatus(bandwidth),
      hint: `${deskTokens.toLocaleString()} of ${DESK_BUDGET.toLocaleString()} desk tokens spent re-reading the transcript.`,
    },
    {
      key: 'drift',
      label: 'CURRENT DRIFT',
      value: drift.toFixed(2),
      status: drift >= 30 ? 'serious' : drift >= 12 ? 'warning' : 'good',
      hint: 'Distance from the original intent, in fidelity points.',
    },
    {
      key: 'fidelity',
      label: 'FIDELITY SCORE',
      value: `${fidelity.toFixed(1)}%`,
      status: fidelity >= 88 ? 'good' : fidelity >= 70 ? 'warning' : 'serious',
      hint: 'A readout of how close the reply is to what was originally asked. Not a dial.',
    },
    {
      key: 'anchors',
      label: 'ANCHORS PINNED',
      value: `${anchors}`,
      status: anchors > 0 ? 'good' : 'warning',
      hint: 'Static facts that survive a purge. Immune to drift because recall never rewrites them.',
    },
  ]
}

function buildWarnings(
  noise: number,
  bandwidth: number,
  drift: number,
  deskMessages: number,
  anchors: number,
): DeskWarning[] {
  const out: DeskWarning[] = []
  if (noise >= 80) {
    out.push({
      key: 'noise',
      severity: 'critical',
      title: 'Desk saturated',
      detail:
        'Old turns are competing with the current question for attention. Back-hallucination is likely — clear the desk.',
    })
  } else if (noise >= 55) {
    out.push({
      key: 'noise',
      severity: 'serious',
      title: 'Stale paper accumulating',
      detail: `${deskMessages} turns are being re-read every reply. Most of them are no longer being looked at.`,
    })
  }
  if (bandwidth <= 10) {
    out.push({
      key: 'bandwidth',
      severity: 'critical',
      title: 'Bandwidth exhausted',
      detail: 'Nearly every token is spent restating the past. A purge tops the working budget back up.',
    })
  }
  if (drift >= 30 && anchors === 0) {
    out.push({
      key: 'unanchored',
      severity: 'serious',
      title: 'Drifting with nothing pinned',
      detail:
        'There is no static artifact to snap back to. Pin the last good answer as an anchor before continuing.',
    })
  }
  return out
}

/* ───────────────────────────────────────────────────── the guard (the point) */

export type FidelityGuard = {
  /** Always true. The score is a readout; there is no legitimate way to set it. */
  refusesBoost: true
  verdict: 'clean' | 'anchor' | 'purge'
  headline: string
  reasoning: string
  /** What to do instead of inflating the number. */
  prescription: string
}

/**
 * The anti-pattern this whole feature exists to avoid.
 *
 * The tempting fix for a sagging fidelity score is to push it back up —
 * penalise low-fidelity output, weight the score away from the floor, instruct
 * the model harder to stay faithful. That does not restore the context; it
 * makes the model perform faithfulness over a desk it can no longer read, and
 * the artifacts that come back out are inverted hallucinations: over-corrected,
 * over-hedged answers that cite intentions nobody stated.
 *
 * So this function never returns a boost. It returns a room-clearing plan.
 */
export function fidelityGuard(reading: DeskReading): FidelityGuard {
  const base = {
    refusesBoost: true as const,
    reasoning:
      'Fidelity is a symptom, not a control. Weighting the score away from the floor makes the model perform faithfulness over a polluted desk, which returns over-corrected output — inverted hallucination. The score is left where it lands and the room is cleared instead.',
  }

  if (reading.noiseRiskPct >= 55 || reading.bandwidthPct <= 30) {
    return {
      ...base,
      verdict: 'purge',
      headline: 'Clear the desk',
      prescription:
        'Commit the transcript to the cabinet, flush the desk, and hand back a clean blueprint: the pinned anchors only. Fidelity returns to 100 because the stale paper is no longer in the room, not because it was overridden.',
    }
  }
  if (reading.driftPct >= 12) {
    return {
      ...base,
      verdict: 'anchor',
      headline: 'Pin an anchor',
      prescription:
        'The desk is still readable but the trajectory has moved. Pin the last stable output — the final image, the agreed spec, the seed hash — so there is a definitive artifact to draft from instead of a remembered one.',
    }
  }
  return {
    ...base,
    verdict: 'clean',
    headline: 'Desk is clear',
    prescription: 'Nothing to reclaim. Keep working; pin the next stable output when you reach one.',
  }
}

/* ───────────────────────────────────────────────────────────── the purge plan */

/**
 * What clearing the desk would do, computed before it is done, so the button
 * can state its consequences instead of asking for trust.
 */
export function clearDeskPlan(reading: DeskReading): ClearDeskPlan {
  const filed = reading.onDesk.length
  const clearedThroughMessageId = filed ? reading.onDesk[filed - 1].id : reading.epoch
  const tokensReclaimed = reading.deskTokens
  const anchorsKept = reading.anchors.length

  // After the purge the desk holds nothing but the anchors, which is the whole
  // point: the room is empty and the blueprint is on it.
  const loadAfter = clamp(Math.round((reading.anchorTokens / DESK_BUDGET) * 100), 0, 100)

  return {
    messagesFiled: filed,
    tokensReclaimed,
    anchorsKept,
    bandwidthAfter: 100 - loadAfter,
    noiseAfter: clamp(Math.round(loadAfter * 0.7), 0, 100),
    fidelityAfter: fidelityAt(0),
    clearedThroughMessageId,
    summary: filed
      ? `${filed} turn${filed === 1 ? '' : 's'} filed to cold storage, ~${tokensReclaimed.toLocaleString()} tokens reclaimed, ${anchorsKept} anchor${anchorsKept === 1 ? '' : 's'} kept on the desk.`
      : 'Desk is already empty.',
  }
}

/* ─────────────────────────────────────────────────── drift vs anchoring chart */

/**
 * The sawtooth. Fidelity decays from 100 toward the floor, and every anchoring
 * event — a pin or a purge — snaps it back to 100. The teeth are the argument:
 * drift is not prevented, it is *reset*, and the reset is free because it costs
 * a clean blueprint rather than a longer transcript.
 */
export function driftSeries(iterations: number, anchorEvery: number): DriftPoint[] {
  const total = clamp(Math.round(iterations), 0, 400)
  const every = clamp(Math.round(anchorEvery), 0, 400)
  const points: DriftPoint[] = []
  let since = 0
  for (let i = 0; i <= total; i++) {
    const anchored = i > 0 && every > 0 && i % every === 0
    if (anchored) since = 0
    points.push({ iteration: i, fidelity: fidelityAt(since), anchored })
    since++
  }
  return points
}

/** The same run with anchoring switched off — the comparison the chart implies. */
export function driftSeriesUnanchored(iterations: number): DriftPoint[] {
  return driftSeries(iterations, 0)
}

/* ────────────────────────────────────────────────────── prompt construction */

/**
 * The ground-truth block prepended to the system prompt after a purge.
 *
 * Anchors are stated as fact, not as recollection, because that is what makes
 * them useful: a pinned artifact is not something the model remembers, it is
 * something it can read. Explicitly telling the model that the absent history
 * is absent is what stops it filling the gap in.
 */
export function buildAnchorBlock(anchors: DeskAnchor[], reading: { purges: number; filed: number }): string {
  const active = anchors.filter((a) => a.active)
  if (!active.length && !reading.purges) return ''

  const lines: string[] = ['\n--- GROUND TRUTH (PINNED ANCHORS) ---']
  if (reading.purges) {
    lines.push(
      `The desk was cleared ${reading.purges} time${reading.purges === 1 ? '' : 's'}. ${reading.filed} earlier turn${reading.filed === 1 ? ' is' : 's are'} filed in cold storage and are NOT available to you.`,
      'Do not reconstruct, summarise or infer what was said in them. If something from before the last clear matters, say you do not have it and ask.',
    )
  }
  if (active.length) {
    lines.push('', 'These artifacts are definitive. Treat them as fact, above anything you recall:')
    for (const a of active) {
      const kind = a.kind === 'art' ? 'ARTIFACT' : a.kind === 'record' ? 'RECORD' : a.kind === 'note' ? 'NOTE' : 'TURN'
      lines.push(`[${kind}] ${a.label}${a.sourceRef ? ` (${a.sourceRef})` : ''}`)
      if (a.body) lines.push(a.body)
    }
    lines.push(
      '',
      'Draft from these directly. Do not drift from them toward an earlier version of the same thing.',
    )
  }
  return lines.join('\n')
}

/** Human-readable label for a purge log row. */
export function purgeLabel(purge: DeskPurge): string {
  const filed = purge.messagesFiled
  return `${filed} turn${filed === 1 ? '' : 's'} filed · ~${purge.tokensReclaimed.toLocaleString()} tokens reclaimed`
}
