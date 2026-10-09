// WondersClaw's local composer — the half that never needs the network.
//
// Same contract as ArtisticClaw's: pure, deterministic on (brief, dial, blend),
// no fetch and no clock, so an unreachable gateway leaves the panel usable
// rather than apologetic. Everything else about it is deliberately unlike its
// sibling.
//
// WHAT ACTUALLY DIFFERS, MECHANICALLY, NOT JUST IN TONE.
//
//   1. THE VOCABULARY IS INCIDENTS, NOT MATERIALS. ArtisticClaw reaches for opal,
//      nacre, gossamer, refract — words that describe what light DOES to a
//      surface. WondersClaw reaches for kiln, ricochet, ballast, blackout — words
//      that describe something HAPPENING. Both paint, because both are concrete;
//      they do not paint the same kind of thing.
//
//   2. IT LEAVES THE BRIEF INSTEAD OF READING IT. ArtisticClaw leads every seed
//      with one of the creator's own nouns. WondersClaw leads with its own event
//      word and puts the creator's noun second, where it is the thing being
//      acted on rather than the subject. That single swap is most of why the two
//      spreads do not read alike.
//
//   3. IT AIMS AT THE FAR END OF THE DIAL. ArtisticClaw picks anywhere on the
//      studio's axis. WondersClaw picks from the top third of it — the most
//      folds, the deepest decay — because a long shot is not taken from the
//      middle of the board.
//
//   4. ITS PER-SUGGESTION LINE IS A WAGER, NOT A FEELING. ArtisticClaw says what
//      a phrase will evoke. WondersClaw says what it is risking, because most of
//      these miss and a director that pretended otherwise would be selling
//      something. The wire field is still `feeling` — it is the slot for "one
//      short line about this suggestion", and forking the shape of a suggestion
//      to carry a differently-named string would buy nothing.
//
// The blend runs the other way here: `100 - blend` is how much ArtisticClaw is in
// this director, so at blend 100 nothing bleeds and this is pure WondersClaw.

import { normalizeSeed } from './art.js'
import type { ClawAxis, ClawSpread } from './claws.js'
import {
  EVENTS,
  MOTIONS,
  OBJECTS,
  QUALITIES,
  RESIDUES,
  STOPWORDS,
  WAGERS,
  WONDER_TITLES,
  bleeds,
  fnv1a,
} from './claw-words.js'

/**
 * The far end of the axis — the top third of the ladder.
 *
 * Deliberately a range rather than the single last rung: always returning the
 * maximum would make the dial suggestion a constant, and a director with one
 * opinion is not a director. On V3's five-rung decay ladder the top third is two
 * rungs; on V1's twelve-rung fold ladder it is four.
 */
export function farRung(axis: ClawAxis, h: number): number {
  const span = Math.max(1, Math.ceil(axis.values.length / 3))
  const i = axis.values.length - 1 - (h % span)
  return axis.values[Math.max(0, i)]
}

/**
 * A usable spread of long shots, composed on the box.
 *
 * Deterministic on (brief, dial, blend), so an unreachable gateway is a quieter
 * panel rather than a different one every time.
 */
export function composeWondersLocally(
  brief: string,
  axis: ClawAxis,
  grammar: 'phrase' | 'pair' = 'phrase',
  blend = 100,
): ClawSpread {
  const pull = 100 - blend
  const h = fnv1a(`wonders:${grammar}:${blend}:${normalizeSeed(brief)}`)
  const at = (list: string[], i: number) => list[(h + i * 2246822519) % list.length]

  const words = normalizeSeed(brief)
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  // No usable noun in the brief is not a problem here the way it is for a
  // director that reads the brief — this one was leaving anyway, so its own
  // object vocabulary stands in without changing what the spread is.
  const core = words.length ? words.slice(0, 4) : [at(OBJECTS, 1), at(OBJECTS, 6)]

  let borrowed = 0
  const suggestions = Array.from({ length: 5 }, (_, i) => {
    // The event LEADS. That is the inversion — the creator's noun is what the
    // incident happens to, not the subject of the picture.
    const verbs = bleeds(h, i, pull) ? MOTIONS : EVENTS
    if (verbs === MOTIONS) borrowed++
    const event = at(verbs, i * 3 + 1)
    const subject = core[i % core.length]
    const tail = bleeds(h, i + 17, pull) ? QUALITIES : RESIDUES
    const parts = grammar === 'pair' ? [event, subject] : [event, subject, at(tail, i * 5 + 2)]
    const seed = parts.filter((w, j, all) => all.indexOf(w) === j).join(' ')
    return {
      name: at(WONDER_TITLES, i * 7 + 3),
      seed,
      feeling: at(WAGERS, i * 11 + 5),
      claw: 'wonders' as const,
    }
  })

  const rung = farRung(axis, h)
  const dial =
    axis.kind === 'lineage'
      ? `${axis.label(rung)} — down the far end of the lineage, where there is least left to lose`
      : `${axis.label(rung)} — the busy end, where the field has nowhere to hide a weak seed`

  const bleedLine = borrowed
    ? ` ${borrowed === 1 ? 'One of them has' : `${borrowed} of them have`} a material word where the collision should be — ArtisticClaw leaning in through the entangle dial.`
    : ''

  const direction =
    `Taking ${core.slice(0, 2).join(' and ')} as somewhere to leave from rather than somewhere to arrive. ` +
    `Every phrase below leads with a collision and lets your own word be the thing it happens to, so none of ` +
    `these is a version of the brief — each is a bet placed near it. Aimed at ${dial}. Most will miss.${bleedLine}`

  return { direction, symmetry: rung, suggestions }
}
