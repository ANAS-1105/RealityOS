import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Plus, Sparkles, Target } from 'lucide-react'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, Section } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, InlineNote, Skeleton } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ConfidenceRing } from '@/components/app/ConfidenceRing'
import { SimulationCard } from '@/components/app/SimulationCard'
import { AccuracyTrend } from '@/components/charts/Charts'
import { greeting } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import type { SimulationSummary } from '@/shared/types'

export default function Dashboard() {
  const { user, learning, engine } = useSession()
  const { push } = useToast()
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<SimulationSummary | null>(null)

  const simulations = useAsync(() => api.listSimulations(), [refreshKey])
  const profile = useAsync(() => api.decisionProfile(), [refreshKey])

  const items = simulations.data?.simulations ?? []
  const active = items.filter((item) => item.status !== 'completed').slice(0, 3)

  // Deleting is permanent, so it asks first — the same confirmation the history
  // page uses.
  const deleteSimulation = async () => {
    if (!pendingDelete) return
    try {
      await api.deleteSimulation(pendingDelete.id)
      push('success', 'Simulation deleted.')
      setPendingDelete(null)
      setRefreshKey((value) => value + 1)
    } catch {
      push('error', 'We could not delete that simulation. Please try again.')
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.6rem] leading-tight sm:text-[1.9rem]">{greeting()}, {user?.name?.split(' ')[0] ?? 'there'}.</h1>
          <p className="mt-1.5 text-[0.92rem] text-mist-400">What decision are you thinking about?</p>
        </div>
        <ButtonLink to="/app/new" size="lg" magnetic icon={<Plus aria-hidden className="h-4 w-4" />}>
          New simulation
        </ButtonLink>
      </header>

      {learning && learning.outcomeCount === 0 ? (
        <InlineNote tone="accent">
          <p className="flex items-center gap-2">
            <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span>
              The model assumes 72% follow-through (population prior). Record one outcome to make it yours.
            </span>
          </p>
        </InlineNote>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Section
          title="Active simulations"
          sub="Decisions in flight."
          action={items.length ? (
            <Link to="/app/simulations" className="text-[0.8rem] text-accent-300 underline-offset-2 hover:underline">
              View all
            </Link>
          ) : null}
        >
          {simulations.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-22 w-full" />
              <Skeleton className="h-22 w-full" />
            </div>
          ) : simulations.error ? (
            <ErrorState message="We could not load your simulations." onRetry={simulations.reload} />
          ) : active.length ? (
            <ul className="space-y-2.5">
              {active.map((simulation) => (
                <SimulationCard key={simulation.id} simulation={simulation} onDelete={() => setPendingDelete(simulation)} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No simulations yet"
              description="Describe a situation and RealityOS will model it."
              action={<ButtonLink to="/app/new" magnetic icon={<Plus aria-hidden className="h-4 w-4" />}>Create simulation</ButtonLink>}
              icon={<Target aria-hidden className="h-5 w-5" />}
            />
          )}
        </Section>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[0.85rem] font-semibold text-mist-50">Prediction accuracy</h2>
                <p className="mt-0.5 text-[0.74rem] text-mist-500">Simulated vs actual</p>
              </div>
              <BarChart3 aria-hidden className="h-4 w-4 text-mist-500" />
            </div>

            {profile.loading ? (
              <Skeleton className="mt-3 h-20 w-full" />
            ) : profile.data?.profile.predictionAccuracy === null || profile.data === null ? (
              <p className="mt-3 text-[0.8rem] leading-relaxed text-mist-500">
                Record an outcome to see your accuracy here.
              </p>
            ) : (
              <div className="mt-3 flex items-center gap-4">
                <ConfidenceRing
                  value={profile.data.profile.predictionAccuracy}
                  label="accuracy"
                  tone={profile.data.profile.predictionAccuracy >= 80 ? 'low' : 'medium'}
                />
                <div className="min-w-0 flex-1 space-y-1 text-[0.74rem] text-mist-400">
                  <p>Time estimation accuracy: <span className="num text-mist-200">{profile.data.profile.timeEstimationAccuracy === null ? '—' : `${Math.round(profile.data.profile.timeEstimationAccuracy)}%`}</span></p>
                  <p>Deadline reliability: <span className="num text-mist-200">{profile.data.profile.deadlineReliability === null ? '—' : `${Math.round(profile.data.profile.deadlineReliability)}%`}</span></p>
                  <p>Calibration applied: <span className="num text-mist-200">{profile.data.profile.calibration.sampleSize ? `${profile.data.profile.calibration.sampleSize} outcome(s)` : 'none yet'}</span></p>
                </div>
              </div>
            )}

            {profile.data && profile.data.profile.trend.length > 1 ? (
              <AccuracyTrend points={profile.data.profile.trend} className="mt-3" height={120} />
            ) : null}
          </Card>

          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <h2 className="text-[0.85rem] font-semibold text-mist-50">Engine</h2>
              <p className="mt-0.5 truncate text-[0.74rem] text-mist-500">{engine?.mode === 'ai' ? `Agents · ${engine.model}` : 'Local reliability core'}</p>
            </div>
            <Badge tone={engine?.mode === 'ai' ? 'violet' : 'accent'}>{engine?.mode === 'ai' ? 'AI' : 'Local'}</Badge>
          </Card>
        </div>
      </div>

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

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title ?? ''}”?`}
        description="This removes the simulation and its outcome permanently."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={deleteSimulation}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-[0.85rem] leading-relaxed text-mist-300">
          If this simulation contributed to your decision profile, deleting it removes that contribution too.
        </p>
      </Modal>
    </div>
  )
}
