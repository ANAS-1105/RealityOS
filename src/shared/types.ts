/**
 * RealityOS domain model.
 *
 * These types are shared by the Worker (API + agents + ML) and the browser app,
 * so the deterministic simulation core produces byte-identical numbers on both
 * sides of the wire. Persisted rows are JSON documents validated by the zod
 * schemas in `./schemas.ts`.
 */

export type UseCase = 'student' | 'professional' | 'entrepreneur' | 'personal' | 'other'
export type DecisionStyle = 'analytical' | 'balanced' | 'intuitive' | 'unsure'
export type RiskLevel = 'low' | 'medium' | 'high'
export type ResourceAvailability = 'low' | 'medium' | 'high'
export type Severity = 'low' | 'medium' | 'high'
export type AnalysisStage =
  | 'understanding'
  | 'constraints'
  | 'dependencies'
  | 'risks'
  | 'strategies'
  | 'simulating'
  | 'critic'
  | 'recommendation'
  | 'reflection'

/** A unit of work that the goal decomposes into. */
export interface Deliverable {
  id: string
  name: string
  /** 0 = trivial, 1 = very deep technical/creative work. Drives the ML workload model. */
  complexity: number
  /** Ids or short labels of deliverables this one waits on. */
  dependencies: string[]
  /** Hours the situation itself states, if any. Otherwise inferred by the estimator. */
  estimatedHours?: number
  /** On the path that determines the deadline. */
  criticalPath?: boolean
}

export interface Resource {
  name: string
  availability: ResourceAvailability
  note?: string
}

export interface IdentifiedRisk {
  label: string
  severity: Severity
  rationale: string
}

/** The structured understanding of the user's situation (Situation Agent output). */
export interface StructuredSituation {
  goal: string
  summary: string
  /** ISO date (YYYY-MM-DD) or null when the deadline is genuinely unknown. */
  deadline: string | null
  deadlineSource: 'explicit' | 'inferred' | 'unknown'
  /** Focused hours the user can realistically commit per day. */
  availableHoursPerDay: number
  /** Days per week the user can work. 7 = every day, 3 = fragmented schedule. */
  activeDaysPerWeek: number
  constraints: string[]
  resources: Resource[]
  risks: IdentifiedRisk[]
  deliverables: Deliverable[]
  /** Ordered: highest priority first. */
  priorities: string[]
  /** 0..1 overall difficulty of the goal. */
  complexity: number
  /** 0..1 how scattered the available time is (meetings, classes, shifts). */
  fragmentation: number
  /** What the AI could not determine and the user may want to answer. */
  openQuestions: string[]
  /** Extraction confidence 0..1 — how much of the model was explicit vs inferred. */
  extractionConfidence: number
}

export interface Allocation {
  deliverableId: string
  /** Focused hours per day assigned to this deliverable. */
  hoursPerDay: number
}

/** One generated decision path. */
export interface DecisionOption {
  id: string
  /** Display code: A, B, C… */
  code: string
  name: string
  /** One sentence describing the strategy. */
  strategy: string
  allocations: Allocation[]
  /** Total focused hours per day this option commits. */
  hoursPerDay: number
  /** Days of buffer the strategy deliberately leaves unused. */
  bufferDays: number
  assumptions: string[]
  tradeoffs: string[]
  /** The LLM's own rough judgement — shown separately from the ML model output. */
  aiEstimate?: { successProbability: number; rationale: string }
}

export interface FeatureContribution {
  feature: string
  label: string
  /** Standardized value fed to the model. */
  value: number
  /** Signed contribution to the logit. */
  contribution: number
}

export interface OptionProjection {
  optionId: string
  hoursPerDay: number
  /** Hours of work the situation requires in total (estimator output). */
  requiredHours: number
  /** Hours the option actually schedules before the deadline. */
  scheduledHours: number
  coverage: { deliverableId: string; name: string; required: number; scheduled: number; ratio: number }[]
  /** ML: probability the goal is completed to a good standard. */
  successProbability: number
  /** ML: probability the goal is not finished by the deadline. */
  deadlineRisk: number
  /** ML: workload pressure 0..100. */
  stressIndex: number
  /** 0..100: room to absorb a bad day without breaking the plan. */
  flexibility: number
  /** 0..1: how much of the available daily capacity the option consumes. */
  capacityUtilization: number
  expectedCompletionDate: string | null
  /** Days between expected completion and the deadline (negative = late). */
  bufferDays: number
  /** Bottleneck deliverable (highest unmet requirement). */
  criticalDeliverable: string | null
  /** 0..100 confidence in the projection itself. */
  confidence: number
  mlModel: {
    version: number
    source: string
    /** Explainability: per-feature signed logit contributions. */
    contributions: FeatureContribution[]
  }
  /** Exact feature vectors fed to the model — exported for retraining on real data. */
  features: { capacity: Record<string, number>; stress: Record<string, number> }
  heuristic: {
    successProbability: number
    deadlineRisk: number
    note: string
  }
  /** Final blended numbers the UI shows as "Simulated outcome". */
  blended: {
    successProbability: number
    deadlineRisk: number
    stressIndex: number
  }
}

export interface CriticChallenge {
  target: string
  challenge: string
  severity: Severity
}

export interface Recommendation {
  optionId: string
  headline: string
  reasons: string[]
  whyNot: { optionId: string; reason: string }[]
  /** Algorithmic score 0..100 with its component breakdown. */
  score: number
  scoreBreakdown: { label: string; weight: number; value: number }[]
  confidence: number
}

export interface OptionEvaluation {
  option: DecisionOption
  projection: OptionProjection
  risks: IdentifiedRisk[]
}

export interface Feasibility {
  status: 'fits' | 'tight' | 'does_not_fit'
  requiredHours: number
  capacityHours: number
  note: string
}

/** Full result of a simulation run. */
export interface SimulationRun {
  situation: StructuredSituation
  feasibility: Feasibility
  options: DecisionOption[]
  evaluations: OptionEvaluation[]
  recommendation: Recommendation
  critiques: CriticChallenge[]
  risks: IdentifiedRisk[]
  /** Which engine produced the narrative layer. */
  engine: EngineInfo
}

export interface EngineInfo {
  mode: 'ai' | 'local'
  provider: string
  model: string
  /** Human-readable explanation of the active mode, shown in the UI. */
  note: string
  latencyMs?: number
  fallbackReason?: string
}

/** What-if sandbox override of a single option. */
export interface WhatIfInput {
  optionId: string
  overrides: {
    hoursPerDay?: number
    activeDaysPerWeek?: number
    availableHoursPerDay?: number
    deadline?: string | null
    complexity?: number
    resourceLevel?: ResourceAvailability
    /** Extra hours/day re-allocated to a specific deliverable. */
    focusDeliverableId?: string
  }
}

export interface WhatIfResult {
  projection: OptionProjection
  deltas: { metric: string; label: string; from: number; to: number; change: number; direction: 'better' | 'worse' | 'same' }[]
  /** Deterministic explanation of what changed and why. */
  explanation: string
  /** Optional LLM narrative when AI mode is on. */
  aiNarrative?: string
  engine: EngineInfo
}

export interface OutcomeRecord {
  optionId: string | null
  completed: 'yes' | 'partly' | 'no'
  /** ISO date the work actually finished. */
  actualCompletionDate: string | null
  /** Hours actually spent in total. */
  actualHours: number | null
  /** 0..100 self-reported stress. */
  actualStress: number | null
  whatWentWrong: string
  whatWentBetter: string
  notes: string
}

export interface PredictionComparison {
  predictedSuccess: number
  actualSuccess: number
  successDelta: number
  predictedDeadlineRisk: number
  actualMissedDeadline: boolean
  deadlineHit: boolean
  predictedStress: number
  actualStress: number | null
  stressDelta: number | null
  predictedHours: number
  actualHours: number | null
  hoursDelta: number | null
  hoursErrorPct: number | null
  /** Reflection Agent output: the causes behind the gap. */
  causes: { label: string; detail: string; kind: 'overestimate' | 'underestimate' | 'external' }[]
  narrative: string
  engine: EngineInfo
}

export interface DecisionProfile {
  simulations: number
  outcomes: number
  /** ML accuracy: how often remembered outcomes matched simulation direction. */
  predictionAccuracy: number | null
  timeEstimationAccuracy: number | null
  deadlineReliability: number | null
  /** 0..100: how much slack the user tends to leave. */
  riskTendency: 'cautious' | 'moderate' | 'aggressive' | 'unknown'
  averageStress: number | null
  /** Brier score of the success model on this user's recorded outcomes (lower is better). */
  brierScore: number | null
  /** Bias correction currently applied to this user's predictions. */
  calibration: { successBias: number; deadlineBias: number; sampleSize: number }
  /** Short, specific, data-backed insights. */
  insights: { title: string; detail: string; tone: 'neutral' | 'positive' | 'warning' }[]
  /** Accuracy over time, for the profile chart. */
  trend: { label: string; predicted: number; actual: number }[]
  useCase: UseCase
  decisionStyle: DecisionStyle
}

export type SimulationStatus = 'draft' | 'analyzed' | 'simulated' | 'decided' | 'completed'

export interface SimulationSummary {
  id: string
  title: string
  status: SimulationStatus
  createdAt: string
  updatedAt: string
  isDemo: boolean
  deadline: string | null
  goal: string | null
  topOptionName: string | null
  topSuccessProbability: number | null
  topDeadlineRisk: number | null
  riskLevel: RiskLevel | null
  confidence: number | null
}

export interface SimulationDetail extends SimulationSummary {
  /** The original description, kept so a situation can be re-analysed. */
  description: string
  situation: StructuredSituation | null
  run: SimulationRun | null
  chosenOptionId: string | null
  outcome: OutcomeRecord | null
  comparison: PredictionComparison | null
  engine: EngineInfo | null
}

export interface UserProfile {
  sub: string
  name: string | null
  email: string | null
  picture: string | null
  useCase: UseCase | null
  decisionStyle: DecisionStyle | null
  onboardedAt: string | null
  createdAt: string
}

export interface ApiError {
  error: { code: string; message: string; retryable: boolean; requestId: string }
}

/** SSE stage payload streamed while agents run. */
export interface StageEvent {
  stage: AnalysisStage
  label: string
  state: 'active' | 'done' | 'error'
  detail?: string
}
