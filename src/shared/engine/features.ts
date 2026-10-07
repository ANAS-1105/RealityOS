/**
 * Feature extraction for the RealityOS workload model.
 *
 * This module is imported by BOTH the runtime (Worker + browser, via esbuild/Vite)
 * and the offline training script (`tools/train-model.mjs`, via Node's type
 * stripping). Training and inference therefore compute features with literally
 * the same code — there is no hand-copied feature logic to drift.
 *
 * The estimator below is deliberately transparent and explainable: every hour it
 * attributes to a deliverable can be traced to complexity, dependency count and
 * critical-path status. The learned model (see `ml.ts`) then converts those
 * quantities plus capacity/resource factors into calibrated probabilities.
 */
import type { DecisionOption, Deliverable, Resource, ServerSituation } from './internals.ts'

/** Types re-exported here so both sides of the wire agree on the shape. */
export type Situation = ServerSituation

export const FEATURE_LABELS: Record<string, string> = {
  slack: 'Time slack (capacity vs required work)',
  complexity: 'Task complexity',
  dependencyDepth: 'Dependency depth',
  horizon: 'Deadline horizon',
  resourceAdequacy: 'Resource availability',
  fragmentation: 'Schedule fragmentation',
  reliability: 'Your historical follow-through',
  utilization: 'Planned capacity usage',
}

export const CAPACITY_FEATURES = [
  'slack',
  'complexity',
  'dependencyDepth',
  'horizon',
  'resourceAdequacy',
  'fragmentation',
  'reliability',
] as const

export const STRESS_FEATURES = [...CAPACITY_FEATURES, 'utilization'] as const

export type CapacityFeature = (typeof CAPACITY_FEATURES)[number]
export type StressFeature = (typeof STRESS_FEATURES)[number]

/** Population prior for follow-through, used until a user has real outcomes. */
export const RELIABILITY_PRIOR = 0.72
export const RELIABILITY_MIN = 0.35
export const RELIABILITY_MAX = 1

const RESOURCE_SCORE: Record<Resource['availability'], number> = { low: 0.3, medium: 0.65, high: 1 }

const MS_PER_DAY = 86_400_000

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`)
  const b = Date.parse(`${toISO}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / MS_PER_DAY)
}

export function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + Math.round(days) * MS_PER_DAY
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * Explainable workload estimator.
 *   hours = (2.2 + 6.2·complexity) · (1 + 0.15·dependencies) · criticalPathBonus
 * A deliverable with complexity 0.6 and two dependencies lands near 7 focused
 * hours; a simple 0.2-complexity task with no dependencies near 3.5.
 */
export function estimateDeliverableHours(deliverable: Deliverable): number {
  const base = 2.2 + 6.2 * clamp01(deliverable.complexity)
  const depFactor = 1 + 0.15 * Math.min(8, deliverable.dependencies.length)
  const critical = deliverable.criticalPath ? 1.15 : 1
  const explicit = deliverable.estimatedHours && deliverable.estimatedHours > 0 ? deliverable.estimatedHours : null
  const inferred = base * depFactor * critical
  return round1(explicit !== null ? (explicit + inferred) / 2 : inferred)
}

export interface WorkloadEstimate {
  totalHours: number
  perDeliverable: { id: string; name: string; hours: number; dependencies: number }[]
  dependencyEdges: number
  criticalPathHours: number
  coordinationOverheadHours: number
}

export function estimateWorkload(situation: Situation): WorkloadEstimate {
  let total = 0
  let critical = 0
  let edges = 0
  const perDeliverable = situation.deliverables.map((d) => {
    const hours = estimateDeliverableHours(d)
    total += hours
    edges += d.dependencies.length
    if (d.criticalPath) critical += hours
    return { id: d.id, name: d.name, hours, dependencies: d.dependencies.length }
  })
  // Sequencing and context-switch tax grows with the number of moving parts and
  // with how fragmented the week is.
  const coordination = total * 0.05 * Math.max(0, situation.deliverables.length - 1) * (0.6 + 0.8 * clamp01(situation.fragmentation))
  return {
    totalHours: round2(total + coordination),
    perDeliverable,
    dependencyEdges: edges,
    criticalPathHours: round2(critical || total * 0.6),
    coordinationOverheadHours: round2(coordination),
  }
}

/** Reliability costs time and fragmented weeks lose time to context switching. */
export const INTERRUPTION_FACTOR = 0.16

/** Hours per day that realistically materialise, after follow-through and fragmentation. */
export function realisticDailyHours(availableHoursPerDay: number, reliability: number, fragmentation: number): number {
  return availableHoursPerDay * reliability * (1 - INTERRUPTION_FACTOR * clamp01(fragmentation))
}

export interface CapacityContext {
  today: string
  deadline: string | null
  availableHoursPerDay: number
  activeDaysPerWeek: number
  daysUntilDeadline: number
  /** Realistic focused hours before the deadline: horizon × daily hours × reliability × fragmentation loss. */
  capacityHours: number
  /** Nominal hours if nothing interrupted the plan. */
  statedCapacityHours: number
  /** Days the user is realistically active before the deadline. */
  effectiveDays: number
  horizonDays: number
  requiredHours: number
  workload: WorkloadEstimate
  resourceAdequacy: number
  fragmentation: number
  complexity: number
  dependencyDepth: number
  reliability: number
}

export function buildCapacityContext(
  situation: Situation,
  opts: { today: string; reliability?: number; overrides?: Partial<Pick<Situation, 'deadline' | 'availableHoursPerDay' | 'activeDaysPerWeek' | 'complexity'>> & { resourceLevel?: Resource['availability'] } },
): CapacityContext {
  const deadline = opts.overrides?.deadline !== undefined ? opts.overrides.deadline : situation.deadline
  const availableHoursPerDay = opts.overrides?.availableHoursPerDay ?? situation.availableHoursPerDay
  const activeDaysPerWeek = opts.overrides?.activeDaysPerWeek ?? situation.activeDaysPerWeek
  const complexity = opts.overrides?.complexity ?? situation.complexity

  const workload = estimateWorkload(situation)
  const horizonDays = deadline ? Math.max(1, daysBetween(opts.today, deadline)) : 21
  const effectiveDays = Math.max(1, horizonDays * (activeDaysPerWeek / 7))
  const reliability = clamp(opts.reliability ?? RELIABILITY_PRIOR, RELIABILITY_MIN, RELIABILITY_MAX)
  const fragmentation = clamp01(situation.fragmentation)
  const statedCapacityHours = effectiveDays * availableHoursPerDay
  const capacityHours = statedCapacityHours * reliability * (1 - INTERRUPTION_FACTOR * fragmentation)

  const adequacyFromResources = situation.resources.length
    ? situation.resources.reduce((sum, r) => sum + RESOURCE_SCORE[r.availability], 0) / situation.resources.length
    : 0.65
  const resourceAdequacy = opts.overrides?.resourceLevel ? RESOURCE_SCORE[opts.overrides.resourceLevel] : adequacyFromResources

  return {
    today: opts.today,
    deadline,
    availableHoursPerDay,
    activeDaysPerWeek,
    daysUntilDeadline: horizonDays,
    capacityHours: round2(capacityHours),
    statedCapacityHours: round2(statedCapacityHours),
    effectiveDays: round2(effectiveDays),
    horizonDays,
    requiredHours: workload.totalHours,
    workload,
    resourceAdequacy: round3(resourceAdequacy),
    fragmentation,
    complexity: clamp01(complexity),
    dependencyDepth: round3(Math.min(1, workload.dependencyEdges / 8)),
    reliability,
  }
}

export interface OptionCapacity {
  /** Total focused hours the option schedules before the deadline. */
  scheduledHours: number
  /** Hours scheduled per active day. */
  plannedDailyHours: number
  /** Fraction of the user's daily capacity the plan commits (can exceed 1 = over-commit). */
  utilization: number
}

export function optionCapacity(context: CapacityContext, option: DecisionOption): OptionCapacity {
  // Hours this plan really delivers: the commitment, reserving the declared
  // buffer days, discounted by follow-through and fragmentation.
  const bufferFactor = clamp(1 - option.bufferDays / Math.max(1, context.daysUntilDeadline), 0.05, 1)
  const realisticDaily = realisticDailyHours(option.hoursPerDay, context.reliability, context.fragmentation)
  const scheduledHours = context.effectiveDays * realisticDaily * bufferFactor
  const plannedDailyHours = round2(realisticDaily)
  const utilization = plannedDailyHours / Math.max(0.25, context.availableHoursPerDay)
  return {
    scheduledHours: round2(scheduledHours),
    plannedDailyHours: round2(plannedDailyHours),
    utilization: round3(utilization),
  }
}

export function capacityFeatureVector(context: CapacityContext, capacity: OptionCapacity): Record<CapacityFeature, number> {
  const slack = Math.log(Math.max(0.05, capacity.scheduledHours) / Math.max(0.5, context.requiredHours))
  return {
    slack: round3(Math.max(-3, Math.min(3, slack))),
    complexity: round3(context.complexity),
    dependencyDepth: context.dependencyDepth,
    horizon: round3(Math.min(1.4, context.daysUntilDeadline / 30)),
    resourceAdequacy: context.resourceAdequacy,
    fragmentation: round3(context.fragmentation),
    reliability: round3(context.reliability),
  }
}

export function stressFeatureVector(
  capacity: OptionCapacity,
  base: Record<CapacityFeature, number>,
): Record<StressFeature, number> {
  return { ...base, utilization: round3(Math.max(0.2, Math.min(1.5, capacity.utilization))) }
}

/* ── small math helpers (shared, deterministic) ────────────────────────────── */

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x))
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1)
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}

export function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Deterministic seeded PRNG — used by the training script only. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
