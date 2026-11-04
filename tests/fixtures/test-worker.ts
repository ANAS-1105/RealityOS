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
import { readSessionUser } from '../../worker/lib/accounts.ts'
import type { Env } from '../../worker/env.ts'

/**
 * Header identity for the simulation-loop tests; otherwise a real email/password
 * session cookie, exactly as production resolves it.
 */
const resolveUser = async (request: Request, env: Env): Promise<FreebuffUser | null> => {
  const sub = request.headers.get('X-Test-User')
  if (sub) return { sub, name: `Test ${sub}`, email: `${sub}@example.test`, email_verified: true }
  return readSessionUser(request, env)
}

const app = createApp(resolveUser)

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return app.fetch(request, env)
  },
} satisfies ExportedHandler<Env>
