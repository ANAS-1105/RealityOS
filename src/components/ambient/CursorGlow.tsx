import { useEffect, useRef } from 'react'
import { useHasPointer, useReducedMotion } from '@/lib/hooks'

/**
 * Custom cursor system.
 *
 * A small dot tracks the pointer exactly while a soft glow trails behind it with
 * easing. Buttons and cards marked `data-magnetic` shift slightly toward the
 * cursor, and `data-cursor-glow` surfaces receive a very subtle radial light
 * through the `--cursor-x/--cursor-y` custom properties.
 *
 * Disabled entirely on touch devices, and reduced to a static dot under
 * `prefers-reduced-motion`.
 */
export function CursorGlow() {
  const dotRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const hasPointer = useHasPointer()
  const enabled = hasPointer

  useEffect(() => {
    if (!enabled) return
    const dot = dotRef.current
    const glow = glowRef.current
    if (!dot || !glow) return

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const glowPos = { ...target }
    let frame = 0
    let hoveringInteractive = false
    let pressed = false
    let magneticElement: HTMLElement | null = null

    const render = () => {
      // Ease the glow toward the pointer; the dot stays exact.
      glowPos.x += (target.x - glowPos.x) * (reduced ? 1 : 0.16)
      glowPos.y += (target.y - glowPos.y) * (reduced ? 1 : 0.16)
      dot.style.transform = `translate3d(${target.x - 3}px, ${target.y - 3}px, 0) scale(${pressed ? 0.72 : hoveringInteractive ? 1.5 : 1})`
      glow.style.transform = `translate3d(${glowPos.x - 190}px, ${glowPos.y - 190}px, 0) scale(${hoveringInteractive ? 1.14 : 1})`
      frame = requestAnimationFrame(render)
    }

    const interactiveSelector = 'a, button, [role="button"], input, textarea, select, [data-magnetic]'

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX
      target.y = event.clientY

      document.documentElement.style.setProperty('--cursor-x', `${event.clientX}px`)
      document.documentElement.style.setProperty('--cursor-y', `${event.clientY}px`)

      const element = event.target as HTMLElement | null
      const interactive = element?.closest<HTMLElement>(interactiveSelector) ?? null
      const nextHover = Boolean(interactive)
      if (nextHover !== hoveringInteractive) {
        hoveringInteractive = nextHover
        dot.dataset.hovering = String(nextHover)
      }

      // Magnetic behaviour: elements opt in, and only shift a few pixels.
      const nextMagnetic = interactive?.dataset.magnetic ? interactive : null
      if (magneticElement && magneticElement !== nextMagnetic) {
        magneticElement.style.transform = ''
        magneticElement = null
      }
      if (nextMagnetic) {
        magneticElement = nextMagnetic
        const rect = nextMagnetic.getBoundingClientRect()
        const offsetX = (event.clientX - (rect.left + rect.width / 2)) * 0.08
        const offsetY = (event.clientY - (rect.top + rect.height / 2)) * 0.12
        nextMagnetic.style.transform = `translate3d(${Math.max(-6, Math.min(6, offsetX))}px, ${Math.max(-5, Math.min(5, offsetY))}px, 0)`
      }
    }

    const onDown = () => {
      pressed = true
    }
    const onUp = () => {
      pressed = false
    }
    const onLeave = () => {
      dot.style.opacity = '0'
      glow.style.opacity = '0'
    }
    const onEnter = () => {
      dot.style.opacity = '1'
      glow.style.opacity = '1'
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('pointerenter', onEnter)
    frame = requestAnimationFrame(render)
    onEnter()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerenter', onEnter)
      if (magneticElement) magneticElement.style.transform = ''
      document.documentElement.style.removeProperty('--cursor-x')
      document.documentElement.style.removeProperty('--cursor-y')
    }
  }, [enabled, reduced])

  if (!enabled) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] hidden lg:block">
      <div
        ref={glowRef}
        className="absolute h-[380px] w-[380px] rounded-full opacity-0 transition-opacity duration-500"
        style={{ background: 'radial-gradient(circle, rgba(74,107,255,0.11), rgba(139,92,246,0.05) 45%, transparent 70%)' }}
      />
      <div
        ref={dotRef}
        data-hovering="false"
        className="absolute h-1.5 w-1.5 rounded-full bg-accent-300 opacity-0 mix-blend-screen transition-[opacity,transform] duration-150 data-[hovering=true]:bg-violet-400"
        style={{ boxShadow: '0 0 14px rgba(109,139,255,0.85)' }}
      />
    </div>
  )
}
