import { motion } from 'motion/react'
import { Compass, Eye, GitCompareArrows, LineChart, Sparkles } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

const PHILOSOPHY = [
  { icon: Eye, label: 'Understand', body: 'Make the situation explicit before suggesting anything.' },
  { icon: LineChart, label: 'Simulate', body: 'Turn plans into testable projections rather than opinions.' },
  { icon: GitCompareArrows, label: 'Compare', body: 'Show trade-offs side by side, including what each option costs.' },
  { icon: Compass, label: 'Decide', body: 'Recommend clearly, and show the argument behind the recommendation.' },
  { icon: Sparkles, label: 'Learn', body: 'Score the prediction against reality and adjust the next one.' },
]

export default function About() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Badge tone="accent">About RealityOS</Badge>
        <h1 className="mt-5 text-[2rem] leading-tight sm:text-[2.5rem]">Decision-making, redesigned for uncertainty.</h1>
        <p className="mt-5 max-w-2xl text-[0.95rem] leading-relaxed text-mist-400">
          Most decision tools help you organise what you already decided. RealityOS is built for the harder question: what is likely to happen
          after you choose? It answers with a model of your situation, a projection for each path, and — after the fact — an honest comparison
          between what it predicted and what you actually lived.
        </p>
      </motion.header>

      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-mist-500">The philosophy</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-5">
          {PHILOSOPHY.map((step, index) => (
            <motion.li
              key={step.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
            >
              <Card className="h-full p-4" interactive>
                <step.icon aria-hidden className="h-4 w-4 text-accent-300" />
                <p className="mt-3 text-[0.88rem] font-medium text-mist-50">{step.label}</p>
                <p className="mt-1.5 text-[0.78rem] leading-relaxed text-mist-400">{step.body}</p>
              </Card>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[0.95rem] font-medium text-mist-50">What RealityOS will not do</h2>
          <ul className="mt-3 space-y-2 text-[0.85rem] leading-relaxed text-mist-400">
            <li>• Pretend a simulation is a guarantee. Every projection is an estimate with an attached uncertainty.</li>
            <li>• Let a language model invent your probabilities. Numbers come from a trained, explainable model.</li>
            <li>• Tell you what to want. It compares the options you can actually execute.</li>
            <li>• Sell your data. Your simulations are scoped to your account and deletable in one click.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="text-[0.95rem] font-medium text-mist-50">Who it is for</h2>
          <ul className="mt-3 space-y-2 text-[0.85rem] leading-relaxed text-mist-400">
            <li>• Students balancing coursework, exams and a project that decides their grade.</li>
            <li>• Professionals juggling a shipping date, a review cycle and a family calendar.</li>
            <li>• Founders choosing between two versions of the same limited week.</li>
            <li>• Anyone whose plan has more moving parts than a to-do list can carry.</li>
          </ul>
        </Card>
      </section>

      <div className="mt-14 flex flex-wrap gap-3">
        <ButtonLink to="/signup" size="lg" magnetic>
          Try it on a real decision
        </ButtonLink>
        <ButtonLink to="/privacy" size="lg" variant="secondary">
          Read the privacy notes
        </ButtonLink>
      </div>
    </div>
  )
}
