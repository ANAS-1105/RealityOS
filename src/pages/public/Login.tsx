import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { LogIn, ShieldCheck, Sparkles } from 'lucide-react'
import { SignInWithFreebuff } from '@freebuff/auth/react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { safeReturnTo } from '@freebuff/auth'

/**
 * Sign-in. Credentials are handled by the Freebuff identity provider (which offers
 * Google, GitHub and Apple), so there is no password form here and RealityOS never
 * stores a password.
 */
export default function Login() {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo')) || '/app/dashboard'

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Badge tone="accent">
          <Sparkles aria-hidden className="h-3 w-3" />
          Welcome back
        </Badge>
        <h1 className="mt-5 text-[2rem] leading-tight sm:text-[2.4rem]">Sign in to your decision workspace.</h1>
        <p className="mt-4 max-w-md text-[0.92rem] leading-relaxed text-mist-400">
          Your simulations, option sets and recorded outcomes are waiting exactly where you left them.
        </p>
        <ul className="mt-6 space-y-2.5 text-[0.85rem] text-mist-400">
          <li className="flex items-start gap-2.5">
            <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-low" />
            No password stored by RealityOS — sign-in is delegated over OpenID Connect.
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-low" />
            Sessions live in secure, HTTP-only cookies.
          </li>
        </ul>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}>
        <Card className="p-6">
          <h2 className="text-[1.05rem] font-semibold text-mist-50">Continue with Freebuff</h2>
          <p className="mt-1.5 text-[0.85rem] text-mist-400">Use Google, GitHub or Apple through the Freebuff identity provider.</p>
          <SignInWithFreebuff
            returnTo={returnTo}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-accent-400/40 bg-accent-500 text-sm font-medium text-white shadow-[0_10px_30px_-12px_rgba(74,107,255,0.75)] transition-colors hover:bg-accent-400"
          >
            <LogIn aria-hidden className="h-4 w-4" />
            Sign in with Freebuff
          </SignInWithFreebuff>

          <p className="mt-5 text-center text-[0.82rem] text-mist-500">
            New to RealityOS?{' '}
            <Link to="/signup" className="text-accent-300 underline-offset-2 hover:underline">
              Create an account
            </Link>
          </p>
          <p className="mt-2 text-center text-[0.82rem] text-mist-500">
            Trouble getting in?{' '}
            <Link to="/forgot-password" className="text-accent-300 underline-offset-2 hover:underline">
              Account recovery
            </Link>
          </p>
        </Card>
      </motion.div>
    </div>
  )
}
