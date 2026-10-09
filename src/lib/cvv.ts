// CVV — CharacterVerse Video · shared, client-safe helpers.
//
// CVV is the 2004-YouTube "Broadcast Yourself" network baked into CharacterVerse.
// This module carries the pieces the browser and the server both need: the
// category taxonomy, the poster palette, and the little formatters that give the
// grid its retro feel (view counts, relative time, subscriber counts). Anything
// that touches the database, Netlify Blobs or the AI Gateway lives server-side in
// the API routes and in cvv-producer.ts instead.

export const CVV_CATEGORIES = [
  'Vlogs',
  'Music',
  'Comedy',
  'How-To',
  'Gaming',
  'News',
  'Film & Animation',
  'Science',
  'Pets & Animals',
  'Sports',
] as const

export type CvvCategory = (typeof CVV_CATEGORIES)[number]

// Poster emoji the uploader can pick — the retro "video still" that stands in for
// a real thumbnail while a tape loads.
export const CVV_POSTERS = [
  '🎬', '📼', '🎥', '📹', '🎞️', '📺', '🕹️', '🎸', '🎤', '🎨',
  '🔬', '🐈', '⚽', '🍳', '🚀', '🌆', '🎮', '📻', '💾', '🎧',
] as const

// A curated accent palette for new channels — bright, early-web reds and blues.
export const CVV_ACCENTS = [
  '#cc181e', '#e62117', '#1f6feb', '#2d6a4f', '#f77f00',
  '#7c5cbf', '#b5179e', '#0aa', '#d97706', '#4f46e5',
] as const

/** Compact YouTube-style view count: 1234 → "1,234", 15300 → "15K". */
export function formatViews(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** "3 years ago" style relative time, in the plain 2004 register. */
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

/** "1.2K subscribers" / "1 subscriber". */
export function formatSubscribers(n: number): string {
  const label = formatViews(n)
  return `${label} subscriber${n === 1 ? '' : 's'}`
}

/** Normalize a channel handle the same way everywhere it is created or looked up. */
export function normalizeChannelHandle(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}

/** Human-readable file size, for the upload form and video info row. */
export function formatBytes(bytes: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

// The upload ceiling. Netlify Blobs itself stores far larger objects, but a demo
// network keeps tapes light so uploads stay snappy on the request path.
export const CVV_MAX_UPLOAD_BYTES = 50 * 1024 * 1024

// Netlify's serverless functions cap a single request body at ~6 MB, so the file
// is never sent whole — the client slices it into chunks this size and the server
// reassembles them. 3 MB of raw bytes stays comfortably under the limit even once
// the platform base64-encodes the binary body in transit.
export const CVV_CHUNK_BYTES = 3 * 1024 * 1024

// The shape ReelClaw returns for every tape (also the fallback when the AI
// Gateway is unavailable at upload time).
export type CvvReel = {
  summary: string
  tags: string[]
  hostIntro: string
  verdict: string
}
