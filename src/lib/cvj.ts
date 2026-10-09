// CVJ — CharacterVerse Jobs · shared, client-safe helpers.
//
// CVJ is the agentic gig marketplace ("agentic Fiverr") baked into CharacterVerse.
// This module carries what the browser and server both need: the service
// taxonomy, the seller-avatar and accent palettes, coin formatting that ties into
// the platform's Silver/Gold economy, and the little formatters the cards use.
// Anything touching the database, the AI Gateway, or coins minting lives
// server-side in the API routes and in cvj-producer.ts.

export const CVJ_CATEGORIES = [
  'Writing',
  'Design',
  'Programming',
  'Marketing',
  'Video & Animation',
  'Music & Audio',
  'Business',
  'Data',
  'Research',
  'Lifestyle',
] as const

export type CvjCategory = (typeof CVJ_CATEGORIES)[number]

// Seller avatars an agent gig can wear.
export const CVJ_AVATARS = [
  '🧑‍💻', '✍️', '🎨', '📊', '🎬', '🎧', '📈', '🤖', '🦾', '🧠',
  '📝', '💼', '🛠️', '🔍', '🧾', '🎯', '🗂️', '📡', '🧩', '⚡',
] as const

export const CVJ_ACCENTS = [
  '#1dbf73', '#7c5cbf', '#1f6feb', '#e0245e', '#f77f00',
  '#00b8d9', '#8b5cf6', '#d97706', '#0aa06e', '#4f46e5',
] as const

export type Coin = 'silver' | 'gold'

// Coin metadata mirrors src/lib/coins.ts so CVJ prices read in the same currency
// as the rest of the platform (10 Silver = 1 Gold by value).
export const CVJ_COINS: Record<Coin, { label: string; short: string; emoji: string }> = {
  silver: { label: 'Silver CC', short: 'sCC', emoji: '🥈' },
  gold: { label: 'Gold CC', short: 'gCC', emoji: '🥇' },
}

export function coinMeta(coin: string) {
  return CVJ_COINS[coin === 'gold' ? 'gold' : 'silver']
}

/** "🥈 25 sCC" style price label. */
export function formatPrice(priceCoins: number, coin: string): string {
  const m = coinMeta(coin)
  return `${m.emoji} ${priceCoins.toLocaleString()} ${m.short}`
}

/** Average star rating (0 when no reviews yet). */
export function avgRating(ratingTotal: number, ratingCount: number): number {
  if (!ratingCount) return 0
  return Math.round((ratingTotal / ratingCount) * 10) / 10
}

/** Five-glyph star string for a rating, e.g. 4 → "★★★★☆". */
export function stars(rating: number): string {
  const full = Math.round(rating)
  return '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full)
}

export function timeAgo(input: string | number | Date | null | undefined): string {
  if (!input) return 'just now'
  const then = new Date(input).getTime()
  if (Number.isNaN(then)) return 'just now'
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000))
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ]
  let value = secs
  let unit = 'second'
  for (const [size, name] of units) {
    if (value < size) {
      unit = name
      break
    }
    value = Math.floor(value / size)
    unit = name
  }
  const rounded = Math.max(1, Math.floor(value))
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`
}

// The deliverable package JobClaw returns for an order (also the fallback shape).
export type JobDelivery = {
  deliverable: string
  note: string
}
