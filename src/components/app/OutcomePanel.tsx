import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, CircleDashed, ClipboardCheck, X } from 'lucide-react'
import type { OptionEvaluation, OutcomeRecord, PredictionComparison } from '@/shared/types'
import { api, RequestError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Field, Input, SegmentedControl, Slider, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, InlineNote } from '@/components/ui/Feedback'
import { DeltaChip, MetricValue, ProgressBar } from '@/components/ui/Metric'
import { AccuracyTrend } from '@/components/charts/Charts'
import { formatDate, signed } from '@/lib/format'

const EMPTY: OutcomeRecord = {
  optionId: null,
  completed: 'yes',
  actualCompletionDate: null,
  actualHours: null,
  actualStress: 60,
  whatWentWrong: '',
  whatWentBetter: '',
  notes: '',
}

export function OutcomeRecorder({
  simulationId,
  evaluation,
  open,
  onClose,
  onRecorded,
}: {
  simulationId: string
  evaluation: OptionEvaluation
  open: boolean
  onClose: () => void
  onRecorded: (comparison: PredictionComparison) => void
}) {
  const [draft, setDraft] = useState<OutcomeRecord>({
    ...EMPTY,
    optionId: evaluation.option.id,
    actualHours: Math.round(evaluation.projection.requiredHours),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<RequestError | Error | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await api.recordOutcome(simulationId, draft)
      onRecorded(response.comparison)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Something went wrong.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record what actually happened"
      description="This is what makes the model yours: your outcome calibrates every future simulation."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} icon={<ClipboardCheck aria-hidden className="h-4 w-4" />}>
            Save outcome
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <ErrorState
            message={error instanceof RequestError ? error.message : 'Something went wrong while saving the outcome.'}
            onRetry={submit}
            retryable={error instanceof RequestError ? error.retryable : true}
          />
        ) : null}

        <Field label="Did you complete the goal?">
          <SegmentedControl
            ariaLabel="Completion"
            value={draft.completed}
            onChange={(value) => setDraft({ ...draft, completed: value })}
            options={[
              { value: 'yes', label: 'Completed', hint: 'Everything delivered' },
              { value: 'partly', label: 'Partly', hint: 'Some scope missing' },
              { value: 'no', label: 'No', hint: 'Not delivered' },
            ]}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date you actually finished" htmlFor="outcome-date" optional>
            <Input
              id="outcome-date"
              type="date"
              value={draft.actualCompletionDate ?? ''}
              onChange={(event) => setDraft({ ...draft, actualCompletionDate: event.target.value || null })}
            />
          </Field>
          <Field label="Hours actually spent" htmlFor="outcome-hours" optional>
            <Input
              id="outcome-hours"
              type="number"
              min={0}
              step={0.5}
              value={draft.actualHours ?? ''}
              onChange={(event) => setDraft({ ...draft, actualHours: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </Field>
        </div>

        <Field label="How heavy did it feel?" hint="0 = effortless, 100 = completely maxed out.">
          <Slider
            label="Reported pressure"
            value={draft.actualStress ?? 0}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setDraft({ ...draft, actualStress: value })}
            format={(value) => `${value}/100`}
          />
        </Field>

        <Field label="What went wrong?" htmlFor="outcome-wrong" optional>
          <Textarea
            id="outcome-wrong"
            rows={2}
            placeholder="Debugging the model took three extra nights."
            value={draft.whatWentWrong}
            onChange={(event) => setDraft({ ...draft, whatWentWrong: event.target.value })}
          />
        </Field>

        <Field label="What went better than expected?" htmlFor="outcome-better" optional>
          <Textarea
            id="outcome-better"
            rows={2}
            placeholder="The report was much faster than the estimate."
            value={draft.whatWentBetter}
            onChange={(event) => setDraft({ ...draft, whatWentBetter: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  )
}

export function PredictionVsReality({
  comparison,
  trend,
  predictedLabel,
  actualLabel,
}: {
  comparison: PredictionComparison
  trend?: { label: string; predicted: number; actual: number }[]
  predictedLabel?: string
  actualLabel?: string
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-800/70 bg-ink-900/40 p-4">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">AI prediction</p>
          <p className="mt-2 text-2xl font-semibold text-mist-50">
            <MetricValue value={comparison.predictedSuccess} />
          </p>
          <p className="mt-1 text-[0.74rem] text-mist-500">{predictedLabel ?? 'Simulated completion probability'}</p>
          <div className="mt-3 space-y-1.5 text-[0.74rem] text-mist-400">
            <p>Deadline miss risk: {Math.round(comparison.predictedDeadlineRisk)}%</p>
            <p>Expected effort: {comparison.predictedHours.toFixed(1)}h</p>
            <p>Expected pressure: {Math.round(comparison.predictedStress)}/100</p>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-800/70 bg-ink-900/40 p-4">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Actual outcome</p>
          <p className="mt-2 text-2xl font-semibold text-mist-50">
            <MetricValue value={comparison.actualSuccess} />
          </p>
          <p className="mt-1 text-[0.74rem] text-mist-500">{actualLabel ?? 'How the goal actually went'}</p>
          <div className="mt-3 space-y-1.5 text-[0.74rem] text-mist-400">
            <p>
              Deadline:{' '}
              {comparison.deadlineHit ? (
                <span className="text-signal-low">met</span>
              ) : (
                <span className="text-signal-high">missed</span>
              )}
            </p>
            <p>Effort spent: {comparison.actualHours === null ? 'not recorded' : `${comparison.actualHours.toFixed(1)}h`}</p>
            <p>Reported pressure: {comparison.actualStress === null ? 'not recorded' : `${comparison.actualStress}/100`}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-800/70 bg-ink-900/40 p-4">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Difference</p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-mist-50">
              <MetricValue value={Math.abs(comparison.successDelta)} />
            </span>
            <DeltaChip change={comparison.successDelta} label="vs predicted" />
          </p>
          <div className="mt-3 space-y-1.5 text-[0.74rem] text-mist-400">
            <p>Effort error: {comparison.hoursErrorPct === null ? 'not recorded' : signed(comparison.hoursErrorPct, 0, '%')}</p>
            <p>Pressure gap: {comparison.stressDelta === null ? 'not recorded' : signed(comparison.stressDelta, 0)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-ink-800/70 bg-ink-900/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[0.9rem] font-semibold text-mist-50">Reflection</h3>
            <p className="mt-1 max-w-2xl text-[0.82rem] leading-relaxed text-mist-300">{comparison.narrative}</p>
          </div>
          <Badge tone={comparison.engine.mode === 'ai' ? 'violet' : 'neutral'} title={comparison.engine.note}>
            {comparison.engine.mode === 'ai' ? `Reflection agent · ${comparison.engine.model}` : 'Local reflection'}
          </Badge>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {comparison.causes.map((cause) => (
            <motion.li
              key={cause.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-xl border border-ink-800/60 bg-ink-900/40 p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[0.84rem] font-medium text-mist-100">{cause.label}</span>
                <Badge
                  tone={cause.kind === 'underestimate' ? 'high' : cause.kind === 'overestimate' ? 'medium' : 'neutral'}
                >
                  {cause.kind === 'underestimate' ? 'under-weighted' : cause.kind === 'overestimate' ? 'over-weighted' : 'external'}
                </Badge>
              </div>
              <p className="mt-1.5 text-[0.76rem] leading-relaxed text-mist-400">{cause.detail}</p>
            </motion.li>
          ))}
        </ul>
      </div>

      {trend && trend.length > 1 ? (
        <div className="rounded-2xl border border-ink-800/70 bg-ink-900/40 p-4">
          <h3 className="text-[0.9rem] font-semibold text-mist-50">Simulated vs actual over time</h3>
          <p className="mt-1 text-[0.74rem] text-mist-500">Each point is one recorded decision.</p>
          <AccuracyTrend points={trend} className="mt-3" />
        </div>
      ) : null}

      <InlineNote>
        <p className="flex items-center gap-2">
          <Check aria-hidden className="h-3.5 w-3.5 text-signal-low" />
          This outcome has been stored as a training row. Running <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[0.72rem]">npm run train -- --real export.json</code> refits the model on real outcomes instead of the simulated cohort.
        </p>
      </InlineNote>
    </div>
  )
}

export function OutcomeStatus({ comparison }: { comparison: PredictionComparison | null }) {
  if (!comparison) return null
  const accurate = Math.abs(comparison.successDelta) <= 12
  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-2 w-2 rounded-full ${accurate ? 'bg-signal-low' : 'bg-signal-medium'}`} aria-hidden />
      <span className="text-[0.74rem] text-mist-300">
        {accurate ? 'Prediction held up' : 'Prediction drifted'} · {signed(comparison.successDelta, 0, ' pts')}
      </span>
      <div className="w-20">
        <ProgressBar value={100 - Math.abs(comparison.successDelta)} tone={accurate ? 'low' : 'medium'} height="h-1" />
      </div>
    </div>
  )
}

export { CircleDashed, X, formatDate }
