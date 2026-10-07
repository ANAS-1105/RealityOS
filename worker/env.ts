import type { FreebuffUser } from '@freebuff/auth'

export interface Env {
  /** Static assets binding (Sites injects it; run_worker_first routes through us). */
  ASSETS: { fetch(request: Request): Promise<Response> }
  DB: D1Database
  FREEBUFF_CLIENT_ID: string
  FREEBUFF_ISSUER?: string
  /** Canonical origin of the deployed site. Never derived from the request Host. */
  APP_ORIGIN: string
  /** auto | openai | none — see worker/ai/provider.ts */
  AI_PROVIDER?: string
  /** Server-side only. Set through Sites → Secrets; never shipped to the browser. */
  AI_API_KEY?: string
  AI_BASE_URL?: string
  AI_MODEL?: string
  AI_VISION_MODEL?: string
}

export interface Vars {
  requestId: string
  user: FreebuffUser | null
  startedAt: number
}
