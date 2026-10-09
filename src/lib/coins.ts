// CharacterVerse Coins — the two-coin agentic economy.
//
// CharacterVerse mints two distinct character coins, both branded "CC":
//
//   🥈 Silver (CC)  — the interaction coin. Earned every time someone engages a
//                     character (single chat, merged/twin chat, CharacterClaw,
//                     conference clusters, missions). Fixed base price £0.001 —
//                     one tenth of a penny. This is the everyday coin: chatting
//                     mints it the way watching mints ad revenue on YouTube.
//
//   🥇 Gold (CC)    — the training coin. Mined "crypto-mining style" when training
//                     SUCCESS is measured from the sub-weights of a character, a
//                     dyad, or a cluster. Fixed base price £0.01 — ten times a
//                     Silver coin, so 10 Silver = 1 Gold by value. Training that
//                     improves a character both mines coin AND produces the
//                     training data: one pass, no wasted compute.
//
// Prices are managed by AccountantClaw (the monetization wizard): the *base* price
// is a fixed floor, but the *current* price can be raised above it as the platform
// takes off. Everything here is pure (no DB, no DOM) so it is safe to import from
// both the React pages and the server API — the database stores only raw ledger
// rows and a settings singleton; these helpers turn them into pounds.

// ---------------------------------------------------------------- denominations

// Coin amounts are stored in the ledger as integer MILLI-COINS (1000 milli = one
// whole coin). Storing thousandths keeps all arithmetic in integers while still
// supporting the fractional Ask-page bonus (e.g. half a Silver coin = 500 milli).
export const MILLI = 1000

// Prices are stored as integer MILLI-POUNDS (1000 milli-pounds = £1). So £0.001
// is 1 milli-pound and £0.01 is 10 milli-pounds. Integer prices mean AccountantClaw
// can nudge a price up by whole tenths-of-a-penny without floating-point drift.
export const MILLIPOUNDS_PER_POUND = 1000

export type Coin = 'silver' | 'gold'

export type CoinMeta = {
  key: Coin
  label: string
  symbol: string
  emoji: string
  // The fixed price floor in milli-pounds. AccountantClaw may raise the live
  // price above this but never below it.
  basePrice: number
  color: string
  blurb: string
}

export const COINS: Record<Coin, CoinMeta> = {
  silver: {
    key: 'silver',
    label: 'Silver CC',
    symbol: 'sCC',
    emoji: '🥈',
    basePrice: 1, // £0.001 — one tenth of a penny
    color: '#c0c7d1',
    blurb: 'The interaction coin — minted from every character chat.',
  },
  gold: {
    key: 'gold',
    label: 'Gold CC',
    symbol: 'gCC',
    emoji: '🥇',
    basePrice: 10, // £0.01 — ten Silver coins by value
    color: '#f5c451',
    blurb: 'The training coin — mined from measured training success.',
  },
}

export const COIN_LIST: CoinMeta[] = [COINS.silver, COINS.gold]

// ── Surface coins — the engagement-monetization layer ────────────────────────
//
// Beyond Silver/Gold, each CharacterVerse surface mints its OWN coin from real,
// high-signal engagement. These are additive: they are stored in the same ledger
// (the `coin` column just takes a new key) and valued the same way (milli-pounds),
// but they are minted by surface events rather than chat or training.
//
//   CS · Character Social Coin — CVS social engagement (bulletins, wall signatures)
//   CJ · Character Jobs Coin   — CVJ successful job deployments (delivered orders)
//   CV · Character Video Coin  — CVV video uploads and views
//   CA · Character Agent Coin  — CAZ agentic entanglement (adopting, shadow-on)
//
// Chatting with adopted characters (1-1, group, conference) still mints Silver CC
// as before — the surface coins sit alongside it, not instead of it.
export type SurfaceCoin = 'cs' | 'cj' | 'cv' | 'ca'
export type AnyCoin = Coin | SurfaceCoin

export type SurfaceCoinMeta = {
  key: SurfaceCoin
  label: string
  symbol: string
  emoji: string
  basePrice: number // milli-pounds, fixed floor (as with Silver/Gold)
  color: string
  surface: string
  surfacePath: string
  blurb: string
  // The engagement events that mint this coin (shown in the UI legend).
  mints: string[]
}

export const SURFACE_COINS: Record<SurfaceCoin, SurfaceCoinMeta> = {
  cs: {
    key: 'cs', label: 'Character Social Coin', symbol: 'CS', emoji: '🫂', basePrice: 2, color: '#5c74b8',
    surface: 'CharacterVerse Social', surfacePath: '/social',
    blurb: 'Minted from real social engagement on the Human Anchor Network.',
    mints: ['Posting a bulletin', 'Signing a wall', 'More engagement soon'],
  },
  cj: {
    key: 'cj', label: 'Character Jobs Coin', symbol: 'CJ', emoji: '💼', basePrice: 8, color: '#1dbf73',
    surface: 'CharacterVerse Jobs', surfacePath: '/cvj',
    blurb: 'Minted from successful agentic job deployments.',
    mints: ['A delivered order', 'More deploy rewards soon'],
  },
  cv: {
    key: 'cv', label: 'Character Video Coin', symbol: 'CV', emoji: '📼', basePrice: 1, color: '#cc181e',
    surface: 'CharacterVerse Video', surfacePath: '/cvv',
    blurb: 'Minted from video uploads and the views they earn.',
    mints: ['Uploading a tape', 'Each view your tapes earn', 'More soon'],
  },
  ca: {
    key: 'ca', label: 'Character Agent Coin', symbol: 'CA', emoji: '🛰️', basePrice: 10, color: '#7c5cbf',
    surface: 'CharacterVerse Agentz Zone', surfacePath: '/caz',
    blurb: 'Minted from agentic entanglement — binding a human to an agent.',
    mints: ['Adopting a character', 'Turning shadowing on', 'More entanglements soon'],
  },
}

export const SURFACE_COIN_LIST: SurfaceCoinMeta[] = [SURFACE_COINS.cs, SURFACE_COINS.cj, SURFACE_COINS.cv, SURFACE_COINS.ca]

export const ALL_COIN_KEYS: AnyCoin[] = ['silver', 'gold', 'cs', 'cj', 'cv', 'ca']

// Base price (milli-pounds) for any coin — Silver/Gold from COINS, surface coins
// from SURFACE_COINS. Used to value a wallet in £.
export function basePriceOf(coin: AnyCoin): number {
  if (coin === 'silver' || coin === 'gold') return COINS[coin].basePrice
  return SURFACE_COINS[coin]?.basePrice ?? 1
}

export function coinEmoji(coin: AnyCoin): string {
  if (coin === 'silver' || coin === 'gold') return COINS[coin].emoji
  return SURFACE_COINS[coin]?.emoji ?? '🪙'
}

export function coinLabel(coin: AnyCoin): string {
  if (coin === 'silver' || coin === 'gold') return COINS[coin].label
  return SURFACE_COINS[coin]?.label ?? coin
}

export function coinColor(coin: AnyCoin): string {
  if (coin === 'silver' || coin === 'gold') return COINS[coin].color
  return SURFACE_COINS[coin]?.color ?? '#9090b0'
}

export function coinSymbol(coin: AnyCoin): string {
  if (coin === 'silver' || coin === 'gold') return COINS[coin].symbol
  return SURFACE_COINS[coin]?.symbol ?? coin.toUpperCase()
}

// 10 Silver = 1 Gold (by base value). Exposed for the UI's conversion helper.
export const SILVER_PER_GOLD = COINS.gold.basePrice / COINS.silver.basePrice // 10

// ------------------------------------------------------------- silver earn rates

// Silver is minted per interaction. Single and merged (twin) character chat both
// earn the base +1; richer, higher-order features earn progressively more as the
// interaction deepens. Keyed by the engagement channel that produced it. Whole
// coins (the minter multiplies by MILLI when writing the ledger).
export type SilverChannel = 'chat' | 'merged' | 'claw' | 'conference' | 'mission'

export const SILVER_RATES: Record<SilverChannel, number> = {
  chat: 1, // 🔵 single character chat          +1 sCC
  merged: 1, // 🟢 merged / twin character chat   +1 sCC
  claw: 2, // 🟡 CharacterClaw companion        +2 sCC
  conference: 3, // 🟣 conference cluster             +3 sCC
  mission: 5, // 🛰️ autonomous mission deliverable +5 sCC
}

export const SILVER_CHANNEL_LABEL: Record<SilverChannel, string> = {
  chat: 'Single character chat',
  merged: 'Merged / twin chat',
  claw: 'CharacterClaw companion',
  conference: 'Conference cluster',
  mission: 'Autonomous mission',
}

// --------------------------------------------------------------- gold mine rates

// Gold is mined when a training block succeeds — success measured from the
// sub-weights of one of three training scopes. Whole coins.
export type GoldScope = 'character' | 'dyad' | 'cluster'

export const GOLD_RATES: Record<GoldScope, number> = {
  character: 1, // a character sub-weight improved (one applied training signal) +1 gCC
  dyad: 2, // a dyad sleep-cycle consolidation landed                       +2 gCC
  cluster: 3, // a cluster incarnation promoted (improved on its last life)   +3 gCC
}

export const GOLD_SCOPE_LABEL: Record<GoldScope, string> = {
  character: 'Character training',
  dyad: 'Dyad training',
  cluster: 'Cluster training',
}

// --------------------------------------------------------------------- Ask bonus

// The Ask (LLM) page grants every account a single, one-off fractional Silver
// bonus the first time they run a bonus task — a welcome sweetener that seeds the
// economy. Stored in milli-coins; the default is half a Silver coin.
export const ASK_BONUS_DEFAULT_MILLI = 500 // 0.5 sCC

// ----------------------------------------------------------------- settings type

// The AccountantClaw-managed settings singleton (mirrors the coin_settings row).
// Prices are milli-pounds; rate maps are whole coins.
export type CoinSettings = {
  silverPrice: number
  goldPrice: number
  silverRates: Record<SilverChannel, number>
  goldRates: Record<GoldScope, number>
  askBonusMilli: number
  // 'fixed' holds prices at base; 'dynamic' lets AccountantClaw raise them as the
  // platform grows. Either way the base is always the floor.
  pricingMode: 'fixed' | 'dynamic'
  notes: string
}

export function defaultSettings(): CoinSettings {
  return {
    silverPrice: COINS.silver.basePrice,
    goldPrice: COINS.gold.basePrice,
    silverRates: { ...SILVER_RATES },
    goldRates: { ...GOLD_RATES },
    askBonusMilli: ASK_BONUS_DEFAULT_MILLI,
    pricingMode: 'fixed',
    notes: '',
  }
}

// Coerce arbitrary JSON (DB row / request body) into safe settings, clamping each
// price to its base floor and bounding the rates so the economy can never invert.
export function coerceSettings(raw: any): CoinSettings {
  const d = defaultSettings()
  if (!raw || typeof raw !== 'object') return d
  const price = (v: any, floor: number) => {
    const n = Math.floor(Number(v))
    return Number.isFinite(n) ? Math.min(1_000_000, Math.max(floor, n)) : floor
  }
  const rate = (v: any, fallback: number) => {
    const n = Math.floor(Number(v))
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback
  }
  const silverRates = {} as Record<SilverChannel, number>
  for (const k of Object.keys(SILVER_RATES) as SilverChannel[]) {
    silverRates[k] = rate(raw.silverRates?.[k], SILVER_RATES[k])
  }
  const goldRates = {} as Record<GoldScope, number>
  for (const k of Object.keys(GOLD_RATES) as GoldScope[]) {
    goldRates[k] = rate(raw.goldRates?.[k], GOLD_RATES[k])
  }
  return {
    silverPrice: price(raw.silverPrice, COINS.silver.basePrice),
    goldPrice: price(raw.goldPrice, COINS.gold.basePrice),
    silverRates,
    goldRates,
    askBonusMilli: Math.min(
      10_000,
      Math.max(0, Math.floor(Number(raw.askBonusMilli)) || ASK_BONUS_DEFAULT_MILLI),
    ),
    pricingMode: raw.pricingMode === 'dynamic' ? 'dynamic' : 'fixed',
    notes: String(raw.notes ?? '').slice(0, 500),
  }
}

// ------------------------------------------------------------- value conversions

// Pounds value of an amount of milli-coins at a given milli-pound price.
//   gbp = (milliCoins / MILLI) coins × (price / MILLIPOUNDS_PER_POUND) £/coin
export function gbpFromMilli(milliCoins: number, priceMilliPounds: number): number {
  return (milliCoins * priceMilliPounds) / (MILLI * MILLIPOUNDS_PER_POUND)
}

// Pounds value of a price expressed in milli-pounds. e.g. 1 → 0.001, 10 → 0.01.
export function priceGbp(priceMilliPounds: number): number {
  return priceMilliPounds / MILLIPOUNDS_PER_POUND
}

// How far the live price sits above its fixed base, as a percentage (0 = at floor).
export function priceUplift(coin: Coin, priceMilliPounds: number): number {
  const base = COINS[coin].basePrice
  return base > 0 ? Math.round(((priceMilliPounds - base) / base) * 100) : 0
}

// ----------------------------------------------------------------- AccountantClaw

// AccountantClaw's price suggestion: a monetization wizard that nudges the live
// price up as adoption (total coins in circulation) climbs, never below the base.
// Deterministic so it works with or without the LLM — the LLM narrates; this sets
// the number. Roughly +10% per order of magnitude of circulation, capped at 5×.
export function suggestPrice(coin: Coin, circulatingCoins: number): number {
  const base = COINS[coin].basePrice
  const reach = Math.max(0, Math.log10(Math.max(1, circulatingCoins)))
  const multiplier = Math.min(5, 1 + reach * 0.1)
  return Math.max(base, Math.round(base * multiplier))
}

// ----------------------------------------------------------------- formatting

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

export function formatGbp(pounds: number): string {
  return GBP.format(pounds || 0)
}

// Format milli-coins as a human coin amount, e.g. 1500 → "1.5", 1000 → "1".
export function formatCoins(milliCoins: number): string {
  const coins = (milliCoins || 0) / MILLI
  const fixed = Number.isInteger(coins) ? coins.toString() : coins.toFixed(coins < 1 ? 2 : 1)
  return new Intl.NumberFormat('en-GB').format(Number(fixed)) + (fixed.includes('.') ? '' : '')
}

export function formatCoinsExact(milliCoins: number): string {
  const coins = (milliCoins || 0) / MILLI
  return coins % 1 === 0 ? coins.toLocaleString('en-GB') : coins.toLocaleString('en-GB', { maximumFractionDigits: 3 })
}

// ── CVC · CharacterVerse Coins — the chat-inference coin ─────────────────────
//
// CVC is deliberately NOT money. Where Silver/Gold CC (and the surface coins)
// are what a creator *earns*, CVC is the "gas" a chatter *spends* to run
// character chat: every reply a character generates burns a little CVC, and
// every account is granted a starter balance the first time it chats so it
// always has gas to begin with.
//
// Because CVC represents usage rather than value it has NO price and never
// counts toward market value — which keeps the two ideas cleanly separated:
// earning and spending never blur. CVC rides the same coin ledger as every
// other coin (grants are positive rows, inference spends are negative ones), so
// balances need no extra table.
//
// Minting privilege belongs to AccountantClaw, the monetization wizard; the
// privilege can be revoked and re-granted from its admin deck.

export type UsageCoin = 'cvc'

export type UsageCoinMeta = {
  key: UsageCoin
  label: string
  short: string
  symbol: string
  emoji: string
  color: string
  blurb: string
}

export const CVC: UsageCoinMeta = {
  key: 'cvc',
  label: 'CharacterVerse Coin',
  short: 'CharacterVerse Coins',
  symbol: 'CVC',
  emoji: '🎫',
  color: '#7c9cff',
  blurb: 'The chat-inference coin — gas spent to run character chat. Not money: it has no price.',
}

/** Gas burned per character reply, in milli-coins. Default 1 CVC per reply. */
export const CVC_PER_REPLY_DEFAULT_MILLI = 1000

/** Starter gas granted the first time an account chats. Default 100 CVC. */
export const CVC_WELCOME_DEFAULT_MILLI = 100_000

/** Every coin that shows on a wallet — the monetization coins plus the gas coin. */
export const WALLET_COIN_KEYS: (AnyCoin | UsageCoin)[] = [...ALL_COIN_KEYS, 'cvc']

export function isUsageCoin(coin: string): coin is UsageCoin {
  return coin === 'cvc'
}

/** CVC has no price — it must never contribute to market value. */
export function priceOfAny(coin: string): number {
  return isUsageCoin(coin) ? 0 : basePriceOf(coin as AnyCoin)
}

export function anyCoinEmoji(coin: string): string {
  return isUsageCoin(coin) ? CVC.emoji : coinEmoji(coin as AnyCoin)
}

export function anyCoinLabel(coin: string): string {
  return isUsageCoin(coin) ? CVC.label : coinLabel(coin as AnyCoin)
}

export function anyCoinColor(coin: string): string {
  return isUsageCoin(coin) ? CVC.color : coinColor(coin as AnyCoin)
}

export function anyCoinSymbol(coin: string): string {
  return isUsageCoin(coin) ? CVC.symbol : coinSymbol(coin as AnyCoin)
}

// The CVC block of the AccountantClaw settings singleton. Kept alongside
// CoinSettings so one save writes the whole economy.
export type CvcSettings = {
  cvcPerReplyMilli: number
  cvcWelcomeMilli: number
  // AccountantClaw's minting privilege. When false, minting is blocked.
  accountantCanMintCvc: boolean
}

export function defaultCvcSettings(): CvcSettings {
  return {
    cvcPerReplyMilli: CVC_PER_REPLY_DEFAULT_MILLI,
    cvcWelcomeMilli: CVC_WELCOME_DEFAULT_MILLI,
    accountantCanMintCvc: true,
  }
}

export function coerceCvcSettings(raw: any): CvcSettings {
  const d = defaultCvcSettings()
  if (!raw || typeof raw !== 'object') return d
  const clamp = (v: any, fallback: number, max: number) => {
    const n = Math.floor(Number(v))
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback
  }
  return {
    cvcPerReplyMilli: clamp(raw.cvcPerReplyMilli, d.cvcPerReplyMilli, 1_000_000),
    cvcWelcomeMilli: clamp(raw.cvcWelcomeMilli, d.cvcWelcomeMilli, 100_000_000),
    accountantCanMintCvc: raw.accountantCanMintCvc !== false,
  }
}
