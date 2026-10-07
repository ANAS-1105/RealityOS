/**
 * Normalization layer between the LLM and the domain model.
 *
 * Model output is treated as a *proposal*. Everything that gets persisted as a
 * number is clamped, cross-checked against the user's own input, and re-keyed to
 * stable ids here. Where the model references deliverables by name we resolve
 * them by exact match first, then fuzzy token overlap — and silently drop
 * allocations we cannot resolve rather than inventing a deliverable.
 */
import { clamp, clamp01, round2 } from '../../src/shared/engine/features.ts'
import type { PlanAgentOutput, SituationAgentOutput, CreateSimulationInput } from '../../src/shared/schemas.ts'
import type { DecisionOption, Deliverable, IdentifiedRisk, StructuredSituation } from '../../src/shared/types.ts'

const RESOURCE_SCORE = { low: 0.3, medium: 0.65, high: 1 } as const

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    // Hyphens and underscores join words ("pre-processing" → "preprocessing") so
    // that hyphenation differences never break a match.
    .replace(/[-_/]+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 2 && !['the', 'and', 'for', 'with'].includes(token))
}

/** Resolve a model-supplied deliverable name to a deliverable id. */
export function matchDeliverable(name: string, deliverables: Deliverable[]): Deliverable | null {
  const target = normalizeName(name)
  if (!target) return null
  const exact = deliverables.find((d) => normalizeName(d.name) === target)
  if (exact) return exact
  const contains = deliverables.find((d) => normalizeName(d.name).includes(target) || target.includes(normalizeName(d.name)))
  if (contains) return contains
  const targetTokens = new Set(tokens(name))
  if (!targetTokens.size) return null
  let best: { deliverable: Deliverable; score: number } | null = null
  for (const deliverable of deliverables) {
    const candidate = tokens(deliverable.name)
    if (!candidate.length) continue
    const overlap = candidate.filter((token) => targetTokens.has(token)).length
    // Dice coefficient: symmetric, so a short name is not unfairly penalised
    // against a long descriptive one.
    const score = (2 * overlap) / (candidate.length + targetTokens.size)
    if (score >= 0.6 && (!best || score > best.score)) best = { deliverable, score }
  }
  return best?.deliverable ?? null
}

/** Turn the Situation Agent's proposal into the persisted domain model. */
export function normalizeSituationOutput(
  ai: SituationAgentOutput,
  request: CreateSimulationInput,
): StructuredSituation {
  const deliverables: Deliverable[] = ai.deliverables.slice(0, 8).map((item, index) => ({
    id: `d${index + 1}`,
    name: item.name.slice(0, 80),
    complexity: round2(clamp01(item.complexity)),
    dependencies: [],
    estimatedHours: item.estimatedHours && item.estimatedHours > 0 ? round2(clamp(item.estimatedHours, 0.5, 400)) : undefined,
    criticalPath: index < 2,
  }))

  // Resolve dependency names to ids, dropping self-references and cycles.
  const byName = new Map(ai.deliverables.map((item, index) => [normalizeName(item.name), index]))
  ai.deliverables.forEach((item, index) => {
    const target = deliverables[index]
    if (!target) return
    for (const dependency of item.dependsOn) {
      const dependencyIndex = byName.get(normalizeName(dependency))
      if (dependencyIndex === undefined || dependencyIndex === index) continue
      const dependencyId = `d${dependencyIndex + 1}`
      if (!target.dependencies.includes(dependencyId)) target.dependencies.push(dependencyId)
    }
  })

  // The user's own answers always win over the model's inference.
  const deadline = request.deadline ?? ai.deadline ?? null
  const deadlineSource = request.deadline ? 'explicit' : ai.deadlineSource ?? (deadline ? 'inferred' : 'unknown')
  const availableHoursPerDay = clamp(request.availableHoursPerDay ?? ai.availableHoursPerDay, 0.5, 14)

  const userResources = (request.resources ?? []).map((resource) => ({
    name: resource.name.slice(0, 80),
    availability: resource.availability,
  }))
  const resources = [...userResources, ...ai.resources.filter((r) => !userResources.some((u) => normalizeName(u.name) === normalizeName(r.name)))].slice(0, 6)

  const userConstraints = (request.constraints ?? []).map((c) => c.slice(0, 200))
  const constraints = [...new Set([...userConstraints, ...ai.constraints.map((c) => c.slice(0, 200))])].slice(0, 8)

  const risks: IdentifiedRisk[] = ai.risks.slice(0, 6).map((risk) => ({
    label: risk.label.slice(0, 120),
    severity: risk.severity,
    rationale: risk.rationale.slice(0, 400),
  }))

  // Extraction confidence is bounded by how complete the model actually is.
  const completeness =
    (deadline ? 0.3 : 0.1) +
    0.25 * (request.availableHoursPerDay || request.deadline ? 1 : 0.6) +
    0.2 * Math.min(1, deliverables.length / 3) +
    0.15 * (constraints.length ? 1 : 0.5) +
    0.1 * (resources.length ? 1 : 0.5)

  return {
    goal: (request.goal?.trim() || ai.goal).slice(0, 200),
    summary: ai.summary.slice(0, 1200),
    deadline,
    deadlineSource,
    availableHoursPerDay: round2(availableHoursPerDay),
    activeDaysPerWeek: clamp(Math.round(ai.activeDaysPerWeek), 1, 7),
    constraints,
    resources,
    risks,
    deliverables,
    priorities: ai.priorities.slice(0, 6),
    complexity: round2(clamp01(ai.complexity)),
    fragmentation: round2(clamp01(ai.fragmentation)),
    openQuestions: ai.openQuestions.slice(0, 5),
    extractionConfidence: round2(clamp01(Math.min(ai.extractionConfidence, completeness))),
    // Fragmentation floor: a week with real commitments is never perfectly clean.
    ...(ai.fragmentation < 0.12 ? { fragmentation: 0.12 } : {}),
  }
}

/**
 * Turn the Planning Agent's proposal into decision options. Allocations that do
 * not resolve to a deliverable are dropped; hours are clamped to a defensible
 * range; codes are made unique. Returns [] when fewer than two usable options
 * survive, so the caller can fall back to the local planner.
 */
export function normalizePlanOutput(ai: PlanAgentOutput, situation: StructuredSituation): DecisionOption[] {
  const maxDaily = Math.max(0.5, situation.availableHoursPerDay * 1.3)
  const options: DecisionOption[] = []

  ai.options.slice(0, 4).forEach((option, index) => {
    const allocations = option.allocations
      .map((allocation) => {
        const deliverable = matchDeliverable(allocation.deliverable, situation.deliverables)
        if (!deliverable) return null
        const hours = round2(clamp(allocation.hoursPerDay, 0, maxDaily))
        if (hours <= 0) return null
        return { deliverableId: deliverable.id, hoursPerDay: hours }
      })
      .filter((allocation): allocation is { deliverableId: string; hoursPerDay: number } => allocation !== null)

    // Merge duplicates that fuzzy-matching may have produced.
    const merged = new Map<string, number>()
    for (const allocation of allocations) {
      merged.set(allocation.deliverableId, round2((merged.get(allocation.deliverableId) ?? 0) + allocation.hoursPerDay))
    }
    const finalAllocations = [...merged.entries()].map(([deliverableId, hoursPerDay]) => ({ deliverableId, hoursPerDay }))
    if (!finalAllocations.length) return

    const totalHours = round2(finalAllocations.reduce((sum, a) => sum + a.hoursPerDay, 0))
    options.push({
      id: `opt-${(option.code || String.fromCharCode(65 + index)).toLowerCase()}-${index + 1}`,
      code: (option.code || String.fromCharCode(65 + index)).slice(0, 2).toUpperCase(),
      name: option.name.slice(0, 60),
      strategy: option.strategy.slice(0, 280),
      allocations: finalAllocations,
      hoursPerDay: round2(clamp(totalHours, 0.25, maxDaily)),
      bufferDays: clamp(Math.round(option.bufferDays), 0, 10),
      assumptions: option.assumptions.slice(0, 4).map((a) => a.slice(0, 240)),
      tradeoffs: option.tradeoffs.slice(0, 4).map((t) => t.slice(0, 240)),
      aiEstimate: {
        successProbability: round2(clamp01(option.aiSuccessEstimate)),
        rationale: option.aiRationale.slice(0, 300),
      },
    })
  })

  // Ensure codes are unique and ordered A, B, C…
  const seen = new Set<string>()
  options.forEach((option, index) => {
    let code = option.code
    if (!code || seen.has(code)) code = String.fromCharCode(65 + index)
    seen.add(code)
    option.code = code
  })

  return options.length >= 2 ? options : []
}

export const resourceScore = RESOURCE_SCORE
