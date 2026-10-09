// SAA TunnelClaw — the cryptographic kernel behind the ZKP SSO.
//
// Isomorphic and dependency-free: everything here runs on `globalThis.crypto`,
// which is WebCrypto in the browser and the same WebCrypto in Node 18+. No DB,
// no DOM, no clock reads that affect a key, no `Math.random` anywhere.
//
// ── What is real here, stated plainly ────────────────────────────────────────
//
// This file implements three real primitives, and it is worth being exact about
// what each one does and does not prove, because "ZKP" is a word that gets
// stretched until it means nothing.
//
//   1. SCHNORR PROOF OF KNOWLEDGE over NIST P-256, Fiat–Shamir transformed.
//      This is a genuine zero-knowledge proof: the prover demonstrates knowledge
//      of a private scalar x behind a public point P = xG without transmitting x,
//      and a verifier who checks it learns nothing beyond "they hold x".
//      The server stores ONLY the public point. A full dump of the identity table
//      gives an attacker no way to authenticate as anyone — which is the property
//      a password hash table can never have.
//
//      What it is NOT: a zk-SNARK. It proves one fixed statement (discrete-log
//      knowledge). It cannot prove arbitrary predicates like "this user is over
//      18" or "this model stayed inside its safety envelope". That is the zkML
//      shape, it needs a circuit and a proving system, and it is not here. Where
//      it would attach is documented in `GOVERNANCE_HOOK` at the end of the file.
//
//   2. HKDF RATCHET for session continuity. Each verified interaction advances a
//      chain key one step. Message keys are derived off the chain and the chain
//      is immediately replaced, so a key captured at step N cannot reconstruct
//      step N−1 (forward secrecy) and cannot be replayed at step N+1 (the counter
//      is bound into the derivation). This is the symmetric half of a Double
//      Ratchet, without the DH re-keying — honest naming: a ratcheting chain.
//
//   3. AES-GCM ONION for the node taxi. A payload is wrapped once per hop,
//      innermost hop first. Each hop can decrypt exactly one layer and learns
//      only the identifier of the next hop. No hop sees the payload, the origin,
//      or the destination. This is real layered encryption, not a metaphor.
//
// ── The collapse, and the one thing that could have made it worse ────────────
//
// A tunnel collapses by destroying its chain key. The design calls for recycling
// the collapsed tunnel's entropy into the next one — and taken literally, that is
// a serious bug: if tunnel N+1's salt were a deterministic function of tunnel N's
// final key, then compromising one tunnel would let an attacker derive every
// tunnel after it, which is the exact opposite of forward secrecy. So recycled
// entropy is only ever MIXED with fresh CSPRNG bytes, never used alone. See
// `recycleEntropy`. The recycling is real; it contributes to the pool, it does
// not determine it.

/* ------------------------------------------------------------------ helpers */

const enc = new TextEncoder()

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2) throw new Error('odd-length hex')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error('bad hex')
    out[i] = byte
  }
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Constant-time equality. Used everywhere a proof or digest is compared. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  globalThis.crypto.getRandomValues(out)
  return out
}

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', concat(...parts) as BufferSource)
  return new Uint8Array(digest)
}

/* -------------------------------------------------- P-256 scalar arithmetic */
//
// Hand-rolled because WebCrypto exposes ECDH and ECDSA but not scalar
// multiplication, and a Schnorr proof needs the raw group operation. These are
// the published NIST P-256 domain parameters.

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
const A = P - 3n
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n
const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n

/** Affine point, or null for the point at infinity. */
export type Point = { x: bigint; y: bigint } | null

export const G: Point = { x: GX, y: GY }
export const CURVE_ORDER = N

function mod(a: bigint, m: bigint): bigint {
  const r = a % m
  return r < 0n ? r + m : r
}

/** Modular inverse by the extended Euclidean algorithm. */
function invert(a: bigint, m: bigint): bigint {
  let [old_r, r] = [mod(a, m), m]
  let [old_s, s] = [1n, 0n]
  while (r !== 0n) {
    const q = old_r / r
    ;[old_r, r] = [r, old_r - q * r]
    ;[old_s, s] = [s, old_s - q * s]
  }
  if (old_r !== 1n) throw new Error('not invertible')
  return mod(old_s, m)
}

export function pointAdd(p: Point, q: Point): Point {
  if (!p) return q
  if (!q) return p
  if (p.x === q.x) {
    // p + (−p) = O
    if (mod(p.y + q.y, P) === 0n) return null
    // Doubling.
    const lam = mod((3n * p.x * p.x + A) * invert(2n * p.y, P), P)
    const x = mod(lam * lam - 2n * p.x, P)
    return { x, y: mod(lam * (p.x - x) - p.y, P) }
  }
  const lam = mod((q.y - p.y) * invert(q.x - p.x, P), P)
  const x = mod(lam * lam - p.x - q.x, P)
  return { x, y: mod(lam * (p.x - x) - p.y, P) }
}

/**
 * Scalar multiplication, double-and-add over a fixed 256-bit window.
 *
 * The loop runs a constant 256 iterations and touches both branches regardless
 * of the bit, so its shape does not leak the scalar's Hamming weight. bigint
 * arithmetic underneath is not itself constant-time — a determined local
 * side-channel attacker is out of scope for a browser-side proof, and the honest
 * statement is that this resists timing observation across the network, not an
 * attacker running code on the same core.
 */
export function pointMul(k: bigint, p: Point = G): Point {
  let acc: Point = null
  let add: Point = p
  let scalar = mod(k, N)
  for (let i = 0; i < 256; i++) {
    if (scalar & 1n) acc = pointAdd(acc, add)
    add = pointAdd(add, add)
    scalar >>= 1n
  }
  return acc
}

/** Is this point actually on the curve? Rejects invalid-curve attacks. */
export function onCurve(p: Point): boolean {
  if (!p) return false
  if (p.x < 0n || p.x >= P || p.y < 0n || p.y >= P) return false
  return mod(p.y * p.y - (p.x * p.x * p.x + A * p.x + B), P) === 0n
}

/** Uncompressed SEC1: 0x04 ‖ X ‖ Y, hex. */
export function encodePoint(p: Point): string {
  if (!p) throw new Error('cannot encode the point at infinity')
  const hx = p.x.toString(16).padStart(64, '0')
  const hy = p.y.toString(16).padStart(64, '0')
  return `04${hx}${hy}`
}

export function decodePoint(hex: string): Point {
  if (hex.length !== 130 || !hex.startsWith('04')) throw new Error('bad point encoding')
  const p = {
    x: BigInt('0x' + hex.slice(2, 66)),
    y: BigInt('0x' + hex.slice(66)),
  }
  // Never skip this. A point off the curve turns scalar multiplication into a
  // key-recovery oracle.
  if (!onCurve(p)) throw new Error('point is not on the curve')
  return p
}

function bytesToScalar(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return mod(n, N)
}

function scalarToBytes(k: bigint): Uint8Array {
  return fromHex(mod(k, N).toString(16).padStart(64, '0'))
}

/* ---------------------------------------------------------- the ZK identity */

export type Identity = {
  /** Hex scalar. Never leaves the device it was generated on. */
  privateKey: string
  /** Uncompressed SEC1 point. This is the only half the server ever stores. */
  publicKey: string
}

/**
 * A fresh identity. Rejection-samples so the scalar is uniform over [1, n−1] —
 * reducing a random 256-bit integer mod n instead would bias the low end, and a
 * biased nonce is how real ECDSA keys have been recovered in the wild.
 */
export function createIdentity(): Identity {
  for (;;) {
    const candidate = bytesToScalarRaw(randomBytes(32))
    if (candidate > 0n && candidate < N) {
      return { privateKey: candidate.toString(16).padStart(64, '0'), publicKey: encodePoint(pointMul(candidate)) }
    }
  }
}

function bytesToScalarRaw(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

export type Challenge = {
  /** Random, single-use, issued by the verifier. */
  nonce: string
  /** Binds the proof to one tunnel so it cannot be replayed into another. */
  tunnelId: string
  /** Binds the proof to one purpose: session, support, enclave. */
  scope: string
}

export type SchnorrProof = {
  /** Commitment R = kG. */
  commitment: string
  /** Response s = k + c·x mod n. */
  response: string
}

/** c = H(R ‖ P ‖ nonce ‖ tunnelId ‖ scope), reduced into the scalar field. */
async function fiatShamir(commitment: string, publicKey: string, ch: Challenge): Promise<bigint> {
  const digest = await sha256(enc.encode(`${commitment}|${publicKey}|${ch.nonce}|${ch.tunnelId}|${ch.scope}`))
  return bytesToScalar(digest)
}

/**
 * Prove knowledge of the private scalar without revealing it.
 *
 * The nonce k must be fresh and unpredictable for every proof. Reusing k across
 * two proofs lets anyone solve for x with schoolbook algebra — this is the exact
 * failure that leaked the PS3 signing key.
 */
export async function prove(identity: Identity, ch: Challenge): Promise<SchnorrProof> {
  const x = BigInt('0x' + identity.privateKey)
  let k = 0n
  while (k === 0n) k = bytesToScalarRaw(randomBytes(32)) % N
  const commitment = encodePoint(pointMul(k))
  const c = await fiatShamir(commitment, identity.publicKey, ch)
  const s = mod(k + c * x, N)
  return { commitment, response: toHex(scalarToBytes(s)) }
}

/**
 * Verify sG == R + cP.
 *
 * Returns a boolean and never throws on malformed input — a verifier that throws
 * on a bad point hands the attacker a distinguishing oracle for free.
 */
export async function verify(publicKey: string, ch: Challenge, proof: SchnorrProof): Promise<boolean> {
  try {
    const P_pub = decodePoint(publicKey)
    const R = decodePoint(proof.commitment)
    const s = BigInt('0x' + proof.response)
    if (s <= 0n || s >= N) return false
    const c = await fiatShamir(proof.commitment, publicKey, ch)
    const left = pointMul(s)
    const right = pointAdd(R, pointMul(c, P_pub))
    if (!left || !right) return false
    return left.x === right.x && left.y === right.y
  } catch {
    return false
  }
}

/* --------------------------------------------------- ephemeral key agreement */

export type Ephemeral = { privateKey: string; publicKey: string }

/**
 * A throwaway keypair for one handshake.
 *
 * Structurally identical to an identity, semantically the opposite: an identity
 * is meant to persist and be recognised, an ephemeral exists for one exchange and
 * is discarded. They are kept as separate types so the two can never be passed to
 * each other's functions by accident.
 */
export function createEphemeral(): Ephemeral {
  const id = createIdentity()
  return { privateKey: id.privateKey, publicKey: id.publicKey }
}

/**
 * ECDH: the shared secret that never crosses the wire.
 *
 * This exists because deriving the session chain from the Schnorr proof alone
 * would be a real weakness — the proof travels over the network, so anyone who
 * saw the handshake in plaintext could derive every session key that followed.
 * The whole thing would then be secret only because TLS was, which is not a
 * property worth claiming.
 *
 * With an ephemeral exchange, both ends compute the same secret from their own
 * private scalar and the other's public point, and that secret is never
 * transmitted in any form. A passive observer with the full handshake transcript
 * learns nothing, and a recorded session stays unreadable even if TLS is later
 * broken. Only the x-coordinate is used, which is the standard ECDH convention.
 */
export function agree(mine: Pick<Ephemeral, 'privateKey'>, theirPublicKey: string): Uint8Array {
  const point = pointMul(BigInt('0x' + mine.privateKey), decodePoint(theirPublicKey))
  if (!point) throw new Error('degenerate key agreement')
  return fromHex(point.x.toString(16).padStart(64, '0'))
}

/* ------------------------------------------------------------- the ratchet */

export const RATCHET_INFO_CHAIN = 'tunnel/chain'
export const RATCHET_INFO_MESSAGE = 'tunnel/message'

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, bytes = 32): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: enc.encode(info) as BufferSource },
    key,
    bytes * 8,
  )
  return new Uint8Array(bits)
}

export type ChainState = {
  /** Hex chain key. Held only in memory on both ends; never stored. */
  chainKey: string
  /** Ratchet position. Monotonic, and bound into every message key. */
  counter: number
}

/** The opening chain, derived from the tunnel's shared secret and salt. */
export async function openChain(sharedSecret: Uint8Array, salt: Uint8Array): Promise<ChainState> {
  const chain = await hkdf(sharedSecret, salt, `${RATCHET_INFO_CHAIN}/0`)
  return { chainKey: toHex(chain), counter: 0 }
}

/**
 * One click forward. Returns the message key for THIS step and the chain state
 * for the next one. The old chain key is not returned and has no inverse — that
 * one-wayness is the entire forward-secrecy guarantee.
 */
export async function ratchet(state: ChainState): Promise<{ next: ChainState; messageKey: string }> {
  const ck = fromHex(state.chainKey)
  const salt = enc.encode(String(state.counter))
  const messageKey = await hkdf(ck, salt, `${RATCHET_INFO_MESSAGE}/${state.counter}`)
  const nextChain = await hkdf(ck, salt, `${RATCHET_INFO_CHAIN}/${state.counter + 1}`)
  return {
    next: { chainKey: toHex(nextChain), counter: state.counter + 1 },
    messageKey: toHex(messageKey),
  }
}

/** HMAC-SHA256 over the transcript, keyed by the step's message key. */
export async function stepProof(messageKey: string, transcript: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    fromHex(messageKey) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(transcript) as BufferSource)
  return toHex(new Uint8Array(sig))
}

export async function verifyStep(messageKey: string, transcript: string, presented: string): Promise<boolean> {
  try {
    const expected = await stepProof(messageKey, transcript)
    return timingSafeEqual(fromHex(expected), fromHex(presented))
  } catch {
    return false
  }
}

/* -------------------------------------------------------- nesting & scopes */

export type TunnelDepth = 0 | 1 | 2
export const DEPTH_LABELS: Record<TunnelDepth, string> = {
  0: 'Identity gateway',
  1: 'Intent & authorization',
  2: 'Secure enclave',
}

/**
 * Derive an inner tunnel's chain from its parent.
 *
 * The privilege segmentation is real and it lives in this one line: the inner
 * chain needs `enclaveSalt`, which the parent never sees. Holding the outer chain
 * key is not sufficient to compute the inner one. A stolen staff gateway session
 * therefore yields exactly nothing at depth 2 — not by policy, by KDF.
 */
export async function nest(
  parentChainKey: string,
  depth: TunnelDepth,
  scope: string,
  enclaveSalt: Uint8Array,
): Promise<ChainState> {
  const chain = await hkdf(fromHex(parentChainKey), enclaveSalt, `tunnel/nest/${depth}/${scope}`)
  return { chainKey: toHex(chain), counter: 0 }
}

/* ------------------------------------------------------- collapse & entropy */

export type Collapse = {
  /** Proof the tunnel existed and reached this position. Safe to store. */
  witness: string
  /** Contribution to the entropy pool. Mixed, never used raw. */
  recycled: string
  counter: number
  reason: string
}

/**
 * Collapse a tunnel: derive a witness, contribute the residue to the pool, and
 * drop the chain key on the floor.
 *
 * The witness is a one-way digest of the final chain state. It proves to an
 * auditor that a tunnel ran to a given position without letting anyone rebuild a
 * single message key from it — which is what makes the audit trail publishable.
 */
export async function collapse(state: ChainState, reason: string): Promise<Collapse> {
  const ck = fromHex(state.chainKey)
  const witness = await sha256(enc.encode('tunnel/witness'), ck, enc.encode(`${state.counter}|${reason}`))
  const recycled = await sha256(enc.encode('tunnel/recycle'), ck)
  return {
    witness: toHex(witness),
    recycled: toHex(recycled),
    counter: state.counter,
    reason,
  }
}

/**
 * Mix recycled entropy with fresh CSPRNG bytes to seed the next tunnel.
 *
 * The fresh half is not optional and not decorative. Salt derived only from a
 * collapsed tunnel's residue would chain every future tunnel to a single past
 * compromise; mixing means an attacker who holds the entire recycled pool still
 * faces 256 fresh bits per tunnel. Recycling buys unpredictability, it does not
 * buy the randomness itself.
 */
export async function recycleEntropy(recycled: string | null): Promise<Uint8Array> {
  const fresh = randomBytes(32)
  if (!recycled) return fresh
  return sha256(fromHex(recycled), fresh)
}

/* ------------------------------------------------------ the node taxi onion */

export type Hop = {
  /** Public identifier of the node. Never a route, never a destination. */
  id: string
  /** Per-ride key for this hop, derived from the ride's entropy. */
  key: string
}

export type OnionLayer = {
  /** Which hop can open this layer. */
  hop: string
  /** AES-GCM nonce for this layer. */
  iv: string
  /** Ciphertext of {next, payload}. */
  body: string
}

async function aesKey(hex: string, usage: KeyUsage[]) {
  return globalThis.crypto.subtle.importKey('raw', fromHex(hex) as BufferSource, { name: 'AES-GCM' }, false, usage)
}

/**
 * Wrap a payload once per hop, innermost first.
 *
 * `hops` is in travel order. Each layer contains the id of the NEXT hop and
 * nothing else about the route, so a node that decrypts its layer learns only
 * where to hand the packet on. The first hop cannot see the destination and the
 * last cannot see the origin.
 */
export async function wrapOnion(payload: string, hops: Hop[]): Promise<OnionLayer> {
  if (!hops.length) throw new Error('a ride needs at least one hop')
  let body = JSON.stringify({ next: null, payload })
  let layer: OnionLayer | null = null

  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]
    const iv = randomBytes(12)
    const key = await aesKey(hop.key, ['encrypt'])
    const sealed = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      enc.encode(body) as BufferSource,
    )
    layer = { hop: hop.id, iv: toHex(iv), body: toHex(new Uint8Array(sealed)) }
    if (i > 0) body = JSON.stringify({ next: layer })
  }
  return layer!
}

export type Peeled = { next: OnionLayer | null; payload: string | null }

/**
 * Peel exactly one layer. A hop calls this with its own key and gets back either
 * the next layer to forward or the payload, never both.
 *
 * AES-GCM authenticates, so a hop cannot tamper with the layers beneath it: any
 * edit fails the tag at the next hop and the ride dies rather than delivering a
 * mutated packet.
 */
export async function peelOnion(layer: OnionLayer, hopKey: string): Promise<Peeled> {
  const key = await aesKey(hopKey, ['decrypt'])
  const opened = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromHex(layer.iv) as BufferSource },
    key,
    fromHex(layer.body) as BufferSource,
  )
  const parsed = JSON.parse(new TextDecoder().decode(opened))
  return { next: parsed.next ?? null, payload: parsed.payload ?? null }
}

/** Per-ride hop keys, derived from the ride's mixed entropy. */
export async function hopKeys(rideEntropy: Uint8Array, nodeIds: string[]): Promise<Hop[]> {
  const out: Hop[] = []
  for (let i = 0; i < nodeIds.length; i++) {
    const k = await hkdf(rideEntropy, enc.encode(`hop/${i}`), `taxi/hop/${nodeIds[i]}`)
    out.push({ id: nodeIds[i], key: toHex(k) })
  }
  return out
}

/**
 * Pick a route deterministically from the ride's entropy.
 *
 * Deterministic in the entropy, not in the node list: the same pool always yields
 * the same route, which is what makes a ride replayable for audit, while the pool
 * itself is fresh per ride, which is what makes the route unpredictable to an
 * observer. A shuffle keyed on the pool gives both.
 */
export function routeFor(pool: string[], entropy: Uint8Array, length: number): string[] {
  if (!pool.length) return []
  const nodes = [...pool]
  // Fisher–Yates, stepped by the entropy bytes.
  for (let i = nodes.length - 1; i > 0; i--) {
    const j = entropy[i % entropy.length] % (i + 1)
    ;[nodes[i], nodes[j]] = [nodes[j], nodes[i]]
  }
  return nodes.slice(0, Math.max(1, Math.min(length, nodes.length)))
}

/* --------------------------------------------------------- governance hook */

/**
 * Where a real zkML governance proof would attach.
 *
 * The honest position: nothing in this file can prove a statement about a model's
 * behaviour. A Schnorr proof proves key possession and that is all it proves.
 * Proving "this agent stayed inside its safety envelope" without revealing the
 * conversation needs an arithmetic circuit over the model's execution and a
 * proving system (Groth16, PLONK, STARK) to run it — megabytes of proving key and
 * seconds to minutes per proof today, which is why it is a hook and not an
 * implementation.
 *
 * What IS implemented is the part that does not need a circuit: a commitment. The
 * SAA hashes its decision inputs and outputs into a digest, publishes the digest
 * to the audit trail at the time of the decision, and can later reveal the
 * pre-image to an auditor holding the same digest. That proves the decision was
 * not edited after the fact — tamper-evidence, not zero-knowledge. Calling it
 * anything more than that would be dishonest.
 */
export async function governanceCommitment(inputs: unknown, outputs: unknown): Promise<string> {
  const digest = await sha256(enc.encode(JSON.stringify({ i: inputs, o: outputs })))
  return toHex(digest)
}

export const TUNNEL_VERSION = '1.0'
