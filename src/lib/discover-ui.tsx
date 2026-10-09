/**
 * The Discover panel — the article, on the page.
 *
 * Shaped after an encyclopedia entry rather than a chat answer, because the two
 * teach different habits. A chat answer is a thing you read to the end; an
 * article is a thing you read part of and then leave through a link, which is
 * the behaviour this panel is built to produce.
 *
 * Four pieces, in order:
 *
 *   1. **The stepper.** ↑/↓ through the reads the engine made over the topic,
 *      the typed query first. It is the part that makes the article feel like an
 *      engine rather than a paragraph: you can see the six passes it took, step
 *      to any of them, and press it.
 *   2. **The article.** Sections that look like our result listings — because
 *      they are the same kind of object, a thing the index is showing you —
 *      each with an (×) that removes it.
 *   3. **The receipts.** Numbered references, each marked with where it came
 *      from: a row in this index, or a host asked a moment ago. Those two are
 *      never given the same label.
 *   4. **The stop.** The engine says it could go further and is not going to,
 *      then hands over the trail. This is the only part that is always
 *      rendered, no matter what failed above it.
 *
 * One thing deliberately has no (×): a reference. Sections are removable
 * because they are the engine's editorial choices and yours should win.
 * Suggestions are removable because they are guesses. A citation is neither —
 * it is the evidence for a claim that is still on the page, and a page where
 * you can delete the receipt and keep the claim is the exact failure mode an
 * agentic encyclopedia has to be built against.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  CornerDownRight,
  Globe,
  Layers,
  Loader2,
  MessageSquare,
  RotateCw,
  Users,
  X,
} from 'lucide-react'
import type { Citation, Discovery, DiscoverRead, SectionId } from './discover.js'

export type DiscoverMeta = {
  took_ms: number
  scanned: number
  corpus: number
  recovered: number
  recover_attempted: number
  prose: 'kernel' | 'model'
  screened_out: string[]
}

export type DiscoverPayload = {
  discovery?: Discovery
  meta?: DiscoverMeta
  refused?: boolean
  reasoning?: string
  error?: string
}

/* ------------------------------------------------------- inline rendering */

/**
 * Render the kernel's light markup: `**bold**`, `*italic*`, and `[n]` citation
 * markers that jump to the reference.
 *
 * Hand-rolled rather than pulled from a markdown library on purpose. The only
 * shapes that can appear here are the ones `discover.ts` writes, a full
 * markdown renderer would also accept whatever the model returned, and the
 * model's output is the one string on this page I do not want interpreted as
 * markup.
 */
function Inline({ text, cites }: { text: string; cites: Set<number> }) {
  const parts = useMemo(() => {
    const out: { kind: 'text' | 'bold' | 'italic' | 'cite'; value: string }[] = []
    const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[(\d{1,3})\]/g
    let at = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m.index > at) out.push({ kind: 'text', value: text.slice(at, m.index) })
      if (m[1] !== undefined) out.push({ kind: 'bold', value: m[1] })
      else if (m[2] !== undefined) out.push({ kind: 'italic', value: m[2] })
      else out.push({ kind: 'cite', value: m[3] })
      at = m.index + m[0].length
    }
    if (at < text.length) out.push({ kind: 'text', value: text.slice(at) })
    return out
  }, [text])

  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'bold') return <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.value}</strong>
        if (p.kind === 'italic') return <em key={i} style={{ color: 'var(--text-primary)', fontStyle: 'normal', fontWeight: 500 }}>{p.value}</em>
        if (p.kind === 'cite') {
          const n = Number(p.value)
          // A marker whose reference was never built points nowhere, so it is
          // rendered as plain text rather than as a link into empty space.
          if (!cites.has(n)) return <span key={i}>[{p.value}]</span>
          return (
            <a key={i} href={`#cvd-ref-${n}`} className="cvd-cite" aria-label={`Reference ${n}`}>
              [{n}]
            </a>
          )
        }
        return <span key={i}>{p.value}</span>
      })}
    </>
  )
}

function Prose({ text, cites }: { text: string; cites: Set<number> }) {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim())
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} className="cvd-p">
          <Inline text={p.trim()} cites={cites} />
        </p>
      ))}
    </>
  )
}

/* ---------------------------------------------------------- the stepper */

const ORIGIN_NOTE: Record<DiscoverRead['origin'], string> = {
  typed: 'as you typed it',
  'fan-out': 'a branch the scorer actually used',
  vocabulary: "the results' own vocabulary",
  corpus: 'derived from the corpus',
}

/**
 * ↑/↓ through the reads.
 *
 * Arrow keys work when the stepper has focus, because a control with two arrow
 * buttons that ignores the arrow keys is a control that lied about what it is.
 * It does not wrap: hitting the end and silently landing back at the start is
 * how you lose your place in a list you are stepping through deliberately.
 */
function ReadStepper({
  reads,
  at,
  onAt,
  onRun,
}: {
  reads: DiscoverRead[]
  at: number
  onAt: (next: number) => void
  onRun: (query: string) => void
}) {
  const read = reads[at]
  const first = at === 0
  const last = at === reads.length - 1

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && !first) { e.preventDefault(); onAt(at - 1) }
    if (e.key === 'ArrowDown' && !last) { e.preventDefault(); onAt(at + 1) }
  }

  if (!read) return null

  return (
    <div
      className="cvd-step"
      role="group"
      aria-label="The reads this article made over the topic"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="cvd-step-arrows">
        <button
          type="button"
          onClick={() => onAt(at - 1)}
          disabled={first}
          aria-label="Previous read"
          title={first ? 'This is the first read — the query as you typed it' : `Back to ${reads[at - 1].label}`}
        >
          <ChevronUp size={14} />
        </button>
        <span className="cvd-step-count" aria-hidden>
          {at + 1}/{reads.length}
        </span>
        <button
          type="button"
          onClick={() => onAt(at + 1)}
          disabled={last}
          aria-label="Next read"
          title={last ? 'This is the last read' : `On to ${reads[at + 1].label}`}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="cvd-step-body">
        <p className="cvd-step-label">
          Read {at + 1} of {reads.length} · {ORIGIN_NOTE[read.origin]}
          {read.weight > 0 && <span> · {read.weight}% of the score</span>}
        </p>
        {/* The query, quoted, exactly as it would be typed. Monospaced so a
            trailing operator or a stray comma is visible rather than smoothed
            away by the body face. */}
        <p className="cvd-step-query" aria-live="polite">
          {read.query.trim() ? `“${read.query}”` : '(an empty box)'}
        </p>
        <p className="cvd-step-note">{read.note}</p>
        <div className="cvd-step-foot">
          <span>
            {read.hits} {read.hits === 1 ? 'result' : 'results'} on this page
          </span>
          <button type="button" onClick={() => onRun(read.query)} disabled={!read.query.trim()}>
            <RotateCw size={11} /> Run this read
          </button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------- the references */

const KIND_ICON = {
  character: Users,
  thread: MessageSquare,
  external: Globe,
  host: Globe,
} as const

function RefRow({ c }: { c: Citation }) {
  const Icon = KIND_ICON[c.kind] || Layers
  const internal = c.url.startsWith('/')
  return (
    <li id={`cvd-ref-${c.n}`} className="cvd-ref">
      <span className="cvd-ref-n">{c.n}</span>
      <span className="cvd-ref-body">
        <span className="cvd-ref-head">
          <Icon size={11} />
          {internal ? (
            <a href={c.url}>{c.title}</a>
          ) : (
            <a href={c.url} target="_blank" rel="noopener noreferrer nofollow">{c.title}</a>
          )}
          <span className="cvd-ref-origin" data-origin={c.origin}>
            {c.origin === 'host' ? `the host itself · ${c.host}` : c.kind === 'external' ? `our index · ${c.host}` : 'our index'}
          </span>
        </span>
        <span className="cvd-ref-detail">{c.detail}</span>
      </span>
    </li>
  )
}

/* ------------------------------------------------------------- the panel */

export function DiscoverPanel({
  payload,
  loading,
  query,
  onRun,
  onClose,
}: {
  payload: DiscoverPayload | null
  loading: boolean
  query: string
  onRun: (q: string) => void
  onClose: () => void
}) {
  const [at, setAt] = useState(0)
  const [cutSections, setCutSections] = useState<SectionId[]>([])
  const [cutSuggestions, setCutSuggestions] = useState<string[]>([])
  const [refsOpen, setRefsOpen] = useState(false)
  const article = useRef<HTMLDivElement>(null)

  const discovery = payload?.discovery ?? null

  // A new article resets everything the reader had cut. Carrying "I do not want
  // the vocabulary section" across to a different topic would be applying a
  // judgement about one article to an article they have not read.
  const topic = discovery?.topic || ''
  useEffect(() => {
    setAt(0)
    setCutSections([])
    setCutSuggestions([])
  }, [topic])

  const cites = useMemo(
    () => new Set((discovery?.citations || []).map((c) => c.n)),
    [discovery],
  )

  const sections = useMemo(
    () => (discovery?.sections || []).filter((s) => !cutSections.includes(s.id)),
    [discovery, cutSections],
  )

  const suggestions = useMemo(
    () => (discovery?.seeAlso || []).filter((s) => !cutSuggestions.includes(s.query)),
    [discovery, cutSuggestions],
  )

  const step = useCallback(
    (next: number) => {
      const total = discovery?.reads.length || 0
      if (next < 0 || next >= total) return
      setAt(next)
    },
    [discovery],
  )

  if (loading && !discovery) {
    return (
      <section className="cvd" aria-busy="true">
        <header className="cvd-head">
          <Compass size={14} color="var(--accent-light)" />
          <span className="cvd-head-title">Discover</span>
          <span className="cvd-head-note">reading the index on “{query}”</span>
        </header>
        <div className="cvd-loading">
          <Loader2 size={14} className="cvd-spin" />
          <span>
            Running the same search, then asking up to four of the hosts it found what they say about
            themselves.
          </span>
        </div>
      </section>
    )
  }

  if (payload?.refused) {
    return (
      <section className="cvd">
        <header className="cvd-head">
          <Compass size={14} color="var(--accent-light)" />
          <span className="cvd-head-title">Discover</span>
        </header>
        <p className="cvd-note">SecurityClaw declined to write about that query. {payload.reasoning}</p>
      </section>
    )
  }

  if (!discovery) {
    return (
      <section className="cvd">
        <header className="cvd-head">
          <Compass size={14} color="var(--accent-light)" />
          <span className="cvd-head-title">Discover</span>
          <button type="button" onClick={onClose} className="cvd-x" aria-label="Close Discover">
            <X size={13} />
          </button>
        </header>
        <p className="cvd-note">
          {payload?.error || 'The Discover engine did not answer. The results below are unaffected — they came from a different request.'}
        </p>
      </section>
    )
  }

  const meta = payload?.meta
  const failed = discovery.recovered.filter((r) => !r.ok)

  return (
    <section className="cvd" aria-label={`Discover — ${discovery.topic}`}>
      <header className="cvd-head">
        <Compass size={14} color="var(--accent-light)" />
        <span className="cvd-head-title">Discover</span>
        <span className="cvd-head-note">
          the encyclopedia half · {discovery.written === 'model' ? 'written over the kernel’s drafts' : 'the kernel’s own drafts'}
          {meta ? ` · ${meta.took_ms}ms` : ''}
        </span>
        <button type="button" onClick={onClose} className="cvd-x" aria-label="Close Discover">
          <X size={13} />
        </button>
      </header>

      <div className="cvd-title-block">
        <h2 className="cvd-title">{discovery.topic}</h2>
        <p className="cvd-sub">{discovery.subtitle}</p>
      </div>

      <ReadStepper reads={discovery.reads} at={at} onAt={step} onRun={onRun} />

      {/* The infobox, the way the reference has one: the facts that are the same
          facts the chips and the explainer show, gathered rather than restated. */}
      <dl className="cvd-facts">
        {discovery.facts.map((f) => (
          <div key={f.k}>
            <dt>{f.k}</dt>
            <dd>{f.v}</dd>
          </div>
        ))}
      </dl>

      {sections.length > 1 && (
        <nav className="cvd-contents" aria-label="Contents">
          <span>Contents</span>
          {sections.map((s, i) => (
            <a key={s.id} href={`#cvd-sec-${s.id}`}>
              {i + 1}. {s.heading}
            </a>
          ))}
        </nav>
      )}

      <div ref={article} className="cvd-article">
        {sections.map((s) => (
          <article key={s.id} id={`cvd-sec-${s.id}`} className="cvd-sec">
            <div className="cvd-sec-head">
              <BookOpen size={11} />
              <h3 title={s.basis}>{s.heading}</h3>
              {s.prose && (
                <span className="cvd-sec-flag" title="A model rewrote the kernel's draft. It could not add a fact or drop a citation — both are checked before it is served.">
                  rewritten
                </span>
              )}
              <button
                type="button"
                onClick={() => setCutSections((c) => [...c, s.id])}
                aria-label={`Remove the section “${s.heading}”`}
                title="Not useful. Removed from this article — the sources stay, because the other sections still cite them."
                className="cvd-x"
              >
                <X size={12} />
              </button>
            </div>
            <Prose text={s.prose || s.draft} cites={cites} />
          </article>
        ))}

        {!sections.length && (
          <p className="cvd-note">
            Every section of this article has been removed. The references and the trail are below — or{' '}
            <button type="button" className="cvd-link" onClick={() => setCutSections([])}>
              put the article back
            </button>
            .
          </p>
        )}
      </div>

      {failed.length > 0 && (
        <p className="cvd-fail">
          {failed.length === 1 ? 'One host' : `${failed.length} hosts`} could not be quoted:{' '}
          {failed.map((r) => `${r.host} — ${r.note}`).join('; ')}. Those rows are described from our index instead.
        </p>
      )}

      {suggestions.length > 0 && (
        <section className="cvd-block">
          <h3>See also</h3>
          <div className="cvd-chips">
            {suggestions.map((s) => (
              <span key={s.query} className="cvd-chip">
                <button type="button" onClick={() => onRun(s.query)} title={s.why}>
                  {s.query}
                </button>
                <button
                  type="button"
                  onClick={() => setCutSuggestions((c) => [...c, s.query])}
                  aria-label={`Remove the suggestion “${s.query}”`}
                  title="Not interested. Removed from this article."
                  className="cvd-chip-x"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      {discovery.citations.length > 0 && (
        <section className="cvd-block">
          <button
            type="button"
            className="cvd-refs-toggle"
            onClick={() => setRefsOpen((v) => !v)}
            aria-expanded={refsOpen}
          >
            <h3>
              References <span>{discovery.citations.length}</span>
            </h3>
            <ChevronDown size={12} style={{ transform: refsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {refsOpen ? (
            <ol className="cvd-refs">
              {discovery.citations.map((c) => (
                <RefRow key={c.n} c={c} />
              ))}
            </ol>
          ) : (
            <p className="cvd-note" style={{ margin: 0 }}>
              {discovery.citations.filter((c) => c.origin === 'index').length} from this index,{' '}
              {discovery.citations.filter((c) => c.origin === 'host').length} recovered from the hosts themselves.
              Every [n] above is one of them.
            </p>
          )}
        </section>
      )}

      {/* The stop. Always rendered, whatever failed above it, because the one
          thing this engine must always manage to say is that it stopped on
          purpose and here is where to go instead. */}
      <footer className="cvd-stop">
        <p>{discovery.stop}</p>
        {discovery.trail.length > 0 && (
          <div className="cvd-trail">
            {discovery.trail.map((t) => (
              <button key={t} type="button" onClick={() => onRun(t)}>
                <CornerDownRight size={11} /> {t}
              </button>
            ))}
          </div>
        )}
      </footer>
    </section>
  )
}
