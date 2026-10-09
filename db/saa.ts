import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from './index.js'
import {
  characters,
  chatTabs,
  conversations,
  messages,
  saaRecommendations,
  saaSecurityLog,
  saaSlates,
  searchEntries,
} from './schema.js'
import {
  HISTORY_DEPTH,
  type CharacterSeed,
  type HistoryRow,
  type Slate,
} from '../src/lib/algorithmclaw.js'
import {
  normalizePolicy,
  POLICY_START,
  type IntentRead,
  type PolicyState,
} from '../src/lib/securityclaw.js'

// Server-side reads and writes for the SAA — AlgorithmClaw's feed and
// SecurityClaw's log, plus the tab strip.
//
// Nothing in here ranks or judges anything. Both kernels are pure and live in
// src/lib; this module only fetches what they need and stores what they decided.
// That split is what makes the recommender replayable — the ranking inputs are
// rows, the ranking itself is a function, and the output is rows again.

/** How much of one conversation's user text feeds the taste profile. */
const SAMPLE_CHARS = 1200
/** Ceiling on the retrieval pool. Beyond this, retrieval is doing a scan. */
const POOL_LIMIT = 400

/* ------------------------------------------------------------ the inputs */

/**
 * One row per past conversation for this session, newest first, with the
 * chatter's own words concatenated as the profile sample.
 *
 * `seq` is max(message id) — a monotonic key, never a timestamp, so the recency
 * ordering the kernel applies is reproducible from stored data alone.
 */
export async function loadHistory(sessionId: string): Promise<HistoryRow[]> {
  if (!sessionId) return []
  const rows = await db
    .select({
      conversationId: conversations.id,
      characterId: characters.id,
      name: characters.name,
      category: characters.category,
      turns: sql<number>`count(${messages.id})`,
      seq: sql<number>`max(${messages.id})`,
      sample: sql<string>`string_agg(case when ${messages.role} = 'user' then ${messages.content} else null end, ' ')`,
    })
    .from(conversations)
    .innerJoin(characters, eq(conversations.characterId, characters.id))
    .innerJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.sessionId, sessionId))
    .groupBy(conversations.id, characters.id)
    .orderBy(desc(sql`max(${messages.id})`))
    .limit(HISTORY_DEPTH)

  return rows.map((r) => ({
    conversationId: r.conversationId,
    characterId: r.characterId,
    name: r.name,
    category: r.category || 'General',
    turns: Number(r.turns) || 0,
    seq: Number(r.seq) || 0,
    sample: (r.sample || '').slice(0, SAMPLE_CHARS),
  }))
}

/** The retrieval pool: every public character, capped. */
export async function loadPool(): Promise<CharacterSeed[]> {
  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      tagline: characters.tagline,
      description: characters.description,
      persona: characters.persona,
      category: characters.category,
      avatar: characters.avatar,
    })
    .from(characters)
    .where(eq(characters.isPublic, true))
    .orderBy(desc(characters.totalChats), characters.id)
    .limit(POOL_LIMIT)
  return rows.map((r) => ({ ...r, category: r.category || 'General' }))
}

/* ------------------------------------------------------- security policy */

/**
 * The session's current SecurityClaw policy — the adaptive part. Read back from
 * the newest log row rather than kept in a table of its own, so the tightening
 * curve and the decisions that caused it can never disagree.
 */
export async function loadPolicy(sessionId: string): Promise<PolicyState> {
  if (!sessionId) return POLICY_START
  const [row] = await db
    .select({ policy: saaSecurityLog.policy })
    .from(saaSecurityLog)
    .where(and(eq(saaSecurityLog.sessionId, sessionId), eq(saaSecurityLog.stage, 'ingress')))
    .orderBy(desc(saaSecurityLog.id))
    .limit(1)
  return normalizePolicy(row?.policy)
}

export async function logSecurity(input: {
  sessionId: string
  stage: 'ingress' | 'egress'
  read: IntentRead
  text: string
}): Promise<number | null> {
  const [row] = await db
    .insert(saaSecurityLog)
    .values({
      sessionId: input.sessionId,
      stage: input.stage,
      verdict: input.read.verdict,
      score: input.read.score,
      input: input.text.slice(0, 2000),
      reasoning: input.read.reasoning,
      hits: input.read.hits as unknown as Record<string, unknown>[],
      policy: input.read.policy as unknown as Record<string, unknown>,
      escalated: input.read.escalate,
    })
    .returning({ id: saaSecurityLog.id })
  return row?.id ?? null
}

export type SecurityLogEntry = {
  id: number
  stage: string
  verdict: string
  score: number
  input: string
  reasoning: string
  escalated: boolean
  humanVerdict: string | null
  createdAt: Date | null
}

export async function recentSecurity(sessionId: string, limit = 20): Promise<SecurityLogEntry[]> {
  if (!sessionId) return []
  return db
    .select({
      id: saaSecurityLog.id,
      stage: saaSecurityLog.stage,
      verdict: saaSecurityLog.verdict,
      score: saaSecurityLog.score,
      input: saaSecurityLog.input,
      reasoning: saaSecurityLog.reasoning,
      escalated: saaSecurityLog.escalated,
      humanVerdict: saaSecurityLog.humanVerdict,
      createdAt: saaSecurityLog.createdAt,
    })
    .from(saaSecurityLog)
    .where(eq(saaSecurityLog.sessionId, sessionId))
    .orderBy(desc(saaSecurityLog.id))
    .limit(limit)
}

/**
 * Resolve an escalation. This is the HITL rung: the human's answer is recorded as
 * ground truth against the frozen request, and the row stops being open.
 */
export async function resolveEscalation(
  id: number,
  sessionId: string,
  humanVerdict: 'approved' | 'declined',
): Promise<boolean> {
  const rows = await db
    .update(saaSecurityLog)
    .set({ humanVerdict })
    .where(and(eq(saaSecurityLog.id, id), eq(saaSecurityLog.sessionId, sessionId)))
    .returning({ id: saaSecurityLog.id })
  return rows.length > 0
}

/* --------------------------------------------------------- slate storage */

export type StoredRecommendation = Slate['recommendations'][number] & { id: number }

/** Persist a finished slate and hand back the cards with their row ids attached. */
export async function persistSlate(input: {
  sessionId: string
  slate: Slate
  verdict: string
  securityScore: number
  candidates: number
}): Promise<{ slateId: number; recommendations: StoredRecommendation[] }> {
  const { slate } = input
  const [slateRow] = await db
    .insert(saaSlates)
    .values({
      sessionId: input.sessionId,
      vibe: slate.vibe.text.slice(0, 500),
      seed: slate.seed,
      read: {
        axes: slate.vibe.axes,
        freeform: slate.vibe.freeform,
        clarity: slate.vibe.clarity,
        noveltyBias: slate.vibe.noveltyBias,
        profile: {
          conversations: slate.profile.conversations,
          depth: slate.profile.depth,
          breadth: slate.profile.breadth,
          style: slate.profile.style,
          signal: slate.profile.signal,
          cold: slate.profile.cold,
          categories: slate.profile.categories.slice(0, 6),
          themes: slate.profile.themes.slice(0, 12),
        },
      },
      provenance: slate.provenance,
      verdict: input.verdict,
      securityScore: input.securityScore,
      candidates: input.candidates,
    })
    .returning({ id: saaSlates.id })

  const slateId = slateRow.id
  if (!slate.recommendations.length) return { slateId, recommendations: [] }

  const inserted = await db
    .insert(saaRecommendations)
    .values(
      slate.recommendations.map((r, i) => ({
        slateId,
        characterId: r.characterId,
        rank: i,
        title: r.title.slice(0, 200),
        scenario: r.scenario.slice(0, 1000),
        opener: r.opener.slice(0, 600),
        vibeMatch: r.vibeMatch.slice(0, 600),
        matchScore: r.match,
        signals: r.signals as unknown as Record<string, number>,
        axes: r.axes as unknown as string[],
        drafted: r.drafted,
      })),
    )
    .returning({ id: saaRecommendations.id, rank: saaRecommendations.rank })

  const byRank = new Map(inserted.map((row) => [row.rank, row.id]))
  return {
    slateId,
    recommendations: slate.recommendations.map((r, i) => ({ ...r, id: byRank.get(i) ?? 0 })),
  }
}

/**
 * Feedback. An opened card is the only honest evidence the ranking was right;
 * a dismissal is evidence it was not. Both are stored, and neither is inferred.
 */
export async function recordFeedback(
  id: number,
  action: 'opened' | 'dismissed',
): Promise<boolean> {
  const rows = await db
    .update(saaRecommendations)
    .set(action === 'opened' ? { opened: true } : { dismissed: true })
    .where(eq(saaRecommendations.id, id))
    .returning({ id: saaRecommendations.id })
  return rows.length > 0
}

/** Aggregate feedback for the session — shown in the skyscraper footer. */
export async function slateStats(sessionId: string): Promise<{
  slates: number
  cards: number
  opened: number
  dismissed: number
}> {
  if (!sessionId) return { slates: 0, cards: 0, opened: 0, dismissed: 0 }
  const [row] = await db
    .select({
      slates: sql<number>`count(distinct ${saaSlates.id})`,
      cards: sql<number>`count(${saaRecommendations.id})`,
      opened: sql<number>`count(*) filter (where ${saaRecommendations.opened})`,
      dismissed: sql<number>`count(*) filter (where ${saaRecommendations.dismissed})`,
    })
    .from(saaSlates)
    .leftJoin(saaRecommendations, eq(saaRecommendations.slateId, saaSlates.id))
    .where(eq(saaSlates.sessionId, sessionId))
  return {
    slates: Number(row?.slates) || 0,
    cards: Number(row?.cards) || 0,
    opened: Number(row?.opened) || 0,
    dismissed: Number(row?.dismissed) || 0,
  }
}

/* ------------------------------------------------------------ the tabs */

/**
 * One tab in the strip.
 *
 * There are two kinds and the strip holds both in one ordering, because that is
 * what a tab strip is — a browser does not keep its PDF tabs in a separate row
 * from its HTML ones. A chat tab has `characterId` and a conversation; a frame
 * tab has `entryId` and a URL. `kind` says which, so the pane renderer never has
 * to guess from which fields happen to be null.
 */
export type TabRow = {
  id: number
  kind: 'chat' | 'frame'
  characterId: number | null
  conversationId: number | null
  /** Set on a frame tab: the search-index entry being embedded. */
  entryId: number | null
  /** Set on a frame tab: the external URL in the frame. '' on a chat tab. */
  url: string
  /** 'inframe' on a frame tab, '' on a chat tab. */
  frame: string
  /** The external host, for the tab's second line. '' on a chat tab. */
  host: string
  /**
   * Frame tabs only: browser features the publisher declared their system
   * needs. The pane delegates nothing from this list until the viewer grants it,
   * so it travels to the client as a request to display, not a permission.
   */
  permissions: string[]
  title: string
  opener: string
  position: number
  active: boolean
  name: string
  avatar: string
  category: string
}

/**
 * The strip, in order.
 *
 * Both joins are LEFT joins and that is the whole change from the chat-only
 * version: a frame tab has no character and an inner join silently deleted it
 * from the strip — a tab that exists in the table but not in the UI is worse
 * than one that never opened.
 */
export async function listTabs(sessionId: string): Promise<TabRow[]> {
  if (!sessionId) return []
  let rows
  try {
    rows = await db
      .select({
        id: chatTabs.id,
        characterId: chatTabs.characterId,
        conversationId: chatTabs.conversationId,
        entryId: chatTabs.entryId,
        title: chatTabs.title,
        opener: chatTabs.opener,
        position: chatTabs.position,
        active: chatTabs.active,
        name: characters.name,
        avatar: characters.avatar,
        category: characters.category,
        entryName: searchEntries.name,
        entryIcon: searchEntries.icon,
        entryUrl: searchEntries.url,
        entryHost: searchEntries.host,
        entryFrame: searchEntries.frame,
        entryCategory: searchEntries.category,
        entryPermissions: searchEntries.permissions,
      })
      .from(chatTabs)
      .leftJoin(characters, eq(chatTabs.characterId, characters.id))
      .leftJoin(searchEntries, eq(chatTabs.entryId, searchEntries.id))
      .where(eq(chatTabs.sessionId, sessionId))
      .orderBy(chatTabs.position, chatTabs.id)
  } catch {
    // Before the index migration lands, `entry_id` does not exist and the select
    // above fails as a whole. Chat tabs are older than this feature and must
    // keep working, so fall back to the strip as it was.
    return legacyListTabs(sessionId)
  }

  return rows.map((r) => {
    const frame = Boolean(r.entryId)
    return {
      id: r.id,
      kind: frame ? ('frame' as const) : ('chat' as const),
      characterId: r.characterId ?? null,
      conversationId: r.conversationId ?? null,
      entryId: r.entryId ?? null,
      url: frame ? r.entryUrl || '' : '',
      frame: frame ? r.entryFrame || 'inframe' : '',
      host: frame ? r.entryHost || '' : '',
      permissions: frame && Array.isArray(r.entryPermissions) ? r.entryPermissions : [],
      title: r.title,
      opener: r.opener,
      position: r.position,
      active: r.active,
      name: (frame ? r.entryName : r.name) || '',
      avatar: (frame ? r.entryIcon : r.avatar) || (frame ? '🛰️' : '🤖'),
      category: (frame ? r.entryCategory : r.category) || 'General',
    }
  })
}

/** The pre-index strip: chat tabs only, no entry join. */
async function legacyListTabs(sessionId: string): Promise<TabRow[]> {
  try {
    const rows = await db
      .select({
        id: chatTabs.id,
        characterId: chatTabs.characterId,
        conversationId: chatTabs.conversationId,
        title: chatTabs.title,
        opener: chatTabs.opener,
        position: chatTabs.position,
        active: chatTabs.active,
        name: characters.name,
        avatar: characters.avatar,
        category: characters.category,
      })
      .from(chatTabs)
      .innerJoin(characters, eq(chatTabs.characterId, characters.id))
      .where(eq(chatTabs.sessionId, sessionId))
      .orderBy(chatTabs.position, chatTabs.id)
    return rows.map((r) => ({
      ...r,
      kind: 'chat' as const,
      entryId: null,
      permissions: [],
      url: '',
      frame: '',
      host: '',
      category: r.category || 'General',
    }))
  } catch {
    return []
  }
}

/**
 * Open a tab, reusing the session's existing conversation with that character so
 * a tab is a view onto a thread rather than a new thread every time. Opening a
 * character that is already open focuses the existing tab instead of duplicating
 * it — the same thing a browser does.
 */
export async function openTab(input: {
  sessionId: string
  characterId: number
  title?: string
  opener?: string
  fromRecommendation?: number | null
}): Promise<TabRow[]> {
  const { sessionId, characterId } = input

  const existing = await db
    .select({ id: chatTabs.id })
    .from(chatTabs)
    .where(and(eq(chatTabs.sessionId, sessionId), eq(chatTabs.characterId, characterId)))
    .limit(1)

  if (existing.length) {
    await focusTab(existing[0].id, sessionId)
    // A fresh opener from a new recommendation replaces the stale one, so
    // re-picking a card still pre-fills the composer with the new scenario.
    if (input.opener) {
      await db
        .update(chatTabs)
        .set({ opener: input.opener.slice(0, 600), title: (input.title || '').slice(0, 120) })
        .where(eq(chatTabs.id, existing[0].id))
    }
    return listTabs(sessionId)
  }

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.sessionId, sessionId), eq(conversations.characterId, characterId)))
    .orderBy(desc(conversations.id))
    .limit(1)

  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${chatTabs.position}), -1) + 1` })
    .from(chatTabs)
    .where(eq(chatTabs.sessionId, sessionId))

  await db.update(chatTabs).set({ active: false }).where(eq(chatTabs.sessionId, sessionId))
  await db.insert(chatTabs).values({
    sessionId,
    characterId,
    conversationId: conversation?.id ?? null,
    title: (input.title || '').slice(0, 120),
    opener: (input.opener || '').slice(0, 600),
    fromRecommendation: input.fromRecommendation ?? null,
    position: Number(next) || 0,
    active: true,
  })
  return listTabs(sessionId)
}

/**
 * Open an inframe tab for a search-index entry.
 *
 * The inframe half of the frame experiment. An entry registered as 'inframe'
 * becomes a real row in the same strip as the chats, so the embedded system
 * survives a refresh and is still there on a second device — the same promise
 * the chat tabs make, which is the only reason to call it a tab at all.
 *
 * Refuses an oframe entry rather than quietly embedding it. An oframe entry is
 * one whose publisher said "send people to me, do not frame me", and honouring
 * that on the client but not the server would make the distinction decorative.
 */
export async function openFrameTab(input: {
  sessionId: string
  entryId: number
  title?: string
}): Promise<{ tabs: TabRow[]; error?: string }> {
  const { sessionId, entryId } = input
  try {
    const [entry] = await db
      .select({
        id: searchEntries.id,
        name: searchEntries.name,
        frame: searchEntries.frame,
        status: searchEntries.status,
      })
      .from(searchEntries)
      .where(eq(searchEntries.id, entryId))
      .limit(1)

    if (!entry) return { tabs: await listTabs(sessionId), error: 'That entry is not in the index.' }
    if (entry.frame !== 'inframe') {
      return {
        tabs: await listTabs(sessionId),
        error: 'That entry is registered as oframe — it hands off to its own site rather than embedding.',
      }
    }
    if (entry.status !== 'live') {
      return { tabs: await listTabs(sessionId), error: 'That entry is muted in the index.' }
    }

    // Already open? Focus it, the same as opening a character that has a tab.
    const existing = await db
      .select({ id: chatTabs.id })
      .from(chatTabs)
      .where(and(eq(chatTabs.sessionId, sessionId), eq(chatTabs.entryId, entryId)))
      .limit(1)
    if (existing.length) {
      return { tabs: await focusTab(existing[0].id, sessionId) }
    }

    const [{ next } = { next: 0 }] = await db
      .select({ next: sql<number>`coalesce(max(${chatTabs.position}), -1) + 1` })
      .from(chatTabs)
      .where(eq(chatTabs.sessionId, sessionId))

    await db.update(chatTabs).set({ active: false }).where(eq(chatTabs.sessionId, sessionId))
    await db.insert(chatTabs).values({
      sessionId,
      characterId: null,
      conversationId: null,
      entryId,
      title: (input.title || entry.name || '').slice(0, 120),
      position: Number(next) || 0,
      active: true,
    })
    return { tabs: await listTabs(sessionId) }
  } catch {
    return {
      tabs: await listTabs(sessionId),
      error: 'Frame tabs are not provisioned yet — they activate on the next deploy.',
    }
  }
}

export async function focusTab(id: number, sessionId: string): Promise<TabRow[]> {
  await db.update(chatTabs).set({ active: false }).where(eq(chatTabs.sessionId, sessionId))
  await db
    .update(chatTabs)
    .set({ active: true })
    .where(and(eq(chatTabs.id, id), eq(chatTabs.sessionId, sessionId)))
  return listTabs(sessionId)
}

/**
 * Close a tab. The conversation is untouched — closing a tab puts the thread
 * away, it does not end it, and reopening the character lands back in it.
 */
export async function closeTab(id: number, sessionId: string): Promise<TabRow[]> {
  const [row] = await db
    .select({ active: chatTabs.active })
    .from(chatTabs)
    .where(and(eq(chatTabs.id, id), eq(chatTabs.sessionId, sessionId)))
    .limit(1)

  await db.delete(chatTabs).where(and(eq(chatTabs.id, id), eq(chatTabs.sessionId, sessionId)))
  const remaining = await listTabs(sessionId)

  // Closing the focused tab hands focus to the last remaining one.
  if (row?.active && remaining.length) {
    return focusTab(remaining[remaining.length - 1].id, sessionId)
  }
  return remaining
}

/** Attach a conversation id once the chat pane has resolved one. */
export async function bindTabConversation(
  id: number,
  sessionId: string,
  conversationId: number,
): Promise<void> {
  await db
    .update(chatTabs)
    .set({ conversationId })
    .where(and(eq(chatTabs.id, id), eq(chatTabs.sessionId, sessionId)))
}

/* ------------------------------------------------------ shared slates */

/**
 * Mint a share code for a slate.
 *
 * Opt-in and idempotent: a slate that has already been shared keeps its code, so
 * a person who shares twice does not scatter two live URLs for the same thing and
 * cannot accidentally believe they have revoked the first by minting a second.
 */
export async function shareSlate(slateId: number, sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: saaSlates.id, shareCode: saaSlates.shareCode, sessionId: saaSlates.sessionId })
    .from(saaSlates)
    .where(eq(saaSlates.id, slateId))
    .limit(1)
  if (!row) return null
  // Only the chatter who generated a slate may publish it. Without this check the
  // endpoint would happily mint a public URL for a stranger's slate on request.
  if (row.sessionId !== sessionId) return null
  if (row.shareCode) return row.shareCode

  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  let code = ''
  for (const b of bytes) code += b.toString(36).padStart(2, '0')
  code = code.slice(0, 16)

  await db.update(saaSlates).set({ shareCode: code, sharedAt: new Date() }).where(eq(saaSlates.id, slateId))
  return code
}

/** Stop honouring a share link. The slate itself is untouched. */
export async function unshareSlate(slateId: number, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: saaSlates.sessionId })
    .from(saaSlates)
    .where(eq(saaSlates.id, slateId))
    .limit(1)
  if (!row || row.sessionId !== sessionId) return false
  await db.update(saaSlates).set({ shareCode: null, sharedAt: null }).where(eq(saaSlates.id, slateId))
  return true
}

export type SharedSlate = {
  slateId: number
  vibe: string
  seed: string
  provenance: string
  sharedAt: Date | null
  /** True when the viewer is the person who made it. */
  mine: boolean
  recommendations: (StoredRecommendation & { avatar: string; category: string; characterName: string })[]
}

/**
 * Load a shared slate by its code.
 *
 * What deliberately does NOT come back: the `read` column. That holds the taste
 * profile the ranking was built from — how many conversations this person has
 * had, their recurring themes, their style. Sharing "here is the slate I got"
 * should not also hand over a summary of everything they have ever chatted about,
 * so the profile stays behind and only the cards travel.
 */
export async function loadSharedSlate(code: string, viewerSessionId: string): Promise<SharedSlate | null> {
  const [slate] = await db.select().from(saaSlates).where(eq(saaSlates.shareCode, code)).limit(1)
  if (!slate) return null

  const rows = await db
    .select({
      id: saaRecommendations.id,
      characterId: saaRecommendations.characterId,
      rank: saaRecommendations.rank,
      title: saaRecommendations.title,
      scenario: saaRecommendations.scenario,
      opener: saaRecommendations.opener,
      vibeMatch: saaRecommendations.vibeMatch,
      matchScore: saaRecommendations.matchScore,
      signals: saaRecommendations.signals,
      axes: saaRecommendations.axes,
      drafted: saaRecommendations.drafted,
      characterName: characters.name,
      avatar: characters.avatar,
      category: characters.category,
    })
    .from(saaRecommendations)
    .innerJoin(characters, eq(saaRecommendations.characterId, characters.id))
    .where(eq(saaRecommendations.slateId, slate.id))
    .orderBy(saaRecommendations.rank)

  return {
    slateId: slate.id,
    vibe: slate.vibe,
    seed: slate.seed,
    provenance: slate.provenance,
    sharedAt: slate.sharedAt,
    mine: slate.sessionId === viewerSessionId,
    recommendations: rows.map((r) => ({
      id: r.id,
      characterId: r.characterId,
      characterName: r.characterName,
      avatar: r.avatar || '',
      category: r.category || '',
      title: r.title,
      scenario: r.scenario,
      opener: r.opener,
      vibeMatch: r.vibeMatch,
      match: r.matchScore,
      signals: (r.signals || {}) as Record<string, number>,
      axes: (r.axes || []) as string[],
      drafted: r.drafted,
    })) as SharedSlate['recommendations'],
  }
}
