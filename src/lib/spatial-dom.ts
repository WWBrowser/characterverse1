// SpatialVerse — the Spatial DOM (SDOM) and the engine that searches it.
//
// A web crawler can index a page because the page has a DOM: a tree of typed
// nodes whose relationships ("this paragraph is inside that article") are
// written down. A 3D space has no equivalent. A WebGL scene is a pile of
// meshes; "the book on the second shelf" is true of it only in the geometry,
// and nothing standard says which mesh is a book, which is a shelf, or what
// "second" counts from. That is the gap this file closes, in three parts:
//
//   1. **The document.** An SDOM document is a tree of typed nodes, each with
//      a bounding box in metres relative to its parent. Authors write down
//      only what a scene already knows — what a thing is and where it is.
//      Everything relational is derived, never authored, so two spaces
//      published by two different people answer the same questions the same
//      way. That is what makes it a standard rather than a format.
//
//   2. **The index.** Flattening a document gives every node a world-space
//      box, its ancestry, and its ordinal among same-typed siblings along the
//      axis those siblings actually spread out on. From those, the spatial
//      relations — on, in, near, above, below, left of, right of — are
//      computed on demand from geometry.
//
//   3. **The query.** A small grammar turns "the digital book located on the
//      second shelf of the virtual library" into a target and a list of
//      constraints, and serialises it back into the same words, so the page
//      can edit the query as structure and still keep it as a link.
//
// Conventions, stated once because "left" and "second" mean nothing without
// them: units are metres, y is up, and a viewer stands at +z looking toward
// −z, so "left" is smaller x and "front" is larger z. `pos` is the box's
// minimum corner relative to its parent's minimum corner. Vertical ordinals
// count from the top unless the query says otherwise — that is how people
// count shelves — and the query always shows which way it counted.
//
// Pure: no database and no DOM, so the page and the API run the same engine.

import { z } from 'zod'

/* ═════════════════════════════════════════════════════════════ the document */

export const SDOM_VERSION = '1.0'

/**
 * The structural role of a node — what kind of thing it is to the engine,
 * independent of what it is called. Six, and only six, so "on" and "in" can be
 * defined once for every space anyone publishes:
 *
 *   space      the whole place (a library, a gallery); usually the root
 *   room       an enclosed region inside a space
 *   furniture  a thing that holds other things (a bookcase, a desk)
 *   surface    a thing other things rest or hang on (a shelf, a wall)
 *   container  a thing other things are inside (a drawer, a box)
 *   object     a leaf — the thing you were probably looking for
 */
export const SDOM_KINDS = ['space', 'room', 'furniture', 'surface', 'container', 'object'] as const
export type SKind = (typeof SDOM_KINDS)[number]

export type Vec3 = [number, number, number]

export type SNode = {
  /** Unique within its document. */
  id: string
  kind: SKind
  /** The semantic class, free vocabulary: 'book', 'shelf', 'painting'. Singular. */
  type: string
  name: string
  /** Indexable content: a book's title and blurb, a painting's caption. */
  text?: string
  tags?: string[]
  /** Minimum corner, relative to the parent's minimum corner, in metres. */
  pos: Vec3
  /** Extent along x, y, z, in metres. */
  size: Vec3
  /** Where the thing leads, if it leads anywhere. Same-site path or https only. */
  href?: string
  /**
   * What the thing is *for*, when the space is a working room — the Rooms
   * profile (src/lib/spatial-room.ts). A station: the desk an agent drafts at,
   * the shelf it researches from. Optional, so every space published before
   * rooms existed is still a valid document. Standard purposes are plain
   * words; anyone else's are prefixed `x-`.
   */
  purpose?: string
  children?: SNode[]
}

export type SDocument = {
  sdom: typeof SDOM_VERSION
  slug: string
  title: string
  summary: string
  root: SNode
}

/* ------------------------------------------------------------- validation */

const LIMITS = { nodes: 2000, depth: 12, children: 400 }

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])

const nodeSchema: z.ZodType<SNode> = z.lazy(() =>
  z.object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum(SDOM_KINDS),
    type: z.string().trim().min(1).max(40),
    name: z.string().trim().max(120),
    text: z.string().max(2000).optional(),
    tags: z.array(z.string().trim().max(40)).max(20).optional(),
    pos: vec3,
    size: vec3.refine((v) => v.every((n) => n > 0 && n <= 10000), 'size must be positive'),
    // A published space is someone else's content, and an href is the one
    // field that executes on click — so `javascript:` and friends never make it
    // in. Same-site paths and https only.
    href: z
      .string()
      .max(400)
      .regex(/^(\/(?!\/)|https:\/\/)/, 'href must be a same-site path or an https URL')
      .optional(),
    purpose: z
      .string()
      .regex(/^(x-)?[a-z][a-z0-9-]{1,39}$/, 'purpose must be a lower-case word, or x-word for a custom one')
      .optional(),
    children: z.array(nodeSchema).max(LIMITS.children).optional(),
  }),
) as z.ZodType<SNode>

const docSchema = z.object({
  sdom: z.literal(SDOM_VERSION),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lower-case letters, digits and dashes'),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(600),
  root: nodeSchema,
})

/**
 * Validate an SDOM document. The schema checks each node; this checks the
 * whole — size, depth and id uniqueness — because a tree of individually valid
 * nodes can still be a document no index should hold.
 */
export function validateDocument(input: unknown): { ok: true; doc: SDocument } | { ok: false; error: string } {
  const parsed = docSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `${issue.path.join('.') || 'document'}: ${issue.message}` }
  }
  const doc = parsed.data as SDocument
  const ids = new Set<string>()
  let count = 0
  let deepest = 0
  const walk = (n: SNode, depth: number): string | null => {
    count += 1
    deepest = Math.max(deepest, depth)
    if (count > LIMITS.nodes) return `more than ${LIMITS.nodes} nodes`
    if (depth > LIMITS.depth) return `deeper than ${LIMITS.depth} levels`
    if (ids.has(n.id)) return `duplicate node id "${n.id}"`
    ids.add(n.id)
    for (const c of n.children || []) {
      const err = walk(c, depth + 1)
      if (err) return err
    }
    return null
  }
  const err = walk(doc.root, 0)
  return err ? { ok: false, error: err } : { ok: true, doc }
}

export function countNodes(n: SNode): number {
  return 1 + (n.children || []).reduce((s, c) => s + countNodes(c), 0)
}

/* ════════════════════════════════════════════════════════════════ the index */

type Axis = 0 | 1 | 2

export type INode = {
  i: number
  id: string
  kind: SKind
  type: string
  name: string
  text: string
  tags: string[]
  href?: string
  min: Vec3
  max: Vec3
  parent: number
  /** Ancestor indices, root first, parent last. */
  path: number[]
  children: number[]
  /** Rank among same-typed siblings along each axis, counting up from the low end. */
  rank: [number, number, number]
  /** How many same-typed siblings, this one included. */
  of: number
  /** The axis those siblings spread out along — the one "second" counts on. */
  axis: Axis
  /** Every word the node answers to: type, name, text and tags, singularised. */
  words: Set<string>
  /** Name words alone, for naming the node back in a query. */
  nameWords: string[]
}

/**
 * A name's words minus its type: "Bookcase A" → ["a"], "Reading Room" →
 * ["reading"]. Articles go, except a lone letter straight after the type —
 * that "A" is a label, and dropping it would make Bookcase A every bookcase.
 */
function nameWordsOf(name: string, type: string): string[] {
  const ws = wordsOf(name)
  return ws.filter((w, k) => w !== type && !(ARTICLES.has(w) && !(w === 'a' && ws[k - 1] === type)))
}

export type SceneIndex = {
  slug: string
  title: string
  summary: string
  nodes: INode[]
}

export function indexScene(doc: SDocument): SceneIndex {
  const nodes: INode[] = []
  const walk = (n: SNode, parent: number, origin: Vec3, path: number[]) => {
    const min: Vec3 = [origin[0] + n.pos[0], origin[1] + n.pos[1], origin[2] + n.pos[2]]
    const max: Vec3 = [min[0] + n.size[0], min[1] + n.size[1], min[2] + n.size[2]]
    const i = nodes.length
    const type = singular(n.type.toLowerCase())
    nodes.push({
      i,
      id: n.id,
      kind: n.kind,
      type,
      name: n.name,
      text: n.text || '',
      tags: n.tags || [],
      href: n.href,
      min,
      max,
      parent,
      path,
      children: [],
      rank: [1, 1, 1],
      of: 1,
      axis: 1,
      words: new Set([type, ...wordsOf(n.name), ...wordsOf(n.text || ''), ...(n.tags || []).flatMap(wordsOf)]),
      nameWords: nameWordsOf(n.name, type),
    })
    if (parent >= 0) nodes[parent].children.push(i)
    for (const c of n.children || []) walk(c, i, min, [...path, i])
  }
  walk(doc.root, -1, [0, 0, 0], [])

  // Ordinals. Same-typed siblings are ranked on every axis, and the axis they
  // spread furthest along is the one an unqualified "second" counts on — so
  // shelves count vertically, books on a shelf count left to right, and
  // paintings on a side wall count front to back, without anyone saying so.
  for (const n of nodes) {
    const groups = new Map<string, number[]>()
    for (const c of n.children) {
      const t = nodes[c].type
      groups.set(t, [...(groups.get(t) || []), c])
    }
    for (const group of groups.values()) {
      const spread = ([0, 1, 2] as Axis[]).map((a) => {
        const v = group.map((g) => nodes[g].min[a])
        return Math.max(...v) - Math.min(...v)
      })
      const axis = spread.indexOf(Math.max(...spread)) as Axis
      for (const a of [0, 1, 2] as Axis[]) {
        const sorted = [...group].sort((p, q) => nodes[p].min[a] - nodes[q].min[a] || p - q)
        sorted.forEach((g, r) => { nodes[g].rank[a] = r + 1 })
      }
      for (const g of group) {
        nodes[g].of = group.length
        nodes[g].axis = axis
      }
    }
  }

  return { slug: doc.slug, title: doc.title, summary: doc.summary, nodes }
}

/* ------------------------------------------------------------ relations */

const EPS = 0.04

function overlap1(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0)
}

function overlapsXZ(a: INode, b: INode): boolean {
  return overlap1(a.min[0], a.max[0], b.min[0], b.max[0]) > 0 && overlap1(a.min[2], a.max[2], b.min[2], b.max[2]) > 0
}

/** Shortest distance between two boxes; 0 when they touch or overlap. */
function gap(a: INode, b: INode): number {
  let d = 0
  for (const k of [0, 1, 2] as Axis[]) {
    const g = Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k], 0)
    d += g * g
  }
  return Math.sqrt(d)
}

function isAncestor(s: SceneIndex, anc: number, n: number): boolean {
  return s.nodes[n].path.includes(anc)
}

/** The room a node is in — or the space, when it is in no room. */
export function roomOf(s: SceneIndex, n: number): number {
  const node = s.nodes[n]
  if (node.kind === 'room') return n
  for (let k = node.path.length - 1; k >= 0; k--) if (s.nodes[node.path[k]].kind === 'room') return node.path[k]
  return node.path[0] ?? n
}

/**
 * What a node rests on.
 *
 * Its parent, when the parent is a surface or a container — a book filed on a
 * shelf, a drive in a drawer. Failing
 * that, the highest thing in the same room whose top meets this node's bottom
 * and whose footprint it overlaps — a sculpture standing on a plinth it was
 * never filed under. The second rule is the one that makes geometry, not the
 * author's tree, the source of truth.
 */
function supportOf(s: SceneIndex, n: number): number {
  const node = s.nodes[n]
  // Filed on a surface, or inside a container: either way it rests on what it
  // was filed under, and the drawer below a drawer is not holding anything up.
  if (node.parent >= 0 && (s.nodes[node.parent].kind === 'surface' || s.nodes[node.parent].kind === 'container')) return node.parent
  const room = roomOf(s, n)
  let best = -1
  for (const o of s.nodes) {
    if (o.i === n || o.kind === 'space' || o.kind === 'room' || isAncestor(s, n, o.i)) continue
    if (o.i !== room && !isAncestor(s, room, o.i)) continue
    if (Math.abs(o.max[1] - node.min[1]) > EPS || !overlapsXZ(node, o)) continue
    if (best < 0 || o.max[1] > s.nodes[best].max[1]) best = o.i
  }
  return best
}

export const RELATIONS = ['on', 'in', 'near', 'above', 'below', 'left-of', 'right-of'] as const
export type Rel = (typeof RELATIONS)[number]

/** Whether `rel(a, b)` holds — "a is on b", "a is in b" — read off the geometry. */
export function holds(s: SceneIndex, rel: Rel, a: number, b: number): boolean {
  if (a === b) return false
  const A = s.nodes[a]
  const B = s.nodes[b]
  switch (rel) {
    case 'in':
      return isAncestor(s, b, a)
    case 'on': {
      // On the thing that holds you up, or on the furniture that thing is part
      // of — a book on a shelf is also on the bookcase, which is how anyone
      // would say it.
      const sup = supportOf(s, a)
      if (sup < 0) return false
      return sup === b || (B.kind === 'furniture' && isAncestor(s, b, sup))
    }
    case 'near':
      return !isAncestor(s, a, b) && !isAncestor(s, b, a) && roomOf(s, a) === roomOf(s, b) && gap(A, B) <= 1.2
    case 'above':
      return roomOf(s, a) === roomOf(s, b) && A.min[1] >= B.max[1] - EPS && horizontalGap(A, B) <= 0.5
    case 'below':
      return roomOf(s, a) === roomOf(s, b) && A.max[1] <= B.min[1] + EPS && horizontalGap(A, B) <= 0.5
    case 'left-of':
      return sideBySide(s, A, B) && A.max[0] <= B.min[0] + EPS
    case 'right-of':
      return sideBySide(s, A, B) && A.min[0] >= B.max[0] - EPS
  }
}

function horizontalGap(a: INode, b: INode): number {
  const gx = Math.max(a.min[0] - b.max[0], b.min[0] - a.max[0], 0)
  const gz = Math.max(a.min[2] - b.max[2], b.min[2] - a.max[2], 0)
  return Math.hypot(gx, gz)
}

/** Left and right only mean something between things at roughly the same height, in the same room. */
function sideBySide(s: SceneIndex, a: INode, b: INode): boolean {
  return (
    roomOf(s, a.i) === roomOf(s, b.i) &&
    !isAncestor(s, a.i, b.i) &&
    !isAncestor(s, b.i, a.i) &&
    overlap1(a.min[1], a.max[1], b.min[1], b.max[1]) > -0.3 &&
    gap(a, b) <= 2.5
  )
}

/* ════════════════════════════════════════════════════════════════ the query */

export type From = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'
export type Ordinal = { n: number | 'last' | 'middle'; from: From }

export type NounPhrase = {
  /** A type the index knows, or null when the words name nothing typed. */
  head: string | null
  /** Descriptors: "digital", "red", "virtual". They narrow when they can. */
  words: string[]
  /** Single letters and numbers after the head — "bookcase B", "shelf 2". Must match the name. */
  label: string[]
  ordinal: Ordinal | null
}

export type SpatialConstraint =
  | { rel: Rel; anchor: NounPhrase }
  /** A constraint on the target's own text: "about whales", "called Moby-Dick", "by Melville". */
  | { rel: 'text'; via: string; words: string[] }

export type SpatialQuery = { target: NounPhrase; constraints: SpatialConstraint[] }

/* ------------------------------------------------------------ vocabulary */

const ARTICLES = new Set(['the', 'a', 'an'])

const FILLER = new Set([
  'the', 'a', 'an', 'find', 'show', 'me', 'where', 'is', 'are', 'was', 'that', 'which', 'who', 'located', 'situated',
  'placed', 'sitting', 'sits', 'kept', 'stored', 'lying', 'lies', 'hanging', 'hangs', 'standing', 'stands', 'there',
  'please', 'i', 'want', 'looking', 'for', 'look', 'search', 'get', 'any', 'some', 'one', 'thing', 'item',
])

/** Words people use for a type, mapped to the type. Plurals are handled separately. */
const SYNONYMS: Record<string, string> = {
  novel: 'book', volume: 'book', tome: 'book', ebook: 'book', title: 'book',
  bookshelf: 'bookcase', shelving: 'bookcase', stack: 'bookcase',
  ledge: 'shelf',
  picture: 'painting', artwork: 'painting', canvas: 'painting', portrait: 'painting',
  statue: 'sculpture', bust: 'sculpture',
  pedestal: 'plinth',
  screen: 'monitor', display: 'monitor',
  cup: 'mug',
  hall: 'room', chamber: 'room', gallery: 'gallery',
  library: 'library', studio: 'studio',
  catalog: 'catalogue', 'card-catalogue': 'catalogue',
  seat: 'chair', armchair: 'chair',
  light: 'lamp',
}

/** A naive singular. Enough for a vocabulary of nouns that name things in rooms. */
export function singular(w: string): string {
  if (SYNONYMS[w]) return SYNONYMS[w]
  if (w.length > 4 && w.endsWith('ves')) return w.slice(0, -3) + 'f' // shelves
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y' // libraries
  if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2) // boxes
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
    const s = w.slice(0, -1)
    return SYNONYMS[s] || s
  }
  return w
}

export function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).map(singular)
}

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
}
const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

/** Adjectives that are ordinals in disguise: "the top shelf" is the first from the top. */
const EDGE: Record<string, Ordinal> = {
  top: { n: 1, from: 'top' },
  topmost: { n: 1, from: 'top' },
  bottom: { n: 1, from: 'bottom' },
  lowest: { n: 1, from: 'bottom' },
  left: { n: 1, from: 'left' },
  leftmost: { n: 1, from: 'left' },
  right: { n: 1, from: 'right' },
  rightmost: { n: 1, from: 'right' },
  front: { n: 1, from: 'front' },
  back: { n: 1, from: 'back' },
  last: { n: 'last', from: 'auto' },
  middle: { n: 'middle', from: 'auto' },
}

/** Relation phrases, longest first so "to the left of" wins over "of". */
const REL_PHRASES: [string[], Rel | 'text'][] = (
  [
    ['to the left of', 'left-of'], ['to the right of', 'right-of'], ['on top of', 'on'], ['next to', 'near'],
    ['close to', 'near'], ['left of', 'left-of'], ['right of', 'right-of'], ['inside of', 'in'],
    ['on', 'on'], ['upon', 'on'], ['in', 'in'], ['inside', 'in'], ['within', 'in'], ['of', 'in'], ['at', 'in'],
    ['near', 'near'], ['beside', 'near'], ['by', 'near'], ['above', 'above'], ['over', 'above'],
    ['below', 'below'], ['under', 'below'], ['underneath', 'below'], ['beneath', 'below'],
    ['about', 'text'], ['called', 'text'], ['named', 'text'], ['titled', 'text'], ['with', 'text'],
  ] as [string, Rel | 'text'][]
)
  .map(([p, r]) => [p.split(' '), r] as [string[], Rel | 'text'])
  .sort((a, b) => b[0].length - a[0].length)

/* --------------------------------------------------------------- parsing */

/**
 * Natural language → SpatialQuery.
 *
 * Splits on relation phrases into a target and a run of constraints, then
 * reads each piece as a noun phrase: ordinal, descriptors, a head the index
 * knows, a label. Constraints all apply to the target — "the book on the
 * second shelf of the library" is a book that is on a second shelf and in the
 * library — which is equivalent for containment and keeps every refinement an
 * append.
 *
 * A spatial phrase whose anchor names no known type is not spatial at all:
 * "a book by Melville" is about an author, not a book near a Melville. Such
 * phrases become text constraints and keep the word that introduced them.
 */
export function parseQuery(raw: string, types: Set<string>): SpatialQuery {
  // Apostrophes vanish ("o'clock" → "oclock"); every other mark is a space, so
  // "Moby-Dick" is the two words the index holds it under.
  const tokens = raw.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9#]+/g) || []

  const pieces: { rel: Rel | 'text' | null; via: string; tokens: string[] }[] = [{ rel: null, via: '', tokens: [] }]
  for (let i = 0; i < tokens.length; ) {
    const hit = REL_PHRASES.find(([p]) => p.every((w, k) => tokens[i + k] === w))
    // "from the top" is part of an ordinal, never a relation.
    if (hit && pieces[pieces.length - 1].tokens.length > 0) {
      pieces.push({ rel: hit[1], via: hit[0].join(' '), tokens: [] })
      i += hit[0].length
      continue
    }
    pieces[pieces.length - 1].tokens.push(tokens[i])
    i += 1
  }

  const target = parseNP(pieces[0].tokens, types)
  const constraints: SpatialConstraint[] = []
  for (const p of pieces.slice(1)) {
    if (!p.tokens.length || !p.rel) continue
    if (p.rel === 'text') {
      const words = p.tokens.filter((t) => !ARTICLES.has(t))
      if (words.length) constraints.push({ rel: 'text', via: p.via, words })
      continue
    }
    const np = parseNP(p.tokens, types)
    if (np.head) constraints.push({ rel: p.rel, anchor: np })
    else {
      const words = p.tokens.filter((t) => !FILLER.has(t))
      if (words.length) constraints.push({ rel: 'text', via: p.via, words })
    }
  }
  return { target, constraints }
}

function parseNP(tokens: string[], types: Set<string>): NounPhrase {
  let ordinal: Ordinal | null = null
  let from: From | null = null

  // "from the top" / "from the left", anywhere in the phrase.
  const rest: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'from') {
      const j = tokens[i + 1] === 'the' ? i + 2 : i + 1
      const dir = tokens[j] as From
      if (['top', 'bottom', 'left', 'right', 'front', 'back'].includes(dir)) {
        from = dir
        i = j
        continue
      }
    }
    rest.push(tokens[i])
  }

  // The head: the rightmost word that names a type the index holds.
  let headAt = -1
  for (let i = rest.length - 1; i >= 0; i--) {
    if (types.has(singular(rest[i]))) { headAt = i; break }
  }
  const head = headAt >= 0 ? singular(rest[headAt]) : null

  const words: string[] = []
  const label: string[] = []
  rest.forEach((t, i) => {
    if (i === headAt) return
    // A single letter or a number straight after the head is a label: "bookcase a".
    if (headAt >= 0 && i === headAt + 1 && /^([a-z]|\d+)$/.test(t)) { label.push(t); return }
    if (FILLER.has(t)) return
    const n = ORDINALS[t] ?? (/^#?(\d+)(st|nd|rd|th)?$/.test(t) && !/^\d+$/.test(t) ? parseInt(t.replace('#', ''), 10) : NaN)
    if (Number.isFinite(n) && n > 0) { ordinal = { n, from: 'auto' }; return }
    if (EDGE[t] && headAt >= 0 && i < headAt) { ordinal = { ...EDGE[t] }; return }
    words.push(singular(t))
  })

  // Assigned inside the loop's callback, which narrowing cannot see into.
  const counted = ordinal as Ordinal | null
  if (from) ordinal = { n: counted?.n ?? 1, from }
  if (!head && !words.length && label.length) words.push(...label.splice(0))
  return { head, words, label, ordinal }
}

/* ------------------------------------------------------------ serialising */

const FROM_WORDS: Record<Exclude<From, 'auto'>, string> = {
  top: 'from the top', bottom: 'from the bottom', left: 'from the left', right: 'from the right',
  front: 'from the front', back: 'from the back',
}

const REL_WORDS: Record<Rel, string> = {
  on: 'on', in: 'in', near: 'near', above: 'above', below: 'below', 'left-of': 'left of', 'right-of': 'right of',
}

export function ordinalWord(o: Ordinal): string {
  if (o.n === 'last') return 'last'
  if (o.n === 'middle') return 'middle'
  return ORDINAL_WORDS[o.n] || `${o.n}th`
}

export function npText(np: NounPhrase): string {
  const parts: string[] = []
  if (np.ordinal) parts.push(ordinalWord(np.ordinal))
  parts.push(...np.words)
  if (np.head) parts.push(np.head)
  parts.push(...np.label)
  if (np.ordinal && np.ordinal.from !== 'auto') parts.push(FROM_WORDS[np.ordinal.from])
  return parts.join(' ')
}

/** SpatialQuery → words that parse back into the same query. */
export function serializeQuery(q: SpatialQuery): string {
  const out = [`the ${npText(q.target)}`]
  for (const c of q.constraints) {
    if (c.rel === 'text') out.push(`${c.via} ${c.words.join(' ')}`)
    else out.push(`${REL_WORDS[c.rel]} the ${npText(c.anchor)}`)
  }
  return out.join(' ')
}

/* ════════════════════════════════════════════════════════════ the resolver */

export type HitPathStep = { id: string; name: string; type: string; kind: SKind; refine: string }

export type SpatialHit = {
  scene: string
  sceneTitle: string
  id: string
  name: string
  type: string
  kind: SKind
  text: string
  href?: string
  path: HitPathStep[]
  score: number
  satisfied: string[]
  failed: string[]
  why: string
  /** Node ids of the anchors that satisfied the first spatial constraint, for highlighting. */
  anchors: string[]
  room: string
}

export type Facet = { label: string; count: number; refine: string }

export type ViewBox = {
  id: string
  name: string
  type: string
  kind: SKind
  min: Vec3
  max: Vec3
  role: 'target' | 'anchor' | 'context'
  /** A query that finds exactly this node, so the map is navigable. */
  find: string
}

export type SpatialResult = {
  query: string
  parsed: SpatialQuery
  /** The query in canonical words — what the page shows as "read as". */
  canonical: string
  exact: SpatialHit[]
  /** When nothing satisfies every constraint: the closest, with what they fail. */
  partial: SpatialHit[]
  facets: Facet[]
  /** Descriptors that matched nothing anywhere and were set aside rather than allowed to empty the page. */
  ignored: string[]
  views: Record<string, { scene: string; room: string; title: string; boxes: ViewBox[] }>
  /**
   * The axis an unqualified ordinal actually counted on, per phrase — target
   * first, then each constraint (null where there is no ordinal or no match).
   * The page needs it to turn "second" around: the opposite end of a shelf
   * stack is the bottom, of a side wall the back.
   */
  autoAxis: { target: 0 | 1 | 2 | null; constraints: (0 | 1 | 2 | null)[] }
  types: string[]
  stats: { scenes: number; nodes: number; took_ms: number }
}

function ordinalFits(node: INode, o: Ordinal): boolean {
  const axis: Axis =
    o.from === 'top' || o.from === 'bottom' ? 1 : o.from === 'left' || o.from === 'right' ? 0 : o.from === 'front' || o.from === 'back' ? 2 : node.axis
  // Natural direction per axis: vertical counts from the top, horizontal from
  // the left, depth from the front.
  const fromHigh = o.from === 'top' || o.from === 'right' || o.from === 'front' || (o.from === 'auto' && axis !== 0)
  const low = node.rank[axis]
  const counted = fromHigh ? node.of - low + 1 : low
  const want = o.n === 'last' ? node.of : o.n === 'middle' ? Math.ceil(node.of / 2) : o.n
  return counted === want
}

function nodeMatchesWords(node: INode, words: string[]): boolean {
  return words.every((w) => node.words.has(w))
}

/**
 * Candidates for a noun phrase in one scene.
 *
 * Head and label are hard: a shelf is a shelf, and "bookcase B" is the one
 * named B. Descriptors narrow only when something carries them — the caller
 * decides that across every scene, so "digital" filters a library whose books
 * say digital and is set aside, reported, in a gallery that never mentions it.
 */
function candidates(s: SceneIndex, np: NounPhrase, keep: Set<string>): number[] {
  return s.nodes
    .filter((n) => {
      if (np.head && n.type !== np.head) return false
      if (!np.head && !np.words.some((w) => n.words.has(w))) return false
      if (np.label.length && !np.label.every((l) => wordsOf(n.name).includes(l))) return false
      const desc = np.words.filter((w) => keep.has(w))
      if (np.head && desc.length && !nodeMatchesWords(n, desc)) return false
      if (np.ordinal && !ordinalFits(n, np.ordinal)) return false
      return true
    })
    .map((n) => n.i)
}

/** Which descriptors of a phrase are carried by at least one node of its head type, anywhere. */
function keptWords(scenes: SceneIndex[], np: NounPhrase): Set<string> {
  const keep = new Set<string>()
  for (const w of np.words) {
    if (scenes.some((s) => s.nodes.some((n) => (!np.head || n.type === np.head) && n.words.has(w)))) keep.add(w)
  }
  return keep
}

function describe(c: SpatialConstraint): string {
  return c.rel === 'text' ? `${c.via} ${c.words.join(' ')}` : `${REL_WORDS[c.rel]} ${npText(c.anchor)}`
}

function textHolds(node: INode, words: string[]): boolean {
  return wordsOf(words.join(' ')).every((w) => node.words.has(w))
}

const MAX_HITS = 24

export function resolve(raw: string, scenes: SceneIndex[]): SpatialResult {
  const t0 = Date.now()
  const types = new Set(scenes.flatMap((s) => s.nodes.map((n) => n.type)))
  const parsed = parseQuery(raw, types)

  const npKeep = new Map<NounPhrase, Set<string>>()
  const keep = (np: NounPhrase) => {
    if (!npKeep.has(np)) npKeep.set(np, keptWords(scenes, np))
    return npKeep.get(np)!
  }
  const ignored = new Set<string>()
  for (const np of [parsed.target, ...parsed.constraints.flatMap((c) => (c.rel === 'text' ? [] : [c.anchor]))]) {
    const k = keep(np)
    // A phrase with no head is all descriptor; its words are the search and are never "ignored".
    if (np.head) for (const w of np.words) if (!k.has(w)) ignored.add(w)
  }

  const scored: (SpatialHit & { _n: number; _scene: SceneIndex })[] = []
  const autoAxis: SpatialResult['autoAxis'] = { target: null, constraints: parsed.constraints.map(() => null) }
  for (const s of scenes) {
    const targets = candidates(s, parsed.target, keep(parsed.target))
    if (!targets.length) continue
    const anchorSets = parsed.constraints.map((c) => (c.rel === 'text' ? [] : candidates(s, c.anchor, keep(c.anchor))))
    if (autoAxis.target === null && parsed.target.ordinal) autoAxis.target = s.nodes[targets[0]].axis
    anchorSets.forEach((set, k) => {
      const c = parsed.constraints[k]
      if (autoAxis.constraints[k] === null && set.length && c.rel !== 'text' && c.anchor.ordinal) autoAxis.constraints[k] = s.nodes[set[0]].axis
    })
    for (const t of targets) {
      const node = s.nodes[t]
      const satisfied: string[] = []
      const failed: string[] = []
      let firstAnchors: number[] = []
      parsed.constraints.forEach((c, k) => {
        if (c.rel === 'text') {
          ;(textHolds(node, c.words) ? satisfied : failed).push(describe(c))
          return
        }
        const ok = anchorSets[k].filter((a) => holds(s, c.rel, t, a))
        if (ok.length && !firstAnchors.length) firstAnchors = ok
        ;(ok.length ? satisfied : failed).push(describe(c))
      })
      const total = parsed.constraints.length
      const desc = parsed.target.words
      const descHit = desc.length ? desc.filter((w) => node.words.has(w)).length / desc.length : 1
      const score = Math.round(100 * (0.7 * (total ? satisfied.length / total : 1) + 0.3 * descHit))
      scored.push({
        _n: t,
        _scene: s,
        scene: s.slug,
        sceneTitle: s.title,
        id: node.id,
        name: node.name,
        type: node.type,
        kind: node.kind,
        text: node.text,
        href: node.href,
        path: [],
        score,
        satisfied,
        failed,
        why: '',
        anchors: firstAnchors.map((a) => s.nodes[a].id),
        room: s.nodes[roomOf(s, t)].id,
      })
    }
  }

  const exactAll = scored.filter((h) => !h.failed.length).sort((a, b) => b.score - a.score || a._n - b._n)
  let partialAll: typeof scored = []
  if (!exactAll.length && parsed.constraints.length) {
    const best = Math.max(0, ...scored.map((h) => h.satisfied.length))
    partialAll = scored.filter((h) => h.satisfied.length === best).sort((a, b) => b.score - a.score || a._n - b._n)
  }

  const finish = (h: (typeof scored)[number]): SpatialHit => {
    const s = h._scene
    const node = s.nodes[h._n]
    const { _n, _scene, ...hit } = h
    void _n
    void _scene
    hit.path = [...node.path, h._n].map((p) => ({
      id: s.nodes[p].id,
      name: s.nodes[p].name,
      type: s.nodes[p].type,
      kind: s.nodes[p].kind,
      refine: refineWith(parsed, s, p),
    }))
    hit.why = whyOf(s, h._n)
    return hit
  }

  const exact = exactAll.slice(0, MAX_HITS).map(finish)
  const partial = partialAll.slice(0, MAX_HITS).map(finish)

  // The maps: one per room any shown hit is in, each box clickable.
  const views: SpatialResult['views'] = {}
  for (const h of [...exact, ...partial]) {
    const key = `${h.scene}/${h.room}`
    const s = scenes.find((x) => x.slug === h.scene)!
    if (!views[key]) views[key] = { scene: h.scene, room: h.room, title: '', boxes: [] }
    const v = views[key]
    if (v.boxes.length) {
      for (const b of v.boxes) {
        if (b.id === h.id) b.role = 'target'
        else if (h.anchors.includes(b.id) && b.role === 'context') b.role = 'anchor'
      }
      continue
    }
    const roomI = s.nodes.findIndex((n) => n.id === h.room)
    v.title = s.nodes[roomI].kind === 'room' ? `${s.nodes[roomI].name} · ${s.title}` : s.title
    v.boxes = s.nodes
      .filter((n) => n.i !== roomI && n.kind !== 'space' && n.kind !== 'room' && (isAncestor(s, roomI, n.i) || s.nodes[roomI].kind === 'space'))
      .slice(0, 400)
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        kind: n.kind,
        min: n.min,
        max: n.max,
        role: n.id === h.id ? 'target' : h.anchors.includes(n.id) ? 'anchor' : 'context',
        find: findQuery(s, n.i),
      }))
  }

  return {
    query: raw,
    parsed,
    canonical: serializeQuery(parsed),
    exact,
    partial,
    facets: facetsOf(parsed, exactAll),
    ignored: [...ignored],
    views,
    autoAxis,
    types: [...types].sort(),
    stats: { scenes: scenes.length, nodes: scenes.reduce((n, s) => n + s.nodes.length, 0), took_ms: Date.now() - t0 },
  }
}

/* ---------------------------------------------------------- refinements */

/** The noun phrase that names one node: its type, its descriptive name words, its label. */
function npFor(n: INode): NounPhrase {
  const label = n.nameWords.filter((w) => /^([a-z]|\d+)$/.test(w))
  const words = n.nameWords.filter((w) => !label.includes(w) && !FILLER.has(w))
  return { head: n.type, words, label, ordinal: null }
}

/**
 * The relation a refinement uses for a node: on a surface, in anything else.
 * "In" always holds for a descendant, so a refinement can never empty the page
 * by picking the wrong preposition for a bookcase.
 */
function relInto(n: INode): Rel {
  return n.kind === 'surface' ? 'on' : 'in'
}

/**
 * The query, deepened by one node: "…and in this bookcase".
 *
 * The node's own phrase may not be unique — every bookcase has a "Shelf 2" —
 * so ancestors are added from the inside out until it is. A refinement that
 * quietly matched three shelves would be a refinement that did not refine.
 */
function refineWith(q: SpatialQuery, s: SceneIndex, n: number): string {
  const node = s.nodes[n]
  if (node.kind === 'space' && s.nodes.length && node.parent < 0) {
    return serializeQuery({ ...q, constraints: [...q.constraints, { rel: 'in', anchor: npFor(node) }] })
  }
  const added: SpatialConstraint[] = [{ rel: relInto(node), anchor: npFor(node) }]
  for (let k = node.path.length - 1; k >= 0 && !uniqueIn(s, added); k--) {
    const a = s.nodes[node.path[k]]
    if (a.kind === 'space') break
    added.push({ rel: 'in', anchor: npFor(a) })
  }
  const have = new Set(q.constraints.map((c) => (c.rel === 'text' ? '' : `${c.rel}:${npText(c.anchor)}`)))
  const fresh = added.filter((c) => c.rel !== 'text' && !have.has(`${c.rel}:${npText(c.anchor)}`))
  return serializeQuery({ ...q, constraints: [...q.constraints, ...fresh] })
}

/**
 * Whether a chain of anchors — "shelf 2", then "in bookcase B" — picks out
 * exactly one node in the scene: the first anchor, inside every later one.
 */
function uniqueIn(s: SceneIndex, chain: SpatialConstraint[]): boolean {
  const [first, ...rest] = chain
  if (!first || first.rel === 'text') return true
  const pool = candidates(s, first.anchor, new Set(first.anchor.words)).filter((a) =>
    rest.every((c) => c.rel !== 'text' && candidates(s, c.anchor, new Set(c.anchor.words)).some((b) => holds(s, 'in', a, b))),
  )
  return pool.length === 1
}

/** A query that finds this node and only this node — what clicking it on the map runs. */
function findQuery(s: SceneIndex, n: number): string {
  const node = s.nodes[n]
  const base: NounPhrase = { head: node.type, words: [], label: npFor(node).label, ordinal: null }
  // Called by its whole name, as written — "the map called map of oz" reads
  // better than any fragment of it, and matches the same way.
  const named = (node.name.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w, k) => !(k === 0 && ARTICLES.has(w)))
  const q: SpatialQuery = { target: base, constraints: named.length && !npFor(node).label.length ? [{ rel: 'text', via: 'called', words: named }] : [] }
  // Climb until the chain is unique: a book called Moby-Dick is probably one
  // book; "the shelf 2" never is.
  const types = new Set(s.nodes.map((x) => x.type))
  for (let k = node.path.length - 1; k >= 0; k--) {
    const res = parseAndCount(serializeQuery(q), s, types)
    if (res === 1) break
    const a = node.path[k]
    // Whichever preposition is true: "on" the shelf it rests on, "in" everything else.
    q.constraints.push({ rel: holds(s, 'on', n, a) ? 'on' : 'in', anchor: npFor(s.nodes[a]) })
  }
  return serializeQuery(q)
}

function parseAndCount(text: string, s: SceneIndex, types: Set<string>): number {
  const q = parseQuery(text, types)
  const targets = candidates(s, q.target, new Set(q.target.words))
  return targets.filter((t) =>
    q.constraints.every((c) =>
      c.rel === 'text'
        ? textHolds(s.nodes[t], c.words)
        : candidates(s, c.anchor, new Set(c.anchor.words)).some((a) => holds(s, c.rel, t, a)),
    ),
  ).length
}

/**
 * Facets: the surfaces the results are spread across.
 *
 * Read off the tree at the shallowest level where the hits part ways — every
 * hit is in the library, so "in the library" is no refinement; they split
 * across three bookcases, so the bookcases are. More surfaces in the space
 * means more levels to split at, which is how a richer space gets a deeper
 * search without anyone writing a filter for it.
 */
function facetsOf(q: SpatialQuery, hits: (SpatialHit & { _n: number; _scene: SceneIndex })[]): Facet[] {
  if (hits.length < 2) return []
  const byScene = new Map<string, typeof hits>()
  for (const h of hits) byScene.set(h.scene, [...(byScene.get(h.scene) || []), h])
  if (byScene.size > 1) {
    return [...byScene.values()].map((hs) => {
      const s = hs[0]._scene
      return { label: `in ${s.title}`, count: hs.length, refine: refineWith(q, s, 0) }
    })
  }
  const s = hits[0]._scene
  const depth = Math.min(...hits.map((h) => s.nodes[h._n].path.length))
  for (let d = 1; d < depth; d++) {
    const groups = new Map<number, number>()
    for (const h of hits) {
      const a = s.nodes[h._n].path[d]
      groups.set(a, (groups.get(a) || 0) + 1)
    }
    if (groups.size > 1) {
      return [...groups.entries()].slice(0, 8).map(([a, count]) => ({
        label: `${relInto(s.nodes[a])} ${s.nodes[a].name}`,
        count,
        refine: refineWith(q, s, a),
      }))
    }
  }
  return []
}

/** "2nd of 5 shelves from the top, in Bookcase B" — the position, in words. */
function whyOf(s: SceneIndex, n: number): string {
  const node = s.nodes[n]
  const parts: string[] = []
  if (node.of > 1) {
    const axis = node.axis
    const fromHigh = axis !== 0
    const k = fromHigh ? node.of - node.rank[axis] + 1 : node.rank[axis]
    const dir = axis === 1 ? 'from the top' : axis === 0 ? 'from the left' : 'from the front'
    parts.push(`${ordinalWord({ n: k, from: 'auto' })} of ${node.of} ${dir}`)
  }
  const sup = supportOf(s, n)
  if (sup >= 0) parts.push(`${s.nodes[sup].kind === 'container' ? 'in' : 'on'} ${s.nodes[sup].name}`)
  const holder = [...node.path].reverse().find((p) => s.nodes[p].kind === 'furniture' || s.nodes[p].kind === 'container')
  if (holder !== undefined && holder !== sup) parts.push(`in ${s.nodes[holder].name}`)
  const room = roomOf(s, n)
  if (room !== n) parts.push(`${s.nodes[room].kind === 'room' ? 'in' : 'at'} ${s.nodes[room].name}`)
  return parts.join(' · ')
}
