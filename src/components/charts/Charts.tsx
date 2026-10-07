import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { OptionEvaluation } from '@/shared/types'

/**
 * Charts are used only where they beat a table. The comparison radar shows the
 * *shape* of each plan's trade-offs, the bar chart shows the two numbers people
 * actually argue about, and the trend shows learning over time.
 *
 * Recharts is loaded lazily (see `LazyCharts`) so it never blocks first paint.
 */

const AXIS = { stroke: '#6b769a', fontSize: 11, tickMargin: 8 }
const GRID = '#1f2942'
const SERIES = ['#6d8bff', '#a78bfa', '#34d399', '#fbbf24']

const TOOLTIP_STYLE = {
  backgroundColor: '#0e1322',
  border: '1px solid #2b3757',
  borderRadius: 12,
  color: '#eceff7',
  fontSize: 12,
  padding: '8px 12px',
} as const

interface TooltipEntry {
  name?: unknown
  value?: unknown
  color?: string
}

function tooltip(labelSuffix: string) {
  return function ChartTooltip(props: { active?: boolean; payload?: readonly TooltipEntry[]; label?: unknown }) {
    const { active, payload, label } = props
    if (!active || !payload?.length) return null
    return (
      <div style={TOOLTIP_STYLE}>
        <p style={{ marginBottom: 4, color: '#b6bed6' }}>{String(label ?? '')}</p>
        {payload.map((entry, index) => (
          <p key={`${String(entry.name)}-${index}`} style={{ color: entry.color ?? '#eceff7' }}>
            {String(entry.name ?? '')}:{' '}
            <strong>{typeof entry.value === 'number' ? Math.round(entry.value) : String(entry.value ?? '')}</strong>
            {labelSuffix}
          </p>
        ))}
      </div>
    )
  }
}

export interface RadarDatum {
  metric: string
  [optionCode: string]: number | string
}

/** Five normalised 0-100 dimensions, all "higher is better" for readability. */
export function buildRadarData(evaluations: OptionEvaluation[]): RadarDatum[] {
  const dimensions: { metric: string; get: (evaluation: OptionEvaluation) => number }[] = [
    { metric: 'Completion', get: (e) => e.projection.successProbability * 100 },
    { metric: 'Deadline safety', get: (e) => (1 - e.projection.deadlineRisk) * 100 },
    { metric: 'Low pressure', get: (e) => 100 - e.projection.stressIndex },
    { metric: 'Flexibility', get: (e) => e.projection.flexibility },
    {
      metric: 'Coverage',
      get: (e) =>
        e.projection.coverage.length
          ? (100 * e.projection.coverage.reduce((sum, c) => sum + Math.min(1, c.ratio), 0)) / e.projection.coverage.length
          : 100,
    },
  ]
  return dimensions.map((dimension) => {
    const row: RadarDatum = { metric: dimension.metric }
    for (const evaluation of evaluations) row[evaluation.option.code] = Math.round(dimension.get(evaluation))
    return row
  })
}

export function ComparisonRadar({ evaluations, className = '' }: { evaluations: OptionEvaluation[]; className?: string }) {
  const data = buildRadarData(evaluations)
  return (
    <div className={`h-[280px] w-full ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={GRID} />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#8c96b5', fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#5a688c', fontSize: 10 }} stroke={GRID} />
          {evaluations.map((evaluation, index) => (
            <Radar
              key={evaluation.option.id}
              name={`${evaluation.option.code} · ${evaluation.option.name}`}
              dataKey={evaluation.option.code}
              stroke={SERIES[index % SERIES.length]}
              fill={SERIES[index % SERIES.length]}
              fillOpacity={0.14}
              strokeWidth={1.8}
              animationDuration={600}
            />
          ))}
          <Tooltip content={tooltip('/100')} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function OptionBars({ evaluations, className = '' }: { evaluations: OptionEvaluation[]; className?: string }) {
  const data = evaluations.map((evaluation) => ({
    name: `${evaluation.option.code} · ${evaluation.option.name}`,
    success: Math.round(evaluation.projection.successProbability * 100),
    deadlineRisk: Math.round(evaluation.projection.deadlineRisk * 100),
    pressure: Math.round(evaluation.projection.stressIndex),
  }))
  return (
    <div className={`h-[260px] w-full ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={6} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#8c96b5', fontSize: 11 }} stroke={GRID} interval={0} height={48} angle={0} />
          <YAxis domain={[0, 100]} tick={AXIS} stroke={GRID} />
          <Tooltip content={tooltip('%')} cursor={{ fill: 'rgba(109,139,255,0.06)' }} />
          <Bar dataKey="success" name="Completion" fill="#4a6bff" radius={[6, 6, 0, 0]} animationDuration={650} />
          <Bar dataKey="deadlineRisk" name="Deadline risk" fill="#fb7185" radius={[6, 6, 0, 0]} animationDuration={650} />
          <Bar dataKey="pressure" name="Pressure" fill="#8b5cf6" radius={[6, 6, 0, 0]} animationDuration={650} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AccuracyTrend({
  points,
  className = '',
  height = 220,
}: {
  points: { label: string; predicted: number; actual: number }[]
  className?: string
  height?: number
}) {
  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#8c96b5', fontSize: 11 }} stroke={GRID} />
          <YAxis domain={[0, 100]} tick={AXIS} stroke={GRID} />
          <Tooltip content={tooltip('%')} />
          <Line type="monotone" dataKey="predicted" name="Simulated" stroke="#6d8bff" strokeWidth={2} dot={{ r: 3, fill: '#6d8bff' }} animationDuration={700} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} animationDuration={700} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CoverageBars({
  coverage,
  className = '',
}: {
  coverage: { name: string; ratio: number; required: number; scheduled: number }[]
  className?: string
}) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {coverage.map((item) => {
        const percent = Math.round(Math.min(1.6, item.ratio) * 100)
        const tone = item.ratio >= 1 ? '#34d399' : item.ratio >= 0.75 ? '#fbbf24' : '#fb7185'
        return (
          <div key={item.name}>
            <div className="flex items-baseline justify-between text-[0.78rem]">
              <span className="truncate text-mist-300">{item.name}</span>
              <span className="num text-mist-400">
                {item.scheduled.toFixed(1)}h / {item.required.toFixed(1)}h
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, percent)}%`, background: tone }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function MiniBars({ values, colors }: { values: number[]; colors?: string[] }) {
  return (
    <div className="flex h-10 items-end gap-1.5" aria-hidden>
      {values.map((value, index) => (
        <div key={index} className="w-2.5 rounded-sm" style={{ height: `${Math.max(8, value)}%`, background: colors?.[index] ?? '#4a6bff' }} />
      ))}
    </div>
  )
}

export { Cell }
