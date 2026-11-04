import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { SignInWithFreebuff } from '@freebuff/auth/react'
import { AuthShell, AUTH_BUTTON, GoogleMark } from '@/components/layout/AuthShell'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api, RequestError } from '@/lib/api'
import { useSession } from '@/lib/session'

/**
 * Create an account.
 *
 * Email + password is the primary path; the provider button sits underneath and
 * creates exactly the same kind of account. Email sign-ups receive one-time
 * recovery codes, shown once and stored only as hashes.
 */
export default function SignUp() {
  const navigate = useNavigate()
  const { refresh } = useSession()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [codes, setCodes] = useState<string[] | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setError(null)

    if (name.trim().length < 2) {
      setError('Tell us the name to show on your account.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Use at least 8 characters, mixing letters and numbers.')
      return
    }
    if (password !== confirm) {
      setError('Those two passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api.account.signUp({ name: name.trim(), email: email.trim(), password })
      await refresh()
      setCodes(result.recoveryCodes)
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.message : 'We could not create your account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const copyCodes = async () => {
    if (!codes) return
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="One decision is all it takes to see the loop. You'll get a worked example first."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-300 underline-offset-2 hover:underline">
            Sign in
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

        <Field label="Name" htmlFor="signup-name">
          <Input
            id="signup-name"
            name="name"
            autoComplete="name"
            placeholder="How should we address you?"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="signup-email">
          <Input
            id="signup-email"
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

        <Field label="Password" htmlFor="signup-password" hint="At least 8 characters, mixing letters and numbers.">
          <div className="relative">
            <Input
              id="signup-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Choose a password"
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

        <Field label="Confirm password" htmlFor="signup-confirm">
          <Input
            id="signup-confirm"
            name="confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Type it once more"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>

        <Button type="submit" size="md" fullWidth loading={submitting}>
          Create account
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-700/70" />
        <span className="text-[0.72rem] uppercase tracking-[0.14em] text-mist-500">or continue with</span>
        <span className="h-px flex-1 bg-ink-700/70" />
      </div>

      <SignInWithFreebuff returnTo="/onboarding" className={`${AUTH_BUTTON} mt-4`}>
        <GoogleMark />
        Sign up with Google
      </SignInWithFreebuff>

      <ul className="mt-5 space-y-2.5 border-t border-ink-700/60 pt-5 text-[0.83rem] text-mist-400">
        <li>Three quick questions, then you&apos;re working.</li>
        <li>A demo simulation appears in your dashboard.</li>
        <li>Everything stays private to your account.</li>
      </ul>

      <Modal
        open={Boolean(codes)}
        onClose={() => undefined}
        title="Save your recovery codes"
        description="These are shown once. Each one can reset your password a single time."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={copyCodes} icon={copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}>
              {copied ? 'Copied' : 'Copy codes'}
            </Button>
            <Button onClick={() => navigate('/onboarding', { replace: true })} disabled={!saved}>
              Continue
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[0.82rem] leading-relaxed text-mist-400">
            If you lose your password, a recovery code is the only way back in. Store them somewhere safe — they are not emailed to you.
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {(codes ?? []).map((code) => (
              <li key={code} className="num rounded-lg border border-ink-700/70 bg-ink-900/70 px-3 py-2 text-center text-[0.82rem] tracking-wide text-mist-100">
                {code}
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2.5 pt-1 text-[0.82rem] text-mist-300">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-ink-600 accent-accent-500"
            />
            I have saved these codes somewhere safe.
          </label>
        </div>
      </Modal>
    </AuthShell>
  )
}
