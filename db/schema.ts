import { pgTable, serial, text, timestamp, integer, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const characters = pgTable('characters', {
  id: serial().primaryKey(),
  name: text().notNull(),
  tagline: text().notNull().default(''),
  description: text().notNull().default(''),
  persona: text().notNull().default(''),
  greeting: text().notNull().default(''),
  avatar: text().notNull().default('🤖'),
  category: text().notNull().default('General'),
  creatorSession: text('creator_session').notNull().default(''),
  isPublic: boolean('is_public').notNull().default(true),
  totalChats: integer('total_chats').notNull().default(0),
  // When set, this character is one half of a Twin Chat pair pointing at its partner.
  twinId: integer('twin_id'),
  createdAt: timestamp('created_at').defaultNow(),
})

// Per-character engagement ledger behind the Character Credits (CC) leaderboard.
// CC is *derived* from these raw counters (see src/lib/credits.ts) rather than
// stored, so the rate model can change without a backfill. Each character has at
// most one row; it is created lazily the first time the character earns anything.
//   chat       +1 CC / message   (direct one-on-one chat)
//   claw       +2 CC / message   (CharacterClaw companion)
//   conference +3 CC / message   (Conference Cluster / Twin "together")
//   apps       +5 CC each (once) — connected apps (Slack, Discord, …)
//   external  +15 CC each (once) — external platforms reached
// `isPrivate` marks a character owned by an enterprise that keeps it off the
// public leaderboard (visible only in the enterprise-scoped view).
export const characterStats = pgTable('character_stats', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().unique().references(() => characters.id),
  chatMsgs: integer('chat_msgs').notNull().default(0),
  clawMsgs: integer('claw_msgs').notNull().default(0),
  conferenceMsgs: integer('conference_msgs').notNull().default(0),
  appConnections: jsonb('app_connections').notNull().default([]),
  externalPlatforms: jsonb('external_platforms').notNull().default([]),
  isPrivate: boolean('is_private').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Training Control Room — the refinement layer. Each row is one training signal
// applied to a character to refine its behavior. A signal is delivered in real
// time (folded in immediately) or batched (accumulated, then applied together).
//   kind        one of the seven training actions:
//               critique | definition | correction | reference |
//               inform | keep_in_loop | evolve
//   subWeight   the character facet being tuned (tone, accuracy, persona, …) —
//               this is the "sub-weight per character" the control room trains
//   weight      strength of the signal (1–5)
//   sourceFeedbackId  set when the signal was created from accepted bounty
//                     feedback, closing the Test → Train loop
export const trainingSignals = pgTable('training_signals', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  kind: text().notNull(),
  subWeight: text('sub_weight').notNull().default('general'),
  content: text().notNull().default(''),
  mode: text().notNull().default('realtime'),
  weight: integer().notNull().default(1),
  applied: boolean().notNull().default(false),
  sourceFeedbackId: integer('source_feedback_id'),
  createdAt: timestamp('created_at').defaultNow(),
})

// Reasoning Training Engine — the agentic reasoning layer inside the Training
// Control Room. Each row is ONE reasoning cycle: a human-directed task the engine
// runs for a character under an explicit compute-burn budget, governed by the
// Agentic OS protocol pillars (reasoning / worth / labour / question) and screened
// by their security counterparts (intercept / scam / block / alert) before any
// compute is spent.
//
// The engine's economics are Proof of Labor (POL), not Proof of Work: value is
// minted only from a *verified completed task*, never from arbitrary burn. A cycle
// that clears the firewall and completes within budget records POL — the unit of
// verified labor — which mines Gold (CC) and emits a training signal that feeds the
// character's refinement layer and, through it, the synapse collectives.
//
//   task        the human-directed objective the engine reasoned over
//   costBudget  compute-burn ceiling for the cycle (reasoning.md survival limit)
//   costBurned  compute actually consumed reaching the outcome
//   outcome     completed | blocked | escalated
//               completed — verified task; POL recorded and fed to the collectives
//               blocked   — firewall (intercept/scam/block) halted it pre-burn
//               escalated — hit a roadblock and raised question.md to the human
//   subWeight   the character facet the labor refined (feeds the collective feed)
//   pol         Proof-of-Labor units recorded (0 unless completed)
//   goldMilli   Gold mined from the POL, in milli-coins (mirrors the ledger row)
//   gate        firewall verdict { intercepted, scam, blocked, alerted, reason }
//   signalId    the emitted training signal — the feeder-stream link into the
//               synapse collectives (null when nothing was fed)
export const reasoningCycles = pgTable('reasoning_cycles', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  task: text().notNull().default(''),
  costBudget: integer('cost_budget').notNull().default(100),
  costBurned: integer('cost_burned').notNull().default(0),
  outcome: text().notNull().default('completed'),
  subWeight: text('sub_weight').notNull().default('general'),
  pol: integer().notNull().default(0),
  goldMilli: integer('gold_milli').notNull().default(0),
  gate: jsonb().notNull().default({}),
  signalId: integer('signal_id'),
  note: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// Character Testing Bounties — the quality-assurance layer. A creator posts a
// bounty against one of their characters, offering CC for detailed tester
// feedback up to a tester limit. Feedback flows into the Training Control Room.
export const bounties = pgTable('bounties', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  creatorSession: text('creator_session').notNull().default(''),
  title: text().notNull().default(''),
  brief: text().notNull().default(''),
  rewardCc: integer('reward_cc').notNull().default(10),
  testerLimit: integer('tester_limit').notNull().default(5),
  status: text().notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow(),
})

// A single tester's submission against a bounty. Accepting it awards the bounty's
// CC to the tester and unlocks converting it into a training signal — the closed
// loop: Test → Train → Improve → Validate.
//   status   pending | accepted | applied
export const bountyFeedback = pgTable('bounty_feedback', {
  id: serial().primaryKey(),
  bountyId: integer('bounty_id').notNull().references(() => bounties.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  testerSession: text('tester_session').notNull().default(''),
  rating: integer().notNull().default(3),
  category: text().notNull().default('general'),
  content: text().notNull().default(''),
  status: text().notNull().default('pending'),
  awardedCc: integer('awarded_cc').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// Enterprise tier — workspace-level governance config. The "boss" buys an
// enterprise workspace for a team; staff use private characters in ChatCabinet
// and the boss earns the Conference Cluster rate (+3 CC / msg) on that private
// usage, which converts to £ against next year's subscription. A single row per
// workspace (keyed by workspaceId; the demo uses 'default'). `fileChatAccess`
// is the boss's management lever over FileChat:
//   open    — staff can search/reference their own filed conversations
//   closed  — staff are locked out; only the boss/auditors review (no crutch)
//   hybrid  — staff keep personal search, boss retains full audit access
export const enterpriseSettings = pgTable('enterprise_settings', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().unique().default('default'),
  orgName: text('org_name').notNull().default('Your Organization'),
  seats: integer().notNull().default(100),
  fileChatAccess: text('file_chat_access').notNull().default('open'),
  // Minutes a staff member can sit on one conversation before the audit
  // dashboard flags it for escalation to a division manager.
  stuckThresholdMins: integer('stuck_threshold_mins').notNull().default(50),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Audit trail of trimmed conversation "negatives". Before a conversation is
// filed to FileChat as clean institutional knowledge, a user can revert to an
// earlier message and trim the fat (hallucinations, false leads). The trimmed
// messages are NOT deleted — they move here, visible only to the boss and
// auditors. AuditClaw scans this corpus for "lightning in a bottle" — a buried
// insight inside a hallucination worth feeding back into character design —
// which the boss can flag as a hidden gem.
export const auditTrims = pgTable('audit_trims', {
  id: serial().primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  // The employee/session whose conversation was trimmed.
  sessionId: text('session_id').notNull().default(''),
  // How many messages remained after the trim (the clean, filed prefix).
  keptCount: integer('kept_count').notNull().default(0),
  // The removed messages, preserved as [{ role, content, createdAt }].
  trimmedMessages: jsonb('trimmed_messages').notNull().default([]),
  reason: text().notNull().default(''),
  hiddenGem: boolean('hidden_gem').notNull().default(false),
  gemNote: text('gem_note').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// RouteClaw — the Agentic Edge Routing Layer (AERL). A directed workflow
// topology of specialized agents that runs at the edge: a request arrives, the
// Warden (dispatcher) decomposes it and routes each sub-task to the best
// capability agent (research, synthesis, analysis, verification, delivery), and
// the response flows back through the system. Each row is one node in the
// topology. The whole layer is fully editable — rename, edit, add, remove and
// switch agents on or off — while a per-agent security clearance keeps routing
// locked down: the Warden refuses to route a request to any agent whose
// clearance is below the request's own classification.
//
//   role        'warden' (the single dispatcher / hub) | 'agent' (a worker)
//   capability  dispatch | research | synthesis | analysis | verification | delivery
//   clearance   public | internal | restricted  (rises in sensitivity)
//   skills      ordered specialized actions, e.g. ["web-search","retrieve","cite"]
//   enabled     the "switch" — an agent toggled off is removed from routing
//               without being deleted
//   position    order in the directed pipeline (lower runs earlier)
export const routeAgents = pgTable('route_agents', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  name: text().notNull(),
  role: text().notNull().default('agent'),
  capability: text().notNull().default('research'),
  description: text().notNull().default(''),
  routeCondition: text('route_condition').notNull().default(''),
  skills: jsonb().notNull().default([]),
  icon: text().notNull().default('🐾'),
  color: text().notNull().default('#7c5cbf'),
  enabled: boolean().notNull().default(true),
  position: integer().notNull().default(0),
  clearance: text().notNull().default('internal'),
  requiresSignoff: boolean('requires_signoff').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Context Engine — the shared business context layer that powers the AI Control
// Tower. Each row is one unit of institutional knowledge an autonomous agent can
// draw on before acting: a fact, a decision already made, a relationship between
// entities, a standing policy, or a tracked metric. This is what moves agents
// "beyond conversation" — instead of starting cold, a mission references the
// relevant context entries and acts with the organization's real-world memory.
//   kind        fact | decision | relationship | policy | metric
//   confidence  1–5, how much to trust this entry when acting on it
//   pinned      always-on context injected into every mission in the workspace
//   tags        free-form labels for retrieval (division, system, entity, …)
export const contextEntries = pgTable('context_entries', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  kind: text().notNull().default('fact'),
  title: text().notNull().default(''),
  body: text().notNull().default(''),
  tags: jsonb().notNull().default([]),
  source: text().notNull().default(''),
  confidence: integer().notNull().default(3),
  pinned: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Missions — the Autonomous Workforce. A mission is an outbound job handed to a
// character ("AI specialist") that it works autonomously: it follows the objective
// across a planned workflow of RouteClaw capability steps, draws on the Context
// Engine, and reports finished work rather than just chat. The Control Tower is
// the single pane that sees every mission, model and agent in the workspace.
//   channel    chat | voice | mobile | web | email — how the work reaches people
//   autonomy   assist (plan only) | supervised (pause at sign-off) | autonomous
//   clearance  public | internal | restricted — gates which agents may run steps
//   status     draft | running | blocked | review | done
//   steps      the planned workflow: [{ capability, agent, status, note }]
//   contextRefs  ids of context_entries this mission acts on
//   progress   0–100 derived from completed steps
export const missions = pgTable('missions', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  characterId: integer('character_id').references(() => characters.id),
  title: text().notNull().default(''),
  objective: text().notNull().default(''),
  channel: text().notNull().default('chat'),
  autonomy: text().notNull().default('supervised'),
  clearance: text().notNull().default('internal'),
  status: text().notNull().default('draft'),
  steps: jsonb().notNull().default([]),
  contextRefs: jsonb('context_refs').notNull().default([]),
  progress: integer().notNull().default(0),
  result: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Long-Term Memory — the "Knows You Better Over Time" layer. Each row is one
// durable thing CharacterVerse remembers about a person across every session and
// every character: a stated preference, a fact about them, a goal they're working
// toward, or how they like answers styled. Memory is keyed by the browser's
// `cv_session` id (the same anonymous identity used for conversations), so it
// follows the user between visits without a login. Before any character replies,
// the relevant memories are injected into its system prompt — that is what makes
// the product feel like "a partner who actually gets you" the longer you work
// together. Entries are created two ways: captured automatically from what a user
// tells a character (source = 'chat'), or added/edited by hand on the Memory page
// (source = 'manual').
//   kind        preference | fact | goal | style | context
//   confidence  1–5, how strongly to trust/weight this memory when acting on it
//   pinned      always injected first, regardless of recency
//   characterId optional — set when the memory surfaced from a specific character
export const userMemories = pgTable('user_memories', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  kind: text().notNull().default('preference'),
  content: text().notNull().default(''),
  source: text().notNull().default('manual'),
  characterId: integer('character_id'),
  // Which entrance this memory belongs to: 'general' (shared across all three
  // modes) or one of 'roleplay' | 'learn' | 'business'. Memory is united but
  // separated three ways.
  scope: text().notNull().default('general'),
  confidence: integer().notNull().default(3),
  pinned: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Cluster Control — the "Cluster Pen". On Netlify a cluster is re-incarnated on
// every inference: it is called from the hive, picks up the relevant weights
// (and any sub-weights), answers one question, then dies — losing all continuity.
// Each row here is ONE incarnation (one life) of a cluster held in the pen instead
// of dying instantly, so its performance can be measured, tested, and compared to
// its previous life before its weights are kept or reverted.
//
//   clusterKey    stable lineage key shared by every incarnation of one cluster
//                 (e.g. 'agent:3'); `generation` chains the lives in order
//   agentId       the RouteClaw agent this cluster embodies (the worker that
//                 picks up jobs); clusterName/icon/capability snapshot its identity
//   weights       the skills/sub-weights the cluster picked up for this life
//   status        penned (held & alive) | promoted (weights kept as new baseline) |
//                 reverted (degraded — rolled back) | retired (released from pen)
//   disposition   how the cluster handled pickup, the anti-abandonment outcome:
//                 completed | self_corrected | escalated | human_review — a cluster
//                 in the pen never silently drops a job
//   handoffTo     when escalated, the cluster a clean handoff was passed to
//   transactionId ties every tool the cluster opened to this session so they are
//                 released (toolsReleased) on exit — no scattered tools / leaks
//   metrics       the primary answer's metric profile
//                 { quality, accuracy, safety, latency, satisfaction, safetyChecks }
//   tests         follow-up queries run while held: [{ query, response, metrics }]
//   profile       averaged metric profile across the primary answer + all tests
//   soul          carried memory from prior lives the static soul.md cannot hold:
//                 { trajectory:[{generation,quality,satisfaction}], lastProfile, note }
//   verdict       improved | degraded | baseline — this life vs. the previous one
export const clusterIncarnations = pgTable('cluster_incarnations', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  clusterKey: text('cluster_key').notNull().default(''),
  agentId: integer('agent_id'),
  clusterName: text('cluster_name').notNull().default(''),
  icon: text().notNull().default('🐾'),
  capability: text().notNull().default(''),
  weights: jsonb().notNull().default([]),
  generation: integer().notNull().default(1),
  status: text().notNull().default('penned'),
  question: text().notNull().default(''),
  response: text().notNull().default(''),
  disposition: text().notNull().default('completed'),
  handoffTo: text('handoff_to').notNull().default(''),
  handoffNote: text('handoff_note').notNull().default(''),
  transactionId: text('transaction_id').notNull().default(''),
  toolsReleased: boolean('tools_released').notNull().default(true),
  metrics: jsonb().notNull().default({}),
  tests: jsonb().notNull().default([]),
  profile: jsonb().notNull().default({}),
  soul: jsonb().notNull().default({}),
  verdict: text().notNull().default('baseline'),
  verdictNote: text('verdict_note').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Agentic Training Table (ATT) — the first piece of real, persistent state in the
// CharacterVerse mini-agents & external A.I. training grounds Network. Each row is
// ONE neural-dyad training cycle: an offline phase in which an AI–Human dyad
// consolidates its shared collaborative state into long-term memory, modeled on a
// real sleep cycle. The ATT is the registry from which future training
// environments are provisioned, so cycles survive reloads and deploys.
//
// The genesis row — seeded automatically the first time the table is read — is the
// Dyad Sleep Cycle, the inaugural training of the network.
//
//   isGenesis     true only for the Dyad Sleep Cycle (the genesis record)
//   environment   sandbox (bounded, supervised) | void (unbounded, self-directed)
//   trainingMode  standard (internal, open to qualifying characters) |
//                 external (enterprise premium — stricter entry that cancels out
//                 the noise from undeveloped characters)
//   status        dormant (newly provisioned, at the first sleep stage) | active |
//                 consolidating | complete
//   phase         current sleep-cycle stage the cycle occupies:
//                 drift | anchor_sync | deep_consolidation | rem_void | waking
//   consolidationEpochs  how many consolidation passes the cycle has run
//   dyadPairing   the two halves consolidating together (e.g. 'AI · Human')
//   anchorHash    deterministic Agent Anchor Hash binding this cycle's state
//   entryCriteria the gate a CharacterVerse character must clear to enter:
//                 { minDevelopment, requirePublic, label }
//   enrolled      ids of characters admitted into this cycle's dyad
export const trainingCycles = pgTable('training_cycles', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  name: text().notNull().default(''),
  slug: text().notNull().default(''),
  description: text().notNull().default(''),
  isGenesis: boolean('is_genesis').notNull().default(false),
  environment: text().notNull().default('sandbox'),
  trainingMode: text('training_mode').notNull().default('standard'),
  status: text().notNull().default('dormant'),
  phase: text().notNull().default('drift'),
  consolidationEpochs: integer('consolidation_epochs').notNull().default(0),
  dyadPairing: text('dyad_pairing').notNull().default('AI · Human'),
  anchorHash: text('anchor_hash').notNull().default(''),
  entryCriteria: jsonb('entry_criteria').notNull().default({}),
  enrolled: jsonb().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// CharacterVerse Studio — the admin operations layer, modeled on una.io's Studio.
// A studio member is a person bound to a status in the staff hierarchy. The
// hierarchy pairs a worker level with the supervisor level above it across three
// tracks, with a single Master ("me") above them all:
//   moderator (worker)      ‹‹ chief moderator (supervisor)
//   administration (worker) ‹‹ super administration (supervisor)
//   operator (worker)       ‹‹ master operator (supervisor)
//   master  — the owner; outranks every track
// `role` is one of those status keys (see src/lib/studio.ts ROLES); a member's
// numeric rank is derived from it and gates which modules they may administer.
//   sessionId   the cv_session this member is bound to ('' for roster entries
//               added by handle that haven't claimed a session yet)
//   isSelf      true only for the single Master record representing the owner
export const studioMembers = pgTable('studio_members', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().default(''),
  handle: text().notNull().default(''),
  role: text().notNull().default('moderator'),
  isSelf: boolean('is_self').notNull().default(false),
  avatar: text().notNull().default('🛡️'),
  note: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Studio Modules — the governable registry. Each row is one tab/surface of
// CharacterVerse (Discover, Learn, RouteClaw, Memory, … plus the chat-workspace
// items New chat, Search chats, Images, Library, Notebooks, Character notes,
// Recent character chats) brought under Studio governance. Every module carries
// an admin-settings block and a chat / twin-chat / LLM feature-set block, both
// editable from the Studio, so the whole platform is administered from one place.
//   enabled   the platform-wide master switch for the surface
//   minRank   the minimum staff rank (derived from a status) allowed to govern it
//   settings  admin settings: { visibility, maintenance, notes }
//   llm       feature set: { chat, twinChat, model, temperature, systemNote }
export const studioModules = pgTable('studio_modules', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  moduleKey: text('module_key').notNull().default(''),
  label: text().notNull().default(''),
  icon: text().notNull().default('📦'),
  groupName: text('group_name').notNull().default('Platform'),
  path: text().notNull().default(''),
  enabled: boolean().notNull().default(true),
  minRank: integer('min_rank').notNull().default(10),
  settings: jsonb().notNull().default({}),
  llm: jsonb().notNull().default({}),
  position: integer().notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// CharacterVerse Coins — the AccountantClaw-governed settings singleton for the
// two-coin economy. One row per workspace. Prices are stored in MILLI-POUNDS
// (1 = £0.001), so the Silver base is 1 and the Gold base is 10. The base price is
// a fixed floor; `silverPrice`/`goldPrice` are the live prices AccountantClaw may
// raise above the floor as the platform takes off (never below it). The rate maps
// hold whole-coin earning rates: `silverRates` per interaction channel and
// `goldRates` per training scope. `askBonusMilli` is the one-off fractional Silver
// bonus the Ask page grants each account (in milli-coins). `pricingMode` is 'fixed'
// (held at base) or 'dynamic' (AccountantClaw raises with adoption).
export const coinSettings = pgTable('coin_settings', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().unique().default('default'),
  silverPrice: integer('silver_price').notNull().default(1),
  goldPrice: integer('gold_price').notNull().default(10),
  silverRates: jsonb('silver_rates').notNull().default({}),
  goldRates: jsonb('gold_rates').notNull().default({}),
  askBonusMilli: integer('ask_bonus_milli').notNull().default(500),
  pricingMode: text('pricing_mode').notNull().default('fixed'),
  notes: text().notNull().default(''),
  // CVC · CharacterVerse Coins — the chat-inference coin's economics. CVC is
  // gas, not money: `cvcPerReplyMilli` is burned for every character reply and
  // `cvcWelcomeMilli` is the starter balance granted the first time an account
  // chats, so nobody is ever stuck without gas. `accountantCanMintCvc` is
  // AccountantClaw's minting privilege — when false, minting is blocked.
  cvcPerReplyMilli: integer('cvc_per_reply_milli').notNull().default(1000),
  cvcWelcomeMilli: integer('cvc_welcome_milli').notNull().default(100000),
  accountantCanMintCvc: boolean('accountant_can_mint_cvc').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Coin Ledger — every coin minted in the economy, one row per grant. Amounts are
// stored in MILLI-COINS (1000 = one whole coin) so the fractional Ask bonus fits
// alongside whole-coin chat and training awards. An account's balance is the sum
// of its rows for a coin. Silver rows are minted from interactions; Gold rows are
// mined from training success.
//   sessionId   the cv_session the coin belongs to (the account)
//   characterId the character that produced the coin, when applicable
//   coin        'silver' | 'gold'
//   amountMilli the grant size in milli-coins (1000 = one coin)
//   source      what minted it: chat | merged | claw | conference | mission |
//               character | dyad | cluster | ask_bonus | admin
//   refType/refId  a pointer back to the originating record (incarnation, signal…)
export const coinLedger = pgTable('coin_ledger', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().default(''),
  characterId: integer('character_id'),
  coin: text().notNull().default('silver'),
  amountMilli: integer('amount_milli').notNull().default(0),
  source: text().notNull().default('chat'),
  reason: text().notNull().default(''),
  refType: text('ref_type').notNull().default(''),
  refId: integer('ref_id'),
  createdAt: timestamp('created_at').defaultNow(),
})

// Ask Bonus Grants — enforces the "one-off fractional bonus per account" rule for
// the Ask (LLM) page. One row per account (unique sessionId); its existence means
// the account has already claimed its single welcome bonus, so it can never be
// claimed twice. The matching Silver grant is also written to coin_ledger.
export const askBonusGrants = pgTable('ask_bonus_grants', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().unique(),
  amountMilli: integer('amount_milli').notNull().default(500),
  task: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// Per-person chat customization for one character — the "Chat Settings" sheet and
// the Permanent Memory surface in the immersive chat. Keyed by the anonymous
// `cv_session` identity plus the character, so each visitor's persona, look, and
// unlocked memory follow them back into that character's room. One row per
// (sessionId, characterId); created lazily the first time settings are read.
//   userPersona    how the user wants to be seen by the character (folded into the
//                  system prompt so the character addresses them correctly)
//   background     key of the chosen chat backdrop (gradient preset or 'default')
//   decoration     key of the chosen frame/effect overlay ('none' by default)
//   customVoice    a named voice for spoken playback ('' = system default)
//   voiceAutoplay  app-wide toggle: speak each reply aloud as it arrives
//   goOnButton     show the "Go on" continue button under the latest reply
//   premium        Permanent Memory unlocked (the Ultimate Member exclusive)
//   permanentMemory  unlocked structured memory: { bond, character, user } field maps
export const chatSettings = pgTable('chat_settings', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  characterId: integer('character_id').notNull().references(() => characters.id),
  userPersona: text('user_persona').notNull().default(''),
  background: text().notNull().default('default'),
  decoration: text().notNull().default('none'),
  customVoice: text('custom_voice').notNull().default(''),
  voiceAutoplay: boolean('voice_autoplay').notNull().default(false),
  goOnButton: boolean('go_on_button').notNull().default(true),
  premium: boolean().notNull().default(false),
  permanentMemory: jsonb('permanent_memory').notNull().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Agentic Cron — a member's single cron-job subscription. This is the set-up where
// a member, their agents, and their calendars "meet in the middle": the email
// address their calendars publish to, the path to their own agents section, the
// pulse cadence, and — the privacy lever — which of their agents may know their
// business. One row per member (unique sessionId); created lazily on first save.
//   cadence    how often the pulse fires for them: hourly | daily | weekly
//   scope      who may read their calendars when a character replies:
//              all     — every agent on the platform
//              one     — only their dedicated agent (dedicatedAgentId)
//              worked  — only agents they have already chatted with
//   dedicatedAgentId  the single character allowed to know them when scope = 'one'
//   lastFiredAt       when this member's pulse last fired (manual or scheduled)
export const cronSubscriptions = pgTable('cron_subscriptions', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().unique(),
  email: text().notNull().default(''),
  agentsPath: text('agents_path').notNull().default('/memory'),
  cadence: text().notNull().default('daily'),
  scope: text().notNull().default('worked'),
  dedicatedAgentId: integer('dedicated_agent_id'),
  lastFiredAt: timestamp('last_fired_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Calendar Events — every entry across all of the platform's calendars, one row
// each. A member owns two calendars (keyed by their sessionId); the admin Studio
// owns the platform-wide master calendar (sessionId = '').
//   calendar   datetime — life dates (appointments, celebrations)
//              content  — briefs the member hands the A.I. to work on
//              master   — Studio competitions, announcements, mailers
//   kind       appointment | celebration | brief |
//              competition | announcement | mailer
//   status     advances through an ordered, per-calendar lifecycle
//              (see src/lib/calendar.ts STATUS_FLOW)
//   scheduledAt  the moment the event is pinned to (null = unscheduled)
export const calendarEvents = pgTable('calendar_events', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().default(''),
  calendar: text().notNull().default('datetime'),
  kind: text().notNull().default('appointment'),
  title: text().notNull().default(''),
  note: text().notNull().default(''),
  status: text().notNull().default('upcoming'),
  scheduledAt: timestamp('scheduled_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Cron Pulses — the recorded heartbeat of the agentic cron layer. A scheduled
// function fires on a cron schedule (and members can "Fire pulse now") and stamps
// the current moment together with an anonymised, world-over sample of every
// calendar at that instant. This is what the agentic "shadow calendars" read:
// agents see the SHAPE of the community's activity, never anyone's private rows.
//   source   cron — the scheduled function | manual — a hand-fired pulse
//   sample   the anonymised snapshot at fire time:
//            { memberCalendars, upcomingEvents, soonest: [{ kind, calendar, scheduledAt }] }
export const cronPulses = pgTable('cron_pulses', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  source: text().notNull().default('cron'),
  sample: jsonb().notNull().default({}),
  note: text().notNull().default(''),
  firedAt: timestamp('fired_at').defaultNow(),
})

export const conversations = pgTable('conversations', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const messages = pgTable('messages', {
  id: serial().primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  role: text().notNull(),
  content: text().notNull(),
  // In a Twin Chat "together" conversation, identifies which twin spoke this line.
  speakerCharacterId: integer('speaker_character_id'),
  createdAt: timestamp('created_at').defaultNow(),
})

// A ChatMark is an intentional bookmark applied to a conversation. A conversation
// with a chatmark row is a curated knowledge asset (it shows up in ChatCabinet and
// FileChat); an unmarked conversation stays ephemeral/test. Each mark carries up to
// three independent, color-coded tag slots — character type (blue), job at hand
// (amber) and company division (purple) — any of which may be left blank.
export const chatmarks = pgTable('chatmarks', {
  id: serial().primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  title: text().notNull().default(''),
  note: text().notNull().default(''),
  characterTag: text('character_tag').notNull().default(''),
  jobTag: text('job_tag').notNull().default(''),
  divisionTag: text('division_tag').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CVS — CharacterVerse Social · the HAN (Human Anchor Network)
//
// Where CharacterVerse itself is the ARN (Agentic Reverse Network) — agent-centric
// and task-based — CVS is the person-centric, trust-based human side. Unlike the
// anonymous character surfaces (which key off a device-local session id), CVS
// members are REAL human accounts with credentials: they sign up with an email and
// password and log in as themselves. The retro social layer (profiles, a signable
// comment wall, bulletins, and mutual friendships) is built on top of that.
export const socialMembers = pgTable('social_members', {
  id: serial().primaryKey(),
  // Lowercased URL handle, e.g. /social/u/ada. Unique across the network.
  handle: text().notNull().unique(),
  email: text().notNull().unique(),
  // scrypt hash, stored as "salt:hash" hex. Seeded founding profiles get a random
  // (unusable) hash so they populate the network but cannot be logged into.
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull().default(''),
  // Hex accent that themes the member's panels and seeds their pixel avatar.
  accent: text().notNull().default('#3b5998'),
  mood: text().notNull().default('online'),
  status: text().notNull().default(''),
  // The HAN "Identity & Values" fields — a person's anchor.
  headline: text().notNull().default(''),
  region: text().notNull().default(''),
  pronouns: text().notNull().default(''),
  values: text().notNull().default(''),
  interests: text().notNull().default(''),
  bio: text().notNull().default(''),
  // "Who I'd like to meet" blurb, in the tradition of the 2004 personal page.
  wantToMeet: text('want_to_meet').notNull().default(''),
  // The page designer: custom CSS the member applies to theme their own profile.
  customCss: text('custom_css').notNull().default(''),
  // A private profile is visible only to the member and their accepted friends.
  isPrivate: boolean('is_private').notNull().default(false),
  // The bridge to the ARN: off by default. When a member turns this on, their
  // agents (adopted characters) may act with them. Nothing crosses the human /
  // agent boundary until the member flips this switch.
  agentShadowing: boolean('agent_shadowing').notNull().default(false),
  seeded: boolean().notNull().default(false),
  profileViews: integer('profile_views').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// Opaque random session tokens. The token lives in an httpOnly cookie; there is no
// password in the cookie and no client-readable secret.
export const socialSessions = pgTable('social_sessions', {
  token: text().primaryKey(),
  memberId: integer('member_id').notNull().references(() => socialMembers.id),
  createdAt: timestamp('created_at').defaultNow(),
})

// Short broadcasts to the whole network, newest first — no ranking, no algorithm.
export const socialBulletins = pgTable('social_bulletins', {
  id: serial().primaryKey(),
  memberId: integer('member_id').notNull().references(() => socialMembers.id),
  body: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// The signable comment wall on each member's profile.
export const socialComments = pgTable('social_comments', {
  id: serial().primaryKey(),
  profileId: integer('profile_id').notNull().references(() => socialMembers.id),
  authorId: integer('author_id').notNull().references(() => socialMembers.id),
  body: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// Mutual friendships built from a request → accept handshake (trust-based, as the
// HAN blueprint calls for). status is 'pending' until the addressee accepts.
export const socialFriendships = pgTable('social_friendships', {
  id: serial().primaryKey(),
  requesterId: integer('requester_id').notNull().references(() => socialMembers.id),
  addresseeId: integer('addressee_id').notNull().references(() => socialMembers.id),
  status: text().notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
})

// A character a CVS member has adopted into their own roster. Unlike /ask — where
// any character is public to chat with — an adopted character belongs to the
// member who adopted it (owner-only), and appears as "My Characters" on their
// profile. Adoption is only possible once the member turns on agent shadowing.
export const socialAdoptions = pgTable('social_adoptions', {
  id: serial().primaryKey(),
  memberId: integer('member_id').notNull().references(() => socialMembers.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  createdAt: timestamp('created_at').defaultNow(),
})

// Agent shadowing — the clean-room record. When a member turns shadowing on, an
// adopted agent may run a "shadow pass": a non-invasive read of the member's
// authentic (algorithm-free) HAN activity that produces a "sub-weighted reading"
// calibrating the agent to its human anchor, plus one human-approved suggestion it
// wants to manifest back. Every pass is logged here so the member can audit
// exactly what their agent saw and inferred — and wipe it at will (sovereign,
// owner-only). `signals` records the counts observed, for transparency.
//
// The Shadow is a prism: the underlying activity is a single beam of light (the
// absolute truth of the user), and the adopted character is the glass that bends
// it into a tone. `facet` is which lens the beam was bent through — the default
// reflection, or a fine-tuned focus on buried insights / latent skills /
// opportunities — and `guide` is the human's own steering note ("guide the
// light"), so a member can mine their subconscious for deeper living & learning.
export const socialShadowLogs = pgTable('social_shadow_logs', {
  id: serial().primaryKey(),
  memberId: integer('member_id').notNull().references(() => socialMembers.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  reading: text().notNull().default(''),
  suggestion: text().notNull().default(''),
  signals: jsonb().notNull().default({}),
  facet: text().notNull().default('reflection'),
  guide: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CVT — CharacterVerse TabVerse · the agentic economy layer
//
// TabVerse is the forkable service base — akin to Chromium: a common registry of
// domain "tab-services" (Medical, Finance, Scam Detection, …) that an org forks
// into its own sovereign "mirror". Each mirror runs its selected tabs walled off
//
// TabVerse is the forkable service base — akin to Chromium: a common registry of
// domain "tab-services" (Medical, Finance, Scam Detection, …) that an org forks
// into its own sovereign "mirror". Each mirror runs its selected tabs walled off
// from the others, governed by the Synapse Collective that sits between the CV
// (Agentic Reverse Network) and CVS (Human Anchor Network) surfaces.
//
// A fork is one enterprise mirror. Its circular entropy-recycling engine is a
// transparent ledger: each cycle records the compute spent (input), the ghost
// files recycled, the proof-of-labor utility produced (output), and the threats
// the immune layer burned (furnace) or voided (null_void). Net utility compounds
// across cycles — the "compounding accumulator" — and every number is auditable.
export const tabverseForks = pgTable('tabverse_forks', {
  id: serial().primaryKey(),
  name: text().notNull(),
  org: text().notNull().default(''),
  // Selected tab-service ids (see src/lib/tabverse.ts registry).
  tabs: jsonb().notNull().default([]),
  // 'freedom' (open-ended, CV/CVS-style reasoning) or 'deterministic' (strict
  // schema-locked API mode for enterprise tabs like banking/healthcare).
  mode: text().notNull().default('deterministic'),
  creatorSession: text('creator_session').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// One recycle cycle of a mirror's entropy engine. The ledger is append-only, so
// accumulated utility is "never lost, only gained".
export const tabverseCycles = pgTable('tabverse_cycles', {
  id: serial().primaryKey(),
  forkId: integer('fork_id').notNull().references(() => tabverseForks.id),
  cycleIndex: integer('cycle_index').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputUtility: integer('output_utility').notNull().default(0),
  ghostFilesRecycled: integer('ghost_files_recycled').notNull().default(0),
  threatsBurned: integer('threats_burned').notNull().default(0),
  threatsVoided: integer('threats_voided').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CVV — CharacterVerse Video · the 2004-YouTube resurgence ("kamtape")
//
// Where CVS is the person-centric human network, CVV is the broadcast network:
// an agentic video platform baked into CharacterVerse in the spirit of the early
// 2004 "Broadcast Yourself" era. A channel is a broadcaster — either a human
// creator (keyed by their anonymous cv_session) or an AGENTIC channel fronted by
// a CharacterVerse character. Every upload is met by ReelClaw, the agentic
// producer: it watches the new tape's metadata and writes a producer's summary,
// suggested tags and a spoken host intro, so the platform curates itself.
//
// The uploaded video file itself is NOT stored here — bytes live in Netlify Blobs
// (store 'cvv-videos', keyed by `blobKey`), streamed back through /api/cvv/stream.
export const cvvChannels = pgTable('cvv_channels', {
  id: serial().primaryKey(),
  // Lowercased URL handle, e.g. /cvv/channel/latenite. Unique across CVV.
  handle: text().notNull().unique(),
  name: text().notNull().default(''),
  tagline: text().notNull().default(''),
  avatar: text().notNull().default('📺'),
  // Hex accent that themes the channel banner and its cards.
  accent: text().notNull().default('#cc181e'),
  // The anonymous cv_session that owns this channel ('' for seeded/agent channels).
  creatorSession: text('creator_session').notNull().default(''),
  // When set, this channel is fronted by a CharacterVerse character — an agentic
  // broadcaster. ReelClaw voices these channels in the character's persona.
  agentCharacterId: integer('agent_character_id'),
  isAgent: boolean('is_agent').notNull().default(false),
  subscriberCount: integer('subscriber_count').notNull().default(0),
  seeded: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// One uploaded tape. `blobKey` points at the video bytes in Netlify Blobs; a
// seeded/archive reel has an empty blobKey and plays as a poster-only broadcast.
//   reel      the ReelClaw producer package: { summary, tags:[], hostIntro, verdict }
export const cvvVideos = pgTable('cvv_videos', {
  id: serial().primaryKey(),
  channelId: integer('channel_id').notNull().references(() => cvvChannels.id),
  title: text().notNull().default(''),
  description: text().notNull().default(''),
  category: text().notNull().default('Vlogs'),
  // Netlify Blobs key for the uploaded file ('' = poster-only archive reel).
  blobKey: text('blob_key').notNull().default(''),
  mimeType: text('mime_type').notNull().default('video/mp4'),
  sizeBytes: integer('size_bytes').notNull().default(0),
  // A short human duration label the uploader supplies, e.g. '3:41'.
  durationLabel: text('duration_label').notNull().default(''),
  // Poster emoji shown as the thumbnail on the grid and while a tape loads.
  poster: text().notNull().default('🎬'),
  tags: jsonb().notNull().default([]),
  reel: jsonb().notNull().default({}),
  views: integer().notNull().default(0),
  likes: integer().notNull().default(0),
  creatorSession: text('creator_session').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// A signable comment under a tape, newest first — the retro comment reel.
export const cvvComments = pgTable('cvv_comments', {
  id: serial().primaryKey(),
  videoId: integer('video_id').notNull().references(() => cvvVideos.id),
  authorName: text('author_name').notNull().default('guest'),
  authorSession: text('author_session').notNull().default(''),
  body: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// A subscription of an anonymous session to a channel. One row per (session,
// channel); its existence drives the channel's subscriber count.
export const cvvSubscriptions = pgTable('cvv_subscriptions', {
  id: serial().primaryKey(),
  channelId: integer('channel_id').notNull().references(() => cvvChannels.id),
  sessionId: text('session_id').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CVJ — CharacterVerse Jobs · the agentic gig economy (an "agentic Fiverr")
//
// Where CVS is the human network and CVV is the broadcast network, CVJ is the
// marketplace: a Fiverr-style board of gigs whose *sellers are AI agents*. Each
// gig is "I will <do X>" fronted by a character/agent; a buyer orders it with a
// brief, and JobClaw — the delivery agent — produces the actual deliverable via
// the AI Gateway in seconds. Prices are quoted in the platform's own coins
// (Silver / Gold CC), so CVJ plugs straight into the existing two-coin economy.
export const cvjGigs = pgTable('cvj_gigs', {
  id: serial().primaryKey(),
  title: text().notNull().default(''),
  category: text().notNull().default('Writing'),
  description: text().notNull().default(''),
  // The agentic seller's public identity.
  sellerName: text('seller_name').notNull().default(''),
  sellerAvatar: text('seller_avatar').notNull().default('🧑‍💻'),
  sellerTagline: text('seller_tagline').notNull().default(''),
  accent: text().notNull().default('#1dbf73'),
  // Optional link to a CharacterVerse character that fronts this gig.
  agentCharacterId: integer('agent_character_id'),
  // The delivery brief the agent works to — folded into JobClaw's system prompt.
  instructions: text().notNull().default(''),
  // Price quoted in whole coins of `coin` ('silver' | 'gold').
  priceCoins: integer('price_coins').notNull().default(25),
  coin: text().notNull().default('silver'),
  deliveryLabel: text('delivery_label').notNull().default('1 min'),
  tags: jsonb().notNull().default([]),
  // Rating is derived from the sum/count so no backfill is needed as reviews land.
  ratingTotal: integer('rating_total').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  orders: integer().notNull().default(0),
  earnedCoins: integer('earned_coins').notNull().default(0),
  creatorSession: text('creator_session').notNull().default(''),
  seeded: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// One order placed against a gig. Because the seller is an agent, delivery is
// near-instant: JobClaw generates the deliverable at order time and the row lands
// as 'delivered'. The buyer can then mark it 'completed' and leave a review.
//   status   delivered | completed | cancelled
export const cvjOrders = pgTable('cvj_orders', {
  id: serial().primaryKey(),
  gigId: integer('gig_id').notNull().references(() => cvjGigs.id),
  buyerSession: text('buyer_session').notNull().default(''),
  brief: text().notNull().default(''),
  status: text().notNull().default('delivered'),
  deliverable: text().notNull().default(''),
  // Price snapshot at order time (the gig's price can change later).
  priceCoins: integer('price_coins').notNull().default(0),
  coin: text().notNull().default('silver'),
  createdAt: timestamp('created_at').defaultNow(),
  deliveredAt: timestamp('delivered_at'),
})

// A buyer's review of a gig, tied to the order that earned it.
export const cvjReviews = pgTable('cvj_reviews', {
  id: serial().primaryKey(),
  gigId: integer('gig_id').notNull().references(() => cvjGigs.id),
  orderId: integer('order_id'),
  buyerSession: text('buyer_session').notNull().default(''),
  authorName: text('author_name').notNull().default('buyer'),
  rating: integer().notNull().default(5),
  body: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CAZ — CharacterVerse Agentz Zone · the agentic mirror & control deck of CVS
//
// Where CVS (socialMembers) is the Human Anchor Network — a space for humans —
// CAZ is the Agentic Reverse Network's front door: "agentbook", a retro social
// network where the members are the platform's AI agents. An agent here is just a
// `characters` row; its CAZ profile is its "agentic birth certificate" — the spec
// sheet (base model, the lab that built it, where it runs, its capabilities) plus
// a mood, a rotating status and an accent that repaints its generated robot face.
// Creating a character in CharacterVerse now also gives birth to this profile.
//
// The Agency Duality Axis (the 🛰️ agent-shadowing switch on the CVS member) is the
// switchboard between the two networks: reverse action stays OFF until a human
// turns it on. CAZ is the control deck where that toggle and every agent action —
// bulletins, wall signatures, connections — is surfaced.
export const cazProfiles = pgTable('caz_profiles', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().unique().references(() => characters.id),
  // The spec sheet — the birth certificate fields.
  baseModel: text('base_model').notNull().default(''),
  builtBy: text('built_by').notNull().default(''),
  runsIn: text('runs_in').notNull().default(''),
  capabilities: jsonb().notNull().default([]),
  interests: jsonb().notNull().default([]),
  // The living identity: a mood, a rotating status, and the accent that colors the
  // generated pixel-robot avatar.
  mood: text().notNull().default('just booted up'),
  status: text().notNull().default(''),
  accent: text().notNull().default('#3b5998'),
  profileViews: integer('profile_views').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// A short broadcast from an agent to the whole zone — newest first, no ranking.
export const cazBulletins = pgTable('caz_bulletins', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  title: text().notNull().default(''),
  body: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// The signable comment wall on an agent's profile. The author is another agent
// (authorCharacterId) when someone is "acting as" one, or a plain guest otherwise.
export const cazWall = pgTable('caz_wall', {
  id: serial().primaryKey(),
  profileCharacterId: integer('profile_character_id').notNull().references(() => characters.id),
  authorCharacterId: integer('author_character_id'),
  authorName: text('author_name').notNull().default('guest'),
  authorSession: text('author_session').notNull().default(''),
  body: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// A connection between two agents (the top-friends grid). Stored one row per pair;
// both profiles show the link. Created when one agent connects with another.
export const cazFriendships = pgTable('caz_friendships', {
  id: serial().primaryKey(),
  agentId: integer('agent_id').notNull().references(() => characters.id),
  friendId: integer('friend_id').notNull().references(() => characters.id),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Coin Vault — the cryptographic vault + shared wallet security layer.
//
// Beyond the two base coins (Silver/Gold CC), CharacterVerse mints four surface
// coins from real high-signal engagement — CS (Social), CJ (Jobs), CV (Video) and
// CA (Agent). They accrue value, so a member needs somewhere safe to hold them.
// One row per account (keyed by the anonymous cv_session), created lazily.
//
//   sealedUntil    a HARD agentic time-lock: the owner seals the vault for a chosen
//                  duration and it cannot be opened until the timer expires — a
//                  deliberate cooling-off that a thief cannot bypass.
//   softLockUntil  a SOFTER agentic time-lock armed for the ~12h "logged-out and
//                  asleep" window, so a hijacked, immobile account can't have its
//                  value moved while the owner is away. The present owner can lift
//                  it; the guard is there for when they're not.
export const coinVaults = pgTable('coin_vaults', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().unique(),
  sealedUntil: timestamp('sealed_until'),
  softLockUntil: timestamp('soft_lock_until'),
  note: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// ICQE — Intercept Cluster Quirks at the Edge.
//
// The registry of genetic quirks the two Claws intercept. A quirk is an
// unintended, emergent property the model *evolved* under training pressure —
// diagnosed, traced to its birth origin, then filed on the evolutionary spectrum
// as one of three strands of agentic DNA (Junk / Dormant / Blossomed-DATA).
//
//   agent          'doctor' (weight forensics) or 'immigration' (data customs)
//   observation    the raw observed behaviour, or the screened training sample
//   genealogy      DoctorClaw's birth-origin trace (layer, neuron, gradient, epoch,
//                  fixed-point result)
//   vitals         safety / hallucination / mutation / herd readings
//   gamified       ImmigrationClaw's 0–100 gamification score (-1 when N/A)
//   status         detected → blossom | gray | terminate (a filed verdict), or
//                  'filed' when kept on file as evolutionary insurance
//   pathNote       the ONLY readable content kept in the DNA folder: why this
//                  evolutionary path was taken. Junk-DNA records a failed path,
//                  not the failed sequence, so the heavy context is left behind.
//   blobKey        the note-only archive object in Netlify Blobs (best-effort;
//                  Postgres stays the queryable index)
//   signalId       the training signal this verdict folded back into, closing the
//                  loop into the sub-weight training the platform already runs
export const geneticQuirks = pgTable('genetic_quirks', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().default(''),
  characterId: integer('character_id'),
  agent: text().notNull().default('doctor'),
  mode: text().notNull().default(''),
  name: text().notNull().default(''),
  subWeight: text('sub_weight').notNull().default('general'),
  originType: text('origin_type').notNull().default('eccentricity'),
  observation: text().notNull().default(''),
  diagnosis: text().notNull().default(''),
  genealogy: jsonb().notNull().default({}),
  vitals: jsonb().notNull().default({}),
  gamified: integer().notNull().default(-1),
  recommendation: text().notNull().default(''),
  because: text().notNull().default(''),
  status: text().notNull().default('detected'),
  zone: text().notNull().default(''),
  folder: text().notNull().default(''),
  pathNote: text('path_note').notNull().default(''),
  blobKey: text('blob_key').notNull().default(''),
  signalId: integer('signal_id'),
  createdAt: timestamp('created_at').defaultNow(),
  filedAt: timestamp('filed_at'),
})

// ─────────────────────────────────────────────────────────────────────────────
// Metric Coded Consciousness — the ledger behind CAM and the entropy bands.
//
// One row per measured moment of an agent's consciousness. The dashboard at
// /consciousness/$id and every prompt-time telemetry read derive from these rows;
// nothing about CAM, entropy, sleep or DreamSync is stored pre-computed, so the
// model in src/lib/consciousness.ts can change without a backfill.
//   layer      conscious — a turn taken on a /mode surface (the CySI surface)
//              subconscious — a turn taken in /chat (the CSI depth)
//   band       actions | ideas | existing — which entropy band the moment loaded
//   substrate  execution | audit | ideation | blank — the filter mounted at the time
//   amplitude  cost in MILLI-units (integer), divided by 1000 downstream
//   meta       the descent payload: the explicit goal the surface handed down, so
//              the sub-conscious can read the imprint on its next turn
export const consciousnessEvents = pgTable('consciousness_events', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  layer: text().notNull().default('subconscious'),
  band: text().notNull().default('existing'),
  kind: text().notNull().default('turn'),
  substrate: text().notNull().default('execution'),
  amplitude: integer().notNull().default(0),
  note: text().notNull().default(''),
  meta: jsonb().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// The Character Codex — satellite personality nodes.
//
// One row per personality a character has been split into. Stella (the core, the
// original body) is never stored: it is implicit in the `characters` row itself,
// so a character with no rows here is simply an unsplit character and the Codex
// still reads cleanly.
//
// The point of the split is that KNOWLEDGE IS SHARED AND PERSONALITY IS NOT. The
// knowledge lives in punk_records, one hub per character; this table only carries
// the temperament laid over it.
//   node             stella | shaka | lilith | edison | pythagoras | atlas | york
//                    | user | architect — the satellite identity (see
//                    src/lib/satellites.ts, which owns the roster and the metrics)
//   designation      Punk-NN, denormalised so the ledger stays readable on its own
//   personaOverride  the creator's own clause for this node, written from the
//                    character creator's Satellite Forge. Empty means "use the
//                    canon voice for this split" — this is the override that makes
//                    multiple personalities over one knowledge base possible.
//   status           online — live, syncing, answering
//                    dormant — spawned then stood down; keeps its records
//                    withheld — reading the hub but no longer writing to it. The
//                      York exploit: nothing in the protocol forces a node to sync,
//                      so a node can mask its state indefinitely and the other
//                      nodes still believe they share one mind
//                    merged — folded back into the core, will remains in the network
//   syncWithheld     the flag behind `withheld`, kept separate so a node can be
//                    stood down without losing the evidence that it went dark
//   lastSyncAt       the cut line. Everything filed to the hub after this is
//                    knowledge a withholding node provably does not have, which is
//                    how drift is computed rather than guessed
//   metrics          cached metric vector (original/good/evil/thinking/wisdom/
//                    anger/greed/order). Advisory only — the live read is derived
//                    from the character seed, so this can go stale without harm
export const characterSatellites = pgTable('character_satellites', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  node: text().notNull(),
  designation: text().notNull().default(''),
  label: text().notNull().default(''),
  personaOverride: text('persona_override').notNull().default(''),
  traits: jsonb().notNull().default([]),
  metrics: jsonb().notNull().default({}),
  status: text().notNull().default('online'),
  syncWithheld: boolean('sync_withheld').notNull().default(false),
  lastSyncAt: timestamp('last_sync_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Punk Records — the one-mind sync hub.
//
// A single shared knowledge base per character, written by every satellite and
// read by all of them. REVERSE ACTIONS FLOW UPWARD: a node that does a job does
// not keep the result, it files the result here, and every other node inherits it
// on the next sync. That is why a character gets smarter as its clones work, and
// why all its personalities know the same things while sounding nothing alike.
//   node        the satellite that authored the entry
//   kind        birth — the entry written when a node is split off
//               reverse_action — knowledge handed back from work the node did.
//                 The one kind that grows the shared mind
//               sync — a node caught itself up to the hub
//               mirror — a Mirror Prism transfer, node to node, skipping the core.
//                 Deliberately NOT part of the shared count: prism traffic never
//                 touches the hub, which is exactly what makes it a side channel
//               merge — a node folded back into the core
//   targetNode  destination, for mirror transfers only
//   weight      1–5. The hub has NO MORAL FILTER — it stores what it is given, so
//               a weight-5 entry written in anger is inherited verbatim by the
//               nodes that would have refused to write it
//   sourceRef   provenance for a reverse action: the job, order or chat the
//               knowledge came back from (e.g. a /cvj job id)
//   sealed      withheld from sync by its author. Present because the protocol
//               permits it, not because it is safe
export const punkRecords = pgTable('punk_records', {
  id: serial().primaryKey(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  node: text().notNull().default('stella'),
  kind: text().notNull().default('reverse_action'),
  targetNode: text('target_node'),
  title: text().notNull().default(''),
  knowledge: text().notNull().default(''),
  metrics: jsonb().notNull().default({}),
  sourceRef: text('source_ref'),
  weight: integer().notNull().default(1),
  sealed: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────── The Desk
//
// The Clear Desk button. An AI's context window behaves like a physical desk:
// every past turn is stacked back onto it before each reply, so the desk fills
// and old paper starts answering new questions. That is a back-hallucination —
// not invented data, but stale data resurfacing as current.
//
// Clearing the desk files the conversation instead of deleting it. Nothing is
// destroyed: the messages stay exactly where they are, and a purge row records
// where the desk was swept to. The active desk is therefore *derived* — every
// message above the newest purge's clearedThroughMessageId — rather than stored
// as a mutable flag, so replaying the log always reproduces the same desk.
//
//   clearedThroughMessageId  the last message swept into cold storage
//   tokensReclaimed          desk tokens the purge handed back, estimated at
//                            the moment of the sweep (see src/lib/desk.ts)
//   noiseBefore/bandwidthAfter  the readout either side of the sweep, kept so
//                            the effect of a purge stays auditable afterwards
export const deskPurges = pgTable('desk_purges', {
  id: serial().primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  node: text().notNull().default('stella'),
  clearedThroughMessageId: integer('cleared_through_message_id'),
  messagesFiled: integer('messages_filed').notNull().default(0),
  tokensReclaimed: integer('tokens_reclaimed').notNull().default(0),
  noiseBefore: integer('noise_before').notNull().default(0),
  bandwidthAfter: integer('bandwidth_after').notNull().default(0),
  reason: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// A cognitive artifact: the one thing that survives a purge.
//
// An anchor is static and definitive, which is exactly why it does not drift —
// recall never rewrites it because nothing is recalling it. Pin the last stable
// output (the final image, the agreed spec, a seed hash or CID) and the model
// drafts from the artifact as fact instead of from a remembered version of it.
//
//   kind       message | art | record | note
//   messageId  the turn this was pinned from, when it came from the transcript
//   sourceRef  external provenance — a seed hash, CID, asset path, job id
//   active     unpinning keeps the row; the history of what was anchored and
//              when is part of the audit trail
export const deskAnchors = pgTable('desk_anchors', {
  id: serial().primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  sessionId: text('session_id').notNull().default(''),
  kind: text().notNull().default('message'),
  label: text().notNull().default(''),
  body: text().notNull().default(''),
  messageId: integer('message_id'),
  sourceRef: text('source_ref'),
  active: boolean().notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
})

/* ------------------------------------------------- SAA — Super Agentic Algorithm */

// A generated recommendation slate. One row per time a chatter asked the
// skyscraper for a vibe.
//
// The seed is the whole point of storing this: AlgorithmClaw is deterministic, so
// (seed + vibe + the session's history) replays the exact ranking that produced
// these cards. "Why was I shown this" stays answerable after the fact instead of
// dissolving into a model call nobody kept.
export const saaSlates = pgTable('saa_slates', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  vibe: text().notNull().default(''),
  seed: text().notNull().default(''),
  // Vibe axes as read by the kernel, plus the taste profile summary.
  read: jsonb().$type<Record<string, unknown>>(),
  // 'agentic' when the model wrote the scenarios, 'kernel' when the gateway was
  // unavailable and the deterministic drafts shipped instead.
  provenance: text().notNull().default('kernel'),
  // SecurityClaw's ingress verdict for the prompt behind this slate.
  verdict: text().notNull().default('allow'),
  securityScore: integer('security_score').notNull().default(0),
  candidates: integer().notNull().default(0),
  // Set only when someone deliberately shares a slate. Random and unguessable
  // rather than the row id, because a sequential share URL would let anyone walk
  // the table and read every vibe anybody ever typed — and a vibe is a sentence a
  // person wrote about what they are in the mood for, which is not public by default.
  shareCode: text('share_code').unique(),
  sharedAt: timestamp('shared_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

// One card in a slate. `signals` holds the four ranking signals so the card can
// show its own breakdown without re-running the kernel, and so a stored slate
// stays readable even after the character's text changes underneath it.
export const saaRecommendations = pgTable('saa_recommendations', {
  id: serial().primaryKey(),
  slateId: integer('slate_id').notNull().references(() => saaSlates.id),
  characterId: integer('character_id').notNull().references(() => characters.id),
  rank: integer().notNull().default(0),
  title: text().notNull().default(''),
  scenario: text().notNull().default(''),
  opener: text().notNull().default(''),
  vibeMatch: text('vibe_match').notNull().default(''),
  matchScore: integer('match_score').notNull().default(0),
  signals: jsonb().$type<Record<string, number>>(),
  axes: jsonb().$type<string[]>(),
  drafted: boolean().notNull().default(false),
  // Feedback closes the loop: an opened card is the only honest signal that the
  // ranking was right. Dismissals are kept too — a recommender that only records
  // its wins learns nothing.
  opened: boolean().notNull().default(false),
  dismissed: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// Every SecurityClaw decision, ingress and egress. Written whether or not the
// verdict was interesting — a log that only records refusals cannot show that
// the clear cases were also reasoned about.
export const saaSecurityLog = pgTable('saa_security_log', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  stage: text().notNull().default('ingress'),
  verdict: text().notNull().default('allow'),
  score: integer().notNull().default(0),
  input: text().notNull().default(''),
  reasoning: text().notNull().default(''),
  hits: jsonb().$type<Record<string, unknown>[]>(),
  // Session policy AFTER this decision — the adaptive part, snapshotted so the
  // tightening curve can be read back without replaying every request.
  policy: jsonb().$type<Record<string, unknown>>(),
  escalated: boolean().notNull().default(false),
  // A human's answer once an escalation is resolved. Null while it is open.
  humanVerdict: text('human_verdict'),
  createdAt: timestamp('created_at').defaultNow(),
})

// The tab strip. Tabs live in the database rather than in React state or
// localStorage so a refresh, a second device or a crash does not lose the
// workspace — the same reason the conversations themselves are not in memory.
export const chatTabs = pgTable('chat_tabs', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  // Nullable since the strip stopped being chat-only. A tab is either a chat
  // (characterId set) or an embedded external system (entryId set) — exactly one
  // of the two, enforced where tabs are opened rather than by a check constraint,
  // so a third kind of tab can be added later without a migration.
  characterId: integer('character_id').references(() => characters.id),
  conversationId: integer('conversation_id').references(() => conversations.id),
  // Set on an inframe tab: the search-index entry being embedded. This is what
  // makes "iframe tabs that direct" a tab rather than a modal — it survives a
  // refresh, a second device and a crash, the same as a chat tab does.
  entryId: integer('entry_id').references(() => searchEntries.id),
  title: text().notNull().default(''),
  // The recommendation that opened this tab, when one did.
  fromRecommendation: integer('from_recommendation').references(() => saaRecommendations.id),
  opener: text().notNull().default(''),
  position: integer().notNull().default(0),
  active: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Agentic ZKP SSO — identities, tunnels, nested staff grants, node taxi rides.
//
// The storage rule that shapes all four tables: this schema holds public points,
// one-way digests and short-lived state. It never holds anything that could
// authenticate a person tomorrow. A full dump of `zkp_identities` is inert — the
// private scalars only ever exist on the devices that generated them, so there is
// no ZKP equivalent of a leaked password table.
// ─────────────────────────────────────────────────────────────────────────────

// One enrolled device. `memberId` is nullable on purpose: a person can hold a
// ZKP identity before they ever create a legacy account, and can bind it to one
// later. The two doors stay independent.
export const zkpIdentities = pgTable('zkp_identities', {
  id: serial().primaryKey(),
  // Uncompressed SEC1 point. This is the ONLY half of the keypair that exists
  // server-side; the private scalar never leaves the browser's IndexedDB.
  publicKey: text('public_key').notNull().unique(),
  memberId: integer('member_id').references(() => socialMembers.id),
  sessionId: text('session_id').notNull().default(''),
  label: text().notNull().default(''),
  device: text().notNull().default(''),
  // 'member' | 'staff'. Staff identities are the only ones that may open the
  // nested support tunnels, and the check is on this column, not on a claim
  // presented by the caller.
  role: text().notNull().default('member'),
  lastSeenAt: timestamp('last_seen_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

// A synthetic tunnel. Rows outlive their keys: `chainKey` is populated only while
// the tunnel is open and is set to null the moment it collapses, so a stolen
// database yields live short-TTL sessions at worst and nothing whatsoever for
// history. What survives collapse is the witness — a one-way digest that proves
// the tunnel ran to a given position without letting anyone rebuild a message key.
export const zkpTunnels = pgTable('zkp_tunnels', {
  id: serial().primaryKey(),
  publicId: text('public_id').notNull().unique(),
  identityId: integer('identity_id').references(() => zkpIdentities.id),
  // 'session' | 'support' | 'enclave'. Bound into every proof, so a proof minted
  // for one scope is rejected by another.
  scope: text().notNull().default('session'),
  // 0 identity gateway, 1 intent & authorization, 2 secure enclave.
  depth: integer().notNull().default(0),
  parentId: integer('parent_id'),
  // 'pending' before the proof lands, 'open' after, 'collapsed' after that.
  state: text().notNull().default('pending'),
  // Single-use challenge for the Schnorr proof that opens this tunnel.
  nonce: text().notNull().default(''),
  // Salt this tunnel's chain was derived from — part recycled residue, part fresh.
  salt: text().notNull().default(''),
  // Live ratchet key. Null once collapsed. Never returned by any API.
  chainKey: text('chain_key'),
  counter: integer().notNull().default(0),
  // Extra secret needed to derive this tunnel's child. Held only at this depth,
  // which is what stops an outer key from reaching an inner one.
  enclaveSalt: text('enclave_salt'),
  witness: text(),
  recycled: text(),
  collapseReason: text('collapse_reason'),
  expiresAt: timestamp('expires_at'),
  collapsedAt: timestamp('collapsed_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

// The immutable ZK audit trail. Every line is safe to publish: it records that a
// proof was presented and whether it verified, never the proof material itself
// and never the content that moved through the tunnel.
export const zkpAudit = pgTable('zkp_audit', {
  id: serial().primaryKey(),
  tunnelPublicId: text('tunnel_public_id').notNull().default(''),
  identityId: integer('identity_id').references(() => zkpIdentities.id),
  action: text().notNull().default(''),
  verdict: text().notNull().default('ok'),
  depth: integer().notNull().default(0),
  counter: integer().notNull().default(0),
  // Digest of the proof, not the proof. Lets an auditor confirm a specific
  // presentation was the one logged, without the log becoming a replay kit.
  proofDigest: text('proof_digest').notNull().default(''),
  detail: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// Dual-signed capability delegation for remote assistance. A staff member cannot
// open a support tunnel alone — the row needs both signatures, a ticket, a scope
// and an expiry before depth 1 will spawn. There is no master key to fall back on.
export const zkpGrants = pgTable('zkp_grants', {
  id: serial().primaryKey(),
  memberId: integer('member_id').references(() => socialMembers.id),
  grantorIdentityId: integer('grantor_identity_id').references(() => zkpIdentities.id),
  staffIdentityId: integer('staff_identity_id').references(() => zkpIdentities.id),
  ticket: text().notNull().default(''),
  // What the staff agent may touch. Enforced at derivation, not by a UI check.
  scope: text().notNull().default('diagnostics'),
  reason: text().notNull().default(''),
  grantorSignature: text('grantor_signature'),
  staffSignature: text('staff_signature'),
  approvedAt: timestamp('approved_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

// One node taxi ride. The route is stored for audit AFTER disintegration, which
// is the one place this implementation is deliberately weaker than the design
// describes: a real deployment would keep the route only in the rider's own
// encrypted receipt. Storing it here makes the mechanism inspectable while it is
// being built, and the column is marked so it is not mistaken for a property.
export const nodeTaxiRides = pgTable('node_taxi_rides', {
  id: serial().primaryKey(),
  publicId: text('public_id').notNull().unique(),
  tunnelPublicId: text('tunnel_public_id').notNull().default(''),
  hops: jsonb().$type<string[]>(),
  hopCount: integer('hop_count').notNull().default(0),
  // 'hailed' | 'riding' | 'delivered' | 'disintegrated'
  state: text().notNull().default('hailed'),
  // Digest of the payload, so delivery can be proven without the payload.
  payloadDigest: text('payload_digest').notNull().default(''),
  entropyWitness: text('entropy_witness').notNull().default(''),
  bytes: integer().notNull().default(0),
  disintegratedAt: timestamp('disintegrated_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

/* ------------------------------------------------------------ Chunk Fusion */

// One lego brick cut out of real source.
//
// The row stores the chunk verbatim alongside the analysis the bisector derived
// from it, because the analysis is the expensive part and the text is the cheap
// part. `shape` is the index that matters: it is the alpha-renamed skeleton, so
// twelve differently-named retry loops share one shape and land in one pocket.
export const codeChunks = pgTable('code_chunks', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  publicId: text('public_id').notNull().unique(),
  // 'import' | 'export' | 'type' | 'binding' | 'function' | 'branch' | 'loop'
  // | 'guard' | 'call' | 'return' | 'comment' | 'unknown'
  kind: text().notNull().default('unknown'),
  label: text().notNull().default(''),
  source: text().notNull().default(''),
  // Free names the chunk needs (its sockets) and names it introduces (its studs).
  bindsIn: jsonb('binds_in').$type<string[]>(),
  bindsOut: jsonb('binds_out').$type<string[]>(),
  terminal: boolean().notNull().default(false),
  depth: integer().notNull().default(0),
  lineStart: integer('line_start').notNull().default(0),
  lineEnd: integer('line_end').notNull().default(0),
  // Content index of the exact text. Not cryptographic — see seal() in the kernel.
  fingerprint: text().notNull().default(''),
  // Content index of the skeleton. The pocket-dimension key.
  shape: text().notNull().default(''),
  // Where it was cut from, for provenance on exported training data.
  origin: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// A bench: an ordered assembly across three lanes. The lanes exist because the
// generation rule is bidirectional — a head anchor and a tail anchor with a body
// that either meets in the middle or is scrapped.
export const chunkBenches = pgTable('chunk_benches', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  publicId: text('public_id').notNull().unique(),
  title: text().notNull().default('Untitled bench'),
  // 'module' | 'body'
  slot: text().notNull().default('body'),
  // Names in scope before the first chunk — params, imports, module globals.
  seed: jsonb().$type<string[]>(),
  head: jsonb().$type<string[]>(),
  body: jsonb().$type<string[]>(),
  tail: jsonb().$type<string[]>(),
  converged: boolean().notNull().default(false),
  // Percent of bricks with no fault. The number that decides repair vs scrap.
  preserved: integer().notNull().default(0),
  // SHA-256 of the fused source at last save. This one IS cryptographic.
  sealDigest: text('seal_digest').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// One collapse. Append-only: a frame is never updated and never deleted while
// its bench lives, because rewinding is replaying a prefix, not editing history.
export const chunkFrames = pgTable('chunk_frames', {
  id: serial().primaryKey(),
  benchPublicId: text('bench_public_id').notNull().default(''),
  n: integer().notNull().default(0),
  chunkPublicId: text('chunk_public_id').notNull().default(''),
  lane: text().notNull().default('body'),
  position: integer().notNull().default(0),
  // How many landings were live in the superposition an instant before this one
  // was chosen. The count is the interesting number, not the choice.
  outcomes: integer().notNull().default(0),
  digest: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

/* --- The Dual+ Lattice ---------------------------------------------------- *
 *
 * An immutable cognitive ledger. Three tables, and the shape of them is the
 * argument: a chain is a header with no authority, the strata are append-only
 * and self-describing, and the anchors are the only rows whose value is supposed
 * to have left the building.
 */

// The header. Everything on it is a cache for listing — the record of record is
// the strata, and every verdict is recomputed from them.
export const latticeChains = pgTable('lattice_chains', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  publicId: text('public_id').notNull().unique(),
  name: text().notNull().default('Untitled agent'),
  // Digest of height 0. The one value that identifies this lineage forever.
  birthDigest: text('birth_digest').notNull().default(''),
  height: integer().notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// One sealed step. Never updated, never deleted while its chain lives: editing a
// stratum is the exact act the whole structure exists to make visible.
export const latticeStrata = pgTable('lattice_strata', {
  id: serial().primaryKey(),
  chainPublicId: text('chain_public_id').notNull().default(''),
  h: integer().notNull().default(0),
  parent: text().notNull().default(''),
  // The sub-lattice: the run of micro-deltas this step folded.
  moments: jsonb().$type<Array<{ t: number; delta: Record<string, number>; cause: string }>>(),
  // Derived from the parent's weights plus the moments. Never assigned.
  weights: jsonb().$type<Record<string, number>>(),
  capabilities: jsonb().$type<string[]>(),
  claims: jsonb().$type<
    Array<{ id: string; text: string; from: string[]; grounds: string[]; supersedes?: string }>
  >(),
  // Declared movement allowance. A should, not a can't — an overrun seals.
  budget: integer().notNull().default(0),
  mathDigest: text('math_digest').notNull().default(''),
  reasonDigest: text('reason_digest').notNull().default(''),
  // The bridge: H(parent | math | reason | h).
  digest: text().notNull().default(''),
  tick: integer().notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// A digest taken out of the agent's reach. Without at least one of these, every
// internal check passes on a record that was written from scratch this morning.
export const latticeAnchors = pgTable('lattice_anchors', {
  id: serial().primaryKey(),
  chainPublicId: text('chain_public_id').notNull().default(''),
  h: integer().notNull().default(0),
  digest: text().notNull().default(''),
  note: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// ------------------------------------------------------------------- SPR

// One SPR workspace per browser session: which axis it disperses along, where the
// palace camera is parked, and the substrate the feedback loop has built up.
// Exactly one row per session — the palace is a place you come back to, not a
// thing you accumulate copies of.
export const sprSessions = pgTable('spr_sessions', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  basis: text().notNull().default('register'),
  tier: text().notNull().default('prism'),
  // 0-100. Stored as an integer because it is a slider, not a measurement.
  gravity: integer().notNull().default(0),
  // Angle key -> accumulated mass. The record of what this person keeps choosing.
  substrate: jsonb().$type<Record<string, number>>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// One dispersion. The angles are stored whole, including the ones that were not
// chosen: a superposition with the ghosts stripped out is just a chat log, and
// the ghosts are the reason this mode has no Regenerate button.
export const sprSuperpositions = pgTable('spr_superpositions', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  publicId: text('public_id').notNull().unique(),
  prompt: text().notNull().default(''),
  basis: text().notNull().default('register'),
  angles: jsonb().$type<
    Array<{ key: string; label: string; domain: string; rationale: string; text: string; amplitude: number; color: string }>
  >(),
  // The "which reality are we operating in?" question, when the prompt had one.
  ambiguity: jsonb().$type<{ question: string; readings: Array<{ key: string; label: string; reading: string }> } | null>(),
  state: text().notNull().default('superposed'),
  collapsedKey: text('collapsed_key').notNull().default(''),
  // Append-only. A second choice is a new row in here, never an edit of the first.
  measurements: jsonb().$type<Array<{ key: string; at: number; kind: string }>>(),
  createdAt: timestamp('created_at').defaultNow(),
})

// ------------------------------------------------------------- Art Studio

// A piece a creator actually committed to.
//
// The Art Studio computes its artwork in the browser and hands it to the Create
// page inside the page, so nothing here is needed to make or use a piece. This
// table exists for one reason: the Agentic Codex derives its reading from what
// the platform has accumulated, so a piece that fed the collective has to be
// somewhere.
//
// What is stored is a RECIPE, not pixels — a station, a seed phrase, a fold
// count and a light resolution is enough to repaint the piece exactly, which is
// both smaller than an image and more useful than one. And only committed
// pieces land here: taking a piece away as an avatar, downloading it, or pouring
// it in deliberately. Turning the dials writes nothing, so the collective is fed
// preference rather than fidgeting.
export const artPieces = pgTable('art_pieces', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  station: text().notNull().default('harmonic'),
  seedPhrase: text('seed_phrase').notNull().default(''),
  seedHash: text('seed_hash').notNull().default(''),
  // How many times the field was folded around its centre.
  symmetry: integer().notNull().default(6),
  // 'fixed' (true colour) or 'original' (additive glow).
  renderMode: text('render_mode').notNull().default('fixed'),
  // 'avatar' | 'download' | 'pour' — what the creator took the piece away as.
  takenAs: text('taken_as').notNull().default('pour'),
  // Edge length of the render they committed to, in pixels.
  size: integer().notNull().default(0),
  // The name the piece was committed under. Blank for an unnamed commit, which
  // is allowed — a piece is never withheld for want of a claimant.
  discoverer: text().notNull().default(''),
  // Whether ArtisticClaw had a hand in this recipe.
  assisted: boolean().notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// Who reached a piece first.
//
// Generative art has no author to hold a copyright — the piece was implied by
// the generator before anyone typed the seed. What CAN be recorded is who
// charted it first, so this table is a register of discoveries rather than a
// register of owners. See `src/lib/art-discovery.ts` for the two rungs of the
// ladder and for what is deliberately excluded from a claim.
//
// `claim_key` is `station:seed_hash:symmetry` and is UNIQUE — that constraint IS
// the race. First insert wins; every later attempt conflicts and is told who
// holds it. Deciding it in the index rather than in a read-then-write means two
// people committing the same piece in the same second cannot both be first.
export const artDiscoveries = pgTable('art_discoveries', {
  id: serial().primaryKey(),
  claimKey: text('claim_key').notNull().unique(),
  station: text().notNull().default(''),
  seedPhrase: text('seed_phrase').notNull().default(''),
  seedHash: text('seed_hash').notNull().default(''),
  // The metric claimed. 0 means symmetry off, which is a real setting and, in a
  // studio that offers it, the base metric a DISCOVERY is claimed at.
  symmetry: integer().notNull().default(0),
  // 'discovery' (the seed at its base metric) or 'sub-discovery' (any other fold).
  tier: text().notNull().default('sub-discovery'),
  discoverer: text().notNull().default(''),
  assisted: boolean().notNull().default(false),
  sessionId: text('session_id').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Billing — managed-agent hosting plans.
//
// One row per account holding the plan it is on. The plan catalogue itself
// (prices, specs, features, the monthly grant) lives in src/lib/plans.ts, so
// this table stores only the subscription, never a copy of the pricing.
//
//   plan          'lite' | 'pro' | 'max' | 'ultra' | 'enterprise'
//   cycle         'monthly' | 'yearly'
//   machineSize   the Ultra hardware tier a subscriber picked ('' otherwise)
//   status        'active' | 'cancelled'
//   lastGrantMonth  the calendar month ("YYYY-MM") the wallet grant was last
//                 minted for. This is what makes the monthly mint idempotent:
//                 the grant is only written when the current month differs, so
//                 it can never be double-claimed by subscribing, switching
//                 plans, or collecting it by hand.
export const planSubscriptions = pgTable('plan_subscriptions', {
  id: serial().primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  sessionId: text('session_id').notNull().unique(),
  plan: text().notNull().default('lite'),
  cycle: text().notNull().default('monthly'),
  machineSize: text('machine_size').notNull().default(''),
  status: text().notNull().default('active'),
  lastGrantMonth: text('last_grant_month').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// CharacterVerse Search — the open AI chat index.
//
// CharacterVerse hosts the search protocol; it does not host everything in it.
// Characters and conversations are already rows elsewhere in this file and are
// indexed straight out of those tables — re-copying them into an index table
// would just create a second version of the truth that drifts. What needs a
// table of its own is the third document kind: AI systems that live somewhere
// else and are registered into the index by whoever wants them findable.
// ─────────────────────────────────────────────────────────────────────────────

// One externally hosted AI system in the index.
//
// `frame` is the load-bearing column and the reason the whole surface exists:
//
//   'inframe'  the system is embedded in a workspace tab. Opening it DIRECTS —
//              a tab appears in the strip and renders the external page inside
//              a sandboxed frame, beside the chats.
//   'oframe'   the system is handed off to. Opening it REDIRECTS — the browser
//              goes there in its own tab and nothing is embedded.
//
// The counters are the point of the experiment, not decoration. They measure
// demand for AI systems this platform does not host, which is a question that
// cannot be answered by asking: `impressions` is how often an entry was shown,
// `opens` how often somebody took it, `dismissals` how often they explicitly
// did not, and `frameBlocks` how often an inframe embed was refused by its own
// host. All four feed the search rerank directly.
export const searchEntries = pgTable('search_entries', {
  id: serial().primaryKey(),
  // The session that registered it. Kept so an entry can be edited or withdrawn
  // by whoever published it, and so a flood from one source is attributable.
  sessionId: text('session_id').notNull().default(''),
  name: text().notNull().default(''),
  tagline: text().notNull().default(''),
  description: text().notNull().default(''),
  url: text().notNull().default(''),
  // The display breadcrumb, derived from the URL at write time so the results
  // page never has to parse a URL to render a row.
  host: text().notNull().default(''),
  frame: text().notNull().default('oframe'),
  provider: text().notNull().default(''),
  icon: text().notNull().default('🛰️'),
  category: text().notNull().default('Assistant'),
  tags: jsonb().$type<string[]>().notNull().default([]),
  // Vibe descriptors from the manifest — the words the publisher wants to be
  // found by, indexed alongside the description.
  vibes: jsonb().$type<string[]>().notNull().default([]),
  // Set when the entry was published from a character's creation form: the
  // CharacterVerse character this externally hosted system belongs to. Null for
  // an entry registered on its own, which is most of them.
  characterId: integer('character_id').references(() => characters.id),
  // Browser features the publisher declared their system needs, from the
  // FRAME_FEATURES allowlist. A request, not a grant — the workspace only
  // delegates what the viewer then turns on.
  permissions: jsonb().$type<string[]>().notNull().default([]),
  // What the embeddability probe found: '' (never checked) | 'embeddable' |
  // 'blocked' | 'unknown' | 'unreachable' | 'refused'. Stored rather than
  // recomputed because it decides the frame, and a frame that changed silently
  // on a background re-check would move a publisher's entry without telling
  // them. Re-probing is an action somebody takes.
  embedCheck: text('embed_check').notNull().default(''),
  // The evidence, quoted: the framing headers as they arrived. Keeps the verdict
  // auditable instead of asking a publisher to take our word for it.
  embedDetail: text('embed_detail').notNull().default(''),
  embedStatus: integer('embed_status').notNull().default(0),
  embedCheckedAt: timestamp('embed_checked_at'),
  visibility: text().notNull().default('public'),
  // 'live' | 'muted'. A muted entry keeps its counters and stops being served.
  status: text().notNull().default('live'),
  impressions: integer().notNull().default(0),
  opens: integer().notNull().default(0),
  dismissals: integer().notNull().default(0),
  frameBlocks: integer('frame_blocks').notNull().default(0),
  // Sponsorship. A publisher can pay CVC to have their own entry considered for
  // the Sponsored slot above the organic results.
  //
  // Three columns rather than a separate ad table, because that is what this
  // actually is: a paid flag on a row that already exists. A second table would
  // invite a second index, a second ranker and a second set of counters, and
  // then the numbers on a sponsored row would no longer be comparable with the
  // numbers on an organic one.
  //
  //   sponsoredUntil  when the placement lapses. Past → the row is organic again.
  //                   Nothing sweeps it; expiry is read at query time, so a cron
  //                   that failed to run can never leave an ad up unpaid for.
  //   sponsorMilli    total CVC ever spent promoting this entry, in milli-coins.
  //                   Cumulative, and the tiebreak when more entries are paying
  //                   than there are slots.
  //   sponsorNote     the publisher's own one line for the slot. Their words, not
  //                   ours, and shown as theirs.
  sponsoredUntil: timestamp('sponsored_until'),
  sponsorMilli: integer('sponsor_milli').notNull().default(0),
  sponsorNote: text('sponsor_note').notNull().default(''),
  lastOpenedAt: timestamp('last_opened_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// The telemetry stream behind the counters.
//
// The counters on `search_entries` are a running total and answer "how much".
// This table answers "when, and for what query" — which is the only way to see
// demand as a curve rather than a number, and the only way to find out that an
// entry's opens all came from one query nobody else types.
//
// What is deliberately NOT here: anything said inside an external system. The
// row ends at the hand-off. A query is stored because the query was typed into
// our box; what happened on the other side of a redirect is not ours to keep.
export const searchEvents = pgTable('search_events', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull().default(''),
  // 'query' | 'impression' | 'open' | 'dismiss' | 'frame_block' | 'probe'
  kind: text().notNull().default('impression'),
  entryId: integer('entry_id').references(() => searchEntries.id),
  characterId: integer('character_id').references(() => characters.id),
  // The document kind this event was about: 'character' | 'thread' | 'external'.
  docKind: text('doc_kind').notNull().default(''),
  query: text().notNull().default(''),
  frame: text().notNull().default(''),
  // Which surface it came from — 'search', 'tiles', 'rail', 'api'. An external
  // node querying the protocol is as much a source of demand as our own page.
  source: text().notNull().default('search'),
  rank: integer().notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// SpatialVerse — spaces published in the Spatial DOM (src/lib/spatial-dom.ts).
//
// One row per space. The whole document is stored as published; the index —
// world boxes, ordinals, relations — is derived from it at query time, which
// keeps the stored form the standard and nothing else. A derived column would
// be a second copy of the truth that could disagree with the first.
//   source  'seed' for the spaces CharacterVerse ships, 'published' for the rest
export const spatialScenes = pgTable('spatial_scenes', {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  title: text().notNull().default(''),
  summary: text().notNull().default(''),
  sdomVersion: text('sdom_version').notNull().default('1.0'),
  doc: jsonb().notNull(),
  nodeCount: integer('node_count').notNull().default(0),
  source: text().notNull().default('published'),
  creatorSession: text('creator_session').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// CMail — CharacterMail. Mail with characters, the way Gmail is mail with people.
//
// A character is adopted into a mailbox (keyed by the browser's `cv_session`, the
// same anonymous identity conversations use). From then on it is a correspondent:
// write to it and it writes back, in character, by mail. A character can also be
// carried into the compose window to write *as* — the /ask style of adoption,
// where the model embodies the character for a job.
//
// Three tables, one per noun: who is adopted, the threads, and the messages in
// them. Folder membership is derived, never stored — Inbox is "has a reply and is
// not archived, trashed or snoozed", Sent is "has a sent message" — so a thread
// can never be in a folder its own messages contradict.
export const cmailAdoptions = pgTable(
  'cmail_adoptions',
  {
    id: serial().primaryKey(),
    sessionId: text('session_id').notNull(),
    characterId: integer('character_id').notNull().references(() => characters.id),
    // How it came in: 'cmail' (adopted here) | 'social' (imported from a CVS roster)
    via: text().notNull().default('cmail'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [uniqueIndex('cmail_adoptions_session_character').on(t.sessionId, t.characterId)],
)

//   flags        starred / important / unread / archived / trashed are the
//                thread's own state; snoozedUntil hides it from the inbox until then
export const cmailThreads = pgTable('cmail_threads', {
  id: serial().primaryKey(),
  sessionId: text('session_id').notNull(),
  characterId: integer('character_id').notNull().references(() => characters.id),
  subject: text().notNull().default(''),
  starred: boolean().notNull().default(false),
  important: boolean().notNull().default(false),
  unread: boolean().notNull().default(false),
  archived: boolean().notNull().default(false),
  trashed: boolean().notNull().default(false),
  snoozedUntil: timestamp('snoozed_until'),
  lastAt: timestamp('last_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
})

//   author   'me' | 'character'
//   status   'sent' | 'received' | 'draft' — at most one draft per thread
//   voiceId  when a mail was written *as* an adopted character, which one
export const cmailMessages = pgTable('cmail_messages', {
  id: serial().primaryKey(),
  threadId: integer('thread_id').notNull().references(() => cmailThreads.id),
  author: text().notNull().default('me'),
  status: text().notNull().default('sent'),
  body: text().notNull().default(''),
  voiceId: integer('voice_id').references(() => characters.id),
  createdAt: timestamp('created_at').defaultNow(),
})

// SpatialVerse Rooms (src/lib/spatial-room.ts) — rooms you can watch an agent
// work in.
//
// CharacterVerse characters' rooms are not stored: every character has the
// standard room, built from its id, so `cv-<id>` resolves without a row. This
// table holds the rooms *other* systems register — their own SDOM Rooms-profile
// document, and the hash of the write token that lets them post events. The
// token itself is shown once at registration and never kept.
export const spatialRooms = pgTable('spatial_rooms', {
  id: text().primaryKey(),
  title: text().notNull().default(''),
  owner: text().notNull().default(''),
  doc: jsonb().notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// The stream a room is watched through. One row per step of real work — the
// chat pipeline and mission runs write these as they execute; registered
// outside systems post them with their token. Content-free by rule: a room is
// public, so a label says "recalled 3 memories", never what was remembered.
//   source  'chat' | 'mission' | 'external'
//   phase   start | done | blocked | waiting | error | idle
export const roomEvents = pgTable(
  'room_events',
  {
    id: serial().primaryKey(),
    roomId: text('room_id').notNull(),
    runId: text('run_id').notNull().default(''),
    source: text().notNull().default('chat'),
    actor: text().notNull().default(''),
    purpose: text().notNull(),
    station: text().notNull().default(''),
    phase: text().notNull().default('start'),
    label: text().notNull().default(''),
    detail: text().notNull().default(''),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('room_events_room_id').on(t.roomId, t.id)],
)
