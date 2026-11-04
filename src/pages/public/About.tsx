import { motion } from 'motion/react'
import { Compass, Eye, FileDown, FileText, GitCompareArrows, LineChart, Sparkles } from 'lucide-react'
import { ButtonAnchor, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const PHILOSOPHY = [
  { icon: Eye, label: 'Understand', body: 'Make the situation explicit first.' },
  { icon: LineChart, label: 'Simulate', body: 'Turn plans into testable projections.' },
  { icon: GitCompareArrows, label: 'Compare', body: 'Show trade-offs side by side.' },
  { icon: Compass, label: 'Decide', body: 'Recommend clearly, and say why.' },
  { icon: Sparkles, label: 'Learn', body: 'Score the prediction against reality.' },
]

export default function About() {
  return (
    <div className="mx-auto w-full max-w-none px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">Built for the question after the decision.</h1>
        <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-mist-400">
          Most tools organise what you already decided. RealityOS projects what happens next — and later compares that projection with what
          you actually lived.
        </p>
      </motion.header>

      <section className="mt-14">
        <ol className="grid gap-4 sm:grid-cols-5">
          {PHILOSOPHY.map((step, index) => (
            <motion.li
              key={step.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
            >
              <Card className="h-full p-5" interactive>
                <step.icon aria-hidden className="h-4 w-4 text-accent-400" />
                <p className="mt-3 text-[0.9rem] font-medium text-mist-100">{step.label}</p>
                <p className="mt-1.5 text-[0.8rem] leading-relaxed text-mist-400">{step.body}</p>
              </Card>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mt-14 grid gap-5 sm:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-[0.95rem] font-medium text-mist-100">What RealityOS won&apos;t do</h2>
          <ul className="mt-4 space-y-2.5 text-[0.88rem] leading-relaxed text-mist-400">
            <li>Pretend a projection is a guarantee.</li>
            <li>Let a language model invent your probabilities.</li>
            <li>Tell you what to want.</li>
            <li>Sell your data.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="text-[0.95rem] font-medium text-mist-100">Who it&apos;s for</h2>
          <ul className="mt-4 space-y-2.5 text-[0.88rem] leading-relaxed text-mist-400">
            <li>Students balancing coursework and a graded project.</li>
            <li>Professionals juggling a ship date and a review cycle.</li>
            <li>Anyone whose plan outgrew a to-do list.</li>
          </ul>
        </Card>
      </section>


      <section className="mt-14">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent-400">Documentation</p>
              <h2 className="mt-2 text-[1.15rem] font-medium text-mist-50">How RealityOS is built, end to end</h2>
              <p className="mt-3 text-[0.9rem] leading-relaxed text-mist-400">
                A complete technical write-up of the whole application: the product loop, the full frontend
                (routing, pages, components, data flow) and the backend (Worker pipeline, API reference,
                database schema, AI agents, deterministic engine and ML model, security posture).
              </p>
              <p className="mt-3 text-[0.78rem] text-mist-500">PDF · 21 pages · v1.0.0 · model simulated-cohort-v1</p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:items-stretch">
              <ButtonAnchor
                href="/RealityOS-Project-Documentation.pdf"
                download="RealityOS-Project-Documentation.pdf"
                size="lg"
                magnetic
                icon={<FileDown aria-hidden className="h-4 w-4" />}
              >
                Download documentation
              </ButtonAnchor>
              <ButtonAnchor
                href="/RealityOS-Project-Documentation.pdf"
                target="_blank"
                variant="secondary"
                size="md"
                icon={<FileText aria-hidden className="h-4 w-4" />}
              >
                Read in browser
              </ButtonAnchor>
            </div>
          </div>
        </Card>
      </section>

      <div className="mt-14 flex flex-wrap gap-3">
        <ButtonLink to="/signup" size="lg" magnetic>
          Try it on a real decision
        </ButtonLink>
        <ButtonLink to="/privacy" size="lg" variant="secondary">
          Privacy notes
        </ButtonLink>
      </div>
    </div>
  )
}
