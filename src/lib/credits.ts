// Character Credits (CC) — the shared vocabulary behind the leaderboard, stat
// cards and the per-character stat ledger. CC is the 🥈 Silver coin a character
// earns from meaningful engagement, and it doubles as money: 1 Silver CC = £0.001
// (one tenth of a penny — see src/lib/coins.ts for the full two-coin economy and
// AccountantClaw's live, raisable pricing). The richer 🥇 Gold coin (£0.01) is
// mined from training success and tracked separately in the coin ledger.
//
// Everything here is pure (no database, no DOM) so it is safe to import from both
// the React pages and the server API. The server stores only raw counters
// (character_stats); these helpers turn them into CC, milestones and pounds.

// ---------------------------------------------------------------- earning rates

// Per-message CC by engagement channel. Richer collaboration is worth more.
export const CHANNEL_RATE = {
  chat: 1, // 🔵 Direct Chat        +1 CC / msg
  claw: 2, // 🟡 CharacterClaw      +2 CC / msg
  conference: 3, // 🟣 Conference Cluster +3 CC / msg
} as const

export type Channel = keyof typeof CHANNEL_RATE

export const APP_RATE = 5 // +5 CC once per connected app
export const EXTERNAL_RATE = 15 // +15 CC once per external platform reached

export const PENCE_PER_CC = 0.1 // 1 Silver CC = £0.001 (one tenth of a penny)

// Connectable apps (+5 CC each, once). Slugs are what the API stores.
export const APPS: { slug: string; label: string; emoji: string }[] = [
  { slug: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { slug: 'slack', label: 'Slack', emoji: '🟪' },
  { slug: 'discord', label: 'Discord', emoji: '🎮' },
  { slug: 'telegram', label: 'Telegram', emoji: '✈️' },
  { slug: 'teams', label: 'Microsoft Teams', emoji: '🟦' },
]

// External platforms a character can be reached on (+15 CC each, once).
export const EXTERNALS: { slug: string; label: string; emoji: string }[] = [
  { slug: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { slug: 'slack', label: 'Slack', emoji: '🟪' },
  { slug: 'discord', label: 'Discord', emoji: '🎮' },
  { slug: 'telegram', label: 'Telegram', emoji: '✈️' },
  { slug: 'teams', label: 'Microsoft Teams', emoji: '🟦' },
]

// Chat milestones — a one-off bonus when total engagement crosses a threshold.
// Only the highest threshold reached counts, keeping the bonus in the +10–250
// range described for the leaderboard.
export const MILESTONES: { at: number; bonus: number; label: string }[] = [
  { at: 10, bonus: 10, label: 'First 10 messages' },
  { at: 50, bonus: 25, label: '50 messages' },
  { at: 100, bonus: 50, label: '100 messages' },
  { at: 250, bonus: 100, label: '250 messages' },
  { at: 500, bonus: 175, label: '500 messages' },
  { at: 1000, bonus: 250, label: '1,000 messages' },
]

// ------------------------------------------------------------------ raw counters

// The raw, stored shape (mirrors the character_stats table). Connection arrays
// may arrive as unknown JSON, so callers should sanitize through `creditsFor`.
export type RawStats = {
  chatMsgs?: number | null
  clawMsgs?: number | null
  conferenceMsgs?: number | null
  appConnections?: unknown
  externalPlatforms?: unknown
  isPrivate?: boolean | null
}

export type CreditBreakdown = {
  chatMsgs: number
  clawMsgs: number
  conferenceMsgs: number
  totalMsgs: number
  chatCc: number
  clawCc: number
  conferenceCc: number
  apps: string[]
  externals: string[]
  appCc: number
  externalCc: number
  milestone: { at: number; bonus: number; label: string } | null
  milestoneBonus: number
  // CC earned purely from live engagement (chat + claw + conference + milestone).
  // This is what "engagement %" on the leaderboard is computed against.
  engagementCc: number
  total: number
  pence: number
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.map((x) => String(x)).filter(Boolean))]
}

function n(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0
}

// Turn raw counters into a full CC breakdown.
export function creditsFor(raw: RawStats): CreditBreakdown {
  const chatMsgs = n(raw.chatMsgs)
  const clawMsgs = n(raw.clawMsgs)
  const conferenceMsgs = n(raw.conferenceMsgs)
  const totalMsgs = chatMsgs + clawMsgs + conferenceMsgs

  const chatCc = chatMsgs * CHANNEL_RATE.chat
  const clawCc = clawMsgs * CHANNEL_RATE.claw
  const conferenceCc = conferenceMsgs * CHANNEL_RATE.conference

  const apps = toStringArray(raw.appConnections)
  const externals = toStringArray(raw.externalPlatforms)
  const appCc = apps.length * APP_RATE
  const externalCc = externals.length * EXTERNAL_RATE

  let milestone: CreditBreakdown['milestone'] = null
  for (const m of MILESTONES) if (totalMsgs >= m.at) milestone = m
  const milestoneBonus = milestone ? milestone.bonus : 0

  const engagementCc = chatCc + clawCc + conferenceCc + milestoneBonus
  const total = engagementCc + appCc + externalCc

  return {
    chatMsgs,
    clawMsgs,
    conferenceMsgs,
    totalMsgs,
    chatCc,
    clawCc,
    conferenceCc,
    apps,
    externals,
    appCc,
    externalCc,
    milestone,
    milestoneBonus,
    engagementCc,
    total,
    pence: total * PENCE_PER_CC,
  }
}

// ----------------------------------------------------------------- formatting

// Format a CC amount as GBP (1 Silver CC = £0.001). e.g. 50 CC → "£0.05".
export function formatGbp(cc: number): string {
  const pounds = (cc * PENCE_PER_CC) / 100
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(pounds)
}

export function formatCc(cc: number): string {
  return new Intl.NumberFormat('en-GB').format(cc)
}
