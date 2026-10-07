import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useCountUp } from '@/lib/hooks'

/**
 * Numbers that animate to their new value. Used for everything the simulation
 * moves (probabilities, pressure, buffers) so a What-If change reads as a change
 * rather than a re-render.
 */
export function MetricValue({
  value,
  suffix = '%',
  digits = 0,
  className = '',
  muted = false,
}: {
  value: number | null
  suffix?: string
  digits?: number
  className?: string
  muted?: boolean
}) {
  const animated = useCountUp(value ?? 0)
  if (value === null) return <span className={`num text-mist-500 ${className}`}>—</span>
  return (
    <span className={`num tabular-nums ${muted ? 'text-mist-400' : 'text-mist-50'} ${className}`}>
      {animated.toFixed(digits)}
      <span className="text-[0.7em] text-mist-500">{suffix}</span>
    </span>
  )
}

export function DeltaChip({ change, label, suffix = '' }: { change: number; label?: string; suffix?: string }) {
  const direction = Math.abs(change) < 0.05 ? 'same' : change > 0 ? 'up' : 'down'
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight
  const tone =
    direction === 'same'
      ? 'border-ink-600/70 bg-ink-800/70 text-mist-300'
      : direction === 'up'
        ? 'border-signal-low/35 bg-signal-low/10 text-signal-low'
        : 'border-signal-high/35 bg-signal-high/10 text-signal-high'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.72rem] num ${tone}`}>
      <Icon aria-hidden className="h-3 w-3" />
      {change > 0 ? '+' : ''}
      {change.toFixed(1)}
      {suffix}
      {label ? <span className="font-sans font-normal opacity-80">{label}</span> : null}
    </span>
  )
}

export function ProgressBar({
  value,
  tone = 'accent',
  height = 'h-1.5',
  label,
}: {
  value: number
  tone?: 'accent' | 'low' | 'medium' | 'high' | 'violet'
  height?: string
  label?: string
}) {
  const colors = {
    accent: 'bg-accent-500',
    violet: 'bg-violet-500',
    low: 'bg-signal-low',
    medium: 'bg-signal-medium',
    high: 'bg-signal-high',
  }
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-ink-700/70 ${height}`}
    >
      <motion.div
        className={`h-full rounded-full ${colors[tone]}`}
        initial={false}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/** Risk is always shown with its value, never as a bare colour. */
export function RiskIndicator({ level, deadlineRisk, stressIndex }: { level: 'low' | 'medium' | 'high'; deadlineRisk: number; stressIndex: number }) {
  const tone = level === 'low' ? 'low' : level === 'medium' ? 'medium' : 'high'
  const text = level === 'low' ? 'Low' : level === 'medium' ? 'Moderate' : 'High'
  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-2 w-2 rounded-full bg-signal-${tone} ${level === 'high' ? 'animate-pulse-soft' : ''}`} aria-hidden />
      <span className="text-[0.82rem] text-mist-200">{text} risk</span>
      <span className="num text-[0.76rem] text-mist-500">
        {Math.round(deadlineRisk * 100)}% miss · {Math.round(stressIndex)}/100 pressure
      </span>
    </div>
  )
}

export function ScoreBar({ label, value, weight, tone = 'accent' }: { label: string; value: number; weight?: number; tone?: 'accent' | 'violet' }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-[0.78rem]">
        <span className="text-mist-300">
          {label}
          {weight !== undefined ? <span className="ml-1.5 text-mist-500">×{weight.toFixed(2)}</span> : null}
        </span>
        <span className="num text-mist-200">{Math.round(value * 100)}%</span>
      </div>
      <ProgressBar value={value * 100} tone={tone} height="h-1" label={label} />
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  children,
}: {
  label: string
  value?: string
  sub?: string
  tone?: 'default' | 'accent' | 'warning' | 'positive'
  children?: ReactNode
}) {
  return (
    <div className="surface rounded-xl px-4 py-3.5">
      <p className="text-[0.72rem] uppercase tracking-[0.12em] text-mist-500">{label}</p>
      {value ? (
        <p
          className={`mt-1.5 text-xl font-semibold num ${
            tone === 'accent' ? 'text-accent-300' : tone === 'warning' ? 'text-signal-medium' : tone === 'positive' ? 'text-signal-low' : 'text-mist-50'
          }`}
        >
          {value}
        </p>
      ) : (
        <div className="mt-1.5">{children}</div>
      )}
      {sub ? <p className="mt-1 text-[0.75rem] text-mist-500">{sub}</p> : null}
    </div>
  )
}
