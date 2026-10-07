import type { ReactNode } from 'react'
import type { EngineInfo, RiskLevel, SimulationStatus } from '@/shared/types'
import { statusLabel } from '@/lib/format'

const TONES = {
  neutral: 'bg-ink-800/80 text-mist-300 border-ink-600/70',
  accent: 'bg-accent-500/12 text-accent-300 border-accent-400/35',
  low: 'bg-signal-low/12 text-signal-low border-signal-low/35',
  medium: 'bg-signal-medium/12 text-signal-medium border-signal-medium/35',
  high: 'bg-signal-high/12 text-signal-high border-signal-high/35',
  violet: 'bg-violet-500/12 text-violet-400 border-violet-500/35',
} as const

export type Tone = keyof typeof TONES

export function Badge({ children, tone = 'neutral', className = '', title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium tracking-wide ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function RiskBadge({ level, className = '' }: { level: RiskLevel | null | undefined; className?: string }) {
  if (!level) return <Badge className={className}>Risk unknown</Badge>
  const label = level === 'low' ? 'Low risk' : level === 'medium' ? 'Medium risk' : 'High risk'
  return (
    <Badge tone={level} className={className}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${level === 'high' ? 'animate-pulse-soft' : ''}`} />
      {label}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: SimulationStatus }) {
  const tone: Tone = status === 'completed' ? 'low' : status === 'decided' ? 'accent' : status === 'simulated' ? 'violet' : 'neutral'
  return <Badge tone={tone}>{statusLabel(status)}</Badge>
}

/**
 * Which engine produced a result. Always visible, never decorative: the product
 * is explicit about whether an LLM was involved and that probabilities come from
 * the local model either way.
 */
export function EngineBadge({ engine, className = '' }: { engine: EngineInfo | null | undefined; className?: string }) {
  if (!engine) return null
  const isAi = engine.mode === 'ai'
  return (
    <Badge tone={isAi ? 'violet' : 'neutral'} className={className} title={engine.note}>
      <span className={`h-1.5 w-1.5 rounded-full ${isAi ? 'bg-violet-400' : 'bg-mist-400'}`} />
      {isAi ? `AI agents · ${engine.model}` : 'Local reasoning core'}
    </Badge>
  )
}
