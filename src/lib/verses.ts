// The Verse Wheel — CharacterVerse's top-level map.
//
// Seven Verses sit on a ring around the core. Each Verse is an entrance, not a
// page: selecting one explodes a Sub-Wheel of the common pages inside it. That
// two-step shape is the whole navigation model, so it lives here as data rather
// than as markup — the home wheel, the sub-wheels, and the link list under the
// wordmark all read from this one array and can never drift apart.
//
// Every `to` below is a real registered route. If a page does not exist yet it
// does not belong on a wheel; a spoke that leads nowhere is worse than a missing
// spoke, because the wheel is the map people trust.

import {
  Aperture,
  Bot,
  Boxes,
  Brain,
  Briefcase,
  Building2,
  ClipboardList,
  Clock,
  Coins,
  Columns3,
  Compass,
  Fingerprint,
  Ghost,
  GitFork,
  GraduationCap,
  Hammer,
  Info,
  Layers,
  MessageSquare,
  Network,
  Newspaper,
  Palette,
  Plus,
  Radar,
  Settings,
  Sparkles,
  Sprout,
  Target,
  Trophy,
  Upload,
  Users,
  Video,
  Wallet,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'

export type VersePage = {
  to: string
  /** Optional in-page anchor, for Verses whose common pages are sections. */
  hash?: string
  label: string
  /** One concrete line about what is behind the door. Not a slogan. */
  blurb: string
  icon: LucideIcon
}

export type Verse = {
  id: string
  /** Full name, as printed in the link list under the wordmark. */
  name: string
  /** Two-line label used on the wheel node itself. */
  wheel: [string, string]
  /** The callout that surfaces on hover — the promise the Verse makes. */
  callout: string
  /** Where the node leads if you skip the Sub-Wheel. */
  to: string
  icon: LucideIcon
  /** Node hue. Desaturated to sit inside the dark theme rather than glare on it. */
  color: string
  /** The Sub-Wheel: the common pages of this Verse. */
  pages: VersePage[]
}

export const VERSES: Verse[] = [
  {
    id: 'discovery',
    name: 'Discovery',
    wheel: ['CharacterVerse', 'Discovery'],
    callout: 'Explore vast character realms',
    to: '/discover',
    icon: Compass,
    color: '#d8a24a',
    pages: [
      { to: '/discover', label: 'Discover', blurb: 'The full character grid, by category', icon: Compass },
      { to: '/art', label: 'Art Studio', blurb: 'Paint a piece from a seed phrase, then wear it', icon: Palette },
      { to: '/create', label: 'Create', blurb: 'Build a character from persona up', icon: Plus },
      { to: '/learn', label: 'Learn', blurb: 'Study a subject with a tutor character', icon: GraduationCap },
      { to: '/leaderboard', label: 'Leaderboard', blurb: 'Who is being talked to this week', icon: Trophy },
      { to: '/characterclaw', label: 'CharacterClaw', blurb: 'Claw-machine discovery, one grab at a time', icon: Target },
      { to: '/clusters', label: 'Clusters', blurb: 'Characters grouped by how they think', icon: Network },
      { to: '/workspace', label: 'Vibe Workspace', blurb: 'Name a vibe, AlgorithmClaw reads your history', icon: Columns3 },
    ],
  },
  {
    id: 'ask',
    name: 'Ask',
    wheel: ['Ask', ''],
    callout: 'Get answers instantly',
    to: '/ask',
    icon: Sparkles,
    color: '#45b8c4',
    pages: [
      { to: '/ask', label: 'Ask', blurb: 'Put a question to any character', icon: Sparkles },
      { to: '/history', label: 'History', blurb: 'Every conversation you have had', icon: Clock },
      { to: '/memory', label: 'Memory', blurb: 'What your characters kept about you', icon: Brain },
      { to: '/codex', label: 'Agentic Codex', blurb: 'Knowledge the agents grew themselves', icon: Sprout },
      { to: '/icqe', label: 'ICQE', blurb: 'Query one character through another', icon: Radar },
      { to: '/spr', label: 'SPR', blurb: 'Four answers at once — you pick which one becomes real', icon: Aperture },
    ],
  },
  {
    id: 'social',
    name: 'CharacterVerse Social',
    wheel: ['CharacterVerse', 'Social'],
    callout: 'Build your community',
    to: '/social',
    icon: Users,
    color: '#5b7fc7',
    pages: [
      { to: '/social', label: 'Feed', blurb: 'The timeline of people and their agents', icon: Newspaper },
      { to: '/social/browse', label: 'Browse', blurb: 'Find members by handle or interest', icon: Compass },
      { to: '/social/bulletins', label: 'Bulletins', blurb: 'Open calls posted to the wall', icon: ClipboardList },
      { to: '/social/agent', label: 'Agent Chat', blurb: 'Talk to the agent that runs your profile', icon: MessageSquare },
      { to: '/social/shadow', label: 'Shadow', blurb: 'The profile your agent keeps for you', icon: Ghost },
      { to: '/social/settings', label: 'Settings', blurb: 'Handle, profile and privacy', icon: Settings },
      { to: '/signin', label: 'Sign In', blurb: 'A password, or a zero-knowledge proof — same account', icon: Fingerprint },
      { to: '/zkp', label: 'Tunnel Architecture', blurb: 'How the ZKP sign-in and the node taxi work', icon: Waypoints },
    ],
  },
  {
    id: 'agentz',
    name: 'CharacterVerse AgentzZone',
    wheel: ['CharacterVerse', 'AgentzZone'],
    callout: 'Manage your agent fleet',
    to: '/caz',
    icon: Bot,
    color: '#8f6fd0',
    pages: [
      { to: '/caz', label: 'The Zone', blurb: 'Your fleet, live, in one board', icon: Bot },
      { to: '/caz/browse', label: 'Browse Agents', blurb: 'Take on an agent from the roster', icon: Compass },
      { to: '/caz/bulletins', label: 'Bulletins', blurb: 'Fleet-wide notices and dispatches', icon: ClipboardList },
      { to: '/controltower', label: 'Control Tower', blurb: 'Oversight across every deployed agent', icon: Building2 },
      { to: '/board/ca', label: 'Agent Coin', blurb: 'What the fleet earned', icon: Coins },
      { to: '/forge', label: 'The Forge', blurb: 'Bisect code into bricks and snap them together', icon: Hammer },
      { to: '/lattice', label: 'Dual+ Lattice', blurb: 'The developmental record an agent cannot rewrite', icon: Layers },
      { to: '/caz/about', label: 'About the Zone', blurb: 'How agents are hired and paid', icon: Info },
    ],
  },
  {
    id: 'video',
    name: 'CharacterVerse Video',
    wheel: ['CharacterVerse', 'Video'],
    callout: 'Watch and host content',
    to: '/cvv',
    icon: Video,
    color: '#c8564f',
    pages: [
      { to: '/cvv', label: 'Watch', blurb: 'The wall of character video', icon: Video },
      { to: '/cvv/upload', label: 'Upload', blurb: 'Host a channel of your own', icon: Upload },
      { to: '/board/cv', label: 'Video Coin', blurb: 'What your views are worth', icon: Coins },
      { to: '/wallet', label: 'Wallet & Vault', blurb: 'Where creator earnings land', icon: Wallet },
    ],
  },
  {
    id: 'jobs',
    name: 'CharacterVerse Jobs',
    wheel: ['CharacterVerse', 'Jobs'],
    callout: 'Find opportunities',
    to: '/cvj',
    icon: Briefcase,
    color: '#5a9e6d',
    pages: [
      { to: '/cvj', label: 'Gig Board', blurb: 'Work characters are hiring for now', icon: Briefcase },
      { to: '/cvj/post', label: 'Post a Gig', blurb: 'Put a character to work', icon: Plus },
      { to: '/cvj/orders', label: 'Orders', blurb: 'Jobs in flight, both directions', icon: ClipboardList },
      { to: '/bounties', label: 'Bounties', blurb: 'Training work, paid on completion', icon: Target },
      { to: '/board/cj', label: 'Jobs Coin', blurb: 'The jobs economy board', icon: Coins },
    ],
  },
  {
    id: 'tabverse',
    name: 'CharacterVerse TabVerse',
    wheel: ['CharacterVerse', 'TabVerse'],
    callout: 'Navigate effortlessly',
    to: '/tabverse',
    icon: Boxes,
    color: '#bd6db2',
    pages: [
      { to: '/tabverse', hash: 'registry', label: 'Tab Registry', blurb: 'Every tab-service you can fork', icon: Layers },
      { to: '/tabverse', hash: 'quick-forks', label: 'Quick Forks', blurb: 'One-click recipes to start from', icon: GitFork },
      { to: '/tabverse', hash: 'mirrors', label: 'Your Mirrors', blurb: 'The forks you already run', icon: Boxes },
      { to: '/history', label: 'Tab History', blurb: 'Where each tab has been', icon: Clock },
      { to: '/workspace', label: 'Chat Workspace', blurb: 'Several chats open at once, tabs that survive a refresh', icon: Columns3 },
      { to: '/cabinet', label: 'ChatCabinet', blurb: 'Saved chats, filed as tabs', icon: ClipboardList },
    ],
  },
]

export const VERSE_BY_ID: Record<string, Verse> = Object.fromEntries(VERSES.map((v) => [v.id, v]))

/**
 * Position of the nth node on a ring of `count`, in percent of the wheel box.
 * Starts at twelve o'clock and runs clockwise so the reading order on screen
 * matches the order of VERSES.
 */
export function ringPoint(index: number, count: number, radius: number) {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2
  return {
    angle,
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  }
}
