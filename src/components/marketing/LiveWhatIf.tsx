import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { MoveHorizontal } from 'lucide-react'
import { Slider } from '@/components/ui/Form'
import { DeltaChip, MetricValue, ProgressBar } from '@/components/ui/Metric'
import { Badge } from '@/components/ui/Badge'

/**
 * The landing page's What-If demonstration — and it is not a mock-up. It runs the
 * same deterministic engine and trained workload model the product uses, in the
 * browser, on the public demo scenario.
 */
export function LiveWhatIf({
  base,
  project,
}: {
  base: { hoursPerDay: number; success: number; risk: number; pressure: number }
  project: (hoursPerDay: number) => { success: number; risk: number; pressure: number; coverage: number; explanation: string }
}) {
  const [hours, setHours] = useState(base.hoursPerDay)
  const result = useMemo(() => project(hours), [hours, project])
  const changed = Math.abs(hours - base.hoursPerDay) > 0.01

  return (
    <div className="surface overflow-hidden rounded-2xl">
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="border-b border-ink-800/70 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <p className="text-[0.72rem] uppercase tracking-[0.16em] text-mist-500">Variables</p>
            <Badge tone={changed ? 'accent' : 'neutral'}>{changed ? 'modified' : 'baseline'}</Badge>
          </div>
          <div className="mt-5">
            <Slider
              label="Focused hours per day"
              value={hours}
              min={0.5}
              max={8}
              step={0.25}
              onChange={setHours}
              format={(value) => `${value.toFixed(2)} h`}
              minLabel="Light"
              maxLabel="Full push"
            />
          </div>
          <p className="mt-5 flex items-start gap-2 text-[0.78rem] leading-relaxed text-mist-500">
            <MoveHorizontal aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Everything on the right is recomputed in your browser by the same trained model that powers the app.
          </p>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Completion" value={result.success} delta={result.success - base.success} />
            <MetricCard label="Deadline risk" value={result.risk} delta={base.risk - result.risk} />
            <MetricCard label="Pressure" value={result.pressure} delta={base.pressure - result.pressure} />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-[0.78rem]">
              <span className="text-mist-400">Deliverable coverage</span>
              <span className="num text-mist-200">{result.coverage}%</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar value={result.coverage} tone={result.coverage >= 90 ? 'low' : result.coverage >= 70 ? 'medium' : 'high'} />
            </div>
          </div>
          <motion.p
            key={result.explanation}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 rounded-xl border border-accent-400/25 bg-accent-500/6 px-3.5 py-3 text-[0.8rem] leading-relaxed text-mist-200"
          >
            {result.explanation}
          </motion.p>
        </div>
      </div>
    </div>
  )
}

/** `delta` is always expressed so that positive = improvement. */
function MetricCard({ label, value, delta }: { label: string; value: number; delta: number }) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">{label}</p>
      <p className="mt-1 text-[1.05rem] font-semibold">
        <MetricValue value={value} />
      </p>
      <p className="mt-1">
        {Math.abs(delta) < 0.05 ? <span className="text-[0.68rem] text-mist-500">unchanged</span> : <DeltaChip change={delta} />}
      </p>
    </div>
  )
}
