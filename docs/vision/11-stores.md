# 11. The Seven Stores

**Status:** ✔ `/cstore` exists ("the store aisle of the verse", sells nothing of
its own; `src/routes/cstore.tsx`). ○ Everything below.

All seven stores are aisles in `/cstore`, sharing **one wallet, one ledger
(`coin_ledger`), one payment junction (train tracks) and one set of slot, gas
and expiry rules**. CStore still keeps no ledger of its own. Each store has a
**customer side** (perks) and a **developer side** (publish and earn).
CStoreClaw manages all aisles; each aisle can have a helper claw that answers
to it (BoostClaw for boosters, a widget helper for widgets, and so on).

| # | Store | Customers get | Developers / creators | Paid with | Details |
|---|---|---|---|---|---|
| 1 | **Plans** | Memberships, lifetime deals, Enterprise seats | — | Money (Lemon Squeezy) | [Payments](01-payments.md) |
| 2 | **Boosters** | Money, coin and Goodwill boosters | — | Money, coins, Goodwill Reserve | [Boosters](03-boosters.md) |
| 3 | **Widgets** | Connectors to apps/services; protocol widgets | List widgets, revenue share | Free (protocols) or money/coins (software) | Below |
| 4 | **TourClaw shop** | Capabilities, guide packs, extensions, personal/twin guides | Publish extensions and guide packs | Plan, booster, gas, coins | [Workspace OS](05-workspace-os.md) |
| 5 | **Characters** | Licensed characters, guides, twin pairs | Earn from licensed use (merit premium, adoption) | Coins | [Licences](04-licences.md) |
| 6 | **Forge bucket** | Code bricks and fusion products | Royalties per brick | Coins | [Forge](06-forge.md) |
| 7 | **Salvage yard** | Unfinished code and commands, graded by condition | Revival royalties | Coins (CJ) | [Forge](06-forge.md) |

Contenders for future aisles: WebWorld worlds and assets, Thought Repos, Gig
Board services. The set is a list in code, so aisles can be added or swapped.

## Rules for every store

- **Prices come from AccountantClaw settings**; claws explain prices, never set them.
- **The claws propose, the server decides**: every purchase and activation goes
  through the normal endpoints with balance, cap, licence and vault checks.
- **Nothing free today becomes paid tomorrow** in any aisle.
- **Show the full price and any expiry before purchase** (UK DMCC Act 2024);
  digital-content cancellation consent at checkout.
- **Coins stay one-way**: store earnings for developers are paid in coins first;
  real-money payouts need legal advice.
- **No paid chance** in any aisle; Goodwill draws stay free with published odds.

## Widget Store

Widgets connect CharacterVerse (and partner sites) to apps and services.

| Free — protocols | Paid — software |
|---|---|
| Specs: `menu.md`, `spatial.md`, `tourclaw.md`, `agent.json`, EALA presets | Hosted TC-Link with white-label settings |
| Reference widgets anyone can install or self-host | MyCustom Menu with the diagnostics dashboard |
| Validators and seal checkers | Premium connectors (CRM, calendars, payments) |
| ZKP sign-in and sync basics | Higher limits, analytics, support, SLAs |

- **Open standards stay free so they spread**; the hosted, polished, supported
  versions are what's sold.
- Connectors use each service's own sign-in (OAuth), never stored passwords.
- Every widget declares its permissions before install ("requests, not
  grants"), runs sandboxed, is reviewed and signed (HCS for publishers), is
  revocable, and is re-scanned on every update.
- Third-party listings earn a revenue share in coins, like brick royalties.

**Code (○):** `store_items` (aisle, kind free/paid, publisher, permissions,
version, signature, price), `member_items` (installed/owned, status), aisle list
in `src/lib/stores.ts`, CStore aisle UI generated from that list.
