import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from './index.js'
import { nodeTaxiRides, socialMembers, zkpAudit, zkpGrants, zkpIdentities, zkpTunnels } from './schema.js'
import {
  agree,
  collapse as collapseChain,
  createEphemeral,
  hopKeys,
  nest,
  openChain,
  ratchet,
  randomBytes,
  recycleEntropy,
  routeFor,
  toHex,
  fromHex,
  verify,
  type ChainState,
  type Challenge,
  type SchnorrProof,
  type TunnelDepth,
} from '../src/lib/tunnel.js'

// Server-side state for the ZKP SSO. The cryptography is all in src/lib/tunnel.ts
// and is pure; this module is the part that remembers, and it is written around a
// single discipline — the database is treated as hostile.
//
// Concretely that means: identities hold public points only, chain keys exist as
// rows only while a tunnel is open, and every column that survives a collapse is
// a one-way digest. The worst case for a full dump is that an attacker inherits
// whatever tunnels happened to be open at that instant, each with minutes to live
// and each unable to prove anything at the next depth down.

/** How long a tunnel may stay open before it collapses on its own. */
export const TUNNEL_TTL_MS = 15 * 60 * 1000
/** Support tunnels are shorter still — a staff session is not a place to live. */
export const SUPPORT_TTL_MS = 30 * 60 * 1000
/** How long a pending challenge is answerable. Past this it is dead entropy. */
export const CHALLENGE_TTL_MS = 2 * 60 * 1000

function publicId(prefix: string): string {
  return `${prefix}_${toHex(randomBytes(12))}`
}

async function digest(text: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text) as BufferSource)
  return toHex(new Uint8Array(bytes))
}

/* ------------------------------------------------------------ identities */

export type EnrolledIdentity = {
  id: number
  publicKey: string
  label: string
  device: string
  role: string
  memberId: number | null
  createdAt: Date | null
  lastSeenAt: Date | null
}

/**
 * Enrol a public key.
 *
 * Enrolment is deliberately cheap and unauthenticated — anyone may register a
 * point, exactly as anyone may generate a keypair. Registering a key proves
 * nothing and grants nothing; the key only becomes an identity when a proof
 * against it opens a tunnel, and it only becomes *your* identity when it is bound
 * to an account you were already signed into.
 */
export async function enrol(input: {
  publicKey: string
  sessionId: string
  label?: string
  device?: string
  memberId?: number | null
}): Promise<EnrolledIdentity> {
  const existing = await db.select().from(zkpIdentities).where(eq(zkpIdentities.publicKey, input.publicKey)).limit(1)
  if (existing.length) {
    const row = existing[0]
    // Re-enrolling the same key from the same browser is a returning device, not
    // a new one. Binding is only ever additive; a key already bound to a member
    // is never silently rebound to a different one.
    if (input.memberId && !row.memberId) {
      await db.update(zkpIdentities).set({ memberId: input.memberId }).where(eq(zkpIdentities.id, row.id))
      row.memberId = input.memberId
    }
    return toPublic(row)
  }
  const [row] = await db
    .insert(zkpIdentities)
    .values({
      publicKey: input.publicKey,
      sessionId: input.sessionId,
      label: (input.label || 'Agent key').slice(0, 60),
      device: (input.device || '').slice(0, 120),
      memberId: input.memberId ?? null,
    })
    .returning()
  return toPublic(row)
}

function toPublic(row: typeof zkpIdentities.$inferSelect): EnrolledIdentity {
  return {
    id: row.id,
    publicKey: row.publicKey,
    label: row.label,
    device: row.device,
    role: row.role,
    memberId: row.memberId,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  }
}

export async function identityByKey(publicKey: string) {
  const rows = await db.select().from(zkpIdentities).where(eq(zkpIdentities.publicKey, publicKey)).limit(1)
  return rows[0] ?? null
}

export async function identitiesForSession(sessionId: string): Promise<EnrolledIdentity[]> {
  const rows = await db
    .select()
    .from(zkpIdentities)
    .where(and(eq(zkpIdentities.sessionId, sessionId), isNull(zkpIdentities.revokedAt)))
    .orderBy(desc(zkpIdentities.createdAt))
    .limit(20)
  return rows.map(toPublic)
}

/** Revocation is a timestamp, not a delete — the audit trail must still resolve. */
export async function revokeIdentity(id: number): Promise<void> {
  await db.update(zkpIdentities).set({ revokedAt: new Date() }).where(eq(zkpIdentities.id, id))
  await db
    .update(zkpTunnels)
    .set({ state: 'collapsed', chainKey: null, collapsedAt: new Date(), collapseReason: 'identity revoked' })
    .where(and(eq(zkpTunnels.identityId, id), eq(zkpTunnels.state, 'open')))
}

/* ------------------------------------------------------- the tunnel cycle */

export type HailResult = {
  tunnelId: string
  challenge: Challenge
  salt: string
  /** The server's throwaway point for this handshake. Public by design. */
  serverEphemeral: string
  expiresAt: Date
  /** True when this tunnel's salt was seeded from a collapsed predecessor. */
  recycledFrom: string | null
}

/**
 * HAIL — open a pending tunnel and issue a single-use challenge.
 *
 * The salt is mixed from the most recently collapsed tunnel's residue plus fresh
 * random bytes (see `recycleEntropy`). That is the recycling step made literal:
 * the dead tunnel contributes to the next one's derivation without determining it.
 */
export async function hail(input: {
  publicKey: string
  scope?: string
  depth?: TunnelDepth
  parentId?: number | null
}): Promise<HailResult> {
  const identity = await identityByKey(input.publicKey)
  if (!identity) throw new Error('unknown identity')
  if (identity.revokedAt) throw new Error('identity revoked')

  // Pull the residue of the last tunnel to collapse. If there is none — first
  // tunnel ever — the salt is simply fresh randomness, which is the correct
  // degenerate case rather than a failure.
  const [last] = await db
    .select({ recycled: zkpTunnels.recycled, publicId: zkpTunnels.publicId })
    .from(zkpTunnels)
    .where(eq(zkpTunnels.state, 'collapsed'))
    .orderBy(desc(zkpTunnels.collapsedAt))
    .limit(1)

  const salt = await recycleEntropy(last?.recycled ?? null)
  const id = publicId('tnl')
  const nonce = toHex(randomBytes(24))
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  const scope = input.scope || 'session'

  // The server's half of the ephemeral exchange. The private scalar is parked in
  // `enclaveSalt` for the seconds between hail and prove, then overwritten with
  // the real enclave salt the moment the tunnel opens — so it exists as a row
  // only while a challenge is outstanding, and never alongside a live chain.
  const ephemeral = createEphemeral()

  await db.insert(zkpTunnels).values({
    publicId: id,
    identityId: identity.id,
    scope,
    depth: input.depth ?? 0,
    parentId: input.parentId ?? null,
    state: 'pending',
    nonce,
    salt: toHex(salt),
    enclaveSalt: ephemeral.privateKey,
    expiresAt,
  })
  await log({ tunnelPublicId: id, identityId: identity.id, action: 'hail', verdict: 'ok', depth: input.depth ?? 0 })

  return {
    tunnelId: id,
    challenge: { nonce, tunnelId: id, scope },
    salt: toHex(salt),
    serverEphemeral: ephemeral.publicKey,
    expiresAt,
    recycledFrom: last?.publicId ?? null,
  }
}

export type RideResult = {
  ok: boolean
  reason?: string
  tunnelId?: string
  counter?: number
  expiresAt?: Date
  member?: { id: number; handle: string; displayName: string } | null
}

/**
 * PROVE — verify the Schnorr proof and promote the tunnel from pending to open.
 *
 * Every rejection path nulls the nonce first. A challenge that has been answered
 * wrongly is burned exactly as thoroughly as one answered correctly, so an
 * attacker gets one attempt per hail rather than unlimited attempts against a
 * standing nonce.
 */
export async function proveTunnel(input: {
  tunnelId: string
  proof: SchnorrProof
  clientEphemeral: string
}): Promise<RideResult> {
  const [tunnel] = await db.select().from(zkpTunnels).where(eq(zkpTunnels.publicId, input.tunnelId)).limit(1)
  if (!tunnel) return { ok: false, reason: 'no such tunnel' }
  if (tunnel.state !== 'pending') return { ok: false, reason: 'tunnel is not awaiting a proof' }
  if (tunnel.expiresAt && tunnel.expiresAt.getTime() < Date.now()) {
    await burn(tunnel.publicId, 'challenge expired')
    return { ok: false, reason: 'challenge expired' }
  }
  const identity = tunnel.identityId
    ? (await db.select().from(zkpIdentities).where(eq(zkpIdentities.id, tunnel.identityId)).limit(1))[0]
    : null
  if (!identity || identity.revokedAt) return { ok: false, reason: 'identity revoked' }

  const challenge: Challenge = { nonce: tunnel.nonce, tunnelId: tunnel.publicId, scope: tunnel.scope }
  const good = await verify(identity.publicKey, challenge, input.proof)
  const proofDigest = await digest(input.proof.commitment + input.proof.response)

  if (!good) {
    await burn(tunnel.publicId, 'proof rejected')
    await log({
      tunnelPublicId: tunnel.publicId,
      identityId: identity.id,
      action: 'prove',
      verdict: 'rejected',
      depth: tunnel.depth,
      proofDigest,
      detail: 'signature did not verify against the enrolled point',
    })
    return { ok: false, reason: 'proof rejected' }
  }

  // Two ingredients, and both are needed.
  //
  // The ECDH secret is what the chain is actually built from, and it never
  // crosses the wire — an observer with the entire handshake transcript cannot
  // compute it. The proof and nonce are hashed in alongside it to BIND the
  // session to the identity that proved possession: without that binding, ECDH
  // alone would happily establish a perfectly private channel with an
  // unauthenticated stranger.
  if (!tunnel.enclaveSalt) return { ok: false, reason: 'handshake state is missing' }
  const shared = agree({ privateKey: tunnel.enclaveSalt }, input.clientEphemeral)
  const secret = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      `${toHex(shared)}|${input.proof.commitment}|${input.proof.response}|${tunnel.nonce}`,
    ) as BufferSource,
  )
  const chain = await openChain(new Uint8Array(secret), fromHex(tunnel.salt))
  const enclaveSalt = toHex(randomBytes(32))
  const ttl = tunnel.scope === 'support' ? SUPPORT_TTL_MS : TUNNEL_TTL_MS
  const expiresAt = new Date(Date.now() + ttl)

  await db
    .update(zkpTunnels)
    .set({ state: 'open', chainKey: chain.chainKey, counter: 0, nonce: '', enclaveSalt, expiresAt })
    .where(eq(zkpTunnels.id, tunnel.id))
  await db.update(zkpIdentities).set({ lastSeenAt: new Date() }).where(eq(zkpIdentities.id, identity.id))
  await log({
    tunnelPublicId: tunnel.publicId,
    identityId: identity.id,
    action: 'prove',
    verdict: 'ok',
    depth: tunnel.depth,
    proofDigest,
  })

  let member = null
  if (identity.memberId) {
    const [m] = await db
      .select({ id: socialMembers.id, handle: socialMembers.handle, displayName: socialMembers.displayName })
      .from(socialMembers)
      .where(eq(socialMembers.id, identity.memberId))
      .limit(1)
    member = m ?? null
  }
  return { ok: true, tunnelId: tunnel.publicId, counter: 0, expiresAt, member }
}

export type RatchetResult = { ok: boolean; reason?: string; counter?: number; expiresAt?: Date }

/**
 * RATCHET — advance one step and verify the caller is at the same position.
 *
 * This is the continuous handshake. Every authenticated call moves the chain,
 * which makes a captured proof worthless a moment later and makes a hijacked
 * session detectable rather than merely unlikely: two parties cannot both hold
 * the same position, so the imposter and the real user immediately diverge and
 * the tunnel collapses under the first mismatch.
 */
export async function ratchetTunnel(input: {
  tunnelId: string
  transcript: string
  presented: string
}): Promise<RatchetResult> {
  const [tunnel] = await db.select().from(zkpTunnels).where(eq(zkpTunnels.publicId, input.tunnelId)).limit(1)
  if (!tunnel) return { ok: false, reason: 'no such tunnel' }
  if (tunnel.state !== 'open' || !tunnel.chainKey) return { ok: false, reason: 'tunnel is not open' }
  if (tunnel.expiresAt && tunnel.expiresAt.getTime() < Date.now()) {
    await burn(tunnel.publicId, 'time to live exceeded')
    return { ok: false, reason: 'tunnel expired' }
  }

  const state: ChainState = { chainKey: tunnel.chainKey, counter: tunnel.counter }
  const { next, messageKey } = await ratchet(state)
  const { verifyStep } = await import('../src/lib/tunnel.js')
  const good = await verifyStep(messageKey, input.transcript, input.presented)

  if (!good) {
    // A mismatch is not a retry. Either the caller is out of step or it is not
    // the caller at all, and both cases end the tunnel.
    await burn(tunnel.publicId, 'ratchet mismatch')
    await log({
      tunnelPublicId: tunnel.publicId,
      identityId: tunnel.identityId,
      action: 'ratchet',
      verdict: 'rejected',
      depth: tunnel.depth,
      counter: tunnel.counter,
      detail: 'step proof did not match the expected position',
    })
    return { ok: false, reason: 'ratchet mismatch — tunnel collapsed' }
  }

  await db
    .update(zkpTunnels)
    .set({ chainKey: next.chainKey, counter: next.counter })
    .where(eq(zkpTunnels.id, tunnel.id))
  await log({
    tunnelPublicId: tunnel.publicId,
    identityId: tunnel.identityId,
    action: 'ratchet',
    verdict: 'ok',
    depth: tunnel.depth,
    counter: next.counter,
    proofDigest: await digest(input.presented),
  })
  return { ok: true, counter: next.counter, expiresAt: tunnel.expiresAt ?? undefined }
}

/**
 * COLLAPSE — destroy the key material and keep only the witness.
 *
 * `chainKey` and `enclaveSalt` go to null in the same statement that writes the
 * witness, so there is no window in which a collapsed row still carries a usable
 * key. Children collapse first and cascade upward-in, which is the property the
 * design asks for: an anomaly anywhere in the stack incinerates every layer,
 * because leaving an inner enclave alive under a dead gateway is precisely the
 * orphaned backdoor the whole architecture exists to prevent.
 */
export async function collapseTunnel(tunnelId: string, reason: string): Promise<{ witness: string | null; cascaded: number }> {
  const [tunnel] = await db.select().from(zkpTunnels).where(eq(zkpTunnels.publicId, tunnelId)).limit(1)
  if (!tunnel) return { witness: null, cascaded: 0 }

  let cascaded = 0
  const children = await db.select().from(zkpTunnels).where(eq(zkpTunnels.parentId, tunnel.id))
  for (const child of children) {
    if (child.state === 'collapsed') continue
    const result = await collapseTunnel(child.publicId, `cascade: ${reason}`)
    cascaded += 1 + result.cascaded
  }

  if (tunnel.state === 'collapsed') return { witness: tunnel.witness, cascaded }
  if (!tunnel.chainKey) {
    await burn(tunnel.publicId, reason)
    return { witness: null, cascaded }
  }

  const dead = await collapseChain({ chainKey: tunnel.chainKey, counter: tunnel.counter }, reason)
  await db
    .update(zkpTunnels)
    .set({
      state: 'collapsed',
      chainKey: null,
      enclaveSalt: null,
      witness: dead.witness,
      recycled: dead.recycled,
      collapseReason: reason,
      collapsedAt: new Date(),
    })
    .where(eq(zkpTunnels.id, tunnel.id))
  await log({
    tunnelPublicId: tunnel.publicId,
    identityId: tunnel.identityId,
    action: 'collapse',
    verdict: 'ok',
    depth: tunnel.depth,
    counter: tunnel.counter,
    proofDigest: dead.witness,
    detail: reason,
  })
  return { witness: dead.witness, cascaded }
}

/** Kill a tunnel that has no derivable witness — expired, rejected, or never opened. */
async function burn(tunnelId: string, reason: string): Promise<void> {
  await db
    .update(zkpTunnels)
    .set({ state: 'collapsed', chainKey: null, enclaveSalt: null, nonce: '', collapseReason: reason, collapsedAt: new Date() })
    .where(eq(zkpTunnels.publicId, tunnelId))
}

/**
 * Sweep tunnels past their TTL.
 *
 * Called opportunistically at the top of the API route rather than on a timer,
 * because a serverless function has no timer it can trust to still be running.
 * An expired tunnel is inert either way — its key can no longer be used — but
 * sweeping keeps the open-tunnel view honest about what is actually alive.
 */
export async function sweepExpired(): Promise<number> {
  const stale = await db
    .select({ publicId: zkpTunnels.publicId })
    .from(zkpTunnels)
    .where(and(eq(zkpTunnels.state, 'open'), sql`${zkpTunnels.expiresAt} < now()`))
    .limit(50)
  for (const row of stale) await collapseTunnel(row.publicId, 'time to live exceeded')
  return stale.length
}

export async function openTunnel(tunnelId: string) {
  const [row] = await db.select().from(zkpTunnels).where(eq(zkpTunnels.publicId, tunnelId)).limit(1)
  if (!row || row.state !== 'open' || !row.chainKey) return null
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null
  return row
}

/* ---------------------------------------------------------- staff nesting */

/**
 * Request a support grant. Creates the delegation unsigned — it authorises
 * nothing until the member's own agent countersigns.
 */
export async function requestGrant(input: {
  memberId: number
  staffIdentityId: number
  ticket: string
  scope: string
  reason: string
  minutes: number
}) {
  const [row] = await db
    .insert(zkpGrants)
    .values({
      memberId: input.memberId,
      staffIdentityId: input.staffIdentityId,
      ticket: input.ticket.slice(0, 60),
      scope: input.scope,
      reason: input.reason.slice(0, 400),
      expiresAt: new Date(Date.now() + Math.max(5, Math.min(240, input.minutes)) * 60_000),
    })
    .returning()
  return row
}

/**
 * Countersign a grant with the member's identity.
 *
 * The member proves possession against a challenge derived from the grant's own
 * contents, so the signature covers the ticket, the scope and the expiry. A
 * staff member who later widens the scope invalidates the signature they were
 * relying on — the consent is to specific terms, not to the idea of support.
 */
export async function approveGrant(input: {
  grantId: number
  grantorIdentityId: number
  proof: SchnorrProof
}): Promise<{ ok: boolean; reason?: string }> {
  const [grant] = await db.select().from(zkpGrants).where(eq(zkpGrants.id, input.grantId)).limit(1)
  if (!grant) return { ok: false, reason: 'no such grant' }
  if (grant.approvedAt) return { ok: false, reason: 'already approved' }
  if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'grant expired' }

  const [identity] = await db.select().from(zkpIdentities).where(eq(zkpIdentities.id, input.grantorIdentityId)).limit(1)
  if (!identity || identity.revokedAt) return { ok: false, reason: 'unknown identity' }
  if (identity.memberId !== grant.memberId) return { ok: false, reason: 'this identity does not own the account' }

  const challenge: Challenge = {
    nonce: await grantNonce(grant),
    tunnelId: `grant_${grant.id}`,
    scope: `support:${grant.scope}`,
  }
  if (!(await verify(identity.publicKey, challenge, input.proof))) return { ok: false, reason: 'proof rejected' }

  await db
    .update(zkpGrants)
    .set({
      grantorIdentityId: identity.id,
      grantorSignature: await digest(input.proof.commitment + input.proof.response),
      approvedAt: new Date(),
    })
    .where(eq(zkpGrants.id, grant.id))
  await log({
    tunnelPublicId: `grant_${grant.id}`,
    identityId: identity.id,
    action: 'grant.approve',
    verdict: 'ok',
    detail: `${grant.scope} · ticket ${grant.ticket}`,
  })
  return { ok: true }
}

/** The challenge a member signs is a digest of the grant's exact terms. */
export async function grantNonce(grant: typeof zkpGrants.$inferSelect): Promise<string> {
  return digest(`${grant.id}|${grant.memberId}|${grant.staffIdentityId}|${grant.ticket}|${grant.scope}|${grant.expiresAt?.toISOString()}`)
}

export type NestResult = { ok: boolean; reason?: string; tunnelId?: string; depth?: number; label?: string }

/**
 * Spawn the next tunnel inward.
 *
 * Depth 1 needs a grant that is signed by both parties and unexpired. Depth 2
 * needs depth 1 to be open right now. Neither check can be satisfied by holding
 * the outer key — the derivation needs the parent's `enclaveSalt`, which is
 * stored at the parent's depth and never travels outward. Privilege segmentation
 * here is a property of the KDF, not a rule the API is politely following.
 */
export async function nestTunnel(input: {
  parentTunnelId: string
  grantId?: number
  scope: string
}): Promise<NestResult> {
  const parent = await openTunnel(input.parentTunnelId)
  if (!parent) return { ok: false, reason: 'parent tunnel is not open' }
  if (parent.depth >= 2) return { ok: false, reason: 'depth 2 is the innermost layer' }
  if (!parent.enclaveSalt) return { ok: false, reason: 'parent holds no enclave salt' }

  const depth = (parent.depth + 1) as TunnelDepth

  if (depth === 1) {
    if (!input.grantId) return { ok: false, reason: 'a support tunnel needs a grant' }
    const [grant] = await db.select().from(zkpGrants).where(eq(zkpGrants.id, input.grantId)).limit(1)
    if (!grant) return { ok: false, reason: 'no such grant' }
    if (!grant.approvedAt) return { ok: false, reason: 'the account holder has not countersigned' }
    if (grant.revokedAt) return { ok: false, reason: 'grant revoked' }
    if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'grant expired' }
    if (grant.staffIdentityId !== parent.identityId) return { ok: false, reason: 'this grant belongs to another staff identity' }
    if (grant.scope !== input.scope) return { ok: false, reason: 'scope does not match the signed grant' }
  }

  const child = await nest(parent.chainKey!, depth, input.scope, fromHex(parent.enclaveSalt))
  const id = publicId(depth === 1 ? 'sup' : 'enc')
  const ttl = depth === 1 ? SUPPORT_TTL_MS : Math.min(SUPPORT_TTL_MS, 10 * 60 * 1000)

  await db.insert(zkpTunnels).values({
    publicId: id,
    identityId: parent.identityId,
    scope: input.scope,
    depth,
    parentId: parent.id,
    state: 'open',
    salt: parent.enclaveSalt,
    chainKey: child.chainKey,
    enclaveSalt: depth < 2 ? toHex(randomBytes(32)) : null,
    expiresAt: new Date(Date.now() + ttl),
  })
  await log({
    tunnelPublicId: id,
    identityId: parent.identityId,
    action: 'nest',
    verdict: 'ok',
    depth,
    detail: `${input.scope} inside ${parent.publicId}`,
  })
  const { DEPTH_LABELS } = await import('../src/lib/tunnel.js')
  return { ok: true, tunnelId: id, depth, label: DEPTH_LABELS[depth] }
}

/* -------------------------------------------------------------- node taxi */

/** The public node pool. Names are the only thing a rider ever learns about a node. */
export const NODE_POOL = [
  'nd-lisbon-04', 'nd-osaka-11', 'nd-quito-02', 'nd-tromso-07',
  'nd-perth-19', 'nd-accra-03', 'nd-halifax-08', 'nd-tbilisi-05',
]

export type TaxiReceipt = {
  rideId: string
  hops: number
  route: string[]
  delivered: boolean
  payloadDigest: string
  entropyWitness: string
}

/**
 * Hail a taxi, ride it, drop off, disintegrate — all four phases in one call.
 *
 * Deliberately one call rather than four endpoints. The lifecycle is only sound
 * if disintegration is guaranteed, and splitting it across requests would mean a
 * client that walks away mid-ride leaves a half-built onion holding live hop keys.
 * Running the whole ride inside one server invocation makes "it always collapses"
 * a structural fact rather than a promise about client behaviour.
 *
 * In a real deployment the hops are separate machines and this function is the
 * dispatcher, not the road. What is genuine here is the cryptography — the onion
 * really is layered per hop and each layer really can only be opened by its own
 * key, so moving the hops onto real nodes changes the transport and not the maths.
 */
export async function taxi(input: { tunnelId: string; payload: string; hops?: number }): Promise<TaxiReceipt> {
  const tunnel = await openTunnel(input.tunnelId)
  if (!tunnel) throw new Error('a ride needs an open tunnel')

  const entropy = await recycleEntropy(tunnel.recycled ?? null)
  const route = routeFor(NODE_POOL, entropy, Math.max(2, Math.min(5, input.hops ?? 3)))
  const keys = await hopKeys(entropy, route)
  const rideId = publicId('ride')
  const payloadDigest = await digest(input.payload)

  await db.insert(nodeTaxiRides).values({
    publicId: rideId,
    tunnelPublicId: tunnel.publicId,
    hops: route,
    hopCount: route.length,
    state: 'riding',
    payloadDigest,
    bytes: input.payload.length,
  })

  const { wrapOnion, peelOnion } = await import('../src/lib/tunnel.js')
  let layer = await wrapOnion(input.payload, keys)
  let delivered: string | null = null

  // Blind transit. Each iteration is one node doing the only thing a node can do:
  // open its own layer and hand on whatever it finds, without ever learning who
  // asked, what is inside, or where it finishes.
  for (let i = 0; i < keys.length; i++) {
    const peeled = await peelOnion(layer, keys[i].key)
    if (peeled.payload !== null) {
      delivered = peeled.payload
      break
    }
    if (!peeled.next) break
    layer = peeled.next
  }

  const witness = toHex(entropy).slice(0, 32)
  await db
    .update(nodeTaxiRides)
    .set({ state: 'disintegrated', disintegratedAt: new Date(), entropyWitness: witness })
    .where(eq(nodeTaxiRides.publicId, rideId))
  await log({
    tunnelPublicId: tunnel.publicId,
    identityId: tunnel.identityId,
    action: 'taxi',
    verdict: delivered === input.payload ? 'ok' : 'rejected',
    depth: tunnel.depth,
    proofDigest: payloadDigest,
    detail: `${route.length} hops · disintegrated`,
  })

  return {
    rideId,
    hops: route.length,
    route,
    delivered: delivered === input.payload,
    payloadDigest,
    entropyWitness: witness,
  }
}

/* ------------------------------------------------------------ audit trail */

async function log(entry: {
  tunnelPublicId: string
  identityId?: number | null
  action: string
  verdict: string
  depth?: number
  counter?: number
  proofDigest?: string
  detail?: string
}): Promise<void> {
  try {
    await db.insert(zkpAudit).values({
      tunnelPublicId: entry.tunnelPublicId,
      identityId: entry.identityId ?? null,
      action: entry.action,
      verdict: entry.verdict,
      depth: entry.depth ?? 0,
      counter: entry.counter ?? 0,
      proofDigest: entry.proofDigest ?? '',
      detail: entry.detail ?? '',
    })
  } catch {
    // An audit write that fails must not take the tunnel down with it. The
    // alternative — refusing to authenticate anyone because the log is sick — is
    // a denial of service wearing a compliance costume.
  }
}

export async function recentAudit(limit = 30) {
  return db.select().from(zkpAudit).orderBy(desc(zkpAudit.createdAt)).limit(limit)
}

export async function tunnelsForIdentity(identityId: number) {
  return db
    .select({
      publicId: zkpTunnels.publicId,
      scope: zkpTunnels.scope,
      depth: zkpTunnels.depth,
      state: zkpTunnels.state,
      counter: zkpTunnels.counter,
      witness: zkpTunnels.witness,
      collapseReason: zkpTunnels.collapseReason,
      expiresAt: zkpTunnels.expiresAt,
      collapsedAt: zkpTunnels.collapsedAt,
      createdAt: zkpTunnels.createdAt,
    })
    .from(zkpTunnels)
    .where(eq(zkpTunnels.identityId, identityId))
    .orderBy(desc(zkpTunnels.createdAt))
    .limit(25)
}

export async function recentRides(limit = 10) {
  return db.select().from(nodeTaxiRides).orderBy(desc(nodeTaxiRides.createdAt)).limit(limit)
}

export async function grantsFor(memberId: number) {
  return db.select().from(zkpGrants).where(eq(zkpGrants.memberId, memberId)).orderBy(desc(zkpGrants.createdAt)).limit(20)
}
