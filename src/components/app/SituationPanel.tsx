import { useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  Layers,
  ListChecks,
  Pencil,
  RefreshCw,
  Target,
  X,
} from 'lucide-react'
import type { Resource, StructuredSituation } from '@/shared/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Slider, Textarea } from '@/components/ui/Form'
import { InlineNote } from '@/components/ui/Feedback'
import { ProgressBar } from '@/components/ui/Metric'
import { formatDate, relativeDays } from '@/lib/format'

export function SituationPanel({
  situation,
  onSave,
  saving,
  engineNote,
}: {
  situation: StructuredSituation
  onSave: (next: StructuredSituation) => Promise<void> | void
  saving?: boolean
  engineNote?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StructuredSituation>(situation)
  const [error, setError] = useState<string | null>(null)

  const startEditing = () => {
    setDraft(situation)
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (!draft.goal.trim()) {
      setError('Give the goal a short name so the simulation has something to aim at.')
      return
    }
    if (!draft.deliverables.length || draft.deliverables.every((item) => !item.name.trim())) {
      setError('Keep at least one deliverable — it is what the workload estimate is built from.')
      return
    }
    setError(null)
    await onSave(draft)
    setEditing(false)
  }

  const updateDeliverable = (index: number, patch: Partial<StructuredSituation['deliverables'][number]>) => {
    setDraft((current) => ({
      ...current,
      deliverables: current.deliverables.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    }))
  }

  const updateResource = (index: number, patch: Partial<Resource>) => {
    setDraft((current) => ({
      ...current,
      resources: current.resources.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    }))
  }

  return (
    <div className="surface rounded-xl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-800/70 px-4 py-3.5">
        <div>
          <h2 className="text-[0.9rem] font-semibold text-mist-50">Situation model</h2>
          <p className="mt-1 text-[0.78rem] text-mist-500">
            {engineNote ?? 'Structured by the situation agent. Correct anything that looks wrong — the simulation depends on it.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            tone={situation.extractionConfidence > 0.75 ? 'low' : situation.extractionConfidence > 0.55 ? 'medium' : 'high'}
          >
            {Math.round(situation.extractionConfidence * 100)}% extraction confidence
          </Badge>
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} icon={<X aria-hidden className="h-3.5 w-3.5" />}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} loading={saving} icon={<Check aria-hidden className="h-3.5 w-3.5" />}>
                Save changes
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={startEditing} icon={<Pencil aria-hidden className="h-3.5 w-3.5" />}>
              Edit
            </Button>
          )}
        </div>
      </header>

      {error ? (
        <div className="px-4 pt-3.5">
          <InlineNote tone="warning">{error}</InlineNote>
        </div>
      ) : null}

      <div className="grid gap-5 px-4 py-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {editing ? (
            <div className="space-y-3.5">
              <Field label="Goal" htmlFor="situation-goal">
                <Input id="situation-goal" value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Deadline" htmlFor="situation-deadline">
                  <Input
                    id="situation-deadline"
                    type="date"
                    value={draft.deadline ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        deadline: event.target.value || null,
                        deadlineSource: event.target.value ? 'explicit' : 'unknown',
                      })
                    }
                  />
                </Field>
                <Field label="Hours per day" htmlFor="situation-hours">
                  <Input
                    id="situation-hours"
                    type="number"
                    min={0.5}
                    max={14}
                    step={0.5}
                    value={draft.availableHoursPerDay}
                    onChange={(event) => setDraft({ ...draft, availableHoursPerDay: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Active days / week" htmlFor="situation-days">
                  <Input
                    id="situation-days"
                    type="number"
                    min={1}
                    max={7}
                    value={draft.activeDaysPerWeek}
                    onChange={(event) => setDraft({ ...draft, activeDaysPerWeek: Number(event.target.value) })}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Fact icon={<Target aria-hidden className="h-3.5 w-3.5" />} label="Goal" value={situation.goal} />
              <Fact
                icon={<CalendarDays aria-hidden className="h-3.5 w-3.5" />}
                label={`Deadline (${situation.deadlineSource})`}
                value={situation.deadline ? `${formatDate(situation.deadline)} · ${relativeDays(situation.deadline)}` : 'Not stated'}
              />
              <Fact
                icon={<Clock aria-hidden className="h-3.5 w-3.5" />}
                label="Available time"
                value={`${situation.availableHoursPerDay}h/day · ${situation.activeDaysPerWeek} days a week`}
              />
              <Fact
                icon={<Layers aria-hidden className="h-3.5 w-3.5" />}
                label="Complexity / fragmentation"
                value={`${Math.round(situation.complexity * 100)} / ${Math.round(situation.fragmentation * 100)}`}
              />
            </div>
          )}

          <div>
            <p className="mb-2 text-[0.7rem] uppercase tracking-[0.14em] text-mist-500">
              <ListChecks aria-hidden className="inline h-3.5 w-3.5" />
              Deliverables & dependencies
            </p>
            <ul className="space-y-2">
              {(editing ? draft : situation).deliverables.map((deliverable, index) => (
                <li key={deliverable.id} className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-3">
                  {editing ? (
                    <div className="space-y-3">
                      <Input
                        aria-label={`Deliverable ${index + 1} name`}
                        value={deliverable.name}
                        onChange={(event) => updateDeliverable(index, { name: event.target.value })}
                      />
                      <Slider
                        label="Complexity"
                        value={deliverable.complexity}
                        min={0.1}
                        max={1}
                        step={0.05}
                        onChange={(value) => updateDeliverable(index, { complexity: value })}
                        format={(value) => value.toFixed(2)}
                        minLabel="Admin"
                        maxLabel="Deep technical"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            deliverables: current.deliverables.filter((_, position) => position !== index),
                          }))
                        }
                        className="text-[0.74rem] text-mist-500 hover:text-signal-high"
                      >
                        Remove deliverable
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[0.84rem] text-mist-100">{deliverable.name}</span>
                        <span className="num shrink-0 text-[0.7rem] text-mist-500">
                          complexity {deliverable.complexity.toFixed(2)}
                          {deliverable.estimatedHours ? ` · ~${deliverable.estimatedHours}h` : ''}
                        </span>
                      </div>
                      {deliverable.dependencies.length ? (
                        <p className="mt-1 text-[0.72rem] text-mist-500">
                          waits on{' '}
                          {deliverable.dependencies
                            .map((id) => situation.deliverables.find((item) => item.id === id)?.name ?? id)
                            .join(', ')}
                        </p>
                      ) : (
                        <p className="mt-1 text-[0.72rem] text-mist-500">no dependencies</p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {editing ? (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    deliverables: [
                      ...current.deliverables,
                      {
                        id: `d${current.deliverables.length + 1}-${Date.now().toString(36)}`,
                        name: '',
                        complexity: 0.5,
                        dependencies: [],
                      },
                    ],
                  }))
                }
              >
                + Add deliverable
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[0.7rem] uppercase tracking-[0.14em] text-mist-500">Constraints</p>
            {editing ? (
              <Field label="One constraint per line" htmlFor="situation-constraints">
                <Textarea
                  id="situation-constraints"
                  rows={4}
                  value={draft.constraints.join('\n')}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      constraints: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                    })
                  }
                />
              </Field>
            ) : situation.constraints.length ? (
              <ul className="space-y-1.5 text-[0.78rem] text-mist-300">
                {situation.constraints.map((constraint) => (
                  <li key={constraint}>• {constraint}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.78rem] text-mist-500">None identified.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-[0.7rem] uppercase tracking-[0.14em] text-mist-500">Resources</p>
            {editing ? (
              <div className="space-y-2">
                {draft.resources.map((resource, index) => (
                  <div key={`${resource.name}-${index}`} className="grid grid-cols-[1.4fr_1fr_auto] gap-2">
                    <Input
                      aria-label="Resource name"
                      value={resource.name}
                      onChange={(event) => updateResource(index, { name: event.target.value })}
                    />
                    <Select
                      aria-label="Resource availability"
                      value={resource.availability}
                      onChange={(event) => updateResource(index, { availability: event.target.value as Resource['availability'] })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </Select>
                    <button
                      type="button"
                      aria-label="Remove resource"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          resources: current.resources.filter((_, position) => position !== index),
                        }))
                      }
                      className="px-2 text-mist-500 hover:text-signal-high"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, resources: [...current.resources, { name: '', availability: 'medium' }] }))}>
                  + Add resource
                </Button>
              </div>
            ) : situation.resources.length ? (
              <ul className="space-y-2">
                {situation.resources.map((resource) => (
                  <li key={resource.name} className="flex items-center justify-between gap-2 text-[0.78rem]">
                    <span className="text-mist-300">{resource.name}</span>
                    <Badge
                      tone={resource.availability === 'high' ? 'low' : resource.availability === 'medium' ? 'medium' : 'high'}
                    >
                      {resource.availability}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.78rem] text-mist-500">None stated — availability assumed adequate.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-[0.7rem] uppercase tracking-[0.14em] text-mist-500">Identified risks</p>
            <ul className="space-y-2">
              {situation.risks.map((risk) => (
                <li key={risk.label} className="rounded-lg border border-ink-700/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[0.78rem] text-mist-200">{risk.label}</span>
                    <Badge tone={risk.severity}>{risk.severity}</Badge>
                  </div>
                  <p className="mt-1 text-[0.72rem] leading-relaxed text-mist-500">{risk.rationale}</p>
                </li>
              ))}
              {!situation.risks.length ? <li className="text-[0.78rem] text-mist-500">No specific risks identified yet.</li> : null}
            </ul>
          </div>

          {situation.openQuestions.length ? (
            <InlineNote tone="accent">
              <p className="mb-1.5 flex items-center gap-1.5 font-medium text-mist-100">
                <AlertCircle aria-hidden className="h-3.5 w-3.5" />
                Worth answering for a sharper model
              </p>
              <ul className="space-y-1">
                {situation.openQuestions.map((question) => (
                  <li key={question}>• {question}</li>
                ))}
              </ul>
            </InlineNote>
          ) : null}

          {editing ? (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={save} loading={saving} icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}>
                Save changes
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {!editing ? (
        <div className="border-t border-ink-800/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Model confidence</span>
            <ProgressBar value={situation.extractionConfidence * 100} tone={situation.extractionConfidence > 0.75 ? 'low' : 'medium'} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.12em] text-mist-500">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-[0.84rem] leading-snug text-mist-100">{value}</p>
    </div>
  )
}
