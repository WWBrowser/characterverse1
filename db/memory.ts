import { db } from './index.js'
import { userMemories } from './schema.js'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { MemoryScope } from '../src/lib/modes.js'

// The kinds of long-term memory CharacterVerse keeps about a person. Kept in one
// place so the API, the extractor and the Memory page agree on the vocabulary.
export const MEMORY_KINDS = ['preference', 'fact', 'goal', 'style', 'context'] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export function normalizeKind(value: unknown): MemoryKind {
  const k = String(value || '').toLowerCase()
  return (MEMORY_KINDS as readonly string[]).includes(k) ? (k as MemoryKind) : 'preference'
}

export function clampConfidence(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

export type MemoryRow = typeof userMemories.$inferSelect

/**
 * Everything CharacterVerse remembers for one anonymous session identity, pinned
 * entries first, then most-confident and most-recent. Capped so a long history
 * never blows up a system prompt.
 *
 * When `scope` is given, returns that mode's lane plus the shared `general`
 * lane — memory is united across the three modes but separated per mode.
 */
export async function getMemories(
  sessionId: string,
  limit = 40,
  scope?: MemoryScope,
): Promise<MemoryRow[]> {
  if (!sessionId) return []
  const where =
    scope && scope !== 'general'
      ? and(eq(userMemories.sessionId, sessionId), inArray(userMemories.scope, ['general', scope]))
      : eq(userMemories.sessionId, sessionId)
  return db
    .select()
    .from(userMemories)
    .where(where)
    .orderBy(desc(userMemories.pinned), desc(userMemories.confidence), desc(userMemories.updatedAt))
    .limit(limit)
}

/**
 * Render remembered facts as a block to prepend to a character's system prompt.
 * Returns '' when there is nothing to remember, so callers can inject
 * unconditionally.
 */
export function buildMemoryBlock(memories: MemoryRow[]): string {
  if (!memories.length) return ''
  const byKind: Record<string, string[]> = {}
  for (const m of memories) {
    if (!m.content) continue
    ;(byKind[m.kind] ||= []).push(m.content.trim())
  }
  const labels: Record<string, string> = {
    preference: 'Preferences',
    fact: 'About them',
    goal: 'Goals they are working toward',
    style: 'How they like answers',
    context: 'Useful context',
  }
  const sections = Object.entries(byKind)
    .filter(([, items]) => items.length)
    .map(([kind, items]) => `${labels[kind] || kind}:\n${items.map((i) => `  - ${i}`).join('\n')}`)
  if (!sections.length) return ''
  return `What you remember about this user from previous conversations — honor it naturally without repeating it back verbatim:\n${sections.join('\n')}`
}

// Heuristic, deterministic extraction of durable memories from a user's message.
// This runs server-side with no extra AI call, so capture works even when the
// gateway is unavailable. Each pattern pulls the meaningful clause after a trigger
// phrase and classifies it. Conservative on purpose — better to miss a memory
// than to store noise.
const PATTERNS: { re: RegExp; kind: MemoryKind; confidence: number }[] = [
  { re: /\b(?:my name is|i am called|i'm called|call me)\s+([^.,!?\n]{2,40})/i, kind: 'fact', confidence: 5 },
  { re: /\b(?:remember that|just so you know|for the record|note that)\s+([^.!?\n]{4,140})/i, kind: 'context', confidence: 5 },
  { re: /\bi (?:really )?(?:prefer|like|love|enjoy|favou?r)\s+([^.!?\n]{3,120})/i, kind: 'preference', confidence: 4 },
  { re: /\bi (?:really )?(?:hate|dislike|can't stand|cannot stand|don't like|do not like)\s+([^.!?\n]{3,120})/i, kind: 'preference', confidence: 4 },
  { re: /\bi(?:'m| am)\s+(?:a|an)\s+([^.!?\n]{3,80})/i, kind: 'fact', confidence: 3 },
  { re: /\bi(?:'m| am)\s+(?:working on|trying to|learning|building)\s+([^.!?\n]{3,120})/i, kind: 'goal', confidence: 4 },
  { re: /\b(?:my goal is|i want to|i'd like to|i would like to)\s+([^.!?\n]{3,120})/i, kind: 'goal', confidence: 4 },
  { re: /\b(?:keep it|please be|respond|answer|reply|talk to me)\s+((?:brief|short|concise|detailed|formal|casual|simple|technical)[^.!?\n]{0,80})/i, kind: 'style', confidence: 4 },
]

export type ExtractedMemory = { kind: MemoryKind; content: string; confidence: number }

export function extractMemories(message: string): ExtractedMemory[] {
  const text = String(message || '')
  if (text.length < 6) return []
  const out: ExtractedMemory[] = []
  const seen = new Set<string>()
  for (const { re, kind, confidence } of PATTERNS) {
    const m = text.match(re)
    if (!m) continue
    const clause = m[1].trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '')
    if (clause.length < 2 || clause.length > 140) continue
    const phrase = m[0].trim().replace(/\s+/g, ' ')
    // Store the full natural phrase ("I prefer dark mode") rather than just the
    // clause — it reads better when injected back into a prompt.
    const content = phrase.charAt(0).toUpperCase() + phrase.slice(1)
    const key = content.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, content, confidence })
  }
  return out.slice(0, 3)
}

/**
 * Persist auto-extracted memories for a session, skipping anything we already
 * remember (case-insensitive content match) so a repeated phrase doesn't pile up.
 * Best-effort: failures are swallowed so they never break a chat turn.
 */
export async function captureMemories(
  sessionId: string,
  message: string,
  characterId?: number | null,
  scope: MemoryScope = 'general',
): Promise<number> {
  if (!sessionId) return 0
  const candidates = extractMemories(message)
  if (!candidates.length) return 0
  let stored = 0
  for (const c of candidates) {
    try {
      const [dupe] = await db
        .select({ id: userMemories.id })
        .from(userMemories)
        .where(
          and(
            eq(userMemories.sessionId, sessionId),
            sql`lower(${userMemories.content}) = ${c.content.toLowerCase()}`,
          ),
        )
        .limit(1)
      if (dupe) continue
      await db.insert(userMemories).values({
        sessionId,
        kind: c.kind,
        content: c.content,
        source: 'chat',
        characterId: characterId ?? null,
        scope,
        confidence: c.confidence,
      })
      stored++
    } catch {
      // ignore — capture is never allowed to fail a chat
    }
  }
  return stored
}
