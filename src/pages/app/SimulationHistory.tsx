import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Search, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { PageHeader } from '@/components/layout/PageHeader'
import { ButtonLink, Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { SimulationCard } from '@/components/app/SimulationCard'
import { useToast } from '@/components/ui/Toast'
import type { SimulationSummary } from '@/shared/types'

type Filter = 'all' | 'active' | 'completed' | 'demo'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Outcome recorded' },
  { key: 'demo', label: 'Demo' },
]

export default function SimulationHistory() {
  const { push } = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<SimulationSummary | null>(null)
  const list = useAsync(() => api.listSimulations(), [])
  const simulations = list.data?.simulations ?? []

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return simulations.filter((simulation) => {
      if (filter === 'active' && simulation.status === 'completed') return false
      if (filter === 'completed' && simulation.status !== 'completed') return false
      if (filter === 'demo' && !simulation.isDemo) return false
      if (!term) return true
      return `${simulation.title} ${simulation.goal ?? ''} ${simulation.topOptionName ?? ''}`.toLowerCase().includes(term)
    })
  }, [simulations, filter, query])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await api.deleteSimulation(pendingDelete.id)
      push('success', 'Simulation deleted.')
      setPendingDelete(null)
      list.reload()
    } catch {
      push('error', 'We could not delete that simulation.')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Decision history"
        title="Every decision you have simulated"
        description="Completed decisions keep their recorded outcome and feed your decision profile."
        actions={
          <ButtonLink to="/app/new" magnetic icon={<Plus aria-hidden className="h-4 w-4" />}>
            New simulation
          </ButtonLink>
        }
      />

      {simulations.length ? (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
                aria-pressed={filter === entry.key}
                className={`rounded-lg px-3 py-1.5 text-[0.8rem] transition-colors ${
                  filter === entry.key ? 'bg-ink-800/90 text-mist-50' : 'text-mist-400 hover:bg-ink-900/60 hover:text-mist-100'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search simulations"
              aria-label="Search simulations"
              className="w-full rounded-xl border border-ink-700/80 bg-ink-900/70 py-2.5 pl-9 pr-3 text-sm text-mist-100 placeholder:text-mist-500 focus:border-accent-400/70 focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      {list.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : list.error ? (
        <ErrorState message="We could not load your simulations." onRetry={list.reload} />
      ) : filtered.length ? (
        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {filtered.map((simulation) => (
            <SimulationCard key={simulation.id} simulation={simulation} onDelete={() => setPendingDelete(simulation)} />
          ))}
        </motion.ul>
      ) : simulations.length ? (
        <EmptyState
          title="Nothing matches that filter"
          description="Try a different filter or clear the search term."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setFilter('all')
                setQuery('')
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          title="No simulations yet"
          description="Your first decision simulation starts here. Describe a situation and RealityOS will model it, simulate the options and show you the risks."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink to="/app/new" magnetic icon={<Plus aria-hidden className="h-4 w-4" />}>
                Create simulation
              </ButtonLink>
              <Button
                variant="secondary"
                icon={<Sparkles aria-hidden className="h-4 w-4" />}
                onClick={async () => {
                  try {
                    await api.seedDemo()
                    push('success', 'Demo simulation created.')
                    list.reload()
                  } catch {
                    push('error', 'We could not create the demo simulation.')
                  }
                }}
              >
                Load the demo scenario
              </Button>
            </div>
          }
        />
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title ?? ''}”?`}
        description="The situation model, every run, the predictions and any recorded outcome are removed permanently."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
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
