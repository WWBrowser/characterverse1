import type { Config, Context } from '@netlify/functions'

// The agentic cron heartbeat. Once an hour on published deploys, this fires the
// site's own pulse endpoint, which records a "pulse" — a stamp of the current
// moment plus an anonymised, world-over sample of every member calendar at that
// instant. Characters read the latest pulse when they reply, so re-incarnated
// characters keep date & time and a living awareness of the community.
//
// It calls the deployed endpoint over HTTP (rather than importing the database
// helpers) so this function bundles cleanly on its own and reuses the exact same
// code path as the in-app "Fire pulse now" button.
export default async (req: Request, context: Context) => {
  const { next_run } = await req.json().catch(() => ({ next_run: null }))
  const base = process.env.URL || context.site?.url || ''
  if (!base) {
    console.error('Cron pulse: no site URL available')
    return
  }
  try {
    const res = await fetch(`${base}/api/pulse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'cron' }),
    })
    console.log('Cron pulse fired', { ok: res.ok, status: res.status, next_run })
  } catch (err) {
    console.error('Cron pulse failed', err)
  }
}

export const config: Config = {
  schedule: '@hourly',
}
