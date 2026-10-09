// ArtisticClaw's local composer — the half that never needs the network.
//
// Lives in lib rather than in the route because it is pure (no fetch, no clock,
// no Math.random) and because it is the part worth testing directly: the promise
// is that an unavailable gateway leaves the panel usable, not that it leaves the
// panel apologetic. Deterministic on (brief, dial, blend), so the same brief
// always directs the same way.
//
// Two things about the signature changed when WondersClaw arrived, and both were
// forced rather than tidying:
//
//   THE DIAL IS A `ClawAxis`, not a fold count. Both studios that existed when
//   this was written had a fold ladder. V3's second axis is generations of decay,
//   and "folded 3 times" is not a sentence that can be said about it.
//
//   THE BLEND IS AN ARGUMENT. At a blend, this director's verb slots draw from
//   WondersClaw's incident vocabulary with probability `blend`. That is what makes
//   the entangle dial change what comes back rather than only reshuffling which
//   claw filled which row — see `src/lib/claws.ts`. At blend 0 nothing bleeds and
//   the output is what it always was.

import { normalizeSeed } from './art.js'
import { axisIndex, type ClawAxis, type ClawSpread } from './claws.js'
import {
  ARTISTIC_TITLES,
  EVENTS,
  FEELINGS,
  MATERIALS,
  MOTIONS,
  QUALITIES,
  RESIDUES,
  STOPWORDS,
  bleeds,
  fnv1a,
} from './claw-words.js'

export type SeedGrammar = 'phrase' | 'pair'

/**
 * A usable spread composed on the box.
 *
 * Deterministic on the brief, so an unreachable gateway is a quieter panel
 * rather than a different one every time you press the button. The creator's own
 * words LEAD each phrase — that is the inversion WondersClaw's composer runs the
 * other way — and the studio's material vocabulary supplies the verb and the
 * light. That is enough to paint, which is the only bar a fallback has to clear.
 */
export function composeLocally(
  brief: string,
  axis: ClawAxis,
  grammar: SeedGrammar = 'phrase',
  blend = 0,
): ClawSpread {
  // The blend is in the key, so an entangled press is a different deal rather
  // than the same deal with rows swapped.
  const h = fnv1a(`claw:${grammar}:${blend}:${normalizeSeed(brief)}`)
  const at = (list: string[], i: number) => list[(h + i * 2654435761) % list.length]

  const words = normalizeSeed(brief)
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  // An empty or all-stopword brief still has to paint something, so the material
  // vocabulary stands in for the subject rather than the panel going blank.
  const core = words.length ? words.slice(0, 4) : [at(MATERIALS, 0), at(MATERIALS, 4)]

  let borrowed = 0
  const suggestions = Array.from({ length: 5 }, (_, i) => {
    const lead = core[i % core.length]
    // A pair is colour-word then style-word, so the creator's own noun leads and
    // one material verb follows. A phrase gets the third light word as well.
    // The motion is stepped off the lead when they collide, because a pair that
    // dedupes down to one word loses its style half to the fallback.
    const verbs = bleeds(h, i, blend) ? EVENTS : MOTIONS
    if (verbs === EVENTS) borrowed++
    let motion = at(verbs, i * 3 + 1)
    if (motion === lead) motion = at(verbs, i * 3 + 2)
    const tail = bleeds(h, i + 17, blend) ? RESIDUES : QUALITIES
    const parts = grammar === 'pair' ? [lead, motion] : [lead, motion, at(tail, i * 5 + 2)]
    const seed = parts.filter((w, j, all) => all.indexOf(w) === j).join(' ')
    return {
      name: at(ARTISTIC_TITLES, i * 7 + 3),
      seed,
      feeling: at(FEELINGS, i * 11 + 5),
      claw: 'artistic' as const,
    }
  })

  // A rung off the brief itself, nudged by whatever the creator is already on, so
  // the local spread has an opinion without ignoring the current dial. Anywhere
  // on the ladder — the far-end bias is WondersClaw's, not this one's.
  const rung = axis.values[(h + axisIndex(axis)) % axis.values.length]

  // Two axis kinds, two sentences, because there is no wording true of both. A
  // fold count is a set of views of one field and the prose can talk about
  // rhythm and repetition; a decay generation is a descent and the prose has to
  // talk about what survives it.
  const dialLine =
    axis.kind === 'lineage'
      ? `At ${axis.label(rung)} the composition is still legible under the damage rather than buried by it.`
      : grammar === 'pair'
        ? `Folded to ${axis.label(rung)} those breaks become a repeating rhythm; left unfolded they stay one continuous surface.`
        : `${axis.label(rung)} locks those crossings into a repeating rhythm instead of a single hot centre.`

  const bleedLine = borrowed
    ? ` ${borrowed === 1 ? 'One phrase has' : `${borrowed} phrases have`} an incident word in place of a material one — that is the entanglement reaching into the wording, not just into the running order.`
    : ''

  const direction =
    grammar === 'pair'
      ? `The brief reads as ${core.slice(0, 3).join(', ')} — so the first word carries the colour and the second ` +
        `decides how hard the field breaks up. ${dialLine} Each pair below shifts the colour word or the style word, not both.${bleedLine}`
      : `The brief reads as ${core.slice(0, 3).join(', ')} — so the light wants to travel in long arcs and ` +
        `pile up only where the arcs cross. ${dialLine} Each seed below takes the brief at a different distance.${bleedLine}`

  return { direction, symmetry: rung, suggestions }
}
