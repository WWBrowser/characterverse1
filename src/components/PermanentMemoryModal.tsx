import { X, Crown } from 'lucide-react'
import { PERMANENT_MEMORY_PERKS } from '../lib/chat-experience'

/**
 * The "Permanent Memory" upsell — the Ultimate Member exclusive. Shown over the
 * chat and the Permanent Memory page when a user taps Unlock. `onUnlock` flips the
 * account to premium (a demo membership) and closes.
 */
export function PermanentMemoryModal({
  onClose,
  onUnlock,
}: {
  onClose: () => void
  onUnlock: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(6,6,12,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: 340,
          borderRadius: 22,
          padding: '1.6rem 1.4rem',
          position: 'relative',
          background: 'linear-gradient(165deg, #2a1840 0%, #1a1330 55%, #140d22 100%)',
          border: '1px solid rgba(167,139,250,0.3)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>

        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            background: 'linear-gradient(135deg, #f472b6, #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.9rem',
          }}
        >
          <Crown size={24} color="white" fill="white" />
        </div>

        <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', marginBottom: '1rem' }}>
          Permanent Memory
        </h2>

        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '1.4rem' }}>
          {PERMANENT_MEMORY_PERKS.map((perk) => (
            <li key={perk} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#e8e8f5', fontSize: '0.92rem' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f472b6, #a855f7)',
                  flexShrink: 0,
                }}
              />
              {perk}
            </li>
          ))}
        </ul>

        <button
          onClick={onUnlock}
          style={{
            width: '100%',
            padding: '0.95rem',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 800,
            color: '#1a1330',
            background: 'linear-gradient(95deg, #c4b5fd 0%, #f5d0fe 50%, #fbcfe8 100%)',
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  )
}
