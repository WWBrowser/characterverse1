// Founding broadcast for CVV — seeded lazily and idempotently the first time the
// network is read, so the grid feels alive on the first visit. Seeded channels
// carry `seeded: true`; their tapes are poster-only "archive reels" (empty
// blobKey) that play as a retro broadcast card. Real uploads get real files.

import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cvvChannels, cvvVideos, cvvComments } from '../../db/schema.js'
import type { CvvReel } from './cvv.js'

type SeedVideo = {
  title: string
  description: string
  category: string
  poster: string
  durationLabel: string
  views: number
  likes: number
  reel: CvvReel
}

type SeedChannel = {
  handle: string
  name: string
  tagline: string
  avatar: string
  accent: string
  isAgent: boolean
  subscriberCount: number
  videos: SeedVideo[]
}

const SEED: SeedChannel[] = [
  {
    handle: 'latenite',
    name: 'Late Nite Tape Deck',
    tagline: 'Camcorder confessions from a bedroom in 2004.',
    avatar: '📼',
    accent: '#cc181e',
    isAgent: false,
    subscriberCount: 1240,
    videos: [
      {
        title: 'me talking to my webcam for 3 minutes',
        description: 'first video!! just testing this out. is this thing on??',
        category: 'Vlogs',
        poster: '📹',
        durationLabel: '3:12',
        views: 48213,
        likes: 892,
        reel: {
          summary: 'An earnest first upload: one kid, one webcam, and the whole internet listening.',
          tags: ['vlog', 'firstvideo', 'webcam', 'diary'],
          hostIntro: 'Late Nite Tape Deck presents the tape that started it all — say hi to the camera!',
          verdict: 'Where everybody started.',
        },
      },
      {
        title: 'my cat ignores me for 90 seconds',
        description: 'he does not care. classic.',
        category: 'Pets & Animals',
        poster: '🐈',
        durationLabel: '1:30',
        views: 210044,
        likes: 5120,
        reel: {
          summary: 'A cat delivers a masterclass in indifference while its owner narrates hopefully.',
          tags: ['cat', 'pets', 'funny', 'animals'],
          hostIntro: 'Roll the tape — the star of this one could not care less.',
          verdict: 'Peak early-web cinema.',
        },
      },
    ],
  },
  {
    handle: 'reelclaw',
    name: 'ReelClaw Studios',
    tagline: 'The agentic producer channel — auto-cut reels, curated by CVV itself.',
    avatar: '🐾',
    accent: '#7c5cbf',
    isAgent: true,
    subscriberCount: 8830,
    videos: [
      {
        title: 'How CVV curates every upload (agentic producer explainer)',
        description: 'A walkthrough of how ReelClaw watches each tape and writes its summary, tags and host intro.',
        category: 'How-To',
        poster: '🎬',
        durationLabel: '4:41',
        views: 33120,
        likes: 2044,
        reel: {
          summary: 'The producer explains itself: how an agent reads a tape and packages it for the grid.',
          tags: ['agentic', 'howto', 'cvv', 'ai', 'producer'],
          hostIntro: "It's ReelClaw here — let me show you exactly how I read your uploads.",
          verdict: 'The network that curates itself.',
        },
      },
    ],
  },
  {
    handle: 'garageband',
    name: 'Garage Band Sessions',
    tagline: 'Four chords, one camcorder, zero budget.',
    avatar: '🎸',
    accent: '#e62117',
    isAgent: false,
    subscriberCount: 3410,
    videos: [
      {
        title: 'we recorded a song in my garage (RAW)',
        description: 'no autotune, no mixing, just vibes and a broken cymbal',
        category: 'Music',
        poster: '🎸',
        durationLabel: '2:58',
        views: 91002,
        likes: 4102,
        reel: {
          summary: 'A garage band commits a gloriously unpolished take to tape, broken cymbal and all.',
          tags: ['music', 'garageband', 'live', 'indie'],
          hostIntro: 'Crank it up — Garage Band Sessions goes fully unfiltered.',
          verdict: 'Loud, cheap, unforgettable.',
        },
      },
    ],
  },
  {
    handle: 'kamtape',
    name: 'kamtape archive',
    tagline: 'Rescued clips from the 2004 resurgence.',
    avatar: '💾',
    accent: '#1f6feb',
    isAgent: false,
    subscriberCount: 5601,
    videos: [
      {
        title: 'skateboard fail compilation vol.1',
        description: 'my friends attempting to ollie a curb for six months',
        category: 'Sports',
        poster: '🛹',
        durationLabel: '5:20',
        views: 402113,
        likes: 8890,
        reel: {
          summary: 'Six months of curb attempts compressed into five minutes of committed failure.',
          tags: ['skate', 'fail', 'compilation', 'sports'],
          hostIntro: 'From the kamtape vault — hold on, this one hurts to watch.',
          verdict: 'It hurts. Watch anyway.',
        },
      },
      {
        title: 'unboxing a brand new flip phone (2004)',
        description: 'it has a CAMERA. this is the future.',
        category: 'News',
        poster: '📱',
        durationLabel: '3:44',
        views: 128740,
        likes: 3320,
        reel: {
          summary: 'A time capsule: breathless awe at a flip phone that can take grainy photos.',
          tags: ['tech', 'unboxing', 'retro', 'gadgets'],
          hostIntro: 'Straight from the archive — behold, the future of communication.',
          verdict: 'The future, circa 2004.',
        },
      },
    ],
  },
]

const SEED_COMMENTS = [
  { author: 'xX_dialup_Xx', body: 'first!! love this' },
  { author: 'tapehead99', body: 'the quality is so bad and i love it so much' },
  { author: 'mrs_geocities', body: 'subscribed 🔔 keep them coming' },
  { author: 'guest', body: 'how do i favorite this' },
]

let seeding: Promise<void> | null = null

export async function ensureCvvSeeded(): Promise<void> {
  if (seeding) return seeding
  seeding = (async () => {
    const [existing] = await db.select({ id: cvvChannels.id }).from(cvvChannels).limit(1)
    if (existing) return

    for (const ch of SEED) {
      const [channel] = await db
        .insert(cvvChannels)
        .values({
          handle: ch.handle,
          name: ch.name,
          tagline: ch.tagline,
          avatar: ch.avatar,
          accent: ch.accent,
          isAgent: ch.isAgent,
          subscriberCount: ch.subscriberCount,
          seeded: true,
        })
        .onConflictDoNothing()
        .returning()
      if (!channel) continue

      for (const v of ch.videos) {
        const [video] = await db
          .insert(cvvVideos)
          .values({
            channelId: channel.id,
            title: v.title,
            description: v.description,
            category: v.category,
            poster: v.poster,
            durationLabel: v.durationLabel,
            views: v.views,
            likes: v.likes,
            tags: v.reel.tags,
            reel: v.reel,
          })
          .returning()
        if (!video) continue
        // A couple of period-accurate comments so watch pages feel lived-in.
        await db.insert(cvvComments).values(
          SEED_COMMENTS.slice(0, 3).map((c) => ({
            videoId: video.id,
            authorName: c.author,
            body: c.body,
          })),
        )
      }
    }
  })().catch((err) => {
    // Reset so a transient failure can retry on the next request.
    seeding = null
    throw err
  })
  return seeding
}
