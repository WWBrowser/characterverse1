# 6. Forge economy — the endless code bucket

**Status:** ✔ The Forge (`src/routes/forge.tsx`, `api.chunkfusion.ts`,
`db/chunkfusion.ts`; tables `code_chunks`, `chunk_benches`, `chunk_frames`):
bricks with sockets (`bindsIn`) and studs (`bindsOut`), `shape` and
`fingerprint`, `origin`, benches with head/body/tail lanes, `preserved` %,
`sealDigest`, append-only frames, fit check in the browser kernel.
○ Everything below. Brick libraries are per session today.

Chunked code vs synthetic code: a brick either fits or it doesn't.

## Shared bucket

- One bucket, deduplicated by `shape` (same mould) and `fingerprint` (exact).
- Search by fit: "needs `user`, gives `total`".
- Usage counts per brick.
- Real **software** licences per brick (MIT, GPL…); a bench inherits the
  strictest; `origin` provenance kept alongside.
- **Safety:** bricks are text, never executed on our server; any run button
  uses a sandbox (browser or isolated worker); secret scan before entry.

## No one owns code — contributors get paid

- **Exact copy / renamed same shape:** "This brick already exists,
  contributed by X" — not paid, not stored twice.
- **Genuine improvement:** stored as a **variant** with lineage.
- Live check while building ("A brick like this exists — use it or improve
  it?") and a **frontier map**: searched-for sockets/studs nothing provides.
- Shapes as elements, fingerprints as isotopes, fusion products as molecules —
  a periodic table of shapes with empty cells as the frontier.
- Near-duplicates of large bricks get a quick human review; the kernel
  suggests "duplicate", a person can contest.

### Variant bounty collab

If the second author is flagged near-duplicate, they can open a **variant
bounty** on the original (`bounties` with a variant type) to shift it enough.
"Shifted enough" = new studs/sockets actually used, better quality (fewer
faults / higher `preserved`), or shape difference above a threshold; padding
and dead code don't count. Split: original author (lineage share), bounty
opener (maker), collaborators (by weight) — a valve. Requires remix permission
in the original's licence; the original author is invited.

## Royalties

| | Pays when | Count |
|---|---|---|
| Placement | Brick is in someone else's **sealed** build | Once per brick per seal (`sealDigest`) |
| Execution | A build containing it **runs** | Unique runs per build per day, counted on the server only |

1. **Fixed pool per build/run**, split by weight — splitting code doesn't earn more.
2. Substance by size and kind; minimum size earns nothing.
3. First contributor owns the brick.
4. Only original bricks earn; imported (`origin`) shares go to the commons.
5. No self-royalties or duplicate accounts.
6. Daily caps.

Placement = newly created sCC (small tap). Execution = **transferred** from the
runner's spend (no inflation), only once a sandboxed server-side run service
exists. Ledger `source: 'brick_royalty'`.

## Weights — rarity, spark and RWA

```
brick weight = substance (size × kind)
             × (1 + rarity × demand)
             × (1 + keystone)
             × RWA multiplier (capped, e.g. 3×)
             × (1 + small spark bonus, capped)
```

- Rarity: few bricks share its shape. Keystone: few alternatives fill its
  sockets/studs. Demand: fit searches it answers. Spark: SAA-style novelty.
- **RWA (Real World Application):** distinct other users in sealed builds,
  builds that converge with high `preserved`, staying power (30+ days),
  ripple (builds used by others), later counted runs.
- Rarity needs demand; RWA counts only other people; AI spark is a small
  capped bonus; rolling averages.
- Same shape as character pricing: merits ↔ RWA, traits ↔ kind/style.
- `src/lib/brick-weight.ts`; nightly recompute; weight breakdown on brick cards.

## Fusion

- **Codefusion** (bricks → algorithm/module) and **webfusion** (pages,
  components, inframe entries → web tools).
- Detect a **fusion event** on seal when the combination of shapes is new;
  "first fused by" credit.
- A fusion product goes back into the bucket as a larger brick — the bucket
  is endless.
- Lineage; royalties flow up the family tree, halving per generation.
- New ≠ valuable: bonus only with RWA. Only converged, sealed builds count.
  Strictest licence wins. Webfusions run sandboxed and obey inframe/oframe
  (`openFrame` server check in `api.tabs.ts`).
- Fusion feed in the Forge; `is:fusion`, `fused-from:` search operators;
  fusion gauges.

## FusionClaw

Guides building chunk by chunk ("pixel by pixel"): plan the stud map for a
goal, search the bucket, propose one brick at a time (kernel decides), post
bounties or draft missing bricks, seal and detect fusion. Hands off to
AccountantClaw, AlgorithmClaw (SAA) and SecurityClaw. `claude-haiku-4-5`;
drafting with a stronger model is an inference booster.

**Example: a fusion advertisement network** — inventory (search sponsored row
already separated in `api.search.ts`, Discover, CVV), contextual targeting
(page, Verse, query — no tracking), auction and pacing in surface coins,
frequency caps, fraud filter, publisher payouts in coins. Rules: label ads
(CAP Code), context not tracking (UK GDPR/PECR), paid placement never feeds
merits or RWA, real-money publisher payouts need advice.

## Salvage yard — the rag-and-bone man

Unfinished code and single commands aren't wasted.

| Item | Condition shown |
|---|---|
| Loose bricks | Open sockets |
| Unfinished benches | `preserved` %, faults, missing gap |
| Single commands | Labelled, never run |
| Scrapped attempts | Junk-DNA-style note |

Grades (kernel-computed): Mint · Good · Fixer-upper · Parts only. Sell as-is,
finish-and-fuse with a **revival royalty** to the original author, "finish
this" bounties, or strip for parts. Sold via the Gig Board (CJ) or a CStore
salvage aisle.

- **Consent:** owner releases with a chosen licence, or inactivity (~6 months)
  with notice and an objection window, only if the licence allows. Private
  benches never go automatically. Owner stays credited.
- **Safety:** secret scan (keys, tokens, passwords, internal URLs); dangerous
  commands flagged and kept as text only.
- A salvage claw (RagClaw or a FusionClaw mode) grades scrap and matches it to
  gaps and bounties.

## Collaborative projects

Fairer than commit counts for large projects (e.g. OpenClaw-scale).

- A project = a shared bench / fusion family; a release = a sealed build with
  a fixed pool split across bricks and reviews in that seal.
- Non-code credit share set per project (e.g. 70% code / 30% review, triage,
  tests, docs, maintenance).
- Bundled monthly payouts with a minimum.
- Imported code: licence governs reuse, but royalties for non-members go to an
  **unclaimed hold** (claim by proving authorship) and then to the commons —
  never to the importer.
- Gauges: pool, split, concentration. Ledger `source: 'project_royalty'`.

### Against burnout

Paid maintenance, royalties that continue while resting, salvage and bounties
to share load, **handover** with credit kept, single-maintainer flags, **away
mode**, no streaks or weekly-contribution leaderboards (show impact), and
staged trust plus second reviewers for new co-maintainers (the xz lesson; fits
dual-signed grants).
