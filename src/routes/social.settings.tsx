import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CvsShell, Panel, PixelAvatar, useMe, MOODS, ACCENTS } from '../lib/social-ui'
import {
  sanitizeCss, THEME_PRESETS, CSS_HOOKS, starterCss, randomThemeCss,
  STUDIO_FONTS, paletteFromSeed, buildStudioCss, type StudioOpts,
} from '../lib/social-css'
import { renderArt, randomSeedPhrase } from '../lib/social-art'

type Form = {
  displayName: string; accent: string; mood: string; status: string
  headline: string; region: string; pronouns: string
  values: string; interests: string; bio: string; wantToMeet: string
  customCss: string; isPrivate: boolean; agentShadowing: boolean
}

const EMPTY: Form = {
  displayName: '', accent: ACCENTS[0], mood: 'online', status: '',
  headline: '', region: '', pronouns: '', values: '', interests: '', bio: '', wantToMeet: '',
  customCss: '', isPrivate: false, agentShadowing: false,
}

type PreviewInfo = { name?: string; mood?: string; status?: string; bio?: string; region?: string }

// A self-contained document for the live preview iframe — a compact replica of the
// profile's base styles with the given custom CSS layered on top. Sandboxed, so the
// preview can never touch the settings page around it.
function previewDoc(css: string, info: PreviewInfo = {}): string {
  const base = `
    html,body{height:100%;margin:0;}
    body{font-family:Tahoma,Geneva,Verdana,sans-serif;font-size:12px;color:#14213d;}
    .cvs{min-height:100%;background:#c3cde1;padding:10px;}
    .cvs-panel{background:#fff;border:1px solid #90a2cc;border-radius:4px;margin-bottom:10px;overflow:hidden;}
    .cvs-panel-title{background:linear-gradient(180deg,#6d84c0,#4d66a6);color:#fff;font-weight:700;padding:5px 10px;}
    .cvs-panel-body{padding:10px;}
    .cvs-spec td{padding:3px 6px;} .cvs-spec td.k{font-weight:700;color:#2b3f6b;}
    .cvs-chip{display:inline-block;background:#e7edfb;border:1px solid #b9c6e8;color:#2b3f6b;border-radius:10px;padding:1px 8px;margin:0 4px 4px 0;}
    a{color:#16387a;}
  `
  const clean = (s: string) => (s || '').replace(/[<>]/g, '')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style><style>${sanitizeCss(css)}</style></head>
  <body><div class="cvs"><div class="cvs-profile-root">
    <div class="cvs-panel"><div class="cvs-panel-title">${clean(info.name || 'you')}</div><div class="cvs-panel-body">
      <b>mood:</b> ${clean(info.mood || 'online')}<br>“${clean(info.status || 'hello world')}”
    </div></div>
    <div class="cvs-panel"><div class="cvs-panel-title">About me</div><div class="cvs-panel-body">
      ${clean(info.bio || 'A short blurb about you goes here.')}
      <div style="margin-top:8px"><span class="cvs-chip">example</span><span class="cvs-chip">interest</span></div>
    </div></div>
    <div class="cvs-panel"><div class="cvs-panel-title">Identity &amp; Values</div><div class="cvs-panel-body">
      <table class="cvs-spec"><tr><td class="k">Region</td><td>${clean(info.region || '—')}</td></tr></table>
    </div></div>
  </div></div></body></html>`
}

function SettingsPage() {
  const { me, loading, refresh } = useMe()
  const [tab, setTab] = useState<'profile' | 'design' | 'studio'>('profile')
  const [f, setF] = useState<Form>(EMPTY)
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (me && !seeded) {
      setF({
        displayName: me.displayName || '', accent: me.accent || ACCENTS[0], mood: me.mood || 'online', status: me.status || '',
        headline: me.headline || '', region: me.region || '', pronouns: me.pronouns || '',
        values: me.values || '', interests: me.interests || '', bio: me.bio || '', wantToMeet: me.wantToMeet || '',
        customCss: me.customCss || '', isPrivate: !!me.isPrivate, agentShadowing: !!me.agentShadowing,
      })
      setSeeded(true)
    }
  }, [me, seeded])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  const save = async (override?: Partial<Form>) => {
    setSaving(true); setMsg('')
    const payload = { ...f, ...override }
    const res = await fetch('/api/social/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (res.ok) { setMsg('Saved!'); refresh() } else { setMsg('Could not save.') }
  }

  const info: PreviewInfo = { name: f.displayName || me?.handle, mood: f.mood, status: f.status, bio: f.bio, region: f.region }

  if (!loading && !me) {
    return (
      <CvsShell active="settings">
        <div className="cvs-main" style={{ maxWidth: 480 }}>
          <Panel title="Settings">
            <p>You need to be signed in to edit your profile.</p>
            <p style={{ marginTop: 8 }}><Link to="/social/login">Log in</Link> · <Link to="/social/signup">Create an account</Link></p>
          </Panel>
        </div>
      </CvsShell>
    )
  }

  return (
    <CvsShell active="settings">
      <div className="cvs-main">
        <Panel
          title="Account settings"
          action={me ? <Link to="/social/u/$handle" params={{ handle: me.handle }}>View my profile »</Link> : undefined}
        >
          <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <button className={`cvs-btn ${tab === 'profile' ? 'primary' : ''}`} onClick={() => setTab('profile')}>Profile info</button>
            <button className={`cvs-btn ${tab === 'design' ? 'primary' : ''}`} onClick={() => setTab('design')}>🎨 Page designer</button>
            <button className={`cvs-btn ${tab === 'studio' ? 'primary' : ''}`} onClick={() => setTab('studio')}>
              ✦ Designer+ <span style={{ fontSize: 9, fontWeight: 700, background: '#facc15', color: '#4a3500', borderRadius: 3, padding: '0 4px', marginLeft: 2 }}>PREMIUM</span>
            </button>
          </div>
        </Panel>

        {tab === 'profile' && (
          <Panel title="Profile info">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <PixelAvatar seed={me?.handle || 'you'} accent={f.accent} size={110} />
                <div style={{ fontSize: 11, color: '#5a6785', marginTop: 4 }}>@{me?.handle}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 120, marginTop: 8 }}>
                  {ACCENTS.map((c) => (
                    <button type="button" key={c} onClick={() => set('accent', c)} aria-label={c}
                      style={{ width: 20, height: 20, background: c, border: f.accent === c ? '2px solid #14213d' : '1px solid #999', cursor: 'pointer', borderRadius: 3 }} />
                  ))}
                </div>
                <input className="cvs-input" value={f.accent} onChange={(e) => set('accent', e.target.value)} style={{ marginTop: 6, width: 100 }} />
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <Field label="Display name"><input className="cvs-input" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} /></Field>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Field label="Mood" style={{ flex: 1 }}>
                    <select className="cvs-select" value={f.mood} onChange={(e) => set('mood', e.target.value)}>{MOODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                  </Field>
                  <Field label="Pronouns" style={{ flex: 1 }}><input className="cvs-input" value={f.pronouns} onChange={(e) => set('pronouns', e.target.value)} /></Field>
                </div>
                <Field label="Status line"><input className="cvs-input" value={f.status} onChange={(e) => set('status', e.target.value)} placeholder="what you're up to" /></Field>
                <Field label="Region"><input className="cvs-input" value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="City, Country" /></Field>
              </div>
            </div>
            <Field label="Headline — your personal ethos"><input className="cvs-input" value={f.headline} onChange={(e) => set('headline', e.target.value)} /></Field>
            <Field label="Core values (comma or · separated)"><input className="cvs-input" value={f.values} onChange={(e) => set('values', e.target.value)} placeholder="Honesty · Curiosity · Craft" /></Field>
            <Field label="Interests"><input className="cvs-input" value={f.interests} onChange={(e) => set('interests', e.target.value)} /></Field>
            <Field label="About me"><textarea className="cvs-textarea" value={f.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
            <Field label="Who I'd like to meet"><textarea className="cvs-textarea" value={f.wantToMeet} onChange={(e) => set('wantToMeet', e.target.value)} /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '4px 0 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.isPrivate} onChange={(e) => set('isPrivate', e.target.checked)} />
              🔒 Private profile — only my accepted friends can see it
            </label>
            <div style={{ border: '1px solid #b9c6e8', borderRadius: 6, padding: '10px 12px', margin: '4px 0 14px', background: f.agentShadowing ? '#eefaf0' : '#f4f7fd' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.agentShadowing} onChange={(e) => set('agentShadowing', e.target.checked)} />
                🛰️ Agent shadowing — {f.agentShadowing ? 'ON' : 'off until you choose to turn it on'}
              </label>
              <p style={{ fontSize: 11, color: '#5a6785', margin: '6px 0 0' }}>
                The bridge to the agent side. Off by default, nothing crosses over. When you turn it on you can <b>adopt characters</b> into
                your own roster (“My Characters” on your profile) and chat with them in single, group, or conference chat — owner-only, unlike
                the public /ask characters. More chat features are coming later.
              </p>
              {f.agentShadowing && me?.agentShadowing && (
                <p style={{ fontSize: 12, marginTop: 6 }}>
                  🛰️ <Link to="/social/shadow">Open the Shadow clean-room »</Link> — let an adopted agent calibrate to you.
                </p>
              )}
              <p style={{ fontSize: 12, marginTop: 6 }}>
                🤖 <Link to="/caz">Open the Agentz Zone control deck »</Link> — the agent side of the Duality Axis, where this switch lives too.
              </p>
            </div>
            <SaveBar saving={saving} msg={msg} onSave={() => save()} />
          </Panel>
        )}

        {tab === 'design' && (
          <div className="cvs-grid2" style={{ gridTemplateColumns: '1fr 340px' }}>
            <Panel title="Custom CSS">
              <p style={{ fontSize: 12, color: '#5a6785', marginBottom: 8 }}>
                Theme your profile like it's 2004. Pick a starter, then edit freely. Custom CSS only styles your own profile.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {THEME_PRESETS.map((p) => (
                  <button key={p.id} className="cvs-btn" onClick={() => set('customCss', p.css)}>{p.name}</button>
                ))}
                <button className="cvs-btn" onClick={() => set('customCss', starterCss())}>↺ Starter template</button>
                <button className="cvs-btn primary" title="Generate a brand-new theme that isn't in the list" onClick={() => set('customCss', randomThemeCss())}>🎲 Re-roll a new design</button>
              </div>
              <textarea
                className="cvs-textarea"
                spellCheck={false}
                value={f.customCss}
                onChange={(e) => set('customCss', e.target.value)}
                style={{ minHeight: 300, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre' }}
                placeholder="/* your CSS here */"
              />
              <div style={{ marginTop: 8, fontSize: 11, color: '#5a6785' }}>
                <b>Classes you can target:</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {CSS_HOOKS.map((h) => <li key={h.sel}><code>{h.sel}</code> — {h.what}</li>)}
                </ul>
              </div>
              <div style={{ marginTop: 10 }}><SaveBar saving={saving} msg={msg} onSave={() => save()} /></div>
            </Panel>
            <Panel title="Live preview">
              <iframe title="profile preview" sandbox="" style={previewStyle} srcDoc={previewDoc(f.customCss, info)} />
              <p style={{ fontSize: 11, color: '#5a6785', marginTop: 6 }}>The preview is sandboxed — a rough render of how panels and the background will look.</p>
            </Panel>
          </div>
        )}

        {tab === 'studio' && (
          <DesignerPlus
            previewName={f.displayName || me?.handle}
            saving={saving}
            msg={msg}
            onApplySave={(css) => { set('customCss', css); save({ customCss: css }) }}
            onSendToEditor={(css) => { set('customCss', css); setTab('design') }}
          />
        )}
      </div>
    </CvsShell>
  )
}

// ── Premium theme studio ──────────────────────────────────────────────────────
function DesignerPlus({
  previewName, saving, msg, onApplySave, onSendToEditor,
}: {
  previewName?: string
  saving: boolean
  msg: string
  onApplySave: (css: string) => void
  onSendToEditor: (css: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const initSeed = useRef(randomSeedPhrase())
  const [dark, setDark] = useState(true)
  const [opts, setOpts] = useState<StudioOpts>(() => {
    const pal = paletteFromSeed(initSeed.current, true)
    return {
      bgMode: 'art', artUrl: '', artFit: 'cover', bgFixed: true, gradAngle: 135,
      overlay: 'dark', overlayAlpha: 0.35, panelOpacity: 0.9, radius: 14, border: 1, fontCss: '',
      seed: initSeed.current, ...pal,
    }
  })
  const upd = <K extends keyof StudioOpts>(k: K, v: StudioOpts[K]) => setOpts((o) => ({ ...o, [k]: v }))

  // Render the deterministic art into the visible canvas and capture it as a
  // compact JPEG data URL for the background.
  const regenerate = (seed: string) => {
    const c = canvasRef.current
    if (!c) return
    renderArt(seed, c)
    const url = c.toDataURL('image/jpeg', 0.55)
    setOpts((o) => ({ ...o, seed, artUrl: url }))
  }
  useEffect(() => { regenerate(initSeed.current) }, [])

  const applyPalette = (isDark: boolean) => {
    setDark(isDark)
    setOpts((o) => ({ ...o, ...paletteFromSeed(o.seed, isDark) }))
  }

  const css = useMemo(() => buildStudioCss(opts), [opts])

  return (
    <div className="cvs-grid2" style={{ gridTemplateColumns: '1fr 340px' }}>
      <Panel title="✦ Premium theme studio" tone="purple">
        <p style={{ fontSize: 12, color: '#5a6785', marginBottom: 10 }}>
          Compose a whole theme — no code. Generate a one-of-a-kind background from a phrase, then dial in the palette and surfaces. Everything compiles to your profile CSS.
        </p>

        {/* Background */}
        <SectionTitle>1 · Background</SectionTitle>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {(['art', 'gradient', 'solid'] as const).map((mode) => (
            <button key={mode} className={`cvs-btn ${opts.bgMode === mode ? 'primary' : ''}`} onClick={() => upd('bgMode', mode)}>
              {mode === 'art' ? '🖼 Generative art' : mode === 'gradient' ? '🌈 Gradient' : '⬛ Solid'}
            </button>
          ))}
        </div>

        {opts.bgMode === 'art' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <canvas ref={canvasRef} width={220} height={220} style={{ width: 150, height: 150, border: '1px solid #8296c4', borderRadius: 6, imageRendering: 'auto' }} />
              <div style={{ fontSize: 10, color: '#5a6785' }}>deterministic from your seed</div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Seed phrase <span style={{ fontWeight: 400 }}>(word 1 = color · word 2 = style)</span></label>
              <input className="cvs-input" value={opts.seed} onChange={(e) => upd('seed', e.target.value)} />
              <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
                <button className="cvs-btn primary" onClick={() => regenerate(opts.seed)}>Generate art</button>
                <button className="cvs-btn" onClick={() => { const s = randomSeedPhrase(); regenerate(s) }}>🎲 Random seed</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <button className={`cvs-btn ${opts.artFit === 'cover' ? 'primary' : ''}`} onClick={() => upd('artFit', 'cover')}>Cover</button>
                <button className={`cvs-btn ${opts.artFit === 'tile' ? 'primary' : ''}`} onClick={() => upd('artFit', 'tile')}>Tile</button>
              </div>
              <label style={checkStyle}><input type="checkbox" checked={opts.bgFixed} onChange={(e) => upd('bgFixed', e.target.checked)} /> Fixed while scrolling</label>
              <div style={{ marginTop: 6 }}>
                <label style={labelStyle}>Readability overlay</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['none', 'dark', 'light'] as const).map((ov) => (
                    <button key={ov} className={`cvs-btn ${opts.overlay === ov ? 'primary' : ''}`} onClick={() => upd('overlay', ov)}>{ov}</button>
                  ))}
                </div>
                {opts.overlay !== 'none' && <Range label={`overlay strength ${opts.overlayAlpha.toFixed(2)}`} min={0} max={0.8} step={0.05} value={opts.overlayAlpha} onChange={(v) => upd('overlayAlpha', v)} />}
              </div>
            </div>
          </div>
        )}

        {opts.bgMode === 'gradient' && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <Color label="from" value={opts.gradA} onChange={(v) => upd('gradA', v)} />
            <Color label="to" value={opts.gradB} onChange={(v) => upd('gradB', v)} />
            <div style={{ flex: 1, minWidth: 140 }}><Range label={`angle ${opts.gradAngle}°`} min={0} max={360} step={5} value={opts.gradAngle} onChange={(v) => upd('gradAngle', v)} /></div>
          </div>
        )}
        {opts.bgMode === 'solid' && <div style={{ marginBottom: 10 }}><Color label="page color" value={opts.solid} onChange={(v) => upd('solid', v)} /></div>}

        {/* Palette */}
        <SectionTitle>2 · Palette</SectionTitle>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className="cvs-btn" onClick={() => applyPalette(true)}>{dark ? '● ' : ''}Auto dark</button>
          <button className="cvs-btn" onClick={() => applyPalette(false)}>{!dark ? '● ' : ''}Auto light</button>
          <span style={{ fontSize: 11, color: '#5a6785', alignSelf: 'center' }}>from seed “{opts.seed}”</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 4, marginBottom: 10 }}>
          <Color label="Panels" value={opts.panelBg} onChange={(v) => upd('panelBg', v)} />
          <Color label="Panel border" value={opts.panelBorder} onChange={(v) => upd('panelBorder', v)} />
          <Color label="Title start" value={opts.titleA} onChange={(v) => upd('titleA', v)} />
          <Color label="Title end" value={opts.titleB} onChange={(v) => upd('titleB', v)} />
          <Color label="Text" value={opts.text} onChange={(v) => upd('text', v)} />
          <Color label="Links" value={opts.link} onChange={(v) => upd('link', v)} />
          <Color label="Chips" value={opts.chipBg} onChange={(v) => upd('chipBg', v)} />
        </div>

        {/* Surfaces */}
        <SectionTitle>3 · Surfaces</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 8, marginBottom: 10 }}>
          <Range label={`corner radius ${opts.radius}px`} min={0} max={28} step={1} value={opts.radius} onChange={(v) => upd('radius', v)} />
          <Range label={`border ${opts.border}px`} min={0} max={4} step={1} value={opts.border} onChange={(v) => upd('border', v)} />
          <Range label={`panel opacity ${opts.panelOpacity.toFixed(2)}`} min={0.3} max={1} step={0.05} value={opts.panelOpacity} onChange={(v) => upd('panelOpacity', v)} />
          <div>
            <label style={labelStyle}>Font</label>
            <select className="cvs-select" value={opts.fontCss} onChange={(e) => upd('fontCss', e.target.value)}>
              {STUDIO_FONTS.map((ft) => <option key={ft.id} value={ft.css}>{ft.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="cvs-btn primary" disabled={saving} onClick={() => onApplySave(css)}>{saving ? 'Saving…' : '✓ Apply & save'}</button>
          <button className="cvs-btn" onClick={() => onSendToEditor(css)}>Send to CSS editor</button>
          {msg && <span style={{ fontSize: 12, color: msg === 'Saved!' ? '#176b2a' : '#a11', fontWeight: 700 }}>{msg}</span>}
        </div>
      </Panel>

      <Panel title="Live preview">
        <iframe title="studio preview" sandbox="" style={previewStyle} srcDoc={previewDoc(css, { name: previewName })} />
        <p style={{ fontSize: 11, color: '#5a6785', marginTop: 6 }}>Updates as you tweak. “Apply &amp; save” writes it to your profile.</p>
      </Panel>
    </div>
  )
}

const previewStyle: React.CSSProperties = { width: '100%', height: 460, border: '1px solid #90a2cc', borderRadius: 6, background: '#fff' }
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: 11, margin: '4px 0 3px', color: '#2b3f6b' }
const checkStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 700, fontSize: 12, color: '#2b3f6b', borderBottom: '1px solid #dce3f4', paddingBottom: 3, margin: '10px 0 8px' }}>{children}</div>
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 2 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 30, height: 22, padding: 0, border: '1px solid #8296c4', borderRadius: 3, cursor: 'pointer' }} />
      {label}
    </label>
  )
}

function Range({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'block', fontSize: 11, color: '#2b3f6b' }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: '100%' }} />
    </label>
  )
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="cvs-field" style={style}>
      <label>{label}</label>
      {children}
    </div>
  )
}

function SaveBar({ saving, msg, onSave }: { saving: boolean; msg: string; onSave: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button className="cvs-btn primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      {msg && <span style={{ fontSize: 12, color: msg === 'Saved!' ? '#176b2a' : '#a11', fontWeight: 700 }}>{msg}</span>}
    </div>
  )
}

export const Route = createFileRoute('/social/settings')({
  component: SettingsPage,
})
