import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from '@/lib/hooks'

/**
 * The hero visual: the core loop, animated.
 *
 * Situation → Decision → Simulation → Outcome, with real numbers computed by the
 * actual engine from the demo scenario — no mocked-up figures on the marketing
 * page. The stage highlight advances on a slow cycle, and the bars fill in step.
 */
export function HeroPipeline({
  stages,
  summary,
}: {
  stages: { key: string; label: string; detail: string }[]
  summary: { code: string; name: string; success: number; risk: number; pressure: number; recommended: boolean }[]
}) {
  const reduced = useReducedMotion()
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setActive((value) => (value + 1) % stages.length), 2600)
    return () => clearInterval(timer)
  }, [stages.length, reduced])

  return (
    <div className="surface-raised relative overflow-hidden rounded-3xl p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(74,107,255,0.24), transparent 70%)' }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[0.72rem] uppercase tracking-[0.16em] text-mist-500">The loop</p>
          <span className="inline-flex items-center gap-2 rounded-full border border-ink-700/70 bg-ink-900/60 px-2.5 py-1 text-[0.68rem] text-mist-400">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-signal-low" />
            live engine
          </span>
        </div>

        <ol className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {stages.map((stage, index) => {
            const isActive = index === active
            return (
              <li key={stage.key} className="relative">
                <motion.div
                  animate={{ opacity: isActive ? 1 : 0.62 }}
                  transition={{ duration: 0.4 }}
                  className={`h-full rounded-xl border px-3 py-2.5 ${
                    isActive ? 'border-accent-400/45 bg-accent-500/8' : 'border-ink-700/60 bg-ink-900/40'
                  }`}
                >
                  <p className="num text-[0.62rem] tracking-[0.18em] text-mist-500">{String(index + 1).padStart(2, '0')}</p>
                  <p className={`mt-1 text-[0.78rem] font-medium ${isActive ? 'text-mist-50' : 'text-mist-300'}`}>{stage.label}</p>
                  <p className="mt-0.5 text-[0.68rem] leading-snug text-mist-500">{stage.detail}</p>
                </motion.div>
                {index < stages.length - 1 ? (
                  <span aria-hidden className="absolute -right-2 top-1/2 hidden h-px w-2 bg-ink-600 sm:block" />
                ) : null}
              </li>
            )
          })}
        </ol>

        <div className="mt-5 space-y-2.5">
          {summary.map((option, index) => (
            <motion.div
              key={option.code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + index * 0.08 }}
              className={`rounded-xl border px-3.5 py-3 ${
                option.recommended ? 'border-accent-400/40 bg-accent-500/6' : 'border-ink-700/60 bg-ink-900/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="num text-[0.7rem] text-mist-500">{option.code}</span>
                  <span className="text-[0.82rem] text-mist-100">{option.name}</span>
                  {option.recommended ? (
                    <span className="rounded-full border border-accent-400/40 px-2 py-0.5 text-[0.62rem] uppercase tracking-wider text-accent-300">
                      recommended
                    </span>
                  ) : null}
                </div>
                <span className="num text-[0.85rem] text-mist-50">{option.success}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: option.recommended ? 'linear-gradient(90deg,#4a6bff,#8b5cf6)' : '#3d4a6d' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${option.success}%` }}
                  transition={{ duration: 1, delay: 0.2 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <div className="mt-2 flex items-center gap-4 text-[0.68rem] text-mist-500">
                <span>deadline risk {option.risk}%</span>
                <span>pressure {option.pressure}/100</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
