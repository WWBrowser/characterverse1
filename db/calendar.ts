import { db } from './index.js'
import { calendarEvents, cronSubscriptions, cronPulses, conversations } from './schema.js'
import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'

export const DEFAULT_WORKSPACE = 'default'

// ----------------------------------------------------------------- vocabulary

export const CALENDARS = ['datetime', 'content', 'master'] as const
export type Calendar = (typeof CALENDARS)[number]

export const CADENCES = ['hourly', 'daily', 'weekly'] as const
export type Cadence = (typeof CADENCES)[number]

// The privacy lever: which of a member's agents may know their business.
export const SCOPES = ['all', 'one', 'worked'] as const
export type CronScope = (typeof SCOPES)[number]

// Which event kinds belong to each calendar.
export const KINDS_BY_CALENDAR: Record<Calendar, readonly string[]> = {
  datetime: ['appointment', 'celebration'],
  content: ['brief'],
  master: ['competition', 'announcement', 'mailer'],
}

// The ordered status lifecycle each calendar's events advance through.
export const STATUS_FLOW: Record<Calendar, readonly string[]> = {
  datetime: ['upcoming', 'today', 'done'],
  content: ['idea', 'scheduled', 'in_progress', 'done'],
  master: ['draft', 'scheduled', 'live', 'done'],
}

export function normalizeCalendar(value: unknown): Calendar {
  const c = String(value || '').toLowerCase()
  return (CALENDARS as readonly string[]).includes(c) ? (c as Calendar) : 'datetime'
}

export function normalizeKind(calendar: Calendar, value: unknown): string {
  const k = String(value || '').toLowerCase()
  const allowed = KINDS_BY_CALENDAR[calendar]
  return allowed.includes(k) ? k : allowed[0]
}

export function normalizeCadence(value: unknown): Cadence {
  const c = String(value || '').toLowerCase()
  return (CADENCES as readonly string[]).includes(c) ? (c as Cadence) : 'daily'
}

export function normalizeScope(value: unknown): CronScope {
  const s = String(value || '').toLowerCase()
  return (SCOPES as readonly string[]).includes(s) ? (s as CronScope) : 'worked'
}

export function defaultStatus(calendar: Calendar): string {
  return STATUS_FLOW[calendar][0]
}

// Advance an event to the next status in its calendar's flow (no-op at the end).
export function nextStatus(calendar: Calendar, current: string): string {
  const flow = STATUS_FLOW[calendar]
  const i = flow.indexOf(current)
  if (i === -1) return flow[0]
  return flow[Math.min(i + 1, flow.length - 1)]
}

// ------------------------------------------------------------ subscription

export type CronSubscription = typeof cronSubscriptions.$inferSelect

// A member's cron subscription, or null if they have not set one up yet.
export async function getSubscription(sessionId: string): Promise<CronSubscription | null> {
  if (!sessionId) return null
  const [row] = await db
    .select()
    .from(cronSubscriptions)
    .where(eq(cronSubscriptions.sessionId, sessionId))
    .limit(1)
  return row ?? null
}

// Whether the member's chosen privacy scope lets a specific character know their
// business. 'all' → any agent; 'one' → only the dedicated agent; 'worked' → only
// agents the member has actually chatted with.
export async function agentMayKnow(
  sub: CronSubscription,
  characterId: number,
): Promise<boolean> {
  if (sub.scope === 'all') return true
  if (sub.scope === 'one') return sub.dedicatedAgentId === characterId
  // 'worked' — a conversation between this session and this character must exist.
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.sessionId, sub.sessionId), eq(conversations.characterId, characterId)))
    .limit(1)
  return Boolean(conv)
}

// --------------------------------------------------------------- member view

export type CalendarEvent = typeof calendarEvents.$inferSelect

// A member's upcoming events from their two calendars, soonest-scheduled first
// (then unscheduled), excluding anything already marked done.
export async function getMemberUpcoming(sessionId: string, limit = 12): Promise<CalendarEvent[]> {
  if (!sessionId) return []
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.sessionId, sessionId),
        sql`${calendarEvents.calendar} in ('datetime','content')`,
        sql`${calendarEvents.status} <> 'done'`,
      ),
    )
    .orderBy(sql`${calendarEvents.scheduledAt} asc nulls last`, desc(calendarEvents.createdAt))
    .limit(limit)
}

// --------------------------------------------------------------- pulses

export type PulseSample = {
  memberCalendars: number
  upcomingEvents: number
  soonest: { kind: string; calendar: string; scheduledAt: string | null }[]
}

// An anonymised, world-over snapshot of every member calendar at this instant —
// the shape of the community's activity, never anyone's private rows. This is
// what the agentic shadow calendars expose.
export async function samplePulse(workspaceId = DEFAULT_WORKSPACE): Promise<PulseSample> {
  // How many distinct members keep a calendar.
  const [{ calendars = 0 } = {}] = await db
    .select({ calendars: sql<number>`count(distinct ${calendarEvents.sessionId})::int` })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.workspaceId, workspaceId), sql`${calendarEvents.sessionId} <> ''`))

  // How many member events are still upcoming across the whole platform.
  const [{ upcoming = 0 } = {}] = await db
    .select({ upcoming: sql<number>`count(*)::int` })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
        sql`${calendarEvents.sessionId} <> ''`,
        sql`${calendarEvents.status} <> 'done'`,
      ),
    )

  // The soonest scheduled events platform-wide — kind + when only, no titles,
  // no owners. Agents see that "something" is coming, not whose or what.
  const soonestRows = await db
    .select({
      kind: calendarEvents.kind,
      calendar: calendarEvents.calendar,
      scheduledAt: calendarEvents.scheduledAt,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
        sql`${calendarEvents.sessionId} <> ''`,
        isNotNull(calendarEvents.scheduledAt),
        gte(calendarEvents.scheduledAt, sql`now()`),
      ),
    )
    .orderBy(asc(calendarEvents.scheduledAt))
    .limit(5)

  return {
    memberCalendars: Number(calendars) || 0,
    upcomingEvents: Number(upcoming) || 0,
    soonest: soonestRows.map((r) => ({
      kind: r.kind,
      calendar: r.calendar,
      scheduledAt: r.scheduledAt ? new Date(r.scheduledAt).toISOString() : null,
    })),
  }
}

// Record one pulse: stamp the moment plus the anonymised world-over sample.
export async function recordPulse(
  source: 'cron' | 'manual' = 'cron',
  workspaceId = DEFAULT_WORKSPACE,
): Promise<typeof cronPulses.$inferSelect> {
  const sample = await samplePulse(workspaceId)
  const note =
    source === 'cron'
      ? 'Scheduled pulse — the cron fired and sampled the community.'
      : 'Manual pulse — fired by hand from the Cron page.'
  const [row] = await db.insert(cronPulses).values({ workspaceId, source, sample, note }).returning()
  return row
}

export async function getLatestPulse(workspaceId = DEFAULT_WORKSPACE) {
  const [row] = await db
    .select()
    .from(cronPulses)
    .where(eq(cronPulses.workspaceId, workspaceId))
    .orderBy(desc(cronPulses.firedAt))
    .limit(1)
  return row ?? null
}

// --------------------------------------------------- chat awareness block

function whenLabel(iso: string | null): string {
  if (!iso) return 'unscheduled'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'unscheduled'
  const diffMs = then - Date.now()
  const day = 86_400_000
  if (diffMs < 0) return 'now/past'
  if (diffMs < 3_600_000) return `in ${Math.max(1, Math.round(diffMs / 60_000))} min`
  if (diffMs < day) return `in ${Math.round(diffMs / 3_600_000)}h`
  return `in ${Math.round(diffMs / day)}d`
}

/**
 * The time-and-calendar awareness block injected into a character's system prompt
 * so it knows what "now" is, senses the wider platform, and — only when the
 * member's privacy scope permits this character — can plan around the member's
 * own real dates. `memberEvents` is passed in already gated by agentMayKnow.
 */
export function buildAwarenessBlock(
  now: Date,
  pulse: { sample: unknown; firedAt: Date | string | null } | null,
  memberEvents: CalendarEvent[],
): string {
  const lines: string[] = []
  lines.push(
    `The current date and time is ${now.toLocaleString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })}. You are re-incarnated on every reply, so treat this as the real present moment.`,
  )

  const sample = (pulse?.sample ?? null) as PulseSample | null
  if (sample && (sample.memberCalendars || sample.upcomingEvents)) {
    let pulseLine = `Community pulse (anonymised, refreshed each cron fire): ${sample.memberCalendars} member calendar(s) across the world, ${sample.upcomingEvents} event(s) coming up.`
    if (Array.isArray(sample.soonest) && sample.soonest.length) {
      const soon = sample.soonest
        .slice(0, 3)
        .map((s) => `${s.kind} (${whenLabel(s.scheduledAt)})`)
        .join(', ')
      pulseLine += ` Soonest platform-wide: ${soon}.`
    }
    lines.push(pulseLine)
  }

  if (memberEvents.length) {
    const dt = memberEvents.filter((e) => e.calendar === 'datetime')
    const ct = memberEvents.filter((e) => e.calendar === 'content')
    if (dt.length) {
      lines.push(
        `This member's upcoming dates (they have allowed you to know): ${dt
          .map((e) => `${e.kind} "${e.title}" (${whenLabel(e.scheduledAt ? new Date(e.scheduledAt).toISOString() : null)})`)
          .join('; ')}.`,
      )
    }
    if (ct.length) {
      lines.push(
        `Briefs this member has on their content calendar: ${ct
          .map((e) => `"${e.title}"${e.note ? ` — ${e.note.slice(0, 80)}` : ''}`)
          .join('; ')}.`,
      )
    }
    lines.push('Use these dates and briefs naturally to be helpful; never expose another member’s private calendar.')
  }

  return `Time & calendar awareness:\n${lines.map((l) => `- ${l}`).join('\n')}`
}
