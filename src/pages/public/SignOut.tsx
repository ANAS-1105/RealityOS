import { useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/layout/AuthShell'
import { ButtonLink } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Feedback'
import { useSession } from '@/lib/session'

/**
 * Sign out.
 *
 * A real page, not just a button: it can be linked to, bookmarked and reached
 * from Settings. It clears the email session cookie and, for provider accounts,
 * hands off to Freebuff's sign-out so the OIDC session ends too.
 */
export default function SignOut() {
  const { signOut, signedIn, loading } = useSession()
  const started = useRef(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (loading || started.current) return
    started.current = true
    if (!signedIn) {
      setFinished(true)
      return
    }
    void signOut().finally(() => setFinished(true))
  }, [loading, signedIn, signOut])

  return (
    <AuthShell
      title={finished ? "You're signed out" : 'Signing you out'}
      subtitle={
        finished
          ? 'Your simulations stay saved. Sign back in whenever you want to pick them up.'
          : 'Closing your session and clearing the cookie from this browser.'
      }
    >
      {finished ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-ink-700/70 bg-ink-900/50 px-4 py-3.5">
            <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-low" />
            <p className="text-[0.84rem] leading-relaxed text-mist-300">
              The session cookie for this browser has been cleared. Nothing was deleted from your account.
            </p>
          </div>
          <ButtonLink to="/login" fullWidth>
            Sign in again
          </ButtonLink>
          <ButtonLink to="/" variant="secondary" fullWidth>
            Back to home
          </ButtonLink>
        </div>
      ) : (
        <div className="grid place-items-center py-4">
          <Spinner label="Signing out…" />
        </div>
      )}
    </AuthShell>
  )
}
