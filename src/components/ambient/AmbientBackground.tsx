import { useEffect, useRef } from 'react'
import { useHasPointer, useReducedMotion } from '@/lib/hooks'

/**
 * Global ambient background — the only page-level motion in the product.
 *
 * Three cheap layers, all behind the content and never competing with it:
 *   1. a slowly drifting gradient mesh (CSS, two blurred blobs)
 *   2. a faint grid veil that fades out below the fold
 *   3. a sparse canvas particle field that reacts subtly to the pointer
 *
 * It caps the particle count, pauses when the tab is hidden, drops to a static
 * frame under `prefers-reduced-motion`, and disables pointer interaction on
 * touch devices.
 */
export function AmbientBackground({ variant = 'dark' }: { variant?: 'dark' | 'soft' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const hasPointer = useHasPointer()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let width = window.innerWidth
    let height = window.innerHeight
    let frame = 0
    let visible = true

    const pointer = { x: width / 2, y: height / 2, active: false }

    // Density is deliberately low: this is ambience, not a screensaver.
    const count = width < 700 ? 18 : width < 1200 ? 30 : 42
    const particles = Array.from({ length: count }, (_, index) => {
      const seed = (index * 9301 + 49297) % 233280
      const rand = seed / 233280
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: -0.06 - Math.random() * 0.16,
        r: 0.6 + rand * 1.5,
        alpha: 0.16 + rand * 0.34,
        accent: rand > 0.72,
      }
    })

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = () => {
      context.clearRect(0, 0, width, height)
      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy

        if (hasPointer && pointer.active) {
          const dx = particle.x - pointer.x
          const dy = particle.y - pointer.y
          const distance = Math.hypot(dx, dy)
          if (distance < 160 && distance > 0.01) {
            const push = (1 - distance / 160) * 0.32
            particle.x += (dx / distance) * push
            particle.y += (dy / distance) * push
          }
        }

        if (particle.y < -12) particle.y = height + 12
        if (particle.x < -12) particle.x = width + 12
        if (particle.x > width + 12) particle.x = -12

        context.beginPath()
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        context.fillStyle = particle.accent
          ? `rgba(167, 139, 250, ${particle.alpha})`
          : `rgba(168, 188, 255, ${particle.alpha})`
        context.fill()
      }
      if (visible) frame = requestAnimationFrame(draw)
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
    }
    const onVisibility = () => {
      visible = !document.hidden
      if (visible) {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(draw)
      } else {
        cancelAnimationFrame(frame)
      }
    }

    resize()
    window.addEventListener('resize', resize, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    if (hasPointer && !reduced) window.addEventListener('pointermove', onPointerMove, { passive: true })

    if (reduced) {
      draw()
      cancelAnimationFrame(frame)
    } else {
      frame = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [hasPointer, reduced])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-ink-950" />
      <div
        className="absolute -left-[18%] -top-[22%] h-[62vmax] w-[62vmax] rounded-full opacity-[0.5] blur-[120px] animate-drift"
        style={{ background: 'radial-gradient(circle at 40% 40%, rgba(74,107,255,0.34), transparent 62%)' }}
      />
      <div
        className="absolute -right-[16%] top-[8%] h-[52vmax] w-[52vmax] rounded-full opacity-[0.4] blur-[130px] animate-drift"
        style={{ background: 'radial-gradient(circle at 60% 50%, rgba(139,92,246,0.3), transparent 64%)', animationDelay: '-9s' }}
      />
      {variant === 'soft' ? null : (
        <div
          className="absolute bottom-[-20%] left-[10%] h-[44vmax] w-[54vmax] rounded-full opacity-[0.28] blur-[140px] animate-drift"
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(52,211,153,0.22), transparent 66%)', animationDelay: '-16s' }}
        />
      )}
      <div className="absolute inset-0 grid-veil opacity-[0.5]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, transparent 30%, rgba(5,7,14,0.72) 88%)' }}
      />
    </div>
  )
}
