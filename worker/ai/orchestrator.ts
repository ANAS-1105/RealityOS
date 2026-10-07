/**
 * Agent orchestrator.
 *
 * Owns the order of operations for the three pipelines (analyse → simulate →
 * reflect) and the graceful degradation to the local reasoning core. It emits
 * real stage events as agents complete, which the API streams to the browser as
 * server-sent events — the progress the user sees reflects actual work.
 *
 * Numbers are never taken from the model: `simulationAgent` (the deterministic
 * engine + trained ML model) computes every stored probability, and the Critic
 * Agent is explicitly invited to disagree with them.
 */
import { critiqueLocally, planOptionsLocally, reflectLocally } from '../../src/shared/engine/local-engine.ts'
import { assessFeasibility, evaluateOptions, recommend, whatIfDeltas } from '../../src/shared/engine/simulate.ts'
import { WEIGHTS } from '../../src/shared/engine/ml.ts'
import type { CreateSimulationInput } from '../../src/shared/schemas.ts'
import type {
  AnalysisStage,
  CriticChallenge,
  EngineInfo,
  StageEvent,
  IdentifiedRisk,
  OptionEvaluation,
  OptionProjection,
  PredictionComparison,
  Recommendation,
  SimulationRun,
  StructuredSituation,
} from '../../src/shared/types.ts'
import { criticAgent, planningAgent, recommendationAgent, reflectionAgent, riskAgent, situationAgent, whatIfAgent } from './agents.ts'
import { matchDeliverable, normalizePlanOutput, normalizeSituationOutput } from './normalize.ts'
import { engineInfoFor, type AiProvider } from './provider.ts'
import { extractSituationLocally } from '../../src/shared/engine/local-engine.ts'

export interface OrchestratorContext {
  provider: AiProvider
  today: string
  /** Per-user follow-through learned from recorded outcomes (0.35–1). */
  reliability: number
  outcomeCount: number
  /** Shrunk bias correction applied to the headline probabilities. */
  calibration: { successBias: number; deadlineBias: number; sampleSize: number }
  emit?: (stage: StageEvent) => void
}

const STAGE_LABELS = {
  understanding: 'Understanding the situation',
  constraints: 'Extracting constraints and resources',
  dependencies: 'Mapping dependencies',
  risks: 'Identifying risks',
  strategies: 'Generating decision paths',
  simulating: 'Simulating outcomes',
  critic: 'Challenging assumptions',
  recommendation: 'Preparing the recommendation',
  reflection: 'Comparing prediction with reality',
} as const satisfies Record<AnalysisStage, string>

type StageScript = keyof typeof STAGE_LABELS

function stage(ctx: OrchestratorContext, key: StageScript, state: 'active' | 'done' | 'error', detail?: string) {
  ctx.emit?.({ stage: key, label: STAGE_LABELS[key], state, detail })
}

/* ── Pipeline 1: situation analysis ───────────────────────────────────────── */

export async function analyzeSituation(
  ctx: OrchestratorContext,
  request: CreateSimulationInput,
): Promise<{ situation: StructuredSituation; engine: EngineInfo }> {
  const startedAt = Date.now()
  stage(ctx, 'understanding', 'active')

  const attachmentsText = request.attachments
    .filter((a) => a.kind !== 'image')
    .map((a) => `# ${a.name}\n${a.text}`)
    .join('\n\n')
    .slice(0, 12_000)

  const ai = await situationAgent(ctx.provider, { request, attachmentsText, today: ctx.today })
  stage(ctx, 'understanding', 'done', ai ? `Model extracted ${ai.deliverables.length} deliverables` : 'Local extraction (pattern matching)')

  stage(ctx, 'constraints', 'active')

  let situation: StructuredSituation
  if (ai) {
    situation = normalizeSituationOutput(ai, request)
  } else {
    situation = extractSituationLocally(request, ctx.today)
  }
  const engine = engineInfoFor(ctx.provider, startedAt, Boolean(ai))

  stage(ctx, 'constraints', 'done', `${situation.constraints.length} constraints · ${situation.resources.length} resources`)
  stage(ctx, 'dependencies', 'active')
  stage(ctx, 'dependencies', 'done', `${situation.deliverables.reduce((sum, d) => sum + d.dependencies.length, 0)} dependency links`)
  stage(ctx, 'risks', 'done', `${situation.risks.length} risks identified`)
  return { situation, engine }
}

/* ── Pipeline 2: planning + simulation ────────────────────────────────────── */

export interface SimulateOptions {
  optionCount: number
  steer?: string
}

export async function simulate(
  ctx: OrchestratorContext,
  situation: StructuredSituation,
  options: SimulateOptions,
): Promise<SimulationRun> {
  const startedAt = Date.now()

  stage(ctx, 'strategies', 'active')
  const aiPlan = await planningAgent(ctx.provider, situation, { optionCount: options.optionCount, steer: options.steer })
  const normalizedAiOptions = aiPlan ? normalizePlanOutput(aiPlan, situation) : []
  const usedAiPlanning = normalizedAiOptions.length >= 2
  const options_ = usedAiPlanning ? normalizedAiOptions : planOptionsLocally(situation, ctx.today)
  stage(
    ctx,
    'strategies',
    'done',
    usedAiPlanning ? `${options_.length} strategies from the Planning Agent` : `${options_.length} strategies from the local planner`,
  )

  // Deterministic + ML projections. Authoritative.
  const evaluations = evaluateOptions(situation, options_, {
    today: ctx.today,
    reliability: ctx.reliability,
    outcomeCount: ctx.outcomeCount,
  })
  const calibrated = applyCalibration(evaluations, ctx.calibration)
  stage(ctx, 'simulating', 'done', `Trained workload model v${WEIGHTS.version} (${WEIGHTS.metrics.success.auc} AUC)`)

  stage(ctx, 'risks', 'active')
  const aiRisks = await riskAgent(ctx.provider, situation, calibrated)
  const risks = mergeRisks(situation.risks, aiRisks, calibrated)
  stage(ctx, 'risks', 'done', `${risks.length} risks across ${calibrated.length} options`)

  stage(ctx, 'critic', 'active')
  const aiCritiques = await criticAgent(ctx.provider, situation, calibrated)
  const critiques: CriticChallenge[] = aiCritiques?.length ? aiCritiques : critiqueLocally(calibrated)
  stage(ctx, 'critic', 'done', `${critiques.length} challenges raised`)

  stage(ctx, 'recommendation', 'active')
  const recommendation = recommend(calibrated)
  const aiRecommendation = await recommendationAgent(ctx.provider, situation, calibrated, recommendation)
  const finalRecommendation: Recommendation = aiRecommendation
    ? { ...recommendation, headline: aiRecommendation.headline || recommendation.headline, reasons: aiRecommendation.reasons.length ? aiRecommendation.reasons : recommendation.reasons, whyNot: aiRecommendation.whyNot.length ? aiRecommendation.whyNot : recommendation.whyNot }
    : recommendation
  stage(ctx, 'recommendation', 'done')

  const usedAi = usedAiPlanning || Boolean(aiRisks?.length) || Boolean(aiCritiques?.length) || Boolean(aiRecommendation)
  const engine = engineInfoFor(ctx.provider, startedAt, usedAi)

  return {
    situation,
    feasibility: assessFeasibility(situation, ctx.today),
    options: options_,
    evaluations: calibrated,
    recommendation: finalRecommendation,
    critiques,
    risks,
    engine,
  }
}

/** Shrunk per-user bias correction: the model learns from recorded outcomes. */
function applyCalibration(
  evaluations: OptionEvaluation[],
  calibration: OrchestratorContext['calibration'],
): OptionEvaluation[] {
  if (!calibration.sampleSize) return evaluations
  const shrink = calibration.sampleSize / (calibration.sampleSize + 5)
  const successShift = calibration.successBias * shrink
  const deadlineShift = calibration.deadlineBias * shrink
  return evaluations.map((evaluation) => {
    const projection: OptionProjection = {
      ...evaluation.projection,
      successProbability: round2Clamp(evaluation.projection.successProbability + successShift),
      deadlineRisk: round2Clamp(evaluation.projection.deadlineRisk + deadlineShift),
      blended: {
        successProbability: round2Clamp(evaluation.projection.blended.successProbability + successShift),
        deadlineRisk: round2Clamp(evaluation.projection.blended.deadlineRisk + deadlineShift),
        stressIndex: evaluation.projection.blended.stressIndex,
      },
    }
    return { ...evaluation, projection }
  })
}

function round2Clamp(value: number): number {
  return Math.round(Math.min(0.99, Math.max(0.01, value)) * 100) / 100
}

function mergeRisks(
  situationRisks: IdentifiedRisk[],
  aiRisks: { option: string; label: string; severity: IdentifiedRisk['severity']; rationale: string }[] | null,
  evaluations: OptionEvaluation[],
): IdentifiedRisk[] {
  if (aiRisks) {
    const resolved = aiRisks.map((risk) => {
      const match = evaluations.find((evaluation) => {
        const code = risk.option.trim().charAt(0).toUpperCase()
        return evaluation.option.code === code || evaluation.option.name.toLowerCase().includes(risk.option.toLowerCase())
      })
      const prefix = match ? `${match.option.code}: ` : ''
      return { label: `${prefix}${risk.label}`.slice(0, 120), severity: risk.severity, rationale: risk.rationale.slice(0, 400) }
    })
    if (resolved.length) return [...resolved, ...situationRisks].slice(0, 8)
  }
  // Local mode: per-option risks already computed by the engine, plus situation risks.
  const perOption = evaluations.flatMap((evaluation) => evaluation.risks.slice(0, 2))
  const order = { high: 2, medium: 1, low: 0 }
  const byLabel = new Map<string, IdentifiedRisk>()
  for (const risk of [...perOption, ...situationRisks]) {
    const existing = byLabel.get(risk.label)
    if (!existing || order[risk.severity] > order[existing.severity]) byLabel.set(risk.label, risk)
  }
  return [...byLabel.values()].sort((a, b) => order[b.severity] - order[a.severity]).slice(0, 8)
}

/* ── Pipeline 3: reflection ───────────────────────────────────────────────── */

export async function reflect(
  ctx: OrchestratorContext,
  prediction: { successProbability: number; deadlineRisk: number; stressIndex: number; expectedHours: number; deadline: string | null },
  outcome: { completed: string; actualHours: number | null; actualStress: number | null; actualCompletionDate: string | null; whatWentWrong: string; whatWentBetter: string; notes: string },
): Promise<{ causes: PredictionComparison['causes']; narrative: string; engine: EngineInfo }> {
  const startedAt = Date.now()
  stage(ctx, 'reflection', 'active')
  const ai = await reflectionAgent(ctx.provider, { prediction, outcome })
  const local = reflectLocally(prediction, {
    optionId: null,
    completed: outcome.completed as 'yes' | 'partly' | 'no',
    actualCompletionDate: outcome.actualCompletionDate,
    actualHours: outcome.actualHours,
    actualStress: outcome.actualStress,
    whatWentWrong: outcome.whatWentWrong,
    whatWentBetter: outcome.whatWentBetter,
    notes: outcome.notes,
  })
  stage(ctx, 'reflection', 'done', ai ? 'Reflection Agent' : 'Local reflection (deterministic comparison)')
  return {
    causes: ai?.causes.length ? ai.causes : local.causes,
    narrative: ai?.narrative || local.narrative,
    engine: engineInfoFor(ctx.provider, startedAt, Boolean(ai)),
  }
}

/* ── What-if narrative ─────────────────────────────────────────────────────── */

export async function explain(
  ctx: OrchestratorContext,
  input: { changes: Record<string, unknown>; base: OptionProjection; next: OptionProjection; deterministic: string },
): Promise<EngineInfo & { narrative?: string }> {
  const startedAt = Date.now()
  const deltas = whatIfDeltas(input.base, input.next).map((delta) => ({
    label: delta.label,
    from: delta.from,
    to: delta.to,
    change: delta.change,
  }))
  const ai = await whatIfAgent(ctx.provider, { changes: input.changes, deltas, deterministic: input.deterministic })
  return { ...engineInfoFor(ctx.provider, startedAt, Boolean(ai)), ...(ai ? { narrative: ai } : {}) }
}

export { matchDeliverable }
