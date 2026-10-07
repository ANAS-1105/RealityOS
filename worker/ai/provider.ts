/**
 * LLM provider abstraction.
 *
 * RealityOS is deliberately not coupled to one vendor: any OpenAI-compatible
 * chat-completions endpoint works, and when no key is configured the platform
 * runs its deterministic local reasoning core instead (identical workflow, no
 * narrative layer). The key never leaves the Worker.
 *
 *   LLM provider → AiService (this file) → Agent orchestrator → application logic
 *
 * Model output is always parsed through a zod schema and, for numbers, treated as
 * a *hint*: the deterministic engine recomputes every quantity that gets stored.
 */
import type { ZodType } from 'zod'
import type { EngineInfo } from '../../src/shared/types.ts'
import type { Env } from '../env.ts'

export class AiUnavailableError extends Error {
  constructor(message = 'No LLM provider is configured.') {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

export class AiResponseError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'AiResponseError'
    this.retryable = retryable
  }
}

export interface CompletionRequest<T> {
  /** Agent system prompt. */
  system: string
  /** Task prompt with the structured input. */
  user: string
  /** Schema that the returned JSON must satisfy. */
  schema: ZodType<T>
  /** JSON shape shown to the model. */
  shape: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

export interface AiProvider {
  readonly available: boolean
  readonly name: string
  readonly model: string
  completeJson<T>(request: CompletionRequest<T>): Promise<T>
}

class AiService implements AiProvider {
  readonly available = true
  readonly name: string
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(name: string, model: string, apiKey: string, baseUrl: string) {
    this.name = name
    this.model = model
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async completeJson<T>(request: CompletionRequest<T>): Promise<T> {
    const attempt = async (repair: string | null, callIndex: number): Promise<T> => {
      const messages = [
        { role: 'system' as const, content: request.system },
        { role: 'user' as const, content: request.user },
      ]
      if (repair) messages.push({ role: 'user' as const, content: repair })

      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxTokens ?? 1400,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 22_000),
      })

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500
        throw new AiResponseError(`Provider responded ${response.status}`, retryable && callIndex === 0)
      }

      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] }
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new AiResponseError('Provider returned an empty message.')

      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new AiResponseError('Provider returned malformed JSON.')
      }
      const validated = request.schema.safeParse(parsed)
      if (!validated.success) {
        const issues = validated.error.issues.slice(0, 6).map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
        throw new AiResponseError(`Schema validation failed (${issues})`)
      }
      return validated.data
    }

    try {
      return await attempt(null, 0)
    } catch (error) {
      if (!(error instanceof AiResponseError) || !error.retryable) throw error
      // One repair/retry: either the transport wobbled or the JSON did not fit
      // the schema. Nothing downstream ever sees an unvalidated payload.
      const repair =
        error.message.startsWith('Schema validation failed') || error.message.includes('malformed')
          ? `Your previous reply was rejected: ${error.message}. Reply again with ONLY a JSON object matching this shape:\n${request.shape}`
          : null
      return attempt(repair, 1)
    }
  }
}

class NoProvider implements AiProvider {
  readonly available = false
  readonly name = 'local'
  readonly model = 'deterministic-core'

  async completeJson<T>(): Promise<T> {
    throw new AiUnavailableError()
  }
}

export function createAiProvider(env: Env): AiProvider {
  const mode = (env.AI_PROVIDER ?? 'auto').toLowerCase()
  if (mode === 'none' || !env.AI_API_KEY) return new NoProvider()
  const baseUrl = env.AI_BASE_URL ?? 'https://api.openai.com/v1'
  const model = env.AI_MODEL ?? 'gpt-4o-mini'
  const host = (() => {
    try {
      return new URL(baseUrl).host
    } catch {
      return 'custom endpoint'
    }
  })()
  return new AiService(host, model, env.AI_API_KEY, baseUrl)
}

/**
 * Describes the engine that *actually produced this step's result*.
 *
 * `usedAi` is passed by the orchestrator per request, so a configured-but-failing
 * provider never gets reported to the user as "AI mode". Every stored run records
 * which of the two executed.
 */
export function engineInfoFor(provider: AiProvider, startedAt: number, usedAi: boolean, fallbackReason?: string): EngineInfo {
  if (provider.available && usedAi) {
    return {
      mode: 'ai',
      provider: provider.name,
      model: provider.model,
      note: `Agent pipeline running on ${provider.model} (${provider.name}). Every probability is still computed by the local ML model, not by the language model.`,
      latencyMs: Date.now() - startedAt,
    }
  }
  return {
    mode: 'local',
    provider: 'local',
    model: 'deterministic-core',
    note: 'Local reasoning core: extraction, planning, risk analysis and reflection ran from the deterministic engine on this server. No text left RealityOS.',
    latencyMs: Date.now() - startedAt,
    fallbackReason:
      fallbackReason ??
      (provider.available
        ? 'The language model did not return a usable response for this step, so the deterministic core produced the result.'
        : 'No LLM provider configured (AI_API_KEY unset).'),
  }
}
