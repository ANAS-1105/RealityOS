import { useCountUp } from '@/lib/hooks'

/**
 * The confidence dial used on cards and the dashboard. Deliberately simple: an
 * SVG arc, no library, and it animates with the number it shows.
 */
export function ConfidenceRing({
  value,
  size = 88,
  label = 'confidence',
  tone = 'accent',
}: {
  value: number | null
  size?: number
  label?: string
  tone?: 'accent' | 'violet' | 'low' | 'medium' | 'high'
}) {
  const animated = useCountUp(value ?? 0)
  const stroke = size >= 80 ? 5 : 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(100, animated)) / 100
  const colors = {
    accent: '#4a6bff',
    violet: '#8b5cf6',
    low: '#34d399',
    medium: '#fbbf24',
    high: '#fb7185',
  }
  const color = colors[tone]

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(43,55,87,0.7)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="absolute text-center">
        <span className="num block text-lg font-semibold text-mist-50">{value === null ? '—' : Math.round(animated)}</span>
        <span className="block text-[0.62rem] uppercase tracking-[0.12em] text-mist-500">{label}</span>
      </span>
    </div>
  )
}
