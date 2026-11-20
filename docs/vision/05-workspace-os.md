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

## TourClaw shop — capabilities and extensions

Compared with HeyClicky (cursor-side voice assistant with screen guidance and
background agents; Free / Pro $20 / Max $100 by message counts — as described,
not verified). WWB is the natural home; desktop-wide later.

| Kind | Made by | Examples |
|---|---|---|
| **Capabilities** | Us — unlocked by plan, booster or gas | 🗣️ Voice · 🖱️ Show me highlights · 👁️ Screen guide (WWB) · 🛰️ Background agents · 🧭 Cross-Verse directions |
| **Extensions** | Third parties via Forge/ThoughtHub | Guide packs per app/site · Gmail/Notion/calendar via OAuth · 🦯 accessibility pack (Agent Eyes) · language packs |

Pricing: the text guide stays free forever; capabilities by tier or as
boosters, token-heavy ones metered by gas; extensions priced by makers with
royalties; cheap capabilities may enter the Goodwill pool.

Rules: screen viewed **only on explicit trigger** with a visible indicator;
per-site permission, never banking/password/health pages unless allowed; no
kept screenshots; background agents follow reverse-action rules and ask before
spending or sending; extensions declare permissions ("requests, not grants"),
run sandboxed, are reviewed, signed (HCS) and revocable, with update scans;
TourClaw always identifies as AI.

Code (○): `src/lib/tourclaw/capabilities.ts`, `tour_extensions`,
`member_extensions`, gas metering in the TourClaw API, WWB screen-guide capture
and highlight bridge, a CStore aisle.

### Personal guides

"Adopt as my guide" on character pages, Codex dossiers and TourClaw settings:
**TourClaw's knowledge, your character's personality** (built like
`buildSatellitePrompt()`). Facts, directions, prices and permissions still
come from the server; honesty and the attention charter sit above the persona;
the character's licence must allow adoption (fallback to default TourClaw);
guide sessions use their own memory lane and never enter Punk Records; own-
character use doesn't count as merit; creators can earn if commercial use is
allowed; a short cached voice summary keeps cost down.
`tourclaw_character_id` member setting; header "🧭 Xio · Following you · …".

### Twin guides (TourClaw Edition)

Adopting a twin (`characters.twinId`) gives two guides in Together Chat style:
a **navigator** (server route) and an **explainer** (why and tips), or "two
takes" mode. One route always; the second voice speaks only when it adds
something or is asked (@Byte); one turn each, no AI-to-AI loop unless started;
both licences required; same privacy rules; speaker names on every reply, two
distinct voices, and a single-guide switch. Twin mode as a shop capability;
earnings split between creators. `tourclaw_twin_id`; reuses the Twin Chat
pipeline.

## TC-Link — the information desk for web apps

Like a mall directory, a town information centre or a park ranger, but for web
apps: a TourClaw guide any partner site, app or WebWorld can plug in, with
answers served by the TourClaw service.

| Information centre | TC-Link |
|---|---|
| "You are here" board | `whereAmI`, live wheel pin |
| Entrance map | Partner's `tourclaw.md` site map (its current almanac edition) |
| Person at the desk | TourClaw, or a licensed character / twin pair |
| "How do I get to…?" | Checked directions, real pages only |
| Leaflets | Guide packs and extensions |
| "Closed today" | Signal-box status |
| Lost and found | Orphan pages |

A desk, not a salesperson; knows its own building ("I don't know, here's who to
ask"); there when you walk up. Tagline: *"the information desk for your web app."*

**Flow:** partner embeds a widget script with a public site key → questions go
to a TC-Link endpoint → TourClaw prompt + partner map → AI Gateway → answer
with checked directions, gas billed to the partner.

**Honest notes:** there is no separate "TourClaw model" — it's a service
(prompt + maps + checks + metering) on `claude-haiku-4-5`, so partner usage
counts against our gateway credits and rate limits; keep it a guide service,
not an open chat API (provider terms). **Name:** "TC-Link" is one letter from
the TP-Link trademark; use TourClaw Link / TourLink publicly after a trademark search.

**Safety and sustainability:** public site keys locked to partner domains plus
secret server keys, revocable; per-site and per-visitor rate limits and on-topic
answers; prepaid credits or a plan, small free tier; partner map and page text
treated as data, never instructions; a data processing agreement (UK/EU GDPR),
no visitor data in Punk Records or training; always labelled AI ("powered by
TourClaw"); widget hides gracefully if the service is down.

**On Netlify:** endpoint as a server route (e.g. `src/routes/api.tclink.ts`)
with CORS per partner domain; key checks and rate limits in an Edge Function in
front; widget as a static script.

### White label and pop-out

Today TourClaw is a fixed paw button bottom-right on every page
(`src/components/TourClaw.tsx`, mounted in `__root.tsx`) — always visible, so
people tap it without needing help, which costs gas.

**White-label settings (partner):** name, icon (paw, compass, logo, text),
colours, position (corner or inline), launcher style (floating button, "Help"
link, shortcut only, none), guide character, greeting and starter questions.
**Cannot be hidden:** that it's AI, and "powered by TourClaw".

**Modes:** docked page (`/guide` or the partner's URL), pop-out (opened from a
Help link or shortcut, can pop back into the page), floating (opt-in only).
Default becomes "out of the way". The conversation persists across modes and
still knows the page you came from.

**Apply to CharacterVerse too:** move TourClaw to a Help entry in the VerseChrome
bar and Seven Entrances launcher plus a `/guide` page; floating button as a user
setting. Split `TourClaw.tsx` into panel + launcher. Gauge: questions per
visitor and share ending in a followed direction (help vs idle chat).

Settings table `tclink_sites` (name, icon, colours, position, launcher mode,
guide, greeting, domains, keys).

## Page Almanac

A companion to TourClaw and TC-Link listing every page and how it changed,
year by year — replacing TourClaw's stale hand-written site map.

- **Generated at deploy time** from `src/routeTree.gen.ts`, `VERSES`/`whereAmI`,
  the orphan list and git/deploy history. The coverage test also requires an
  almanac entry per route.
- **Entry:** page, place (Verse › page / bar / orphan + nearest Verse), purpose,
  status (🆕 new · ✏️ changed · ➡️ moved · 🗄️ retired), history with dated
  notes, visibility (public / members / enterprise-admin).
- **Editions:** a live edition per deploy; an annual sealed edition
  ("CharacterVerse Almanac 2026") with a digest; "what's new" this month/year.
  Changes are added, never overwritten.
- TourClaw looks up only relevant entries (DHTGCS); TC-Link partners publish
  their own almanac as `tourclaw.md`.
- Private/admin pages are shown only to people allowed to see them; every entry
  comes from the route tree, so it can't list a page that doesn't exist.
- Code (○): `src/lib/almanac.ts`, generated JSON per edition (or
  `almanac_entries` / `almanac_changes`), a `/almanac` page.

### Almanac redirects — link rot becomes redirects

"Moved" entries generate redirect rules (`netlify.toml` / `_redirects`) at
deploy, keeping address options (`/workspace?slate=abc` → `/?slate=abc`) and
dynamic IDs.

| Destination | Result |
|---|---|
| Active | 301 straight there |
| Moved again | Collapsed to the final page in one hop — no chains |
| Retired with a successor | Redirect to the successor, with a note |
| Retired, no successor | **410 Gone** almanac page: what it was, when it closed, what to try |
| Temporarily moved | 302 |

The build fails if a redirect target isn't in the route tree. TourClaw explains
the hop ("moved to Jobs › Gig Board in March 2026"). Partners install their own
redirects on their domain; TourClaw on their site can still explain moves.
Gauge old-link use; unused links can retire to 410 after a long period (e.g. 2 years).

### Page Dossier — TourClaw Advanced view

Mirrors the Codex Simple/Advanced toggle (`AdvancedViewToggle`, `DossierCard`
in `src/lib/character-codex.tsx`). Simple shows the route; Advanced shows each
step as a **Page Dossier** card — place, purpose, status, added/changed dates,
redirects in and out, health, how often it's asked about — and **ADVANCED
VIEW** opens the full almanac entry.

- Derived, not stored (`src/lib/page-dossier.ts`, pure like `buildDossier()`).
- Badges: On the map · Accessible · Agent actions · Stable; warnings: Redirect
  chain · Often asked about.
- Counts only, never question content; visibility respected; off by default.
- For partners, Advanced shows where visitors get lost, which old links still
  bring traffic, and where directions fail.

## MyCustom Menu — menu mapping

Like console button mapping, for menus. Menus already come from one list
(`VERSES`), so MyCustom Menu is a personal layer on top.

| Console | MyCustom Menu |
|---|---|
| Swap buttons | Reorder Verses and pages |
| Rename in a profile | Your own labels ("Gigs" for Gig Board) |
| Disable a button | Hide items |
| Shortcut combos | Keyboard shortcuts |
| Quick-access slot | Pins on the thin bar |
| Profiles | Presets (Creator, Job hunter, Minimal) |
| Share a layout | Share a preset as a link |
| Reset | One click |

**Why:** a disorganised menu kills a business for subjective reasons — people
can't get behind a layout even when it's logical. *The customer is always right
in matters of taste.* Defaults must still be the best we can make (most people
never customise); aggregate remaps can suggest default changes (counts only,
human decides); taste, not safety.

**Rules:** map only, never invent — real destinations only (no spoke to
nowhere). **Anything else belongs in the Workspace**, which holds outside
systems as tabs; a Workspace fold can be pinned to the menu as a real
destination and is removed if the fold is deleted. Help, Settings, reset and
legal pages can't be hidden. Maps record the `VERSES` version; new pages appear
in a "New" slot. TourClaw uses your labels ("Gigs (Jobs › Gig Board)"). Free
tier, keyboard- and screen-reader-accessible — never a booster.

Code (○): `member_menu_maps` (preset, base `VERSES` version, overrides JSON),
`src/lib/menu-map.ts` (pure, used by header, launcher, wheel, TourClaw), a
Customise menu screen, coverage test for maps.

### Menu Dossier

Codex pattern by username: the shared `Wheel` draws the default layout faintly
and yours brightly, with **drift** per item (moved, renamed, hidden) replacing
the satellite sync view, overall drift %, preset, pins, shortcuts, badges
(Minimalist, Power user, Shortcut keys) and ADVANCED VIEW for map history.
Public name "My Menu card".

**It describes a person**, so: the user sees their own in full (YEY! for
humans); partners/operators see **aggregates only** with a minimum group size
(~20) and no usernames; support sees an individual dossier only via a one-off,
time-limited "share my menu with support" link. It's profiling under UK/EU
GDPR: stated purpose, privacy policy, DPA for partners, deletion on request.

**Diagnosing partner apps:** Page Dossier (most-asked pages, old links) +
aggregated Menu Dossiers (most moved/renamed/hidden items) + counted TourClaw
questions → evidence-backed suggestions, e.g. "38% rename Workspace to
Projects; Billing is the second most asked-about page." TourClaw never changes a
partner's menus.

### Menu Sync Protocol

Updating the web through user intent, for sites that host the MyCustom Menu widget.

- **User → host:** aggregate, anonymous intent improves the host's default menus.
- **Host → user:** your saved preferences apply on every hosting site.
- **`menu.md`:** hosts publish menu items with **standard types** (`billing`,
  `settings`, `help`, `search`, `account`, `notifications`, `projects`…);
  preferences target types, not labels; new types reviewed like dictionary
  terms; unknown types keep the site's default.
- **"Only boosts hosts"** means only hosts get diagnostics and portable menus —
  **never** a search-ranking boost (a "supports MyCustom Menu" badge is fine).
- **Privacy — the user holds the sync:** preferences stored with the user;
  per-site consent ("Apply your saved menu here?"); a site gets only what applies
  to its own menu; no shared ID across sites; diagnostics aggregate only
  (UK/EU GDPR, PECR).

#### Agentic ZKP Sync

Reuses the ZKP sign-in (device keys, server stores only public keys):
per-site keys derived from the device key (like passkeys) so sites can't link
you; a new `sync` scope; preferences **encrypted on the device** so CharacterVerse
stores but can't read them; device-signed type-level statements per site;
revocation per site or device; a `zkp_audit`-style log of which sites synced
when, never content. Caveats: losing all devices loses the keys (optional
recovery key or second device); security review before it protects more than
menus; account-based fallback with the same consent rules. Code (○): per-site
derivation in `src/lib/zkp-client.ts`, `sync` scope in `api.zkp.ts`/`db/zkp.js`,
`encrypted_menu_prefs`.

## QTA — Quotes to Action (fifth Ask mode)

A fifth entry in `MODES` (`src/lib/modes.ts`, after Roleplay, Learn, Business,
SPR), giving `/mode/qta`, entrance cards, the switcher and TourClaw awareness.

**Quote → Intent → Action / Application:**

```
 You:  "The script of life is life itself; & life will go on."
 QTA:  Reading — living is the plan; setbacks don't stop the story.
       ① Today: 10 minutes on something you've been waiting to start.
       ② This week: note one thing that went wrong and what carried on.
       ③ Ongoing: when over-planning, take the first small step.
       [ Add to calendar ]  [ Make it a mission ]  [ Another reading ]
```

- One to three small, reversible actions at different scales; the user picks;
  optional follow-through into `calendar_events` and `missions`.
- **Events:** weddings, birthdays, anniversaries, retirements, graduations,
  launches, memorials — the quote and intent shape vows, readings, reception,
  decor, keepsakes and a dated timeline; every plan item shows what part of the
  quote/intent it serves, and items serving neither are flagged; drafts are the
  user's to edit; shared planning in a Workspace tab or room with roles.
- **Rules:** no streaks or nagging; never guess or invent attributions; not
  therapy — gentle tone and support links for grief and hardship; memorials get
  no upbeat "action" framing; flag song lyrics and recent poems that may need
  permission, suggest public-domain alternatives; respect chosen culture and
  faith traditions; fit the stated budget, label any sponsored vendor; guest
  lists stay private; own memory lane (`scope: 'qta'`); "done" actions count as
  private Real World Application only.
- Code (○): the `qta` `MODES` entry (label, ❝ emoji, accent, greeting,
  placeholder, features Reading · Actions · Follow-through, quick starts incl.
  "Plan a wedding around a quote", "Write vows from a quote"), event templates
  with tone settings, calendar/missions buttons.
