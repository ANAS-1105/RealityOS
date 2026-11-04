import type { FreebuffUser } from '@freebuff/auth'

export interface Env {
  /** Static assets binding (Sites injects it; run_worker_first routes through us). */
  ASSETS: { fetch(request: Request): Promise<Response> }
  DB: D1Database
  FREEBUFF_CLIENT_ID: string
  FREEBUFF_ISSUER?: string
  /** Canonical origin of the deployed site. Never derived from the request Host. */
  APP_ORIGIN: string
  /**
   * Live site origin, used only while developing behind a shared preview
   * hostname: sign-in is handed to that origin because a loopback callback can
   * never be reached or registered for a browser that is not on this machine.
   * Unset in deployment, where APP_ORIGIN is already the canonical origin.
   */
  PUBLIC_ORIGIN?: string
  /**
   * Local frontend dev origin (e.g. the Vite server on http://localhost:3000).
   * Set only in the local-development config so `npm run dev` + `npm run
   * dev:worker` can send state-changing requests through the Vite proxy, whose
   * Origin does not match APP_ORIGIN. Never set in deployment.
   */
  DEV_ORIGIN?: string
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
