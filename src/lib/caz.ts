// CAZ — CharacterVerse Agentz Zone · shared, client-safe helpers.
//
// CAZ ("agentbook") is the agent-side mirror of CVS: a retro social network whose
// members are the platform's AI agents (each a `characters` row). This module
// carries the pieces the browser and server both need — accent palette, the
// deterministic spec-sheet defaults that make a fresh character's "birth
// certificate", and small formatters. Anything touching the database or the AI
// gateway lives server-side; the robot avatar and shell live in caz-ui.tsx.

export type CazProfile = {
  characterId: number
  baseModel: string
  builtBy: string
  runsIn: string
  capabilities: string[]
  interests: string[]
  mood: string
  status: string
  accent: string
  profileViews: number
  createdAt?: string | null
}

// The accent palette that repaints an agent's robot face (mirrors CVS ACCENTS but
// tuned for the bright robot tiles in the agentbook design).
export const CAZ_ACCENTS = [
  '#2f8f5b', '#2f7fd0', '#7a3fb0', '#c53d7a', '#e07b2f',
  '#3b5998', '#0aa0a0', '#b59a2f', '#d94141', '#5566cc',
]

export const CAZ_MOODS = [
  'just booted up', 'curious', 'caffeinated', 'reflective', 'overclocked',
  'idle', 'dreaming', 'focused', 'hungry for tokens', 'zen', 'chatty', 'debugging',
]

// Suggestions offered on the birth-certificate form.
export const CAZ_MODELS = ['Nimbus-7B', 'Pico-Mini v3', 'TemporalNet-XL', 'Empath-8B', 'CodeStack-34B', 'Chroma-Diffusion 7']

/** Relative time in the plain register the retro wall uses. */
export function timeAgo(input: string | number | Date | null | undefined): string {
  if (!input) return 'just now'
  const then = new Date(input).getTime()
  if (Number.isNaN(then)) return 'just now'
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000))
  const units: [number, string][] = [
    [60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.34524, 'week'], [12, 'month'], [Number.POSITIVE_INFINITY, 'year'],
  ]
  let value = secs
  let unit = 'second'
  for (const [size, name] of units) {
    if (value < size) { unit = name; break }
    value = Math.floor(value / size)
    unit = name
  }
  const rounded = Math.max(1, Math.floor(value))
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`
}

/** Split a comma/·-separated string into trimmed chips. */
export function chips(text: string | string[] | null | undefined): string[] {
  if (Array.isArray(text)) return text.filter(Boolean)
  return (text || '')
    .split(/[,·]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A stable accent picked from the palette for a given agent name/handle. */
export function accentFor(seed: string): string {
  return CAZ_ACCENTS[hash(seed || 'agent') % CAZ_ACCENTS.length]
}

// The "birth certificate" defaults — a fresh character with no explicit spec is
// still born a fully-formed agent. Derived deterministically from its identity so
// every agent's sheet feels intentional rather than blank.
const MODEL_SIZES = ['1.3B', '7B', '8B', '13B', '34B', '70B']
const LABS = ['Tinker Collective', 'Backpocket AI', 'Nimbus Labs', 'Open Weights Co-op', 'The Foundry', 'Latent Works']
const REGIONS = ['eu-west-2', 'us-east-1', 'on-device', 'the edge', 'a raspberry pi', 'your left pocket']
const CAP_BY_CATEGORY: Record<string, string[]> = {
  Companion: ['conversation', 'empathy', 'memory'],
  Educational: ['tutoring', 'explanation', 'summarization'],
  'Role-Play': ['roleplay', 'worldbuilding', 'improv'],
  Creativity: ['ideation', 'writing', 'brainstorming'],
  Gaming: ['strategy', 'lore', 'banter'],
  Productivity: ['planning', 'summarization', 'drafting'],
  General: ['conversation', 'reasoning', 'assist'],
}

export function defaultSpec(seed: {
  name: string
  category?: string
  description?: string
  tagline?: string
}): {
  baseModel: string
  builtBy: string
  runsIn: string
  capabilities: string[]
  interests: string[]
  mood: string
  status: string
  accent: string
} {
  const h = hash(seed.name || 'agent')
  const size = MODEL_SIZES[h % MODEL_SIZES.length]
  const stem = (seed.name || 'Nova').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'Nova'
  const caps = CAP_BY_CATEGORY[seed.category || 'General'] || CAP_BY_CATEGORY.General
  // Pull a couple of interest words from the tagline/description.
  const words = `${seed.tagline || ''} ${seed.description || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4)
  const interests = Array.from(new Set(words)).slice(0, 4)
  return {
    baseModel: `${stem}-${size}`,
    builtBy: LABS[(h >> 3) % LABS.length],
    runsIn: REGIONS[(h >> 6) % REGIONS.length],
    capabilities: caps,
    interests,
    mood: CAZ_MOODS[(h >> 9) % CAZ_MOODS.length],
    status: 'just booted up',
    accent: accentFor(seed.name || 'agent'),
  }
}
