/**
 * Agent-layer tests with a mock LLM provider.
 *
 * These exercise the branch that cannot run in CI without an API key: the
 * orchestrator's handling of model output. Three things must hold:
 *   1. Valid model output is normalized (ids resolved, hours clamped).
 *   2. Hallucinated or malformed output never reaches the domain model — the
 *      pipeline falls back to the local reasoning core.
 *   3. The reported engine mode reflects what actually produced the result.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { analyzeSituation, simulate, reflect } from '../worker/ai/orchestrator.ts'
import { extractSituationLocally } from '../src/shared/engine/local-engine.ts'

const TODAY = '2026-10-07'
const REQUEST = {
  description: `Final year project due October 25. ML exam on October 14. I have about 5 hours a day.
I still need to finish dataset preprocessing, train the model and write the final report.`,
  attachments: [],
  constraints: [],
  resources: [],
}

/** A provider that returns canned objects, keyed by prompt kind. */
function mockProvider(responder) {
  return {
    available: true,
    name: 'mock-endpoint',
    model: 'mock-model-1',
    calls: [],
    async completeJson(request) {
      this.calls.push(request)
      const value = responder(request, this.calls.length)
      if (value instanceof Error) throw value
      // Mirror the real provider: validate before returning.
      const parsed = request.schema.safeParse(value)
      if (!parsed.success) throw new Error('mock returned invalid shape')
      return parsed.data
    },
  }
}

const validSituation = {
  goal: 'Finish the final year project and pass the ML exam',
  summary: 'Two deadlines, five hours a day.',
  deadline: '2026-10-25',
  deadlineSource: 'explicit',
  availableHoursPerDay: 5,
  activeDaysPerWeek: 6,
  constraints: ['college classes during the day'],
  resources: [{ name: 'University GPU', availability: 'medium' }],
  deliverables: [
    { name: 'Dataset preprocessing', complexity: 0.5, dependsOn: [], estimatedHours: 8 },
    { name: 'Model training', complexity: 0.8, dependsOn: ['Dataset preprocessing'], estimatedHours: 14 },
    { name: 'Final report', complexity: 0.6, dependsOn: ['Model training'], estimatedHours: 12 },
    { name: 'ML exam revision', complexity: 0.55, dependsOn: [], estimatedHours: 10 },
  ],
  risks: [{ label: 'Model training overruns', severity: 'medium', rationale: 'Debugging time was not scheduled.' }],
  priorities: ['Model training', 'Final report'],
  complexity: 0.62,
  fragmentation: 0.42,
  openQuestions: [],
  extractionConfidence: 0.86,
}

const validPlan = {
  options: [
    {
      code: 'A',
      name: 'Balanced Plan',
      strategy: 'Spread five hours a day across the project and the exam.',
      allocations: [
        { deliverable: 'Dataset pre-processing', hoursPerDay: 1 },
        { deliverable: 'Model Training', hoursPerDay: 2 },
        { deliverable: 'final report', hoursPerDay: 1 },
        { deliverable: 'ML exam revision', hoursPerDay: 1 },
      ],
      bufferDays: 1,
      assumptions: ['Each deliverable can progress in parallel.'],
      tradeoffs: ['No deliverable gets an aggressive push.'],
      aiSuccessEstimate: 0.7,
      aiRationale: 'The plan fits the available hours.',
    },
    {
      code: 'B',
      name: 'Model First',
      strategy: 'Front-load model training until it is debugged, then rotate.',
      allocations: [
        { deliverable: 'Dataset preprocessing', hoursPerDay: 2 },
        { deliverable: 'Model training', hoursPerDay: 2.5 },
        { deliverable: 'Final report', hoursPerDay: 0.5 },
      ],
      bufferDays: 0,
      assumptions: ['Training is the bottleneck.'],
      tradeoffs: ['The report starts late.'],
      aiSuccessEstimate: 0.6,
      aiRationale: 'Higher risk on the report but protects the critical path.',
    },
    {
      code: 'C',
      name: 'Unknown Deliverable Plan',
      strategy: 'Allocates time to deliverables that do not exist in the model.',
      // Well-formed JSON (so it passes the provider's schema check) but every
      // allocation points at a deliverable that does not exist.
      allocations: [{ deliverable: 'Buy a yacht', hoursPerDay: 8 }],
      bufferDays: 0,
      assumptions: ['nonsense'],
      tradeoffs: [],
      aiSuccessEstimate: 0.99,
      aiRationale: 'Hallucinated.',
    },
  ],
}

function ctx(provider, emit) {
  return {
    provider,
    today: TODAY,
    reliability: 0.72,
    outcomeCount: 0,
    calibration: { successBias: 0, deadlineBias: 0, sampleSize: 0 },
    emit,
  }
}

test('situation agent output is normalized: user input wins, ids and deps resolved', async () => {
  const provider = mockProvider(() => validSituation)
  const { situation, engine } = await analyzeSituation(ctx(provider), { ...REQUEST, availableHoursPerDay: 4 })
  assert.equal(engine.mode, 'ai', 'a working provider must be reported as AI mode')
  assert.equal(situation.availableHoursPerDay, 4, 'explicit user input beats the model')
  assert.deepEqual(
    situation.deliverables.map((d) => d.id),
    ['d1', 'd2', 'd3', 'd4'],
  )
  assert.deepEqual(situation.deliverables[1].dependencies, ['d1'], 'dependency names resolve to ids')
  assert.deepEqual(situation.deliverables[2].dependencies, ['d2'])
  assert.ok(situation.extractionConfidence <= validSituation.extractionConfidence)
})

test('planning agent output is normalized: fuzzy names resolve, hallucinated deliverables are dropped', async () => {
  const provider = mockProvider((request) =>
    request.system.includes('Planning Agent') ? validPlan : validSituation,
  )
  const { situation } = await analyzeSituation(ctx(provider), REQUEST)
  const run = await simulate(ctx(provider), situation, { optionCount: 3 })

  assert.equal(run.engine.mode, 'ai')
  const names = run.options.map((o) => o.name)
  assert.deepEqual(names.slice(0, 2), ['Balanced Plan', 'Model First'])
  assert.ok(!names.includes('Unknown Deliverable Plan'), 'an option with no resolvable deliverable must be dropped')

  const balanced = run.options[0]
  assert.equal(balanced.allocations.length, 4, 'fuzzy-matched deliverable names all resolve')
  assert.ok(balanced.hoursPerDay >= 4 && balanced.hoursPerDay <= 5.2, `hours clamped to the user's capacity, got ${balanced.hoursPerDay}`)
  assert.ok(balanced.aiEstimate?.rationale.length > 0)

  // The Critic Agent's fallback still runs (the mock returns a plan for every call).
  assert.ok(run.critiques.length >= 1)
  assert.ok(run.recommendation.optionId)
  assert.ok(run.risks.length >= 1)
})

test('a provider that fails every call degrades to the local core and says so', async () => {
  const provider = mockProvider(() => new Error('upstream 500'))
  const { situation, engine } = await analyzeSituation(ctx(provider), REQUEST)
  assert.equal(engine.mode, 'local', 'a broken provider must not be reported as AI mode')
  assert.match(engine.note, /Local reasoning core/)
  assert.ok(engine.fallbackReason.includes('did not return a usable response'))
  assert.ok(situation.deliverables.length >= 2, 'the local extractor still produced a usable model')

  const run = await simulate(ctx(provider), situation, { optionCount: 3 })
  assert.equal(run.engine.mode, 'local')
  assert.ok(run.options.length >= 3, 'the local planner produced the options')
  assert.ok(run.evaluations.every((e) => e.projection.successProbability > 0 && e.projection.successProbability < 1))
})

test('every stage of a simulation run is reported to the caller', async () => {
  const provider = mockProvider(() => new Error('offline'))
  const stages = []
  const { situation } = await analyzeSituation(ctx(provider, (event) => stages.push(event)), REQUEST)
  stages.length = 0
  await simulate(ctx(provider, (event) => stages.push(event)), situation, { optionCount: 3 })
  const keys = stages.map((s) => s.stage)
  for (const expected of ['strategies', 'simulating', 'risks', 'critic', 'recommendation']) {
    assert.ok(keys.includes(expected), `stage "${expected}" must be reported`)
  }
  assert.ok(stages.some((s) => s.state === 'done'), 'stages must carry their completion state')
})

test('reflection compares prediction with reality and explains the gap', async () => {
  const provider = mockProvider(() => new Error('offline'))
  const result = await reflect(
    ctx(provider),
    { successProbability: 0.74, deadlineRisk: 0.31, stressIndex: 47, expectedHours: 50, deadline: '2026-10-25' },
    {
      completed: 'partly',
      actualHours: 72,
      actualStress: 85,
      actualCompletionDate: '2026-10-29',
      whatWentWrong: 'model debugging took three extra nights',
      whatWentBetter: '',
      notes: '',
    },
  )
  assert.equal(result.engine.mode, 'local')
  assert.ok(result.causes.length >= 1)
  assert.ok(result.causes.some((c) => c.kind === 'underestimate'), 'overrunning effort is an underestimate')
  assert.ok(result.narrative.length > 10)
})

test('the local extractor is used verbatim when no provider is configured', async () => {
  const provider = { available: false, name: 'local', model: 'deterministic-core', async completeJson() { throw new Error('unavailable') } }
  const { situation, engine } = await analyzeSituation(ctx(provider), REQUEST)
  const expected = extractSituationLocally({ ...REQUEST, attachments: [], constraints: [], resources: [] }, TODAY)
  assert.equal(engine.mode, 'local')
  assert.equal(situation.deadline, expected.deadline)
  assert.equal(situation.availableHoursPerDay, expected.availableHoursPerDay)
  assert.deepEqual(
    situation.deliverables.map((d) => d.name),
    expected.deliverables.map((d) => d.name),
  )
})
