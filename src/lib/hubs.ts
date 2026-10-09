// Briefcase navigation — CharacterVerse is organized around a handful of focused hubs.
// Every tool lives inside a hub as a tab rather than as its own top-level nav
// entry. Each tab keeps its own route (so existing links/bookmarks still work);
// the hub is a lightweight band (title + tab bar) rendered above the page in
// __root, and navigating a tab simply swaps to that tab's real route — so only
// the tab you are looking at is ever mounted.

import {
  Home,
  Palette,
  Trophy,
  FlaskConical,
  Building2,
  Crown,
  type LucideIcon,
} from 'lucide-react'

export type HubTab = { to: string; label: string }

export type Hub = {
  key: string
  /** The hub's landing route (its first tab). */
  to: string
  /** Label shown in the top navigation. */
  nav: string
  icon: LucideIcon
  /** Big title shown in the hub band. */
  title: string
  subtitle: string
  tabs: HubTab[]
}

export const HUBS: Hub[] = [
  {
    key: 'discover',
    to: '/discover',
    nav: 'Discover',
    icon: Home,
    title: 'Discover',
    subtitle:
      'Find a character to chat with, ask anything, create your own, or head into learning — it all starts here.',
    tabs: [
      { to: '/discover', label: 'Discover' },
      { to: '/search', label: 'Search' },
      { to: '/ask', label: 'Ask' },
      { to: '/create', label: 'Create' },
      { to: '/characterclaw', label: 'CharacterClaw' },
      { to: '/workspace', label: 'Workspace' },
      { to: '/learn', label: 'Learn' },
    ],
  },
  {
    key: 'art',
    to: '/art',
    nav: 'Art',
    icon: Palette,
    title: 'Art Studio',
    subtitle:
      'Three studios, seven live generators — one traces a polar wave and folds it around the centre, one advects a vortex across the plane and colours it by heading, one solves a grown formula at every pixel, one interpolates a lattice of seeded gradients, one throws two thousand embers from a single point and lets them fly straight, one splices a stack of images into a sixteen-colour recipe and paints what that mixture specifies, and one builds a composition of blended shapes and garbled type only to tear it apart with a corruption pass that reads the frame it is writing — all painting one-of-a-kind pieces from a seed, with ArtisticClaw and WondersClaw to help you write the prompt, entangled at whatever blend you like, and any piece usable as a character card image and avatar.',
    tabs: [
      { to: '/art', label: 'Art Studio' },
      { to: '/artv2', label: 'Art StudioV2' },
      { to: '/artv3', label: 'Art StudioV3' },
      { to: '/art-method', label: 'How it works' },
    ],
  },
  {
    key: 'leaderboard',
    to: '/leaderboard',
    nav: 'Leaderboard',
    icon: Trophy,
    title: 'Leaderboard',
    subtitle: 'The community rankings, the collaborative Joint Board, and a board for each engagement coin — plus your wallet & vault.',
    tabs: [
      { to: '/leaderboard', label: 'Leaderboard' },
      { to: '/collab', label: 'Joint Board' },
      { to: '/board/cs', label: '🫂 Social Coin' },
      { to: '/board/cj', label: '💼 Jobs Coin' },
      { to: '/board/cv', label: '📼 Video Coin' },
      { to: '/board/ca', label: '🛰️ Agent Coin' },
      { to: '/wallet', label: 'Wallet & Vault' },
    ],
  },
  {
    key: 'training',
    to: '/training',
    nav: 'Training Room',
    icon: FlaskConical,
    title: 'Character Training Control Room',
    subtitle:
      'One command room for training your characters — profiles, bounties, memory, cron, RouteClaw, ICQE, neural training and clusters, all draining into the Agentic Codex.',
    tabs: [
      { to: '/training', label: 'Training' },
      { to: '/bounties', label: 'Bounties' },
      { to: '/memory', label: 'Memory' },
      { to: '/cron', label: 'Cron' },
      { to: '/routeclaw', label: 'RouteClaw' },
      { to: '/icqe', label: 'ICQE' },
      { to: '/neural', label: 'Neural Training' },
      { to: '/clusters', label: 'Clusters' },
      { to: '/codex', label: '🌱 Agentic Codex' },
    ],
  },
  {
    key: 'enterprise',
    to: '/enterprise',
    nav: 'Enterprise',
    icon: Building2,
    title: 'Enterprise',
    subtitle:
      'The full enterprise stack in one place — the AI Control Tower, ChatCabinet, FileChat and the Audit dashboard, all behind one workspace gate.',
    tabs: [
      { to: '/enterprise', label: 'Overview' },
      { to: '/controltower', label: 'Control Tower' },
      { to: '/cabinet', label: 'ChatCabinet' },
      { to: '/filechat', label: 'FileChat' },
      { to: '/audit', label: 'Audit' },
    ],
  },
  {
    key: 'studio',
    to: '/studio',
    nav: 'Studio',
    icon: Crown,
    title: 'Admin Studio',
    subtitle:
      'The control room for running the platform — the Studio workspace, AccountantClaw and the master calendar.',
    tabs: [
      { to: '/studio', label: 'Studio' },
      { to: '/accountantclaw', label: 'AccountantClaw' },
    ],
  },
]

/** The hub that owns a given pathname, if any (matches on a hub tab's route). */
export function findHub(pathname: string): Hub | undefined {
  return HUBS.find((hub) => hub.tabs.some((tab) => isTabActive(tab.to, pathname)))
}

/** A tab is active when the path equals it or is nested beneath it. */
export function isTabActive(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(to + '/')
}
