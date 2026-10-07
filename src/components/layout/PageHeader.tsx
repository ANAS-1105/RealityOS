import type { ReactNode } from 'react'

/** One clear heading + one clear action per screen. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-[0.72rem] uppercase tracking-[0.16em] text-mist-500">{eyebrow}</p> : null}
        <h1 className="text-[1.6rem] leading-tight sm:text-[1.9rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-mist-400">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
