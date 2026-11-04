import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props { children: ReactNode }
interface State { failed: boolean }

/** Prevent a route/render exception from leaving the app as a blank screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Deliberately avoid logging user/session data; retain just the runtime error.
    console.error('RealityOS rendering error:', error.message, info.componentStack)
  }

  private retry = () => {
    this.setState({ failed: false })
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold">This page hit a problem</h1>
          <p className="mt-3 text-sm leading-relaxed text-mist-500">Your account data has not been deleted. Reload this page or return to the home screen and try again.</p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={this.retry} className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-mist-50">Try again</button>
            <Link to="/" onClick={this.retry} className="rounded-xl border border-ink-300 px-4 py-2 text-sm font-medium">Home</Link>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
