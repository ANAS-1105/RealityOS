import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { AmbientBackground } from '@/components/ambient/AmbientBackground'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, SegmentedControl } from '@/components/ui/Form'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { DECISION_STYLE_LABELS, USE_CASE_LABELS } from '@/shared/demo'
import type { DecisionStyle, UseCase } from '@/shared/types'

const STEPS = ['Your name', 'How you work', 'Demo simulation'] as const

/**
 * Short onboarding: three useful inputs, nothing more. Finishing it seeds one
 * clearly-labelled demo simulation so the dashboard is never a void.
 */
export default function Onboarding() {
  const { signedIn, loading, user, profile, refresh, onboarded } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(user?.name ?? '')
  const [useCase, setUseCase] = useState<UseCase>('student')
  const [decisionStyle, setDecisionStyle] = useState<DecisionStyle>('balanced')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Loading your account…" />
      </div>
    )
  }

  if (!signedIn) return <Navigate to="/login?returnTo=/onboarding" replace />
  if (onboarded) return <Navigate to="/app/dashboard" replace />

  const finish = async () => {
    if (!name.trim()) {
      setError('Tell us what to call you — it is only used to greet you.')
      setStep(0)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.onboarding({ name: name.trim(), useCase, decisionStyle })
      await refresh()
      navigate('/app/dashboard', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not save that. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative min-h-dvh">
      <AmbientBackground variant="soft" />
      <div className="mx-auto grid min-h-dvh w-full max-w-2xl place-items-center px-5 py-12">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full">
          <div className="mb-6 flex items-center justify-between">
            <Badge tone="accent">
              <Sparkles aria-hidden className="h-3 w-3" />
              Setting up RealityOS
            </Badge>
            <div className="flex items-center gap-2">
              {STEPS.map((label, index) => (
                <span
                  key={label}
                  className={`h-1.5 rounded-full transition-all duration-300 ${index === step ? 'w-8 bg-accent-500' : 'w-4 bg-ink-600'}`}
                  aria-hidden
                />
              ))}
            </div>
          </div>

          <Card className="p-6 sm:p-8">
            {error ? (
              <div className="mb-5">
                <ErrorState message={error} onRetry={finish} />
              </div>
            ) : null}

            {step === 0 ? (
              <div>
                <h1 className="text-[1.5rem]">{greeting(user?.name)}</h1>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-mist-400">
                  Two quick questions so the simulations match how you actually decide. Nothing here is shared.
                </p>
                <div className="mt-6">
                  <Field label="What should we call you?" htmlFor="onboarding-name" hint="Shown in the dashboard greeting and on your profile.">
                    <Input
                      id="onboarding-name"
                      value={name}
                      autoFocus
                      placeholder="Ada"
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && name.trim()) setStep(1)
                      }}
                    />
                  </Field>
                </div>
                <div className="mt-7 flex justify-end">
                  <Button onClick={() => setStep(1)} disabled={!name.trim()} magnetic icon={<ArrowRight aria-hidden className="h-4 w-4" />}>
                    Continue
                  </Button>
                </div>
              </div>
            ) : step === 1 ? (
              <div>
                <h1 className="text-[1.5rem]">How do you usually decide?</h1>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-mist-400">
                  This tunes how the recommendation is framed — it does not change the numbers.
                </p>

                <div className="mt-6 space-y-6">
                  <Field label="Primary use case">
                    <SegmentedControl
                      ariaLabel="Primary use case"
                      value={useCase}
                      onChange={setUseCase}
                      options={(Object.keys(USE_CASE_LABELS) as UseCase[]).map((key) => ({ value: key, label: USE_CASE_LABELS[key] }))}
                    />
                  </Field>
                  <Field label="Decision style">
                    <SegmentedControl
                      ariaLabel="Decision style"
                      value={decisionStyle}
                      onChange={setDecisionStyle}
                      options={(Object.keys(DECISION_STYLE_LABELS) as DecisionStyle[]).map((key) => ({ value: key, label: DECISION_STYLE_LABELS[key] }))}
                    />
                  </Field>
                </div>

                <div className="mt-7 flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(0)}>
                    Back
                  </Button>
                  <Button onClick={finish} loading={saving} magnetic icon={<Check aria-hidden className="h-4 w-4" />}>
                    Finish setup
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mt-8 border-t border-ink-800/70 pt-5">
              <p className="text-[0.78rem] leading-relaxed text-mist-500">
                On finishing, RealityOS will run one demo simulation end to end — situation model, three decision paths, risk analysis and a
                recommendation — so you can see the whole loop before typing your own. It is labelled as a demo and you can delete it.
                {profile?.onboardedAt ? '' : ''}
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

function greeting(name?: string | null): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name.split(' ')[0]}.` : `${part}.`
}
