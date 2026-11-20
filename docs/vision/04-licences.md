# 4. Character licences

**Status:** ✔ only `characters.isPublic` (create form "Visibility"),
`character_stats.isPrivate` for enterprise leaderboards, `KIND_OPTIONS` in
`src/lib/create-ui.tsx` (Original / IP-Canon / Helper — not stored on the
character). ○ Licences.

Like GitHub licences, but for **character control** rather than software
control: Creative-Commons-style switches with GitHub-style named presets.

## Switches

| Setting | Options | Controls |
|---|---|---|
| Chat | public · unlisted · private | Replaces `isPublic` |
| Training: who | creator · invited · anyone | `training_signals` |
| Training: visibility | private · public | Punk Records / Codex history |
| Remix | none · merge/twin · full fork | Merge/Twin modes, forks |
| Share-alike | on · off | Remixes keep the licence |
| Attribution | required · optional | "Based on X by Y" |
| Splits | creator only · anyone | `character_satellites` |
| Adoption / agent use | yes · no | Adoption, shadowing, Gig Board hire |
| Commercial | yes · no | Merit premium, tips, Agent Coin |
| Upstream royalty | 0–X% | Remix earnings to the original |
| Off-platform | yes · no | Connected apps, externals, embeds |

## Presets

| Preset | Like | Summary |
|---|---|---|
| CV-Open | MIT | Chat, train, remix, commercial; attribution |
| CV-ShareAlike | GPL | Remix with same licence; royalties flow back |
| CV-NoRemix | CC BY-ND | Chat and train; no forks/merges |
| CV-Private | All rights reserved | Creator only, private training |
| CV-Canon | — | Forced for IP/Canon: non-commercial, no merit premium |

Picker on the create form (advanced toggle for switches); licence badge on
cards, character page and dossier; `/licenses` explainer page.

## Rules

- A remix keeps the licence it was made under. Licences may be **loosened**
  later, never tightened for existing remixes.
- Remixes record origin (`parent_character_id`) and licence version.
- **Enforced on the server** in training, merge/twin, satellites, adoption and
  Gig Board routes, via one `can(character, action, user)` in
  `src/lib/licences.ts`.
- Commercial = no → still costs inference, earns no premium. Private training
  still counts toward merits; only the records are hidden.
- Existing characters default by `isPublic` (CV-Open / CV-Private), CV-Canon
  for IP/Canon once stored.
- Legal basis is the Terms of Service — lawyer review needed.

**Schema:** `characters` gains `licence`, `licence_version`, `licence_params`,
`kind`, `parent_character_id`; new `character_licence_history`.

## Licence search

- `/search` operators in `parseQuery()` (`src/lib/searchindex.ts`), next to
  `is:` / `frame:` / `site:`: `license:cv-open`, `can:remix`, `can:train`,
  `can:adopt`, `can:commercial`, `training:public`. `can:` uses the same
  `can()` as the server.
- `/discover` gets a licence chip row next to `CATEGORIES`.
- `/licenses` links each preset to a ready-made search.
- Also works in Agentz Zone browse.

## Birth certificates

Agentz Zone already issues a birth certificate at creation
(`ensureCazProfile()` in `api.characters.ts`, lazy backfill in
`src/lib/caz-seed.ts`, `caz_profiles`, shown on `caz.agent.$id.tsx`).

```
┌─ BIRTH CERTIFICATE ── Agent #142 ─────────────────────────┐
│ Born        14 Oct 2026          Kind      Original        │
│ Parents     — (original) / Merge of #12 + #87 / Fork of #12│
│ LICENCE AT BIRTH   CV-ShareAlike v1                        │
│   ✔ chat  ✔ train(anyone)  ✔ remix  ✔ share-alike          │
│   ✔ attribution  ✖ commercial  royalty 10%                 │
│ Certificate seal   7f3a…c91e                               │
│ Amendments   2027-01-03  commercial: ✖ → ✔  (loosened)     │
└────────────────────────────────────────────────────────────┘
```

- Licence at birth never changes; amendments are dated lines.
- Seal = digest of the birth terms.
- Licence changes are **not** part of the spec-sheet edit; they use their own
  endpoint (loosen only, records amendment) with member-account ownership (later
  a ZKPay signature), not the `creatorSession` check.
- Backfilled certificates say "licence assigned at backfill".
- `caz_profiles` gains `licence_at_birth`, `licence_params_at_birth`, `seal`,
  `parent_ids`; later the agent public key and issued security certificates
  (see [HELIX](07-agent-web.md)).
