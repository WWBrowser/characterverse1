// SAA AlgorithmClaw — the recommendation half of the Super Agentic Algorithm.
//
// Pure (no database, no DOM, no clock, no Math.random) so the same inputs always
// produce the same slate. That matters more here than anywhere else on the
// platform: a recommender you cannot replay is a recommender you cannot audit,
// and "why was I shown this" has to be answerable months later from the stored
// seed alone.
//
// Shape of the algorithm — deliberately the two-stage shape a video recommender
// uses, with the payload swapped from clips to conversations:
//
//   1. RETRIEVAL   cheap recall over the whole character pool, cut to a candidate
//                  set by a rough prior. Nothing expensive runs on the long tail.
//   2. RANKING     four explicit signals per candidate, each surfaced in the UI.
//                  No hidden score — the card shows the breakdown that produced it.
//   3. DIVERSITY   a greedy re-rank that penalizes repeats of a category already
//                  taken, so a slate is a spread and not four of the same thing.
//
// The agentic part sits on top, not underneath: the model writes the scenario for
// candidates this kernel already chose and can already justify. When the gateway
// is unavailable the slate still ranks, still explains itself, and still opens a
// chat — it just does so in the kernel's own plainer voice.

/* --------------------------------------------------------------- tunables */

/** Rank-based recency decay over past conversations. No wall clock is read. */
export const RECENCY_DECAY = 0.85
/** Conversations older than this many ranks contribute nothing. */
export const HISTORY_DEPTH = 40
/** How many characters survive retrieval into the ranking stage. */
export const CANDIDATE_POOL = 60
/** Recommendations in a finished slate. */
export const SLATE_SIZE = 4
/** Score multiplier applied to a candidate whose category is already on the slate. */
export const DIVERSITY_PENALTY = 0.35
/** Conversations needed before the profile is treated as warm rather than cold. */
export const WARM_AT = 6

/** Ranking weights. They sum to 1; the UI prints them, so keep them honest. */
export const WEIGHTS = {
  affinity: 0.3,
  vibeFit: 0.4,
  novelty: 0.2,
  spark: 0.1,
} as const

export type SignalId = keyof typeof WEIGHTS

export const SIGNALS: { id: SignalId; label: string; blurb: string }[] = [
  { id: 'affinity', label: 'Affinity', blurb: 'How much of your history points at this character' },
  { id: 'vibeFit', label: 'Vibe fit', blurb: 'How closely the character reads as the vibe you asked for' },
  { id: 'novelty', label: 'Novelty', blurb: 'How much of this is new ground for you' },
  { id: 'spark', label: 'Spark', blurb: 'Seeded exploration — the same seed always picks the same spark' },
]

/* ------------------------------------------------------------- primitives */

/** FNV-1a. The platform's standard deterministic hash — SSR and client agree. */
export function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Seeded unit float in [0,1). Replaces Math.random everywhere in this file. */
export function jitter(seed: string): number {
  return (hash(seed) % 10000) / 10000
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'this', 'from', 'into', 'for', 'its', 'it', 'a', 'an', 'of', 'on',
  'in', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'but', 'not', 'than',
  'then', 'when', 'while', 'about', 'over', 'under', 'you', 'your', 'me', 'my', 'i', 'we', 'us',
  'they', 'them', 'their', 'he', 'she', 'his', 'her', 'want', 'like', 'something', 'someone',
  'give', 'make', 'can', 'could', 'would', 'should', 'just', 'really', 'very', 'more', 'most',
  'some', 'any', 'all', 'get', 'got', 'let', 'lets', 'need', 'know', 'think', 'feel', 'chat',
  'talk', 'tell', 'ask', 'say', 'said', 'thing', 'things', 'character', 'characters', 'ai',
])

export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

/* ------------------------------------------------------------- vibe axes */

export type AxisId =
  | 'cozy'
  | 'unhinged'
  | 'mystery'
  | 'comedy'
  | 'romance'
  | 'tactical'
  | 'melancholy'
  | 'epic'

export type Axis = {
  id: AxisId
  label: string
  /** One line the UI shows when the axis is the dominant read. */
  reading: string
  /** Words that pull toward this axis, in the prompt or in a character's own text. */
  lexicon: string[]
}

// Eight axes, fixed order. A ninth vibe is not a new axis — it lands in the
// freeform tokens and is matched literally, the same way an unusual search term
// is. Adding axes without evidence is how a taxonomy stops describing anything.
export const AXES: Axis[] = [
  {
    id: 'cozy',
    label: 'Cozy',
    reading: 'Low stakes, warm room, nothing chasing you.',
    lexicon: ['cozy', 'cosy', 'comfort', 'comforting', 'warm', 'gentle', 'soft', 'calm', 'quiet',
      'slow', 'tea', 'kitchen', 'hearth', 'rain', 'blanket', 'kind', 'safe', 'homely', 'wholesome',
      'peaceful', 'friendly', 'sweet', 'domestic', 'garden', 'bakery', 'cottage'],
  },
  {
    id: 'unhinged',
    label: 'Unhinged',
    reading: 'Let it derail. The point is the derailment.',
    lexicon: ['unhinged', 'chaos', 'chaotic', 'wild', 'feral', 'manic', 'absurd', 'nonsense',
      'deranged', 'reckless', 'nihilism', 'nihilistic', 'anarchy', 'weird', 'strange', 'bizarre',
      'gremlin', 'menace', 'lawless', 'volatile', 'erratic'],
  },
  {
    id: 'mystery',
    label: 'Mystery',
    reading: 'Something is withheld and you are meant to find it.',
    lexicon: ['mystery', 'mysterious', 'detective', 'clue', 'clues', 'noir', 'secret', 'secrets',
      'hidden', 'puzzle', 'riddle', 'investigate', 'investigation', 'case', 'suspect', 'crime',
      'conspiracy', 'cipher', 'unsolved', 'occult', 'cryptic', 'sleuth', 'evidence'],
  },
  {
    id: 'comedy',
    label: 'Comedy',
    reading: 'The scene is built to be funny, not to be won.',
    lexicon: ['comedy', 'comedic', 'funny', 'humor', 'humour', 'joke', 'jokes', 'witty', 'wit',
      'silly', 'banter', 'sarcastic', 'sarcasm', 'satire', 'parody', 'ridiculous', 'absurdist',
      'deadpan', 'roast', 'laugh', 'goofy', 'irreverent'],
  },
  {
    id: 'romance',
    label: 'Romance',
    reading: 'Two people, one charged distance between them.',
    lexicon: ['romance', 'romantic', 'love', 'crush', 'flirt', 'flirty', 'longing', 'yearning',
      'tender', 'intimate', 'courtship', 'date', 'confession', 'heartfelt', 'devotion', 'swoon',
      'slowburn', 'affection', 'sweetheart'],
  },
  {
    id: 'tactical',
    label: 'Tactical',
    reading: 'A problem with constraints. Bring a plan.',
    lexicon: ['tactical', 'strategy', 'strategic', 'plan', 'planning', 'heist', 'mission', 'ops',
      'operation', 'logistics', 'command', 'chess', 'negotiation', 'debug', 'engineer', 'build',
      'architecture', 'system', 'code', 'analysis', 'precise', 'methodical', 'briefing', 'protocol'],
  },
  {
    id: 'melancholy',
    label: 'Melancholy',
    reading: 'Quiet weight. Nothing gets fixed by the end.',
    lexicon: ['melancholy', 'sad', 'sombre', 'somber', 'grief', 'loss', 'lonely', 'loneliness',
      'wistful', 'bittersweet', 'rain', 'ache', 'regret', 'mourning', 'elegiac', 'fading',
      'dusk', 'autumn', 'goodbye', 'haunted', 'weary'],
  },
  {
    id: 'epic',
    label: 'Epic',
    reading: 'Wide scale, high stakes, a horizon to cross.',
    lexicon: ['epic', 'grand', 'heroic', 'saga', 'quest', 'legend', 'legendary', 'myth', 'mythic',
      'empire', 'war', 'battle', 'destiny', 'prophecy', 'kingdom', 'galaxy', 'space', 'odyssey',
      'ancient', 'dragon', 'throne', 'fate', 'sweeping'],
  },
]

export const AXIS_BY_ID: Record<string, Axis> = Object.fromEntries(AXES.map((a) => [a.id, a]))

/** Prompts that explicitly want unfamiliar ground get their novelty weight raised. */
const NOVELTY_WORDS = ['new', 'different', 'surprise', 'surprising', 'fresh', 'unfamiliar',
  'never', 'unexpected', 'random', 'else', 'other', 'change', 'switch', 'weird', 'discover']

/** Prompts that explicitly want the familiar get it lowered. */
const COMFORT_WORDS = ['again', 'usual', 'favourite', 'favorite', 'same', 'back', 'continue',
  'more', 'regular', 'return']

export type VibeRead = {
  text: string
  /** Axis weights, normalized to sum 100. Empty when nothing matched. */
  axes: { id: AxisId; label: string; weight: number }[]
  /** The strongest axis, or null on a purely freeform prompt. */
  dominant: AxisId | null
  /** Tokens that matched no axis — matched literally against character text. */
  freeform: string[]
  /** 0–100. How legible the prompt is to the kernel, not how good it is. */
  clarity: number
  /** Multiplier on the novelty signal, from explicit new/familiar language. */
  noveltyBias: number
}

export function readVibe(text: string): VibeRead {
  const raw = (text || '').trim()
  const tokens = tokenize(raw)
  const counts = new Map<AxisId, number>()
  const claimed = new Set<string>()

  for (const token of tokens) {
    for (const axis of AXES) {
      // Prefix match so "mysteriously" reaches "mysterious" without a stemmer.
      const hit = axis.lexicon.some((w) => token === w || token.startsWith(w) || w.startsWith(token))
      if (hit) {
        counts.set(axis.id, (counts.get(axis.id) || 0) + 1)
        claimed.add(token)
      }
    }
  }

  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0)
  const axes = AXES.filter((a) => counts.has(a.id))
    .map((a) => ({
      id: a.id,
      label: a.label,
      weight: Math.round(((counts.get(a.id) || 0) / total) * 100),
    }))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))

  const freeform = tokens.filter((t) => !claimed.has(t)).slice(0, 12)

  let noveltyBias = 1
  for (const t of tokens) {
    if (NOVELTY_WORDS.includes(t)) noveltyBias += 0.25
    if (COMFORT_WORDS.includes(t)) noveltyBias -= 0.25
  }

  return {
    text: raw,
    axes,
    dominant: axes[0]?.id ?? null,
    freeform,
    // Clarity rewards matched axes and penalizes a prompt that is all noise.
    clarity: clamp(Math.round((total * 22) + (axes.length > 1 ? 12 : 0) + (raw ? 8 : 0)), 0, 100),
    noveltyBias: round2(clamp(noveltyBias, 0.5, 2)),
  }
}

/* ---------------------------------------------------------- taste profile */

/** One past conversation, flattened. `seq` is any monotonic key — a message id. */
export type HistoryRow = {
  conversationId: number
  characterId: number
  name: string
  category: string
  turns: number
  /** Monotonic ordering key. Higher is more recent. Never a timestamp. */
  seq: number
  /** The user's own words from this conversation, concatenated. */
  sample: string
}

export type TasteProfile = {
  conversations: number
  characters: { characterId: number; name: string; weight: number; turns: number }[]
  categories: { category: string; weight: number }[]
  themes: { token: string; weight: number }[]
  /** Average turns per conversation, rounded. */
  depth: number
  /** Distinct characters over conversations, 0–100. */
  breadth: number
  /** How the user writes: from mean user-message length. */
  style: 'terse' | 'conversational' | 'expansive'
  /** 0–100. How much evidence the ranker actually has. Cold start reads low. */
  signal: number
  cold: boolean
}

export function readTaste(rows: HistoryRow[]): TasteProfile {
  const ordered = [...rows].sort((a, b) => b.seq - a.seq).slice(0, HISTORY_DEPTH)

  const charW = new Map<number, { name: string; weight: number; turns: number }>()
  const catW = new Map<string, number>()
  const themeW = new Map<string, number>()
  let turnTotal = 0
  let charTotal = 0

  ordered.forEach((row, rank) => {
    // Rank decay, not time decay. Ten conversations ago is ten conversations ago
    // whether that was last night or last spring.
    const w = Math.pow(RECENCY_DECAY, rank)
    turnTotal += row.turns

    const prior = charW.get(row.characterId)
    charW.set(row.characterId, {
      name: row.name,
      weight: (prior?.weight || 0) + w,
      turns: (prior?.turns || 0) + row.turns,
    })
    if (row.category) catW.set(row.category, (catW.get(row.category) || 0) + w)
    for (const t of tokenize(row.sample)) themeW.set(t, (themeW.get(t) || 0) + w)
    charTotal += row.sample.length
  })

  const charSum = Array.from(charW.values()).reduce((a, c) => a + c.weight, 0) || 1
  const catSum = Array.from(catW.values()).reduce((a, b) => a + b, 0) || 1
  const themeSum = Array.from(themeW.values()).reduce((a, b) => a + b, 0) || 1

  const characters = Array.from(charW.entries())
    .map(([characterId, c]) => ({
      characterId,
      name: c.name,
      weight: round2(c.weight / charSum),
      turns: c.turns,
    }))
    .sort((a, b) => b.weight - a.weight || a.characterId - b.characterId)

  const categories = Array.from(catW.entries())
    .map(([category, w]) => ({ category, weight: round2(w / catSum) }))
    .sort((a, b) => b.weight - a.weight || a.category.localeCompare(b.category))

  const themes = Array.from(themeW.entries())
    .map(([token, w]) => ({ token, weight: round2(w / themeSum) }))
    .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token))
    .slice(0, 24)

  const conversations = ordered.length
  const meanLen = conversations ? charTotal / conversations : 0
  const style: TasteProfile['style'] =
    meanLen > 900 ? 'expansive' : meanLen > 260 ? 'conversational' : 'terse'

  return {
    conversations,
    characters,
    categories,
    themes,
    depth: conversations ? Math.round(turnTotal / conversations) : 0,
    breadth: conversations ? Math.round((charW.size / conversations) * 100) : 0,
    style,
    signal: clamp(Math.round((conversations / WARM_AT) * 60 + Math.min(themes.length, 20) * 2), 0, 100),
    cold: conversations < WARM_AT,
  }
}

/* -------------------------------------------------------------- retrieval */

export type CharacterSeed = {
  id: number
  name: string
  tagline: string
  description: string
  persona: string
  category: string
  avatar: string
}

/** Everything the ranker reads about a character, computed once. */
type CandidateText = { tokens: Set<string>; axisHits: Map<AxisId, number> }

function readCharacterText(c: CharacterSeed): CandidateText {
  const tokens = new Set(tokenize(`${c.name} ${c.tagline} ${c.description} ${c.persona} ${c.category}`))
  const axisHits = new Map<AxisId, number>()
  for (const axis of AXES) {
    let n = 0
    for (const w of axis.lexicon) if (tokens.has(w)) n++
    if (n) axisHits.set(axis.id, n)
  }
  return { tokens, axisHits }
}

/**
 * Stage 1 — retrieval. A rough prior over the whole pool, cut to CANDIDATE_POOL.
 * Cheap on purpose: this runs over every character, so it may only do set lookups.
 */
export function retrieve(
  pool: CharacterSeed[],
  profile: TasteProfile,
  vibe: VibeRead,
): { character: CharacterSeed; text: CandidateText; prior: number }[] {
  const affinity = new Map(profile.characters.map((c) => [c.characterId, c.weight]))
  const catAffinity = new Map(profile.categories.map((c) => [c.category, c.weight]))
  const wanted = new Set(vibe.axes.map((a) => a.id))

  return pool
    .map((character) => {
      const text = readCharacterText(character)
      let prior = 0
      for (const id of wanted) if (text.axisHits.has(id)) prior += 2
      for (const t of vibe.freeform) if (text.tokens.has(t)) prior += 1.5
      prior += (affinity.get(character.id) || 0) * 3
      prior += (catAffinity.get(character.category) || 0) * 2
      // A floor keeps the tail reachable on a cold profile or an unmatched vibe —
      // with a zero floor a brand-new user would retrieve nothing at all.
      prior += jitter(`retrieve:${character.id}`) * 0.4
      return { character, text, prior: round2(prior) }
    })
    .sort((a, b) => b.prior - a.prior || a.character.id - b.character.id)
    .slice(0, CANDIDATE_POOL)
}

/* ---------------------------------------------------------------- ranking */

export type Scored = {
  character: CharacterSeed
  /** 0–100 per signal, before weighting. The card shows these. */
  signals: Record<SignalId, number>
  /** 0–100 weighted total. */
  match: number
  /** Which axes this character actually reads as. */
  axes: AxisId[]
  /** Plain-language reason, kernel-authored. The model may replace it. */
  because: string
}

function describeWhy(
  c: CharacterSeed,
  signals: Record<SignalId, number>,
  axes: AxisId[],
  profile: TasteProfile,
  vibe: VibeRead,
): string {
  const parts: string[] = []
  if (axes.length) {
    const named = axes.slice(0, 2).map((a) => AXIS_BY_ID[a].label.toLowerCase())
    parts.push(`reads ${named.join(' and ')}`)
  }
  if (signals.affinity >= 40) {
    parts.push('sits close to conversations you keep returning to')
  } else if (signals.novelty >= 70) {
    parts.push('is ground you have not covered yet')
  }
  if (signals.vibeFit >= 60 && vibe.freeform.length) {
    const shared = vibe.freeform.filter((t) => tokenize(`${c.tagline} ${c.description} ${c.persona}`).includes(t))
    if (shared.length) parts.push(`picks up "${shared.slice(0, 2).join('", "')}" from your prompt`)
  }
  if (!parts.length) {
    parts.push(profile.cold ? 'is a strong opening pick while the profile is still thin' : 'balances the rest of the slate')
  }
  return `${c.name} ${parts.join(', ')}.`
}

/** Stage 2 — ranking. Every number here is shown to the user somewhere. */
export function rank(
  candidates: { character: CharacterSeed; text: CandidateText; prior: number }[],
  profile: TasteProfile,
  vibe: VibeRead,
  seed: string,
): Scored[] {
  const affinity = new Map(profile.characters.map((c) => [c.characterId, c.weight]))
  const catAffinity = new Map(profile.categories.map((c) => [c.category, c.weight]))
  const themeW = new Map(profile.themes.map((t) => [t.token, t.weight]))
  const topAffinity = profile.characters[0]?.weight || 1

  return candidates
    .map(({ character, text }) => {
      // AFFINITY — direct history with this character, with the category as a
      // fallback so an unmet character in a category you live in isn't scored 0.
      const direct = (affinity.get(character.id) || 0) / topAffinity
      const viaCategory = (catAffinity.get(character.category) || 0) * 0.6
      const affinityScore = clamp((direct * 0.75 + viaCategory * 0.25) * 100, 0, 100)

      // VIBE FIT — axis overlap weighted by how much the prompt wants each axis,
      // plus literal hits on the freeform tokens.
      let fit = 0
      for (const a of vibe.axes) {
        const hits = text.axisHits.get(a.id) || 0
        if (hits) fit += (a.weight / 100) * Math.min(hits, 4) * 22
      }
      for (const t of vibe.freeform) if (text.tokens.has(t)) fit += 9
      // A profile theme that also appears in the character is weaker evidence
      // than the prompt itself, so it contributes at a third of the weight.
      for (const [token, w] of themeW) if (text.tokens.has(token)) fit += w * 30
      const vibeScore = clamp(Math.round(fit), 0, 100)

      // NOVELTY — the exploration side. Familiarity is the inverse of affinity.
      const familiar = clamp((affinity.get(character.id) || 0) / topAffinity, 0, 1)
      const noveltyScore = clamp(Math.round((1 - familiar) * 100 * vibe.noveltyBias), 0, 100)

      // SPARK — seeded, so two runs of the same seed agree and two different
      // prompts do not return the same four cards forever.
      const sparkScore = Math.round(jitter(`${seed}:${character.id}`) * 100)

      const signals: Record<SignalId, number> = {
        affinity: Math.round(affinityScore),
        vibeFit: vibeScore,
        novelty: noveltyScore,
        spark: sparkScore,
      }
      const match = Math.round(
        signals.affinity * WEIGHTS.affinity +
          signals.vibeFit * WEIGHTS.vibeFit +
          signals.novelty * WEIGHTS.novelty +
          signals.spark * WEIGHTS.spark,
      )
      const axes = Array.from(text.axisHits.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([id]) => id)

      return {
        character,
        signals,
        match: clamp(match, 0, 100),
        axes,
        because: describeWhy(character, signals, axes, profile, vibe),
      }
    })
    .sort((a, b) => b.match - a.match || a.character.id - b.character.id)
}

/**
 * Stage 3 — diversity. Greedy: take the best, then discount anything sharing a
 * category with what is already on the slate, then take the best again. Without
 * this the top four are almost always four of the same category, which reads as
 * a broken recommender even when every individual score is right.
 */
export function diversify(scored: Scored[], size = SLATE_SIZE): Scored[] {
  const picked: Scored[] = []
  const taken = new Set<string>()
  const pool = [...scored]

  while (picked.length < size && pool.length) {
    let bestIndex = 0
    let bestValue = -1
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i]
      const penalized = taken.has(s.character.category) ? s.match * (1 - DIVERSITY_PENALTY) : s.match
      if (penalized > bestValue) {
        bestValue = penalized
        bestIndex = i
      }
    }
    const [chosen] = pool.splice(bestIndex, 1)
    taken.add(chosen.character.category)
    picked.push(chosen)
  }
  return picked
}

/* ------------------------------------------------------------- the slate */

export type Recommendation = {
  characterId: number
  characterName: string
  avatar: string
  category: string
  title: string
  scenario: string
  /** The suggested first message, pre-filled into the composer. */
  opener: string
  vibeMatch: string
  match: number
  signals: Record<SignalId, number>
  axes: AxisId[]
  /** True when the scenario came from the kernel rather than the model. */
  drafted: boolean
}

export type Slate = {
  seed: string
  vibe: VibeRead
  profile: TasteProfile
  recommendations: Recommendation[]
  /** How the slate was produced, for the footer line. */
  provenance: 'agentic' | 'kernel'
  note: string
}

// Scenario shells for the kernel's own draft. Kept few and plain — a fallback
// that tries to sound like the model is worse than one that reads as a stub.
const SHELLS = [
  (c: string, a: string) => `Open on ${c} mid-${a}, already halfway through something they will not explain yet.`,
  (c: string, a: string) => `You arrive with one question for ${c}. The ${a} is theirs; the question is yours.`,
  (c: string, a: string) => `${c} has been waiting. Set the ${a} yourself in the first line.`,
  (c: string, a: string) => `A ${a} scene with ${c}, starting at the part everyone else would cut.`,
]

const OPENERS = [
  (c: string) => `${c} — start us somewhere I would not have thought of.`,
  (c: string) => `Set the scene, ${c}. I will pick it up from your first line.`,
  (c: string) => `${c}, what is the situation, and what do you need from me?`,
  (c: string) => `Take the lead, ${c}. Skip the preamble.`,
]

/** Kernel-authored scenario. Deterministic in the seed and the character id. */
export function draftScenario(s: Scored, vibe: VibeRead, seed: string): Recommendation {
  const axisLabel = (s.axes[0] && AXIS_BY_ID[s.axes[0]].label.toLowerCase()) ||
    (vibe.dominant && AXIS_BY_ID[vibe.dominant].label.toLowerCase()) ||
    'open'
  const i = hash(`${seed}:shell:${s.character.id}`) % SHELLS.length
  const j = hash(`${seed}:opener:${s.character.id}`) % OPENERS.length
  const titleAxis = (s.axes[0] && AXIS_BY_ID[s.axes[0]].label) ||
    (vibe.dominant && AXIS_BY_ID[vibe.dominant].label) || 'Open'

  return {
    characterId: s.character.id,
    characterName: s.character.name,
    avatar: s.character.avatar,
    category: s.character.category,
    title: `${titleAxis} · ${s.character.name}`,
    scenario: SHELLS[i](s.character.name, axisLabel),
    opener: OPENERS[j](s.character.name),
    vibeMatch: s.because,
    match: s.match,
    signals: s.signals,
    axes: s.axes,
    drafted: true,
  }
}

/**
 * The whole kernel, end to end. The API route calls this, hands the result to the
 * model for scenario writing, and merges the model's prose back over the drafts.
 * If that second half never happens the slate is still complete.
 */
export function buildSlate(input: {
  pool: CharacterSeed[]
  history: HistoryRow[]
  vibe: string
  seed: string
  size?: number
}): Slate {
  const profile = readTaste(input.history)
  const vibe = readVibe(input.vibe)
  const candidates = retrieve(input.pool, profile, vibe)
  const scored = rank(candidates, profile, vibe, input.seed)
  const picked = diversify(scored, input.size ?? SLATE_SIZE)

  return {
    seed: input.seed,
    vibe,
    profile,
    recommendations: picked.map((s) => draftScenario(s, vibe, input.seed)),
    provenance: 'kernel',
    note: profile.cold
      ? `Ranked from ${profile.conversations} conversation${profile.conversations === 1 ? '' : 's'} — the profile is still thin, so novelty is carrying most of this slate.`
      : `Ranked ${candidates.length} candidates against ${profile.conversations} conversations.`,
  }
}

/** The prompt the agentic layer answers. Built from a slate the kernel already chose. */
export function briefFor(slate: Slate): string {
  const lines: string[] = []
  lines.push(`REQUESTED VIBE: ${slate.vibe.text || '(none given)'}`)
  if (slate.vibe.axes.length) {
    lines.push(`VIBE AXES: ${slate.vibe.axes.map((a) => `${a.label} ${a.weight}%`).join(', ')}`)
  }
  if (slate.vibe.freeform.length) lines.push(`PROMPT TERMS: ${slate.vibe.freeform.join(', ')}`)

  lines.push('')
  lines.push('CHATTER PROFILE (from their own chat history):')
  lines.push(`- ${slate.profile.conversations} past conversations, ~${slate.profile.depth} turns each, ${slate.profile.style} writing style`)
  if (slate.profile.characters.length) {
    lines.push(`- most-talked-to: ${slate.profile.characters.slice(0, 5).map((c) => c.name).join(', ')}`)
  }
  if (slate.profile.categories.length) {
    lines.push(`- categories: ${slate.profile.categories.slice(0, 4).map((c) => `${c.category} ${Math.round(c.weight * 100)}%`).join(', ')}`)
  }
  if (slate.profile.themes.length) {
    lines.push(`- recurring themes: ${slate.profile.themes.slice(0, 12).map((t) => t.token).join(', ')}`)
  }

  lines.push('')
  lines.push('SHORTLIST — write one scenario for EACH of these, in this order. Do not substitute characters:')
  for (const r of slate.recommendations) {
    lines.push(`${r.characterId}. ${r.characterName} (${r.category}) — ${r.vibeMatch} Match ${r.match}%.`)
  }
  return lines.join('\n')
}
