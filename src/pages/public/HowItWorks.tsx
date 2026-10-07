import { motion } from 'motion/react'
import { ArrowRight, Bot, Braces, GitCompareArrows, LineChart, ShieldCheck, Sparkles } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card, Section } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { MODEL_CARD } from '@/shared/engine/ml'

const STEPS = [
  {
    number: '01',
    title: 'Describe your situation',
    body: 'Type it, dictate it, or attach the brief you were given. No forms to fill in and nothing to format.',
    detail: 'Text · voice · PDF, DOCX, screenshots · optional structured hints',
  },
  {
    number: '02',
    title: 'RealityOS builds your decision model',
    body: 'The situation agent extracts the goal, deadline, real available hours, constraints, resources, dependencies and risks — then shows you exactly what it understood so you can correct it.',
    detail: 'Editable model · confidence score · open questions surfaced',
  },
  {
    number: '03',
    title: 'AI generates possible paths',
    body: 'The planning agent proposes genuinely different strategies — not one plan with three labels. A rule-based planner runs alongside so the product still works without an LLM key.',
    detail: '3–4 options · each with assumptions and trade-offs',
  },
  {
    number: '04',
    title: 'RealityOS simulates the outcomes',
    body: 'A trained workload model converts the plan into a completion probability, a deadline risk, a workload pressure index, an expected completion date and a per-deliverable coverage report. The critic agent then attacks the plan.',
    detail: 'ML model · explainable factors · published scoring weights',
  },
  {
    number: '05',
    title: 'RealityOS learns from what happened',
    body: 'Record the real outcome — what you finished, how long it took, how heavy it felt — and RealityOS scores its own prediction, attributes the gap, and calibrates the next simulation on your track record.',
    detail: 'Per-user calibration · accuracy trend · retrainable on real outcomes',
  },
]

export default function HowItWorks() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl"
      >
        <Badge tone="accent">
          <Sparkles aria-hidden className="h-3 w-3" />
          How it works
        </Badge>
        <h1 className="mt-5 text-[2rem] leading-tight sm:text-[2.5rem]">Five steps, one complete loop.</h1>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-mist-400">
          Every step is visible in the product: what was extracted, what was proposed, what the model calculated and what actually happened.
        </p>
      </motion.header>

      <ol className="mt-12 space-y-4">
        {STEPS.map((step, index) => (
          <motion.li
            key={step.number}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
          >
            <Card className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:p-6" interactive glow>
              <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className="num text-[1.6rem] font-semibold text-accent-400/70">{step.number}</span>
              </div>
              <div>
                <h2 className="text-[1.05rem] font-semibold text-mist-50">{step.title}</h2>
                <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-mist-400">{step.body}</p>
                <p className="mt-3 text-[0.76rem] uppercase tracking-[0.1em] text-mist-500">{step.detail}</p>
              </div>
            </Card>
          </motion.li>
        ))}
      </ol>

      <Section
        className="mt-16"
        title="Under the hood"
        sub="The architecture is deliberately boring where it matters: deterministic maths for numbers, language models for language."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-[0.95rem] font-medium text-mist-50">
              <Bot aria-hidden className="h-4 w-4 text-violet-400" />
              Seven agents, one job each
            </h3>
            <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">
              Situation, Planning, Simulation, Risk, Critic, Recommendation and Reflection — separate prompts, separate schemas, separate
              responsibilities. Invalid model output is rejected and the deterministic core takes over.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-[0.95rem] font-medium text-mist-50">
              <LineChart aria-hidden className="h-4 w-4 text-accent-300" />
              A real workload model
            </h3>
            <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">
              {MODEL_CARD.algorithms}. Trained offline on {MODEL_CARD.sampleSize.toLocaleString()} cases; completion AUC{' '}
              {MODEL_CARD.metrics.success.auc.toFixed(2)}, deadline-miss AUC {MODEL_CARD.metrics.deadlineMiss.auc.toFixed(2)}. Every prediction
              reports the factors that moved it.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-[0.95rem] font-medium text-mist-50">
              <GitCompareArrows aria-hidden className="h-4 w-4 text-signal-low" />
              Numbers the model cannot invent
            </h3>
            <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">
              The language model proposes strategies, assumptions and challenges. Every probability, risk and date is recomputed by the
              engine on the server before it is stored or shown.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-[0.95rem] font-medium text-mist-50">
              <ShieldCheck aria-hidden className="h-4 w-4 text-accent-300" />
              Private by default
            </h3>
            <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">
              Simulations are scoped to your account on the server. Documents are parsed in your browser — only extracted text is sent. API keys
              live server-side only.
            </p>
          </Card>
        </div>
      </Section>

      <div className="mt-14 flex flex-wrap gap-3">
        <ButtonLink to="/signup" size="lg" magnetic icon={<ArrowRight aria-hidden className="h-4 w-4" />}>
          Start a simulation
        </ButtonLink>
        <ButtonLink to="/features" size="lg" variant="secondary">
          Browse the features
        </ButtonLink>
      </div>

      <p className="mt-8 flex items-center gap-2 text-[0.78rem] text-mist-500">
        <Braces aria-hidden className="h-3.5 w-3.5" />
        Full architecture notes live in the repository README.
      </p>
    </div>
  )
}
