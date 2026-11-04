import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight, Sparkles } from 'lucide-react'
import type { SimulationSummary } from '@/shared/types'
import { Badge, RiskBadge, StatusBadge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/Metric'
import { formatDate, relativeDays } from '@/lib/format'

export function SimulationCard({ simulation, onDelete }: { simulation: SimulationSummary; onDelete?: (id: string) => void }) {
  const success = simulation.topSuccessProbability
  const tone = simulation.riskLevel === 'high' ? 'high' : simulation.riskLevel === 'medium' ? 'medium' : 'low'

  return (
    <li className="surface group relative overflow-hidden rounded-xl transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-ink-500/70">
      <Link to={`/app/simulations/${simulation.id}`} className="block px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[0.92rem] font-medium text-mist-50">{simulation.title}</h3>
              {simulation.isDemo ? (
                <Badge tone="accent" title="Seeded example you can delete">
                  <Sparkles aria-hidden className="h-3 w-3" />
                  Demo
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.74rem] text-mist-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock aria-hidden className="h-3.5 w-3.5" />
                {simulation.deadline ? `${formatDate(simulation.deadline)} · ${relativeDays(simulation.deadline)}` : 'No deadline'}
              </span>
              {simulation.topOptionName ? <span>Recommended: {simulation.topOptionName}</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={simulation.status} />
            <RiskBadge level={simulation.riskLevel} />
            <ChevronRight aria-hidden className="h-4 w-4 text-mist-500 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="num w-14 shrink-0 text-sm text-mist-200">{success === null ? '—' : `${Math.round(success)}%`}</span>
          <ProgressBar value={success ?? 0} tone={tone} label="Completion probability" />
          {simulation.confidence !== null ? (
            <span className="num shrink-0 text-[0.7rem] text-mist-500">confidence {Math.round(simulation.confidence)}</span>
          ) : null}
        </div>
      </Link>

      {onDelete ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            onDelete(simulation.id)
          }}
          className="absolute right-2 top-2 hidden rounded-md px-2 py-1 text-[0.7rem] text-mist-500 opacity-0 transition-opacity hover:text-signal-high focus-visible:opacity-100 group-hover:opacity-100"
        >
          Delete
        </button>
      ) : null}
    </li>
  )
}
