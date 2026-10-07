/**
 * End-to-end API tests.
 *
 * Boots the real Worker (test entrypoint, real workerd via `wrangler dev`) with a
 * real local D1 database and drives the complete product loop over HTTP:
 *
 *   create → analyze (SSE) → run (SSE) → what-if → choose → outcome → profile
 *
 * plus the security properties that matter: signed-out 401s, cross-site 403s and
 * two-account data isolation.
 */
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const PORT = 8788
const ORIGIN = `http://localhost:${PORT}`
const WRANGLER = process.platform === 'win32' ? 'npx.cmd' : 'npx'
let server

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${ORIGIN}/api/health`)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await delay(500)
  }
  throw new Error('wrangler dev did not become ready')
}

function api(path, { user = asUser('user-a'), method = 'GET', body, origin = ORIGIN, headers = {} } = {}) {
  return fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(user ? { 'X-Test-User': user } : {}),
      ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Read an SSE stream to completion, returning every event. */
async function readSse(response) {
  const events = []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const eventLine = chunk.split('\n').find((line) => line.startsWith('event: '))
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '))
      if (eventLine && dataLine) events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) })
    }
  }
  return events
}

/** Unique per run: the local D1 file persists between runs, and account state is
 *  part of what these tests assert. */
const RUN = Date.now().toString(36)
const asUser = (name) => `${name}-${RUN}`

const DESCRIPTION = `My final year project is due on October 25 and I have a machine learning exam on October 14.
I can protect about 5 hours each day, even though I have college classes during the day.
I still need to finish the dataset preprocessing, train the model and write the final report.`

before(async () => {
  // Fail loudly rather than silently testing whatever is already on the port.
  try {
    await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) })
    throw new Error(`port ${PORT} is already serving — stop that server before running these tests`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('already serving')) throw error
  }
  spawnSync('node', ['tools/build-test-worker.mjs'], { stdio: 'inherit' })
  spawnSync('npx', ['wrangler', 'd1', 'execute', 'realityos-test', '--local', '--file=worker/db/schema.sql', '-c', 'wrangler.test.jsonc'], {
    stdio: 'inherit',
  })
  server = spawn(WRANGLER, ['wrangler', 'dev', '-c', 'wrangler.test.jsonc', '--port', String(PORT), '--ip', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  })
  server.stdout.on('data', (chunk) => process.env.VERBOSE && process.stdout.write(chunk))
  server.stderr.on('data', (chunk) => process.env.VERBOSE && process.stderr.write(chunk))
  server.unref()
  await waitForServer()
})

after(async () => {
  if (!server) return
  server.kill('SIGTERM')
  await delay(1000)
  if (server.exitCode === null) server.kill('SIGKILL')
})

test('health is public and reports the active engine', async () => {
  const response = await api('/api/health', { user: null })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.engine, 'local', 'AI_PROVIDER=none must select the local reasoning core')
})

test('signed-out requests to user data are rejected with 401', async () => {
  for (const path of ['/api/me', '/api/simulations', '/api/profile/decision-pattern']) {
    const response = await api(path, { user: null })
    assert.equal(response.status, 401, `${path} must require a session`)
    const body = await response.json()
    assert.equal(body.error.code, 'unauthorized')
  }
})

test('state-changing requests from a foreign origin are rejected with 403', async () => {
  const response = await api('/api/onboarding', {
    method: 'POST',
    origin: 'https://evil.example',
    body: { name: 'Mallory', useCase: 'other', decisionStyle: 'balanced' },
  })
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'forbidden')
})

test('onboarding seeds exactly one labelled demo simulation', async () => {
  const first = await api('/api/onboarding', {
    method: 'POST',
    body: { name: 'Ada', useCase: 'student', decisionStyle: 'analytical' },
  })
  assert.equal(first.status, 200)
  const seeded = await first.json()
  assert.ok(seeded.demoSimulationId, 'a demo simulation should be created for a new account')

  const again = await api('/api/onboarding', {
    method: 'POST',
    body: { name: 'Ada', useCase: 'student', decisionStyle: 'analytical' },
  })
  assert.equal((await again.json()).demoSimulationId, null, 'demo must not be seeded twice')

  const list = await (await api('/api/simulations')).json()
  assert.equal(list.simulations.length, 1)
  assert.equal(list.simulations[0].isDemo, true, 'demo content must be clearly labelled')
  assert.ok(list.simulations[0].topSuccessProbability > 20, 'the demo must come out of a real simulation run')
})

test('the full loop runs: create → analyze → run → what-if → choose → outcome → profile', async () => {
  const created = await api('/api/simulations', {
    method: 'POST',
    user: asUser('user-loop'),
    body: { description: DESCRIPTION, goal: 'Submit the project and pass the ML exam' },
  })
  assert.equal(created.status, 201)
  const { simulation } = await created.json()
  assert.equal(simulation.status, 'draft')

  // Analyze — streamed, with real stage events.
  const analyzeResponse = await api(`/api/simulations/${simulation.id}/analyze`, {
    method: 'POST',
    user: asUser('user-loop'),
    body: { description: DESCRIPTION, goal: 'Submit the project and pass the ML exam' },
  })
  assert.equal(analyzeResponse.status, 200)
  assert.match(analyzeResponse.headers.get('content-type'), /text\/event-stream/)
  const analyzeEvents = await readSse(analyzeResponse)
  const stages = analyzeEvents.filter((e) => e.event === 'stage')
  assert.ok(stages.length >= 4, `expected staged progress, saw ${stages.length} events`)
  assert.equal(stages[0].data.label, 'Understanding the situation')
  const analyzed = analyzeEvents.find((e) => e.event === 'result')
  assert.ok(analyzed, 'analysis must end with a result event')
  assert.ok(analyzed.data.situation.deliverables.length >= 2)
  assert.equal(analyzed.data.situation.deadline, '2026-10-25')

  // Run — streamed, with the projection payload.
  const runResponse = await api(`/api/simulations/${simulation.id}/run`, {
    method: 'POST',
    user: asUser('user-loop'),
    body: { optionCount: 3 },
  })
  const runEvents = await readSse(runResponse)
  const runResult = runEvents.find((e) => e.event === 'result')
  assert.ok(runResult, 'run must produce a result event')
  const run = runResult.data.run
  assert.ok(run.options.length >= 3, 'at least three decision paths')
  assert.equal(run.evaluations.length, run.options.length)
  assert.ok(run.recommendation.optionId)
  assert.ok(run.recommendation.reasons.length >= 2)
  assert.ok(run.critiques.length >= 1, 'the Critic Agent must challenge the plans')
  assert.ok(run.engine.mode === 'local', 'engine mode must be reported honestly')
  for (const evaluation of run.evaluations) {
    const p = evaluation.projection
    assert.ok(p.successProbability > 0 && p.successProbability < 1)
    assert.ok(p.deadlineRisk >= 0 && p.deadlineRisk <= 1)
    assert.ok(p.stressIndex >= 0 && p.stressIndex <= 100)
    assert.ok(p.features.capacity.slack !== undefined, 'feature vectors are exported for retraining')
    assert.equal(evaluation.projection.mlModel.version, run.evaluations[0].projection.mlModel.version)
  }

  // What-if.
  const whatIf = await api(`/api/simulations/${simulation.id}/what-if`, {
    method: 'POST',
    user: asUser('user-loop'),
    body: { optionId: run.recommendation.optionId, overrides: { hoursPerDay: 2 } },
  })
  assert.equal(whatIf.status, 200)
  const whatIfBody = await whatIf.json()
  assert.ok(whatIfBody.result.explanation.length > 10)
  const successDelta = whatIfBody.result.deltas.find((d) => d.metric === 'successProbability')
  assert.ok(successDelta.to < successDelta.from, 'cutting daily hours must lower the completion probability')
  assert.equal(successDelta.direction, 'worse')

  // Choose + record outcome.
  const chosen = await api(`/api/simulations/${simulation.id}/choose`, {
    method: 'POST',
    user: asUser('user-loop'),
    body: { optionId: run.recommendation.optionId },
  })
  assert.equal(chosen.status, 200)

  const outcome = await api(`/api/simulations/${simulation.id}/outcome`, {
    method: 'POST',
    user: asUser('user-loop'),
    body: {
      optionId: run.recommendation.optionId,
      completed: 'partly',
      actualCompletionDate: '2026-10-28',
      actualHours: 52,
      actualStress: 84,
      whatWentWrong: 'debugging the model took two extra nights',
      whatWentBetter: 'the report was faster than expected',
      notes: '',
    },
  })
  assert.equal(outcome.status, 200)
  const outcomeBody = await outcome.json()
  assert.ok(outcomeBody.comparison.causes.length >= 1)
  assert.equal(typeof outcomeBody.comparison.successDelta, 'number')
  assert.ok(outcomeBody.comparison.actualMissedDeadline, 'finishing after the deadline must be recorded as a miss')
  assert.ok(outcomeBody.profile.outcomes >= 1)

  // The detail view reflects everything that happened.
  const detail = await (await api(`/api/simulations/${simulation.id}`, { user: asUser('user-loop') })).json()
  assert.equal(detail.simulation.status, 'completed')
  assert.ok(detail.simulation.run)
  assert.ok(detail.simulation.outcome)
  assert.ok(detail.simulation.comparison)

  // Personal decision profile learned from the recorded outcome.
  const profile = await (await api('/api/profile/decision-pattern', { user: asUser('user-loop') })).json()
  assert.ok(profile.profile.calibration.sampleSize >= 1, 'the model must calibrate on recorded outcomes')
  assert.ok(profile.profile.insights.length >= 1)
  assert.ok(profile.profile.trend.length >= 1)

  // Training export for offline refitting.
  const exported = await (await api('/api/profile/training-export', { user: asUser('user-loop') })).json()
  assert.ok(exported.rows.length >= 1)
  assert.ok(Object.keys(exported.rows[0].features).length >= 7)
})

test('one account can never read or mutate another account’s simulation', async () => {
  const created = await api('/api/simulations', {
    method: 'POST',
    user: asUser('owner-a'),
    body: { description: DESCRIPTION },
  })
  const { simulation } = await created.json()

  for (const [method, path] of [
    ['GET', `/api/simulations/${simulation.id}`],
    ['GET', `/api/simulations/${simulation.id}/comparison`],
    ['DELETE', `/api/simulations/${simulation.id}`],
    ['POST', `/api/simulations/${simulation.id}/what-if`],
    ['POST', `/api/simulations/${simulation.id}/outcome`],
    ['POST', `/api/simulations/${simulation.id}/choose`],
  ]) {
    const response = await api(path, {
      method,
      user: asUser('intruder-b'),
      body: method === 'POST' ? {} : undefined,
    })
    assert.equal(response.status, 404, `${method} ${path} must not expose another account's data`)
  }

  const list = await (await api('/api/simulations', { user: asUser('intruder-b') })).json()
  assert.equal(list.simulations.some((s) => s.id === simulation.id), false)

  // The owner still sees it.
  const ownerView = await api(`/api/simulations/${simulation.id}`, { user: asUser('owner-a') })
  assert.equal(ownerView.status, 200)
})

test('validation rejects thin input with a friendly, actionable message', async () => {
  const tooShort = await api('/api/simulations', { method: 'POST', user: asUser('validator'), body: { description: 'help' } })
  assert.equal(tooShort.status, 400)
  const body = await tooShort.json()
  assert.equal(body.error.code, 'bad_request')
  assert.match(body.error.message, /describe the situation/i)
  assert.ok(body.error.requestId)

  const badJson = await api('/api/simulations', { method: 'POST', user: asUser('validator'), body: 'not json' })
  assert.equal(badJson.status, 400)
})

test('running before analysing is a clear 409, not a crash', async () => {
  const created = await api('/api/simulations', { method: 'POST', user: asUser('no-analyze'), body: { description: DESCRIPTION } })
  const { simulation } = await created.json()
  const response = await api(`/api/simulations/${simulation.id}/run`, { method: 'POST', user: asUser('no-analyze'), body: {} })
  assert.equal(response.status, 200, 'the run endpoint streams, so failures arrive in-band')
  const events = await readSse(response)
  const failed = events.find((e) => e.event === 'failed')
  assert.ok(failed, 'a failed run must be reported as an SSE failure event')
  assert.match(failed.data.message, /analyse the situation/i)
})

test('account deletion removes every trace of the user', async () => {
  const user = asUser('account-deletion')
  await api('/api/simulations', { method: 'POST', user, body: { description: DESCRIPTION } })
  const before = await (await api('/api/simulations', { user })).json()
  assert.equal(before.simulations.length, 1)

  const deleted = await api('/api/account/delete', { method: 'POST', user })
  assert.equal(deleted.status, 200)

  const after = await (await api('/api/simulations', { user })).json()
  assert.equal(after.simulations.length, 0, 'every simulation must be gone after account deletion')

  // Re-creating the account starts clean.
  await api('/api/simulations', { method: 'POST', user, body: { description: DESCRIPTION } })
  const rebuilt = await (await api('/api/simulations', { user })).json()
  assert.equal(rebuilt.simulations.length, 1)
})
