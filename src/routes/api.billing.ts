import { createFileRoute } from '@tanstack/react-router'
import { DEFAULT_WORKSPACE, balancesFor } from '../../db/coins.js'
import {
  getSubscription,
  setSubscription,
  cancelSubscription,
  collectMonthlyGrant,
} from '../../db/billing.js'
import { findPlan, monthKey, PLANS } from '../lib/plans.js'

// Billing & Plans API — managed-agent hosting subscriptions.
//
//   GET  /api/billing?sessionId=S
//     → { subscription, balances, month, grantDue }
//   POST /api/billing { action, sessionId, ... }
//     'subscribe' { plan, cycle, machineSize } → record the plan and mint this
//                                                month's grant immediately
//     'collect'                                → mint the new month's grant
//     'cancel'                                 → stop future billing
//
// The grant is minted through the shared coin-ledger helpers, so it lands in
// the same wallet as every other coin the account holds. It is idempotent per
// calendar month, which is why subscribing, switching plans and collecting by
// hand can all safely trigger it.
//
// Everything is best-effort: before the plan_subscriptions table is provisioned
// the endpoints report an empty state rather than erroring, so the page renders
// and starts working the moment the platform applies the migration on deploy.

function grantIsDue(sub: { status: string; lastGrantMonth: string } | null, month: string) {
  return !!sub && sub.status === 'active' && sub.lastGrantMonth !== month
}

export const Route = createFileRoute('/api/billing')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)
        const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 80)
        const month = monthKey()

        const subscription = sessionId ? await getSubscription(sessionId, workspaceId) : null
        const balances = sessionId ? await balancesFor(sessionId, workspaceId) : {}

        return Response.json({
          subscription,
          balances,
          month,
          grantDue: grantIsDue(subscription, month),
        })
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

        const sessionId = String(body.sessionId || '').trim().slice(0, 80)
        if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 })
        const action = String(body.action || '')
        const month = monthKey()

        switch (action) {
          case 'subscribe': {
            const plan = findPlan(String(body.plan || ''))
            if (!plan) {
              return Response.json({ error: 'Unknown plan' }, { status: 400 })
            }
            const machineSize =
              plan.machineSizes && plan.machineSizes.includes(String(body.machineSize))
                ? String(body.machineSize)
                : plan.machineSizes?.[0] || ''
            const subscription = await setSubscription({
              sessionId,
              plan: plan.key,
              cycle: String(body.cycle || 'monthly'),
              machineSize,
              workspaceId,
            })
            if (!subscription) {
              return Response.json(
                { error: 'Billing is not provisioned yet — it activates on the next deploy.' },
                { status: 503 },
              )
            }
            // Mint this month's grant straight away (idempotent per month).
            const result = await collectMonthlyGrant({
              sessionId,
              month,
              grant: plan.grant,
              planName: plan.name,
              workspaceId,
            })
            const fresh = await getSubscription(sessionId, workspaceId)
            const balances = await balancesFor(sessionId, workspaceId)
            return Response.json({
              subscription: fresh,
              balances,
              month,
              granted: result.granted,
              grant: result.grant ?? null,
              grantDue: grantIsDue(fresh, month),
            })
          }

          case 'collect': {
            const sub = await getSubscription(sessionId, workspaceId)
            if (!sub || sub.status !== 'active') {
              return Response.json({ error: 'No active plan to collect for.' }, { status: 400 })
            }
            const plan = findPlan(sub.plan)
            if (!plan) return Response.json({ error: 'Unknown plan' }, { status: 400 })
            const result = await collectMonthlyGrant({
              sessionId,
              month,
              grant: plan.grant,
              planName: plan.name,
              workspaceId,
            })
            const fresh = await getSubscription(sessionId, workspaceId)
            const balances = await balancesFor(sessionId, workspaceId)
            return Response.json({
              subscription: fresh,
              balances,
              month,
              granted: result.granted,
              grant: result.grant ?? null,
              grantDue: grantIsDue(fresh, month),
            })
          }

          case 'cancel': {
            const subscription = await cancelSubscription(sessionId, workspaceId)
            const balances = await balancesFor(sessionId, workspaceId)
            return Response.json({ subscription, balances, month, grantDue: false })
          }

          case 'plans':
            return Response.json({ plans: PLANS })

          default:
            return Response.json({ error: 'Unknown action' }, { status: 400 })
        }
      },
    },
  },
})
