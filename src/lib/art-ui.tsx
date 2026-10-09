import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  Dices,
  Download,
  Flag,
  GitMerge,
  Loader2,
  Plus,
  Sparkles,
  Sprout,
  UserSquare2,
} from 'lucide-react'
import { formatCount, type ReadRow, type Recipe, type StationCard, type Take } from './art.js'
import {
  DISCOVERER_MAX,
  DISCOVERER_MIN,
  TIER_LABEL,
  assistLabel,
  isValidDiscoverer,
  metricLabel,
  normalizeDiscoverer,
  tierOf,
  type Claim,
  type ClaimReply,
  type DiscoveryTier,
} from './art-discovery.js'
import { metricOf, stationName } from './art-registry.js'
import {
  BLEND_PURE_ARTISTIC,
  BLEND_PURE_WONDERS,
  CLAWS,
  SPREAD_SIZE,
  blendLabel,
  clawAt,
  clawCard,
  isClawId,
  normalizeBlend,
  wondersQuota,
  type AssistClaw,
  type ClawId,
} from './claws.js'
import { getSessionId } from './create-ui.js'

// The shared furniture of the Art Studios.
//
// V2 is "modelled off the Art Studio page" in the strongest sense available: the
// two pages are the same page. Everything that is not the artwork itself lives
// here and is imported by both — the tokens, the station cards, the canvas read,
// the claw panel, the Codex panel, the three take actions and the ledger.
//
// What is deliberately NOT here is anything that knows how a piece is made. Each
// studio keeps its own kernel and its own canvas loop, and hands this module
// finished data: a list of stations, a list of read rows, a recipe. That is the
// line that lets two genuinely different generators wear one interface without
// either of them leaking into the other.

/* -------------------------------------------------------------------- tokens */

export const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const

export const kicker = {
  fontSize: '0.68rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-secondary)',
} as const

export const mono = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const

export const ART_ACCENT = '#ec4899'

/** The pink primary both studios use for their headline action. */
export const primaryButton = {
  border: 'none',
  background: 'linear-gradient(135deg, #ec4899, #7c5cbf)',
  color: 'white',
  fontWeight: 700,
} as const

export const inputStyle = {
  width: '100%',
  padding: '0.55rem 0.7rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
} as const

export const selectStyle = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
} as const

export const hintStyle = {
  marginTop: '0.4rem',
  fontSize: '0.7rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.45,
} as const

/* ------------------------------------------------------------ station picker */

/**
 * One station card. Takes the station object rather than an id, so the same card
 * renders a particle station and a formula station without knowing the
 * difference — an upcoming station is dimmed and inert in both studios.
 */
export function StationTile({
  station,
  active,
  onPick,
}: {
  station: StationCard
  active: boolean
  onPick: (id: string) => void
}) {
  const live = station.live
  return (
    <button
      type="button"
      disabled={!live}
      onClick={() => live && onPick(station.id)}
      style={{
        ...card,
        textAlign: 'left',
        padding: '1rem 1.1rem',
        cursor: live ? 'pointer' : 'default',
        borderColor: active ? ART_ACCENT : 'var(--border)',
        background: active ? 'rgba(236,72,153,0.09)' : 'var(--bg-card)',
        opacity: live ? 1 : 0.45,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ ...kicker, color: active ? ART_ACCENT : 'var(--text-secondary)' }}>
          Station {station.ordinal}
        </span>
        {!live && (
          <span
            style={{
              ...kicker,
              fontSize: '0.55rem',
              padding: '0.1rem 0.35rem',
              borderRadius: 5,
              border: '1px solid var(--border)',
            }}
          >
            Upcoming
          </span>
        )}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{station.name}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{station.blurb}</div>
    </button>
  )
}

export function StationGrid({
  stations,
  active,
  onPick,
}: {
  stations: StationCard[]
  active: string
  onPick: (id: string) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.25rem',
      }}
    >
      {stations.map((s) => (
        <StationTile key={s.id} station={s} active={s.id === active} onPick={onPick} />
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- canvas read */

/**
 * The strip under the canvas.
 *
 * It renders whatever rows the station handed it and knows none of their names.
 * That is the point: the read is a property of the station, not of the page, so
 * a particle station reports particles and steps while a formula station reports
 * node counts and pixels solved — and a station added later reports whatever it
 * actually does, without this component changing.
 */
export function CanvasRead({ rows }: { rows: ReadRow[] }) {
  return (
    <div
      style={{
        ...card,
        marginTop: '0.75rem',
        padding: '0.8rem 1rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.85rem',
      }}
    >
      {rows.map((r) => (
        <div key={r.label} style={{ minWidth: 0 }} title={r.hint ? `${r.label} — ${r.hint}` : r.label}>
          <div style={{ ...kicker, fontSize: '0.6rem' }}>{r.label}</div>
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {r.value}
          </div>
          {r.hint && (
            <div
              style={{
                fontSize: '0.62rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {r.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** The thin bar that fills while the browser is still painting. */
export function PaintProgress({ progress, working }: { progress: number; working: boolean }) {
  return (
    <div
      className="art-progress"
      style={{
        marginTop: '0.55rem',
        height: 3,
        borderRadius: 3,
        background: 'rgba(148,163,184,0.16)',
        overflow: 'hidden',
      }}
    >
      <div
        className={working ? 'art-tracing' : undefined}
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
          height: '100%',
          background: working ? ART_ACCENT : 'rgba(236,72,153,0.28)',
          transition: 'width 0.12s linear',
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ the claws */

type Suggestion = { name: string; seed: string; feeling: string; claw?: ClawId }
type Spread = {
  direction: string
  symmetry: number
  suggestions: Suggestion[]
  source?: string
  note?: string
  blend?: number
  claw?: AssistClaw
  blendLabel?: string
}

/** What was on the dial when a phrase was taken. Travels with the claim. */
export type AppliedAssist = { claw: AssistClaw; blend: number }

const CLAW_ICON = { artistic: Sparkles, wonders: Dices, entangled: GitMerge } as const

/**
 * Both prompt directors and the dial between them, in all three studios.
 *
 * ONE PANEL RATHER THAN TWO, BECAUSE THE THING BEING CHOSEN IS A BLEND.
 *
 * Two panels side by side would have been less code here and a worse control:
 * the interesting settings are the ones in the middle, and a creator can only
 * reach those if the two claws are on one dial. So the panel has a single ask
 * button, and where it aims is the dial's business.
 *
 * The endpoints are labelled and clickable, because they are the two things
 * somebody actually wants most of the time — "read my brief properly" and "go
 * find me something I would never have typed". Everything between them is an
 * entanglement, and the panel says which slots each claw wrote rather than
 * blurring the spread into an average.
 *
 * WHAT THE PANEL DOES NOT KNOW is the seed grammar, the axis, or the studio. It
 * posts the station and displays what came back — `metricLabel` names the rung
 * off the station's own studio, so the button under a V1 spread reads "6-fold",
 * under a V2 spread "Off · raw field", and under a V3 spread "Gen 2 · 2 passes",
 * with no branch in this file.
 */
export function ClawPanel({
  station,
  symmetry,
  seedHelp,
  onApplySeed,
  onApplyMetric,
}: {
  station: string
  /** Where the studio's second axis is sitting now — the directors aim off it. */
  symmetry: number
  /** One line naming the seed grammar this station expects. */
  seedHelp: string
  onApplySeed: (seed: string, assist: AppliedAssist) => void
  onApplyMetric: (n: number, assist: AppliedAssist) => void
}) {
  const [brief, setBrief] = useState('a character made of stained glass at dusk')
  const [blend, setBlend] = useState(BLEND_PURE_ARTISTIC)
  const [spread, setSpread] = useState<Spread | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // A spread written for one station's seed grammar is misleading in another, so
  // switching station clears it rather than leaving stale phrases applyable.
  useEffect(() => {
    setSpread(null)
  }, [station])

  const aiming = clawAt(blend)
  const Icon = CLAW_ICON[aiming]
  const metric = metricOf(station)
  const axisName = metric?.name || 'symmetry'
  // The dial the spread came back on, not the one that is set now — a creator can
  // move the slider while reading, and the badges must keep describing what they
  // are reading. Falls back to the live dial for a reply from before this field.
  const spreadBlend = typeof spread?.blend === 'number' ? spread.blend : blend
  const spreadClaw: AssistClaw = spread?.claw || clawAt(spreadBlend)

  const ask = async () => {
    if (!brief.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/claw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, symmetry, station, blend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'The claws could not direct that.')
      setSpread(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The claws could not direct that.')
    } finally {
      setBusy(false)
    }
  }

  const applied: AppliedAssist = { claw: spreadClaw, blend: spreadBlend }

  return (
    <div style={{ ...card, padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
        <Icon size={15} color={ART_ACCENT} />
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {aiming === 'entangled' ? 'ArtisticClaw ⟷ WondersClaw' : clawCard(aiming).name}
        </span>
      </div>

      {/* The dial. Endpoints are buttons because they are the two most-wanted
          settings; the slider is for everything worth trying in between. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
        {CLAWS.map((c) => {
          const at = c.id === 'artistic' ? BLEND_PURE_ARTISTIC : BLEND_PURE_WONDERS
          const on = blend === at
          const CIcon = CLAW_ICON[c.id]
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setBlend(at)}
              title={`${c.name} alone — ${c.tagline}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.3rem 0.45rem',
                borderRadius: 8,
                border: `1px solid ${on ? 'rgba(236,72,153,0.5)' : 'var(--border)'}`,
                background: on ? 'rgba(236,72,153,0.14)' : 'var(--bg-secondary)',
                color: on ? '#f9a8d4' : 'var(--text-secondary)',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <CIcon size={11} />
              {c.tagline}
            </button>
          )
        })}
        <input
          type="range"
          min={BLEND_PURE_ARTISTIC}
          max={BLEND_PURE_WONDERS}
          step={5}
          value={blend}
          onChange={(e) => setBlend(normalizeBlend(e.target.value))}
          aria-label="Entangle the two claws"
          style={{ flex: 1, minWidth: 60, accentColor: ART_ACCENT }}
        />
      </div>
      <div style={{ fontSize: '0.7rem', color: '#f9a8d4', fontWeight: 700, marginBottom: '0.45rem' }}>
        {blendLabel(blend)}
        {aiming === 'entangled' && (
          <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
            {' '}
            — {wondersQuota(blend)} of {SPREAD_SIZE} slots are long shots, and each of their words can bleed into the
            other claw’s phrases. Moving the dial re-deals all five rather than adding to them.
          </span>
        )}
      </div>

      <p style={{ margin: '0 0 0.55rem', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {aiming === 'entangled'
          ? `${clawCard('artistic').blurb.split('.')[0]}, crossed with long shots that leave from the brief rather than land on it.`
          : clawCard(aiming).blurb}
      </p>
      <p style={{ margin: '0 0 0.7rem', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {seedHelp}
      </p>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        maxLength={600}
        placeholder="a character made of stained glass at dusk…"
        style={{
          width: '100%',
          resize: 'vertical',
          padding: '0.6rem 0.7rem',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
        }}
      />

      <button
        type="button"
        onClick={ask}
        disabled={busy || !brief.trim()}
        style={{
          width: '100%',
          marginTop: '0.5rem',
          padding: '0.55rem',
          borderRadius: 10,
          border: '1px solid rgba(236,72,153,0.5)',
          background: busy ? 'var(--bg-hover)' : 'rgba(236,72,153,0.16)',
          color: busy ? 'var(--text-secondary)' : '#f9a8d4',
          fontWeight: 700,
          fontSize: '0.8rem',
          cursor: busy || !brief.trim() ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
        }}
      >
        {busy ? <Loader2 size={14} className="spin" /> : <Icon size={14} />}
        {busy
          ? 'Directing…'
          : aiming === 'entangled'
            ? 'Ask both claws'
            : `Ask ${clawCard(aiming).name}`}
      </button>

      {error && (
        <div
          style={{
            marginTop: '0.6rem',
            padding: '0.5rem 0.6rem',
            borderRadius: 9,
            border: '1px solid rgba(208,59,59,0.4)',
            background: 'rgba(208,59,59,0.1)',
            fontSize: '0.74rem',
            color: '#f0a3a3',
          }}
        >
          {error}
        </div>
      )}

      {spread && (
        <>
          {spread.direction && (
            <p
              style={{
                margin: '0.75rem 0 0.6rem',
                padding: '0.6rem 0.7rem',
                borderRadius: 10,
                border: '1px solid rgba(236,72,153,0.28)',
                background: 'rgba(236,72,153,0.07)',
                fontSize: '0.76rem',
                lineHeight: 1.55,
                color: 'var(--text-primary)',
              }}
            >
              {spread.direction}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {spread.suggestions.map((s) => {
              const who = isClawId(s.claw) ? s.claw : undefined
              const SIcon = who ? CLAW_ICON[who] : undefined
              return (
                <div
                  key={s.seed}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.55rem 0.65rem',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {s.name}
                      </span>
                      {/* Badged only when the spread is mixed. At an endpoint every
                          slot is the claw already named in the header, and five
                          identical badges would be noise. */}
                      {who && SIcon && spreadClaw === 'entangled' && (
                        <span
                          title={`${clawCard(who).name} wrote this one`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            padding: '0.05rem 0.3rem',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-primary)',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          <SIcon size={9} />
                          {clawCard(who).tagline}
                        </span>
                      )}
                    </div>
                    <div style={{ ...mono, fontSize: '0.72rem', color: '#f9a8d4', margin: '0.1rem 0' }}>{s.seed}</div>
                    {s.feeling && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        {s.feeling}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Paint “${s.seed}”`}
                    title={`Paint “${s.seed}”`}
                    onClick={() => onApplySeed(s.seed, who ? { claw: who, blend: spreadBlend } : applied)}
                    style={{
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      border: '1px solid rgba(236,72,153,0.45)',
                      background: 'rgba(236,72,153,0.14)',
                      color: '#f9a8d4',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )
            })}
          </div>

          <div
            style={{
              marginTop: '0.6rem',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Suggested {axisName}:{' '}
            <button
              type="button"
              onClick={() => onApplyMetric(spread.symmetry, applied)}
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                cursor: 'pointer',
                color: '#f9a8d4',
                fontWeight: 700,
                textDecoration: 'underline',
              }}
            >
              {metricLabel(station, spread.symmetry)}
            </button>
            . {spread.note || 'Directed on the managed AI gateway.'}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- the ledger */

export type Ledger = { poured: number; mine: number; degraded: boolean }

/**
 * The Codex counter, and the poster that feeds it.
 *
 * Both studios pour into the same stream, so they share one hook and one table.
 * Recording is fire-and-forget on purpose: the artwork already exists in the
 * browser and is already the creator's, so a ledger that is down costs them
 * nothing but a counter.
 */
export function useArtLedger() {
  const [ledger, setLedger] = useState<Ledger>({ poured: 0, mine: 0, degraded: false })

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/art?session=${encodeURIComponent(getSessionId())}`)
      const data = await res.json()
      setLedger({ poured: data.poured || 0, mine: data.mine || 0, degraded: !!data.degraded })
    } catch {
      setLedger((prev) => ({ ...prev, degraded: true }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /**
   * Commit a piece, and stake its discovery in the same request.
   *
   * The two travel together because they are one decision: the claim is only
   * ever made at the moment a creator takes a piece away, so there is nothing to
   * send separately. Returns the claim reply for the notice — `null` only if the
   * route could not be reached at all, which is reported as degraded rather than
   * as a failed commit.
   */
  const record = useCallback(
    async (recipe: Recipe, attribution?: { discoverer?: string; assisted?: boolean }): Promise<ClaimReply | null> => {
      try {
        const res = await fetch('/api/art', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...recipe,
            session: getSessionId(),
            discoverer: attribution?.discoverer || '',
            assisted: !!attribution?.assisted,
          }),
        })
        const data = await res.json().catch(() => null)
        if (data && typeof data.poured === 'number') {
          setLedger({ poured: data.poured, mine: data.mine || 0, degraded: !!data.degraded })
        } else {
          setLedger((prev) => ({ ...prev, degraded: true }))
        }
        return (data?.claim as ClaimReply) || null
      } catch {
        setLedger((prev) => ({ ...prev, degraded: true }))
        return null
      }
    },
    [],
  )

  return { ledger, record }
}

/* ------------------------------------------------------------- the discovery */

export type ClaimRow = {
  symmetry: number
  tier: DiscoveryTier
  label: string
  claim: Claim | null
}

export type DiscoveryBoard = {
  /** Every metric this station offers, base first — claimed or not. */
  map: ClaimRow[]
  /** Claims staked anywhere, across both studios. */
  total: number
  recent: Claim[]
  degraded: boolean
}

const DISCOVERER_KEY = 'cv_discoverer'

/**
 * The discoverer's name, the assist flag, and the board for the piece on screen.
 *
 * The name is kept in `localStorage` and not on a row, because there is no
 * account system in front of this yet and pretending otherwise would be worse
 * than being plain about it: a claim is as strong as the name typed against it.
 * The register does enforce first-wins on the piece, so the ladder is real even
 * while the identity behind a name is not.
 *
 * `assisted` lives here because it is a property of the RECIPE being committed,
 * not of the person — the same creator can find one piece unaided and the next
 * one with the director's help, and both should read truthfully.
 */
export function useDiscovery(station: string, hash: string) {
  const [name, setName] = useState('')
  const [assisted, setAssisted] = useState(false)
  const [board, setBoard] = useState<DiscoveryBoard>({ map: [], total: 0, recent: [], degraded: false })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISCOVERER_KEY)
      if (saved) setName(normalizeDiscoverer(saved))
    } catch {
      /* a private-mode browser is not an error worth showing anyone */
    }
  }, [])

  const rename = useCallback((next: string) => {
    const clean = normalizeDiscoverer(next)
    setName(clean)
    try {
      localStorage.setItem(DISCOVERER_KEY, clean)
    } catch {
      /* as above */
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!station || !hash) return
    try {
      const res = await fetch(
        `/api/art/discoveries?station=${encodeURIComponent(station)}&hash=${encodeURIComponent(
          hash,
        )}&session=${encodeURIComponent(getSessionId())}`,
      )
      const data = await res.json()
      setBoard({
        map: Array.isArray(data?.map) ? data.map : [],
        total: data?.total || 0,
        recent: Array.isArray(data?.recent) ? data.recent : [],
        degraded: !!data?.degraded,
      })
    } catch {
      setBoard((prev) => ({ ...prev, degraded: true }))
    }
  }, [station, hash])

  // Re-read whenever the piece changes, so the board on screen is the board for
  // the piece on screen. Turning a dial is a new race, not the same one.
  useEffect(() => {
    refresh()
  }, [refresh])

  return { name, rename, assisted, setAssisted, board, refresh }
}

function TierChip({ tier }: { tier: DiscoveryTier }) {
  const first = tier === 'discovery'
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '2px 6px',
        borderRadius: 999,
        border: `1px solid ${first ? 'rgba(236,72,153,0.5)' : 'var(--border)'}`,
        color: first ? '#f9a8d4' : 'var(--text-secondary)',
        background: first ? 'rgba(236,72,153,0.12)' : 'transparent',
      }}
    >
      {TIER_LABEL[tier]}
    </span>
  )
}

/**
 * The discovery panel — the race, drawn.
 *
 * Shared by both studios, and it works for either without knowing which: the
 * rows, their labels and their tiers all come off the register's map, which the
 * server built from the station's own fold vocabulary. A studio whose symmetry
 * can be switched off shows an "Off · raw field" row at the top and a studio
 * whose cannot shows "2-fold" there instead, with no branch on this side.
 */
export function DiscoveryPanel({
  station,
  symmetry,
  seed,
  name,
  onRename,
  assisted,
  board,
}: {
  station: string
  /** The fold setting on screen — the row this creator is standing on. */
  symmetry: number
  seed: string
  name: string
  onRename: (next: string) => void
  assisted: boolean
  board: DiscoveryBoard
}) {
  const current = board.map.find((row) => row.symmetry === symmetry)
  const named = isValidDiscoverer(name)
  const held = current?.claim || null

  return (
    <div style={{ ...card, padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
        <Flag size={15} color={ART_ACCENT} />
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Discovery</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{stationName(station)}</span>
      </div>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Nobody can hold a copyright on a generated piece — no person drew it, and it existed in the generator before
        anyone typed the seed. What can be held is <strong style={{ color: 'var(--text-primary)' }}>having been
        first</strong>. Every seed has one discovery at its base setting and a sub-discovery at every other fold, and
        each is claimed once, by whoever commits it first.{' '}
        <Link to="/art-method" style={{ color: '#f9a8d4', textDecoration: 'none', fontWeight: 600 }}>
          How the stations work
        </Link>
        .
      </p>

      <div style={{ ...kicker, marginBottom: '0.35rem' }}>Discovered by</div>
      <input
        value={name}
        onChange={(e) => onRename(e.target.value)}
        maxLength={DISCOVERER_MAX}
        placeholder="your name for the register…"
        aria-label="The name your discoveries are recorded under"
        style={{ ...inputStyle, ...mono }}
      />
      <div style={hintStyle}>
        {named
          ? `Claims are staked to ${name} the moment you take a piece away — as an avatar, a PNG, or a pour.`
          : `Lowercase letters, digits, dot, dash and underscore; at least ${DISCOVERER_MIN} characters. Without a name your pieces are still recorded, but no claim is staked.`}
      </div>

      {/* The row the creator is standing on, called out ahead of the board. */}
      <div
        style={{
          marginTop: '0.7rem',
          padding: '0.6rem 0.7rem',
          borderRadius: 10,
          border: `1px solid ${held ? 'var(--border)' : 'rgba(236,72,153,0.4)'}`,
          background: held ? 'var(--bg-secondary)' : 'rgba(236,72,153,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <TierChip tier={current?.tier || tierOf(station, symmetry)} />
          <span style={{ ...mono, fontSize: '0.74rem', color: 'var(--text-primary)' }}>
            {/* Off the register when it has answered, off the domain until then —
                never `${symmetry}-fold`, which would render V2's unfolded field
                as the nonsense "0-fold" on the first paint. */}
            {current?.label || metricLabel(station, symmetry)}
          </span>
        </div>
        <div style={{ marginTop: '0.35rem', fontSize: '0.74rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          {board.degraded ? (
            'The register is unreachable, so who holds this one is unknown. Your piece is unaffected.'
          ) : held ? (
            <>
              Charted by{' '}
              <strong style={{ color: held.mine ? '#f9a8d4' : 'var(--text-primary)' }}>{held.discoverer}</strong>
              {held.mine ? ' — you' : ''} · {assistLabel(held.assisted)}
            </>
          ) : (
            <>
              Unclaimed. {named ? 'Take this piece away and it is yours to have found.' : 'Set a name above to claim it.'}
            </>
          )}
        </div>
      </div>

      {/* What would be recorded about the piece currently on screen. */}
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        This piece would be recorded{' '}
        <strong style={{ color: assisted ? '#f9a8d4' : 'var(--text-primary)' }}>{assistLabel(assisted)}</strong>
        {assisted
          ? ' — part of its recipe came from a prompt director. Stated, not penalised: the seed was still unclaimed.'
          : ' — every part of its recipe was set by hand.'}
      </div>

      {/* The board: the whole map of this seed, base metric first. */}
      <div style={{ ...kicker, margin: '0.85rem 0 0.4rem' }}>
        “{seed}”
        {board.map.length > 0 && ` · ${board.map.filter((r) => r.claim).length}/${board.map.length} charted`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 236, overflowY: 'auto' }}>
        {board.map.map((row) => {
          const standing = row.symmetry === symmetry
          return (
            <div
              key={row.symmetry}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.35rem 0.5rem',
                borderRadius: 8,
                border: `1px solid ${standing ? 'rgba(236,72,153,0.35)' : 'transparent'}`,
                background: standing ? 'rgba(236,72,153,0.06)' : 'var(--bg-secondary)',
              }}
            >
              <span
                style={{
                  ...mono,
                  flexShrink: 0,
                  width: 132,
                  fontSize: '0.7rem',
                  color: row.tier === 'discovery' ? '#f9a8d4' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={`${row.label} · ${TIER_LABEL[row.tier]}`}
              >
                {row.label}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '0.72rem',
                  color: row.claim ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {row.claim ? row.claim.discoverer : 'unclaimed'}
              </span>
              {row.claim && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '0.65rem',
                    color: row.claim.assisted ? '#f9a8d4' : 'var(--text-secondary)',
                  }}
                  title={
                    row.claim.assisted
                      ? 'A prompt director had a hand in this recipe'
                      : 'Found without either claw'
                  }
                >
                  {row.claim.assisted ? 'with Claw' : 'unaided'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {board.total > 0 && (
        <div style={{ marginTop: '0.6rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {formatCount(board.total)} claims staked across both studios.
        </div>
      )}
    </div>
  )
}

export function CodexPanel({
  ledger,
  streamNote,
  recipeNote,
}: {
  ledger: Ledger
  /** What this studio drains into the nursery as. */
  streamNote: string
  /** What a recipe from this studio consists of. */
  recipeNote: string
}) {
  return (
    <div style={{ ...card, padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
        <Sprout size={15} color="#a78bfa" />
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Feeds the Agentic Codex
        </span>
      </div>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {streamNote}
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>
          {formatCount(ledger.poured)}
        </span>
        <span style={{ ...kicker }}>pieces poured</span>
      </div>
      {ledger.mine > 0 && (
        <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {formatCount(ledger.mine)} of them yours.
        </div>
      )}

      <p style={{ margin: '0.75rem 0 0.75rem', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {recipeNote}
      </p>

      {ledger.degraded && (
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            alignItems: 'flex-start',
            padding: '0.5rem 0.6rem',
            marginBottom: '0.75rem',
            borderRadius: 9,
            border: '1px solid rgba(250,178,25,0.35)',
            background: 'rgba(250,178,25,0.08)',
            fontSize: '0.72rem',
            color: '#e8c98a',
            lineHeight: 1.45,
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            The ledger is unreachable, so the counter is not current. Your pieces are unaffected — the artwork is
            made in this browser and never depended on it.
          </span>
        </div>
      )}

      <Link
        to="/codex"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          padding: '0.55rem',
          borderRadius: 10,
          border: '1px solid rgba(167,139,250,0.4)',
          background: 'rgba(167,139,250,0.12)',
          color: '#c4b5fd',
          fontSize: '0.8rem',
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Open the nursery <ArrowRight size={14} />
      </Link>
    </div>
  )
}

/* --------------------------------------------------------------- the actions */

/**
 * The three ways a piece leaves the studio — and the only three moments either
 * studio records anything. Turning the dials feeds the Codex nothing.
 */
export function TakeActions({
  busy,
  onAvatar,
  onSave,
  onPour,
}: {
  busy: Take | null
  onAvatar: () => void
  onSave: () => void
  onPour: () => void
}) {
  const secondary = {
    padding: '0.7rem 0.9rem',
    borderRadius: 11,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: busy ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.45rem',
  } as const

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
      <button
        type="button"
        onClick={onAvatar}
        disabled={!!busy}
        style={{
          ...primaryButton,
          flex: '1 1 200px',
          padding: '0.7rem 0.9rem',
          borderRadius: 11,
          fontSize: '0.85rem',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy && busy !== 'avatar' ? 0.55 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.45rem',
        }}
      >
        {busy === 'avatar' ? <Loader2 size={15} className="spin" /> : <UserSquare2 size={15} />}
        {busy === 'avatar' ? 'Preparing…' : 'Use as character avatar'}
      </button>
      <button type="button" onClick={onSave} disabled={!!busy} style={{ ...secondary, flex: '0 1 150px' }}>
        {busy === 'download' ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
        {busy === 'download' ? 'Painting…' : 'Save PNG'}
      </button>
      <button type="button" onClick={onPour} disabled={!!busy} style={{ ...secondary, flex: '0 1 180px' }}>
        {busy === 'pour' ? <Loader2 size={15} className="spin" /> : <Sprout size={15} />}
        {busy === 'pour' ? 'Pouring…' : 'Pour into the Codex'}
      </button>
    </div>
  )
}

export function StudioNotice({ text }: { text: string }) {
  if (!text) return null
  return (
    <div
      style={{
        marginTop: '0.6rem',
        padding: '0.55rem 0.75rem',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        fontSize: '0.76rem',
        color: 'var(--text-secondary)',
      }}
    >
      {text}
    </div>
  )
}
