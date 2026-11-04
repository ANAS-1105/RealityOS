import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Copy, Download, KeyRound, LogOut, Mail, Monitor, Moon, ShieldCheck, Sun, Trash2, UserRound } from 'lucide-react'
import { api, RequestError } from '@/lib/api'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ErrorState, InlineNote } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

/** A titled block inside the settings grid. */
function Section({
  icon,
  title,
  description,
  children,
  className = '',
  id,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <Card as="section" id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`scroll-mt-24 p-6 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-ink-700/70 bg-ink-800/60 text-accent-300">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-[0.95rem] font-medium text-mist-100">{title}</h2>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-mist-400">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  )
}

export default function Settings() {
  const { user, provider, hasPassword, theme, setTheme, refresh } = useSession()
  const { push } = useToast()

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the form in step with the account after a refresh.
  useEffect(() => {
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
  }, [user?.name, user?.email])

  const dirty = name.trim() !== (user?.name ?? '') || email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase()

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileError(null)
    if (name.trim().length < 2) {
      setProfileError('Keep your name at least 2 characters.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setProfileError('Enter a valid email address.')
      return
    }
    setSavingProfile(true)
    try {
      await api.account.updateProfile({ name: name.trim(), email: email.trim().toLowerCase() })
      await refresh()
      push('success', 'Your details are updated.')
    } catch (cause) {
      setProfileError(cause instanceof RequestError ? cause.message : 'We could not save your details. Please try again.')
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError(null)
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('Use at least 8 characters, mixing letters and numbers.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Those two passwords do not match.')
      return
    }
    setChangingPassword(true)
    try {
      await api.account.changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      push('success', 'Password changed. Use it next time you sign in.')
    } catch (cause) {
      setPasswordError(cause instanceof RequestError ? cause.message : 'We could not change your password.')
    } finally {
      setChangingPassword(false)
    }
  }

  const generateRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRecoveryError(null)
    setRecoveryBusy(true)
    try {
      const result = await api.account.regenerateRecovery({ password: recoveryPassword })
      setRecoveryCodes(result.recoveryCodes)
      setRecoveryPassword('')
    } catch (cause) {
      setRecoveryError(cause instanceof RequestError ? cause.message : 'We could not generate new codes.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  const copyCodes = async () => {
    if (!recoveryCodes) return
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const exportData = async () => {
    setExporting(true)
    setError(null)
    try {
      const payload = await api.trainingExport()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `realityos-training-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      push('success', 'Export downloaded.')
    } catch {
      setError('We could not export your data. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const deleteData = async () => {
    setDeleting(true)
    setError(null)
    try {
      await api.deleteAccount()
      setConfirmDelete(false)
      push('success', 'Your account and all data have been deleted.')
      window.location.assign('/signout')
    } catch {
      setError('We could not delete your data. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="-mt-2 space-y-6 sm:-mt-3">
      <PageHeader
        eyebrow="Settings"
        title="Account"
        description="Your details, how you sign in, how RealityOS looks, and what happens to your data."
      />

      {error ? <ErrorState message={error} onRetry={() => setError(null)} /> : null}

      <nav aria-label="Settings sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[
          ['personal-details', 'Personal details'],
          ['security', 'Sign-in & security'],
          ['data', 'Your data'],
          ['session', 'Session'],
          ['appearance', 'Appearance'],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="shrink-0 rounded-full border border-ink-700/70 bg-ink-900/50 px-3.5 py-2 text-[0.78rem] font-medium text-mist-300 transition-colors hover:border-accent-400/50 hover:bg-accent-500/10 hover:text-mist-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-6">
          <Section
            icon={<UserRound aria-hidden className="h-4 w-4" />}
            title="Personal details"
            id="personal-details"
            description="Used on your dashboard and in the simulations you save. You can change both at any time."
          >
            <form onSubmit={saveProfile} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display name" htmlFor="settings-name">
                  <Input
                    id="settings-name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                  />
                </Field>
                <Field label="Email" htmlFor="settings-email" hint={provider === 'local' ? 'You use this address to sign in.' : 'This is the email linked to your provider account.'}>
                  <Input
                    id="settings-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
              </div>

              {profileError ? (
                <p role="alert" className="rounded-lg border border-signal-high/30 bg-signal-high/8 px-3 py-2 text-[0.8rem] text-mist-100">
                  {profileError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2.5">
                <Button type="submit" size="sm" loading={savingProfile} disabled={!dirty}>
                  Save changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!dirty || savingProfile}
                  onClick={() => {
                    setName(user?.name ?? '')
                    setEmail(user?.email ?? '')
                    setProfileError(null)
                  }}
                >
                  Reset
                </Button>
                <span className="text-[0.75rem] text-mist-500">{dirty ? 'Unsaved changes' : 'Everything is saved'}</span>
              </div>
            </form>
          </Section>

          <Section
            icon={<ShieldCheck aria-hidden className="h-4 w-4" />}
            title="Sign-in & security"
            id="security"
            description="How this account gets in, and how to recover it."
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone={provider === 'local' ? 'accent' : 'neutral'}>
                {provider === 'local' ? 'Email & password' : 'Google via Freebuff'}
              </Badge>
              <span className="text-[0.78rem] text-mist-500">
                {provider === 'local' ? 'A RealityOS password protects this account.' : 'Your password is held by the identity provider.'}
              </span>
            </div>

            {hasPassword ? (
              <form onSubmit={changePassword} noValidate className="mt-5 space-y-4 border-t border-ink-700/60 pt-5">
                <p className="text-[0.8rem] font-medium text-mist-200">Change password</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Current" htmlFor="current-password">
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                  </Field>
                  <Field label="New" htmlFor="new-password">
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </Field>
                  <Field label="Confirm new" htmlFor="confirm-password">
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </Field>
                </div>

                {passwordError ? (
                  <p role="alert" className="rounded-lg border border-signal-high/30 bg-signal-high/8 px-3 py-2 text-[0.8rem] text-mist-100">
                    {passwordError}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2.5">
                  <Button type="submit" size="sm" loading={changingPassword} disabled={!currentPassword || !newPassword}>
                    Update password
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<KeyRound aria-hidden className="h-4 w-4" />}
                    onClick={() => {
                      setRecoveryOpen(true)
                      setRecoveryCodes(null)
                      setRecoveryError(null)
                    }}
                  >
                    New recovery codes
                  </Button>
                </div>
                <p className="text-[0.76rem] leading-relaxed text-mist-500">
                  Changing your password keeps this browser signed in and leaves your other sessions alone.
                </p>
              </form>
            ) : (
              <InlineNote>
                <p className="text-[0.8rem] leading-relaxed text-mist-400">
                  This account signs in with Google through Freebuff, so there is no RealityOS password to change. Recover it with that provider if you
                  lose access.
                </p>
              </InlineNote>
            )}
          </Section>

          <Section
            icon={<Mail aria-hidden className="h-4 w-4" />}
            id="data"
            title="Your data"
            description="Training rows are what calibrate the model for you."
          >
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={exportData} loading={exporting} icon={<Download aria-hidden className="h-4 w-4" />}>
                Export training data
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} loading={deleting} icon={<Trash2 aria-hidden className="h-4 w-4" />}>
                Delete all my data
              </Button>
            </div>
            <p className="mt-4 text-[0.78rem] leading-relaxed text-mist-500">
              Deletion removes your profile, every simulation, analysis and outcome, and every training row — immediately and irreversibly.
            </p>
          </Section>
        </div>

        <div className="space-y-6">
          <Section
            icon={<LogOut aria-hidden className="h-4 w-4" />}
            id="session"
            title="Session"
            description="Who is signed in on this browser."
          >
            <p className="text-[0.95rem] text-mist-100">{user?.name ?? 'RealityOS user'}</p>
            <p className="mt-0.5 text-[0.84rem] text-mist-400">{user?.email ?? 'No email on file'}</p>
            <div className="mt-5">
              <ButtonLink to="/signout" variant="secondary" size="sm" icon={<LogOut aria-hidden className="h-4 w-4" />}>
                Sign out
              </ButtonLink>
            </div>
            <p className="mt-3 text-[0.76rem] leading-relaxed text-mist-500">
              Signing out clears the session cookie on this device. Your simulations stay saved.
            </p>
          </Section>

          <Section id="appearance" icon={<Sun aria-hidden className="h-4 w-4" />} title="Appearance" description="Light is the default. System follows your OS.">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={theme === 'light' ? 'primary' : 'ghost'} onClick={() => setTheme('light')} icon={<Sun aria-hidden className="h-4 w-4" />}>
                Light
              </Button>
              <Button size="sm" variant={theme === 'dark' ? 'primary' : 'ghost'} onClick={() => setTheme('dark')} icon={<Moon aria-hidden className="h-4 w-4" />}>
                Dark
              </Button>
              <Button size="sm" variant={theme === 'system' ? 'primary' : 'ghost'} onClick={() => setTheme('system')} icon={<Monitor aria-hidden className="h-4 w-4" />}>
                System
              </Button>
            </div>
          </Section>

          <InlineNote>
            <p className="text-[0.8rem] leading-relaxed text-mist-400">
              Passwords are hashed with PBKDF2-SHA256 and never stored in plain text. Sessions are HTTP-only cookies. No API key ever reaches the
              browser.
            </p>
          </InlineNote>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete all of your data?"
        description="There is no undo and no copy kept anywhere."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep my data
            </Button>
            <Button variant="danger" onClick={deleteData} loading={deleting}>
              Delete everything
            </Button>
          </>
        }
      >
        <p className="text-[0.85rem] leading-relaxed text-mist-300">
          Your profile, every simulation, every analysis, every recorded outcome, every training row and your sign-in details are removed immediately.
          Signing up again starts you as a new account with no history.
        </p>
      </Modal>

      <Modal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title={recoveryCodes ? 'Your new recovery codes' : 'Generate new recovery codes'}
        description={
          recoveryCodes
            ? 'These replace every earlier code. They are shown once — save them now.'
            : 'Confirm your password and we will issue a fresh set of eight one-time codes.'
        }
        size="sm"
        footer={
          recoveryCodes ? (
            <>
              <Button variant="ghost" onClick={copyCodes} icon={copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}>
                {copied ? 'Copied' : 'Copy codes'}
              </Button>
              <Button onClick={() => setRecoveryOpen(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setRecoveryOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="recovery-form" loading={recoveryBusy} disabled={!recoveryPassword}>
                Generate
              </Button>
            </>
          )
        }
      >
        {recoveryCodes ? (
          <ul className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((code) => (
              <li key={code} className="num rounded-lg border border-ink-700/70 bg-ink-900/70 px-3 py-2 text-center text-[0.82rem] tracking-wide text-mist-100">
                {code}
              </li>
            ))}
          </ul>
        ) : (
          <form id="recovery-form" onSubmit={generateRecovery} className="space-y-3">
            <Field label="Current password" htmlFor="recovery-password">
              <Input
                id="recovery-password"
                type="password"
                autoComplete="current-password"
                value={recoveryPassword}
                onChange={(event) => setRecoveryPassword(event.target.value)}
              />
            </Field>
            {recoveryError ? (
              <p role="alert" className="text-[0.8rem] text-signal-high">
                {recoveryError}
              </p>
            ) : null}
          </form>
        )}
      </Modal>
    </div>
  )
}
