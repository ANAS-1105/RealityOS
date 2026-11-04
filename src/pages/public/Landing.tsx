import { useMemo } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Compass, LineChart, Wand2 } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { HeroPipeline } from '@/components/marketing/HeroPipeline'
import { LiveWhatIf } from '@/components/marketing/LiveWhatIf'
import { MODEL_CARD } from '@/shared/engine/ml'
import { buildDemoModel, projectDemoHours, HERO_STAGES } from '@/lib/demo'
import { useSession } from '@/lib/session'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
}

const STEPS = [
  {
    icon: Compass,
    title: 'Describe the situation',
    body: 'In plain language. RealityOS extracts the goal, deadline and real hours.',
  },
  {
    icon: Wand2,
    title: 'See the options',
    body: 'Three or four different strategies, each projected for success and risk.',
  },
  {
    icon: LineChart,
    title: 'Decide, then learn',
    body: 'Get a ranked recommendation. Record what happened and it calibrates.',
  },
]

export default function Landing() {
  const { signedIn } = useSession()
  const model = useMemo(() => buildDemoModel(), [])

  const summary = model.evaluations.map((evaluation) => ({
    code: evaluation.option.code,
    name: evaluation.option.name,
    success: Math.round(evaluation.projection.successProbability * 100),
    risk: Math.round(evaluation.projection.deadlineRisk * 100),
    pressure: Math.round(evaluation.projection.stressIndex),
    expected: evaluation.projection.expectedCompletionDate,
    buffer: evaluation.projection.bufferDays,
    recommended: evaluation.option.id === model.recommendation.optionId,
  }))

  const baseOption = model.evaluations.find((entry) => entry.option.id === model.recommendation.optionId) ?? model.evaluations[0]!
  const cta = signedIn ? '/app/new' : '/signup'

  return (
    <div className="mx-auto w-full max-w-none px-5 sm:px-8 lg:px-10">
      {/* Hero */}
      <section className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[2.5rem] leading-[1.08] sm:text-[3.25rem]"
          >
            Simulate the decision before you live it.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-5 max-w-lg text-[1rem] leading-relaxed text-mist-400"
          >
            RealityOS turns a situation you describe into clear options with real probabilities.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <ButtonLink to={cta} size="lg" magnetic icon={<ArrowRight aria-hidden className="h-4 w-4" />}>
              Start a simulation
            </ButtonLink>
            <ButtonLink to="/how-it-works" size="lg" variant="secondary">
              How it works
            </ButtonLink>
          </motion.div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-ink-700/70 pt-7">
            <Stat label="Model AUC" value={MODEL_CARD.metrics.success.auc.toFixed(2)} />
            <Stat label="Deadline AUC" value={MODEL_CARD.metrics.deadlineMiss.auc.toFixed(2)} />
            <Stat label="Paths" value="3–4" />
          </dl>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
          <HeroPipeline stages={[...HERO_STAGES]} summary={summary} />
        </motion.div>
      </section>

      {/* How it works */}
      <motion.section {...fadeUp} className="border-t border-ink-700/60 py-16 sm:py-20">
        <h2 className="text-[1.5rem] leading-tight sm:text-[1.8rem]">Three simple steps</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.title} className="p-6" interactive>
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-ink-700/70 bg-ink-900/60 text-accent-400">
                <step.icon aria-hidden className="h-4 w-4" />
              </span>
              <h3 className="mt-5 text-[1rem] font-medium text-mist-100">{step.title}</h3>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-mist-400">{step.body}</p>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* What-If */}
      <motion.section {...fadeUp} className="border-t border-ink-700/60 py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[1.5rem] leading-tight sm:text-[1.8rem]">Try the What-If engine</h2>
            <p className="mt-3 max-w-lg text-[0.95rem] leading-relaxed text-mist-400">
              Move the hours and the projection moves with it — live, in your browser.
            </p>
          </div>
        </div>
        <div className="mt-8">
          <LiveWhatIf
            base={{
              hoursPerDay: baseOption.option.hoursPerDay,
              success: Math.round(baseOption.projection.successProbability * 100),
              risk: Math.round(baseOption.projection.deadlineRisk * 100),
              pressure: Math.round(baseOption.projection.stressIndex),
            }}
            project={(hours) => {
              const result = projectDemoHours(model, hours)
              const coverage = result.projection.coverage.length
                ? Math.round((100 * result.projection.coverage.reduce((sum, item) => sum + Math.min(1, item.ratio), 0)) / result.projection.coverage.length)
                : 100
              return {
                success: Math.round(result.projection.successProbability * 100),
                risk: Math.round(result.projection.deadlineRisk * 100),
                pressure: Math.round(result.projection.stressIndex),
                coverage,
                explanation: result.explanation,
              }
            }}
          />
        </div>
      </motion.section>

      {/* CTA */}
      <motion.section {...fadeUp} className="border-t border-ink-700/60 py-16 sm:py-24">
        <div className="text-center">
          <h2 className="text-[1.75rem] leading-tight sm:text-[2.2rem]">Your next decision doesn&apos;t have to be a guess.</h2>
          <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-mist-400">
            Describe the situation. Get clear options with real numbers.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink to={cta} size="lg" magnetic>
              Create your first simulation
            </ButtonLink>
            <ButtonLink to="/features" size="lg" variant="secondary">
              See what&apos;s inside
            </ButtonLink>
          </div>
        </div>
      </motion.section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mist-500">{label}</dt>
      <dd className="num mt-1.5 text-lg text-mist-100">{value}</dd>
    </div>
  )
}
