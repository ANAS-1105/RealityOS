/**
 * RealityOS Worker entrypoint.
 *
 * `auth.wrap()` serves `/auth/freebuff/*` and keeps sessions fresh before the
 * application pipeline sees the request.
 */
import { createFreebuffAuth } from '@freebuff/auth'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import { createApp } from './app.ts'
import { readSessionUser } from './lib/accounts.ts'
import { log } from './lib/logger.ts'
import type { Env } from './env.ts'

/** Loopback host used by local development (any port). */
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/

let auth: FreebuffAuth | undefined

/**
 * Local development is often viewed through a shared preview hostname. Sign-in
 * can only finish on an origin registered with Freebuff, and the loopback
 * callback is unreachable from a browser that is not on this machine, so the
 * request is handed to the live site instead of ending on Freebuff's
 * "callback is not registered" page. Deployed origins never take this path.
 */
function handOffSignIn(env: Env, request: Request): Response | undefined {
  const publicOrigin = env.PUBLIC_ORIGIN
  if (!publicOrigin || !LOOPBACK_ORIGIN.test(env.APP_ORIGIN ?? '')) return undefined
  const url = new URL(request.url)
  if (url.pathname !== '/auth/freebuff/signin' || LOOPBACK_ORIGIN.test(url.origin)) return undefined
  return Response.redirect(new URL(url.pathname + url.search, publicOrigin).toString(), 303)
}

function getAuth(env: Env): FreebuffAuth {
  // One instance per isolate: it caches OIDC discovery and signing keys.
  auth ??= createFreebuffAuth({
    clientId: env.FREEBUFF_CLIENT_ID,
    issuer: env.FREEBUFF_ISSUER,
    baseUrl: env.APP_ORIGIN,
    // Loopback development only; deployed origins are always https.
    allowInsecureLocalhost: env.APP_ORIGIN.startsWith('http://localhost') || env.APP_ORIGIN.startsWith('http://127.0.0.1'),
  })
  return auth
}

/**
 * Two doors, one identity: Sign in with Freebuff (OIDC) or an email/password
 * session cookie issued by this Worker. Freebuff is tried first so an existing
 * provider session always wins; a malformed or expired cookie is simply "no
 * session" rather than an error.
 */
const resolveUser = async (request: Request, env: Env): Promise<FreebuffUser | null> => {
  try {
    const oidc = await getAuth(env).getUser(request)
    if (oidc) return oidc
  } catch (error) {
    log('warn', 'auth.oidc_unavailable', { message: error instanceof Error ? error.message : 'unknown' })
  }
  return readSessionUser(request, env)
}

let handler: ((request: Request, env: Env) => Promise<Response>) | undefined

function getHandler(env: Env): (request: Request, env: Env) => Promise<Response> {
  // One app + one auth wrapper per isolate. Requests are always routed through
  // the app's fetch so ASSETS, D1 and the vars bindings are passed along.
  if (!handler) {
    const app = createApp(resolveUser)
    handler = getAuth(env).wrap(async (request: Request, runtimeEnv: Env) => app.fetch(request, runtimeEnv))
  }
  return handler
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const handOff = handOffSignIn(env, request)
      if (handOff) return handOff
      return await getHandler(env)(request, env)
    } catch (error) {
      log('error', 'worker.unhandled', { message: error instanceof Error ? error.message : 'unknown' })
      return new Response('Something went wrong.', { status: 500 })
    }
  },
} satisfies ExportedHandler<Env>
