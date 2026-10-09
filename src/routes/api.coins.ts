import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../db/index.js'
import { coinSettings, coinLedger, askBonusGrants } from '../../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import {
  ensureCoinSettings,
  economySummary,
  balancesFor,
  mintCoins,
  cvcSummary,
  DEFAULT_WORKSPACE,
} from '../../db/coins.js'
import { coerceSettings, coerceCvcSettings, COINS } from '../lib/coins.js'

// CharacterVerse Coins API — the two-coin economy's data plane.
//
//   GET  /api/coins                       → settings + workspace economy summary
//   GET  /api/coins?sessionId=S           → also include that account's balances
//   GET  /api/coins?ledger=1&sessionId=S  → recent ledger rows (account or global)
//   POST /api/coins  { action }
//     'updateSettings'  → AccountantClaw saves prices/rates/askBonus/mode
//     'setPrice'        → raise/lower one coin's live price (clamped to base floor)
//     'claimAskBonus'   → grant the one-off fractional Silver bonus to an account
//     'mint'            → admin manual grant (testing / promotions)
//     'updateCvc'       → save the CVC gas economics + AccountantClaw's privilege
//     'mintCvc'         → AccountantClaw mints fresh CVC into an account
//                         (blocked whenever the privilege is revoked)
//
// Prices are clamped to their base floor server-side (coerceSettings), so the
// fixed rate — Silver £0.001, Gold £0.01 — can never be undercut.

export const Route = createFileRoute('/api/coins')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 80)

        const settingsRow = await ensureCoinSettings(workspaceId)
        const settings = coerceSettings(settingsRow)
        const cvc = coerceCvcSettings(settingsRow)

        // Ledger feed (account-scoped if a session is given, else global recent).
        if (url.searchParams.get('ledger')) {
          const where = sessionId
            ? and(eq(coinLedger.workspaceId, workspaceId), eq(coinLedger.sessionId, sessionId))
            : eq(coinLedger.workspaceId, workspaceId)
          const rows = await db
            .select()
            .from(coinLedger)
            .where(where)
            .orderBy(desc(coinLedger.createdAt))
            .limit(40)
          return Response.json({ ledger: rows })
        }

        const summary = await economySummary(workspaceId)
        const balances = sessionId ? await balancesFor(sessionId, workspaceId) : null
        const askClaimed = sessionId
          ? !!(
              await db
                .select({ id: askBonusGrants.id })
                .from(askBonusGrants)
                .where(
                  and(eq(askBonusGrants.workspaceId, workspaceId), eq(askBonusGrants.sessionId, sessionId)),
                )
            ).length
          : false

        // CVC is the usage coin: reported separately so it can never be folded
        // into the monetization coins' market value.
        const gas = await cvcSummary(workspaceId)

        return Response.json({ settings, cvc, gas, summary, balances, askClaimed })
      },

      POST: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const action = String(body.action || '')
        await ensureCoinSettings(workspaceId)

        switch (action) {
          // AccountantClaw saves the full settings block (prices, rates, bonus, mode).
          case 'updateSettings': {
            const next = coerceSettings(body.settings ?? body)
            await db
              .update(coinSettings)
              .set({
                silverPrice: next.silverPrice,
                goldPrice: next.goldPrice,
                silverRates: next.silverRates,
                goldRates: next.goldRates,
                askBonusMilli: next.askBonusMilli,
                pricingMode: next.pricingMode,
                notes: next.notes,
                updatedAt: new Date(),
              })
              .where(eq(coinSettings.workspaceId, workspaceId))
            return Response.json({ settings: next })
          }

          // Raise/lower one coin's live price; clamped to its base floor.
          case 'setPrice': {
            const coin = body.coin === 'gold' ? 'gold' : 'silver'
            const floor = COINS[coin].basePrice
            const price = Math.min(1_000_000, Math.max(floor, Math.floor(Number(body.price)) || floor))
            await db
              .update(coinSettings)
              .set({
                ...(coin === 'gold' ? { goldPrice: price } : { silverPrice: price }),
                updatedAt: new Date(),
              })
              .where(eq(coinSettings.workspaceId, workspaceId))
            const [row] = await db
              .select()
              .from(coinSettings)
              .where(eq(coinSettings.workspaceId, workspaceId))
            return Response.json({ settings: coerceSettings(row) })
          }

          // One-off fractional Silver bonus per account (Ask page welcome task).
          case 'claimAskBonus': {
            const sessionId = String(body.sessionId || '').trim().slice(0, 80)
            if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 })
            const [settingsRow] = await db
              .select()
              .from(coinSettings)
              .where(eq(coinSettings.workspaceId, workspaceId))
            const amountMilli = Math.max(0, settingsRow?.askBonusMilli ?? 500)
            const task = String(body.task || 'Ask welcome task').slice(0, 200)

            // The unique sessionId makes the grant idempotent: a second claim hits
            // the conflict and mints nothing.
            try {
              const inserted = await db
                .insert(askBonusGrants)
                .values({ workspaceId, sessionId, amountMilli, task })
                .onConflictDoNothing({ target: askBonusGrants.sessionId })
                .returning()
              if (inserted.length) {
                await mintCoins({
                  sessionId,
                  coin: 'silver',
                  amountMilli,
                  source: 'ask_bonus',
                  reason: task,
                  refType: 'ask_bonus',
                  refId: inserted[0].id,
                  workspaceId,
                })
                const balances = await balancesFor(sessionId, workspaceId)
                return Response.json({ granted: true, amountMilli, balances })
              }
            } catch {
              /* fall through to already-claimed */
            }
            const balances = await balancesFor(sessionId, workspaceId)
            return Response.json({ granted: false, alreadyClaimed: true, balances })
          }

          // Admin manual mint (promotions / testing).
          case 'mint': {
            const sessionId = String(body.sessionId || '').trim().slice(0, 80)
            const coin = body.coin === 'gold' ? 'gold' : 'silver'
            const coins = Math.max(0, Math.min(10_000, Number(body.coins) || 0))
            if (!sessionId || !coins) {
              return Response.json({ error: 'sessionId and coins are required' }, { status: 400 })
            }
            await mintCoins({
              sessionId,
              coin,
              coins,
              source: 'admin',
              reason: String(body.reason || 'Admin grant').slice(0, 200),
              refType: 'admin',
              workspaceId,
            })
            const balances = await balancesFor(sessionId, workspaceId)
            return Response.json({ minted: true, balances })
          }

          // AccountantClaw saves the CVC gas economics and its own privilege.
          case 'updateCvc': {
            const next = coerceCvcSettings(body.cvc ?? body)
            await db
              .update(coinSettings)
              .set({
                cvcPerReplyMilli: next.cvcPerReplyMilli,
                cvcWelcomeMilli: next.cvcWelcomeMilli,
                accountantCanMintCvc: next.accountantCanMintCvc,
                updatedAt: new Date(),
              })
              .where(eq(coinSettings.workspaceId, workspaceId))
            return Response.json({ cvc: next, gas: await cvcSummary(workspaceId) })
          }

          // AccountantClaw mints fresh CVC straight into an account. The
          // privilege is checked server-side, so a revoked privilege blocks
          // minting no matter who calls.
          case 'mintCvc': {
            const [settingsRow] = await db
              .select()
              .from(coinSettings)
              .where(eq(coinSettings.workspaceId, workspaceId))
            const cvc = coerceCvcSettings(settingsRow)
            if (!cvc.accountantCanMintCvc) {
              return Response.json(
                { error: "AccountantClaw's CVC minting privilege is revoked." },
                { status: 403 },
              )
            }
            const sessionId = String(body.sessionId || '').trim().slice(0, 80)
            const coins = Math.max(0, Math.min(10_000_000, Math.floor(Number(body.coins)) || 0))
            if (!sessionId || !coins) {
              return Response.json({ error: 'sessionId and coins are required' }, { status: 400 })
            }
            await mintCoins({
              sessionId,
              coin: 'cvc',
              coins,
              source: 'cvc_mint',
              reason: String(body.reason || 'AccountantClaw minted CVC').slice(0, 200),
              refType: 'cvc_mint',
              workspaceId,
            })
            const balances = await balancesFor(sessionId, workspaceId)
            return Response.json({ minted: true, coins, balances, gas: await cvcSummary(workspaceId) })
          }

          default:
            return Response.json({ error: 'Unknown action' }, { status: 400 })
        }
      },
    },
  },
})
