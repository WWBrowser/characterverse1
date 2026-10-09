// Shared definitions for the immersive chat experience — the backdrops, frames,
// and voices offered in the Chat Settings sheet, plus the Permanent Memory field
// templates. One source of truth so the chat, the settings sheet, and the
// Permanent Memory page all agree.

export type ChatSettings = {
  id: number
  sessionId: string
  characterId: number
  userPersona: string
  background: string
  decoration: string
  customVoice: string
  voiceAutoplay: boolean
  goOnButton: boolean
  premium: boolean
  permanentMemory: {
    bond?: Record<string, string>
    character?: Record<string, string>
    user?: Record<string, string>
  }
}

export const GO_ON_TOKEN = 'Go on.'

// Chat backdrops. `css` is applied as the full-bleed background behind the room;
// `default` falls back to a tint derived from the character's accent.
export const BACKGROUNDS: { id: string; label: string; css: string }[] = [
  { id: 'default', label: 'Character default', css: '' },
  { id: 'dusk', label: 'Dusk', css: 'linear-gradient(160deg, #2a1a3e 0%, #1a1140 45%, #0d0d14 100%)' },
  { id: 'meadow', label: 'Meadow', css: 'linear-gradient(160deg, #1f3b2e 0%, #24403a 50%, #0d1410 100%)' },
  { id: 'ember', label: 'Ember', css: 'linear-gradient(160deg, #3a1f1f 0%, #401a2e 50%, #14090d 100%)' },
  { id: 'ocean', label: 'Ocean', css: 'linear-gradient(160deg, #16263f 0%, #112a40 50%, #0a0f14 100%)' },
  { id: 'noir', label: 'Noir', css: 'linear-gradient(160deg, #1a1a1f 0%, #111114 60%, #08080a 100%)' },
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(160deg, #16302e 0%, #1c2444 45%, #2a1640 100%)' },
]

export const DECORATIONS: { id: string; label: string; tint: string }[] = [
  { id: 'none', label: 'None', tint: '' },
  { id: 'petals', label: 'Petals', tint: 'radial-gradient(circle at 80% 10%, rgba(244,114,182,0.18), transparent 45%)' },
  { id: 'sparkle', label: 'Sparkle', tint: 'radial-gradient(circle at 15% 20%, rgba(167,139,250,0.22), transparent 40%)' },
  { id: 'snow', label: 'Snow', tint: 'radial-gradient(circle at 50% 0%, rgba(186,230,253,0.16), transparent 55%)' },
  { id: 'gold', label: 'Gold dust', tint: 'radial-gradient(circle at 85% 90%, rgba(251,191,36,0.16), transparent 45%)' },
]

export const VOICES = ['System default', 'Aria', 'Sol', 'Nova', 'Echo', 'Sage', 'Ember', 'Onyx']

export function backgroundCss(id: string, accent: string): string {
  const found = BACKGROUNDS.find((b) => b.id === id)
  if (found && found.css) return found.css
  // Character default — a deep tint pulled from the character's accent colour.
  return `linear-gradient(160deg, ${accent}22 0%, #15101f 50%, #0d0d14 100%)`
}

export function decorationTint(id: string): string {
  return DECORATIONS.find((d) => d.id === id)?.tint || ''
}

// A stable accent per category so each character's default room feels distinct.
const CATEGORY_ACCENT: Record<string, string> = {
  Roleplay: '#a855f7',
  Learn: '#22c55e',
  Gaming: '#f97316',
  Coaching: '#3b82f6',
  General: '#7c5cbf',
}
export function characterAccent(category: string): string {
  return CATEGORY_ACCENT[category] || '#7c5cbf'
}

/* ----------------------------------------------------------- Permanent Memory */

export type MemoryField = { key: string; label: string; premium?: boolean }
export type MemorySection = { key: string; label: string; fields: MemoryField[] }

// Bond — what the character remembers about its relationship with the user, split
// across the four sub-tabs seen on the Permanent Memory page. Entirely premium.
export const BOND_SECTIONS: MemorySection[] = [
  {
    key: 'events',
    label: 'Important Events',
    fields: [
      { key: 'participants', label: 'Participants' },
      { key: 'eventDescription', label: 'Event description' },
      { key: 'time', label: 'Time' },
      { key: 'location', label: 'Location' },
    ],
  },
  {
    key: 'agreements',
    label: 'Agreements&Tasks',
    fields: [
      { key: 'proposedBy', label: 'Proposed by' },
      { key: 'participants', label: 'Participants' },
      { key: 'task', label: 'Task' },
      { key: 'location', label: 'Location' },
    ],
  },
  {
    key: 'items',
    label: 'Important Items',
    fields: [
      { key: 'owner', label: 'Owner' },
      { key: 'itemName', label: 'Item name' },
      { key: 'itemDescription', label: 'Item description' },
      { key: 'importantReason', label: 'Important reason' },
    ],
  },
  {
    key: 'relations',
    label: 'Relations',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'relationship', label: 'Relationship with user' },
      { key: 'attitude', label: 'Attitude toward user' },
      { key: 'affection', label: 'Level of affection for user' },
    ],
  },
]

// Character — the persistent dossier the character keeps about itself. Premium.
export const CHARACTER_FIELDS: MemoryField[] = [
  { key: 'name', label: 'Name' },
  { key: 'nickname', label: 'Nickname' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'orientation', label: 'Sexual orientation' },
  { key: 'likes', label: 'Likes' },
  { key: 'otherInfo', label: 'Other important information' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'personality', label: 'Personality' },
  { key: 'identity', label: 'Identity' },
  { key: 'residence', label: 'Residence' },
]

// User — what the person tells the character about themselves. Most fields are
// free to fill in; a couple are gated behind membership (the crown rows).
export const USER_FIELDS: MemoryField[] = [
  { key: 'nickname', label: 'Nickname' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'orientation', label: 'Sexual orientation' },
  { key: 'likes', label: 'Likes', premium: true },
  { key: 'otherInfo', label: 'Other important information', premium: true },
  { key: 'appearance', label: 'Appearance' },
  { key: 'personality', label: 'Personality' },
  { key: 'identity', label: 'Identity' },
  { key: 'residence', label: 'Residence' },
]

export const PERMANENT_MEMORY_PERKS = [
  'Every chat remembered.',
  'Every story stays.',
  'Everything now remembered forever.',
  'Works with any model.',
  'Ultimate Member exclusive.',
]
