/**
 * HTTP plumbing shared by every route: typed JSON responses, a single error
 * shape, request ids, cache policy, same-origin enforcement for mutations and a
 * fixed-window rate limiter.
 */
import { isSameOriginRequest } from '@freebuff/auth'
import type { Context } from 'hono'
import type { ZodType } from 'zod'
import type { ApiError, StageEvent } from '../../src/shared/types.ts'
import type { Env, Vars } from '../env.ts'

export class AppError extends Error {
  // Explicit fields (no TypeScript parameter properties) so this module also
  // loads under Node's type-stripping loader, which the tests use.
  readonly code: string
  readonly status: number
  readonly retryable: boolean

  constructor(code: string, message: string, status: number, retryable = false) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

export const badRequest = (message: string) => new AppError('bad_request', message, 400)
export const unauthorized = () => new AppError('unauthorized', 'Please sign in to continue.', 401)
export const forbidden = () => new AppError('forbidden', 'That request did not come from this site.', 403)
export const notFound = (what = 'That item') => new AppError('not_found', `${what} could not be found.`, 404)
export const tooMany = () => new AppError('rate_limited', 'Too many requests just now. Give it a moment and try again.', 429, true)
export const upstream = (message = 'The simulation service is unavailable right now.') => new AppError('upstream_unavailable', message, 503, true)

/** Private, non-cacheable JSON response. */
export function json<T>(c: Context, body: T, status = 200): Response {
  return c.json(body as Record<string, unknown>, status as never, { 'Cache-Control': 'private, no-store' })
}

export function errorResponse(c: Context, error: unknown): Response {
  const requestId = c.get('requestId') ?? 'unknown'
  if (error instanceof AppError) {
    const body: ApiError = { error: { code: error.code, message: error.message, retryable: error.retryable, requestId } }
    if (error.status >= 500) console.error(`[${requestId}] ${error.code}: ${error.message}`)
    return c.json(body as unknown as Record<string, unknown>, error.status as never, { 'Cache-Control': 'private, no-store' })
  }
  console.error(`[${requestId}] unhandled error`, error)
  const body: ApiError = {
    error: {
      code: 'internal_error',
      message: 'Something went wrong while running the simulation. Please try again.',
      retryable: true,
      requestId,
    },
  }
  return c.json(body as unknown as Record<string, unknown>, 500, { 'Cache-Control': 'private, no-store' })
}

/** Validate a JSON body, converting zod failures into friendly field messages. */
export async function readJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw badRequest('That request body was not valid JSON.')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    throw badRequest(`${path}${issue?.message ?? 'That input was not valid.'}`)
  }
  return parsed.data
}

/**
 * Every state-changing call must come from the site itself. During local
 * development the Vite server proxies `/api` under its own origin, which is not
 * APP_ORIGIN, so an explicitly configured DEV_ORIGIN is trusted as well.
 */
export function isTrustedMutationOrigin(request: Request, env: Env): boolean {
  if (isSameOriginRequest(request, env.APP_ORIGIN)) return true
  // DEVELOPMENT ONLY. The Vite dev server proxies /api and forwards the browser
  // origin with its own scheme (an https preview arrives as http://host), so dev
  // origins are compared by host. Never set in deployment.
  const devOrigins = (env.DEV_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return devOrigins.some((origin) => isSameOriginRequest(request, origin) || sameHost(request, origin))
}

function sameHost(request: Request, candidate: string): boolean {
  const header = request.headers.get('origin')
  if (!header || header === 'null') return false
  try {
    return new URL(header).host === new URL(candidate).host
  } catch {
    return false
  }
}

/** Every state-changing call must be same-origin (see @freebuff/auth docs). */
export function assertSameOrigin(c: Context<{ Bindings: Env; Variables: Vars }>): void {
  if (!isTrustedMutationOrigin(c.req.raw, c.env)) throw forbidden()
}

export interface RateLimitRule {
  limit: number
  windowMs: number
}

export async function enforceRateLimit(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  bucket: string,
  rule: RateLimitRule,
): Promise<void> {
  const user = c.get('user')
  const key = `${user?.sub ?? 'anonymous'}:${bucket}`
  const windowStart = Math.floor(Date.now() / rule.windowMs)
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = ?2 THEN rate_limits.count + 1 ELSE 1 END,
       window_start = ?2
     RETURNING count`,
  )
    .bind(key, windowStart)
    .first<{ count: number }>()
  if (row && row.count > rule.limit) throw tooMany()
}

/* ── Server-sent events for the staged agent pipeline ──────────────────────── */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'private, no-store, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

/**
 * Streams `StageEvent`s while a pipeline runs, then one `result` event with the
 * persisted payload. Progress is real: stages are emitted as the agents finish,
 * not on a timer.
 */
export function sseResponse<T>(
  run: (emit: (event: StageEvent) => void, register: (payload: T) => void) => Promise<void>,
  c: Context,
): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let result: T | undefined
      const write = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        await run(
          (stage) => write('stage', stage),
          (payload) => {
            result = payload
          },
        )
        if (result === undefined) throw new Error('pipeline produced no result')
        write('result', result)
      } catch (error) {
        const requestId = c.get('requestId') ?? 'unknown'
        console.error(`[${requestId}] pipeline failed`, error)
        const message =
          error instanceof AppError
            ? error.message
            : 'Something went wrong while running the simulation. Please try again.'
        write('failed', { message, requestId })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: SSE_HEADERS })
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}
