# 5. Workspace OS

**Status:** ✔ `/workspace` tab strip stored in `chat_tabs` (chat and frame
tabs, kept mounted), `TabIndex` "Workstation index" grouped by character, SAA
AlgorithmClaw column, `SearchSurface` embedded, `/search` three-engine flip,
VerseChrome thin bar (`CHROME_PATHS`), Seven Entrances launcher, TourClaw.
○ Everything below.

Mockups: two Fold Tabs screenshots (six "Folded Tabstation" tabs, "6 tabs
across 6 characters", and an opened fold grouped by character) were uploaded in
the planning session.

## Fold Tabs (Workspace+)

36 character jobs across 6 work divisions, folding inward like PC folders.

- A fold = a filtered `TabIndex` with its own folder tab. Make by dragging a
  tab onto another or with a Fold Tabs button; name, colour, icon; collapse
  slides tabs into the folder; unfold or drag out.
- Tabs inside stay mounted.
- `tab_folds` table (owner, name, colour, icon, position, open state);
  `chat_tabs.fold_id`; `api.tabs.ts` actions `fold`, `unfold`, `renameFold`,
  `moveToFold`, refused on the server without an active booster.
- Limits e.g. 6 folds × 6 tabs. Downgrade: folds become read-only, never deleted.

## Nesting Dolls (premium+ booster)

Folds inside folds — agents as the files on the computer.

```
 🪆 Company
  └─ 🪆 Division: Support
      └─ 🪆 Team: Billing help
          └─ 📄 Ledger  📄 ORACLE-9  📄 Xio chat
```

- Breadcrumbs (Company › Support › Billing help); each layer shows totals
  (divisions · teams · agents · active); move / copy / shortcut agents.
- `tab_folds.parent_fold_id` + `depth` (same pattern as `zkp_tunnels`), depth
  limit (e.g. 4) and loop check on the server. Downgrade flattens the view,
  keeps the structure.

## Enterprise doll

The full stack behind one workspace gate: AI Control Tower, ChatCabinet,
FileChat, Audit dashboard.

- A third tab kind `tool` in `chat_tabs` (the schema comment anticipates it).
- Split each page (`controltower.tsx`, `cabinet.tsx`, `filechat.tsx`,
  `audit.tsx`) into a panel under `src/components/enterprise/`, used by both
  the route and the tool tab. Lazy-load on first open, then keep mounted.
- Requires real server-side enterprise membership and roles first (see
  [Known issues](known-issues.md)); ENTERPRISE plan sets seats.

## Search as the front page

1. **Empty state:** when no tabs are open the Workspace shows `SearchSurface`
   (three-engine flip) plus an **"Ask a character"** button using
   `/api/ask-route` ("I'm Feeling Lucky"). Results open as tabs; Ask's question
   is **staged** in the tab, not sent. (An Ask panel extracted from
   `src/routes/ask.tsx` is the alternative; mode buttons become tabs or labelled links.)
2. **Routes:** `/` becomes the Workspace with Search; `/search` and
   `/workspace` redirect to it preserving `?verse=`, `?q=`, `?slate=`; the
   Verse Wheel moves to e.g. `/wheel`; update the ~8 `/workspace` and ~17
   `/search` links.
3. **Chrome:** add `/` to `CHROME_PATHS`; lazy-load the SAA column.

The thin bar + tab strip + SAA column read as menu bar, taskbar and side panel.

## Seven Entrances — menu and navigation in one (GPS)

The launcher is "the wheel, flattened", generated from `VERSES`; picking a
Verse opens its sub-wheel in place.

**Flip: The Verses | The Wheel.**
- *The Verses:* today's tiles.
- *The Wheel:* a compact live wheel — current Verse lit, sub-wheel open,
  pulsing **you-are-here** pin, breadcrumb (Jobs › Gig Board), tap to travel.
  North-up by default, heading-up toggle.

**`whereAmI(pathname)`** in `src/lib/verses.ts`, generated from `VERSES`:
returns Verse, page, home Verse (for pages in several Verses), or off-map with
the nearest Verse via parent-path lookup.

GPS additions: launcher search, recents, live traffic badges (CMail, booster
expiring, provider down), points of interest (Goodwill claim available).
To follow you everywhere the mark must be in every page header, or the thin bar
becomes the header everywhere.

## TourClaw — the GPS that talks back

✔ `src/components/TourClaw.tsx` ("Following you · {here}") and
`src/routes/api.tourclaw.ts`. Its hand-written `SITE_MAP` is **stale**
(describes `/` as three entrances; knows 6 pages).

- Generate its site map from `VERSES` and its location from `whereAmI`;
  header shows the breadcrumb.
- Directions as checked steps — only to pages that exist (server-checked);
  "recalculating", "you have arrived", traffic notes, points of interest.
- Front desk for other claws: boosters → BoostClaw, store → CStoreClaw,
  economy → AccountantClaw ("TourClaw → BoostClaw").

## Orphan pages

~85 pages, ~41 wheel destinations, ~44 off the map:

- **Detail pages** (`/characters/$id`, `/chat/$id`, `/cvj/gig/$id`,
  `/cvv/watch/$id`, `/caz/agent/$id`, `/social/u/$handle`…) — parent lookup.
- **Chrome destinations** (`/search`, `/cstore`, `/cmail`,
  `/cmail/notifications`) — "In the bar".
- **True orphans** — `/billing`, `/enterprise`, `/audit`, `/filechat`,
  `/training`, `/studio`, `/profile`, `/accountantclaw`, `/routeclaw`,
  `/charter`, `/platform`, `/neural`, `/cron`, `/collab`, `/mission`,
  `/rooms`, `/artv2`, `/artv3`, `/art-method`, `/wwb`.

An **orphan list** beside `VERSES` (description + nearest Verse) lets TourClaw
explain them. Record orphan visits/questions (no personal content) to decide
adopt vs retire. **Coverage test:** every route is on the wheel, in the bar, a
detail page with a parent, or on the orphan list.
