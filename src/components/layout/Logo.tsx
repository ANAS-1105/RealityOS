import { Link } from 'react-router-dom'

/** RealityOS mark: a decision path crossing a probability field. */
export function Logo({ compact = false, to = '/' }: { compact?: boolean; to?: string }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5" aria-label="RealityOS home">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] border border-ink-600/70 bg-ink-900/80">
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
          <defs>
            <linearGradient id="realityos-mark" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#4A6BFF" />
              <stop offset="1" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#realityos-mark)" strokeWidth="1.4" opacity="0.55" />
          <path d="M9.5 21l4.4-5.9 3.2 3.3L22.6 11" fill="none" stroke="url(#realityos-mark)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="22.6" cy="11" r="2.3" fill="url(#realityos-mark)" />
        </svg>
      </span>
      {compact ? null : (
        <span className="text-[0.95rem] font-semibold tracking-tight text-mist-50">
          Reality<span className="text-accent-300">OS</span>
        </span>
      )}
    </Link>
  )
}
