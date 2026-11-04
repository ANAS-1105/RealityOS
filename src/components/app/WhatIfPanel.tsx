import { useMemo, useState } from 'react'
import type { SimulationRun } from '@/shared/types'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Section } from '@/components/ui/Card'
import { InlineNote } from '@/components/ui/Feedback'
import { Slider } from '@/components/ui/Form'
import { DeltaChip, MetricValue } from '@/components/ui/Metric'
import { CoverageBars } from '@/components/charts/Charts'
import { recommend } from '@/shared/engine/simulate'

const LEVERS = [
  { key: 'hoursPerDay' as const, label: 'Focused hours per day', min: 0.5, max: 12, step: 0.5, format: (v: number) => `${v}h` },
  { key: 'deadlineDays' as const, label: 'Deadline shift', min: -14, max: 21, step: 1, format: (v: number) => `${v >= 0 ? '+' : ''}${v}d` },
  { key: 'complexity' as const, label: 'Complexity haircut', min: 0.7, max: 1, step: 0.05, format: (v: number) => `${((1 - v) * 100).toFixed(0)}% trimmed` },
  { key: 'activeDays' as const, label: 'Active days / week', min: 1, max: 7, step: 1, format: (v: number) => `${v}d` },
]

/** Shift an ISO date by whole days (UTC, so DST cannot move the result). */
function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function WhatIfPanel({
  simulationId,
  run,
  initialOptionId,
  today,
}: {
  simulationId: string
  run: SimulationRun
  initialOptionId?: string
  today: string
  reliability: number
  outcomeCount: number
  engineNote: string
}) {
  const baseOption = useMemo(() => {
    const recommendation = recommend(run.evaluations)
    return run.evaluations.find((evaluation) => evaluation.option.id === recommendation.optionId) ?? run.evaluations[0]
  }, [run.evaluations])
  const targetId = initialOptionId ?? baseOption?.option.id ?? run.evaluations[0].option.id
  const target = run.evaluations.find((e) => e.option.id === targetId) ?? run.evaluations[0]

  const [overrides, setOverrides] = useState<Record<string, number>>({
    hoursPerDay: target.option.hoursPerDay,
    deadlineDays: 0,
    complexity: 1,
    activeDays: run.situation.activeDaysPerWeek,
  })

  // The sliders are user-facing labels; the API only understands the situation
  // fields. Map them explicitly so every lever actually reaches the engine:
  // a deadline *shift* becomes an ISO deadline, and the complexity haircut is a
  // multiplier on the situation's complexity rather than an absolute value.
  const apiOverrides = useMemo(() => {
    const next: Record<string, unknown> = {
      hoursPerDay: overrides.hoursPerDay,
      activeDaysPerWeek: overrides.activeDays,
      complexity: Math.min(1, Math.max(0, run.situation.complexity * overrides.complexity)),
    }
    if (overrides.deadlineDays) next.deadline = shiftDate(run.situation.deadline ?? today, overrides.deadlineDays)
    return next
  }, [overrides, run.situation.complexity, run.situation.deadline, today])

  const result = useAsync(async () => {
    if (!simulationId || !target) return null
    const response = await api.whatIf(simulationId, { optionId: target.option.id, overrides: apiOverrides })
    return response.result
  }, [simulationId, target?.option.id, apiOverrides])

  const baseline = target?.projection
  const delta = result.data?.projection
    ? {
        success: (result.data.projection.successProbability * 100) - (baseline?.successProbability ?? 0) * 100,
        risk: (result.data.projection.deadlineRisk * 100) - (baseline?.deadlineRisk ?? 0) * 100,
        pressure: (result.data.projection.stressIndex) - (baseline?.stressIndex ?? 0),
      }
    : null

  return (
    <div className="space-y-6">
      <Section title="Move a lever" sub="The trained model re-evaluates the same option against the changed inputs and tells you what changed.">
        <Card className="p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            {LEVERS.map((lever) => (
              <Slider
                key={lever.key}
                label={lever.label}
                value={overrides[lever.key] ?? lever.min}
                min={lever.min}
                max={lever.max}
                step={lever.step}
                onChange={(value) => setOverrides((prev) => ({ ...prev, [lever.key]: value }))}
                format={lever.format}
              />
            ))}
          </div>
        </Card>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-[0.85rem] font-semibold text-mist-50">Before — {target?.option.code} — {target?.option.name}</h3>
          <p className="mt-1 text-[0.76rem] text-mist-500">The option as it stands today.</p>
          <dl className="mt-4 grid gap-3">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Completion</p>
              <p className="mt-0.5 text-xl num text-mist-50">{Math.round(baseline?.successProbability ?? 0)}%</p>
            </div>
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Deadline risk</p>
              <p className="mt-0.5 text-xl num text-mist-50">{Math.round(baseline?.deadlineRisk ?? 0)}%</p>
            </div>
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Pressure</p>
              <p className="mt-0.5 text-xl num text-mist-50">{Math.round(baseline?.stressIndex ?? 0)}/100</p>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[0.85rem] font-semibold text-mist-50">After — same option, new inputs</h3>
            {result.loading ? (
              <span className="text-[0.72rem] text-mist-500">re-evaluating…</span>
            ) : result.error ? (
              <Badge tone="high">re-evaluate failed — keep your last values</Badge>
            ) : (
              <Badge tone="low">re-evaluated</Badge>
            )}
          </div>
          <p className="mt-1 text-[0.76rem] text-mist-500">Re-evaluated by the same engine, with your calibration applied.</p>

          {result.data ? (
            <dl className="mt-4 grid gap-3">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Completion</p>
                <p className="mt-0.5 flex items-baseline gap-2">
                  <MetricValue value={result.data.projection.successProbability * 100} />
                  {delta && delta.success !== 0 ? <DeltaChip change={delta.success} suffix=" pts" /> : null}
                </p>
              </div>
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Deadline risk</p>
                <p className="mt-0.5 flex items-baseline gap-2">
                  <MetricValue value={result.data.projection.deadlineRisk * 100} />
                  {delta && delta.risk !== 0 ? <DeltaChip change={delta.risk} suffix=" pts" /> : null}
                </p>
              </div>
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Pressure</p>
                <p className="mt-0.5 flex items-baseline gap-2">
                  <MetricValue value={result.data.projection.stressIndex} suffix="" />
                  {delta && delta.pressure !== 0 ? <DeltaChip change={delta.pressure} /> : null}
                </p>
              </div>
            </dl>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="rounded-lg bg-ink-900/40 px-3 py-2.5 text-[0.82rem] text-mist-300">Completion: {Math.round(baseline?.successProbability ?? 0)}%</div>
              <div className="rounded-lg bg-ink-900/40 px-3 py-2.5 text-[0.82rem] text-mist-300">Deadline risk: {Math.round(baseline?.deadlineRisk ?? 0)}%</div>
              <div className="rounded-lg bg-ink-900/40 px-3 py-2.5 text-[0.82rem] text-mist-300">Pressure: {Math.round(baseline?.stressIndex ?? 0)}/100</div>
            </div>
          )}

          {result.data && result.data.explanation ? (
            <p className="mt-4 text-[0.78rem] leading-relaxed text-mist-400">{result.data.explanation}</p>
          ) : null}
        </Card>
      </div>

      {target && (
        <Card className="p-4">
          <h3 className="text-[0.85rem] font-semibold text-mist-50">Coverage per deliverable — after</h3>
          <p className="mt-1 text-[0.74rem] text-mist-500">How the changed plan covers each deliverable.</p>
          <CoverageBars coverage={result.data?.projection.coverage ?? target.projection.coverage} className="mt-3" />
        </Card>
      )}

      <InlineNote>
        <p className="flex items-center gap-2">
          <span className="text-accent-300 text-[0.72rem]">Nothing is stored.</span>
          Each change is re-evaluated against your account&apos;s reliability calibration; your saved simulation stays as it was.
        </p>
      </InlineNote>
    </div>
  )
}
