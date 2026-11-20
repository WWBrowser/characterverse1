# 3. Boosters

**Status:** ○ all design. No booster code exists.

## Life cycle

```
 Bought ──▶ DORMANT (Shared Wallet) ──activate──▶ ACTIVE ──▶ EXPIRED
              └── fixed expiry date reached ───────────┴──▶ EXPIRED
```

- Held dormant in the **Shared Wallet** (`/wallet`, next to `coin_vaults`)
  until activated, with a **fixed expiry date** unless stated ("No expiry" for
  lifetime unlocks or audit grants). Stops hoarding.
- **Decision open:** expiry as "last day to activate" (then its own run time)
  vs one end date for everything (simpler, firmer).
- Abuse rules: dormant limit per type, no stacking, no transfers by default,
  vault locks block activation, every change logged.
- UK: show expiry before purchase; 14-day digital cancellation right is lost on
  activation only with consent at checkout.

**Table `member_boosters`:** member, booster, status
(`dormant`/`active`/`stasis`/`expired`/`revoked`), bought, expiry (null = none),
activated/run-ends, source (`lemonsqueezy`/`coins`/`grant`/`audit`/`reserve`),
reference, `paid_coin`, `paid_amount_milli`, `rarity`, `seat_id`,
`paused_remaining`, `bubbled_at`, `stasis_backstop_at`, draw seed, note.
Daily expiry job; `activate` endpoint; server checks require an **active** row.

## Booster ladder

| Level | Unlocks |
|---|---|
| Workspace (free) | Tab strip, index, SAA column |
| Workspace+ (Workstation Booster) | Fold Tabs |
| Premium+ booster | Nesting Dolls |
| Enterprise Workspace (a plan, not a booster) | The Enterprise doll |

## Coin boosters

Money boosters: longer run (~30 days) and expiry (~90 days). Coin boosters:
shorter run (~3–7 days) and expiry (~14 days). Paid with a negative
`coin_ledger` row, `source: 'booster'`. Prices are fixed coin amounts in
AccountantClaw settings, not tied to coin £ prices.

| Coin | Theme | Example boosters | Takes effect in |
|---|---|---|---|
| 🥈 sCC | General | Fold Tabs trial · short Nesting Dolls run (e.g. 2 days, capped) | `workspace.tsx`, `api.tabs.ts` |
| 🥇 gCC | Training | More training signals/day · bigger batch runs · more bounty slots · priority applying | `training_signals`, `bounties` |
| 🫂 CS | Social | Profile spotlight · extra bulletins · featured on browse | `social.browse.tsx`, `social_bulletins` |
| 💼 CJ | Jobs | Featured gig · priority in search · extra open orders | `cvj_gigs`, `cvj_orders` |
| 📼 CV | Video | Featured video · longer uploads · channel spotlight | `cvv_videos`, `cvv_channels`, `api.cvv.upload.ts` |
| 🛰️ CA | Agent | Extra agent slots · longer reasoning budgets · shadowing passes | `reasoning_cycles.costBudget`, `social_shadow_logs` |

gCC = training a character (behaviour); CA = running agents (work done).
Training boosters give room to train, never merit directly.

Coin-booster abuse rules: weekly cap per coin, no refunds on dormant expiry,
minimum account age, CA purchases by agents need a ZKPay allowance, earning
rules count only other people's activity.

## Slots

| Tier | Booster slots | Goodwill slot | Total |
|---|---|---|---|
| Free | 1 | +1 | 2 |
| Premium / Lifetime | 3 | +1 | 4 |
| Enterprise / Business (per seat) | 6 (3 active + 3 bubble) | +1 | 7 |

Each plan in `PLANS` gets `boosterSlots` and `goodwillSlots`. **Open:** add a
free tier to `plans.ts`; decide which plans count as premium.

"Use goodwill first if the task fits" — a suggestion when a Goodwill booster
unlocks the feature in use (flips if a paid one expires sooner); the member
chooses.

## Goodwill Reserve

When someone asks "give me a free booster", BoostClaw offers a **claim
button**; the server decides.

- Like a **provision / litigation reserve:** a budgeted monthly amount
  (e.g. 500 booster-hours); claims spend from it (`goodwill`).
- One claim per member per period; eligibility as the commons dividend;
  finite monthly budget; seeded, replayable draw.
- **Pool only includes boosters that cost little** (visibility/features) —
  never token-burning ones.
- Dormant in the Goodwill slot, ~24h expiry, 30–60 min run.

### Rarity

| Rarity | Odds | Example |
|---|---|---|
| ⚪ Common | 60% | Profile spotlight · extra bulletins |
| 🟢 Uncommon | 25% | Featured on browse · featured video |
| 🔵 Rare | 10% | Featured gig · priority search · channel spotlight |
| 🟣 Epic | 4% | Fold Tabs |
| 🟡 Legendary | 1% | Nesting Dolls |

Face-down reveal using the search flip animation. **Always free** (never
bought, re-rolled or boosted), **published odds**, no trading, no near-miss
teasing. Optional pity counter (e.g. Epic after 8 misses). Admin: actual vs
published odds.

## Enterprise bubble (stasis)

- 3 active per seat; boosters 4–6 go into a **bubble** with the clock paused
  ("EXP ???"). When active drops below 3, the bubble pops the one with the
  least time left.
- The bubble exists only at 4–6 boosters; nothing can be moved in by hand;
  a hidden backstop date (contract end or 90 days) shown in small print; cap 6
  per seat; only Enterprise-bought boosters; boss can reassign within the
  workspace; every bubble/pop logged.
- Goodwill and coin boosters keep short clocks and **never get stasis**.

## Inference boosters

| Booster | Changes |
|---|---|
| Model upgrade | e.g. `claude-sonnet-5-5` / `claude-opus-5-5` instead of `claude-haiku-4-5` |
| Long replies | Higher `max_tokens` than 1024 |
| Deep memory | More of `memoryBlock` |
| Long recall | More of `apiMessages` |
| Personal tune | Member's own style block in `buildSystemPrompt()`, for them only |
| Think first | Reasoning before replying |

They **never feed merits**: excluded from average cost (`boosted: true`), from
reverse-action XP / Punk Records, and the personal tune is never saved to the
character. Priced at cost + markup, shown upfront, not in the Goodwill pool;
the creator payout stays on the normal price.

## CStore, CStoreClaw and BoostClaw

- `/cstore` hosts the Booster Shop. Its header rule ("sells nothing of its
  own… a second checkout would mean a second ledger") still holds: coin
  boosters use `coin_ledger`, money boosters use the train tracks, ownership is
  `member_boosters`. Update the comment to say so.
- **CStoreClaw** (manager): all of CStore; grants/revokes BoostClaw's powers;
  holds the Reserve and can pause it; handles escalations.
- **BoostClaw** (assistant, answers to CStoreClaw): booster questions;
  proposes purchases, activations and Reserve claims for the member to confirm.
- Same pattern as AccountantClaw: grounded live data, server-computed facts,
  works without the gateway, revocable powers. Prices come from AccountantClaw
  settings. Handovers via RouteClaw (`api.routeclaw.dispatch.ts`).
- **The claws never change anything themselves.** Routes:
  `src/routes/api.cstoreclaw.ts`, `api.boostclaw.ts` (incl. `claimReserve`).
  Model `claude-haiku-4-5`.
