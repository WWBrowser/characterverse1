# 1. Payments

**Status:** ✔ `/billing` page and plans exist (`src/routes/billing.tsx`,
`src/lib/plans.ts`, `src/routes/api.billing.ts`, `plan_subscriptions`).
○ No money is collected yet — `subscribe` activates a plan and mints the
monthly coin grant for free.

Plans today: LITE £19 · PRO £49 · MAX £99 · ULTRA £249 / month (yearly prices
in `plans.ts`), ENTERPRISE quoted.

## Providers

| Provider | Type | Setup on our side | Fees (check current) | Notes |
|---|---|---|---|---|
| **Lemon Squeezy** (chosen for plans) | Merchant of record | Store, 8 subscription variants (4 plans × monthly/yearly), API key, webhook secret | ~5% + 50¢ | Collects and pays VAT/sales tax. Stripe acquired it in 2024 — confirm it still accepts new stores; Paddle or Polar are drop-in alternatives |
| **Stripe Checkout** | Payment processor | Secret key, webhook secret | Lower | We handle VAT ourselves (Stripe Tax can calculate) |
| **Paddle** | Merchant of record | Approval review, products, keys | ~5% + fixed | Alternative to Lemon Squeezy |
| **Polar** | Merchant of record | Account, products | — | Developer/creator focused underdog |
| **Ko-fi** | Tips, memberships, shop | Username; verification token for webhooks | 0% on tips | Easy webhook. No list API — audit uses CSV export |
| **Buy Me a Coffee** | Tips, memberships, extras | Username; webhook secret | ~5% | Signed webhooks |
| **Patreon** | Memberships | Page + tiers; OAuth app for "Connect Patreon" | ~10% (new creators) | Handles VAT on memberships |
| **Liberapay** | Recurring donations | Account | No platform fee | Non-profit underdog |
| **Open Collective** | Transparent community funding | Collective, fiscal host | Varies | Public ledger of spending |
| **PayPal** | Subscriptions | Client ID/secret, billing plans | — | More setup than Stripe |
| Stripe Payment Links | Hosted links | 8 links | — | Quick test only — no reliable "who paid" |

**Integration levels:** Level 1 is links only (usernames in one config file,
e.g. `src/lib/support.ts`). Level 2 adds webhooks that reward supporters
through the coin ledger, matching by member email (`social_members.email`), a
claim code, or "Connect Patreon".

**Spotlight:** the payments page highlights an underdog provider (low fees,
creator-owned, non-profit) in a featured slot.

### Letter to send each provider

> Hi, I'm autistic and setting up payments for my website. Before I sign up,
> could you please answer these questions in writing, in clear and simple steps?
>
> 1. Do you offer accessibility support for neurodivergent customers? For
>    example: written-only support (no phone calls), extra time to respond, or
>    one named contact.
> 2. Do you collect and pay VAT and sales tax for me on my sales, or do I need
>    to do that myself?
> 3. Which countries does that cover (UK, EU, US, others)?
> 4. What tax documents do you give me each year?
> 5. Is there anything I must report to my own tax office myself?

Other help: HMRC "extra support" service, an accountant, Citizens Advice / TaxAid.

## Lemon Squeezy integration (○)

- `src/lib/lemonsqueezy.ts` — small fetch helpers, no new dependency.
- `src/lib/plans.ts` — a variant ID per plan and cycle.
- `src/routes/api.billing.checkout.ts` — creates a checkout carrying the user's
  ID, redirects to it.
- Webhook (via the junction below) — verifies the signature; on start/renewal
  calls `setSubscription()` + `collectMonthlyGrant()` (already idempotent per
  month); on cancel/expiry calls `cancelSubscription()`.
- `api.billing.ts` — `subscribe` stops granting paid plans for free.
- `plan_subscriptions` — new columns for provider subscription ID, customer ID
  and customer-portal URL.
- `billing.tsx` — checkout buttons, "Manage billing", success/pending states,
  "cancels on [date]".
- Env vars: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`,
  `LEMONSQUEEZY_WEBHOOK_SECRET`.
- **Prerequisite:** tie subscriptions to member accounts, not the browser
  session ID (see [Known issues](known-issues.md)).

## The train tracks — one webhook router (○)

```
  Ko-fi ─────────┐
  Buy Me a Coffee┤
  Patreon ───────┤   ┌──────────────┐   ┌─────────────┐   ┌───────────────┐
  Lemon Squeezy ─┼──▶│  JUNCTION    │──▶│ TICKET CHECK│──▶│  MAIN LINE    │
  Liberapay ─────┤   │ pick provider│   │ verify +    │   │ dedupe, record│
  Polar ─────────┘   └──────────────┘   │ convert     │   │ then dispatch │
                                        └─────────────┘   └──────┬────────┘
                                 ┌──────────────┬──────────────┼──────────────┐
                                 ▼              ▼              ▼              ▼
                             Coin grant     Subscription   Supporter     Thank-you
```

- **Junction:** `src/routes/api.payments.webhook.$provider.ts` — one route,
  provider name in the URL.
- **Ticket check:** `src/lib/payments/<provider>.ts` adapters. Each verifies
  the request its own way and converts it to one shared shape:
  ```ts
  type PaymentEvent = {
    provider: string; eventId: string
    kind: 'tip' | 'subscription_start' | 'renewal' | 'cancel'
    email?: string; amount: number; currency: string; tier?: string
  }
  ```
  Each adapter also has a "list recent payments" function for the audit.
- **Main line:** `src/lib/payments/router.ts` — save the raw event first, skip
  duplicates (`payment_events`), record, dispatch to coin grants, plan changes,
  supporter badge, thank-you.
- **A new provider** = one adapter file + one webhook URL in its dashboard.

### Failure handling

1. **Redirect yard (provider down before paying):** a scheduled health check
   (`provider_health`) marks providers up/down. `/billing` hides or marks a
   down provider and offers a working one with a note; the payment records
   `rerouted_from`. Only works *before* money moves.
2. **Holding yard (our side down when a webhook arrives):** the junction saves
   the raw message before processing and replies "got it". Failures sit with
   status `yard` and a note; a scheduled job retries every ~15 min, then flags
   for a human.
3. **Audit (payments that fell through cracks):** a nightly reconciliation asks
   each provider what it received and compares with `payment_events` (Ko-fi via
   CSV). Unmatched payments go to a **claim queue**. Found rewards are granted
   with a note like `found by audit 2026-10-20`.

**Tables:** `payment_events` (status received/done/yard/claimed, note,
rerouted_from), `provider_health`. **Admin:** provider status, yard, claim
queue, audit results, Replay and Reward buttons — on `/controltower` or its own
page.

## The payment wheel (○)

The Verse Wheel (`VERSES` in `src/lib/verses.ts`, drawn by `Wheel` in
`src/routes/index.tsx`) is reskinned as a payment wheel.

| Verse Wheel | Payment wheel |
|---|---|
| Seven Verses on the outer ring | Providers on the outer ring |
| Sub-wheel of pages | Sub-wheel of payment options |
| Verse colour | Provider brand colour |
| Hover callout | Fees + one-line note |
| Core | Underdog spotlight / Pay |

Seven providers fit the ring: Lemon Squeezy · Patreon · Ko-fi · Buy Me a Coffee
· Liberapay · Polar · Open Collective.

- Move `Wheel` into a shared component (e.g. `src/lib/wheel.tsx`) used by home,
  payments and the "you are here" pop-out.
- `src/lib/payments/providers.ts` — `PROVIDERS` in the same shape as `VERSES`,
  read by both the wheel and the adapters. A provider appears only once its
  link or adapter works (the `verses.ts` "no spoke to nowhere" rule).
- Signal box → wheel: a down provider's node dims with a badge and routes to a
  working one.

### The empty wheel that fills up

For members' own payment settings: empty dashed slots with "+", each filled
by adding a provider (username only — the app builds the URL from a fixed
template and validates the format; no stored passwords or API keys). Drag to
reorder, toggle options, set a default (the core).
Table: `member_payment_providers` (member, provider, username, options,
position, default). API: `src/routes/api.payments.providers.ts`. Settings in
`social.settings.tsx` or `/billing/settings`; display on `/billing` and
profiles.

### Flip faces — Dual Economy → Tri Economy

The wheel flips using the `/search` flip pattern (`.cvsf-flip`, `cvsfFlipIn` in
`src/styles.css`; all faces mounted, `?side=` in the URL), moved into a shared
flip component.

| Face | Who | Outer ring | Sub-wheel | Core |
|---|---|---|---|---|
| **Buy** | Members paying CharacterVerse | Our providers | Plans: LITE…ULTRA, monthly/yearly/lifetime | Underdog spotlight |
| **Earn** | Creators getting paid | Their own providers (empty wheel) | Tip, membership, shop | Their default |
| **Agents** (Tri, later) | Agents holding Agent Coin | Agent wallets | What the agent may spend/earn | CA balance |

Money flow: Buy → providers → train tracks → coin ledger. Earn → straight to
the creator's own Ko-fi etc. Agents → coin ledger only (CA).

## Lifetime deals (○)

- `plan_subscriptions.cycle` gains `lifetime`; one-off Lemon Squeezy products;
  funding-round start/end dates and optional limited founder seats.
- **Written at checkout** what lifetime includes: the tier's features, a
  capped *monthly* CVC grant, a founder badge. Not included: boosters,
  usage beyond the grant, cosmetics, future premium+ features unless stated,
  extra Enterprise seats.
- Founder perks: badge, an extra Goodwill claim a month, a small booster discount.
- Sell as a **product pre-sale, not an investment** (no promised returns).
  Lifetime revenue is usually deferred — ask the accountant.
