/**
 * The seven agents of RealityOS. They share one LLM provider but have strictly
 * separated responsibilities, separate prompt contracts and separate output
 * schemas:
 *
 *   Situation Agent      → situationAgent()      structured model of the situation
 *   Planning Agent       → planningAgent()       candidate decision paths
 *   Simulation Agent     → (see simulate.ts)     deterministic + ML projections
 *   Risk Agent           → riskAgent()           failure modes per option
 *   Critic Agent         → criticAgent()         attacks the plans and the numbers
 *   Recommendation Agent → recommendationAgent() explanation of the computed ranking
 *   Reflection Agent     → reflectionAgent()     predicted vs actual cause analysis
 *   (What-If Agent)      → whatIfAgent()         explains a variable change
 *
 * Every agent returns `null` when the provider is unavailable or its output fails
 * validation, which is what makes the graceful degradation to the local reasoning
 * core a first-class path rather than an error handler.
 */
import { z } from 'zod'
import {
  critiqueAgentOutputSchema,
  planAgentOutputSchema,
  recommendationAgentOutputSchema,
  reflectionAgentOutputSchema,
  situationAgentOutputSchema,
  whatIfExplanationSchema,
  type CreateSimulationInput,
} from '../../src/shared/schemas.ts'
import type { CriticChallenge, IdentifiedRisk, OptionEvaluation, PredictionComparison, Recommendation, StructuredSituation } from '../../src/shared/types.ts'
import type { AiProvider } from './provider.ts'
import {
  CRITIC_SYSTEM,
  PLANNING_SYSTEM,
  RECOMMENDATION_SYSTEM,
  REFLECTION_SYSTEM,
  RISK_SYSTEM,
  SITUATION_SYSTEM,
  WHATIF_SYSTEM,
  renderSituation,
} from './prompts.ts'

/** Safe wrapper: an agent never breaks the pipeline, it degrades to `null`. */
export async function safeAgent<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    console.warn(`[agent:${name}] falling back to local reasoning — ${error instanceof Error ? error.message : 'unknown error'}`)
    return null
  }
}

/* ── Situation Agent ───────────────────────────────────────────────────────── */

export async function situationAgent(
  provider: AiProvider,
  input: { request: CreateSimulationInput; attachmentsText: string; today: string },
): Promise<ReturnType<typeof situationAgentOutputSchema.parse> | null> {
  if (!provider.available) return null
  const { request } = input
  const hints = {
    today: input.today,
    userGoal: request.goal ?? null,
    userDeadline: request.deadline ?? null,
    userHoursPerDay: request.availableHoursPerDay ?? null,
    userConstraints: request.constraints ?? [],
    userResources: request.resources ?? [],
    priority: request.priority ?? 'balance',
  }
  return safeAgent('situation', () =>
    provider.completeJson({
      system: SITUATION_SYSTEM,
      user: `Today is ${input.today}. Structured hints supplied by the user (authoritative when present):\n${JSON.stringify(hints)}\n\nSituation described by the user:\n"""${request.description}"""\n\nExtracted from attached documents (may be empty):\n"""${input.attachmentsText.slice(0, 6000)}"""\n\nReturn the decision model as JSON: ${SHAPES.situation}`,
      schema: situationAgentOutputSchema,
      shape: SHAPES.situation,
      temperature: 0.2,
    }),
  )
}

/* ── Planning Agent ────────────────────────────────────────────────────────── */

export async function planningAgent(
  provider: AiProvider,
  situation: StructuredSituation,
  opts: { optionCount: number; steer?: string },
): Promise<ReturnType<typeof planAgentOutputSchema.parse> | null> {
  if (!provider.available) return null
  return safeAgent('planning', () =>
    provider.completeJson({
      system: PLANNING_SYSTEM,
      user: `Situation model:\n${renderSituation(situation)}\n\nProduce ${opts.optionCount} decision paths.${opts.steer ? `\nThe user asked for this steer: "${opts.steer}"` : ''}\nAllocate hours per day using the deliverable names exactly as written above.\nReturn JSON: ${SHAPES.plan}`,
      schema: planAgentOutputSchema,
      shape: SHAPES.plan,
      temperature: 0.4,
      maxTokens: 1800,
    }),
  )
}

/* ── Risk Agent ────────────────────────────────────────────────────────────── */

export async function riskAgent(
  provider: AiProvider,
  situation: StructuredSituation,
  evaluations: OptionEvaluation[],
): Promise<{ option: string; label: string; severity: IdentifiedRisk['severity']; rationale: string }[] | null> {
  if (!provider.available) return null
  const compact = evaluations.map((evaluation) => ({
    option: `${evaluation.option.code} — ${evaluation.option.name}`,
    strategy: evaluation.option.strategy,
    completionProbability: evaluation.projection.successProbability,
    deadlineRisk: evaluation.projection.deadlineRisk,
    pressureIndex: evaluation.projection.stressIndex,
    coverage: evaluation.projection.coverage.map((c) => `${c.name} ${Math.round(c.ratio * 100)}%`),
  }))
  const output = await safeAgent('risk', () =>
    provider.completeJson({
      system: RISK_SYSTEM,
      user: `Situation:\n${renderSituation(situation)}\n\nSimulated options:\n${JSON.stringify(compact, null, 0)}\n\nReturn JSON: ${SHAPES.risks}`,
      schema: riskAgentSchema,
      shape: SHAPES.risks,
      temperature: 0.3,
    }),
  )
  return output?.risks ?? null
}

export const riskAgentSchema = z.object({
  risks: z
    .array(
      z.object({
        option: z.string().max(80),
        label: z.string().min(3).max(120),
        severity: z.enum(['low', 'medium', 'high']),
        rationale: z.string().min(5).max(400),
      }),
    )
    .max(10),
})

/* ── Critic Agent ──────────────────────────────────────────────────────────── */

export async function criticAgent(
  provider: AiProvider,
  situation: StructuredSituation,
  evaluations: OptionEvaluation[],
): Promise<CriticChallenge[] | null> {
  if (!provider.available) return null
  const compact = evaluations.map((evaluation) => ({
    option: `${evaluation.option.code} — ${evaluation.option.name}`,
    assumptions: evaluation.option.assumptions,
    tradeoffs: evaluation.option.tradeoffs,
    simulated: {
      completionProbability: evaluation.projection.successProbability,
      deadlineRisk: evaluation.projection.deadlineRisk,
      pressureIndex: evaluation.projection.stressIndex,
      requiredHours: evaluation.projection.requiredHours,
      scheduledHours: evaluation.projection.scheduledHours,
      bufferDays: evaluation.projection.bufferDays,
    },
  }))
  const output = await safeAgent('critic', () =>
    provider.completeJson({
      system: CRITIC_SYSTEM,
      user: `Situation:\n${renderSituation(situation)}\n\nOptions with the platform's simulated numbers:\n${JSON.stringify(compact, null, 0)}\n\nChallenge the weakest assumptions and, if you think the numbers are wrong, say so explicitly.\nReturn JSON: ${SHAPES.critiques}`,
      schema: critiqueAgentOutputSchema,
      shape: SHAPES.critiques,
      temperature: 0.5,
    }),
  )
  return output?.critiques ?? null
}

/* ── Recommendation Agent ──────────────────────────────────────────────────── */

export async function recommendationAgent(
  provider: AiProvider,
  situation: StructuredSituation,
  evaluations: OptionEvaluation[],
  recommendation: Recommendation,
): Promise<{ headline: string; reasons: string[]; whyNot: { optionId: string; reason: string }[] } | null> {
  if (!provider.available) return null
  const winner = evaluations.find((e) => e.option.id === recommendation.optionId)
  const compact = evaluations.map((evaluation) => ({
    id: evaluation.option.id,
    option: `${evaluation.option.code} — ${evaluation.option.name}`,
    strategy: evaluation.option.strategy,
    completionProbability: evaluation.projection.successProbability,
    deadlineRisk: evaluation.projection.deadlineRisk,
    pressureIndex: evaluation.projection.stressIndex,
    flexibility: evaluation.projection.flexibility,
    expectedCompletionDate: evaluation.projection.expectedCompletionDate,
  }))
  const output = await safeAgent('recommendation', () =>
    provider.completeJson({
      system: RECOMMENDATION_SYSTEM,
      user: `Situation:\n${renderSituation(situation)}\n\nThe platform ranked these options:\n${JSON.stringify(compact, null, 0)}\n\nRecommended option id: ${recommendation.optionId} (${winner ? `${winner.option.code} — ${winner.option.name}` : 'unknown'}).\nDeterministic reasons already computed: ${JSON.stringify(recommendation.reasons)}\nReturn JSON: ${SHAPES.recommendation}`,
      schema: recommendationAgentOutputSchema,
      shape: SHAPES.recommendation,
      temperature: 0.3,
    }),
  )
  if (!output) return null
  const byCode = new Map(evaluations.map((e) => [e.option.code.toLowerCase(), e.option.id]))
  const byName = new Map(evaluations.map((e) => [e.option.name.toLowerCase(), e.option.id]))
  return {
    headline: output.headline,
    reasons: output.reasons,
    whyNot: output.whyNot.map((entry) => ({
      optionId: byCode.get(entry.option.toLowerCase().slice(0, 1)) ?? byName.get(entry.option.toLowerCase()) ?? entry.option,
      reason: entry.reason,
    })),
  }
}

/* ── Reflection Agent ──────────────────────────────────────────────────────── */

export async function reflectionAgent(
  provider: AiProvider,
  input: { prediction: { successProbability: number; deadlineRisk: number; stressIndex: number; expectedHours: number; deadline: string | null }; outcome: { completed: string; actualHours: number | null; actualStress: number | null; actualCompletionDate: string | null; whatWentWrong: string; whatWentBetter: string; notes: string } },
): Promise<{ causes: PredictionComparison['causes']; narrative: string } | null> {
  if (!provider.available) return null
  const output = await safeAgent('reflection', () =>
    provider.completeJson({
      system: REFLECTION_SYSTEM,
      user: `Simulation predicted: completion probability ${(input.prediction.successProbability * 100).toFixed(0)}%, deadline-miss risk ${(input.prediction.deadlineRisk * 100).toFixed(0)}%, pressure ${Math.round(input.prediction.stressIndex)}/100, about ${input.prediction.expectedHours}h of work. Deadline: ${input.prediction.deadline ?? 'none stated'}.\n\nWhat actually happened: completed=${input.outcome.completed}; finished ${input.outcome.actualCompletionDate ?? 'unknown'}; hours spent ${input.outcome.actualHours ?? 'unknown'}; reported pressure ${input.outcome.actualStress ?? 'unknown'}; what went wrong: "${input.outcome.whatWentWrong || 'not stated'}"; what went better: "${input.outcome.whatWentBetter || 'not stated'}"; notes: "${input.outcome.notes || 'none'}".\n\nReturn JSON: ${SHAPES.reflection}`,
      schema: reflectionAgentOutputSchema,
      shape: SHAPES.reflection,
      temperature: 0.3,
    }),
  )
  return output ?? null
}

/* ── What-If Agent ─────────────────────────────────────────────────────────── */

export async function whatIfAgent(
  provider: AiProvider,
  input: { changes: Record<string, unknown>; deltas: { label: string; from: number; to: number; change: number }[]; deterministic: string },
): Promise<string | null> {
  if (!provider.available) return null
  const output = await safeAgent('what-if', () =>
    provider.completeJson({
      system: WHATIF_SYSTEM,
      user: `Variable changes: ${JSON.stringify(input.changes)}\nResulting metric deltas (percentage points): ${JSON.stringify(input.deltas.map((d) => ({ metric: d.label, from: Math.round(d.from), to: Math.round(d.to), change: d.change })))}\nThe deterministic engine explains it as: "${input.deterministic}"\nExplain what changed and why, in at most two sentences. Return JSON: {"explanation":"..."}`,
      schema: whatIfExplanationSchema,
      shape: '{"explanation":"string"}',
      temperature: 0.3,
      maxTokens: 220,
    }),
  )
  return output?.explanation ?? null
}

/* Shapes shown to the model — kept next to the schemas they describe. */
export const SHAPES = {
  situation: `{
  "goal": "string",
  "summary": "string",
  "deadline": "YYYY-MM-DD or null",
  "deadlineSource": "explicit|inferred|unknown",
  "availableHoursPerDay": number,
  "activeDaysPerWeek": number,
  "constraints": ["string"],
  "resources": [{"name":"string","availability":"low|medium|high","note":"string?"}],
  "deliverables": [{"name":"string","complexity":0.0-1.0,"dependsOn":["deliverable name"],"estimatedHours":number?}],
  "risks": [{"label":"string","severity":"low|medium|high","rationale":"string"}],
  "priorities": ["string"],
  "complexity": 0.0-1.0,
  "fragmentation": 0.0-1.0,
  "openQuestions": ["string"],
  "extractionConfidence": 0.0-1.0
}`,
  plan: `{
  "options": [{
    "code": "A",
    "name": "string",
    "strategy": "string",
    "allocations": [{"deliverable":"exact deliverable name","hoursPerDay":number}],
    "bufferDays": number,
    "assumptions": ["string"],
    "tradeoffs": ["string"],
    "aiSuccessEstimate": 0.0-1.0,
    "aiRationale": "string"
  }]
}`,
  risks: `{"risks":[{"option":"A — Name","label":"string","severity":"low|medium|high","rationale":"string"}]}`,
  critiques: `{"critiques":[{"target":"A — Name","challenge":"string","severity":"low|medium|high"}]}`,
  recommendation: `{"headline":"string","reasons":["string"],"whyNot":[{"option":"A","reason":"string"}]}`,
  reflection: `{"causes":[{"label":"string","detail":"string","kind":"overestimate|underestimate|external"}],"narrative":"string"}`,
} as const
