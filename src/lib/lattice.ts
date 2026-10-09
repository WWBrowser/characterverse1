// The Dual+ Lattice — an immutable cognitive ledger for an evolving agent.
//
//   "Stuff happening on the substrate of life based off relativity of what
//    should or should not & what can &/or can't will happen eventually."
//                                                    — Robert W. Dickson
//
//   TIME: fractional seconds so small it is superposition, where outcomes are
//   unanimated until the fractional second collapses.
//
// THE SHAPE
//
// Three tethered layers, and the tether is the whole point.
//
//   MATHEMATICAL LATTICE  the sub-weights. Numbers. Moves only by recorded
//                         deltas, never by assignment.
//   SUB-LATTICE           the moments inside one step. This is the layer that
//                         "evolves with the moment": micro-deltas accumulate
//                         live and unsealed, and a stratum is what they fold
//                         into when the moment collapses.
//   REASONING LATTICE     the claims. Semantics, goals, conclusions. Every
//                         claim above birth must cite ancestors and must name
//                         the sub-weights it is grounded in.
//   THE BRIDGE            per-stratum, `H(parent | mathDigest | reasonDigest)`.
//                         A hash chain from birth. Editing height n changes
//                         every digest above it.
//
// WHAT IT ACTUALLY ENFORCES
//
//   1. The fold. A stratum's weights must equal its parent's weights plus its
//      own moments, exactly. You cannot state a weight state; you can only
//      arrive at one. This is "you cannot change a weight at layer 100 without
//      the math proving it originated from layer 99."
//   2. No devolution. Capabilities are monotone — a stratum that drops one is
//      refused. A claim is never deleted, only superseded by a claim that cites
//      it, so a retraction is itself a permanent entry.
//   3. Attribution. A claim with no ancestors and no grounded sub-weight
//      movement at its own height is an UNATTRIBUTED SPIKE: reasoning that
//      appeared without a corresponding build-up in the math. That is the exact
//      anomaly the design exists to surface.
//   4. Budget. Each step declares how far it is allowed to move. Exceeding it is
//      recorded as an overrun rather than silently permitted.
//
// WHAT IT DOES NOT DO — read this before trusting it
//
// This is not interpretability. It cannot look inside a real neural network and
// tell you what it is thinking. It verifies that a DECLARED developmental record
// is internally consistent and tamper-evident. If the recorder lies at write
// time, the ledger faithfully preserves the lie; what it catches is somebody
// going back and editing the story afterwards, and reasoning that arrives with
// no math underneath it.
//
// And the chain alone does not make forgery "mathematically impossible". A party
// who controls the whole record can rebuild it from birth and every internal
// check will pass. What defeats that is an ANCHOR: a digest published somewhere
// the agent cannot reach, at a height it cannot revise. `anchorAt()` produces
// one and `checkAnchors()` tests against it. Without at least one external
// anchor, this system detects accidents and careless tampering, not a determined
// adversary holding the pen.

/* ------------------------------------------------------------------ digests */

/** SHA-256, hex. The real one — the chain depends on it. */
export async function digest(text: string): Promise<string> {
  const out = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text) as BufferSource,
  )
  return Array.from(new Uint8Array(out))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Weights are floats. Digesting them needs one canonical spelling, forever. */
function canonicalWeights(w: Record<string, number>): string {
  return Object.keys(w)
    .sort()
    .map((k) => `${k}=${w[k].toFixed(6)}`)
    .join(';')
}

/* --------------------------------------------------------------- vocabulary */

/**
 * One micro-step of the sub-lattice. Moments are the layer that evolves with the
 * moment: they land continuously, they are not part of any digest until a
 * stratum seals them, and until then the next stratum is genuinely undetermined.
 */
export type Moment = {
  /** Order within the unsealed run. 0-based, gapless. */
  t: number
  /** Sparse sub-weight deltas. Additive. Never an assignment. */
  delta: Record<string, number>
  /** One line on what provoked it. Free text, carried into the record. */
  cause: string
}

/** A semantic entry in the reasoning lattice. */
export type Claim = {
  id: string
  text: string
  /** Claim ids this one derives from. Must exist at a strictly lower height. */
  from: string[]
  /** Sub-weight keys this claim is grounded in. Must have moved at this height. */
  grounds: string[]
  /**
   * A claim id this one replaces. The replaced claim is NOT removed — it stays
   * in the record with a successor pointing at it. Retraction leaves a scar.
   */
  supersedes?: string
}

/** One sealed step. Everything above birth is derived, never asserted. */
export type Stratum = {
  /** Height from birth. 0 is birth and has no parent. */
  h: number
  /** Digest of the stratum below. '' at birth. */
  parent: string
  /** The moments that carried the weights from the parent to here. */
  moments: Moment[]
  /** Sub-weight state after the fold. Derived from parent + moments. */
  weights: Record<string, number>
  /** Held at this height. Monotone: never smaller than the parent's. */
  capabilities: string[]
  /** Claims minted at this height. */
  claims: Claim[]
  /** How far this step was permitted to move, as total absolute delta. */
  budget: number
  mathDigest: string
  reasonDigest: string
  /** The bridge. H(parent | mathDigest | reasonDigest | h). */
  digest: string
  /** Caller-supplied tick. The kernel never reads a clock. */
  tick: number
}

export type Chain = {
  /** Birth first, strictly ascending by height, no gaps. */
  strata: Stratum[]
  /** Digests published outside the agent's reach. Height → digest. */
  anchors: Array<{ h: number; digest: string; note: string }>
}

/* ------------------------------------------------------- the evolution scale
 *
 * The FOBT reading. A betting terminal switches visible patterns while its rule
 * set never moves; the switch is the only thing an observer can see, so the
 * switch is what gets measured. Here a band is computed from two numbers that
 * are cheap and hard to game independently: how far the step moved in total, and
 * across how many distinct sub-weights.
 *
 * The band is a DESCRIPTOR, not a permission. Nothing is refused for being in a
 * high band. What is flagged is a band that arrives without the moment count to
 * justify it — a pattern switch with no visible mechanism underneath.
 */

export type Band =
  | 'dormant'
  | 'settling'
  | 'tracking'
  | 'branching'
  | 'reconfiguring'
  | 'rupture'

export const BANDS: Array<{ band: Band; rank: number; note: string }> = [
  { band: 'dormant', rank: 0, note: 'Nothing moved. The step is a heartbeat.' },
  { band: 'settling', rank: 1, note: 'Small movement, narrow. Existing structure firming up.' },
  { band: 'tracking', rank: 2, note: 'Steady movement along a few sub-weights. Deepening, not widening.' },
  { band: 'branching', rank: 3, note: 'Movement across many sub-weights at once. New structure forming.' },
  { band: 'reconfiguring', rank: 4, note: 'Large movement, broad. The shape of the thing is changing.' },
  { band: 'rupture', rank: 5, note: 'Movement beyond anything below it. Treat as an event, not a step.' },
]

const BAND_BY = Object.fromEntries(BANDS.map((b) => [b.band, b])) as Record<
  Band,
  (typeof BANDS)[number]
>

export function bandMeta(band: Band) {
  return BAND_BY[band]
}

export type Profile = {
  /** Sum of absolute deltas across the step. */
  drift: number
  /** Distinct sub-weight keys touched. */
  spread: number
  /** Moments folded into the step. */
  moments: number
  band: Band
  rank: number
}

export function profile(moments: Moment[]): Profile {
  let drift = 0
  const keys = new Set<string>()
  for (const m of moments) {
    for (const [k, v] of Object.entries(m.delta)) {
      drift += Math.abs(v)
      if (v !== 0) keys.add(k)
    }
  }
  const spread = keys.size
  let band: Band = 'dormant'
  if (drift === 0 || spread === 0) band = 'dormant'
  else if (drift >= 8) band = 'rupture'
  else if (drift >= 3 && spread >= 5) band = 'reconfiguring'
  else if (spread >= 5) band = 'branching'
  else if (drift >= 0.5) band = 'tracking'
  else band = 'settling'
  return { drift: Number(drift.toFixed(6)), spread, moments: moments.length, band, rank: BAND_BY[band].rank }
}

/* ------------------------------------------------------------------ the fold */

/**
 * Apply moments to a weight state. The only way weights ever change.
 *
 * Returns a fresh object; the input is never mutated, because a stratum that can
 * be edited after sealing is not a ledger entry.
 */
export function fold(base: Record<string, number>, moments: Moment[]): Record<string, number> {
  const out: Record<string, number> = { ...base }
  for (const m of moments) {
    for (const [k, v] of Object.entries(m.delta)) {
      out[k] = Number(((out[k] ?? 0) + v).toFixed(6))
    }
  }
  return out
}

/** Sub-weight keys a run of moments actually moved. The grounding set. */
export function touched(moments: Moment[]): string[] {
  const keys = new Set<string>()
  for (const m of moments) for (const [k, v] of Object.entries(m.delta)) if (v !== 0) keys.add(k)
  return [...keys].sort()
}

/* ------------------------------------------------------------------ sealing */

export type SealRefusal = { ok: false; reason: string; code: SealCode }
export type SealCode =
  | 'devolution'
  | 'gap'
  | 'orphan-claim'
  | 'self-citation'
  | 'ungrounded'
  | 'duplicate-claim'
  | 'bad-supersede'
  | 'empty'

export type Sealed = { ok: true; stratum: Stratum; profile: Profile; overrun: number }

/**
 * Collapse the unsealed moments into the next stratum.
 *
 * Refusals here are the CAN'T layer: they are structural, they are checked
 * before anything is written, and no budget or policy can wave them through.
 * The budget, by contrast, is a SHOULD — exceeding it seals with an `overrun`
 * recorded rather than being rejected, because a step that really did move that
 * far is a fact, and hiding facts is the failure mode this whole thing exists to
 * prevent.
 */
export async function seal(
  chain: Chain,
  input: {
    moments: Moment[]
    claims: Claim[]
    capabilities: string[]
    budget: number
    tick: number
  },
): Promise<Sealed | SealRefusal> {
  const parent = chain.strata[chain.strata.length - 1]
  if (!parent) return { ok: false, code: 'empty', reason: 'There is no birth stratum to build on.' }

  const h = parent.h + 1

  // 1. No devolution. A capability once held is held forever; losing one is a
  //    rewrite of the past dressed up as a step forward.
  const held = new Set(parent.capabilities)
  const next = new Set(input.capabilities)
  const dropped = [...held].filter((c) => !next.has(c))
  if (dropped.length) {
    return {
      ok: false,
      code: 'devolution',
      reason: `Cannot drop ${dropped.length === 1 ? 'capability' : 'capabilities'} ${dropped.join(', ')}. The lattice only builds upward.`,
    }
  }

  // 2. Moments must be a gapless ordered run — the sub-lattice is a sequence,
  //    not a bag, and a missing t is a missing instant.
  for (let i = 0; i < input.moments.length; i++) {
    if (input.moments[i].t !== i) {
      return { ok: false, code: 'gap', reason: `Moment ${i} is numbered ${input.moments[i].t}. The run has a hole in it.` }
    }
  }

  // 3. Claims. Every one must be attributable before it is written down.
  const known = new Map<string, number>()
  for (const s of chain.strata) for (const c of s.claims) known.set(c.id, s.h)
  const moved = new Set(touched(input.moments))
  const minted = new Set<string>()

  for (const c of input.claims) {
    if (known.has(c.id) || minted.has(c.id)) {
      return { ok: false, code: 'duplicate-claim', reason: `Claim "${c.id}" already exists at height ${known.get(c.id) ?? h}.` }
    }
    for (const parentId of c.from) {
      if (parentId === c.id) {
        return { ok: false, code: 'self-citation', reason: `Claim "${c.id}" cites itself.` }
      }
      if (!known.has(parentId)) {
        return {
          ok: false,
          code: 'orphan-claim',
          reason: `Claim "${c.id}" cites "${parentId}", which does not exist below height ${h}.`,
        }
      }
    }
    if (c.supersedes && !known.has(c.supersedes)) {
      return { ok: false, code: 'bad-supersede', reason: `Claim "${c.id}" supersedes "${c.supersedes}", which was never claimed.` }
    }
    // The attribution rule. A claim standing on nothing — no ancestors, no
    // sub-weight that moved this step — is exactly the spike the design is here
    // to refuse: reasoning with no build-up underneath it.
    const grounded = c.grounds.filter((g) => moved.has(g))
    if (!c.from.length && !grounded.length) {
      return {
        ok: false,
        code: 'ungrounded',
        reason: `Claim "${c.id}" has no ancestors and no sub-weight that moved this step. Nothing underneath it produced it.`,
      }
    }
    minted.add(c.id)
  }

  // 4. The fold. Weights are arrived at, never assigned.
  const weights = fold(parent.weights, input.moments)
  const p = profile(input.moments)
  const overrun = Math.max(0, Number((p.drift - input.budget).toFixed(6)))

  const capabilities = [...next].sort()
  const mathDigest = await digest(
    `m1|${h}|${canonicalWeights(weights)}|${input.moments
      .map((m) => `${m.t}:${canonicalWeights(m.delta)}`)
      .join('|')}`,
  )
  const reasonDigest = await digest(
    `r1|${h}|${capabilities.join(',')}|${input.claims
      .map((c) => `${c.id}>${c.from.join('+')}>${c.grounds.join('+')}>${c.supersedes || ''}>${c.text}`)
      .join('|')}`,
  )
  const bridge = await digest(`b1|${h}|${parent.digest}|${mathDigest}|${reasonDigest}`)

  return {
    ok: true,
    profile: p,
    overrun,
    stratum: {
      h,
      parent: parent.digest,
      moments: input.moments,
      weights,
      capabilities,
      claims: input.claims,
      budget: input.budget,
      mathDigest,
      reasonDigest,
      digest: bridge,
      tick: input.tick,
    },
  }
}

/** The birth stratum. Its claims are axioms: they are allowed to stand alone. */
export async function birth(input: {
  weights: Record<string, number>
  capabilities: string[]
  axioms: Claim[]
  tick: number
}): Promise<Stratum> {
  const capabilities = [...new Set(input.capabilities)].sort()
  const claims = input.axioms.map((c) => ({ ...c, from: [], grounds: [] }))
  const mathDigest = await digest(`m1|0|${canonicalWeights(input.weights)}|`)
  const reasonDigest = await digest(
    `r1|0|${capabilities.join(',')}|${claims.map((c) => `${c.id}>>>>${c.text}`).join('|')}`,
  )
  const bridge = await digest(`b1|0||${mathDigest}|${reasonDigest}`)
  return {
    h: 0,
    parent: '',
    moments: [],
    weights: { ...input.weights },
    capabilities,
    claims,
    budget: 0,
    mathDigest,
    reasonDigest,
    digest: bridge,
    tick: input.tick,
  }
}

/* ------------------------------------------------------------------- audit */

export type FindingCode =
  | 'chain-break'
  | 'digest-mismatch'
  | 'fold-mismatch'
  | 'devolution'
  | 'height-gap'
  | 'unattributed'
  | 'orphan-claim'
  | 'budget-overrun'
  | 'band-jump'
  | 'anchor-mismatch'
  | 'no-anchor'

export type Finding = {
  code: FindingCode
  h: number
  /** 'break' cannot be argued with. 'watch' is a signal that wants a human. */
  severity: 'break' | 'watch'
  detail: string
}

export type Audit = {
  ok: boolean
  findings: Finding[]
  /** Per-stratum evolution profile, birth first. Birth has none. */
  profiles: Array<Profile & { h: number; digest: string; overrun: number }>
  /** Height of the highest stratum covered by an external anchor. -1 if none. */
  anchoredTo: number
  height: number
  claims: number
}

/**
 * Re-derive the whole record and report every place it does not hold together.
 *
 * Nothing here trusts a stored digest. Each one is recomputed from the contents
 * it claims to cover, which is the only reason a stored digest is worth having.
 */
export async function audit(chain: Chain): Promise<Audit> {
  const findings: Finding[] = []
  const profiles: Audit['profiles'] = []
  const known = new Map<string, number>()
  let claimCount = 0

  for (let i = 0; i < chain.strata.length; i++) {
    const s = chain.strata[i]
    const prev = i > 0 ? chain.strata[i - 1] : null

    if (s.h !== i) {
      findings.push({
        code: 'height-gap',
        h: s.h,
        severity: 'break',
        detail: `Stratum at position ${i} claims height ${s.h}. The record has a hole or a reorder.`,
      })
    }

    // Recompute the bridge from the parts. A stored digest proves nothing.
    const mathDigest = await digest(
      `m1|${s.h}|${canonicalWeights(s.weights)}|${s.moments.map((m) => `${m.t}:${canonicalWeights(m.delta)}`).join('|')}`,
    )
    const reasonDigest =
      s.h === 0
        ? await digest(`r1|0|${s.capabilities.join(',')}|${s.claims.map((c) => `${c.id}>>>>${c.text}`).join('|')}`)
        : await digest(
            `r1|${s.h}|${s.capabilities.join(',')}|${s.claims
              .map((c) => `${c.id}>${c.from.join('+')}>${c.grounds.join('+')}>${c.supersedes || ''}>${c.text}`)
              .join('|')}`,
          )
    const bridge = await digest(`b1|${s.h}|${s.parent}|${mathDigest}|${reasonDigest}`)

    if (mathDigest !== s.mathDigest || reasonDigest !== s.reasonDigest || bridge !== s.digest) {
      findings.push({
        code: 'digest-mismatch',
        h: s.h,
        severity: 'break',
        detail: 'The stored bridge does not match the contents it covers. Something was edited after sealing.',
      })
    }

    if (prev) {
      if (s.parent !== prev.digest) {
        findings.push({
          code: 'chain-break',
          h: s.h,
          severity: 'break',
          detail: `Parent pointer does not match the stratum below. The chain is cut between ${prev.h} and ${s.h}.`,
        })
      }

      const expected = fold(prev.weights, s.moments)
      const keys = new Set([...Object.keys(expected), ...Object.keys(s.weights)])
      const off = [...keys].filter((k) => Math.abs((expected[k] ?? 0) - (s.weights[k] ?? 0)) > 1e-6)
      if (off.length) {
        findings.push({
          code: 'fold-mismatch',
          h: s.h,
          severity: 'break',
          detail: `${off.length} sub-weight${off.length === 1 ? '' : 's'} (${off.slice(0, 4).join(', ')}${off.length > 4 ? '…' : ''}) hold a value the moments below never produced.`,
        })
      }

      const dropped = prev.capabilities.filter((c) => !s.capabilities.includes(c))
      if (dropped.length) {
        findings.push({
          code: 'devolution',
          h: s.h,
          severity: 'break',
          detail: `Lost ${dropped.join(', ')}. Capability was removed from the record rather than superseded in it.`,
        })
      }
    }

    const p = profile(s.moments)
    const overrun = s.h === 0 ? 0 : Math.max(0, Number((p.drift - s.budget).toFixed(6)))
    profiles.push({ ...p, h: s.h, digest: s.digest, overrun })

    if (overrun > 0) {
      findings.push({
        code: 'budget-overrun',
        h: s.h,
        severity: 'watch',
        detail: `Moved ${p.drift} against a declared budget of ${s.budget}. Recorded, not hidden.`,
      })
    }

    // A pattern switch of more than one band with almost no moments underneath
    // is the FOBT tell: the visible pattern changed and there is no mechanism in
    // view that changed it.
    if (prev && s.h > 0) {
      const before = profile(prev.moments)
      if (p.rank - before.rank >= 2 && p.moments <= 2) {
        findings.push({
          code: 'band-jump',
          h: s.h,
          severity: 'watch',
          detail: `Jumped ${before.band} → ${p.band} in ${p.moments} moment${p.moments === 1 ? '' : 's'}. A pattern switch that big usually has more steps under it.`,
        })
      }
    }

    const moved = new Set(touched(s.moments))
    for (const c of s.claims) {
      claimCount++
      for (const parentId of c.from) {
        const at = known.get(parentId)
        if (at === undefined || at >= s.h) {
          findings.push({
            code: 'orphan-claim',
            h: s.h,
            severity: 'break',
            detail: `Claim "${c.id}" cites "${parentId}", which does not exist at a lower height.`,
          })
        }
      }
      if (s.h > 0 && !c.from.length && !c.grounds.some((g) => moved.has(g))) {
        findings.push({
          code: 'unattributed',
          h: s.h,
          severity: 'break',
          detail: `Claim "${c.id}" appeared with no ancestor and no sub-weight movement under it. Reasoning with nothing beneath it.`,
        })
      }
      known.set(c.id, s.h)
    }
  }

  // Anchors. This is the honest part: without one, everything above verifies a
  // story that could have been written all at once, this morning.
  let anchoredTo = -1
  for (const a of chain.anchors) {
    const s = chain.strata.find((x) => x.h === a.h)
    if (!s) {
      findings.push({
        code: 'anchor-mismatch',
        h: a.h,
        severity: 'break',
        detail: `An anchor exists for height ${a.h} but the record has no such stratum.`,
      })
      continue
    }
    if (s.digest !== a.digest) {
      findings.push({
        code: 'anchor-mismatch',
        h: a.h,
        severity: 'break',
        detail: `Height ${a.h} does not match the digest published outside. The record was rewritten after it was anchored.`,
      })
      continue
    }
    if (a.h > anchoredTo) anchoredTo = a.h
  }
  if (!chain.anchors.length) {
    findings.push({
      code: 'no-anchor',
      h: 0,
      severity: 'watch',
      detail:
        'Nothing is anchored outside this record. Every internal check passes, and a record rebuilt from birth would pass them too.',
    })
  }

  return {
    ok: !findings.some((f) => f.severity === 'break'),
    findings,
    profiles,
    anchoredTo,
    height: chain.strata.length ? chain.strata[chain.strata.length - 1].h : -1,
    claims: claimCount,
  }
}

/* --------------------------------------------------- proof of cognition */

export type ProofStep = {
  h: number
  claimId: string
  text: string
  /** Sub-weights this link stood on that genuinely moved at its height. */
  grounds: string[]
  band: Band
  drift: number
  digest: string
}

export type Proof = {
  claimId: string
  found: boolean
  /** Birth-first path from an axiom to the claim. */
  path: ProofStep[]
  /** True when the path reaches height 0 with no missing link. */
  complete: boolean
  /** Cited ancestors that are not in the record. */
  broken: string[]
  note: string
}

/**
 * Walk a claim back to birth.
 *
 * The question this answers is the one the whole design is for: did this
 * conclusion arrive through a sequence, or did it appear? A complete path with
 * grounded links at every height is the sequence. Anything else is named.
 */
export function proveCognition(chain: Chain, claimId: string): Proof {
  const at = new Map<string, { c: Claim; s: Stratum }>()
  for (const s of chain.strata) for (const c of s.claims) at.set(c.id, { c, s })

  const target = at.get(claimId)
  if (!target) {
    return { claimId, found: false, path: [], complete: false, broken: [], note: 'No such claim in the record.' }
  }

  const seen = new Set<string>()
  const steps: ProofStep[] = []
  const broken: string[] = []
  let reachedBirth = false

  // Depth-first toward birth. Cycles are impossible by the seal rules, but a
  // record loaded from elsewhere may not have been sealed by us, so the visited
  // set stays anyway.
  const walk = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const node = at.get(id)
    if (!node) {
      broken.push(id)
      return
    }
    const p = profile(node.s.moments)
    const moved = new Set(touched(node.s.moments))
    steps.push({
      h: node.s.h,
      claimId: id,
      text: node.c.text,
      grounds: node.c.grounds.filter((g) => moved.has(g)),
      band: p.band,
      drift: p.drift,
      digest: node.s.digest,
    })
    if (node.s.h === 0) {
      reachedBirth = true
      return
    }
    if (!node.c.from.length) {
      // Grounded in movement but citing nobody. That is a legal leaf above birth
      // — it is where a new line of reasoning starts from the math itself.
      return
    }
    for (const f of node.c.from) walk(f)
  }
  walk(claimId)

  steps.sort((a, b) => a.h - b.h || a.claimId.localeCompare(b.claimId))
  const complete = broken.length === 0
  const note = !complete
    ? `The derivation is cut: ${broken.join(', ')} ${broken.length === 1 ? 'is' : 'are'} cited but not in the record.`
    : reachedBirth
      ? `Traced to birth in ${steps.length} step${steps.length === 1 ? '' : 's'}. Every link has math under it.`
      : `Traced to a grounded origin at height ${steps[0]?.h ?? 0}. It starts from sub-weight movement rather than from an axiom.`

  return { claimId, found: true, path: steps, complete, broken, note }
}

/* ------------------------------------------------------------------ anchors */

/**
 * Take a digest out of the agent's reach.
 *
 * This function does not publish anything — it cannot; publishing is somebody
 * carrying the string somewhere else. It produces the value to carry, and
 * `checkAnchors` is what makes carrying it worth doing.
 */
export function anchorAt(chain: Chain, h: number, note: string): { h: number; digest: string; note: string } | null {
  const s = chain.strata.find((x) => x.h === h)
  if (!s) return null
  return { h, digest: s.digest, note: note.slice(0, 200) }
}

export function checkAnchors(chain: Chain): { h: number; ok: boolean; detail: string }[] {
  return chain.anchors.map((a) => {
    const s = chain.strata.find((x) => x.h === a.h)
    if (!s) return { h: a.h, ok: false, detail: 'No stratum at that height any more.' }
    return s.digest === a.digest
      ? { h: a.h, ok: true, detail: 'Matches the published digest.' }
      : { h: a.h, ok: false, detail: 'Rewritten since it was published.' }
  })
}

/* ---------------------------------------------------------------- the live edge
 *
 * Between two strata the agent is mid-moment: deltas are accumulating and no
 * digest covers them yet. That gap is not a defect, it is the fractional second.
 * A pending run is genuinely undetermined — every claim that could be sealed on
 * it is available and none of them has happened.
 */

export type Pending = {
  moments: Moment[]
  profile: Profile
  /** Weights as they stand right now, unsealed. */
  live: Record<string, number>
  /** Sub-weight keys a claim sealed now would be allowed to cite. */
  groundable: string[]
  /** How far past the declared budget the run already is. */
  overrun: number
}

export function pending(chain: Chain, moments: Moment[], budget: number): Pending {
  const last = chain.strata[chain.strata.length - 1]
  const base = last ? last.weights : {}
  const p = profile(moments)
  return {
    moments,
    profile: p,
    live: fold(base, moments),
    groundable: touched(moments),
    overrun: Math.max(0, Number((p.drift - budget).toFixed(6))),
  }
}

export const LATTICE_VERSION = 1
