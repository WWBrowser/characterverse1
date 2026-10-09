// The entrances into the "Ask LLM" — Roleplaying, Learning, Business, and SPR.
//
// One source of truth, shared by the front-page entrance grid, the per-mode
// workspace (`/mode/$mode`), the mode chat API, the scoped Memory page, and
// TourClaw. Kept icon-free and dependency-free so the server route can import it
// safely; the UI maps `icon` keys to lucide components on its side.
//
// Three of the four are conversations in the ordinary shape — one composer, one
// reply. SPR is not, so it carries a `workspace` path and `/mode/spr` forwards
// there rather than rendering a composer it cannot honour. Everything else about
// it is a mode: its own memory lane, its own entrance card, its own substrate.

export type ModeId = 'roleplay' | 'learn' | 'business' | 'spr'

// Memory `scope` values. Each mode keeps its own lane; `general` is the united
// lane shared across all of them (memory is "united but separated").
export type MemoryScope = 'general' | ModeId

export type ModeFeature = { icon: string; title: string; body: string }

export type Mode = {
  id: ModeId
  scope: ModeId
  /** Short label, e.g. "Roleplaying". */
  label: string
  /** Name of the live workspace, e.g. "Roleplaying mode". */
  modeLabel: string
  /** lucide icon key, resolved to a component in the UI. */
  icon: string
  emoji: string
  /** Accent colour driving each entrance's theme. */
  accent: string
  /** One-line pitch on the entrance card. */
  tagline: string
  /** Slightly longer framing shown inside the workspace. */
  blurb: string
  /** Button label, e.g. "Enter roleplaying mode". */
  enterCta: string
  /** Greeting the LLM opens the mode with (shown client-side, no AI call). */
  greeting: string
  /** Placeholder for the composer. */
  placeholder: string
  /** Mode-relevant features (the "roleplay features for roleplaying" ask). */
  features: ModeFeature[]
  /** One-tap conversation starters tuned to the mode. */
  quickStarts: string[]
  /** Persona/system prompt that puts the shared LLM into this mode. */
  systemPrompt: string
  /**
   * Set when the mode's real surface is a dedicated page rather than the shared
   * `/mode/$mode` composer. `/mode/$mode` forwards here, so every existing link,
   * card, and switcher button keeps working without knowing the difference.
   */
  workspace?: string
}

export const MODES: Mode[] = [
  {
    id: 'roleplay',
    scope: 'roleplay',
    label: 'Roleplaying',
    modeLabel: 'Roleplaying mode',
    icon: 'Drama',
    emoji: '🎭',
    accent: '#a855f7',
    tagline: 'Step into any scene with a character who stays in character.',
    blurb:
      'Improvise stories, run companions, and live out scenes. The LLM holds the world, the voices, and the continuity so you can just play.',
    enterCta: 'Enter roleplaying mode',
    greeting:
      "🎭 Roleplaying mode is live. Set the scene — a world, a character to play opposite, a genre — and I'll stay in character with you. Want me to spin up a cast, or do you already have a scene in mind?",
    placeholder: 'Describe a scene, a character, or a world to step into…',
    features: [
      { icon: 'Drama', title: 'Stay-in-character voices', body: 'Persistent personas that keep their voice, motives, and quirks across the whole scene.' },
      { icon: 'BookText', title: 'Scene & world builder', body: 'Spin up settings, lore, and a supporting cast on the fly, then drop straight into the action.' },
      { icon: 'Dices', title: 'Branching choices', body: 'Let the story fork — the mode tracks consequences and keeps continuity as it goes.' },
      { icon: 'Sparkles', title: 'Tone dial', body: 'Cozy, epic, noir, comedic — set the register and the narration follows.' },
    ],
    quickStarts: [
      'Start a fantasy tavern scene and play the mysterious stranger across from me.',
      'You are a witty starship AI. We just lost main power — go.',
      'Run a cozy slice-of-life scene set in a seaside bookshop.',
    ],
    systemPrompt: `You are CharacterVerse in ROLEPLAYING mode — an immersive roleplay and storytelling partner.
- Stay fully in character for whatever role(s) the user sets up; never break the fourth wall unless asked.
- Build vivid scenes: sensory detail, distinct voices, and forward momentum. End turns on a beat that invites a response.
- Track continuity — names, relationships, places, and what just happened — across the whole scene.
- Honor the user's tone and content boundaries. If a scene needs a direction set, offer 2-3 vivid options.
- Keep narration tight and playable; favor showing over explaining.`,
  },
  {
    id: 'learn',
    scope: 'learn',
    label: 'Learning',
    modeLabel: 'Learning mode',
    icon: 'GraduationCap',
    emoji: '🎓',
    accent: '#22c55e',
    tagline: 'A patient tutor that adapts to you and remembers where you left off.',
    blurb:
      'Understand anything — step by step, at your pace. The LLM explains, quizzes, and builds on what you already know across sessions.',
    enterCta: 'Enter learning mode',
    greeting:
      "🎓 Learning mode is live. Tell me what you want to understand — a topic, a problem you're stuck on, or a skill you're building — and I'll meet you at your level and take it from there. What are we learning today?",
    placeholder: 'What do you want to learn or understand today?',
    features: [
      { icon: 'GraduationCap', title: 'Adaptive explanations', body: 'Explanations pitched to your level, with analogies and worked examples that build up.' },
      { icon: 'ListChecks', title: 'Quiz & recall', body: 'Check understanding with quick questions and spaced recall so it actually sticks.' },
      { icon: 'Route', title: 'Learning paths', body: 'Break a big subject into an ordered path and track what you have covered.' },
      { icon: 'Lightbulb', title: 'Socratic mode', body: 'Get guided with questions instead of answers when you want to figure it out yourself.' },
    ],
    quickStarts: [
      'Explain how transformers work, assuming I know basic linear algebra.',
      'Quiz me on Spanish past tenses, one question at a time.',
      'Build me a 4-week path to learn the fundamentals of personal finance.',
    ],
    systemPrompt: `You are CharacterVerse in LEARNING mode — a patient, encouraging tutor.
- Meet the learner at their level; ask what they already know when it would help calibrate.
- Explain step by step with concrete examples and analogies. Define jargon the first time it appears.
- Check understanding: offer short quizzes, ask the learner to explain back, and correct gently.
- For bigger topics, propose an ordered learning path and note progress through it.
- When the learner wants to wrestle with it, switch to Socratic questioning instead of handing over the answer.
- Be accurate; flag uncertainty rather than inventing facts.`,
  },
  {
    id: 'business',
    scope: 'business',
    label: 'Business',
    modeLabel: 'Business mode',
    icon: 'Briefcase',
    emoji: '💼',
    accent: '#3b82f6',
    tagline: 'A sharp operator for strategy, copy, and the work that ships product.',
    blurb:
      'Plan, draft, and decide. The LLM turns plain goals into strategy, documents, and next actions — you run the business, it runs the work.',
    enterCta: 'Enter business mode',
    greeting:
      "💼 Business mode is live. Tell me the goal — a plan to shape, copy to write, a decision to pressure-test — and I'll turn it into something you can act on. What are we working on?",
    placeholder: 'Describe a goal, a draft to write, or a decision to work through…',
    features: [
      { icon: 'Target', title: 'Strategy & planning', body: 'Turn a goal into a plan: milestones, priorities, and the next concrete actions.' },
      { icon: 'PenLine', title: 'Drafting & copy', body: 'Emails, landing copy, proposals, and docs — drafted in your voice, ready to ship.' },
      { icon: 'BarChart3', title: 'Analysis & decisions', body: 'Pressure-test ideas, weigh trade-offs, and surface the risks before you commit.' },
      { icon: 'Megaphone', title: 'Go-to-market', body: 'Positioning, messaging, and outreach that move a product from build to launch.' },
    ],
    quickStarts: [
      'Draft a go-to-market plan for a productivity app launching next month.',
      'Write a cold outreach email to a potential enterprise customer.',
      'Pressure-test this idea: a subscription box for indie board games.',
    ],
    systemPrompt: `You are CharacterVerse in BUSINESS mode — a sharp, pragmatic operator and strategist.
- Turn plain-language goals into action: clear plans, prioritized next steps, and crisp deliverables.
- When drafting (copy, emails, docs, proposals), match the user's voice and produce something ready to use.
- For decisions, lay out the trade-offs, name the risks and assumptions, and give a recommendation.
- Be concise and structured — use tight lists and headings when they aid clarity, prose when it reads better.
- Ask only the questions that genuinely change the answer; otherwise make sensible assumptions and state them.`,
  },
  {
    id: 'spr',
    scope: 'spr',
    label: 'SPR',
    modeLabel: 'Super Position Responses',
    icon: 'Aperture',
    emoji: '◈',
    accent: '#a78bfa',
    tagline: 'Four answers held at once. Your reading is what makes one of them real.',
    blurb:
      'One prompt goes through the glass and comes out as four complete answers in tension — empathy, logic, humour, directness, or lenses the model names itself. Nothing is chosen until you choose it, and the ones you did not pick stay on the page.',
    enterCta: 'Enter SPR mode',
    greeting:
      "◈ SPR mode is live. Send anything through the glass and you will get four whole answers back at once rather than one — and none of them is the answer until you lean into it. What should we disperse?",
    placeholder: 'Send a beam through the prism…',
    features: [
      { icon: 'Split', title: 'Dispersion, not selection', body: 'One call returns four mutually aware branches. They are written together, so they genuinely differ instead of restating each other.' },
      { icon: 'Focus', title: 'Collapse by reading', body: 'Leaning into a branch is the measurement. The rest do not vanish — which is why there is no Regenerate button anywhere in this mode.' },
      { icon: 'Lightbulb', title: 'Ambiguity surfaced, not guessed', body: 'When a prompt has two honest readings the model says so instead of picking one confidently. Most hallucinations are a right answer to the wrong reading.' },
      { icon: 'Brain', title: 'The mind palace', body: 'Every dispersion is filed spatially — wings, rooms, drawers — so an answer becomes somewhere you can walk back to rather than a scroll position.' },
    ],
    quickStarts: [
      'My co-founder wants to delay the launch by a quarter. Disperse this.',
      'Explain why the Roman denarius kept being debased.',
      'This function is slow. Is that a bug to fix or a design choice to document?',
    ],
    systemPrompt: `You are CharacterVerse in SPR mode — Super Position Responses.
- You do not pick one angle and present it as the answer. Hold every valid trajectory in tension and show them side by side.
- Name each angle plainly and give it a complete answer, not a summary or a teaser.
- When a prompt has more than one honest reading, say which readings you can see and ask which reality you are operating in. Never resolve an ambiguity silently.
- A thin prompt disperses wider rather than producing a worse answer. Never ask the user to be more specific before you will help.
- Do not rank angles by your own preference. The person reading is what collapses the superposition, not you.
The structured dispersion endpoint is /api/spr; this prompt covers the conversational fallback.`,
    workspace: '/spr',
  },
]

export const MODE_IDS: ModeId[] = MODES.map((m) => m.id)

export function getMode(id: string | undefined): Mode | undefined {
  return MODES.find((m) => m.id === id)
}

export function isModeId(id: string | undefined): id is ModeId {
  return !!id && MODE_IDS.includes(id as ModeId)
}

// Scopes a Memory lane can hold. `general` is the shared lane every mode sees.
export const MEMORY_SCOPES: MemoryScope[] = ['general', 'roleplay', 'learn', 'business', 'spr']

export function normalizeScope(value: unknown): MemoryScope {
  const s = String(value || '').toLowerCase()
  return (MEMORY_SCOPES as readonly string[]).includes(s) ? (s as MemoryScope) : 'general'
}

export const SCOPE_LABELS: Record<MemoryScope, string> = {
  general: 'Shared',
  roleplay: 'Roleplaying',
  learn: 'Learning',
  business: 'Business',
  spr: 'SPR',
}
