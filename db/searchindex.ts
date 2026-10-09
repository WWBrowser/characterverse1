import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from './index.js'
import { characters, conversations, messages, searchEntries, searchEvents } from './schema.js'
import {
  coerceFrame,
  NO_DEMAND,
  SPONSOR_DAYS,
  sponsorPrice,
  type ChatManifest,
  type FrameId,
  type SearchDoc,
} from '../src/lib/searchindex.js'
import { balancesFor, mintCoins, spendCvc } from './coins.js'
import { frameFor, type EmbedCheck } from '../src/lib/frameprobe.js'

// CharacterVerse Search — the corpus, the registry and the telemetry.
//
// Nothing in this file ranks anything. The kernel in src/lib/searchindex.ts is
// pure and does all the scoring; this module only assembles the documents it
// reads and stores what the searcher then did about them. Same split as the
// recommender, for the same reason: ranking inputs are rows, the ranking is a
// function, and the outcome is rows again, so a result page can be explained
// months later instead of re-guessed.
//
// Every export here is best-effort and non-throwing. The search page is a lens
// over other people's tables and a table that does not exist yet must render an
// honest empty index, not a 500.

/** Characters pulled into the corpus. Beyond this, retrieval is doing a scan. */
const CHARACTER_LIMIT = 400
/** The searcher's own threads in the corpus. */
const THREAD_LIMIT = 120
/** Registered external systems served to one search. */
const ENTRY_LIMIT = 200
/** How much of a thread's text is indexed. A thread is a document, not a log. */
const THREAD_SAMPLE = 900

/* ------------------------------------------------------------- the corpus */

/**
 * Public characters as index documents.
 *
 * Indexed from the characters table directly rather than copied into an index
 * table. A character that gets renamed is findable under its new name on the
 * next search with no reindex step, because there is no index to fall behind.
 */
async function characterDocs(): Promise<SearchDoc[]> {
  try {
    const rows = await db
      .select({
        id: characters.id,
        name: characters.name,
        tagline: characters.tagline,
        description: characters.description,
        persona: characters.persona,
        category: characters.category,
        avatar: characters.avatar,
        totalChats: characters.totalChats,
      })
      .from(characters)
      .where(eq(characters.isPublic, true))
      .orderBy(desc(characters.totalChats), characters.id)
      .limit(CHARACTER_LIMIT)

    return rows.map((r) => ({
      kind: 'character' as const,
      id: r.id,
      ref: `character:${r.id}`,
      title: r.name,
      subtitle: r.tagline || r.category || 'Character',
      url: `/characters/${r.id}`,
      host: `characterverse · ${(r.category || 'General').toLowerCase()}`,
      frame: '' as const,
      category: r.category || 'General',
      icon: r.avatar || '🤖',
      text: `${r.tagline} ${r.description} ${r.persona}`.trim(),
      tags: [],
      // A character's demand is its chat count. It is a real engagement number
      // from the same economy the rest of the platform runs on, so it belongs in
      // the same slot as an external entry's open count rather than a separate one.
      demand: { impressions: 0, opens: r.totalChats || 0, dismissals: 0, blocks: 0 },
      seq: r.id,
    }))
  } catch {
    return []
  }
}

/**
 * The searcher's own conversations as index documents.
 *
 * This is the half that makes it a chat search index rather than a directory.
 * Only ever the caller's own threads — there is no session in this corpus but
 * the one that asked, and no query can reach another person's conversations.
 */
async function threadDocs(sessionId: string): Promise<SearchDoc[]> {
  if (!sessionId) return []
  try {
    const rows = await db
      .select({
        conversationId: conversations.id,
        characterId: characters.id,
        name: characters.name,
        avatar: characters.avatar,
        category: characters.category,
        turns: sql<number>`count(${messages.id})`,
        seq: sql<number>`max(${messages.id})`,
        sample: sql<string>`string_agg(${messages.content}, ' ' order by ${messages.id})`,
      })
      .from(conversations)
      .innerJoin(characters, eq(conversations.characterId, characters.id))
      .innerJoin(messages, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.sessionId, sessionId))
      .groupBy(conversations.id, characters.id)
      .orderBy(desc(sql`max(${messages.id})`))
      .limit(THREAD_LIMIT)

    return rows.map((r) => {
      const turns = Number(r.turns) || 0
      return {
        kind: 'thread' as const,
        id: r.conversationId,
        ref: `thread:${r.conversationId}`,
        title: `${r.name} — thread #${r.conversationId}`,
        subtitle: `${turns} ${turns === 1 ? 'message' : 'messages'} · your conversation`,
        url: `/chat/${r.characterId}`,
        host: `your history · ${r.name.toLowerCase()}`,
        frame: '' as const,
        category: r.category || 'General',
        icon: r.avatar || '💬',
        text: (r.sample || '').slice(0, THREAD_SAMPLE),
        tags: [],
        demand: NO_DEMAND,
        seq: Number(r.seq) || 0,
      }
    })
  } catch {
    return []
  }
}

/** Registered external systems as index documents. */
async function entryDocs(): Promise<SearchDoc[]> {
  try {
    const rows = await db
      .select()
      .from(searchEntries)
      .where(and(eq(searchEntries.status, 'live'), eq(searchEntries.visibility, 'public')))
      .orderBy(desc(searchEntries.opens), searchEntries.id)
      .limit(ENTRY_LIMIT)
    return rows.map(entryToDoc)
  } catch {
    return []
  }
}

export function entryToDoc(r: typeof searchEntries.$inferSelect): SearchDoc {
  const tags = Array.isArray(r.tags) ? r.tags : []
  const vibes = Array.isArray(r.vibes) ? r.vibes : []
  return {
    kind: 'external',
    id: r.id,
    ref: `external:${r.id}`,
    title: r.name,
    subtitle: r.tagline || r.provider || r.host,
    url: r.url,
    host: r.host || r.provider,
    frame: coerceFrame(r.frame),
    category: r.category || 'Assistant',
    icon: r.icon || '🛰️',
    text: `${r.tagline} ${r.description} ${vibes.join(' ')}`.trim(),
    tags,
    demand: {
      impressions: r.impressions || 0,
      opens: r.opens || 0,
      dismissals: r.dismissals || 0,
      blocks: r.frameBlocks || 0,
    },
    seq: r.id,
  }
}

/**
 * The whole corpus for one search.
 *
 * Three kinds in one array, fetched in parallel, each degrading to empty on its
 * own. A search with no external table yet still searches characters; a search
 * by a brand-new session still searches everything public.
 */
export async function loadCorpus(sessionId: string): Promise<SearchDoc[]> {
  const [chars, threads, entries] = await Promise.all([
    characterDocs(),
    threadDocs(sessionId),
    entryDocs(),
  ])
  return [...chars, ...threads, ...entries]
}

/* ----------------------------------------------------------- the registry */

export type EntryRow = typeof searchEntries.$inferSelect

/** Everything in the index, including muted entries. Powers the add/manage page. */
export async function listEntries(limit = ENTRY_LIMIT): Promise<EntryRow[]> {
  try {
    return await db
      .select()
      .from(searchEntries)
      .orderBy(desc(searchEntries.opens), desc(searchEntries.id))
      .limit(limit)
  } catch {
    return []
  }
}

export async function getEntry(id: number): Promise<EntryRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null
  try {
    const [row] = await db.select().from(searchEntries).where(eq(searchEntries.id, id)).limit(1)
    return row ?? null
  } catch {
    return null
  }
}

/** How many entries one session has published in this index. */
export async function entryCountFor(sessionId: string): Promise<number> {
  if (!sessionId) return 0
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(searchEntries)
      .where(eq(searchEntries.sessionId, sessionId))
    return Number(row?.n) || 0
  } catch {
    return 0
  }
}

/**
 * How many entries one session published recently. The rate limit reads this.
 *
 * A count over a window rather than a token bucket, because the limit has to
 * survive a restart and a second server — the same reason tabs are rows. The
 * window is expressed against the id sequence and the timestamp together so a
 * clock skew cannot hand somebody an extra allowance.
 */
export async function recentEntryCount(sessionId: string, withinMinutes = 60): Promise<number> {
  if (!sessionId) return 0
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(searchEntries)
      .where(
        and(
          eq(searchEntries.sessionId, sessionId),
          sql`${searchEntries.createdAt} > now() - (${withinMinutes} * interval '1 minute')`,
        ),
      )
    return Number(row?.n) || 0
  } catch {
    return 0
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Register a manifest, or update the one already registered for that URL.
 *
 * Idempotent on (url, frame): publishing the same system twice edits the entry
 * instead of creating a duplicate result, and an entry that switches from oframe
 * to inframe is a genuinely different result — it opens differently — so it gets
 * its own row and its own counters rather than silently inheriting the other's.
 */
export async function registerEntry(input: {
  sessionId: string
  manifest: ChatManifest
  /** The character this system belongs to, when published from the creator. */
  characterId?: number | null
  /** What the embeddability probe found. Absent means it was never run. */
  embed?: EmbedCheck | null
}): Promise<{ entry: EntryRow | null; created: boolean; error?: string; demoted?: string }> {
  const { sessionId, manifest, embed } = input
  const host = hostOf(manifest.url)

  // The rule the whole probe exists for: a publisher may ASK for inframe, but a
  // host that refuses to be framed decides. Asked-for inframe plus a verdict
  // that is anything other than a clear yes lands as oframe, and the reason is
  // stored on the row so the publisher is told what happened rather than left
  // wondering why their embed became a hand-off.
  const requested = manifest.frame
  const frame = embed ? frameFor(embed.verdict, requested) : requested
  const demoted =
    requested === 'inframe' && frame === 'oframe' && embed
      ? embed.reason
      : undefined

  const values = {
    sessionId,
    name: manifest.name,
    tagline: manifest.tagline,
    description: manifest.description,
    url: manifest.url,
    host,
    frame,
    provider: manifest.provider,
    icon: manifest.icon,
    category: manifest.category,
    tags: manifest.tags,
    vibes: manifest.vibes,
    permissions: manifest.permissions,
    characterId:
      Number.isFinite(input.characterId) && (input.characterId as number) > 0
        ? Number(input.characterId)
        : null,
    ...(embed
      ? {
          embedCheck: embed.verdict,
          embedDetail: embed.detail.slice(0, 600),
          embedStatus: embed.status,
          embedCheckedAt: new Date(),
        }
      : {}),
    updatedAt: new Date(),
  }

  try {
    const [existing] = await db
      .select({ id: searchEntries.id, sessionId: searchEntries.sessionId })
      .from(searchEntries)
      .where(and(eq(searchEntries.url, manifest.url), eq(searchEntries.frame, frame)))
      .limit(1)

    if (existing) {
      // Anyone may publish into the index; only the publisher may rewrite what
      // they published. Without this an open write endpoint lets a stranger
      // repoint somebody else's entry at a URL of their choosing.
      if (existing.sessionId && existing.sessionId !== sessionId) {
        return {
          entry: null,
          created: false,
          error: 'That URL is already in the index under this frame, registered by someone else.',
        }
      }
      const [row] = await db
        .update(searchEntries)
        .set(values)
        .where(eq(searchEntries.id, existing.id))
        .returning()
      return { entry: row ?? null, created: false, demoted }
    }

    const [row] = await db.insert(searchEntries).values(values).returning()
    return { entry: row ?? null, created: true, demoted }
  } catch {
    return { entry: null, created: false, error: 'The index is not provisioned yet — it activates on the next deploy.' }
  }
}

/** Mute or unmute an entry. Counters are kept: muting is not deleting. */
export async function setEntryStatus(
  id: number,
  sessionId: string,
  status: 'live' | 'muted',
): Promise<EntryRow | null> {
  try {
    const [row] = await db
      .update(searchEntries)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(searchEntries.id, id), eq(searchEntries.sessionId, sessionId)))
      .returning()
    return row ?? null
  } catch {
    return null
  }
}

/* ----------------------------------------------------- sponsored placement */

/**
 * Buy a sponsored placement for an entry you published.
 *
 * The payment happens before the placement is written, and the placement is
 * only written if the payment succeeded — an ad that ran without being charged
 * and a charge that bought nothing are both worse than a failed purchase, and
 * there is no transaction here that can make one atomic with the other.
 *
 * Days extend rather than replace: buying again while a placement is live adds
 * to the end of it, so a renewal cannot accidentally shorten what was paid for.
 */
export async function sponsorEntry(input: {
  id: number
  sessionId: string
  days: number
  note?: string
}): Promise<{ ok: true; row: EntryRow } | { ok: false; error: string; balanceMilli?: number }> {
  const { id, sessionId } = input
  if (!sessionId) return { ok: false, error: 'sessionId is required' }

  const days = Math.max(1, Math.min(Math.round(input.days) || 0, 365))
  if (!SPONSOR_DAYS.includes(days as (typeof SPONSOR_DAYS)[number])) {
    return { ok: false, error: `Choose ${SPONSOR_DAYS.join(', ')} days.` }
  }

  let row: EntryRow | null = null
  try {
    const [owned] = await db
      .select()
      .from(searchEntries)
      .where(and(eq(searchEntries.id, id), eq(searchEntries.sessionId, sessionId)))
      .limit(1)
    row = owned ?? null
  } catch {
    return { ok: false, error: 'The index is unreachable just now.' }
  }
  if (!row) return { ok: false, error: 'Not yours, or not in the index.' }
  if (row.status !== 'live') {
    return { ok: false, error: 'That entry is muted. A muted entry is not served, so it cannot be promoted.' }
  }

  const priceMilli = sponsorPrice(days)
  const balances = await balancesFor(sessionId)
  const balanceMilli = Number((balances as Record<string, number>)?.cvc) || 0
  if (balanceMilli < priceMilli) {
    return {
      ok: false,
      error: `That placement costs ${priceMilli / 1000} CVC and the account holds ${balanceMilli / 1000}.`,
      balanceMilli,
    }
  }

  const charge = await spendCvc({
    sessionId,
    amountMilli: priceMilli,
    source: 'search_sponsor',
    reason: `Sponsored slot — ${row.name} (${days} days)`,
    refType: 'search_entry',
    refId: row.id,
  })
  if (!charge) return { ok: false, error: 'The charge did not go through, so nothing was promoted.' }

  // Extend from whichever is later: now, or an unexpired placement's end.
  const now = Date.now()
  const from = Math.max(now, row.sponsoredUntil ? new Date(row.sponsoredUntil).getTime() : 0)
  const until = new Date(from + days * 86_400_000)

  try {
    const [updated] = await db
      .update(searchEntries)
      .set({
        sponsoredUntil: until,
        sponsorMilli: (row.sponsorMilli || 0) + priceMilli,
        sponsorNote: String(input.note ?? row.sponsorNote ?? '').slice(0, 160),
        updatedAt: new Date(),
      })
      .where(and(eq(searchEntries.id, id), eq(searchEntries.sessionId, sessionId)))
      .returning()
    if (!updated) throw new Error('no row')
    return { ok: true, row: updated }
  } catch {
    // Paid and not placed. Refunded rather than swallowed, and the refund is a
    // ledger row of its own so the pair is visible in the account's history.
    await mintCoins({
      sessionId,
      coin: 'cvc',
      amountMilli: priceMilli,
      source: 'search_sponsor',
      reason: `Refund — sponsored slot for ${row.name} could not be written`,
      refType: 'search_entry',
      refId: row.id,
    }).catch(() => null)
    return { ok: false, error: 'The placement could not be written, so the charge was refunded.' }
  }
}

/** End a placement early. No refund, and the page says so before you click. */
export async function unsponsorEntry(id: number, sessionId: string): Promise<EntryRow | null> {
  try {
    const [row] = await db
      .update(searchEntries)
      .set({ sponsoredUntil: null, updatedAt: new Date() })
      .where(and(eq(searchEntries.id, id), eq(searchEntries.sessionId, sessionId)))
      .returning()
    return row ?? null
  } catch {
    return null
  }
}

/**
 * Entries with a placement that has not lapsed, best-paid first.
 *
 * Expiry is a read-time comparison, not a swept flag: no cron can forget to
 * run and leave an unpaid ad on the page.
 */
export async function liveSponsors(limit = 12): Promise<EntryRow[]> {
  try {
    return await db
      .select()
      .from(searchEntries)
      .where(
        sql`${searchEntries.status} = 'live'
            and ${searchEntries.sponsoredUntil} is not null
            and ${searchEntries.sponsoredUntil} > now()`,
      )
      .orderBy(desc(searchEntries.sponsorMilli), desc(searchEntries.id))
      .limit(limit)
  } catch {
    return []
  }
}

/**
 * Withdraw an entry from the index.
 *
 * The events stay. Removing an entry removes a result, not the record that
 * people wanted it — and the demand experiment this index exists to run would be
 * worthless if its data vanished every time somebody tidied up. The foreign key
 * is dropped to null first so the history survives the delete.
 */
export async function removeEntry(id: number, sessionId: string): Promise<boolean> {
  try {
    const [owned] = await db
      .select({ id: searchEntries.id })
      .from(searchEntries)
      .where(and(eq(searchEntries.id, id), eq(searchEntries.sessionId, sessionId)))
      .limit(1)
    if (!owned) return false
    await db.update(searchEvents).set({ entryId: null }).where(eq(searchEvents.entryId, id))
    await db.delete(searchEntries).where(eq(searchEntries.id, id))
    return true
  } catch {
    return false
  }
}

/* ----------------------------------------------------------- telemetry */

export type EventKind = 'query' | 'impression' | 'open' | 'dismiss' | 'frame_block' | 'probe'

const EVENT_KINDS: EventKind[] = ['query', 'impression', 'open', 'dismiss', 'frame_block', 'probe']

export function coerceEventKind(value: unknown): EventKind | null {
  return EVENT_KINDS.includes(value as EventKind) ? (value as EventKind) : null
}

/**
 * Record one search event and roll it into the entry's counters.
 *
 * Two writes rather than one derived read, deliberately. The counters are read
 * on every single search to rank with, and a sum over a growing event table on
 * the hot path would get slower exactly as the index got more interesting. The
 * event row is the audit trail; the counter is the ranking input.
 *
 * Fire-and-forget from every caller: telemetry must never delay a result page
 * or a hand-off, and a lost impression is a rounding error while a search that
 * failed because the log was busy is a broken product.
 */
export async function recordEvent(input: {
  sessionId: string
  kind: EventKind
  entryId?: number | null
  characterId?: number | null
  docKind?: string
  query?: string
  frame?: FrameId | ''
  source?: string
  rank?: number
}): Promise<void> {
  const entryId = Number.isFinite(input.entryId) && (input.entryId as number) > 0 ? Number(input.entryId) : null
  try {
    await db.insert(searchEvents).values({
      sessionId: (input.sessionId || '').slice(0, 80),
      kind: input.kind,
      entryId,
      characterId:
        Number.isFinite(input.characterId) && (input.characterId as number) > 0
          ? Number(input.characterId)
          : null,
      docKind: (input.docKind || '').slice(0, 20),
      query: (input.query || '').slice(0, 300),
      frame: input.frame || '',
      source: (input.source || 'search').slice(0, 20),
      rank: Math.max(0, Math.min(999, Number(input.rank) || 0)),
    })
  } catch {
    /* the counter update below is the part that matters for ranking */
  }

  if (!entryId) return

  // A query event has no counter of its own — it is about the box, not an entry.
  const bump =
    input.kind === 'open'
      ? { opens: sql`${searchEntries.opens} + 1`, lastOpenedAt: new Date() }
      : input.kind === 'dismiss'
        ? { dismissals: sql`${searchEntries.dismissals} + 1` }
        : input.kind === 'frame_block'
          ? { frameBlocks: sql`${searchEntries.frameBlocks} + 1` }
          : input.kind === 'impression'
            ? { impressions: sql`${searchEntries.impressions} + 1` }
            : null
  if (!bump) return

  try {
    await db.update(searchEntries).set(bump).where(eq(searchEntries.id, entryId))
  } catch {
    /* ignore */
  }

  if (input.kind === 'frame_block') await demoteIfBlocked(entryId)
}

/** Runtime blocks after which an inframe entry stops being offered as inframe. */
const BLOCKS_BEFORE_DEMOTION = 2

/**
 * Turn a repeatedly-blocked inframe entry into an oframe one.
 *
 * The header probe is a prediction made once, from a server, with a
 * non-browser user agent. This is the ground truth: a real browser, in a real
 * workspace, tried to render the thing and nothing appeared. When the two
 * disagree the browser is right, so the index corrects itself rather than
 * serving an embed that has already failed for somebody.
 *
 * Two blocks rather than one, because a single blank frame is as easily a
 * flaky connection as a policy. Written as one conditional UPDATE so two
 * simultaneous reports cannot both read "one block" and neither demote.
 */
async function demoteIfBlocked(entryId: number): Promise<void> {
  try {
    await db
      .update(searchEntries)
      .set({
        frame: 'oframe',
        embedCheck: 'blocked',
        embedDetail: sql`'Refused to render in a frame ' || ${searchEntries.frameBlocks} || ' times in the workspace — switched to a hand-off.'`,
        embedCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(searchEntries.id, entryId),
          eq(searchEntries.frame, 'inframe'),
          sql`${searchEntries.frameBlocks} >= ${BLOCKS_BEFORE_DEMOTION}`,
        ),
      )
  } catch {
    /* the counter is still recorded; the demotion can happen on the next block */
  }
}

/**
 * How many events of one kind this session has logged recently.
 *
 * Used to rate-limit the embeddability probe, which is the one endpoint here
 * that makes our server open a connection somewhere a stranger chose. Counted
 * off the event table rather than a counter, because a probe is worth keeping a
 * record of regardless — 'retain_all' includes the requests we turned down.
 */
export async function recentEventCount(
  sessionId: string,
  kind: EventKind,
  withinMinutes = 60,
): Promise<number> {
  if (!sessionId) return 0
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(searchEvents)
      .where(
        and(
          eq(searchEvents.sessionId, sessionId),
          eq(searchEvents.kind, kind),
          sql`${searchEvents.createdAt} > now() - (${withinMinutes} * interval '1 minute')`,
        ),
      )
    return Number(row?.n) || 0
  } catch {
    return 0
  }
}

/**
 * Record a fresh probe verdict against an entry already in the index.
 *
 * Re-probing is deliberately something a publisher asks for rather than a
 * background job. A host that quietly starts sending `X-Frame-Options: DENY`
 * should not have its entry silently re-shaped overnight; the publisher clicks
 * re-test, sees the new verdict and the headers behind it, and the frame moves
 * with their knowledge. Only the publisher may do it — ownership is in the
 * WHERE clause, not checked above it.
 */
export async function setEntryEmbedCheck(
  id: number,
  sessionId: string,
  embed: EmbedCheck,
  requestedFrame?: FrameId,
): Promise<EntryRow | null> {
  try {
    const [row] = await db
      .update(searchEntries)
      .set({
        frame: frameFor(embed.verdict, requestedFrame || 'inframe'),
        embedCheck: embed.verdict,
        embedDetail: embed.detail.slice(0, 600),
        embedStatus: embed.status,
        embedCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(searchEntries.id, id), eq(searchEntries.sessionId, sessionId)))
      .returning()
    return row ?? null
  } catch {
    return null
  }
}

/** Batch the impressions for one served page. One insert, one pass of counters. */
export async function recordImpressions(input: {
  sessionId: string
  query: string
  source: string
  hits: { ref: string; kind: string; id: number; frame: FrameId | '' }[]
}): Promise<void> {
  if (!input.hits.length) return
  const rows = input.hits.map((h, i) => ({
    sessionId: (input.sessionId || '').slice(0, 80),
    kind: 'impression',
    entryId: h.kind === 'external' ? h.id : null,
    characterId: h.kind === 'character' ? h.id : null,
    docKind: h.kind,
    query: (input.query || '').slice(0, 300),
    frame: h.frame || '',
    source: (input.source || 'search').slice(0, 20),
    rank: i + 1,
  }))
  try {
    await db.insert(searchEvents).values(rows)
  } catch {
    /* ignore */
  }
  const entryIds = input.hits.filter((h) => h.kind === 'external').map((h) => h.id)
  if (!entryIds.length) return
  try {
    await db
      .update(searchEntries)
      .set({ impressions: sql`${searchEntries.impressions} + 1` })
      .where(inArray(searchEntries.id, entryIds))
  } catch {
    /* ignore */
  }
}

export type IndexTelemetry = {
  entries: number
  live: number
  inframe: number
  oframe: number
  impressions: number
  opens: number
  dismissals: number
  frameBlocks: number
  /** Events in the log, which is the honest measure of how much was observed. */
  events: number
  queries: number
  /** Distinct sessions that have searched. */
  searchers: number
}

export const EMPTY_TELEMETRY: IndexTelemetry = {
  entries: 0, live: 0, inframe: 0, oframe: 0,
  impressions: 0, opens: 0, dismissals: 0, frameBlocks: 0,
  events: 0, queries: 0, searchers: 0,
}

/** The index's own numbers — the consumption/demand readout. */
export async function indexTelemetry(): Promise<IndexTelemetry> {
  const out: IndexTelemetry = { ...EMPTY_TELEMETRY }
  try {
    const [totals] = await db
      .select({
        entries: sql<number>`count(*)`,
        live: sql<number>`count(case when ${searchEntries.status} = 'live' then 1 end)`,
        inframe: sql<number>`count(case when ${searchEntries.frame} = 'inframe' then 1 end)`,
        oframe: sql<number>`count(case when ${searchEntries.frame} = 'oframe' then 1 end)`,
        impressions: sql<number>`coalesce(sum(${searchEntries.impressions}), 0)`,
        opens: sql<number>`coalesce(sum(${searchEntries.opens}), 0)`,
        dismissals: sql<number>`coalesce(sum(${searchEntries.dismissals}), 0)`,
        frameBlocks: sql<number>`coalesce(sum(${searchEntries.frameBlocks}), 0)`,
      })
      .from(searchEntries)
    out.entries = Number(totals?.entries) || 0
    out.live = Number(totals?.live) || 0
    out.inframe = Number(totals?.inframe) || 0
    out.oframe = Number(totals?.oframe) || 0
    out.impressions = Number(totals?.impressions) || 0
    out.opens = Number(totals?.opens) || 0
    out.dismissals = Number(totals?.dismissals) || 0
    out.frameBlocks = Number(totals?.frameBlocks) || 0
  } catch {
    /* zeros are an honest empty index */
  }
  try {
    const [ev] = await db
      .select({
        events: sql<number>`count(*)`,
        queries: sql<number>`count(case when ${searchEvents.kind} = 'query' then 1 end)`,
        searchers: sql<number>`count(distinct ${searchEvents.sessionId})`,
      })
      .from(searchEvents)
    out.events = Number(ev?.events) || 0
    out.queries = Number(ev?.queries) || 0
    out.searchers = Number(ev?.searchers) || 0
  } catch {
    /* ignore */
  }
  return out
}

/**
 * The queries an entry was actually opened from.
 *
 * This is the question the counters cannot answer: an entry with fifty opens
 * that all came from one phrase has one fan, not demand. Shown on the manage
 * page beside the totals for exactly that reason.
 */
export async function entryDemand(entryId: number, limit = 8): Promise<{
  query: string
  opens: number
  impressions: number
}[]> {
  if (!Number.isFinite(entryId) || entryId <= 0) return []
  try {
    const rows = await db
      .select({
        query: searchEvents.query,
        opens: sql<number>`count(case when ${searchEvents.kind} = 'open' then 1 end)`,
        impressions: sql<number>`count(case when ${searchEvents.kind} = 'impression' then 1 end)`,
      })
      .from(searchEvents)
      .where(and(eq(searchEvents.entryId, entryId), ne(searchEvents.query, '')))
      .groupBy(searchEvents.query)
      .orderBy(desc(sql`count(case when ${searchEvents.kind} = 'open' then 1 end)`))
      .limit(limit)
    return rows.map((r) => ({
      query: r.query,
      opens: Number(r.opens) || 0,
      impressions: Number(r.impressions) || 0,
    }))
  } catch {
    return []
  }
}

/** What people have been typing. The "trending searches" row, earned not faked. */
export async function topQueries(limit = 8): Promise<{ query: string; count: number }[]> {
  try {
    const rows = await db
      .select({ query: searchEvents.query, count: sql<number>`count(*)` })
      .from(searchEvents)
      .where(and(eq(searchEvents.kind, 'query'), ne(searchEvents.query, '')))
      .groupBy(searchEvents.query)
      .orderBy(desc(sql`count(*)`))
      .limit(limit)
    return rows.map((r) => ({ query: r.query, count: Number(r.count) || 0 }))
  } catch {
    return []
  }
}

/* ---------------------------------------------------------------- seeding */

/**
 * The systems the index ships knowing about.
 *
 * Google Gemini is an oframe entry and that is not an arbitrary choice — it sets
 * X-Frame-Options and cannot be embedded, so registering it as inframe would
 * produce a tab that is guaranteed to fail. The distinction is not a preference
 * toggle; it is a property of the host, and getting it wrong is exactly what the
 * frameBlocks counter is there to catch.
 */
const SEEDS: ChatManifest[] = [
  {
    name: 'Google Gemini',
    tagline: 'Chat with Google Gemini',
    description:
      'Google\'s assistant, hosted by Google. Registered as a hand-off because gemini.google.com refuses to be embedded — it sends X-Frame-Options, so an inframe tab would load into a blank pane no matter what we did on our side.',
    url: 'https://gemini.google.com/app',
    frame: 'oframe',
    provider: 'Google',
    icon: '✦',
    category: 'Assistant',
    tags: ['general', 'assistant', 'multimodal', 'google', 'gemini'],
    vibes: ['ask it anything', 'tactical, give me a problem', 'explain this to me'],
    // A hand-off entry declares no permissions: there is no frame to delegate
    // into, and once the browser has left for gemini.google.com the page is
    // Google's to ask for whatever it needs on its own terms.
    permissions: [],
  },
  {
    name: 'Google AI Studio',
    tagline: 'Prompt workbench for Gemini models',
    description:
      'Google\'s own prompt workbench — system instructions, temperature, model picker. A hand-off rather than an embed: it is a full application and it declines to be framed.',
    url: 'https://aistudio.google.com/',
    frame: 'oframe',
    provider: 'Google',
    icon: '🧪',
    category: 'Workbench',
    tags: ['prompting', 'workbench', 'gemini', 'developer'],
    vibes: ['tactical, give me a problem', 'let me tune the knobs'],
    permissions: [],
  },
  {
    name: 'Hugging Face Spaces',
    tagline: 'Community-hosted model demos',
    description:
      'Thousands of small hosted AI apps. Individual Spaces publish an embed URL and are genuinely frameable, which makes this the honest test case for whether an inframe tab is worth having at all.',
    url: 'https://huggingface.co/spaces',
    frame: 'oframe',
    provider: 'Hugging Face',
    icon: '🤗',
    category: 'Directory',
    tags: ['models', 'demos', 'community', 'open source'],
    vibes: ['show me something new', 'surprise me'],
    permissions: [],
  },
  {
    name: 'Wikipedia',
    tagline: 'Reference, embeddable',
    description:
      'Not an AI system, and in the index on purpose: Wikipedia allows framing, so it is the control in the experiment. If an inframe tab cannot render this, the problem is ours and not the host\'s.',
    url: 'https://en.m.wikipedia.org/wiki/Artificial_intelligence',
    frame: 'inframe',
    provider: 'Wikimedia',
    icon: '📖',
    category: 'Reference',
    tags: ['reference', 'control', 'embeddable'],
    vibes: ['explain this to me', 'melancholy and quiet'],
    // The one seeded entry that actually gets a frame, so the one that shows what
    // a declared permission looks like. Still nothing until a viewer grants it.
    permissions: ['fullscreen'],
  },
]

/**
 * Seed the index. Idempotent — a URL already registered is left exactly as it
 * is, including its counters, so re-seeding cannot reset the demand experiment.
 */
export async function seedEntries(): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0
  let skipped = 0
  for (const manifest of SEEDS) {
    try {
      const [existing] = await db
        .select({ id: searchEntries.id })
        .from(searchEntries)
        .where(eq(searchEntries.url, manifest.url))
        .limit(1)
      if (existing) {
        skipped += 1
        continue
      }
      await db.insert(searchEntries).values({
        sessionId: '',
        name: manifest.name,
        tagline: manifest.tagline,
        description: manifest.description,
        url: manifest.url,
        host: hostOf(manifest.url),
        frame: manifest.frame,
        provider: manifest.provider,
        icon: manifest.icon,
        category: manifest.category,
        tags: manifest.tags,
        vibes: manifest.vibes,
      })
      seeded += 1
    } catch {
      /* a seed that cannot be written is not worth failing a page load over */
    }
  }
  return { seeded, skipped }
}
