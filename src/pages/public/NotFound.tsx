import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[70vh] w-full max-w-xl place-items-center px-5 sm:px-8">
      <Card className="w-full p-8 text-center">
        <Compass aria-hidden className="mx-auto h-6 w-6 text-accent-300" />
        <h1 className="mt-4 text-[1.4rem] font-semibold text-mist-50">That page isn&apos;t part of RealityOS</h1>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-mist-400">
          The link may be old, or the simulation it pointed to may have been deleted. Everything you have is on the dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/app/dashboard" magnetic>
            Go to dashboard
          </ButtonLink>
          <ButtonLink to="/" variant="secondary">
            Back to the homepage
          </ButtonLink>
        </div>
        <p className="mt-6 text-[0.78rem] text-mist-500">
          Looking for the <Link to="/how-it-works" className="text-accent-300 hover:underline">product walkthrough</Link>?
        </p>
      </Card>
    </div>
  )
}
