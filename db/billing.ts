import { db } from './index.js'
import { planSubscriptions } from './schema.js'
import { eq, and, ne } from 'drizzle-orm'
import { mintCoins, DEFAULT_WORKSPACE } from './coins.js'

// Billing — the server side of managed-agent hosting plans.
//
// One subscription row per account. The plan catalogue (prices, specs, the
// monthly grant) lives in src/lib/plans.ts and is passed in by the caller, so
// this module never holds a second copy of the pricing.
//
// The monthly grant is minted through the same coin-ledger helpers the rest of
// the app already uses to award coins, so plan grants land in the same wallet
// balances as everything else — no parallel accounting. It is idempotent by
// construction: `last_grant_month` records the calendar month last minted, and
// the grant is claimed with a single conditional UPDATE guarded on
// `last_grant_month <> month`. Postgres either stamps the row (and returns it)
// or matches nothing, so only the caller that wins the claim mints. Subscribing,
// switching plans and collecting by hand therefore all converge on "exactly
// once per calendar month".
//
// Every read is best-effort: before the plan_subscriptions table is provisioned
// these helpers report an empty state rather than throwing, so the billing page
// renders on a fresh branch and starts working the moment the migration lands.

export type PlanGrantAmounts = { silver: number; gold: number; cvc: number }

export type Subscription = {
  plan: string
  cycle: string
  machineSize: string
  status: string
  lastGrantMonth: string
  createdAt: string | null
  updatedAt: string | null
}

function shape(row: any): Subscription {
  return {
    plan: row.plan,
    cycle: row.cycle,
    machineSize: row.machineSize || '',
    status: row.status,
    lastGrantMonth: row.lastGrantMonth || '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  }
}

/** The account's subscription, or null when it has none (or the table is not yet provisioned). */
export async function getSubscription(
  sessionId: string,
  workspaceId = DEFAULT_WORKSPACE,
): Promise<Subscription | null> {
  if (!sessionId) return null
  try {
    const [row] = await db
      .select()
      .from(planSubscriptions)
      .where(and(eq(planSubscriptions.sessionId, sessionId), eq(planSubscriptions.workspaceId, workspaceId)))
    return row ? shape(row) : null
  } catch {
    return null
  }
}

/** Record (or switch to) a plan. Reactivates a cancelled subscription. */
export async function setSubscription(input: {
  sessionId: string
  plan: string
  cycle: string
  machineSize?: string
  workspaceId?: string
}): Promise<Subscription | null> {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE
  if (!input.sessionId) return null
  const cycle = input.cycle === 'yearly' ? 'yearly' : 'monthly'
  const machineSize = (input.machineSize || '').slice(0, 40)
  try {
    await db
      .insert(planSubscriptions)
      .values({ workspaceId, sessionId: input.sessionId, plan: input.plan, cycle, machineSize, status: 'active' })
      .onConflictDoUpdate({
        target: planSubscriptions.sessionId,
        set: { plan: input.plan, cycle, machineSize, status: 'active', updatedAt: new Date() },
      })
    return getSubscription(input.sessionId, workspaceId)
  } catch {
    return null
  }
}

/** Cancel a subscription. The coins already minted stay in the wallet. */
export async function cancelSubscription(
  sessionId: string,
  workspaceId = DEFAULT_WORKSPACE,
): Promise<Subscription | null> {
  if (!sessionId) return null
  try {
    await db
      .update(planSubscriptions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(planSubscriptions.sessionId, sessionId), eq(planSubscriptions.workspaceId, workspaceId)))
    return getSubscription(sessionId, workspaceId)
  } catch {
    return null
  }
}

/**
 * Mint this calendar month's plan grant, exactly once.
 *
 * Claims the month with a conditional UPDATE (`last_grant_month <> month`) and
 * only mints if the claim landed, so the grant can never be double-collected.
 */
export async function collectMonthlyGrant(input: {
  sessionId: string
  month: string
  grant: PlanGrantAmounts
  planName: string
  workspaceId?: string
}): Promise<{ granted: boolean; grant?: PlanGrantAmounts }> {
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE
  if (!input.sessionId || !input.month) return { granted: false }
  let claimed = false
  try {
    const rows = await db
      .update(planSubscriptions)
      .set({ lastGrantMonth: input.month, updatedAt: new Date() })
      .where(
        and(
          eq(planSubscriptions.sessionId, input.sessionId),
          eq(planSubscriptions.workspaceId, workspaceId),
          eq(planSubscriptions.status, 'active'),
          // The idempotency guard — nothing matches once this month is stamped.
          ne(planSubscriptions.lastGrantMonth, input.month),
        ),
      )
      .returning({ id: planSubscriptions.id })
    claimed = rows.length > 0
  } catch {
    return { granted: false }
  }
  if (!claimed) return { granted: false }

  const reason = `${input.planName} plan — monthly grant ${input.month}`
  await Promise.all([
    mintCoins({
      sessionId: input.sessionId,
      coin: 'silver',
      coins: input.grant.silver,
      source: 'plan_grant',
      reason,
      refType: 'plan_grant',
      workspaceId,
    }),
    mintCoins({
      sessionId: input.sessionId,
      coin: 'gold',
      coins: input.grant.gold,
      source: 'plan_grant',
      reason,
      refType: 'plan_grant',
      workspaceId,
    }),
    mintCoins({
      sessionId: input.sessionId,
      coin: 'cvc',
      coins: input.grant.cvc,
      source: 'plan_grant',
      reason: `${input.planName} plan — monthly inference gas ${input.month}`,
      refType: 'plan_grant',
      workspaceId,
    }),
  ])
  return { granted: true, grant: input.grant }
}
