/**
 * Engine tests. Run with `npm test` (node --test). Node 24 strips types from the
 * shared .ts modules, so the tests exercise the exact code the Worker ships.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { extractSituationLocally, planOptionsLocally, critiqueLocally, reflectLocally, parseDeadline, parseDailyHours } from '../src/shared/engine/local-engine.ts'
import { evaluateOptions, projectOption, recommend, whatIf, scoreOption } from '../src/shared/engine/simulate.ts'
import { buildCapacityContext, estimateWorkload } from '../src/shared/engine/features.ts'
import { buildPrediction, compareWithOutcome, outcomeScore, brier } from '../src/shared/engine/reflect.ts'

const TODAY = '2026-10-07'
const DEMO = `I have my final year project due October 15 and I also have to prepare for a machine learning exam next Friday.
I can give about 3 hours each day, but I have college classes during the day and lab sessions twice a week.
I still need to finish data preprocessing, train the model and write the final report.
My laptop is quite slow and I can only use the university GPU when the lab is free.`

function demo() {
  const situation = extractSituationLocally({ description: DEMO, attachments: [], constraints: [], resources: [] }, TODAY)
  const options = planOptionsLocally(situation)
  const context = { today: TODAY, reliability: 0.72, outcomeCount: 0 }
  const evaluations = evaluateOptions(situation, options, context)
  return { situation, options, evaluations, context }
}

test('local extraction reads the deadline, hours and deliverables out of prose', () => {
  const { situation } = demo()
  assert.equal(situation.deadline, '2026-10-15', 'October 15 → ISO date')
  assert.equal(situation.deadlineSource, 'explicit')
  assert.ok(situation.availableHoursPerDay >= 2.5 && situation.availableHoursPerDay <= 3.5, `hours/day was ${situation.availableHoursPerDay}`)
  assert.ok(situation.deliverables.length >= 3, `expected several deliverables, got ${situation.deliverables.length}`)
  assert.ok(situation.risks.length >= 1, 'expected at least one risk')
  assert.ok(situation.constraints.length >= 1, 'expected constraints')
  assert.ok(situation.resources.some((r) => /gpu|laptop/i.test(r.name) || (r.note ?? '').length > 0), 'expected resources')
  assert.ok(situation.extractionConfidence > 0.5)
})

test('deadline parser handles the common phrasings', () => {
  assert.equal(parseDeadline('due on 2026-11-01', TODAY).deadline, '2026-11-01')
  assert.equal(parseDeadline('due October 15', TODAY).deadline, '2026-10-15')
  assert.equal(parseDeadline('due in 5 days', TODAY).deadline, '2026-10-12')
  assert.equal(parseDeadline('due next friday', TODAY).deadline, '2026-10-16')
  assert.equal(parseDeadline('due friday', TODAY).deadline, '2026-10-09')
  assert.equal(parseDeadline('someday', TODAY).deadline, null)
})

test('hours parser handles per-day and per-week availability', () => {
  assert.equal(parseDailyHours('3 hours each day').hours, 3)
  assert.equal(parseDailyHours('two hours per day').hours, 2)
  assert.equal(parseDailyHours('half an hour a day').hours, 0.5)
  assert.equal(parseDailyHours('7 hours a week').hours, 1)
  assert.equal(parseDailyHours('weekdays only').daysPerWeek, 5)
})

test('projection is deterministic', () => {
  const { situation, options, context } = demo()
  const a = projectOption(situation, options[0], context)
  const b = projectOption(situation, options[0], context)
  assert.deepEqual(a, b)
})

test('more daily hours improve completion probability and coverage', () => {
  const { situation, options, context } = demo()
  const lean = { ...options[0], hoursPerDay: 1.2, allocations: options[0].allocations.map((x) => ({ ...x, hoursPerDay: 0.4 })) }
  const heavy = { ...options[0], hoursPerDay: 3.4, allocations: options[0].allocations.map((x) => ({ ...x, hoursPerDay: x.hoursPerDay * 1.6 })) }
  const leanP = projectOption(situation, lean, context)
  const heavyP = projectOption(situation, heavy, context)
  assert.ok(heavyP.successProbability > leanP.successProbability, `${heavyP.successProbability} should beat ${leanP.successProbability}`)
  assert.ok(heavyP.deadlineRisk < leanP.deadlineRisk)
  assert.ok(heavyP.stressIndex > leanP.stressIndex, 'more hours should raise pressure')
})

test('scheduled hours scale with the horizon in the capacity model', () => {
  const { situation, options } = demo()
  const short = buildCapacityContext(situation, { today: TODAY, overrides: { deadline: '2026-10-10' } })
  const long = buildCapacityContext(situation, { today: TODAY, overrides: { deadline: '2026-11-20' } })
  assert.ok(long.capacityHours > short.capacityHours)
  const shortP = projectOption(situation, options[0], { today: TODAY, reliability: 0.72, outcomeCount: 0, overrides: { deadline: '2026-10-10' } })
  const longP = projectOption(situation, options[0], { today: TODAY, reliability: 0.72, outcomeCount: 0, overrides: { deadline: '2026-11-20' } })
  assert.ok(longP.scheduledHours > shortP.scheduledHours)
  assert.ok(longP.deadlineRisk < shortP.deadlineRisk)
})

test('every option is scored, ranked and explained', () => {
  const { evaluations } = demo()
  const scores = evaluations.map(scoreOption)
  for (const s of scores) {
    assert.ok(s.score > 0 && s.score <= 100, `score out of range: ${s.score}`)
    assert.equal(s.breakdown.length, 5)
    const weightSum = s.breakdown.reduce((a, c) => a + c.weight, 0)
    assert.ok(Math.abs(weightSum - 1) < 1e-9, 'score weights must sum to 1')
  }
  const rec = recommend(evaluations)
  const best = evaluations.map((e) => ({ id: e.option.id, score: scoreOption(e).score })).sort((a, b) => b.score - a.score)[0]
  assert.equal(rec.optionId, best.id)
  assert.ok(rec.reasons.length >= 2)
  assert.ok(rec.whyNot.length >= 1, 'a runner-up explanation is required')
})

test('what-if returns metric deltas and a deterministic explanation', () => {
  const { situation, options, context } = demo()
  const { base, result } = whatIf(situation, options[0], { optionId: options[0].id, overrides: { hoursPerDay: 1 } }, context)
  assert.ok(result.explanation.length > 10)
  const success = result.deltas.find((d) => d.metric === 'successProbability')
  assert.ok(success, 'success delta present')
  assert.ok(success.to < success.from, 'cutting hours should lower the completion probability')
  assert.equal(success.direction, 'worse')
  assert.equal(base.optionId, options[0].id)
})

test('prediction vs reality produces signed gaps and causes', () => {
  const { situation, evaluations } = demo()
  const prediction = buildPrediction(situation, evaluations[0])
  const outcome = {
    optionId: prediction.optionId,
    completed: 'partly',
    actualCompletionDate: '2026-10-18',
    actualHours: prediction.expectedHours * 1.45,
    actualStress: 88,
    whatWentWrong: 'debugging the model took two extra nights',
    whatWentBetter: '',
    notes: '',
  }
  const reflection = reflectLocally(prediction, outcome)
  const comparison = compareWithOutcome(prediction, outcome, reflection, { mode: 'local', provider: 'local', model: 'deterministic-core', note: 'test' })
  // The gap must be signed correctly: actual 0.5 vs whatever was predicted.
  const expectedDelta = Math.round((0.5 * 100 - prediction.successProbability * 100) * 10) / 10
  assert.equal(comparison.successDelta, expectedDelta)
  if (prediction.successProbability > 0.5) assert.ok(comparison.successDelta < 0, 'a partial outcome must score below a confident prediction')
  else assert.ok(comparison.successDelta >= 0)
  assert.ok(comparison.hoursErrorPct > 20)
  assert.ok(comparison.actualMissedDeadline)
  assert.ok(comparison.causes.length >= 1)
  assert.equal(comparison.narrative.length > 10, true)
  assert.equal(outcomeScore(outcome), 0.5)
  assert.ok(Math.abs(brier(0.8, 0.5) - 0.09) < 1e-9)
})

test('critiques are generated for over-committed plans', () => {
  const { situation, options, context } = demo()
  const overloaded = { ...options[1], hoursPerDay: 6, allocations: options[1].allocations.map((a) => ({ ...a, hoursPerDay: 2 })) }
  const evaluations = evaluateOptions(situation, [options[0], overloaded], context)
  const critiques = critiqueLocally(evaluations)
  assert.ok(critiques.length >= 1)
  assert.ok(critiques.some((c) => /capacity|buffer|70%/i.test(c.challenge)))
})

test('workload estimator sizes technical work above admin work', () => {
  const technical = estimateWorkload({
    ...extractSituationLocally({ description: 'build a model', attachments: [], constraints: [], resources: [] }, TODAY),
    deliverables: [{ id: 'd1', name: 'Train model', complexity: 0.85, dependencies: ['d2', 'd3'], criticalPath: true }],
  })
  const admin = estimateWorkload({
    ...extractSituationLocally({ description: 'file forms', attachments: [], constraints: [], resources: [] }, TODAY),
    deliverables: [{ id: 'd1', name: 'File forms', complexity: 0.25, dependencies: [], criticalPath: false }],
  })
  assert.ok(technical.totalHours > admin.totalHours)
  assert.ok(technical.dependencyEdges === 2)
})
