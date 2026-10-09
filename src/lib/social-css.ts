// CVS page designer — the "make it your own" layer. Members write custom CSS that
// themes their profile, exactly in the spirit of the 2004 personal page.
//
// Custom CSS is data, not code: browsers do not execute JavaScript from a
// stylesheet. Still, we sanitize defensively before it is ever placed in a
// <style> tag — the one real risk is a payload breaking OUT of the tag (via a
// literal "</style>") or smuggling script/behavior, so those are stripped. This
// runs on both the write path (settings save) and the read path (profile render).

// Cap large enough to hold a full theme plus one embedded generative-art
// background (a compact JPEG data URL from the premium studio).
export const MAX_CSS = 60000

export function sanitizeCss(input: string | null | undefined): string {
  let css = String(input || '').slice(0, MAX_CSS)
  css = css
    // Never allow closing/opening tags — this is what would let CSS escape the
    // <style> element and inject markup. Legitimate CSS never needs "</" or "<x".
    .replace(/<\s*\/?\s*[a-zA-Z]/g, '')
    .replace(/<\s*\//g, '')
    // Strip vectors that some engines historically evaluated.
    .replace(/javascript:/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/behou?r:/gi, '')
    .replace(/-moz-binding/gi, '')
    // Block remote @import (tracking / external CSS injection). url() is kept so
    // members can still set image backgrounds.
    .replace(/@import[^;]*;?/gi, '')
  return css
}

// The classes a member's CSS can target, shown as guidance in the editor.
export const CSS_HOOKS: { sel: string; what: string }[] = [
  { sel: '.cvs', what: 'the whole page canvas / background' },
  { sel: '.cvs-profile-root', what: 'the profile container' },
  { sel: '.cvs-panel', what: 'every panel box' },
  { sel: '.cvs-panel-title', what: 'the colored panel title bars' },
  { sel: '.cvs-panel-body', what: 'panel contents' },
  { sel: '.cvs-spec td.k', what: 'the spec-sheet labels' },
  { sel: '.cvs-chip', what: 'value / interest chips' },
  { sel: 'a', what: 'links' },
]

export type ThemePreset = { id: string; name: string; css: string }

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'clean', name: 'Clean (reset)', css: '' },
  {
    id: 'midnight',
    name: '🌌 Midnight',
    css: `.cvs { background: #0b1026; }
.cvs-profile-root .cvs-panel { background: #131a3a; border-color: #2b3a6b; }
.cvs-profile-root .cvs-panel-title { background: linear-gradient(180deg,#3b2f7a,#241a52); }
.cvs-profile-root, .cvs-profile-root .cvs-panel-.cvs { color: #dfe4ff; }
.cvs-profile-root a { color: #9db4ff; }
.cvs-profile-root .cvs-spec td.k { color: #a9b6ff; }`,
  },
  {
    id: 'bubblegum',
    name: '🍬 Bubblegum',
    css: `.cvs { background: #ffd9ef url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='6' cy='6' r='2' fill='%23ffb3df'/%3E%3C/svg%3E"); }
.cvs-profile-root .cvs-panel { background: #fff0f8; border-color: #ff9ed6; border-radius: 18px; }
.cvs-profile-root .cvs-panel-title { background: linear-gradient(180deg,#ff8fcf,#ff5cb0); }
.cvs-profile-root a { color: #d6198a; }`,
  },
  {
    id: 'matrix',
    name: '💚 Matrix',
    css: `.cvs { background: #000; }
.cvs-profile-root .cvs-panel { background: #001a06; border-color: #0f0; }
.cvs-profile-root .cvs-panel-title { background: #032b0d; color: #4dff88; }
.cvs-profile-root, .cvs-profile-root .cvs-panel-body, .cvs-profile-root a { color: #34ff6a; font-family: monospace; }
.cvs-profile-root .cvs-chip { background: #012b0e; border-color: #0f0; color: #7dff9e; }`,
  },
  {
    id: 'sunset',
    name: '🌇 Sunset',
    css: `.cvs { background: linear-gradient(160deg,#ff9966,#ff5e62 55%,#6a1b9a); }
.cvs-profile-root .cvs-panel { background: rgba(255,255,255,0.92); border-color: #ff8a5c; }
.cvs-profile-root .cvs-panel-title { background: linear-gradient(180deg,#ff7e5f,#e64a45); }
.cvs-profile-root a { color: #c2410c; }`,
  },
  {
    id: 'paper',
    name: '📜 Old Web',
    css: `.cvs { background: #d8d2c0; }
.cvs-profile-root .cvs-panel { background: #fffef7; border: 2px solid #8a7f5c; border-radius: 0; }
.cvs-profile-root .cvs-panel-title { background: #b8ad82; color: #241f10; text-shadow: 1px 1px #fff6; }
.cvs-profile-root, .cvs-profile-root .cvs-panel-.cvs { color: #2b2513; font-family: 'Times New Roman', Georgia, serif; }
.cvs-profile-root a { color: #7a4b12; }`,
  },
]

const STARTER = `/* Your profile, your rules. Target the classes below. */
.cvs { background: #101427; }

.cvs-profile-root .cvs-panel {
  background: #1a2140;
  border-color: #33406e;
}
.cvs-profile-root .cvs-panel-title {
  background: linear-gradient(180deg, #4f46e5, #3b2f9e);
}
.cvs-profile-root,
.cvs-profile-root .cvs-panel-.cvs { color: #e6e9ff; }
.cvs-profile-root a { color: #9db4ff; }
`

export function starterCss(): string {
  return STARTER
}

// ── Re-roll: a procedurally generated theme ──────────────────────────────────
// Produces a fresh, coherent theme that is NOT in THEME_PRESETS — "designs yet to
// exist". Runs on the client (a button press), so Math.random is fine. Backgrounds
// use pure CSS gradients (no SVG), so the output contains no "<" and passes
// sanitizeCss untouched.

const ROLL_FONTS = [
  '',
  "font-family: Georgia, 'Times New Roman', serif;",
  "font-family: 'Courier New', ui-monospace, monospace;",
  "font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;",
  "font-family: 'Comic Sans MS', 'Comic Sans', cursive;",
  'font-family: Verdana, Geneva, sans-serif;',
]
const ROLL_ADJ = ['neon', 'velvet', 'glass', 'sunset', 'frost', 'ember', 'lagoon', 'orchid', 'mint', 'cosmic', 'retro', 'candy', 'noir', 'aurora', 'dune', 'plasma']
const ROLL_NOUN = ['drift', 'bloom', 'circuit', 'haze', 'tide', 'grove', 'pulse', 'mirage', 'meadow', 'static', 'echo', 'prism', 'nova', 'harbor', 'signal']

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const ch = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(ch(0))}${hex(ch(8))}${hex(ch(4))}`
}

export function randomThemeCss(): string {
  const R = Math.random
  const pick = <T,>(a: T[]): T => a[Math.floor(R() * a.length)]
  const rint = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1))

  const dark = R() < 0.55
  const h = rint(0, 359)
  const h2 = (h + rint(30, 170)) % 360
  const sat = rint(45, 85)
  const hx = hslToHex

  const pageBg = dark ? hx(h, Math.min(sat, 55), rint(6, 13)) : hx(h, sat, rint(88, 95))
  const pageBg2 = dark ? hx(h2, Math.min(sat, 55), rint(9, 16)) : hx(h2, sat, rint(84, 92))
  const panelBg = dark ? hx(h, Math.min(sat, 45), rint(15, 22)) : hx(h, sat, rint(97, 100))
  const panelBorder = dark ? hx(h, sat, rint(30, 42)) : hx(h, sat, rint(70, 82))
  const text = dark ? hx(h, 25, 90) : hx(h, 45, rint(14, 22))
  const link = dark ? hx(h2, 85, 76) : hx(h2, 75, 38)
  const titleA = hx(h2, sat, dark ? 48 : 55)
  const titleB = hx(h, sat, dark ? 30 : 42)
  const kColor = dark ? hx(h2, 55, 74) : hx(h2, 55, 40)
  const chipBg = dark ? hx(h2, 45, 22) : hx(h2, 70, 92)
  const chipBorder = dark ? hx(h2, 55, 40) : hx(h2, 60, 78)
  const chipText = dark ? hx(h2, 70, 82) : hx(h2, 65, 32)

  // Background treatment — pure CSS so it is always sanitizer-safe.
  const accent = dark ? hx(h2, 55, 20) : hx(h2, 65, 84)
  const line = dark ? hx(h, 40, 26) : hx(h, 45, 82)
  let bodyBg: string
  switch (pick(['solid', 'gradient', 'dots', 'diag', 'grid', 'checker'])) {
    case 'gradient':
      bodyBg = `background: linear-gradient(${rint(90, 320)}deg, ${pageBg}, ${pageBg2});`
      break
    case 'dots':
      bodyBg = `background-color: ${pageBg}; background-image: radial-gradient(${accent} 12%, transparent 13%); background-size: ${rint(18, 28)}px ${rint(18, 28)}px;`
      break
    case 'diag':
      bodyBg = `background: repeating-linear-gradient(${pick([45, 135])}deg, ${pageBg} 0 14px, ${pageBg2} 14px 28px);`
      break
    case 'grid':
      bodyBg = `background-color: ${pageBg}; background-image: linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px); background-size: ${rint(22, 32)}px ${rint(22, 32)}px;`
      break
    case 'checker':
      bodyBg = `background-color: ${pageBg}; background-image: repeating-conic-gradient(${accent} 0% 25%, transparent 0% 50%); background-size: ${rint(28, 44)}px ${rint(28, 44)}px;`
      break
    default:
      bodyBg = `background: ${pageBg};`
  }

  const radius = pick([0, 4, 10, 18, 24])
  const border = pick([1, 1, 2, 3])
  const font = pick(ROLL_FONTS)
  const name = `${pick(ROLL_ADJ)} ${pick(ROLL_NOUN)}`

  return `/* "${name}" — a rolled design (${dark ? 'dark' : 'light'}, hue ${h}°) */
.cvs { ${bodyBg} }

.cvs-profile-root .cvs-panel {
  background: ${panelBg};
  border: ${border}px solid ${panelBorder};
  border-radius: ${radius}px;
}
.cvs-profile-root .cvs-panel-title {
  background: linear-gradient(180deg, ${titleA}, ${titleB});
  color: #ffffff;
}
.cvs-profile-root,
.cvs-profile-root .cvs-panel-.cvs { color: ${text};${font ? ' ' + font : ''} }
.cvs-profile-root a { color: ${link}; }
.cvs-profile-root .cvs-spec td.k { color: ${kColor}; }
.cvs-profile-root .cvs-chip { background: ${chipBg}; border-color: ${chipBorder}; color: ${chipText}; }
`
}


// ── Premium theme studio ─────────────────────────────────────────────────────
// A visual theme builder that compiles a full stylesheet from structured options.
// It reuses the same customCss pipeline (sanitized, applied only to the owner's
// profile), so nothing new is needed on the storage or render side.

export const STUDIO_FONTS: { id: string; label: string; css: string }[] = [
  { id: 'default', label: 'Default (Tahoma)', css: '' },
  { id: 'serif', label: 'Serif (Georgia)', css: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Monospace', css: "'Courier New', ui-monospace, monospace" },
  { id: 'trebuchet', label: 'Trebuchet', css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: 'comic', label: 'Comic', css: "'Comic Sans MS', 'Comic Sans', cursive" },
  { id: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
]

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

function seedHash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0 }
  return Math.abs(h)
}

export type StudioPalette = {
  panelBg: string; panelBorder: string; titleA: string; titleB: string
  text: string; link: string; chipBg: string; solid: string; gradA: string; gradB: string
}

/** Derive a coherent, deterministic palette from a seed phrase. */
export function paletteFromSeed(seed: string, dark: boolean): StudioPalette {
  const base = seedHash(seed || 'aurora drift')
  const h = base % 360
  const h2 = (h + 40 + (base % 130)) % 360
  const hx = hslToHex
  return dark
    ? {
        solid: hx(h, 45, 10), gradA: hx(h, 45, 10), gradB: hx(h2, 45, 16),
        panelBg: hx(h, 35, 18), panelBorder: hx(h, 45, 36),
        titleA: hx(h2, 65, 48), titleB: hx(h, 65, 30),
        text: hx(h, 25, 90), link: hx(h2, 85, 76), chipBg: hx(h2, 45, 24),
      }
    : {
        solid: hx(h, 65, 92), gradA: hx(h, 65, 92), gradB: hx(h2, 65, 86),
        panelBg: hx(h, 60, 99), panelBorder: hx(h, 55, 76),
        titleA: hx(h2, 70, 55), titleB: hx(h, 70, 42),
        text: hx(h, 45, 18), link: hx(h2, 70, 38), chipBg: hx(h2, 70, 92),
      }
}

export type StudioOpts = {
  bgMode: 'art' | 'solid' | 'gradient'
  artUrl: string
  artFit: 'cover' | 'tile'
  bgFixed: boolean
  gradAngle: number
  overlay: 'none' | 'dark' | 'light'
  overlayAlpha: number
  panelBg: string
  panelOpacity: number
  panelBorder: string
  titleA: string
  titleB: string
  text: string
  link: string
  chipBg: string
  solid: string
  gradA: string
  gradB: string
  radius: number
  border: number
  fontCss: string
  seed: string
}

export function buildStudioCss(o: StudioOpts): string {
  const overlayColor = o.overlay === 'dark' ? `rgba(0,0,0,${o.overlayAlpha})` : `rgba(255,255,255,${o.overlayAlpha})`
  const overlayLayer = o.bgMode === 'art' && o.overlay !== 'none' ? `linear-gradient(${overlayColor}, ${overlayColor}), ` : ''

  let bodyBg = ''
  if (o.bgMode === 'art' && o.artUrl) {
    bodyBg = `  background-color: ${o.solid};
  background-image: ${overlayLayer}url("${o.artUrl}");
  background-size: ${o.artFit === 'cover' ? 'cover' : 'auto'};
  background-repeat: ${o.artFit === 'cover' ? 'no-repeat' : 'repeat'};
  background-position: center;${o.bgFixed ? '\n  background-attachment: fixed;' : ''}`
  } else if (o.bgMode === 'gradient') {
    bodyBg = `  background: linear-gradient(${o.gradAngle}deg, ${o.gradA}, ${o.gradB});${o.bgFixed ? '\n  background-attachment: fixed;' : ''}`
  } else {
    bodyBg = `  background: ${o.solid};`
  }

  const font = o.fontCss ? ` font-family: ${o.fontCss};` : ''
  return `/* Premium theme studio${o.seed ? ` — seed "${o.seed}"` : ''} */
.cvs {
${bodyBg}
}
.cvs-profile-root .cvs-panel {
  background: ${hexToRgba(o.panelBg, o.panelOpacity)};
  border: ${o.border}px solid ${o.panelBorder};
  border-radius: ${o.radius}px;
  backdrop-filter: blur(2px);
}
.cvs-profile-root .cvs-panel-title {
  background: linear-gradient(180deg, ${o.titleA}, ${o.titleB});
  color: #ffffff;
}
.cvs-profile-root,
.cvs-profile-root .cvs-panel-.cvs { color: ${o.text};${font} }
.cvs-profile-root a { color: ${o.link}; }
.cvs-profile-root .cvs-spec td.k { color: ${o.link}; }
.cvs-profile-root .cvs-chip { background: ${o.chipBg}; border-color: ${o.panelBorder}; color: ${o.text}; }
`
}
