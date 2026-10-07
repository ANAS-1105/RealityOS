import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronDown, FileText, ImageIcon, Info, Mic, Paperclip, Sparkles, Square, Trash2, Wand2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { ACCEPT_ATTRIBUTE } from '@/lib/documents'
import { useAttachments } from '@/lib/useAttachments'
import { useSpeechToText } from '@/lib/voice'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, SegmentedControl, Textarea } from '@/components/ui/Form'
import { ErrorState, InlineNote } from '@/components/ui/Feedback'
import { DEMO_SCENARIO } from '@/shared/demo'

type Priority = 'speed' | 'quality' | 'balance' | 'risk'

const PLACEHOLDER = `I have an exam next Friday, a project due Monday, and three hours available each day...

Include the messy details — classes, shifts, a slow laptop, the help you can and can't get. The more the model knows, the sharper the projection.`

/** The create-simulation screen: text, voice, files, then analyse. */
export default function NewSimulation() {
  const navigate = useNavigate()
  const { attachments, busy, add, remove, extractedChars } = useAttachments()
  const speech = useSpeechToText()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [description, setDescription] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [goal, setGoal] = useState('')
  const [deadline, setDeadline] = useState('')
  const [hours, setHours] = useState('')
  const [constraints, setConstraints] = useState('')
  const [resources, setResources] = useState<{ name: string; availability: 'low' | 'medium' | 'high' }[]>([])
  const [priority, setPriority] = useState<Priority>('balance')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const combined = useMemo(
    () => [description, speech.transcript].filter(Boolean).join('\n\n').trim(),
    [description, speech.transcript],
  )
  const enough = combined.length >= 20 || extractedChars > 0

  const submit = async () => {
    if (!enough) {
      setError(new Error('Describe the situation in a little more detail — a sentence or two is enough to start.'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await api.createSimulation({
        description: combined || 'Attached documents describe the situation.',
        ...(goal.trim() ? { goal: goal.trim() } : {}),
        ...(deadline ? { deadline } : {}),
        ...(hours ? { availableHoursPerDay: Number(hours) } : {}),
        ...(constraints.trim() ? { constraints: constraints.split('\n').map((line) => line.trim()).filter(Boolean) } : {}),
        ...(resources.filter((resource) => resource.name.trim()).length ? { resources: resources.filter((r) => r.name.trim()) } : {}),
        priority,
        attachments: attachments.map((item) => ({ name: item.name, kind: item.kind, text: item.text, chars: item.chars })),
        ...(speech.transcript ? { voiceTranscript: speech.transcript } : {}),
      })
      navigate(`/app/simulations/${created.simulation.id}?analyze=1`)
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Something went wrong while saving the simulation.'))
    } finally {
      setSubmitting(false)
    }
  }

  const loadDemo = () => {
    setDescription(DEMO_SCENARIO.description)
    setGoal(DEMO_SCENARIO.goal)
    setHours(String(DEMO_SCENARIO.structured.availableHoursPerDay))
    setAdvanced(true)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="New simulation"
        title="What decision are you facing?"
        description="Describe the situation the way you'd explain it to a friend. RealityOS extracts the structure, shows you what it understood, then simulates the options."
        actions={
          <Button variant="ghost" size="sm" onClick={loadDemo} icon={<Sparkles aria-hidden className="h-3.5 w-3.5" />}>
            Use the demo scenario
          </Button>
        }
      />

      {error ? (
        <div className="mb-5">
          <ErrorState message={error.message} onRetry={submit} />
        </div>
      ) : null}

      <Card className="p-5 sm:p-6">
        <Field
          label="Describe your situation"
          hint={`${combined.length.toLocaleString()} characters${extractedChars ? ` · ${extractedChars.toLocaleString()} from files` : ''} — minimum 20.`}
        >
          <Textarea
            rows={9}
            value={description}
            placeholder={PLACEHOLDER}
            onChange={(event) => setDescription(event.target.value)}
            aria-label="Describe your situation"
          />
        </Field>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant={speech.listening ? 'danger' : 'secondary'}
            size="sm"
            icon={speech.listening ? <Square aria-hidden className="h-3.5 w-3.5" /> : <Mic aria-hidden className="h-3.5 w-3.5" />}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={!speech.supported}
            title={speech.supported ? 'Dictate the situation' : 'This browser has no speech recognition'}
          >
            {speech.listening ? 'Stop dictation' : 'Dictate'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Paperclip aria-hidden className="h-3.5 w-3.5" />} onClick={() => fileInput.current?.click()} loading={busy}>
            Attach files
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void add(event.target.files)
              event.target.value = ''
            }}
          />
          {speech.transcript ? (
            <Button variant="ghost" size="sm" onClick={speech.reset} icon={<X aria-hidden className="h-3.5 w-3.5" />}>
              Clear dictation
            </Button>
          ) : null}
          <span className="ml-auto text-[0.72rem] text-mist-500">Parsed in your browser · files never uploaded</span>
        </div>

        {speech.error ? (
          <p className="mt-3 text-[0.78rem] text-signal-medium">{speech.error}</p>
        ) : !speech.supported ? (
          <p className="mt-3 text-[0.78rem] text-mist-500">
            Speech recognition is not available in this browser, so the microphone is disabled rather than silently doing nothing.
          </p>
        ) : null}

        {speech.transcript ? (
          <div className="mt-3 rounded-xl border border-ink-700/60 bg-ink-900/40 px-4 py-3">
            <p className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Transcribed</p>
            <p className="mt-1.5 text-[0.84rem] leading-relaxed text-mist-200">{speech.transcript}</p>
          </div>
        ) : null}

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void add(event.dataTransfer.files)
          }}
          className={`mt-4 rounded-xl border border-dashed px-4 py-4 text-center transition-colors ${
            dragging ? 'border-accent-400/60 bg-accent-500/6' : 'border-ink-600/70'
          }`}
        >
          <p className="text-[0.82rem] text-mist-400">
            Drop a PDF, DOCX, text file or screenshot here — or{' '}
            <button type="button" className="text-accent-300 underline-offset-2 hover:underline" onClick={() => fileInput.current?.click()}>
              browse
            </button>
            .
          </p>
        </div>

        {attachments.length ? (
          <ul className="mt-3 space-y-2">
            {attachments.map((item) => (
              <li key={item.name} className="flex items-start gap-3 rounded-xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-2.5">
                {item.kind === 'image' ? (
                  <ImageIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                ) : (
                  <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.82rem] text-mist-100">{item.name}</p>
                  <p className="mt-0.5 text-[0.74rem] text-mist-500">
                    {item.note ? item.note : `${item.chars.toLocaleString()} characters extracted`}
                  </p>
                </div>
                <button type="button" onClick={() => remove(item.name)} aria-label={`Remove ${item.name}`} className="text-mist-500 hover:text-signal-high">
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={() => setAdvanced((value) => !value)}
          aria-expanded={advanced}
          className="mt-5 flex w-full items-center justify-between rounded-xl border border-ink-700/60 px-4 py-3 text-left text-[0.85rem] text-mist-200 transition-colors hover:border-ink-600"
        >
          <span>
            Optional details
            <span className="ml-2 text-[0.78rem] text-mist-500">the AI infers what you leave out</span>
          </span>
          <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
        </button>

        {advanced ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mt-4 space-y-5">
              <Field label="Goal in one line" htmlFor="new-goal" optional hint="What has to be true when this is done?">
                <Input id="new-goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Submit the final year project" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Deadline" htmlFor="new-deadline" optional>
                  <Input id="new-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
                </Field>
                <Field label="Focused hours per day" htmlFor="new-hours" optional hint="Realistic focused hours, not clock hours.">
                  <Input
                    id="new-hours"
                    type="number"
                    min={0.5}
                    max={14}
                    step={0.5}
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                    placeholder="3"
                  />
                </Field>
              </div>

              <Field label="Constraints" htmlFor="new-constraints" optional hint="One per line — classes, shifts, family, budget, hardware.">
                <Textarea
                  id="new-constraints"
                  rows={3}
                  value={constraints}
                  onChange={(event) => setConstraints(event.target.value)}
                  placeholder={'College classes until 4pm\nLab only free on Wednesdays'}
                />
              </Field>

              <div>
                <p className="mb-2 text-[0.8rem] font-medium text-mist-200">Resources</p>
                <div className="space-y-2">
                  {resources.map((resource, index) => (
                    <div key={index} className="grid grid-cols-[1.5fr_1fr_auto] gap-2">
                      <Input
                        aria-label={`Resource ${index + 1}`}
                        value={resource.name}
                        placeholder="University GPU"
                        onChange={(event) =>
                          setResources((current) => current.map((item, position) => (position === index ? { ...item, name: event.target.value } : item)))
                        }
                      />
                      <select
                        aria-label={`Resource ${index + 1} availability`}
                        value={resource.availability}
                        onChange={(event) =>
                          setResources((current) =>
                            current.map((item, position) =>
                              position === index ? { ...item, availability: event.target.value as 'low' | 'medium' | 'high' } : item,
                            ),
                          )
                        }
                        className="rounded-xl border border-ink-700/80 bg-ink-900/70 px-3 py-2.5 text-sm text-mist-100"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <button
                        type="button"
                        aria-label="Remove resource"
                        onClick={() => setResources((current) => current.filter((_, position) => position !== index))}
                        className="px-2 text-mist-500 hover:text-signal-high"
                      >
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setResources((current) => [...current, { name: '', availability: 'medium' }])}>
                    + Add resource
                  </Button>
                </div>
              </div>

              <Field label="What matters most here?">
                <SegmentedControl
                  ariaLabel="Priority"
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: 'speed', label: 'Speed', hint: 'Finish as early as possible' },
                    { value: 'quality', label: 'Quality', hint: 'Do it properly' },
                    { value: 'balance', label: 'Balance', hint: 'Keep everything moving' },
                    { value: 'risk', label: 'Safety', hint: 'Avoid failing anything' },
                  ]}
                />
              </Field>
            </div>
          </motion.div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800/70 pt-5">
          <div className="flex items-center gap-2 text-[0.78rem] text-mist-500">
            <Badge tone="neutral">1 · Describe</Badge>
            <span aria-hidden>→</span>
            <Badge tone="neutral">2 · Model</Badge>
            <span aria-hidden>→</span>
            <Badge tone="neutral">3 · Simulate</Badge>
          </div>
          <div className="flex items-center gap-3">
            <ButtonLink to="/app/dashboard" variant="ghost" size="md">
              Cancel
            </ButtonLink>
            <Button size="lg" onClick={submit} loading={submitting} disabled={!enough} magnetic icon={<Wand2 aria-hidden className="h-4 w-4" />}>
              Analyze situation
            </Button>
          </div>
        </div>
      </Card>

      <InlineNote>
        <p className="flex items-start gap-2">
          <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Nothing is final: after the analysis you can edit every extracted value, and the simulation re-runs against your corrections.
          </span>
        </p>
      </InlineNote>
    </div>
  )
}
