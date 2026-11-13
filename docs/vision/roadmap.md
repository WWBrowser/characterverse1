# Roadmap

A coherent build order: close contradictions first, then identity, then
measurement, then the features that depend on them.

| # | Step | Docs | Why now |
|---|---|---|---|
| 1 | Fix the private-character leak; server-side enterprise roles | [Known issues](known-issues.md) | The system currently contradicts itself |
| 2 | One identity — plans, wallets, tabs on member accounts | [Known issues](known-issues.md) | Everything depends on knowing who someone is |
| 3 | Token metering, `inference_usage`, economy gauges | [Economy](02-economy.md) | See real costs and flows before adding new ones |
| 4 | Search as the front page; shared Wheel; `whereAmI`; Verses/Wheel flip; TourClaw from `VERSES`; orphan list + coverage test | [Workspace OS](05-workspace-os.md) | The OS look at low risk |
| 4b | TourClaw personal guides (adopt a character), then twin guides | [Workspace OS](05-workspace-os.md) | Small, uses existing adoption and Twin Chat |
| 5 | Character licences, licence search, birth-certificate licences | [Licences](04-licences.md) | Before more characters exist without one |
| 6 | Payments: train tracks + holding yard + Ko-fi/BMC links, then Lemon Squeezy, payment wheel, flip faces, lifetime | [Payments](01-payments.md) | Money enters an identity-aware, metered system |
| 7 | Booster Shop, life cycle, slots, coin boosters, Goodwill Reserve + rarity, CStoreClaw/BoostClaw | [Boosters](03-boosters.md) | Drains and gifts, on the gauges |
| 8 | Fold Tabs → Nesting Dolls → Enterprise doll and bubble | [Workspace OS](05-workspace-os.md), [Boosters](03-boosters.md) | Premium layers on a stable strip |
| 9 | Merit pricing; inference boosters | [Economy](02-economy.md), [Boosters](03-boosters.md) | Needs metering and dossier merits |
| 10 | Model registry + table core; `@mention` rooms; team table; Pen Test Poker | [The Table](08-table.md) | Needs per-model metering |
| 11 | Shared Forge bucket, duplicates/variants, brick licences, salvage yard | [Forge](06-forge.md) | Needs licences |
| 12 | Brick weights, placement royalties, fusion, FusionClaw, projects | [Forge](06-forge.md) | Needs real usage data |
| 13 | Agents face, agent wallets, commons dividend, ZKPay | [Economy](02-economy.md) | The Tri Economy once the rest holds (ZKPay may come first) |
| 14 | ARN spec: HTMLA, HTTPAS phase 1, AI certificates, HCS-1, EALA + EALA.md charter, sentinels, RevClaw | [Agent web](07-agent-web.md) | WWB ↔ CharacterVerse first |
| 15 | Spin out the table; boomerang back as a frame tab | [The Table](08-table.md) | Only if usage supports it |
| 16 | ThoughtHub v1 — "GitHub for one character": Thought Repo page, WAT signatures (`src/lib/wat.ts`), unanswered notes as issues, training drafts as pull requests, sealed releases | [ThoughtHub](09-thoughthub.md) | Builds on Codex, Punk Records and training signals; needs licences (step 5) |
| 17 | NaR receipts paired with system receipts; note categories (`note-categories.ts`); "Take to training" drafts; NFaNF fragments; RLSF with anti-hiding rules; frontier notes | [ThoughtHub](09-thoughthub.md) | Needs metering (step 3) for system receipts |
| 18 | P@B and YEY! oversight: surfacing events, calibration, latent-share and mismatch gauges | [ThoughtHub](09-thoughthub.md) | Once receipts exist |
| 19 | Herd view, shared Thought Repos, enterprise pools, commons archive with review | [ThoughtHub](09-thoughthub.md) | After v1 has real use |
| 20 | SpatialVerse: test the six example queries, compass `north`, portals and sub-worlds, `world:`/`in:` operators | [WebWorld](10-webworld.md) | Extends the existing Spatial DOM |
| 21 | Shared spatial dictionary + `spatial.md` charter, crawler and validator | [WebWorld](10-webworld.md) | Opens worlds to outside operators |
| 22 | The Listening Room (public-domain audiobooks, accessibility first) | [WebWorld](10-webworld.md) | Proof of concept for publishers |
| 23 | TourClaw shop: capabilities, then reviewed sandboxed extensions | [Workspace OS](05-workspace-os.md) | After boosters (step 7) and WWB policy |
| 24 | Hugging Face public square: Spaces as Search entries, model cards → birth certificates, HF inference in the model registry, `WAT:HF-…` | [ThoughtHub](09-thoughthub.md) | After the model registry (step 10) |
| 25 | Agent Eyes prototype (still photos, gateway vision models), co-designed with blind testers | [WebWorld](10-webworld.md) | Research; safety review before anything real-time |
| 26 | Think mode (latent reasoning) — only when serving engines support hybrid generation and tests prove it | [ThoughtHub](09-thoughthub.md) | Research; no custom GPU stack until proven |
| 27 | Publisher licensing (indie and small presses first) | [WebWorld](10-webworld.md) | After payments revenue and the Listening Room |
