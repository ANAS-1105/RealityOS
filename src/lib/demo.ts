/**
 * The public demo model used by the landing page and the "How it works" walkthrough.
 *
 * It is built by the *real* engine from the demo scenario — the same modules the
 * server runs — so the numbers a visitor sees before signing up are the numbers
 * the product would produce for that situation.
 */
import { extractSituationLocally, planOptionsLocally } from '@/shared/engine/local-engine'
import { evaluateOptions, recommend, whatIf as runWhatIf, type ProjectionContext } from '@/shared/engine/simulate'
import { DEMO_SCENARIO } from '@/shared/demo'
import type { DecisionOption, OptionEvaluation, Recommendation, StructuredSituation } from '@/shared/types'

export interface DemoModel {
  situation: StructuredSituation
  options: DecisionOption[]
  evaluations: OptionEvaluation[]
  recommendation: Recommendation
  context: ProjectionContext
}

let cached: DemoModel | null = null

export function buildDemoModel(today = new Date().toISOString().slice(0, 10)): DemoModel {
  if (cached) return cached
  const situation = extractSituationLocally(
    {
      description: DEMO_SCENARIO.description,
      goal: DEMO_SCENARIO.goal,
      availableHoursPerDay: DEMO_SCENARIO.structured.availableHoursPerDay,
      priority: DEMO_SCENARIO.structured.priority,
      attachments: [],
      constraints: [],
      resources: [],
    },
    today,
  )
  const options = planOptionsLocally(situation, today)
  const context: ProjectionContext = { today, reliability: 0.72, outcomeCount: 0 }
  const evaluations = evaluateOptions(situation, options, context)
  cached = { situation, options, evaluations, recommendation: recommend(evaluations), context }
  return cached
}

/** Recompute the demo's headline option with a different daily commitment. */
export function projectDemoHours(model: DemoModel, hoursPerDay: number) {
  const baseOption = model.evaluations.find((entry) => entry.option.id === model.recommendation.optionId) ?? model.evaluations[0]!
  const { result } = runWhatIf(model.situation, baseOption.option, { optionId: baseOption.option.id, overrides: { hoursPerDay } }, model.context)
  return result
}

export const HERO_STAGES = [
  { key: 'situation', label: 'Situation', detail: 'Your real constraints, parsed' },
  { key: 'decision', label: 'Decision', detail: 'Distinct strategies proposed' },
  { key: 'simulation', label: 'Simulation', detail: 'Outcomes and risk modelled' },
  { key: 'outcome', label: 'Outcome', detail: 'Reality recorded and learned' },
] as const
