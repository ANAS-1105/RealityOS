import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-mist-500">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-[1.6rem] leading-tight sm:text-[1.9rem]">{title}</h1>
        {description ? <p className="mt-2 text-[0.9rem] text-mist-400">{description}</p> : null}
      </div>
      {actions ? <div className="mt-2 sm:mt-0">{actions}</div> : null}
    </div>
  )
}
