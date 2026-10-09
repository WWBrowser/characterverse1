// ChatMarks — the shared vocabulary for the ChatCabinet / FileChat knowledge system.
//
// A ChatMark is an intentional bookmark on a conversation. It carries up to three
// independent, color-coded tag slots. The slot's *hue family* is fixed (so a glance
// tells you which dimension a tag belongs to), while each distinct value within a
// slot gets its own deterministic shade inside that family:
//
//   🔵 Character  — what kind of character / who you talked to   (blue family)
//   🟡 Job        — the work at hand                              (amber family)
//   🟣 Division   — the company division / team                  (purple family)
//
// Any slot may be left blank. A conversation with at least one slot set (or just a
// title) is "marked" and becomes a curated asset in ChatCabinet + FileChat. An
// unmarked conversation stays ephemeral — a sandbox/test thread, not filed.

export type ChatMark = {
  id: number
  conversationId: number
  characterId: number
  title: string
  note: string
  characterTag: string
  jobTag: string
  divisionTag: string
  createdAt?: string | null
  updatedAt?: string | null
}

export type SlotKey = 'characterTag' | 'jobTag' | 'divisionTag'

export type SlotDef = {
  key: SlotKey
  label: string
  emoji: string
  description: string
  hue: number
  suggestions: string[]
}

// The three slots, in fixed display order. Hues are the base of each color family.
export const SLOTS: SlotDef[] = [
  {
    key: 'characterTag',
    label: 'Character',
    emoji: '🔵',
    description: 'Character type',
    hue: 214,
    suggestions: ['codexpert', 'coach', 'creative', 'tutor', 'analyst', 'helper', 'strategist'],
  },
  {
    key: 'jobTag',
    label: 'Job',
    emoji: '🟡',
    description: 'Job at hand',
    hue: 42,
    suggestions: ['feature dev', 'bug fix', 'learning', 'brainstorm', 'research', 'planning', 'review'],
  },
  {
    key: 'divisionTag',
    label: 'Division',
    emoji: '🟣',
    description: 'Company division',
    hue: 276,
    suggestions: ['engineering', 'backend', 'frontend', 'design', 'product', 'r&d', 'marketing'],
  },
]

export const SLOT_BY_KEY: Record<SlotKey, SlotDef> = {
  characterTag: SLOTS[0],
  jobTag: SLOTS[1],
  divisionTag: SLOTS[2],
}

// Stable small hash so the same value always resolves to the same shade.
function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export type SlotColor = {
  bg: string
  border: string
  text: string
  dot: string
  hue: number
}

// Resolve the dark-theme colors for a value inside a slot's hue family. The hue is
// nudged a little per value so distinct tags in the same dimension stay visually
// related yet individually recognizable.
export function slotColor(slotKey: SlotKey, value: string): SlotColor {
  const slot = SLOT_BY_KEY[slotKey]
  const v = (value || '').trim().toLowerCase()
  const offset = v ? (hash(v) % 26) - 13 : 0
  const hue = (slot.hue + offset + 360) % 360
  return {
    hue,
    dot: `hsl(${hue}, 72%, 62%)`,
    bg: `hsla(${hue}, 70%, 55%, 0.16)`,
    border: `hsla(${hue}, 72%, 62%, 0.45)`,
    text: `hsl(${hue}, 80%, 78%)`,
  }
}

// True when a mark carries any real signal (a tag in any slot, or a title/note).
// This is the line between a filed asset and an ephemeral test thread.
export function markIsActive(mark: Partial<ChatMark> | null | undefined): boolean {
  if (!mark) return false
  return Boolean(
    (mark.characterTag && mark.characterTag.trim()) ||
      (mark.jobTag && mark.jobTag.trim()) ||
      (mark.divisionTag && mark.divisionTag.trim()) ||
      (mark.title && mark.title.trim()) ||
      (mark.note && mark.note.trim()),
  )
}

// The set tag slots of a mark, as {slot, value, color} — ready to render as badges.
export function markTags(mark: Partial<ChatMark> | null | undefined) {
  if (!mark) return [] as { slot: SlotDef; value: string; color: SlotColor }[]
  return SLOTS.flatMap((slot) => {
    const value = ((mark[slot.key] as string) || '').trim()
    if (!value) return []
    return [{ slot, value, color: slotColor(slot.key, value) }]
  })
}
