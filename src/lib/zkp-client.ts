import {
  agree,
  createEphemeral,
  createIdentity,
  fromHex,
  openChain,
  prove,
  ratchet as ratchetChain,
  stepProof,
  type ChainState,
  type Challenge,
  type Identity,
  type SchnorrProof,
} from './tunnel.js'

// The browser half of the ZKP SSO: where the private scalar lives, and how it is
// protected.
//
// ── The honest threat model ──────────────────────────────────────────────────
//
// A Schnorr proof is computed from the raw private scalar, so at the moment of
// proving, that scalar exists as a JavaScript value. There is no arrangement of
// IndexedDB, non-extractable CryptoKeys or Web Workers that changes this. Any
// script running on this origin — an XSS payload, a compromised dependency —
// can therefore mint proofs for as long as it is resident, and can read the
// scalar while the vault is unlocked.
//
// What this vault does buy, precisely:
//
//   • The scalar is stored ENCRYPTED under an AES-GCM key that is itself
//     non-extractable. Copying the browser profile off disk, or reading IndexedDB
//     through another compromised extension, yields ciphertext and a key handle
//     the attacker cannot serialise. Offline theft of the identity is defeated.
//   • The scalar is never sent anywhere. The server stores a public point, so a
//     server breach cannot impersonate anyone, ever — which is the property this
//     replaces passwords to obtain.
//   • Nothing is in `localStorage`, so it is not readable by a synchronous
//     one-liner and does not ride along in any accidental serialisation.
//
// What it does not buy: resistance to active script execution on this origin.
// The real fix for that is hardware — a WebAuthn passkey holds its key in a
// secure element and will not sign without a user gesture, so an XSS payload
// cannot silently mint assertions. The trade is that WebAuthn signs a fixed
// challenge structure and cannot prove arbitrary statements, which is why this
// implementation uses a scalar it controls. A production deployment should
// offer both and let hardware carry the high-value scopes.

const DB_NAME = 'cv_zkp'
const STORE = 'vault'
const RECORD = 'identity'

type VaultRecord = {
  id: string
  wrapKey: CryptoKey
  iv: Uint8Array
  sealed: ArrayBuffer
  publicKey: string
  label: string
  createdAt: number
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

const encoder = new TextEncoder()

function toHexLocal(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** Is there an identity on this device? Cheap enough to call on every render. */
export async function hasIdentity(): Promise<boolean> {
  try {
    return Boolean(await tx<VaultRecord | undefined>('readonly', (s) => s.get(RECORD)))
  } catch {
    return false
  }
}

export type PublicIdentity = { publicKey: string; label: string; createdAt: number }

export async function readPublic(): Promise<PublicIdentity | null> {
  try {
    const rec = await tx<VaultRecord | undefined>('readonly', (s) => s.get(RECORD))
    if (!rec) return null
    return { publicKey: rec.publicKey, label: rec.label, createdAt: rec.createdAt }
  } catch {
    return null
  }
}

/**
 * Generate an identity and seal it.
 *
 * The wrapping key is generated non-extractable, which means the structured
 * clone stored in IndexedDB carries a handle the page can use but cannot read
 * out. That asymmetry is the whole point: the page can decrypt, an attacker with
 * the raw database file cannot.
 */
export async function createVault(label: string): Promise<PublicIdentity> {
  const identity = createIdentity()
  const wrapKey = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const sealed = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    wrapKey,
    encoder.encode(identity.privateKey) as BufferSource,
  )
  const record: VaultRecord = {
    id: RECORD,
    wrapKey,
    iv,
    sealed,
    publicKey: identity.publicKey,
    label: label.slice(0, 60) || 'This browser',
    createdAt: Date.now(),
  }
  await tx('readwrite', (s) => s.put(record))
  return { publicKey: record.publicKey, label: record.label, createdAt: record.createdAt }
}

/**
 * Open the vault for exactly one proof.
 *
 * The scalar is read, used, and dropped inside this function. It is never
 * returned to a caller and never held in a module-level variable, so it is
 * reachable only for the duration of one signature rather than for the lifetime
 * of the page.
 */
export async function proveWith(challenge: Challenge): Promise<SchnorrProof> {
  const rec = await tx<VaultRecord | undefined>('readonly', (s) => s.get(RECORD))
  if (!rec) throw new Error('no identity on this device')
  const opened = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: rec.iv as BufferSource },
    rec.wrapKey,
    rec.sealed,
  )
  const identity: Identity = {
    privateKey: new TextDecoder().decode(opened),
    publicKey: rec.publicKey,
  }
  return prove(identity, challenge)
}

/**
 * Forget this device's identity.
 *
 * Local only. The server keeps the public point and the audit trail, because
 * deleting the record of tunnels that ran would defeat the audit trail's purpose;
 * what is destroyed is the ability to open another one from here.
 */
export async function forgetVault(): Promise<void> {
  await tx('readwrite', (s) => s.delete(RECORD))
}

/* ------------------------------------------------------- the handshake API */

export type TunnelHandle = {
  tunnelId: string
  counter: number
  expiresAt: string | null
  member: { id: number; handle: string; displayName: string } | null
}

async function call(action: string, body: Record<string, unknown>) {
  const res = await fetch('/api/zkp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `request failed (${res.status})`)
  return data
}

/**
 * The live ratchet, held in a module variable and nowhere else.
 *
 * Chain keys are never written to IndexedDB, `localStorage` or a cookie. A chain
 * that survived a page reload would be a chain an attacker could steal from disk,
 * and the entire value of a ratchet is that its state is ephemeral. Closing the
 * tab therefore ends the tunnel — which is the correct behaviour, not a bug: the
 * next visit hails a fresh one in two round trips and no typing.
 */
let liveChain: { tunnelId: string; state: ChainState } | null = null

export function chainPosition(): number | null {
  return liveChain?.state.counter ?? null
}

/** Register this device's public point. Idempotent — re-enrolling is a returning device. */
export async function enrol(sessionId: string, memberId?: number | null) {
  const pub = await readPublic()
  if (!pub) throw new Error('no identity on this device')
  return call('enrol', {
    publicKey: pub.publicKey,
    sessionId,
    label: pub.label,
    device: navigator.userAgent.slice(0, 120),
    memberId: memberId ?? null,
  })
}

/**
 * The full sign-in: hail a tunnel, prove into it, hold the handle.
 *
 * Two round trips and one gesture. There is no password to type, nothing to
 * remember, and nothing secret crosses the wire in either direction — the first
 * response is a public challenge, the second request is a proof that reveals
 * nothing about the key that produced it.
 */
export async function signIn(scope = 'session'): Promise<TunnelHandle> {
  const pub = await readPublic()
  if (!pub) throw new Error('no identity on this device')
  const hailed = await call('hail', { publicKey: pub.publicKey, scope })
  const proof = await proveWith(hailed.challenge as Challenge)

  // Our half of the ephemeral exchange. The private scalar lives in this closure
  // and dies with it — it is never stored, so there is nothing to steal later.
  const ephemeral = createEphemeral()
  const opened = await call('prove', {
    tunnelId: hailed.tunnelId,
    proof,
    clientEphemeral: ephemeral.publicKey,
  })

  // The session key is built from a secret neither side transmitted: each end
  // combines its own ephemeral private scalar with the other's public point and
  // arrives at the same value. The proof and nonce are folded in so the channel
  // is bound to the identity that opened it rather than merely being private.
  const shared = agree(ephemeral, hailed.serverEphemeral)
  const secret = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      `${toHexLocal(shared)}|${proof.commitment}|${proof.response}|${(hailed.challenge as Challenge).nonce}`,
    ) as BufferSource,
  )
  liveChain = {
    tunnelId: opened.tunnelId,
    state: await openChain(new Uint8Array(secret), fromHex(hailed.salt)),
  }

  return {
    tunnelId: opened.tunnelId,
    counter: opened.counter ?? 0,
    expiresAt: opened.expiresAt ?? null,
    member: opened.member ?? null,
  }
}

/**
 * Advance the handshake one step.
 *
 * This is the continuous renewal the architecture calls for: every authenticated
 * action carries a fresh proof at a fresh position, so a captured request is
 * worthless the moment the next one is sent. If the server disagrees about the
 * position it collapses the tunnel rather than resynchronising — two parties at
 * the same position means one of them is not who it claims to be, and there is
 * no benign case to preserve.
 */
export async function step(transcript: string): Promise<{ ok: boolean; counter: number; reason?: string }> {
  if (!liveChain) return { ok: false, counter: 0, reason: 'no open tunnel' }
  const { next, messageKey } = await ratchetChain(liveChain.state)
  const presented = await stepProof(messageKey, transcript)
  const result = await call('ratchet', { tunnelId: liveChain.tunnelId, transcript, presented }).catch((e) => ({
    ok: false,
    reason: String(e?.message || 'rejected'),
  }))
  if (!result.ok) {
    // The server has collapsed its side. Dropping the chain here keeps the two
    // ends honest about that rather than leaving a client that believes it still
    // holds a session.
    liveChain = null
    return { ok: false, counter: 0, reason: result.reason || 'ratchet mismatch' }
  }
  liveChain = { tunnelId: liveChain.tunnelId, state: next }
  return { ok: true, counter: next.counter }
}

/** Send a payload through a node taxi ride on the open tunnel. */
export async function hailTaxi(payload: string, hops = 3) {
  if (!liveChain) throw new Error('no open tunnel')
  return call('taxi', { tunnelId: liveChain.tunnelId, payload, hops })
}

export async function collapse(tunnelId: string, reason = 'signed out') {
  const result = await call('collapse', { tunnelId, reason })
  // Drop the local chain in the same breath. A client holding a chain for a
  // tunnel the server has already destroyed is exactly the orphaned state this
  // architecture exists to avoid.
  if (liveChain?.tunnelId === tunnelId) liveChain = null
  return result
}
