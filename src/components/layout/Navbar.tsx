import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { ButtonLink, IconButton } from '@/components/ui/Button'
import { Logo } from './Logo'

const PUBLIC_LINKS = [
  { label: 'Product', to: '/features' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'About', to: '/about' },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { signedIn, effectiveTheme, setTheme } = useSession()
  useScrollLock(open)

  const ThemeToggle = () => (
    <IconButton
      label={`Switch to ${effectiveTheme === 'light' ? 'dark' : 'light'} theme`}
      onClick={() => setTheme(effectiveTheme === 'light' ? 'dark' : 'light')}
    >
      {effectiveTheme === 'light' ? <Moon aria-hidden className="h-4 w-4" /> : <Sun aria-hidden className="h-4 w-4" />}
    </IconButton>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-ink-800/70 bg-ink-950/72 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-15 w-full max-w-none items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Logo to="/" />

        <ul className="hidden items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-[0.85rem] transition-colors ${
                    isActive || (link.to === '/features' && location.pathname === '/')
                      ? 'text-mist-50'
                      : 'text-mist-400 hover:text-mist-100'
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
            <>
              <ThemeToggle />
              <ButtonLink to="/app/dashboard" size="sm" magnetic>Open dashboard</ButtonLink>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link to="/login" className="rounded-lg px-3 py-2 text-[0.85rem] text-mist-300 transition-colors hover:text-mist-50">
                Log in
              </Link>
              <ButtonLink to="/signup" size="sm" magnetic>Get started</ButtonLink>
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
              <>
                <ButtonLink to="/app/dashboard" fullWidth onClick={() => setOpen(false)}>Open dashboard</ButtonLink>
                <button
                  type="button"
                  className="w-full rounded-lg border border-ink-700/70 bg-ink-900/60 px-3 py-2.5 text-sm text-mist-200 hover:bg-ink-900/80"
                  onClick={() => {
                    setTheme(effectiveTheme === 'light' ? 'dark' : 'light')
                    setOpen(false)
                  }}
                >
                  {effectiveTheme === 'light' ? 'Switch to dark' : 'Switch to light'}
                </button>
              </>
            ) : (
              <>
                <ButtonLink to="/login" fullWidth onClick={() => setOpen(false)}>Sign in</ButtonLink>
                <ButtonLink to="/signup" variant="secondary" fullWidth onClick={() => setOpen(false)}>Create account</ButtonLink>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  )
}
