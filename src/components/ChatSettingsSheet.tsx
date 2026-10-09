import { useState } from 'react'
import { X, ChevronRight, User, Image as ImageIcon, Sparkles, Mic, Flag, Volume2, FastForward } from 'lucide-react'
import { BACKGROUNDS, DECORATIONS, VOICES, type ChatSettings } from '../lib/chat-experience'

function SaleBadge() {
  return (
    <span
      style={{
        fontSize: '0.6rem',
        fontWeight: 800,
        color: '#1a1a14',
        background: 'linear-gradient(135deg, #bef264, #a3e635)',
        padding: '0.05rem 0.4rem',
        borderRadius: 5,
        marginLeft: '0.45rem',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
      }}
    >
      Sale
    </span>
  )
}

function NewBadge() {
  return (
    <span
      style={{
        fontSize: '0.6rem',
        fontWeight: 800,
        color: '#fff',
        background: '#ef4444',
        padding: '0.05rem 0.4rem',
        borderRadius: 5,
        marginLeft: '0.45rem',
        textTransform: 'uppercase',
      }}
    >
      New
    </span>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        flexShrink: 0,
        padding: 3,
        background: on ? 'linear-gradient(135deg, #7c5cbf, #6366f1)' : 'rgba(255,255,255,0.16)',
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'background 0.15s',
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', display: 'block' }} />
    </button>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  width: '100%',
  padding: '0.95rem 1rem',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.045)',
  border: '1px solid rgba(255,255,255,0.06)',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
}

type Panel = null | 'persona' | 'background' | 'decoration' | 'voice' | 'report'

/**
 * The "Chat Settings" bottom sheet from the immersive chat — User Persona,
 * Background, Decoration, Custom Voice, Report, plus the Voice Autoplay (app-wide)
 * and Go On Button toggles. Each change is persisted through `onPatch`.
 */
export function ChatSettingsSheet({
  characterName,
  settings,
  onPatch,
  onClose,
}: {
  characterName: string
  settings: ChatSettings
  onPatch: (patch: Partial<ChatSettings>) => void
  onClose: () => void
}) {
  const [panel, setPanel] = useState<Panel>(null)
  const [personaDraft, setPersonaDraft] = useState(settings.userPersona)

  const ChevronRow = ({
    icon,
    label,
    badge,
    onClick,
  }: {
    icon: React.ReactNode
    label: string
    badge?: React.ReactNode
    onClick: () => void
  }) => (
    <button style={rowStyle} onClick={onClick}>
      <span style={{ color: 'var(--accent-light)', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        {label}
        {badge}
      </span>
      <ChevronRight size={18} color="var(--text-secondary)" />
    </button>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(4,4,10,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cv-sheet-up"
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #17131f 0%, #100c18 100%)',
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          border: '1px solid rgba(255,255,255,0.07)',
          borderBottom: 'none',
          padding: '1.1rem 1.1rem 2rem',
        }}
      >
        {/* Grabber */}
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '0 auto 0.9rem' }} />

        {panel === null && (
          <>
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: '1.2rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>Chat Settings</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{ position: 'absolute', top: -2, right: 0, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <ChevronRow icon={<User size={18} />} label="User Persona" onClick={() => setPanel('persona')} />
              <ChevronRow icon={<ImageIcon size={18} />} label="Background" badge={<SaleBadge />} onClick={() => setPanel('background')} />
              <ChevronRow icon={<Sparkles size={18} />} label="Decoration" badge={<SaleBadge />} onClick={() => setPanel('decoration')} />
              <ChevronRow icon={<Mic size={18} />} label="Custom Voice" onClick={() => setPanel('voice')} />
              <ChevronRow icon={<Flag size={18} />} label="Report" onClick={() => setPanel('report')} />

              {/* Toggle rows */}
              <div style={{ ...rowStyle, cursor: 'default' }}>
                <span style={{ color: 'var(--accent-light)', display: 'flex' }}><Volume2 size={18} /></span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  Voice Autoplay <span style={{ color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '0.4rem', fontSize: '0.82rem' }}>(App-wide)</span>
                  <SaleBadge />
                </span>
                <Toggle on={settings.voiceAutoplay} onClick={() => onPatch({ voiceAutoplay: !settings.voiceAutoplay })} />
              </div>

              <div style={{ ...rowStyle, cursor: 'default' }}>
                <span style={{ color: 'var(--accent-light)', display: 'flex' }}><FastForward size={18} /></span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  Go On Button <NewBadge />
                </span>
                <Toggle on={settings.goOnButton} onClick={() => onPatch({ goOnButton: !settings.goOnButton })} />
              </div>
            </div>
          </>
        )}

        {panel === 'persona' && (
          <SubPanel title="User Persona" onBack={() => setPanel(null)}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>
              Tell {characterName} who you are in the scene — your name, role, look, or anything they should know about you.
            </p>
            <textarea
              value={personaDraft}
              onChange={(e) => setPersonaDraft(e.target.value)}
              placeholder="e.g. I'm Mira, a wandering cartographer with a quick wit and a soft spot for strays."
              maxLength={600}
              style={{
                width: '100%',
                minHeight: 130,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '0.85rem',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                resize: 'vertical',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <SaveButton
              label="Save persona"
              onClick={() => {
                onPatch({ userPersona: personaDraft })
                setPanel(null)
              }}
            />
          </SubPanel>
        )}

        {panel === 'background' && (
          <SubPanel title="Background" onBack={() => setPanel(null)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              {BACKGROUNDS.map((b) => {
                const active = settings.background === b.id
                return (
                  <button
                    key={b.id}
                    onClick={() => onPatch({ background: b.id })}
                    style={{
                      borderRadius: 14,
                      padding: 0,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: active ? '2px solid var(--accent-light)' : '1px solid rgba(255,255,255,0.1)',
                      background: 'transparent',
                    }}
                  >
                    <div style={{ height: 64, background: b.css || 'linear-gradient(160deg,#3a2a52,#15101f)' }} />
                    <div style={{ padding: '0.5rem', fontSize: '0.78rem', fontWeight: 600, color: active ? 'var(--accent-light)' : 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)' }}>
                      {b.label}
                    </div>
                  </button>
                )
              })}
            </div>
          </SubPanel>
        )}

        {panel === 'decoration' && (
          <SubPanel title="Decoration" onBack={() => setPanel(null)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              {DECORATIONS.map((d) => {
                const active = settings.decoration === d.id
                return (
                  <button
                    key={d.id}
                    onClick={() => onPatch({ decoration: d.id })}
                    style={{
                      borderRadius: 14,
                      padding: 0,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: active ? '2px solid var(--accent-light)' : '1px solid rgba(255,255,255,0.1)',
                      background: 'transparent',
                    }}
                  >
                    <div style={{ height: 64, background: `#15101f ${d.tint ? '' : ''}`, backgroundImage: d.tint || 'none' }} />
                    <div style={{ padding: '0.5rem', fontSize: '0.78rem', fontWeight: 600, color: active ? 'var(--accent-light)' : 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)' }}>
                      {d.label}
                    </div>
                  </button>
                )
              })}
            </div>
          </SubPanel>
        )}

        {panel === 'voice' && (
          <SubPanel title="Custom Voice" onBack={() => setPanel(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {VOICES.map((v) => {
                const value = v === 'System default' ? '' : v
                const active = settings.customVoice === value
                return (
                  <button
                    key={v}
                    onClick={() => onPatch({ customVoice: value })}
                    style={{
                      ...rowStyle,
                      border: active ? '1px solid var(--accent-light)' : '1px solid rgba(255,255,255,0.06)',
                      color: active ? 'var(--accent-light)' : 'var(--text-primary)',
                    }}
                  >
                    <Mic size={16} />
                    <span style={{ flex: 1 }}>{v}</span>
                    {active && <span style={{ fontSize: '0.78rem' }}>Selected</span>}
                  </button>
                )
              })}
            </div>
          </SubPanel>
        )}

        {panel === 'report' && (
          <SubPanel title="Report" onBack={() => setPanel(null)}>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '1rem' }}>
              Something wrong with how {characterName} is behaving? Reporting flags this chat for review by the moderation team. Your transcript stays private to the reviewers.
            </p>
            <SaveButton
              label="Submit report"
              onClick={() => {
                setPanel(null)
                onClose()
              }}
            />
          </SubPanel>
        )}
      </div>
    </div>
  )
}

function SubPanel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.1rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', transform: 'rotate(180deg)' }}>
          <ChevronRight size={20} />
        </button>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{title}</h2>
      </div>
      {children}
    </>
  )
}

function SaveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: '1rem',
        width: '100%',
        padding: '0.85rem',
        borderRadius: 12,
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.95rem',
        fontWeight: 700,
        color: '#fff',
        background: 'linear-gradient(135deg, #7c5cbf, #4f46e5)',
      }}
    >
      {label}
    </button>
  )
}
