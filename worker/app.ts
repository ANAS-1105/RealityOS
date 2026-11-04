/**
 * The RealityOS request pipeline.
 *
 * Assembled here — separately from the Worker entrypoint — so it can be
 * exercised with an injected user resolver in tests. The production resolver is
 * Sign in with Freebuff (see index.ts); the test resolver lives in tests/ and is
 * never deployed.
 *
 * Order is deliberate:
 *   1. Cross-site state changes are rejected before anything else runs.
 *   2. `/auth/freebuff/*` is served by the auth SDK's `wrap()` in index.ts,
 *      before any static-asset or SPA fallback.
 *   3. The API router handles `/api/*` (authenticated, user-scoped).
 *   4. Everything else falls through to the static assets (the SPA).
 */
import type { FreebuffUser } from '@freebuff/auth'
import { Hono } from 'hono'
import { accounts } from './routes/accounts.ts'
import { api } from './routes/api.ts'
import { AppError, errorResponse, isTrustedMutationOrigin } from './lib/http.ts'
import type { Env, Vars } from './env.ts'

export type UserResolver = (request: Request, env: Env) => Promise<FreebuffUser | null>

export function createApp(resolveUser: UserResolver): Hono<{ Bindings: Env; Variables: Vars }> {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>()

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID().slice(0, 8))
    c.set('startedAt', Date.now())
    c.set('user', null)

    // A request that did not come from this site has no business touching user
    // data, signed in or not (see @freebuff/auth isSameOriginRequest).
    const method = c.req.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD' && c.req.path.startsWith('/api/')) {
      if (!isTrustedMutationOrigin(c.req.raw, c.env)) {
        return errorResponse(c, new AppError('forbidden', 'That request did not come from this site.', 403))
      }
    }

    c.set('user', await resolveUser(c.req.raw, c.env))
    await next()

    c.header('X-Request-Id', c.get('requestId'))
    // Per-user data: never let an intermediary cache API output.
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'private, no-store')
    return undefined
  })

  // Email/password auth first: these endpoints are public by design and carry
  // their own throttling, then everything else under /api requires a user.
  app.route('/api/accounts', accounts)
  app.route('/api', api)

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return errorResponse(c, new AppError('not_found', 'That endpoint does not exist.', 404))
    }
    // Non-API paths keep flowing to the static assets (SPA fallback).
    return c.env.ASSETS.fetch(c.req.raw)
  })

  app.onError((error, c) => errorResponse(c, error))

  return app
}
