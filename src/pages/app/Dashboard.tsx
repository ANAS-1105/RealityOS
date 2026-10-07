import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, CalendarClock, Gauge, Plus, Sparkles, Target } from 'lucide-react'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, Section } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, InlineNote, Skeleton } from '@/components/ui/Feedback'
import { ConfidenceRing } from '@/components/app/ConfidenceRing'
import { SimulationCard } from '@/components/app/SimulationCard'
import { AccuracyTrend } from '@/components/charts/Charts'
import { greeting, relativeDays, statusLabel } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'

export default function Dashboard() {
  const { user, learning, engine } = useSession()
  const { push } = useToast()
  const [refreshKey, setRefreshKey] = useState(0)

  const simulations = useAsync(() => api.listSimulations(), [refreshKey])
  const profile = useAsync(() => api.decisionProfile(), [refreshKey])

  const items = simulations.data?.simulations ?? []
  const active = items.filter((item) => item.status !== 'completed').slice(0, 3)
  const recent = items.slice(0, 5)

  const riskCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0, unknown: 0 }
    for (const item of items) {
      if (item.riskLevel === 'high') counts.high += 1
      else if (item.riskLevel === 'medium') counts.medium += 1
      else if (item.riskLevel === 'low') counts.low += 1
      else counts.unknown += 1
    }
    return counts
  }, [items])

  const deleteSimulation = async (id: string) => {
    try {
      await api.deleteSimulation(id)
      push('success', 'Simulation deleted.')
      setRefreshKey((value) => value + 1)
    } catch {
      push('error', 'We could not delete that simulation. Please try again.')
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.7rem] leading-tight sm:text-[2rem]">{greeting()}, {user?.name?.split(' ')[0] ?? 'there'}.</h1>
          <p className="mt-2 text-[0.95rem] text-mist-400">What decision are you thinking about?</p>
        </div>
        <ButtonLink to="/app/new" size="lg" magnetic icon={<Plus aria-hidden className="h-4 w-4" />}>
          New simulation
        </ButtonLink>
      </header>

      {learning && learning.outcomeCount === 0 ? (
        <InlineNote tone="accent">
          <p className="flex flex-wrap items-center gap-2">
            <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span>
              The workload model currently assumes <strong className="font-medium text-mist-100">72% follow-through</strong> — the population
              prior. Record one real outcome and that number becomes yours.
            </span>
          </p>
        </InlineNote>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Section
          title="Active simulations"
          sub="Decisions in flight, with the model's current read."
          action={
            items.length ? (
              <Link to="/app/simulations" className="text-[0.8rem] text-accent-300 underline-offset-2 hover:underline">
                View all
              </Link>
            ) : null
          }
        >
          {simulations.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : simulations.error ? (
            <ErrorState message="We could not load your simulations." onRetry={simulations.reload} />
          ) : active.length ? (
            <ul className="space-y-3">
              {active.map((simulation) => (
                <SimulationCard key={simulation.id} simulation={simulation} onDelete={deleteSimulation} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No simulations yet"
              description="Your first decision simulation starts here. Describe a situation in plain language and RealityOS will model it, simulate the options and show you the risk."
              action={
                <ButtonLink to="/app/new" magnetic icon={<Plus aria-hidden className="h-4 w-4" />}>
                  Create simulation
                </ButtonLink>
              }
              icon={<Target aria-hidden className="h-5 w-5" />}
            />
          )}
        </Section>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[0.9rem] font-semibold text-mist-50">Risk overview</h2>
                <p className="mt-1 text-[0.78rem] text-mist-500">Across all simulations</p>
              </div>
              <Gauge aria-hidden className="h-4 w-4 text-mist-500" />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'High', value: riskCounts.high, tone: 'text-signal-high' },
                { label: 'Medium', value: riskCounts.medium, tone: 'text-signal-medium' },
                { label: 'Low', value: riskCounts.low, tone: 'text-signal-low' },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3 py-3">
                  <dt className="text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">{row.label}</dt>
                  <dd className={`num mt-1 text-xl ${row.tone}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[0.9rem] font-semibold text-mist-50">Prediction accuracy</h2>
                <p className="mt-1 text-[0.78rem] text-mist-500">
                  How close past simulations landed to what actually happened
                </p>
              </div>
              <BarChart3 aria-hidden className="h-4 w-4 text-mist-500" />
            </div>

            {profile.loading ? (
              <Skeleton className="mt-4 h-24 w-full" />
            ) : profile.data?.profile.predictionAccuracy === null || profile.data === null ? (
              <p className="mt-4 text-[0.82rem] leading-relaxed text-mist-500">
                No recorded outcomes yet. Once you record what happened after a deadline, your accuracy appears here.
              </p>
            ) : (
              <div className="mt-4 flex items-center gap-5">
                <ConfidenceRing
                  value={profile.data.profile.predictionAccuracy}
                  label="accuracy"
                  tone={profile.data.profile.predictionAccuracy >= 80 ? 'low' : 'medium'}
                />
                <div className="min-w-0 flex-1 space-y-1.5 text-[0.78rem] text-mist-400">
                  <p>
                    Time estimation accuracy:{' '}
                    <span className="num text-mist-200">
                      {profile.data.profile.timeEstimationAccuracy === null ? '—' : `${Math.round(profile.data.profile.timeEstimationAccuracy)}%`}
                    </span>
                  </p>
                  <p>
                    Deadline reliability:{' '}
                    <span className="num text-mist-200">
                      {profile.data.profile.deadlineReliability === null ? '—' : `${Math.round(profile.data.profile.deadlineReliability)}%`}
                    </span>
                  </p>
                  <p>
                    Calibration applied:{' '}
                    <span className="num text-mist-200">
                      {profile.data.profile.calibration.sampleSize ? `${profile.data.profile.calibration.sampleSize} outcome(s)` : 'none yet'}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {profile.data && profile.data.profile.trend.length > 1 ? (
              <AccuracyTrend points={profile.data.profile.trend} className="mt-4" height={140} />
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-[0.9rem] font-semibold text-mist-50">Engine</h2>
            <p className="mt-2 text-[0.8rem] leading-relaxed text-mist-400">{engine?.note ?? 'Engine status unavailable.'}</p>
            <div className="mt-3">
              <Badge tone={engine?.mode === 'ai' ? 'violet' : 'neutral'}>
                {engine?.mode === 'ai' ? `Agents · ${engine.model}` : 'Reliability core · local'}
              </Badge>
            </div>
          </Card>
        </div>
      </div>

      <Section title="Recent decisions" sub="The last few situations you modelled.">
        {simulations.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : recent.length ? (
          <ol className="surface rounded-2xl px-5 py-4">
            {recent.map((simulation, index) => (
              <li key={simulation.id} className="relative flex gap-4 py-3">
                <div className="relative flex flex-col items-center">
                  <span className={`mt-1 h-2 w-2 rounded-full ${simulation.riskLevel === 'high' ? 'bg-signal-high' : simulation.riskLevel === 'medium' ? 'bg-signal-medium' : 'bg-signal-low'}`} />
                  {index < recent.length - 1 ? <span className="mt-1 w-px flex-1 bg-ink-700" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/app/simulations/${simulation.id}`} className="truncate text-[0.88rem] text-mist-100 hover:text-accent-300">
                      {simulation.title}
                    </Link>
                    {simulation.isDemo ? <Badge tone="accent">Demo</Badge> : null}
                    <span className="text-[0.72rem] text-mist-500">{statusLabel(simulation.status)}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-mist-500">
                    {simulation.deadline ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock aria-hidden className="h-3.5 w-3.5" />
                        {relativeDays(simulation.deadline)}
                      </span>
                    ) : null}
                    {simulation.topOptionName ? <span>Recommended: {simulation.topOptionName}</span> : null}
                    {simulation.topSuccessProbability !== null ? (
                      <span className="num">completion {Math.round(simulation.topSuccessProbability)}%</span>
                    ) : null}
                  </p>
                </div>
                <Link
                  to={`/app/simulations/${simulation.id}`}
                  className="self-center text-mist-500 transition-colors hover:text-mist-100"
                  aria-label={`Open ${simulation.title}`}
                >
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="Nothing recorded yet" description="Create a simulation and it will show up in this timeline." />
        )}
      </Section>

      {simulations.data && !items.length && !simulations.loading ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await api.seedDemo()
                push('success', 'Demo simulation created.')
                setRefreshKey((value) => value + 1)
              } catch {
                push('error', 'We could not create the demo simulation.')
              }
            }}
          >
            Generate the demo simulation
          </Button>
        </div>
      ) : null}
    </div>
  )
}
