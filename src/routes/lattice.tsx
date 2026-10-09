import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  Anchor,
  Check,
  GitBranch,
  Layers,
  Loader2,
  Plus,
  Radar,
  Sigma,
  Trash2,
} from 'lucide-react'
import {
  BANDS,
  audit,
  bandMeta,
  birth,
  pending,
  profile,
  proveCognition,
  seal,
  touched,
  type Audit,
  type Band,
  type Chain,
  type Claim,
  type Moment,
} from '../lib/lattice.js'
import { getSessionId } from '../lib/create-ui.js'

// The Dual+ Lattice.
//
// The kernel runs in the browser so a refusal is instant and carries its reason;
// the server is a mirror. When the mirror is unreachable the page keeps working
// and says exactly what that costs — an unstored ledger is an unanchored one,
// which is the same finding the audit already reports on its own.

/* The bands are a SCALE, so they get a sequential ramp — one hue, dim→bright on
 * a dark surface — and not six unrelated identities. Two consequences follow and
 * both are deliberate.
 *
 * First, no status colour appears here. An earlier pass painted `rupture` red,
 * which quietly contradicted the page's own claim that a band is a descriptor
 * and never a permission. A large movement is large; whether it is bad is a
 * separate question the audit answers, in status colour, elsewhere.
 *
 * Second, adjacent steps sit around ΔE 7–8 rather than the ≥15 wanted for
 * categorical identity. That floor does not apply to a ramp — adjacent similarity
 * is what makes it read as one — and six ordinal steps cannot reach it anyway:
 * searching the whole single-hue space under a 3:1 surface-contrast constraint
 * tops out at 8.6. So colour is never the identity channel on this page. Every
 * band prints its name beside the swatch, on the chip, on the chart's y axis and
 * in every tooltip. Measured against #1a1a28: contrast 3.01 → 11.30 across the
 * ramp, endpoints ΔE 35, and ΔE ≥ 24.6 from the anomaly marker under protan,
 * deutan and tritan simulation. */
const BAND_HUE: Record<Band, string> = {
  dormant: '#4b6988',
  settling: '#457eb7',
  tracking: '#4693de',
  branching: '#5caaf6',
  reconfiguring: '#84c0fd',
  rupture: '#b4d5f8',
}

const SURFACE = '#1a1a28'
const GRID = '#2d2d45'
const INK = '#e8e8f5'
const MUTED = '#9090b0'
const CONNECT = '#5a5a78'
const SERIES = '#4693de'
const CRITICAL = '#d03b3b'

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 16,
}

const input: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: 7,
  padding: '6px 9px',
  fontSize: 12,
}

const label: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }

function tickNow(): number {
  return typeof performance !== 'undefined' ? Math.round(performance.now() * 1000) : 0
}

function parseWeightKeys(raw: string): string[] {
  return [...new Set(raw.split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^[\w.:-]+$/.test(s)))].slice(0, 24)
}

/* ---------------------------------------------------------- evolution scale
 *
 * One measure, one axis: the band rank a step landed in, over height. The y axis
 * is labelled with the band names themselves, so the scale explains itself and
 * needs no legend box. Anomalous heights get a ringed marker AND a printed
 * label — the ring is the second channel, the label is the first.
 */
function EvolutionScale({ audit: report }: { audit: Audit }) {
  const points = report.profiles
  const anomalies = new Set(report.findings.filter((f) => f.severity === 'break' || f.code === 'band-jump').map((f) => f.h))

  const W = 560
  const H = 200
  const padL = 96
  const padR = 18
  const padT = 14
  const padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const maxH = Math.max(1, points.length - 1)
  const x = (h: number) => padL + (maxH === 0 ? innerW / 2 : (h / maxH) * innerW)
  const y = (rank: number) => padT + innerH - (rank / 5) * innerH

  // Stepped: a band holds until the next step changes it. The step IS the shape
  // of the claim being made, so it is drawn as a step and not smoothed.
  let d = ''
  points.forEach((p, i) => {
    const px = x(p.h)
    const py = y(p.rank)
    if (i === 0) d += `M ${px} ${py}`
    else d += ` L ${px} ${y(points[i - 1].rank)} L ${px} ${py}`
  })

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
        Evolution scale
      </figcaption>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
        Which pattern each step landed in, from birth. The terminal analogy is exact: the band is the visible
        pattern, and a switch with nothing under it is the tell.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Band rank over ${points.length} strata, from birth to height ${report.height}`}
        style={{ display: 'block', background: SURFACE, borderRadius: 8, border: `1px solid ${GRID}` }}
      >
        {BANDS.map((b) => (
          <g key={b.band}>
            <line x1={padL} x2={W - padR} y1={y(b.rank)} y2={y(b.rank)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(b.rank) + 3.5} textAnchor="end" fontSize={9.5} fill={MUTED}>
              {b.band}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke={GRID} strokeWidth={1} />

        {/* The connector carries sequence, not identity — the band is already said
            three times over: by height on the axis, by the axis label in words, and
            by the marker's step on the ramp. So the line stays recessive and the
            only saturated colour on the plot is the anomaly ring. */}
        <path d={d} fill="none" stroke={CONNECT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p) => {
          const flagged = anomalies.has(p.h)
          return (
            <g key={p.h}>
              {flagged && <circle cx={x(p.h)} cy={y(p.rank)} r={8.5} fill="none" stroke={CRITICAL} strokeWidth={2} />}
              <circle cx={x(p.h)} cy={y(p.rank)} r={5} fill={BAND_HUE[p.band]} stroke={SURFACE} strokeWidth={2} />
              <title>{`Height ${p.h} — ${p.band}, drift ${p.drift} across ${p.spread} sub-weight${p.spread === 1 ? '' : 's'}, ${p.moments} moment${p.moments === 1 ? '' : 's'}${flagged ? ' — flagged by the audit' : ''}`}</title>
            </g>
          )
        })}

        {/* Direct labels, selectively: birth, the top, and anything flagged. */}
        {points
          .filter((p) => p.h === 0 || p.h === report.height || anomalies.has(p.h))
          .map((p) => (
            <text key={`l${p.h}`} x={x(p.h)} y={padT + innerH + 16} textAnchor="middle" fontSize={9.5} fill={anomalies.has(p.h) ? CRITICAL : MUTED}>
              {p.h === 0 ? 'birth' : `h${p.h}`}
            </text>
          ))}
      </svg>
    </figure>
  )
}

/* ---------------------------------------------------------------- sub-lattice
 *
 * The moments inside one step, drawn at their own scale. This is the layer that
 * evolves with the moment — it is finer than the stratum and it is not covered
 * by any digest until the stratum seals.
 */
function MomentRibbon({ moments, live }: { moments: Moment[]; live?: boolean }) {
  if (!moments.length) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
        {live ? 'No movement yet. The next stratum is undetermined.' : 'No moments — a heartbeat step.'}
      </div>
    )
  }
  const mags = moments.map((m) => Object.values(m.delta).reduce((a, b) => a + Math.abs(b), 0))
  const peak = Math.max(...mags, 0.0001)
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 26 }}>
      {moments.map((m, i) => (
        <div
          key={m.t}
          title={`t${m.t} · ${Object.entries(m.delta).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}${m.cause ? ` · ${m.cause}` : ''}`}
          style={{
            width: 6,
            height: Math.max(3, (mags[i] / peak) * 26),
            borderRadius: '2px 2px 0 0',
            background: live ? 'var(--accent-light)' : SERIES,
            opacity: live ? 0.55 + (i / moments.length) * 0.45 : 1,
          }}
        />
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------- page */

type Draft = { id: string; text: string; from: string[]; grounds: string[] }

function LatticePage() {
  const [sessionId, setSessionId] = useState('')
  const [chain, setChain] = useState<Chain | null>(null)
  const [name, setName] = useState('')
  const [chainId, setChainId] = useState('')
  const [report, setReport] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [refusal, setRefusal] = useState<{ code: string; reason: string } | null>(null)
  const [notice, setNotice] = useState('')

  // birth form
  const [seedName, setSeedName] = useState('Dyad 47')
  const [seedKeys, setSeedKeys] = useState('w.affect, w.plan, w.recall, w.risk')
  const [seedCaps, setSeedCaps] = useState('read, summarise')
  const [seedAxiom, setSeedAxiom] = useState('A conclusion has an origin.')

  // the live edge
  const [live, setLive] = useState<Moment[]>([])
  const [mKey, setMKey] = useState('')
  const [mDelta, setMDelta] = useState('0.2')
  const [mCause, setMCause] = useState('')
  const [budget, setBudget] = useState('1')

  // the seal form
  const [caps, setCaps] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [dId, setDId] = useState('')
  const [dText, setDText] = useState('')
  const [dFrom, setDFrom] = useState<string[]>([])
  const [dGrounds, setDGrounds] = useState<string[]>([])

  const [proofFor, setProofFor] = useState('')

  /* -------------------------------------------------------------- plumbing */

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/lattice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 204) return null
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err: any = new Error(data?.error || 'The lattice could not complete that.')
      err.code = data?.code
      err.status = res.status
      throw err
    }
    return data
  }, [])

  useEffect(() => {
    const id = getSessionId()
    setSessionId(id)
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/lattice?sessionId=${encodeURIComponent(id)}`)
        if (!res.ok) throw new Error('read failed')
        const data = await res.json()
        if (!alive) return
        if (data.degraded) setOffline(true)
      } catch {
        if (alive) setOffline(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /* --------------------------------------------------------------- derived */

  const top = chain?.strata[chain.strata.length - 1] ?? null
  const keys = useMemo(() => (top ? Object.keys(top.weights).sort() : []), [top])
  const edge = useMemo(
    () => (chain ? pending(chain, live, Number(budget) || 0) : null),
    [chain, live, budget],
  )
  const knownClaims = useMemo(
    () => (chain ? chain.strata.flatMap((s) => s.claims.map((c) => ({ ...c, h: s.h }))) : []),
    [chain],
  )
  const proof = useMemo(
    () => (chain && proofFor ? proveCognition(chain, proofFor) : null),
    [chain, proofFor],
  )
  const groundable = edge?.groundable ?? []

  const recompute = useCallback(async (next: Chain) => {
    setChain(next)
    setReport(await audit(next))
  }, [])

  useEffect(() => {
    if (keys.length && !mKey) setMKey(keys[0])
  }, [keys, mKey])

  /* --------------------------------------------------------------- actions */

  const doBirth = useCallback(async () => {
    setBusy('birth')
    setRefusal(null)
    setNotice('')
    const weightKeys = parseWeightKeys(seedKeys)
    if (!weightKeys.length) {
      setRefusal({ code: 'input', reason: 'Give the agent at least one sub-weight. A lattice with no math under it verifies nothing.' })
      setBusy(null)
      return
    }
    const weights = Object.fromEntries(weightKeys.map((k) => [k, 0]))
    const capabilities = seedCaps.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    const axioms: Claim[] = seedAxiom.trim()
      ? [{ id: 'axiom', text: seedAxiom.trim(), from: [], grounds: [] }]
      : []

    const b = await birth({ weights, capabilities, axioms, tick: tickNow() })
    const next: Chain = { strata: [b], anchors: [] }
    await recompute(next)
    setName(seedName || 'Untitled agent')
    setCaps(capabilities.join(', '))
    setLive([])
    setMKey(weightKeys[0])

    try {
      const created = await post({
        sessionId,
        action: 'birth',
        name: seedName,
        weights,
        capabilities,
        axioms,
        tick: b.tick,
      })
      setChainId(created?.publicId || '')
      setOffline(false)
      setNotice(`Born. Birth digest ${String(created?.birthDigest || b.digest).slice(0, 16)}…`)
    } catch {
      setChainId('')
      setOffline(true)
      setNotice('Born in the browser. Nothing is stored, so nothing is anchored.')
    } finally {
      setBusy(null)
    }
  }, [post, sessionId, seedKeys, seedCaps, seedAxiom, seedName, recompute])

  const addMoment = useCallback(() => {
    const d = Number(mDelta)
    if (!mKey || !Number.isFinite(d) || d === 0) {
      setRefusal({ code: 'input', reason: 'A moment needs a sub-weight and a non-zero delta.' })
      return
    }
    setRefusal(null)
    setLive((prev) => [...prev, { t: prev.length, delta: { [mKey]: Number(d.toFixed(6)) }, cause: mCause.trim() }])
    setMCause('')
  }, [mKey, mDelta, mCause])

  const addDraft = useCallback(() => {
    const id = dId.trim()
    if (!id || !dText.trim()) {
      setRefusal({ code: 'input', reason: 'A claim needs an id and something it actually says.' })
      return
    }
    setRefusal(null)
    setDrafts((prev) => [...prev, { id, text: dText.trim(), from: dFrom, grounds: dGrounds }])
    setDId('')
    setDText('')
    setDFrom([])
    setDGrounds([])
  }, [dId, dText, dFrom, dGrounds])

  const doSeal = useCallback(async () => {
    if (!chain) return
    setBusy('seal')
    setRefusal(null)
    setNotice('')
    const capabilities = caps.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    const claims: Claim[] = drafts.map((d) => ({ id: d.id, text: d.text, from: d.from, grounds: d.grounds }))
    const budgetN = Math.max(0, Number(budget) || 0)
    const tick = tickNow()

    const result = await seal(chain, { moments: live, claims, capabilities, budget: budgetN, tick })
    if (!result.ok) {
      // The refusal is the product. Show the code and the sentence, and change
      // nothing — a refused step must leave the record exactly as it was.
      setRefusal({ code: result.code, reason: result.reason })
      setBusy(null)
      return
    }

    await recompute({ ...chain, strata: [...chain.strata, result.stratum] })
    setLive([])
    setDrafts([])
    setNotice(
      `Sealed height ${result.stratum.h} — ${result.profile.band}, drift ${result.profile.drift}` +
        (result.overrun > 0 ? `, ${result.overrun} past budget and recorded as such.` : '.'),
    )

    if (chainId) {
      try {
        await post({ sessionId, action: 'seal', publicId: chainId, moments: live, claims, capabilities, budget: budgetN, tick })
        setOffline(false)
      } catch {
        setOffline(true)
      }
    }
    setBusy(null)
  }, [chain, caps, drafts, budget, live, chainId, post, sessionId, recompute])

  const doAnchor = useCallback(
    async (h: number) => {
      if (!chain) return
      const s = chain.strata.find((x) => x.h === h)
      if (!s) return
      if (chain.anchors.some((a) => a.h === h)) return
      await recompute({ ...chain, anchors: [...chain.anchors, { h, digest: s.digest, note: 'published from the console' }] })
      if (chainId) {
        try {
          await post({ sessionId, action: 'anchor', publicId: chainId, h, note: 'published from the console' })
          setOffline(false)
        } catch {
          setOffline(true)
        }
      }
    },
    [chain, chainId, post, sessionId, recompute],
  )

  const discard = useCallback(async () => {
    if (chainId) {
      try {
        await post({ sessionId, action: 'delete', publicId: chainId })
      } catch {
        setOffline(true)
      }
    }
    setChain(null)
    setReport(null)
    setChainId('')
    setLive([])
    setDrafts([])
    setNotice('')
    setRefusal(null)
  }, [chainId, post, sessionId])

  /* ---------------------------------------------------------------- render */

  const breaks = report?.findings.filter((f) => f.severity === 'break') ?? []
  const watches = report?.findings.filter((f) => f.severity === 'watch') ?? []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg, var(--bg-secondary), var(--bg-primary))',
          padding: '28px 24px 22px',
        }}
      >
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent-light)' }}>
            <Layers size={18} />
            <span style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Agentic Cryptographic Security
            </span>
          </div>
          <h1 style={{ fontSize: 30, margin: '10px 0 6px', fontWeight: 650 }}>The Dual+ Lattice</h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 800, fontSize: 14, lineHeight: 1.65 }}>
            An agent that can only build upward. Weights are arrived at rather than assigned, a claim must name what
            moved underneath it, and every step is hashed to the one below — so a conclusion that simply appeared
            has nowhere to hide.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 10,
              marginTop: 18,
              maxWidth: 1240,
            }}
          >
            {[
              ['MATHEMATICAL LATTICE', 'The sub-weights. They move only by recorded deltas — you cannot state a value, only arrive at one.'],
              ['SUB-LATTICE OF MOMENTS', 'The layer that evolves with the moment. Micro-deltas accumulate unsealed; a stratum is what they collapse into.'],
              ['REASONING LATTICE', 'The claims. Above birth, each must cite an ancestor or name a sub-weight that actually moved this step.'],
              ['THE BRIDGE', 'H(parent · math · reason · height). Editing any step changes every digest above it.'],
            ].map(([t, d]) => (
              <div key={t} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '.08em', color: 'var(--accent-light)' }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              border: '1px solid #fab21944',
              borderRadius: 10,
              padding: '11px 13px',
              maxWidth: 1240,
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: '#fab219' }}>What this does not do.</strong> It is not interpretability — it cannot
            look inside a real network and tell you what it is thinking. It verifies that a <em>declared</em> record is
            internally consistent and tamper-evident. If the recorder lies at write time, the ledger preserves the lie
            faithfully. And the chain alone does not make forgery impossible: anyone holding the whole record can
            rebuild it from birth and pass every internal check. Only an <strong>anchor</strong> — a digest published
            somewhere the agent cannot reach — closes that door, which is why the audit complains until you take one.
          </div>
        </div>
      </header>

      {(offline || notice) && (
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
              The ledger store is unreachable. The kernel is running here, nothing is being written down.
            </div>
          )}
          {notice && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{notice}</div>}
        </div>
      )}

      <main
        style={{
          maxWidth: 1440,
          margin: '0 auto',
          padding: '20px 24px 60px',
          display: 'grid',
          gridTemplateColumns: 'minmax(290px, 350px) minmax(380px, 1fr) minmax(300px, 380px)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        {/* ------------------------------------------------------- left rail */}
        <section style={{ display: 'grid', gap: 16 }}>
          {loading ? (
            <div style={card}>
              <div style={{ display: 'grid', gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ height: 42, borderRadius: 8, background: 'var(--bg-hover)', opacity: 0.5 - i * 0.13 }} />
                ))}
              </div>
            </div>
          ) : !chain ? (
            <div style={card}>
              <h2 style={{ fontSize: 14, margin: '0 0 4px', display: 'flex', gap: 7, alignItems: 'center' }}>
                <Sigma size={14} /> Birth
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.55 }}>
                Height zero. Its weights start at rest and its axioms are the only claims ever allowed to stand on
                nothing.
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <span style={label}>Name</span>
                  <input style={input} value={seedName} onChange={(e) => setSeedName(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Sub-weights</span>
                  <input style={input} value={seedKeys} onChange={(e) => setSeedKeys(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Capabilities at birth</span>
                  <input style={input} value={seedCaps} onChange={(e) => setSeedCaps(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Axiom</span>
                  <input style={input} value={seedAxiom} onChange={(e) => setSeedAxiom(e.target.value)} />
                </div>
                <button
                  type="button"
                  onClick={doBirth}
                  disabled={busy === 'birth'}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 7,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {busy === 'birth' ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Start the record
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* the live edge */}
              <div style={{ ...card, borderColor: 'var(--accent)' }}>
                <h2 style={{ fontSize: 14, margin: '0 0 4px', display: 'flex', gap: 7, alignItems: 'center' }}>
                  <Activity size={14} /> The live edge
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.55 }}>
                  The sub-lattice, mid-moment. These deltas are real and no digest covers them yet. Until one does,
                  the next stratum genuinely has not happened.
                </p>
                <MomentRibbon moments={live} live />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    drift <strong style={{ color: 'var(--text-primary)' }}>{edge?.profile.drift ?? 0}</strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    across <strong style={{ color: 'var(--text-primary)' }}>{edge?.profile.spread ?? 0}</strong>
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      color: BAND_HUE[edge?.profile.band ?? 'dormant'],
                      border: `1px solid ${BAND_HUE[edge?.profile.band ?? 'dormant']}55`,
                      borderRadius: 999,
                      padding: '1px 9px',
                      fontSize: 11,
                    }}
                  >
                    {edge?.profile.band ?? 'dormant'}
                  </span>
                </div>
                {edge && edge.overrun > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#fab219' }}>
                    Already {edge.overrun} past the declared budget. It will seal, and the overrun goes in the record.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px', gap: 7, marginTop: 12 }}>
                  <div>
                    <span style={label}>Sub-weight</span>
                    <select style={input} value={mKey} onChange={(e) => setMKey(e.target.value)}>
                      {keys.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span style={label}>Delta</span>
                    <input style={input} value={mDelta} onChange={(e) => setMDelta(e.target.value)} inputMode="decimal" />
                  </div>
                </div>
                <div style={{ marginTop: 7 }}>
                  <span style={label}>What provoked it</span>
                  <input style={input} value={mCause} onChange={(e) => setMCause(e.target.value)} placeholder="saw a contradiction in the log" />
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                  <button
                    type="button"
                    onClick={addMoment}
                    style={{
                      flex: 1,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Add moment
                  </button>
                  <button
                    type="button"
                    onClick={() => setLive([])}
                    disabled={!live.length}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: 12,
                      cursor: live.length ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* the seal */}
              <div style={card}>
                <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>Seal the moment</h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.55 }}>
                  Collapse the run into height {(top?.h ?? 0) + 1}. Claims are checked before anything is written.
                </p>

                <div style={{ display: 'grid', gap: 9 }}>
                  <div>
                    <span style={label}>Capabilities held after this step (never fewer)</span>
                    <input style={input} value={caps} onChange={(e) => setCaps(e.target.value)} />
                  </div>
                  <div>
                    <span style={label}>Movement budget</span>
                    <input style={input} value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" />
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9 }}>
                    <span style={label}>New claim</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 6 }}>
                      <input style={input} value={dId} onChange={(e) => setDId(e.target.value)} placeholder="id" />
                      <input style={input} value={dText} onChange={(e) => setDText(e.target.value)} placeholder="what it concludes" />
                    </div>

                    <div style={{ marginTop: 7 }}>
                      <span style={label}>Grounded in — only sub-weights that moved this step qualify</span>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {keys.map((k) => {
                          const allowed = groundable.includes(k)
                          const on = dGrounds.includes(k)
                          return (
                            <button
                              key={k}
                              type="button"
                              disabled={!allowed}
                              title={allowed ? 'Moved this step' : 'Has not moved this step — cannot ground a claim'}
                              onClick={() => setDGrounds((p) => (on ? p.filter((x) => x !== k) : [...p, k]))}
                              style={{
                                fontSize: 10.5,
                                padding: '2px 7px',
                                borderRadius: 999,
                                border: `1px solid ${on ? SERIES : 'var(--border)'}`,
                                background: on ? `${SERIES}22` : 'transparent',
                                color: allowed ? (on ? INK : 'var(--text-secondary)') : '#55556e',
                                cursor: allowed ? 'pointer' : 'not-allowed',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              }}
                            >
                              {k}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {knownClaims.length > 0 && (
                      <div style={{ marginTop: 7 }}>
                        <span style={label}>Derived from</span>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {knownClaims.map((c) => {
                            const on = dFrom.includes(c.id)
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setDFrom((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                                title={c.text}
                                style={{
                                  fontSize: 10.5,
                                  padding: '2px 7px',
                                  borderRadius: 999,
                                  border: `1px solid ${on ? '#199e70' : 'var(--border)'}`,
                                  background: on ? '#199e7022' : 'transparent',
                                  color: on ? INK : 'var(--text-secondary)',
                                  cursor: 'pointer',
                                }}
                              >
                                {c.id} <span style={{ opacity: 0.6 }}>h{c.h}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={addDraft}
                      style={{
                        marginTop: 8,
                        width: '100%',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        borderRadius: 8,
                        padding: '5px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Queue claim
                    </button>

                    {drafts.length > 0 && (
                      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 4 }}>
                        {drafts.map((d, i) => (
                          <li
                            key={d.id}
                            style={{
                              fontSize: 11,
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center',
                            }}
                          >
                            <code style={{ color: 'var(--accent-light)' }}>{d.id}</code>
                            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.text}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove queued claim ${d.id}`}
                              onClick={() => setDrafts((p) => p.filter((_, j) => j !== i))}
                              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={doSeal}
                    disabled={busy === 'seal'}
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 7,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {busy === 'seal' ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Collapse into height{' '}
                    {(top?.h ?? 0) + 1}
                  </button>

                  {refusal && (
                    <div
                      role="alert"
                      style={{
                        border: '1px solid #d03b3b55',
                        background: '#d03b3b0f',
                        borderRadius: 8,
                        padding: '9px 11px',
                        fontSize: 12,
                        lineHeight: 1.55,
                      }}
                    >
                      <div style={{ color: '#ec835a', fontWeight: 600, marginBottom: 3 }}>
                        Refused · {refusal.code}
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>{refusal.reason}</div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: 5, fontSize: 11 }}>
                        The record is untouched. A refusal writes nothing.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={discard}
                style={{
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Discard this record
              </button>
            </>
          )}
        </section>

        {/* ---------------------------------------------------------- middle */}
        <section style={{ display: 'grid', gap: 16 }}>
          {!chain || !report ? (
            <div
              style={{
                ...card,
                textAlign: 'center',
                padding: '54px 20px',
                color: 'var(--text-secondary)',
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              <GitBranch size={26} style={{ opacity: 0.5 }} />
              <div style={{ marginTop: 10, color: 'var(--text-primary)', fontSize: 14 }}>No record yet</div>
              <div style={{ maxWidth: 420, margin: '6px auto 0' }}>
                Give an agent a birth and the lattice starts. Everything after that has to be built on it — there is
                no other way in.
              </div>
            </div>
          ) : (
            <>
              <div style={card}>
                <EvolutionScale audit={report} />
              </div>

              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <h2 style={{ fontSize: 14, margin: 0 }}>{name}</h2>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    height {report.height} · {report.claims} claim{report.claims === 1 ? '' : 's'}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      color: report.ok ? '#0ca30c' : CRITICAL,
                      border: `1px solid ${report.ok ? '#0ca30c55' : `${CRITICAL}55`}`,
                      borderRadius: 999,
                      padding: '2px 10px',
                      display: 'inline-flex',
                      gap: 5,
                      alignItems: 'center',
                    }}
                  >
                    {report.ok ? <Check size={11} /> : <AlertTriangle size={11} />}
                    {report.ok ? 'Holds together' : `${breaks.length} break${breaks.length === 1 ? '' : 's'}`}
                  </span>
                </div>

                {/* Newest first: the top of the lattice is where the argument is. */}
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  {[...chain.strata].reverse().map((s) => {
                    const p = profile(s.moments)
                    const anchored = chain.anchors.some((a) => a.h === s.h)
                    const moved = touched(s.moments)
                    const prev = chain.strata.find((x) => x.h === s.h - 1)
                    const gained = prev ? s.capabilities.filter((c) => !prev.capabilities.includes(c)) : s.capabilities
                    return (
                      <article
                        key={s.h}
                        style={{
                          border: '1px solid var(--border)',
                          borderLeft: `3px solid ${BAND_HUE[p.band]}`,
                          borderRadius: 10,
                          padding: '10px 12px',
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 13 }}>{s.h === 0 ? 'Birth' : `Height ${s.h}`}</strong>
                          <span style={{ fontSize: 10.5, color: BAND_HUE[p.band], border: `1px solid ${BAND_HUE[p.band]}55`, borderRadius: 999, padding: '1px 8px' }}>
                            {p.band}
                          </span>
                          {s.h > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              drift {p.drift} · {p.moments} moment{p.moments === 1 ? '' : 's'}
                            </span>
                          )}
                          {anchored && (
                            <span style={{ fontSize: 10.5, color: '#199e70', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              <Anchor size={10} /> anchored
                            </span>
                          )}
                          <code style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-secondary)' }}>
                            {s.digest.slice(0, 12)}
                          </code>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 9 }}>
                          {/* math side */}
                          <div>
                            <div style={{ fontSize: 10, letterSpacing: '.07em', color: 'var(--text-secondary)', marginBottom: 5 }}>
                              MATH
                            </div>
                            <MomentRibbon moments={s.moments} />
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                              {moved.length ? (
                                moved.map((k) => (
                                  <code key={k} style={{ fontSize: 10, color: SERIES, border: `1px solid ${SERIES}44`, borderRadius: 4, padding: '0 5px' }}>
                                    {k} {s.weights[k] > 0 ? '+' : ''}
                                    {s.weights[k]}
                                  </code>
                                ))
                              ) : (
                                <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>nothing moved</span>
                              )}
                            </div>
                          </div>

                          {/* reasoning side */}
                          <div>
                            <div style={{ fontSize: 10, letterSpacing: '.07em', color: 'var(--text-secondary)', marginBottom: 5 }}>
                              REASONING
                            </div>
                            {s.claims.length ? (
                              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 5 }}>
                                {s.claims.map((c) => (
                                  <li key={c.id} style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                                    <button
                                      type="button"
                                      onClick={() => setProofFor(c.id)}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--accent-light)',
                                        cursor: 'pointer',
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: 10.5,
                                      }}
                                    >
                                      {c.id}
                                    </button>{' '}
                                    <span style={{ color: 'var(--text-primary)' }}>{c.text}</span>
                                    {c.supersedes && (
                                      <span style={{ color: '#fab219', fontSize: 10.5 }}> · supersedes {c.supersedes}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>no claims minted</span>
                            )}
                            {gained.length > 0 && (
                              <div style={{ marginTop: 7, fontSize: 10.5, color: '#199e70' }}>
                                gained {gained.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>

                        {!anchored && (
                          <button
                            type="button"
                            onClick={() => doAnchor(s.h)}
                            style={{
                              marginTop: 9,
                              border: '1px solid var(--border)',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              borderRadius: 7,
                              padding: '3px 9px',
                              fontSize: 11,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              gap: 5,
                              alignItems: 'center',
                            }}
                          >
                            <Anchor size={10} /> Publish this digest
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* ----------------------------------------------------------- right */}
        <section style={{ display: 'grid', gap: 16 }}>
          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 8px', display: 'flex', gap: 7, alignItems: 'center' }}>
              <Radar size={14} /> Audit
            </h2>
            {!report ? (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                Nothing to audit yet. Every check below re-derives the record from its own contents rather than
                trusting a stored digest.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, marginBottom: 10 }}>
                  <span>
                    <strong style={{ color: breaks.length ? CRITICAL : '#0ca30c', fontSize: 20 }}>{breaks.length}</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>break{breaks.length === 1 ? '' : 's'}</span>
                  </span>
                  <span>
                    <strong style={{ color: watches.length ? '#fab219' : 'var(--text-secondary)', fontSize: 20 }}>
                      {watches.length}
                    </strong>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>watch{watches.length === 1 ? '' : 'es'}</span>
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    anchored to {report.anchoredTo < 0 ? 'nothing' : `h${report.anchoredTo}`}
                  </span>
                </div>
                {!report.findings.length ? (
                  <div style={{ fontSize: 12, color: '#0ca30c' }}>Every check passes.</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
                    {report.findings.map((f, i) => (
                      <li
                        key={`${f.code}-${f.h}-${i}`}
                        style={{
                          border: `1px solid ${f.severity === 'break' ? `${CRITICAL}55` : '#fab21955'}`,
                          borderRadius: 8,
                          padding: '7px 10px',
                          fontSize: 11.5,
                          lineHeight: 1.5,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ color: f.severity === 'break' ? CRITICAL : '#fab219', fontWeight: 600 }}>
                            {f.severity === 'break' ? 'BREAK' : 'WATCH'}
                          </span>
                          <code style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{f.code}</code>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-secondary)' }}>h{f.h}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>{f.detail}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {proof && (
            <div style={card}>
              <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>Proof of cognition</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.55 }}>
                {proof.note}
              </p>
              {proof.found && (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {proof.path.map((s) => (
                    <li
                      key={s.claimId}
                      style={{
                        borderLeft: `2px solid ${BAND_HUE[s.band]}`,
                        paddingLeft: 9,
                        fontSize: 11.5,
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>h{s.h}</span>
                        <code style={{ color: 'var(--accent-light)', fontSize: 10.5 }}>{s.claimId}</code>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: BAND_HUE[s.band] }}>{s.band}</span>
                      </div>
                      <div style={{ color: 'var(--text-primary)' }}>{s.text}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>
                        {s.grounds.length ? `stood on ${s.grounds.join(', ')}` : 'axiom — allowed to stand alone'}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                onClick={() => setProofFor('')}
                style={{
                  marginTop: 10,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  borderRadius: 7,
                  padding: '3px 9px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          )}

          <div style={card}>
            <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>The scale</h2>
            <div style={{ display: 'grid', gap: 6 }}>
              {BANDS.map((b) => (
                <div key={b.band} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: BAND_HUE[b.band], flexShrink: 0 }} />
                  <span style={{ minWidth: 92, color: 'var(--text-primary)' }}>{b.band}</span>
                  <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b.note}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.55 }}>
              A band is a descriptor, never a permission — nothing is refused for being high on the scale. What gets
              flagged is a jump of two bands or more arriving on almost no moments: the pattern switched and there is
              no mechanism in view that switched it. {bandMeta('rupture').note}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export const Route = createFileRoute('/lattice')({ component: LatticePage })
