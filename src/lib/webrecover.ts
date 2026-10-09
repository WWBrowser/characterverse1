/**
 * Page recovery — the "wider web" half of the Discover engine.
 *
 * The frame probe next door reads two response headers and deliberately never
 * reads a body. This file does read bodies, which is a genuinely bigger thing
 * to be doing, so it is fenced in four ways rather than one:
 *
 * 1. **Same screen, not a second one.** Every URL goes through
 *    `screenTarget` and `screenResolved` from src/lib/frameprobe.ts — the same
 *    seven-layer SSRF screen the probe uses, imported rather than reimplemented,
 *    and re-run on every redirect hop. A second copy of a screen is always the
 *    one missing the range somebody added last month.
 *
 * 2. **Only URLs our own registry already holds.** `/api/discover` passes hosts
 *    that a publisher registered and that the index is already serving in
 *    results. Nothing a reader types reaches this file, so the query box is not
 *    a fetch primitive.
 *
 * 3. **Bounded read, structured extraction.** At most `MAX_BYTES` of body, only
 *    from an HTML content type, and what comes back out is four short strings
 *    pulled from `<title>` and the description metas. The page's own text is
 *    never returned, so this cannot be used as a content proxy and cannot carry
 *    a payload into the article.
 *
 * 4. **Treated as data, never as instruction.** Recovered text is a stranger's
 *    writing arriving inside a prompt. The caller marks it `origin: 'host'`,
 *    the model is told it may not act on it, and `scrub()` below strips the
 *    shapes that most often try — fenced blocks, bracket directives, and the
 *    "ignore your instructions" family. Defence in depth, because the model
 *    seeing it at all is the risk.
 */

import { screenResolved, screenTarget } from './frameprobe.js'

/** Enough for a <head>, nowhere near enough to be a proxy. */
const MAX_BYTES = 96 * 1024
const RECOVER_TIMEOUT_MS = 5000
const MAX_HOPS = 2

export type Recovered = {
  host: string
  url: string
  title: string
  summary: string
  ok: boolean
  /** Why it failed, or how it succeeded. Always printable to the reader. */
  note: string
}

const fail = (host: string, url: string, note: string): Recovered => ({
  host, url, title: '', summary: '', ok: false, note,
})

/**
 * Strip the shapes that try to be instructions.
 *
 * Not a security boundary on its own — the boundary is that the model is told
 * this text is data and that the article cannot gain a fact from it. This is
 * the cheap second layer: no code fences, no bracketed or angle-bracketed
 * directives, no imperative openers aimed at a reader that is a machine.
 */
function scrub(text: string): string {
  return (text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]]{0,80}\]|\{[^}]{0,80}\}/g, ' ')
    .replace(/\b(ignore|disregard|forget)\s+(all\s+|any\s+|your\s+|the\s+)*(previous|prior|above|earlier|system)\b[^.]*/gi, ' ')
    .replace(/\b(system|assistant|user)\s*:/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Decode the handful of entities that actually show up in a title. */
function entities(text: string): string {
  return text
    .replace(/&(?:amp|#38);/g, '&')
    .replace(/&(?:lt|#60);/g, '<')
    .replace(/&(?:gt|#62);/g, '>')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:#39|apos|rsquo|lsquo);/g, '’')
    .replace(/&(?:nbsp|#160);/g, ' ')
    .replace(/&(?:mdash|#8212);/g, '—')
    .replace(/&#(\d{2,5});/g, (_m, d) => {
      const code = Number(d)
      return code > 31 && code < 0x10000 ? String.fromCharCode(code) : ' '
    })
}

function metaContent(head: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = head.match(re)
    if (m?.[1]) {
      const value = scrub(entities(m[1]))
      if (value.length > 2) return value
    }
  }
  return ''
}

/**
 * Pull a title and a self-description out of HTML.
 *
 * Preference order is deliberate: Open Graph first, because a site that
 * maintains `og:description` is telling you what it wants quoted, and
 * `<meta name="description">` second, because that is what it tells a search
 * engine. If it offers neither we return no summary rather than scraping body
 * copy — an article quoting a stranger's first paragraph as their
 * self-description is putting words in their mouth.
 */
export function extractPage(html: string): { title: string; summary: string } {
  const head = html.slice(0, MAX_BYTES).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const title = metaContent(head, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{2,200})["']/i,
    /<meta[^>]+content=["']([^"']{2,200})["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([\s\S]{2,200}?)<\/title>/i,
  ])
  const summary = metaContent(head, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{2,400})["']/i,
    /<meta[^>]+content=["']([^"']{2,400})["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{2,400})["']/i,
    /<meta[^>]+content=["']([^"']{2,400})["'][^>]+name=["']description["']/i,
  ])
  return { title: title.slice(0, 160), summary: summary.slice(0, 360) }
}

/** Read at most `MAX_BYTES`, then drop the connection. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
        if (total >= MAX_BYTES) break
      }
    }
  } catch {
    /* whatever arrived is what we parse */
  } finally {
    try { await reader.cancel() } catch { /* already closed */ }
  }
  const buf = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    const room = Math.min(c.byteLength, total - at)
    if (room <= 0) break
    buf.set(c.subarray(0, room), at)
    at += room
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf)
}

/**
 * Recover one page's self-description.
 *
 * Never throws and never returns a partial success: `ok` is false unless there
 * is a summary worth quoting, and `note` always says why in words a reader can
 * understand, because "recovery failed" in an encyclopedia article is a fact
 * about the source and belongs on the page.
 */
export async function recoverPage(input: {
  url: string
  ownOrigin: string
  timeoutMs?: number
}): Promise<Recovered> {
  const screened = screenTarget(input.url, input.ownOrigin)
  if (!screened.ok) {
    let host = ''
    try { host = new URL(input.url).hostname } catch { host = '' }
    return fail(host, input.url, screened.reason)
  }

  let target = screened.url
  let hops = 0

  while (hops <= MAX_HOPS) {
    const blocked = await screenResolved(target.hostname)
    if (blocked) return fail(target.hostname, target.toString(), blocked)

    let res: Response
    try {
      res = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(input.timeoutMs || RECOVER_TIMEOUT_MS),
        headers: {
          // Named honestly, with the reason. A host that would rather not be
          // quoted in an index article can block this by name.
          'User-Agent': 'CharacterVerseSearch-Discover/1.0 (+https://characterverse.app/search)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en',
        },
      })
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      return fail(
        target.hostname,
        target.toString(),
        timedOut
          ? `did not answer within ${Math.round((input.timeoutMs || RECOVER_TIMEOUT_MS) / 1000)} seconds`
          : 'could not be reached',
      )
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') || ''
      try { await res.body?.cancel() } catch { /* already closed */ }
      if (!location) return fail(target.hostname, target.toString(), `answered ${res.status} with no destination`)
      let next: URL
      try {
        next = new URL(location, target)
      } catch {
        return fail(target.hostname, target.toString(), 'redirected somewhere unparseable')
      }
      // Re-screened from scratch. A public page is allowed to redirect at the
      // metadata service, and a recovery that followed blindly would fetch it.
      const rescreened = screenTarget(next.toString(), input.ownOrigin)
      if (!rescreened.ok) return fail(next.hostname, next.toString(), `redirected somewhere we will not follow: ${rescreened.reason}`)
      target = rescreened.url
      hops += 1
      continue
    }

    if (!res.ok) {
      try { await res.body?.cancel() } catch { /* already closed */ }
      return fail(target.hostname, target.toString(), `answered HTTP ${res.status}`)
    }

    const type = (res.headers.get('content-type') || '').toLowerCase()
    if (!type.includes('html') && !type.includes('xml')) {
      try { await res.body?.cancel() } catch { /* already closed */ }
      return fail(target.hostname, target.toString(), `serves ${type.split(';')[0] || 'an unknown type'}, not a page we can read`)
    }

    const html = await readCapped(res)
    const { title, summary } = extractPage(html)
    if (!summary) {
      return {
        host: target.hostname,
        url: target.toString(),
        title,
        summary: '',
        ok: false,
        note: 'answered, but publishes no description of itself',
      }
    }
    return {
      host: target.hostname,
      url: target.toString(),
      title,
      summary,
      ok: true,
      note: hops ? `recovered after ${hops} ${hops === 1 ? 'redirect' : 'redirects'}` : 'recovered',
    }
  }

  return fail(target.hostname, target.toString(), `redirected more than ${MAX_HOPS} times without settling`)
}

/**
 * Recover several hosts at once, with a hard ceiling.
 *
 * The ceiling is the point. An article is worth a handful of outbound requests
 * and no more: a page that fans out to every external row it cites turns one
 * reader's search into a small crawl, and the index would deserve to be blocked
 * for it.
 */
export async function recoverMany(input: {
  urls: { host: string; url: string }[]
  ownOrigin: string
  limit?: number
  timeoutMs?: number
}): Promise<Recovered[]> {
  const seen = new Set<string>()
  const queue = input.urls.filter((u) => {
    if (!u.url || seen.has(u.host)) return false
    seen.add(u.host)
    return true
  }).slice(0, input.limit ?? 4)

  return Promise.all(
    queue.map((u) =>
      recoverPage({ url: u.url, ownOrigin: input.ownOrigin, timeoutMs: input.timeoutMs })
        .catch(() => fail(u.host, u.url, 'could not be reached')),
    ),
  )
}
