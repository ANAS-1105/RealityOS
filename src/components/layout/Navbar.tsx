import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { SignInWithFreebuff } from '@freebuff/auth/react'
import { useScrollLock } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { ButtonLink, IconButton } from '@/components/ui/Button'
import { Logo } from './Logo'

const PUBLIC_LINKS = [
  { label: 'Product', to: '/features' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'About', to: '/about' },
]

/** Marketing navigation. Authenticated visitors get a single path back to the app. */
export function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { signedIn } = useSession()
  useScrollLock(open)

  return (
    <header className="sticky top-0 z-50 border-b border-ink-800/70 bg-ink-950/72 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Logo to="/" />

        <ul className="hidden items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-[0.85rem] transition-colors ${
                    isActive || (link.to === '/features' && location.pathname === '/') ? 'text-mist-50' : 'text-mist-400 hover:text-mist-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <ButtonLink to="/app/dashboard" size="sm" magnetic>
              Open dashboard
            </ButtonLink>
          ) : (
            <>
              <Link to="/login" className="rounded-lg px-3 py-2 text-[0.85rem] text-mist-300 transition-colors hover:text-mist-50">
                Log in
              </Link>
              <ButtonLink to="/signup" size="sm" magnetic>
                Get started
              </ButtonLink>
            </>
          )}
        </div>

        <IconButton
          label={open ? 'Close menu' : 'Open menu'}
          className="md:hidden"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
        </IconButton>
      </nav>

      {open ? (
        <div className="border-t border-ink-800/70 bg-ink-950/95 px-5 pb-6 pt-4 md:hidden">
          <ul className="space-y-1">
            {PUBLIC_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-mist-200 hover:bg-ink-900/70"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            {signedIn ? (
              <ButtonLink to="/app/dashboard" fullWidth onClick={() => setOpen(false)}>
                Open dashboard
              </ButtonLink>
            ) : (
              <>
                <SignInWithFreebuff
                  returnTo="/app/dashboard"
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-ink-600/70 bg-ink-800/80 text-sm font-medium text-mist-100"
                >
                  Sign in with Freebuff
                </SignInWithFreebuff>
                <ButtonLink to="/signup" fullWidth onClick={() => setOpen(false)}>
                  Create your first simulation
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  )
}
