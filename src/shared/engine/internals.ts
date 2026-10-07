/**
 * Structural types used by the engine. Declared separately so the training
 * script can import them as `import type` (fully erased at runtime) without
 * pulling any runtime module into Node's type-stripping loader.
 */
import type {
  CriticChallenge,
  DecisionOption,
  Deliverable,
  IdentifiedRisk,
  EngineInfo,
  Feasibility,
  OptionEvaluation,
  OutcomeRecord,
  PredictionComparison,
  Resource,
  StructuredSituation,
} from '../types.ts'

/** The situation as stored: identical to StructuredSituation. */
export type ServerSituation = StructuredSituation

export type {
  CriticChallenge,
  DecisionOption,
  Deliverable,
  EngineInfo,
  Feasibility,
  IdentifiedRisk,
  OptionEvaluation,
  OutcomeRecord,
  PredictionComparison,
  Resource,
  StructuredSituation,
}
