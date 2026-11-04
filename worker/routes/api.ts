/**
 * API surface. Every route below the auth middleware is authenticated and
 * user-scoped; every mutation additionally passes the same-origin check.
 *
 *   POST   /api/onboarding
 *   GET    /api/simulations
 *   POST   /api/simulations
 *   GET    /api/simulations/:id
 *   DELETE /api/simulations/:id
 *   POST   /api/simulations/:id/analyze        (SSE)
 *   PATCH  /api/simulations/:id/situation
 *   POST   /api/simulations/:id/run            (SSE)
 *   POST   /api/simulations/:id/what-if
 *   POST   /api/simulations/:id/choose
 *   POST   /api/simulations/:id/outcome
 *   GET    /api/simulations/:id/comparison
 *   GET    /api/profile/decision-pattern
 *   GET    /api/profile/model
 *   GET    /api/profile/training-export
 *   POST   /api/demo
 *   POST   /api/account/delete
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { MODEL_CARD } from '../../src/shared/engine/ml.ts'
import {
  chooseOptionSchema,
  createSimulationSchema,
  onboardingSchema,
  outcomeSchema,
  runSimulationSchema,
  updateSituationSchema,
  whatIfSchema,
} from '../../src/shared/schemas.ts'
import * as repo from '../db/repo.ts'
import { ensureSchema } from '../db/migrate.ts'
import { clearSessionCookie } from '../lib/accounts.ts'
import { AppError, assertSameOrigin, enforceRateLimit, json, notFound, readJson, sseResponse, unauthorized } from '../lib/http.ts'
import * as simulations from '../services/simulations.ts'
import { createAiProvider } from '../ai/provider.ts'
import type { EngineInfo, StageEvent } from '../../src/shared/types.ts'
import type { Env, Vars } from '../env.ts'

export const api = new Hono<{ Bindings: Env; Variables: Vars }>()

/**
 * Auth guard for everything under /api except health.
 *
 * It also materialises the `users`/`profiles` rows on first contact, so every
 * foreign key that references the user is satisfied no matter which endpoint the
 * visitor hits first (`ON CONFLICT DO UPDATE` also refreshes the display name).
 */
api.use('*', async (c, next) => {
  if (c.req.path === '/api/health') return next()
  // /api/accounts/* is mounted separately and handles its own authentication.
  if (c.req.path.startsWith('/api/accounts')) return next()
  const user = c.get('user')
  if (!user) throw unauthorized()
  // A fresh database initializes itself on first authenticated request.
  await ensureSchema(c.env.DB, c.get('requestId'))
  await repo.ensureUser(c.env.DB, user)
  await next()
})

const mutation = async (c: Parameters<typeof assertSameOrigin>[0], bucket: string, limit: number) => {
  assertSameOrigin(c)
  await enforceRateLimit(c, bucket, { limit, windowMs: 60_000 })
}

api.get('/health', (c) =>
  json(c, {
    ok: true,
    engine: createAiProvider(c.env).available ? 'ai' : 'local',
    model: MODEL_CARD.version,
    time: new Date().toISOString(),
  }),
)

/* ── Identity & onboarding ─────────────────────────────────────────────────── */

api.get('/me', async (c) => {
  const user = c.get('user')!
  const profile = await repo.ensureUser(c.env.DB, user)
  const account = await repo.getAccount(c.env.DB, user.sub)
  const learning = await simulations.learningSnapshot(c.env, user.sub)
  const counts = await repo.countSimulations(c.env.DB, user.sub)
  return json(c, {
    user: { sub: user.sub, name: user.name ?? null, email: user.email ?? null, picture: user.picture ?? null },
    provider: account?.auth_provider === 'local' ? 'local' : 'freebuff',
    hasPassword: Boolean(account?.password_hash),
    profile: {
      useCase: profile.use_case,
      decisionStyle: profile.decision_style,
      onboardedAt: profile.onboarded_at,
      createdAt: profile.created_at,
    },
    learning: { reliability: learning.reliability, calibration: learning.calibration, outcomeCount: learning.outcomeCount },
    counts,
    engine: engineSummary(c.env),
  })
})

api.post('/onboarding', async (c) => {
  await mutation(c, 'onboarding', 20)
  const user = c.get('user')!
  const input = await readJson(c, onboardingSchema)
  await repo.ensureUser(c.env.DB, user)
  await repo.setOnboarding(c.env.DB, user.sub, input)
  const demoId = await simulations.ensureDemoSimulation(c.env, user.sub)
  return json(c, { ok: true, demoSimulationId: demoId })
})

/* ── Simulations ───────────────────────────────────────────────────────────── */

api.get('/simulations', async (c) => {
  const user = c.get('user')!
  const items = await simulations.listSummaries(c.env, user.sub)
  return json(c, { simulations: items })
})

api.post('/simulations', async (c) => {
  await mutation(c, 'create-simulation', 20)
  const user = c.get('user')!
  const input = await readJson(c, createSimulationSchema)
  const row = await simulations.createSimulation(c.env, user.sub, input)
  return json(c, { simulation: simulations.toSummary(row) }, 201)
})

api.get('/simulations/:id', async (c) => {
  const user = c.get('user')!
  const detail = await simulations.getDetail(c.env, user.sub, c.req.param('id'))
  return json(c, { simulation: detail })
})

api.delete('/simulations/:id', async (c) => {
  await mutation(c, 'delete-simulation', 30)
  const user = c.get('user')!
  const deleted = await repo.deleteSimulation(c.env.DB, user.sub, c.req.param('id'))
  if (!deleted) throw notFound('That simulation')
  return json(c, { ok: true })
})

api.get('/simulations/:id/comparison', async (c) => {
  const user = c.get('user')!
  const detail = await simulations.getDetail(c.env, user.sub, c.req.param('id'))
  return json(c, { comparison: detail.comparison, prediction: detail.run ? detail.run.recommendation : null })
})

api.post('/simulations/:id/analyze', async (c) => {
  await mutation(c, 'analyze', 12)
  const user = c.get('user')!
  const simulationId = c.req.param('id')
  await simulations.requireSimulation(c.env, user.sub, simulationId)
  const input = await readJson(c, createSimulationSchema)
  return sseResponse<{ situation: unknown; engine: EngineInfo }>((emit: (event: StageEvent) => void, register) => {
    return (async () => {
      const { situation, engine } = await simulations.analyze(c.env, user.sub, simulationId, input, emit)
      register({ situation, engine })
    })()
  }, c)
})

api.patch('/simulations/:id/situation', async (c) => {
  await mutation(c, 'edit-situation', 60)
  const user = c.get('user')!
  const input = await readJson(c, updateSituationSchema)
  await simulations.requireSimulation(c.env, user.sub, c.req.param('id'))
  await repo.saveSituation(c.env.DB, { owner: user.sub, simulationId: c.req.param('id'), situation: input.situation, edited: true })
  await repo.updateSimulation(c.env.DB, user.sub, c.req.param('id'), {
    status: 'analyzed',
    goal: input.situation.goal,
    deadline: input.situation.deadline,
  })
  return json(c, { ok: true, situation: input.situation })
})

api.post('/simulations/:id/run', async (c) => {
  await mutation(c, 'run-simulation', 12)
  const user = c.get('user')!
  const simulationId = c.req.param('id')
  await simulations.requireSimulation(c.env, user.sub, simulationId)
  const body = await readJson(c, runSimulationSchema)
  return sseResponse<{ run: unknown }>((emit, register) => {
    return (async () => {
      const run = await simulations.runSimulation(c.env, user.sub, simulationId, body, emit)
      register({ run })
    })()
  }, c)
})

api.post('/simulations/:id/what-if', async (c) => {
  await mutation(c, 'what-if', 120)
  const user = c.get('user')!
  await simulations.requireSimulation(c.env, user.sub, c.req.param('id'))
  const input = await readJson(c, whatIfSchema)
  const result = await simulations.whatIf(c.env, user.sub, c.req.param('id'), input)
  return json(c, { result })
})

api.post('/simulations/:id/choose', async (c) => {
  await mutation(c, 'choose', 60)
  const user = c.get('user')!
  await simulations.requireSimulation(c.env, user.sub, c.req.param('id'))
  const input = await readJson(c, chooseOptionSchema)
  await simulations.chooseOption(c.env, user.sub, c.req.param('id'), input.optionId)
  return json(c, { ok: true })
})

api.post('/simulations/:id/outcome', async (c) => {
  await mutation(c, 'outcome', 30)
  const user = c.get('user')!
  await simulations.requireSimulation(c.env, user.sub, c.req.param('id'))
  const input = await readJson(c, outcomeSchema)
  const comparison = await simulations.recordOutcome(c.env, user.sub, c.req.param('id'), input)
  const profile = await simulations.decisionProfile(c.env, user.sub)
  return json(c, { comparison, profile })
})

/* ── Profile ───────────────────────────────────────────────────────────────── */

api.get('/profile/decision-pattern', async (c) => {
  const user = c.get('user')!
  const profile = await simulations.decisionProfile(c.env, user.sub)
  return json(c, { profile })
})

api.get('/profile/model', (c) =>
  json(c, {
    model: MODEL_CARD,
    engine: engineSummary(c.env),
  }),
)

/** Feature/label rows collected from real outcomes — the retraining export. */
api.get('/profile/training-export', async (c) => {
  const user = c.get('user')!
  const rows = await simulations.trainingRows(c.env, user.sub)
  return json(c, {
    generatedAt: new Date().toISOString(),
    modelVersion: MODEL_CARD.version,
    count: rows.length,
    // Feed this straight into: npm run train -- --real <file>
    rows,
  })
})

/* ── Demo + account ────────────────────────────────────────────────────────── */

api.post('/demo', async (c) => {
  await mutation(c, 'demo', 10)
  const user = c.get('user')!
  const demoId = await simulations.ensureDemoSimulation(c.env, user.sub)
  const items = await simulations.listSummaries(c.env, user.sub)
  return json(c, { demoSimulationId: demoId, simulations: items })
})

api.post('/account/delete', async (c) => {
  await mutation(c, 'account-delete', 5)
  const user = c.get('user')!
  await repo.deleteAllUserData(c.env.DB, user.sub)
  // The session row is gone with the account; clear the cookie so the browser
  // does not keep presenting a token that can never resolve again.
  c.header('Set-Cookie', clearSessionCookie(c.env))
  return json(c, { ok: true, deleted: true })
})

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Keep at least 2 characters.').max(80, 'That name is too long.').optional(),
  email: z.email('Enter a valid email address.').max(254).optional(),
})

/**
 * Name and email edits from Settings. The identity is `sub`, so changing the
 * email never changes who the account is — it only changes what is displayed.
 * `email_edited` stops a provider refresh from overwriting a chosen address.
 */
api.patch('/account/profile', async (c) => {
  await mutation(c, 'profile-update', 30)
  const user = c.get('user')!
  const input = await readJson(c, profileUpdateSchema)
  const email = input.email?.trim().toLowerCase()
  if (input.name === undefined && email === undefined) {
    throw new AppError('bad_request', 'Nothing to update.', 400)
  }
  if (email) {
    const clash = await c.env.DB.prepare(`SELECT sub FROM users WHERE lower(email) = ?1 AND sub <> ?2`)
      .bind(email, user.sub)
      .first<{ sub: string }>()
    if (clash) throw new AppError('email_taken', 'Another account already uses that email.', 409)
  }
  const account = await repo.updateAccount(c.env.DB, user.sub, { name: input.name, email })
  return json(c, {
    user: { sub: account.sub, name: account.name, email: account.email, picture: account.picture },
    provider: account.auth_provider === 'local' ? 'local' : 'freebuff',
  })
})

function engineSummary(env: Env) {
  const provider = createAiProvider(env)
  return provider.available
    ? { mode: 'ai' as const, provider: provider.name, model: provider.model, note: 'AI agent pipeline active. Probabilities come from the local ML model.' }
    : {
        mode: 'local' as const,
        provider: 'local',
        model: 'deterministic-core',
        note: 'Local reasoning core active: no LLM key is configured, so extraction, planning, risk analysis and reflection run from the deterministic engine on the server.',
      }
}
