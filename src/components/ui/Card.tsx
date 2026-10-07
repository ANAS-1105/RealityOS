import type { ReactNode } from 'react'

/**
 * Card surfaces. `interactive` adds a pointer-reactive sheen (driven by the
 * global cursor's `--cursor-x/--cursor-y` custom properties) and a lift on hover;
 * it is skipped under reduced motion because the transition is disabled globally.
 */
export function Card({
  children,
  className = '',
  interactive = false,
  glow = false,
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
  glow?: boolean
  as?: 'div' | 'section' | 'article' | 'li'
} & Record<string, unknown>) {
  return (
    <Tag
      {...(glow ? { 'data-cursor-glow': 'true' } : {})}
      className={`surface relative rounded-2xl transition-[transform,border-color,box-shadow] duration-300 ${
        interactive ? 'hover:-translate-y-0.5 hover:border-ink-500/70 hover:shadow-lift' : ''
      } ${className}`}
      {...rest}
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(320px circle at var(--cursor-x, 50%) var(--cursor-y, 50%), rgba(109,139,255,0.09), transparent 62%)',
          }}
        />
      )}
      {children}
    </Tag>
  )
}

export function CardHeader({ children, className = '', action }: { children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div className={`flex items-start justify-between gap-4 px-5 pt-5 ${className}`}>
      <div className="min-w-0">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardTitle({ children, sub, className = '' }: { children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-[0.95rem] font-semibold tracking-tight text-mist-50">{children}</h3>
      {sub ? <p className="mt-1 text-[0.8rem] leading-relaxed text-mist-400">{sub}</p> : null}
    </div>
  )
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pb-5 pt-3 ${className}`}>{children}</div>
}

/** Section wrapper with a heading, used across the authenticated pages. */
export function Section({
  title,
  sub,
  action,
  children,
  className = '',
}: {
  title: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`${className}`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-mist-500">{title}</h2>
          {sub ? <p className="mt-1.5 max-w-2xl text-sm text-mist-400">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
