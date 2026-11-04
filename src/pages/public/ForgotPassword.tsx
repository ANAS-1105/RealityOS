import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell } from '@/components/layout/AuthShell'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { api, RequestError } from '@/lib/api'

/**
 * Account recovery.
 *
 * Email accounts reset with a one-time recovery code (issued at sign-up) plus a
 * new password — no email is sent, so recovery works even if the mailbox is
 * gone. Provider accounts are recovered with Google/GitHub/Apple instead, which
 * is why that path is explained right next to the form.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setError(null)
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Use at least 8 characters, mixing letters and numbers.')
      return
    }
    setSubmitting(true)
    try {
      await api.account.recover({ email: email.trim(), code: code.trim(), password })
      setDone(true)
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.message : 'We could not reset your password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Use one of the recovery codes you saved when you created your account."
      footer={
        <Link to="/login" className="font-medium text-accent-300 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-[0.9rem] leading-relaxed text-mist-200">
            Your password has been changed and you are signed in. Every other device was signed out.
          </p>
          <ButtonLink to="/app/dashboard" fullWidth>
            Open my dashboard
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-xl border border-signal-high/30 bg-signal-high/8 px-3.5 py-2.5 text-[0.82rem] leading-relaxed text-mist-100">
              {error}
            </p>
          ) : null}

          <Field label="Email" htmlFor="recover-email">
            <Input
              id="recover-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Recovery code" htmlFor="recover-code" hint="The eight codes look like 4F7K-2M9Q.">
            <Input
              id="recover-code"
              autoComplete="one-time-code"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>

          <Field label="New password" htmlFor="recover-password">
            <Input
              id="recover-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Button type="submit" fullWidth loading={submitting}>
            Set a new password
          </Button>
        </form>
      )}

      <div className="mt-6 space-y-3 border-t border-ink-700/60 pt-5 text-[0.8rem] leading-relaxed text-mist-400">
        <p>
          <span className="text-mist-200">Signed up with Google?</span> There is no RealityOS password to reset — recover your account with that
          provider and sign back in.
        </p>
        <p>
          <span className="text-mist-200">Out of recovery codes?</span> Sign in and generate a new set from Settings → Sign-in &amp; security.
        </p>
      </div>
    </AuthShell>
  )
}
