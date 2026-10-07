import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
  htmlFor?: string
  optional?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[0.8rem] font-medium text-mist-200">
          {label}
        </label>
        {optional ? <span className="text-[0.7rem] uppercase tracking-wider text-mist-500">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-[0.78rem] text-signal-high">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.78rem] leading-relaxed text-mist-500">{hint}</p>
      ) : null}
    </div>
  )
}

const controlClass =
  'w-full rounded-xl border border-ink-700/80 bg-ink-900/70 px-3.5 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 transition-[border-color,box-shadow,background] duration-200 hover:border-ink-600 focus:border-accent-400/70 focus:bg-ink-900 focus:outline-none focus:ring-4 focus:ring-accent-500/12'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${controlClass} ${className}`} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`${controlClass} resize-y leading-relaxed ${className}`} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${controlClass} appearance-none bg-[length:14px] pr-9 ${className}`} {...rest}>
      {children}
    </select>
  )
})

/** Labelled slider with a live read-out — the What-If engine's main control. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => String(v),
  minLabel,
  maxLabel,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
  minLabel?: string
  maxLabel?: string
  disabled?: boolean
}) {
  const id = useId()
  const progress = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[0.82rem] font-medium text-mist-200">
          {label}
        </label>
        <output htmlFor={id} className="num rounded-md bg-ink-800/80 px-2 py-0.5 text-[0.8rem] text-accent-300">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-accent-500 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/80 [&::-webkit-slider-thumb]:bg-accent-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(74,107,255,0.18)] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white/80 [&::-moz-range-thumb]:bg-accent-500"
        style={{
          background: `linear-gradient(90deg, var(--color-accent-500) ${progress}%, var(--color-ink-700) ${progress}%)`,
        }}
      />
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-[0.7rem] text-mist-500">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  )
}

/** Segmented control used for onboarding, priorities and filter switches. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  options: { value: T; label: string; hint?: string }[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border text-left transition-[background,border-color,transform] duration-200 ${
              size === 'sm' ? 'px-3 py-1.5 text-[0.8rem]' : 'px-4 py-3 text-sm'
            } ${
              active
                ? 'border-accent-400/60 bg-accent-500/12 text-mist-50 shadow-[0_0_0_1px_rgba(109,139,255,0.25)]'
                : 'border-ink-700/80 bg-ink-900/60 text-mist-300 hover:border-ink-500/70 hover:text-mist-100'
            }`}
          >
            <span className="block font-medium">{option.label}</span>
            {option.hint ? <span className="mt-0.5 block text-[0.72rem] text-mist-500">{option.hint}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
