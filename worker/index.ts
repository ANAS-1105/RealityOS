/**
 * RealityOS Worker entrypoint.
 *
 * `auth.wrap()` serves `/auth/freebuff/*` and keeps sessions fresh before the
 * application pipeline sees the request.
 */
import { createFreebuffAuth } from '@freebuff/auth'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import { createApp } from './app.ts'
import { log } from './lib/logger.ts'
import type { Env } from './env.ts'

let auth: FreebuffAuth | undefined

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

const resolveUser = async (request: Request, env: Env): Promise<FreebuffUser | null> => getAuth(env).getUser(request)

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
      return await getHandler(env)(request, env)
    } catch (error) {
      log('error', 'worker.unhandled', { message: error instanceof Error ? error.message : 'unknown' })
      return new Response('Something went wrong.', { status: 500 })
    }
  },
} satisfies ExportedHandler<Env>
