// The claws' vocabularies — both of them, in one file, on purpose.
//
// ArtisticClaw reaches for materials and light. WondersClaw reaches for incidents
// and collisions. Those are two halves of one vocabulary space, and the reason
// they are declared side by side rather than each inside its own composer is the
// ENTANGLEMENT: at a blend, each claw draws some of its words from the other's
// list. A director entangled at 40 is not ArtisticClaw taking three of five
// slots — it is ArtisticClaw whose verbs are 40% likely to be somebody else's.
//
// Written the other way — each vocabulary private to its composer — the bleed
// would need the two composers to import each other, which is a cycle. Written
// this way there is no cycle and the crossing is visible: the two lists that
// swap are adjacent in the file.
//
//   MOTIONS  ⟷  EVENTS      what the verb slot can be
//   QUALITIES ⟷ RESIDUES    what the trailing light/aftermath word can be
//
// The nouns do NOT swap. MATERIALS and OBJECTS only ever stand in for a missing
// subject, and a brief either has a subject or it does not — that is not a thing
// a blend has an opinion about.

/* ------------------------------------------------------- ArtisticClaw's words */

/** Concrete material words, grouped by what they do to light. */
export const MOTIONS = ['shatter', 'refract', 'unfold', 'drift', 'split', 'bloom', 'scatter', 'fold', 'thrum', 'wake']
export const MATERIALS = ['opal', 'nacre', 'obsidian', 'quartz', 'copper', 'gossamer', 'basalt', 'vapour', 'solder', 'kelp']
export const QUALITIES = ['shimmer', 'echo', 'undertow', 'hush', 'static', 'radiance', 'silt', 'plume', 'coil', 'frost']

export const ARTISTIC_TITLES = [
  'Prismatic Cascade', 'Iridescent Bloom', 'Crystalline Rupture', 'Pearlescent Drift',
  'Mirrored Fragmentation', 'Tidal Refraction', 'Ember Lattice', 'Vitreous Hush',
  'Fractured Aurora', 'Sable Resonance',
]

export const FEELINGS = [
  'Light fracturing into infinite scattered rainbows',
  'Soft expansion of mother-of-pearl luminescence',
  'Sharp geometric shattering with an internal glow',
  'Translucent layers drifting through luminous space',
  'Recursive reflection of broken light into itself',
  'A slow pull, the way water takes a stone',
  'Heat held in a structure that refuses to melt',
  'Silence with a hard, glassy edge to it',
  'Cold colour tearing along a clean seam',
  'Depth that keeps one colour and loses the rest',
]

/* -------------------------------------------------------- WondersClaw's words */

/** Things that happen. Where ArtisticClaw has motions, this has incidents. */
export const EVENTS = [
  'rupture', 'ricochet', 'blackout', 'landslide', 'overload',
  'misfire', 'flashover', 'collapse', 'stampede', 'jackpot',
]

/** Blunt, unlovely, entirely concrete nouns. No jewels, no silk. */
export const OBJECTS = [
  'kiln', 'junkyard', 'klaxon', 'ballast', 'anvil',
  'trawler', 'pylon', 'gantry', 'derrick', 'sluice',
]

/** What the incident leaves behind. */
export const RESIDUES = [
  'cinder', 'slag', 'scorch', 'grit', 'rust',
  'sump', 'ash', 'brine', 'tar', 'chaff',
]

/** Titles that sound like something unrepeatable. */
export const WONDER_TITLES = [
  'One Good Shot', 'Beginner’s Luck', 'The Only Take', 'Struck Once', 'Last Reel',
  'Nothing To Lose', 'Fluke Weather', 'Two Minutes Flat', 'Never Again', 'Called It',
]

/**
 * What each long shot is risking. Not moods — odds.
 *
 * These are honest about the hit rate on purpose. A director that promised five
 * wonders would be a director you stopped believing after the second spread.
 */
export const WAGERS = [
  'Probably mud. If it lands, it lands enormous.',
  'Too much happening. One of these collisions will be the piece.',
  'Might come out flat. Might come out unrepeatable.',
  'A bad idea four times out of five.',
  'No middle outcome here — either striking or a mess.',
  'Reads wrong on paper. Sometimes that is the whole trick.',
  'Betting the whole frame on one collision.',
  'Nothing subtle survives this. That is the wager.',
  'Half of these die dark. The other half do not.',
  'Cheap to try, expensive to ignore if it works.',
]

/* ------------------------------------------------------------------- shared */

export const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'with', 'that', 'this', 'like', 'into', 'from', 'some',
  'make', 'give', 'want', 'something', 'piece', 'art', 'please', 'very', 'really', 'about',
  'kind', 'sort', 'feel', 'feels', 'feeling', 'looks', 'look', 'more', 'less', 'but', 'it',
])

export function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Whether a given word slot bleeds across to the other claw's vocabulary.
 *
 * `pull` is how much of the OTHER claw is in this director: `blend` for
 * ArtisticClaw, `100 - blend` for WondersClaw. Both endpoints are therefore
 * exact by construction — at pull 0 the comparison is `x < 0`, which is never
 * true, so a pure spread cannot contain one borrowed word.
 *
 * Per SLOT rather than per spread, so an entangled director is genuinely mixed
 * inside one phrase rather than being one claw or the other for the whole press.
 */
export function bleeds(h: number, slot: number, pull: number): boolean {
  if (pull <= 0) return false
  if (pull >= 100) return true
  return (h + slot * 40503) % 100 < pull
}
