/**
 * Prediction bookkeeping: turning a simulation into a falsifiable prediction and
 * then scoring it against what actually happened. This is the feedback loop that
 * makes RealityOS a learning system rather than a one-shot calculator.
 */
import { clamp01, round1, round2 } from './features.ts'
import { estimateWorkload } from './features.ts'
import type { EngineInfo, OptionEvaluation, OutcomeRecord, PredictionComparison, StructuredSituation } from './internals.ts'

export interface StoredPrediction {
  optionId: string | null
  successProbability: number
  deadlineRisk: number
  stressIndex: number
  expectedHours: number
  expectedCompletionDate: string | null
  deadline: string | null
}

export function buildPrediction(
  situation: StructuredSituation,
  evaluation: OptionEvaluation,
): StoredPrediction {
  return {
    optionId: evaluation.option.id,
    successProbability: evaluation.projection.successProbability,
    deadlineRisk: evaluation.projection.deadlineRisk,
    stressIndex: evaluation.projection.stressIndex,
    expectedHours: round1(estimateWorkload(situation).totalHours),
    expectedCompletionDate: evaluation.projection.expectedCompletionDate,
    deadline: situation.deadline,
  }
}

/** 0..1 score for how well the goal went, from the recorded outcome. */
export function outcomeScore(outcome: OutcomeRecord): number {
  const base = outcome.completed === 'yes' ? 1 : outcome.completed === 'partly' ? 0.5 : 0
  return clamp01(base)
}

/** Brier score of one prediction (lower is better, 0.25 = uninformative). */
export function brier(predictedProbability: number, actualScore: number): number {
  return round2((predictedProbability - actualScore) ** 2)
}

export interface ReflectionDraft {
  causes: PredictionComparison['causes']
  narrative: string
}

export function compareWithOutcome(
  prediction: StoredPrediction,
  outcome: OutcomeRecord,
  reflection: ReflectionDraft,
  engine: EngineInfo,
): PredictionComparison {
  const actualSuccess = outcomeScore(outcome)
  const successDelta = round1(actualSuccess * 100 - prediction.successProbability * 100)
  const actualMissedDeadline =
    outcome.actualCompletionDate !== null && prediction.deadline !== null
      ? outcome.actualCompletionDate > prediction.deadline
      : outcome.completed !== 'yes'
  const hoursDelta =
    outcome.actualHours !== null ? round1(outcome.actualHours - prediction.expectedHours) : null

  return {
    predictedSuccess: round1(prediction.successProbability * 100),
    actualSuccess: round1(actualSuccess * 100),
    successDelta,
    predictedDeadlineRisk: round1(prediction.deadlineRisk * 100),
    actualMissedDeadline,
    deadlineHit: !actualMissedDeadline,
    predictedStress: round1(prediction.stressIndex),
    actualStress: outcome.actualStress,
    stressDelta: outcome.actualStress !== null ? round1(outcome.actualStress - prediction.stressIndex) : null,
    predictedHours: prediction.expectedHours,
    actualHours: outcome.actualHours,
    hoursDelta,
    hoursErrorPct:
      outcome.actualHours !== null && prediction.expectedHours > 0
        ? round1(((outcome.actualHours - prediction.expectedHours) / prediction.expectedHours) * 100)
        : null,
    causes: reflection.causes,
    narrative: reflection.narrative,
    engine,
  }
}
