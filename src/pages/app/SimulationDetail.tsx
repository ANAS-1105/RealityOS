import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ClipboardCheck, GitCompareArrows, Play, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { api, streams, RequestError } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, EngineBadge, RiskBadge, StatusBadge } from '@/components/ui/Badge'
import { Card, Section } from '@/components/ui/Card'
import { EmptyState, ErrorState, InlineNote, Skeleton, StageList } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { DecisionCard } from '@/components/app/DecisionCard'
import { ComparisonPanel } from '@/components/app/ComparisonPanel'
import { RecommendationPanel } from '@/components/app/RecommendationPanel'
import { SituationPanel } from '@/components/app/SituationPanel'
import { WhatIfPanel } from '@/components/app/WhatIfPanel'
import { OutcomeRecorder, PredictionVsReality } from '@/components/app/OutcomePanel'
import { relativeDays } from '@/lib/format'
import type { PredictionComparison, SimulationRun, StageEvent, StructuredSituation } from '@/shared/types'

type Tab = 'situation' | 'results' | 'what-if' | 'reality'

const STAGE_ORDER = ['understanding', 'constraints', 'dependencies', 'risks', 'strategies', 'simulating', 'critic', 'recommendation'] as const

/** Merge streamed stage events into an ordered, de-duplicated script. */
function mergeStages(current: StageEvent[], incoming: StageEvent): StageEvent[] {
  const existing = current.findIndex((stage) => stage.stage === incoming.stage)
  if (existing >= 0) {
    const next = [...current]
    next[existing] = { ...incoming, detail: incoming.detail ?? next[existing]?.detail }
    return next
  }
  const next = [...current, incoming]
  return next.sort((a, b) => STAGE_ORDER.indexOf(a.stage as never) - STAGE_ORDER.indexOf(b.stage as never))
}

export default function SimulationDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { push } = useToast()
  const { learning } = useSession()

  const detail = useAsync(() => api.getSimulation(id), [id])
  const [tab, setTab] = useState<Tab>('situation')
  const [stages, setStages] = useState<StageEvent[]>([])
  const [busy, setBusy] = useState<'analyzing' | 'running' | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [savingSituation, setSavingSituation] = useState(false)
  const [comparison, setComparison] = useState<PredictionComparison | null>(null)
  const [outcomeOpen, setOutcomeOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [steer, setSteer] = useState('')
  const startedRef = useRef<string | null>(null)

  const simulation = detail.data?.simulation ?? null
  const situation = simulation?.situation ?? null
  const run: SimulationRun | null = simulation?.run ?? null
  const chosenOptionId = simulation?.chosenOptionId ?? null

  const analyze = useCallback(async () => {
    if (!simulation) return
    setStreamError(null)
    setStages([])
    setBusy('analyzing')
    await streams.analyzeSimulation(
      simulation.id,
      {
        description: simulation.description,
        goal: simulation.goal ?? undefined,
        deadline: simulation.deadline ?? undefined,
        availableHoursPerDay: situation?.availableHoursPerDay,
        constraints: situation?.constraints,
        attachments: [],
      },
      {
        onStage: (stage) => setStages((current) => mergeStages(current, stage)),
        onResult: () => {
          setBusy(null)
          void detail.reload()
        },
        onError: (error) => {
          setBusy(null)
          setStreamError(error.message)
        },
      },
    )
  }, [simulation, situation, detail])

  const runSimulation = useCallback(async () => {
    if (!simulation) return
    setStreamError(null)
    setStages([])
    setBusy('running')
    setTab('results')
    await streams.runSimulation(
      simulation.id,
      { optionCount: 3, ...(steer.trim() ? { steer: steer.trim() } : {}) },
      {
        onStage: (stage) => setStages((current) => mergeStages(current, stage)),
        onResult: () => {
          setBusy(null)
          void detail.reload()
        },
        onError: (error) => {
          setBusy(null)
          setStreamError(error.message)
        },
      },
    )
  }, [simulation, steer, detail])

  // Auto-start analysis when arriving from the create screen, exactly once.
  useEffect(() => {
    if (!simulation) return
    const shouldAnalyze = params.get('analyze') === '1' && simulation.status === 'draft'
    if (!shouldAnalyze) return
    if (startedRef.current === simulation.id) return
    startedRef.current = simulation.id
    setParams({}, { replace: true })
    void analyze()
  }, [simulation, params, setParams, analyze])

  // Land on the most useful tab for the simulation's current state.
  useEffect(() => {
    if (!simulation) return
    if (run) setTab((current) => (current === 'situation' ? 'results' : current))
  }, [simulation, run])

  useEffect(() => {
    if (simulation?.comparison) setComparison(simulation.comparison)
  }, [simulation?.comparison])

  const targetEvaluation = useMemo(() => {
    if (!run) return null
    const id2 = chosenOptionId ?? run.recommendation.optionId
    return run.evaluations.find((evaluation) => evaluation.option.id === id2) ?? run.evaluations[0] ?? null
  }, [run, chosenOptionId])

  if (detail.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (detail.error || !simulation) {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <ErrorState
          message={detail.error instanceof RequestError ? detail.error.message : 'We could not load that simulation.'}
          onRetry={detail.reload}
        />
        <div className="mt-4">
          <ButtonLink to="/app/simulations" variant="secondary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />}>
            Back to simulations
          </ButtonLink>
        </div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; disabled?: boolean }[] = [
    { key: 'situation', label: 'Situation' },
    { key: 'results', label: 'Results', disabled: !run },
    { key: 'what-if', label: 'What-If', disabled: !run },
    { key: 'reality', label: 'Reality', disabled: !run },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Simulation"
        title={simulation.title}
        description={
          situation?.deadline
            ? `Deadline ${situation.deadline} · ${relativeDays(situation.deadline)} · ${situation.availableHoursPerDay}h/day available`
            : 'No deadline in the model yet — add one for sharper deadline risk.'
        }
        actions={
          <>
            <span className="hidden items-center gap-2 sm:flex">
              <StatusBadge status={simulation.status} />
              {simulation.isDemo ? <Badge tone="accent">Demo</Badge> : null}
              <RiskBadge level={simulation.riskLevel} />
              <EngineBadge engine={run?.engine ?? simulation.engine} />
            </span>
            {!run && situation ? (
              <Button onClick={runSimulation} loading={busy === 'running'} magnetic icon={<Play aria-hidden className="h-4 w-4" />}>
                Run simulation
              </Button>
            ) : null}
            {run ? (
              <>
                <Button variant="secondary" onClick={() => setOutcomeOpen(true)} icon={<ClipboardCheck aria-hidden className="h-4 w-4" />}>
                  Record outcome
                </Button>
                <Button variant="ghost" onClick={runSimulation} loading={busy === 'running'} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
                  Re-run
                </Button>
              </>
            ) : null}
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 aria-hidden className="h-4 w-4" />} aria-label="Delete simulation">
              Delete
            </Button>
          </>
        }
      />

      <nav aria-label="Simulation sections" className="mb-6 flex flex-wrap gap-1.5">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => !entry.disabled && setTab(entry.key)}
            aria-current={tab === entry.key ? 'page' : undefined}
            disabled={entry.disabled}
            className={`rounded-lg px-3.5 py-2 text-[0.83rem] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              tab === entry.key ? 'bg-ink-800/90 text-mist-50' : 'text-mist-400 hover:bg-ink-900/60 hover:text-mist-100'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {streamError ? (
        <div className="mb-6">
          <ErrorState message={streamError} onRetry={busy === 'running' ? runSimulation : analyze} />
        </div>
      ) : null}

      {busy ? (
        <Card className="mb-6 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[0.95rem] font-semibold text-mist-50">
                {busy === 'analyzing' ? 'Analyzing your situation' : 'Simulating the decision paths'}
              </h2>
              <p className="mt-1 text-[0.82rem] text-mist-500">
                Real agent progress — each step completes when its agent returns, not on a timer.
              </p>
            </div>
            <span className="relative flex h-9 w-9 items-center justify-center">
              <span className="absolute inset-0 animate-pulse-soft rounded-full bg-accent-500/15" />
              <Play aria-hidden className="h-4 w-4 text-accent-300" />
            </span>
          </div>
          <StageList stages={stages} className="mt-4" />
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-ink-700/70">
            <span className="block h-full w-1/3 animate-sweep rounded-full bg-gradient-to-r from-accent-500 to-violet-500" />
          </div>
        </Card>
      ) : null}

      {tab === 'situation' ? (
        situation ? (
          <div className="space-y-6">
            <SituationPanel
              situation={situation}
              saving={savingSituation}
              engineNote={simulation.engine?.note}
              onSave={async (next: StructuredSituation) => {
                setSavingSituation(true)
                try {
                  await api.saveSituation(simulation.id, next)
                  push('success', 'Situation model updated.')
                  await detail.reload()
                } catch {
                  push('error', 'We could not save those changes. Please try again.')
                } finally {
                  setSavingSituation(false)
                }
              }}
            />

            {!run ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="run-steer" className="text-[0.8rem] font-medium text-mist-200">
                    Optional steer before running
                  </label>
                  <input
                    id="run-steer"
                    value={steer}
                    onChange={(event) => setSteer(event.target.value)}
                    placeholder="e.g. protect the exam revision, I can't move that date"
                    className="mt-2 w-full rounded-xl border border-ink-700/80 bg-ink-900/70 px-3.5 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-accent-400/70 focus:outline-none"
                  />
                </div>
                <Button size="lg" onClick={runSimulation} loading={busy === 'running'} magnetic icon={<Play aria-hidden className="h-4 w-4" />}>
                  Run simulation
                </Button>
              </div>
            ) : (
              <InlineNote tone="accent">
                <p>
                  Editing the model after a run? Run the simulation again to see how the options change — the previous run is kept in the
                  history table below.
                </p>
              </InlineNote>
            )}
          </div>
        ) : busy ? null : (
          <EmptyState
            title="No situation model yet"
            description="RealityOS has the description but has not structured it. Run the analysis to extract the goal, deadline, hours, constraints and dependencies."
            action={
              <Button onClick={analyze} loading={busy === 'analyzing'} magnetic icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
                Analyze situation
              </Button>
            }
          />
        )
      ) : null}

      {tab === 'results' && run ? (
        <div className="space-y-8">
          {run.feasibility.status !== 'fits' ? (
            <div className="rounded-2xl border border-signal-medium/30 bg-signal-medium/6 px-5 py-4">
              <p className="flex items-center gap-2 text-[0.88rem] font-medium text-mist-100">
                <TriangleAlert aria-hidden className="h-4 w-4 text-signal-medium" />
                {run.feasibility.status === 'does_not_fit' ? 'This set of work does not fit the available time' : 'This plan is tight'}
              </p>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-mist-300">{run.feasibility.note}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-[0.78rem] text-mist-400">
                <span className="num">Required ≈ {run.feasibility.requiredHours}h</span>
                <span className="num">Available ≈ {run.feasibility.capacityHours}h</span>
                <button type="button" onClick={() => setTab('what-if')} className="text-accent-300 underline-offset-2 hover:underline">
                  Test the levers in What-If
                </button>
              </div>
            </div>
          ) : null}

          <Section title="Decision options" sub="Each plan is a different strategy, projected by the trained workload model.">
            <div className="grid gap-5 pt-2 lg:grid-cols-3">
              {run.evaluations.map((evaluation, index) => (
                <DecisionCard
                  key={evaluation.option.id}
                  evaluation={evaluation}
                  index={index}
                  recommended={evaluation.option.id === run.recommendation.optionId}
                  chosen={evaluation.option.id === chosenOptionId}
                  onChoose={async (optionId) => {
                    try {
                      await api.chooseOption(simulation.id, optionId)
                      push('success', 'Path recorded. Come back after the deadline to log the outcome.')
                      await detail.reload()
                    } catch {
                      push('error', 'We could not record that choice. Please try again.')
                    }
                  }}
                  onExplore={(optionId) => {
                    setTab('what-if')
                    setParams({ option: optionId }, { replace: true })
                  }}
                />
              ))}
            </div>
          </Section>

          <Section title="Comparison" sub="Only the metrics that change the decision.">
            <ComparisonPanel
              evaluations={run.evaluations}
              onExplore={(optionId) => {
                setTab('what-if')
                setParams({ option: optionId }, { replace: true })
              }}
            />
          </Section>

          <Section title="Recommendation" sub="Ranked by a published scoring function, explained in words.">
            <RecommendationPanel
              recommendation={run.recommendation}
              optionCode={run.evaluations.find((e) => e.option.id === run.recommendation.optionId)?.option.code ?? 'A'}
              optionName={run.evaluations.find((e) => e.option.id === run.recommendation.optionId)?.option.name ?? ''}
              critiques={run.critiques}
            />
          </Section>

          {run.risks.length ? (
            <Section title="Risk register" sub="Combined from the situation model, the engine and the risk agent.">
              <ul className="grid gap-3 sm:grid-cols-2">
                {run.risks.map((risk) => (
                  <li key={risk.label} className="surface rounded-xl px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[0.86rem] text-mist-100">{risk.label}</span>
                      <Badge tone={risk.severity}>{risk.severity}</Badge>
                    </div>
                    <p className="mt-1.5 text-[0.78rem] leading-relaxed text-mist-400">{risk.rationale}</p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}

      {tab === 'what-if' && run ? (
        <WhatIfPanel
          simulationId={simulation.id}
          run={run}
          initialOptionId={params.get('option') ?? chosenOptionId ?? undefined}
          today={new Date().toISOString().slice(0, 10)}
          reliability={learning?.reliability ?? 0.72}
          outcomeCount={learning?.outcomeCount ?? 0}
          engineNote={run.engine.note}
        />
      ) : null}

      {tab === 'reality' && run ? (
        comparison ? (
          <div className="space-y-6">
            <PredictionVsReality
              comparison={comparison}
              predictedLabel={targetEvaluation ? `Simulated for ${targetEvaluation.option.code} — ${targetEvaluation.option.name}` : undefined}
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setOutcomeOpen(true)} icon={<ClipboardCheck aria-hidden className="h-4 w-4" />}>
                Update the recorded outcome
              </Button>
              <ButtonLink to="/app/profile" variant="ghost" icon={<GitCompareArrows aria-hidden className="h-4 w-4" />}>
                See how this changed your profile
              </ButtonLink>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No outcome recorded yet"
            description="Once the deadline has passed, record what actually happened. RealityOS scores its own prediction, explains the gap and calibrates your next simulation on it."
            action={
              <Button onClick={() => setOutcomeOpen(true)} magnetic icon={<ClipboardCheck aria-hidden className="h-4 w-4" />}>
                Record outcome
              </Button>
            }
          />
        )
      ) : null}

      {targetEvaluation ? (
        <OutcomeRecorder
          simulationId={simulation.id}
          evaluation={targetEvaluation}
          open={outcomeOpen}
          onClose={() => setOutcomeOpen(false)}
          onRecorded={(result: PredictionComparison) => {
            setComparison(result)
            setTab('reality')
            push('success', 'Outcome recorded — the workload model has been calibrated with it.')
            void detail.reload()
          }}
        />
      ) : null}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this simulation?"
        description="The situation model, runs, predictions and any recorded outcome are removed permanently."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api.deleteSimulation(simulation.id)
                  push('success', 'Simulation deleted.')
                  navigate('/app/simulations')
                } catch {
                  push('error', 'We could not delete that simulation.')
                }
              }}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-[0.85rem] leading-relaxed text-mist-300">
          Your recorded outcome also disappears, which removes its calibration contribution. If you only want it out of the active list, completing
          it by recording an outcome is enough.
        </p>
      </Modal>
    </div>
  )
}
