import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, Lock, Pin, ChevronRight, Pencil, Crown, Sparkles } from 'lucide-react'
import { getSessionId } from '../lib/create-ui'
import { PermanentMemoryModal } from '../components/PermanentMemoryModal'
import {
  BOND_SECTIONS,
  CHARACTER_FIELDS,
  USER_FIELDS,
  type ChatSettings,
  type MemoryField,
} from '../lib/chat-experience'

type Character = { id: number; name: string; avatar: string; category: string; createdAt: string }
type Tab = 'bond' | 'character' | 'user'

type PMMap = Record<string, string>
type PM = { bond?: PMMap; character?: PMMap; user?: PMMap }

function daysSince(iso: string): number {
  if (!iso) return 1
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 1
  return Math.max(1, Math.ceil((Date.now() - then) / 86400000))
}

function PermanentMemoryPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [character, setCharacter] = useState<Character | null>(null)
  const [settings, setSettings] = useState<ChatSettings | null>(null)
  const [tab, setTab] = useState<Tab>('bond')
  const [bondSection, setBondSection] = useState(BOND_SECTIONS[0].key)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PM>({})
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const sessionId = getSessionId()
    fetch(`/api/characters/${id}`).then((r) => r.json()).then((d) => { if (!d.error) setCharacter(d) }).catch(() => {})
    fetch(`/api/chat-settings/${id}?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) { setSettings(d); setDraft(d.permanentMemory || {}) } })
      .catch(() => {})
  }, [id])

  const premium = !!settings?.premium
  const pm: PM = settings?.permanentMemory || {}

  const counts = useMemo(() => {
    const count = (m?: PMMap) => Object.values(m || {}).filter((v) => v && v.trim()).length
    return { bond: count(pm.bond), character: count(pm.character), user: count(pm.user) }
  }, [pm])

  const persist = (next: PM) => {
    setDraft(next)
    setSettings((prev) => (prev ? { ...prev, permanentMemory: next } : prev))
    fetch(`/api/chat-settings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSessionId(), permanentMemory: next }),
    }).catch(() => {})
  }

  const unlock = () => {
    setShowModal(false)
    setSettings((prev) => (prev ? { ...prev, premium: true } : prev))
    fetch(`/api/chat-settings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSessionId(), premium: true }),
    }).catch(() => {})
  }

  const setField = (group: Tab, key: string, value: string) => {
    const next: PM = { ...draft, [group]: { ...(draft[group] || {}), [key]: value } }
    setDraft(next)
  }
  const saveEdits = () => {
    persist(draft)
    setEditing(false)
  }

  const headerBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: 'linear-gradient(180deg, #1a1230 0%, #120c20 40%, #0d0d14 100%)', color: 'var(--text-primary)', paddingBottom: '6rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '1rem', position: 'relative' }}>
        <button onClick={() => navigate({ to: '/chat/$id', params: { id } })} style={{ ...headerBtn, position: 'absolute', left: '1rem' }} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>Permanent Memory</h1>
        <BookOpen size={20} color="#fff" style={{ position: 'absolute', right: '1rem' }} />
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 1rem' }}>
        {/* Days */}
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          📅 Our Memories for <b style={{ color: '#fff' }}>{character ? daysSince(character.createdAt) : 1}</b> Day(s)
        </div>

        {/* Pinned */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.95rem 1rem', borderRadius: 14,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '1.4rem',
          }}
        >
          <Pin size={16} color="#fff" fill="#fff" />
          <span style={{ flex: 1, fontWeight: 700, color: '#fff' }}>Pinned</span>
          {premium ? <ChevronRight size={18} color="var(--text-secondary)" /> : <Lock size={15} color="var(--text-secondary)" />}
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.85rem' }}>Memory</h2>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.1rem' }}>
          {(['bond', 'character', 'user'] as Tab[]).map((t) => {
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => { setTab(t); setEditing(false) }}
                style={{
                  padding: '0.65rem', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                  border: active ? '1px solid #c084fc' : '1px solid rgba(255,255,255,0.09)',
                  background: active ? 'linear-gradient(135deg, rgba(124,92,191,0.5), rgba(192,132,252,0.25))' : 'rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{t}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{counts[t]}</div>
              </button>
            )
          })}
        </div>

        {/* Bond sub-tabs */}
        {tab === 'bond' && (
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.2rem' }}>
            {BOND_SECTIONS.map((s) => {
              const active = bondSection === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => setBondSection(s.key)}
                  style={{
                    flexShrink: 0, padding: '0.45rem 0.9rem', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    border: '1px solid', borderColor: active ? '#fff' : 'rgba(255,255,255,0.12)',
                    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap',
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Field card */}
        {tab === 'bond' && (
          <FieldCard
            fields={BOND_SECTIONS.find((s) => s.key === bondSection)!.fields}
            group="bond"
            keyPrefix={`${bondSection}__`}
            premium={premium}
            allPremium
            editing={editing}
            draft={draft}
            onChange={setField}
          />
        )}
        {tab === 'character' && (
          <FieldCard fields={CHARACTER_FIELDS} group="character" premium={premium} allPremium editing={editing} draft={draft} onChange={setField} />
        )}
        {tab === 'user' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{ fontWeight: 800, color: '#fff', flex: 1 }}>User</span>
              <button
                onClick={() => (editing ? saveEdits() : setEditing(true))}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: 'var(--accent-light)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}
              >
                <Pencil size={14} /> {editing ? 'Save' : 'Edit'}
              </button>
            </div>
            <FieldCard fields={USER_FIELDS} group="user" premium={premium} editing={editing} draft={draft} onChange={setField} />
          </>
        )}
      </div>

      {/* Unlock bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '1rem', background: 'linear-gradient(180deg, transparent, #0d0d14 40%)', display: 'flex', justifyContent: 'center', zIndex: 20 }}>
        {premium ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f5d0fe', fontWeight: 700, fontSize: '0.9rem' }}>
            <Sparkles size={16} /> Ultimate Member — Permanent Memory unlocked
          </div>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            style={{
              width: '100%', maxWidth: 480, padding: '0.95rem', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: '1rem', fontWeight: 800, color: '#1a1330',
              background: 'linear-gradient(95deg, #c4b5fd 0%, #f5d0fe 50%, #fbcfe8 100%)',
            }}
          >
            Unlock
          </button>
        )}
      </div>

      {showModal && <PermanentMemoryModal onClose={() => setShowModal(false)} onUnlock={unlock} />}
    </div>
  )
}

function FieldCard({
  fields,
  group,
  keyPrefix = '',
  premium,
  allPremium = false,
  editing,
  draft,
  onChange,
}: {
  fields: MemoryField[]
  group: Tab
  keyPrefix?: string
  premium: boolean
  allPremium?: boolean
  editing: boolean
  draft: PM
  onChange: (group: Tab, key: string, value: string) => void
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
      {fields.map((f, i) => {
        const fieldKey = keyPrefix + f.key
        const isPremiumField = allPremium || !!f.premium
        const locked = isPremiumField && !premium
        const value = (draft[group] || {})[fieldKey] || ''
        const editable = editing && !locked

        return (
          <div
            key={fieldKey}
            style={{
              padding: '0.85rem 1rem',
              borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={13} color="var(--accent-light)" style={{ opacity: 0.7 }} />
              <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: locked ? 'var(--text-secondary)' : '#fff' }}>{f.label}</span>
              {f.premium && <Crown size={13} color="#e879f9" fill="#e879f9" />}
              {locked && <Lock size={13} color="var(--text-secondary)" />}
            </div>

            {/* Value / editor */}
            <div style={{ marginTop: '0.3rem', paddingLeft: '1.1rem' }}>
              {locked ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <Lock size={12} /> Purchase a membership to unlock
                </span>
              ) : editable ? (
                <input
                  value={value}
                  onChange={(e) => onChange(group, fieldKey, e.target.value)}
                  placeholder="—"
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, padding: '0.45rem 0.6rem', color: '#fff', fontSize: '0.85rem', outline: 'none',
                  }}
                />
              ) : (
                <span style={{ fontSize: '0.85rem', color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{value || '-'}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const Route = createFileRoute('/permanent/$id')({
  component: PermanentMemoryPage,
})
