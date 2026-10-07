/** Small formatting helpers shared by every screen. */

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(digits)}%`
}

export function probability(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 100)}%`
}

export function hours(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(digits)}h`
}

export function signed(value: number | null | undefined, digits = 0, suffix = ''): string {
  if (value === null || value === undefined) return '—'
  const rounded = value.toFixed(digits)
  return `${value > 0 ? '+' : ''}${rounded}${suffix}`
}

export function formatDate(iso: string | null | undefined, opts: { withYear?: boolean } = {}): string {
  if (!iso) return 'Not set'
  const date = new Date(`${iso.length === 10 ? `${iso}T00:00:00Z` : iso}`)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(opts.withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

export function relativeDays(iso: string | null | undefined, today = new Date()): string {
  if (!iso) return 'no deadline'
  const target = new Date(`${iso}T00:00:00Z`).getTime()
  if (Number.isNaN(target)) return 'no deadline'
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`)
  const days = Math.round((target - now) / 86_400_000)
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days === -1) return '1 day overdue'
  if (days < 0) return `${Math.abs(days)} days overdue`
  return `${days} days left`
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function riskLabel(level: 'low' | 'medium' | 'high' | null | undefined): string {
  if (level === 'low') return 'Low risk'
  if (level === 'medium') return 'Medium risk'
  if (level === 'high') return 'High risk'
  return 'Not simulated'
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'analyzed':
      return 'Analysed'
    case 'simulated':
      return 'Simulated'
    case 'decided':
      return 'Decision made'
    case 'completed':
      return 'Outcome recorded'
    default:
      return status
  }
}
