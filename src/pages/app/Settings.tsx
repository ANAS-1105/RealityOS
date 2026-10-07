import { useState } from 'react'
import { AlertTriangle, Brain, Database, Download, KeyRound, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { SignOutButton } from '@freebuff/auth/react'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, Section } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, InlineNote, Skeleton } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { DECISION_STYLE_LABELS, USE_CASE_LABELS } from '@/shared/demo'
import type { DecisionStyle, UseCase } from '@/shared/types'

export default function Settings() {
  const { user, profile, learning, engine, counts, refresh } = useSession()
  const { push } = useToast()
  const model = useAsync(() => api.modelCard(), [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const downloadExport = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/profile/training-export', { credentials: 'same-origin' })
      if (!response.ok) throw new Error('export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `realityos-training-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      push('success', 'Export downloaded. Feed it to npm run train -- --real.')
    } catch {
      push('error', 'We could not build that export. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const deleteEverything = async () => {
    setDeleting(true)
    try {
      await api.deleteAccount()
      push('success', 'All of your RealityOS data has been deleted.')
      setConfirmDelete(false)
      await refresh()
    } catch {
      push('error', 'We could not delete your data. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Settings" title="Account, data and engine" description="Everything RealityOS knows about you, and every control over it." />

      <div className="space-y-8">
        <Section title="Account" sub="Identity and session, handled by the Freebuff identity provider.">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-ink-600/70 bg-ink-800/70 text-sm font-semibold text-mist-100">
                  {(user?.name ?? user?.email ?? 'You')
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join('')}
                </span>
                <div>
                  <p className="text-[0.92rem] text-mist-50">{user?.name ?? 'Unnamed account'}</p>
                  <p className="text-[0.8rem] text-mist-500">{user?.email ?? 'No email on this account'}</p>
                </div>
              </div>
              <SignOutButton
                returnTo="/"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-700/70 bg-ink-900/60 px-3.5 text-sm text-mist-200 hover:text-mist-50"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                Sign out
              </SignOutButton>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-3">
                <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Primary use case</dt>
                <dd className="mt-1 text-[0.85rem] text-mist-100">
                  {profile?.useCase ? USE_CASE_LABELS[profile.useCase as UseCase] : 'Not set'}
                </dd>
              </div>
              <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-3">
                <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Decision style</dt>
                <dd className="mt-1 text-[0.85rem] text-mist-100">
                  {profile?.decisionStyle ? DECISION_STYLE_LABELS[profile.decisionStyle as DecisionStyle] : 'Not set'}
                </dd>
              </div>
              <div className="rounded-xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-3">
                <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-mist-500">Stored</dt>
                <dd className="num mt-1 text-[0.85rem] text-mist-100">
                  {counts.total} simulations · {counts.outcomes} outcomes
                </dd>
              </div>
            </dl>
            <p className="mt-4 flex items-start gap-2 text-[0.78rem] leading-relaxed text-mist-500">
              <KeyRound aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              RealityOS stores no password. Sign-in is delegated over OpenID Connect with PKCE and the session lives in a secure, HTTP-only
              cookie.
            </p>
          </Card>
        </Section>

        <Section title="Engine & model" sub="Which reasoning core is active, and exactly what produces the probabilities.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Brain aria-hidden className="h-4 w-4 text-violet-400" />
                <h3 className="text-[0.92rem] font-medium text-mist-50">Active engine</h3>
              </div>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-mist-400">{engine?.note ?? 'Engine status unavailable.'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={engine?.mode === 'ai' ? 'violet' : 'neutral'}>
                  {engine?.mode === 'ai' ? `Agent pipeline · ${engine.model}` : 'Local reasoning core'}
                </Badge>
                {engine?.provider ? <Badge tone="neutral">{engine.provider}</Badge> : null}
              </div>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-mist-500">
                {engine?.mode === 'ai'
                  ? 'Language models write the strategies, assumptions, challenges and explanations. Every probability is recomputed locally.'
                  : 'No provider key is configured, so extraction, planning, risk analysis and reflection all run from the deterministic engine on the server. The workflow is identical.'}
              </p>
            </Card>

            <Card className="p-5">
              <h3 className="text-[0.92rem] font-medium text-mist-50">Workload model</h3>
              {model.loading ? (
                <Skeleton className="mt-3 h-32 w-full" />
              ) : model.error ? (
                <ErrorState message="We could not load the model card." onRetry={model.reload} />
              ) : model.data ? (
                <>
                  <p className="mt-2 text-[0.84rem] leading-relaxed text-mist-400">{model.data.model.algorithms}</p>
                  <dl className="mt-4 space-y-2.5 text-[0.8rem]">
                    <Row label="Completion AUC" value={model.data.model.metrics.success.auc.toFixed(3)} />
                    <Row label="Deadline AUC" value={model.data.model.metrics.deadlineMiss.auc.toFixed(3)} />
                    <Row label="Pressure R²" value={model.data.model.metrics.stress.r2.toFixed(3)} />
                    <Row label="Version" value={`v${model.data.model.version}`} />
                    <Row label="Trained" value={model.data.model.trainedAt.slice(0, 10)} />
                  </dl>
                  <p className="mt-3 text-[0.76rem] leading-relaxed text-mist-500">{model.data.model.provenance}</p>
                  <p className="mt-2 text-[0.76rem] text-mist-500">
                    Your calibration: {learning?.calibration.sampleSize ?? 0} outcome(s) · follow-through{' '}
                    {Math.round((learning?.reliability ?? 0.72) * 100)}%
                  </p>
                </>
              ) : null}
            </Card>
          </div>
        </Section>

        <Section title="Your data" sub="Export it, or remove it permanently.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Download aria-hidden className="h-4 w-4 text-accent-300" />
                <h3 className="text-[0.92rem] font-medium text-mist-50">Export training rows</h3>
              </div>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-mist-400">
                Downloads the feature rows and labels derived from your recorded outcomes — exactly the format the offline trainer consumes to
                refit the model on real data instead of the simulated cohort.
              </p>
              <Button className="mt-4" variant="secondary" onClick={downloadExport} loading={exporting} icon={<Download aria-hidden className="h-4 w-4" />}>
                Download export
              </Button>
            </Card>

            <Card className="border-signal-high/30 p-5">
              <div className="flex items-center gap-2">
                <Trash2 aria-hidden className="h-4 w-4 text-signal-high" />
                <h3 className="text-[0.92rem] font-medium text-mist-50">Delete all data</h3>
              </div>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-mist-400">
                Removes your profile, every simulation and situation model, all runs, predictions, recorded outcomes and training rows. This is
                immediate and cannot be undone.
              </p>
              <Button className="mt-4" variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 aria-hidden className="h-4 w-4" />}>
                Delete everything
              </Button>
            </Card>
          </div>

          <InlineNote>
            <p className="flex items-start gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Attached documents are parsed in your browser and never uploaded. Provider API keys live only in server-side secrets; the browser
                never receives them. See the{' '}
                <a href="/privacy" className="text-accent-300 underline-offset-2 hover:underline">
                  privacy notes
                </a>{' '}
                for the full description.
              </span>
            </p>
          </InlineNote>
        </Section>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete all of your RealityOS data?"
        description="This removes every simulation and outcome you have recorded, plus the calibration derived from them."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteEverything} loading={deleting}>
              Delete everything
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-[0.85rem] leading-relaxed text-mist-300">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-signal-high" />
          You will stay signed in, but you will start again with an empty dashboard. There is no backup of this data.
        </p>
      </Modal>

      <p className="mt-8 flex items-center gap-2 text-[0.78rem] text-mist-500">
        <Database aria-hidden className="h-3.5 w-3.5" />
        Data is stored in the platform's server-side database, scoped to your account identifier.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-800/70 pb-2 last:border-0">
      <dt className="text-mist-400">{label}</dt>
      <dd className="num text-mist-100">{value}</dd>
    </div>
  )
}
