import { useState } from 'react'
import { Timeline } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Slider } from '@/components/ui/Form'
import { MetricValue } from '@/components/ui/Metric'

interface LiveWhatIfProps {
  base: {
    hoursPerDay: number
    success: number
    risk: number
    pressure: number
  }
  project: (hoursPerDay: number) => {
    success: number
    risk: number
    pressure: number
    coverage: number
    explanation: string
  }
}

export function LiveWhatIf({ base, project }: LiveWhatIfProps) {
  // The slider is the demo: keep the chosen hours in state and render whatever
  // the engine returns for them, instead of showing a fixed base value.
  const [hours, setHours] = useState(base.hoursPerDay)
  const [moved, setMoved] = useState(false)
  const view = project(hours)

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[1.05rem] font-semibold text-mist-50">Try the What-If engine</h3>
          <p className="mt-1 text-[0.82rem] text-mist-400">Move focused hours per day and watch the same option recompute.</p>
        </div>
        <Badge tone="violet">Runs in your browser</Badge>
      </div>

      <div className="mt-5 space-y-5">
        <Slider
          label="Focused hours per day"
          value={hours}
          min={0.5}
          max={12}
          step={0.5}
          onChange={(value) => {
            setHours(value)
            setMoved(true)
          }}
          format={(value) => `${value}h`}
          minLabel="0.5h"
          maxLabel="12h"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">Completion</p>
            <p className="mt-2 text-3xl font-semibold num text-mist-50">
              <MetricValue value={view.success} />
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
              <div className="h-full rounded-full bg-accent-500 transition-[width] duration-500" style={{ width: `${view.success}%` }} />
            </div>
            <p className="mt-1.5 text-[0.66rem] text-mist-500">higher is better</p>
          </div>

          <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">Deadline risk</p>
              <Badge tone={view.risk > 55 ? 'high' : view.risk > 28 ? 'medium' : 'low'}>{view.risk}%</Badge>
            </div>
            <p className="mt-2 text-3xl font-semibold num text-mist-50">{view.risk}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
              <div className="h-full rounded-full bg-signal-high transition-[width] duration-500" style={{ width: `${view.risk}%` }} />
            </div>
            <p className="mt-1.5 text-[0.66rem] text-mist-500">lower is better</p>
          </div>

          <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">Pressure</p>
              <span className="num text-mist-50">{view.pressure}/100</span>
            </div>
            <p className="mt-2 text-3xl font-semibold num text-mist-50">{view.pressure}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
              <div className="h-full rounded-full bg-violet-500 transition-[width] duration-500" style={{ width: `${view.pressure}%` }} />
            </div>
            <p className="mt-1.5 text-[0.66rem] text-mist-500">lower is better</p>
          </div>
        </div>

        <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
          <p className="flex items-center gap-2 text-[0.72rem] text-mist-500">
            <Timeline aria-hidden className="h-3.5 w-3.5" />
            <span className="uppercase tracking-[0.1em]">What changed</span>
          </p>
          <p className="mt-2 text-[0.82rem] leading-relaxed text-mist-300">
            {moved ? view.explanation : 'Move the slider and this line updates with the trained model’s explanation.'}
          </p>
        </div>
      </div>
    </Card>
  )
}
