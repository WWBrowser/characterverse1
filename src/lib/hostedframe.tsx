import { useCallback, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  HelpCircle,
  Layers,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { FRAMES, FRAME_FEATURES, coerceFrame, type FrameFeature, type FrameId } from './searchindex'
import type { EmbedCheck, EmbedVerdict } from './frameprobe'

// Hosting somebody else's AI chat — the form, the test, and the verdict.
//
// Lives here rather than in either page because two surfaces need exactly this
// and they need it to behave identically: the character creator, where a maker
// attaches the chat they host elsewhere to the character they just built, and
// the index's own add page. If they diverged, one of them would eventually let a
// publisher claim inframe without the host agreeing, which is the one thing this
// component exists to prevent.
//
// The order of the form is the argument. The URL comes first and the frame
// choice is disabled until it has been tested, because the frame is not really a
// preference — it is a fact about the host, and the only honest way to fill that
// field in is to go and ask.

/* ------------------------------------------------------------ verdict card */

const VERDICT_LOOK: Record<EmbedVerdict, { tone: string; bg: string; icon: typeof ShieldCheck; label: string }> = {
  embeddable: { tone: '#34d399', bg: 'rgba(52,211,153,0.1)', icon: ShieldCheck, label: 'Embeddable' },
  blocked: { tone: '#fca5a5', bg: 'rgba(248,113,113,0.1)', icon: ShieldAlert, label: 'Refuses framing' },
  unknown: { tone: '#fcd34d', bg: 'rgba(251,191,36,0.1)', icon: HelpCircle, label: 'Unsettled' },
  unreachable: { tone: '#fcd34d', bg: 'rgba(251,191,36,0.1)', icon: AlertTriangle, label: 'No answer' },
  refused: { tone: '#fca5a5', bg: 'rgba(248,113,113,0.1)', icon: ShieldAlert, label: 'Not probed' },
}

/**
 * What the host said, and what it means for the entry.
 *
 * The quoted headers are shown rather than summarised. A publisher told "this
 * cannot be embedded" with no evidence has to either believe us or go and
 * re-derive it themselves, and the whole verdict rests on two header values that
 * fit on one line.
 */
export function EmbedVerdictCard({ check }: { check: EmbedCheck }) {
  const look = VERDICT_LOOK[check.verdict] || VERDICT_LOOK.unknown
  const Icon = look.icon
  return (
    <div
      style={{
        border: `1px solid ${look.tone}44`,
        background: look.bg,
        borderRadius: 12,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem' }}>
        <Icon size={15} color={look.tone} />
        <strong style={{ fontSize: '0.85rem', color: look.tone }}>{look.label}</strong>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '0.68rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'var(--text-secondary)',
          }}
        >
          → {check.frame === 'inframe' ? 'iframe tab' : 'oframe hand-off'}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{check.reason}</p>
      {check.detail && (
        <pre
          style={{
            margin: '0.6rem 0 0',
            padding: '0.5rem 0.6rem',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.28)',
            color: 'var(--text-secondary)',
            fontSize: '0.68rem',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowX: 'auto',
          }}
        >
          {check.detail}
        </pre>
      )}
      {(check.status > 0 || check.hops > 0) && (
        <div style={{ marginTop: '0.45rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
          HTTP {check.status || '—'}
          {check.hops > 0 && ` · ${check.hops} redirect${check.hops > 1 ? 's' : ''} followed`}
          {check.finalUrl && ` · judged ${check.finalUrl.slice(0, 70)}`}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- the probe */

/**
 * Run the embeddability probe.
 *
 * The check is never computed in the browser. A page cannot read another
 * origin's response headers — that is the same-origin policy working correctly —
 * and the trick of "load it in a hidden iframe and see if onload fires" is what
 * the workspace already falls back to, with a six-second wait and no way to tell
 * a refusal from a slow server. Asking our own server to fetch the headers is
 * the only way to get a real answer, so the probe is a round trip.
 */
export function useFrameProbe(sessionId: string) {
  const [check, setCheck] = useState<EmbedCheck | null>(null)
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(
    async (url: string, entryId?: number | null): Promise<EmbedCheck | null> => {
      if (!url.trim()) {
        setError('Paste the hosted chat URL first.')
        return null
      }
      setProbing(true)
      setError('')
      try {
        const res = await fetch('/api/frameprobe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, url: url.trim(), frame: 'inframe', entryId: entryId || undefined }),
        })
        const data = await res.json()
        if (!res.ok || !data.check) {
          setError(data.error || 'The probe could not run.')
          return null
        }
        setCheck(data.check as EmbedCheck)
        return data.check as EmbedCheck
      } catch {
        setError('The probe could not run — check the connection and try again.')
        return null
      } finally {
        setProbing(false)
      }
    },
    [sessionId],
  )

  const reset = useCallback(() => {
    setCheck(null)
    setError('')
  }, [])

  return { check, probing, error, run, reset }
}

/* --------------------------------------------------------------- the draft */

export type HostedDraft = {
  url: string
  name: string
  tagline: string
  description: string
  frame: FrameId
  category: string
  icon: string
  tags: string
  permissions: FrameFeature[]
}

export const EMPTY_HOSTED: HostedDraft = {
  url: '',
  name: '',
  tagline: '',
  description: '',
  // Defaults to the frame that always works. Inframe is something a host earns
  // by answering the probe, not the starting position.
  frame: 'oframe',
  category: 'Assistant',
  icon: '🛰️',
  tags: '',
  permissions: [],
}

/** Is there anything here worth publishing? Both fields the index needs. */
export function hostedFilled(d: HostedDraft): boolean {
  return Boolean(d.url.trim() && d.name.trim())
}

/**
 * Publish a hosted draft into the index.
 *
 * Goes through the same POST /api/search every other publisher uses, rather than
 * a private path from the creator — so it is rate limited, manifest-validated,
 * SecurityClaw-screened and re-probed server-side exactly like an anonymous
 * registration. A creator publishing from inside our own form is still a
 * stranger's URL arriving at our index.
 */
export async function publishHosted(input: {
  draft: HostedDraft
  sessionId: string
  characterId?: number | null
}): Promise<{ ok: boolean; error?: string; demoted?: string | null; entryId?: number }> {
  const { draft, sessionId, characterId } = input
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        sessionId,
        characterId: characterId || undefined,
        manifest: {
          name: draft.name,
          tagline: draft.tagline,
          description: draft.description,
          url: draft.url,
          frame: draft.frame,
          category: draft.category,
          icon: draft.icon,
          tags: draft.tags,
          permissions: draft.permissions,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || 'Could not publish that entry.' }
    return { ok: true, demoted: data.demoted ?? null, entryId: data.entry?.id }
  } catch {
    return { ok: false, error: 'Could not reach the index.' }
  }
}

/* ---------------------------------------------------------------- the panel */

const FIELD: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '0.7rem 0.9rem',
  color: 'var(--text-primary)',
  fontSize: '0.88rem',
  outline: 'none',
}

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: '0.4rem',
}

export function HostedFramePanel({
  draft,
  onChange,
  sessionId,
  categories,
}: {
  draft: HostedDraft
  onChange: (next: HostedDraft) => void
  sessionId: string
  categories?: readonly string[]
}) {
  const { check, probing, error, run, reset } = useFrameProbe(sessionId)
  const set = <K extends keyof HostedDraft>(key: K, value: HostedDraft[K]) => onChange({ ...draft, [key]: value })

  // The heart of it. The probe's answer sets the frame — a publisher does not get
  // to overrule a host that said no, because the browser will not honour the
  // overrule either. A yes only unlocks the choice; it does not force it.
  const test = async () => {
    const result = await run(draft.url)
    if (!result) return
    onChange({
      ...draft,
      frame: result.frame,
      name: draft.name || hostLabel(draft.url),
    })
  }

  const canInframe = check?.verdict === 'embeddable'
  const untested = !check

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <Globe size={16} color="var(--accent-light)" />
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          Host it somewhere else
        </h2>
      </div>
      <p style={{ margin: '0 0 1.1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        If this character&apos;s chat runs on your own site — a Netlify or Vercel app, a chatbot builder,
        anything with a public URL — put the link in and it joins{' '}
        <strong style={{ color: 'var(--text-primary)' }}>CharacterVerse Search</strong>: one index, internal
        characters and external systems side by side. We host the search, you keep hosting the chat.
      </p>

      <label style={LABEL}>Hosted chat URL</label>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input
          value={draft.url}
          onChange={(e) => {
            set('url', e.target.value)
            // A verdict belongs to a URL. Editing the URL throws the verdict
            // away rather than letting a stale "embeddable" ride along to a
            // different host.
            if (check) reset()
          }}
          placeholder="https://your-app.netlify.app/chat/9"
          style={{ ...FIELD, flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}
          maxLength={500}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={test}
          disabled={probing || !draft.url.trim()}
          style={{
            padding: '0.7rem 1rem',
            borderRadius: 10,
            border: '1px solid var(--accent)',
            background: probing ? 'var(--bg-hover)' : 'rgba(124,92,191,0.2)',
            color: 'var(--accent-light)',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: probing || !draft.url.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          {probing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {probing ? 'Testing…' : 'Test embedding'}
        </button>
      </div>
      <p style={{ margin: '0 0 0.9rem', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        We fetch the URL and read two headers — <code>X-Frame-Options</code> and the CSP{' '}
        <code>frame-ancestors</code> rule. They are the entire mechanism by which a site refuses to be put in
        a frame, and most AI chats use one of them. Nothing about the page itself is read or stored.
      </p>

      {error && (
        <div
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: 10,
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            color: '#fca5a5',
            fontSize: '0.8rem',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {check && <EmbedVerdictCard check={check} />}

      {/* ---------------------------------------------------------- frames */}
      <label style={LABEL}>How the tab opens</label>
      <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1.1rem' }}>
        {(['inframe', 'oframe'] as FrameId[]).map((id) => {
          const f = FRAMES[id]
          const locked = id === 'inframe' && !canInframe
          const active = draft.frame === id
          return (
            <button
              key={id}
              type="button"
              disabled={locked}
              onClick={() => set('frame', id)}
              style={{
                textAlign: 'left',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.5 : 1,
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'rgba(124,92,191,0.16)' : 'var(--bg-hover)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.3rem' }}>
                {id === 'inframe' ? <Layers size={14} color="var(--accent-light)" /> : <ExternalLink size={14} color="var(--accent-light)" />}
                <strong style={{ fontSize: '0.87rem', color: 'var(--text-primary)' }}>
                  ({id === 'inframe' ? 'iframe' : 'oframe'}) {f.label}
                </strong>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: 'var(--accent-light)',
                  }}
                >
                  {f.verb}
                </span>
                {active && <CheckCircle2 size={13} color="#34d399" style={{ marginLeft: 'auto' }} />}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {f.behaviour}
              </div>
              {locked && (
                <div style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: '#fcd34d', lineHeight: 1.55 }}>
                  {untested
                    ? 'Test the URL first. An embedded tab is only offered once the host has said it allows framing.'
                    : `Not available for this URL — ${check?.reason}`}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ----------------------------------------------------- permissions */}
      {draft.frame === 'inframe' && (
        <>
          <label style={LABEL}>What the frame may ask for</label>
          <p style={{ margin: '-0.1rem 0 0.55rem', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Declare only what it genuinely needs. Ticking a box does not grant anything: the person using
            it turns each one on from the frame&apos;s own header bar, and their browser still asks. Anything
            not declared here is denied outright, which is why the list is short.
          </p>
          <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '1.1rem' }}>
            {FRAME_FEATURES.map((feat) => {
              const on = draft.permissions.includes(feat.id)
              return (
                <label
                  key={feat.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.55rem',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 10,
                    border: '1px solid',
                    borderColor: on ? 'var(--accent)' : 'var(--border)',
                    background: on ? 'rgba(124,92,191,0.12)' : 'var(--bg-hover)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      set(
                        'permissions',
                        e.target.checked
                          ? [...draft.permissions, feat.id]
                          : draft.permissions.filter((p) => p !== feat.id),
                      )
                    }
                    style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {feat.label}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      {feat.why}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </>
      )}

      {/* ---------------------------------------------------------- listing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
        <div>
          <label style={LABEL}>Listing name</label>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="What the result is titled"
            style={FIELD}
            maxLength={80}
          />
        </div>
        <div>
          <label style={LABEL}>Category</label>
          <select value={draft.category} onChange={(e) => set('category', e.target.value)} style={FIELD}>
            {(categories || ['Assistant', 'Roleplay', 'Workbench', 'Reference', 'Directory', 'Tutor', 'Agent']).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label style={LABEL}>Tagline</label>
      <input
        value={draft.tagline}
        onChange={(e) => set('tagline', e.target.value)}
        placeholder="The one line under the title"
        style={{ ...FIELD, marginBottom: '0.9rem' }}
        maxLength={140}
      />

      <label style={LABEL}>What it is</label>
      <textarea
        value={draft.description}
        onChange={(e) => set('description', e.target.value)}
        placeholder="What it does, who it is for, what it is good at. This is the indexed text — it is what queries match against."
        style={{ ...FIELD, minHeight: 90, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, marginBottom: '0.9rem' }}
        maxLength={1200}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 4fr', gap: '0.75rem' }}>
        <div>
          <label style={LABEL}>Icon</label>
          <input
            value={draft.icon}
            onChange={(e) => set('icon', e.target.value)}
            placeholder="🛰️"
            style={{ ...FIELD, textAlign: 'center' }}
            maxLength={8}
          />
        </div>
        <div>
          <label style={LABEL}>Tags</label>
          <input
            value={draft.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="roleplay, voice, open source"
            style={FIELD}
            maxLength={240}
          />
        </div>
      </div>
    </div>
  )
}

/** A default listing name, so a tested URL is one click from publishable. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Re-exported so pages can render a frame's own words without a second import. */
export { FRAMES, coerceFrame }
