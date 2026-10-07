import { useMemo } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, CalendarClock, Compass, GitBranch, Layers, LineChart, ShieldAlert, Sparkles, Target, Timer, Wand2 } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { HeroPipeline } from '@/components/marketing/HeroPipeline'
import { LiveWhatIf } from '@/components/marketing/LiveWhatIf'
import { MODEL_CARD } from '@/shared/engine/ml'
import { buildDemoModel, projectDemoHours, HERO_STAGES } from '@/lib/demo'
import { useSession } from '@/lib/session'
import { formatDate } from '@/lib/format'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
}

export default function Landing() {
  const { signedIn } = useSession()
  const model = useMemo(() => buildDemoModel(), [])

  const summary = model.evaluations.map((evaluation) => ({
    code: evaluation.option.code,
    name: evaluation.option.name,
    success: Math.round(evaluation.projection.successProbability * 100),
    risk: Math.round(evaluation.projection.deadlineRisk * 100),
    pressure: Math.round(evaluation.projection.stressIndex),
    recommended: evaluation.option.id === model.recommendation.optionId,
  }))

  const baseOption = model.evaluations.find((entry) => entry.option.id === model.recommendation.optionId) ?? model.evaluations[0]!

  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge tone="accent">
              <Sparkles aria-hidden className="h-3 w-3" />
              Decision simulation platform
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.04 }}
            className="mt-5 text-[2.6rem] leading-[1.05] sm:text-[3.4rem]"
          >
            <span className="text-gradient">RealityOS</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-3 text-[1.35rem] font-medium leading-snug text-mist-100 sm:text-[1.6rem]"
          >
            Simulate the decision before you live it.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-5 max-w-xl text-[0.95rem] leading-relaxed text-mist-400"
          >
            RealityOS turns complex real-world situations into AI-powered decision simulations — so you can understand the risks, compare
            possible outcomes and make the call with evidence instead of a guess.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <ButtonLink
              to={signedIn ? '/app/new' : '/signup'}
              size="lg"
              magnetic
              icon={<ArrowRight aria-hidden className="h-4 w-4" />}
            >
              Start a simulation
            </ButtonLink>
            <ButtonLink to="/how-it-works" size="lg" variant="secondary">
              See how it works
            </ButtonLink>
          </motion.div>

          <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-ink-800/80 pt-6">
            <Stat label="Model AUC" value={MODEL_CARD.metrics.success.auc.toFixed(2)} />
            <Stat label="Deadline AUC" value={MODEL_CARD.metrics.deadlineMiss.auc.toFixed(2)} />
            <Stat label="Decision paths" value="3–4" />
          </dl>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
          <HeroPipeline stages={[...HERO_STAGES]} summary={summary} />
          <p className="mt-3 text-center text-[0.72rem] text-mist-500">
            Generated from the demo scenario by the same engine that serves the app.
          </p>
        </motion.div>
      </section>

      {/* ── Problem ──────────────────────────────────────────────────────── */}
      <motion.section {...fadeUp} className="border-t border-ink-800/70 py-16">
        <h2 className="max-w-3xl text-[1.8rem] leading-tight sm:text-[2.15rem]">
          Decisions are easy. Predicting their consequences isn&apos;t.
        </h2>
        <p className="mt-4 max-w-2xl text-[0.92rem] leading-relaxed text-mist-400">
          You already know how to decide. What you cannot see is how the days after the decision actually unfold — which task slips, which
          deadline breaks, where the pressure lands. Advice does not answer that. A model can.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { title: 'Advice is generic', body: '“Make a schedule and stick to it” ignores your classes, your shift pattern and your slow laptop.' },
            { title: 'Plans are guesses', body: 'To-do lists record intent. They do not estimate whether the hours you have can absorb the work you described.' },
            { title: 'Outcomes go unrecorded', body: 'Without recording what happened, you repeat the same estimation error with more confidence.' },
          ].map((item) => (
            <Card key={item.title} className="p-5" interactive>
              <h3 className="text-[0.95rem] font-medium text-mist-50">{item.title}</h3>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">{item.body}</p>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* ── Solution ─────────────────────────────────────────────────────── */}
      <motion.section {...fadeUp} className="border-t border-ink-800/70 py-16">
        <h2 className="text-[1.6rem] leading-tight sm:text-[1.9rem]">Situation → Simulation → Decision</h2>
        <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-mist-400">
          One screen at a time, and every number explained by the factor that moved it.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: Compass,
              step: '01',
              title: 'It models the situation',
              body: 'Goal, deadline, available hours, constraints, dependencies and resources — extracted from plain language and editable by you.',
            },
            {
              icon: Wand2,
              step: '02',
              title: 'It simulates the options',
              body: 'Three to four genuinely different strategies, each projected for completion probability, deadline risk and workload pressure.',
            },
            {
              icon: LineChart,
              step: '03',
              title: 'It recommends, then learns',
              body: 'A ranked recommendation with its reasoning, then your recorded outcome calibrates the model for next time.',
            },
          ].map((item) => (
            <Card key={item.step} className="p-5" interactive glow>
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-ink-600/70 bg-ink-800/60 text-accent-300">
                  <item.icon aria-hidden className="h-4 w-4" />
                </span>
                <span className="num text-[0.72rem] tracking-[0.2em] text-mist-500">{item.step}</span>
              </div>
              <h3 className="mt-4 text-[1rem] font-medium text-mist-50">{item.title}</h3>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">{item.body}</p>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* ── What it analyses ─────────────────────────────────────────────── */}
      <motion.section {...fadeUp} className="border-t border-ink-800/70 py-16">
        <h2 className="text-[1.6rem] leading-tight sm:text-[1.9rem]">What RealityOS analyses</h2>
        <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-mist-400">
          These six inputs drive the workload model. Everything else on the results screen is a consequence of them.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Target, label: 'Goals', detail: 'What actually has to be delivered' },
            { icon: Timer, label: 'Time', detail: 'Focused hours per day, and how fragmented they are' },
            { icon: ShieldAlert, label: 'Constraints', detail: 'Classes, shifts, family, budget, hardware' },
            { icon: GitBranch, label: 'Dependencies', detail: 'What has to finish before what' },
            { icon: CalendarClock, label: 'Deadlines', detail: 'Hard dates, inferred dates, and no date at all' },
            { icon: Layers, label: 'Resources', detail: 'Tools, labs, mentors, and how reliable they are' },
          ].map((item) => (
            <div key={item.label} className="surface flex items-start gap-3 rounded-xl px-4 py-3.5">
              <item.icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" />
              <div>
                <p className="text-[0.88rem] font-medium text-mist-100">{item.label}</p>
                <p className="mt-0.5 text-[0.78rem] leading-relaxed text-mist-500">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── What-If engine ──────────────────────────────────────────────── */}
      <motion.section {...fadeUp} className="border-t border-ink-800/70 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[1.6rem] leading-tight sm:text-[1.9rem]">The What-If engine</h2>
            <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-mist-400">
              Change a variable and the projection moves with it — the trained model re-evaluates live, and the platform tells you what changed.
            </p>
          </div>
          <Badge tone="violet">Runs in your browser · identical to the server</Badge>
        </div>
        <div className="mt-6">
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

      {/* ── Prediction vs reality ───────────────────────────────────────── */}
      <motion.section {...fadeUp} className="border-t border-ink-800/70 py-16">
        <h2 className="text-[1.6rem] leading-tight sm:text-[1.9rem]">Prediction vs reality</h2>
        <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-mist-400">
          After the deadline passes you record what actually happened. RealityOS scores its own prediction and shows you why it was wrong.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <Card className="p-5">
            <p className="text-[0.72rem] uppercase tracking-[0.14em] text-mist-500">Simulated</p>
            <p className="num mt-2 text-[2rem] text-mist-50">74%</p>
            <p className="mt-1 text-[0.8rem] text-mist-500">completion · 31% deadline risk · 47/100 pressure</p>
            <p className="mt-4 text-[0.82rem] text-mist-400">Expected finish {formatDate(model.situation.deadline)} with 2 days spare.</p>
          </Card>
          <div className="hidden items-center lg:flex">
            <ArrowRight aria-hidden className="h-5 w-5 text-mist-500" />
          </div>
          <Card className="p-5">
            <p className="text-[0.72rem] uppercase tracking-[0.14em] text-mist-500">Actual</p>
            <p className="num mt-2 text-[2rem] text-mist-50">50%</p>
            <p className="mt-1 text-[0.8rem] text-mist-500">partly delivered · finished 3 days late · 85/100 pressure</p>
            <p className="mt-4 text-[0.82rem] text-mist-400">
              <span className="text-signal-medium">Cause:</span> the model under-estimated model debugging, and the estimate for the report was
              too optimistic.
            </p>
          </Card>
        </div>
        <p className="mt-5 text-[0.82rem] text-mist-500">
          Recorded outcomes are stored as training rows and feed a per-user calibration, so the next simulation starts closer to your reality.
        </p>
      </motion.section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <motion.section {...fadeUp} className="border-t border-ink-800/70 py-20">
        <div className="surface-raised relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-32 mx-auto h-64 w-[36rem] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(74,107,255,0.22), transparent 70%)' }}
          />
          <h2 className="relative text-[1.9rem] leading-tight sm:text-[2.3rem]">Your next decision doesn&apos;t have to be a guess.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[0.92rem] leading-relaxed text-mist-400">
            Describe the situation in plain language. RealityOS builds the model, simulates the paths and shows you which one survives contact
            with real life.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to={signedIn ? '/app/new' : '/signup'} size="lg" magnetic>
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
      <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-mist-500">{label}</dt>
      <dd className="num mt-1 text-lg text-mist-100">{value}</dd>
    </div>
  )
}
