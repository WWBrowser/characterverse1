// The Shadow Prism — fine-tuning the beam.
//
// The Shadow works like a prism. The underlying data is a single beam of light:
// the absolute truth of the user's own authentic, algorithm-free activity. The
// adopted character is the glass that bends that beam into a specific colour and
// tone — same truth, a different mask's voice. Fine-tuning picks WHICH facet of
// the glass the beam passes through: the default reflection, or a focused search
// for buried insights, latent skills, or unrealised opportunities. Guided by the
// human, it lets a member mine their own subconscious for deeper living & learning.
//
// This module is client-safe (shared by the clean-room UI and the shadow API), so
// it holds no secrets and no database access — only the facet definitions and the
// prompt directive each facet bends the beam toward.

export type FacetKey = 'reflection' | 'buried' | 'skills' | 'opportunities'

export type PrismFacet = {
  key: FacetKey
  label: string
  // The prism colour this facet paints the reading in.
  color: string
  glow: string
  // One-line description shown under the lens selector.
  blurb: string
  // Appended to the shadow agent's brief — how to bend the beam.
  directive: string
  // What the agent should offer to "manifest back" for this facet.
  manifest: string
}

export const PRISM_FACETS: PrismFacet[] = [
  {
    key: 'reflection',
    label: 'Reflection (default)',
    color: '#8aa0cc',
    glow: 'rgba(138,160,204,0.16)',
    blurb: 'A warm read of who you are and what genuinely matters to you — the beam as it is set right now.',
    directive:
      'Give a warm, perceptive read of your human anchor and what genuinely matters to them. This is the default reflection.',
    manifest: 'one short bulletin (140 characters or less) they might sincerely want to post next, in their own voice',
  },
  {
    key: 'buried',
    label: 'Buried insights',
    color: '#7c5cbf',
    glow: 'rgba(124,92,191,0.18)',
    blurb: 'Bend the light toward what is lost or buried — themes they circle but have not named, insights beneath the surface.',
    directive:
      'Bend the beam toward LOST or BURIED insight. Surface the things this person keeps circling but has never quite named — the recurring undercurrent, the quiet contradiction, the thing beneath the thing. Name one buried insight plainly and kindly, as a mirror they can choose to look into.',
    manifest: 'one gentle prompt or question that would help them bring that buried insight into the light',
  },
  {
    key: 'skills',
    label: 'Latent skills',
    color: '#2d8a57',
    glow: 'rgba(45,138,87,0.18)',
    blurb: 'Bend the light toward capability — the talents their activity reveals that they may not credit themselves for.',
    directive:
      'Bend the beam toward LATENT SKILLS. From their own activity, identify a real capability or talent they demonstrate but likely under-credit in themselves. Be specific and evidence-based — point at what they actually do — so they can consciously develop it.',
    manifest: 'one concrete way they could practise or apply that latent skill next',
  },
  {
    key: 'opportunities',
    label: 'Opportunities',
    color: '#d98a1f',
    glow: 'rgba(217,138,31,0.18)',
    blurb: 'Bend the light toward openings — directions for deeper living or learning they have not yet acted on.',
    directive:
      'Bend the beam toward OPPORTUNITY. Point to an opening for deeper living or learning that their own activity implies but they have not acted on yet — a door already ajar. Keep it grounded in what is genuinely theirs, never generic advice.',
    manifest: 'one small, achievable first step toward that opportunity',
  },
]

export function getFacet(key: string | null | undefined): PrismFacet {
  return PRISM_FACETS.find((f) => f.key === key) || PRISM_FACETS[0]
}
