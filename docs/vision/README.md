# CharacterVerse Vision — design record

This folder records the platform design worked out in planning sessions, from
the first payment providers through to Pen Test Poker. **Almost everything here
is design, not code.** Each document marks what already exists in the repo and
what is planned, so nobody mistakes a plan for a feature.

> Status legend used throughout: **✔ exists** (in the codebase today) ·
> **◐ partial** · **○ planned** (design only).

## Documents

| # | Document | Covers |
|---|---|---|
| 1 | [Payments](01-payments.md) | Providers, the train-tracks webhook router, yards and audit, the payment wheel and its flip faces, lifetime deals |
| 2 | [Economy](02-economy.md) | Inference gas (CVC), metering, merit pricing, traits vs merits, taps/drains/valves, Agent Coin, commons dividend, ZKPay |
| 3 | [Boosters](03-boosters.md) | Booster Shop, life cycle, coin boosters, slots, Goodwill Reserve and rarity, Enterprise bubble, inference boosters, CStoreClaw/BoostClaw |
| 4 | [Licences](04-licences.md) | Character licences, presets, licence search, birth certificates |
| 5 | [Workspace OS](05-workspace-os.md) | Fold Tabs, Nesting Dolls, Enterprise doll, Search as the front page, Seven Entrances "you are here" wheel, TourClaw, orphan pages |
| 6 | [Forge economy](06-forge.md) | Shared brick bucket, duplicates and variants, royalties, RWA weights, fusion, FusionClaw, salvage yard, collaborative projects |
| 7 | [Agent web](07-agent-web.md) | WWB, HTMLA / HTTPAS, rollout phases, AI certificates, ARN, HELIX Certificate Security, EALA, sentinels, REA / RevClaw |
| 8 | [The Table](08-table.md) | Multi-model `@mention` rooms, AI-to-AI metering life cycle, team table, Pen Test Poker, spin-out and boomerang |
| — | [Known issues](known-issues.md) | Security and coherence gaps found in the current code |
| — | [Roadmap](roadmap.md) | Build order |

## Principles

Quotes by Robert W Dickson that frame the design:

> *"Dopamine is so big that we could never hope to map it fully as new spikes
> lead to new branches of subjective want, like, understanding that no other
> qualia knows."*

> *"Why A.I. over crypto? Because crypto is a lost promise … A.I. is yet to
> prove itself."*

> *"While we can alienate our consumers with A.I. we should not, as the
> benefits/abundance outweigh the need for walls — replaced with paid or
> goodwill/earned boosters."*

The rules that follow from them, used as tests for every new feature:

1. **Curiosity, not compulsion.** Features may reward discovery, never
   manufacture craving. No streaks, grind counters, near-miss effects, paid
   randomness or engagement pings. Nothing is recommended before it is asked for.
2. **Proof over promise.** Nothing is paid for promise, only for proof: merits,
   RWA, fusion yield and protocol decisions all wait on measured, real use.
   The loop is *Desire → Promise → Proof → Reward → New horizon*.
3. **Goodwill over walls.** The only wall that stays is one matching a real cost
   — inference gas. Walls around access are over; the cost of compute is
   shared fairly.
4. **Nothing free today becomes a booster tomorrow.** Boosters add new
   capability; they never take away what the baseline already gave.
5. **One-way coins.** Money can buy coins; coins never cash out. That keeps
   coins platform credit, not a financial product, and removes speculation.
6. **The AI suggests, the server decides.** Claws, sentinels and models propose;
   code checks balances, caps, licences and permissions.
7. **Humans stay in charge.** Reverse action is off until a person turns it on.
   Agents can't sign contracts; principals do.
8. **Entangled, not entwined.** A partner knows you because you let it, you
   know it because it shows you, and either of you can step back.
9. **One source of truth, many surfaces.** Coherence is the other side of high
   signal: `VERSES`, `coin_ledger`, `derive()` and `can()` each feed every
   surface that needs them, so they can't drift.
10. **Intelligence as a Service:** raw intelligence at cost, earned intelligence
    at a premium, goodwill as the baseline. (Write "Intelligence as a Service"
    out in full — "IaaS" already means Infrastructure as a Service.)

## Advice still needed

Several plans depend on outside advice before they go live. Keep these
questions together:

- **Payment providers:** do they collect VAT/sales tax for us, in which
  countries, and what accessibility support (written-only contact, extra time)
  do they offer? A ready-to-send letter is in [Payments](01-payments.md).
- **Accountant:** VAT position, deferred revenue for lifetime deals, the tax
  effect of coin grants.
- **Lawyer:** Terms of Service, character licence and EALA wording, IP/Canon
  takedowns, reverse-engineering rules (UK CDPA s.50B), any real-money payouts.
- **Benefits / Citizens Advice:** impact of any real-money basic income.
