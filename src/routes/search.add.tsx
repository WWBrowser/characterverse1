import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Megaphone,
  Plus,
  ShieldCheck,
  Sprout,
  Trash2,
} from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import {
  FRAMES,
  FRAME_FEATURES,
  MANIFEST_LIMITS,
  SPONSOR_DAYS,
  SPONSOR_RULES,
  readManifest,
  sponsorPrice,
  type FrameFeature,
  type FrameId,
} from '../lib/searchindex'
import { CVC, formatCoins } from '../lib/coins'
import { EmbedVerdictCard, useFrameProbe } from '../lib/hostedframe'
import type { IndexEntry } from '../lib/search-ui'

// /search/add — publish into the index.
//
// This is the page the whole feature is really about. An AI system hosted
// somewhere else gets added here, and the one decision that matters is the frame:
//
//   inframe  — it renders inside a workspace tab. Sandboxed, beside your chats.
//              Opening it DIRECTS.
//   oframe   — the browser goes to it. Nothing is embedded, the session
//              continues on their host. Opening it REDIRECTS.
//
// The form validates with the same `readManifest` the endpoint uses, imported
// from the kernel rather than reimplemented, so the preview is not a guess at
// what the server will accept — it is what the server will accept.
//
// Underneath, the publisher's own entries with their measured demand. That is
// the point of publishing here rather than into a directory: you find out
// whether anyone wanted it.

export const Route = createFileRoute('/search/add')({ component: AddToIndexPage })

const CATEGORIES = [
  'Assistant',
  'Reasoning',
  'Coding',
  'Research',
  'Roleplay',
  'Image',
  'Voice',
  'Agent',
  'Reference',
  'Playground',
]

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
}

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

function AddToIndexPage() {
  const [sessionId, setSessionId] = useState('')
  const [frame, setFrame] = useState<FrameId>('oframe')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [provider, setProvider] = useState('')
  const [icon, setIcon] = useState('🛰️')
  const [category, setCategory] = useState('Assistant')
  const [tags, setTags] = useState('')
  const [vibes, setVibes] = useState('')
  const [permissions, setPermissions] = useState<FrameFeature[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [entries, setEntries] = useState<IndexEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [detail, setDetail] = useState<Record<number, { query: string; count: number }[]>>({})
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => { setSessionId(getSessionId()) }, [])

  const load = useCallback(() => {
    if (!sessionId) return
    fetch(`/api/search?entries=1&sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEntries(Array.isArray(d?.entries) ? d.entries : []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const draft = useMemo(
    () => ({ name, tagline, description, url, frame, provider, icon, category, tags, vibes, permissions }),
    [name, tagline, description, url, frame, provider, icon, category, tags, vibes, permissions],
  )

  // The embeddability probe, shared with the character creator's hosting panel.
  // Same endpoint, same verdict card, same rule about what a verdict unlocks.
  const probe = useFrameProbe(sessionId)
  // Verdicts belong to URLs. Editing the URL after a test discards the result,
  // so an 'embeddable' answer can never be carried over to a different host.
  const onUrlChange = (next: string) => {
    setUrl(next)
    if (probe.check) probe.reset()
  }
  const testUrl = async () => {
    const result = await probe.run(url)
    if (result) setFrame(result.frame)
  }
  // Re-testing an entry already published. Its own probe instance, so a verdict
  // about a published row never lands in the card above the form — those are
  // answers about two different URLs and showing one for the other would be a
  // lie in the most load-bearing place on the page. The verdict is written to
  // the row and the frame moves with it, which is the one way an entry's frame
  // changes without being re-registered.
  const entryProbe = useFrameProbe(sessionId)
  const [retesting, setRetesting] = useState(0)
  const [retestNote, setRetestNote] = useState<Record<number, string>>({})
  const retest = async (id: number, entryUrl: string) => {
    setRetesting(id)
    const result = await entryProbe.run(entryUrl, id)
    setRetesting(0)
    setRetestNote((n) => ({ ...n, [id]: result ? result.reason : 'The probe could not run just now.' }))
    load()
  }

  /* Sponsorship — the advertiser's half of the slot above the organic results.
   *
   * It lives here rather than on a separate advertising page on purpose: the
   * only person allowed to promote an entry is the person who published it, and
   * this is already the page where they manage what they published. A separate
   * page would need its own ownership check, and a second copy of an ownership
   * check is how one of them ends up wrong.
   *
   * The panel states the price, the balance and the rules before the button,
   * because a charge is not a place for a surprise. */
  const [promoFor, setPromoFor] = useState(0)
  const [promoting, setPromoting] = useState(0)
  const [promoDays, setPromoDays] = useState<Record<number, number>>({})
  const [promoNote, setPromoNote] = useState<Record<number, string>>({})
  const [promoMsg, setPromoMsg] = useState<Record<number, string>>({})
  const [cvcMilli, setCvcMilli] = useState<number | null>(null)

  const loadBalance = useCallback(() => {
    if (!sessionId) return
    fetch(`/api/coins?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      // null, not 0, when the ledger cannot be read: a zero would read as
      // "you have nothing" rather than "we could not find out".
      .then((d) => setCvcMilli(d?.balances ? Number(d.balances.cvc) || 0 : null))
      .catch(() => setCvcMilli(null))
  }, [sessionId])

  useEffect(() => { loadBalance() }, [loadBalance])

  const promote = async (id: number) => {
    const days = promoDays[id] ?? SPONSOR_DAYS[0]
    setPromoting(id)
    setPromoMsg((m) => ({ ...m, [id]: '' }))
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'sponsor', id, days, note: promoNote[id] || '' }),
      })
      const data = await res.json().catch(() => null)
      // The confirmation quotes the server's numbers, not the ones this page
      // guessed before asking. If the two ever disagree, the ledger is right.
      setPromoMsg((m) => ({
        ...m,
        [id]: res.ok
          ? `Placed. ${formatCoins(Number(data?.spentMilli) || sponsorPrice(days))} ${CVC.symbol} charged${
              data?.sponsoredUntil ? `, running until ${new Date(data.sponsoredUntil).toLocaleString()}` : ''
            }.`
          : data?.error || 'That did not go through, and nothing was charged.',
      }))
    } catch {
      setPromoMsg((m) => ({ ...m, [id]: 'The index could not be reached, so nothing was charged.' }))
    }
    setPromoting(0)
    load()
    loadBalance()
  }

  const endPromo = async (id: number) => {
    setPromoting(id)
    await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, action: 'unsponsor', id }),
    }).catch(() => {})
    setPromoting(0)
    setPromoMsg((m) => ({ ...m, [id]: 'Placement ended. The days already paid for are not refunded.' }))
    load()
  }

  // The same validator the endpoint runs. A preview that disagreed with the
  // server would be worse than no preview.
  const read = useMemo(() => readManifest(draft), [draft])
  const mine = entries.filter((e) => e.mine)

  const submit = async () => {
    setError('')
    setDone('')
    if (!read.ok) { setError(read.error); return }
    setBusy(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'register', manifest: read.manifest }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'That entry could not be published.')
        return
      }
      setDone(
        data?.created
          ? `${read.manifest.name} is in the index. It will start collecting impressions on the next search that matches it.`
          : `${read.manifest.name} was already in the index at that URL and frame, so the existing entry was updated. Its demand history was kept.`,
      )
      setName('')
      setUrl('')
      setTagline('')
      setDescription('')
      setTags('')
      setVibes('')
      setPermissions([])
      probe.reset()
      load()
    } catch {
      setError('The index did not answer. Nothing was published.')
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: number, action: 'mute' | 'unmute' | 'remove') => {
    await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, action, id }),
    }).catch(() => {})
    load()
  }

  const seed = async () => {
    setBusy(true)
    await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, action: 'seed' }),
    }).catch(() => {})
    setBusy(false)
    load()
  }

  const openDetail = async (id: number) => {
    if (detail[id]) { setDetail((d) => { const n = { ...d }; delete n[id]; return n }) ; return }
    const res = await fetch(`/api/search?entry=${id}`).catch(() => null)
    const data = res && res.ok ? await res.json().catch(() => null) : null
    setDetail((d) => ({ ...d, [id]: Array.isArray(data?.queries) ? data.queries : [] }))
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '22px 20px 60px', display: 'grid', gap: 26 }}>
      <header>
        <Link
          to="/search"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} /> CharacterVerse Search
        </Link>
        <h1 style={{ margin: '12px 0 0', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
          Add a character or AI system
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 660 }}>
          Anything reachable over https can go into this index, whether or not we host it. Characters
          made here are indexed automatically from their own pages — this form is for the systems that
          live somewhere else. Pick how it should attach and the index does the rest.
        </p>
      </header>

      {/* The frame choice, first, because it changes what everything below means. */}
      <section>
        <span style={LABEL}>How should it attach?</span>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(286px, 1fr))' }}>
          {(['inframe', 'oframe'] as const).map((id) => {
            const f = FRAMES[id]
            const active = frame === id
            // Inframe is not a preference, it is a permission the host grants by
            // answering the probe. Until it has answered 'embeddable' the card is
            // closed, because picking it earlier would only produce an entry the
            // register endpoint demotes a moment later.
            const locked = id === 'inframe' && probe.check?.verdict !== 'embeddable'
            return (
              <button
                key={id}
                onClick={() => { if (!locked) setFrame(id) }}
                aria-pressed={active}
                aria-disabled={locked}
                title={
                  locked
                    ? probe.check
                      ? probe.check.reason
                      : 'Test the URL below first — only the host can grant this.'
                    : f.behaviour
                }
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 11,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(124, 92, 255, 0.07)' : 'var(--bg-card)',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.55 : 1,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {id === 'inframe' ? <Layers size={14} color="var(--accent-light)" /> : <ExternalLink size={14} color="var(--text-secondary)" />}
                  <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)' }}>
                    ({id === 'inframe' ? 'iframe' : 'oframe'}) {f.label}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 0.6,
                      color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                    }}
                  >
                    {f.verb}
                  </span>
                  {active && <Check size={13} color="var(--accent-light)" />}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.7 }}>
                  {f.behaviour}
                </span>
                {locked && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--accent-light)', marginTop: 8, lineHeight: 1.6 }}>
                    {probe.check
                      ? `Unavailable for this URL — ${probe.check.reason}`
                      : 'Locked until the URL below has been tested.'}
                  </span>
                )}
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6, fontStyle: 'italic' }}>
                  {id === 'inframe'
                    ? 'Internal, sandboxed context: the system runs inside a boundary and only reaches the rest of the workspace through a controlled channel. This is the setting for a third-party agent you have no reason to trust yet.'
                    : 'Out-of-frame, shared pipeline: an open hand-off with no boundary in the way. This is the setting for multi-agent collaboration and shared indexes — and the only setting that works for hosts that refuse to be embedded at all.'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* The manifest. */}
      <section style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <label style={LABEL} htmlFor="cv-name">Name</label>
            <input
              id="cv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MANIFEST_LIMITS.name}
              placeholder="Google Gemini"
              style={FIELD}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="cv-url">URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="cv-url"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                maxLength={MANIFEST_LIMITS.url}
                placeholder="https://gemini.google.com/app"
                style={{ ...FIELD, flex: 1 }}
                spellCheck={false}
              />
              <button
                type="button"
                onClick={testUrl}
                disabled={probe.probing || !url.trim()}
                title="Fetch the URL and read its framing headers"
                style={{
                  padding: '0 12px',
                  borderRadius: 9,
                  border: '1px solid var(--accent)',
                  background: 'rgba(124, 92, 255, 0.12)',
                  color: 'var(--accent-light)',
                  fontSize: 12,
                  fontWeight: 650,
                  whiteSpace: 'nowrap',
                  cursor: probe.probing || !url.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {probe.probing ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                {probe.probing ? 'Testing' : 'Test'}
              </button>
            </div>
          </div>
        </div>

        {/* What the host said about being framed. Shown here rather than up by
            the frame cards because it is a fact about the URL, and the URL is
            the field it belongs to. */}
        {probe.error && (
          <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', lineHeight: 1.7 }}>{probe.error}</p>
        )}
        {probe.check && <EmbedVerdictCard check={probe.check} />}

        {/* Declared features, for an embedded entry only. An oframe hand-off has
            no frame to delegate into — once the browser has left, the host asks
            for what it needs on its own terms. */}
        {frame === 'inframe' && (
          <div>
            <span style={LABEL}>What the frame may ask the browser for</span>
            <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              A declaration, not a grant. Whoever opens the tab turns these on one at a time, and their
              browser still asks before handing anything over. Undeclared features are denied outright.
            </p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {FRAME_FEATURES.map((feat) => {
                const on = permissions.includes(feat.id)
                return (
                  <button
                    key={feat.id}
                    type="button"
                    title={feat.why}
                    onClick={() =>
                      setPermissions((prev) =>
                        on ? prev.filter((p) => p !== feat.id) : [...prev, feat.id],
                      )
                    }
                    style={{
                      padding: '5px 11px',
                      borderRadius: 999,
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'rgba(124, 92, 255, 0.12)' : 'var(--bg-card)',
                      color: on ? 'var(--accent-light)' : 'var(--text-secondary)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {on ? '✓ ' : ''}
                    {feat.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <label style={LABEL} htmlFor="cv-tagline">Tagline</label>
          <input
            id="cv-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={MANIFEST_LIMITS.tagline}
            placeholder="Chat with Google Gemini"
            style={FIELD}
          />
        </div>

        <div>
          <label style={LABEL} htmlFor="cv-desc">
            Description — this is the text the index actually searches
          </label>
          <textarea
            id="cv-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MANIFEST_LIMITS.description}
            rows={4}
            placeholder="What it is, what it is good at, and what somebody would type to look for it. Plain sentences rank better here than keyword lists, because the ranker reads term frequency against the whole index."
            style={{ ...FIELD, resize: 'vertical', lineHeight: 1.6 }}
          />
          <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
            {description.length} / {MANIFEST_LIMITS.description}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div>
            <label style={LABEL} htmlFor="cv-provider">Provider</label>
            <input id="cv-provider" value={provider} onChange={(e) => setProvider(e.target.value)} maxLength={MANIFEST_LIMITS.provider} placeholder="Google" style={FIELD} />
          </div>
          <div>
            <label style={LABEL} htmlFor="cv-icon">Icon</label>
            <input id="cv-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={MANIFEST_LIMITS.icon} placeholder="✦" style={FIELD} />
          </div>
          <div>
            <label style={LABEL} htmlFor="cv-cat">Category</label>
            <select id="cv-cat" value={category} onChange={(e) => setCategory(e.target.value)} style={FIELD}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <label style={LABEL} htmlFor="cv-tags">Tags — comma separated</label>
            <input id="cv-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="multimodal, long context, free tier" style={FIELD} />
          </div>
          <div>
            <label style={LABEL} htmlFor="cv-vibes">Vibes — comma separated</label>
            <input id="cv-vibes" value={vibes} onChange={(e) => setVibes(e.target.value)} placeholder="tactical, give me a problem" style={FIELD} />
          </div>
        </div>

        {error && (
          <p style={{ margin: 0, fontSize: 12.5, color: '#ff8f8f', lineHeight: 1.6 }}>{error}</p>
        )}
        {done && (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--accent-light)', lineHeight: 1.6 }}>{done}</p>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={submit}
            disabled={busy || !read.ok || !sessionId}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 15px',
              borderRadius: 8,
              border: 'none',
              background: read.ok && !busy ? 'var(--accent)' : 'var(--bg-hover)',
              color: read.ok && !busy ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: read.ok && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Publish to the index
          </button>

          <button
            onClick={() => setShowPreview((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 13px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            <ChevronDown size={12} style={{ transform: showPreview ? 'rotate(180deg)' : 'none' }} />
            ChatManifest.json
          </button>

          {!read.ok && (name || url) && (
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{read.error}</span>
          )}
        </div>

        {showPreview && (
          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              overflowX: 'auto',
              lineHeight: 1.6,
            }}
          >
{read.ok ? JSON.stringify(read.manifest, null, 2) : `// not yet publishable\n// ${read.error}`}
          </pre>
        )}

        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          This exact document is what <code style={{ color: 'var(--accent-light)' }}>POST /v1/index/register</code> takes,
          and the endpoint on this deployment is <code style={{ color: 'var(--accent-light)' }}>POST /api/search</code> with{' '}
          <code>{'{ action: "register", manifest }'}</code>. Reads are open cross-origin, so another node can query this
          index without asking us first — that is what makes it a protocol rather than a page.
        </p>
      </section>

      {/* What this publisher has in the index, and whether anyone wanted it. */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>Your entries</h2>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
            {mine.length} published · demand measured since they went in
          </span>
          {loaded && entries.length === 0 && (
            <button
              onClick={seed}
              disabled={busy}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 11px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              <Sprout size={12} /> Seed the starter systems
            </button>
          )}
        </div>

        {mine.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            You have not published anything yet.
            {loaded && entries.length === 0
              ? ' The index is completely empty — seeding it adds Gemini, AI Studio, Hugging Face Spaces and one deliberately embeddable reference page to test the inframe path against.'
              : ` ${entries.length} ${entries.length === 1 ? 'entry is' : 'entries are'} already in the index from other publishers.`}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 9 }}>
            {mine.map((e) => {
              const queries = detail[e.id]
              return (
                <div
                  key={e.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    opacity: e.status === 'live' ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17 }} aria-hidden>{e.icon}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{e.name}</span>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: `1px solid ${e.frame === 'inframe' ? 'var(--accent)' : 'var(--border)'}`,
                        color: e.frame === 'inframe' ? 'var(--accent-light)' : 'var(--text-secondary)',
                      }}
                    >
                      {FRAMES[e.frame].label} · {FRAMES[e.frame].verb}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.host}</span>
                    {e.status !== 'live' && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>muted</span>
                    )}
                    {e.sponsored && (
                      <span
                        title={`Placed above the organic results until ${new Date(e.sponsoredUntil!).toLocaleString()}`}
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 0.6,
                          padding: '1px 6px',
                          borderRadius: 4,
                          border: '1px solid var(--warn, #d8a24a)',
                          color: 'var(--warn, #d8a24a)',
                        }}
                      >
                        sponsored
                      </span>
                    )}

                    {/* Promote. Opens the panel below rather than charging on the
                        spot: the price, the balance and the rules belong in front
                        of the reader before the button that spends their coins. */}
                    <button
                      onClick={() => setPromoFor((v) => (v === e.id ? 0 : e.id))}
                      title="Promote this entry into the sponsored slot above the results"
                      aria-expanded={promoFor === e.id}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: e.sponsored ? 'var(--warn, #d8a24a)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
                    >
                      <Megaphone size={13} />
                    </button>

                    {/* Re-test. A host's framing policy is theirs to change, and a
                        verdict read six months ago is only a claim about six
                        months ago. This re-reads the headers and moves the entry's
                        frame if the answer has changed. */}
                    <button
                      onClick={() => retest(e.id, e.url)}
                      disabled={retesting === e.id}
                      title="Re-read this host's framing headers and update the entry"
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: retesting === e.id ? 'wait' : 'pointer', display: 'flex' }}
                    >
                      {retesting === e.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                    </button>
                    <button
                      onClick={() => act(e.id, e.status === 'live' ? 'mute' : 'unmute')}
                      title={e.status === 'live' ? 'Mute: it stops appearing in results, and keeps its history' : 'Unmute'}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
                    >
                      {e.status === 'live' ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      onClick={() => act(e.id, 'remove')}
                      title="Remove from the index. The demand history stays — removing an entry removes a result, not the record that people wanted it."
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginTop: 9, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span>{e.demand.impressions} impressions</span>
                    <span style={{ color: 'var(--text-primary)' }}>{e.demand.opens} opens</span>
                    <span>{e.demand.dismissals} dismissed</span>
                    {e.frame === 'inframe' && <span>{e.demand.blocks} refused embeds</span>}
                    <span>open rate {Math.round(e.demand.rate * 100)}%</span>
                    <button
                      onClick={() => openDetail(e.id)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-light)', fontSize: 11, cursor: 'pointer' }}
                    >
                      {queries ? 'hide queries' : 'which queries opened it'}
                    </button>
                  </div>

                  {retestNote[e.id] && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      Last re-test: {retestNote[e.id]}
                    </p>
                  )}

                  {/* ── The promote panel ────────────────────────────────────
                      Everything a buyer needs in order to know what they are
                      buying, in the order they need it: what the slot does and
                      what it cannot do, then the price, then the balance, then
                      the button.
                      The rules are printed from SPONSOR_RULES — the same array
                      the results page prints under the ad — so a reader cannot
                      be told one thing here and another thing there. */}
                  {promoFor === e.id && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      {e.sponsored ? (
                        <>
                          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                            Running until{' '}
                            <strong>{new Date(e.sponsoredUntil!).toLocaleString()}</strong>. Spent on this
                            entry so far: {formatCoins(e.sponsorMilli || 0)} {CVC.symbol}.
                          </p>
                          {e.sponsorNote && (
                            <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
                              Note shown with the placement: “{e.sponsorNote}”
                            </p>
                          )}
                          <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                            Buying more days extends from the end of the current run, not from today — so a
                            top-up never throws away days already paid for.
                          </p>
                        </>
                      ) : (
                        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                          The sponsored slot sits above the organic results, labelled, for a fixed number of
                          days. It does not change how this entry is scored, and it never puts the entry in
                          front of someone whose query it does not match.
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                        {SPONSOR_DAYS.map((d) => {
                          const on = (promoDays[e.id] ?? SPONSOR_DAYS[0]) === d
                          return (
                            <button
                              key={d}
                              onClick={() => setPromoDays((m) => ({ ...m, [e.id]: d }))}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 7,
                                fontSize: 11.5,
                                cursor: 'pointer',
                                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                background: on ? 'var(--accent-dim, rgba(124,156,255,0.12))' : 'transparent',
                                color: on ? 'var(--accent-light)' : 'var(--text-secondary)',
                              }}
                            >
                              {d} days · {formatCoins(sponsorPrice(d))} {CVC.symbol}
                            </button>
                          )
                        })}
                      </div>

                      <input
                        value={promoNote[e.id] ?? e.sponsorNote ?? ''}
                        onChange={(ev) => setPromoNote((m) => ({ ...m, [e.id]: ev.target.value.slice(0, 90) }))}
                        placeholder="Optional line shown with the placement (90 characters)"
                        style={{
                          width: '100%',
                          marginTop: 8,
                          padding: '6px 9px',
                          borderRadius: 7,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-input, var(--bg-card))',
                          color: 'var(--text-primary)',
                          fontSize: 11.5,
                        }}
                      />

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => void promote(e.id)}
                          disabled={promoting === e.id || e.status !== 'live'}
                          title={e.status !== 'live' ? 'A muted entry cannot be promoted — unmute it first' : undefined}
                          style={{
                            padding: '6px 13px',
                            borderRadius: 7,
                            border: '1px solid var(--accent)',
                            background: 'var(--accent)',
                            color: '#fff',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: promoting === e.id || e.status !== 'live' ? 'not-allowed' : 'pointer',
                            opacity: promoting === e.id || e.status !== 'live' ? 0.55 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {promoting === e.id ? <Loader2 size={12} className="animate-spin" /> : <Megaphone size={12} />}
                          {e.sponsored ? 'Extend' : 'Place'} for {formatCoins(sponsorPrice(promoDays[e.id] ?? SPONSOR_DAYS[0]))} {CVC.symbol}
                        </button>

                        {e.sponsored && (
                          <button
                            onClick={() => void endPromo(e.id)}
                            disabled={promoting === e.id}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            End it now (not refunded)
                          </button>
                        )}

                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                          {cvcMilli === null
                            ? 'Balance unavailable'
                            : `Balance ${formatCoins(cvcMilli)} ${CVC.symbol}`}
                        </span>
                      </div>

                      {promoMsg[e.id] && (
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                          {promoMsg[e.id]}
                        </p>
                      )}

                      <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        {SPONSOR_RULES.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {queries && (
                    <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                      {queries.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                          No opens yet, so there is nothing to attribute. An entry with no opens is not a
                          failed entry — it is an untested one.
                        </p>
                      ) : (
                        <div style={{ display: 'grid', gap: 3 }}>
                          {queries.map((q) => (
                            <div key={q.query} style={{ display: 'flex', fontSize: 11, color: 'var(--text-secondary)' }}>
                              <span style={{ flex: 1 }}>{q.query || '(browsed, not searched)'}</span>
                              <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{q.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        Opens grouped by the query that produced them. An entry with fifty opens that all
                        came from one phrase has one fan, not demand.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
