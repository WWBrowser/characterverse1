// The splice bench — Art Studio V2, station 04's seed input.
//
// Every other station in either studio takes a phrase in a text box, so the page
// can describe its whole seed UI with three strings. This one takes image files
// and six dials, which is not a string, so it gets a component. It is kept out of
// `art-ui.tsx` because nothing else will ever use it: it is one station's input
// modality, not a studio primitive.
//
// The contract with the page is deliberately the same as an `<input>`'s — a
// `value` string and an `onChange(next)` — so `artv2.tsx` wires it in exactly
// where it wires the text box, and everything downstream (the claim key, the
// discovery ladder, the recipe, the URL) keeps working without knowing this
// component exists. The strand IS the value. That is the whole trick.
//
// THE PREVIEW IS THE RECIPE, LITERALLY
//
// `CombinedDnaPreview` draws `sampleAnchors` — the same function the kernel grades
// every pixel through. It is not a thumbnail of the uploads and it is not a
// decorative summary; it is a render of the sixteen numbers actually written into
// the strand, at 4-bit precision, which is the precision they are stored at. So
// what the preview shows is recoverable from the strand by anyone, forever,
// without the original files. The generator this came from drew its preview by
// stacking the images themselves onto a canvas, which looked better and told you
// less: nothing in that picture survived into the seed.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Dna, ImagePlus, RotateCcw } from 'lucide-react'
import {
  DNA_DEFAULTS,
  DNA_DIALS,
  GRID,
  THUMB,
  anchorsFromThumb,
  encodeStrand,
  genomeOf,
  sampleAnchors,
  weightedSum,
  withDial,
  type DnaDialKey,
  type Genome,
} from './artv2-dna.js'
import { ART_ACCENT, hintStyle, mono } from './art-ui.js'

/**
 * The Combined DNA Preview.
 *
 * Rendered at whatever pixel size the layout gives it, from a 4×4 grid, through
 * the kernel's own bilinear sampler. Drawn on a canvas rather than as a CSS
 * gradient because a CSS gradient would be the browser's interpolation and not
 * the field's, and then the preview and the piece would disagree in the corners.
 */
export function CombinedDnaPreview({
  genome,
  size = 108,
  label,
}: {
  genome: Genome
  size?: number
  label: string
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const n = size
    canvas.width = n
    canvas.height = n
    const img = ctx.createImageData(n, n)
    const rgb: [number, number, number] = [0, 0, 0]
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // The +0.5 samples the middle of each preview pixel, which is what makes
        // the four corners land exactly on the four corner anchors instead of
        // half a pixel inside them.
        sampleAnchors(genome.anchors, (i + 0.5) / n, (j + 0.5) / n, rgb)
        const o = (i + j * n) * 4
        img.data[o] = rgb[0]
        img.data[o + 1] = rgb[1]
        img.data[o + 2] = rgb[2]
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [genome, size])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {/* The user who asked for this station named this element, and the name is
          the claim it makes, so it is on screen and not only in the a11y label. */}
      <div
        style={{
          fontSize: '0.58rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: size,
          lineHeight: 1.3,
        }}
      >
        Combined DNA Preview
      </div>
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'block',
        }}
      />
      {/* The grid is 4×4 and the preview is smooth, so say which one is the
          recipe. Sixteen numbers, not however many pixels this canvas is. */}
      <div style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        {GRID}×{GRID} · 4-bit
      </div>
    </div>
  )
}

/**
 * Read the selected files the way the generator reads them, and return a genome.
 *
 * The layering is the generator's exactly: a cleared 20×20 canvas, each image
 * drawn over it at `globalAlpha = 1 / count`, and after every single draw the
 * WHOLE canvas summed with `data[j] * (j + 1) * (i + 1)`. That cumulative read is
 * not a bug to tidy up — it is what makes the order of the files matter, and it
 * makes it matter twice, since each earlier image is re-counted inside every
 * later image's sum at a new weight.
 *
 * `decode` rather than `FileReader` + `Image`: same result, no data-URL round
 * trip, and it cannot fire out of order.
 */
async function spliceFiles(files: File[], base: Genome): Promise<Genome> {
  const canvas = document.createElement('canvas')
  canvas.width = THUMB
  canvas.height = THUMB
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return base
  ctx.clearRect(0, 0, THUMB, THUMB)

  let combinedSum = 0
  let drawn = 0
  for (let i = 0; i < files.length; i++) {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(files[i])
    } catch {
      // A file the browser cannot decode is skipped rather than fatal — the
      // director picked several images and one bad PNG should not lose the rest.
      continue
    }
    ctx.globalAlpha = 1 / files.length
    ctx.drawImage(bitmap, 0, 0, THUMB, THUMB)
    bitmap.close()
    drawn++
    combinedSum += weightedSum(ctx.getImageData(0, 0, THUMB, THUMB).data, i)
  }
  ctx.globalAlpha = 1

  if (drawn === 0) return base
  return {
    ...base,
    // Folded to 32 bits because that is what a strand holds. It costs nothing:
    // every step of the generator's own RNG is taken modulo 2³² anyway, so the
    // formulas grown from the folded sum are the formulas it would have grown.
    sum: combinedSum >>> 0,
    images: Math.min(15, drawn),
    anchors: anchorsFromThumb(ctx.getImageData(0, 0, THUMB, THUMB).data),
  }
}

const MAX_FILES = 15

export function DnaSpliceBench({
  value,
  onChange,
  placeholder,
}: {
  /** The current seed — a strand, or a phrase to grow one from. */
  value: string
  onChange: (next: string) => void
  placeholder: string
}) {
  const genome = genomeOf(value)
  const fileId = useId()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // The box follows the seed when the seed changes underneath it — the dice, a
  // shared link, ArtisticClaw, a dial. Without this, moving a slider would leave
  // a stale strand visible in the box while the canvas painted a different one.
  useEffect(() => setDraft(value), [value])

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const picked = Array.from(files || []).slice(0, MAX_FILES)
      if (picked.length === 0) return
      setBusy(true)
      setNote('')
      try {
        const next = await spliceFiles(picked, genome)
        if (next.images === 0) {
          setNote('None of those files could be decoded as images.')
        } else {
          onChange(encodeStrand(next))
          setNote(
            `${next.images} image${next.images === 1 ? '' : 's'} spliced. The strand below is now the whole recipe — the files are not needed again.`,
          )
        }
      } finally {
        setBusy(false)
        // Cleared so that picking the SAME files again re-fires. It has to: the
        // order they are read in changes the sum, and a director comparing two
        // orderings would otherwise get no response on the second try.
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [genome, onChange],
  )

  const setDial = useCallback(
    (key: DnaDialKey, v: number) => onChange(encodeStrand(withDial(genome, key, v))),
    [genome, onChange],
  )

  const copy = useCallback(() => {
    const strand = encodeStrand(genome)
    void navigator.clipboard?.writeText(strand).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => setNote('Could not reach the clipboard — select the strand and copy it by hand.'),
    )
  }, [genome])

  const spliced = genome.images > 0
  const isStrand = value.trim().toLowerCase().startsWith('dna1-')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* --------------------------------------------- the splice + the preview */}
      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
        <CombinedDnaPreview
          genome={genome}
          label={
            spliced
              ? `Combined DNA preview — the colour signature of ${genome.images} spliced image${genome.images === 1 ? '' : 's'}`
              : 'Combined DNA preview — a colour signature synthesised from the seed phrase'
          }
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <input
            ref={inputRef}
            id={fileId}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => void onFiles(e.target.files)}
            style={{ display: 'none' }}
          />
          <label
            htmlFor={fileId}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.6rem',
              borderRadius: 10,
              border: `1px dashed ${ART_ACCENT}`,
              background: 'rgba(236,72,153,0.1)',
              color: '#f9a8d4',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: busy ? 'progress' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? <Dna size={14} /> : <ImagePlus size={14} />}
            {busy ? 'Splicing…' : spliced ? 'Splice different images' : 'Splice images'}
          </label>
          <div style={{ ...hintStyle, marginTop: 0 }}>
            {spliced
              ? `${genome.images} image${genome.images === 1 ? '' : 's'} in this strand. Order matters — the same pictures in a different order are a different piece.`
              : `Up to ${MAX_FILES} images. They are read once, at ${THUMB}×${THUMB}, and never uploaded anywhere.`}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ the strand */}
      <div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onChange(draft)
            }}
            onBlur={() => {
              if (draft !== value) onChange(draft)
            }}
            maxLength={120}
            placeholder={placeholder}
            aria-label="Strand or seed phrase"
            spellCheck={false}
            style={{
              flex: 1,
              minWidth: 0,
              ...mono,
              fontSize: '0.68rem',
              padding: '0.5rem 0.6rem',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            onClick={copy}
            aria-label="Copy the strand"
            title="Copy the strand"
            style={{
              width: 38,
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: copied ? '#199e70' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div style={hintStyle}>
          {isStrand
            ? 'This strand is the entire recipe. Anyone who has it repaints this exact piece.'
            : 'A phrase, not a strand yet. Move a dial or splice an image and it becomes one — with this phrase’s genome inside it.'}
        </div>
      </div>

      {/* ------------------------------------------------------------- the dials */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {DNA_DIALS.map((dial) => {
          const v = genome[dial.key]
          return (
            <label key={dial.key} style={{ display: 'block' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                  marginBottom: '0.15rem',
                }}
              >
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {dial.label}
                </span>
                <span style={{ ...mono, fontSize: '0.68rem', color: '#f9a8d4' }}>{dial.format(v)}</span>
              </div>
              <input
                type="range"
                min={dial.min}
                max={dial.max}
                step={dial.step}
                value={v}
                onChange={(e) => setDial(dial.key, Number(e.target.value))}
                style={{ width: '100%', accentColor: ART_ACCENT, display: 'block' }}
              />
              <div style={{ ...hintStyle, marginTop: '0.1rem' }}>{dial.hint}</div>
            </label>
          )
        })}
      </div>

      <button
        type="button"
        // The genome is the part that came from the pictures and is not
        // reproducible without them; the dials are the part anyone can move back.
        // So this resets the six and leaves the seventeen numbers alone.
        onClick={() => onChange(encodeStrand({ ...genome, ...DNA_DEFAULTS }))}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.35rem',
          padding: '0.45rem',
          borderRadius: 9,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          fontSize: '0.74rem',
          cursor: 'pointer',
        }}
      >
        <RotateCcw size={13} />
        Reset the dials, keep the genome
      </button>

      {note ? (
        <div
          role="status"
          style={{
            fontSize: '0.72rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            padding: '0.45rem 0.6rem',
            borderRadius: 9,
            borderLeft: `2px solid ${ART_ACCENT}`,
            background: 'var(--bg-secondary)',
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  )
}
