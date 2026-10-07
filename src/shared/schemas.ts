/**
 * Runtime validation for every boundary in RealityOS:
 *  - HTTP request bodies (user input)
 *  - LLM responses (never trusted blindly — parsed, validated, then clamped)
 *  - persisted JSON documents read back out of D1
 */
import { z } from 'zod'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')

const shortText = z.string().trim().min(1).max(300)
const mediumText = z.string().trim().max(2000)

export const riskLevelSchema = z.enum(['low', 'medium', 'high'])
export const severitySchema = z.enum(['low', 'medium', 'high'])
export const resourceAvailabilitySchema = z.enum(['low', 'medium', 'high'])
export const useCaseSchema = z.enum(['student', 'professional', 'entrepreneur', 'personal', 'other'])
export const decisionStyleSchema = z.enum(['analytical', 'balanced', 'intuitive', 'unsure'])
export const analysisStageSchema = z.enum([
  'understanding',
  'constraints',
  'dependencies',
  'risks',
  'strategies',
  'simulating',
  'critic',
  'recommendation',
  'reflection',
])

export const deliverableSchema = z.object({
  id: z.string().min(1).max(64),
  name: shortText,
  complexity: z.number().min(0).max(1),
  dependencies: z.array(z.string().max(80)).max(12).default([]),
  estimatedHours: z.number().min(0).max(600).optional(),
  criticalPath: z.boolean().optional(),
})

export const situationSchema = z.object({
  goal: shortText,
  summary: mediumText.default(''),
  deadline: isoDate.nullable(),
  deadlineSource: z.enum(['explicit', 'inferred', 'unknown']).default('unknown'),
  availableHoursPerDay: z.number().min(0.25).max(16),
  activeDaysPerWeek: z.number().min(1).max(7).default(7),
  constraints: z.array(mediumText).max(12).default([]),
  resources: z
    .array(z.object({ name: shortText, availability: resourceAvailabilitySchema, note: mediumText.optional() }))
    .max(10)
    .default([]),
  risks: z
    .array(z.object({ label: shortText, severity: severitySchema, rationale: mediumText.default('') }))
    .max(12)
    .default([]),
  deliverables: z.array(deliverableSchema).min(1).max(12),
  priorities: z.array(shortText).max(8).default([]),
  complexity: z.number().min(0).max(1),
  fragmentation: z.number().min(0).max(1),
  openQuestions: z.array(mediumText).max(8).default([]),
  extractionConfidence: z.number().min(0).max(1),
})

/* ── Request bodies ────────────────────────────────────────────────────────── */

export const createSimulationSchema = z.object({
  title: z.string().trim().max(140).optional(),
  description: z.string().trim().min(20, 'Please describe the situation in a little more detail.').max(8000),
  /** Optional structured inputs — the Situation Agent fills the gaps. */
  goal: z.string().trim().max(300).optional(),
  deadline: isoDate.optional(),
  availableHoursPerDay: z.number().min(0.25).max(16).optional(),
  constraints: z.array(z.string().trim().max(300)).max(12).optional(),
  resources: z
    .array(z.object({ name: z.string().trim().max(120), availability: resourceAvailabilitySchema }))
    .max(10)
    .optional(),
  priority: z.enum(['speed', 'quality', 'balance', 'risk']).optional(),
  /** Extracted text from an uploaded PDF/DOCX/screenshot the user attached. */
  attachments: z
    .array(
      z.object({
        name: z.string().max(200),
        kind: z.enum(['pdf', 'docx', 'text', 'image']),
        text: z.string().max(20000).default(''),
        chars: z.number().min(0).max(200000).default(0),
      }),
    )
    .max(5)
    .default([]),
  voiceTranscript: z.string().max(8000).optional(),
})

export const updateSituationSchema = z.object({ situation: situationSchema })

export const runSimulationSchema = z.object({
  /** Optional user guidance: "prefer finishing the report first". */
  steer: z.string().trim().max(500).optional(),
  optionCount: z.number().min(2).max(4).default(3),
})

export const whatIfSchema = z.object({
  optionId: z.string().min(1).max(64).default('recommended'),
  overrides: z.object({
    hoursPerDay: z.number().min(0.25).max(16).optional(),
    activeDaysPerWeek: z.number().min(1).max(7).optional(),
    availableHoursPerDay: z.number().min(0.25).max(16).optional(),
    deadline: isoDate.nullable().optional(),
    complexity: z.number().min(0).max(1).optional(),
    resourceLevel: resourceAvailabilitySchema.optional(),
    focusDeliverableId: z.string().max(64).optional(),
  }),
})

export const outcomeSchema = z.object({
  optionId: z.string().max(64).nullable().default(null),
  completed: z.enum(['yes', 'partly', 'no']),
  actualCompletionDate: isoDate.nullable().default(null),
  actualHours: z.number().min(0).max(2000).nullable().default(null),
  actualStress: z.number().min(0).max(100).nullable().default(null),
  whatWentWrong: z.string().trim().max(2000).default(''),
  whatWentBetter: z.string().trim().max(2000).default(''),
  notes: z.string().trim().max(2000).default(''),
})

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Tell us what to call you.').max(80),
  useCase: useCaseSchema,
  decisionStyle: decisionStyleSchema,
})

export const chooseOptionSchema = z.object({ optionId: z.string().min(1).max(64) })

/* ── LLM agent contracts ───────────────────────────────────────────────────── */

const aiDeliverable = z.object({
  name: shortText,
  complexity: z.number().min(0).max(1),
  /** Names of the deliverables this one waits on, as written in this same array. */
  dependsOn: z.array(z.string().max(120)).max(8).default([]),
  estimatedHours: z.number().min(0).max(600).optional(),
})

export const situationAgentOutputSchema = z.object({
  goal: shortText,
  summary: mediumText.default(''),
  deadline: isoDate.nullable().default(null),
  deadlineSource: z.enum(['explicit', 'inferred', 'unknown']).default('unknown'),
  availableHoursPerDay: z.number().min(0.25).max(16),
  activeDaysPerWeek: z.number().min(1).max(7).default(7),
  constraints: z.array(mediumText).max(8).default([]),
  resources: z
    .array(z.object({ name: shortText, availability: resourceAvailabilitySchema, note: mediumText.optional() }))
    .max(8)
    .default([]),
  deliverables: z.array(aiDeliverable).min(1).max(8),
  risks: z.array(z.object({ label: shortText, severity: severitySchema, rationale: mediumText.default('') })).max(8).default([]),
  priorities: z.array(shortText).max(6).default([]),
  complexity: z.number().min(0).max(1),
  fragmentation: z.number().min(0).max(1).default(0.3),
  openQuestions: z.array(mediumText).max(5).default([]),
  extractionConfidence: z.number().min(0).max(1).default(0.7),
})

export const aiAllocation = z.object({
  /** Must match a deliverable name from the situation model. */
  deliverable: z.string().max(120),
  hoursPerDay: z.number().min(0).max(16),
})

export const planAgentOutputSchema = z.object({
  options: z
    .array(
      z.object({
        code: z.string().max(2),
        name: z.string().trim().min(2).max(60),
        strategy: z.string().trim().min(10).max(280),
        allocations: z.array(aiAllocation).min(1).max(8),
        bufferDays: z.number().min(0).max(14).default(0),
        assumptions: z.array(z.string().max(240)).min(1).max(5),
        tradeoffs: z.array(z.string().max(240)).max(5).default([]),
        aiSuccessEstimate: z.number().min(0).max(1),
        aiRationale: z.string().trim().min(5).max(300),
      }),
    )
    .min(2)
    .max(4),
})

export const critiqueAgentOutputSchema = z.object({
  critiques: z.array(z.object({ target: z.string().max(120), challenge: z.string().min(5).max(300), severity: severitySchema })).max(6),
})

export const recommendationAgentOutputSchema = z.object({
  headline: z.string().min(5).max(160),
  reasons: z.array(z.string().min(5).max(240)).min(2).max(5),
  whyNot: z.array(z.object({ option: z.string().max(60), reason: z.string().min(5).max(240) })).max(4).default([]),
})

export const reflectionAgentOutputSchema = z.object({
  causes: z
    .array(
      z.object({
        label: z.string().min(3).max(120),
        detail: z.string().min(5).max(400),
        kind: z.enum(['overestimate', 'underestimate', 'external']),
      }),
    )
    .min(1)
    .max(4),
  narrative: z.string().min(10).max(700),
})

export const whatIfExplanationSchema = z.object({ explanation: z.string().min(5).max(400) })

export type SituationAgentOutput = z.infer<typeof situationAgentOutputSchema>
export type PlanAgentOutput = z.infer<typeof planAgentOutputSchema>
export type CritiqueAgentOutput = z.infer<typeof critiqueAgentOutputSchema>
export type RecommendationAgentOutput = z.infer<typeof recommendationAgentOutputSchema>
export type ReflectionAgentOutput = z.infer<typeof reflectionAgentOutputSchema>
export type CreateSimulationInput = z.infer<typeof createSimulationSchema>
export type OutcomeInput = z.infer<typeof outcomeSchema>
