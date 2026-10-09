// Managed-agent hosting plans — the single source of truth for CharacterVerse
// billing. Prices, compute specs, feature checklists and the recurring wallet
// grant all live here, and both the pricing page and the server import this
// module so the two can never drift apart.
//
// The "extra AI credits" a hosting plan would normally hand out is expressed in
// CharacterVerse's own economy instead: every plan mints a real monthly grant
// into the subscriber's wallet — 100 Silver CC + 100 Gold CC, plus a
// tier-scaling amount of CVC inference gas. Gold is otherwise only earned by
// training characters, so the Gold half of the grant is a genuine perk: a
// subscription is the only other way to mint it.
//
// Pure module: no DB, no DOM. Safe to import from a route component or an API
// handler.

export type PlanKey = 'lite' | 'pro' | 'max' | 'ultra' | 'enterprise'

export type PlanSpecs = {
  cores: string
  ram: string
  ssd: string
}

export type PlanGrant = {
  /** Whole Silver CC minted per calendar month. */
  silver: number
  /** Whole Gold CC minted per calendar month. */
  gold: number
  /** Whole CVC inference gas minted per calendar month. */
  cvc: number
}

export type Plan = {
  key: PlanKey
  name: string
  tagline: string
  /** Month-to-month price in GBP. Enterprise is quoted, so 0. */
  monthly: number
  /** Total billed once for a year in GBP. Enterprise is quoted, so 0. */
  yearly: number
  specs: PlanSpecs
  features: string[]
  grant: PlanGrant
  accent: string
  /** Marked as the recommended card on the pricing page. */
  popular?: boolean
  /** Enterprise is quote-only and gets its own panel. */
  quoteOnly?: boolean
  /** Ultra lets a subscriber choose their tier of dedicated hardware. */
  machineSizes?: string[]
}

// Features every plan carries. Listed on each card so the checklist reads as a
// complete promise rather than a diff against the tier below.
const BASE_FEATURES = [
  'Zero setup — instant access',
  '24/7 personal AI assistant',
  'Auto-updates, zero maintenance',
  'Available for OpenClaw and Hermes agents',
  'Fully private and encrypted hosting',
  'Daily backups',
  'Priority support',
  'High-performance guaranteed resources',
]

export const PLANS: Plan[] = [
  {
    key: 'lite',
    name: 'LITE',
    tagline: 'A managed agent of your own, running around the clock.',
    monthly: 19,
    yearly: 182,
    specs: { cores: '2 vCPU cores', ram: '4 GB RAM', ssd: '40 GB SSD' },
    features: [...BASE_FEATURES],
    grant: { silver: 100, gold: 100, cvc: 5_000 },
    accent: '#60a5fa',
  },
  {
    key: 'pro',
    name: 'PRO',
    tagline: 'Room to run several characters at once without queueing.',
    monthly: 49,
    yearly: 470,
    specs: { cores: '4 vCPU cores', ram: '8 GB RAM', ssd: '80 GB SSD' },
    features: [...BASE_FEATURES],
    grant: { silver: 100, gold: 100, cvc: 25_000 },
    accent: '#7c5cbf',
    popular: true,
  },
  {
    key: 'max',
    name: 'MAX',
    tagline: 'Studio-grade compute for a full roster of agents.',
    monthly: 99,
    yearly: 950,
    specs: { cores: '8 vCPU cores', ram: '16 GB RAM', ssd: '160 GB SSD' },
    features: [...BASE_FEATURES],
    grant: { silver: 100, gold: 100, cvc: 75_000 },
    accent: '#34d399',
  },
  {
    key: 'ultra',
    name: 'ULTRA',
    tagline: 'Dedicated hardware you pick the size of.',
    monthly: 249,
    yearly: 2390,
    specs: { cores: '16–64 vCPU cores', ram: '32–128 GB RAM', ssd: '320–1280 GB SSD' },
    features: [...BASE_FEATURES, 'Choose your machine size (Ultra 16 / 32 / 64)'],
    grant: { silver: 100, gold: 100, cvc: 200_000 },
    accent: '#f5c451',
    machineSizes: ['Ultra 16', 'Ultra 32', 'Ultra 64'],
  },
  {
    key: 'enterprise',
    name: 'ENTERPRISE',
    tagline: 'Your own infrastructure, your own terms.',
    monthly: 0,
    yearly: 0,
    specs: { cores: 'Up to 64 vCPU cores', ram: 'Up to 128 GB RAM', ssd: 'Up to 1280 GB SSD' },
    features: [
      ...BASE_FEATURES,
      'Dedicated infrastructure',
      'SSO / SAML',
      'Custom SLA',
      'Dedicated account manager',
      'Unlimited seats',
    ],
    grant: { silver: 100, gold: 100, cvc: 500_000 },
    accent: '#e879f9',
    quoteOnly: true,
  },
]

export const SELF_SERVE_PLANS = PLANS.filter((p) => !p.quoteOnly)
export const ENTERPRISE_PLAN = PLANS.find((p) => p.quoteOnly)!

export function findPlan(key: string): Plan | undefined {
  return PLANS.find((p) => p.key === key)
}

export type Cycle = 'monthly' | 'yearly'

/** Effective per-month cost of a plan on a given billing cycle. */
export function effectiveMonthly(plan: Plan, cycle: Cycle): number {
  if (plan.quoteOnly) return 0
  return cycle === 'yearly' ? plan.yearly / 12 : plan.monthly
}

/** How much a year on the yearly cycle saves against paying monthly, as a %. */
export function yearlySavingPct(plan: Plan): number {
  if (plan.quoteOnly || !plan.monthly) return 0
  const full = plan.monthly * 12
  return Math.round(((full - plan.yearly) / full) * 100)
}

/** The headline saving shown next to the billing toggle (the best on offer). */
export function headlineSavingPct(): number {
  return Math.max(...SELF_SERVE_PLANS.map(yearlySavingPct))
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatPlanPrice(pounds: number): string {
  return GBP.format(Math.round(pounds))
}

/** The calendar month key a grant is stamped with, e.g. "2026-09". */
export function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Rows for the side-by-side comparison table. */
export const COMPARE_ROWS: { label: string; value: (p: Plan) => string }[] = [
  { label: 'Price / month', value: (p) => (p.quoteOnly ? 'Custom' : formatPlanPrice(p.monthly)) },
  { label: 'Billed yearly', value: (p) => (p.quoteOnly ? 'Custom' : `${formatPlanPrice(p.yearly)} / yr`) },
  { label: 'vCPU cores', value: (p) => p.specs.cores },
  { label: 'RAM', value: (p) => p.specs.ram },
  { label: 'SSD', value: (p) => p.specs.ssd },
  { label: 'Monthly Silver CC', value: (p) => `${p.grant.silver} sCC` },
  { label: 'Monthly Gold CC', value: (p) => `${p.grant.gold} gCC` },
  { label: 'Monthly CVC gas', value: (p) => `${p.grant.cvc.toLocaleString('en-GB')} CVC` },
  { label: '24/7 personal AI assistant', value: () => 'Included' },
  { label: 'OpenClaw + Hermes agents', value: () => 'Included' },
  { label: 'Private & encrypted', value: () => 'Included' },
  { label: 'Daily backups', value: () => 'Included' },
  { label: 'Priority support', value: () => 'Included' },
  { label: 'Machine-size selector', value: (p) => (p.machineSizes ? p.machineSizes.join(' / ') : '—') },
  { label: 'Dedicated infrastructure', value: (p) => (p.quoteOnly ? 'Included' : '—') },
  { label: 'SSO / SAML', value: (p) => (p.quoteOnly ? 'Included' : '—') },
  { label: 'Custom SLA', value: (p) => (p.quoteOnly ? 'Included' : '—') },
  { label: 'Seats', value: (p) => (p.quoteOnly ? 'Unlimited' : '1') },
]

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: 'What exactly is a managed agent?',
    a: 'A hosted machine that runs your agent for you — no setup, no maintenance, no updates to apply. You pick a plan, the agent comes online, and it keeps running whether your laptop is open or not.',
  },
  {
    q: 'What do the monthly coins do?',
    a: 'Every plan mints 100 Silver CC and 100 Gold CC into your wallet each month, plus CVC inference gas. Silver and Gold are the monetization coins — they hold real market value. CVC is the gas a chatter spends to run character chat: usage, not money.',
  },
  {
    q: 'Why is the Gold grant a perk?',
    a: 'Gold CC is normally only mined from measured training success, so a subscription is the only other way to mint it. That makes 100 gCC a month a genuine head start on the training economy.',
  },
  {
    q: 'Can I switch plans or cancel?',
    a: 'Any time. Switching takes effect immediately and cancelling stops future billing — the coins already minted into your wallet stay yours.',
  },
  {
    q: 'Can the monthly grant be claimed twice?',
    a: 'No. The grant is stamped with a calendar month and minted exactly once per month, whether it was triggered by subscribing, switching plans, or collecting it by hand.',
  },
  {
    q: 'Which agents can I host?',
    a: 'Every plan covers both the OpenClaw and Hermes agents. Ultra additionally lets you choose your machine size — Ultra 16, 32 or 64 — so you can size the dedicated hardware to the workload.',
  },
  {
    q: 'What does Enterprise add?',
    a: 'Dedicated infrastructure, SSO/SAML, a custom SLA, a dedicated account manager and unlimited seats, on top of everything in Ultra.',
  },
]
