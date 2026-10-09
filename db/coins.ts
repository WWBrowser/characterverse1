import { db } from './index.js'
import { coinSettings, coinLedger, coinVaults } from './schema.js'
import { eq, sql } from 'drizzle-orm'

// Server-side coin helpers for the coin economy. Pure model logic (rates,
// prices, conversions) lives in src/lib/coins.ts; this module is the database
// side: it seeds the AccountantClaw settings singleton, mints ledger rows, and
// rolls them up into balances and an economy summary. Minting is best-effort —
// a ledger hiccup must never break a user-facing chat or training action.
//
// Amounts are MILLI-COINS (1000 = one whole coin). Inlined here so this helper
// has no cross-package import; keep in sync with src/lib/coins.ts MILLI.
const MILLI = 1000

export const DEFAULT_WORKSPACE = 'default'

// The two base coins plus the four surface coins (CS/CJ/CV/CA). The ledger's
// `coin` column is free text, so surface coins need no schema change — only this
// allow-list so mintCoins accepts them.
// 'cvc' is the odd one out: it is the chat-inference gas coin, not money, and
// its ledger rows can be negative (a spend). mintCoins still only writes
// positive grants; spendCvc writes the negatives.
const VALID_COINS = ['silver', 'gold', 'cs', 'cj', 'cv', 'ca', 'cvc'] as const
type CoinName = (typeof VALID_COINS)[number]

// Default earning rates, mirrored from src/lib/coins.ts (kept inline so the
// server seed has no client import). Whole coins.
const DEFAULT_SILVER_RATES = { chat: 1, merged: 1, claw: 2, conference: 3, mission: 5 }
const DEFAULT_GOLD_RATES = { character: 1, dyad: 2, cluster: 3 }

// CVC gas defaults, mirrored from src/lib/coins.ts (kept inline so the server
// seed has no client import). Milli-coins.
const CVC_PER_REPLY_MILLI = 1000 // 1 CVC burned per character reply
const CVC_WELCOME_MILLI = 100_000 // 100 CVC starter grant on first chat

// Ensure the coin_settings singleton exists for a workspace, seeding it with the
// fixed base prices (Silver £0.001 = 1 milli-pound, Gold £0.01 = 10) and the
// default rate maps. Returns the live settings row.
export async function ensureCoinSettings(workspaceId = DEFAULT_WORKSPACE) {
  try {
    await db
      .insert(coinSettings)
      .values({
        workspaceId,
        silverPrice: 1,
        goldPrice: 10,
        silverRates: DEFAULT_SILVER_RATES,
        goldRates: DEFAULT_GOLD_RATES,
        askBonusMilli: 500,
        pricingMode: 'fixed',
        cvcPerReplyMilli: CVC_PER_REPLY_MILLI,
        cvcWelcomeMilli: CVC_WELCOME_MILLI,
        accountantCanMintCvc: true,
      })
      .onConflictDoNothing({ target: coinSettings.workspaceId })
  } catch {
    /* ignore — read below still returns whatever exists */
  }
  const [row] = await db.select().from(coinSettings).where(eq(coinSettings.workspaceId, workspaceId))
  return row
}

export type MintInput = {
  sessionId?: string
  characterId?: number | null
  coin: CoinName
  // Either whole coins (`coins`) or an exact milli amount (`amountMilli`).
  coins?: number
  amountMilli?: number
  source: string
  reason?: string
  refType?: string
  refId?: number | null
  workspaceId?: string
}

// Mint a coin grant into the ledger. Best-effort and non-throwing. Returns the
// inserted row, or null if nothing was written.
export async function mintCoins(input: MintInput) {
  const amountMilli =
    typeof input.amountMilli === 'number'
      ? Math.round(input.amountMilli)
      : Math.round((input.coins ?? 0) * MILLI)
  if (!amountMilli || amountMilli <= 0) return null
  if (!VALID_COINS.includes(input.coin)) return null
  try {
    const [row] = await db
      .insert(coinLedger)
      .values({
        workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE,
        sessionId: input.sessionId ?? '',
        characterId: input.characterId ?? null,
        coin: input.coin,
        amountMilli,
        source: input.source,
        reason: input.reason ?? '',
        refType: input.refType ?? '',
        refId: input.refId ?? null,
      })
      .returning()
    return row
  } catch {
    return null
  }
}

// Total milli-coins of every coin held by one account (session). Returns a map
// keyed by coin name; base coins are always present, surface coins appear as they
// are earned. `silver`/`gold` stay top-level for back-compat with existing callers.
export async function balancesFor(sessionId: string, workspaceId = DEFAULT_WORKSPACE) {
  const out: Record<string, number> & { silver: number; gold: number } = { silver: 0, gold: 0 }
  if (!sessionId) return out
  try {
    const rows = await db
      .select({
        coin: coinLedger.coin,
        total: sql<number>`coalesce(sum(${coinLedger.amountMilli}), 0)`,
      })
      .from(coinLedger)
      .where(sql`${coinLedger.sessionId} = ${sessionId} and ${coinLedger.workspaceId} = ${workspaceId}`)
      .groupBy(coinLedger.coin)
    for (const r of rows) out[r.coin] = Number(r.total) || 0
  } catch {
    /* ignore */
  }
  return out
}

// The per-coin leaderboard: the top accounts by minted total of one coin. Sessions
// are anonymous, so each is returned with a short derived tag; the caller marks the
// current session as "you".
export async function leaderboardFor(coin: string, workspaceId = DEFAULT_WORKSPACE, limit = 50) {
  try {
    const rows = await db
      .select({
        sessionId: coinLedger.sessionId,
        total: sql<number>`coalesce(sum(${coinLedger.amountMilli}), 0)`,
        events: sql<number>`count(*)`,
      })
      .from(coinLedger)
      .where(sql`${coinLedger.coin} = ${coin} and ${coinLedger.workspaceId} = ${workspaceId} and ${coinLedger.sessionId} <> ''`)
      .groupBy(coinLedger.sessionId)
      .orderBy(sql`coalesce(sum(${coinLedger.amountMilli}), 0) desc`)
      .limit(limit)
    return rows.map((r) => ({ sessionId: r.sessionId, total: Number(r.total) || 0, events: Number(r.events) || 0 }))
  } catch {
    return []
  }
}

// ── Vault (cryptographic vault + shared-wallet time locks) ───────────────────

export async function getVault(sessionId: string, workspaceId = DEFAULT_WORKSPACE) {
  if (!sessionId) return null
  try {
    await db.insert(coinVaults).values({ sessionId, workspaceId }).onConflictDoNothing({ target: coinVaults.sessionId })
    const [row] = await db.select().from(coinVaults).where(eq(coinVaults.sessionId, sessionId))
    return row ?? null
  } catch {
    return null
  }
}

// Seal the vault with a hard agentic time-lock for `hours` (cannot be reopened
// until it expires). Extends but never shortens an active seal.
export async function sealVault(sessionId: string, hours: number, note = '', workspaceId = DEFAULT_WORKSPACE) {
  const clamped = Math.max(1, Math.min(24 * 30, Math.round(hours)))
  const until = new Date(Date.now() + clamped * 3600_000)
  const current = await getVault(sessionId, workspaceId)
  const existing = current?.sealedUntil ? new Date(current.sealedUntil).getTime() : 0
  const sealedUntil = existing > until.getTime() ? new Date(existing) : until
  await db.update(coinVaults).set({ sealedUntil, note: note.slice(0, 200), updatedAt: new Date() }).where(eq(coinVaults.sessionId, sessionId))
  return getVault(sessionId, workspaceId)
}

// Arm the softer 12h "asleep / logged-out" guard on the shared wallet.
export async function armSoftLock(sessionId: string, workspaceId = DEFAULT_WORKSPACE) {
  await getVault(sessionId, workspaceId)
  const softLockUntil = new Date(Date.now() + 12 * 3600_000)
  await db.update(coinVaults).set({ softLockUntil, updatedAt: new Date() }).where(eq(coinVaults.sessionId, sessionId))
  return getVault(sessionId, workspaceId)
}

// Lift the soft guard — only the present owner does this (a sleeping account can't).
export async function liftSoftLock(sessionId: string, workspaceId = DEFAULT_WORKSPACE) {
  await getVault(sessionId, workspaceId)
  await db.update(coinVaults).set({ softLockUntil: null, updatedAt: new Date() }).where(eq(coinVaults.sessionId, sessionId))
  return getVault(sessionId, workspaceId)
}

// Workspace-wide rollup: total minted of each coin, row counts, and how the
// minting splits by source. Powers the AccountantClaw economy dashboard.
export async function economySummary(workspaceId = DEFAULT_WORKSPACE) {
  const totals = { silver: 0, gold: 0 }
  const counts = { silver: 0, gold: 0 }
  const bySource: Record<string, number> = {}
  let accounts = 0
  try {
    const rows = await db
      .select({
        coin: coinLedger.coin,
        source: coinLedger.source,
        total: sql<number>`coalesce(sum(${coinLedger.amountMilli}), 0)`,
        rows: sql<number>`count(*)`,
      })
      .from(coinLedger)
      .where(eq(coinLedger.workspaceId, workspaceId))
      .groupBy(coinLedger.coin, coinLedger.source)
    for (const r of rows) {
      const t = Number(r.total) || 0
      if (r.coin === 'silver') {
        totals.silver += t
        counts.silver += Number(r.rows) || 0
      }
      if (r.coin === 'gold') {
        totals.gold += t
        counts.gold += Number(r.rows) || 0
      }
      bySource[r.source] = (bySource[r.source] || 0) + t
    }
    const [acc] = await db
      .select({ n: sql<number>`count(distinct ${coinLedger.sessionId})` })
      .from(coinLedger)
      .where(sql`${coinLedger.workspaceId} = ${workspaceId} and ${coinLedger.sessionId} <> ''`)
    accounts = Number(acc?.n) || 0
  } catch {
    /* ignore */
  }
  return { totals, counts, bySource, accounts }
}

// ── CVC · CharacterVerse Coins — the chat-inference gas coin ─────────────────
//
// CVC is usage, not value. It rides the same coin_ledger as every other coin:
// grants are positive rows and inference spends are negative ones, so a balance
// is still just the sum of the account's rows. No extra table needed.
//
// Everything here is best-effort and non-throwing. Metering a chat must never
// block or delay a reply — if the ledger hiccups, the reply still ships.

/** Spend (burn) CVC gas. Writes a NEGATIVE ledger row. Never throws. */
export async function spendCvc(input: {
  sessionId: string
  characterId?: number | null
  amountMilli: number
  source?: string
  reason?: string
  refType?: string
  refId?: number | null
  workspaceId?: string
}) {
  const amount = Math.round(input.amountMilli)
  if (!input.sessionId || !amount || amount <= 0) return null
  try {
    const [row] = await db
      .insert(coinLedger)
      .values({
        workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE,
        sessionId: input.sessionId,
        characterId: input.characterId ?? null,
        coin: 'cvc',
        amountMilli: -amount,
        source: input.source ?? 'chat_inference',
        reason: input.reason ?? 'Chat inference',
        refType: input.refType ?? '',
        refId: input.refId ?? null,
      })
      .returning()
    return row
  } catch {
    return null
  }
}

/** Total CVC an account has ever been granted (positive rows only). */
async function cvcGrantedMilli(sessionId: string, workspaceId = DEFAULT_WORKSPACE) {
  try {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${coinLedger.amountMilli}), 0)` })
      .from(coinLedger)
      .where(
        sql`${coinLedger.sessionId} = ${sessionId} and ${coinLedger.workspaceId} = ${workspaceId} and ${coinLedger.coin} = 'cvc' and ${coinLedger.amountMilli} > 0`,
      )
    return Number(row?.total) || 0
  } catch {
    return 0
  }
}

/**
 * Grant the one-off starter gas the first time an account chats, so it always
 * has CVC to begin with. Idempotent by construction: an account that has ever
 * been granted CVC is never granted the welcome balance again.
 */
export async function ensureCvcWelcome(sessionId: string, workspaceId = DEFAULT_WORKSPACE) {
  if (!sessionId) return { granted: false, amountMilli: 0 }
  try {
    const settings = await ensureCoinSettings(workspaceId)
    const amountMilli = Math.max(0, settings?.cvcWelcomeMilli ?? CVC_WELCOME_MILLI)
    if (!amountMilli) return { granted: false, amountMilli: 0 }
    if ((await cvcGrantedMilli(sessionId, workspaceId)) > 0) return { granted: false, amountMilli: 0 }
    await mintCoins({
      sessionId,
      coin: 'cvc',
      amountMilli,
      source: 'cvc_welcome',
      reason: 'Welcome gas — starter CVC balance',
      refType: 'cvc_welcome',
      workspaceId,
    })
    return { granted: true, amountMilli }
  } catch {
    return { granted: false, amountMilli: 0 }
  }
}

/**
 * Meter one character reply: make sure the account has its starter gas, then
 * burn the per-reply cost. Entirely best-effort — callers fire and forget.
 */
export async function meterChatInference(input: {
  sessionId: string
  characterId?: number | null
  characterName?: string
  conversationId?: number | null
  workspaceId?: string
}) {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE
  if (!input.sessionId) return null
  try {
    await ensureCvcWelcome(input.sessionId, workspaceId)
    const settings = await ensureCoinSettings(workspaceId)
    const cost = Math.max(0, settings?.cvcPerReplyMilli ?? CVC_PER_REPLY_MILLI)
    if (!cost) return null
    return await spendCvc({
      sessionId: input.sessionId,
      characterId: input.characterId ?? null,
      amountMilli: cost,
      source: 'chat_inference',
      reason: input.characterName ? `${input.characterName} — chat inference` : 'Chat inference',
      refType: 'conversation',
      refId: input.conversationId ?? null,
      workspaceId,
    })
  } catch {
    return null
  }
}

/**
 * Workspace-wide CVC rollup: how much gas has been issued versus burned on
 * inference. Powers AccountantClaw's CharacterVerse Coin panel.
 */
export async function cvcSummary(workspaceId = DEFAULT_WORKSPACE) {
  const out = { issuedMilli: 0, burnedMilli: 0, outstandingMilli: 0, grants: 0, spends: 0, accounts: 0 }
  try {
    const rows = await db
      .select({
        positive: sql<number>`coalesce(sum(case when ${coinLedger.amountMilli} > 0 then ${coinLedger.amountMilli} else 0 end), 0)`,
        negative: sql<number>`coalesce(sum(case when ${coinLedger.amountMilli} < 0 then -${coinLedger.amountMilli} else 0 end), 0)`,
        grants: sql<number>`count(case when ${coinLedger.amountMilli} > 0 then 1 end)`,
        spends: sql<number>`count(case when ${coinLedger.amountMilli} < 0 then 1 end)`,
        accounts: sql<number>`count(distinct ${coinLedger.sessionId})`,
      })
      .from(coinLedger)
      .where(sql`${coinLedger.workspaceId} = ${workspaceId} and ${coinLedger.coin} = 'cvc'`)
    const r = rows[0]
    out.issuedMilli = Number(r?.positive) || 0
    out.burnedMilli = Number(r?.negative) || 0
    out.grants = Number(r?.grants) || 0
    out.spends = Number(r?.spends) || 0
    out.accounts = Number(r?.accounts) || 0
    out.outstandingMilli = out.issuedMilli - out.burnedMilli
  } catch {
    /* ignore — zeros are a fine empty state */
  }
  return out
}
