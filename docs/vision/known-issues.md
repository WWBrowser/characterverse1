# Known issues

Gaps found in the current code during planning. These are the first hand for
Pen Test Poker and step 1 of the [roadmap](roadmap.md).

| # | Issue | Where | Impact | Fix |
|---|---|---|---|---|
| 1 | **Private characters leak into search and category results.** The list query filters `isPublic`, but the `search` and `category` branches build new queries without it. | `src/routes/api.characters.ts` (GET) | Private characters visible on `/discover` searches and filters | Keep `eq(characters.isPublic, true)` in all three branches. (`db/searchindex.ts` already filters correctly.) |
| 2 | **Enterprise gate and boss role are browser-only.** `src/lib/enterprise.ts` stores mode and role in localStorage — "not an auth boundary". No role check found in `api.audit.ts`. | `src/lib/enterprise.ts`, `api.audit.ts`, `api.chatmarks*`, `api.controltower.ts`, `api.missions*`, `api.context*` | Anyone can open Audit, including `audit_trims` meant for boss/auditors only | Server-side workspace membership and roles tied to member accounts; every enterprise API checks them |
| 3 | **Plans, wallets and tabs belong to a random browser ID** (`cv_session` / `getSession()`), not member accounts. | `plan_subscriptions.session_id`, `coin_ledger.session_id`, `chat_tabs.session_id` | Clearing browser data loses a paid plan or coins | One identity: member account (later ZKP keys) behind all of them |
| 4 | **Ownership checks use the session ID.** e.g. birth-certificate edits compare `creatorSession`. | `api.caz.agents.$id.ts`, `api.caz.control.ts` | Fine for cosmetic fields, too weak for licences or reverse action | Member-account ownership; ZKP signature for licence changes and grants |
| 5 | **CVC is flat per reply and charged after the fact.** | `api.chat.$id.ts` (`meterChatInference`) | Real cost ignored; replies run at zero balance | Token metering + reserve-then-settle |
| 6 | **Background AI calls are unmetered.** | `captureMemories` and others | Unrecorded cost | Fold into the triggering action |
| 7 | **TourClaw's site map is stale.** | `src/routes/api.tourclaw.ts` | Wrong guidance about `/` and most pages | Generate from `VERSES` + `whereAmI` |
| 8 | **Subscribing grants coins without payment.** | `api.billing.ts` `subscribe` | Free paid plans | Only verified payment webhooks activate paid plans |
