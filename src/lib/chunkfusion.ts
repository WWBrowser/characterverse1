// Chunk Fusion — bisecting source into lego-block syntax chunks that snap.
//
//   "Stuff happening on the substrate of life based off relativity of what
//    should or should not & what can &/or can't will happen eventually."
//                                                    — Robert W. Dickson
//
//   TIME: fractional seconds so small it is superposition, where outcomes are
//   unanimated until the fractional second collapses.
//
// That is not decoration on this file, it is the state machine. A chunk lifted
// off the tray is in SUPERPOSITION: `superpose()` returns every landing the
// rules permit, all of them equally unrealised. Nothing is written. `collapse()`
// takes exactly one and commits a frame to an append-only history. The bench is
// a discrete succession of rendered instances, not a continuously mutated blob.
//
// The three-way split in the quote maps onto three distinct checks, and keeping
// them distinct is the whole reason this works:
//
//   CAN / CAN'T      — structural fit. A `return` cannot sit at module scope.
//                      Probability zero. `slotAccepts()`.
//   SHOULD / SHOULD  — scope fit. The chunk's free names must already exist at
//   NOT                that point. Legal shape, wrong context. `bindingsAt()`.
//   WILL HAPPEN      — convergence. Given a head anchor and a tail anchor, the
//   EVENTUALLY         body either meets in the middle or the run is scrapped.
//                      `converge()`.
//
// WHAT THIS IS, EXACTLY
//
// A bisector, not a parser. It scans characters tracking string, template,
// comment and brace state, and cuts at statement boundaries. It does not build
// a typed AST, it does not resolve modules, and it does not know your types.
// Its scope analysis is declaration-scanning: it finds `const`/`let`/`var`/
// `function`/`class`/params/destructuring patterns and treats every other bare
// identifier as free. That over-reports free names in a handful of real cases
// (labelled statements, `with`, some catch-binding shapes) and the failure mode
// is a chunk that refuses to snap when it would actually have compiled. It errs
// toward refusing almost everywhere. The single exception is `innerParamNames`:
// a parameter of an inner arrow or function expression is treated as local, so a
// chunk that shadows an outer name it also reads will under-report that one
// socket. That trade is documented where it is made, and it is made because the
// alternative is a false socket on every `.map()` in the corpus.
//
// The one ambiguity it cannot resolve is the classic one: `/` is division or
// the start of a regex literal depending on grammar the scanner does not track.
// It guesses from the previous significant character, which is what most
// syntax highlighters do, and is wrong on the same inputs they are wrong on.
//
// Language support is JS/TS-shaped. The block structure (brace-delimited,
// semicolon-or-newline statements) is the assumption; nothing here will bisect
// Python correctly and it does not pretend to.

/* --------------------------------------------------------------- vocabulary */

/** What a chunk *is*. Determines which slots will physically take it. */
export type ChunkKind =
  | 'import'
  | 'export'
  | 'type'
  | 'binding'
  | 'function'
  | 'branch'
  | 'loop'
  | 'guard'
  | 'call'
  | 'return'
  | 'comment'
  | 'unknown'

/** Where a chunk is being asked to sit. */
export type SlotKind = 'module' | 'body'

export type KindMeta = {
  kind: ChunkKind
  label: string
  /** Slots this kind physically fits. Empty means it fits nowhere on its own. */
  fits: SlotKind[]
  /** Plain-language note shown on the brick. */
  note: string
}

// The stud pattern. A kind either fits a slot or it does not — there is no
// "probably". This is the CAN / CAN'T half of the quote and it is a lookup,
// not a heuristic.
export const KINDS: KindMeta[] = [
  { kind: 'import', label: 'Import', fits: ['module'], note: 'Top of file only.' },
  { kind: 'export', label: 'Export', fits: ['module'], note: 'Module surface.' },
  { kind: 'type', label: 'Type', fits: ['module'], note: 'Declaration, erased at runtime.' },
  { kind: 'function', label: 'Function', fits: ['module', 'body'], note: 'Introduces a name, opens a scope.' },
  { kind: 'binding', label: 'Binding', fits: ['module', 'body'], note: 'Introduces names.' },
  { kind: 'branch', label: 'Branch', fits: ['body'], note: 'Conditional block.' },
  { kind: 'loop', label: 'Loop', fits: ['body'], note: 'Repeating block.' },
  { kind: 'guard', label: 'Guard', fits: ['body'], note: 'Early exit. Terminal on its taken path.' },
  { kind: 'call', label: 'Call', fits: ['body'], note: 'Effect, produces no name.' },
  { kind: 'return', label: 'Return', fits: ['body'], note: 'Terminal. Nothing may follow it.' },
  { kind: 'comment', label: 'Note', fits: ['module', 'body'], note: 'Fits anywhere, binds nothing.' },
  { kind: 'unknown', label: 'Unclassified', fits: [], note: 'The bisector could not name it. Fits nothing.' },
]

const KIND_BY: Record<ChunkKind, KindMeta> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k]),
) as Record<ChunkKind, KindMeta>

export function slotAccepts(kind: ChunkKind, slot: SlotKind): boolean {
  return KIND_BY[kind].fits.includes(slot)
}

export function kindMeta(kind: ChunkKind): KindMeta {
  return KIND_BY[kind]
}

/* -------------------------------------------------------------- the brick */

export type Chunk = {
  id: string
  kind: ChunkKind
  /** The header line, trimmed — what shows on the face of the brick. */
  label: string
  /** Exact source text, unmodified. Fusing re-emits this verbatim. */
  source: string
  /** Free identifiers this chunk needs from around it. Its sockets. */
  bindsIn: string[]
  /** Identifiers this chunk introduces to everything after it. Its studs. */
  bindsOut: string[]
  /** Nothing may follow a terminal chunk in the same block. */
  terminal: boolean
  /** Nesting depth in the bisected original. 0 = module scope. */
  depth: number
  /** Chunks bisected out of this one's block body. */
  children: Chunk[]
  /** 1-indexed inclusive line span in the source it was cut from. */
  lines: [number, number]
  /** Content index of the exact text. */
  fingerprint: string
  /** Content index of the alpha-renamed skeleton — the pocket-dimension key. */
  shape: string
}

/* --------------------------------------------------------- content indexing
 *
 * Two indexes, and they answer different questions.
 *
 *   fingerprint — is this the same text?
 *   shape       — is this the same STRUCTURE with different names?
 *
 * `shape` is what makes the library browsable the way the design describes.
 * Alpha-renaming every identifier to a positional slot means twelve retry loops
 * written by twelve people collapse to one shape with twelve occupants. Asking
 * the library for a retry loop returns that pocket, not the whole corpus.
 *
 * Both are 128-bit FNV-1a pairs, computed synchronously so a drag can be
 * validated inside a pointer-move. THEY ARE NOT CRYPTOGRAPHIC. They are content
 * indexes. Anyone who wants to find a collision can. For tamper-evidence use
 * `seal()` below, which is SHA-256 and is honest about being the slow one.
 */

function fnv(input: string, offset: bigint, prime: bigint): string {
  let h = offset
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i))
    h = (h * prime) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}

/** 128 bits from two independent 64-bit FNV-1a runs. Index only. */
export function contentIndex(input: string): string {
  return (
    fnv(input, 0xcbf29ce484222325n, 0x100000001b3n) +
    fnv(`\u0001${input}`, 0x9e3779b97f4a7c15n, 0x100000001b3n)
  )
}

/**
 * SHA-256 over the fused assembly. This is the one to use when a chunk library
 * is shipped as training data and a consumer needs to prove the bundle they got
 * is the bundle that was made. Async, because WebCrypto is.
 */
export async function seal(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text) as BufferSource,
  )
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/* ------------------------------------------------------------- the scanner */

const KEYWORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'interface',
  'let', 'new', 'null', 'of', 'return', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'type', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'as', 'from', 'async', 'satisfies', 'keyof', 'readonly', 'declare', 'namespace',
])

// Ambient names a chunk may reference without the bench having to supply them.
// Deliberately short: anything not here is a socket the assembly must fill, and
// a false socket is a visible refusal rather than a silent acceptance.
const AMBIENT = new Set([
  'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet', 'Date', 'Error', 'TypeError',
  'RangeError', 'Symbol', 'BigInt', 'RegExp', 'globalThis', 'undefined', 'NaN',
  'Infinity', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'structuredClone',
  'fetch', 'URL', 'URLSearchParams', 'Response', 'Request', 'Headers',
  'TextEncoder', 'TextDecoder', 'Uint8Array', 'ArrayBuffer', 'process',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
])

type Span = { text: string; start: number; end: number }

/** True if `/` at position i is a regex literal rather than division. */
function regexHere(src: string, i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const c = src[j]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue
    // After a value, `/` divides. After an operator or opener, it starts a regex.
    return !/[\w$)\]'"`]/.test(c)
  }
  return true
}

/**
 * Split a region into top-level statement spans.
 *
 * Cuts at `;` and at the `}` that closes a depth-0 block, and treats a newline
 * as a cut only when the statement is balanced and does not end in an operator
 * — which is the same rule ASI uses, minus the cases nobody writes on purpose.
 */
function splitStatements(src: string): Span[] {
  const spans: Span[] = []
  let depth = 0
  let start = 0
  let i = 0

  const push = (end: number) => {
    const text = src.slice(start, end)
    if (text.trim()) spans.push({ text, start, end })
    start = end
  }

  while (i < src.length) {
    const c = src[i]

    // Strings and templates: skip wholesale, braces inside them are text.
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i++
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === quote) { i++; break }
        // Template substitution can contain anything, including braces.
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          let d = 1
          i += 2
          while (i < src.length && d > 0) {
            if (src[i] === '{') d++
            else if (src[i] === '}') d--
            i++
          }
          continue
        }
        i++
      }
      continue
    }

    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === '/' && regexHere(src, i)) {
      i++
      while (i < src.length && src[i] !== '\n') {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '/') { i++; break }
        i++
      }
      continue
    }

    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue }
    if (c === '}' || c === ')' || c === ']') {
      depth--
      i++
      if (depth === 0 && c === '}' && closesStatement(src, i)) push(i)
      continue
    }
    if (c === ';' && depth === 0) { i++; push(i); continue }
    if (c === '\n' && depth === 0) {
      const sofar = src.slice(start, i).trim()
      // Don't cut mid-expression: a trailing operator means the line continues.
      if (sofar && !/[,+\-*/%&|^=<>?:.([{]$/.test(sofar) && !/^(else|catch|finally)\b/.test(sofar)) {
        i++
        push(i)
        continue
      }
    }
    i++
  }
  push(src.length)
  return spans
}

/**
 * A `}` that returns to depth 0 usually ends a statement — but not always. The
 * brace in `import { a } from 'x'` closes a specifier list, and the one in
 * `const o = { k: 1 }.k` closes an object that is still being read from. Peek at
 * what follows: an operator, a closer, or a continuation keyword means the
 * statement is still going.
 */
function closesStatement(src: string, i: number): boolean {
  let j = i
  while (j < src.length && /\s/.test(src[j])) j++
  if (j >= src.length) return true
  if (';,).:=&|?+-*/%<>[]."`\''.includes(src[j])) return false
  const word = /^[A-Za-z_$][\w$]*/.exec(src.slice(j))?.[0]
  if (word && ['from', 'else', 'catch', 'finally', 'as', 'instanceof', 'in', 'of', 'satisfies'].includes(word)) {
    return false
  }
  return true
}

/** Skip past the quoted run starting at `i` (which is the opening quote). */
function skipQuoted(text: string, i: number): number {
  const quote = text[i]
  i++
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue }
    if (text[i] === quote) return i + 1
    i++
  }
  return i
}

/** Index of the `{` opening this statement's block, or -1. */
function blockOpen(text: string): number {
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') { i = skipQuoted(text, i); continue }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue }
    if (c === '{') return i
    i++
  }
  return -1
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function blockClose(text: string, open: number): number {
  let d = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') { i = skipQuoted(text, i) - 1; continue }
    if (c === '{') d++
    else if (c === '}') { d--; if (d === 0) return i }
  }
  return -1
}

/* ----------------------------------------------------------- classification */

function classify(text: string): ChunkKind {
  const t = text.trim()
  if (!t) return 'unknown'
  if (/^\/\/|^\/\*/.test(t) && !/[;{]/.test(t.replace(/^\/\*[\s\S]*?\*\//, ''))) return 'comment'

  const head = t.replace(/^(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)+/, '').trim()
  if (/^import\b/.test(head)) return 'import'
  if (/^export\s+(type|interface)\b/.test(head) || /^(type|interface)\b/.test(head)) return 'type'
  if (/^export\b/.test(head)) {
    // An exported function or binding is still that thing; the export is a modifier.
    const rest = head.replace(/^export\s+(default\s+)?/, '')
    if (/^(async\s+)?function\b/.test(rest) || /^class\b/.test(rest)) return 'function'
    if (/^(const|let|var)\b/.test(rest)) return 'binding'
    return 'export'
  }
  if (/^(async\s+)?function\b/.test(head) || /^class\b/.test(head)) return 'function'
  if (/^(if|else\s+if)\b/.test(head)) {
    // A single-statement `if` that exits is a guard, not a branch — the
    // distinction matters because a guard is terminal on its taken path and a
    // branch is not, and stacking rules downstream depend on knowing which.
    if (/\b(return|throw|continue|break)\b/.test(head) && blockOpen(head) === -1) return 'guard'
    return 'branch'
  }
  if (/^(for|while|do)\b/.test(head)) return 'loop'
  if (/^(try|switch)\b/.test(head)) return 'branch'
  if (/^(return|throw)\b/.test(head)) return 'return'
  if (/^(break|continue)\b/.test(head)) return 'return'
  if (/^(const|let|var)\b/.test(head)) return 'binding'
  // Plain assignment, compound assignment and increment are all the same kind
  // of statement here: they change something that already exists and declare
  // nothing, so `declaredNames` gives them no studs and they still fit both
  // scopes. Leaving `total += n` unclassified would make it fit nowhere, and a
  // brick that fits nowhere poisons every assembly that contains it.
  if (/^[\w$.[\]]+\s*(?:=[^=]|[-+*/%&|^]=|\*\*=|<<=|>>>?=|\?\?=|\|\|=|&&=)/.test(head)) return 'binding'
  if (/^(?:\+\+|--)?[\w$.[\]]+(?:\+\+|--)\s*;?$/.test(head)) return 'binding'
  if (/^(await\s+)?[\w$.]+\s*\(/.test(head)) return 'call'
  return 'unknown'
}

function isTerminal(kind: ChunkKind): boolean {
  if (kind === 'return') return true
  // A guard only exits on its taken path, so code after it is reachable.
  return false
}

/* --------------------------------------------------- bindings and free names */

/** Names introduced by a declaration head, including destructuring patterns. */
function declaredNames(head: string): string[] {
  const out: string[] = []
  const decl = /\b(?:const|let|var)\s+([\s\S]*?)(?:=|;|$)/g
  let m: RegExpExecArray | null
  while ((m = decl.exec(head))) {
    const target = m[1]
    if (/^[\s]*[{[]/.test(target)) {
      // Destructuring: take the bound side of `a: b` and skip defaults.
      const inner = target.replace(/^[\s]*[{[]/, '').replace(/[\]}][\s]*$/, '')
      for (const part of inner.split(',')) {
        const bound = part.includes(':') ? part.split(':').pop()! : part
        const name = bound.replace(/\.\.\./, '').split('=')[0].trim()
        if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push(name)
      }
    } else {
      const name = target.split('=')[0].replace(/:[\s\S]*$/, '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push(name)
    }
  }
  const fn = /\b(?:function|class)\s+([A-Za-z_$][\w$]*)/.exec(head)
  if (fn) out.push(fn[1])
  return out
}

/** Parameter names of the first parameter list in `text`, if any. */
function paramNames(text: string): string[] {
  const open = text.indexOf('(')
  if (open === -1) return []
  let d = 0
  let close = -1
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') d++
    else if (text[i] === ')') { d--; if (d === 0) { close = i; break } }
  }
  if (close === -1) return []
  return namesFromParamList(text.slice(open + 1, close))
}

/** Bound names in one comma-separated parameter list, patterns included. */
function namesFromParamList(inner: string): string[] {
  const names: string[] = []
  for (const raw of inner.split(/,(?![^{[(]*[)\]}])/)) {
    const part = raw.replace(/:[^,=]*(?==|$)/, '').trim()
    if (!part) continue
    if (/^[{[]/.test(part)) {
      for (const p of part.replace(/^[{[]/, '').replace(/[\]}]$/, '').split(',')) {
        const bound = p.includes(':') ? p.split(':').pop()! : p
        const n = bound.replace(/\.\.\./, '').split('=')[0].trim()
        if (/^[A-Za-z_$][\w$]*$/.test(n)) names.push(n)
      }
      continue
    }
    const n = part.replace(/\.\.\./, '').split('=')[0].trim()
    if (/^[A-Za-z_$][\w$]*$/.test(n)) names.push(n)
  }
  return names
}

/**
 * Parameters of arrow functions and function expressions written *inside* a
 * chunk. `rows.map((row) => row.length)` binds `row` locally, and without this
 * the callback parameter reads as a socket the chunk can never fill — which in
 * practice is most real JavaScript.
 *
 * This is the one place the analysis errs toward accepting rather than
 * refusing: if a chunk names an inner parameter the same as an outer name it
 * also reads, the outer read is hidden. That shadowing case is rare; a false
 * socket on every `.map()` is not.
 */
function innerParamNames(text: string): string[] {
  const code = codeOnly(text)
  const names: string[] = []
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) names.push(...namesFromParamList(m[1]))
  for (const m of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) names.push(m[2])
  for (const m of code.matchAll(/\bfunction\b\s*[A-Za-z_$][\w$]*\s*\(([^()]*)\)|\bfunction\b\s*\(([^()]*)\)/g)) {
    names.push(...namesFromParamList(m[1] ?? m[2] ?? ''))
  }
  return names
}

/** Strip strings, templates and comments so identifier scanning sees only code. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, ' `` ')
    .replace(/'(?:\\.|[^'\\])*'/g, " '' ")
    .replace(/"(?:\\.|[^"\\])*"/g, ' "" ')
}

/** Every identifier read as a value: not a keyword, not a property, not a key. */
function referenced(text: string): string[] {
  const code = codeOnly(text)
  const out = new Set<string>()
  const re = /(\.\s*)?\b([A-Za-z_$][\w$]*)\b(\s*:)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    if (m[1]) continue                      // property access — not a free name
    if (m[3] && !/\?\s*:/.test(m[0])) continue  // object key or type annotation
    const name = m[2]
    if (KEYWORDS.has(name)) continue
    out.add(name)
  }
  return [...out]
}

/** Names an import statement introduces: default, namespace and named specifiers. */
function importedNames(text: string): string[] {
  const out: string[] = []
  const head = text.replace(/\bfrom\b[\s\S]*$/, '').replace(/^import\s*/, '')
  const named = /\{([\s\S]*?)\}/.exec(head)
  if (named) {
    for (const part of named[1].split(',')) {
      const bound = part.includes(' as ') ? part.split(' as ').pop()! : part
      const n = bound.replace(/^\s*type\s+/, '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(n)) out.push(n)
    }
  }
  const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(head)
  if (ns) out.push(ns[1])
  const def = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(head.replace(/\{[\s\S]*?\}/, ''))
  if (def && !KEYWORDS.has(def[1])) out.push(def[1])
  return [...new Set(out)]
}

function analyseBindings(text: string, kind: ChunkKind): { bindsIn: string[]; bindsOut: string[] } {
  // An import is pure stud: it consumes nothing from the module and supplies
  // every name it lists to everything below it.
  if (kind === 'import') return { bindsIn: [], bindsOut: importedNames(text).sort() }

  // Only split off a head when the first `{` really opens a body. Otherwise the
  // brace belongs to a destructuring pattern and the names inside it are exactly
  // the ones being declared — cutting there would hide every one of them.
  const open = hasBlockBody(kind, text) ? blockOpen(text) : -1
  const head = open === -1 ? text : text.slice(0, open)
  const bindsOut = [...new Set(declaredNames(head))]

  // Everything bound anywhere inside is local and must not read as a socket:
  // params, inner declarations, loop variables, catch bindings.
  const local = new Set<string>([
    ...bindsOut,
    ...(kind === 'function' || kind === 'loop' ? paramNames(text) : []),
    ...innerParamNames(text),
    ...declaredNames(open === -1 ? '' : text.slice(open)),
  ])
  for (const m of codeOnly(text).matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) local.add(m[1])
  for (const m of codeOnly(text).matchAll(/\b(?:for)\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1])

  const bindsIn = referenced(text).filter((n) => !local.has(n) && !AMBIENT.has(n))
  return { bindsIn: bindsIn.sort(), bindsOut: bindsOut.sort() }
}

/* -------------------------------------------------------------- skeletonise */

/**
 * The pocket-dimension key. Identifiers become positional slots in order of
 * first appearance, literals become placeholders, whitespace collapses. What
 * survives is the shape of the logic with every name and value removed.
 */
export function skeleton(text: string): string {
  const code = codeOnly(text)
  const seen = new Map<string, string>()
  return code
    .replace(/\b\d[\d_.eE+-]*\b/g, '0')
    .replace(/(\.\s*)?\b([A-Za-z_$][\w$]*)\b/g, (whole, dot, name) => {
      if (dot) return whole                  // property names are part of the shape
      if (KEYWORDS.has(name) || AMBIENT.has(name)) return whole
      if (!seen.has(name)) seen.set(name, `$${seen.size}`)
      return (dot || '') + seen.get(name)!
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/* ---------------------------------------------------------------- bisection */

/**
 * Does this chunk's first `{` open a statement block, or something else? An
 * import's braces hold specifiers and an object literal's hold properties —
 * neither is a body, and recursing into them produces nonsense bricks.
 */
function hasBlockBody(kind: ChunkKind, text: string): boolean {
  if (kind === 'function' || kind === 'branch' || kind === 'loop' || kind === 'guard') return true
  if (kind === 'binding' || kind === 'call' || kind === 'export') {
    return /(=>|\bfunction\b[^(]*\([^)]*\))\s*\{/.test(codeOnly(text))
  }
  return false
}

export type BisectOptions = {
  /** Stop recursing at this depth. Default 2 — deeper bricks stop being reusable. */
  maxDepth?: number
  /** Skip chunks shorter than this many non-space characters. Default 2. */
  minChars?: number
}

let counter = 0
function nextId(prefix: string): string {
  counter = (counter + 1) % 1_000_000
  return `${prefix}${counter.toString(36)}`
}

/**
 * Cut source into chunks. Recurses into block bodies so a function arrives with
 * its interior already bisected — the bricks nest the way the code does.
 */
export function bisect(source: string, opts: BisectOptions = {}): Chunk[] {
  const maxDepth = opts.maxDepth ?? 2
  const minChars = opts.minChars ?? 2
  const walk = (text: string, depth: number, lineBase: number): Chunk[] => {
    if (depth > maxDepth) return []
    const chunks: Chunk[] = []
    for (const span of splitStatements(text)) {
      const raw = span.text.replace(/^\n+/, '')
      const trimmed = raw.trim()
      if (trimmed.replace(/\s/g, '').length < minChars) continue

      const lead = text.slice(0, span.start).split('\n').length - 1
      const startLine = lineBase + lead + (span.text.length - span.text.replace(/^\n+/, '').length)
      const kind = classify(trimmed)
      const { bindsIn, bindsOut } = analyseBindings(trimmed, kind)

      let children: Chunk[] = []
      const open = blockOpen(trimmed)
      if (open !== -1 && depth < maxDepth && hasBlockBody(kind, trimmed)) {
        const close = blockClose(trimmed, open)
        if (close > open + 1) {
          const body = trimmed.slice(open + 1, close)
          const bodyLine = startLine + trimmed.slice(0, open).split('\n').length - 1
          children = walk(body, depth + 1, bodyLine)
        }
      }

      chunks.push({
        id: nextId('ck_'),
        kind,
        label: trimmed.split('\n')[0].trim().slice(0, 120),
        source: trimmed,
        bindsIn,
        bindsOut,
        terminal: isTerminal(kind),
        depth,
        children,
        lines: [startLine + 1, startLine + trimmed.split('\n').length],
        fingerprint: contentIndex(trimmed),
        shape: contentIndex(skeleton(trimmed)),
      })
    }
    return chunks
  }
  return walk(source, 0, 0)
}

/* ------------------------------------------------------------- the snap rule */

export type SnapFault =
  | { code: 'shape'; detail: string }
  | { code: 'unbound'; detail: string; missing: string[] }
  | { code: 'dead'; detail: string }

export type SnapVerdict = { ok: boolean; faults: SnapFault[] }

/**
 * Will this brick snap in here? Three checks, in the order of the quote:
 * can it physically fit, should it fit here given what exists, and is anything
 * downstream of a terminal already.
 */
export function canSnap(
  chunk: Chunk,
  at: { slot: SlotKind; available: string[]; afterTerminal: boolean },
): SnapVerdict {
  const faults: SnapFault[] = []

  if (!slotAccepts(chunk.kind, at.slot)) {
    faults.push({
      code: 'shape',
      detail:
        chunk.kind === 'unknown'
          ? 'The bisector could not classify this chunk, so it has no studs.'
          : `A ${KIND_BY[chunk.kind].label.toLowerCase()} cannot sit at ${at.slot} scope.`,
    })
  }

  const have = new Set(at.available)
  const missing = chunk.bindsIn.filter((n) => !have.has(n))
  if (missing.length) {
    faults.push({
      code: 'unbound',
      detail: `Needs ${missing.length === 1 ? 'a name' : 'names'} nothing above it supplies.`,
      missing,
    })
  }

  if (at.afterTerminal) {
    faults.push({ code: 'dead', detail: 'A terminal chunk already ran. Nothing here can execute.' })
  }

  return { ok: faults.length === 0, faults }
}

/* -------------------------------------------------------------- the assembly */

export type Assembly = {
  slot: SlotKind
  /** Names in scope before the first chunk — imports, params, module globals. */
  seed: string[]
  chunks: Chunk[]
}

export type Fault = SnapFault & { index: number; chunkId: string }

export type Validation = {
  ok: boolean
  faults: Fault[]
  /** Names in scope immediately before each index. Length = chunks.length + 1. */
  scope: string[][]
  /** Fraction of chunks with no fault. This is the number that stops a scrap. */
  preserved: number
  /** Indexes that are clean. */
  keep: number[]
  /** Indexes that are not. */
  scrap: number[]
}

export function validate(a: Assembly): Validation {
  const faults: Fault[] = []
  const scope: string[][] = []
  const bad = new Set<number>()
  let available = [...new Set(a.seed)]
  let terminated = false

  for (let i = 0; i < a.chunks.length; i++) {
    scope.push([...available])
    const chunk = a.chunks[i]
    const verdict = canSnap(chunk, { slot: a.slot, available, afterTerminal: terminated })
    for (const f of verdict.faults) {
      faults.push({ ...f, index: i, chunkId: chunk.id })
      bad.add(i)
    }
    // A faulted chunk still contributes its studs. Pretending it binds nothing
    // would cascade one fault into every chunk below it, and the whole point is
    // to keep the blast radius to the brick that is actually wrong.
    available = [...new Set([...available, ...chunk.bindsOut])]
    if (chunk.terminal) terminated = true
  }
  scope.push([...available])

  const keep: number[] = []
  const scrap: number[] = []
  for (let i = 0; i < a.chunks.length; i++) (bad.has(i) ? scrap : keep).push(i)

  return {
    ok: faults.length === 0,
    faults,
    scope,
    preserved: a.chunks.length ? keep.length / a.chunks.length : 1,
    keep,
    scrap,
  }
}

/* --------------------------------------------------------- meet in the middle
 *
 * The generation rule the transcript describes: anchor both ends, and either
 * the body joins them or the run is scrapped. What makes it useful rather than
 * decorative is that the backward pass is real — the tail's demands are computed
 * from the tail, not asserted — so "converged" means the seam actually carries
 * every name the tail reads.
 */

export type Convergence = {
  converged: boolean
  /** Names in scope at the seam, supplied by head + body. */
  seam: string[]
  /** Names the tail reads and does not itself bind. */
  demanded: string[]
  /** demanded − seam. Non-empty means the ends do not meet. */
  missing: string[]
  /** Names the body produced that nothing downstream reads. */
  unused: string[]
  /** Chunks placed after a terminal — they can never run. */
  unreachable: number
  headFaults: number
  bodyFaults: number
  note: string
}

export function converge(input: {
  slot: SlotKind
  seed: string[]
  head: Chunk[]
  body: Chunk[]
  tail: Chunk[]
}): Convergence {
  // Forward: what exists at the seam.
  const forward = validate({ slot: input.slot, seed: input.seed, chunks: [...input.head, ...input.body] })
  const seam = forward.scope[forward.scope.length - 1]

  // Backward: what the tail needs and cannot supply itself.
  const demanded = new Set<string>()
  const bound = new Set<string>()
  for (let i = input.tail.length - 1; i >= 0; i--) {
    const c = input.tail[i]
    for (const n of c.bindsOut) bound.add(n)
    for (const n of c.bindsIn) if (!bound.has(n)) demanded.add(n)
  }

  const have = new Set(seam)
  const missing = [...demanded].filter((n) => !have.has(n)).sort()

  const readDownstream = new Set<string>([
    ...demanded,
    ...input.body.flatMap((c) => c.bindsIn),
  ])
  const unused = [...new Set(input.body.flatMap((c) => c.bindsOut))]
    .filter((n) => !readDownstream.has(n))
    .sort()

  let unreachable = 0
  let terminated = false
  for (const c of [...input.head, ...input.body, ...input.tail]) {
    if (terminated) unreachable++
    if (c.terminal) terminated = true
  }

  const headFaults = forward.faults.filter((f) => f.index < input.head.length).length
  const bodyFaults = forward.faults.length - headFaults
  const converged = missing.length === 0 && forward.ok && unreachable === 0

  const note = converged
    ? `The ends meet. Every one of the ${demanded.size} name${demanded.size === 1 ? '' : 's'} the tail reads exists at the seam.`
    : missing.length
      ? `Scrapped at the seam: the tail reads ${missing.join(', ')} and nothing above produces ${missing.length === 1 ? 'it' : 'them'}.`
      : unreachable
        ? `Scrapped: ${unreachable} chunk${unreachable === 1 ? '' : 's'} sit after a terminal and can never run.`
        : `Scrapped: ${forward.faults.length} fault${forward.faults.length === 1 ? '' : 's'} in the head and body.`

  return {
    converged,
    seam: [...seam].sort(),
    demanded: [...demanded].sort(),
    missing,
    unused,
    unreachable,
    headFaults,
    bodyFaults,
    note,
  }
}

/* --------------------------------------------------------------- superposition
 *
 * The TIME quote, as a state machine.
 *
 * A chunk picked up is not anywhere. `superpose()` enumerates every index it
 * could land at and marks each legal or not, and NOTHING is written — the
 * outcomes are unanimated. `collapse()` picks one and appends an immutable
 * frame. Rewinding is done by replaying frames, never by mutating backwards.
 */

export type Landing = {
  index: number
  ok: boolean
  faults: SnapFault[]
}

export type Superposition = {
  chunkId: string
  /** One entry per insertion point, including before-first and after-last. */
  outcomes: Landing[]
  /** Indexes where it would land clean. Empty = this brick fits nowhere here. */
  permitted: number[]
}

export function superpose(chunk: Chunk, a: Assembly): Superposition {
  const v = validate(a)
  const outcomes: Landing[] = []
  for (let index = 0; index <= a.chunks.length; index++) {
    const terminatedBefore = a.chunks.slice(0, index).some((c) => c.terminal)
    const verdict = canSnap(chunk, {
      slot: a.slot,
      available: v.scope[index],
      afterTerminal: terminatedBefore,
    })
    // Inserting before something that reads what this chunk shadows is legal;
    // inserting a terminal above live chunks is not, and that is checked here
    // rather than left for the next validate() to discover.
    if (chunk.terminal && index < a.chunks.length) {
      verdict.faults.push({
        code: 'dead',
        detail: `Placing a terminal here strands the ${a.chunks.length - index} chunk${a.chunks.length - index === 1 ? '' : 's'} below it.`,
      })
    }
    outcomes.push({ index, ok: verdict.faults.length === 0, faults: verdict.faults })
  }
  return { chunkId: chunk.id, outcomes, permitted: outcomes.filter((o) => o.ok).map((o) => o.index) }
}

export type Frame = {
  /** Frame number. Monotonic, gapless, append-only. */
  n: number
  chunkId: string
  index: number
  /** Caller-supplied tick. The kernel does not read a clock. */
  tick: number
  /** How many outcomes were live at the instant before this one was chosen. */
  outcomes: number
  /** Content index of the assembly AFTER this frame. */
  digest: string
}

/**
 * Commit one outcome. Returns the new assembly and the frame that produced it;
 * the caller appends the frame to its own history. Refuses an outcome the
 * superposition did not permit — a collapse cannot invent a state the rules
 * never made available.
 */
export function collapse(
  a: Assembly,
  chunk: Chunk,
  sp: Superposition,
  index: number,
  tick: number,
  frameNo: number,
): { ok: false; reason: string } | { ok: true; assembly: Assembly; frame: Frame } {
  const landing = sp.outcomes.find((o) => o.index === index)
  if (!landing) return { ok: false, reason: 'That landing was never in the superposition.' }
  if (!landing.ok) {
    return { ok: false, reason: landing.faults[0]?.detail || 'That landing is not permitted.' }
  }
  const chunks = [...a.chunks.slice(0, index), chunk, ...a.chunks.slice(index)]
  const assembly: Assembly = { ...a, chunks }
  return {
    ok: true,
    assembly,
    frame: {
      n: frameNo,
      chunkId: chunk.id,
      index,
      tick,
      outcomes: sp.permitted.length,
      digest: contentIndex(fuse(assembly)),
    },
  }
}

/* ------------------------------------------------------------------ surgery
 *
 * The 80% rule. A single bad brick does not scrap the build; it names itself,
 * and everything around it is preserved verbatim.
 */

export type Repair = {
  preserved: number
  keep: Chunk[]
  scrap: Array<{ chunk: Chunk; index: number; faults: SnapFault[] }>
  /** What the shape of the replacement has to be, per hole. */
  plan: Array<{ index: number; needsKind: ChunkKind; mustBind: string[]; shape: string }>
  note: string
}

export function repair(a: Assembly): Repair {
  const v = validate(a)
  const byIndex = new Map<number, SnapFault[]>()
  for (const f of v.faults) {
    const list = byIndex.get(f.index) || []
    list.push(f)
    byIndex.set(f.index, list)
  }

  const scrap = [...byIndex.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([index, faults]) => ({ chunk: a.chunks[index], index, faults }))

  // What has to go back in each hole: the same kind, and it must supply
  // whatever the chunks below were reading from it.
  const plan = scrap.map(({ chunk, index }) => {
    const below = a.chunks.slice(index + 1)
    const readBelow = new Set(below.flatMap((c) => c.bindsIn))
    return {
      index,
      needsKind: chunk.kind,
      mustBind: chunk.bindsOut.filter((n) => readBelow.has(n)).sort(),
      shape: chunk.shape,
    }
  })

  const pct = Math.round(v.preserved * 100)
  return {
    preserved: v.preserved,
    keep: v.keep.map((i) => a.chunks[i]),
    scrap,
    plan,
    note: scrap.length
      ? `${pct}% of the assembly is intact. Replace ${scrap.length} brick${scrap.length === 1 ? '' : 's'}, not the file.`
      : 'Nothing to repair.',
  }
}

/* -------------------------------------------------------------------- output */

/** Re-emit the assembly as source. Chunks are verbatim; only indentation is ours. */
export function fuse(a: Assembly, indent = ''): string {
  return a.chunks
    .map((c) =>
      c.source
        .split('\n')
        .map((line, i) => (i === 0 ? indent + line : indent + line))
        .join('\n'),
    )
    .join('\n')
}

/**
 * The training pair. This is the reason the whole thing is worth building: the
 * fused source PLUS a byte-exact map of what every span is. No annotator traced
 * these boundaries and no model guessed them — they came out of the bisector
 * that produced the text, so the label is the same object as the ground truth.
 */
export type Annotation = {
  source: string
  slot: SlotKind
  spans: Array<{
    chunkId: string
    kind: ChunkKind
    /** Character offsets into `source`. Inclusive start, exclusive end. */
    start: number
    end: number
    bindsIn: string[]
    bindsOut: string[]
    terminal: boolean
    shape: string
    fingerprint: string
  }>
  scope: string[][]
  valid: boolean
  faults: number
}

export function annotate(a: Assembly): Annotation {
  const source = fuse(a)
  const v = validate(a)
  const spans: Annotation['spans'] = []
  let cursor = 0
  for (const c of a.chunks) {
    const start = source.indexOf(c.source, cursor)
    const end = start === -1 ? cursor : start + c.source.length
    spans.push({
      chunkId: c.id,
      kind: c.kind,
      start: start === -1 ? cursor : start,
      end,
      bindsIn: c.bindsIn,
      bindsOut: c.bindsOut,
      terminal: c.terminal,
      shape: c.shape,
      fingerprint: c.fingerprint,
    })
    cursor = end
  }
  return { source, slot: a.slot, spans, scope: v.scope, valid: v.ok, faults: v.faults.length }
}

/* ------------------------------------------------------------ pocket library
 *
 * Group by shape, not by text. Twelve differently-named retry loops are one
 * pocket with twelve occupants, and asking for a retry loop opens that pocket
 * instead of scanning the corpus.
 */

export type Pocket = {
  shape: string
  kind: ChunkKind
  /** The shortest occupant, used as the pocket's face. */
  exemplar: Chunk
  occupants: Chunk[]
  /** Distinct exact fingerprints inside. occupants.length − this = duplicates. */
  variants: number
}

export function pockets(chunks: Chunk[]): Pocket[] {
  const by = new Map<string, Chunk[]>()
  for (const c of chunks) {
    const list = by.get(c.shape) || []
    list.push(c)
    by.set(c.shape, list)
  }
  return [...by.entries()]
    .map(([shape, occupants]) => {
      const exemplar = occupants.reduce((a, b) => (a.source.length <= b.source.length ? a : b))
      return {
        shape,
        kind: exemplar.kind,
        exemplar,
        occupants,
        variants: new Set(occupants.map((o) => o.fingerprint)).size,
      }
    })
    .sort((a, b) => b.occupants.length - a.occupants.length || a.kind.localeCompare(b.kind))
}

export const CHUNKFUSION_VERSION = 1

/** Robert W. Dickson's line, kept next to the machinery it describes. */
export const SUBSTRATE_QUOTE = {
  text:
    'Stuff happening on the substrate of life based off relativity of what should or should not & what can &/or can\u2019t will happen eventually.',
  author: 'Robert W. Dickson',
  companion:
    'TIME: fractional seconds so small it is superposition, where outcomes are unanimated until the fractional second collapses.',
}
