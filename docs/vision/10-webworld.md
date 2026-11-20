# 10. WebWorld — SpatialVerse, worlds, Agent Eyes

**Status:** ✔ Spatial DOM (`src/lib/spatial-dom.ts`: typed node tree in
metres, derived relations on/in/near/above/below/left/right, ordinals along
the spread axis, a query grammar that round-trips to words), `spatial_scenes`,
`spatial_rooms`, the Virtual Library scene (`src/lib/spatial-scenes.ts`), six
fixed kinds (`SDOM_KINDS`), built-in `SYNONYMS`. ○ Everything below.

## Queries to test

| Query | Status |
|---|---|
| the digital book located on the second shelf of the virtual library | ✔ documented example |
| the third book from the left on the top shelf of bookcase b | check "top" and named nodes |
| the sculpture on the plinth | ✔ |
| the usb drive in the top drawer | check "top" |
| the plant above the desk | ✔ |
| the second painting on the east wall | ⚠ needs compass — add optional `north` per world |

## From spaces to worlds

```
 worlds.example.com            ← Main World (SDOM document)
 └── /r/community              ← Sub-World (linked by a portal node)
```

Portal nodes link documents; the address scopes search; rooms become
sub-worlds; `world:` / `in:` operators. **Only the owner opens a world** —
CharacterVerse can't create worlds on other people's domains; others publish
their own.

## The bigger play

Publishers self-host their worlds. CharacterVerse provides the **layer
underneath and across**: the open SDOM standard (like HTML), SpatialVerse
Search (like Google), WWB (like Chrome), the agent layer (HTMLA actions,
HTTPAS, HCS, EALA), characters that visit any world, and world-building tools.
Revenue: labelled contextual sponsored results, verified-world certificates,
character/agent gas, tools and hosting for the long tail, privacy-safe
analytics. Requires an open spec, versioning, a free validator, and ideally a
neutral standards home.

## Shared spatial dictionary

Worlds publish `definitions` (type, parent type, synonyms, language, context)
used locally at once; terms shared by several independent worlds are reviewed
into the shared dictionary, with first-contributor credit (schema.org /
Wikidata precedent). Six kinds stay fixed; meanings recorded per context
("stack" in a library vs a kitchen); limits and sentinels against keyword
stuffing; unknown terms fall back to their parent type; multilingual.
`spatial_terms` table; lookup order: world → shared → built-in `SYNONYMS`.

## `spatial.md` — opting in to crawling

No `spatial.md`, no crawl (default-deny). Sections: header (SDOM version,
document URL, north), Crawl (allow/disallow/refresh — not listed means not
crawled), Definitions, Agent actions (with EALA preset), Licence (layout and
contents, AI-training terms), Contact. Human strand `spatial.md` + machine
strand `spatial.json`/`sdom.json`, sealed together reusing the Robots Charter
Core and helix (`src/lib/spatial-charter.ts`). Crawler verifies seal before
indexing; free validator; WWB badge.

## The Listening Room — proof of concept

Copy the Virtual Library as an audiobook world: book nodes gain narrator,
length, sample, progress; play and resume actions; a librarian character with
spoiler limits; sub-worlds per genre/series. **Accessibility is the headline:**
the SDOM and plain-language queries work by voice and screen reader. Built on
our own domain as a concept (no Audible name/logo); stocked with public-domain
LibriVox / Project Gutenberg titles.

**Licensing later:** earn first, then license. Audio rights are often separate
and territorial; Penguin Random House reserves works from AI training, so the
licence must state whether characters may discuss books and that books are not
used for training or added to Punk Records/notes. Easier first partners:
indie authors, small presses, distributors (e.g. Findaway Voices, Bookwire).
Bring numbers, the demo, a revenue model, streaming-only protection, and the
AI terms. Lawyer review.

## Agent Eyes — for blind and partially sighted people

Vision models (as in self-driving perception: objects + depth) build a live
SDOM scene from a phone or glasses camera; users ask "where's my mug?" in the
same grammar. Published venue worlds (`spatial.md`) make localisation more
reliable; a chosen character can be the voice. Others in the space: Be My Eyes
/ Be My AI, Seeing AI, Envision. Prototype with gateway vision models on still
photos; real time needs on-device models (WWB or a mobile app).

**Safety:** not a replacement for a cane or guide dog, not for road crossing;
honest uncertainty (YEY! calibration); hazards first and "I can't see well";
possible medical-device status (check MHRA); bystander privacy (on-device, no
faces stored, UK GDPR); co-design with RNIB, Guide Dogs UK and blind testers.
