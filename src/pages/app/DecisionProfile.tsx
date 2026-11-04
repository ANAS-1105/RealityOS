import { useSession } from '@/lib/session'
import { useAsync } from '@/lib/hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Section } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Feedback'
import { ProgressBar } from '@/components/ui/Metric'
import { AccuracyTrend } from '@/components/charts/Charts'

interface ProfilePayload {
  profile: {
    predictionAccuracy: number | null
    timeEstimationAccuracy: number | null
    deadlineReliability: number | null
    calibration: { sampleSize: number }
    trend: { label: string; predicted: number; actual: number }[]
  } | null
}

export default function DecisionProfile() {
  const { learning, engine } = useSession()
  const profile = useAsync<ProfilePayload>(
    async () => {
      const response = await fetch('/api/profile/decision-pattern', { credentials: 'include' })
      if (!response.ok) throw new Error('Profile fetch failed')
      return response.json()
    },
    [],
  )

  const stats = profile.data?.profile ?? null
  const trend = stats?.trend ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Decision profile"
        title="How your predictions age"
        description="How your predictions compare with what actually happened."
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Section
            title="Simulated vs actual"
            sub="One point per recorded decision."
          >
            <Card className="p-4">
              {profile.loading ? (
                <Skeleton className="h-64 w-full" />
              ) : trend.length < 2 ? (
                <div className="py-8 text-center">
                  <p className="text-[0.85rem] text-mist-400">
                    Record at least two outcomes to see your accuracy trend.
                  </p>
                </div>
              ) : (
                <AccuracyTrend points={trend} className="mt-2" height={200} />
              )}
            </Card>
          </Section>

          <Section
            title="Calibration"
            sub="Your follow-through, applied to the next simulation."
          >
            <Card className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[0.82rem] text-mist-300">Follow-through prior</span>
                  <span className="num text-mist-50">
                    {learning?.reliability === null ? '—' : `${Math.round((learning?.reliability ?? 0.72) * 100)}%`}
                  </span>
                </div>
                <ProgressBar
                  value={(learning?.reliability ?? 0.72) * 100}
                  tone={(learning?.reliability ?? 0.72) >= 0.75 ? 'low' : 'medium'}
                  height="h-2"
                />
                <p className="text-[0.74rem] text-mist-500">
                  {learning?.outcomeCount === 0
                    ? 'Population prior until you record an outcome.'
                    : `${learning?.outcomeCount} outcome(s) used to calibrate.`}
                </p>
              </div>
            </Card>
          </Section>

          <Section
            title="What the model has learned about you"
            sub="From your recorded decisions."
          >
            <Card className="p-4">
              <ul className="space-y-3 text-[0.85rem]">
                <li className="flex items-center justify-between">
                  <span className="text-mist-300">Time-estimation accuracy</span>
                  <span className="num text-mist-50">
                    {stats?.timeEstimationAccuracy == null ? '—' : `${Math.round(stats.timeEstimationAccuracy)}%`}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-mist-300">Deadline reliability</span>
                  <span className="num text-mist-50">
                    {stats?.deadlineReliability == null ? '—' : `${Math.round(stats.deadlineReliability)}%`}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-mist-300">Prediction accuracy</span>
                  <span className="num text-mist-50">
                    {stats?.predictionAccuracy == null ? '—' : `${Math.round(stats.predictionAccuracy)}%`}
                  </span>
                </li>
              </ul>
            </Card>
          </Section>
        </div>

        <Card className="p-5">
          <h2 className="text-[0.85rem] font-semibold text-mist-50">Engine</h2>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-mist-400">{engine?.note ?? 'Engine status unavailable.'}</p>
          <div className="mt-3">
            <Badge tone={engine?.mode === 'ai' ? 'violet' : 'accent'}>
              {engine?.mode === 'ai' ? `Agents · ${engine.model}` : 'Reliability core · local'}
            </Badge>
          </div>

          <div className="mt-6 border-t border-ink-800/70 pt-5">
            <h2 className="text-[0.85rem] font-semibold text-mist-50">How this is built</h2>
            <p className="mt-2 text-[0.78rem] leading-relaxed text-mist-400">
              Every probability on this screen comes from a trained, explainable model in the backend — not from a language model guessing a number. When an LLM is configured, it only supplies the language: the strategies, the wording, the critique.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
