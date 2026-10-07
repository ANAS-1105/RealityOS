import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { RotateCcw, Wand2 } from 'lucide-react'
import type { OptionEvaluation, SimulationRun, WhatIfResult } from '@/shared/types'
import { api, RequestError } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import { Button } from '@/components/ui/Button'
import { Field, SegmentedControl, Slider } from '@/components/ui/Form'
import { Badge } from '@/components/ui/Badge'
import { DeltaChip, MetricValue } from '@/components/ui/Metric'
import { CoverageBars } from '@/components/charts/Charts'
import { whatIf as runWhatIf } from '@/shared/engine/simulate'
import { formatDate } from '@/lib/format'

interface Overrides {
  hoursPerDay: number
  activeDaysPerWeek: number
  availableHoursPerDay: number
  deadline: string | null
  complexity: number
  resourceLevel: 'low' | 'medium' | 'high'
}

/**
 * The What-If simulator.
 *
 * It computes locally first — the deterministic engine and the trained model run
 * in the browser too — so the sliders feel instant, then reconciles with the
 * server (same numbers, plus the narrative the What-If agent writes when an LLM
 * is configured). The server result always wins if the two ever differ.
 */
export function WhatIfPanel({
  simulationId,
  run,
  initialOptionId,
  today,
  reliability,
  outcomeCount,
  engineNote,
}: {
  simulationId: string
  run: SimulationRun
  initialOptionId?: string
  today: string
  reliability: number
  outcomeCount: number
  engineNote?: string
}) {
  const startOption =
    run.evaluations.find((evaluation) => evaluation.option.id === initialOptionId) ??
    run.evaluations.find((evaluation) => evaluation.option.id === run.recommendation.optionId) ??
    run.evaluations[0]!

  const [optionId, setOptionId] = useState(startOption.option.id)
  const evaluation: OptionEvaluation = run.evaluations.find((entry) => entry.option.id === optionId) ?? startOption

  const [overrides, setOverrides] = useState<Overrides>({
    hoursPerDay: evaluation.option.hoursPerDay,
    activeDaysPerWeek: run.situation.activeDaysPerWeek,
    availableHoursPerDay: run.situation.availableHoursPerDay,
    deadline: run.situation.deadline,
    complexity: run.situation.complexity,
    resourceLevel:
      (run.situation.resources[0]?.availability as Overrides['resourceLevel']) ??
      (run.situation.resources.length ? 'medium' : 'medium'),
  })
  const [serverResult, setServerResult] = useState<WhatIfResult | null>(null)
  const [narrative, setNarrative] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const requestRef = useRef(0)

  const context = useMemo(() => ({ today, reliability, outcomeCount }), [today, reliability, outcomeCount])

  // Instant local projection — identical code path to the server.
  const local = useMemo(
    () =>
      runWhatIf(
        run.situation,
        evaluation.option,
        {
          optionId: evaluation.option.id,
          overrides: {
            hoursPerDay: overrides.hoursPerDay,
            activeDaysPerWeek: overrides.activeDaysPerWeek,
            availableHoursPerDay: overrides.availableHoursPerDay,
            deadline: overrides.deadline,
            complexity: overrides.complexity,
            resourceLevel: overrides.resourceLevel,
          },
        },
        context,
      ),
    [run.situation, evaluation.option, overrides, context],
  )

  const debouncedOverrides = useDebounced(overrides, 420)

  useEffect(() => {
    const requestId = ++requestRef.current
    setPending(true)
    void (async () => {
      try {
        const response = await api.whatIf(simulationId, {
          optionId: evaluation.option.id,
          overrides: {
            hoursPerDay: debouncedOverrides.hoursPerDay,
            activeDaysPerWeek: debouncedOverrides.activeDaysPerWeek,
            availableHoursPerDay: debouncedOverrides.availableHoursPerDay,
            deadline: debouncedOverrides.deadline,
            complexity: debouncedOverrides.complexity,
            resourceLevel: debouncedOverrides.resourceLevel,
          },
        })
        if (requestRef.current !== requestId) return
        setServerResult(response.result)
        setNarrative(response.result.aiNarrative ?? null)
        setError(null)
      } catch (cause) {
        if (requestRef.current !== requestId) return
        setError(cause instanceof RequestError ? cause.message : 'We could not update the simulation. The numbers shown are computed locally.')
      } finally {
        if (requestRef.current === requestId) setPending(false)
      }
    })()
  }, [simulationId, evaluation.option.id, debouncedOverrides])

  const projection = serverResult?.projection ?? local.result.projection
  const deltas = serverResult?.deltas ?? local.result.deltas
  const explanation = narrative ?? serverResult?.explanation ?? local.result.explanation
  const changed = Math.abs(overrides.hoursPerDay - evaluation.option.hoursPerDay) > 0.01 || overrides.deadline !== run.situation.deadline

  const reset = () =>
    setOverrides({
      hoursPerDay: evaluation.option.hoursPerDay,
      activeDaysPerWeek: run.situation.activeDaysPerWeek,
      availableHoursPerDay: run.situation.availableHoursPerDay,
      deadline: run.situation.deadline,
      complexity: run.situation.complexity,
      resourceLevel: (run.situation.resources[0]?.availability as Overrides['resourceLevel']) ?? 'medium',
    })

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="surface rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[0.95rem] font-semibold text-mist-50">Variables</h2>
            <p className="mt-1 text-[0.8rem] text-mist-500">Change the plan and watch the projection move.</p>
          </div>
          <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden className="h-3.5 w-3.5" />} onClick={reset} disabled={!changed}>
            Reset
          </Button>
        </div>

        <div className="mt-5 space-y-5">
          <Field label="Decision path" htmlFor="whatif-option">
            <select
              id="whatif-option"
              value={optionId}
              onChange={(event) => {
                const next = run.evaluations.find((entry) => entry.option.id === event.target.value) ?? startOption
                setOptionId(next.option.id)
                setOverrides((current) => ({ ...current, hoursPerDay: next.option.hoursPerDay }))
                setServerResult(null)
              }}
              className="w-full rounded-xl border border-ink-700/80 bg-ink-900/70 px-3.5 py-2.5 text-sm text-mist-100 focus:border-accent-400/70 focus:outline-none"
            >
              {run.evaluations.map((entry) => (
                <option key={entry.option.id} value={entry.option.id}>
                  {entry.option.code} — {entry.option.name}
                </option>
              ))}
            </select>
          </Field>

          <Slider
            label="Focused hours per day"
            value={overrides.hoursPerDay}
            min={0.5}
            max={Math.max(8, Math.ceil(run.situation.availableHoursPerDay * 1.6))}
            step={0.25}
            onChange={(value) => setOverrides((current) => ({ ...current, hoursPerDay: value }))}
            format={(value) => `${value.toFixed(2)} h`}
            minLabel="Light"
            maxLabel="Full push"
          />

          <Slider
            label="Hours actually available each day"
            value={overrides.availableHoursPerDay}
            min={0.5}
            max={14}
            step={0.5}
            onChange={(value) => setOverrides((current) => ({ ...current, availableHoursPerDay: value }))}
            format={(value) => `${value.toFixed(1)} h`}
          />

          <Slider
            label="Active days per week"
            value={overrides.activeDaysPerWeek}
            min={1}
            max={7}
            step={1}
            onChange={(value) => setOverrides((current) => ({ ...current, activeDaysPerWeek: value }))}
            format={(value) => `${value} of 7`}
          />

          <Slider
            label="Goal complexity"
            value={overrides.complexity}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(value) => setOverrides((current) => ({ ...current, complexity: value }))}
            format={(value) => `${Math.round(value * 100)}%`}
            minLabel="Straightforward"
            maxLabel="Deep technical"
          />

          <Field label="Deadline" htmlFor="whatif-deadline" hint="Move the date to test how much the deadline is doing the work.">
            <input
              id="whatif-deadline"
              type="date"
              value={overrides.deadline ?? ''}
              onChange={(event) => setOverrides((current) => ({ ...current, deadline: event.target.value || null }))}
              className="w-full rounded-xl border border-ink-700/80 bg-ink-900/70 px-3.5 py-2.5 text-sm text-mist-100 focus:border-accent-400/70 focus:outline-none"
            />
          </Field>

          <Field label="Resource availability">
            <SegmentedControl
              ariaLabel="Resource availability"
              size="sm"
              value={overrides.resourceLevel}
              onChange={(value) => setOverrides((current) => ({ ...current, resourceLevel: value }))}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-5">
        <div className="surface rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.95rem] font-semibold text-mist-50">Projected outcome</h2>
              <p className="mt-1 text-[0.8rem] text-mist-500">{engineNote ?? 'Local reasoning core, reconciled with the server.'}</p>
            </div>
            <div className="flex items-center gap-2">
              {pending ? <Badge tone="neutral">Reconciling…</Badge> : <Badge tone="low">In sync</Badge>}
              {changed ? <Badge tone="accent">Modified</Badge> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Metric
              label="Completion"
              value={projection.successProbability * 100}
              delta={deltas.find((delta) => delta.metric === 'successProbability')}
            />
            <Metric label="Deadline risk" value={projection.deadlineRisk * 100} delta={deltas.find((delta) => delta.metric === 'deadlineRisk')} />
            <Metric label="Pressure" value={projection.stressIndex} delta={deltas.find((delta) => delta.metric === 'stressIndex')} />
            <Metric label="Flexibility" value={projection.flexibility} delta={deltas.find((delta) => delta.metric === 'flexibility')} />
            <Metric label="Coverage" value={deltas.find((delta) => delta.metric === 'coverage')?.to ?? 0} delta={deltas.find((delta) => delta.metric === 'coverage')} />
            <div className="surface rounded-xl px-4 py-3.5">
              <p className="text-[0.72rem] uppercase tracking-[0.12em] text-mist-500">Expected finish</p>
              <p className="num mt-1.5 text-[1.05rem] text-mist-50">{formatDate(projection.expectedCompletionDate)}</p>
              <p className="mt-1 text-[0.75rem] text-mist-500">
                {projection.bufferDays >= 0 ? `${projection.bufferDays} day(s) before the deadline` : `${Math.abs(projection.bufferDays)} day(s) past the deadline`}
              </p>
            </div>
          </div>

          <motion.div
            key={explanation}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-5 rounded-xl border border-accent-400/25 bg-accent-500/6 px-4 py-3.5"
          >
            <p className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.12em] text-accent-300">
              <Wand2 aria-hidden className="h-3.5 w-3.5" />
              What changed
            </p>
            <p className="mt-1.5 text-[0.85rem] leading-relaxed text-mist-200">{explanation}</p>
          </motion.div>

          {error ? <p className="mt-3 text-[0.78rem] text-signal-medium">{error}</p> : null}
        </div>

        <div className="surface rounded-2xl p-5">
          <h3 className="text-[0.9rem] font-semibold text-mist-50">Deliverable coverage under these settings</h3>
          <p className="mt-1 text-[0.78rem] text-mist-500">Required hours versus the hours this plan actually schedules.</p>
          <div className="mt-4">
            <CoverageBars coverage={projection.coverage} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, delta }: { label: string; value: number; delta?: WhatIfResult['deltas'][number] }) {
  return (
    <div className="surface rounded-xl px-4 py-3.5">
      <p className="text-[0.72rem] uppercase tracking-[0.12em] text-mist-500">{label}</p>
      <p className="mt-1.5 text-[1.15rem] font-semibold">
        <MetricValue value={value} />
      </p>
      {delta ? (
        <p className="mt-1.5">
          <DeltaChip change={delta.change} />
        </p>
      ) : null}
    </div>
  )
}
