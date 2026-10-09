import { useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CvvShell } from '../lib/cvv-ui'
import { CVV_CATEGORIES, CVV_POSTERS, CVV_MAX_UPLOAD_BYTES, CVV_CHUNK_BYTES, formatBytes } from '../lib/cvv'
import { getSession } from '../lib/session'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function UploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('Vlogs')
  const [poster, setPoster] = useState('🎬')
  const [durationLabel, setDurationLabel] = useState('')
  const [channelName, setChannelName] = useState('')
  const [channelHandle, setChannelHandle] = useState('')

  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function onPickFile(f: File | null) {
    setError('')
    if (!f) {
      setFile(null)
      return
    }
    if (!f.type.startsWith('video/')) {
      setError('Please choose a video file.')
      return
    }
    if (f.size > CVV_MAX_UPLOAD_BYTES) {
      setError(`That tape is ${formatBytes(f.size)} — over the ${formatBytes(CVV_MAX_UPLOAD_BYTES)} limit.`)
      return
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 140))
    // Read the real duration off the file so the card shows an accurate badge.
    const url = URL.createObjectURL(f)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      const secs = Math.floor(probe.duration)
      if (Number.isFinite(secs) && secs > 0) {
        const h = Math.floor(secs / 3600)
        const m = Math.floor((secs % 3600) / 60)
        const s = secs % 60
        setDurationLabel(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`)
      }
    }
    probe.src = url
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || uploading) return
    setError('')
    setUploading(true)
    setProgress(0)
    void broadcast()
  }

  // Two-step upload. Step 1 creates the tape record (JSON). If a file is
  // attached, step 2 streams it to the server in chunks — each request stays
  // under Netlify's ~6 MB function body limit — then finalizes. This is what a
  // whole-file POST could never do for a real video.
  async function broadcast() {
    const sessionId = getSession()
    try {
      const createRes = await fetch('/api/cvv/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          poster,
          durationLabel,
          channelName: channelName.trim(),
          channelHandle: channelHandle.trim(),
          sessionId,
          hasFile: !!file,
          mimeType: file?.type || 'video/mp4',
          sizeBytes: file?.size || 0,
        }),
      })
      const created = await createRes.json().catch(() => ({}))
      if (!createRes.ok) {
        setError(created.error || 'Could not start the upload.')
        setUploading(false)
        return
      }

      // Poster-only archive reel: nothing to stream, jump to the watch page.
      if (created.done) {
        navigate({ to: '/cvv/watch/$id', params: { id: String(created.id) } })
        return
      }

      const uploadId: string = created.uploadId
      const f = file!
      const totalParts = Math.max(1, Math.ceil(f.size / CVV_CHUNK_BYTES))

      for (let i = 0; i < totalParts; i++) {
        const slice = f.slice(i * CVV_CHUNK_BYTES, Math.min(f.size, (i + 1) * CVV_CHUNK_BYTES))
        const res = await fetch(
          `/api/cvv/chunk/${uploadId}?part=${i}&parts=${totalParts}&sessionId=${encodeURIComponent(sessionId)}`,
          { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: slice },
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setError(err.error || `Upload failed on chunk ${i + 1}.`)
          setUploading(false)
          return
        }
        // Reserve the last slice of the bar for finalization/producing.
        setProgress(Math.round(((i + 1) / totalParts) * 92))
      }

      setProgress(96)
      const finRes = await fetch(
        `/api/cvv/chunk/${uploadId}?parts=${totalParts}&sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'POST' },
      )
      const fin = await finRes.json().catch(() => ({}))
      if (!finRes.ok) {
        setError(fin.error || 'Could not finalize the tape.')
        setUploading(false)
        return
      }
      setProgress(100)
      navigate({ to: '/cvv/watch/$id', params: { id: String(fin.id) } })
    } catch {
      setError('Network error during upload.')
      setUploading(false)
    }
  }

  return (
    <CvvShell active="upload">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>📼 Upload a tape</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          Drop a clip and broadcast it. ReelClaw, the agentic producer, writes your summary, tags and host intro the
          moment it lands. Videos up to {formatBytes(CVV_MAX_UPLOAD_BYTES)}.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* File drop */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              onPickFile(e.dataTransfer.files?.[0] || null)
            }}
            style={{
              border: `2px dashed ${file ? 'var(--cvv-red)' : 'var(--cvv-line)'}`,
              borderRadius: 12, padding: '1.75rem 1rem', textAlign: 'center', cursor: 'pointer',
              background: 'var(--cvv-panel)',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => onPickFile(e.target.files?.[0] || null)}
            />
            <div style={{ fontSize: '2.2rem', marginBottom: 6 }}>{file ? '🎞️' : '⬆️'}</div>
            {file ? (
              <div>
                <div style={{ fontWeight: 700 }}>{file.name}</div>
                <div className="cvv-vmeta">{formatBytes(file.size)}{durationLabel ? ` · ${durationLabel}` : ''} · click to replace</div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 700 }}>Choose a video or drag it here</div>
                <div className="cvv-vmeta">MP4, WebM, MOV… — or skip the file to post a poster-only archive reel</div>
              </div>
            )}
          </div>

          <div>
            <label className="cvv-label">Title</label>
            <input className="cvv-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="me talking to my webcam for 3 minutes" />
          </div>

          <div>
            <label className="cvv-label">Description</label>
            <textarea className="cvv-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="first video!! is this thing on??" />
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="cvv-label">Category</label>
              <select className="cvv-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CVV_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="cvv-label">Duration label</label>
              <input className="cvv-input" value={durationLabel} onChange={(e) => setDurationLabel(e.target.value)} placeholder="3:41" maxLength={12} />
            </div>
          </div>

          <div>
            <label className="cvv-label">Poster</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CVV_POSTERS.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPoster(p)}
                  style={{
                    fontSize: '1.3rem', width: 42, height: 42, borderRadius: 8, cursor: 'pointer',
                    background: poster === p ? 'var(--cvv-red)' : 'var(--bg-card)',
                    border: `1px solid ${poster === p ? 'var(--cvv-red)' : 'var(--cvv-line)'}`,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--cvv-line)', paddingTop: '1rem' }}>
            <label className="cvv-label">Your channel</label>
            <p className="cvv-vmeta" style={{ marginBottom: 8 }}>
              First upload? Name your channel and it's created for you. Later tapes join the same channel automatically.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <input className="cvv-input" value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Late Nite Tape Deck" maxLength={60} />
              </div>
              <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="cvv-vmeta">/cvv/channel/</span>
                <input
                  className="cvv-input"
                  value={channelHandle}
                  onChange={(e) => setChannelHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="latenite"
                  maxLength={24}
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(204,24,30,0.14)', border: '1px solid var(--cvv-red)', borderRadius: 8, padding: '0.7rem 0.9rem', color: '#ff9a9a', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          {uploading && (
            <div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #e0242a, var(--cvv-red))', transition: 'width 0.15s' }} />
              </div>
              <div className="cvv-vmeta" style={{ marginTop: 6 }}>
                {progress < 92 ? `Uploading… ${progress}%` : progress < 100 ? 'Assembling your tape…' : 'Rolling…'}
              </div>
            </div>
          )}

          <div>
            <button type="submit" className="cvv-btn cvv-btn-red" disabled={!title.trim() || uploading} style={{ fontSize: '0.9rem', padding: '10px 20px' }}>
              {uploading ? 'Broadcasting…' : '▶ Broadcast it'}
            </button>
          </div>
        </form>
      </div>
    </CvvShell>
  )
}

export const Route = createFileRoute('/cvv/upload')({
  component: UploadPage,
})
