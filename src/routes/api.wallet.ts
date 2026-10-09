import { createFileRoute } from '@tanstack/react-router'
import {
  balancesFor, leaderboardFor, getVault, sealVault, armSoftLock, liftSoftLock,
  ensureCoinSettings, DEFAULT_WORKSPACE,
} from '../../db/coins.js'
import {
  ALL_COIN_KEYS, basePriceOf, gbpFromMilli, coerceCvcSettings, type AnyCoin,
} from '../lib/coins.js'

// The shared wallet, the cryptographic vault, and the per-coin leaderboards.
//
//   GET  /api/wallet?sessionId=S          → all balances + £ values + vault status
//   GET  /api/wallet?board=<coin>&sessionId=S → the leaderboard for one coin
//   POST /api/wallet { action, sessionId }
//     'seal'      { hours, note }  → hard agentic time-lock the vault
//     'armSoft'                    → arm the 12h asleep/logged-out soft guard
//     'liftSoft'                   → lift it (present owner only)
//
// Sessions are anonymous; a leaderboard row carries a short derived tag, and the
// caller's own row is flagged so a member can see their rank without a login.

function vaultStatus(row: any) {
  const now = Date.now()
  const sealed = !!(row?.sealedUntil && new Date(row.sealedUntil).getTime() > now)
  const softLocked = !!(row?.softLockUntil && new Date(row.softLockUntil).getTime() > now)
  return {
    sealed,
    softLocked,
    sealedUntil: sealed ? row.sealedUntil : null,
    softLockUntil: softLocked ? row.softLockUntil : null,
    note: row?.note || '',
  }
}

function tagFor(sessionId: string): string {
  const tail = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'XXXX'
  return `anon·${tail}`
}

export const Route = createFileRoute('/api/wallet')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 80)
        const board = (url.searchParams.get('board') || '').toLowerCase()

        // Per-coin leaderboard.
        if (board) {
          if (!ALL_COIN_KEYS.includes(board as AnyCoin)) return Response.json({ error: 'Unknown coin' }, { status: 400 })
          const coin = board as AnyCoin
          const price = basePriceOf(coin)
          const raw = await leaderboardFor(coin, workspaceId)
          const rows = raw.map((r, i) => ({
            rank: i + 1,
            tag: tagFor(r.sessionId),
            isYou: !!sessionId && r.sessionId === sessionId,
            total: r.total,
            events: r.events,
            gbp: gbpFromMilli(r.total, price),
          }))
          const totalMilli = raw.reduce((s, r) => s + r.total, 0)
          return Response.json({
            coin,
            rows,
            totals: { minted: totalMilli, gbp: gbpFromMilli(totalMilli, price), accounts: raw.length },
          })
        }

        // The wallet.
        const balances = sessionId ? await balancesFor(sessionId, workspaceId) : {}
        const coins = ALL_COIN_KEYS.map((coin) => {
          const milli = (balances as any)[coin] || 0
          const price = basePriceOf(coin)
          return { coin, milli, price, gbp: gbpFromMilli(milli, price) }
        })
        const totalGbp = coins.reduce((s, c) => s + c.gbp, 0)
        const vaultRow = sessionId ? await getVault(sessionId, workspaceId) : null

        // CVC — the chat-inference gas — is reported alongside the wallet but
        // deliberately outside `coins` and `totalGbp`. It measures usage, not
        // value, so it must never move the £ figure.
        const cvcSettings = coerceCvcSettings(await ensureCoinSettings(workspaceId))
        const cvc = {
          milli: (balances as any).cvc || 0,
          perReplyMilli: cvcSettings.cvcPerReplyMilli,
          welcomeMilli: cvcSettings.cvcWelcomeMilli,
        }

        return Response.json({ coins, totalGbp, cvc, vault: vaultStatus(vaultRow) })
      },

      POST: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const body = await request.json().catch(() => null)
        const sessionId = String(body?.sessionId || '').trim().slice(0, 80)
        if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })
        const action = String(body?.action || '')

        let row
        if (action === 'seal') {
          row = await sealVault(sessionId, Number(body?.hours) || 12, String(body?.note || ''), workspaceId)
        } else if (action === 'armSoft') {
          row = await armSoftLock(sessionId, workspaceId)
        } else if (action === 'liftSoft') {
          row = await liftSoftLock(sessionId, workspaceId)
        } else {
          return Response.json({ error: 'Unknown action' }, { status: 400 })
        }
        return Response.json({ vault: vaultStatus(row) })
      },
    },
  },
})
