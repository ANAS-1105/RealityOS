/**
 * Test-only Worker entrypoint.
 *
 * Identical to the production pipeline except that the user resolver trusts an
 * `X-Test-User` header instead of a Freebuff session, so the authenticated API
 * surface (ownership isolation, 401s, the whole simulation loop) can be driven
 * end-to-end in real workerd with a real local D1 database.
 *
 * It is bundled by tools/build-test-worker.mjs and is never part of a deploy.
 */
import type { FreebuffUser } from '@freebuff/auth'
import { createApp } from '../../worker/app.ts'
import type { Env } from '../../worker/env.ts'

const resolveUser = async (request: Request): Promise<FreebuffUser | null> => {
  const sub = request.headers.get('X-Test-User')
  if (!sub) return null
  return { sub, name: `Test ${sub}`, email: `${sub}@example.test`, email_verified: true }
}

const app = createApp(resolveUser)

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return app.fetch(request, env)
  },
} satisfies ExportedHandler<Env>
