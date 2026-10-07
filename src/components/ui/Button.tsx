import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent-500 text-white hover:bg-accent-400 active:bg-accent-600 shadow-[0_10px_30px_-12px_rgba(74,107,255,0.75)] border border-accent-400/40',
  secondary:
    'bg-ink-800/80 text-mist-100 hover:bg-ink-750 border border-ink-600/70 hover:border-ink-500/80',
  ghost: 'bg-transparent text-mist-200 hover:bg-ink-800/70 border border-transparent hover:border-ink-700/70',
  danger: 'bg-signal-high/12 text-signal-high hover:bg-signal-high/20 border border-signal-high/35',
  quiet: 'bg-transparent text-mist-400 hover:text-mist-100 border border-transparent',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-7 text-base gap-2.5 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  magnetic?: boolean
  fullWidth?: boolean
}

const base =
  'relative inline-flex select-none items-center justify-center font-medium transition-[background,color,border-color,transform,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-45'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, magnetic = false, fullWidth, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...(magnetic ? { 'data-magnetic': 'true' } : {})}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${magnetic ? 'magnetic' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

export interface ButtonLinkProps {
  to: string
  variant?: Variant
  size?: Size
  icon?: ReactNode
  magnetic?: boolean
  fullWidth?: boolean
  className?: string
  children: ReactNode
  onClick?: () => void
  'aria-label'?: string
}

/** Same visual language as Button, but a real anchor for navigation. */
export function ButtonLink({ to, variant = 'primary', size = 'md', icon, magnetic, fullWidth, className = '', children, onClick, ...rest }: ButtonLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      {...(magnetic ? { 'data-magnetic': 'true' } : {})}
      className={`${base} ${VARIANTS[variant]} ${SIZES[size]} ${magnetic ? 'magnetic' : ''} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  )
}

export function IconButton({
  label,
  variant = 'ghost',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${base} ${VARIANTS[variant]} h-10 w-10 rounded-lg` + ` ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
