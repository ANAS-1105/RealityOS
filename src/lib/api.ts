/**
 * The browser's only door to the backend: a small typed fetch client with
 * uniform error handling, SSE streaming for the agent pipelines and friendly,
 * retryable messages (raw backend errors never reach the UI).
 */
import type {
  ApiError,
  DecisionProfile,
  EngineInfo,
  OutcomeRecord,
  PredictionComparison,
  SimulationDetail,
  SimulationRun,
  SimulationSummary,
  StageEvent,
  StructuredSituation,
  WhatIfResult,
} from '@/shared/types'

export class RequestError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean
  readonly requestId: string

  constructor(status: number, code: string, message: string, retryable: boolean, requestId: string) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.requestId = requestId
  }
}

async function parseError(response: Response): Promise<RequestError> {
  try {
    const body = (await response.json()) as ApiError
    if (body?.error?.message) {
      return new RequestError(response.status, body.error.code, body.error.message, body.error.retryable, body.error.requestId)
    }
  } catch {
    /* fall through to the generic message */
  }
  const message =
    response.status === 401
      ? 'Please sign in to continue.'
      : response.status === 404
        ? 'We could not find that simulation.'
        : response.status === 429
          ? 'Too many requests just now. Give it a moment and try again.'
          : 'Something went wrong while running the simulation. Please try again.'
  return new RequestError(response.status, 'request_failed', message, response.status >= 500 || response.status === 429, 'unknown')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      credentials: 'same-origin',
    })
  } catch {
    throw new RequestError(0, 'network', 'We could not reach RealityOS. Check your connection and try again.', true, 'network')
  }
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/* ── Typed endpoints ───────────────────────────────────────────────────────── */

export interface AccountUser {
  sub: string
  name: string | null
  email: string | null
  picture: string | null
}

export type AuthProvider = 'local' | 'freebuff'

export interface MeResponse {
  user: AccountUser
  provider: AuthProvider
  hasPassword: boolean
  profile: { useCase: string | null; decisionStyle: string | null; onboardedAt: string | null; createdAt: string }
  learning: { reliability: number; calibration: { successBias: number; deadlineBias: number; sampleSize: number }; outcomeCount: number }
  counts: { total: number; outcomes: number }
  engine: EngineInfo
}

export interface CreateSimulationPayload {
  title?: string
  description: string
  goal?: string
  deadline?: string
  availableHoursPerDay?: number
  constraints?: string[]
  resources?: { name: string; availability: 'low' | 'medium' | 'high' }[]
  priority?: 'speed' | 'quality' | 'balance' | 'risk'
  attachments?: { name: string; kind: 'pdf' | 'docx' | 'text' | 'image'; text: string; chars: number }[]
  voiceTranscript?: string
}

export const api = {
  me: () => request<MeResponse>('/api/me'),
  account: {
    session: () => request<{ user: AccountUser | null; provider: AuthProvider | null }>('/api/accounts/session'),
    signUp: (body: { name: string; email: string; password: string }) =>
      request<{ user: AccountUser; provider: AuthProvider; recoveryCodes: string[] }>('/api/accounts/signup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    signIn: (body: { email: string; password: string }) =>
      request<{ user: AccountUser; provider: AuthProvider }>('/api/accounts/signin', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    signOut: () => request<{ ok: boolean }>('/api/accounts/signout', { method: 'POST', body: '{}' }),
    recover: (body: { email: string; code: string; password: string }) =>
      request<{ ok: boolean }>('/api/accounts/recover', { method: 'POST', body: JSON.stringify(body) }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<{ ok: boolean }>('/api/accounts/password', { method: 'POST', body: JSON.stringify(body) }),
    regenerateRecovery: (body: { password: string }) =>
      request<{ recoveryCodes: string[] }>('/api/accounts/recovery', { method: 'POST', body: JSON.stringify(body) }),
    updateProfile: (body: { name?: string; email?: string }) =>
      request<{ user: AccountUser; provider: AuthProvider }>('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  onboarding: (body: { name: string; useCase: string; decisionStyle: string }) =>
    request<{ ok: boolean; demoSimulationId: string | null }>('/api/onboarding', { method: 'POST', body: JSON.stringify(body) }),
  listSimulations: () => request<{ simulations: SimulationSummary[] }>('/api/simulations'),
  createSimulation: (body: CreateSimulationPayload) =>
    request<{ simulation: SimulationSummary }>('/api/simulations', { method: 'POST', body: JSON.stringify(body) }),
  getSimulation: (id: string) => request<{ simulation: SimulationDetail }>(`/api/simulations/${id}`),
  deleteSimulation: (id: string) => request<{ ok: boolean }>(`/api/simulations/${id}`, { method: 'DELETE' }),
  saveSituation: (id: string, situation: StructuredSituation) =>
    request<{ ok: boolean; situation: StructuredSituation }>(`/api/simulations/${id}/situation`, {
      method: 'PATCH',
      body: JSON.stringify({ situation }),
    }),
  chooseOption: (id: string, optionId: string) =>
    request<{ ok: boolean }>(`/api/simulations/${id}/choose`, { method: 'POST', body: JSON.stringify({ optionId }) }),
  whatIf: (id: string, body: { optionId: string; overrides: Record<string, unknown> }) =>
    request<{ result: WhatIfResult }>(`/api/simulations/${id}/what-if`, { method: 'POST', body: JSON.stringify(body) }),
  recordOutcome: (id: string, body: OutcomeRecord) =>
    request<{ comparison: PredictionComparison; profile: DecisionProfile }>(`/api/simulations/${id}/outcome`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  decisionProfile: () => request<{ profile: DecisionProfile }>('/api/profile/decision-pattern'),
  modelCard: () =>
    request<{
      model: {
        version: number
        trainedAt: string
        source: string
        sampleSize: number
        provenance: string
        algorithms: string
        features: { key: string; label: string }[]
        metrics: { success: { auc: number; accuracy: number; brier: number }; deadlineMiss: { auc: number; accuracy: number; brier: number }; stress: { r2: number; mae: number } }
      }
      engine: EngineInfo
    }>('/api/profile/model'),
  trainingExport: () =>
    request<{ generatedAt: string; modelVersion: number; count: number; rows: unknown[] }>('/api/profile/training-export'),
  seedDemo: () => request<{ demoSimulationId: string | null; simulations: SimulationSummary[] }>('/api/demo', { method: 'POST' }),
  deleteAccount: () => request<{ ok: boolean }>('/api/account/delete', { method: 'POST' }),
  health: () => request<{ ok: boolean; engine: string; model: number }>('/api/health'),
}

/* ── Streaming (SSE over fetch) ────────────────────────────────────────────── */

export interface StreamHandlers<T> {
  onStage?: (stage: StageEvent) => void
  onResult: (result: T) => void
  onError: (error: RequestError) => void
}

interface StreamBody {
  signal?: AbortSignal
}

/**
 * Reads a server-sent-event stream from a POST endpoint. Progress shown in the
 * UI is these events, not a timer, and a failure mid-stream arrives in-band as a
 * `failed` event.
 */
async function stream<T>(path: string, body: unknown, handlers: StreamHandlers<T>, options: StreamBody = {}): Promise<void> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal: options.signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') return
    handlers.onError(new RequestError(0, 'network', 'We could not reach RealityOS. Check your connection and try again.', true, 'network'))
    return
  }
  if (!response.ok || !response.body) {
    handlers.onError(await parseError(response))
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let settled = false

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const eventLine = chunk.split('\n').find((line) => line.startsWith('event: '))
        const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '))
        if (eventLine && dataLine) {
          const event = eventLine.slice(7).trim()
          const data = JSON.parse(dataLine.slice(6))
          if (event === 'stage') handlers.onStage?.(data as StageEvent)
          else if (event === 'result') {
            settled = true
            handlers.onResult(data as T)
          } else if (event === 'failed') {
            settled = true
            handlers.onError(new RequestError(500, 'pipeline_failed', data.message, true, data.requestId ?? 'unknown'))
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      handlers.onError(new RequestError(500, 'stream_failed', 'The simulation stream ended unexpectedly. Please try again.', true, 'stream'))
    }
    return
  }

  if (!settled) {
    handlers.onError(new RequestError(500, 'stream_empty', 'The simulation ended without a result. Please try again.', true, 'stream'))
  }
}

export const streams = {
  analyzeSimulation: (id: string, payload: CreateSimulationPayload, handlers: StreamHandlers<{ situation: StructuredSituation; engine: EngineInfo }>, options?: StreamBody) =>
    stream(`/api/simulations/${id}/analyze`, payload, handlers, options),
  runSimulation: (id: string, payload: { optionCount?: number; steer?: string }, handlers: StreamHandlers<{ run: SimulationRun }>, options?: StreamBody) =>
    stream(`/api/simulations/${id}/run`, payload, handlers, options),
}
