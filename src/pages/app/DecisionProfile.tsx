import { motion } from 'motion/react'
import { Activity, Brain, ClipboardCheck, Gauge, Timer, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { Card, Section } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { ConfidenceRing } from '@/components/app/ConfidenceRing'
import { AccuracyTrend } from '@/components/charts/Charts'
import { Stat } from '@/components/ui/Metric'
import { MODEL_CARD } from '@/shared/engine/ml'
import { DECISION_STYLE_LABELS, USE_CASE_LABELS } from '@/shared/demo'
import { signed } from '@/lib/format'

/** The personal decision profile: what the platform has learned about how you plan. */
export default function DecisionProfile() {
  const profile = useAsync(() => api.decisionProfile(), [])
  const data = profile.data?.profile

  return (
    <div>
      <PageHeader
        eyebrow="Personal decision profile"
        title="How you actually decide"
        description="Built only from your own simulations and recorded outcomes. Nothing here is population data — it is your pattern."
        actions={
          <ButtonLink to="/app/new" variant="secondary">
            Start another simulation
          </ButtonLink>
        }
      />

      {profile.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-28 w-full" />
          ))}
        </div>
      ) : profile.error ? (
        <ErrorState message="We could not load your decision profile." onRetry={profile.reload} />
      ) : !data || data.outcomes === 0 ? (
        <EmptyState
          title="No recorded outcomes yet"
          description="Your profile is built from what actually happened. Run a simulation, decide, then record the outcome once the deadline has passed — accuracy, reliability and calibration all come from there."
          action={
            <ButtonLink to="/app/simulations" magnetic>
              Go to your simulations
            </ButtonLink>
          }
          icon={<ClipboardCheck aria-hidden className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_repeat(2,minmax(0,1fr))]">
            <Card className="flex items-center gap-5 p-5">
              <ConfidenceRing
                value={data.predictionAccuracy}
                size={104}
                label="accuracy"
                tone={(data.predictionAccuracy ?? 0) >= 80 ? 'low' : 'medium'}
              />
              <div>
                <h2 className="text-[0.95rem] font-semibold text-mist-50">Prediction accuracy</h2>
                <p className="mt-1 text-[0.8rem] leading-relaxed text-mist-400">
                  How close the simulated completion probability landed to what actually happened across {data.outcomes} recorded outcome
                  {data.outcomes === 1 ? '' : 's'}.
                </p>
                {data.brierScore !== null ? (
                  <p className="mt-2 text-[0.75rem] text-mist-500">
                    Brier score <span className="num text-mist-300">{data.brierScore.toFixed(3)}</span> (lower is better; 0.25 is uninformative)
                  </p>
                ) : null}
              </div>
            </Card>
            <Stat
              label="Time estimation accuracy"
              value={data.timeEstimationAccuracy === null ? '—' : `${Math.round(data.timeEstimationAccuracy)}%`}
              sub="Hours spent vs hours expected"
              tone={(data.timeEstimationAccuracy ?? 100) < 75 ? 'warning' : 'positive'}
            />
            <Stat
              label="Deadline reliability"
              value={data.deadlineReliability === null ? '—' : `${Math.round(data.deadlineReliability)}%`}
              sub="Decisions that finished on time"
              tone={(data.deadlineReliability ?? 100) < 80 ? 'warning' : 'positive'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Risk tendency"
              value={
                data.riskTendency === 'unknown'
                  ? 'Still forming'
                  : data.riskTendency.charAt(0).toUpperCase() + data.riskTendency.slice(1)
              }
              sub="Average deadline risk you accept"
              tone={data.riskTendency === 'aggressive' ? 'warning' : 'default'}
            />
            <Stat
              label="Average pressure felt"
              value={data.averageStress === null ? '—' : `${Math.round(data.averageStress)}/100`}
              sub="Self-reported after the fact"
              tone={(data.averageStress ?? 0) > 72 ? 'warning' : 'default'}
            />
            <Stat label="Simulations" value={String(data.simulations)} sub={`${data.outcomes} with recorded outcomes`} />
            <Stat
              label="Model calibration"
              value={data.calibration.sampleSize ? `${data.calibration.sampleSize} outcome(s)` : 'None yet'}
              sub={
                data.calibration.sampleSize
                  ? `Success bias ${signed(data.calibration.successBias * 100, 1, ' pts')}`
                  : 'Uses the population prior'
              }
            />
          </div>

          <Section
            title="What the platform has noticed"
            sub="Short, specific observations derived from your recorded outcomes — each one changes how the next simulation is sized."
          >
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.insights.map((insight, index) => (
                <motion.li
                  key={insight.title}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className={`surface rounded-xl px-4 py-3.5 ${
                    insight.tone === 'warning' ? 'border-signal-medium/30' : insight.tone === 'positive' ? 'border-signal-low/25' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[0.88rem] font-medium text-mist-50">{insight.title}</h3>
                    <Badge tone={insight.tone === 'warning' ? 'medium' : insight.tone === 'positive' ? 'low' : 'neutral'}>
                      {insight.tone === 'warning' ? 'watch' : insight.tone === 'positive' ? 'strength' : 'note'}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-mist-400">{insight.detail}</p>
                </motion.li>
              ))}
            </ul>
          </Section>

          {data.trend.length > 1 ? (
            <Section title="Simulated vs actual" sub="One point per recorded decision, oldest first.">
              <Card className="p-5">
                <AccuracyTrend points={data.trend} />
              </Card>
            </Section>
          ) : null}

          <Section
            title="Your planning style"
            sub="Set during onboarding; it affects presentation, not the numbers."
          >
            <Card className="flex flex-wrap items-center gap-3 p-5 text-[0.85rem] text-mist-300">
              <Badge tone="accent">
                <Brain aria-hidden className="h-3 w-3" />
                {USE_CASE_LABELS[(data.useCase ?? 'other') as keyof typeof USE_CASE_LABELS]}
              </Badge>
              <Badge tone="violet">{DECISION_STYLE_LABELS[(data.decisionStyle ?? 'balanced') as keyof typeof DECISION_STYLE_LABELS]}</Badge>
              <span className="text-mist-500">
                Change these in <ButtonLink to="/app/settings" variant="quiet" size="sm" className="px-1 underline">Settings</ButtonLink>
              </span>
            </Card>
          </Section>

          <Section title="How RealityOS learns" sub="The mechanism behind the numbers above.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <Timer aria-hidden className="h-4 w-4 text-accent-300" />
                <h3 className="mt-3 text-[0.9rem] font-medium text-mist-50">Follow-through estimate</h3>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-mist-400">
                  Each recorded outcome updates a shrunk estimate of how much of your planned hours actually materialise. It starts at the 72%
                  population prior and becomes yours as evidence accumulates.
                </p>
              </Card>
              <Card className="p-5">
                <Gauge aria-hidden className="h-4 w-4 text-violet-400" />
                <h3 className="mt-3 text-[0.9rem] font-medium text-mist-50">Bias correction</h3>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-mist-400">
                  If your outcomes consistently beat or trail the simulation, that gap is measured and applied to the next prediction with
                  shrinkage of n/(n+5) — so a single surprise cannot swing the model.
                </p>
              </Card>
              <Card className="p-5">
                <TrendingUp aria-hidden className="h-4 w-4 text-signal-low" />
                <h3 className="mt-3 text-[0.9rem] font-medium text-mist-50">Refit on real data</h3>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-mist-400">
                  Every outcome is stored as a feature row (model v{MODEL_CARD.version}, {MODEL_CARD.features.length} features). Export them
                  from Settings and refit the weights on your own history with{' '}
                  <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[0.72rem]">npm run train -- --real</code>.
                </p>
              </Card>
            </div>
          </Section>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Completion model" value={`AUC ${MODEL_CARD.metrics.success.auc.toFixed(2)}`} sub="Held-out cohort test set" />
            <Stat label="Deadline model" value={`AUC ${MODEL_CARD.metrics.deadlineMiss.auc.toFixed(2)}`} sub={`Brier ${MODEL_CARD.metrics.deadlineMiss.brier.toFixed(3)}`} />
            <Stat label="Pressure model" value={`R² ${MODEL_CARD.metrics.stress.r2.toFixed(2)}`} sub={`MAE ${MODEL_CARD.metrics.stress.mae.toFixed(3)}`} />
          </div>

          <p className="flex items-center gap-2 text-[0.78rem] text-mist-500">
            <Activity aria-hidden className="h-3.5 w-3.5" />
            {MODEL_CARD.provenance}
          </p>
        </div>
      )}
    </div>
  )
}
