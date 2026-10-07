import { motion } from 'motion/react'
import { Database, FileLock2, KeyRound, Server, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { InlineNote } from '@/components/ui/Feedback'

const PRACTICES = [
  {
    icon: Database,
    title: 'Your simulations belong to you',
    body: 'Every simulation, situation model, option set, prediction and outcome is stored with your account identifier and every query is scoped to it on the server. A request for someone else’s simulation returns “not found”, never data.',
  },
  {
    icon: FileLock2,
    title: 'Documents are parsed in your browser',
    body: 'PDF, DOCX and text attachments are read locally in your browser and reduced to plain text. Only the extracted text — never the original file — is sent to the server, and it is used solely to build that simulation’s situation model.',
  },
  {
    icon: KeyRound,
    title: 'API keys never reach the browser',
    body: 'Any language-model provider key is configured as a server-side secret. The front end never receives it, logs it, stores it in local storage or forwards it to a third party.',
  },
  {
    icon: ShieldCheck,
    title: 'Authentication without passwords to leak',
    body: 'Sign-in is delegated to the Freebuff identity provider over OpenID Connect with PKCE. RealityOS never sees or stores your password, and sessions are held in secure, HTTP-only cookies — never in browser storage.',
  },
  {
    icon: Server,
    title: 'Sessions and responses are private',
    body: 'Authenticated API responses are marked private and non-cacheable, state-changing requests must come from this site, and the expensive agent endpoints are rate limited per account.',
  },
  {
    icon: Trash2,
    title: 'Deletion is real deletion',
    body: '“Delete all my data” removes your profile, simulations, analyses, runs, predictions, outcomes and training rows from the database. Nothing is soft-deleted and no copy is retained.',
  },
]

export default function Privacy() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Badge tone="accent">Privacy & security</Badge>
        <h1 className="mt-5 text-[2rem] leading-tight sm:text-[2.5rem]">What we do with your decisions.</h1>
        <p className="mt-5 max-w-2xl text-[0.95rem] leading-relaxed text-mist-400">
          This page describes what the product actually does today. It is not a legal contract, and it avoids promises the system cannot keep.
        </p>
      </motion.header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PRACTICES.map((practice, index) => (
          <motion.div
            key={practice.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: index * 0.04 }}
          >
            <Card className="h-full p-5">
              <practice.icon aria-hidden className="h-4 w-4 text-accent-300" />
              <h2 className="mt-3 text-[0.95rem] font-medium text-mist-50">{practice.title}</h2>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-mist-400">{practice.body}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <section className="mt-10 space-y-4">
        <InlineNote tone="accent">
          <p className="font-medium text-mist-100">When an LLM provider is configured</p>
          <p className="mt-1.5">
            Some fields of your situation model — the goal, constraints, deliverable names and the text you typed — are sent to the configured
            language-model endpoint so it can extract structure, propose strategies and write explanations. Probabilities are computed locally
            by the model and never sent for inference at another provider. If no provider key is configured, the platform runs its deterministic
            local reasoning core and no situation text leaves this server.
          </p>
        </InlineNote>
        <InlineNote>
          <p className="font-medium text-mist-100">Retention and export</p>
          <p className="mt-1.5">
            Data is kept until you delete it. Settings can export your simulations and the training rows derived from your recorded outcomes, and
            can delete everything. Deletion is immediate and irreversible.
          </p>
        </InlineNote>
      </section>
    </div>
  )
}
