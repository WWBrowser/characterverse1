// Founding cast for CVS — the HAN's first human anchors. Seeded lazily and
// idempotently the first time the network is read, so the site feels alive on the
// very first visit. Seeded profiles carry an unusable password hash: they exist as
// real member rows but cannot be logged into — real humans create their own.

import { db } from '../../db/index.js'
import {
  socialMembers,
  socialBulletins,
  socialComments,
  socialFriendships,
} from '../../db/schema.js'
import { unusablePasswordHash } from './social-auth.js'

type SeedMember = {
  handle: string
  displayName: string
  accent: string
  mood: string
  status: string
  headline: string
  region: string
  pronouns: string
  values: string
  interests: string
  bio: string
}

const SEED_MEMBERS: SeedMember[] = [
  {
    handle: 'ada',
    displayName: 'Ada R.',
    accent: '#b5179e',
    mood: 'curious',
    status: 'reading old field notebooks ☕',
    headline: 'Anchored in first principles and second chances.',
    region: 'Lisbon, PT',
    pronouns: 'she/her',
    values: 'Honesty · Curiosity · Craft',
    interests: 'analog photography, tide pools, ambient music, bread',
    bio: "I keep a paper log of everything I learn. If we're friends, I'll probably send you a postcard from somewhere with bad wifi.",
  },
  {
    handle: 'marcus',
    displayName: 'Marcus V.',
    accent: '#2d6a4f',
    mood: 'grounded',
    status: 'planted forty trees this spring 🌳',
    headline: 'Local first. People over platforms.',
    region: 'Nairobi, KE',
    pronouns: 'he/him',
    values: 'Community · Patience · Repair',
    interests: 'community gardens, bicycle repair, jazz, chess',
    bio: 'I run a tool library in my neighborhood. Borrow the drill, keep the friendship.',
  },
  {
    handle: 'sol',
    displayName: 'Sol Nakamura',
    accent: '#f77f00',
    mood: 'making',
    status: 'soldering something that might beep 🔧',
    headline: 'Building small, kind machines.',
    region: 'Osaka, JP',
    pronouns: 'they/them',
    values: 'Play · Generosity · Wonder',
    interests: 'synths, kites, tea ceremony, 8-bit games',
    bio: 'Hardware hobbyist. I believe every object should have a tiny bit of joy hidden in it.',
  },
  {
    handle: 'noor',
    displayName: 'Noor A.',
    accent: '#3a0ca3',
    mood: 'reflective',
    status: 'writing letters to my future self ✉️',
    headline: 'Ethics is a daily practice, not a rulebook.',
    region: 'Amman, JO',
    pronouns: 'she/her',
    values: 'Justice · Empathy · Truth',
    interests: 'philosophy, calligraphy, hiking, documentary film',
    bio: 'Community organizer and part-time poet. Ask me about mutual aid.',
  },
  {
    handle: 'theo',
    displayName: 'Theo Brandt',
    accent: '#e63946',
    mood: 'wired',
    status: 'debugging the coffee machine, again ☕️',
    headline: 'Skeptic by trade, optimist by choice.',
    region: 'Berlin, DE',
    pronouns: 'he/him',
    values: 'Rigor · Openness · Humor',
    interests: 'security research, board games, cold water swimming',
    bio: 'I read the terms of service so you don\'t have to. Privacy nerd, proudly.',
  },
  {
    handle: 'maya',
    displayName: 'Maya Osei',
    accent: '#0077b6',
    mood: 'hopeful',
    status: 'teaching my niece to code 💾',
    headline: 'Lift as you climb.',
    region: 'Accra, GH',
    pronouns: 'she/her',
    values: 'Mentorship · Courage · Joy',
    interests: 'education, afrobeats, running, watercolor',
    bio: 'High-school teacher turned learning designer. Every kid deserves a good first computer.',
  },
  {
    handle: 'ren',
    displayName: 'Ren Delgado',
    accent: '#7209b7',
    mood: 'dreaming',
    status: 'sketching a comic about a lighthouse 🗼',
    headline: 'Stories are how humans anchor each other.',
    region: 'Manila, PH',
    pronouns: 'he/they',
    values: 'Imagination · Kindness · Honesty',
    interests: 'comics, folklore, cooking, star-gazing',
    bio: 'Illustrator and folklore collector. I trade drawings for good stories.',
  },
  {
    handle: 'juno',
    displayName: 'Juno Fischer',
    accent: '#06a77d',
    mood: 'steady',
    status: 'mapping the river cleanup route 🗺️',
    headline: 'Care for the commons.',
    region: 'Portland, US',
    pronouns: 'she/they',
    values: 'Stewardship · Honesty · Resilience',
    interests: 'ecology, cartography, folk guitar, foraging',
    bio: 'Field ecologist. I know where the good mushrooms are and I will never tell.',
  },
]

const SEED_BULLETINS: { handle: string; body: string }[] = [
  { handle: 'ada', body: 'New here from the analog world. Say hi if you still own a film camera 📷' },
  { handle: 'marcus', body: 'Tool library restocked: two ladders, a tile cutter, and endless goodwill.' },
  { handle: 'noor', body: 'Reminder that a small kindness compounds. Check on a neighbor today.' },
  { handle: 'sol', body: 'Made a synth out of a lunchbox. It only plays sad songs. Working as intended.' },
  { handle: 'theo', body: 'PSA: rotate your passwords, hug your friends, read the fine print.' },
  { handle: 'maya', body: 'Looking for donated laptops for my classroom — DM me if you can help 💻' },
]

const SEED_COMMENTS: { profile: string; author: string; body: string }[] = [
  { profile: 'ada', author: 'marcus', body: 'Welcome to CVS! Your postcards better be real 😄' },
  { profile: 'ada', author: 'ren', body: 'A fellow analog soul. Trade you a drawing for a photo?' },
  { profile: 'marcus', author: 'noor', body: 'The tool library is the best thing in our city. Truly.' },
  { profile: 'sol', author: 'theo', body: 'The sad lunchbox synth is a masterpiece. No notes.' },
  { profile: 'maya', author: 'juno', body: 'Sent you two laptops. Keep lifting as you climb 💙' },
  { profile: 'noor', author: 'ada', body: 'Your bulletins always land at the right time. Thank you.' },
]

// Accepted friendships that wire the founding cast together.
const SEED_FRIENDS: [string, string][] = [
  ['ada', 'marcus'],
  ['ada', 'ren'],
  ['ada', 'noor'],
  ['marcus', 'noor'],
  ['sol', 'theo'],
  ['maya', 'juno'],
  ['maya', 'marcus'],
  ['ren', 'sol'],
  ['theo', 'juno'],
  ['noor', 'maya'],
]

/**
 * Ensure the founding cast exists. Safe to call on every read: it no-ops once the
 * network has any members, and each insert stage is idempotent (member handles are
 * unique with onConflictDoNothing) so a cold stampede of simultaneous first
 * visitors cannot double-seed.
 */
export async function ensureSeeded(): Promise<void> {
  const existing = await db.select({ id: socialMembers.id }).from(socialMembers).limit(1)
  if (existing.length > 0) return

  await db
    .insert(socialMembers)
    .values(
      SEED_MEMBERS.map((m) => ({
        ...m,
        email: `${m.handle}@han.characterverse.local`,
        passwordHash: unusablePasswordHash(),
        seeded: true,
        profileViews: 40 + Math.floor(Math.random() * 900),
      })),
    )
    .onConflictDoNothing({ target: socialMembers.handle })

  // Map handle → id for the relational seed rows.
  const members = await db.select().from(socialMembers)
  const idOf = new Map(members.map((m) => [m.handle, m.id]))

  const bulletins = await db.select({ id: socialBulletins.id }).from(socialBulletins).limit(1)
  if (bulletins.length === 0) {
    await db.insert(socialBulletins).values(
      SEED_BULLETINS.flatMap((b) => {
        const memberId = idOf.get(b.handle)
        return memberId ? [{ memberId, body: b.body }] : []
      }),
    )
  }

  const comments = await db.select({ id: socialComments.id }).from(socialComments).limit(1)
  if (comments.length === 0) {
    await db.insert(socialComments).values(
      SEED_COMMENTS.flatMap((c) => {
        const profileId = idOf.get(c.profile)
        const authorId = idOf.get(c.author)
        return profileId && authorId ? [{ profileId, authorId, body: c.body }] : []
      }),
    )
  }

  const friends = await db.select({ id: socialFriendships.id }).from(socialFriendships).limit(1)
  if (friends.length === 0) {
    await db.insert(socialFriendships).values(
      SEED_FRIENDS.flatMap(([a, b]) => {
        const requesterId = idOf.get(a)
        const addresseeId = idOf.get(b)
        return requesterId && addresseeId
          ? [{ requesterId, addresseeId, status: 'accepted' }]
          : []
      }),
    )
  }
}
