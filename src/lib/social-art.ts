// Deterministic generative-art engine for the premium theme studio. Adapted from
// the classic "random art" approach: a seedable RNG builds a recursive math
// expression over the (x, y) plane per RGB channel, so the same seed always paints
// the same image — a member's background is reproducible from a short phrase.
//
// A two-word seed splits responsibilities: the first word seeds the COLOR, the
// second seeds the STYLE (structure). Client-only — rendering needs a <canvas>.

class Mulberry32 {
  private seed: number
  constructor(seed: number) { this.seed = seed }
  next(): number {
    let t = (this.seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

type Fn = { args: number; exec: (...a: number[]) => number }
const FNS: Fn[] = [
  { args: 1, exec: (a) => Math.sin(Math.PI * a) },
  { args: 1, exec: (a) => Math.cos(Math.PI * a) },
  { args: 2, exec: (a, b) => a * b },
  { args: 2, exec: (a, b) => (a + b) / 2 },
  { args: 1, exec: (a) => Math.abs(a) },
  { args: 2, exec: (a, b) => a % (b || 1) },
]

type Node =
  | { type: 'x' }
  | { type: 'y' }
  | { type: 'fn'; exec: (...a: number[]) => number; args: Node[] }

function buildFormula(rng: Mulberry32, depth: number): Node {
  if (depth <= 0 || rng.next() < 0.1) {
    return rng.next() > 0.5 ? { type: 'x' } : { type: 'y' }
  }
  const fn = FNS[Math.floor(rng.next() * FNS.length)]
  const args: Node[] = []
  for (let i = 0; i < fn.args; i++) args.push(buildFormula(rng, depth - 1))
  return { type: 'fn', exec: fn.exec, args }
}

function evaluate(node: Node, x: number, y: number): number {
  if (node.type === 'x') return x
  if (node.type === 'y') return y
  const a = node.args.map((arg) => evaluate(arg, x, y))
  return node.exec(...a)
}

function seedWords(seed: string): [string, string] {
  const words = (seed || 'aurora drift').trim().split(/\s+/)
  return [words[0] || 'aurora', words[1] || words[0] || 'drift']
}

/** Render the deterministic art for `seed` into an existing canvas. */
export function renderArt(seed: string, canvas: HTMLCanvasElement, depth = 10): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const [w1, w2] = seedWords(seed)
  const styleRng = new Mulberry32(hashString(w2))
  const colorRng = new Mulberry32(hashString(w1))

  const rF = buildFormula(styleRng, depth)
  const gF = buildFormula(styleRng, depth)
  const bF = buildFormula(styleRng, depth)
  const rPhase = colorRng.next() * Math.PI
  const gPhase = colorRng.next() * Math.PI
  const bPhase = colorRng.next() * Math.PI

  const { width: W, height: H } = canvas
  const img = ctx.createImageData(W, H)
  for (let i = 0; i < W; i++) {
    const x = (i / W) * 2 - 1
    for (let j = 0; j < H; j++) {
      const y = (j / H) * 2 - 1
      const r = (Math.sin(evaluate(rF, x, y) * Math.PI + rPhase) + 1) * 127.5
      const g = (Math.sin(evaluate(gF, x, y) * Math.PI + gPhase) + 1) * 127.5
      const b = (Math.sin(evaluate(bF, x, y) * Math.PI + bPhase) + 1) * 127.5
      const idx = (i + j * W) * 4
      img.data[idx] = r
      img.data[idx + 1] = g
      img.data[idx + 2] = b
      img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Render `seed` offscreen and return a compact JPEG data URL, small enough to
 * embed inside a member's stylesheet. Returns '' during SSR.
 */
export function artDataUrl(seed: string, size = 240, quality = 0.55): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  renderArt(seed, canvas)
  return canvas.toDataURL('image/jpeg', quality)
}

const ART_A = ['crimson', 'azure', 'golden', 'violet', 'emerald', 'sunset', 'midnight', 'coral', 'ivory', 'cobalt', 'amber', 'jade', 'rose', 'obsidian', 'neon']
const ART_B = ['drift', 'bloom', 'circuit', 'haze', 'tide', 'grove', 'pulse', 'mirage', 'nebula', 'static', 'prism', 'nova', 'lattice', 'cascade', 'ember']

/** A fresh two-word seed for the "random seed" button. */
export function randomSeedPhrase(): string {
  const p = (a: string[]) => a[Math.floor(Math.random() * a.length)]
  return `${p(ART_A)} ${p(ART_B)}`
}
