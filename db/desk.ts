import { and, desc, eq } from 'drizzle-orm'
import { db } from './index.js'
import { conversations, deskAnchors, deskPurges, messages } from './schema.js'
import {
  clearDeskPlan,
  readDesk,
  type ClearDeskPlan,
  type DeskAnchor,
  type DeskPurge,
  type DeskReading,
} from '../src/lib/desk.js'

// Server-side reads and writes for the Desk.
//
// The desk is derived, never stored. `loadDesk` finds the newest purge for a
// conversation, treats its clearedThroughMessageId as the epoch, and hands the
// whole transcript plus that epoch to the pure kernel — which decides what is on
// the desk and what is in the cabinet. Nothing here mutates a message; a purge
// is an append to the log and an anchor is a row of its own.
//
// That derivation is the safety property. A purge cannot lose a conversation,
// because the purge does not touch the conversation. Delete every desk_purges
// row and the full transcript is back on the desk, unchanged.

/** Anchor rows → the shape the pure kernel expects. */
function toAnchors(rows: (typeof deskAnchors.$inferSelect)[]): DeskAnchor[] {
  return rows.map((r) => ({
    id: r.id,
    kind: (r.kind as DeskAnchor['kind']) || 'message',
    label: r.label,
    body: r.body,
    messageId: r.messageId,
    sourceRef: r.sourceRef,
    active: r.active,
    createdAt: r.createdAt,
  }))
}

function toPurges(rows: (typeof deskPurges.$inferSelect)[]): DeskPurge[] {
  return rows.map((r) => ({
    id: r.id,
    clearedThroughMessageId: r.clearedThroughMessageId,
    messagesFiled: r.messagesFiled,
    tokensReclaimed: r.tokensReclaimed,
    reason: r.reason,
    createdAt: r.createdAt,
  }))
}

/**
 * The epoch for a conversation: the message id the desk was last swept through.
 * 0 when it has never been cleared, which puts the whole transcript on the desk
 * — the unbounded default this feature exists to bound.
 */
export async function deskEpoch(conversationId: number): Promise<number> {
  const [latest] = await db
    .select({ through: deskPurges.clearedThroughMessageId })
    .from(deskPurges)
    .where(eq(deskPurges.conversationId, conversationId))
    .orderBy(desc(deskPurges.id))
    .limit(1)
  return latest?.through ?? 0
}

/**
 * Active anchors for a conversation, ready to prepend to a system prompt.
 * Kept separate from the full reading so the chat handler can pull just this
 * on the hot path without measuring the whole desk.
 */
export async function loadAnchors(conversationId: number): Promise<DeskAnchor[]> {
  const rows = await db
    .select()
    .from(deskAnchors)
    .where(and(eq(deskAnchors.conversationId, conversationId), eq(deskAnchors.active, true)))
    .orderBy(deskAnchors.id)
  return toAnchors(rows)
}

/**
 * The cheap read for the chat hot path: where the desk starts, what is pinned,
 * and how much is behind the epoch — without building lanes or stats for a panel
 * nobody is looking at. One query per fact, three in parallel.
 */
export type DeskContext = {
  epoch: number
  purges: number
  filed: number
  anchors: DeskAnchor[]
}

export async function deskContext(conversationId: number): Promise<DeskContext> {
  const [purgeRows, anchorRows] = await Promise.all([
    db
      .select({
        through: deskPurges.clearedThroughMessageId,
        filed: deskPurges.messagesFiled,
      })
      .from(deskPurges)
      .where(eq(deskPurges.conversationId, conversationId))
      .orderBy(deskPurges.id),
    db
      .select()
      .from(deskAnchors)
      .where(and(eq(deskAnchors.conversationId, conversationId), eq(deskAnchors.active, true)))
      .orderBy(deskAnchors.id),
  ])

  return {
    epoch: purgeRows.length ? (purgeRows[purgeRows.length - 1].through ?? 0) : 0,
    purges: purgeRows.length,
    // Every sweep's filing total, so the prompt can say how much is out of reach.
    filed: purgeRows.reduce((sum, r) => sum + r.filed, 0),
    anchors: toAnchors(anchorRows),
  }
}

export type LoadedDesk = {
  conversationId: number
  characterId: number
  reading: DeskReading
  plan: ClearDeskPlan
  purgeLog: DeskPurge[]
}

/** The full reading behind the desk panel. Null when the conversation is gone. */
export async function loadDesk(conversationId: number): Promise<LoadedDesk | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (!conversation) return null

  const [rows, anchorRows, purgeRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.id),
    db
      .select()
      .from(deskAnchors)
      .where(eq(deskAnchors.conversationId, conversationId))
      .orderBy(deskAnchors.id),
    db
      .select()
      .from(deskPurges)
      .where(eq(deskPurges.conversationId, conversationId))
      .orderBy(deskPurges.id),
  ])

  const purges = toPurges(purgeRows)
  const epoch = purges.length ? (purges[purges.length - 1].clearedThroughMessageId ?? 0) : 0
  const reading = readDesk(rows, epoch, toAnchors(anchorRows), purges)

  return {
    conversationId,
    characterId: conversation.characterId,
    reading,
    plan: clearDeskPlan(reading),
    // Newest first: the log reads as history, most recent sweep at the top.
    purgeLog: [...purges].reverse(),
  }
}

/**
 * Clear the desk.
 *
 * Commit → purge → top up. The commit is implicit and total: the messages were
 * already durable, so filing them means recording where the sweep reached. The
 * purge is the epoch moving forward, which is what removes them from every
 * future prompt. The top-up is the arithmetic consequence — the tokens that were
 * being spent restating the transcript are simply no longer being spent.
 *
 * Idempotent in effect: clearing an already-empty desk records nothing and
 * returns the reading unchanged, so a double click cannot corrupt the log.
 */
export async function clearDesk(
  conversationId: number,
  opts: { sessionId?: string; node?: string; reason?: string } = {},
): Promise<LoadedDesk | null> {
  const before = await loadDesk(conversationId)
  if (!before) return null
  if (!before.plan.messagesFiled) return before

  await db.insert(deskPurges).values({
    conversationId,
    characterId: before.characterId,
    sessionId: opts.sessionId ?? '',
    node: opts.node || 'stella',
    clearedThroughMessageId: before.plan.clearedThroughMessageId,
    messagesFiled: before.plan.messagesFiled,
    tokensReclaimed: before.plan.tokensReclaimed,
    noiseBefore: before.reading.noiseRiskPct,
    bandwidthAfter: before.plan.bandwidthAfter,
    reason: (opts.reason ?? '').slice(0, 500),
  })

  return loadDesk(conversationId)
}

/**
 * Pin an anchor. The label is required — an unlabelled artifact is not an
 * anchor, it is just more paper.
 *
 * When `messageId` is given and no body was supplied, the message's own text
 * becomes the body: pinning a turn should capture what it said, not a pointer to
 * a row that a later purge makes unreadable.
 */
export async function pinAnchor(
  conversationId: number,
  input: {
    sessionId?: string
    kind?: DeskAnchor['kind']
    label: string
    body?: string
    messageId?: number | null
    sourceRef?: string | null
  },
): Promise<LoadedDesk | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (!conversation) return null

  let body = (input.body ?? '').slice(0, 8000)
  if (!body && input.messageId) {
    const [row] = await db
      .select({ content: messages.content })
      .from(messages)
      .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, conversationId)))
    body = (row?.content ?? '').slice(0, 8000)
  }

  await db.insert(deskAnchors).values({
    conversationId,
    characterId: conversation.characterId,
    sessionId: input.sessionId ?? '',
    kind: input.kind ?? 'message',
    label: input.label.slice(0, 240),
    body,
    messageId: input.messageId ?? null,
    sourceRef: input.sourceRef ? input.sourceRef.slice(0, 240) : null,
  })

  return loadDesk(conversationId)
}

/**
 * Unpin. The row survives with active=false — what was anchored and when is
 * part of the audit trail, and an artifact that can be silently un-declared is
 * not much of a ground truth.
 */
export async function unpinAnchor(conversationId: number, anchorId: number): Promise<LoadedDesk | null> {
  await db
    .update(deskAnchors)
    .set({ active: false })
    .where(and(eq(deskAnchors.id, anchorId), eq(deskAnchors.conversationId, conversationId)))
  return loadDesk(conversationId)
}
