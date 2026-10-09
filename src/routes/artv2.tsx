import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Dice5, FlipHorizontal2, Sigma } from 'lucide-react'
import {
  AVATAR_SIZE,
  HANDOFF_KEY,
  PRINT_SIZE,
  SCREEN_SIZE,
  SYMMETRY_OPTIONS,
  rollSeedPhrase,
  type AvatarHandoff,
  type Take,
} from '../lib/art'
import {
  FOLDS_OFF,
  V2_RENDER_MODES,
  V2_STATIONS,
  foldLabel,
  getV2Station,
  type V2StationId,
  type V2Surface,
} from '../lib/artv2'
import { trimSeedFor, v2Piece } from '../lib/artv2-engine'
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
import { DnaSpliceBench } from '../lib/art-dna-ui'

// Art Studio V2.
//
// Modelled on the Art Studio in every way except the one that matters: the
// artwork. V1 traces particles and accumulates light where their paths cross. V2
// never draws a line. It grows three recursive formulas from the seed — one per
// colour channel — and solves them at every pixel, so the picture is not a
// record of something moving through the frame, it is the frame's own equation.
//
// The three promises the studio makes still hold, and two of them hold harder:
//
//   · the seed phrase IS the piece — and here it is TWO seeds, because the first
//     word grows the colour and the second grows the structure, so the phrase can
//     be changed one half at a time;
//   · resolution independence is exact rather than close. The field is a function
//     of the normalized coordinate, so the 512px avatar and the 1440px print are
//     the same surface sampled more finely — not the same process run longer;
//   · a piece is only recorded when a creator takes it away.
//
// Symmetry is optional here, which is V2's distinguishing control. Unfolded, you
// see the raw formula field; folded 2–16 times, the same field is mirrored around
// its centre. The formula is never told the fold happened, which is why the
// folded piece is recognisably the same artwork.

export const Route = createFileRoute('/artv2')({ component: ArtStudioV2 })

/** The fold count a creator lands on when they first switch symmetry on. */
const DEFAULT_FOLD_COUNT = 6

function ArtStudioV2() {
  const navigate = useNavigate()

  const [station, setStation] = useState<V2StationId>('expression')
  const [seed, setSeed] = useState('opal shatter')
  const [draft, setDraft] = useState('opal shatter')

  // Two pieces of state rather than one, so switching symmetry off and on again
  // returns you to the fold count you were using instead of a default.
  const [foldsOn, setFoldsOn] = useState(false)
  const [foldCount, setFoldCount] = useState<number>(DEFAULT_FOLD_COUNT)
  const folds = foldsOn ? foldCount : FOLDS_OFF

  const [progress, setProgress] = useState(0)
  const [swatches, setSwatches] = useState<string[]>([])
  const [busy, setBusy] = useState<Take | null>(null)
  const [notice, setNotice] = useState('')
  const { ledger, record: pourRecipe } = useArtLedger()

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Resolved through the engine layer rather than by calling a kernel directly,
  // because V2's two live stations plan completely different objects and this
  // page has no business knowing which. Every station's planner is pure and
  // cheap, so deriving during render stays safe and server/client agree.
  const piece = useMemo(() => v2Piece({ station, seed, folds, size: SCREEN_SIZE }), [station, seed, folds])
  const facts = piece.facts

  // The discovery board for the piece on screen. `folds` rather than `foldCount`
  // is what gets claimed, because 0 — symmetry switched off — is this station's
  // base metric and its most valuable rung.
  const {
    name: discoverer,
    rename,
    assisted,
    setAssisted,
    board,
    refresh: refreshBoard,
  } = useDiscovery(station, facts.hash)
  const stationMeta = getV2Station(station)
  const mode = V2_RENDER_MODES[0]

  const paint = useCallback((surface: V2Surface) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const img = ctx.createImageData(surface.size, surface.size)
    img.data.set(surface.px)
    ctx.putImageData(img, 0, 0)
  }, [])

  /* --- solve: row bands, one band per frame ------------------------------- */
  // Banded rather than all-at-once because a heavy formula — or a six-octave
  // lattice — can be a second or more of arithmetic, and a studio that freezes
  // its own tab while painting is not a studio you can work in. Each station
  // sizes its own band, so a 900-node piece, a 120-node one and a noise field
  // whose taps cost several times a formula node all stay smooth.
  useEffect(() => {
    const surface = piece.createSurface()
    const band = piece.band
    setProgress(0)
    setSwatches([])

    let raf = 0
    let cancelled = false

    const step = () => {
      if (cancelled) return
      const done = piece.solveRows(surface, band)
      paint(surface)
      setProgress(surface.solved / facts.size)
      if (done) setSwatches(piece.swatches(surface))
      else raf = requestAnimationFrame(step)
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

  /**
   * Commit, then say what happened to the claim — appended to the action's own
   * report rather than replacing it.
   */
  const commit = useCallback(
    async (take: Take, size: number, lead: string) => {
      const reply = await record(take, size)
      setNotice(lead + (reply ? ` ${claimNotice(reply)}` : ''))
      refreshBoard()
    },
    [record, refreshBoard],
  )

  /** Solve the same field again at another size. Yields, so the tab stays alive. */
  const solveAt = useCallback(
    async (size: number): Promise<HTMLCanvasElement> => {
      // A second piece at the print/avatar size rather than a rescale of the
      // one on screen — the field is a function of position, so this is the same
      // artwork evaluated on a finer grid.
      const off = v2Piece({ station, seed, folds, size })
      const surface = off.createSurface()
      const band = off.band
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (off.solveRows(surface, band)) break
        await new Promise((r) => setTimeout(r, 0))
      }
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const img = ctx.createImageData(size, size)
      img.data.set(surface.px)
      ctx.putImageData(img, 0, 0)
      return canvas
    },
    [station, seed, folds],
  )

  const useAsAvatar = async () => {
    if (busy) return
    setBusy('avatar')
    setNotice('')
    try {
      const canvas = await solveAt(AVATAR_SIZE)
      const handoff: AvatarHandoff = {
        dataUrl: canvas.toDataURL('image/png'),
        recipe: piece.recipe('avatar'),
        hash: facts.hash,
        note: piece.avatarNote(),
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
      const canvas = await solveAt(PRINT_SIZE)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `characterverse-v2-${station}-${facts.hash}-${facts.folds ? `${facts.folds}fold` : 'unfolded'}.png`
      a.click()
      await commit(
        'download',
        PRINT_SIZE,
        `Saved at ${PRINT_SIZE}×${PRINT_SIZE} — the same field, solved on a finer grid. Not an upscale: every pixel was evaluated.`,
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
      `Poured in. The collective was fed a recipe: station, seed phrase and symmetry (${foldLabel(
        facts.folds,
      ).toLowerCase()}).`,
    )
    setBusy(null)
  }

  const solving = progress < 1

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
      {/* ------------------------------------------------------- the stations */}
      <StationGrid stations={V2_STATIONS} active={station} onPick={(id) => setStation(id as V2StationId)} />

      <div className="art-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1.25rem' }}>
        {/* ------------------------------------------------------- the canvas */}
        <div>
          <div style={{ ...card, padding: '0.75rem', background: 'var(--bg-secondary)' }}>
            <canvas
              ref={canvasRef}
              width={SCREEN_SIZE}
              height={SCREEN_SIZE}
              aria-label={`${stationMeta?.name} solved from the seed phrase “${seed}” with symmetry ${
                facts.folds ? `folded ${facts.folds} times` : 'switched off'
              }`}
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 10,
                background: '#000',
              }}
            />
            <PaintProgress progress={progress} working={solving} />
          </div>

          {/* ------------------------------------------------ the canvas read */}
          {/* Declared by the station, not by this page — see `readV2` and
              `readNoise`. Neither matches V1's, because there is nothing here to
              count in particles or steps; and after the first two rows they do
              not match each other either, because a formula field and a noise
              lattice have different quantities worth reporting. */}
          <CanvasRead rows={piece.read(progress)} />

          {/* --------------------------------------------------- the symmetry */}
          {/* V2's headline control, and the one V1 does not have: the fold can be
              switched off entirely, which shows the formula field raw. */}
          <div style={{ ...card, marginTop: '0.75rem', padding: '0.9rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
              <FlipHorizontal2 size={14} color={ART_ACCENT} />
              <span style={{ ...kicker }}>Symmetry</span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { on: false, label: 'Off · raw field' },
                { on: true, label: 'On · folded' },
              ].map((opt) => {
                const active = foldsOn === opt.on
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setFoldsOn(opt.on)
                      setAssisted(false)
                    }}
                    aria-pressed={active}
                    style={{
                      flex: '1 1 160px',
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
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <div style={{ ...kicker, margin: '0.8rem 0 0.35rem', opacity: foldsOn ? 1 : 0.5 }}>Fold count</div>
            <select
              value={foldCount}
              disabled={!foldsOn}
              onChange={(e) => {
                setFoldCount(Number(e.target.value))
                setAssisted(false)
              }}
              aria-label="How many times the field is folded around its centre"
              style={{ ...selectStyle, opacity: foldsOn ? 1 : 0.5, cursor: foldsOn ? 'pointer' : 'not-allowed' }}
            >
              {SYMMETRY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}-fold
                </option>
              ))}
            </select>
            {/* The fold is the studio's control, but what it does to the
                coordinate is the station's business, so the station writes it. */}
            <div style={hintStyle}>
              2–16 fold — how many times the field is folded around its centre. {piece.foldNote}
            </div>
          </div>

          {/* ------------------------------------------------- the render mode */}
          {/* One mode, on purpose. Documented rather than faked into a toggle. */}
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
              {mode.blurb} V1 offers two exposures because its light <em>accumulates</em> into an unbounded buffer and a
              bright piece can bleach out.{' '}
              {/* Why V2 needs only one mode is not the same answer at every
                  station — this used to claim station 01's reason for all of
                  them, which was already false by station 03. The station
                  answers it now. */}
              <span style={{ color: 'var(--text-primary)' }}>{piece.modeNote}</span> A toggle that changed nothing would
              be a lie about the method, so there isn&rsquo;t one.
            </p>
          </div>

          {/* ----------------------------------------------------- the actions */}
          <TakeActions busy={busy} onAvatar={useAsAvatar} onSave={savePng} onPour={pour} />
          <StudioNotice text={notice} />
        </div>

        {/* -------------------------------------------------------- right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
          {/* Seed pair */}
          <div style={{ ...card, padding: '1rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <Sigma size={15} color={ART_ACCENT} />
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {piece.seedPanel.title}
              </span>
            </div>
            {/* How many words a seed is, and what they do, is not the same answer
                at every station — so the station answers it. */}
            <p style={{ margin: '0 0 0.7rem', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {piece.seedPanel.intro}
            </p>

            {/* THE ONE PLACE A STATION SHOWS THROUGH THIS PAGE.
                Three stations take a phrase, so three strings describe their
                whole seed UI and this file never learned their names. Station 04
                takes image files and six dials, and no string describes a file
                input. So there is one branch, and it is here rather than smeared
                through the paint loop: the bench's contract is a `value` string
                and an `onChange`, exactly like the `<input>` it replaces, so
                everything downstream — the claim key, the discovery ladder, the
                recipe, the URL — cannot tell the difference. */}
            {station === 'dna' ? (
              <DnaSpliceBench
                value={seed}
                onChange={(next) => {
                  setDraft(next)
                  setSeed(next)
                  // A strand the director built by splicing and dialling is
                  // theirs, not the AI director's — even if a phrase from
                  // a claw is what grew the genome it started from.
                  setAssisted(false)
                }}
                placeholder={piece.seedPanel.placeholder}
              />
            ) : (
              <>
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
                Solve it
              </button>
              <button
                type="button"
                aria-label="Roll a random seed"
                title="Roll a random seed"
                onClick={() => {
                  // Trimmed to whatever this station actually reads, so the box
                  // never shows a word the piece ignored.
                  const next = trimSeedFor(piece, rollSeedPhrase(Math.floor(Math.random() * 2 ** 31)))
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
              </>
            )}

            {/* Sampled from the finished pixels, not predicted from the seed —
                the field's colour is whatever the formulas evaluate to. */}
            <div style={{ display: 'flex', gap: 3, marginTop: '0.6rem', height: 5 }}>
              {swatches.length > 0 ? (
                swatches.map((c, i) => <div key={i} style={{ flex: 1, borderRadius: 3, background: c }} />)
              ) : (
                <div style={{ flex: 1, borderRadius: 3, background: 'rgba(148,163,184,0.16)' }} />
              )}
            </div>
            <div style={hintStyle}>
              {swatches.length > 0
                ? 'Sampled out of the finished field — V2 has no palette until it has solved one.'
                : 'The palette appears once the field has finished solving.'}
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
              {/* The station's own dials. Station 01 has a colour word, a style
                  word and three node counts; station 02 has a lattice, an octave
                  count and a zoom. Nothing here is shared, so nothing here is
                  written by this page. */}
              {piece.detail().map((f) => (
                <div key={f.label}>
                  {f.label.padEnd(7, '\u00a0')} → <span style={{ color: '#f9a8d4' }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          <ClawPanel
            station={station}
            symmetry={foldsOn ? foldCount : DEFAULT_FOLD_COUNT}
            seedHelp={`Describe a vibe, a mood or a character and the prompt director returns a spread of seeds, a line of art direction and a fold count to try. ${piece.seedHelp}`}
            onApplySeed={(s) => {
              // Trimmed to what the active station reads, client-side as well as
              // server-side: station 01 uses only the first two words, and showing
              // a third would imply otherwise. Station 02 reads the whole phrase,
              // so nothing is dropped there.
              const next = trimSeedFor(piece, s)
              setDraft(next)
              setSeed(next)
              // Recorded, not penalised — the discovery panel below says so.
              setAssisted(true)
            }}
            onApplyMetric={(n) => {
              // A suggested fold count arrives with the fold switched ON, because
              // the number is meaningless otherwise. The 0 rung is reachable from
              // the toggle above, and the claws never suggest it — their axis
              // values include it, so this is a deliberate reading of a nonzero
              // suggestion rather than a clamp.
              setFoldCount(n || DEFAULT_FOLD_COUNT)
              setFoldsOn(n !== 0)
              setAssisted(true)
            }}
          />

          <DiscoveryPanel
            station={station}
            symmetry={folds}
            seed={facts.seed}
            name={discoverer}
            onRename={rename}
            assisted={assisted}
            board={board}
          />

          {/* Feeds the Agentic Codex */}
          <CodexPanel
            ledger={ledger}
            streamNote="Every piece you take away — as an avatar, a PNG, or a deliberate pour — drains into the Synapse Collective’s nursery. Both studios share one feeder stream, because a recipe from either repaints the same way. Turning the dials feeds it nothing."
            recipeNote="A station, a seed phrase and a fold count is the piece, so the collective is fed a re-solvable recipe rather than a pixel dump — aesthetic preference, the one signal that records what a person chose to look at."
          />

          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, padding: '0 0.2rem' }}>
            Solving at {SCREEN_SIZE}px on screen, {AVATAR_SIZE}px as an avatar and {PRINT_SIZE}px as a print. The field
            is a function of position rather than a path through the frame, so those three are the same artwork sampled
            at three densities — exactly, not approximately. {piece.methodNote}
          </div>
        </div>
      </div>
    </div>
  )
}
