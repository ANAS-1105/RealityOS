/**
 * Simulation service: the only place that combines the repository, the agent
 * orchestrator and the deterministic engine. Routes stay thin, agents stay
 * unaware of storage, and the engine stays unaware of either.
 */
import { buildPrediction, compareWithOutcome } from '../../src/shared/engine/reflect.ts'
import { riskLevelFrom } from '../../src/shared/engine/simulate.ts'
import { round1, round2 } from '../../src/shared/engine/features.ts'
import { DEMO_SCENARIO } from '../../src/shared/demo.ts'
import type {
  DecisionProfile,
  OutcomeRecord,
  PredictionComparison,
  SimulationDetail,
  SimulationRun,
  SimulationSummary,
  StructuredSituation,
  WhatIfInput,
  WhatIfResult,
} from '../../src/shared/types.ts'
import * as repo from '../db/repo.ts'
import { AppError, notFound } from '../lib/http.ts'
import { createAiProvider, engineInfoFor } from '../ai/provider.ts'
import { analyzeSituation, explain, reflect, simulate, type OrchestratorContext } from '../ai/orchestrator.ts'
import { whatIf as runWhatIf } from '../../src/shared/engine/simulate.ts'
import { buildDecisionProfile, loadLearningState } from './profile.ts'
import type { CreateSimulationInput } from '../../src/shared/schemas.ts'
import type { Env } from '../env.ts'
import type { StageEvent } from '../../src/shared/types.ts'

export const todayISO = (): string => new Date().toISOString().slice(0, 10)

export async function orchestratorContext(
  env: Env,
  owner: string,
  emit?: (stage: StageEvent) => void,
): Promise<OrchestratorContext> {
  const learning = await loadLearningState(env.DB, owner)
  return {
    provider: createAiProvider(env),
    today: todayISO(),
    reliability: learning.reliability,
    outcomeCount: learning.outcomeCount,
    calibration: learning.calibration,
    emit,
  }
}

function titleFrom(description: string, goal?: string | null): string {
  const source = (goal?.trim() || description.trim()).replace(/\s+/g, ' ')
  const firstClause = source.split(/[.!?\n]/)[0] ?? source
  const trimmed = firstClause.length > 68 ? `${firstClause.slice(0, 65).trim()}…` : firstClause
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export async function createSimulation(
  env: Env,
  owner: string,
  input: CreateSimulationInput,
  options: { isDemo?: boolean; title?: string } = {},
): Promise<repo.SimulationRow> {
  return repo.createSimulation(env.DB, {
    owner,
    title: options.title ?? input.title ?? titleFrom(input.description, input.goal),
    description: input.description,
    isDemo: options.isDemo,
    goal: input.goal ?? null,
    deadline: input.deadline ?? null,
  })
}

export async function analyze(
  env: Env,
  owner: string,
  simulationId: string,
  input: CreateSimulationInput,
  emit?: (stage: StageEvent) => void,
): Promise<{ situation: StructuredSituation; engine: ReturnType<typeof engineInfoFor> }> {
  const simulation = await requireSimulation(env, owner, simulationId)
  const context = await orchestratorContext(env, owner, emit)
  const { situation, engine } = await analyzeSituation(context, input)
  await repo.saveSituation(env.DB, { owner, simulationId, situation, edited: false })
  await repo.updateSimulation(env.DB, owner, simulationId, {
    status: 'analyzed',
    goal: situation.goal,
    deadline: situation.deadline,
    engine_mode: engine.mode,
    reliability: context.reliability,
  })
  await repo.recordAgentEvent(env.DB, {
    owner,
    simulationId,
    agent: 'situation',
    status: engine.mode,
    detail: `${situation.deliverables.length} deliverables`,
    durationMs: engine.latencyMs,
  })
  void simulation
  return { situation, engine }
}

export async function runSimulation(
  env: Env,
  owner: string,
  simulationId: string,
  opts: { optionCount: number; steer?: string },
  emit?: (stage: StageEvent) => void,
): Promise<SimulationRun> {
  await requireSimulation(env, owner, simulationId)
  const situation = await repo.getLatestSituation(env.DB, owner, simulationId)
  if (!situation) throw new AppError('not_analyzed', 'Analyse the situation before running a simulation.', 409)

  const context = await orchestratorContext(env, owner, emit)
  const run = await simulate(context, situation, opts)
  const top = run.evaluations.find((evaluation) => evaluation.option.id === run.recommendation.optionId) ?? run.evaluations[0]

  await repo.saveRun(env.DB, { owner, simulationId, run, engineMode: run.engine.mode })
  if (top) {
    await repo.savePrediction(env.DB, {
      owner,
      simulationId,
      prediction: buildPrediction(situation, top),
    })
    await repo.updateSimulation(env.DB, owner, simulationId, {
      status: 'simulated',
      engine_mode: run.engine.mode,
      reliability: context.reliability,
      top_option_name: top.option.name,
      top_option_code: top.option.code,
      top_success: round1(top.projection.successProbability * 100),
      top_deadline_risk: round1(top.projection.deadlineRisk * 100),
      top_stress: round1(top.projection.stressIndex),
      risk_level: riskLevelFrom(top.projection.deadlineRisk, top.projection.stressIndex),
      confidence: round1(top.projection.confidence),
    })
  }
  await repo.recordAgentEvent(env.DB, {
    owner,
    simulationId,
    agent: 'planning+simulation',
    status: run.engine.mode,
    detail: `${run.evaluations.length} options scored`,
    durationMs: run.engine.latencyMs,
  })
  return run
}

export async function whatIf(
  env: Env,
  owner: string,
  simulationId: string,
  input: WhatIfInput,
): Promise<WhatIfResult> {
  const situation = await repo.getLatestSituation(env.DB, owner, simulationId)
  const run = await repo.getLatestRun(env.DB, owner, simulationId)
  if (!situation || !run) throw new AppError('no_run', 'Run the simulation before exploring what-if scenarios.', 409)

  const evaluation =
    run.evaluations.find((e) => e.option.id === input.optionId) ??
    run.evaluations.find((e) => e.option.id === run.recommendation.optionId) ??
    run.evaluations[0]
  if (!evaluation) throw new AppError('no_run', 'That simulation has no options to explore.', 409)

  const learning = await loadLearningState(env.DB, owner)
  const { result } = runWhatIf(situation, evaluation.option, { ...input, optionId: evaluation.option.id }, {
    today: todayISO(),
    reliability: learning.reliability,
    outcomeCount: learning.outcomeCount,
  })

  const context = await orchestratorContext(env, owner)
  const engine = await explain(context, {
    changes: input.overrides as Record<string, unknown>,
    base: run.evaluations.find((e) => e.option.id === evaluation.option.id)!.projection,
    next: result.projection,
    deterministic: result.explanation,
  })

  return { ...result, aiNarrative: engine.narrative, engine: { ...engine, narrative: undefined } as WhatIfResult['engine'] }
}

export async function chooseOption(env: Env, owner: string, simulationId: string, optionId: string): Promise<void> {
  const run = await repo.getLatestRun(env.DB, owner, simulationId)
  if (!run) throw new AppError('no_run', 'Run the simulation before choosing a path.', 409)
  const evaluation = run.evaluations.find((e) => e.option.id === optionId)
  if (!evaluation) throw notFound('That decision option')
  await repo.updateSimulation(env.DB, owner, simulationId, { chosen_option: optionId, status: 'decided' })
}

export async function recordOutcome(
  env: Env,
  owner: string,
  simulationId: string,
  outcome: OutcomeRecord,
): Promise<PredictionComparison> {
  const situation = await repo.getLatestSituation(env.DB, owner, simulationId)
  const run = await repo.getLatestRun(env.DB, owner, simulationId)
  if (!situation || !run) throw new AppError('no_run', 'Run the simulation before recording an outcome.', 409)

  const simulationRow = await requireSimulation(env, owner, simulationId)
  const targetId = outcome.optionId ?? simulationRow.chosen_option ?? run.recommendation.optionId
  const evaluation = run.evaluations.find((e) => e.option.id === targetId) ?? run.evaluations[0]
  if (!evaluation) throw new AppError('no_run', 'That simulation has no options to compare against.', 409)

  const prediction = buildPrediction(situation, evaluation)
  const context = await orchestratorContext(env, owner)
  const reflection = await reflect(context, prediction, {
    completed: outcome.completed,
    actualHours: outcome.actualHours,
    actualStress: outcome.actualStress,
    actualCompletionDate: outcome.actualCompletionDate,
    whatWentWrong: outcome.whatWentWrong,
    whatWentBetter: outcome.whatWentBetter,
    notes: outcome.notes,
  })

  const comparison = compareWithOutcomeSafe(prediction, outcome, reflection)

  await repo.saveOutcome(env.DB, { owner, simulationId, outcome })
  await repo.saveComparison(env.DB, { owner, simulationId, comparison })
  await repo.saveTrainingRow(env.DB, {
    owner,
    simulationId,
    features: evaluation.projection.features.capacity,
    success: outcome.completed === 'yes' ? 1 : 0,
    deadlineMiss: comparison.actualMissedDeadline ? 1 : 0,
    stress01: (outcome.actualStress ?? comparison.predictedStress) / 100,
  })
  await repo.updateSimulation(env.DB, owner, simulationId, {
    status: 'completed',
    ...(outcome.optionId ? { chosen_option: outcome.optionId } : {}),
  })
  await repo.recordAgentEvent(env.DB, {
    owner,
    simulationId,
    agent: 'reflection',
    status: reflection.engine.mode,
    detail: `${comparison.successDelta >= 0 ? '+' : ''}${comparison.successDelta} pts vs predicted`,
    durationMs: reflection.engine.latencyMs,
  })
  return comparison
}

function compareWithOutcomeSafe(
  prediction: ReturnType<typeof buildPrediction>,
  outcome: OutcomeRecord,
  reflection: Awaited<ReturnType<typeof reflect>>,
): PredictionComparison {
  // compareWithOutcome lives in the shared engine, so the browser can recompute
  // exactly the same gaps from the stored prediction and outcome.
  return compareWithOutcome(prediction, outcome, reflection, reflection.engine)
}

export async function getDetail(env: Env, owner: string, simulationId: string): Promise<SimulationDetail> {
  const row = await requireSimulation(env, owner, simulationId)
  const [situation, run, outcome, comparison] = await Promise.all([
    repo.getLatestSituation(env.DB, owner, simulationId),
    repo.getLatestRun(env.DB, owner, simulationId),
    repo.getLatestOutcome(env.DB, owner, simulationId),
    repo.getLatestComparison(env.DB, owner, simulationId),
  ])
  const predictionRow = (await repo.listPredictions(env.DB, owner, 200)).find((p) => p.simulationId === simulationId)
  void predictionRow
  return {
    ...toSummary(row),
    description: row.description,
    situation,
    run,
    chosenOptionId: row.chosen_option,
    outcome,
    comparison,
    engine: run?.engine ?? null,
  }
}

export function toSummary(row: repo.SimulationRow): SimulationSummary {
  const riskLevel = row.risk_level
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDemo: row.is_demo === 1,
    deadline: row.deadline,
    goal: row.goal,
    topOptionName: row.top_option_name,
    topSuccessProbability: row.top_success === null ? null : round1(row.top_success),
    topDeadlineRisk: row.top_deadline_risk === null ? null : round1(row.top_deadline_risk),
    riskLevel: riskLevel === 'low' || riskLevel === 'medium' || riskLevel === 'high' ? riskLevel : null,
    confidence: row.confidence === null ? null : round1(row.confidence),
  }
}

export async function listSummaries(env: Env, owner: string, limit = 60): Promise<SimulationSummary[]> {
  const rows = await repo.listSimulations(env.DB, owner, limit)
  return rows.map(toSummary)
}

export async function requireSimulation(env: Env, owner: string, simulationId: string): Promise<repo.SimulationRow> {
  const row = await repo.getSimulation(env.DB, owner, simulationId)
  if (!row) throw notFound('That simulation')
  return row
}

/**
 * Every account starts with one clearly-labelled demo simulation so the loop is
 * understandable immediately. It is generated by the same pipeline as a real
 * simulation and can be deleted like any other.
 */
export async function ensureDemoSimulation(env: Env, owner: string): Promise<string | null> {
  const existing = await repo.listSimulations(env.DB, owner, 1)
  if (existing.length) return null

  const input: CreateSimulationInput = {
    description: DEMO_SCENARIO.description,
    goal: DEMO_SCENARIO.goal,
    availableHoursPerDay: DEMO_SCENARIO.structured.availableHoursPerDay,
    priority: DEMO_SCENARIO.structured.priority,
    attachments: [],
    constraints: [],
    resources: [],
  }
  const simulation = await createSimulation(env, owner, input, { isDemo: true, title: DEMO_SCENARIO.title })
  await analyze(env, owner, simulation.id, input)
  await runSimulation(env, owner, simulation.id, { optionCount: 3 })
  return simulation.id
}

/* ── Profile helpers used by the routes ────────────────────────────────────── */

/** Reliability + calibration state for the signed-in user (drives the UI badges). */
export async function learningSnapshot(env: Env, owner: string) {
  const learning = await loadLearningState(env.DB, owner)
  return { reliability: learning.reliability, calibration: learning.calibration, outcomeCount: learning.outcomeCount }
}

export async function decisionProfile(env: Env, owner: string): Promise<DecisionProfile> {
  const profileRow = await repo.ensureUser(env.DB, { sub: owner })
  return buildDecisionProfile(env.DB, owner, {
    useCase: (profileRow.use_case as DecisionProfile['useCase']) ?? 'other',
    decisionStyle: (profileRow.decision_style as DecisionProfile['decisionStyle']) ?? 'balanced',
  })
}

export interface TrainingRow {
  features: Record<string, number>
  success: number
  deadlineMiss: number
  stress01: number
}

export async function trainingRows(env: Env, owner: string): Promise<TrainingRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT features, success, deadline_miss, stress01 FROM training_rows WHERE owner = ?1 ORDER BY created_at ASC LIMIT 5000`,
  )
    .bind(owner)
    .all<{ features: string; success: number; deadline_miss: number; stress01: number }>()
  return (results ?? []).map((row) => ({
    features: JSON.parse(row.features) as Record<string, number>,
    success: row.success,
    deadlineMiss: row.deadline_miss,
    stress01: row.stress01,
  }))
}

export { round2, repo }
