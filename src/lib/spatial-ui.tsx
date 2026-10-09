import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, Box, ChevronRight, Loader2, MapPin, Search, Sparkles, X } from 'lucide-react'
import {
  serializeQuery,
  npText,
  type From,
  type SpatialConstraint,
  type SpatialHit,
  type SpatialQuery,
  type SpatialResult,
  type ViewBox,
  type Vec3,
} from './spatial-dom'
import { SPATIAL_PROMPTS } from './spatial-scenes'

// SpatialVerse Search — the surface.
//
// The third face of /search. CharacterVerse finds someone to talk to and
// AgentechVerse finds someone to do the work; SpatialVerse finds a *place* —
// a thing at a position inside a 3D space, by where it is rather than only by
// what it says. "The digital book on the second shelf of the virtual library."
//
// The page shows its working at every step, because spatial words are the
// ones people disagree about most:
//
//   - **Read as.** The query, compiled into a target and constraints, each a
//     chip you can remove. Every ordinal says which way it counted and can be
//     turned around — "second from the top" and "second from the bottom" are
//     different shelves, and the page will not pretend otherwise.
//   - **Narrow by surface.** Where the hits sit apart in the space's tree —
//     three bookcases, two walls — those surfaces become refinements. A
//     deeper space offers deeper criteria without anyone writing a filter.
//   - **The map.** An isometric view of the room, the hit lit, the thing it
//     was found relative to outlined. Every box on it is a search: click one
//     and the page finds exactly that object.

export const SPATIAL_ACCENT = '#ff9d6b'

type Rewrite = { from: string; to: string } | null

export function SpatialSurface({ initialQuery = '' }: { initialQuery?: string }) {
  const [draft, setDraft] = useState(initialQuery)
  const [result, setResult] = useState<(SpatialResult & { rewrite?: Rewrite }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(0)
  const queryRef = useRef('')
  const input = useRef<HTMLInputElement>(null)

  const run = useCallback(async (raw: string) => {
    const q = raw.trim()
    if (!q) return
    queryRef.current = q
    setDraft(q)
    setLoading(true)
    setError('')
    setSelected(0)
    let found = 0
    try {
      const res = await fetch(`/api/spatial?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => null)
      if (queryRef.current !== q) return
      if (!res.ok || !data) {
        setError(data?.error || 'SpatialVerse Search could not be reached.')
        return
      }
      setResult(data)
      found = data.exact?.length || 0
    } catch {
      if (queryRef.current === q) setError('SpatialVerse Search could not be reached.')
      return
    } finally {
      if (queryRef.current === q) setLoading(false)
    }

    // Nothing found exactly: ask the model to restate the words in the
    // grammar, and keep the restatement only if it finds more. The model never
    // finds anything itself — the engine resolves what it writes.
    if (found) return
    setRewriting(true)
    try {
      const res = await fetch('/api/spatial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rewrite', q }),
      })
      const data = res.ok ? await res.json() : null
      if (data && queryRef.current === q && data.rewrite) setResult(data)
    } catch {
      /* the literal reading stands */
    } finally {
      if (queryRef.current === q) setRewriting(false)
    }
  }, [])

  useEffect(() => { if (initialQuery) void run(initialQuery) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const runParsed = (q: SpatialQuery) => void run(serializeQuery(q))

  const box = (
    <form
      onSubmit={(e) => { e.preventDefault(); void run(draft) }}
      role="search"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        maxWidth: 660,
        padding: '9px 14px',
        borderRadius: 999,
        border: `1px solid ${SPATIAL_ACCENT}55`,
        background: 'var(--bg-card)',
        boxShadow: '0 1px 6px rgba(0, 0, 0, 0.25)',
      }}
    >
      <span style={{ display: 'flex', color: SPATIAL_ACCENT, flexShrink: 0 }} aria-hidden>
        <Box size={17} />
      </span>
      <input
        ref={input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Describe a thing and where it is — the book on the second shelf…"
        aria-label="Search inside 3D spaces with SpatialVerse"
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14.5 }}
      />
      {draft && (
        <button
          type="button"
          onClick={() => { setDraft(''); input.current?.focus() }}
          aria-label="Clear"
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={14} />
        </button>
      )}
      <button
        type="submit"
        aria-label="Search the spaces"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 999,
          border: 'none',
          background: SPATIAL_ACCENT,
          color: '#0d0d14',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
      </button>
    </form>
  )

  if (!result && !loading && !error) {
    return (
      <div style={{ display: 'grid', gap: 20, justifyItems: 'center', paddingTop: 28 }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 700, letterSpacing: -1, color: 'var(--text-primary)' }}>
            SpatialVerse <span style={{ color: SPATIAL_ACCENT }}>Search</span>
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 560 }}>
            Spatial AI. Search the inside of 3D spaces by where things are, not only by what they say. Every
            space is published in the Spatial DOM, so &ldquo;on&rdquo;, &ldquo;in&rdquo; and &ldquo;the second
            shelf&rdquo; mean the same thing in every one of them.
          </p>
        </div>
        {box}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 760 }}>
          {SPATIAL_PROMPTS.map((p) => (
            <button key={p} type="button" onClick={() => void run(p)} className="cvsp-chip">
              {p}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const hits = result ? (result.exact.length ? result.exact : result.partial) : []
  const isPartial = Boolean(result && !result.exact.length && result.partial.length)
  const current = hits[Math.min(selected, Math.max(0, hits.length - 1))]

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {box}

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#f87171' }}>
          {error}
        </p>
      )}

      {result && (
        <>
          <ReadAs result={result} rewriting={rewriting} onRun={runParsed} />

          {result.facets.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Narrow by surface</span>
              {result.facets.map((f) => (
                <button key={f.label} type="button" className="cvsp-facet" onClick={() => void run(f.refine)} title={f.refine}>
                  {f.label} <span>{f.count}</span>
                </button>
              ))}
            </div>
          )}

          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            {isPartial
              ? `Nothing satisfies every constraint. Closest ${hits.length}, with what each one fails.`
              : `${result.exact.length}${result.exact.length >= 24 ? '+' : ''} found`}{' '}
            · {result.stats.nodes} nodes across {result.stats.scenes} space{result.stats.scenes === 1 ? '' : 's'} ·{' '}
            {(result.stats.took_ms / 1000).toFixed(2)}s
          </p>

          {hits.length ? (
            <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <ol style={{ flex: '1 1 380px', minWidth: 0, listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {hits.map((h, i) => (
                  <HitRow key={`${h.scene}/${h.id}`} hit={h} on={h === current} onSelect={() => setSelected(i)} onRun={(q) => void run(q)} />
                ))}
              </ol>
              {current && (
                <div style={{ flex: '1 1 340px', minWidth: 0, position: 'sticky', top: 74 }}>
                  <SpaceMap result={result} hit={current} others={hits} onFind={(q) => void run(q)} />
                </div>
              )}
            </div>
          ) : (
            <div className="cvsp-card" style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {rewriting
                ? 'Nothing matched those words literally. Asking the spatial model to restate them…'
                : `Nothing in the indexed spaces matches "${result.query}". The spaces know these kinds of thing: ${result.types.slice(0, 24).join(', ')}.`}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- read as */

const FLIP: Record<From, From> = { auto: 'auto', top: 'bottom', bottom: 'top', left: 'right', right: 'left', front: 'back', back: 'front' }

function ReadAs({
  result,
  rewriting,
  onRun,
}: {
  result: SpatialResult & { rewrite?: Rewrite }
  rewriting: boolean
  onRun: (q: SpatialQuery) => void
}) {
  const q = result.parsed

  /**
   * Turning an ordinal around. "auto" has a direction too — the axis the
   * siblings spread along, counted from its natural end — so flipping it has
   * to name the opposite end explicitly. Vertical counts from the top and
   * depth from the front by default, horizontal from the left.
   */
  const turned = (o: NonNullable<SpatialQuery['target']['ordinal']>, axis: 0 | 1 | 2 | null): From => {
    if (o.from !== 'auto') return FLIP[o.from]
    return axis === 0 ? 'right' : axis === 2 ? 'back' : 'bottom'
  }

  const withTarget = (t: SpatialQuery['target']): SpatialQuery => ({ ...q, target: t })
  const withConstraint = (k: number, c: SpatialConstraint | null): SpatialQuery => ({
    ...q,
    constraints: c ? q.constraints.map((x, i) => (i === k ? c : x)) : q.constraints.filter((_, i) => i !== k),
  })

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {result.rewrite && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)' }}>
          <Sparkles size={11} style={{ verticalAlign: -1, color: SPATIAL_ACCENT }} /> Restated by the spatial model as{' '}
          <em style={{ color: 'var(--text-primary)' }}>&ldquo;{result.rewrite.to}&rdquo;</em> — your words found nothing literally.
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {rewriting ? (
            <>
              <Loader2 size={10} className="animate-spin" style={{ verticalAlign: -1 }} /> reading…
            </>
          ) : (
            'Read as'
          )}
        </span>

        <span className="cvsp-crit" data-target="">
          <MapPin size={11} /> {npText(q.target) || q.target.words.join(' ')}
          {q.target.ordinal && (
            <button
              type="button"
              className="cvsp-crit-btn"
              aria-label="Count from the other end"
              title="Count from the other end"
              onClick={() => onRun(withTarget({ ...q.target, ordinal: { ...q.target.ordinal!, from: turned(q.target.ordinal!, result.autoAxis.target) } }))}
            >
              <ArrowUpDown size={10} />
            </button>
          )}
        </span>

        {q.constraints.map((c, k) => (
          <span key={k} className="cvsp-crit">
            {c.rel === 'text' ? (
              <>
                {c.via} <strong>{c.words.join(' ')}</strong>
              </>
            ) : (
              <>
                {c.rel.replace('-', ' ')} <strong>{npText(c.anchor)}</strong>
                {c.anchor.ordinal && (
                  <button
                    type="button"
                    className="cvsp-crit-btn"
                    aria-label="Count from the other end"
                    title="Count from the other end"
                    onClick={() =>
                      onRun(
                        withConstraint(k, {
                          ...c,
                          anchor: { ...c.anchor, ordinal: { ...c.anchor.ordinal!, from: turned(c.anchor.ordinal!, result.autoAxis.constraints[k]) } },
                        }),
                      )
                    }
                  >
                    <ArrowUpDown size={10} />
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="cvsp-crit-btn"
              aria-label={`Remove “${c.rel === 'text' ? `${c.via} ${c.words.join(' ')}` : `${c.rel} ${npText(c.anchor)}`}”`}
              onClick={() => onRun(withConstraint(k, null))}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      {result.ignored.length > 0 && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
          Set aside, because nothing of that kind carries the word: {result.ignored.map((w) => `“${w}”`).join(', ')}.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- hits */

function HitRow({ hit, on, onSelect, onRun }: { hit: SpatialHit; on: boolean; onSelect: () => void; onRun: (q: string) => void }) {
  return (
    <li className="cvsp-card cvsp-hit" data-on={on || undefined}>
      <nav aria-label={`Where ${hit.name} is`} className="cvsp-crumbs">
        {hit.path.map((p, i) => (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {i > 0 && <ChevronRight size={10} aria-hidden />}
            {i === hit.path.length - 1 ? (
              <span aria-current="location" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
            ) : (
              <button type="button" onClick={() => onRun(p.refine)} title={`Search only ${p.kind === 'surface' ? 'on' : 'in'} ${p.name}`}>
                {p.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      <button type="button" onClick={onSelect} className="cvsp-hit-title" aria-pressed={on}>
        {hit.name}
      </button>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
        <span className="cvsp-badge">{hit.type}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{hit.why}</span>
      </div>
      {hit.text && (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{hit.text}</p>
      )}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7, alignItems: 'center' }}>
        {hit.satisfied.map((s) => (
          <span key={s} className="cvsp-check" data-ok="">✓ {s}</span>
        ))}
        {hit.failed.map((s) => (
          <span key={s} className="cvsp-check">✗ {s}</span>
        ))}
        <span style={{ flex: 1 }} />
        {hit.href && (
          <a href={hit.href} className="cvsp-open">
            Open
          </a>
        )}
      </div>
    </li>
  )
}

/* -------------------------------------------------------------------- map */

const COS = Math.cos(Math.PI / 6)
const SIN = Math.sin(Math.PI / 6)

/** World → screen. The viewer stands at +x, +z, above — so the front and right faces show. */
export function iso([x, y, z]: Vec3): [number, number] {
  return [(x - z) * COS, (x + z) * SIN - y]
}

export function corners(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = []
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z])
  return out
}

/**
 * The map: the room the hit is in, drawn in isometric boxes.
 *
 * Close-up by default — a book is four centimetres wide and a room is twelve
 * metres, so a whole-room view would draw the thing you found as a single
 * pixel. The close-up frames the furniture the hit is in; the room view is a
 * toggle away. Furniture and containers are drawn as outlines so what is
 * inside them stays visible; walls are drawn faint for the same reason.
 */
function SpaceMap({
  result,
  hit,
  others,
  onFind,
}: {
  result: SpatialResult
  hit: SpatialHit
  others: SpatialHit[]
  onFind: (q: string) => void
}) {
  const [whole, setWhole] = useState(false)
  const view = result.views[`${hit.scene}/${hit.room}`]
  const otherIds = useMemo(() => new Set(others.filter((o) => o.scene === hit.scene).map((o) => o.id)), [others, hit.scene])

  const drawn = useMemo(() => {
    if (!view) return null
    const byId = new Map(view.boxes.map((b) => [b.id, b]))
    const target = byId.get(hit.id)
    // Frame: the nearest furniture/container/surface ancestor of the hit, or the hit itself.
    let frame: ViewBox | undefined
    for (let k = hit.path.length - 2; k >= 0 && !frame; k--) {
      const b = byId.get(hit.path[k].id)
      if (b && (b.kind === 'furniture' || b.kind === 'container' || (b.kind === 'surface' && b.type !== 'wall'))) frame = b
    }
    const region = whole || !target ? null : frame || target
    const pts = (region ? corners(region.min, region.max) : view.boxes.flatMap((b) => corners(b.min, b.max))).map(iso)
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * (region ? 0.22 : 0.06) + 0.05
    const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2]
    // Painter's order: far (small x+z) and low first — except the found box,
    // which is drawn last so nothing in front of it can hide it.
    const order = [...view.boxes].sort(
      (a, b) =>
        Number(a.id === hit.id) - Number(b.id === hit.id) ||
        a.min[0] + a.min[2] - (b.min[0] + b.min[2]) ||
        a.min[1] - b.min[1],
    )
    return { vb, order }
  }, [view, hit, whole])

  if (!view || !drawn) return null

  return (
    <figure className="cvsp-card" style={{ margin: 0, padding: 10 }}>
      <figcaption style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)' }}>{view.title}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="cvsp-facet" onClick={() => setWhole((v) => !v)} aria-pressed={whole}>
          {whole ? 'Close-up' : 'Whole room'}
        </button>
      </figcaption>
      <svg
        viewBox={drawn.vb.join(' ')}
        role="img"
        aria-label={`Isometric map of ${view.title}, with ${hit.name} highlighted`}
        style={{ width: '100%', height: 'auto', aspectRatio: '4 / 3', display: 'block', background: 'var(--bg-primary)', borderRadius: 8 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {drawn.order.map((b) => {
          const role = b.id === hit.id ? 'target' : hit.anchors.includes(b.id) ? 'anchor' : otherIds.has(b.id) ? 'hit' : 'context'
          return <IsoBox key={b.id} box={b} role={role} onFind={onFind} />
        })}
      </svg>
      <p style={{ margin: '6px 2px 0', fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <span style={{ color: SPATIAL_ACCENT }}>■</span> this result · <span style={{ color: '#8f6655' }}>■</span> other results ·{' '}
        <span style={{ color: '#c9b6ff' }}>□</span> what it was found relative to · click any object to find it
      </p>
    </figure>
  )
}

function IsoBox({ box, role, onFind }: { box: ViewBox; role: 'target' | 'anchor' | 'hit' | 'context'; onFind: (q: string) => void }) {
  const [x0, y0, z0] = box.min
  const [x1, y1, z1] = box.max
  const p = (v: Vec3) => iso(v).join(',')
  const top = [p([x0, y1, z0]), p([x1, y1, z0]), p([x1, y1, z1]), p([x0, y1, z1])].join(' ')
  const front = [p([x0, y0, z1]), p([x1, y0, z1]), p([x1, y1, z1]), p([x0, y1, z1])].join(' ')
  const right = [p([x1, y0, z0]), p([x1, y0, z1]), p([x1, y1, z1]), p([x1, y1, z0])].join(' ')

  const hollow = box.kind === 'furniture' || box.kind === 'container' || box.type === 'wall'
  // The found box is the only bright thing; other hits are the same hue,
  // dimmed, so "this one" and "also these" never read alike.
  const colour =
    role === 'target' ? SPATIAL_ACCENT : role === 'anchor' ? '#c9b6ff' : role === 'hit' ? '#8f6655' : box.kind === 'object' ? '#7d7da3' : '#4a4a6a'
  const fillOpacity = box.type === 'wall' ? 0.05 : hollow ? (role === 'anchor' ? 0.12 : 0.04) : role === 'context' ? 0.75 : role === 'hit' ? 0.7 : 1
  const stroke = role === 'target' ? '#ffe2d1' : role === 'context' ? (hollow ? '#5a5a7e' : '#2b2b42') : colour
  // Screen pixels, not metres: the stroke does not scale with the view.
  const sw = role === 'target' ? 2 : role === 'anchor' ? 1.6 : 0.7

  return (
    <g
      className="cvsp-iso"
      data-role={role}
      onClick={() => onFind(box.find)}
      style={{ cursor: 'pointer' }}
      // Hollow boxes hand clicks through their faces to what is inside them.
      pointerEvents={hollow ? 'stroke' : 'all'}
    >
      <title>{`${box.name} (${box.type}) — click to find it`}</title>
      {(['right', 'front', 'top'] as const).map((face) => (
        <polygon
          key={face}
          points={face === 'top' ? top : face === 'front' ? front : right}
          fill={colour}
          fillOpacity={fillOpacity * (face === 'top' ? 1 : face === 'front' ? 0.78 : 0.6)}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}
