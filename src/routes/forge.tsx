import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Hammer,
  Layers,
  Loader2,
  Scissors,
  X,
} from 'lucide-react'
import {
  KINDS,
  SUBSTRATE_QUOTE,
  annotate,
  bisect,
  collapse,
  converge,
  fuse,
  kindMeta,
  pockets,
  repair,
  seal,
  superpose,
  validate,
  type Assembly,
  type Chunk,
  type ChunkKind,
  type Frame,
  type SlotKind,
  type Superposition,
} from '../lib/chunkfusion.js'
import { getSessionId } from '../lib/create-ui.js'

// The Forge — drag bisected code into lego bricks and snap them together.
//
// Everything decisive on this page is computed by the kernel in the browser,
// synchronously, because a drag has to be told yes or no inside a pointer move
// and a round trip cannot answer that fast. The server is memory, not judgment:
// it stores the library and the benches, and if it is unreachable the forge
// still works and says so rather than pretending it saved.
//
// Drag is not the only way in. Every drop zone is also a button, and every brick
// has a Place control that lists the landings it is allowed, because a build
// surface that only responds to a mouse is a build surface most people cannot
// use.

type LaneName = 'head' | 'body' | 'tail'
type Lanes = Record<LaneName, string[]>

const LANES: Array<{ key: LaneName; title: string; blurb: string }> = [
  { key: 'head', title: 'Head', blurb: 'What the block sets up. Built forward from the seed.' },
  { key: 'body', title: 'Body', blurb: 'The work. Faults here are local, not fatal.' },
  { key: 'tail', title: 'Tail', blurb: 'What must be true at the end. Built backward.' },
]

/* Hue per kind. Identity is never carried by hue alone — every brick prints its
 * kind in words as well, and the hue is a second channel on top of that. */
const KIND_HUE: Record<ChunkKind, string> = {
  import: '#3987e5',
  export: '#199e70',
  type: '#8f6fd0',
  function: '#c98500',
  binding: '#d95926',
  branch: '#a78bfa',
  loop: '#0ca30c',
  guard: '#fab219',
  call: '#7f7fa0',
  return: '#d03b3b',
  comment: '#55556e',
  unknown: '#ec835a',
}

const SAMPLE = `import { readFile } from 'node:fs/promises'

const LIMIT = 200

export async function loadRows(path) {
  const raw = await readFile(path, 'utf8')
  if (!raw.trim()) return []
  const lines = raw.split('\\n').slice(0, LIMIT)
  return lines.map((line) => line.split(','))
}

function tally(rows) {
  let total = 0
  for (const row of rows) {
    total += row.length
  }
  return total
}
`

/* ------------------------------------------------------------------ helpers */

function flatten(list: Chunk[]): Chunk[] {
  const out: Chunk[] = []
  const walk = (l: Chunk[]) => {
    for (const c of l) {
      out.push(c)
      walk(c.children)
    }
  }
  walk(list)
  return out
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

/* -------------------------------------------------------------------- brick */

function Studs({ names, side }: { names: string[]; side: 'top' | 'bottom' }) {
  if (!names.length) return null
  const shown = names.slice(0, 6)
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: side === 'top' ? '0 0 6px' : '6px 0 0',
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '.04em' }}>
        {side === 'top' ? 'needs' : 'gives'}
      </span>
      {shown.map((n) => (
        <span
          key={n}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: side === 'top' ? '0 0 8px 8px' : '8px 8px 0 0',
            background: side === 'top' ? 'transparent' : 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderTop: side === 'top' ? 'none' : '1px solid var(--border)',
            borderBottom: side === 'top' ? '1px solid var(--border)' : 'none',
            color: 'var(--text-primary)',
          }}
        >
          {n}
        </span>
      ))}
      {names.length > shown.length && (
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>+{names.length - shown.length}</span>
      )}
    </div>
  )
}

function Brick({
  chunk,
  faulted,
  faultNote,
  armed,
  onArm,
  onRemove,
  draggable,
  count,
}: {
  chunk: Chunk
  faulted?: boolean
  faultNote?: string
  armed?: boolean
  onArm?: () => void
  onRemove?: () => void
  draggable?: boolean
  count?: number
}) {
  const meta = kindMeta(chunk.kind)
  const hue = KIND_HUE[chunk.kind]
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onArm : undefined}
      style={{
        border: `1px solid ${faulted ? '#d03b3b' : armed ? hue : 'var(--border)'}`,
        borderLeft: `3px solid ${hue}`,
        borderRadius: 10,
        background: armed ? 'var(--bg-hover)' : 'var(--bg-card)',
        padding: '8px 10px',
        cursor: draggable ? 'grab' : 'default',
      }}
    >
      <Studs names={chunk.bindsIn} side="top" />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: hue }}>
              {meta.label}
            </span>
            {chunk.terminal && (
              <span style={{ fontSize: 10, color: '#fab219', border: '1px solid #fab21955', borderRadius: 4, padding: '0 4px' }}>
                terminal
              </span>
            )}
            {typeof count === 'number' && count > 1 && (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>×{count} in pocket</span>
            )}
          </div>
          <code
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {chunk.label || '(blank)'}
          </code>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {onArm && (
            <button
              type="button"
              onClick={onArm}
              aria-pressed={!!armed}
              title="Show every landing this brick is allowed"
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                border: `1px solid ${armed ? hue : 'var(--border)'}`,
                background: armed ? hue : 'transparent',
                color: armed ? '#0d0d14' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {armed ? 'Placing' : 'Place'}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Take this brick off the bench"
              aria-label="Remove brick"
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                borderRadius: 6,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <Studs names={chunk.bindsOut} side="bottom" />
      {faulted && faultNote && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#ec835a', display: 'flex', gap: 6 }}>
          <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{faultNote}</span>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- page */

function ForgePage() {
  const [sessionId, setSessionId] = useState('')
  const [source, setSource] = useState(SAMPLE)
  const [depth, setDepth] = useState(2)
  const [slot, setSlot] = useState<SlotKind>('module')
  const [seedText, setSeedText] = useState('')
  const [libraryChunks, setLibraryChunks] = useState<Chunk[]>([])
  const [lanes, setLanes] = useState<Lanes>({ head: [], body: [], tail: [] })
  const [frames, setFrames] = useState<Frame[]>([])
  const [armed, setArmed] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [offline, setOffline] = useState(false)
  const [benchId, setBenchId] = useState('')
  const [digest, setDigest] = useState('')
  const [copied, setCopied] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ----------------------------------------------------------- server sync */

  useEffect(() => {
    const id = getSessionId()
    setSessionId(id)
    let live = true
    ;(async () => {
      try {
        const res = await fetch(`/api/chunkfusion?sessionId=${encodeURIComponent(id)}`)
        if (!res.ok) throw new Error('read failed')
        const data = await res.json()
        if (!live) return
        setLibraryChunks(Array.isArray(data.chunks) ? data.chunks : [])
        // The endpoint tells us when a reader fell over. Treat that as offline
        // rather than as an empty shelf.
        if (data.degraded) setOffline(true)
      } catch {
        if (live) setOffline(true)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/chunkfusion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 204) return null
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'The forge could not complete that.')
    return data
  }, [])

  /* -------------------------------------------------------------- derived */

  const byId = useMemo(() => new Map(libraryChunks.map((c) => [c.id, c])), [libraryChunks])
  const seed = useMemo(
    () => seedText.split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^[A-Za-z_$][\w$]*$/.test(s)),
    [seedText],
  )

  const laneChunks = useMemo(() => {
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is Chunk => !!c)
    return { head: pick(lanes.head), body: pick(lanes.body), tail: pick(lanes.tail) }
  }, [lanes, byId])

  const assembly: Assembly = useMemo(
    () => ({ slot, seed, chunks: [...laneChunks.head, ...laneChunks.body, ...laneChunks.tail] }),
    [slot, seed, laneChunks],
  )

  const validation = useMemo(() => validate(assembly), [assembly])
  const convergence = useMemo(
    () => converge({ slot, seed, head: laneChunks.head, body: laneChunks.body, tail: laneChunks.tail }),
    [slot, seed, laneChunks],
  )
  const plan = useMemo(() => repair(assembly), [assembly])
  const fused = useMemo(() => fuse(assembly), [assembly])
  const shelf = useMemo(() => pockets(libraryChunks), [libraryChunks])

  const armedChunk = armed ? byId.get(armed) || null : null
  const sp: Superposition | null = useMemo(
    () => (armedChunk ? superpose(armedChunk, assembly) : null),
    [armedChunk, assembly],
  )

  /* Global index of a slot position, given the lane offsets. The three lanes are
   * one Assembly; the split is for the eye and for convergence, not for scope. */
  const offset = { head: 0, body: laneChunks.head.length, tail: laneChunks.head.length + laneChunks.body.length }

  const faultAt = useMemo(() => {
    const m = new Map<number, string>()
    for (const f of validation.faults) if (!m.has(f.index)) m.set(f.index, f.detail)
    return m
  }, [validation])

  /* --------------------------------------------------------------- actions */

  const runBisect = useCallback(async () => {
    setError('')
    setNotice('')
    if (!source.trim()) {
      setError('Paste some code first — the bisector needs something to cut.')
      return
    }
    setBusy('bisect')
    try {
      const data = await post({ sessionId, action: 'bisect', source, maxDepth: depth, origin: 'forge' })
      const fresh: Chunk[] = Array.isArray(data?.chunks) ? data.chunks : []
      setLibraryChunks((prev) => [...fresh, ...prev])
      setOffline(false)
      setNotice(
        `${fresh.length} brick${fresh.length === 1 ? '' : 's'} cut` +
          (data?.duplicates ? `, ${data.duplicates} already on the shelf` : '') +
          '.',
      )
    } catch {
      // The kernel is right here. Falling back to it keeps the forge usable when
      // the database is not, and the banner says which of the two you are in.
      const local = flatten(bisect(source, { maxDepth: depth }))
      setLibraryChunks((prev) => [...local, ...prev])
      setOffline(true)
      setNotice(`${local.length} bricks cut in the browser. Nothing was saved.`)
    } finally {
      setBusy(null)
    }
  }, [post, sessionId, source, depth])

  const place = useCallback(
    (lane: LaneName, position: number) => {
      if (!armedChunk || !sp) return
      const index = offset[lane] + position
      const tick = typeof performance !== 'undefined' ? Math.round(performance.now() * 1000) : 0
      const result = collapse(assembly, armedChunk, sp, index, tick, frames.length + 1)
      if (!result.ok) {
        setError(result.reason)
        return
      }
      setError('')
      setLanes((prev) => {
        const next = { ...prev, [lane]: [...prev[lane]] }
        next[lane].splice(position, 0, armedChunk.id)
        return next
      })
      setFrames((prev) => [...prev, result.frame])
      setArmed(null)
      if (benchId && !offline) {
        void post({
          sessionId,
          action: 'frame',
          publicId: benchId,
          chunkId: armedChunk.id,
          lane,
          position,
          outcomes: sp.permitted.length,
          digest: result.frame.digest,
        }).catch(() => setOffline(true))
      }
    },
    [armedChunk, sp, assembly, frames.length, offset, benchId, offline, post, sessionId],
  )

  const removeAt = useCallback((lane: LaneName, position: number) => {
    setLanes((prev) => {
      const next = { ...prev, [lane]: [...prev[lane]] }
      next[lane].splice(position, 1)
      return next
    })
  }, [])

  const saveBench = useCallback(async () => {
    setBusy('save')
    setError('')
    try {
      const data = await post({
        sessionId,
        action: 'save',
        publicId: benchId || undefined,
        title: 'Forge bench',
        slot,
        seed,
        lanes,
      })
      if (data?.publicId) setBenchId(data.publicId)
      setOffline(false)
      setNotice('Bench saved.')
    } catch (err: any) {
      setOffline(true)
      setError(err?.message || 'The bench could not be saved.')
    } finally {
      setBusy(null)
    }
  }, [post, sessionId, benchId, slot, seed, lanes])

  const copy = useCallback((label: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(label)
        if (copyTimer.current) clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => setCopied(''), 1800)
      },
      () => setError('The clipboard refused. Select the text and copy it by hand.'),
    )
  }, [])

  useEffect(() => {
    let live = true
    if (!fused.trim()) {
      setDigest('')
      return
    }
    void seal(fused).then((d) => {
      if (live) setDigest(d)
    })
    return () => {
      live = false
    }
  }, [fused])

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    },
    [],
  )

  /* ------------------------------------------------------------------- zone */

  const Zone = ({ lane, position }: { lane: LaneName; position: number }) => {
    if (!sp || !armedChunk) {
      return <div style={{ height: 6 }} />
    }
    const index = offset[lane] + position
    const landing = sp.outcomes.find((o) => o.index === index)
    const ok = !!landing?.ok
    const why = landing?.faults[0]?.detail || 'Not a permitted landing.'
    return (
      <button
        type="button"
        disabled={!ok}
        onClick={() => place(lane, position)}
        onDragOver={(e) => {
          if (ok) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (ok) place(lane, position)
        }}
        title={ok ? `Land at position ${index + 1}` : why}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          margin: '4px 0',
          padding: '5px 10px',
          borderRadius: 8,
          border: `1px dashed ${ok ? '#0ca30c' : 'var(--border)'}`,
          background: ok ? '#0ca30c18' : 'transparent',
          color: ok ? '#7fd67f' : 'var(--text-secondary)',
          fontSize: 11,
          cursor: ok ? 'pointer' : 'not-allowed',
          opacity: ok ? 1 : 0.55,
        }}
      >
        {ok ? `Land here — outcome ${index + 1}` : why}
      </button>
    )
  }

  /* ------------------------------------------------------------------ render */

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 16,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ------------------------------------------------------------ header */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg, var(--bg-secondary), var(--bg-primary))',
          padding: '28px 24px 22px',
        }}
      >
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent-light)' }}>
            <Hammer size={18} />
            <span style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase' }}>Chunk Fusion</span>
          </div>
          <h1 style={{ fontSize: 30, margin: '10px 0 6px', fontWeight: 650 }}>The Forge</h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 760, fontSize: 14, lineHeight: 1.6 }}>
            Bisect code into bricks, then snap them together. A brick only lands where it is allowed to land, and
            the reason it cannot is printed on the zone that refused it.
          </p>

          <figure
            style={{
              margin: '18px 0 0',
              borderLeft: '2px solid var(--accent)',
              paddingLeft: 14,
              maxWidth: 860,
            }}
          >
            <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>
              “{SUBSTRATE_QUOTE.text}”
            </blockquote>
            <figcaption style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              — {SUBSTRATE_QUOTE.author}
            </figcaption>
            <blockquote
              style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>TIME:</strong> {SUBSTRATE_QUOTE.companion}
            </blockquote>
          </figure>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              marginTop: 16,
              maxWidth: 1100,
            }}
          >
            {[
              ['CAN / CAN’T', 'Structural fit. A return cannot sit at module scope. Hard refusal, no gradient.'],
              ['SHOULD / SHOULD NOT', 'Scope fit. Every name a brick reads has to already exist above it.'],
              ['WILL HAPPEN EVENTUALLY', 'Convergence. Head and tail have to meet in the middle or the build is not done.'],
              ['THE FRACTIONAL SECOND', 'Landings stay unanimated until one is chosen. Choosing writes a frame.'],
            ].map(([t, d]) => (
              <div key={t} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--accent-light)' }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {(offline || error || notice) && (
        <div style={{ maxWidth: 1440, margin: '14px auto 0', padding: '0 24px' }}>
          {offline && (
            <div
              style={{
                border: '1px solid #fab21955',
                background: '#fab2190f',
                color: '#fab219',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 12,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <AlertTriangle size={14} />
              Working in the browser only. The kernel is running, the library is not being saved.
            </div>
          )}
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                border: '1px solid #d03b3b55',
                background: '#d03b3b0f',
                color: '#ec835a',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
          {notice && !error && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{notice}</div>
          )}
        </div>
      )}

      <main
        style={{
          maxWidth: 1440,
          margin: '0 auto',
          padding: '20px 24px 60px',
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 340px) minmax(360px, 1fr) minmax(300px, 380px)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        {/* ------------------------------------------------------- left rail */}
        <section style={{ display: 'grid', gap: 16 }}>
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Scissors size={14} /> Bisect
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
              JavaScript or TypeScript. The bisector is not a parser — it cuts on structure it can see, and refuses
              rather than guesses when it cannot.
            </p>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              rows={12}
              aria-label="Source to bisect"
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                padding: 10,
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Depth{' '}
                <select
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: 6,
                    padding: '3px 6px',
                  }}
                >
                  {[0, 1, 2, 3].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={runBisect}
                disabled={busy === 'bisect'}
                style={{
                  marginLeft: 'auto',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 13,
                  cursor: busy ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {busy === 'bisect' ? <Loader2 size={13} className="spin" /> : <Scissors size={13} />}
                Cut into bricks
              </button>
            </div>
          </div>

          {/* pockets */}
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Boxes size={14} /> Pockets
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                {libraryChunks.length} bricks · {shelf.length} shapes
              </span>
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Grouped by shape, not by text. Two loops that differ only in variable names are one pocket with two
              occupants — that is the folder the library is actually indexed by.
            </p>

            {loading ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 58,
                      borderRadius: 10,
                      background: 'var(--bg-hover)',
                      opacity: 0.5 - i * 0.12,
                    }}
                  />
                ))}
              </div>
            ) : !libraryChunks.length ? (
              <div
                style={{
                  border: '1px dashed var(--border)',
                  borderRadius: 10,
                  padding: '22px 14px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                <Layers size={20} style={{ opacity: 0.5 }} />
                <div style={{ marginTop: 8 }}>No bricks yet.</div>
                <div>Cut a file above and the shelf fills up.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10, maxHeight: 620, overflowY: 'auto' }}>
                {shelf.map((p) => (
                  <div key={p.shape}>
                    <Brick
                      chunk={p.exemplar}
                      draggable
                      armed={armed === p.exemplar.id}
                      count={p.occupants.length}
                      onArm={() => setArmed(armed === p.exemplar.id ? null : p.exemplar.id)}
                    />
                    {p.occupants.length > 1 && (
                      <div style={{ paddingLeft: 12, marginTop: 4, display: 'grid', gap: 4 }}>
                        {p.occupants
                          .filter((o) => o.id !== p.exemplar.id)
                          .slice(0, 4)
                          .map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              draggable
                              onDragStart={() => setArmed(o.id)}
                              onClick={() => setArmed(armed === o.id ? null : o.id)}
                              style={{
                                textAlign: 'left',
                                background: armed === o.id ? 'var(--bg-hover)' : 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                color: 'var(--text-secondary)',
                                fontSize: 11,
                                padding: '3px 8px',
                                cursor: 'pointer',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <ChevronRight size={10} style={{ verticalAlign: 'middle' }} /> {o.label}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------------- bench */}
        <section style={{ display: 'grid', gap: 16 }}>
          <div style={card}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 14, margin: 0 }}>Bench</h2>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Scope{' '}
                <select
                  value={slot}
                  onChange={(e) => setSlot(e.target.value as SlotKind)}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: 6,
                    padding: '3px 6px',
                  }}
                >
                  <option value="module">module</option>
                  <option value="body">body</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, minWidth: 180 }}>
                Names already in scope{' '}
                <input
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  placeholder="path, options"
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 12,
                    marginTop: 3,
                  }}
                />
              </label>
              <button
                type="button"
                onClick={saveBench}
                disabled={busy === 'save'}
                style={{
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {busy === 'save' ? 'Saving…' : 'Save bench'}
              </button>
            </div>

            {armedChunk && sp && (
              <div
                style={{
                  marginTop: 12,
                  border: '1px solid var(--accent)',
                  background: 'var(--bg-hover)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 12,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Clock size={13} style={{ color: 'var(--accent-light)' }} />
                <span>
                  <strong>{sp.permitted.length}</strong> of {sp.outcomes.length} landings are live for{' '}
                  <code style={{ fontSize: 11 }}>{armedChunk.label}</code>. Nothing is written until one is chosen.
                </span>
                <button
                  type="button"
                  onClick={() => setArmed(null)}
                  style={{
                    marginLeft: 'auto',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {LANES.map((lane) => {
            const list = laneChunks[lane.key]
            return (
              <div key={lane.key} style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <h3 style={{ fontSize: 13, margin: 0 }}>{lane.title}</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lane.blurb}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {list.length}
                  </span>
                </div>

                <div style={{ marginTop: 10 }}>
                  <Zone lane={lane.key} position={0} />
                  {list.length === 0 && !armed && (
                    <div
                      style={{
                        border: '1px dashed var(--border)',
                        borderRadius: 10,
                        padding: '16px 12px',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        textAlign: 'center',
                      }}
                    >
                      Empty. Pick up a brick on the left and this lane will show you where it may land.
                    </div>
                  )}
                  {list.map((c, i) => {
                    const globalIndex = offset[lane.key] + i
                    return (
                      <div key={`${c.id}-${i}`}>
                        <Brick
                          chunk={c}
                          faulted={faultAt.has(globalIndex)}
                          faultNote={faultAt.get(globalIndex)}
                          onRemove={() => removeAt(lane.key, i)}
                        />
                        <Zone lane={lane.key} position={i + 1} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>

        {/* --------------------------------------------------------- verdict */}
        <section style={{ display: 'grid', gap: 16 }}>
          {/* preserved */}
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Preserved</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 34, fontWeight: 650, color: validation.ok ? '#0ca30c' : '#fab219' }}>
                {pct(validation.preserved)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {validation.keep.length} of {assembly.chunks.length || 0} bricks clean
              </span>
            </div>
            <div
              role="img"
              aria-label={`${pct(validation.preserved)} of the assembly is intact`}
              style={{ display: 'flex', gap: 2, marginTop: 10, height: 8 }}
            >
              {assembly.chunks.map((_, i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    borderRadius: 2,
                    background: validation.scrap.includes(i) ? '#d03b3b' : '#0ca30c',
                  }}
                />
              ))}
              {!assembly.chunks.length && (
                <span style={{ flex: 1, borderRadius: 2, background: 'var(--bg-hover)' }} />
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.55 }}>
              {plan.note} A faulted brick still supplies its own names, so one bad brick does not cascade down the
              lane — that is what keeps the good part good.
            </p>
          </div>

          {/* repair plan */}
          {plan.plan.length > 0 && (
            <div style={card}>
              <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>What has to go back in the hole</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {plan.plan.map((h) => (
                  <div
                    key={h.index}
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: `3px solid ${KIND_HUE[h.needsKind]}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 12,
                    }}
                  >
                    <div>
                      Position {h.index + 1} — needs{' '}
                      <strong style={{ color: KIND_HUE[h.needsKind] }}>{kindMeta(h.needsKind).label}</strong>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>
                      {h.mustBind.length
                        ? `Must still supply: ${h.mustBind.join(', ')}`
                        : 'Nothing below reads from it — the replacement owes no names.'}
                    </div>
                    <code style={{ fontSize: 10, color: 'var(--text-secondary)' }}>shape {h.shape.slice(0, 12)}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* convergence */}
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>Meet in the middle</h2>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: convergence.converged ? '#0ca30c' : '#fab219',
                border: `1px solid ${convergence.converged ? '#0ca30c55' : '#fab21955'}`,
                borderRadius: 999,
                padding: '3px 10px',
              }}
            >
              {convergence.converged ? <Check size={12} /> : <AlertTriangle size={12} />}
              {convergence.converged ? 'Converged' : 'Not converged'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.55 }}>
              {convergence.note}
            </p>
            <dl style={{ margin: '10px 0 0', fontSize: 12, display: 'grid', gap: 5 }}>
              {[
                ['Seam carries', convergence.seam],
                ['Tail demands', convergence.demanded],
                ['Still missing', convergence.missing],
                ['Produced, unread', convergence.unused],
              ].map(([label, names]) => (
                <div key={label as string} style={{ display: 'flex', gap: 8 }}>
                  <dt style={{ color: 'var(--text-secondary)', minWidth: 108 }}>{label as string}</dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 11,
                      color: (names as string[]).length ? 'var(--text-primary)' : 'var(--text-secondary)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {(names as string[]).length ? (names as string[]).join(', ') : '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* frames */}
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={14} /> Frames
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.55 }}>
              One row per collapse. Append-only: a frame records how many outcomes were live at the instant before
              this one was picked, and the digest of what the bench became.
            </p>
            {!frames.length ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Nothing has collapsed yet.</div>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
                {frames
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((f) => (
                    <li
                      key={f.n}
                      style={{
                        display: 'flex',
                        gap: 8,
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border)',
                        paddingBottom: 4,
                      }}
                    >
                      <span style={{ color: 'var(--accent-light)' }}>#{f.n}</span>
                      <span>at {f.index + 1}</span>
                      <span>{f.outcomes} were live</span>
                      <code style={{ marginLeft: 'auto', fontSize: 10 }}>{f.digest.slice(0, 10)}</code>
                    </li>
                  ))}
              </ol>
            )}
          </div>

          {/* output */}
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>Fused</h2>
            <pre
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                fontSize: 11,
                maxHeight: 260,
                overflow: 'auto',
                margin: 0,
                whiteSpace: 'pre',
              }}
            >
              <code>{fused || '// nothing on the bench yet'}</code>
            </pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => copy('source', fused)}
                disabled={!fused}
                style={{
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  cursor: fused ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <ClipboardCopy size={12} /> {copied === 'source' ? 'Copied' : 'Copy source'}
              </button>
              <button
                type="button"
                onClick={() => copy('pair', JSON.stringify(annotate(assembly), null, 2))}
                disabled={!fused}
                style={{
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  cursor: fused ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <ClipboardCopy size={12} /> {copied === 'pair' ? 'Copied' : 'Copy training pair'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.55 }}>
              The training pair is the fused source plus a byte-exact span map: what every region is, what it needs,
              what it gives. No annotator traced those boundaries — the bisector cut them, so they are the ground
              truth by construction rather than by someone's best guess.
            </p>
            {digest && (
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 8 }}>
                SHA-256 of the fused source · <code>{digest.slice(0, 24)}…</code>
              </div>
            )}
          </div>

          {/* legend */}
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Brick kinds</h2>
            <div style={{ display: 'grid', gap: 5 }}>
              {KINDS.map((k) => (
                <div key={k.kind} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11 }}>
                  <span
                    aria-hidden
                    style={{ width: 8, height: 8, borderRadius: 2, background: KIND_HUE[k.kind], flexShrink: 0 }}
                  />
                  <span style={{ minWidth: 84, color: 'var(--text-primary)' }}>{k.label}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{k.note}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.55 }}>
              The bisector is JS/TS-shaped. It cannot tell a regular expression from a division in every case, and
              its scope reading over-reports free names on purpose — it would rather refuse a legal placement than
              accept an illegal one.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export const Route = createFileRoute('/forge')({ component: ForgePage })
