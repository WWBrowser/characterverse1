// Can this thing actually be embedded?
//
// The index offers two frames. Inframe embeds; oframe hands off. Picking wrong
// is not a cosmetic mistake: an inframe entry whose host refuses to be framed
// renders a blank rectangle with no error the embedding page is allowed to read,
// so the person who clicked sees nothing and learns nothing. Before this module
// the only way to find out was to open a tab and watch it fail.
//
// So we ask the host first. Fetch the URL from the server, read the two headers
// that decide framing, and let the answer choose the frame. `X-Frame-Options`
// and CSP `frame-ancestors` are the whole mechanism — everything else about the
// page is irrelevant to whether it will render inside us.
//
// Three properties this has to hold to:
//
//   1. It never answers "embeddable" on a guess. A host that cannot be reached,
//      or that answers oddly, gets `unknown` and the entry gets oframe, because
//      a hand-off works everywhere and an embed works only sometimes.
//   2. It is a server fetching a URL a stranger typed, which is the textbook
//      setup for SSRF. Every target is screened before a socket is opened, and
//      again at every redirect hop. See `screenTarget`.
//   3. The response body is never read, stored, judged or echoed. We asked a
//      question about headers; the page content is not part of the answer, and
//      anything we repeated back would be an unvetted third party's text
//      arriving inside our own page.
//
// The judging half is pure and separated from the fetching half on purpose: the
// header logic is the part with all the edge cases (obsolete ALLOW-FROM, CSP
// precedence, wildcard source lists) and it is testable without a network.

/* ------------------------------------------------------------- verdicts */

export type EmbedVerdict =
  /** Nothing in the host's headers excludes us. Inframe is safe to offer. */
  | 'embeddable'
  /** A header names a rule we fail. Inframe would render an empty box. */
  | 'blocked'
  /** It answered, but not in a way that settles the question. */
  | 'unknown'
  /** No usable response at all — DNS, timeout, connection refused. */
  | 'unreachable'
  /** We declined to fetch it. Not the host's fault; see the reason. */
  | 'refused'

export type EmbedCheck = {
  verdict: EmbedVerdict
  /** One line for a person: what was found and what it means for them. */
  reason: string
  /** The evidence, quoted. Stored on the entry so the verdict stays auditable. */
  detail: string
  /** The frame this verdict implies for a publisher who asked for inframe. */
  frame: 'inframe' | 'oframe'
  /** HTTP status of the final hop, or 0 if there never was one. */
  status: number
  /** Redirect hops followed. A chat URL that bounces three times is worth seeing. */
  hops: number
  /** The URL actually judged, after redirects. */
  finalUrl: string
}

/** Only these two headers decide framing, so only these two are reported. */
export type FramingHeaders = { xFrameOptions: string; csp: string }

/**
 * Does a verdict permit embedding?
 *
 * Only an explicit yes does. `unknown` and `unreachable` fall to oframe, which
 * is the safe default in the specific sense that it always works: the browser
 * navigating to a URL is not something the host can refuse.
 */
export function frameFor(verdict: EmbedVerdict, requested: 'inframe' | 'oframe'): 'inframe' | 'oframe' {
  if (requested === 'oframe') return 'oframe'
  return verdict === 'embeddable' ? 'inframe' : 'oframe'
}

/* --------------------------------------------------- target screening (SSRF) */

/**
 * Ports we will connect to.
 *
 * A publicly hosted AI chat is on 80 or 443. Allowing arbitrary ports turns the
 * probe into a port scanner that runs inside our own network perimeter and
 * reports back whether the connection succeeded, which is most of what an
 * attacker wants from SSRF in the first place.
 */
const ALLOWED_PORTS = new Set(['', '80', '443'])

/** Names that resolve inside a network rather than on the internet. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
])

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.corp',
  '.home',
  '.home.arpa',
  '.localdomain',
]

/**
 * Is this address one we must not connect to?
 *
 * Returns the name of the range on a hit, or '' when the address is ordinary
 * public space. Written as explicit ranges rather than a regex because the list
 * is the security boundary and a reader has to be able to check it: loopback and
 * private space are the obvious ones, but link-local carries the cloud metadata
 * endpoint that hands out credentials, and shared-address space and the
 * documentation ranges show up in real-world SSRF chains.
 */
export function classifyAddress(raw: string): string {
  const addr = raw.trim().replace(/^\[|\]$/g, '').toLowerCase()
  if (!addr) return 'empty address'

  // IPv4, including the IPv4-mapped and NAT64 forms that hide inside IPv6.
  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (v4.slice(1).some((o) => Number(o) > 255)) return 'not a valid address'
    if (a === 0) return 'this-network (0.0.0.0/8)'
    if (a === 10) return 'private (10.0.0.0/8)'
    if (a === 127) return 'loopback (127.0.0.0/8)'
    if (a === 100 && b >= 64 && b <= 127) return 'shared address space (100.64.0.0/10)'
    if (a === 169 && b === 254) return 'link-local — cloud metadata lives here (169.254.0.0/16)'
    if (a === 172 && b >= 16 && b <= 31) return 'private (172.16.0.0/12)'
    if (a === 192 && b === 168) return 'private (192.168.0.0/16)'
    if (a === 192 && b === 0) return 'protocol assignments (192.0.0.0/24)'
    if (a === 198 && (b === 18 || b === 19)) return 'benchmarking (198.18.0.0/15)'
    if (a >= 224) return 'multicast, reserved or broadcast (224.0.0.0/4 and up)'
    return ''
  }

  if (!addr.includes(':')) return '' // a hostname, not an address — judged elsewhere
  if (addr === '::') return 'unspecified (::)'
  if (addr === '::1') return 'loopback (::1)'

  // Expand the :: shorthand so prefixes can be compared numerically.
  const [head, tail = ''] = addr.split('::')
  const parts = head ? head.split(':') : []
  const rest = tail ? tail.split(':') : []
  // An address may end in dotted-quad form, e.g. ::ffff:127.0.0.1. Note that
  // `new URL()` normalizes that to ::ffff:7f00:1 before we ever see it, so the
  // group arithmetic below is the path that actually runs — this is for callers
  // handing us a raw string.
  const written = rest.length ? rest[rest.length - 1] : parts[parts.length - 1] || ''
  if (written.includes('.')) {
    const inner = classifyAddress(written)
    return inner ? `IPv4 inside IPv6 — ${inner}` : ''
  }
  const groups = addr.includes('::')
    ? [...parts, ...Array(Math.max(0, 8 - parts.length - rest.length)).fill('0'), ...rest]
    : parts
  if (groups.length !== 8) return 'not a valid address'
  const n = groups.map((g) => parseInt(g || '0', 16))
  if (n.some((g) => Number.isNaN(g) || g > 0xffff)) return 'not a valid address'

  // IPv4 wearing an IPv6 costume. ::ffff:a.b.c.d (mapped), 64:ff9b::a.b.c.d
  // (NAT64) and ::a.b.c.d (the deprecated compatible form) all reach an IPv4
  // destination, so the IPv4 ranges are what matter and skipping this check is
  // how a loopback address gets past a filter that only reads the first group.
  const zeroPrefix = n.slice(0, 5).every((g) => g === 0)
  const embedsV4 =
    (zeroPrefix && (n[5] === 0xffff || n[5] === 0)) ||
    (n[0] === 0x0064 && n[1] === 0xff9b && n.slice(2, 6).every((g) => g === 0))
  if (embedsV4 && (n[6] !== 0 || n[7] !== 0)) {
    const v4Text = `${n[6] >> 8}.${n[6] & 0xff}.${n[7] >> 8}.${n[7] & 0xff}`
    const inner = classifyAddress(v4Text)
    return inner ? `IPv4 inside IPv6 (${v4Text}) — ${inner}` : ''
  }

  const first = n[0]
  if ((first & 0xfe00) === 0xfc00) return 'unique local (fc00::/7)'
  if ((first & 0xffc0) === 0xfe80) return 'link-local (fe80::/10)'
  if ((first & 0xff00) === 0xff00) return 'multicast (ff00::/8)'
  return ''
}

export type Screened =
  | { ok: true; url: URL }
  | { ok: false; verdict: EmbedVerdict; reason: string; detail: string }

/**
 * Decide whether we are willing to open a connection to this URL at all.
 *
 * Runs before the first request and again on every redirect target, because a
 * perfectly ordinary public URL is allowed to answer `302 Location:
 * http://169.254.169.254/latest/meta-data/` and a probe that follows redirects
 * blindly will fetch it.
 *
 * `ownOrigin` is here for a second reason. An entry pointing at CharacterVerse
 * itself must not be framed as a third party: the pane grants
 * `allow-same-origin` so React apps can use their own storage, and a frame that
 * is same-origin with its parent AND allowed to run scripts can reach up and
 * rewrite the parent's own sandbox attribute. So our own origin is refused here,
 * where it is one condition, rather than trusted to be caught in the pane.
 */
export function screenTarget(raw: string, ownOrigin = ''): Screened {
  const no = (reason: string, detail: string, verdict: EmbedVerdict = 'refused'): Screened => ({
    ok: false, verdict, reason, detail,
  })

  let url: URL
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    return no('That is not a URL we can fetch. Include the scheme, e.g. https://…', String(raw || '').slice(0, 120))
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return no(`Only http and https can be probed — ${url.protocol} cannot.`, url.protocol)
  }
  if (url.username || url.password) {
    return no(
      'Strip the credentials out of the URL. An indexed link is public, and a password in it would be published with it.',
      'URL contained userinfo',
    )
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return no(`Port ${url.port} is not probed — only the standard web ports are.`, `port ${url.port}`)
  }

  const host = url.hostname.replace(/\.$/, '').toLowerCase()
  if (!host) return no('That URL has no host.', 'empty hostname')
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return no(
      `${host} is a name that only resolves inside a network. An index entry has to be reachable from anywhere.`,
      host,
    )
  }
  const range = classifyAddress(host)
  if (range) {
    return no(
      `${host} is in ${range}. That address is not on the public internet, so nobody but this server could open it.`,
      `${host} — ${range}`,
    )
  }

  if (ownOrigin && url.origin === ownOrigin) {
    return no(
      'That is a CharacterVerse page. It is already in this index as a character — an external entry pointing back at us would be a duplicate, and framing our own pages as a third party would hand the frame a same-origin foothold on the workspace around it.',
      'same origin as CharacterVerse',
    )
  }

  return { ok: true, url }
}

/* ----------------------------------------------------- judging the headers */

/** Does one CSP `frame-ancestors` source permit `origin`? */
function sourceAllows(source: string, origin: string, targetOrigin: string): boolean {
  const src = source.trim().toLowerCase()
  if (!src) return false
  if (src === '*') return true
  if (src === "'none'") return false
  // 'self' is the *host's* self, not ours. It permits framing only by a page on
  // the same origin as the page being framed — which we are not, or the entry
  // would not be external.
  if (src === "'self'") return origin === targetOrigin
  if (src === 'https:' || src === 'http:') return origin.startsWith(src.slice(0, -1))
  if (src.startsWith("'")) return false // 'unsafe-inline' and friends are meaningless here

  let ours: URL
  try {
    ours = new URL(origin)
  } catch {
    return false
  }
  // A source may carry a scheme, a wildcard label and a port, in any combination.
  const withScheme = src.includes('://') ? src : `https://${src}`
  let pattern: URL
  try {
    pattern = new URL(withScheme)
  } catch {
    return false
  }
  if (src.includes('://') && pattern.protocol !== ours.protocol) return false
  if (pattern.port && pattern.port !== ours.port) return false
  const pHost = pattern.hostname
  if (pHost === '*') return true
  if (pHost.startsWith('*.')) return ours.hostname.endsWith(pHost.slice(1))
  return pHost === ours.hostname
}

/** Pull every `frame-ancestors` source list out of one or more CSP headers. */
function frameAncestors(csp: string): string[] | null {
  if (!csp.trim()) return null
  const found: string[] = []
  let present = false
  for (const directive of csp.split(';')) {
    const tokens = directive.trim().split(/\s+/).filter(Boolean)
    if (!tokens.length) continue
    if (tokens[0].toLowerCase().replace(/,$/, '') !== 'frame-ancestors') continue
    present = true
    found.push(...tokens.slice(1).map((t) => t.replace(/,$/, '')))
  }
  return present ? found : null
}

/**
 * Read the two headers and say whether we may be framed.
 *
 * Pure. CSP wins where both are present — that is the specified precedence and
 * what every current browser does, so a host serving `X-Frame-Options: DENY`
 * alongside `frame-ancestors *` is embeddable, however contradictory it looks.
 */
export function judgeFrameHeaders(input: {
  headers: FramingHeaders
  status: number
  ownOrigin: string
  targetOrigin: string
}): { verdict: EmbedVerdict; reason: string; detail: string } {
  const { headers, status, ownOrigin, targetOrigin } = input
  const xfo = headers.xFrameOptions.trim()
  const csp = headers.csp.trim()
  const quoted = [
    xfo && `X-Frame-Options: ${xfo}`,
    csp && `Content-Security-Policy: ${csp.slice(0, 400)}`,
  ].filter(Boolean).join(' · ')

  const ancestors = frameAncestors(csp)
  if (ancestors) {
    if (!ancestors.length || ancestors.some((s) => s.toLowerCase() === "'none'")) {
      return {
        verdict: 'blocked',
        reason: "Its Content-Security-Policy sets frame-ancestors 'none' — it refuses to be embedded by anyone.",
        detail: quoted,
      }
    }
    if (ancestors.some((s) => sourceAllows(s, ownOrigin, targetOrigin))) {
      return {
        verdict: 'embeddable',
        reason: 'Its Content-Security-Policy lists a frame-ancestors source that covers this origin.',
        detail: quoted,
      }
    }
    return {
      verdict: 'blocked',
      reason: `Its Content-Security-Policy allows framing only by ${ancestors.slice(0, 3).join(', ')} — CharacterVerse is not on that list.`,
      detail: quoted,
    }
  }

  if (xfo) {
    const value = xfo.toLowerCase()
    if (value.includes('deny')) {
      return {
        verdict: 'blocked',
        reason: 'It sends X-Frame-Options: DENY — it refuses to be embedded anywhere.',
        detail: quoted,
      }
    }
    if (value.includes('sameorigin')) {
      return targetOrigin === ownOrigin
        ? { verdict: 'embeddable', reason: 'X-Frame-Options: SAMEORIGIN, and it is the same origin.', detail: quoted }
        : {
            verdict: 'blocked',
            reason: 'It sends X-Frame-Options: SAMEORIGIN — it will only be embedded by pages on its own domain.',
            detail: quoted,
          }
    }
    if (value.includes('allow-from')) {
      return {
        verdict: 'unknown',
        reason: 'It sends the obsolete X-Frame-Options: ALLOW-FROM, which no current browser honours — some will ignore the header entirely and frame it, others have already dropped it. Too unsettled to promise.',
        detail: quoted,
      }
    }
    return {
      verdict: 'unknown',
      reason: `Its X-Frame-Options value ("${xfo.slice(0, 60)}") is not one browsers recognise, so what they do with it is anybody's guess.`,
      detail: quoted,
    }
  }

  if (status === 401 || status === 403 || status === 429) {
    // The common case, and worth its own sentence: a great many AI chats answer
    // anything that is not a browser with a refusal, so this status usually
    // means the probe was turned away rather than that the page is broken. We
    // still will not call it embeddable — we never saw the headers a browser
    // would get, and guessing is how somebody ends up with a blank tab.
    return {
      verdict: 'unknown',
      reason: `It answered ${status} to an automated request and sent no framing headers with it. That is usually bot filtering rather than a broken link, but it means its real framing policy is unread — so this is registered as a hand-off, which works either way.`,
      detail: `HTTP ${status}`,
    }
  }

  if (status >= 400) {
    return {
      verdict: 'unknown',
      reason: `It answered ${status} and set no framing headers. Nothing forbids embedding, but a URL that errors is a poor thing to put in an index.`,
      detail: `HTTP ${status}`,
    }
  }

  return {
    verdict: 'embeddable',
    reason: 'It sets neither X-Frame-Options nor a CSP frame-ancestors rule, so nothing stops it being embedded.',
    detail: 'no framing headers',
  }
}

/* --------------------------------------------------------- the actual probe */

const PROBE_TIMEOUT_MS = 6000
const MAX_HOPS = 3

/**
 * Resolve a hostname and screen every address it answers with.
 *
 * The hostname screen above catches `127.0.0.1` and `localhost`; it cannot catch
 * `chat.example.com` when that name has an A record pointing at `10.0.0.5`,
 * which is how SSRF filters are usually walked past. So we resolve first and
 * check what came back.
 *
 * This is not airtight and should not be sold as such: the name is resolved
 * again by the fetch itself, and a record with a one-second TTL can change
 * between the two. Closing that properly means pinning the connection to the
 * address we checked. What this does close is the ordinary case, which is a
 * public name deliberately pointed inward.
 */
/**
 * Re-screen a hostname against what it actually resolves to.
 *
 * Exported because the Discover engine's page recovery
 * (src/lib/webrecover.ts) opens connections to the same class of stranger this
 * file screens, and needs the same DNS stage. One copy of an SSRF screen with
 * two callers is safer than two copies that drift; the second copy is always
 * the one missing the range somebody added last month.
 *
 * Returns '' when the hostname is allowed, or a sentence naming the range when
 * it is not.
 */
export async function screenResolved(hostname: string): Promise<string> {
  if (classifyAddress(hostname)) return '' // an IP literal was already screened
  try {
    const dns = await import('node:dns')
    const addrs = await dns.promises.lookup(hostname, { all: true, verbatim: true })
    for (const a of addrs) {
      const range = classifyAddress(a.address)
      if (range) return `${hostname} resolves to ${a.address}, which is in ${range}.`
    }
    return ''
  } catch (err: any) {
    // No resolver in this runtime is not a failure to report to the publisher;
    // the hostname screen still ran. A genuine NXDOMAIN is, though.
    if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
      return `${hostname} does not resolve.`
    }
    return ''
  }
}

/**
 * Ask a host whether it will let itself be embedded.
 *
 * Requests are sent with the `Sec-Fetch-*` headers a real iframe navigation
 * carries, because a host that varies its framing policy by request destination
 * would otherwise answer the question we did not ask.
 */
export async function probeFrame(input: {
  url: string
  ownOrigin: string
  requested?: 'inframe' | 'oframe'
  timeoutMs?: number
}): Promise<EmbedCheck> {
  const requested = input.requested || 'inframe'
  const done = (
    verdict: EmbedVerdict,
    reason: string,
    detail: string,
    extra: Partial<EmbedCheck> = {},
  ): EmbedCheck => ({
    verdict,
    reason,
    detail: detail.slice(0, 600),
    frame: frameFor(verdict, requested),
    status: 0,
    hops: 0,
    finalUrl: '',
    ...extra,
  })

  const screened = screenTarget(input.url, input.ownOrigin)
  if (!screened.ok) return done(screened.verdict, screened.reason, screened.detail)

  let target = screened.url
  let hops = 0

  while (hops <= MAX_HOPS) {
    const blockedResolution = await screenResolved(target.hostname)
    if (blockedResolution) {
      return done('refused', blockedResolution, blockedResolution, { hops, finalUrl: target.toString() })
    }

    let res: Response
    try {
      res = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(input.timeoutMs || PROBE_TIMEOUT_MS),
        headers: {
          // Named honestly. A host that would rather not be probed can block it.
          'User-Agent': 'CharacterVerseSearch-FrameProbe/1.0 (+https://characterverse.app/search)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en',
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
        },
      })
    } catch (err: any) {
      const why = err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? `${target.hostname} did not answer within ${Math.round((input.timeoutMs || PROBE_TIMEOUT_MS) / 1000)} seconds.`
        : `${target.hostname} could not be reached.`
      return done(
        'unreachable',
        `${why} Registered as a hand-off, which needs nothing from us but the link.`,
        // undici hides the real cause one level down; `TypeError: fetch failed`
        // on its own tells a publisher nothing about what went wrong.
        String(err?.cause?.code || err?.code || err?.cause?.message || err?.name || 'fetch failed').slice(0, 200),
        { hops, finalUrl: target.toString() },
      )
    }

    // The body is never read. Cancelling it releases the socket without pulling
    // a stranger's HTML into this process.
    try {
      await res.body?.cancel()
    } catch {
      /* already closed */
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') || ''
      if (!location) {
        return done('unknown', `It answered ${res.status} with no destination to follow.`, `HTTP ${res.status}`, {
          status: res.status, hops, finalUrl: target.toString(),
        })
      }
      let next: URL
      try {
        next = new URL(location, target)
      } catch {
        return done('unknown', `It redirected somewhere unparseable.`, `HTTP ${res.status}`, {
          status: res.status, hops, finalUrl: target.toString(),
        })
      }
      // Re-screened, not trusted. This is the hop an SSRF payload rides in on.
      const hopScreen = screenTarget(next.toString(), input.ownOrigin)
      if (!hopScreen.ok) {
        return done(
          'refused',
          `It redirects to somewhere we will not follow: ${hopScreen.reason}`,
          hopScreen.detail,
          { status: res.status, hops, finalUrl: next.toString() },
        )
      }
      target = hopScreen.url
      hops += 1
      continue
    }

    const judged = judgeFrameHeaders({
      headers: {
        xFrameOptions: res.headers.get('x-frame-options') || '',
        csp: res.headers.get('content-security-policy') || '',
      },
      status: res.status,
      ownOrigin: input.ownOrigin,
      targetOrigin: target.origin,
    })
    return done(judged.verdict, judged.reason, judged.detail, {
      status: res.status,
      hops,
      finalUrl: target.toString(),
    })
  }

  return done('unknown', `It redirected more than ${MAX_HOPS} times without settling anywhere.`, 'redirect loop', { hops })
}
