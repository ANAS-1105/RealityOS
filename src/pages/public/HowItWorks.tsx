import { motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MODEL_CARD } from '@/shared/engine/ml'

const STEPS = [
  {
    number: '01',
    title: 'Describe your situation',
    body: 'Type it, dictate it, or attach the brief. No forms.',
  },
  {
    number: '02',
    title: 'RealityOS builds your model',
    body: 'Goal, deadline, hours, constraints and dependencies — shown so you can correct them.',
  },
  {
    number: '03',
    title: 'AI proposes the paths',
    body: 'Three or four genuinely different strategies, not one plan with three labels.',
  },
  {
    number: '04',
    title: 'RealityOS simulates them',
    body: 'Completion probability, deadline risk, pressure and an expected finish date.',
  },
  {
    number: '05',
    title: 'It learns from what happened',
    body: 'Record the real outcome. RealityOS scores its own prediction and calibrates.',
  },
]

export default function HowItWorks() {
  return (
    <div className="mx-auto w-full max-w-none px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-2xl">
        <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">Five steps, one loop.</h1>
        <p className="mt-4 text-[1rem] leading-relaxed text-mist-400">
          Every step is visible: what was understood, what the model calculated, what happened.
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
            <Card className="grid gap-5 p-6 sm:grid-cols-[auto_1fr]" interactive>
              <span className="num text-[1.4rem] font-semibold text-accent-400">{step.number}</span>
              <div>
                <h2 className="text-[1.05rem] font-medium text-mist-100">{step.title}</h2>
                <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-mist-400">{step.body}</p>
              </div>
            </Card>
          </motion.li>
        ))}
      </ol>

      <Card className="mt-12 p-6">
        <h2 className="text-[0.95rem] font-medium text-mist-100">Under the hood</h2>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-mist-400">
          Seven agents handle language; a trained workload model handles the numbers.
        </p>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-mist-400">
          {MODEL_CARD.algorithms}. Completion AUC {MODEL_CARD.metrics.success.auc.toFixed(2)}, deadline-miss AUC{' '}
          {MODEL_CARD.metrics.deadlineMiss.auc.toFixed(2)} on {MODEL_CARD.sampleSize.toLocaleString()} held-out cases. Every prediction shows
          what moved it.
        </p>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-mist-400">
          No model can invent a probability here: the language model proposes, the engine computes.
        </p>
      </Card>

      <div className="mt-14 flex flex-wrap gap-3">
        <ButtonLink to="/signup" size="lg" magnetic icon={<ArrowRight aria-hidden className="h-4 w-4" />}>
          Start a simulation
        </ButtonLink>
        <ButtonLink to="/features" size="lg" variant="secondary">
          Browse the features
        </ButtonLink>
      </div>
    </div>
  )
}
