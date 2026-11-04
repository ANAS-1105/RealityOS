/**
 * Email + password account endpoints, mounted at /api/accounts.
 *
 *   POST /signup     create an email account, returns one-time recovery codes
 *   POST /signin     email + password → session cookie
 *   POST /signout    clear the session (safe to call when already signed out)
 *   GET  /session    who this request is, if anyone (200 either way)
 *   POST /recover    recovery code + new password
 *   POST /password   change the password (signed in)
 *   POST /recovery   regenerate one-time recovery codes (signed in)
 *
 * Everything here is same-origin checked by the app pipeline, rate limited per
 * email address and validated before it touches D1.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import * as repo from '../db/repo.ts'
import { ensureSchema } from '../db/migrate.ts'
import { AppError, json, readJson } from '../lib/http.ts'
import {
  clearSessionCookie,
  createSession,
  destroyAllSessions,
  destroySession,
  generateRecoveryCodes,
  hashPassword,
  hashRecoveryCode,
  sessionCookie,
  verifyPassword,
} from '../lib/accounts.ts'
import type { Env, Vars } from '../env.ts'

type AppContext = Context<{ Bindings: Env; Variables: Vars }>

const emailField = z
  .email('Enter a valid email address.')
  .max(254, 'That email address is too long.')
  .transform((value) => value.trim().toLowerCase())

const passwordField = z.string().min(8, 'Use at least 8 characters.').max(200, 'That password is too long.')

const signUpInput = z.object({
  name: z.string().trim().min(2, 'Tell us the name to show on your account.').max(80, 'That name is too long.'),
  email: emailField,
  password: passwordField,
})

const signInInput = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password.').max(200),
})

const recoverInput = z.object({
  email: emailField,
  code: z.string().trim().min(4, 'Enter one of your recovery codes.').max(40),
  password: passwordField,
})

const changePasswordInput = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordField,
})

const regenerateInput = z.object({ password: z.string().min(1, 'Enter your password to continue.').max(200) })

/** A password that is long enough but guessable gets a concrete suggestion. */
function passwordIssue(value: string): string | null {
  if (value.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'Mix letters and numbers so it is harder to guess.'
  return null
}

async function throttle(c: AppContext, bucket: string, identity: string, limit: number): Promise<void> {
  const windowMs = 60_000
  const windowStart = Math.floor(Date.now() / windowMs)
  const key = `${bucket}:${identity}`
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = ?2 THEN rate_limits.count + 1 ELSE 1 END,
       window_start = ?2
     RETURNING count`,
  )
    .bind(key, windowStart)
    .first<{ count: number }>()
  if (row && row.count > limit) {
    throw new AppError('rate_limited', 'Too many attempts just now. Wait a minute and try again.', 429, true)
  }
}

interface AccountRow {
  sub: string
  name: string | null
  email: string | null
  picture: string | null
  password_hash: string | null
  auth_provider: string
}

const publicUser = (row: {
  sub: string
  name?: string | null
  email?: string | null
  picture?: string | null
}) => ({
  sub: row.sub,
  name: row.name ?? null,
  email: row.email ?? null,
  picture: row.picture ?? null,
})

export const accounts = new Hono<{ Bindings: Env; Variables: Vars }>()

/** A brand-new database has no tables yet; these routes can be the first hit. */
accounts.use('*', async (c, next) => {
  await ensureSchema(c.env.DB, c.get('requestId'))
  await next()
})

accounts.get('/session', async (c) => {
  const user = c.get('user')
  if (!user) return json(c, { user: null, provider: null })
  const row = await c.env.DB.prepare(`SELECT auth_provider FROM users WHERE sub = ?1`).bind(user.sub).first<{ auth_provider: string }>()
  return json(c, {
    user: publicUser(user),
    provider: row?.auth_provider === 'local' ? 'local' : 'freebuff',
  })
})

accounts.post('/signup', async (c) => {
  const input = await readJson(c, signUpInput)
  const issue = passwordIssue(input.password)
  if (issue) throw new AppError('bad_request', issue, 400)
  await throttle(c, 'signup', input.email, 5)

  const taken = await c.env.DB.prepare(`SELECT sub FROM users WHERE lower(email) = ?1`).bind(input.email).first<{ sub: string }>()
  if (taken) throw new AppError('email_taken', 'An account already uses that email. Sign in instead.', 409)

  const sub = `local_${crypto.randomUUID().replace(/-/g, '')}`
  const timestamp = new Date().toISOString()
  const passwordHash = await hashPassword(input.password)

  await c.env.DB.prepare(
    `INSERT INTO users (sub, email, name, picture, password_hash, auth_provider, email_edited, created_at, updated_at)
     VALUES (?1, ?2, ?3, NULL, ?4, 'local', 1, ?5, ?5)`,
  )
    .bind(sub, input.email, input.name, passwordHash, timestamp)
    .run()
  await repo.ensureUser(c.env.DB, { sub, email: input.email, name: input.name })

  // One-time recovery codes: shown once, stored only as hashes.
  const codes = generateRecoveryCodes()
  for (const code of codes) {
    await c.env.DB.prepare(
      `INSERT INTO recovery_codes (code_hash, sub, created_at) VALUES (?1, ?2, ?3)`,
    )
      .bind(await hashRecoveryCode(code), sub, timestamp)
      .run()
  }

  const token = await createSession(c.env.DB, sub, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, c.env))
  return json(c, { user: { sub, name: input.name, email: input.email, picture: null }, provider: 'local', recoveryCodes: codes }, 201)
})

accounts.post('/signin', async (c) => {
  const input = await readJson(c, signInInput)
  await throttle(c, 'signin', input.email, 8)

  const row = await c.env.DB.prepare(
    `SELECT sub, name, email, picture, password_hash, auth_provider FROM users WHERE lower(email) = ?1`,
  )
    .bind(input.email)
    .first<AccountRow>()

  if (!row || !row.password_hash) {
    if (row) {
      throw new AppError('use_provider', 'That email signs in with Google. Use “Continue with Google” above.', 400)
    }
    throw new AppError('invalid_credentials', 'Email or password is incorrect.', 401)
  }

  if (!(await verifyPassword(input.password, row.password_hash))) {
    throw new AppError('invalid_credentials', 'Email or password is incorrect.', 401)
  }

  const token = await createSession(c.env.DB, row.sub, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, c.env))
  return json(c, { user: publicUser(row), provider: 'local' })
})

accounts.post('/signout', async (c) => {
  await destroySession(c.env.DB, c.req.raw)
  c.header('Set-Cookie', clearSessionCookie(c.env))
  return json(c, { ok: true })
})

accounts.post('/recover', async (c) => {
  const input = await readJson(c, recoverInput)
  const issue = passwordIssue(input.password)
  if (issue) throw new AppError('bad_request', issue, 400)
  await throttle(c, 'recover', input.email, 6)

  const account = await c.env.DB.prepare(`SELECT sub FROM users WHERE lower(email) = ?1 AND password_hash IS NOT NULL`)
    .bind(input.email)
    .first<{ sub: string }>()
  if (!account) throw new AppError('bad_request', 'That recovery code is not valid.', 400)

  const codeHash = await hashRecoveryCode(input.code)
  const code = await c.env.DB.prepare(
    `SELECT code_hash FROM recovery_codes WHERE code_hash = ?1 AND sub = ?2 AND used_at IS NULL`,
  )
    .bind(codeHash, account.sub)
    .first<{ code_hash: string }>()
  if (!code) throw new AppError('bad_request', 'That recovery code is not valid, or it has already been used.', 400)

  const timestamp = new Date().toISOString()
  await c.env.DB.prepare(`UPDATE recovery_codes SET used_at = ?2 WHERE code_hash = ?1`).bind(codeHash, timestamp).run()
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?2, updated_at = ?3 WHERE sub = ?1`)
    .bind(account.sub, await hashPassword(input.password), timestamp)
    .run()
  // A reset logs out every other device.
  await destroyAllSessions(c.env.DB, account.sub)

  const token = await createSession(c.env.DB, account.sub, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, c.env))
  return json(c, { ok: true, remainingCodes: null })
})

accounts.post('/password', async (c) => {
  const user = c.get('user')
  if (!user) throw new AppError('unauthorized', 'Please sign in to continue.', 401)
  const input = await readJson(c, changePasswordInput)
  const issue = passwordIssue(input.newPassword)
  if (issue) throw new AppError('bad_request', issue, 400)
  await throttle(c, 'password', user.sub, 10)

  const row = await c.env.DB.prepare(`SELECT password_hash, auth_provider FROM users WHERE sub = ?1`)
    .bind(user.sub)
    .first<{ password_hash: string | null; auth_provider: string }>()
  if (!row || row.auth_provider !== 'local' || !row.password_hash) {
    throw new AppError('not_supported', 'This account signs in with Google, so it has no RealityOS password.', 400)
  }
  if (!(await verifyPassword(input.currentPassword, row.password_hash))) {
    throw new AppError('bad_request', 'Your current password is not correct.', 400)
  }

  await c.env.DB.prepare(`UPDATE users SET password_hash = ?2, updated_at = ?3 WHERE sub = ?1`)
    .bind(user.sub, await hashPassword(input.newPassword), new Date().toISOString())
    .run()
  return json(c, { ok: true })
})

accounts.post('/recovery', async (c) => {
  const user = c.get('user')
  if (!user) throw new AppError('unauthorized', 'Please sign in to continue.', 401)
  const input = await readJson(c, regenerateInput)
  await throttle(c, 'recovery', user.sub, 10)

  const row = await c.env.DB.prepare(`SELECT password_hash, auth_provider FROM users WHERE sub = ?1`)
    .bind(user.sub)
    .first<{ password_hash: string | null; auth_provider: string }>()
  if (!row || row.auth_provider !== 'local' || !row.password_hash) {
    throw new AppError('not_supported', 'Recovery codes belong to email accounts. This account signs in with Google.', 400)
  }
  if (!(await verifyPassword(input.password, row.password_hash))) {
    throw new AppError('bad_request', 'That password is not correct.', 400)
  }

  const now = new Date().toISOString()
  await c.env.DB.prepare(`DELETE FROM recovery_codes WHERE sub = ?1 AND used_at IS NULL`).bind(user.sub).run()
  const codes = generateRecoveryCodes()
  for (const code of codes) {
    await c.env.DB.prepare(`INSERT INTO recovery_codes (code_hash, sub, created_at) VALUES (?1, ?2, ?3)`)
      .bind(await hashRecoveryCode(code), user.sub, now)
      .run()
  }
  return json(c, { recoveryCodes: codes })
})
