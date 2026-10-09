import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { SYMMETRY_OPTIONS } from '../lib/art.js'
import { DECAY_GENERATIONS, DECAY_REF } from '../lib/artv3.js'
import { BLEND_PURE_WONDERS, CLAWS, SPREAD_SIZE, wondersQuota } from '../lib/claws.js'
import { STUDIOS } from '../lib/art-registry.js'
import { TIER_LABEL, assistLabel, metricLabel, metricsOf, tierOf, type Claim } from '../lib/art-discovery.js'
import { getSessionId } from '../lib/create-ui.js'

// How each art station works — the studios' method, written down.
//
// Modelled on `/zkp`, and for the same reason: the interesting claims a generator
// makes are claims about *how it arrives at a picture*, and those cannot be seen
// by looking at the picture. Two fields can look alike and be produced by
// unrelated mathematics; two fields can look nothing alike and come off the same
// kernel with one dial moved. A studio that will not say which is which is asking
// to be taken on trust.
//
// It is also where the discovery rules live, because they only make sense once
// the method is on the table. A generated piece has no author in the sense
// copyright means — the equations were written before any seed was typed, and the
// seed is a coordinate, not a brushstroke. What a person can genuinely be first
// to do is *find* one. So the studios record discovery, and this page states the
// ladder plainly enough that somebody racing for a claim knows what they are
// racing for.
//
// Same honesty rule as the tunnel document: chips say what is built and what is
// not, and the numbers in the prose are read off the kernels rather than rounded
// for effect.

type Status = 'built' | 'partial' | 'future'

const STATUS_COPY: Record<Status, { label: string; colour: string }> = {
  // Word plus colour, never colour alone.
  built: { label: 'Painting now', colour: '#199e70' },
  partial: { label: 'Kernel only', colour: '#c98500' },
  future: { label: 'Not built', colour: '#9090b0' },
}

function Chip({ status }: { status: Status }) {
  const s = STATUS_COPY[status]
  return (
    <span className="chip" style={{ color: s.colour, borderColor: s.colour + '55' }}>
      {s.label}
    </span>
  )
}

function Section({
  n,
  title,
  status,
  children,
}: {
  n: string
  title: string
  status?: Status
  children: React.ReactNode
}) {
  return (
    <section className="sec">
      {/* h3, not h2: the hub band above owns this page's only h1 and the doc
          title below is its h2, so the outline stays in order. */}
      <h3>
        <span className="secn">{n}</span>
        {title}
        {status && <Chip status={status} />}
      </h3>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------- the diagrams */

function TraceDiagram() {
  return (
    <figure className="fig">
      <svg viewBox="0 0 560 200" role="img" aria-labelledby="trace-title trace-desc">
        <title id="trace-title">One particle traced through a flow field, then folded</title>
        <desc id="trace-desc">
          A seed produces a field of wave numbers and phases. Each particle starts at its own
          position, is pushed by the field for a few hundred steps, and every step deposits a small
          amount of light. The finished path is then copied around the centre once per fold.
        </desc>
        <text x="16" y="22" fill="#9090b0" fontSize="11">seed → field constants</text>
        <rect x="12" y="32" width="120" height="150" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="26" y="58" fill="#e8e8f5" fontSize="11" fontWeight="600">wave numbers</text>
        <text x="26" y="76" fill="#9090b0" fontSize="10">phases, span, steps</text>
        <text x="26" y="94" fill="#9090b0" fontSize="10">particle count</text>
        <text x="26" y="126" fill="#9090b0" fontSize="10">fixed for the</text>
        <text x="26" y="141" fill="#9090b0" fontSize="10">whole piece</text>

        <path
          d="M180 150 C 210 96, 246 168, 280 112 C 312 60, 344 130, 372 92"
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2"
        />
        {[180, 214, 248, 280, 312, 344, 372].map((x, i) => (
          <circle key={x} cx={x} cy={[150, 108, 152, 112, 74, 122, 92][i]} r="2.5" fill="#f9a8d4" />
        ))}
        <text x="176" y="176" fill="#9090b0" fontSize="10">one particle, one step at a time</text>
        <text x="176" y="46" fill="#e8e8f5" fontSize="11" fontWeight="600">the walk</text>
        <text x="176" y="63" fill="#9090b0" fontSize="10">each step splats light into four neighbouring pixels</text>

        <circle cx="480" cy="106" r="54" fill="none" stroke="#2d2d45" strokeWidth="2" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <line
            key={deg}
            x1="480"
            y1="106"
            x2={480 + 54 * Math.cos((deg * Math.PI) / 180)}
            y2={106 + 54 * Math.sin((deg * Math.PI) / 180)}
            stroke="#ec4899"
            strokeWidth="1.5"
          />
        ))}
        <text x="480" y="46" fill="#e8e8f5" fontSize="11" fontWeight="600" textAnchor="middle">the fold</text>
        <text x="480" y="178" fill="#9090b0" fontSize="10" textAnchor="middle">6-fold shown</text>
      </svg>
      <figcaption>
        Nothing here is a filter over a finished image. The symmetry is in the deposit: each step is
        written once per fold, so the folds are as sharp as the trace and cost nothing to add.
      </figcaption>
    </figure>
  )
}

function FormulaDiagram() {
  return (
    <figure className="fig">
      <svg viewBox="0 0 560 210" role="img" aria-labelledby="form-title form-desc">
        <title id="form-title">A formula grown from a seed word and solved per pixel</title>
        <desc id="form-desc">
          The style word grows one expression tree per colour channel out of six operators over the
          pixel coordinates. Each tree is flattened to a postfix program and evaluated once for every
          pixel, and its result is mapped through a sine into a byte.
        </desc>
        <text x="16" y="22" fill="#9090b0" fontSize="11">style word → three trees (red, green, blue)</text>

        <circle cx="96" cy="52" r="15" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="96" y="56" fill="#e8e8f5" fontSize="10" textAnchor="middle">mul</text>
        <line x1="85" y1="63" x2="56" y2="92" stroke="#2d2d45" strokeWidth="2" />
        <line x1="107" y1="63" x2="136" y2="92" stroke="#2d2d45" strokeWidth="2" />
        <circle cx="46" cy="104" r="15" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="46" y="108" fill="#e8e8f5" fontSize="10" textAnchor="middle">sin</text>
        <circle cx="146" cy="104" r="15" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="146" y="108" fill="#e8e8f5" fontSize="10" textAnchor="middle">avg</text>
        <line x1="46" y1="119" x2="46" y2="144" stroke="#2d2d45" strokeWidth="2" />
        <line x1="136" y1="117" x2="112" y2="146" stroke="#2d2d45" strokeWidth="2" />
        <line x1="156" y1="117" x2="180" y2="146" stroke="#2d2d45" strokeWidth="2" />
        <text x="46" y="162" fill="#f9a8d4" fontSize="10" textAnchor="middle">x</text>
        <text x="112" y="162" fill="#f9a8d4" fontSize="10" textAnchor="middle">y</text>
        <text x="180" y="162" fill="#f9a8d4" fontSize="10" textAnchor="middle">x</text>
        <text x="96" y="188" fill="#9090b0" fontSize="10" textAnchor="middle">depth 12, leaves at 10% per node</text>

        <text x="250" y="90" fill="#9090b0" fontSize="20">→</text>

        <rect x="288" y="36" width="256" height="60" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="304" y="60" fill="#e8e8f5" fontSize="11" fontWeight="600">postfix program, Int32Array</text>
        <text x="304" y="80" fill="#9090b0" fontSize="10">solved on a small float stack — no recursion at paint time</text>

        <rect x="288" y="112" width="256" height="72" rx="10" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="304" y="136" fill="#e8e8f5" fontSize="11" fontWeight="600">per pixel</text>
        <text x="304" y="155" fill="#9090b0" fontSize="10">(sin(value × π + phase) + 1) × 127.5 → byte</text>
        <text x="304" y="173" fill="#9090b0" fontSize="10">phase per channel comes from the colour word</text>
      </svg>
      <figcaption>
        The colour word never touches the shape and the style word never touches the palette. That is
        why swapping one word of a two-word seed recolours a piece without redrawing it.
      </figcaption>
    </figure>
  )
}

function LatticeDiagram() {
  return (
    <figure className="fig">
      <svg viewBox="0 0 560 210" role="img" aria-labelledby="latt-title latt-desc">
        <title id="latt-title">A permutation table shuffled by the seed, read as a gradient lattice</title>
        <desc id="latt-desc">
          The seed phrase is hashed to a number, which seeds a linear congruential generator that
          shuffles a 256-entry table. The table is doubled to 512 so lookups wrap. Each cell of an
          integer lattice takes a gradient from the table, and a sample point is interpolated from
          its four surrounding corners. Several octaves at doubling frequency are summed, and the one
          resulting value is read at three phases to give the three colour channels.
        </desc>
        <text x="16" y="22" fill="#9090b0" fontSize="11">seed phrase → one number → shuffled table</text>

        <rect x="16" y="34" width="212" height="46" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="30" y="54" fill="#e8e8f5" fontSize="11" fontWeight="600">256 entries, Fisher–Yates</text>
        <text x="30" y="71" fill="#9090b0" fontSize="10">s = (s × 9301 + 49297) mod 233280</text>
        <text x="16" y="98" fill="#9090b0" fontSize="10">doubled to 512 so the lattice wraps</text>

        {/* the lattice cell */}
        <text x="16" y="128" fill="#9090b0" fontSize="11">one cell, four corners</text>
        <rect x="30" y="138" width="52" height="52" fill="none" stroke="#2d2d45" strokeWidth="2" />
        {[[30, 138, 1, 1], [82, 138, -1, 1], [30, 190, 1, -1], [82, 190, -1, -1]].map(([cx, cy, dx, dy], i) => (
          <g key={i}>
            <line x1={cx} y1={cy} x2={cx + dx * 14} y2={cy - dy * 14} stroke="#a78bfa" strokeWidth="2" />
            <circle cx={cx} cy={cy} r="3" fill="#ec4899" />
          </g>
        ))}
        <circle cx="62" cy="166" r="3.5" fill="#f9a8d4" />
        <text x="96" y="160" fill="#9090b0" fontSize="10">gradient per corner,</text>
        <text x="96" y="175" fill="#9090b0" fontSize="10">faded 6t⁵−15t⁴+10t³</text>

        <text x="250" y="112" fill="#9090b0" fontSize="20">→</text>

        <rect x="288" y="36" width="256" height="66" rx="10" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="304" y="58" fill="#e8e8f5" fontSize="11" fontWeight="600">octaves summed</text>
        <text x="304" y="76" fill="#9090b0" fontSize="10">×2 frequency, ×0.5 amplitude, 2 to 6 deep</text>
        <text x="304" y="93" fill="#9090b0" fontSize="10">normalised by total amplitude</text>

        <rect x="288" y="116" width="256" height="74" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="304" y="138" fill="#e8e8f5" fontSize="11" fontWeight="600">one value, three phases</text>
        <text x="304" y="156" fill="#9090b0" fontSize="10">(sin(v × bandᶜ × π + phaseᶜ) + 1) × 127.5</text>
        <text x="304" y="174" fill="#9090b0" fontSize="10">solved once per pixel, read three times</text>
      </svg>
      <figcaption>
        The gradients are the reason this station cannot make an incoherent square. Two neighbouring
        points share lattice corners, so they share gradients, so the field between them is forced to
        flow rather than jump.
      </figcaption>
    </figure>
  )
}

function VortexDiagram() {
  const arm = (deg: number, len: number) =>
    `M 480 106 Q ${480 + len * 0.6 * Math.cos(((deg - 26) * Math.PI) / 180)} ${106 + len * 0.6 * Math.sin(((deg - 26) * Math.PI) / 180)} ${480 + len * Math.cos((deg * Math.PI) / 180)} ${106 + len * Math.sin((deg * Math.PI) / 180)}`

  return (
    <figure className="fig">
      <svg viewBox="0 0 560 200" role="img" aria-labelledby="vort-title vort-desc">
        <title id="vort-title">A polar velocity rotated into the plane, swirled, and streaked</title>
        <desc id="vort-desc">
          The wave equations answer in polar terms — one velocity outward, one around. Those two are
          rotated into a flat x and y velocity, a rigid swirl is added on top, and the particle is
          moved in the plane. The segment it just covered is stroked as a line whose colour comes
          from the direction it was travelling.
        </desc>

        <text x="16" y="22" fill="#9090b0" fontSize="11">the wave answers in polar</text>
        <circle cx="72" cy="112" r="46" fill="none" stroke="#2d2d45" strokeWidth="2" />
        <circle cx="72" cy="112" r="2.5" fill="#9090b0" />
        <line x1="72" y1="112" x2="112" y2="88" stroke="#2d2d45" strokeWidth="1.5" />
        <line x1="112" y1="88" x2="146" y2="68" stroke="#ec4899" strokeWidth="2.5" />
        <line x1="112" y1="88" x2="126" y2="118" stroke="#a78bfa" strokeWidth="2.5" />
        <text x="150" y="64" fill="#ec4899" fontSize="10">outward</text>
        <text x="130" y="132" fill="#a78bfa" fontSize="10">around</text>
        <text x="16" y="180" fill="#9090b0" fontSize="10">r and θ, from A–H</text>

        <text x="232" y="22" fill="#e8e8f5" fontSize="11" fontWeight="600">rotated into the plane</text>
        <line x1="240" y1="132" x2="330" y2="132" stroke="#2d2d45" strokeWidth="1.5" />
        <line x1="240" y1="132" x2="240" y2="58" stroke="#2d2d45" strokeWidth="1.5" />
        <line x1="240" y1="132" x2="316" y2="76" stroke="#ec4899" strokeWidth="2.5" />
        <text x="322" y="72" fill="#9090b0" fontSize="10">dx, dy</text>
        <path d="M264 118 A 30 30 0 0 1 288 104" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="248" y="152" fill="#a78bfa" fontSize="10">+ rigid swirl</text>
        <text x="248" y="167" fill="#9090b0" fontSize="10">+ a held kick</text>
        <text x="248" y="182" fill="#9090b0" fontSize="10">then x += dx · dt</text>

        <text x="480" y="22" fill="#e8e8f5" fontSize="11" fontWeight="600" textAnchor="middle">
          the streak
        </text>
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
          <path
            key={deg}
            d={arm(deg, 52)}
            fill="none"
            stroke={['#ec4899', '#f9a8d4', '#a78bfa', '#ec4899', '#f9a8d4', '#a78bfa'][i]}
            strokeWidth="2"
            opacity="0.9"
          />
        ))}
        <circle cx="480" cy="106" r="2.5" fill="#e8e8f5" />
        <text x="480" y="178" fill="#9090b0" fontSize="10" textAnchor="middle">
          hue from heading, not position
        </text>
      </svg>
      <figcaption>
        No fold loop anywhere. The six arms are the wave equation&rsquo;s own — the fold count
        multiplies θ inside the sine, so raising it changes which field is traced rather than
        mirroring a finished one.
      </figcaption>
    </figure>
  )
}

function BurstDiagram() {
  // The ray is drawn as its own deposits rather than as a stroked line, because
  // that is literally what it is — the station never draws a path, only the dots
  // the path happens to pass through.
  const dots = Array.from({ length: 10 }, (_, i) => ({
    x: 306 + (i * 224) / 9,
    y: 40 + (i * 56) / 9,
    o: 1 - i / 10,
  }))

  return (
    <figure className="fig">
      <svg viewBox="0 0 560 232" role="img" aria-labelledby="burst-title burst-desc">
        <title id="burst-title">Two words split into a palette and a throw, then embers composited where they land</title>
        <desc id="burst-desc">
          The first seed word is hashed into its own random stream and decides a hue window and how
          many stops it is quantised to. The second word is hashed into a separate stream and decides
          every ember&rsquo;s birth offset, velocity, reach, aspect and lifetime. Each ember then flies
          in a dead straight line for its hundred steps, fading linearly to zero, and every step
          deposits one small disc composited source-over onto what is already there.
        </desc>

        <text x="16" y="20" fill="#9090b0" fontSize="11">two words, two streams</text>

        <rect x="16" y="30" width="236" height="58" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="32" y="52" fill="#e8e8f5" fontSize="11" fontWeight="600">colour word → hue window</text>
        <text x="32" y="69" fill="#9090b0" fontSize="10">a base, a span, quantised to n stops</text>

        <rect x="16" y="98" width="236" height="76" rx="10" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="32" y="120" fill="#e8e8f5" fontSize="11" fontWeight="600">flow word → the throw</text>
        <text x="32" y="137" fill="#9090b0" fontSize="10">birth ±50 px, velocity ±1.5 px per step</text>
        <text x="32" y="154" fill="#9090b0" fontSize="10">reach, aspect, feathered lifetimes</text>

        <text x="16" y="196" fill="#9090b0" fontSize="10">one hash each — never one hash for both</text>

        <text x="264" y="120" fill="#9090b0" fontSize="20">→</text>

        <text x="296" y="20" fill="#9090b0" fontSize="11">one ember: 100 steps, no field, no forces</text>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="4.5" fill="#f9a8d4" opacity={d.o} />
        ))}
        <text x="296" y="120" fill="#9090b0" fontSize="10">
          alpha = (life − step) / life, straight down to exactly 0
        </text>

        <rect x="296" y="132" width="248" height="84" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="312" y="154" fill="#e8e8f5" fontSize="11" fontWeight="600">composited source-over</text>
        <text x="312" y="172" fill="#9090b0" fontSize="10">px = px × (1 − alpha) + ember × alpha</text>
        <text x="312" y="189" fill="#9090b0" fontSize="10">a weighted average of two bounded</text>
        <text x="312" y="206" fill="#9090b0" fontSize="10">colours, so it cannot climb past white</text>
      </svg>
      <figcaption>
        The order of that compositing is part of the piece. Because each deposit averages with what
        is already under it rather than adding to it, drawing all of one ember&rsquo;s hundred steps
        before starting the next would give a different picture from the same numbers. The loop over
        steps is therefore the outer loop — every ember advances one step, then every ember advances
        again.
      </figcaption>
    </figure>
  )
}

function DnaDiagram() {
  // The two extractions are drawn side by side deliberately: the whole point of
  // this station is that the images leave TWO marks on the strand, not one, and
  // the original only ever kept the first of them.
  const steps = [
    'fold the point about the centre \u2014 first, so everything below sees the folded point',
    'sample the 4\u00d74 grid at that point, bilinear, per-axis clamped \u2192 one colour',
    'crystallise: snap to a ((105 \u2212 c) \u00d7 size / 500) px block, in pixel units',
    'twist: rotate the point by (twist / 10) \u00d7 its radius',
    'solve the three trees there \u2192 (v + 1) \u00d7 127.5, already inside 0\u2013255',
    'neon: pow(t / 255, 1.2) \u00d7 255 \u00d7 mult \u2014 only when mult is above 1',
    'graft: t \u00d7 (1 \u2212 g) + (t / 255) \u00d7 dna \u00d7 g \u2014 cannot clip, by construction',
  ]

  return (
    <figure className="fig">
      <svg viewBox="0 0 560 330" role="img" aria-labelledby="dna-title dna-desc">
        <title id="dna-title">Many images reduced to one 20-by-20 thumbnail, which leaves two separate marks on an encoded strand</title>
        <desc id="dna-desc">
          Every uploaded image is drawn onto the same twenty-by-twenty canvas at one-over-n opacity.
          That accumulated thumbnail is read twice: once as a position-weighted sum, which becomes a
          thirty-two bit integer seeding the random stream that grows three formula trees, and once as
          sixteen four-by-five-pixel block averages, which become sixteen colours at four bits per
          channel. Both, plus six dial settings, are packed into a two-hundred-and-seventy-three bit
          strand written as fifty-five base-thirty-two characters. The lower panel lists the seven
          operations applied at every pixel, in order.
        </desc>

        <text x="16" y="20" fill="#9090b0" fontSize="11">n images, one 20×20 thumbnail</text>

        <rect x="16" y="30" width="170" height="76" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="30" y="52" fill="#e8e8f5" fontSize="11" fontWeight="600">α = 1 / n, accumulated</text>
        <text x="30" y="70" fill="#9090b0" fontSize="10">each draw lands on the same</text>
        <text x="30" y="86" fill="#9090b0" fontSize="10">400 pixels as the ones before</text>

        <text x="196" y="72" fill="#9090b0" fontSize="20">→</text>

        <rect x="224" y="30" width="164" height="34" rx="8" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="238" y="51" fill="#e8e8f5" fontSize="10.5">Σ d[j] × (j+1) × (i+1) → 32 bits</text>

        <rect x="224" y="72" width="164" height="34" rx="8" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="238" y="93" fill="#e8e8f5" fontSize="10.5">16 block averages → 192 bits</text>

        <text x="238" y="124" fill="#9090b0" fontSize="10">a seed for the trees</text>
        <text x="238" y="139" fill="#9090b0" fontSize="10">and a palette to graft — both, not one</text>

        <text x="396" y="72" fill="#9090b0" fontSize="20">→</text>

        <rect x="422" y="30" width="122" height="76" rx="10" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="436" y="52" fill="#e8e8f5" fontSize="11" fontWeight="600">dna1-…</text>
        <text x="436" y="70" fill="#9090b0" fontSize="10">273 bits as 55</text>
        <text x="436" y="86" fill="#9090b0" fontSize="10">base32 characters</text>

        <text x="16" y="176" fill="#9090b0" fontSize="11">then, at every pixel, in this order</text>

        <rect x="16" y="186" width="528" height="132" rx="10" fill="none" stroke="#2d2d45" strokeWidth="2" />
        {steps.map((t, i) => (
          <text key={i} x="32" y={206 + i * 16} fill={i === 0 || i === 6 ? '#f9a8d4' : '#9090b0'} fontSize="10.5">
            {`${i + 1}. ${t}`}
          </text>
        ))}
      </svg>
      <figcaption>
        Steps 1 and 7 are the two this station added to the generator it came from, and they are
        marked because everything between them is the original&rsquo;s arithmetic in the
        original&rsquo;s order. Step 1 is first rather than last so that the crystal blocks and the
        twist are folded along with the field, which is what makes the folded piece look built rather
        than mirrored. Step 7 is the only place the images&rsquo; own colours reach the frame.
      </figcaption>
    </figure>
  )
}

function DecayDiagram() {
  // Two columns because the station has two phases and the second one reads the
  // first — the arrow that matters in this figure is the short one pointing back
  // up from the melt to the row above it.
  const stages = [
    { y: 30, name: 'tear', detail: 'one offset per row, wrapped' },
    { y: 74, name: 'channel split', detail: 'red and blue ±20px, clamped' },
    { y: 118, name: 'melt', detail: 'bright pixels take the row above' },
    { y: 162, name: 'scanline × 0.7, then XOR noise', detail: '1–5% of pixels, all three channels' },
  ]
  return (
    <figure className="fig">
      <svg viewBox="0 0 560 244" role="img" aria-labelledby="decay-title decay-desc">
        <title id="decay-title">One stream builds a composition, then a corruption pass tears it apart</title>
        <desc id="decay-desc">
          One phrase seeds one random stream. The stream is drawn from in order: six palette colours,
          then a ground and twenty to fifty blended shapes and glyph runs, then every corruption pass.
          The pass tears each row sideways, samples red and blue from either side of the torn
          position, drags bright pixels down by copying the pixel above them out of the buffer it is
          writing, darkens every third row and XORs random bytes through a small fraction of what is
          left.
        </desc>

        <text x="16" y="18" fill="#9090b0" fontSize="11">phase 1 · build it</text>

        <rect x="16" y="28" width="228" height="46" rx="10" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <text x="30" y="48" fill="#e8e8f5" fontSize="11" fontWeight="600">palette — 6 exact colours</text>
        <text x="30" y="65" fill="#9090b0" fontSize="10">black, white, three hues 120° apart, one dark</text>

        <rect x="16" y="84" width="228" height="64" rx="10" fill="rgba(236,72,153,0.12)" stroke="#ec4899" strokeWidth="2" />
        <text x="30" y="104" fill="#e8e8f5" fontSize="11" fontWeight="600">20–50 elements over a ground</text>
        <text x="30" y="121" fill="#9090b0" fontSize="10">rect · disc · polygon · a run of ASCII</text>
        <text x="30" y="138" fill="#9090b0" fontSize="10">one of five blend modes each</text>

        <text x="16" y="170" fill="#9090b0" fontSize="10">placed from −20% to +120% of the frame,</text>
        <text x="16" y="185" fill="#9090b0" fontSize="10">so most elements are partly outside it</text>
        <text x="16" y="212" fill="#9090b0" fontSize="10">nothing is random here — every number</text>
        <text x="16" y="227" fill="#9090b0" fontSize="10">above came off the seed&rsquo;s one stream</text>

        <text x="256" y="120" fill="#9090b0" fontSize="20">→</text>

        <text x="292" y="18" fill="#9090b0" fontSize="11">phase 2 · one pass, in this order</text>
        {stages.map((st, i) => (
          <g key={st.name}>
            <rect
              x="292"
              y={st.y}
              width="252"
              height="36"
              rx="8"
              fill="none"
              stroke={i === 2 ? '#ec4899' : '#2d2d45'}
              strokeWidth="2"
            />
            <text x="306" y={st.y + 16} fill={i === 2 ? '#f9a8d4' : '#e8e8f5'} fontSize="11" fontWeight="600">
              {st.name}
            </text>
            <text x="306" y={st.y + 30} fill="#9090b0" fontSize="10">
              {st.detail}
            </text>
          </g>
        ))}
        <path d="M 536 136 l 10 0 l 0 -32 l -10 0" fill="none" stroke="#ec4899" strokeWidth="2" />
        <text x="292" y="216" fill="#f9a8d4" fontSize="10">
          the melt reads the DESTINATION buffer, not the source —
        </text>
        <text x="292" y="231" fill="#9090b0" fontSize="10">
          it copies the row this pass has just finished writing
        </text>
      </svg>
      <figcaption>
        That one arrow is what separates this studio from the other two. V1 and V2 both write a frame
        from numbers; nothing they draw ever asks what is already on the canvas. Here the third stage
        of the pass reads the row it wrote a moment ago, which is why a generation cannot be computed
        for a single pixel, why the passes have to run in order, and why the piece is a lineage rather
        than a view.
      </figcaption>
    </figure>
  )
}

function LadderDiagram() {
  return (
    <figure className="fig">
      <svg viewBox="0 0 560 168" role="img" aria-labelledby="ladder-title ladder-desc">
        <title id="ladder-title">One discovery and many sub-discoveries per seed</title>
        <desc id="ladder-desc">
          A seed's base setting is its discovery. Every other setting on the studio's second axis —
          fold counts in V1 and V2, generations of decay in V3 — is a sub-discovery, claimable by
          anybody, independently of who holds the discovery.
        </desc>
        <rect x="12" y="20" width="176" height="56" rx="10" fill="rgba(236,72,153,0.12)" stroke="#ec4899" strokeWidth="2" />
        <text x="28" y="44" fill="#f9a8d4" fontSize="11" fontWeight="700">DISCOVERY</text>
        <text x="28" y="63" fill="#9090b0" fontSize="10">the base setting — one per seed</text>

        <line x1="188" y1="48" x2="228" y2="48" stroke="#2d2d45" strokeWidth="2" />
        {[
          { y: 16, label: 'next rung' },
          { y: 58, label: '…' },
          { y: 100, label: 'last rung' },
        ].map((row) => (
          <g key={row.y}>
            <line x1="228" y1="48" x2="252" y2={row.y + 18} stroke="#2d2d45" strokeWidth="2" />
            <rect x="252" y={row.y} width="292" height="36" rx="8" fill="none" stroke="#2d2d45" strokeWidth="2" />
            <text x="268" y={row.y + 23} fill="#9090b0" fontSize="10">
              SUB-DISCOVERY · {row.label} · claimed by whoever commits it first
            </text>
          </g>
        ))}
        <text x="12" y="152" fill="#9090b0" fontSize="10">
          holding the discovery reserves nothing else — a bay can be charted by a later ship
        </text>
      </svg>
      <figcaption>
        The ladder is per seed and per station, so the same phrase typed into the other studio is a
        different map with its own unclaimed base.
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------- the register */

type Leader = {
  discoverer: string
  discoveries: number
  subDiscoveries: number
  assisted: number
  total: number
}

/**
 * The live register, read into the document.
 *
 * A table of who has charted what belongs next to the rules that decide it —
 * quoting the rules and then hiding the board would be the same as not having
 * one. Unreachable reads as "nothing charted yet", never as an error, and the
 * rest of the page stands on its own.
 */
function Register() {
  const [recent, setRecent] = useState<Claim[]>([])
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'down'>('loading')

  useEffect(() => {
    let live = true
    fetch(`/api/art/discoveries?session=${encodeURIComponent(getSessionId())}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return
        setRecent(Array.isArray(d?.recent) ? d.recent : [])
        setLeaders(Array.isArray(d?.leaders) ? d.leaders : [])
        setTotal(d?.total || 0)
        setState(d?.degraded ? 'down' : 'ready')
      })
      .catch(() => live && setState('down'))
    return () => {
      live = false
    }
  }, [])

  if (state === 'loading') return <p>Reading the register…</p>

  if (state === 'down') {
    return (
      <p className="caveat">
        The register could not be read just now. Nothing is lost by that — a claim lives in the
        database, not in this page, and the studios keep painting either way.
      </p>
    )
  }

  if (!total) {
    return (
      <p className="callout">
        Nothing charted yet. Every seed in all three studios is unclaimed, which means the base
        setting of whichever one you open next is a discovery nobody holds.
      </p>
    )
  }

  return (
    <>
      <p>
        <strong>{total.toLocaleString()}</strong> claims standing across all three studios.
      </p>
      {leaders.length > 0 && (
        <table className="limits">
          <thead>
            <tr>
              <th scope="col">Discoverer</th>
              <th scope="col">Discoveries</th>
              <th scope="col">Sub</th>
              <th scope="col">With a claw</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((l) => (
              <tr key={l.discoverer}>
                <th scope="row">{l.discoverer}</th>
                <td>{l.discoveries.toLocaleString()}</td>
                <td>{l.subDiscoveries.toLocaleString()}</td>
                <td>
                  {l.assisted.toLocaleString()} of {l.total.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {recent.length > 0 && (
        <>
          <p style={{ marginTop: 20 }}>The latest claims, newest first:</p>
          <ul className="compare-list">
            {recent.map((c) => (
              <li key={`${c.station}:${c.seedHash}:${c.symmetry}`}>
                <strong>{TIER_LABEL[c.tier]}</strong> of <code>{metricLabel(c.station, c.symmetry)}</code> on
                “{c.seed}” — <strong>{c.discoverer}</strong>
                {c.mine ? ' (you)' : ''}, {assistLabel(c.assisted)}.
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ the page */

function ArtMethodPage() {
  const folds = SYMMETRY_OPTIONS
  const highest = folds[folds.length - 1]

  return (
    <div className="doc">
      <div className="doc-inner">
        <header className="doc-head">
          <p className="kicker">Art Studios · the method</p>
          <h2>How each art station works</h2>
          <p className="standfirst">
            Three studios take a seed — a phrase, or at one station a stack of images — and hand
            back a piece nobody has seen before, and that is where the resemblance ends. One traces thousands of particles through a polar wave and
            folds every deposit around the centre. One rotates that wave into the plane, adds a
            swirl, and colours each filament by the direction it is travelling. One grows a formula
            per colour channel and asks it a question at every pixel. One shuffles a lattice of
            random gradients and interpolates between them. One throws two thousand embers from a
            single point and lets every one of them fly dead straight. One splices a pile of
            photographs down to a sixteen-colour recipe and paints what that mixture specifies. And
            one builds a finished composition of blended shapes and garbled type and then tears it
            apart with a corruption pass that reads the frame it is writing into. This
            is what happens between
            the phrase and the picture, station by station — and, because a generated piece has no author to
            hold a copyright, how being <em>first</em> to one is recorded instead.
          </p>
          <p className="doc-links">
            <Link to="/art">
              Art Studio <ArrowRight size={13} />
            </Link>
            {'  ·  '}
            <Link to="/artv2">
              Art Studio V2 <ArrowRight size={13} />
            </Link>
            {'  ·  '}
            <Link to="/artv3">
              Art Studio V3 <ArrowRight size={13} />
            </Link>
          </p>
        </header>

        <Section n="00" title="What every station promises">
          <p>
            A station is a way of turning a seed phrase into a field of light. Whatever the method,
            all of them hold to the same three things, and each one is a constraint on the
            mathematics rather than a nicety:
          </p>
          <ol className="steps">
            <li>
              <strong>The seed decides everything.</strong> The same seed, station and setting on
              the studio&rsquo;s second axis — a fold count in V1 and V2, a generation of decay in
              V3 — produce the same piece on any machine, forever. No clock, no random number generator
              seeded by the browser, no floating-point drift that matters. This is what makes a
              claim about a piece meaningful — <em>“I found this one”</em> is only a statement if the
              piece can be found again.
            </li>
            <li>
              <strong>Size is exposure, not resolution.</strong> Asking for a 1,440px print does not
              give you a different piece; it gives you the same piece with more light collected. In
              V1 the particle count and step count scale with the canvas so the density stays put; in
              V2 the field is a continuous function of position and is simply sampled more finely —
              except where a station carries lengths of its own: the ember bloom has no field at all,
              and the genome station measures its crystal blocks in pixels. Both hold those lengths
              in the units of the generator they came from and multiply by a single scale factor, to
              the same end. <strong>V3 is the exception, and it is a real one.</strong> Its
              corruption pass draws from the random stream once or twice <em>per pixel</em>, and
              which of the two depends on that pixel&rsquo;s own brightness — so the grid is not a
              sampling density there, it is part of the piece&rsquo;s identity. A 512px render and a
              1,440px render of one V3 seed would be two unrelated artworks rather than one artwork
              at two exposures. So that station paints on a fixed {DECAY_REF}px grid and magnifies by
              whole-pixel replication, and this promise is stated as broken there rather than
              stretched to cover it. §08 says what that costs and what it buys.
            </li>
            <li>
              <strong>Nothing leaves the browser to paint.</strong> There is no model call in the
              paint path. The whole generator is a few hundred lines of arithmetic running on the
              creator&rsquo;s own machine, which is also why a piece exists and is owned the instant
              it appears, before any database has heard about it.
            </li>
          </ol>
        </Section>

        <Section n="01" title="Symmetric Harmonic Flow · Art Studio" status="built">
          <p>
            The first station and the reason the studio exists. The seed phrase is hashed into a set
            of field constants — a handful of wave numbers, their phases, a span, a particle count
            between 1,600 and 2,900, and a step count between 140 and 230. Those constants are the
            piece. Everything after them is bookkeeping.
          </p>
          <TraceDiagram />
          <p>
            Each particle gets its own starting point from its own sub-seed, so particle 400 lands in
            the same place every time the piece is painted. It is then pushed through a set of
            rotational wave equations, one small step at a time, and <strong>every step deposits
            light</strong> — spread across the four pixels it falls between, so a path that passes
            between two pixels brightens both rather than picking one. Structure appears where many
            particles happen to cross the same ground, which is why the bright parts of one of these
            pieces are the parts the field kept returning to.
          </p>
          <p>
            Folding happens in the same breath. The angular term of the wave equations is multiplied
            by the fold count, and each deposit is written once per fold by rotating the unit vector
            rather than by rotating a finished image. At {highest}-fold that is {highest * 2} writes
            per step; the symmetry is exact and free of the blurring a post-hoc mirror would add.
            Paths that reach the rim or the centre are reflected instead of being lost, so the field
            stays inside its own circle.
          </p>
          <p className="callout">
            The canvas read on the studio page shows this arithmetic rather than describing it:
            particles × steps, and the total points traced. A {highest}-fold piece at print size is
            doing tens of millions of deposits, which is the honest reason it takes a moment.
          </p>
        </Section>

        <Section n="02" title="Vortex Harmonic Drift · Art Studio" status="built">
          <p>
            V1&rsquo;s second station, and a cousin of the first rather than a variation on it. It
            still traces particles and it still keeps the light where their paths cross — that is
            what makes it this studio&rsquo;s station and not V2&rsquo;s. Everything between the
            phrase and the deposit is a different piece of machinery.
          </p>
          <p>
            The phrase is hashed four ways instead of one. Station 01 derives a single number and
            gives every particle its own sub-stream from it; this station produces four independent
            32-bit words, and hands one each to the coefficients, the particles&rsquo; birthplaces,
            the turbulence and the respawns. No two of those four forces can walk into each
            other&rsquo;s numbers, which is why a one-letter edit moves all four at once instead of
            shifting one and leaving the rest.
          </p>
          <p>
            What the first stream draws is <strong>eight bare coefficients</strong>, A through H, and
            a view scale. They have no individual meanings and no names, which is the honest way to
            report them — they are the arguments of two equations, one giving a velocity outward and
            one a velocity around the centre. The view scale decides how much of that mathematics the
            frame holds, and therefore how many wave periods fit inside the picture.
          </p>
          <VortexDiagram />
          <p>
            Then the sharpest difference. Station 01 advances its radius and its angle directly and
            reflects a path back when it reaches the rim or the centre. This station takes the two
            polar velocities, <strong>rotates them into a flat dx and dy</strong>, adds a rigid
            body swirl and — on about three seeds in five — a turbulent kick, and moves the particle
            in the plane. A path that escapes the frame is not reflected; it is respawned somewhere
            new. The result is a field of drifting filaments rather than a closed lace, and the two
            stations do not resemble each other at any fold count.
          </p>
          <p>
            Colour is taken from the <strong>direction of travel</strong>. Station 01 colours a
            particle by where it sits and how far along its path it is; here the hue comes from the
            heading, so two filaments crossing the same pixel from different angles are different
            colours and the shear in the field shows up as colour rather than as brightness. That hue
            is read through one of six named windows — cyberpunk, bioluminescence, nebula, solar,
            pearl, emerald — drawn from the seed, so a piece has a palette rather than a full
            spectrum.
          </p>
          <p>
            One more thing it does that the first station does not: it strokes a <em>line</em> per
            step rather than depositing a point. At this step size a fast particle covers several
            pixels between one step and the next, so a single deposit would draw the field as dotted
            trails. Walking the segment at one deposit per pixel means brightness per pixel is the
            particle&rsquo;s own alpha, and a fast particle lays down more total light because it
            covered more ground. How many pixels a step actually lights depends on the eight
            coefficients, so rather than assume it, the studio <strong>measures</strong> it — forty
            eight particles are walked when the piece is planned, and the figure is reported in the
            canvas read.
          </p>
          <p className="callout">
            The canvas read for this station shares only its first three rows with station 01. It has
            to: there are no field constants to report, no fold count to multiply out, and a deposit
            count that had to be sampled rather than derived. Two stations that reported the same
            five rows would be telling you they were the same station.
          </p>
          <p className="caveat">
            <strong>What was ported, and what was deliberately not.</strong> The generator this
            station is built from arrived as a complete, self-contained HTML page — a live animation
            with a cursor, sliders and a trail-decay control. The eight coefficient ranges, the view
            scale, both wave equations, the polar-to-Cartesian rotation, the swirl term, both respawn
            rules, the birth distribution and the hash and PRNG are that file&rsquo;s, term for term;
            its two random-number functions are verified here against the uploaded file&rsquo;s own
            bytes, and a phrase yields the same eight coefficients in both. Four things could not
            come across. Its <code>Math.random()</code> calls in the turbulence and the respawns are
            replaced by seeded streams, because a studio that promises a phrase paints one piece
            cannot have one. Its fixed step size becomes a fixed <em>span</em>, so the 512px avatar
            and the 1,440px print are the same picture rather than two. Its cursor-gravity attractor
            is gone, because a piece that depends on how somebody dragged a mouse is not a function
            of the seed and could never be claimed by anyone. And its sliders are seeded instead of
            exposed — a dial the claim ladder cannot key on would only mint variants nobody else can
            find their way back to. The one place the port improves on the original rather than
            constraining it: that file adds the heading to the palette&rsquo;s base hue, and since
            the heading alone spans the whole colour wheel, all six of its palettes paint the same
            full-spectrum pastel. Here the excursion is mapped into the palette&rsquo;s window, so
            the six names mean something.
          </p>
        </Section>

        <Section n="03" title="The two exposures — and why they are one piece" status="built">
          <p>
            V1 offers two ways of reading the same accumulated field, which is a decision about
            exposure, not about the artwork:
          </p>
          <ul className="compare-list">
            <li>
              <strong>Original · additive glow.</strong> Light sums on light without limit, so the
              densest structure runs past white and bleaches. This is the drawing method the station
              started with and it is kept because some pieces are better for it.
            </li>
            <li>
              <strong>Fixed · true colour.</strong> The same field through a soft knee at 0.55 rising
              to a ceiling of 0.96 — smooth at the knee, so there is no visible seam where the
              rolloff begins. Dense areas blend toward their own hue instead of toward white, and the
              piece keeps its colour where it is brightest.
            </li>
          </ul>
          <p>
            Because both modes resolve the identical traced field, the render mode is deliberately{' '}
            <strong>not</strong> part of a discovery claim. Two exposures of one photograph are one
            photograph, and minting a second claim off a display setting would cheapen every claim on
            the board.
          </p>
        </Section>

        <Section n="04" title="Recursive Expression Field · Art Studio V2" status="built">
          <p>
            A different generator, not a variation on the first one. Nothing is traced and there are
            no particles. The seed is split into two words: the first grows the shape, the second
            sets the colour.
          </p>
          <FormulaDiagram />
          <p>
            The style word seeds a generator that grows three expression trees, one per colour
            channel, from six operators — <code>sin</code>, <code>cos</code>, <code>mul</code>,{' '}
            <code>avg</code>, <code>abs</code>, <code>mod</code> — over the pixel coordinates. Growth
            runs to a depth of 12 with a one-in-ten chance of stopping at a leaf at each node, which
            is what gives these fields their mix of broad sweeps and fine interference. Each tree is
            then flattened into a postfix program held in a typed array and evaluated on a small
            float stack, because recursing per pixel would be far too slow to paint interactively.
          </p>
          <p>
            Per pixel, each channel&rsquo;s program is solved and the result is pushed through{' '}
            <code>(sin(value × π + phase) + 1) × 127.5</code>. The sine is doing real work: it wraps
            an unbounded value into a bounded byte, and the wrapping itself produces the banding these
            pieces are recognisable for. The three phases come from the colour word, which touches
            nothing else — swap it and you recolour the same shape; swap the style word and you get a
            new shape in the same palette.
          </p>
          <p>
            Because the field is a function of position and nothing else, resolution independence here
            is exact rather than approximate: the 512px avatar and the 1,440px print are the same
            function sampled on two grids. The painting is done in bands of roughly 2.5 million node
            evaluations so the tab stays responsive and the progress bar tells the truth.
          </p>
          <p className="caveat">
            <strong>One render mode, on purpose.</strong> V2 has a single <code>direct</code> mode
            because there is no accumulation to expose differently — nothing sums, so there is nothing
            to roll off. Adding a second mode would mean inventing a transfer curve that the
            mathematics does not ask for.
          </p>
        </Section>

        <Section n="05" title="Psychedelic Noise Lattice · Art Studio V2" status="built">
          <p>
            The second live station in V2, and not a preset over the first one — it shares the
            studio&rsquo;s fold control, its canvas, its claim ladder and nothing else. Where the
            expression station asks &ldquo;what does this formula evaluate to here?&rdquo;, this one
            asks &ldquo;what do the nearest corners of a random lattice pull this point
            towards?&rdquo;
          </p>
          <LatticeDiagram />
          <p>
            The seed phrase is hashed to a single number, and that number seeds a small linear
            congruential generator — <code>s = (s × 9301 + 49297) mod 233280</code> — which shuffles a
            256-entry table into a random permutation. The table is then concatenated onto itself, to
            512 entries. That doubling looks like a redundancy and is not: evaluating a point needs a
            lookup at <code>table[table[x] + y + 1]</code>, and both terms reach 255, so the index
            reaches 511. Doubling makes every such index legal and wraps the lattice seamlessly.
          </p>
          <p>
            Each corner of an integer lattice hangs a gradient vector, chosen by the low bits of its
            table entry. To solve a point, the four corners of its cell are each dotted with the
            offset to it, and the four results are interpolated using{' '}
            <code>6t⁵ − 15t⁴ + 10t³</code> rather than the cheaper smoothstep — that curve is flat to
            second order at both ends, and without it a faint grid of seams shows through the finished
            field where the cells meet.
          </p>
          <p>
            Detail is added by <strong>octaves</strong>, not by depth. Between two and six copies of
            the same field are summed at doubling frequency and halving amplitude, then divided by the
            total amplitude so the range does not drift with the octave count. This is a genuinely
            different knob from the expression station&rsquo;s tree depth: it controls how{' '}
            <em>rough</em> the field is, not how complicated the rule is.
          </p>
          <p className="callout">
            <strong>One field, read three times.</strong> The expression station solves three
            independent programs, one per channel, so its channels are unrelated. Here a single scalar field is evaluated
            once per pixel and then read at three different phases and band rates. That locks the
            channels together, which is why these pieces contour into rainbow rings instead of going
            muddy — the banding is the &ldquo;psychedelic&rdquo; in the name. It is also three times
            cheaper, and the canvas read counts taps accordingly rather than pretending otherwise.
          </p>
          <p>
            Two differences worth stating plainly, because they change how you use the page.{' '}
            <strong>The seed is not split.</strong> The other two V2 stations both cut the phrase
            into a colour word and a second word, and holding one still while you change the other is
            the whole craft of them.
            Here the entire phrase feeds one hash and one shuffle, so colour and structure are not
            separable — move a letter and the whole table is dealt again. And{' '}
            <strong>the randomness is correlated</strong>: a formula may swing as violently between
            neighbouring pixels as its operators allow, while gradient noise cannot, which is why this
            station marbles and flows where the expression station interferes and fringes.
          </p>
          <p className="caveat">
            <strong>Where this came from, and what was reconstructed.</strong> This station was ported
            from a standalone generator, and the file it came in arrived truncated: it ends
            mid-declaration, immediately after <code>noise(x, y) {'{'}</code>. The shuffle above — the
            constants, the descending Fisher–Yates, the doubling — is a verbatim port of what did
            arrive, and is checked against a transcription of it. Everything from the fade curve
            onward is the standard construction that a table doubled to 512 demands, written here
            rather than copied, along with the octave summing and the colour mapping. It is marked as
            such in the kernel, at the line where the port stops and the reconstruction starts.
          </p>
        </Section>

        <Section n="06" title="Ballistic Ember Bloom · Art Studio V2" status="built">
          <p>
            The third live station in V2, and the one that broke the studio&rsquo;s own description of
            itself. Until it arrived, V2 was &ldquo;solves a field at every pixel and traces
            nothing&rdquo;. This station solves nothing at all. It throws two thousand embers from a
            single point and then leaves them completely alone — no field, no forces, no curvature,
            not even a drag term. Every one of them flies dead straight until it fades out, and the
            piece is what those two thousand straight lines look like laid over each other.
          </p>
          <BurstDiagram />
          <p>
            The numbers are the ones the generator it came from used, and they are worth stating
            because they are all of the physics there is:{' '}
            <strong>2,000 embers</strong>, born within <strong>±50 px</strong> of the centre with a
            velocity of up to <strong>±1.5 px per step</strong>, each living{' '}
            <strong>100 steps</strong> and drawn as a disc of <strong>radius 2</strong>. Position is
            <code> x += vx</code> and nothing else. An ember&rsquo;s alpha is{' '}
            <code>(life − step) / life</code>, which is why the bloom is brightest at the core: every
            ember was near the middle when it was at its most opaque, and by the time it reaches the
            rim it is nearly transparent. That gradient is not a vignette or a falloff curve — it is
            just the fade, seen from outside.
          </p>
          <p className="callout">
            <strong>The tip that the original never implemented.</strong> The generator this came from
            shipped with a line of advice under its canvas: <em>&ldquo;First word controls colors,
            second word controls flow patterns.&rdquo;</em> Its code does no such thing — it hashes the
            whole phrase once, into one stream, so the first word and the second word are
            interchangeable and neither controls anything in particular. Here the promise is made
            true: the colour word seeds one random stream and the flow word seeds another, and the two
            never touch. Change the flow word and all 2,000 ember colours come back byte-identical;
            change the colour word and every birth point and velocity is unmoved. That is the one
            deliberate divergence from the original&rsquo;s arithmetic, and it is a divergence because
            the two could not both be had — honouring the tip requires two streams, and two streams
            cannot produce the same particle sequence as one.
          </p>
          <p>
            A single base hue would have been a dead control, because the original draws hue as{' '}
            <code>random × 360</code> — uniform over the whole wheel, so every piece is the same
            rainbow and moving the dial rotates a wheel that already contains every colour. So the
            colour word buys a <strong>hue window</strong> instead — a base and a span — and a{' '}
            <strong>stop count</strong> that quantises the window into 2 to 8 discrete hues, or leaves
            it continuous about a third of the time. A two-stop bloom and an eight-stop bloom off an
            identical throw are unmistakably different pieces; that is the difference the stop count
            buys, and it is why the palette is a real dial rather than a nicety.
          </p>
          <p>
            <strong>Every ember&rsquo;s colour is a fully saturated spectral hue</strong> —{' '}
            <code>hsl(h, 100%, 50%)</code>, exactly as the original strokes it, which always puts one
            channel at 255 and one at 0. Left additive, two thousand of those would bleach the middle
            of every piece to white within a few dozen steps. They do not, because the compositing is
            source-over rather than additive: a deposit is a weighted average of what is already there
            and one bounded colour, so the result is bounded by construction. This is the reason this
            station needs no tone map, no gain and no exposure calibration, and the reason V2 still
            has exactly one render mode with four unlike stations in it.
          </p>
          <p>
            Size behaves the same as everywhere else in the studios, by different means. There is no
            field here to sample more finely, so instead every length — birth offset, velocity, disc
            radius, reach — is held in the units of the original 800×600 canvas and multiplied by a
            single scale factor on the way to the frame. The 1,440px print is therefore the 720px
            piece at exactly twice the size, ember for ember, rather than a denser version of it.
          </p>
          <p>
            The fold works differently here too, and it has to. At the other two V2 stations the fold
            is applied to the sample point before the field is asked about it. This station has no
            sample point — it has deposits, and folding a <em>deposit</em> concentrates light into one
            wedge instead of mirroring it out. That was tried; eleven of the twelve sectors came back
            empty. So the fold is applied to the <em>reading</em>: the burst is thrown unfolded into
            its own surface, and each pixel of the visible frame is told which point of that surface
            to show. The throw is identical either way, which keeps V2&rsquo;s rule intact — the
            unfolded piece is the base discovery, and every fold is a way of looking at it.
          </p>
          <p className="caveat">
            <strong>What was deliberately not ported.</strong> The original repaints its canvas with{' '}
            <code>rgba(0, 0, 0, 0.1)</code> once per frame, so the embers leave decaying trails.
            Carried over faithfully that attenuates the first deposit by 0.9¹⁰⁰ — about one
            thirty-eight-thousandth — so its finished canvas is very nearly black. The piece only
            exists while the animation is playing, and there would be nothing to claim, download or
            rediscover. The decay is dropped and the whole flight kept; the reveal on screen still
            plays the burst forward step by step, so what you watch is the original&rsquo;s motion
            without its erasure. Everything else came over as written and is checked against the
            file: the RNG, the string hash, all five constants, the four random draws that make an
            ember and the order they are made in, the fade, the disc, and the step-major loop. Two
            small departures beyond the split streams, for completeness — the dials above add draws
            of their own around the original&rsquo;s four, and the original seeds with{' '}
            <code>Math.abs</code> of its hash where both V2 stations that split a seed do not, so
            that a given word means the same thing at either of them.
          </p>
        </Section>

        <Section n="07" title="Chimeric Image Genome · Art Studio V2" status="built">
          <p>
            The fourth live station in V2, and the first anywhere in either studio that does not
            start from a phrase. It starts from <strong>pictures</strong> — up to fifteen of them,
            spliced together into a recipe, and the recipe is what gets painted. Nothing about the
            images survives except what the recipe carries, which is the point: what you are
            discovering is not a collage, it is the piece that this particular <em>mixture</em>
            specifies.
          </p>
          <DnaDiagram />
          <p>
            The splice is the generator&rsquo;s, unchanged, and it is stranger than it looks. Every
            image is drawn onto the <em>same</em> 20×20 canvas at <code>1 / n</code> opacity, and
            after each draw the <em>whole accumulated canvas</em> is read back and summed with each
            byte weighted by its position and by which image is being added. So the sum is not a
            function of the images alone — it is a function of the order they were picked in, and
            every earlier image is re-counted into it once per later image. Two pictures in the other
            order are a different genome and a different piece. That is faithfully ported, because
            that is what the original does and it is a perfectly good way to be sensitive to a
            mixture.
          </p>
          <p>
            From that sum a <strong>Mulberry32</strong> stream grows three expression trees, one per
            colour channel, to a depth of 8 out of four operators —{' '}
            <code>sin(πa)</code>, <code>cos(πa)</code>, <code>a·b</code> and{' '}
            <code>(a+b)/2</code> — with a one-in-five chance at every node of stopping at{' '}
            <code>x</code> or <code>y</code> instead. That is the same machinery as station 04&rsquo;s
            expression field and it is literally the same solver, but a genuinely different grammar:
            fewer operators, shallower trees, and a leaf chance twice as high. It also explains why
            this station needs no wrap on the way out. All four of those operators are contractions on{' '}
            <code>[−1, 1]</code> — none can grow a value — so a solved tree is already inside
            range and <code>(v + 1) × 127.5</code> lands in 0–255 on its own. The expression
            station cannot do that, because <code>mod</code> is in its operator set and{' '}
            <code>mod</code> breaks the guarantee; it needs a sine to come home. Same solver, opposite
            conclusion about what has to happen afterwards.
          </p>
          <p className="callout">
            <strong>The Combined DNA Preview is the recipe, so it had to actually be one.</strong> The
            generator this came from shows you a preview of the spliced thumbnail — and then throws
            it away. Every one of those images reaches the picture through a single integer, which
            means two completely different sets of photos that happen to sum alike paint the identical
            piece, and the preview you were shown cannot be rebuilt from anything the piece keeps. It
            is a picture <em>of</em> the recipe, not the recipe. Here the thumbnail is reduced to a{' '}
            <strong>4×4 grid of average colours at 4 bits per channel</strong> and those sixteen
            colours <em>ride inside the strand</em>. The preview on the station is drawn by calling
            the kernel&rsquo;s own sampler on exactly those stored values, so it is not an
            illustration of the recipe — it is a render of it, at the precision it is stored at.
            Paste a <code>dna1-…</code> strand into a different browser with no files to hand and
            the same sixteen swatches come back, because they were never anywhere else.
          </p>
          <p>
            Those sixteen colours also have to <em>do</em> something, or carrying them is a decoration
            and the claim above is a lie. The <strong>Graft</strong> dial is what spends them: at every
            pixel the grid is sampled bilinearly at the folded position and the solved channel is
            modulated by it — <code>t × (1 − g) + (t / 255) × dna × g</code>. At 0 you get
            the generator&rsquo;s output byte for byte; at 100 the field survives only as luminance and
            the images&rsquo; colour is the whole palette. The default sits at 55 because that is where
            both are legible at once.
          </p>
          <p>
            The seed field on this station holds a <code>dna1-</code> strand rather than words, and the
            reason is the claim ladder rather than convenience. A discovery is keyed by station, seed
            and fold count — nothing else — so any setting that is not in the seed is not part of
            the piece and cannot be claimed. Everything therefore goes in: the 32-bit sum, how many
            images went into it, all six dials, and the sixteen anchor colours. <strong>273 bits, 55
            characters</strong>, written in a lowercase base-32 alphabet because the studio&rsquo;s seed
            normaliser folds case and strips punctuation, which would quietly destroy base-64. No new
            column, no migration, and a strand is a complete piece: it is the only thing you need to
            send someone for them to see exactly what you saw. A plain phrase still works too — it
            grows a synthetic genome with one coherent hue window — which is how ArtisticClaw can
            still suggest something here.
          </p>
          <p className="caveat">
            <strong>What was added, what was dropped, and what a strand does not contain.</strong> The
            original ships a <strong>Sharpen</strong> slider that is read, displayed, and never used by
            its renderer — a dead control, like the ember station&rsquo;s unimplemented tip. It is
            implemented here as a 3×3 unsharp mask, and it is honest about band boundaries: the
            convolution restarts one row early on each band so a piece rendered in strips is
            bit-identical to one rendered in a single pass. Graft, the fold, and resolution
            independence are additions the generator has no equivalent for — it renders at one fixed
            size, and the port holds every length in the units of that 500px reference and scales once,
            so the crystal ladder is the same ladder at 150px and 500px. Graft&rsquo;s first version
            doubled the modulation and was thrown out after looking at a rendered grid of it: doubling
            clips every highlight against a bright anchor and turned two dozen pieces into the same
            high-key pastel wash. Plain modulation cannot clip. Neon can, and does — that is the
            original&rsquo;s behaviour, its <code>if (mult &gt; 1)</code> guard makes 1.0 a true bypass
            with a deliberate discontinuity just above it, and it is ported as written. Finally, the
            thing a strand is <em>not</em>: it is not your photographs. Sixteen average colours and a
            checksum of the pixels is all that leaves the browser, and nothing in it can be turned
            back into an image — which is the right trade for a recipe you are expected to paste in
            public.
          </p>
        </Section>

        <Section n="08" title="Neural Decay Corruption Engine · Art Studio V3" status="built">
          <p>
            The first station of the third studio, and the first one in the platform that{' '}
            <em>destroys</em> its own work on purpose. Every station before it writes a frame out of
            numbers and stops. This one builds a finished composition — and then runs a corruption
            pass over it that samples the buffer it is writing into.
          </p>
          <DecayDiagram />
          <p>
            One phrase, one stream, and no second dial holding any part of it still. The phrase is
            hashed with FNV-1a into a 32-bit number, that number seeds a single mulberry32 generator,
            and everything the piece is made of is drawn from it in order — which is why moving one
            letter re-deals the whole piece rather than recolouring it.
          </p>
          <ol className="steps">
            <li>
              <strong>Six colours, before anything is drawn.</strong> Black, white, three hues
              120&deg; apart at 90% saturation and half lightness, and one dark tint at 50%
              saturation and 20% lightness on a second hue drawn separately from the first. This is
              the only part of the piece decided before the composition, which is why the studio can
              show you the palette while the canvas is still blank.
            </li>
            <li>
              <strong>A ground and 20 to 50 elements.</strong> The ground is a rect of the first
              palette colour. Every element then draws a blend mode from five —{' '}
              <code>source-over</code>, <code>screen</code>, <code>difference</code>,{' '}
              <code>exclusion</code>, <code>overlay</code> — a colour from the remaining five, and a
              type from four: an axis-aligned rect, a disc, a polygon of three to six extra points,
              or a run of five to twenty random printable ASCII characters at 10 to 100 pixels. Its
              position comes from &minus;20% to +120% of the frame in each direction, so most
              elements are partly off the edge, and its size from 20px up to 80% of the frame.
            </li>
            <li>
              <strong>The tear.</strong> Each row of the pass gets a horizontal offset from a running
              value: a 5% chance per row of jumping to anywhere within a quarter of the width, else a
              10% chance of a &plusmn;10px nudge, else a 2% chance of snapping back to zero — plus a
              sine of the row index whose frequency <em>and</em> amplitude are drawn fresh for every
              row, so it staggers rather than waves. The row wraps around the frame.
            </li>
            <li>
              <strong>The channel split.</strong> Red and blue are read from &plusmn;20px either side
              of the torn position while green stays put, and those two are clamped at the frame edge
              rather than wrapped — so the split smears into a bar against the sides where the tear
              wraps cleanly through them. Two different behaviours in the same expression, and both
              are visible in the finished piece.
            </li>
            <li>
              <strong>The melt, which is the part that reads its own output.</strong> The brightness
              of the split pixel is compared against a threshold drawn once per pass between 100 and
              200. Above it, a 90% chance that this column&rsquo;s melt counter grows; below it, only
              a 10% chance the counter resets. While a column&rsquo;s counter is up, the pixel is
              replaced by the pixel <em>above it in the destination buffer</em> — the row this pass
              finished writing a moment ago — with green docked by one. So a bright region drags
              downward in a streak that cools as it falls, and the streak is made of pixels that were
              themselves already melted.
            </li>
            <li>
              <strong>Scanlines, then noise.</strong> Every third row is multiplied by 0.7. Then
              between 1% and 5% of all pixels — the density drawn once per pass — have each of their
              three channels XORed with an independent random byte. XOR, not addition: a byte XOR a
              byte is a byte, so nothing overflows and nothing needs bringing back into range, which
              is why this studio has one render mode and no exposure control.
            </li>
          </ol>
          <p>
            A <strong>generation</strong> is that whole pass run once. Generation 2 runs it again over
            generation 1&rsquo;s output, drawing a fresh threshold, fresh tear offsets, a fresh
            channel split and a fresh noise density from the continuing stream. That is why the
            numbers in the studio&rsquo;s canvas read appear one row at a time as it paints: the melt
            threshold and the count of torn rows are <em>measured</em> from the pass that just ran,
            not predicted from the seed.
          </p>
          <p className="callout">
            <strong>Three things here are this platform&rsquo;s and not the original
            generator&rsquo;s</strong>, and each one changes what the station can promise.{' '}
            <strong>One: the rasterizer is new.</strong> The generator this station was loaded from
            draws its composition with canvas <code>globalCompositeOperation</code> and{' '}
            <code>fillText</code>. But phase 2 <em>reads</em> phase 1&rsquo;s pixels, so a
            one-unit difference at a glyph edge — a different font, different hinting, a different
            browser&rsquo;s idea of <code>overlay</code> — does not stay a small difference; it grows
            into a different corruption. Canvas compositing and system-font text are not reproducible
            across machines, and promise 1 is worth more than the original&rsquo;s exact glyph
            shapes, so the shapes and a 3&times;5 bitmap font are rasterised here in plain
            arithmetic. <strong>Two: the grid is fixed at {DECAY_REF}px and magnified by
            replication</strong>, for the reason in §00 — and nearest-neighbour rather than smooth,
            because the artwork is one-pixel tear seams and single XORed pixels, and averaging them
            against their neighbours would blur away the exact features being magnified while
            inventing colours the pass never wrote. <strong>Three: nothing here is folded</strong>,
            and the axis that carries fold counts in the other two studios carries generations of
            decay instead. The original was also 900&times;600 where this frame is square, which
            changes the numbers handed to the composition planner but not the planner: every
            coordinate in it is a fraction of the width or the height.
          </p>
          <p className="caveat">
            <strong>What is verified, and what cannot be.</strong> The composition <em>plan</em> is
            checked digit-for-digit against the original: the original&rsquo;s own code, run under a
            stub that records its draw calls instead of painting them, produces the same shapes in
            the same order with the same blend modes, colours, coordinates, sizes and glyph strings —
            and its random stream is still aligned with this port&rsquo;s afterwards, which is the
            check that catches a missed draw. The corruption pass, which is the stream-sensitive
            half, runs verbatim and is bit-exact at 64&times;64, 128&times;96 and{' '}
            {DECAY_REF}&times;{DECAY_REF}, and stays bit-exact across four chained generations. What
            is <em>not</em> bit-comparable is the rasterizer: nothing outside a browser canvas can
            reproduce the pixels canvas <code>fillText</code> produces, so the pixels of phase 1 are
            new work rather than verified work. That boundary is exactly where the honest claim
            stops, and it is written into the kernel&rsquo;s own header too.
          </p>
        </Section>

        <Section n="09" title="Symmetry — two studios fold, and the third has nothing to fold" status="built">
          <p>
            V1 and V2 fold from {folds[0]} to {highest}. Between those two the difference is what
            &ldquo;off&rdquo; would mean. V3 does not fold at all, and the last paragraph here is
            about why that is a fact about the method rather than a missing feature.
          </p>
          <p>
            In V1 — at both of its stations — the fold count is <em>inside</em> the wave equations:
            it multiplies the angular term, so it shapes the flow before a single particle moves.
            Setting it to zero does not produce an unfolded version of the piece; it produces a
            different piece, or no piece at all. So V1&rsquo;s floor is {folds[0]}-fold, and{' '}
            {folds[0]}-fold is what its base metric is. Station 01 <em>also</em> writes each deposit
            once per fold around the centre; station 02 does not, and leaves the symmetry entirely to
            the equation. Neither can be switched off, which is the part that matters here.
          </p>
          <p>
            In V2 the fold is never inside the generator. At three of its four stations it is a
            transformation of the <em>coordinate</em>, applied on the way in: the point is folded into
            one wedge and then the field is asked about the folded point. The field itself is
            untouched by it. That is the whole difference. The fold changes <em>which part</em> of the
            field you are looking at, not <em>what the field is</em>, so switching it off is
            meaningful and reveals something the folded view hides — the raw field, unrepeated, as the
            seed actually specifies it. That is why V2&rsquo;s base metric is{' '}
            <code>Off · raw field</code>: the unfolded field is the thing the seed most truly is, and
            every fold on top of it is a way of looking at it.
          </p>
          <p>
            The genome station folds the coordinate too, but it folds it <em>first</em> — ahead of the
            crystal blocks and ahead of the twist, rather than immediately before the field is
            solved. That ordering is a choice and it is visible: folding last would mirror a
            rectangular grid of blocks into a wedge and leave the seams cutting across the symmetry,
            where folding first carries the blocks and the swirl around with the wedge, so a 6-fold
            piece reads as something built out of six identical panels rather than something
            reflected six times. The field itself is still untouched by the fold, so the guarantee is
            the same one.
          </p>
          <p>
            The ember station reaches the same guarantee from the other end, because it has no
            coordinate to fold — it deposits light rather than sampling a field. So it folds the{' '}
            <em>output</em>: the burst is thrown unfolded, and each pixel of the visible frame is
            folded to work out which point of that unfolded burst it should show. Same promise, and it
            has to be the same promise for the claim ladder to mean anything — the throw is identical
            at every setting, so the unfolded piece is genuinely the base discovery rather than a
            variant of a folded one. Folding the deposits instead would have failed that test twice
            over: it changes the piece rather than the view of it, and it dumps the entire burst into
            one wedge.
          </p>
          <p>
            <strong>V3 has no fold, and there is nowhere to put one.</strong> Its second phase is not
            a field being asked about a coordinate, so there is no coordinate to fold on the way in.
            Folding the output instead — which is how the ember station reaches the same guarantee
            without a field — would mirror the tear seams and the channel split into a wedge, and a
            tear that appears six times in rotational symmetry is not a signal that decayed, it is
            wallpaper. So the studio&rsquo;s second axis carries a different quantity: generations of
            the corruption pass. Both make a race worth running, because there is exactly one first
            person to each rung either way, but they are not the same kind of thing — a fold is a{' '}
            <strong>view</strong> of one artwork and every rung is a way of looking at it, while a
            generation is a <strong>lineage</strong> and rung 4 is descended from rung 3 rather than
            being another angle on it. The registry records which of the two a studio has, and the
            discovery boards word themselves off that field instead of calling everything a fold.
          </p>
        </Section>

        <Section n="10" title="The decay ladder, and why it stops at four" status="built">
          <p>
            V1 and V2 offer {folds.length} rungs each. V3 offers {DECAY_GENERATIONS.length}, and the
            number came out of a measurement rather than a preference — the first version of this
            ladder had nine rungs and the measurement is what removed four of them.
          </p>
          <p>
            The obvious guess about generation loss is that each pass is darker than the last until
            the frame bottoms out. That guess is wrong, and it is worth being specific about how.
            Averaged over five seeds at {DECAY_REF}px:
          </p>
          <table className="limits">
            <thead>
              <tr>
                <th scope="col">Generation</th>
                <th scope="col">Mean level per channel</th>
                <th scope="col">Structure — contrast between 20px blocks</th>
              </tr>
            </thead>
            <tbody>
              {[
                { gen: '0 · clean', level: '119.3', block: '80.2' },
                { gen: '1', level: '31.9', block: '23.4' },
                { gen: '2', level: '28.9', block: '13.7' },
                { gen: '3', level: '30.6', block: '11.1' },
                { gen: '4', level: '27.9', block: '7.7' },
                { gen: '6', level: '26.6', block: '5.0' },
                { gen: '8', level: '27.3', block: '4.2' },
              ].map((row) => (
                <tr key={row.gen}>
                  <th scope="row">
                    <code>{row.gen}</code>
                  </th>
                  <td>{row.level}</td>
                  <td>{row.block}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            The <strong>brightness</strong> column is not a ladder. One pass does all the darkening —
            119 down to 32, because the melt compounds a 0.7 scanline factor every third row and
            drags bright structure down into darkness — and every pass after it leaves the level
            where it is. Those later passes are not idle, either: each one still moves 36 to 40 units
            per channel. They are reshuffling at roughly constant energy. And the seed keeps deciding
            the picture the whole way down — two different seeds at the same generation stay 42 to 50
            units apart, which is as far apart as two adjacent generations of one seed. So no
            generation is a dimmer version of the one above it.
          </p>
          <p>
            What <em>does</em> decay monotonically is the <strong>structure</strong> column: whether
            the frame still has areas rather than grain. It falls at every rung, and it is nearly
            flat past four. Rendered side by side, generations 6 and 8 are two fields of fine noise
            that nobody could tell apart, let alone prefer.
          </p>
          <p className="callout">
            A board with nine rungs where five of them are indistinguishable would be nine races and
            four prizes. So the ladder is {DECAY_GENERATIONS.length} rungs long: clean, and the four
            passes that each still make a visibly different picture. Everything past it is still
            reachable by rendering — it is just not something worth planting a flag in.
          </p>
        </Section>

        <Section n="11" title="Two claws, and what entangling them does" status="built">
          <p>
            There are two prompt directors now, and they are not two tones of voice over one
            generator of phrases — they pull in opposite directions on purpose:
          </p>
          <ul className="compare-list">
            {CLAWS.map((claw) => (
              <li key={claw.id}>
                <strong>{claw.name}</strong> <span style={{ fontSize: 12 }}>({claw.tagline})</span> —{' '}
                {claw.blurb}
              </li>
            ))}
          </ul>
          <p>
            ArtisticClaw is <strong>convergent</strong>: it aims at the brief you typed, in a
            vocabulary of materials and light, and each phrase comes with what the piece will feel
            like. WondersClaw is <strong>divergent</strong>: it leaves from the brief rather than
            landing on it, in a vocabulary of incidents and collisions, aims at the far third of the
            studio&rsquo;s axis, and each phrase comes with what it is <em>risking</em> instead —
            because a long shot that does not say it is a long shot is just a bad suggestion. Neither
            one paints, or can paint, or sees the canvas. The whole output of both is words for the
            seed box and a number for the axis control, and the generator does not know or care where
            its input came from.
          </p>
          <p>
            The dial between them runs 0 — pure ArtisticClaw — to {BLEND_PURE_WONDERS} — pure
            WondersClaw. Entangling them is three separate mechanisms rather than a crossfade, and
            all three are exact at the endpoints:
          </p>
          <ol className="steps">
            <li>
              <strong>The quota.</strong> {SPREAD_SIZE} suggestions come back, and{' '}
              <code>round(blend × {SPREAD_SIZE} / {BLEND_PURE_WONDERS})</code> of them are
              WondersClaw&rsquo;s — {wondersQuota(50)} at the halfway mark. Monotone in the dial, so
              turning it up never gives you fewer long shots.
            </li>
            <li>
              <strong>The deal, which re-deals.</strong> Which slots those are is a hash of the
              brief, the blend and the slot index. The blend is <em>in</em> the key, so every position
              on the dial is its own deal rather than a superset of the one below it. The stable
              alternative was considered and rejected in as many words: fix the assignment and only
              grow the count, and the dial becomes an accumulator where position 60 contains
              everything position 40 contained plus one. Then the dial is a quantity of long shots
              rather than a place to stand.
            </li>
            <li>
              <strong>The bleed.</strong> The dial also reaches inside each claw&rsquo;s own word
              choice. Per slot, one verb position and one tail position can cross into the other
              claw&rsquo;s vocabulary with a probability equal to the pull — so an entangled
              ArtisticClaw phrase can carry an incident word without becoming a WondersClaw phrase,
              and vice versa. The nouns never swap, because that is where each claw&rsquo;s subject
              matter lives and swapping them would make one claw impersonate the other rather than
              lean toward it.
            </li>
          </ol>
          <p>
            The axis suggestion is interpolated too, on <em>indices</em> rather than values, because
            V1&rsquo;s fold ladder is unevenly spaced — 10, 12, 16 — and averaging the numbers would
            bunch every entangled suggestion at the crowded end. And because the two claws aim at
            different rungs, the entangled suggestion sits between the reading and the long shot at
            the ratio the dial says.
          </p>
          <p className="callout">
            <strong>The endpoints are pure by construction, and that is tested rather than asserted.</strong>{' '}
            At 0 no returned phrase contains a word from WondersClaw&rsquo;s vocabulary and all{' '}
            {SPREAD_SIZE} slots are ArtisticClaw&rsquo;s; at {BLEND_PURE_WONDERS} the mirror holds.
            The blend enters both composers through their hash key, so no two adjacent positions on
            the dial return the same {SPREAD_SIZE} phrases in a different order — which is the claim
            the panel makes to the creator, so it had to be the claim the test checks.
          </p>
          <p>
            Whether a claw helped is nonetheless <strong>recorded and displayed</strong> on every
            claim, because it is a true and interesting fact about how a piece was found. It is not a
            penalty. A phrase a director suggested is still a phrase nobody had committed before, and
            somebody reading the board should be able to see which discoveries were charted by hand
            and which were charted with help. Hiding that would make the register less true, not more
            fair. The board says <em>&ldquo;with a claw&rdquo;</em> rather than naming one, and that
            is deliberate: with two directors and a dial between them, most of the interesting
            settings are a blend, and naming one claw would have been wrong about as often as it was
            right.
          </p>
        </Section>

        <Section n="12" title="Generative art cannot hold a copyright — but it can be discovered">
          <p>
            Copyright protects a work of authorship. There is no author here in the sense the word
            means. The equations were written before any seed existed, the seed is a coordinate rather
            than a brushstroke, and the piece those two things point at was already implied by the
            generator — it was going to be exactly that whether or not anybody ever typed the phrase.
            Nobody drew it, so nobody owns it.
          </p>
          <p className="callout">
            A coastline is not authored by the first ship to chart it. It was there the whole time.
            What that ship can honestly claim is <strong>having been first to find it</strong> — and
            that is a fact about time, which can be recorded exactly.
          </p>
          <p>
            So the studios hand out <strong>discovery</strong>, not ownership. A claim says: on this
            station, at this seed, at this setting, this person got here first — with or without a
            claw&rsquo;s help. It gives them nothing over anybody else. Every piece stays
            free to paint, download, use as a character avatar and print, by anyone, claimed or not.
            The only thing a claim can be taken from you by is somebody having been earlier.
          </p>
        </Section>

        <Section n="13" title="One discovery, many sub-discoveries" status="built">
          <p>
            Each seed on each station carries a ladder of claimable settings: its base setting is the{' '}
            <strong>discovery</strong>, and every other setting on that studio&rsquo;s second axis is
            a <strong>sub-discovery</strong>. The base is whichever rung is the thing the seed most
            truly is — {folds[0]}-fold in V1, which cannot be unfolded; <code>Off · raw field</code>{' '}
            in V2, which can; and the clean signal in V3, the composition with the corruption pass
            never run.
          </p>
          <LadderDiagram />
          <table className="limits">
            <thead>
              <tr>
                <th scope="col">Studio</th>
                <th scope="col">Discovery</th>
                <th scope="col">Sub-discoveries</th>
              </tr>
            </thead>
            <tbody>
              {STUDIOS.map((studio) => {
                const station = studio.stations.find((s) => s.live)
                if (!station) return null
                const metrics = metricsOf(station.id)
                const base = metrics.filter((m) => tierOf(station.id, m) === 'discovery')
                const subs = metrics.filter((m) => tierOf(station.id, m) !== 'discovery')
                return (
                  <tr key={studio.key}>
                    <th scope="row">
                      {studio.label}
                      <br />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{station.name}</span>
                    </th>
                    <td>
                      <code>{base.map((m) => metricLabel(station.id, m)).join(', ')}</code>
                    </td>
                    <td>
                      <code>
                        {subs.length
                          ? `${metricLabel(station.id, subs[0])} … ${metricLabel(
                              station.id,
                              subs[subs.length - 1],
                            )}`
                          : '—'}
                      </code>
                      <br />
                      <span style={{ fontSize: 12 }}>{subs.length} settings</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p>The rules of the race, stated so there is nothing to argue about later:</p>
          <ol className="steps">
            <li>
              <strong>A claim is staked by taking the piece away</strong> — as an avatar, a download,
              or a deliberate pour. Turning a dial does not claim anything. There is no
              claim-without-a-piece endpoint, because the race should be won by whoever looked, not by
              whoever could send the fastest request.
            </li>
            <li>
              <strong>First commit wins, decided by the database.</strong> The claim key —
              station, seed hash and the setting on that studio&rsquo;s axis — is unique in the register, so two people
              committing the same piece in the same instant cannot both be told they were first. The
              second one is told who holds it.
            </li>
            <li>
              <strong>A sub-discovery is not owned by the discovery holder</strong> and does not
              require the discovery to have been claimed at all. A rule reserving every rung of a seed
              for its first finder would end the race instead of starting it.
            </li>
            <li>
              <strong>Render mode, size and how you took it away are not part of the claim.</strong>{' '}
              They are how the piece was looked at, not which piece it is.
            </li>
            <li>
              <strong>Losing a race costs you nothing but the record.</strong> The piece is identical
              in your hands either way. Without a name set, pieces are still recorded and simply
              claim nothing.
            </li>
          </ol>
          <p className="caveat">
            <strong>What a name is worth here.</strong> A discoverer name is typed in and kept in your
            own browser; there is no account gate in front of it yet. The <em>ordering</em> is real and
            enforced by the register, but the identity behind a name is only as strong as the honour
            of the people using it. When the ZKP sign-in covers the studios, claims will bind to a
            proven identity instead — and this paragraph will be deleted rather than quietly left to
            rot.
          </p>
        </Section>

        <Section n="14" title="The register, as it stands">
          <Register />
        </Section>

        <Section n="15" title="Stations that are announced and not built" status="future">
          <p>
            Listed on the studio pages with their cards disabled, and refused by the ledger if a
            recipe naming one ever arrives, because a recipe that cannot be repainted is a dead row:
          </p>
          <ul className="compare-list">
            {STUDIOS.flatMap((studio) =>
              studio.stations
                .filter((s) => !s.live)
                .map((s) => (
                  <li key={`${studio.key}:${s.id}`}>
                    <strong>{s.name}</strong> <span style={{ fontSize: 12 }}>({studio.label})</span> —{' '}
                    {s.blurb}
                  </li>
                )),
            )}
          </ul>
          <p>
            Each one is a genuinely different generator rather than a preset over an existing station.
            That is the bar for adding a station, and it is the reason there are three studios instead
            of one with a longer dropdown — what separates them is not the family of kernel but what
            happens to the frame, and what their second axis is.
          </p>
        </Section>

        <footer className="doc-foot">
          <p>
            V1 kernels: <code>src/lib/art.ts</code>, <code>src/lib/art-vortex.ts</code> · V2
            kernels: <code>src/lib/artv2.ts</code>, <code>src/lib/artv2-noise.ts</code>,{' '}
            <code>src/lib/artv2-burst.ts</code>, <code>src/lib/artv2-dna.ts</code> · V3
            kernel: <code>src/lib/artv3.ts</code>, <code>src/lib/artv3-decay.ts</code> · splice
            bench: <code>src/lib/art-dna-ui.tsx</code> · station
            dispatch: <code>src/lib/art-engine.ts</code>, <code>src/lib/artv2-engine.ts</code>,{' '}
            <code>src/lib/artv3-engine.ts</code> · registry: <code>src/lib/art-registry.ts</code> ·
            the claws: <code>src/lib/claws.ts</code>, <code>src/lib/claw-words.ts</code>,{' '}
            <code>src/lib/artisticclaw.ts</code>, <code>src/lib/wondersclaw.ts</code> ·
            discovery rules:{' '}
            <code>src/lib/art-discovery.ts</code> · register: <code>db/art.ts</code> · endpoints:{' '}
            <code>src/routes/api.art.ts</code>, <code>src/routes/api.art.discoveries.ts</code>,{' '}
            <code>src/routes/api.claw.ts</code>
          </p>
        </footer>
      </div>

      <style>{`
        .doc { background: var(--bg-primary); padding: 40px 24px 80px; }
        .doc-inner { max-width: 760px; margin: 0 auto; }
        .kicker { font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
          color: #f9a8d4; margin: 0 0 12px; }
        .doc-head h2 { font-size: 32px; line-height: 1.15; letter-spacing: -.02em; margin: 0 0 16px;
          color: var(--text-primary); }
        .standfirst { font-size: 16px; line-height: 1.7; color: var(--text-secondary); margin: 0 0 18px; }
        .doc-links a { display: inline-flex; align-items: center; gap: 5px; font-size: 13px;
          color: #f9a8d4; text-decoration: none; }
        .doc-links a:hover { text-decoration: underline; }
        .doc-head { padding-bottom: 34px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }

        .sec { padding: 34px 0; border-bottom: 1px solid var(--border); }
        .sec h3 { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
          font-size: 20px; color: var(--text-primary); margin: 0 0 16px; letter-spacing: -.01em; }
        .secn { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
          color: #f9a8d4; }
        .chip { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; padding: 3px 8px;
          border: 1px solid; border-radius: 999px; font-weight: 600; }
        .sec p { font-size: 15px; line-height: 1.72; color: var(--text-secondary); margin: 0 0 14px; }
        .sec strong { color: var(--text-primary); font-weight: 600; }
        .sec code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
          background: var(--bg-card); padding: 1px 5px; border-radius: 4px; color: #f9a8d4; }

        .callout { border-left: 2px solid #ec4899; padding: 4px 0 4px 16px; }
        .caveat { border-left: 2px solid #c98500; padding: 4px 0 4px 16px; }

        .steps { margin: 0 0 14px; padding-left: 20px; display: grid; gap: 11px; }
        .steps li { font-size: 15px; line-height: 1.68; color: var(--text-secondary); }
        .compare-list { margin: 0 0 14px; padding-left: 20px; display: grid; gap: 8px; }
        .compare-list li { font-size: 15px; line-height: 1.65; color: var(--text-secondary); }

        .fig { margin: 0 0 20px; }
        .fig svg { width: 100%; height: auto; background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 12px; padding: 8px; }
        .fig figcaption { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-top: 10px; }

        .limits { width: 100%; border-collapse: collapse; font-size: 14px; }
        .limits th, .limits td { text-align: left; padding: 12px 14px 12px 0; vertical-align: top;
          border-bottom: 1px solid var(--border); color: var(--text-secondary); line-height: 1.6; }
        .limits thead th { color: var(--text-primary); font-size: 11px; text-transform: uppercase;
          letter-spacing: .08em; }
        .limits tbody th { color: var(--text-primary); font-weight: 500; padding-right: 22px; }

        .doc-foot { padding-top: 26px; }
        .doc-foot p { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.8; }
      `}</style>
    </div>
  )
}

export const Route = createFileRoute('/art-method')({ component: ArtMethodPage })
