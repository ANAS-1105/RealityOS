import { motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MetricValue } from '@/components/ui/Metric'
import { formatDate } from '@/lib/format'

interface Stage {
  key: string
  label: string
  detail: string
}

interface Summary {
  code: string
  name: string
  success: number
  risk: number
  pressure: number
  expected: string | null
  buffer: number
  recommended: boolean
}

interface HeroPipelineProps {
  stages: Stage[]
  summary: Summary[]
}

export function HeroPipeline({ stages, summary }: HeroPipelineProps) {
  const top = summary.find((entry) => entry.recommended) ?? summary[0]

  return (
    <div className="relative">
      {/* Mock outcome strip — reads as a result, not as a status board. */}
      <div className="surface rounded-2xl border border-ink-800/70 p-5">
        <div className="mb-4 flex items-center justify-between">
          <Badge tone={top.recommended ? 'accent' : 'neutral'}>{top.code} — {top.name}</Badge>
          {top.recommended ? (
            <Badge tone="accent">Recommended</Badge>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-3.5">
            <p className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">Completion</p>
            <p className="mt-1.5 text-2xl num text-mist-50">
              <MetricValue value={top.success} />
            </p>
            <p className="text-[0.66rem] text-mist-500">probability</p>
          </div>
          <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-3.5">
            <p className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">Deadline risk</p>
            <p className="mt-1.5 text-2xl num text-mist-50">{top.risk}%</p>
            <p className="text-[0.66rem] text-mist-500">miss · {top.pressure}/100 pressure</p>
          </div>
          <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-3.5">
            <p className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">Expected finish</p>
            <p className="mt-1.5 text-lg num text-mist-50">{formatDate(top.expected)}</p>
            <p className="text-[0.66rem] text-mist-500">
              {top.buffer >= 0 ? `${top.buffer} day(s) before the deadline` : `${Math.abs(top.buffer)} day(s) past the deadline`}
            </p>
          </div>
        </div>
      </div>

      {/* Pipeline of the five stages. */}
      <div className="mt-4 grid gap-3">
        {stages.map((stage, index) => (
          <motion.div
            key={stage.key}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: 0.05 * index }}
            className="flex items-center gap-3 rounded-xl border border-ink-800/70 bg-ink-900/40 px-4 py-3"
          >
            <span className="num text-[0.72rem] tracking-[0.16em] text-mist-500">{String(index + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.85rem] font-medium text-mist-100">{stage.label}</p>
              <p className="text-[0.7rem] text-mist-500">{stage.detail}</p>
            </div>
            <ArrowRight aria-hidden className="h-3.5 w-3.5 text-mist-500" />
          </motion.div>
        ))}
      </div>

      <p className="mt-3 text-[0.7rem] text-mist-500">
        Generated from the demo scenario by the same engine that serves the app.
      </p>
    </div>
  )
}
