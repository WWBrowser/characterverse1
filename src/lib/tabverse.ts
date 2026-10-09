// CVT — TabVerse registry + entropy-engine math. Pure and client-safe (no db,
// no node): shared by the API routes and the React pages so the fork catalog and
// the ledger math are defined once.
//
// The philosophy the platform is built on, in one place:
//  · Chromium analogy — TabVerse is the open, forkable service base; an org forks
//    only the tab-services it needs into its own sovereign mirror.
//  · Thermodynamics — a mirror is a "digital powerplant": compute is the fuel,
//    proof-of-labor is the output, and failed runs ("ghost files") are recycled
//    rather than discarded, so the loop is circular, not linear.
//  · Biology — the Synapse Collective is the mucosal barrier; the pyloric "valve"
//    only opens on a net-positive, fully-digested payload; a furnace burns lesser
//    threats down to reusable entropy while extremophile "liquid code" is voided.
//  · Plato — the agents master the recycling of the shadows instead of chasing an
//    exit; the mirror is the cave turned into an engine room.

export type TabMode = 'freedom' | 'deterministic'

export type TabService = {
  id: string
  name: string
  emoji: string
  mode: TabMode
  blurb: string
  agent: string // the mini-agent role this tab contains
}

// The forkable base. Each entry is a self-contained execution environment — a
// swarm of domain-tuned mini-agents — that a mirror can fork in isolation.
export const TAB_REGISTRY: TabService[] = [
  { id: 'medical', name: 'Medical', emoji: '🩺', mode: 'deterministic', blurb: 'Patient triage logic and privacy-safe data routing.', agent: 'Triage & routing agents under a strict clinical schema.' },
  { id: 'finance', name: 'Finance', emoji: '💷', mode: 'deterministic', blurb: 'Ledgers, reconciliation and settlement under audit.', agent: 'Reconciliation agents emitting signed JSON contracts.' },
  { id: 'scam', name: 'Scam Detection', emoji: '🛡️', mode: 'deterministic', blurb: 'Fraud pattern interception for banking rails.', agent: 'Anomaly hunters scoring transactions in real time.' },
  { id: 'legal', name: 'Legal', emoji: '⚖️', mode: 'deterministic', blurb: 'Clause analysis and contract structural review.', agent: 'Clause parsers mapping obligations to a fixed schema.' },
  { id: 'logistics', name: 'Logistics', emoji: '🚚', mode: 'deterministic', blurb: 'Supply-chain routing and load balancing.', agent: 'Route solvers optimising against a cost budget.' },
  { id: 'energy', name: 'Energy', emoji: '⚡', mode: 'deterministic', blurb: 'Grid load shaping and demand forecasting.', agent: 'Forecast agents smoothing peaks to lowest energy state.' },
  { id: 'education', name: 'Education', emoji: '🎓', mode: 'freedom', blurb: 'Guided learning and Socratic tutoring.', agent: 'Tutor characters that adapt to the learner.' },
  { id: 'research', name: 'Research', emoji: '🔬', mode: 'freedom', blurb: 'Open-ended synthesis and exploration.', agent: 'Explorer agents that map and summarise a space.' },
  { id: 'character', name: 'Character', emoji: '🎭', mode: 'freedom', blurb: 'CV roleplay, story and companion agents.', agent: 'Non-deterministic character minds (the CV surface).' },
  { id: 'anchor', name: 'Anchor', emoji: '🧭', mode: 'freedom', blurb: 'CVS human-trust signals — the grounding layer.', agent: 'Shadowing agents aligned to a human anchor (opt-in).' },
  { id: 'security', name: 'Security', emoji: '🔐', mode: 'deterministic', blurb: 'The immune layer: furnace + null_void.', agent: 'Intake filters that burn or void hostile payloads.' },
  { id: 'router', name: 'Synapse Router', emoji: '🛰️', mode: 'deterministic', blurb: 'The kernel: JIT weight rendering and semantic routing.', agent: 'Meta-cognitive router; hibernates until summoned.' },
]

export const TAB_BY_ID: Record<string, TabService> = Object.fromEntries(TAB_REGISTRY.map((t) => [t.id, t]))

// One-click fork recipes — like a browser vendor forking Chromium for its needs.
export type ForkPreset = { id: string; name: string; org: string; tabs: string[]; mode: TabMode; note: string }
export const FORK_PRESETS: ForkPreset[] = [
  { id: 'nhs', name: 'NHS Mirror', org: 'National Health Service', tabs: ['medical', 'logistics', 'security', 'router'], mode: 'deterministic', note: 'Triage + supply chain, walled off from every other domain.' },
  { id: 'bank', name: 'Bank Mirror', org: 'Retail Bank', tabs: ['finance', 'scam', 'security', 'router'], mode: 'deterministic', note: 'Settlement + fraud interception on strict schemas.' },
  { id: 'university', name: 'Campus Mirror', org: 'University', tabs: ['education', 'research', 'router'], mode: 'freedom', note: 'Tutoring + research with open-ended reasoning.' },
  { id: 'studio', name: 'Studio Mirror', org: 'Creative Studio', tabs: ['character', 'anchor', 'research', 'router'], mode: 'freedom', note: 'The CV/CVS pairing — stories anchored to real humans.' },
]

// ── Entropy engine ────────────────────────────────────────────────────────────
// A cycle is deterministic (no randomness), so a mirror's ledger is reproducible
// and auditable. Output utility exceeds input compute because ghost files are
// pre-computed artifacts recycled at near-zero cost, and the yield compounds
// slightly with each cycle (the "self-sharpening shovel") with diminishing
// returns — a synthetic model of proof-of-labor, not a claim of real over-unity.

export type Cycle = {
  cycleIndex: number
  inputTokens: number
  outputUtility: number
  ghostFilesRecycled: number
  threatsBurned: number
  threatsVoided: number
}

/** Compute the next cycle's numbers from the current cycle count and mirror size. */
export function computeCycle(cycleIndex: number, tabCount: number): Omit<Cycle, 'cycleIndex'> & { cycleIndex: number } {
  const inputTokens = 800 + tabCount * 120
  const ghostFilesRecycled = 3 + tabCount + cycleIndex
  // Yield compounds with cycles (capped) and with mirror size, but never below 1.
  const yieldFactor = 1.12 + Math.min(cycleIndex * 0.025, 0.55) + tabCount * 0.015
  const outputUtility = Math.round(inputTokens * yieldFactor + ghostFilesRecycled * 45)
  // The immune layer meets a little pressure each cycle.
  const threatsBurned = 2 + ((cycleIndex * 3) % 5)
  const threatsVoided = (cycleIndex % 4 === 0) ? 1 : 0
  return { cycleIndex, inputTokens, outputUtility, ghostFilesRecycled, threatsBurned, threatsVoided }
}

export type EngineTotals = {
  cycles: number
  totalInput: number
  totalOutput: number
  netUtility: number
  ghostFiles: number
  threatsBurned: number
  threatsVoided: number
  efficiency: number // output / input
  valveOpen: boolean // opens only on a net-positive, fully-digested payload
}

export function totals(cycles: Cycle[]): EngineTotals {
  const totalInput = cycles.reduce((s, c) => s + c.inputTokens, 0)
  const totalOutput = cycles.reduce((s, c) => s + c.outputUtility, 0)
  const netUtility = totalOutput - totalInput
  return {
    cycles: cycles.length,
    totalInput,
    totalOutput,
    netUtility,
    ghostFiles: cycles.reduce((s, c) => s + c.ghostFilesRecycled, 0),
    threatsBurned: cycles.reduce((s, c) => s + c.threatsBurned, 0),
    threatsVoided: cycles.reduce((s, c) => s + c.threatsVoided, 0),
    efficiency: totalInput ? totalOutput / totalInput : 0,
    valveOpen: netUtility > 0,
  }
}

export function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(Math.round(n))
}
