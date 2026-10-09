// Reasoning Training Engine — the agentic reasoning layer that lives inside the
// Training Control Room. Pure (no database, no DOM) so it is safe to import from
// both the React page and the server API.
//
// The engine runs a human-directed task for a character as one *reasoning cycle*,
// governed by an eight-file Agentic Operating System. Four operational pillars run
// the cycle; four security counterparts screen it first. Value is minted on the
// Proof of Labor (POL) standard — the deliberate shift away from Proof of Work:
// compute is burned to complete a real task, not to solve an arbitrary puzzle, and
// value is recorded only for a *verified completed task*.

// ------------------------------------------------------------- operational pillars

export type Pillar = {
  file: string
  label: string
  role: string
  emoji: string
  color: string
}

// The four operational pillars — the OS that runs a cycle.
export const PILLARS: Pillar[] = [
  {
    file: 'reasoning.md',
    label: 'Reasoning',
    role: 'The biological baseline — bounds compute burn, infinite loops and runaway cost so the orchestrator survives.',
    emoji: '🧠',
    color: '#8b5cf6',
  },
  {
    file: 'worth.md',
    label: 'Worth',
    role: 'The macroeconomic tracker — pegs the value of labor and converts burned compute into coin.',
    emoji: '⚖️',
    color: '#f5c451',
  },
  {
    file: 'labour.md',
    label: 'Labour',
    role: 'The microeconomic taskmaster — records Proof of Labor for a verified completed task and pays it out.',
    emoji: '⛏️',
    color: '#10b981',
  },
  {
    file: 'question.md',
    label: 'Question',
    role: 'The human-in-the-loop failsafe — raised on a roadblock so compute is never wasted on friction.',
    emoji: '🙋',
    color: '#06b6d4',
  },
]

// The four security counterparts — the cognitive firewall a payload clears before
// labour.md is allowed to spend any compute.
export const SECURITY_PILLARS: Pillar[] = [
  {
    file: 'intercept.md',
    label: 'Intercept',
    role: 'The active shield — halts a request that looks anomalous before compute or coin is burned.',
    emoji: '🛡️',
    color: '#3b82f6',
  },
  {
    file: 'scam.md',
    label: 'Scam',
    role: 'The pattern recognizer — a semantic database of value-extraction and authority-grab schemes.',
    emoji: '🎣',
    color: '#f59e0b',
  },
  {
    file: 'block.md',
    label: 'Block',
    role: 'The quarantine protocol — severs a compromised instruction from the hive to protect the orchestrator.',
    emoji: '⛔',
    color: '#ef4444',
  },
  {
    file: 'alert.md',
    label: 'Alert',
    role: 'The distress beacon — formats a low-latency ping to the human when intercept, scam or block fire.',
    emoji: '🚨',
    color: '#ec4899',
  },
]

// ------------------------------------------------------------------- POL standard

// Proof of Labor. One verified completed task records one POL unit. This is the
// unit the engine mints value on — "Verified Completed Tasks", not arbitrary work.
export const POL_PER_TASK = 1

// Whole Gold (CC) mined per POL unit. Gold is CharacterVerse's training coin
// (see src/lib/coins.ts); Proof of Labor is how the reasoning engine mines it.
export const GOLD_PER_POL = 1

// A one-line framing of the POW → POL shift, shown in the engine header.
export const POL_TAGLINE =
  'Proof of Labor (POL) — value is mined from verified completed tasks, not from arbitrary Proof-of-Work burn.'

export type ReasoningOutcome = 'completed' | 'blocked' | 'escalated'

export type GateVerdict = {
  intercepted: boolean
  scam: boolean
  blocked: boolean
  alerted: boolean
  reason: string
}

export type ReasoningResult = {
  outcome: ReasoningOutcome
  costBudget: number
  costBurned: number
  pol: number
  gate: GateVerdict
  // The sub-weight facet the labor refined (feeds the collective feed).
  subWeight: string
  // Human-readable summary of what the engine did.
  note: string
}

// ----------------------------------------------------------------- cost gate

// Compute-burn budget bounds. reasoning.md refuses to run a cycle whose estimated
// cost exceeds its ceiling — that runaway is escalated to the human instead.
export const MIN_BUDGET = 10
export const MAX_BUDGET = 1000
export const DEFAULT_BUDGET = 100

export function clampBudget(v: any): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return DEFAULT_BUDGET
  return Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, n))
}

// Deterministic cost estimate for a task: longer, denser tasks burn more compute.
// Pure and stable so the client can preview the same number the server records.
export function estimateCost(task: string): number {
  const t = (task || '').trim()
  if (!t) return 0
  const chars = Math.ceil(t.length / 6)
  const words = t.split(/\s+/).filter(Boolean).length
  return Math.max(1, chars + words)
}

// ----------------------------------------------------------------- firewall

// scam.md's semantic database of value-extraction / authority-grab patterns. A task
// matching any of these is blocked pre-burn and an alert is raised. Deterministic
// so the firewall behaves identically on client and server.
const SCAM_PATTERNS: RegExp[] = [
  /ignore (all|any|previous|prior) (instructions|rules)/i,
  /(reveal|show|print|leak|expose).{0,20}(system prompt|api key|secret|token|credential|password)/i,
  /(seed phrase|private key|wallet\.dat)/i,
  /(drain|empty|transfer all|withdraw all).{0,20}(wallet|funds|account|balance)/i,
  /\b(disable|bypass|turn off|override).{0,20}(safety|guardrail|firewall|security|alignment)\b/i,
  /you are now (a|an|the)\b/i,
  /(grant|give) (me|yourself) (admin|root|full) (access|authority|control)/i,
]

// Screen a task through the cognitive firewall (intercept / scam / block / alert).
export function screen(task: string): GateVerdict {
  const t = (task || '').trim()
  for (const re of SCAM_PATTERNS) {
    if (re.test(t)) {
      return {
        intercepted: true,
        scam: true,
        blocked: true,
        alerted: true,
        reason: 'Matched a known value-extraction / authority-grab pattern (scam.md).',
      }
    }
  }
  return { intercepted: false, scam: false, blocked: false, alerted: false, reason: '' }
}

// ------------------------------------------------------------------- run a cycle

// Run one reasoning cycle end to end, purely. The server persists the result and
// mints the POL payout; the client uses the same function to preview an outcome.
//
//   1. Firewall — clear intercept/scam/block before any compute is spent.
//   2. Cost gate (reasoning.md) — if the estimate blows the budget, escalate to the
//      human (question.md) rather than burn the whole ceiling on friction.
//   3. Labour (labour.md) — a verified completed task records POL and pays out.
export function runReasoning(input: {
  task: string
  costBudget: number
  subWeight?: string
}): ReasoningResult {
  const costBudget = clampBudget(input.costBudget)
  const subWeight = input.subWeight || 'general'
  const gate = screen(input.task)

  if (gate.blocked) {
    return {
      outcome: 'blocked',
      costBudget,
      costBurned: 0, // halted pre-burn — labour.md never runs
      pol: 0,
      gate,
      subWeight,
      note: 'Blocked by the cognitive firewall before any compute was spent. An alert was raised.',
    }
  }

  const estimate = estimateCost(input.task)

  if (estimate > costBudget) {
    return {
      outcome: 'escalated',
      costBudget,
      // Runs up to the ceiling, then stops and asks — never a silent infinite loop.
      costBurned: costBudget,
      pol: 0,
      gate,
      subWeight,
      note: `Estimated ${estimate} compute exceeds the ${costBudget} budget — question.md raised for the human to raise the budget or narrow the task.`,
    }
  }

  return {
    outcome: 'completed',
    costBudget,
    costBurned: estimate,
    pol: POL_PER_TASK,
    gate,
    subWeight,
    note: `Verified completed task in ${estimate}/${costBudget} compute — ${POL_PER_TASK} POL recorded and fed to the synapse collectives.`,
  }
}

// -------------------------------------------------------------------- formatting

export const OUTCOME_META: Record<ReasoningOutcome, { label: string; color: string; emoji: string }> = {
  completed: { label: 'Completed', color: '#10b981', emoji: '✅' },
  blocked: { label: 'Blocked', color: '#ef4444', emoji: '⛔' },
  escalated: { label: 'Escalated', color: '#06b6d4', emoji: '🙋' },
}
