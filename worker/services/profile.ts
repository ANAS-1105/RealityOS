/**
 * The learning system: turning recorded outcomes into a personal decision
 * profile *and* into adjustments that change the next simulation.
 *
 * Two things happen here:
 *  1. Readings for the user — prediction accuracy, time-estimation accuracy,
 *     deadline reliability, risk tendency, insights.
 *  2. Calibration — a shrunk bias correction and an empirical follow-through
 *     reliability that are fed back into the ML features. That is what makes
 *     "RealityOS learns from what actually happened" real rather than decorative.
 */
import { round1, round2, clamp } from '../../src/shared/engine/features.ts'
import { RELIABILITY_PRIOR } from '../../src/shared/engine/features.ts'
import { brier, outcomeScore, type StoredPrediction } from '../../src/shared/engine/reflect.ts'
import * as repo from '../db/repo.ts'
import type { DecisionProfile } from '../../src/shared/types.ts'

export interface Calibration {
  successBias: number
  deadlineBias: number
  sampleSize: number
}

/** Bayesian-style shrinkage: the prior only lets go as evidence accumulates. */
const PRIOR_WEIGHT = 5

export async function loadLearningState(
  db: D1Database,
  owner: string,
): Promise<{ reliability: number; calibration: Calibration; outcomeCount: number; outcomes: repo.OutcomeWithContext[] }> {
  const outcomes = await repo.listOutcomesWithPredictions(db, owner)
  const withPredictions = outcomes.filter((row) => row.prediction)
  const n = withPredictions.length

  const summedActual = outcomes.reduce((sum, row) => sum + outcomeScore(row.outcome), 0)
  const reliability = clamp((summedActual + RELIABILITY_PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT), 0.35, 1)

  const successBias = n
    ? withPredictions.reduce((sum, row) => sum + (outcomeScore(row.outcome) - (row.prediction?.successProbability ?? 0)), 0) / n
    : 0
  const deadlineBias = n
    ? withPredictions.reduce((sum, row) => {
        const missed = row.outcome.actualCompletionDate && row.prediction?.deadline ? row.outcome.actualCompletionDate > row.prediction.deadline : row.outcome.completed !== 'yes'
        return sum + ((missed ? 1 : 0) - (row.prediction?.deadlineRisk ?? 0))
      }, 0) / n
    : 0

  return {
    reliability: round2(reliability),
    calibration: { successBias: round2(successBias), deadlineBias: round2(deadlineBias), sampleSize: n },
    outcomeCount: outcomes.length,
    outcomes,
  }
}

export async function buildDecisionProfile(
  db: D1Database,
  owner: string,
  base: { useCase: DecisionProfile['useCase']; decisionStyle: DecisionProfile['decisionStyle'] },
): Promise<DecisionProfile> {
  const counts = await repo.countSimulations(db, owner)
  const { reliability, calibration, outcomes } = await loadLearningState(db, owner)
  const withPredictions = outcomes.filter((row) => row.prediction)

  const predictionAccuracy = withPredictions.length
    ? round1(
        clamp(
          100 -
            withPredictions.reduce((sum, row) => sum + Math.abs(outcomeScore(row.outcome) * 100 - (row.prediction?.successProbability ?? 0) * 100), 0) /
              withPredictions.length,
          0,
          100,
        ),
      )
    : null

  const hourRows = withPredictions.filter((row) => row.outcome.actualHours !== null && (row.prediction?.expectedHours ?? 0) > 0)
  const timeEstimationAccuracy = hourRows.length
    ? round1(
        clamp(
          100 -
            hourRows.reduce((sum, row) => {
              const expected = row.prediction?.expectedHours ?? 0
              return sum + Math.abs(((row.outcome.actualHours ?? 0) - expected) / expected) * 100
            }, 0) / hourRows.length,
          0,
          100,
        ),
      )
    : null

  const deadlineRows = withPredictions.filter((row) => row.prediction?.deadline)
  const deadlineReliability = deadlineRows.length
    ? round1(
        (100 * deadlineRows.filter((row) => row.outcome.actualCompletionDate === null || (row.prediction?.deadline && row.outcome.actualCompletionDate <= row.prediction.deadline)).length) /
          deadlineRows.length,
      )
    : null

  const stressRows = outcomes.filter((row) => row.outcome.actualStress !== null)
  const averageStress = stressRows.length ? round1(stressRows.reduce((sum, row) => sum + (row.outcome.actualStress ?? 0), 0) / stressRows.length) : null

  const brierScore = withPredictions.length
    ? round2(withPredictions.reduce((sum, row) => sum + brier(row.prediction?.successProbability ?? 0, outcomeScore(row.outcome)), 0) / withPredictions.length)
    : null

  const riskTendency = deriveRiskTendency(withPredictions)
  const insights = buildInsights({
    outcomes: withPredictions,
    reliability,
    timeEstimationAccuracy,
    predictionAccuracy,
    deadlineReliability,
    averageStress,
  })

  return {
    simulations: counts.total,
    outcomes: counts.outcomes,
    predictionAccuracy,
    timeEstimationAccuracy,
    deadlineReliability,
    riskTendency,
    averageStress,
    brierScore,
    calibration,
    insights,
    trend: withPredictions
      .slice(0, 8)
      .reverse()
      .map((row, index) => ({
        label: `#${index + 1}`,
        predicted: round1((row.prediction?.successProbability ?? 0) * 100),
        actual: round1(outcomeScore(row.outcome) * 100),
      })),
    useCase: base.useCase,
    decisionStyle: base.decisionStyle,
  }
}

function deriveRiskTendency(rows: repo.OutcomeWithContext[]): DecisionProfile['riskTendency'] {
  if (rows.length < 2) return 'unknown'
  const avgDeadlineRisk = rows.reduce((sum, row) => sum + (row.prediction?.deadlineRisk ?? 0), 0) / rows.length
  if (avgDeadlineRisk < 0.3) return 'cautious'
  if (avgDeadlineRisk > 0.5) return 'aggressive'
  return 'moderate'
}

function buildInsights(input: {
  outcomes: repo.OutcomeWithContext[]
  reliability: number
  timeEstimationAccuracy: number | null
  predictionAccuracy: number | null
  deadlineReliability: number | null
  averageStress: number | null
}): DecisionProfile['insights'] {
  const insights: DecisionProfile['insights'] = []
  const { outcomes, timeEstimationAccuracy, predictionAccuracy, deadlineReliability, averageStress, reliability } = input

  if (!outcomes.length) {
    insights.push({
      title: 'No recorded outcomes yet',
      detail: 'Run a simulation, then record what actually happened. Every recorded outcome sharpens the workload model and the reliability it assumes for you.',
      tone: 'neutral',
    })
    return insights
  }

  if (timeEstimationAccuracy !== null && timeEstimationAccuracy < 75) {
    insights.push({
      title: 'You tend to underestimate effort',
      detail: `Time estimates have been ${timeEstimationAccuracy}% accurate across ${outcomes.length} recorded outcome(s). Simulation plans should assume more rework than stated.`,
      tone: 'warning',
    })
  } else if (timeEstimationAccuracy !== null && timeEstimationAccuracy > 88) {
    insights.push({
      title: 'Your effort estimates hold up',
      detail: `${timeEstimationAccuracy}% accuracy on hours spent. The workload model can lean on your estimates.`,
      tone: 'positive',
    })
  }

  if (predictionAccuracy !== null) {
    insights.push({
      title: predictionAccuracy >= 80 ? 'Predictions are tracking reality' : 'Predictions drift from reality',
      detail: `Completion probability has been within ${(100 - predictionAccuracy).toFixed(0)} points on average. ${
        predictionAccuracy >= 80 ? 'Keep recording outcomes to hold that calibration.' : 'Recording the specific cause of each miss is the fastest way to close the gap.'
      }`,
      tone: predictionAccuracy >= 80 ? 'positive' : 'warning',
    })
  }

  if (deadlineReliability !== null) {
    insights.push({
      title: deadlineReliability >= 80 ? 'Deadlines are usually met' : 'Deadlines slip more often than not',
      detail: `${deadlineReliability}% of recorded decisions finished on time. ${
        deadlineReliability >= 80 ? 'Deadline risk estimates can stay moderate.' : 'Buffer days are worth more than extra daily hours for you.'
      }`,
      tone: deadlineReliability >= 80 ? 'positive' : 'warning',
    })
  }

  if (averageStress !== null && averageStress > 72) {
    insights.push({
      title: 'Your plans run hot',
      detail: `Self-reported pressure averages ${averageStress}/100. Options with a lower pressure index are probably worth more to you than a marginal gain in completion probability.`,
      tone: 'warning',
    })
  }

  insights.push({
    title: `Follow-through used in simulations: ${Math.round(reliability * 100)}%`,
    detail: `RealityOS assumes ${Math.round(reliability * 100)}% of your planned hours actually materialise, based on ${outcomes.length} recorded outcome(s). A higher number means plans are sized more aggressively.`,
    tone: 'neutral',
  })

  return insights.slice(0, 4)
}

export function predictionFromRow(row: repo.OutcomeWithContext): StoredPrediction | null {
  return row.prediction
}
