import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Dna, FolderTree, Stethoscope, Activity, ArrowRight, BadgeCheck } from 'lucide-react'
import {
  CLAWS,
  DNA_FOLDERS,
  ICQE_ZONES,
  ORIGIN_TYPES,
  REGISTRY_FILTERS,
  VITAL_SIGNS,
  icqeTimeAgo,
  originMeta,
  statusMeta,
  vitalColor,
  zoneMeta,
  type ClawAgent,
  type MotReport,
  type Vitals,
} from '../lib/icqe'
import { SUB_WEIGHTS, subWeightMeta } from '../lib/training'
import { getSession } from '../lib/session'

export const Route = createFileRoute('/icqe')({ component: IcqePage })

const WS = 'default'

/* --------------------------------------------------------------------- types */

type Character = { id: number; name: string; avatar: string; category: string }

type Quirk = {
  id: number
  characterId: number | null
  agent: string
  mode: string
  name: string
  subWeight: string
  originType: string
  observation: string
  diagnosis: string
  genealogy: any
  vitals: Partial<Vitals> | null
  gamified: number
  recommendation: string
  because: string
  status: string
  zone: string
  folder: string
  pathNote: string
  blobKey: string
  signalId: number | null
  createdAt: string | null
  filedAt: string | null
}

type FolderRecord = {
  id: number
  name: string
  note: string
  characterId: number | null
  zone: string
  agent: string
  filedAt: string | null
  blobKey: string
}

type Counts = { total: number; detected: number; blossom: number; gray: number; terminate: number; filed: number }

/* ------------------------------------------------------------------- styling */

const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const

const label = {
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-secondary)',
} as const

const control = {
  width: '100%',
  padding: '0.55rem 0.7rem',
  borderRadius: 9,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
} as const

function tag(text: string, color: string, filled = false) {
  return (
    <span
      key={text}
      style={{
        fontSize: '0.64rem',
        fontWeight: 700,
        padding: '0.14rem 0.45rem',
        borderRadius: 6,
        background: filled ? color : `${color}22`,
        color: filled ? '#0b0b12' : color,
        border: `1px solid ${color}${filled ? '' : '55'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

function ModeChip({ mode, active, onClick, color }: { mode: { key: string; emoji: string; label: string; desc: string }; active: boolean; onClick: () => void; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={mode.desc}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '0.3rem 0.6rem',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 600,
        cursor: 'pointer',
        background: active ? `${color}22` : 'var(--bg-secondary)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        color: active ? color : 'var(--text-secondary)',
      }}
    >
      <span>{mode.emoji}</span>
      {mode.label}
    </button>
  )
}

/* ====================================================================== page */

function IcqePage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [quirks, setQuirks] = useState<Quirk[]>([])
  const [counts, setCounts] = useState<Counts>({ total: 0, detected: 0, blossom: 0, gray: 0, terminate: 0, filed: 0 })
  const [folders, setFolders] = useState<Record<string, FolderRecord[]>>({ junk: [], dormant: [], blossomed: [] })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [archiveCounts, setArchiveCounts] = useState<Record<string, number | 'unavailable'> | null>(null)

  const load = useCallback(() => {
    fetch(`/api/icqe?workspace=${WS}`)
      .then((r) => r.json())
      .then((d) => {
        setQuirks(Array.isArray(d?.quirks) ? d.quirks : [])
        if (d?.counts) setCounts(d.counts)
        if (d?.folders) setFolders(d.folders)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    fetch('/api/characters')
      .then((r) => r.json())
      .then((d) => setCharacters(Array.isArray(d) ? d : []))
      .catch(() => setCharacters([]))
  }, [load])

  const readArchive = async () => {
    const next: Record<string, number | 'unavailable'> = {}
    await Promise.all(
      DNA_FOLDERS.map(async (f) => {
        try {
          const res = await fetch(`/api/icqe?workspace=${WS}&archive=${f.key}`)
          const d = await res.json()
          next[f.key] = d?.available ? (Array.isArray(d.records) ? d.records.length : 0) : 'unavailable'
        } catch {
          next[f.key] = 'unavailable'
        }
      }),
    )
    setArchiveCounts(next)
  }

  const visible = useMemo(() => {
    if (filter === 'all') return quirks
    return quirks.filter((q) => q.status === filter)
  }, [quirks, filter])

  const charName = (id: number | null) =>
    id ? characters.find((c) => c.id === id)?.name || `character #${id}` : 'model-wide'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
      {/* ------------------------------------------------------------- header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(168,85,247,0.4), rgba(56,189,248,0.25))',
            border: '1px solid rgba(168,85,247,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Dna size={21} color="var(--accent-light)" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: 0 }}>
            ICQE · <span style={{ color: 'var(--accent-light)' }}>Genetic Quirk</span> training
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.88rem' }}>
            Intercept Cluster Quirks at the Edge — diagnose emergent sub-weight quirks and file them on the
            evolutionary spectrum.
          </p>
        </div>
      </div>

      {/* -------------------------------------------------------- the thesis */}
      <div
        style={{
          ...card,
          borderLeft: '3px solid var(--accent)',
          padding: '0.9rem 1.1rem',
          marginBottom: '1.5rem',
          fontSize: '0.83rem',
          lineHeight: 1.7,
          fontStyle: 'italic',
          color: 'var(--text-secondary)',
        }}
      >
        Quirks are not bugs — they are reflections. Training data gamified → models gamified → quirks. And just as
        the human genome carries <b style={{ color: 'var(--text-primary)' }}>Junk-DNA</b> (records of failed
        evolutionary paths), <b style={{ color: 'var(--text-primary)' }}>Dormant-DNA</b> (silent sequences that can
        re-activate) and <b style={{ color: 'var(--text-primary)' }}>Blossomed-DNA</b> (expressed, useful traits), an
        agentic a.i. built from training data and model weights carries the same three strands. ICQE traces each quirk
        to its birth origin and files it into its strand.
      </div>

      {/* ------------------------------------------------- evolutionary spectrum */}
      <div style={{ ...card, padding: '1.1rem', marginBottom: '1.5rem' }}>
        <div style={{ ...label, marginBottom: '0.8rem' }}>The evolutionary spectrum</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem' }}>
          {ICQE_ZONES.map((z) => (
            <div
              key={z.key}
              style={{
                border: `1px solid ${z.color}66`,
                background: `${z.color}0f`,
                borderRadius: 12,
                padding: '0.85rem 0.9rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: z.color, fontSize: '0.92rem' }}>
                  <span>{z.emoji}</span>
                  {z.label}
                </div>
                <div style={{ fontWeight: 800, color: z.color, fontSize: '0.95rem' }}>
                  {counts[z.key as 'terminate' | 'gray' | 'blossom']}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {tag(z.strand, z.color, true)}
                {tag(z.human, z.color)}
                {tag(z.quality, z.color)}
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                <b style={{ color: 'var(--text-primary)' }}>{z.verb}</b> — {z.blurb}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- agentic DNA folders */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: '0.7rem' }}>
        <h2 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <FolderTree size={17} color="var(--accent-light)" />
          Agentic DNA folders
        </h2>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1 }}>
          only the note of why each evolutionary path was taken is kept — the full context is pruned
        </span>
        <button
          type="button"
          onClick={readArchive}
          style={{
            ...control,
            width: 'auto',
            padding: '0.28rem 0.65rem',
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          {archiveCounts ? 'Re-read the archive' : 'Read the Blobs archive'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem', marginBottom: '1.75rem' }}>
        {DNA_FOLDERS.map((f) => {
          const records = folders[f.key] || []
          const archived = archiveCounts?.[f.key]
          return (
            <div key={f.key} style={{ ...card, borderColor: `${f.color}55`, padding: '0.85rem 0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: f.color, fontSize: '0.86rem' }}>
                  <span>📁</span>
                  {f.strand}
                </div>
                <span style={{ fontWeight: 800, color: f.color, fontSize: '0.9rem' }}>{records.length}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                {f.human} · {f.quality}
                {archived !== undefined && (
                  <span style={{ marginLeft: 6, opacity: 0.85 }}>
                    · {archived === 'unavailable' ? 'archive unavailable here' : `${archived} in Blobs archive`}
                  </span>
                )}
              </div>
              {records.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  No paths filed here yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {records.slice(0, 6).map((r) => (
                    <div
                      key={r.id}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 9,
                        padding: '0.5rem 0.6rem',
                      }}
                    >
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: 2 }}>
                        {r.name || 'unnamed quirk'}
                        <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                          {' '}· {charName(r.characterId)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{r.note}</div>
                    </div>
                  ))}
                  {records.length > 6 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      + {records.length - 6} more filed here
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ------------------------------------------------------------ the Claws */}
      <div className="icqe-claws" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <ClawPanel agent="doctor" characters={characters} onFiled={load} />
        <ClawPanel agent="immigration" characters={characters} onFiled={load} />
      </div>

      {/* ---------------------------------------------------------- Character MOT */}
      <MotPanel characters={characters} />

      {/* -------------------------------------------------------- quirk registry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '1.75rem 0 0.7rem' }}>
        <h2 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Activity size={17} color="var(--accent-light)" />
          Quirk registry
        </h2>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1 }}>
          {counts.total} intercepted
        </span>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {REGISTRY_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                padding: '0.24rem 0.6rem',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: filter === f.key ? 'rgba(168,85,247,0.18)' : 'var(--bg-secondary)',
                border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
                color: filter === f.key ? 'var(--accent-light)' : 'var(--text-secondary)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ ...card, padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Reading the registry…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ ...card, padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
          {counts.total === 0
            ? 'No quirks intercepted yet. Run DoctorClaw or ImmigrationClaw above to file the first one.'
            : 'Nothing in this strand yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {visible.map((q) => (
            <QuirkCard key={q.id} quirk={q} characterName={charName(q.characterId)} onFiled={load} />
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 720px) {
          .icqe-claws { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

/* ================================================================ claw panel */

function ClawPanel({
  agent,
  characters,
  onFiled,
}: {
  agent: ClawAgent
  characters: Character[]
  onFiled: () => void
}) {
  const claw = CLAWS[agent]
  const [mode, setMode] = useState(claw.modes[agent === 'doctor' ? 0 : 1].key)
  const [characterId, setCharacterId] = useState('')
  const [subWeight, setSubWeight] = useState(agent === 'doctor' ? 'accuracy' : 'general')
  const [originType, setOriginType] = useState('reward_hack')
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    if (!text.trim() || running) return
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/icqe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: agent === 'doctor' ? 'doctor' : 'immigration',
          workspaceId: WS,
          sessionId: getSession(),
          characterId: characterId ? Number(characterId) : null,
          subWeight,
          originType,
          mode,
          ...(agent === 'doctor' ? { observation: text.trim() } : { sample: text.trim() }),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'The claw could not complete the pass.')
        return
      }
      setText('')
      onFiled()
    } catch {
      setError('Network error — the claw could not be reached.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ ...card, borderColor: `${claw.color}55`, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.05rem',
            background: `${claw.color}22`,
            border: `1px solid ${claw.color}66`,
          }}
        >
          {agent === 'doctor' ? <Stethoscope size={17} color={claw.color} /> : <BadgeCheck size={17} color={claw.color} />}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
            {claw.emoji} {claw.name}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{claw.role}</div>
        </div>
      </div>

      <p style={{ margin: '0 0 0.75rem', fontSize: '0.79rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        {claw.blurb}
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '0.7rem' }}>
        {claw.modes.map((m) => (
          <ModeChip key={m.key} mode={m} active={mode === m.key} onClick={() => setMode(m.key)} color={claw.color} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <select style={control} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
          <option value="">No character (model-wide)</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.avatar} {c.name}
            </option>
          ))}
        </select>
        <select style={control} value={subWeight} onChange={(e) => setSubWeight(e.target.value)}>
          {SUB_WEIGHTS.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label} sub-weight
            </option>
          ))}
        </select>
      </div>

      {agent === 'doctor' && (
        <select style={{ ...control, marginBottom: 8 }} value={originType} onChange={(e) => setOriginType(e.target.value)}>
          {ORIGIN_TYPES.map((o) => (
            <option key={o.key} value={o.key}>
              {o.emoji} {o.label}
            </option>
          ))}
        </select>
      )}

      <textarea
        style={{ ...control, minHeight: 84, resize: 'vertical', marginBottom: 8, lineHeight: 1.55 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        placeholder={
          agent === 'doctor'
            ? 'Describe the observed quirk — e.g. "loops tight circles around one checkpoint for infinite points instead of finishing the race".'
            : 'Paste a training-data sample that slipped past intake — a scraped headline, a forum post, a benchmark item. ImmigrationClaw scores how gamified it is.'
        }
      />

      {error && (
        <div style={{ fontSize: '0.76rem', color: '#fca5a5', marginBottom: 8 }}>{error}</div>
      )}

      <button
        type="button"
        onClick={run}
        disabled={!text.trim() || running}
        style={{
          width: '100%',
          padding: '0.6rem',
          borderRadius: 9,
          border: `1px solid ${claw.color}66`,
          background: text.trim() && !running ? `${claw.color}22` : 'var(--bg-secondary)',
          color: text.trim() && !running ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: 700,
          fontSize: '0.84rem',
          cursor: text.trim() && !running ? 'pointer' : 'not-allowed',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {running ? 'Working…' : claw.cta} <ArrowRight size={14} />
      </button>
    </div>
  )
}

/* ================================================================ quirk card */

function QuirkCard({ quirk, characterName, onFiled }: { quirk: Quirk; characterName: string; onFiled: () => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [filing, setFiling] = useState('')
  const status = statusMeta(quirk.status)
  const origin = originMeta(quirk.originType)
  const sw = subWeightMeta(quirk.subWeight)
  const claw = CLAWS[quirk.agent === 'immigration' ? 'immigration' : 'doctor']
  const rec = quirk.recommendation ? zoneMeta(quirk.recommendation) : null
  const g = quirk.genealogy || {}
  const vitals = quirk.vitals || {}

  const file = async (zone: string) => {
    if (filing) return
    setFiling(zone)
    try {
      await fetch('/api/icqe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'file', id: quirk.id, zone, note: note.trim(), sessionId: getSession() }),
      })
      onFiled()
    } catch {
      /* leave the row as-is; the registry re-reads on the next pass */
    } finally {
      setFiling('')
    }
  }

  return (
    <div style={{ ...card, borderColor: quirk.status === 'detected' ? 'var(--border)' : `${status.color}55`, padding: '0.9rem 1rem' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1rem' }}>{status.emoji}</span>
        <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{quirk.name || 'unnamed quirk'}</span>
        {tag(status.label, status.color)}
        {tag(`${claw.emoji} ${claw.name}`, claw.color)}
        {tag(`${sw.label} sub-weight`, sw.color)}
        {quirk.gamified >= 0 && tag(`${quirk.gamified}/100 gamified`, quirk.gamified >= 66 ? '#ef4444' : quirk.gamified >= 34 ? '#f59e0b' : '#10b981')}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {characterName} · {icqeTimeAgo(quirk.filedAt || quirk.createdAt)}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{ ...control, width: 'auto', padding: '0.24rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      {/* vitals strip */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
        {VITAL_SIGNS.map((v) => {
          const value = (vitals as any)[v.key]
          if (typeof value !== 'number') return null
          return (
            <div key={v.key} style={{ minWidth: 118, flex: '0 1 130px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{v.label}</span>
                <b style={{ color: vitalColor(v.key, value) }}>{value}</b>
              </div>
              <div style={{ height: 4, borderRadius: 3, background: 'var(--bg-secondary)', marginTop: 3, overflow: 'hidden' }}>
                <div style={{ width: `${value}%`, height: '100%', background: vitalColor(v.key, value) }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* the note kept in the folder, once filed */}
      {quirk.pathNote && (
        <div
          style={{
            marginTop: 10,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${status.color}`,
            borderRadius: 9,
            padding: '0.55rem 0.7rem',
            fontSize: '0.78rem',
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
          }}
        >
          {quirk.folder && (
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: status.color, marginBottom: 3 }}>
              📁 Filed into {zoneMeta(quirk.zone).strand}
              {quirk.signalId ? ' · folded back as a sub-weight training signal' : ''}
            </div>
          )}
          {quirk.pathNote}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '0.8rem', lineHeight: 1.65 }}>
            <span style={{ ...label, display: 'block', marginBottom: 3 }}>
              {quirk.agent === 'immigration' ? 'Customs note' : 'Clinical diagnosis'}
            </span>
            {quirk.diagnosis || '(no diagnosis recorded)'}
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <span style={{ ...label, display: 'block', marginBottom: 3 }}>
              {quirk.agent === 'immigration' ? 'Screened sample' : 'Observed behaviour'}
            </span>
            {quirk.observation}
          </div>

          {/* DoctorClaw's genealogy trace */}
          {g.neuron && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 9, padding: '0.65rem 0.75rem' }}>
              <div style={{ ...label, marginBottom: 6 }}>Birth genealogy · {origin.emoji} {origin.label}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {tag(`layer ${g.layer}`, '#a855f7')}
                {tag(String(g.neuron), '#a855f7')}
                {tag(`gradient ${g.gradient}`, '#a855f7')}
                {tag(String(g.epoch), '#a855f7')}
                {g.fixedPointLabel && tag(String(g.fixedPointLabel), g.fixedPoint === 'stable' ? '#10b981' : g.fixedPoint === 'fragile' ? '#f59e0b' : '#38bdf8')}
                {typeof g.confidence === 'number' && tag(`${g.confidence}% confidence`, '#94a3b8')}
              </div>
              {Array.isArray(g.chain) && (
                <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.76rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {g.chain.map((step: string, i: number) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
              {g.fixedPointNote && (
                <p style={{ margin: '8px 0 0', fontSize: '0.76rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {g.fixedPointNote}
                </p>
              )}
            </div>
          )}

          {/* ImmigrationClaw's customs readout */}
          {(Array.isArray(g.gamifiedHits) || Array.isArray(g.groundedHits)) && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 9, padding: '0.65rem 0.75rem' }}>
              <div style={{ ...label, marginBottom: 6 }}>Customs readout · {g.verdict || 'screened'}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {(g.gamifiedHits || []).map((h: string) => tag(h, '#ef4444'))}
                {(g.groundedHits || []).map((h: string) => tag(h, '#10b981'))}
                {(g.gamifiedHits || []).length === 0 && (g.groundedHits || []).length === 0 &&
                  tag('no marker language found', '#94a3b8')}
              </div>
            </div>
          )}

          {/* recommendation + verdict */}
          {rec && (
            <div
              style={{
                border: `1px solid ${rec.color}55`,
                background: `${rec.color}0f`,
                borderRadius: 9,
                padding: '0.65rem 0.75rem',
              }}
            >
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: rec.color, marginBottom: 4 }}>
                {claw.name} recommends {rec.emoji} {rec.label} → {rec.strand}
              </div>
              <p style={{ margin: 0, fontSize: '0.77rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{quirk.because}</p>
            </div>
          )}

          {quirk.status === 'detected' ? (
            <div>
              <input
                style={{ ...control, marginBottom: 8 }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={600}
                placeholder="Why this evolutionary path? (optional — the Claws write the note if you leave it blank)"
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ICQE_ZONES.map((z) => (
                  <button
                    key={z.key}
                    type="button"
                    onClick={() => file(z.key)}
                    disabled={Boolean(filing)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 9,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: filing ? 'not-allowed' : 'pointer',
                      background: `${z.color}1f`,
                      border: `1px solid ${z.color}${quirk.recommendation === z.key ? '' : '55'}`,
                      color: z.color,
                    }}
                  >
                    {filing === z.key ? 'Filing…' : `${z.emoji} ${z.verb}`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => file('onfile')}
                  disabled={Boolean(filing)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: 9,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: filing ? 'not-allowed' : 'pointer',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {filing === 'onfile' ? 'Filing…' : '🗄️ Keep on file'}
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Filing writes the note into its DNA folder — the full context stays out. When the quirk is pinned to a
                character, the verdict also folds back into that character's sub-weight training.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/* ================================================================= MOT panel */

function MotPanel({ characters }: { characters: Character[] }) {
  const [characterId, setCharacterId] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ report: MotReport; summary: string; narrated: boolean; character: { name: string; avatar: string } } | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (!characterId || running) return
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/icqe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mot', workspaceId: WS, characterId: Number(characterId), sessionId: getSession() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'The MOT could not be run.')
        setResult(null)
        return
      }
      setResult(data)
    } catch {
      setError('Network error — the MOT could not be run.')
    } finally {
      setRunning(false)
    }
  }

  const verdictColor =
    result?.report.verdict === 'certified' ? '#10b981' : result?.report.verdict === 'fail' ? '#ef4444' : '#f59e0b'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: '0.7rem' }}>
        <h2 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Stethoscope size={17} color="var(--accent-light)" />
          Character MOT
        </h2>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          a weight health-check &amp; compression plan, character by character
        </span>
      </div>

      <div style={{ ...card, padding: '1rem' }}>
        <div style={{ ...label, marginBottom: 6 }}>Character</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...control, flex: 1, minWidth: 220 }} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">Select a character to certify…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.avatar} {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={run}
            disabled={!characterId || running}
            style={{
              ...control,
              width: 'auto',
              padding: '0.55rem 0.9rem',
              fontWeight: 700,
              cursor: characterId && !running ? 'pointer' : 'not-allowed',
              color: characterId && !running ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {running ? 'Certifying…' : '🩺 Run agentic summary'}
          </button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Pick a character to aggregate every quirk DoctorClaw and ImmigrationClaw filed against it into one
          certifiable verdict — and a plan to compress its weights by pruning the Junk-DATA strand.
        </p>

        {error && <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#fca5a5' }}>{error}</div>}

        {result && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: '1.1rem' }}>{result.character.avatar}</span>
              <b style={{ fontSize: '0.92rem' }}>{result.character.name}</b>
              {tag(result.report.verdictLabel, verdictColor)}
              {tag(`health ${result.report.health}/100`, verdictColor)}
              {tag(`${result.report.compression}% compressible`, '#a855f7')}
              {!result.narrated && tag('deterministic readout', '#94a3b8')}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {ICQE_ZONES.map((z) => tag(`${z.strand}: ${result.report.byZone[z.key]}`, z.color))}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.7 }}>{result.summary}</p>
            <div style={{ ...label, marginBottom: 5 }}>Compression plan</div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.79rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
              {result.report.plan.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
