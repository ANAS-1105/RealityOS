import { Link } from 'react-router-dom'
import { Logo } from './Logo'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Features', to: '/features' },
      { label: 'About', to: '/about' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { label: 'Privacy & security', to: '/privacy' },
      { label: 'How the model works', to: '/features#model' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-ink-800/80">
      <div className="mx-auto grid w-full max-w-none gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.4fr_repeat(2,minmax(0,0.6fr))] lg:px-10">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[0.82rem] leading-relaxed text-mist-500">
            Simulate the decision before you live it.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-[0.72rem] uppercase tracking-[0.14em] text-mist-500">{column.title}</p>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-[0.85rem] text-mist-300 transition-colors hover:text-mist-50">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-ink-800/70">
        <div className="mx-auto flex w-full max-w-none flex-col gap-2 px-5 py-5 text-[0.75rem] text-mist-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p>© {new Date().getFullYear()} RealityOS. Simulations are estimates, not guarantees.</p>
          <p>Probabilities come from a trained model, not a language model.</p>
        </div>
      </div>
    </footer>
  )
}
