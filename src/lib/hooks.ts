import { useCallback, useEffect, useRef, useState } from 'react'

/** Mirrors a media query (used for pointer capability and reduced motion). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    const list = window.matchMedia(query)
    const handler = () => setMatches(list.matches)
    handler()
    list.addEventListener('change', handler)
    return () => list.removeEventListener('change', handler)
  }, [query])
  return matches
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** Coarse pointers (touch) get simpler cursor and hover behaviour. */
export function useHasPointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)')
}

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
  setData: (value: T | null) => void
}

/**
 * Minimal data hook: enough for this app (no cache layer needed) and it always
 * surfaces a `reload` so every error state can offer a retry action.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = [], options: { enabled?: boolean } = {}): AsyncState<T> {
  const enabled = options.enabled ?? true
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    loaderRef
      .current()
      .then((value) => {
        if (!cancelled) setData(value)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error('Something went wrong.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  return { data, error, loading, reload, setData }
}

/** Trailing debounce for the What-If sliders. */
export function useDebounced<T>(value: T, delay = 320): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Locks body scroll while a modal or mobile menu is open. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [active])
}

export function useCountUp(target: number, duration = 650): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    if (reduced) {
      setValue(target)
      return
    }
    const from = fromRef.current
    const delta = target - from
    if (Math.abs(delta) < 0.01) {
      setValue(target)
      return
    }
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      // easeOutCubic — matches the CSS easing used elsewhere
      const eased = 1 - (1 - progress) ** 3
      setValue(from + delta * eased)
      if (progress < 1) frame = requestAnimationFrame(step)
      else fromRef.current = target
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, reduced])

  return value
}
