import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, ChevronDown, Clock, Gauge, Layers, ShieldAlert, Sparkles, Timer } from 'lucide-react'
import type { OptionEvaluation } from '@/shared/types'
import { Badge, RiskBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DeltaChip, MetricValue, ProgressBar } from '@/components/ui/Metric'
import { CoverageBars } from '@/components/charts/Charts'
import { formatDate, hours as formatHours } from '@/lib/format'
import { riskLevelFrom } from '@/shared/engine/simulate'

const RISK_TONE = { low: 'low', medium: 'medium', high: 'high' } as const

/**
 * One simulated decision path. Everything a person needs to argue with the
 * recommendation is on the card: the headline numbers, the ML model's own
 * explainability, the rule-based cross-check and the AI's separate estimate.
 */
export function DecisionCard({
  evaluation,
  recommended,
  chosen,
  onChoose,
  onExplore,
  index = 0,
}: {
  evaluation: OptionEvaluation
  recommended?: boolean
  chosen?: boolean
  onChoose?: (optionId: string) => void
  onExplore?: (optionId: string) => void
  index?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const { option, projection, risks } = evaluation
  const level = riskLevelFrom(projection.deadlineRisk, projection.stressIndex)
  const topContributors = projection.mlModel.contributions.slice(0, 3)

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`surface relative flex flex-col rounded-2xl p-5 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 ${
        recommended ? 'border-accent-400/45 shadow-glow' : 'hover:border-ink-500/70'
      } ${chosen ? 'border-signal-low/45' : ''}`}
    >
      {recommended ? (
        <Badge tone="accent" className="absolute -top-3 left-5 bg-ink-950">
          <Sparkles aria-hidden className="h-3 w-3" />
          Recommended
        </Badge>
      ) : null}
      {chosen ? (
        <Badge tone="low" className="absolute -top-3 right-5 bg-ink-950">
          <Check aria-hidden className="h-3 w-3" />
          Your path
        </Badge>
      ) : null}

      <header className="mb-4">
        <p className="num text-[0.72rem] uppercase tracking-[0.18em] text-mist-500">Option {option.code}</p>
        <h3 className="mt-1 text-[1.05rem] font-semibold text-mist-50">{option.name}</h3>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-mist-400">{option.strategy}</p>
      </header>

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Completion probability</p>
          <p className="mt-1 text-[2rem] font-semibold leading-none text-mist-50">
            <MetricValue value={projection.successProbability * 100} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Confidence</p>
          <p className="num mt-1 text-lg text-mist-200">{Math.round(projection.confidence)}</p>
        </div>
      </div>

      <div className="mb-4">
        <RiskBadge level={level} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.8rem]">
        <div>
          <dt className="flex items-center gap-1.5 text-mist-500">
            <Clock aria-hidden className="h-3.5 w-3.5" />
            Expected finish
          </dt>
          <dd className="num mt-0.5 text-mist-100">
            {formatDate(projection.expectedCompletionDate)}
            {projection.bufferDays >= 0 ? (
              <span className="ml-1.5 text-[0.72rem] text-signal-low">+{projection.bufferDays}d spare</span>
            ) : (
              <span className="ml-1.5 text-[0.72rem] text-signal-high">{Math.abs(projection.bufferDays)}d late</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-mist-500">
            <Timer aria-hidden className="h-3.5 w-3.5" />
            Time required
          </dt>
          <dd className="num mt-0.5 text-mist-100">
            {formatHours(projection.scheduledHours)} / {formatHours(projection.requiredHours)} needed
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-mist-500">
            <Gauge aria-hidden className="h-3.5 w-3.5" />
            Pressure
          </dt>
          <dd className="mt-0.5 flex items-center gap-2">
            <span className="num text-mist-100">{Math.round(projection.stressIndex)}/100</span>
            <ProgressBar value={projection.stressIndex} tone={projection.stressIndex > 70 ? 'high' : 'violet'} height="h-1" />
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-mist-500">
            <Layers aria-hidden className="h-3.5 w-3.5" />
            Flexibility
          </dt>
          <dd className="num mt-0.5 text-mist-100">{Math.round(projection.flexibility)}/100</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center gap-2 text-[0.72rem] text-mist-500">
        <span>Deadline risk</span>
        <ProgressBar
          value={projection.deadlineRisk * 100}
          tone={RISK_TONE[level]}
          height="h-1"
          label="Deadline risk"
        />
        <span className="num">{Math.round(projection.deadlineRisk * 100)}%</span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="mt-4 flex items-center justify-between rounded-lg border border-ink-700/60 px-3 py-2 text-[0.78rem] text-mist-300 transition-colors hover:border-ink-600 hover:text-mist-100"
      >
        Why these numbers
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded ? (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
          <div className="mt-4 space-y-4 text-[0.8rem]">
            <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-3.5">
              <p className="mb-2 text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">ML model (v{projection.mlModel.version}) · what moved it</p>
              <ul className="space-y-1.5">
                {topContributors.map((contribution) => (
                  <li key={contribution.feature} className="flex items-center justify-between gap-3">
                    <span className="text-mist-400">{contribution.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="num text-mist-500">{contribution.value.toFixed(2)}σ</span>
                      <DeltaChip change={contribution.contribution * 10} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[0.72rem] leading-relaxed text-mist-500">
                Sign shows the direction this factor pushed the completion probability. Source: {projection.mlModel.source.replace(/-/g, ' ')}.
              </p>
            </div>

            <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-3.5">
              <p className="mb-2 text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Rule-based check</p>
              <p className="text-mist-300">{projection.heuristic.note}</p>
              <p className="mt-1.5 text-[0.72rem] text-mist-500">
                Transparent feasibility check: {Math.round(projection.heuristic.successProbability * 100)}% completion ·{' '}
                {Math.round(projection.heuristic.deadlineRisk * 100)}% deadline risk
              </p>
            </div>

            {option.aiEstimate ? (
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/6 p-3.5">
                <p className="mb-2 text-[0.7rem] uppercase tracking-[0.12em] text-violet-400">AI estimate (separate from the model)</p>
                <p className="num text-mist-200">{Math.round(option.aiEstimate.successProbability * 100)}% completion</p>
                <p className="mt-1.5 text-[0.78rem] text-mist-400">{option.aiEstimate.rationale}</p>
              </div>
            ) : (
              <p className="text-[0.75rem] text-mist-500">
                No AI estimate for this option — the local planner produced it without a language model.
              </p>
            )}

            <div>
              <p className="mb-2 text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Coverage per deliverable</p>
              <CoverageBars coverage={projection.coverage} />
            </div>

            {option.assumptions.length ? (
              <div>
                <p className="mb-1.5 text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Assumptions</p>
                <ul className="space-y-1 text-mist-300">
                  {option.assumptions.map((assumption) => (
                    <li key={assumption}>• {assumption}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {option.tradeoffs.length ? (
              <div>
                <p className="mb-1.5 text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Trade-offs</p>
                <ul className="space-y-1 text-mist-300">
                  {option.tradeoffs.map((tradeoff) => (
                    <li key={tradeoff}>• {tradeoff}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {risks.length ? (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">
                  <ShieldAlert aria-hidden className="h-3.5 w-3.5" />
                  Risks
                </p>
                <ul className="space-y-2">
                  {risks.map((risk) => (
                    <li key={risk.label} className="rounded-lg border border-ink-700/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-mist-200">{risk.label}</span>
                        <Badge tone={risk.severity}>{risk.severity}</Badge>
                      </div>
                      <p className="mt-1 text-[0.75rem] leading-relaxed text-mist-500">{risk.rationale}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {onChoose ? (
          <Button
            variant={chosen ? 'secondary' : 'primary'}
            size="sm"
            icon={chosen ? <Check aria-hidden className="h-3.5 w-3.5" /> : undefined}
            onClick={() => onChoose(option.id)}
            magnetic={!chosen && recommended}
          >
            {chosen ? 'Chosen path' : 'Choose this path'}
          </Button>
        ) : null}
        {onExplore ? (
          <Button variant="ghost" size="sm" onClick={() => onExplore(option.id)}>
            Explore what-if
          </Button>
        ) : null}
      </div>
    </motion.article>
  )
}
