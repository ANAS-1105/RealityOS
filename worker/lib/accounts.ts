/**
 * Email + password accounts.
 *
 * RealityOS supports two ways in:
 *   · Sign in with Freebuff (OIDC) — no credential ever touches this app
 *   · An email + password account, owned by this Worker
 *
 * Passwords are never stored: PBKDF2-SHA256 (210k iterations, per-account salt)
 * via WebCrypto, which workerd implements natively. Sessions are random 256-bit
 * tokens; only their SHA-256 hash is persisted, so a database leak cannot be
 * replayed. Recovery codes are single-use and stored the same way.
 */
import type { FreebuffUser } from '@freebuff/auth'
import type { Env } from '../env.ts'

const PASSWORD_ITERATIONS = 210_000
const SESSION_COOKIE = 'realityos_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const RECOVERY_CODE_COUNT = 8
/** Unambiguous characters only — these codes get read aloud and retyped. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

const encoder = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations }, key, 256)
  return new Uint8Array(bits)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index]
  return diff === 0
}

export async function sha256(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

/** `pbkdf2$<iterations>$<salt>$<hash>` — self-describing so it can be upgraded. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const bits = await deriveBits(password, salt, PASSWORD_ITERATIONS)
  return `pbkdf2$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, iterations, salt, hash] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false
  try {
    const bits = await deriveBits(password, fromBase64(salt), Number(iterations))
    return timingSafeEqual(bits, fromBase64(hash))
  } catch {
    return false
  }
}

/* ── Recovery codes ────────────────────────────────────────────────────────── */

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>()
  while (codes.size < count) {
    const raw = Array.from(randomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
    codes.add(`${raw.slice(0, 4)}-${raw.slice(4)}`)
  }
  return [...codes]
}

/** Typed variants (spaces, lowercase, missing dashes) still match. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toUpperCase()
}

export function hashRecoveryCode(code: string): Promise<string> {
  return sha256(`recovery:${normalizeRecoveryCode(code)}`)
}

/* ── Sessions ──────────────────────────────────────────────────────────────── */

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=') || null
  }
  return null
}

function secureCookies(env: Env | { APP_ORIGIN?: string }): boolean {
  return Boolean(env.APP_ORIGIN && env.APP_ORIGIN.startsWith('https://'))
}

export function sessionCookie(token: string, env: Env | { APP_ORIGIN?: string }, maxAge = SESSION_TTL_SECONDS): string {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (secureCookies(env)) attributes.push('Secure')
  return attributes.join('; ')
}

export function clearSessionCookie(env: Env | { APP_ORIGIN?: string }): string {
  return sessionCookie('', env, 0)
}

/** Issues a session for `sub` and returns the raw token (sent as a cookie). */
export async function createSession(db: D1Database, sub: string, request: Request): Promise<string> {
  const token = toBase64(randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, sub, created_at, expires_at, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(await sha256(token), sub, now.toISOString(), expires.toISOString(), request.headers.get('User-Agent')?.slice(0, 200) ?? null)
    .run()
  return token
}

export async function destroySession(db: D1Database, request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return
  await db.prepare(`DELETE FROM sessions WHERE token_hash = ?1`).bind(await sha256(token)).run()
}

export async function destroyAllSessions(db: D1Database, sub: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE sub = ?1`).bind(sub).run()
}

/**
 * Resolves the email/password session, if any. Called for every request, so it
 * returns immediately when the cookie is absent; schema errors are treated as
 * "not signed in" rather than a failure.
 */
export async function readSessionUser(
  request: Request,
  env: Env | { DB?: D1Database; APP_ORIGIN?: string },
): Promise<FreebuffUser | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token || !env.DB) return null
  try {
    const row = await env.DB.prepare(
      `SELECT u.sub, u.name, u.email, u.picture
         FROM sessions s JOIN users u ON u.sub = s.sub
        WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
    )
      .bind(await sha256(token), new Date().toISOString())
      .first<{ sub: string; name: string | null; email: string | null; picture: string | null }>()
    if (!row) return null
    return {
      sub: row.sub,
      name: row.name ?? undefined,
      email: row.email ?? undefined,
      picture: row.picture ?? undefined,
      email_verified: true,
    } as FreebuffUser
  } catch {
    return null
  }
}
