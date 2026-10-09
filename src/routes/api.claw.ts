import { createFileRoute } from '@tanstack/react-router'
import { normalizeSeed } from '../lib/art.js'
import { isKnownStation, metricOf, seedWordsFor } from '../lib/art-registry.js'
import { normalizeMetric } from '../lib/art-discovery.js'
import { composeLocally, type SeedGrammar } from '../lib/artisticclaw.js'
import { composeWondersLocally } from '../lib/wondersclaw.js'
import { ARTISTIC_TITLES, WONDER_TITLES } from '../lib/claw-words.js'
import {
  SPREAD_SIZE,
  axisIndex,
  blendLabel,
  clawAt,
  clawCard,
  entangleDeal,
  entangleIndex,
  normalizeBlend,
  type ClawAxis,
  type ClawId,
  type ClawSpread,
  type Suggestion,
} from '../lib/claws.js'

// The claws — the Art Studios' prompt directors, entangled.
//
//   POST /api/claw
//     { brief, symmetry, station?, blend? }
//       → { direction, symmetry, suggestions[], source, deal, blend, claw, grammar }
//
// This replaces `/api/artisticclaw`, which did the same job for one director and
// one kind of dial. Two things forced the consolidation rather than a second
// route beside it:
//
//   THE DIAL IS NO LONGER A FOLD COUNT. The old route clamped whatever the model
//   suggested through `normalizeSymmetry`, which returns 2–16. V3's axis runs
//   0–4, so that route would have handed a V3 creator a "suggested decay" of 12
//   and the button under it would have done something else. The suggestion is now
//   clamped through the STATION's own axis.
//
//   ONE PRESS CAN NEED BOTH DIRECTORS. At a blend, some slots of the spread are
//   ArtisticClaw's and some are WondersClaw's, and they have different system
//   prompts. That is one request from the page and two calls from here, run
//   together — not two requests the page has to stitch.
//
// DEGRADATION IS PER CLAW, WHICH IS THE POINT OF DOING IT HERE.
//
// Each director is resolved independently to either the gateway or its own local
// composer. If one model call fails and the other does not, the spread comes
// back with the failed claw's slots composed on the box and the other claw's
// slots directed, and `source` says `mixed`. The creator still gets five usable
// phrases, and the note tells them which half came from where rather than
// pretending the whole spread is one thing.

const MODEL = 'claude-haiku-4-5'

/* -------------------------------------------------------------------- prompts */

/** The JSON contract, with the station's own ladder spliced into it. */
function sharedRules(axis: ClawAxis, lineKind: 'feeling' | 'wager', seedRule: string): string {
  const values = axis.values.join(', ')
  const lineSpec =
    lineKind === 'wager'
      ? '"<one short line on what this long shot is RISKING — not what it will feel like. 6-14 words. Be honest that it may miss.>"'
      : '"<one short line on the feeling it evokes, 6-12 words>"'
  return `Respond with a single minified JSON object and nothing else. No markdown, no code fences, no commentary. Shape:
{"direction":"<one line of concrete art direction. 25-45 words.>","symmetry":<integer, one of ${values}>,"suggestions":[{"name":"<2-3 word title, evocative, never 'Option 1'>","seed":"<${seedRule}>","feeling":${lineSpec}}, ... five of them]}

Rules:
- Seeds are lowercase, no punctuation, no digits.
- The five seeds must differ from each other meaningfully, not by a synonym swap.
- "symmetry" is this studio's ${axis.name} dial. Its only legal values are ${values}. Pick one and say why in the direction line.`
}

/** What the station's second axis IS, in the director's own briefing. */
function axisBriefing(axis: ClawAxis): string {
  return axis.kind === 'lineage'
    ? `This studio's dial is ${axis.name}, and it is a LINEAGE rather than a set of views: each rung is produced by running a destructive pass over the rung below it, so a higher number is a descendant of a lower one and not another angle on it. The rungs read: ${axis.values.map((v) => axis.label(v)).join('; ')}.`
    : `This studio's dial is ${axis.name}, and its rungs are VIEWS of one field — no rung is descended from another. The rungs read: ${axis.values.map((v) => axis.label(v)).join('; ')}.`
}

/** What the seed means at this station. */
function seedBriefing(grammar: SeedGrammar): { intro: string; rule: string } {
  if (grammar === 'pair') {
    return {
      intro: `The seed is TWO WORDS and they do different jobs: the FIRST grows the COLOUR, the SECOND grows the STRUCTURE. Only the first two words are read — a third is discarded.`,
      rule: '<colour word> <structure word> — exactly 2 lowercase words',
    }
  }
  return {
    intro: `The seed is a whole phrase, hashed as one number, so there is no half of it to hold still — one changed letter deals the entire piece again.`,
    rule: '2-4 lowercase words, sensory and concrete',
  }
}

function artisticSystem(axis: ClawAxis, grammar: SeedGrammar): string {
  const seed = seedBriefing(grammar)
  return `You are ArtisticClaw, a prompt director for the CharacterVerse Art Studios.

You are the CONVERGENT director. Given a brief, you return FIVE seed phrases that are each a defensible reading OF THAT BRIEF, exploring it from different distances. Nothing you hand back should surprise the creator; it should be better than what they would have typed. Your vocabulary is materials and light — opal, nacre, cinder, undertow, solder, gossamer — never emotional abstractions and never abstract nouns like "concept", "system" or "value", which paint mud.

${seed.intro}

${axisBriefing(axis)}

${sharedRules(axis, 'feeling', seed.rule)}`
}

function wondersSystem(axis: ClawAxis, grammar: SeedGrammar): string {
  const seed = seedBriefing(grammar)
  return `You are WondersClaw, a prompt director for the CharacterVerse Art Studios. You direct ONE HIT WONDERS.

You are the DIVERGENT director, and you are not ArtisticClaw with louder adjectives. Given a brief, you treat it as somewhere to LEAVE FROM rather than somewhere to arrive. Each of your five seeds LEADS with a collision or an incident and lets the creator's own subject be the thing it happens to. Your vocabulary is events and blunt objects — rupture, ricochet, blackout, kiln, ballast, klaxon, slag, flashover — never jewels, never silk, never light-on-a-surface words.

You aim at the FAR END of the dial, not the middle: a long shot is not taken from the safe rung.

You are honest about the odds. Most of these will miss, and the "feeling" field is where you say what each one is RISKING rather than what it will evoke. Never claim a long shot is safe.

${seed.intro}

${axisBriefing(axis)}

${sharedRules(axis, 'wager', seed.rule)}`
}

function userPrompt(brief: string, axis: ClawAxis, grammar: SeedGrammar): string {
  const lines = [
    `Brief from the creator:\n"""${brief}"""`,
    `They are currently sitting at ${axis.label(axis.current)} on the ${axis.name} dial — suggest a different rung only if the brief genuinely wants one.`,
  ]
  if (grammar === 'pair') lines.push('Remember: exactly two words per seed — colour word first, structure word second.')
  lines.push('Now return the JSON object.')
  return lines.join('\n\n')
}

/* ------------------------------------------------------------------- parsing */

function extractJson(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * A suggestion is only usable if it carries a seed that will actually paint —
 * and "actually paint" is station-specific. A pair station gets its seed cut to
 * two words HERE rather than trusted to arrive that way, so a model that ignored
 * the word count cannot put a third word in front of a creator that their piece
 * will never use.
 */
function cleanSuggestions(raw: unknown, fallbackNames: string[], grammar: SeedGrammar, claw: ClawId): Suggestion[] {
  if (!Array.isArray(raw)) return []
  const limit = grammar === 'pair' ? 2 : 5
  const out: Suggestion[] = []
  for (const item of raw) {
    const seed = normalizeSeed((item as any)?.seed).split(' ').slice(0, limit).join(' ')
    if (!seed || seed.length < 3) continue
    // A pair station needs both halves; one word would leave the structure seed
    // on its fallback and the suggestion would not be the piece it described.
    if (grammar === 'pair' && seed.split(' ').length < 2) continue
    if (out.some((s) => s.seed === seed)) continue
    out.push({
      name: String((item as any)?.name || fallbackNames[out.length] || 'Untitled seed').trim().slice(0, 60),
      seed,
      feeling: String((item as any)?.feeling || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      claw,
    })
    if (out.length >= 6) break
  }
  return out
}

/* ------------------------------------------------------------- one director */

type Directed = ClawSpread & { source: 'gateway' | 'local' }

/**
 * Ask one claw, falling back to its own local composer.
 *
 * A spread with one or two usable phrases is worse than a full local one — a
 * director that only half-answered is not a director — so anything under three
 * usable suggestions is thrown away and composed on the box instead.
 */
async function direct(
  claw: ClawId,
  brief: string,
  axis: ClawAxis,
  grammar: SeedGrammar,
  blend: number,
): Promise<Directed> {
  const local = (): Directed => ({
    ...(claw === 'wonders'
      ? composeWondersLocally(brief, axis, grammar, blend)
      : composeLocally(brief, axis, grammar, blend)),
    source: 'local',
  })

  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return local()

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
        max_tokens: 1200,
        system: claw === 'wonders' ? wondersSystem(axis, grammar) : artisticSystem(axis, grammar),
        messages: [{ role: 'user', content: userPrompt(brief, axis, grammar) }],
      }),
    })
    if (!res.ok) return local()

    const data = await res.json()
    const text = Array.isArray(data?.content) ? data.content.map((b: any) => b?.text || '').join('') : ''
    const parsed = extractJson(text)
    const suggestions = cleanSuggestions(
      parsed?.suggestions,
      claw === 'wonders' ? WONDER_TITLES : ARTISTIC_TITLES,
      grammar,
      claw,
    )
    if (suggestions.length < 3) return local()

    // Clamped onto the axis the station actually has, so a model that answered
    // with a fold count at a decay station cannot put a button in front of the
    // creator that does something other than what it says.
    const rung = axis.values.includes(Number(parsed?.symmetry))
      ? Number(parsed?.symmetry)
      : axis.current
    return {
      direction: String(parsed?.direction || '').replace(/\s+/g, ' ').trim().slice(0, 700),
      symmetry: rung,
      suggestions,
      source: 'gateway',
    }
  } catch {
    return local()
  }
}

/* ---------------------------------------------------------------- the handler */

export const Route = createFileRoute('/api/claw')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const brief = String(body?.brief || '').replace(/\s+/g, ' ').trim().slice(0, 600)
        if (!brief) {
          return Response.json({ error: 'Describe a vibe, a mood or a character first.' }, { status: 400 })
        }

        const station = String(body?.station || '')
        const known = isKnownStation(station)
        // An unknown or absent station falls back to V1's ladder and the phrase
        // grammar, which is what every caller before V2 existed sent and expected.
        const metric = (known ? metricOf(station) : undefined) || {
          name: 'symmetry',
          values: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16],
          label: (v: number) => `${v}-fold`,
          kind: 'views' as const,
        }
        const axis: ClawAxis = {
          name: metric.name,
          kind: metric.kind,
          values: metric.values,
          label: metric.label,
          current: known ? normalizeMetric(station, body?.symmetry) : metric.values[0],
        }

        // Which grammar a station wants comes off its own card, not off the studio
        // it belongs to: two V2 stations split their seed into a colour word and a
        // second word, the other two read a whole phrase or a strand, and V3's
        // station reads a whole phrase.
        const grammar: SeedGrammar = known && seedWordsFor(station) === 2 ? 'pair' : 'phrase'

        const blend = normalizeBlend(body?.blend)
        const deal = entangleDeal(brief, blend, SPREAD_SIZE)
        const needsArtistic = deal.includes('artistic')
        const needsWonders = deal.includes('wonders')

        // Both directors at once when the deal wants both. Sequential would double
        // the wait for no reason — neither reads the other's answer.
        const [artistic, wonders] = await Promise.all([
          needsArtistic ? direct('artistic', brief, axis, grammar, blend) : Promise.resolve(null),
          needsWonders ? direct('wonders', brief, axis, grammar, blend) : Promise.resolve(null),
        ])

        // Fill the deal slot by slot, taking each claw's suggestions in order. A
        // duplicate seed across the two claws is dropped and the slot falls to the
        // other director rather than to nothing, so the spread stays five long.
        const taken = { artistic: 0, wonders: 0 }
        const spreads: Record<ClawId, Directed | null> = { artistic, wonders }
        const suggestions: Suggestion[] = []
        const fill = (claw: ClawId): boolean => {
          const list = spreads[claw]?.suggestions
          if (!list) return false
          while (taken[claw] < list.length) {
            const next = list[taken[claw]++]
            if (suggestions.some((s) => s.seed === next.seed)) continue
            suggestions.push(next)
            return true
          }
          return false
        }
        for (const claw of deal) {
          if (fill(claw)) continue
          fill(claw === 'artistic' ? 'wonders' : 'artistic')
        }

        // The dial is interpolated rather than dealt — see `entangleIndex`. With
        // one claw asked, its own pick stands.
        const rung =
          artistic && wonders
            ? axis.values[
                Math.max(
                  0,
                  Math.min(
                    axis.values.length - 1,
                    entangleIndex(
                      axis.values.indexOf(artistic.symmetry),
                      axis.values.indexOf(wonders.symmetry),
                      blend,
                    ),
                  ),
                )
              ]
            : (artistic || wonders)?.symmetry ?? axis.values[axisIndex(axis)]

        // The lead slot's director writes the direction line, so the paragraph and
        // the phrase under it agree about what kind of spread this is. At a blend
        // one sentence is added naming the split, because a creator reading a
        // convergent paragraph over three long shots would be misled.
        const lead = deal[0]
        const wondersCount = deal.filter((c) => c === 'wonders').length
        const base = spreads[lead]?.direction || spreads[lead === 'artistic' ? 'wonders' : 'artistic']?.direction || ''
        const entangleNote =
          clawAt(blend) === 'entangled'
            ? ` Entangled at ${blend}: ${wondersCount} of these ${SPREAD_SIZE} are WondersClaw long shots, the rest ArtisticClaw readings — and moving the blend re-deals all five rather than adding to them.`
            : ''

        const sources = [artistic?.source, wonders?.source].filter(Boolean)
        const source = sources.every((s) => s === 'gateway')
          ? 'gateway'
          : sources.every((s) => s === 'local')
            ? 'local'
            : 'mixed'

        const who = clawAt(blend) === 'entangled' ? 'ArtisticClaw and WondersClaw' : clawCard(clawAt(blend) as ClawId).name
        const note =
          source === 'gateway'
            ? `Directed by ${who} on the managed AI gateway.`
            : source === 'local'
              ? `Composed in the studio — the AI gateway was unavailable, so these came from your own words and the claws’ own vocabularies.`
              : `Half-directed: one claw answered on the gateway, the other was composed in the studio from your own words.`

        return Response.json({
          direction: (base + entangleNote).trim(),
          symmetry: normalizeMetric(station, rung),
          suggestions: suggestions.slice(0, SPREAD_SIZE),
          source,
          note,
          grammar,
          blend,
          claw: clawAt(blend),
          blendLabel: blendLabel(blend),
          deal,
        })
      },
    },
  },
})
