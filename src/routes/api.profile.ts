import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import {
  characters,
  characterStats,
  conversations,
  messages,
  coinLedger,
  enterpriseSettings,
} from '../../db/schema.js'
import { eq, sql, desc, and, inArray } from 'drizzle-orm'
import { balancesFor, ensureCoinSettings, cvcSummary, DEFAULT_WORKSPACE } from '../../db/coins.js'
import { getSubscription } from '../../db/billing.js'
import { coerceSettings, coerceCvcSettings, gbpFromMilli, ALL_COIN_KEYS, basePriceOf } from '../lib/coins.js'
import { creditsFor } from '../lib/credits.js'

// The Profile API — one lens over everything an account has already done.
//
//   GET /api/profile?sessionId=S
//     → wallet (all three currencies), headline stats, per-character
//       performance, the coin activity feed, the org block for the business
//       deck, and the live assist queue for the staff console.
//
// Nothing new is recorded to power a profile: every number here is derived from
// records the account already produced — its characters, their conversations and
// messages, and its rows in the coin ledger. That is the whole idea: a profile
// is a view, not a new kind of data.

type CharacterPerf = {
  id: number
  name: string
  avatar: string
  category: string
  isPublic: boolean
  isPrivate: boolean
  chats: number
  msgs: number
  conversations: number
  credits: number
}

export const Route = createFileRoute('/api/profile')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 80)

        // A profile is a read-only lens, so every lookup below is best-effort:
        // if a table is not provisioned yet (or the coin layer is briefly
        // unavailable) the page renders an honest empty state instead of an
        // error. The coercers fall back to defaults on a null row.
        let settingsRow: any = null
        try {
          settingsRow = await ensureCoinSettings(workspaceId)
        } catch {
          /* defaults are fine */
        }
        const settings = coerceSettings(settingsRow)
        const cvcSettings = coerceCvcSettings(settingsRow)

        // ── Wallet — the monetization coins plus the gas coin ────────────────
        let balances: Record<string, number> = {}
        if (sessionId) {
          try {
            balances = (await balancesFor(sessionId, workspaceId)) as any
          } catch {
            balances = {}
          }
        }
        const coins = ALL_COIN_KEYS.map((coin) => {
          const milli = (balances as any)[coin] || 0
          const price =
            coin === 'silver' ? settings.silverPrice : coin === 'gold' ? settings.goldPrice : basePriceOf(coin)
          return { coin, milli, price, gbp: gbpFromMilli(milli, price) }
        })
        const earningsGbp = coins.reduce((s, c) => s + c.gbp, 0)

        // CVC is usage, not value: it has no price and is never folded into the
        // £ figure above. Its balance is issued-minus-burned, so surface both.
        const cvcMilli = (balances as any).cvc || 0
        let cvcSpentMilli = 0
        let cvcGrantedMilli = 0
        if (sessionId) {
          try {
            const [row] = await db
              .select({
                granted: sql<number>`coalesce(sum(case when ${coinLedger.amountMilli} > 0 then ${coinLedger.amountMilli} else 0 end), 0)`,
                spent: sql<number>`coalesce(sum(case when ${coinLedger.amountMilli} < 0 then -${coinLedger.amountMilli} else 0 end), 0)`,
              })
              .from(coinLedger)
              .where(
                sql`${coinLedger.sessionId} = ${sessionId} and ${coinLedger.workspaceId} = ${workspaceId} and ${coinLedger.coin} = 'cvc'`,
              )
            cvcGrantedMilli = Number(row?.granted) || 0
            cvcSpentMilli = Number(row?.spent) || 0
          } catch {
            /* ignore */
          }
        }

        // ── The account's characters and how each is performing ──────────────
        let mine: any[] = []
        if (sessionId) {
          try {
            mine = await db
              .select()
              .from(characters)
              .where(eq(characters.creatorSession, sessionId))
              .orderBy(desc(characters.totalChats))
              .limit(60)
          } catch {
            mine = []
          }
        }
        const ids = mine.map((c) => c.id)

        const statsById = new Map<number, any>()
        const convoCountById = new Map<number, number>()
        const msgCountById = new Map<number, number>()
        if (ids.length) {
          try {
            const rows = await db.select().from(characterStats).where(inArray(characterStats.characterId, ids))
            for (const r of rows) statsById.set(r.characterId, r)
          } catch {
            /* ignore */
          }
          try {
            const rows = await db
              .select({ characterId: conversations.characterId, n: sql<number>`count(*)` })
              .from(conversations)
              .where(inArray(conversations.characterId, ids))
              .groupBy(conversations.characterId)
            for (const r of rows) convoCountById.set(r.characterId, Number(r.n) || 0)
          } catch {
            /* ignore */
          }
          try {
            const rows = await db
              .select({ characterId: conversations.characterId, n: sql<number>`count(${messages.id})` })
              .from(conversations)
              .leftJoin(messages, eq(messages.conversationId, conversations.id))
              .where(inArray(conversations.characterId, ids))
              .groupBy(conversations.characterId)
            for (const r of rows) msgCountById.set(r.characterId, Number(r.n) || 0)
          } catch {
            /* ignore */
          }
        }

        const myCharacters: CharacterPerf[] = mine.map((c) => {
          const st = statsById.get(c.id)
          const breakdown = st ? creditsFor(st) : null
          return {
            id: c.id,
            name: c.name,
            avatar: c.avatar,
            category: c.category,
            isPublic: c.isPublic,
            isPrivate: !!st?.isPrivate,
            chats: c.totalChats || 0,
            msgs: breakdown?.totalMsgs || msgCountById.get(c.id) || 0,
            conversations: convoCountById.get(c.id) || 0,
            credits: breakdown?.total || 0,
          }
        })

        // ── Headline stats ───────────────────────────────────────────────────
        // "Live conversations" counts every conversation ever opened against
        // this account's characters — the rooms its work keeps alive.
        const totalChats = myCharacters.reduce((s, c) => s + c.chats, 0)
        const totalMsgs = myCharacters.reduce((s, c) => s + c.msgs, 0)
        const liveConversations = myCharacters.reduce((s, c) => s + c.conversations, 0)
        const totalCredits = myCharacters.reduce((s, c) => s + c.credits, 0)

        // ── Coin activity feed — CC earned and CVC spent, newest first ───────
        let activity: any[] = []
        if (sessionId) {
          try {
            activity = await db
              .select()
              .from(coinLedger)
              .where(and(eq(coinLedger.workspaceId, workspaceId), eq(coinLedger.sessionId, sessionId)))
              .orderBy(desc(coinLedger.createdAt))
              .limit(40)
          } catch {
            activity = []
          }
        }

        // ── Org block for the business deck ──────────────────────────────────
        let org = { orgName: 'Your Organization', seats: 100 }
        try {
          const [row] = await db
            .select()
            .from(enterpriseSettings)
            .where(eq(enterpriseSettings.workspaceId, workspaceId))
          if (row) org = { orgName: row.orgName, seats: row.seats }
        } catch {
          /* defaults are fine */
        }

        // ── Live assist queue for the staff console ──────────────────────────
        // The active rooms a staff member could step into: the account's
        // characters, ranked by how much traffic they are carrying right now.
        const assistQueue = myCharacters
          .filter((c) => c.conversations > 0 || c.chats > 0)
          .slice(0, 12)
          .map((c) => ({
            characterId: c.id,
            name: c.name,
            avatar: c.avatar,
            conversations: c.conversations,
            chats: c.chats,
          }))

        let gasSummary = { issuedMilli: 0, burnedMilli: 0, outstandingMilli: 0, grants: 0, spends: 0, accounts: 0 }
        try {
          gasSummary = await cvcSummary(workspaceId)
        } catch {
          /* zeros are fine */
        }
        const subscription = sessionId ? await getSubscription(sessionId, workspaceId) : null

        return Response.json({
          sessionId,
          wallet: {
            coins,
            earningsGbp,
            cvc: {
              milli: cvcMilli,
              grantedMilli: cvcGrantedMilli,
              spentMilli: cvcSpentMilli,
              perReplyMilli: cvcSettings.cvcPerReplyMilli,
              welcomeMilli: cvcSettings.cvcWelcomeMilli,
            },
          },
          stats: {
            charactersCreated: myCharacters.length,
            totalChats,
            totalMsgs,
            liveConversations,
            totalCredits,
            earningsGbp,
          },
          myCharacters,
          activity,
          org,
          assistQueue,
          gasSummary,
          subscription,
          settings,
        })
      },
    },
  },
})
