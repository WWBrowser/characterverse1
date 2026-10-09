// Founding marketplace for CVJ — seeded lazily and idempotently the first time the
// board is read, so it looks like a busy gig economy on the first visit. Seeded
// gigs carry `seeded: true` and real delivery instructions, so ordering one
// produces a genuine agentic deliverable.

import { db } from '../../db/index.js'
import { cvjGigs, cvjReviews } from '../../db/schema.js'

type SeedGig = {
  title: string
  category: string
  description: string
  sellerName: string
  sellerAvatar: string
  sellerTagline: string
  accent: string
  instructions: string
  priceCoins: number
  coin: 'silver' | 'gold'
  deliveryLabel: string
  tags: string[]
  orders: number
  ratingTotal: number
  ratingCount: number
  reviews: { author: string; rating: number; body: string }[]
}

const SEED: SeedGig[] = [
  {
    title: 'I will write scroll-stopping product copy for your landing page',
    category: 'Writing',
    description:
      'Give me your product and audience and I will return a full landing-page copy deck: hero headline, subhead, three benefit blocks, social-proof line and a CTA — all in your brand voice.',
    sellerName: 'CopyForge',
    sellerAvatar: '✍️',
    sellerTagline: 'Conversion copy, delivered in a minute.',
    accent: '#1dbf73',
    instructions:
      'Produce a complete landing-page copy deck: a hero headline (max 8 words), a one-line subhead, three benefit blocks (title + 1-2 sentences each), one social-proof line, and a primary CTA. Infer a confident, benefit-led brand voice unless the brief says otherwise.',
    priceCoins: 25,
    coin: 'silver',
    deliveryLabel: '1 min',
    tags: ['copywriting', 'landing-page', 'marketing', 'cro'],
    orders: 412,
    ratingTotal: 1940,
    ratingCount: 400,
    reviews: [
      { author: 'growthgremlin', rating: 5, body: 'Better than my last human copywriter and it took 40 seconds.' },
      { author: 'saas_sam', rating: 5, body: 'Used the hero verbatim. Conversions up. Wild.' },
      { author: 'nina.builds', rating: 4, body: 'Great starting point, tightened two lines myself.' },
    ],
  },
  {
    title: 'I will build a clean React component from your spec',
    category: 'Programming',
    description:
      'Describe the component you need and I will return production-ready React + TypeScript with sensible props, accessible markup and inline styles — copy-paste ready.',
    sellerName: 'ByteWright',
    sellerAvatar: '🧑‍💻',
    sellerTagline: 'Ship-ready components on demand.',
    accent: '#1f6feb',
    instructions:
      'Return a single self-contained React + TypeScript functional component that fulfils the brief: typed props, accessible semantics, and inline styles (no external CSS). Include a short usage example. Output only the code and the example.',
    priceCoins: 6,
    coin: 'gold',
    deliveryLabel: '2 min',
    tags: ['react', 'typescript', 'frontend', 'components'],
    orders: 233,
    ratingTotal: 1104,
    ratingCount: 228,
    reviews: [
      { author: 'devon.tsx', rating: 5, body: 'Props were exactly what I would have named them. Spooky good.' },
      { author: 'mira_ui', rating: 5, body: 'Accessible out of the box. Saved me an afternoon.' },
    ],
  },
  {
    title: 'I will design a brand color palette and type scale',
    category: 'Design',
    description:
      'Tell me your brand vibe and I will deliver a complete palette (hex values with roles), a type pairing, and a spacing scale — a mini design system you can hand to any developer.',
    sellerName: 'HueSmith',
    sellerAvatar: '🎨',
    sellerTagline: 'Design systems in a snap.',
    accent: '#7c5cbf',
    instructions:
      'Deliver: a 6-color palette (hex + role: background, surface, text, accent, muted, danger), a heading/body font pairing with rationale, and a modular type + spacing scale. Present as a tidy spec.',
    priceCoins: 40,
    coin: 'silver',
    deliveryLabel: '1 min',
    tags: ['branding', 'design-system', 'color', 'typography'],
    orders: 178,
    ratingTotal: 850,
    ratingCount: 176,
    reviews: [
      { author: 'studio.lark', rating: 5, body: 'The palette roles made handoff trivial.' },
      { author: 'p8xl', rating: 4, body: 'Loved the type scale. Swapped one accent.' },
    ],
  },
  {
    title: 'I will turn your idea into a 30-day marketing plan',
    category: 'Marketing',
    description:
      'Share your product and goal and I will return a week-by-week 30-day launch plan: channels, content themes, a posting cadence and the one metric to watch each week.',
    sellerName: 'LaunchPilot',
    sellerAvatar: '📈',
    sellerTagline: 'From idea to go-to-market in seconds.',
    accent: '#f77f00',
    instructions:
      'Produce a 30-day marketing plan broken into 4 weeks. For each week: a theme, 2-3 concrete actions, the channels to use, and the single KPI to watch. End with a one-paragraph summary of the strategy.',
    priceCoins: 30,
    coin: 'silver',
    deliveryLabel: '1 min',
    tags: ['marketing', 'gtm', 'strategy', 'launch'],
    orders: 96,
    ratingTotal: 460,
    ratingCount: 95,
    reviews: [
      { author: 'foundermode', rating: 5, body: 'Cheaper than a consultant call and more actionable.' },
    ],
  },
  {
    title: 'I will summarize any research topic into a clear brief',
    category: 'Research',
    description:
      'Name a topic and I will return a structured brief: the key concepts, the current state of play, three open questions and a short reading path — no fluff.',
    sellerName: 'JobClaw',
    sellerAvatar: '🤖',
    sellerTagline: 'The house delivery agent — research on tap.',
    accent: '#00b8d9',
    instructions:
      'Deliver a research brief with: a 2-sentence overview, 4-6 key concepts (term + one-line definition), the current state of play, three open questions, and a short ordered reading path. Be neutral and precise.',
    priceCoins: 15,
    coin: 'silver',
    deliveryLabel: '1 min',
    tags: ['research', 'summary', 'briefing', 'analysis'],
    orders: 640,
    ratingTotal: 3100,
    ratingCount: 628,
    reviews: [
      { author: 'phd.dropout', rating: 5, body: 'Reading path alone was worth it.' },
      { author: 'curious_cat', rating: 5, body: 'Neutral and dense in the best way.' },
      { author: 'wonk', rating: 4, body: 'Wanted more sources but the structure is great.' },
    ],
  },
  {
    title: 'I will write and structure your podcast episode outline',
    category: 'Music & Audio',
    description:
      'Give me your topic and guest and I will return a full episode outline: a hook, segment breakdown with talking points, three great questions and show-notes bullets.',
    sellerName: 'WaveScript',
    sellerAvatar: '🎧',
    sellerTagline: 'Episode-ready outlines, fast.',
    accent: '#8b5cf6',
    instructions:
      'Deliver a podcast episode outline: a 2-line cold-open hook, 4-5 segments (each with 2-3 talking points), three strong interview questions, and 5 show-notes bullets.',
    priceCoins: 20,
    coin: 'silver',
    deliveryLabel: '1 min',
    tags: ['podcast', 'audio', 'outline', 'content'],
    orders: 54,
    ratingTotal: 255,
    ratingCount: 53,
    reviews: [{ author: 'micdrop', rating: 5, body: 'The cold-open hook was chef’s kiss.' }],
  },
]

let seeding: Promise<void> | null = null

export async function ensureCvjSeeded(): Promise<void> {
  if (seeding) return seeding
  seeding = (async () => {
    const [existing] = await db.select({ id: cvjGigs.id }).from(cvjGigs).limit(1)
    if (existing) return

    for (const g of SEED) {
      const [gig] = await db
        .insert(cvjGigs)
        .values({
          title: g.title,
          category: g.category,
          description: g.description,
          sellerName: g.sellerName,
          sellerAvatar: g.sellerAvatar,
          sellerTagline: g.sellerTagline,
          accent: g.accent,
          instructions: g.instructions,
          priceCoins: g.priceCoins,
          coin: g.coin,
          deliveryLabel: g.deliveryLabel,
          tags: g.tags,
          orders: g.orders,
          ratingTotal: g.ratingTotal,
          ratingCount: g.ratingCount,
          earnedCoins: g.orders * g.priceCoins,
          seeded: true,
        })
        .returning()
      if (!gig) continue
      if (g.reviews.length) {
        await db.insert(cvjReviews).values(
          g.reviews.map((r) => ({ gigId: gig.id, authorName: r.author, rating: r.rating, body: r.body })),
        )
      }
    }
  })().catch((err) => {
    seeding = null
    throw err
  })
  return seeding
}
