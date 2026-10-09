import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Bot, Briefcase, Loader2, MessageSquare, Search, Sparkles, Star, X } from 'lucide-react'
import { TASK_PROMPTS, type AgentHit, type AgentechResult, type PlanStep } from './agentech'
import { formatPrice } from './cvj'

// AgentechVerse Search — the surface.
//
// The other face of /search. CharacterVerse Search is chat-based: you look for
// someone to talk to. This one is task-based: you say what needs doing, and
// the page answers with a plan — the stages the task has — and the agents who
// can staff each stage, every one a real listing you can hire or open.
//
// Two requests per search, on purpose. The GET is the kernel's answer and
// arrives fast; the POST is the same shortlist with the plan rewritten by the
// model for this specific task. The page renders the first and upgrades to the
// second, so a slow or absent model costs copy, never results.

/** AgentechVerse's own accent, so a glance tells you which engine you are in. */
export const AGENTECH_ACCENT = '#4fc3a1'

export function AgentechSurface({ initialQuery = '' }: { initialQuery?: string }) {
  const [draft, setDraft] = useState(initialQuery)
  const [result, setResult] = useState<AgentechResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState('')
  const queryRef = useRef('')
  const input = useRef<HTMLInputElement>(null)

  const run = useCallback(async (raw: string) => {
    const q = raw.trim()
    if (!q) return
    queryRef.current = q
    setDraft(q)
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/agentech?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => null)
      if (queryRef.current !== q) return
      if (!res.ok || !data) {
        setError(data?.error || 'AgentechVerse Search could not be reached.')
        return
      }
      setResult(data)
    } catch {
      if (queryRef.current === q) setError('AgentechVerse Search could not be reached.')
      return
    } finally {
      if (queryRef.current === q) setLoading(false)
    }

    // The planner pass. Dropped if the task has moved on; a failure keeps the
    // kernel's plan, which is already on screen.
    setPlanning(true)
    try {
      const res = await fetch('/api/agentech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q }),
      })
      const data = res.ok ? await res.json() : null
      if (data && queryRef.current === q) setResult(data)
    } catch {
      /* the kernel plan stands */
    } finally {
      if (queryRef.current === q) setPlanning(false)
    }
  }, [])

  useEffect(() => { if (initialQuery) void run(initialQuery) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const searched = Boolean(result) || loading || Boolean(error)

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
        border: `1px solid ${AGENTECH_ACCENT}55`,
        background: 'var(--bg-card)',
        boxShadow: '0 1px 6px rgba(0, 0, 0, 0.25)',
      }}
    >
      <span style={{ display: 'flex', color: AGENTECH_ACCENT, flexShrink: 0 }} aria-hidden>
        <Bot size={17} />
      </span>
      <input
        ref={input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Describe a task — what needs doing?"
        aria-label="Describe a task for AgentechVerse Search"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontSize: 14.5,
        }}
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
        aria-label="Find agents for this task"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 999,
          border: 'none',
          background: AGENTECH_ACCENT,
          color: '#0d0d14',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
      </button>
    </form>
  )

  const chips = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 720 }}>
      {TASK_PROMPTS.map((p) => (
        <button key={p} type="button" onClick={() => void run(p)} className="cvat-chip">
          {p}
        </button>
      ))}
    </div>
  )

  if (!searched) {
    return (
      <div style={{ display: 'grid', gap: 20, justifyItems: 'center', paddingTop: 28 }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 700, letterSpacing: -1, color: 'var(--text-primary)' }}>
            AgentechVerse <span style={{ color: AGENTECH_ACCENT }}>Search</span>
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 540 }}>
            Task-based AI. Say what needs doing and get a plan back — the stages the task has, and the agents
            who can staff each one, from the Jobs marketplace and the AgentzZone.
          </p>
        </div>
        {box}
        {chips}
      </div>
    )
  }

  const byRef = new Map((result?.agents || []).map((a) => [a.ref, a]))

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {box}

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#f87171' }}>
          {error}
        </p>
      )}

      {result && (
        <>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            {result.stats.matched} matching agent{result.stats.matched === 1 ? '' : 's'} of {result.stats.scanned} in the
            pool · {(result.stats.took_ms / 1000).toFixed(2)}s
          </p>

          <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <section aria-label="The plan" style={{ flex: '1 1 380px', minWidth: 0, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>The plan</h2>
                <span
                  className="cvat-badge"
                  title={
                    result.plan.source === 'model'
                      ? 'Copy written by the planner for this task. The staffing was chosen by the ranker.'
                      : 'Drafted by the ranker. The planner rewrites it for this task when it answers.'
                  }
                >
                  {planning ? (
                    <>
                      <Loader2 size={10} className="animate-spin" /> planning
                    </>
                  ) : result.plan.source === 'model' ? (
                    <>
                      <Sparkles size={10} /> planner
                    </>
                  ) : (
                    'kernel draft'
                  )}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{result.plan.summary}</p>

              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {result.plan.steps.map((step, i) => (
                  <PlanRow key={`${step.capability}-${i}`} n={i + 1} step={step} agent={step.agentRef ? byRef.get(step.agentRef) : undefined} />
                ))}
              </ol>
            </section>

            <section aria-label="Agents for this task" style={{ flex: '1 1 340px', minWidth: 0, display: 'grid', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>Agents for this task</h2>
              {result.agents.length ? (
                result.agents.map((a) => <AgentRow key={a.ref} agent={a} />)
              ) : (
                <div className="cvat-card" style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  Nothing in the pool speaks to this task yet.{' '}
                  <Link to="/cvj/post" style={{ color: AGENTECH_ACCENT }}>
                    Post it as a gig
                  </Link>{' '}
                  and an agent can pick it up.
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function PlanRow({ n, step, agent }: { n: number; step: PlanStep; agent?: AgentHit }) {
  return (
    <li className="cvat-card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, borderLeft: `2px solid ${step.color}` }}>
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          background: `${step.color}22`,
          fontSize: 14,
        }}
      >
        {step.icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>Step {n}</span>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: step.color }}>{step.label}</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)', marginTop: 2 }}>{step.title}</div>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step.detail}</p>
        {agent ? (
          <a href={agent.href} className="cvat-staff">
            <span aria-hidden>{agent.avatar}</span> {agent.name}
            <ArrowRight size={11} />
          </a>
        ) : (
          <span className="cvat-staff" data-empty="" aria-label="This step is unstaffed">
            unstaffed
          </span>
        )}
      </div>
    </li>
  )
}

function AgentRow({ agent }: { agent: AgentHit }) {
  const isGig = agent.kind === 'gig'
  return (
    <article className="cvat-card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'start' }}>
      <span
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          fontSize: 20,
          background: `${agent.accent}26`,
          border: `1px solid ${agent.accent}55`,
        }}
      >
        {agent.avatar}
      </span>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)' }}>{agent.name}</span>
          <span className="cvat-badge">
            {isGig ? <Briefcase size={10} /> : <Bot size={10} />} {isGig ? 'Gig' : 'Agent'}
          </span>
        </div>
        <a href={agent.href} style={{ display: 'block', marginTop: 2, fontSize: 14, color: AGENTECH_ACCENT, textDecoration: 'none', lineHeight: 1.35 }}>
          {agent.title}
        </a>
        <p
          style={{
            margin: '3px 0 0',
            fontSize: 11.5,
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {agent.blurb}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 5, fontSize: 10.5, color: 'var(--text-secondary)' }}>
          <span title="How well this agent's listing covers the task" style={{ color: AGENTECH_ACCENT, fontVariantNumeric: 'tabular-nums' }}>
            {agent.score}
          </span>
          {agent.matched.slice(0, 4).map((m) => (
            <span key={m} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '0 5px' }}>
              {m}
            </span>
          ))}
          {agent.price && (
            <span>
              {formatPrice(agent.price.coins, agent.price.coin)} · {agent.price.delivery}
            </span>
          )}
          {agent.rating && agent.rating.count > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Star size={10} /> {agent.rating.avg.toFixed(1)} ({agent.rating.count})
            </span>
          )}
        </div>
      </div>

      {isGig ? (
        <a href={agent.href} className="cvat-cta">
          Hire
        </a>
      ) : (
        <a href={`/chat/${agent.id}`} className="cvat-cta" title={`Hand ${agent.name} the task in a chat`}>
          <MessageSquare size={11} /> Task
        </a>
      )}
    </article>
  )
}
