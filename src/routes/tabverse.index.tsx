import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Boxes, GitFork, Cpu, Moon, ArrowRight } from 'lucide-react'
import { getSession } from '../lib/session'
import { TAB_REGISTRY, FORK_PRESETS, TAB_BY_ID, type TabMode } from '../lib/tabverse'
import { Card, ModeBadge, TabPill, Analogy, CVT_ACCENT } from '../lib/tabverse-ui'

type Fork = { id: number; name: string; org: string; tabs: string[]; mode: TabMode; createdAt: string }

function TabVerseIndex() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [mode, setMode] = useState<TabMode>('deterministic')
  const [forks, setForks] = useState<Fork[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadForks = () => {
    const s = getSession()
    fetch(`/api/tabverse/forks?session=${encodeURIComponent(s)}`).then((r) => r.json()).then(setForks).catch(() => {})
  }
  useEffect(loadForks, [])

  const toggle = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const applyPreset = (presetId: string) => {
    const p = FORK_PRESETS.find((x) => x.id === presetId)
    if (!p) return
    setSelected(p.tabs)
    setName(p.name)
    setOrg(p.org)
    setMode(p.mode)
  }

  // If any selected tab is freedom-only, the mirror can't be locked deterministic
  // without a note — surface the tension rather than hiding it.
  const freedomCount = useMemo(() => selected.filter((id) => TAB_BY_ID[id]?.mode === 'freedom').length, [selected])

  const fork = async () => {
    if (!name.trim()) { setError('Name your mirror.'); return }
    if (selected.length === 0) { setError('Fork at least one tab-service.'); return }
    setBusy(true); setError('')
    const res = await fetch('/api/tabverse/forks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, org, tabs: selected, mode, session: getSession() }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error || 'Could not fork.'); return }
    navigate({ to: '/tabverse/fork/$id', params: { id: String(data.id) } })
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${CVT_ACCENT}, #4f46e5)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Boxes size={18} color="#fff" />
        </div>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          CharacterVerse <span style={{ color: CVT_ACCENT }}>TabVerse</span> <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>· CVT</span>
        </h1>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', maxWidth: 780, lineHeight: 1.6 }}>
        The forkable service base for the agentic economy. Like Chromium, TabVerse is a common registry of domain
        <b style={{ color: 'var(--text-primary)' }}> tab-services</b> — pick the ones you need and fork them into your own
        sovereign <b style={{ color: 'var(--text-primary)' }}>mirror</b>. Each mirror runs its tabs walled off from every other domain,
        and each is a small <b style={{ color: 'var(--text-primary)' }}>digital powerplant</b> that recycles its own entropy instead of burning it away.
      </p>

      {/* Synapse Collective status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', margin: '1.5rem 0' }}>
        <Card accent={CVT_ACCENT} style={{ gridColumn: '1 / -1' }} title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Cpu size={16} color={CVT_ACCENT} /> The Synapse Collective</span>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#7dd3fc', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
            <Moon size={14} /> Hibernating · zero-idle-cost
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.55, margin: 0 }}>
            The governance kernel sits between <Link to="/" style={{ color: CVT_ACCENT }}>CV (the Agentic Reverse Network)</Link> and{' '}
            <Link to="/social" style={{ color: CVT_ACCENT }}>CVS (the Human Anchor Network)</Link>. It sleeps in a low-overhead read loop and
            only wakes on a real event — a fork boot, a human toggling agent shadowing, or an agent breaching its budget. Collective reasoning
            manifests only when there is a task to execute.
          </p>
          <Analogy>Just-in-time weight rendering: the model picks up only the items it needs before leaving the house, then returns to its lowest energy state. That is why it scales like transistors, not vacuum tubes.</Analogy>
        </Card>
      </div>

      {/* Tab registry */}
      <h2 id="registry" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.25rem', scrollMarginTop: '5rem' }}>Tab registry</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: '0 0 1rem' }}>Tap the services your mirror should fork. Deterministic tabs lock to strict schemas; freedom tabs reason open-endedly.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
        {TAB_REGISTRY.map((t) => {
          const on = selected.includes(t.id)
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              style={{
                textAlign: 'left', cursor: 'pointer',
                background: on ? 'rgba(56,189,248,0.10)' : 'var(--bg-card)',
                border: `1px solid ${on ? CVT_ACCENT : 'var(--border)'}`,
                borderRadius: 14, padding: '0.9rem', color: 'var(--text-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '1.4rem' }}>{t.emoji}</span>
                <ModeBadge mode={t.mode} />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.25rem 0 0.4rem', lineHeight: 1.4 }}>{t.blurb}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', opacity: 0.85 }}>{t.agent}</div>
            </button>
          )
        })}
      </div>

      {/* Fork builder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1rem', alignItems: 'start' }} className="cvt-fork-grid">
        <Card accent={CVT_ACCENT} title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><GitFork size={16} color={CVT_ACCENT} /> Fork a mirror</span>} subtitle="Your selection becomes a sovereign deployment. Nothing is shared with other mirrors.">
          {error && <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#fca5a5', padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mirror name" style={inputStyle} />
            <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Organisation (optional)" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
            {(['deterministic', 'freedom'] as TabMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ flex: 1, cursor: 'pointer', padding: '0.55rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, background: mode === m ? 'rgba(56,189,248,0.14)' : 'var(--bg-hover)', border: `1px solid ${mode === m ? CVT_ACCENT : 'var(--border)'}`, color: 'var(--text-primary)' }}>
                {m === 'deterministic' ? '🔒 Deterministic API' : '🎭 Character Freedom'}
              </button>
            ))}
          </div>
          <div style={{ minHeight: 34, display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
            {selected.length === 0 ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No tabs selected yet.</span> : selected.map((id) => <TabPill key={id} id={id} />)}
          </div>
          {mode === 'deterministic' && freedomCount > 0 && (
            <p style={{ color: '#fbbf24', fontSize: '0.76rem', margin: '0 0 0.6rem' }}>
              ⚠ {freedomCount} freedom-mode tab{freedomCount > 1 ? 's' : ''} in a deterministic mirror — the Synapse Collective will buffer their open-ended output into strict schemas at the valve.
            </p>
          )}
          <button onClick={fork} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.1rem', borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer', fontWeight: 700, color: '#04121c', background: CVT_ACCENT, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Forking…' : <>Fork this mirror <ArrowRight size={16} /></>}
          </button>
        </Card>

        <div id="quick-forks" style={{ scrollMarginTop: '5rem' }}>
          <Card title="Quick forks" subtitle="One-click recipes, like a vendor forking Chromium.">
            {FORK_PRESETS.map((p) => (
              <button key={p.id} onClick={() => applyPreset(p.id)} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.75rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{p.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.4 }}>{p.note}</div>
              </button>
            ))}
          </Card>
        </div>
      </div>

      {/* Your mirrors */}
      <h2 id="mirrors" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: '2.25rem 0 0.75rem', scrollMarginTop: '5rem' }}>Your mirrors</h2>
      {forks.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>No mirrors forked yet. Build one above to open its entropy engine.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {forks.map((f) => (
            <Link key={f.id} to="/tabverse/fork/$id" params={{ id: String(f.id) }} style={{ textDecoration: 'none' }}>
              <Card style={{ height: '100%' }} accent={CVT_ACCENT}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{f.name}</div>
                  <ModeBadge mode={f.mode} />
                </div>
                {f.org && <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.5rem' }}>{f.org}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {(f.tabs || []).map((id) => <TabPill key={id} id={id} />)}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 140, padding: '0.55rem 0.7rem', borderRadius: 8,
  background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.88rem',
}

export const Route = createFileRoute('/tabverse/')({
  component: TabVerseIndex,
})
