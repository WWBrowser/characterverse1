// CVS auth — real human accounts (the HAN). Server-only: this module imports
// node:crypto and the database, so it must only ever be imported from API route
// handlers, never from a client component.
//
// Passwords are hashed with scrypt (salt:hash hex). Sessions are opaque random
// tokens stored in the database and carried in an httpOnly cookie — there is no
// secret or password in the cookie, so nothing sensitive is exposed client-side.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { socialMembers, socialSessions } from '../../db/schema.js'

export const SESSION_COOKIE = 'cvs_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** A password hash that no real password can produce — used for seeded profiles. */
export function unusablePasswordHash(): string {
  return `${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`
}

export async function createSession(memberId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await db.insert(socialSessions).values({ token, memberId })
  return token
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(socialSessions).where(eq(socialSessions.token, token))
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

/** The full member row for the request's session, or null if signed out. */
export async function getMember(request: Request) {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const [row] = await db
    .select()
    .from(socialSessions)
    .innerJoin(socialMembers, eq(socialSessions.memberId, socialMembers.id))
    .where(eq(socialSessions.token, token))
  return row ? row.social_members : null
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
}

/** Strip the password hash before returning a member to the client. */
export function publicMember<T extends { passwordHash?: string }>(m: T) {
  const { passwordHash: _omit, ...rest } = m
  return rest
}

export function normalizeHandle(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}
