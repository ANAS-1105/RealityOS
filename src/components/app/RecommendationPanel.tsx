import { CheckCircle2, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react'
import type { CriticChallenge, Recommendation } from '@/shared/types'
import { Badge } from '@/components/ui/Badge'
import { ScoreBar } from '@/components/ui/Metric'

export function RecommendationPanel({
  recommendation,
  optionCode,
  optionName,
  critiques,
}: {
  recommendation: Recommendation
  optionCode: string
  optionName: string
  critiques: CriticChallenge[]
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
      <div className="rounded-2xl border border-accent-400/35 bg-ink-900/40 p-5 relative">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl" aria-hidden style={{ background: 'radial-gradient(circle, rgba(74,107,255,0.22), transparent 68%)' }} />
        <div className="relative">
          <Badge tone="accent">
            <Sparkles aria-hidden className="h-3 w-3" />
            Recommended
          </Badge>
          <h2 className="mt-3 text-xl font-semibold text-mist-50">Option {optionCode} — {optionName}</h2>
          <p className="mt-1.5 text-[0.85rem] text-mist-400">{recommendation.headline}</p>

          <ul className="mt-4 space-y-2.5">
            {recommendation.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2.5 text-[0.85rem] text-mist-200">
                <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-low" />
                <span className="leading-relaxed">{reason}</span>
              </li>
            ))}
          </ul>

          {recommendation.whyNot.length ? (
            <div className="mt-5 rounded-xl border border-ink-700/60 bg-ink-900/50 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">
                <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
                Why not the runner-up
              </p>
              {recommendation.whyNot.map((entry) => (
                <p key={entry.optionId} className="text-[0.82rem] leading-relaxed text-mist-300">{entry.reason}</p>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-3.5">
              <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Score</p>
              <p className="mt-1 text-xl num text-accent-300">{recommendation.score.toFixed(1)}</p>
              <p className="mt-1 text-[0.7rem] text-mist-500">Weighted across the five factors below</p>
            </div>
            <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-3.5">
              <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Confidence</p>
              <p className="mt-1 text-xl num text-mist-100">{Math.round(recommendation.confidence)}</p>
              <p className="mt-1 text-[0.7rem] text-mist-500">Data completeness plus your track record</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-2xl border border-ink-800/70 bg-ink-900/40 p-5">
          <h3 className="text-[0.85rem] font-semibold text-mist-50">How this was scored</h3>
          <p className="mt-1 text-[0.74rem] text-mist-500">Fixed, published weights — not a black box.</p>
          <div className="mt-4 space-y-3.5">
            {recommendation.scoreBreakdown.map((component) => (
              <ScoreBar key={component.label} label={component.label} value={component.value} weight={component.weight} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-ink-800/70 bg-ink-900/40 p-5">
          <h3 className="flex items-center gap-2 text-[0.85rem] font-semibold text-mist-50">
            <ShieldAlert aria-hidden className="h-4 w-4 text-signal-medium" />
            What the critic agent challenged
          </h3>
          <ul className="mt-3.5 space-y-3">
            {critiques.map((critique) => (
              <li key={`${critique.target}-${critique.challenge}`} className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[0.8rem] font-medium text-mist-200">{critique.target}</span>
                  <Badge tone={critique.severity}>{critique.severity}</Badge>
                </div>
                <p className="mt-1.5 text-[0.8rem] leading-relaxed text-mist-400">{critique.challenge}</p>
              </li>
            ))}
            {!critiques.length ? <li className="text-[0.8rem] text-mist-500">No challenges raised.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  )
}
