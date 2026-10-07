import { motion } from 'motion/react'
import {
  Activity,
  BrainCircuit,
  CalendarClock,
  ClipboardCheck,
  FileText,
  GitBranch,
  LineChart,
  Mic,
  ShieldCheck,
  Sliders,
  Sparkles,
  Users,
} from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, Section } from '@/components/ui/Card'
import { MODEL_CARD } from '@/shared/engine/ml'

const GROUPS = [
  {
    title: 'Understanding your situation',
    items: [
      { icon: BrainCircuit, label: 'Situation agent', body: 'Extracts goal, deadline, real available hours, constraints, resources and dependencies from free text.' },
      { icon: Mic, label: 'Voice input', body: 'Dictate the situation when typing a paragraph is too much effort. Transcribed in the browser.' },
      { icon: FileText, label: 'Document upload', body: 'PDF, DOCX and text files are parsed in your browser; only extracted text is sent to the server.' },
      { icon: GitBranch, label: 'Dependency mapping', body: 'Sees which deliverable gates which, and includes coordination overhead in the workload estimate.' },
    ],
  },
  {
    title: 'Simulating the outcomes',
    items: [
      { icon: LineChart, label: 'Trained workload model', body: `${MODEL_CARD.algorithms}. AUC ${MODEL_CARD.metrics.success.auc.toFixed(2)} on the held-out cohort test set.` },
      { icon: Activity, label: 'Risk & pressure indices', body: 'Deadline-miss probability and a 0–100 workload-pressure estimate, separate from the completion probability.' },
      { icon: CalendarClock, label: 'Expected completion date', body: 'Projects the finishing date from your commitment, your declared availability and your historical follow-through.' },
      { icon: Sliders, label: 'What-If simulator', body: 'Move hours, deadline, complexity or resources and watch the projection move — locally, instantly, then reconciled with the server.' },
    ],
  },
  {
    title: 'Deciding and learning',
    items: [
      { icon: Sparkles, label: 'Recommendation with reasoning', body: 'Published scoring weights, the reasons the winner won and the specific reason the runner-up lost.' },
      { icon: ShieldCheck, label: 'Critic agent', body: 'Attacks the weakest assumption in every plan — including inviting disagreement with the model’s own numbers.' },
      { icon: ClipboardCheck, label: 'Prediction vs reality', body: 'Record the real outcome; RealityOS scores its prediction and attributes the gap.' },
      { icon: Users, label: 'Decision profile', body: 'Prediction accuracy, time-estimation accuracy, deadline reliability and risk tendency across your recorded decisions.' },
    ],
  },
]

export default function Features() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-2xl">
        <Badge tone="accent">
          <Sparkles aria-hidden className="h-3 w-3" />
          Features
        </Badge>
        <h1 className="mt-5 text-[2rem] leading-tight sm:text-[2.5rem]">An operating system for hard decisions.</h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-mist-400">
          Not a chat window with a planner bolted on. Every feature below feeds a single structured loop: model, simulate, compare, decide,
          record, learn.
        </p>
      </motion.header>

      {GROUPS.map((group, groupIndex) => (
        <Section key={group.title} title={group.title} className="mt-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {group.items.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: 0.04 * index + 0.02 * groupIndex }}
              >
                <Card className="h-full p-5" interactive>
                  <item.icon aria-hidden className="h-4 w-4 text-accent-300" />
                  <h3 className="mt-3 text-[0.92rem] font-medium text-mist-50">{item.label}</h3>
                  <p className="mt-2 text-[0.82rem] leading-relaxed text-mist-400">{item.body}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </Section>
      ))}

      <Section
        className="mt-16"
        title="The model, in the open"
        sub="RealityOS is explicit about what produces its numbers, and honest about where they come from."
      >
        <div id="model" className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="p-5">
            <h3 className="text-[0.95rem] font-medium text-mist-50">What drives a projection</h3>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {MODEL_CARD.features.map((feature) => (
                <li key={feature.key} className="rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2 text-[0.8rem] text-mist-300">
                  {feature.label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.8rem] leading-relaxed text-mist-500">{MODEL_CARD.provenance}</p>
          </Card>
          <Card className="p-5">
            <h3 className="text-[0.95rem] font-medium text-mist-50">Held-out metrics</h3>
            <dl className="mt-4 space-y-3">
              <Metric label="Completion AUC" value={MODEL_CARD.metrics.success.auc.toFixed(3)} sub={`acc ${MODEL_CARD.metrics.success.accuracy.toFixed(3)} · brier ${MODEL_CARD.metrics.success.brier.toFixed(3)}`} />
              <Metric label="Deadline-miss AUC" value={MODEL_CARD.metrics.deadlineMiss.auc.toFixed(3)} sub={`acc ${MODEL_CARD.metrics.deadlineMiss.accuracy.toFixed(3)} · brier ${MODEL_CARD.metrics.deadlineMiss.brier.toFixed(3)}`} />
              <Metric label="Pressure R²" value={MODEL_CARD.metrics.stress.r2.toFixed(3)} sub={`MAE ${MODEL_CARD.metrics.stress.mae.toFixed(3)}`} />
            </dl>
            <p className="mt-4 text-[0.78rem] text-mist-500">
              Version {MODEL_CARD.version} · trained {new Date(MODEL_CARD.trainedAt).toISOString().slice(0, 10)} on{' '}
              {MODEL_CARD.sampleSize.toLocaleString()} cases.
            </p>
          </Card>
        </div>
      </Section>

      <div className="mt-14 flex flex-wrap gap-3">
        <ButtonLink to="/signup" size="lg" magnetic>
          Create your first simulation
        </ButtonLink>
        <ButtonLink to="/how-it-works" size="lg" variant="secondary">
          Walk through the loop
        </ButtonLink>
      </div>
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-800/70 pb-2.5 last:border-0">
      <dt className="text-[0.85rem] text-mist-300">{label}</dt>
      <dd className="text-right">
        <span className="num text-[1rem] text-mist-50">{value}</span>
        <span className="ml-2 text-[0.72rem] text-mist-500">{sub}</span>
      </dd>
    </div>
  )
}
