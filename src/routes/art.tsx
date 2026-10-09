import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Palette, Dice5 } from 'lucide-react'
import {
  AVATAR_SIZE,
  DEFAULT_MODE,
  DEFAULT_SYMMETRY,
  HANDOFF_KEY,
  PRINT_SIZE,
  RENDER_MODES,
  SCREEN_SIZE,
  STATIONS,
  SYMMETRY_OPTIONS,
  getStation,
  modeLabel,
  rollSeedPhrase,
  type AvatarHandoff,
  type Field,
  type RenderMode,
  type StationId,
  type Take,
} from '../lib/art'
import { v1Piece, type V1Piece } from '../lib/art-engine'
import {
  ART_ACCENT,
  ClawPanel,
  CanvasRead,
  CodexPanel,
  PaintProgress,
  StationGrid,
  DiscoveryPanel,
  StudioNotice,
  TakeActions,
  card,
  hintStyle,
  inputStyle,
  kicker,
  mono,
  primaryButton,
  selectStyle,
  useArtLedger,
  useDiscovery,
} from '../lib/art-ui'
import { claimNotice } from '../lib/art-discovery'

// The Art Studio.
//
// Two live stations, painted in the browser while you watch. Which one is
// selected is resolved once, into a `piece` — see `src/lib/art-engine.ts`. This
// file never learns whether it is tracing a polar wave or advecting a vortex,
// which is the only reason the second station cost a branch rather than a fork.
//
// The page's whole job
// is to keep three promises the kernel makes visible:
//
//   · the seed phrase IS the piece — type the words, get the artwork, every time;
//   · the render-mode toggle repaints the SAME artwork, because it re-resolves
//     the field already in memory rather than tracing a new one (see the mode
//     effect below — it never touches `traceParticles`);
//   · a piece is only recorded when a creator takes it away.
//
// Everything above the canvas is CSS scaling of one SCREEN_SIZE buffer, so what
// is on screen is the same computation as the print and the avatar.
//
// The furniture — station cards, canvas read, the claw panel, Codex panel, the
// three take actions — comes from `src/lib/art-ui.tsx` and is shared verbatim
// with Art Studio V2. What stays here is only what knows about particles.

export const Route = createFileRoute('/art')({ component: ArtStudio })

/* ====================================================================== page */

function ArtStudio() {
  const navigate = useNavigate()

  const [station, setStation] = useState<StationId>('harmonic')
  const [seed, setSeed] = useState('opal shatter refract')
  const [draft, setDraft] = useState('opal shatter refract')
  const [symmetry, setSymmetry] = useState(DEFAULT_SYMMETRY)
  const [mode, setMode] = useState<RenderMode>(DEFAULT_MODE)

  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState<Take | null>(null)
  const [notice, setNotice] = useState('')
  const { ledger, record: pourRecipe } = useArtLedger()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fieldRef = useRef<{ piece: V1Piece; field: Field } | null>(null)
  const modeRef = useRef<RenderMode>(mode)

  // Resolving a piece is pure and cheap — a hash, a handful of numbers, and for
  // the vortex station a 48-particle probe walk — so it is safe to derive during
  // render and identical on the server and the client.
  const piece = useMemo(
    () => v1Piece({ station, seed, symmetry, size: SCREEN_SIZE }),
    [station, seed, symmetry],
  )
  const facts = piece.facts
  // The discovery board for the piece on screen. Keyed on the plan's own hash so
  // it always agrees with the claim the commit would stake.
  const {
    name: discoverer,
    rename,
    assisted,
    setAssisted,
    board,
    refresh: refreshBoard,
  } = useDiscovery(station, facts.hash)

  // Declared by the station: station 01 steps its own seeded hue span, the
  // vortex station shows the named palette window it was dealt.
  const swatches = useMemo(() => piece.swatches(), [piece])
  const stationMeta = getStation(station)

  const paint = useCallback((field: Field, p: V1Piece, m: RenderMode) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const img = ctx.createImageData(p.facts.size, p.facts.size)
    img.data.set(p.resolve(field, m))
    ctx.putImageData(img, 0, 0)
  }, [])

  /* --- trace: a new field whenever the piece itself changes ---------------- */
  useEffect(() => {
    const field = piece.createField()
    fieldRef.current = { piece, field }
    setProgress(0)

    let raf = 0
    let cancelled = false

    const step = () => {
      if (cancelled) return
      const done = piece.trace(field, piece.chunk)
      paint(field, piece, modeRef.current)
      setProgress(field.traced / facts.particles)
      if (!done) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [piece, facts.particles, paint])

  /* --- mode: re-resolve the SAME field, never re-trace -------------------- */
  // This effect is the toggle's whole implementation. It reads the field that is
  // already in memory and hands it to `resolve` with a different mode. No
  // particle is traced, no parameter is re-derived, no hue is reassigned — which
  // is why flipping the toggle is a genuine before-and-after of one piece.
  useEffect(() => {
    modeRef.current = mode
    const cur = fieldRef.current
    if (cur) paint(cur.field, cur.piece, mode)
  }, [mode, paint])

  /**
   * Record a committed piece. Fire-and-forget on purpose: the artwork already
   * exists in the browser and is already the creator's, so a ledger that is down
   * costs them nothing but a counter.
   */
  const record = useCallback(
    (take: Take, size: number) =>
      pourRecipe({ ...piece.recipe(mode, take), size }, { discoverer, assisted }),
    [piece, mode, pourRecipe, discoverer, assisted],
  )

  /**
   * Commit, then say what happened to the claim.
   *
   * The claim line is appended to whatever the action itself had to report rather
   * than replacing it: somebody who just saved a print wants to hear that the
   * print saved first and who charted the fold second.
   */
  const commit = useCallback(
    async (take: Take, size: number, lead: string) => {
      const reply = await record(take, size)
      setNotice(lead + (reply ? ` ${claimNotice(reply)}` : ''))
      refreshBoard()
    },
    [record, refreshBoard],
  )

  /** Paint the piece again at another size. Chunked, so the tab stays alive. */
  const renderAt = useCallback(
    async (size: number): Promise<HTMLCanvasElement> => {
      const off = v1Piece({ station, seed, symmetry, size })
      const field = off.createField()
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const done = off.trace(field, off.chunk)
        if (done) break
        await new Promise((r) => setTimeout(r, 0))
      }
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const img = ctx.createImageData(size, size)
      img.data.set(off.resolve(field, mode))
      ctx.putImageData(img, 0, 0)
      return canvas
    },
    [station, seed, symmetry, mode],
  )

  const useAsAvatar = async () => {
    if (busy) return
    setBusy('avatar')
    setNotice('')
    try {
      const canvas = await renderAt(AVATAR_SIZE)
      const handoff: AvatarHandoff = {
        dataUrl: canvas.toDataURL('image/png'),
        recipe: piece.recipe(mode, 'avatar'),
        hash: facts.hash,
        note: piece.avatarNote(mode),
      }
      // Handed across inside the page — no upload, no row, no database on this
      // path at all. The Create page picks it up and clears it.
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff))
      record('avatar', AVATAR_SIZE)
      navigate({ to: '/create' })
    } catch {
      setNotice('The avatar could not be prepared. The piece is unchanged — try again.')
    } finally {
      setBusy(null)
    }
  }

  const savePng = async () => {
    if (busy) return
    setBusy('download')
    setNotice('')
    try {
      const canvas = await renderAt(PRINT_SIZE)
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `characterverse-${station}-${facts.hash}-${facts.symmetry}fold-${mode}.png`
      a.click()
      await commit(
        'download',
        PRINT_SIZE,
        `Saved at ${PRINT_SIZE}×${PRINT_SIZE} — the same piece, traced at print density.`,
      )
    } catch {
      setNotice('The PNG could not be written. The piece is unchanged — try again.')
    } finally {
      setBusy(null)
    }
  }

  const pour = async () => {
    if (busy) return
    setBusy('pour')
    setNotice('')
    await commit(
      'pour',
      facts.size,
      'Poured in. The collective was fed a recipe: station, seed phrase, symmetry and render mode.',
    )
    setBusy(null)
  }

  const tracing = progress < 1

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
      {/* ------------------------------------------------------- the stations */}
      <StationGrid stations={STATIONS} active={station} onPick={(id) => setStation(id as StationId)} />

      <div className="art-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1.25rem' }}>
        {/* ----------------------------------------------------- the canvas */}
        <div>
          <div
            style={{
              ...card,
              padding: '0.75rem',
              background: 'var(--bg-secondary)',
            }}
          >
            <canvas
              ref={canvasRef}
              width={SCREEN_SIZE}
              height={SCREEN_SIZE}
              aria-label={`${stationMeta?.name} painted from the seed phrase “${seed}” at ${symmetry}-fold symmetry`}
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 10,
                background: '#000',
              }}
            />
            <PaintProgress progress={progress} working={tracing} />
          </div>

          {/* ------------------------------------------------ the canvas read */}
          {/* Declared by the station, not by this page — see `readTrace` and
              `readVortex`. The two stations share only the first two rows. */}
          <CanvasRead rows={piece.read(progress)} />

          {/* ------------------------------------------------- the render mode */}
          <div style={{ ...card, marginTop: '0.75rem', padding: '0.9rem 1rem' }}>
            <div style={{ ...kicker, marginBottom: '0.5rem' }}>Render mode</div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {RENDER_MODES.map((m) => {
                const active = m.id === mode
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    aria-pressed={active}
                    style={{
                      flex: '1 1 180px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 10,
                      border: '1px solid',
                      borderColor: active ? ART_ACCENT : 'var(--border)',
                      background: active ? 'rgba(236,72,153,0.16)' : 'var(--bg-secondary)',
                      color: active ? '#f9a8d4' : 'var(--text-secondary)',
                      fontWeight: active ? 700 : 500,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <p style={{ margin: '0.65rem 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {RENDER_MODES.find((m) => m.id === mode)?.blurb} Both modes paint the{' '}
              <strong style={{ color: 'var(--text-primary)' }}>exact same artwork</strong> — they resolve one traced
              field two ways, so only the blending differs and you can compare them directly.
            </p>
          </div>

          {/* ----------------------------------------------------- the actions */}
          <TakeActions busy={busy} onAvatar={useAsAvatar} onSave={savePng} onPour={pour} />
          <StudioNotice text={notice} />
        </div>

        {/* -------------------------------------------------------- right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
          {/* Seed phrase */}
          <div style={{ ...card, padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <Palette size={15} color={ART_ACCENT} />
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Seed phrase</span>
            </div>
            <p style={{ margin: '0 0 0.7rem', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {piece.seedNote} The same seed always paints the same artwork, so a piece is shareable as a phrase.
            </p>

            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSeed(draft)
                  setAssisted(false)
                }
              }}
              maxLength={120}
              placeholder="three or four vivid words…"
              style={{ ...inputStyle, ...mono }}
            />

            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setSeed(draft)
                  // Typed by hand, so the claim should not say otherwise.
                  setAssisted(false)
                }}
                disabled={!draft.trim()}
                style={{
                  ...primaryButton,
                  flex: 1,
                  padding: '0.55rem',
                  borderRadius: 10,
                  fontSize: '0.8rem',
                  cursor: draft.trim() ? 'pointer' : 'not-allowed',
                  opacity: draft.trim() ? 1 : 0.5,
                }}
              >
                Paint it
              </button>
              <button
                type="button"
                aria-label="Roll a random seed phrase"
                title="Roll a random seed phrase"
                onClick={() => {
                  const next = rollSeedPhrase(Math.floor(Math.random() * 2 ** 31))
                  setDraft(next)
                  setSeed(next)
                  // The dice are the studio's own, not the director's.
                  setAssisted(false)
                }}
                style={{
                  width: 40,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Dice5 size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 3, marginTop: '0.6rem' }}>
              {swatches.map((c, i) => (
                <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: c }} />
              ))}
            </div>

            <div style={{ ...kicker, margin: '0.85rem 0 0.35rem' }}>Symmetry</div>
            <select
              value={symmetry}
              onChange={(e) => {
                setSymmetry(Number(e.target.value))
                setAssisted(false)
              }}
              style={selectStyle}
            >
              {SYMMETRY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}-fold
                </option>
              ))}
            </select>
            <div style={hintStyle}>{piece.foldNote}</div>
          </div>

          <ClawPanel
            station={station}
            symmetry={symmetry}
            seedHelp={`Describe a vibe, a mood or a character and the prompt director returns a spread of seed phrases, a line of art direction and a symmetry to try. ${piece.seedHelp}`}
            onApplySeed={(s) => {
              setDraft(s)
              setSeed(s)
              // Taking the director's phrase is recorded, not penalised — see the
              // discovery panel below, which says so in as many words.
              setAssisted(true)
            }}
            onApplyMetric={(n) => {
              setSymmetry(n)
              setAssisted(true)
            }}
          />

          <DiscoveryPanel
            station={station}
            symmetry={symmetry}
            seed={facts.seed}
            name={discoverer}
            onRename={rename}
            assisted={assisted}
            board={board}
          />

          {/* Feeds the Agentic Codex */}
          <CodexPanel
            ledger={ledger}
            streamNote="Every piece you take away — as an avatar, a PNG, or a deliberate pour — drains into the Synapse Collective’s nursery as the Art Studio feeder stream. Turning the dials feeds it nothing."
            recipeNote="A station, a seed and a symmetry is the piece, so the collective is fed a re-paintable recipe rather than a pixel dump — aesthetic preference, the one signal that records what a person chose to look at."
          />

          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, padding: '0 0.2rem' }}>
            Painting at {SCREEN_SIZE}px on screen, {AVATAR_SIZE}px as an avatar and {PRINT_SIZE}px as a print — the
            traced density is held constant across all three, so the piece you approve here is the piece you get
            everywhere. Currently {modeLabel(mode).toLowerCase()}.
          </div>
        </div>
      </div>
    </div>
  )
}
