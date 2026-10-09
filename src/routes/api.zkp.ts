import { createFileRoute } from '@tanstack/react-router'
import {
  approveGrant,
  collapseTunnel,
  enrol,
  grantNonce,
  grantsFor,
  identitiesForSession,
  identityByKey,
  hail,
  nestTunnel,
  proveTunnel,
  ratchetTunnel,
  recentAudit,
  recentRides,
  requestGrant,
  revokeIdentity,
  sweepExpired,
  taxi,
  tunnelsForIdentity,
  NODE_POOL,
} from '../../db/zkp.js'
import { createSession, getMember, sessionCookie } from '../lib/social-auth.js'

// The ZKP SSO endpoint.
//
// One route with an action verb rather than nine routes, because the actions are
// phases of a single protocol and splitting them across files would scatter the
// state machine that makes them safe: hail issues a challenge, prove burns it,
// ratchet advances, collapse ends it. Reading them together is the point.
//
// Every action here is a POST. None of them are idempotent in the HTTP sense —
// hailing twice produces two tunnels and two challenges, which is correct, and a
// GET that mints key material would be cacheable, prefetchable and loggable in
// three places it has no business being.
export const Route = createFileRoute('/api/zkp')({
  server: {
    handlers: {
      // Read-only status: what this browser has enrolled and what its tunnels did.
      // Deliberately degrades rather than 500s — a sign-in screen that goes dark
      // because an audit query failed pushes people to the password door for the
      // wrong reason.
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = (url.searchParams.get('sessionId') || '').trim()
        const publicKey = (url.searchParams.get('publicKey') || '').trim()

        const [identities, audit, rides] = await Promise.all([
          sessionId ? identitiesForSession(sessionId).catch(() => []) : Promise.resolve([]),
          recentAudit(24).catch(() => []),
          recentRides(6).catch(() => []),
        ])

        let tunnels: unknown[] = []
        if (publicKey) {
          const identity = await identityByKey(publicKey).catch(() => null)
          if (identity) tunnels = await tunnelsForIdentity(identity.id).catch(() => [])
        }

        return Response.json({ identities, tunnels, audit, rides, nodePool: NODE_POOL })
      },

      POST: async ({ request }) => {
        let body: any
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'expected a JSON body' }, { status: 400 })
        }
        const action = String(body?.action || '')

        // Opportunistic sweep. A serverless function cannot hold a timer, so
        // expiry is enforced on the next touch — the tunnel is inert either way,
        // this keeps the visible state honest about it.
        if (action !== 'enrol') await sweepExpired().catch(() => 0)

        try {
          switch (action) {
            /* ------------------------------------------------------ enrol */
            case 'enrol': {
              const publicKey = String(body.publicKey || '')
              if (!/^04[0-9a-f]{128}$/i.test(publicKey)) {
                return Response.json({ error: 'that is not a valid uncompressed P-256 point' }, { status: 400 })
              }
              // If a legacy session cookie is present, bind this key to that
              // account — that is what makes the two doors one identity rather
              // than two. Absent a cookie the key stands alone, which is also
              // fine; it can be bound later.
              const member = await getMember(request).catch(() => null)
              const identity = await enrol({
                publicKey,
                sessionId: String(body.sessionId || '').slice(0, 64),
                label: String(body.label || ''),
                device: String(body.device || ''),
                memberId: member?.id ?? null,
              })
              return Response.json({ identity, boundTo: member ? member.handle : null }, { status: 201 })
            }

            /* ------------------------------------------------------- hail */
            case 'hail': {
              const publicKey = String(body.publicKey || '')
              if (!publicKey) return Response.json({ error: 'publicKey is required' }, { status: 400 })
              const scope = ['session', 'support', 'enclave'].includes(String(body.scope))
                ? String(body.scope)
                : 'session'
              const result = await hail({ publicKey, scope })
              return Response.json(result)
            }

            /* ------------------------------------------------------ prove */
            case 'prove': {
              const tunnelId = String(body.tunnelId || '')
              const proof = body.proof
              const clientEphemeral = String(body.clientEphemeral || '')
              if (!tunnelId || !proof?.commitment || !proof?.response) {
                return Response.json({ error: 'tunnelId and a proof are required' }, { status: 400 })
              }
              // The point is validated as being on the curve inside `agree()`;
              // rejecting the empty case here just gives a readable message
              // instead of letting a decode failure surface as a generic 500.
              if (!clientEphemeral) {
                return Response.json({ error: 'clientEphemeral is required' }, { status: 400 })
              }
              const result = await proveTunnel({ tunnelId, proof, clientEphemeral })
              if (!result.ok) return Response.json({ error: result.reason }, { status: 401 })

              // A ZKP sign-in that resolves to a bound account issues the SAME
              // opaque session cookie the password door issues. The two routes
              // converge here on purpose: everything downstream — profiles,
              // settings, the workspace — keeps working without learning which
              // door someone came through.
              const headers: Record<string, string> = {}
              if (result.member) {
                const token = await createSession(result.member.id)
                headers['Set-Cookie'] = sessionCookie(token)
              }
              return Response.json(result, { headers })
            }

            /* ---------------------------------------------------- ratchet */
            case 'ratchet': {
              const result = await ratchetTunnel({
                tunnelId: String(body.tunnelId || ''),
                transcript: String(body.transcript || ''),
                presented: String(body.presented || ''),
              })
              return Response.json(result, { status: result.ok ? 200 : 401 })
            }

            /* --------------------------------------------------- collapse */
            case 'collapse': {
              const tunnelId = String(body.tunnelId || '')
              if (!tunnelId) return Response.json({ error: 'tunnelId is required' }, { status: 400 })
              const result = await collapseTunnel(tunnelId, String(body.reason || 'client requested'))
              return Response.json(result)
            }

            /* ------------------------------------------------------- nest */
            case 'nest': {
              const result = await nestTunnel({
                parentTunnelId: String(body.parentTunnelId || ''),
                grantId: body.grantId ? Number(body.grantId) : undefined,
                scope: String(body.scope || 'diagnostics'),
              })
              return Response.json(result, { status: result.ok ? 200 : 403 })
            }

            /* ------------------------------------------------------ taxi */
            case 'taxi': {
              const payload = String(body.payload || '')
              if (!payload) return Response.json({ error: 'a ride needs a payload' }, { status: 400 })
              if (payload.length > 4000) {
                return Response.json({ error: 'payload is too large for one ride' }, { status: 413 })
              }
              const receipt = await taxi({
                tunnelId: String(body.tunnelId || ''),
                payload,
                hops: Number(body.hops) || 3,
              })
              return Response.json(receipt)
            }

            /* ------------------------------------------ staff delegation */
            case 'grant.request': {
              // Requesting is not being granted. This creates an unsigned
              // delegation and returns the exact nonce the account holder must
              // sign — the terms are fixed before consent is asked for, so
              // consent cannot be collected against terms that change later.
              const memberId = Number(body.memberId)
              const staffIdentityId = Number(body.staffIdentityId)
              if (!memberId || !staffIdentityId) {
                return Response.json({ error: 'memberId and staffIdentityId are required' }, { status: 400 })
              }
              const grant = await requestGrant({
                memberId,
                staffIdentityId,
                ticket: String(body.ticket || ''),
                scope: String(body.scope || 'diagnostics'),
                reason: String(body.reason || ''),
                minutes: Number(body.minutes) || 30,
              })
              return Response.json({ grant, nonce: await grantNonce(grant) }, { status: 201 })
            }

            case 'grant.approve': {
              const result = await approveGrant({
                grantId: Number(body.grantId),
                grantorIdentityId: Number(body.grantorIdentityId),
                proof: body.proof,
              })
              return Response.json(result, { status: result.ok ? 200 : 403 })
            }

            case 'grant.list': {
              const memberId = Number(body.memberId)
              if (!memberId) return Response.json({ error: 'memberId is required' }, { status: 400 })
              return Response.json(await grantsFor(memberId))
            }

            /* ----------------------------------------------------- revoke */
            case 'revoke': {
              const id = Number(body.identityId)
              if (!id) return Response.json({ error: 'identityId is required' }, { status: 400 })
              await revokeIdentity(id)
              return Response.json({ ok: true })
            }

            default:
              return Response.json({ error: `unknown action: ${action}` }, { status: 400 })
          }
        } catch (err: any) {
          // Protocol errors are safe to name — "unknown identity" tells an
          // attacker nothing they could not learn by trying. Anything else is
          // reported without its message, because an unexpected stack trace is
          // where database shapes and file paths leak.
          const message = String(err?.message || '')
          const expected = [
            'unknown identity',
            'identity revoked',
            'a ride needs an open tunnel',
            'a ride needs at least one hop',
            'point is not on the curve',
            'bad point encoding',
          ]
          if (expected.includes(message)) return Response.json({ error: message }, { status: 400 })
          return Response.json({ error: 'the tunnel could not be opened' }, { status: 500 })
        }
      },
    },
  },
})
