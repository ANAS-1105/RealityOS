import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFreebuffUser } from '@freebuff/auth/react'
import { api, type AuthProvider, type MeResponse } from './api'

/**
 * Session context.
 *
 * Two sign-in doors share one identity:
 *   · Sign in with Freebuff (OIDC) — `useFreebuffUser` reports it
 *   · An email + password account — the Worker's HTTP-only session cookie
 *
 * `/api/me` is the source of truth for both, so it is always loaded; the OIDC
 * user only matters for the sign-out hand-off and for the moment before `/api/me`
 * answers.
 */
interface SessionValue {
  signedIn: boolean
  loading: boolean
  user: MeResponse['user'] | null
  provider: AuthProvider | null
  hasPassword: boolean
  profile: MeResponse['profile'] | null
  learning: MeResponse['learning'] | null
  engine: MeResponse['engine'] | null
  counts: MeResponse['counts']
  onboarded: boolean
  refresh: () => Promise<void>
  /** Clears the local session and, for provider accounts, the provider session too. */
  signOut: () => Promise<void>
  /** UI theme the user chose (or their OS preference as a fallback). */
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  effectiveTheme: 'light' | 'dark'
}

const SessionContext = createContext<SessionValue | null>(null)

const THEME_KEY = 'realityos.theme'

function readStoredTheme(): 'light' | 'dark' | 'system' {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* ignore storage errors */
  }
  return 'light'
}

function systemPrefersLight(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

function effectiveTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  // Light is the product default: a clean, white, spacious interface. Dark stays
  // available from the toggle in the header.
  return theme === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : theme
}

/** Ends a Freebuff (OIDC) session the same way `SignOutButton` does. */
function submitProviderSignOut(returnTo: string): void {
  const form = document.createElement('form')
  form.method = 'post'
  form.action = '/auth/freebuff/signout'
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = 'returnTo'
  input.value = returnTo
  form.appendChild(input)
  document.body.appendChild(form)
  form.submit()
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user: authUser, isLoading: authLoading, refresh: refreshAuth } = useFreebuffUser()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(readStoredTheme)
  const [effective, setEffective] = useState<'light' | 'dark'>(effectiveTheme(theme))

  // Keep the document root in sync whenever the chosen theme or system pref changes.
  useEffect(() => {
    const next = effectiveTheme(theme)
    setEffective(next)
    const root = document.documentElement
    if (next === 'light') {
      root.classList.add('light')
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
      root.classList.remove('light')
    }
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
    return () => {
      root.classList.remove('light')
      root.classList.remove('dark')
    }
  }, [theme])

  // Re-derive effective theme if the OS switches while the user is in system mode.
  useEffect(() => {
    if (theme !== 'system') return
    const list = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => setEffective(effectiveTheme('system'))
    handler()
    list.addEventListener('change', handler)
    return () => list.removeEventListener('change', handler)
  }, [theme])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setMe(await api.me())
    } catch {
      // 401 simply means "no session"; a transient failure keeps the UI usable
      // because the server still authorises every protected call.
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    // Always ask: an email/password session has no OIDC user but is still valid.
    void load()
  }, [authLoading, authUser, load])

  const signOut = useCallback(async () => {
    try {
      await api.account.signOut()
    } catch {
      /* the cookie may already be gone — nothing left to clear */
    }
    setMe(null)
    if (authUser) {
      // Provider accounts also have a session with Freebuff itself.
      submitProviderSignOut('/signout')
    }
  }, [authUser])

  const value = useMemo<SessionValue>(
    () => ({
      signedIn: Boolean(me?.user) || Boolean(authUser),
      loading: authLoading || loading,
      user: me?.user ?? (authUser ? { sub: authUser.sub, name: authUser.name ?? null, email: authUser.email ?? null, picture: authUser.picture ?? null } : null),
      provider: me?.provider ?? (authUser ? 'freebuff' : null),
      hasPassword: me?.hasPassword ?? false,
      profile: me?.profile ?? null,
      learning: me?.learning ?? null,
      engine: me?.engine ?? null,
      counts: me?.counts ?? { total: 0, outcomes: 0 },
      onboarded: Boolean(me?.profile?.onboardedAt),
      refresh: async () => {
        await refreshAuth()
        await load()
      },
      signOut,
      theme,
      setTheme: (next) => setTheme(next),
      effectiveTheme: effective,
    }),
    [authUser, authLoading, me, loading, refreshAuth, load, signOut, theme, effective],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}

export const SIGN_IN_PATH = '/login'
