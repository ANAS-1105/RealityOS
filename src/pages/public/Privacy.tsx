import { motion } from 'motion/react'
import { Database, FileLock2, KeyRound, Server, ShieldCheck, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'

const PRACTICES = [
  {
    icon: Database,
    title: 'Your simulations are yours',
    body: 'Every record is scoped to your account on the server. Asking for someone else’s simulation returns “not found”.',
  },
  {
    icon: FileLock2,
    title: 'Documents stay in your browser',
    body: 'PDF, DOCX and text files are read locally. Only the extracted text reaches the server.',
  },
  {
    icon: KeyRound,
    title: 'Keys never reach the browser',
    body: 'Any provider API key is a server-side secret the front end never sees.',
  },
  {
    icon: ShieldCheck,
    title: 'Passwords are never stored',
    body: 'Email accounts keep only a PBKDF2-SHA256 hash with a per-account salt. Sign in with Google instead and no credential reaches us at all.',
  },
  {
    icon: Server,
    title: 'Private responses',
    body: 'Authenticated responses are non-cacheable and state-changing requests must come from this site.',
  },
  {
    icon: Trash2,
    title: 'Deletion is real',
    body: '“Delete all my data” removes everything. Nothing is soft-deleted and no copy is kept.',
  },
]

export default function Privacy() {
  return (
    <div className="mx-auto w-full max-w-none px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">What we do with your decisions.</h1>
        <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-mist-400">
          What the product actually does today — no promises the system can&apos;t keep.
        </p>
      </motion.header>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {PRACTICES.map((practice, index) => (
          <motion.div
            key={practice.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: index * 0.04 }}
          >
            <Card className="h-full p-6">
              <practice.icon aria-hidden className="h-4 w-4 text-accent-400" />
              <h2 className="mt-4 text-[0.95rem] font-medium text-mist-100">{practice.title}</h2>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-mist-400">{practice.body}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="mt-6 p-6">
        <h2 className="text-[0.95rem] font-medium text-mist-100">When an AI provider is configured</h2>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-mist-400">
          Parts of your situation model — the goal, constraints and the text you typed — are sent to the configured provider so it can extract
          structure and write explanations. Probabilities are computed by the model here, never sent elsewhere.
        </p>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-mist-400">
          With no provider key configured, the deterministic local core runs instead and no situation text leaves this server.
        </p>
      </Card>
    </div>
  )
}
