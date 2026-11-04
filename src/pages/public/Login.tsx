import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { SignInWithFreebuff } from '@freebuff/auth/react'
import { safeReturnTo } from '@freebuff/auth'
import { AuthShell, AUTH_BUTTON, GoogleMark } from '@/components/layout/AuthShell'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { api, RequestError } from '@/lib/api'
import { useSession } from '@/lib/session'

/**
 * Sign in.
 *
 * Two ways in, one card: an email + password form (the normal path) and the
 * provider button underneath. Both end in the same account, so a user who
 * started with one can add the other later without losing anything.
 */
export default function Login() {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo')) || '/app/dashboard'
  const navigate = useNavigate()
  const { refresh } = useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.')
      return
    }
    setSubmitting(true)
    try {
      await api.account.signIn({ email: email.trim(), password })
      await refresh()
      navigate(returnTo, { replace: true })
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.message : 'We could not sign you in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Your simulations and recorded outcomes are exactly where you left them."
      footer={
        <>
          New to RealityOS?{' '}
          <Link to="/signup" className="font-medium text-accent-300 underline-offset-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl border border-signal-high/30 bg-signal-high/8 px-3.5 py-2.5 text-[0.82rem] leading-relaxed text-mist-100">
            {error}
          </p>
        ) : null}

        <Field label="Email" htmlFor="login-email">
          <Input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="login-password">
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-mist-400 transition-colors hover:text-mist-100"
            >
              {showPassword ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between gap-3">
          <Link to="/forgot-password" className="text-[0.8rem] text-mist-400 underline-offset-2 hover:text-mist-100 hover:underline">
            Forgot your password?
          </Link>
          <span className="text-[0.75rem] text-mist-500">Secured with a session cookie</span>
        </div>

        <Button type="submit" size="md" fullWidth loading={submitting}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-700/70" />
        <span className="text-[0.72rem] uppercase tracking-[0.14em] text-mist-500">or continue with</span>
        <span className="h-px flex-1 bg-ink-700/70" />
      </div>

      <SignInWithFreebuff returnTo={returnTo} className={`${AUTH_BUTTON} mt-4`}>
        <GoogleMark />
        Continue with Google
      </SignInWithFreebuff>

      <p className="mt-3 text-center text-[0.75rem] leading-relaxed text-mist-500">
        Google, GitHub or Apple through Freebuff&apos;s secure sign-in — no extra password to remember.
      </p>
    </AuthShell>
  )
}
