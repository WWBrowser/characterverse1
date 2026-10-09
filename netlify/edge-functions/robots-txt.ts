import type { Config, Context } from '@netlify/edge-functions'
import { buildHelix, type Helix } from '../../src/lib/robots-charter.ts'

/* Strand A of the Agentic Robots Charter — the bot side of the coin.
 *
 * Served from the edge rather than as a static file because the two strands are
 * bound to each other by digest: they have to be rendered and sealed together,
 * in one pass, or the seal means nothing. The counterpart is robots-md.ts, and
 * the kernel both of them render from is src/lib/robots-charter.ts.
 *
 * The seal is deterministic for a given origin, so one build per isolate is
 * plenty — the cache below keeps the SHA-256 work off the hot path and well
 * inside the edge CPU budget. */
const cache = new Map<string, Promise<Helix>>()

function helix(origin: string): Promise<Helix> {
  let built = cache.get(origin)
  if (!built) {
    built = buildHelix(origin)
    cache.set(origin, built)
  }
  return built
}

export default async (req: Request, _context: Context) => {
  const { origin } = new URL(req.url)
  const { txt, seal, coreDigest } = await helix(origin)

  return new Response(txt, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300, must-revalidate',
      /* The binding, surfaced in headers too, so an actor that only issues a
       * HEAD request still learns that this file has a counterpart. */
      link: '</robots.md>; rel="alternate"; type="text/markdown"',
      'x-helix-strand': 'txt',
      'x-helix-seal': `sha256:${seal}`,
      'x-helix-core-digest': `sha256:${coreDigest}`,
    },
  })
}

export const config: Config = {
  path: '/robots.txt',
}
