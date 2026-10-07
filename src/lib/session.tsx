import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFreebuffUser } from '@freebuff/auth/react'
import { api, type MeResponse } from './api'

/**
 * Session context: the Freebuff session (for display) plus the RealityOS profile,
 * learning state and active engine from `/api/me`. The server is always the
 * authority on access — this context only drives what we render.
 */
interface SessionValue {
  signedIn: boolean
  loading: boolean
  user: MeResponse['user'] | null
  profile: MeResponse['profile'] | null
  learning: MeResponse['learning'] | null
  engine: MeResponse['engine'] | null
  counts: MeResponse['counts']
  onboarded: boolean
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user: authUser, isLoading: authLoading, refresh: refreshAuth } = useFreebuffUser()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const value = await api.me()
      setMe(value)
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!authUser) {
      setMe(null)
      setLoading(false)
      return
    }
    void load()
  }, [authLoading, authUser, load])

  const value = useMemo<SessionValue>(
    () => ({
      signedIn: Boolean(authUser),
      loading: authLoading || (Boolean(authUser) && loading),
      user: me?.user ?? (authUser ? { sub: authUser.sub, name: authUser.name ?? null, email: authUser.email ?? null, picture: authUser.picture ?? null } : null),
      profile: me?.profile ?? null,
      learning: me?.learning ?? null,
      engine: me?.engine ?? null,
      counts: me?.counts ?? { total: 0, outcomes: 0 },
      onboarded: Boolean(me?.profile?.onboardedAt),
      refresh: async () => {
        await refreshAuth()
        await load()
      },
    }),
    [authUser, authLoading, me, loading, refreshAuth, load],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}

/** Pages that require a signed-in user render this instead of redirecting. */
export const SIGN_IN_PATH = '/login'
