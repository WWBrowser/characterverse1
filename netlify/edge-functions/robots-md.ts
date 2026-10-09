import type { Config, Context } from '@netlify/edge-functions'
import { buildHelix, type Helix } from '../../src/lib/robots-charter.ts'

/* Strand B of the Agentic Robots Charter — the agent side of the coin.
 *
 * Same kernel as robots-txt.ts, same rules, same core digest; only the
 * presentation and the seal differ. Served as text/markdown so an agent that
 * fetches it gets the charter as prose it can actually read, rather than as a
 * download. */
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
  const { md, seal, coreDigest } = await helix(origin)

  return new Response(md, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300, must-revalidate',
      link: '</robots.txt>; rel="alternate"; type="text/plain"',
      'x-helix-strand': 'md',
      'x-helix-seal': `sha256:${seal}`,
      'x-helix-core-digest': `sha256:${coreDigest}`,
    },
  })
}

export const config: Config = {
  path: '/robots.md',
}
