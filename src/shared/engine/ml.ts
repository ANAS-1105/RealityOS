/**
 * ML inference for RealityOS.
 *
 * Two logistic-regression classifiers (completion, deadline miss) and one ridge
 * regressor (workload pressure) trained offline by `tools/train-model.mjs`.
 * Weights ship as JSON so the exact same numbers are computed in the Worker and
 * in the browser — the What-If sliders can therefore update instantly while the
 * server remains the authority for anything persisted.
 *
 * Every prediction exposes per-feature logit contributions, so the UI can show
 * *why* the model moved instead of an unexplained percentage.
 */
import { weightsFile } from '../ml/weights.ts'
import {
  CAPACITY_FEATURES,
  FEATURE_LABELS,
  STRESS_FEATURES,
  clamp,
  clamp01,
  round3,
  sigmoid,
  type CapacityFeature,
  type StressFeature,
} from './features.ts'
import type { FeatureContribution } from '../types.ts'

export interface WeightsFile {
  version: number
  trainedAt: string
  source: string
  sampleSize: number
  provenance: string
  capacity: {
    features: string[]
    mean: number[]
    std: number[]
    models: { success: { weights: number[]; bias: number }; deadlineMiss: { weights: number[]; bias: number } }
  }
  stress: { features: string[]; mean: number[]; std: number[]; model: { weights: number[]; bias: number } }
  metrics: {
    success: { accuracy: number; brier: number; auc: number; positives: number }
    deadlineMiss: { accuracy: number; brier: number; auc: number; positives: number }
    stress: { mae: number; r2: number }
  }
  prior: { successRate: number; deadlineMissRate: number; meanStress: number }
}

export const WEIGHTS = weightsFile as unknown as WeightsFile

export interface MlPrediction {
  successProbability: number
  deadlineRisk: number
  stressIndex: number
  contributions: FeatureContribution[]
  model: { version: number; source: string }
}

function standardize(value: number, index: number, stats: { mean: number[]; std: number[] }): number {
  return (value - (stats.mean[index] ?? 0)) / (stats.std[index] || 1)
}

export function predictMl(
  capacityFeatures: Record<CapacityFeature, number>,
  stressFeatures: Record<StressFeature, number>,
): MlPrediction {
  const { capacity, stress } = WEIGHTS

  let successLogit = capacity.models.success.bias
  let missLogit = capacity.models.deadlineMiss.bias
  const contributions: FeatureContribution[] = []

  ;[...CAPACITY_FEATURES].forEach((feature, index) => {
    const z = standardize(capacityFeatures[feature], index, capacity)
    const wSuccess = capacity.models.success.weights[index] ?? 0
    const wMiss = capacity.models.deadlineMiss.weights[index] ?? 0
    successLogit += wSuccess * z
    missLogit += wMiss * z
    contributions.push({
      feature,
      label: FEATURE_LABELS[feature] ?? feature,
      value: round3(z),
      // Contribution to the completion probability, in logit units.
      contribution: round3(wSuccess * z - wMiss * z * 0),
    })
  })

  let stressZ = stress.model.bias
  ;[...STRESS_FEATURES].forEach((feature, index) => {
    stressZ += (stress.model.weights[index] ?? 0) * standardize(stressFeatures[feature], index, stress)
  })

  return {
    successProbability: clamp01(sigmoid(successLogit)),
    deadlineRisk: clamp01(sigmoid(missLogit)),
    stressIndex: clamp(stressZ, 0.02, 0.99) * 100,
    contributions: contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    model: { version: WEIGHTS.version, source: WEIGHTS.source },
  }
}

/** Human-readable summary of the trained model, shown in the UI and Settings. */
export const MODEL_CARD = {
  version: WEIGHTS.version,
  trainedAt: WEIGHTS.trainedAt,
  source: WEIGHTS.source,
  sampleSize: WEIGHTS.sampleSize,
  provenance: WEIGHTS.provenance,
  metrics: WEIGHTS.metrics,
  algorithms: 'Logistic regression ×2 (completion, deadline miss) + ridge regression (workload pressure)',
  features: [...CAPACITY_FEATURES].map((f) => ({ key: f, label: FEATURE_LABELS[f] ?? f })),
}
