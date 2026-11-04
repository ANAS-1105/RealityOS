import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AmbientBackground } from '@/components/ambient/AmbientBackground'
import { AppShell } from '@/components/layout/AppShell'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import { ToastProvider } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { SessionProvider, useSession } from '@/lib/session'
import { AppErrorBoundary } from '@/components/ui/AppErrorBoundary'

const Landing = lazy(() => import('@/pages/public/Landing'))
const HowItWorks = lazy(() => import('@/pages/public/HowItWorks'))
const Features = lazy(() => import('@/pages/public/Features'))
const About = lazy(() => import('@/pages/public/About'))
const Privacy = lazy(() => import('@/pages/public/Privacy'))
const Login = lazy(() => import('@/pages/public/Login'))
const SignUp = lazy(() => import('@/pages/public/SignUp'))
const ForgotPassword = lazy(() => import('@/pages/public/ForgotPassword'))
const SignOut = lazy(() => import('@/pages/public/SignOut'))
const NotFound = lazy(() => import('@/pages/public/NotFound'))

const Dashboard = lazy(() => import('@/pages/app/Dashboard'))
const NewSimulation = lazy(() => import('@/pages/app/NewSimulation'))
const SimulationDetail = lazy(() => import('@/pages/app/SimulationDetail'))
const SimulationHistory = lazy(() => import('@/pages/app/SimulationHistory'))
const DecisionProfile = lazy(() => import('@/pages/app/DecisionProfile'))
const Settings = lazy(() => import('@/pages/app/Settings'))
const Onboarding = lazy(() => import('@/pages/app/Onboarding'))

function ScrollToTop() {
  const location = useLocation()
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'auto' })
      return
    }
    // Deep links such as /features#model render behind a lazy Suspense chunk,
    // so the target may not exist on the first frame: poll briefly for it.
    const id = decodeURIComponent(location.hash.slice(1))
    let frame = 0
    let handle = 0
    const attempt = () => {
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' })
        return
      }
      if (frame++ < 60) handle = requestAnimationFrame(attempt)
    }
    handle = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(handle)
  }, [location.pathname, location.hash])
  return null
}

/** Marketing chrome (navbar + footer) around the public pages. */
function MarketingLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}

/** Route guard — never redirects mid-flight. */
function RequireAuth() {
  const { signedIn, loading } = useSession()
  const location = useLocation()

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner label="Checking your session…" />
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center">
        <h1 className="text-xl font-semibold text-mist-50">Sign in to open your decision workspace</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">
          RealityOS keeps every simulation private to your account and calibrates the workload model on your own recorded outcomes.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink to="/login" size="md" magnetic>Sign in</ButtonLink>
          <ButtonLink to="/signup" variant="secondary" size="md">Create an account</ButtonLink>
        </div>
        <p className="mt-4 text-[0.78rem] text-mist-500">
          You were heading to <span className="text-mist-300">{location.pathname}</span>.
        </p>
      </div>
    )
  }

  return <Outlet />
}

function Router() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[70vh] place-items-center">
          <Spinner label="Loading RealityOS…" />
        </div>
      }
    >
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/features" element={<Features />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/signout" element={<SignOut />} />
        </Route>

        <Route path="/onboarding" element={<Onboarding />} />

        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="new" element={<NewSimulation />} />
            <Route path="simulations" element={<SimulationHistory />} />
            <Route path="simulations/:id" element={<SimulationDetail />} />
            <Route path="profile" element={<DecisionProfile />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <AmbientBackground />
        <ScrollToTop />
        <AppErrorBoundary>
          <main className="relative z-10">
            <Router />
          </main>
        </AppErrorBoundary>
      </ToastProvider>
    </SessionProvider>
  )
}
