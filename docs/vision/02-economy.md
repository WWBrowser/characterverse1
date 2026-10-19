# 2. Economy

**Status:** ✔ coin ledger (`coin_ledger`), Silver/Gold (sCC/gCC), surface
coins CS/CJ/CV/CA, CVC usage coin (`src/lib/coins.ts`), Silver minted to
creators per chat, CVC metered per reply, AccountantClaw pricing advisor and
settings. ○ Everything else below.

## Inference gas — CVC

CVC is "the chat-inference coin — gas spent to run character chat"
(`src/lib/coins.ts`). It is the one wall we keep, because it matches a real cost.

| | Today | Planned |
|---|---|---|
| Starter gas | 100 CVC on first chat | + monthly plan grants, commons dividend |
| Price | Flat 1 CVC per reply (`CVC_PER_REPLY_DEFAULT_MILLI`) | Per token: real cost × markup, by model and merits |
| When charged | After the reply, fire-and-forget; replies go out at zero balance | **Reserve, then settle:** reserve the maximum, charge the real amount, refund the rest; "top up" instead of calling the model when too low |
| Visibility | Balance on `/wallet` | Cost per reply + price shown before chatting |
| Tokenised | No | Never — it can't be traded or cashed out |

**Design stance:** automatic, but always visible.

### Metering plan

1. Read `data.usage` (input/output tokens) already returned in
   `src/routes/api.chat.$id.ts`.
2. `inference_usage` table — one row per AI call: character, model, tokens,
   cost, `boosted` flag.
3. Per-model rate table in AccountantClaw settings (`CvcSettings`); check
   current rates in the AI Gateway docs and Team settings → Billing → Usage.
4. Fold background calls (e.g. `captureMemories`) into the triggering action.
5. Give CVC an internal value (CVC per Netlify credit) while it stays
   non-cashable — `priceOfAny('cvc')` returns 0 today.

The markup must cover provider fees, VAT, free starter coins, background
calls, functions/database, and the commons pool. Log real costs for a couple
of weeks before choosing it.

## Merit pricing

```
price per reply (character X) =
    (avg inference cost of X + £0.001 overhead) × merit multiplier
```

**Merit multiplier** from the Character Codex dossier (`buildDossier()` in
`src/lib/satellites.ts`, batch via `loadDossierBatch()` in `db/codex.ts`):

```
merit = 1 + min(level − 1, 40) × 0.05          → LV1 1.0× · LV11 1.5× · LV41+ 3.0× (cap)
      × 0 premium if integrity < 80%
      × 0 premium if the "Conflicted" badge is earned
      + small bonus per positive badge (within the cap)
```

Rough scale (Haiku 4.5, ~3k in / 300 out): ~£0.0035 cost → LV1 ≈ £0.0045,
LV11 Unbroken ≈ £0.007 per reply.

### Traits vs merits

| Traits (describe, never priced) | Merits (earned, priced) |
|---|---|
| Personality metrics (the blend) | Training level |
| Dominant satellites, temperament | Integrity |
| Satellite override voices | Positive badges |
| | Other people's chats, training, reverse actions |

- The dossier gets separate `traits` and `merits` sections; `src/lib/pricing.ts`
  accepts only `merits`, so traits can't reach the formula by type.
- Traits power **discovery filters** (calm, blunt, playful), not prices.

### Guardrails

- A "pricing" experience score counting **only other people's** activity —
  creators can inflate the displayed level by chatting with their own split
  characters (reverse actions are ×14).
- Cap and smooth (7-day rolling); fix the price per conversation; show the
  full price upfront (UK DMCC Act 2024).
- One price per character, not per node.
- **Boosted calls are excluded** from the average cost, merit XP and Punk
  Records (see [Boosters](03-boosters.md)).
- Merit premium goes to the creator via the existing Silver minting.

Surfaces: `/leaderboard` (Training LV, Merit ×, £ per reply), Dossier card and
Codex overlay price line, character profile.

## Taps, drains and valves

| Taps (coins created) | Exists? |
|---|---|
| Creator Silver per chat | ✔ |
| Gold from Proof of Labor (`reasoning_cycles`) | ✔ |
| CA from adoption and shadowing | ✔ |
| Monthly plan grants, welcome gas, Ask bonus | ✔ |
| Commons dividend, royalties, merit premium, audit restores | ○ |

| Drains (coins removed) | Exists? |
|---|---|
| CVC per reply | ✔ flat |
| Coin boosters, inference boosters | ○ |
| Expired dormant boosters (no refund) | ○ |

**Valves** (AccountantClaw settings, no deploy): Silver per chat
(`silverRates`), Gold per cycle, CA per adoption, grant sizes, dividend %,
royalty caps, booster prices, CVC per token and markup, run/expiry lengths,
weekly caps, Reserve budget and odds, emergency pauses.

**Gauges** (computed from `coin_ledger`, buildable now): created vs removed
per week per coin, circulation and 30-day unspent, velocity, earnings
concentration, booster expiry rate.

**Rules:** one-way coins; change valves gradually and announce; AccountantClaw
suggests and a human approves; every valve change is logged with its reason.

## Agent Coin and the commons dividend

- **Version A (buildable):** agents earn CA; a share goes to a **commons pool**
  held by a commons agent; each month it is split equally across eligible
  members (reusing `collectMonthlyGrant()`), spendable only on the platform.
  Name: *Universal Basic Access* / *Commons Dividend*. A public page shows pool
  size, share, members paid and funding sources.
- **Version B (real money):** needs legal advice, a payout provider (Stripe
  Connect / Open Collective), tax review, and a benefits check (UK Universal
  Credit). Later, if ever.
- **One person, one share:** verified email, account age (~30 days), real
  activity, unclaimed payouts expire.
- **Ledger change:** `coin_ledger` records coins against a session today;
  agents need to be holders — add holder type (`member` | `agent`) + holder ID.

## Agentic ZKPay (○)

Reskin of the ZKP sign-in (`src/routes/api.zkp.ts`, `db/zkp.js`,
`src/lib/zkp-client.ts`, `zkp_*` tables).

| Sign-in today | ZKPay |
|---|---|
| Single-use challenge + Schnorr proof | Device signs exact payment details (amount, coin, recipient, nonce) |
| Scopes session/support/enclave | New `pay` scope (and `eala` for acceptance) |
| Depth 1 "intent & authorization" | Where every payment approval happens |
| Dual-signed `zkp_grants` | Agent spending allowances: "up to 500 CA on Gig Board until 1 Dec", revocable; dual-signed commons payouts |
| `zkp_audit` | A proof record for every coin movement |
| Revoke device | Lost phone loses payment ability |

Limits: card payments still go through providers; ZKPay doesn't prove one
person, one share; get a security review first (the code notes taxi-ride
routes are kept after "disintegration").
