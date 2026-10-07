import { useMemo } from 'react'
import type { OptionEvaluation } from '@/shared/types'
import { ComparisonRadar, OptionBars } from '@/components/charts/Charts'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/format'

/**
 * Side-by-side comparison. Best value in each row is marked, so the trade-offs
 * are readable in a couple of seconds instead of a paragraph.
 */
export function ComparisonPanel({ evaluations, onExplore }: { evaluations: OptionEvaluation[]; onExplore?: (optionId: string) => void }) {
  const rows = useMemo(
    () => [
      {
        label: 'Success probability',
        value: (evaluation: OptionEvaluation) => evaluation.projection.successProbability * 100,
        format: (value: number) => `${Math.round(value)}%`,
        higherIsBetter: true,
      },
      {
        label: 'Deadline risk',
        value: (evaluation: OptionEvaluation) => evaluation.projection.deadlineRisk * 100,
        format: (value: number) => `${Math.round(value)}%`,
        higherIsBetter: false,
      },
      {
        label: 'Resource usage',
        value: (evaluation: OptionEvaluation) => evaluation.projection.capacityUtilization * 100,
        format: (value: number) => `${Math.round(value)}%`,
        higherIsBetter: false,
      },
      {
        label: 'Stress estimate',
        value: (evaluation: OptionEvaluation) => evaluation.projection.stressIndex,
        format: (value: number) => `${Math.round(value)}/100`,
        higherIsBetter: false,
      },
      {
        label: 'Flexibility',
        value: (evaluation: OptionEvaluation) => evaluation.projection.flexibility,
        format: (value: number) => `${Math.round(value)}/100`,
        higherIsBetter: true,
      },
    ],
    [],
  )

  const expectedOutcome = (evaluation: OptionEvaluation) =>
    evaluation.projection.bufferDays >= 0
      ? `${formatDate(evaluation.projection.expectedCompletionDate)} · ${evaluation.projection.bufferDays}d spare`
      : `${formatDate(evaluation.projection.expectedCompletionDate)} · ${Math.abs(evaluation.projection.bufferDays)}d late`

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface rounded-2xl p-5">
          <h3 className="text-[0.9rem] font-semibold text-mist-50">Trade-off shape</h3>
          <p className="mt-1 text-[0.78rem] text-mist-500">All axes are “higher is better”, normalised to 100.</p>
          <ComparisonRadar evaluations={evaluations} className="mt-3" />
        </div>
        <div className="surface rounded-2xl p-5">
          <h3 className="text-[0.9rem] font-semibold text-mist-50">Headline numbers</h3>
          <p className="mt-1 text-[0.78rem] text-mist-500">Completion, deadline risk and workload pressure per option.</p>
          <OptionBars evaluations={evaluations} className="mt-3" />
        </div>
      </div>

      <div className="surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">Decision comparison across simulated options</caption>
            <thead>
              <tr className="border-b border-ink-800/80 text-[0.72rem] uppercase tracking-[0.12em] text-mist-500">
                <th scope="col" className="px-5 py-3.5 font-medium">
                  Metric
                </th>
                {evaluations.map((evaluation) => (
                  <th key={evaluation.option.id} scope="col" className="px-5 py-3.5 font-medium">
                    <span className="num text-mist-400">{evaluation.option.code}</span>
                    <span className="ml-2 font-sans normal-case tracking-normal text-mist-200">{evaluation.option.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const values = evaluations.map(row.value)
                const best = row.higherIsBetter ? Math.max(...values) : Math.min(...values)
                return (
                  <tr key={row.label} className="border-b border-ink-800/60 last:border-0">
                    <th scope="row" className="px-5 py-3.5 text-[0.82rem] font-normal text-mist-400">
                      {row.label}
                    </th>
                    {evaluations.map((evaluation, index) => (
                      <td key={evaluation.option.id} className="px-5 py-3.5">
                        <span className="flex items-center gap-2">
                          <span className={`num text-[0.85rem] ${values[index] === best ? 'text-mist-50' : 'text-mist-300'}`}>
                            {row.format(values[index]!)}
                          </span>
                          {values[index] === best ? <Badge tone="accent">best</Badge> : null}
                        </span>
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr>
                <th scope="row" className="px-5 py-3.5 text-[0.82rem] font-normal text-mist-400">
                  Expected outcome
                </th>
                {evaluations.map((evaluation) => (
                  <td key={evaluation.option.id} className="px-5 py-3.5 text-[0.82rem] text-mist-300">
                    {expectedOutcome(evaluation)}
                    {onExplore ? (
                      <button
                        type="button"
                        onClick={() => onExplore(evaluation.option.id)}
                        className="ml-2 text-[0.75rem] text-accent-300 underline-offset-2 hover:underline"
                      >
                        what-if
                      </button>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
