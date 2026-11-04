/**
 * The RealityOS simulation core.
 *
 * Deterministic, dependency-free, and identical on the server and in the browser.
 * Given a structured situation and a set of candidate decisions it produces, for
 * each option:
 *   • a workload/coverage breakdown per deliverable
 *   • ML completion probability, deadline risk and workload pressure (see ml.ts)
 *   • a transparent rule-based feasibility check (shown next to the ML numbers)
 *   • the blended "simulated outcome" the product headlines
 *   • an expected completion date that accounts for the user's track record
 * It then scores and ranks the options and returns a recommendation with an
 * explicit component breakdown, so nothing in the ranking is a black box.
 */
import {
  buildCapacityContext,
  capacityFeatureVector,
  realisticDailyHours,
  clamp,
  clamp01,
  daysBetween,
  addDays,
  estimateDeliverableHours,
  optionCapacity,
  round1,
  round2,
  round3,
  stressFeatureVector,
  type CapacityContext,
} from './features.ts'
import { WEIGHTS, predictMl } from './ml.ts'
import type {
  DecisionOption,
  IdentifiedRisk,
  OptionEvaluation,
  OptionProjection,
  Recommendation,
  RiskLevel,
  StructuredSituation,
  WhatIfInput,
  WhatIfResult,
} from '../types.ts'

export interface ProjectionContext {
  today: string
  /** Per-user follow-through rate learned from recorded outcomes (0.35–1). */
  reliability: number
  /** How many outcomes this user has recorded — drives projection confidence. */
  outcomeCount: number
  overrides?: WhatIfInput['overrides']
}

export function riskLevelFrom(deadlineRisk: number, stressIndex: number): RiskLevel {
  const score = deadlineRisk * 0.7 + (stressIndex / 100) * 0.3
  if (score < 0.3) return 'low'
  if (score < 0.55) return 'medium'
  return 'high'
}

/** Transparent rule-based feasibility check, deliberately simple and inspectable. */
function ruleBasedCheck(requiredRatio: number, utilization: number, resourceAdequacy: number, fragmentation: number, reliability: number) {
  let success: number
  if (requiredRatio >= 1.3) success = 0.9
  else if (requiredRatio >= 1.05) success = 0.78
  else if (requiredRatio >= 0.9) success = 0.64
  else if (requiredRatio >= 0.75) success = 0.48
  else if (requiredRatio >= 0.6) success = 0.32
  else success = 0.16

  success -= 0.1 * clamp01(utilization - 1)
  success -= 0.08 * fragmentation
  success += 0.1 * (resourceAdequacy - 0.65)
  success += 0.18 * (reliability - 0.72)
  const deadlineRisk = clamp01(1.02 - requiredRatio / 1.15 + 0.25 * clamp01(fragmentation - 0.3))
  return {
    successProbability: round2(clamp01(success)),
    deadlineRisk: round2(deadlineRisk),
    note: `Coverage ${(requiredRatio * 100).toFixed(0)}% of required hours, plan uses ${(utilization * 100).toFixed(0)}% of your daily capacity.`,
  }
}

export function projectOption(
  situation: StructuredSituation,
  option: DecisionOption,
  context: ProjectionContext,
): OptionProjection {
  const capacityContext: CapacityContext = buildCapacityContext(situation, {
    today: context.today,
    reliability: context.reliability,
    overrides: context.overrides,
  })
  const capacity = optionCapacity(capacityContext, option)
  const capacityFeatures = capacityFeatureVector(capacityContext, capacity)
  const stressFeatures = stressFeatureVector(capacity, capacityFeatures)
  const ml = predictMl(capacityFeatures, stressFeatures)

  // One source of truth for "hours that actually materialise" (see features.ts):
  // the plan's commitment, capped by what the user really has, then discounted by
  // follow-through and fragmentation. Used for coverage, the ML features, the
  // expected completion date and the rule-based check alike.
  const committedDailyHours = Math.min(option.hoursPerDay, capacityContext.availableHoursPerDay * 1.15)
  const plannedDailyHours = Math.max(0.25, realisticDailyHours(committedDailyHours, capacityContext.reliability, capacityContext.fragmentation))
  const scheduledWithReliability = capacityContext.effectiveDays * plannedDailyHours * clamp(1 - option.bufferDays / Math.max(1, capacityContext.daysUntilDeadline), 0.05, 1)

  const requiredRatio = scheduledWithReliability / Math.max(0.5, capacityContext.requiredHours)
  const rules = ruleBasedCheck(
    requiredRatio,
    capacity.utilization,
    capacityContext.resourceAdequacy,
    capacityContext.fragmentation,
    capacityContext.reliability,
  )

  // Blended headline numbers: the trained model leads, the rule check keeps it
  // anchored to the raw feasibility arithmetic.
  const blendedSuccess = clamp01(0.7 * ml.successProbability + 0.3 * rules.successProbability)
  const blendedDeadlineRisk = clamp01(0.7 * ml.deadlineRisk + 0.3 * rules.deadlineRisk)

  // Coverage is reported for EVERY deliverable in the situation, so a plan that
  // silently drops one shows up as a 0% row instead of a flattering average.
  const allocationByDeliverable = new Map(option.allocations.map((a) => [a.deliverableId, a.hoursPerDay]))
  const coverage = situation.deliverables.map((deliverable) => {
    const required = estimateDeliverableHours(deliverable)
    const allocated = allocationByDeliverable.get(deliverable.id) ?? 0
    const scheduled = allocated * plannedDailyHours * capacityContext.effectiveDays / Math.max(0.25, option.hoursPerDay)
    return {
      deliverableId: deliverable.id,
      name: deliverable.name,
      required: round1(required),
      scheduled: round1(scheduled),
      ratio: round3(required > 0 ? scheduled / required : 1),
    }
  })

  const critical = [...coverage].sort((a, b) => a.ratio - b.ratio)[0] ?? null

  const daysNeeded = Math.max(0, capacityContext.requiredHours / plannedDailyHours)
  const calendarDaysNeeded = daysNeeded / (capacityContext.activeDaysPerWeek / 7)
  const expectedCompletionDate = addDays(context.today, Math.ceil(calendarDaysNeeded))
  const bufferDays = capacityContext.deadline
    ? daysBetween(expectedCompletionDate, capacityContext.deadline)
    : Math.round(capacityContext.horizonDays - calendarDaysNeeded)

  const flexibility = round1(
    100 *
      clamp01(
        0.45 * clamp01(1 - capacity.utilization) +
          0.55 * clamp01(bufferDays / Math.max(1, capacityContext.horizonDays)),
      ),
  )

  const confidence = round1(
    clamp(
      48 +
        24 * situation.extractionConfidence +
        1.8 * Math.min(8, context.outcomeCount) +
        (situation.deadlineSource === 'explicit' ? 6 : situation.deadlineSource === 'inferred' ? 1 : -10) +
        (situation.resources.length ? 4 : -3) -
        (situation.openQuestions.length ? 4 : 0),
      30,
      96,
    ),
  )

  return {
    optionId: option.id,
    hoursPerDay: round2(option.hoursPerDay),
    requiredHours: capacityContext.requiredHours,
    scheduledHours: round1(scheduledWithReliability),
    coverage,
    successProbability: round2(blendedSuccess),
    deadlineRisk: round2(blendedDeadlineRisk),
    stressIndex: round1(ml.stressIndex),
    flexibility,
    capacityUtilization: round2(clamp(capacity.utilization, 0, 1.5)),
    expectedCompletionDate,
    bufferDays,
    criticalDeliverable: critical?.name ?? null,
    confidence,
    mlModel: { version: ml.model.version, source: ml.model.source, contributions: ml.contributions },
    features: { capacity: { ...capacityFeatures }, stress: { ...stressFeatures } },
    heuristic: rules,
    blended: {
      successProbability: round2(blendedSuccess),
      deadlineRisk: round2(blendedDeadlineRisk),
      stressIndex: round1(ml.stressIndex),
    },
  }
}

function optionRisks(situation: StructuredSituation, projection: OptionProjection): IdentifiedRisk[] {
  const risks: IdentifiedRisk[] = [...situation.risks]
  const unmet = projection.coverage.filter((c) => c.ratio < 0.85)
  if (unmet.length) {
    risks.push({
      label: `${unmet.map((u) => u.name).join(', ')} under-resourced`,
      severity: projection.coverage.some((c) => c.ratio < 0.6) ? 'high' : 'medium',
      rationale: `This plan schedules less time than the estimated requirement for ${unmet.length} of ${projection.coverage.length} deliverables.`,
    })
  }
  if (projection.bufferDays < 0) {
    risks.push({
      label: 'Expected to finish after the deadline',
      severity: projection.bufferDays < -3 ? 'high' : 'medium',
      rationale: `At this pace the work lands ${Math.abs(projection.bufferDays)} day(s) past the deadline.`,
    })
  }
  if (projection.capacityUtilization > 1.02) {
    risks.push({
      label: 'Plan exceeds available hours',
      severity: projection.capacityUtilization > 1.15 ? 'high' : 'medium',
      rationale: `The plan commits ${(projection.capacityUtilization * 100).toFixed(0)}% of the hours you have. Slippage is likely the first day something unexpected happens.`,
    })
  }
  if (projection.stressIndex > 70) {
    risks.push({
      label: 'High workload pressure',
      severity: projection.stressIndex > 82 ? 'high' : 'medium',
      rationale: `Pressure index ${Math.round(projection.stressIndex)}/100 — sustained load at this level historically reduces output quality.`,
    })
  }
  // De-duplicate by label, keeping the most severe.
  const order = { high: 2, medium: 1, low: 0 }
  const byLabel = new Map<string, IdentifiedRisk>()
  for (const risk of risks) {
    const existing = byLabel.get(risk.label)
    if (!existing || order[risk.severity] > order[existing.severity]) byLabel.set(risk.label, risk)
  }
  return [...byLabel.values()].slice(0, 6)
}

export interface Feasibility {
  status: 'fits' | 'tight' | 'does_not_fit'
  requiredHours: number
  capacityHours: number
  note: string
}

/**
 * Compares the estimated requirement with the user's stated capacity. When the
 * situation does not fit, RealityOS says so plainly instead of quietly reporting
 * low probabilities: scope, hours and deadline are the only real levers.
 */
export function assessFeasibility(situation: StructuredSituation, today: string): Feasibility {
  const context = buildCapacityContext(situation, { today })
  const ratio = context.requiredHours / Math.max(0.5, context.capacityHours)
  const status = ratio > 1.12 ? 'does_not_fit' : ratio > 0.92 ? 'tight' : 'fits'
  const note =
    status === 'does_not_fit'
      ? `The situation describes about ${context.requiredHours.toFixed(0)}h of focused work against roughly ${context.capacityHours.toFixed(0)}h of available time. No plan fixes that gap — the levers are scope, daily hours or the deadline.`
      : status === 'tight'
        ? `About ${context.requiredHours.toFixed(0)}h of work against ~${context.capacityHours.toFixed(0)}h available: it fits only with few interruptions.`
        : `About ${context.requiredHours.toFixed(0)}h of work against ~${context.capacityHours.toFixed(0)}h available — the plan has room to absorb a bad day.`
  return {
    status,
    requiredHours: round1(context.requiredHours),
    capacityHours: round1(context.capacityHours),
    note,
  }
}

export function evaluateOptions(
  situation: StructuredSituation,
  options: DecisionOption[],
  context: ProjectionContext,
): OptionEvaluation[] {
  return options.map((option) => {
    const projection = projectOption(situation, option, context)
    return { option, projection, risks: optionRisks(situation, projection) }
  })
}

export const SCORE_WEIGHTS = {
  success: 0.4,
  deadline: 0.18,
  stress: 0.12,
  flexibility: 0.12,
  coverage: 0.18,
}

export function scoreOption(evaluation: OptionEvaluation) {
  const { projection } = evaluation
  const coverage = projection.coverage.length
    ? projection.coverage.reduce((sum, c) => sum + clamp01(c.ratio), 0) / projection.coverage.length
    : 1
  const components = [
    { label: 'Completion probability', weight: SCORE_WEIGHTS.success, value: projection.successProbability },
    { label: 'Deadline safety', weight: SCORE_WEIGHTS.deadline, value: 1 - projection.deadlineRisk },
    { label: 'Workload pressure', weight: SCORE_WEIGHTS.stress, value: 1 - projection.stressIndex / 100 },
    { label: 'Flexibility', weight: SCORE_WEIGHTS.flexibility, value: projection.flexibility / 100 },
    { label: 'Deliverable coverage', weight: SCORE_WEIGHTS.coverage, value: clamp01(coverage) },
  ]
  const score = round1(100 * components.reduce((sum, c) => sum + c.weight * c.value, 0))
  return { score, breakdown: components.map((c) => ({ ...c, value: round3(c.value) })) }
}

export function recommend(evaluations: OptionEvaluation[]): Recommendation {
  const scored = evaluations
    .map((evaluation) => ({ evaluation, ...scoreOption(evaluation) }))
    .sort((a, b) => b.score - a.score)

  const winner = scored[0]
  const runnerUp = scored[1]

  if (!winner) throw new Error('recommend() requires at least one evaluated option')

  const { projection } = winner.evaluation
  const reasons: string[] = []
  reasons.push(
    projection.deadlineRisk <= 0.3
      ? `Lowest deadline risk of the options compared (${(projection.deadlineRisk * 100).toFixed(0)}%).`
      : `Best available deadline position (${(projection.deadlineRisk * 100).toFixed(0)}% miss risk, lowest of the set).`,
  )
  reasons.push(`Completion probability ${(projection.successProbability * 100).toFixed(0)}% under the trained workload model.`)
  if (projection.flexibility >= 45) reasons.push(`Keeps ${projection.flexibility.toFixed(0)}/100 flexibility, so a bad day does not break the plan.`)
  else if (projection.stressIndex < 65) reasons.push(`Workload pressure stays moderate (${Math.round(projection.stressIndex)}/100).`)
  if (projection.criticalDeliverable) reasons.push(`Every deliverable is scheduled; the tightest is “${projection.criticalDeliverable}”.`)

  const whyNot = runnerUp
    ? [
        {
          optionId: runnerUp.evaluation.option.id,
          reason: `Scored ${runnerUp.score.toFixed(0)} vs ${winner.score.toFixed(0)}: ${
            runnerUp.evaluation.projection.deadlineRisk > projection.deadlineRisk
              ? `deadline risk is ${((runnerUp.evaluation.projection.deadlineRisk - projection.deadlineRisk) * 100).toFixed(0)} points higher`
              : runnerUp.evaluation.projection.stressIndex > projection.stressIndex
                ? `workload pressure is ${Math.round(runnerUp.evaluation.projection.stressIndex - projection.stressIndex)} points higher`
                : 'coverage of the required hours is weaker'
          }.`,
        },
      ]
    : []

  return {
    optionId: winner.evaluation.option.id,
    headline: `${winner.evaluation.option.code} — ${winner.evaluation.option.name}`,
    reasons: reasons.slice(0, 4),
    whyNot,
    score: winner.score,
    scoreBreakdown: winner.breakdown,
    confidence: round1(clamp(projection.confidence * (1 - 0.15 * Math.abs(winner.score - (runnerUp?.score ?? winner.score)) / 100), 30, 96)),
  }
}

/** Deterministic explanation of what moved between two projections. */
export function whatIfDeltas(base: OptionProjection, next: OptionProjection): WhatIfResult['deltas'] {
  const entries: { metric: string; label: string; from: number; to: number; betterWhenHigher: boolean }[] = [
    { metric: 'successProbability', label: 'Completion probability', from: base.successProbability * 100, to: next.successProbability * 100, betterWhenHigher: true },
    { metric: 'deadlineRisk', label: 'Deadline risk', from: base.deadlineRisk * 100, to: next.deadlineRisk * 100, betterWhenHigher: false },
    { metric: 'stressIndex', label: 'Workload pressure', from: base.stressIndex, to: next.stressIndex, betterWhenHigher: false },
    { metric: 'flexibility', label: 'Flexibility', from: base.flexibility, to: next.flexibility, betterWhenHigher: true },
    { metric: 'coverage', label: 'Deliverable coverage', from: coverageIndex(base), to: coverageIndex(next), betterWhenHigher: true },
  ]
  return entries
    .map((e) => {
      const change = round1(e.to - e.from)
      return {
        metric: e.metric,
        label: e.label,
        from: round1(e.from),
        to: round1(e.to),
        change,
        direction: Math.abs(change) < 0.05 ? ('same' as const) : (e.betterWhenHigher ? change > 0 : change < 0) ? ('better' as const) : ('worse' as const),
      }
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}

function coverageIndex(p: OptionProjection): number {
  if (!p.coverage.length) return 1
  return round1((100 * p.coverage.reduce((sum, c) => sum + clamp01(c.ratio), 0)) / p.coverage.length)
}

/** Deterministic "what changed" sentence — used even when no LLM is active. */
export function explainWhatIf(base: OptionProjection, next: OptionProjection, deltas: WhatIfResult['deltas']): string {
  const biggest = deltas[0]
  const parts: string[] = []
  if (!biggest || Math.abs(biggest.change) < 0.05) {
    return 'Nothing material moved: these settings produce the same projected outcome as the plan on the table.'
  }
  const dir = biggest.direction === 'better' ? 'improves' : biggest.direction === 'worse' ? 'reduces' : 'barely changes'
  parts.push(`${biggest.label} ${dir} from ${biggest.from.toFixed(0)} to ${biggest.to.toFixed(0)}.`)

  const scheduledDelta = next.scheduledHours - base.scheduledHours
  if (scheduledDelta < -0.5) {
    parts.push(`Scheduled hours drop by ${Math.abs(scheduledDelta).toFixed(1)}h, so ${next.criticalDeliverable ? `${next.criticalDeliverable} has less runway` : 'less of the work fits'}.`)
  } else if (scheduledDelta > 0.5) {
    parts.push(`Scheduled hours rise by ${scheduledDelta.toFixed(1)}h, absorbing more of the estimated requirement.`)
  }
  if (next.bufferDays !== base.bufferDays) {
    parts.push(
      next.bufferDays >= 0
        ? `Expected completion moves to ${next.bufferDays} day(s) before the deadline.`
        : `Expected completion slips to ${Math.abs(next.bufferDays)} day(s) past the deadline.`,
    )
  }
  return parts.join(' ')
}

export function whatIf(
  situation: StructuredSituation,
  option: DecisionOption,
  input: WhatIfInput,
  context: ProjectionContext,
): { base: OptionProjection; result: WhatIfResult } {
  const base = projectOption(situation, option, context)

  // Apply the overrides to a copy: the slider drives daily hours, the horizon
  // controls, and an optional focus on a single deliverable.
  // A complexity change is a scope change, not just a different ML input: scale
  // each deliverable's complexity so the workload estimate moves with the lever
  // the What-If panel presents ("trim the complexity").
  const complexity = input.overrides.complexity
  const complexityRatio = complexity !== undefined && situation.complexity > 0 ? complexity / situation.complexity : 1
  const adjustedSituation: StructuredSituation = {
    ...situation,
    deadline: input.overrides.deadline !== undefined ? input.overrides.deadline : situation.deadline,
    availableHoursPerDay: input.overrides.availableHoursPerDay ?? situation.availableHoursPerDay,
    activeDaysPerWeek: input.overrides.activeDaysPerWeek ?? situation.activeDaysPerWeek,
    complexity: complexity ?? situation.complexity,
    ...(complexityRatio !== 1
      ? {
          deliverables: situation.deliverables.map((deliverable) => ({
            ...deliverable,
            complexity: clamp01(deliverable.complexity * complexityRatio),
          })),
        }
      : {}),
  }
  const totalHours = input.overrides.hoursPerDay ?? option.hoursPerDay
  let allocations = option.allocations
  if (input.overrides.focusDeliverableId) {
    const others = option.allocations.filter((a) => a.deliverableId !== input.overrides.focusDeliverableId)
    const otherTotal = others.reduce((sum, a) => sum + a.hoursPerDay, 0)
    const keepShare = otherTotal > 0 ? Math.min(1, Math.max(0, (option.hoursPerDay - totalHours * 0.65) / otherTotal)) : 0
    allocations = [
      ...others.map((a) => ({ ...a, hoursPerDay: round2(a.hoursPerDay * keepShare) })),
      { deliverableId: input.overrides.focusDeliverableId, hoursPerDay: round2(Math.max(0.25, totalHours - otherTotal * keepShare)) },
    ]
  } else if (totalHours > 0) {
    const scale = totalHours / Math.max(0.25, option.hoursPerDay)
    allocations = option.allocations.map((a) => ({ ...a, hoursPerDay: round2(a.hoursPerDay * scale) }))
  }

  const adjustedOption: DecisionOption = { ...option, hoursPerDay: totalHours, allocations }
  const projection = projectOption(adjustedSituation, adjustedOption, {
    ...context,
    overrides: { ...context.overrides, ...input.overrides },
  })
  const deltas = whatIfDeltas(base, projection)
  return {
    base,
    result: {
      projection,
      deltas,
      explanation: explainWhatIf(base, projection, deltas),
      engine: { mode: 'local', provider: 'local', model: 'deterministic-core', note: 'Rule-based explanation' },
    },
  }
}

export const MODEL_PRIOR = WEIGHTS.prior
