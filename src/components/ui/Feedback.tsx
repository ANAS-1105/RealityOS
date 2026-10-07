import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, Check, CircleDot, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import type { StageEvent } from '@/shared/types'
import { Button } from './Button'

/** Generic spinner block for short waits. */
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm text-mist-400">
      <Loader2 aria-hidden className="h-4 w-4 animate-spin text-accent-400" />
      {label}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`relative overflow-hidden rounded-lg bg-ink-800/60 ${className}`} aria-hidden />
}

/**
 * Staged progress for the agent pipelines. Real server-sent events drive it: a
 * stage appears when its agent starts and completes when the agent returns, so
 * the list reflects actual work rather than a timer.
 */
export function StageList({ stages, className = '' }: { stages: StageEvent[]; className?: string }) {
  return (
    <ol className={`space-y-2.5 ${className}`} aria-live="polite">
      {stages.map((stage, index) => (
        <motion.li
          key={`${stage.stage}-${index}`}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: index * 0.02 }}
          className="flex items-start gap-3 text-sm"
        >
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-ink-600/70 bg-ink-800/70">
            {stage.state === 'done' ? (
              <Check aria-hidden className="h-3 w-3 text-signal-low" />
            ) : stage.state === 'error' ? (
              <AlertTriangle aria-hidden className="h-3 w-3 text-signal-high" />
            ) : stage.state === 'active' ? (
              <CircleDot aria-hidden className="h-3 w-3 animate-pulse-soft text-accent-300" />
            ) : (
              <CircleDot aria-hidden className="h-3 w-3 text-mist-500" />
            )}
          </span>
          <span className="min-w-0">
            <span className={stage.state === 'done' ? 'text-mist-300' : 'text-mist-100'}>{stage.label}</span>
            {stage.detail ? <span className="ml-2 text-[0.78rem] text-mist-500">{stage.detail}</span> : null}
          </span>
        </motion.li>
      ))}
    </ol>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="surface flex flex-col items-center rounded-2xl px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-ink-600/70 bg-ink-800/60 text-accent-300">
        {icon ?? <Sparkles aria-hidden className="h-5 w-5" />}
      </div>
      <h3 className="text-base font-semibold text-mist-50">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-mist-400">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

/** Every failure surfaces the friendly message plus a retry path. */
export function ErrorState({ message, onRetry, retryable = true }: { message: string; onRetry?: () => void; retryable?: boolean }) {
  return (
    <div role="alert" className="rounded-2xl border border-signal-high/30 bg-signal-high/8 px-5 py-5">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-high" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-mist-100">{message}</p>
          {retryable ? <p className="mt-1 text-[0.8rem] text-mist-400">You can try again — nothing was lost.</p> : null}
        </div>
        {onRetry ? (
          <Button size="sm" variant="secondary" icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />} onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function InlineNote({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'accent' }) {
  const styles =
    tone === 'warning'
      ? 'border-signal-medium/30 bg-signal-medium/8 text-mist-200'
      : tone === 'accent'
        ? 'border-accent-400/30 bg-accent-500/8 text-mist-200'
        : 'border-ink-700/70 bg-ink-900/50 text-mist-300'
  return <div className={`rounded-xl border px-4 py-3 text-[0.82rem] leading-relaxed ${styles}`}>{children}</div>
}
