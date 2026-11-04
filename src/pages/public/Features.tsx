import { motion } from 'motion/react'
import { Activity, BrainCircuit, CalendarClock, ClipboardCheck, FileText, GitBranch, LineChart, Mic, ShieldCheck, Sliders, Sparkles, Users } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card, Section } from '@/components/ui/Card'
import { MODEL_CARD } from '@/shared/engine/ml'

const GROUPS = [
  {
    title: 'Understand',
    items: [
      { icon: BrainCircuit, label: 'Situation agent', body: 'Pulls the goal, deadline, hours and constraints out of plain text.' },
      { icon: Mic, label: 'Voice input', body: 'Dictate instead of typing. Transcribed in your browser.' },
      { icon: FileText, label: 'Document upload', body: 'PDF, DOCX and text are parsed locally; only text is sent.' },
      { icon: GitBranch, label: 'Dependencies', body: 'Knows what gates what, and counts the overhead.' },
    ],
  },
  {
    title: 'Simulate',
    items: [
      { icon: LineChart, label: 'Trained model', body: `${MODEL_CARD.algorithms}.` },
      { icon: Activity, label: 'Risk & pressure', body: 'Deadline-miss probability and a 0–100 pressure index.' },
      { icon: CalendarClock, label: 'Completion date', body: 'Projected from your hours and your track record.' },
      { icon: Sliders, label: 'What-If simulator', body: 'Change any variable and watch the numbers move.' },
    ],
  },
  {
    title: 'Decide & learn',
    items: [
      { icon: Sparkles, label: 'Recommendation', body: 'A clear winner, with the reasoning shown.' },
      { icon: ShieldCheck, label: 'Critic agent', body: 'Attacks the weakest assumption in every plan.' },
      { icon: ClipboardCheck, label: 'Prediction vs reality', body: 'Record the outcome; RealityOS scores itself.' },
      { icon: Users, label: 'Decision profile', body: 'Your accuracy and reliability over time.' },
    ],
  },
]

export default function Features() {
  return (
    <div className="mx-auto w-full max-w-none px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-2xl">
        <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">An operating system for hard decisions.</h1>
        <p className="mt-4 text-[1rem] leading-relaxed text-mist-400">
          One loop: understand, simulate, compare, decide, learn.
        </p>
      </motion.header>

      {GROUPS.map((group, groupIndex) => (
        <Section key={group.title} title={group.title} className="mt-14">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {group.items.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: 0.04 * index + 0.02 * groupIndex }}
              >
                <Card className="h-full p-6" interactive>
                  <item.icon aria-hidden className="h-4 w-4 text-accent-400" />
                  <h3 className="mt-4 text-[0.95rem] font-medium text-mist-100">{item.label}</h3>
                  <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">{item.body}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </Section>
      ))}

      <Section className="mt-16" title="The model, in the open">
        <div id="model" className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card className="p-6">
            <h3 className="text-[0.95rem] font-medium text-mist-100">What drives a projection</h3>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {MODEL_CARD.features.map((feature) => (
                <li key={feature.key} className="rounded-lg border border-ink-700/60 bg-ink-900/50 px-3 py-2 text-[0.8rem] text-mist-300">
                  {feature.label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.8rem] leading-relaxed text-mist-500">{MODEL_CARD.provenance}</p>
          </Card>
          <Card className="p-6">
            <h3 className="text-[0.95rem] font-medium text-mist-100">Held-out metrics</h3>
            <dl className="mt-4 space-y-3">
              <Metric label="Completion AUC" value={MODEL_CARD.metrics.success.auc.toFixed(3)} />
              <Metric label="Deadline-miss AUC" value={MODEL_CARD.metrics.deadlineMiss.auc.toFixed(3)} />
              <Metric label="Pressure R²" value={MODEL_CARD.metrics.stress.r2.toFixed(3)} />
            </dl>
            <p className="mt-4 text-[0.78rem] text-mist-500">
              Version {MODEL_CARD.version} · {MODEL_CARD.sampleSize.toLocaleString()} training cases.
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-700/60 pb-2.5 last:border-0">
      <dt className="text-[0.85rem] text-mist-300">{label}</dt>
      <dd className="num text-[1rem] text-mist-100">{value}</dd>
    </div>
  )
}
