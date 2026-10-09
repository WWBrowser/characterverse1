import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Dice5, Radio, Waves } from 'lucide-react'
import { HANDOFF_KEY, PRINT_SIZE, SCREEN_SIZE, rollSeedPhrase, type AvatarHandoff, type Take } from '../lib/art'
import {
  DECAY_GENERATIONS,
  DECAY_REF,
  V3_DEFAULT_DECAY,
  V3_RENDER_MODES,
  V3_STATIONS,
  decayBoardLabel,
  decayLabel,
  getV3Station,
  type V3StationId,
  type V3Surface,
} from '../lib/artv3'
import { trimSeedFor, v3Piece } from '../lib/artv3-engine'
import {
  ART_ACCENT,
  CanvasRead,
  ClawPanel,
  CodexPanel,
  DiscoveryPanel,
  PaintProgress,
  StationGrid,
  StudioNotice,
  TakeActions,
  card,
  hintStyle,
  inputStyle,
  kicker,
  mono,
  primaryButton,
  useArtLedger,
  useDiscovery,
} from '../lib/art-ui'
import { claimNotice } from '../lib/art-discovery'

// Art Studio V3.
//
// Modelled on the two studios before it and honest about where the model breaks.
// V1 traces particles and accumulates the light where their paths cross. V2
// solves a bounded formula at every pixel. V3 does something neither of them
// does: it BUILDS a finished composition — blended rects, discs, polygons and
// garbled bitmap type — and then destroys it with a corruption pass that reads
// the frame it is writing into.
//
// TWO OF THE STUDIO'S THREE PROMISES HOLD HERE. THE THIRD DOES NOT, AND THIS
// PAGE SAYS SO RATHER THAN QUIETLY BREAKING IT.
//
//   · the seed phrase IS the piece — harder here than anywhere. One phrase feeds
//     one stream, and the stream deals the palette, then every shape and glyph,
//     then every corruption pass in order. There is no second dial holding any
//     part of it still, so a single changed letter re-deals the whole piece;
//   · a piece is only recorded when a creator takes it away — unchanged;
//   · resolution independence is GONE, and it cannot be recovered by trying
//     harder. The corruption pass draws from the stream once or twice per pixel
//     and which of the two depends on that pixel's own brightness, so a 512px
//     render and a 1440px render of one seed are not the same artwork at two
//     densities — they are two unrelated artworks. So the piece is defined on a
//     fixed 600px grid and magnified by replication, and "size is exposure",
//     which is true in V1 and V2, is simply not true here.
//
// The claim axis is generations of decay rather than folds, because nothing here
// is folded and a fold count would be a fiction. See `DECAY_GENERATIONS` — the
// ladder is five rungs long because that is where the measurements said the
// generator stops making a different picture and starts making the same static.

export const Route = createFileRoute('/artv3')({ component: ArtStudioV3 })

/**
 * The avatar is taken at the reference grid, not at the platform's 512.
 *
 * Every other studio takes the avatar at `AVATAR_SIZE` because its piece is a
 * function of position and 512px is simply a coarser sampling of it. Here the
 * piece exists at 600px and nowhere else, and 600 → 512 by replication is not a
 * resampling — it is dropping one column in every seven, chosen by rounding.
 * That deletes single-pixel tear seams and noise specks at irregular intervals,
 * which is precisely the material this station makes. Handing over the grid
 * itself keeps every pixel the generator produced; the Create page scales the
 * image for display and does not care what it was handed.
 */
const V3_AVATAR_SIZE = DECAY_REF

function ArtStudioV3() {
  const navigate = useNavigate()

  const [station, setStation] = useState<V3StationId>('decay')
  const [seed, setSeed] = useState('ghost in the machine')
  const [draft, setDraft] = useState('ghost in the machine')

  // One number, not V2's pair. There is no "off" to return from: generation 0 is
  // itself a rung — the composition with the pass never run — and it is this
  // station's base discovery rather than a disabled state.
  const [decay, setDecay] = useState<number>(V3_DEFAULT_DECAY)

  const [progress, setProgress] = useState(0)
  const [swatches, setSwatches] = useState<string[]>([])
  const [busy, setBusy] = useState<Take | null>(null)
  const [notice, setNotice] = useState('')
  const { ledger, record: pourRecipe } = useArtLedger()

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const piece = useMemo(() => v3Piece({ station, seed, decay, size: SCREEN_SIZE }), [station, seed, decay])
  const facts = piece.facts

  const {
    name: discoverer,
    rename,
    assisted,
    setAssisted,
    board,
    refresh: refreshBoard,
  } = useDiscovery(station, facts.hash)
  const stationMeta = getV3Station(station)
  const mode = V3_RENDER_MODES[0]

  const paint = useCallback((surface: V3Surface) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const img = ctx.createImageData(surface.size, surface.size)
    img.data.set(surface.px)
    ctx.putImageData(img, 0, 0)
  }, [])

  /* --- paint: one stage per frame ---------------------------------------- */
  // Staged rather than banded by rows, which is the shape of this station rather
  // than a preference. A shape can land anywhere in the frame and a corruption
  // pass has to finish the whole grid before any of it is final, so there is no
  // top-to-bottom cursor to report. What there is, is a schedule: a stage per
  // group of shapes while the composition builds, then a stage per generation
  // while it rots. Watching it is the method — you see it assembled and then see
  // it come apart, in that order.
  const [surface, setSurface] = useState<V3Surface | null>(null)
  useEffect(() => {
    const s = piece.createSurface()
    const band = piece.band
    setProgress(0)
    setSwatches([])
    setSurface(s)

    let raf = 0
    let cancelled = false

    const step = () => {
      if (cancelled) return
      const done = piece.solveRows(s, band)
      paint(s)
      setProgress(s.solved / facts.size)
      if (done) {
        setSwatches(piece.swatches(s))
        // Re-set to the same object on purpose: the pass stats it accumulated are
        // what the canvas read reports, and the read cannot see them until the
        // passes have run. The object is stable, so this is one extra render.
        setSurface(s)
      } else raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [piece, facts.size, paint])

  const record = useCallback(
    (take: Take, size: number) => pourRecipe({ ...piece.recipe(take), size }, { discoverer, assisted }),
    [piece, pourRecipe, discoverer, assisted],
  )

  const commit = useCallback(
    async (take: Take, size: number, lead: string) => {
      const reply = await record(take, size)
      setNotice(lead + (reply ? ` ${claimNotice(reply)}` : ''))
      refreshBoard()
    },
    [record, refreshBoard],
  )

  /**
   * Repaint at another size — which here means the same piece, magnified more.
   *
   * The 600px grid is redrawn from the same seed rather than the on-screen
   * canvas being scaled, so no browser resampling touches it, and the result is
   * byte-identical on the grid at every size. Only the replication factor
   * differs. That is the whole of what "another size" can mean in this studio.
   */
  const renderAt = useCallback(
    async (size: number): Promise<HTMLCanvasElement> => {
      const off = v3Piece({ station, seed, decay, size })
      const s = off.createSurface()
      const band = off.band
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (off.solveRows(s, band)) break
        await new Promise((r) => setTimeout(r, 0))
      }
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const img = ctx.createImageData(size, size)
      img.data.set(s.px)
      ctx.putImageData(img, 0, 0)
      return canvas
    },
    [station, seed, decay],
  )

  const useAsAvatar = async () => {
    if (busy) return
    setBusy('avatar')
    setNotice('')
    try {
      const canvas = await renderAt(V3_AVATAR_SIZE)
      const handoff: AvatarHandoff = {
        dataUrl: canvas.toDataURL('image/png'),
        recipe: piece.recipe('avatar'),
        hash: facts.hash,
        note: piece.avatarNote(),
      }
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff))
      record('avatar', V3_AVATAR_SIZE)
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
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `characterverse-v3-${station}-${facts.hash}-gen${facts.decay}.png`
      a.click()
      await commit(
        'download',
        PRINT_SIZE,
        `Saved at ${PRINT_SIZE}×${PRINT_SIZE} — the ${DECAY_REF}px signal magnified by replication, so every pixel in the file is a pixel the generator wrote. Not an upscale in the resampling sense: nothing was interpolated and no colour was invented.`,
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
      `Poured in. The collective was fed a recipe: station, seed phrase and generation (${decayLabel(
        facts.decay,
      ).toLowerCase()}).`,
    )
    setBusy(null)
  }

  const working = progress < 1

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
      {/* ------------------------------------------------------- the stations */}
      <StationGrid stations={V3_STATIONS} active={station} onPick={(id) => setStation(id as V3StationId)} />

      <div className="art-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1.25rem' }}>
        {/* ------------------------------------------------------- the canvas */}
        <div>
          <div style={{ ...card, padding: '0.75rem', background: 'var(--bg-secondary)' }}>
            <canvas
              ref={canvasRef}
              width={SCREEN_SIZE}
              height={SCREEN_SIZE}
              aria-label={`${stationMeta?.name} built from the seed phrase “${seed}” and ${decayLabel(
                facts.decay,
              ).toLowerCase()}`}
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 10,
                background: '#000',
                // Belt and braces with `magnify`: the buffer is already at the
                // canvas's pixel size, but a browser scaling the ELEMENT down on
                // a narrow screen would smooth the seams the pass made, and this
                // asks it not to.
                imageRendering: 'pixelated',
              }}
            />
            <PaintProgress progress={progress} working={working} />
          </div>

          {/* ------------------------------------------------ the canvas read */}
          {/* Declared by the station, and it reads nothing like V1's or V2's:
              there are no particles and no pixels solved, there are elements
              placed, glyph runs dealt and — once the passes have run — what each
              pass actually did to the frame it was handed. */}
          <CanvasRead rows={piece.read(surface, progress)} />

          {/* ------------------------------------------------------ the decay */}
          {/* V3's headline control, in the slot V1 gives to symmetry and V2 to
              the fold switch. Five rungs, not a slider: each one is a discovery
              somebody can be first to, so a rung has to be a place you can land
              on deliberately rather than a value you drift past. */}
          <div style={{ ...card, marginTop: '0.75rem', padding: '0.9rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
              <Waves size={14} color={ART_ACCENT} />
              <span style={{ ...kicker }}>Decay</span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {DECAY_GENERATIONS.map((gen) => {
                const active = decay === gen
                return (
                  <button
                    key={gen}
                    type="button"
                    onClick={() => {
                      setDecay(gen)
                      setAssisted(false)
                    }}
                    aria-pressed={active}
                    style={{
                      flex: gen === 0 ? '1 1 160px' : '1 1 90px',
                      padding: '0.5rem 0.6rem',
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
                    {decayBoardLabel(gen)}
                  </button>
                )
              })}
            </div>
            <div style={hintStyle}>
              Clean to {DECAY_GENERATIONS[DECAY_GENERATIONS.length - 1]} generations — how many times the corruption
              pass is run over its own output. {piece.decayNote}
            </div>
          </div>

          {/* ------------------------------------------------------- the grid */}
          {/* The deviation gets its own panel rather than a footnote, because a
              creator who assumes V1's and V2's resolution independence here
              would be wrong about what they are taking away. */}
          <div style={{ ...card, marginTop: '0.75rem', padding: '0.9rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
              <Radio size={14} color={ART_ACCENT} />
              <span style={{ ...kicker }}>Reference grid · {DECAY_REF}px</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {piece.gridNote}
            </p>
          </div>

          {/* ------------------------------------------------- the render mode */}
          <div style={{ ...card, marginTop: '0.75rem', padding: '0.9rem 1rem' }}>
            <div style={{ ...kicker, marginBottom: '0.5rem' }}>Render mode</div>
            <div
              style={{
                display: 'inline-flex',
                padding: '0.5rem 0.75rem',
                borderRadius: 10,
                border: `1px solid ${ART_ACCENT}`,
                background: 'rgba(236,72,153,0.16)',
                color: '#f9a8d4',
                fontWeight: 700,
                fontSize: '0.82rem',
              }}
            >
              {mode.label}
            </div>
            <p style={{ margin: '0.65rem 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {mode.blurb} V1 offers exposures because its light <em>accumulates</em> into an unbounded buffer and a
              bright piece can bleach out. V2 needs none because nothing it writes can leave the range it was given.{' '}
              <span style={{ color: 'var(--text-primary)' }}>{piece.modeNote}</span>
            </p>
          </div>

          {/* ----------------------------------------------------- the actions */}
          <TakeActions busy={busy} onAvatar={useAsAvatar} onSave={savePng} onPour={pour} />
          <StudioNotice text={notice} />
        </div>

        {/* -------------------------------------------------------- right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
          {/* Seed */}
          <div style={{ ...card, padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <Radio size={15} color={ART_ACCENT} />
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {piece.seedPanel.title}
              </span>
            </div>
            <p style={{ margin: '0 0 0.7rem', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {piece.seedPanel.intro}
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
              placeholder={piece.seedPanel.placeholder}
              style={{ ...inputStyle, ...mono }}
            />

            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setSeed(draft)
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
                Build it
              </button>
              <button
                type="button"
                aria-label="Roll a random seed"
                title="Roll a random seed"
                onClick={() => {
                  const next = trimSeedFor(piece, rollSeedPhrase(Math.floor(Math.random() * 2 ** 31)))
                  setDraft(next)
                  setSeed(next)
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

            {/* Not sampled. V1 and V2 have no palette until they have painted
                one; this station is DEALT six exact colours off the front of the
                stream before a single shape is placed, so the swatches are known
                before the canvas is, and they do not change as it paints. */}
            <div style={{ display: 'flex', gap: 3, marginTop: '0.6rem', height: 5 }}>
              {(swatches.length > 0 ? swatches : piece.swatches()).map((c, i) => (
                <div key={i} style={{ flex: 1, borderRadius: 3, background: c }} />
              ))}
            </div>
            <div style={hintStyle}>
              Dealt off the front of the stream before anything is drawn — the only part of this piece that is decided
              before the composition is.
            </div>

            <div
              style={{
                ...mono,
                marginTop: '0.7rem',
                padding: '0.5rem 0.6rem',
                borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              {piece.detail().map((f) => (
                <div key={f.label}>
                  {f.label.padEnd(9, ' ')} → <span style={{ color: '#f9a8d4' }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          <ClawPanel
            station={station}
            symmetry={decay}
            seedHelp={`Describe a vibe, a mood or a character and the prompt directors return a spread of seed phrases, a line of art direction and a generation to try. ${piece.seedHelp}`}
            onApplySeed={(s) => {
              const next = trimSeedFor(piece, s)
              setDraft(next)
              setSeed(next)
              // Recorded, not penalised — the discovery panel below says so.
              setAssisted(true)
            }}
            onApplyMetric={(n) => {
              setDecay(n)
              setAssisted(true)
            }}
          />

          <DiscoveryPanel
            station={station}
            symmetry={decay}
            seed={facts.seed}
            name={discoverer}
            onRename={rename}
            assisted={assisted}
            board={board}
          />

          {/* Feeds the Agentic Codex */}
          <CodexPanel
            ledger={ledger}
            streamNote="Every piece you take away — as an avatar, a PNG, or a deliberate pour — drains into the Synapse Collective’s nursery. All three studios share one feeder stream, because a recipe from any of them repaints the same way. Turning the dials feeds it nothing."
            recipeNote="A station, a seed phrase and a generation of decay is the piece, so the collective is fed a re-runnable recipe rather than a pixel dump — aesthetic preference, the one signal that records what a person chose to look at."
          />

          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, padding: '0 0.2rem' }}>
            Built on a {DECAY_REF}px grid and shown at {SCREEN_SIZE}px, handed over at {V3_AVATAR_SIZE}px as an avatar
            and {PRINT_SIZE}px as a print. Those are three magnifications of one signal rather than three samplings of
            one function, which is the one promise this studio cannot make and V1 and V2 can. {piece.methodNote}
          </div>
        </div>
      </div>
    </div>
  )
}
