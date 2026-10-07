import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowLeft, KeyRound, LifeBuoy } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { InlineNote } from '@/components/ui/Feedback'

/**
 * Account recovery.
 *
 * There is deliberately no password form here: RealityOS does not hold
 * credentials, so it cannot reset a password it never had. Instead this page
 * explains where recovery actually happens — which is more honest than a form
 * that silently does nothing.
 */
export default function ForgotPassword() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Badge tone="accent">
          <KeyRound aria-hidden className="h-3 w-3" />
          Account recovery
        </Badge>
        <h1 className="mt-5 text-[1.9rem] leading-tight">Recovering access to RealityOS</h1>
        <p className="mt-4 text-[0.92rem] leading-relaxed text-mist-400">
          RealityOS signs you in through the Freebuff identity provider and never stores a password of its own — so there is no RealityOS
          password to reset. Recovery happens at the identity provider instead.
        </p>
      </motion.div>

      <Card className="mt-8 p-6">
        <h2 className="text-[1rem] font-semibold text-mist-50">What to do</h2>
        <ol className="mt-4 space-y-4 text-[0.88rem] leading-relaxed text-mist-300">
          <li className="flex gap-3">
            <span className="num mt-0.5 text-accent-300">01</span>
            <span>
              Go to the sign-in page and choose <strong className="font-medium text-mist-100">Sign in with Freebuff</strong>. If your session
              simply expired, signing in again restores it with no recovery step.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="num mt-0.5 text-accent-300">02</span>
            <span>
              If you signed up with Google, GitHub or Apple, recover that account with the provider itself — that is where the credentials live.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="num mt-0.5 text-accent-300">03</span>
            <span>
              Still locked out? Use the Freebuff account recovery flow for your {''}
              <span className="text-mist-100">Freebuff account</span>. A successful recovery restores access to the same RealityOS data, because
              your simulations are keyed to your account identifier rather than to an email address.
            </span>
          </li>
        </ol>

        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to="/login" magnetic>
            Back to sign in
          </ButtonLink>
          <ButtonLink to="/privacy" variant="secondary">
            How your data is handled
          </ButtonLink>
        </div>
      </Card>

      <InlineNote tone="accent">
        <p className="flex items-start gap-2">
          <LifeBuoy aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Because RealityOS cannot verify an email address it did not issue, we never “link” accounts by matching emails — that would be a
            security risk rather than a recovery feature.
          </span>
        </p>
      </InlineNote>

      <p className="mt-6 text-[0.82rem] text-mist-500">
        <Link to="/signup" className="text-accent-300 underline-offset-2 hover:underline">
          <ArrowLeft aria-hidden className="mr-1 inline h-3 w-3" />
          Create a new account instead
        </Link>
      </p>
    </div>
  )
}
