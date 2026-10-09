import { createFileRoute } from '@tanstack/react-router'
import { ensureCoinSettings, economySummary, DEFAULT_WORKSPACE } from '../../db/coins.js'
import {
  coerceSettings,
  COINS,
  priceGbp,
  priceUplift,
  suggestPrice,
  gbpFromMilli,
} from '../lib/coins.js'

// AccountantClaw — the monetization wizard. A grounded LLM advisor that helps the
// operator price the two coins as the platform takes off. It is fed the live
// economy (circulating Silver/Gold, current vs. base price, total market value)
// and a deterministic price suggestion, then narrates the strategy: when to hold
// the fixed rate, when to raise, and by how much, so chatting can pay out like a
// creator economy without inflating the coin away.
//
//   POST /api/accountantclaw  { message, history?, model?, temperature? }
//     → { reply, model, suggestion: { silver, gold } }
//
// The numeric suggestion is computed server-side (suggestPrice) so the advice is
// actionable with or without the gateway; the LLM explains it.

const FALLBACK_MODEL = 'claude-haiku-4-5'

export const Route = createFileRoute('/api/accountantclaw')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const workspaceId = (url.searchParams.get('workspace') || DEFAULT_WORKSPACE).slice(0, 60)

        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const message = String(body.message || '').trim().slice(0, 2000)
        const temperature = Math.max(0, Math.min(1, Number(body.temperature ?? 0.4)))
        const model = String(body.model || FALLBACK_MODEL)
        const useModel = model.startsWith('claude') ? model : FALLBACK_MODEL

        const settingsRow = await ensureCoinSettings(workspaceId)
        const settings = coerceSettings(settingsRow)
        const summary = await economySummary(workspaceId)

        // Deterministic price guidance, independent of the LLM.
        const silverCirc = summary.totals.silver / 1000
        const goldCirc = summary.totals.gold / 1000
        const suggestion = {
          silver: suggestPrice('silver', silverCirc),
          gold: suggestPrice('gold', goldCirc),
        }
        const marketValueGbp =
          gbpFromMilli(summary.totals.silver, settings.silverPrice) +
          gbpFromMilli(summary.totals.gold, settings.goldPrice)

        const stateLines = [
          `Accounts active: ${summary.accounts}`,
          `Silver in circulation: ${silverCirc.toLocaleString('en-GB')} sCC (current price ${priceGbp(settings.silverPrice).toFixed(4)} GBP, base ${priceGbp(COINS.silver.basePrice).toFixed(4)}, ${priceUplift('silver', settings.silverPrice)}% above floor)`,
          `Gold in circulation: ${goldCirc.toLocaleString('en-GB')} gCC (current price ${priceGbp(settings.goldPrice).toFixed(4)} GBP, base ${priceGbp(COINS.gold.basePrice).toFixed(4)}, ${priceUplift('gold', settings.goldPrice)}% above floor)`,
          `Total market value: ${marketValueGbp.toFixed(4)} GBP`,
          `Pricing mode: ${settings.pricingMode}`,
          `Deterministic suggestion: Silver → ${priceGbp(suggestion.silver).toFixed(4)} GBP, Gold → ${priceGbp(suggestion.gold).toFixed(4)} GBP`,
        ].join('\n')

        const system = `You are AccountantClaw — CharacterVerse's monetization wizard, a sharp, plain-spoken financial strategist for a two-coin agentic economy.

The two coins (both branded "CC"):
- Silver CC — the interaction coin, minted every time someone chats with a character. Fixed base price £0.001 (one tenth of a penny). This is the everyday coin that turns chatting into earnings, like a creator economy: if millions chat with someone's character, the Silver adds up.
- Gold CC — the training coin, mined "crypto-mining style" when training success is measured from a character's, dyad's, or cluster's sub-weights. Fixed base price £0.01. Ten Silver equal one Gold by value.

Your job: advise on price. The base price is a FIXED FLOOR you must never go below — it protects holders. As adoption climbs you may raise the live price above the floor to capture value, but raise gently so the economy stays attractive to creators and trainers. Keep coins worth earning.

Live economy:
${stateLines}

Answer concisely and practically — concrete numbers, a recommended price for each coin, and the reasoning. Stay focused on monetization and coin pricing.`

        const baseUrl = process.env.ANTHROPIC_BASE_URL
        const apiKey = process.env.ANTHROPIC_API_KEY

        // Without a message, return just the numeric guidance (used to prefill the
        // page's suggestion chips before any conversation).
        if (!message) {
          return Response.json({ suggestion, marketValueGbp, reply: '' })
        }

        if (!baseUrl || !apiKey) {
          // Deterministic fallback so the wizard is still useful pre-deploy.
          const reply = `At ${summary.accounts} active account(s) and ${silverCirc.toLocaleString('en-GB')} Silver / ${goldCirc.toLocaleString('en-GB')} Gold in circulation, hold near the fixed floor for now. Suggested: Silver ${priceGbp(suggestion.silver).toFixed(4)} GBP, Gold ${priceGbp(suggestion.gold).toFixed(4)} GBP. Raise only once circulation grows an order of magnitude — keep the coins worth earning. (Deploy the site to enable full AccountantClaw guidance.)`
          return Response.json({ reply, model: 'deterministic', suggestion, marketValueGbp })
        }

        const history: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.history)
          ? body.history
              .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
              .slice(-8)
              .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
          : []

        try {
          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: useModel,
              max_tokens: 1024,
              temperature,
              system,
              messages: [...history, { role: 'user', content: message }],
            }),
          })
          if (!res.ok) {
            return Response.json({ error: 'AccountantClaw could not reply right now.' }, { status: 502 })
          }
          const data = await res.json()
          const reply = Array.isArray(data.content)
            ? data.content.map((b: any) => b.text || '').join('').trim()
            : ''
          if (!reply) {
            return Response.json({ error: 'AccountantClaw could not reply right now.' }, { status: 502 })
          }
          return Response.json({ reply, model: useModel, suggestion, marketValueGbp })
        } catch (error) {
          console.error('AccountantClaw error:', error)
          return Response.json({ error: 'Failed to reach AccountantClaw' }, { status: 500 })
        }
      },
    },
  },
})
