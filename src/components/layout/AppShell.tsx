import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { motion } from 'motion/react'
import { BarChart3, History, LayoutDashboard, LogOut, Menu, Plus, Settings, Sun, UserRound, X, Moon } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { ButtonLink, IconButton } from '@/components/ui/Button'
import { Logo } from './Logo'

const APP_LINKS = [
  { label: 'Dashboard', to: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Simulations', to: '/app/simulations', icon: History },
  { label: 'Insights', to: '/app/profile', icon: BarChart3 },
  { label: 'Settings', to: '/app/settings', icon: Settings },
]

/** Authenticated shell — tight, one primary action always visible, less chrome. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, engine, setTheme, effectiveTheme } = useSession()
  useScrollLock(menuOpen)

  const initials = (user?.name ?? user?.email ?? 'You')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  const ThemeToggle = () => (
    <IconButton
      label={`Switch to ${effectiveTheme === 'light' ? 'dark' : 'light'} theme`}
      onClick={() => setTheme(effectiveTheme === 'light' ? 'dark' : 'light')}
    >
      {effectiveTheme === 'light' ? <Moon aria-hidden className="h-4 w-4" /> : <Sun aria-hidden className="h-4 w-4" />}
    </IconButton>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800/70 bg-ink-950/78 backdrop-blur-xl">
        <div className="mx-auto flex h-15 w-full max-w-none items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Logo to="/app/dashboard" />

          <nav aria-label="App" className="ml-4 hidden items-center gap-1 lg:flex">
            {APP_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-[0.85rem] transition-colors ${
                    isActive ? 'bg-ink-800/80 text-mist-50' : 'text-mist-400 hover:bg-ink-900/60 hover:text-mist-100'
                  }`
                }
              >
                <link.icon aria-hidden className="h-4 w-4" />
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {engine ? (
              <span
                className="hidden items-center gap-2 rounded-full border border-ink-700/70 bg-ink-900/60 px-3 py-1.5 text-[0.72rem] text-mist-400 xl:inline-flex"
                title={engine.note}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${engine.mode === 'ai' ? 'bg-violet-400' : 'bg-signal-low'}`} />
                {engine.mode === 'ai' ? `Agents · ${engine.model}` : 'Reliability core · local'}
              </span>
            ) : null}
            <ThemeToggle />
            <ButtonLink to="/app/new" size="sm" icon={<Plus aria-hidden className="h-4 w-4" />} magnetic className="hidden sm:inline-flex">
              New simulation
            </ButtonLink>
            <IconButton label="Account menu" className="hidden lg:inline-flex" onClick={() => setMenuOpen((value) => !value)}>
              <span className="grid h-7 w-7 place-items-center rounded-full border border-ink-600/70 bg-ink-800 text-[0.7rem] font-semibold text-mist-100">
                {initials}
              </span>
            </IconButton>
            <IconButton label={menuOpen ? 'Close menu' : 'Open menu'} className="lg:hidden" onClick={() => setMenuOpen((value) => !value)}>
              {menuOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
            </IconButton>
          </div>
        </div>

        {menuOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-ink-800/70 bg-ink-950/96 px-4 pb-5 pt-3 backdrop-blur-xl sm:px-6"
          >
            <div className="mx-auto grid w-full max-w-none gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-[0.72rem] uppercase tracking-[0.14em] text-mist-500">Signed in as {user?.name ?? 'you'}</p>
                <p className="mt-1 text-sm text-mist-300">{user?.email ?? 'Freebuff account'}</p>
                <nav aria-label="App" className="mt-4 grid gap-1 sm:grid-cols-2">
                  {APP_LINKS.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
                          isActive ? 'bg-ink-800/80 text-mist-50' : 'text-mist-300 hover:bg-ink-900/60'
                        }`
                      }
                    >
                      <link.icon aria-hidden className="h-4 w-4" />
                      {link.label}
                    </NavLink>
                  ))}
                  <NavLink
                    to="/app/new"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-accent-300 hover:bg-ink-900/60"
                  >
                    <Plus aria-hidden className="h-4 w-4" />
                    New simulation
                  </NavLink>
                </nav>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ThemeToggle />
                <NavLink
                  to="/app/settings"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-700/70 bg-ink-900/60 px-3 text-sm text-mist-200"
                >
                  <UserRound aria-hidden className="h-4 w-4" />
                  Profile & privacy
                </NavLink>
                <Link
                  to="/signout"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-700/70 bg-ink-900/60 px-3 text-sm text-mist-200 hover:text-mist-50"
                >
                  <LogOut aria-hidden className="h-4 w-4" />
                  Sign out
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </header>

      <main id="main" className="mx-auto w-full max-w-none px-4 pb-16 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
