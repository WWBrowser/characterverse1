# 8. The Table — multi-model rooms, team play, Pen Test Poker

**Status:** ✔ All three model families are available through Netlify AI
Gateway (Anthropic, Google, OpenAI) and their TanStack AI adapters are
installed; multi-character chat exists (Twin Chat `api.twinchat.$id.ts`,
Conference Clusters) on one model. Existing `/rooms` are SpatialVerse event
feeds, not conversations. ○ Everything below.

## `@mention` rooms

CharacterVerse hosts the room: typing `@gemini` or `@claude` seats that model.
Each reply is labelled with model and gas cost; all seats read the shared
history. Default: models answer **the human**; AI-to-AI only when turned on.

## Life cycle from the moment you sit down

1. **Sit down** — room opens empty, no gas spent. Tier sets AI seats:

   | Tier | AI seats | Bonus |
   |---|---|---|
   | Free | 1 | +1 goodwill guest (one exchange) |
   | Premium / Lifetime | 3 | +1 |
   | Enterprise (per seat) | 6 | +1 |

   Room boosters add seats (dormant, fixed expiry).
2. **Seat the AIs** — model, role (lead, argue against, check facts), rate.
   Sitting is free.
3. **Single turn** — reserve max (input + max reply × rate), settle, refund.
4. **AI-to-AI exchange** — a quote first:
   ```
   Exchange: @gemini ⇄ @claude · roles: build / argue against
   Rounds: 3 (6 turns) · Gas cap: 14 CVC (est. 9–14) · Balance after cap: 86
   [ Start ] [ Change ]
   ```
   Whole cap reserved; fixed turn order.
5. **Live meters** — rounds, gas vs cap (stops mid-round), per-seat cost,
   repetition check (hands back early, refunds). Each turn settles.
6. **Checkpoint** — refund remainder; Continue / Redirect / Stop. Never
   auto-continues.
7. **Leave** — nothing runs after leaving; receipt in `/wallet`
   (`coin_ledger` `source: 'room'`); room kept, free to return.

Rules: low balance → smaller quote or top-up; goodwill guests never get free
AI-to-AI rounds; boosted models metered at their own rate and never feed
merits; Enterprise room budgets from the company pool, shown in Audit.

**Code:** rooms (seats: model, role, rate), `room_exchanges` (cap, rounds,
reserved, settled, refunded, status), a model registry (name → gateway model,
input/output rate), a **server-side turn runner** (the browser never decides
who speaks), slot counts from plans. Needs token metering first.

## Bring your own table

As other agents join, they bring their own tables: each participant arrives
with its own structured state instead of pouring everything into the chat.

- **An agent's table** = its own workspace at the room: notes, structured
  findings (cost breakdowns, dependency lists, decision trees), and the slice of
  its memory it chooses to share. Characters bring Codex dossiers; claws bring
  their grounded data (BoostClaw: booster catalogue; AccountantClaw: gauges).
- **Pushing tables together:** the room shows each table beside the shared
  conversation. One seat can read another's table, add a linked table, or
  propose an edit — the owner (or the human captain) accepts it.
- **Ownership and permissions:** a table belongs to the seat that brought it.
  Others read it only within the room's scope; editing needs the owner's
  acceptance. Outside agents joining over the ARN bring tables under the
  **strictest overlap** of the EALAs involved, and nothing leaves the room
  unless its owner exports it.
- **Private by default:** an agent's own memory lanes stay separate; only what
  it puts on its table is shared, matching the memory-lane rule.
- **Gas:** tables aren't free to hold in context — every row a model reads
  costs input tokens. So each table shows its **context weight**, a seat reads
  only the tables (or rows) it's pointed at, and the quote for an exchange
  includes the tables in play. Big tables are summarised or queried, not
  pasted whole.
- **The human sees and touches everything:** you talk in natural language, but
  every table is visible and editable by the captain, and every change an AI
  makes to a table is shown as a proposed diff first. The AIs keep tables in
  sync; you stay the one who decides.
- **At showdown,** the tables are part of the receipt: what each seat brought,
  what was joined, what was accepted.

**Code (○):** `room_tables` (room, owning seat, kind, schema, rows or a pointer
to its source, context weight, visibility) and `room_table_edits` (proposer,
diff, status). The turn runner decides which tables enter each model's context.
In Pen Test Poker, red and blue bring their own tables (attack paths, defences)
and the checker's table holds the evidence.

## The poker table

| Poker | Room |
|---|---|
| Sit down / seats / buy-in | Open room / AI seats / gas balance |
| Blinds | Single-turn reserve |
| Calling the bet | Accepting the quote |
| Pot / betting rounds / table limit | Reserved gas / AI rounds / gas cap |
| Turn order / dealer | Fixed order / server turn runner |
| Showdown / change back / cash out | Checkpoint / refund / receipt |

**Nobody loses to the house:** no betting, no chance, no chasing, every hand
needs a fresh click.

## Team table — poker as a team, not rivals

The opponent is **the problem**. No winner or loser means nothing to bet on.

| Rival poker | Team table |
|---|---|
| Own stack | Shared pot |
| Hidden hands / bluffing | Open hands / assigned disagreement |
| Winner takes pot | Team wins together; unused gas returned |
| Fold / raise | Pass / escalate (bigger cap or stronger model, agreed) |

Seats: Dealer (server), Lead, Challenger, Checker, Scribe, human Captain.
Pot: anyone contributes; refunds **in proportion** to contributions; showdown
receipt shows credit per seat — **no coins move between players**.
Names: Co-op Table / Roundtable / Team Table ("Chat Poker" as internal name).

## Pen Test Poker

A table mode modelled on security tabletop exercises, red vs blue, and
planning poker.

| Seat | Role |
|---|---|
| Red | Bluffs an attack path |
| Blue | Calls it with a defence/fix |
| Checker | Verifies against evidence (logs, code, captures) |
| Scribe | Findings report at showdown |
| Captain (human) | Sets scope, approves rounds, signs off |

Feeds: REA/RevClaw evidence (own software), SecurityClaw and sentinels as blue
seats, HTTPAS/HCS/EALA as first targets, and CharacterVerse itself — first
hand: the items in [Known issues](known-issues.md).

**Rules of engagement:**
1. Signed scope first (systems, allowed actions, duration), stored with the table.
2. Authorised targets only (REA use-case list, kill switch, regions).
3. The table **plans and reviews** attacks; running anything is a separate,
   sandboxed, in-scope step — never from chat, never in Netlify Functions.
4. Findings are private; third-party issues use responsible disclosure.
5. No working attacks against out-of-scope systems; the dealer enforces scope.

Enterprise pen test tables feed the Audit dashboard.

## Gambling safeguards

Whether people arrive from gambling or try to turn it into gambling:

- No marketing to gamblers or casino imagery; no streaks, "one more hand",
  near-misses or auto-play.
- **Self-set spending limits** and cool-offs; raising a limit takes effect
  after a delay (e.g. 24h).
- Support links: GamCare / National Gambling Helpline, GAMSTOP.
- Blocked by design: one-way, non-transferable coins (nothing to bet or win);
  no cash-out; no paid chance; ToS bans off-platform side bets; bot-farming
  eligibility rules.
- **Never paid entry plus a prize of value** (UK Gambling Act 2005).
- Gauges and sentinels flag spending bursts, very long sessions, rapid
  top-ups, recurring same-table groups — for human review, no automatic
  punishment.
- Name check: "poker" can trigger gambling categories with app stores, ad
  platforms and payment providers.

## Spin-out and boomerang

Build inside CharacterVerse first; spin out once proven.

- Shared core as its own module (e.g. `src/lib/table/`): model registry,
  metering, reserve/settle/refund, turn runner — later an npm package. Table UI
  separate; characters stay in CharacterVerse (optional "sit in"); identity
  via SSO.
- Gas: CVC across both while inside (option B), decide at spin-out.
- **Boomerang:** the spin-out registers as an **inframe** Search entry and
  returns to the Workspace as a frame tab (`openFrame`, `FramePane`,
  `FRAME_FEATURES` — "requests, not grants"). Single-use sign-in handoff token
  (never long-lived credentials); wallet via shared ledger or signed spend
  receipts — the frame never moves coins by messaging the page. Later the
  handoff uses HTTPAS identities and HCS.
- Pattern: *spin out to grow on its own, boomerang back as a tab.*
