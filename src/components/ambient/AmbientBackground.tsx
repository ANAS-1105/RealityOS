import { useEffect, useRef } from 'react'
import { useHasPointer, useReducedMotion } from '@/lib/hooks'
import { useSession } from '@/lib/session'

/**
 * Global ambient background.
 *
 * Both palettes use slow, softly blurred color washes for a clean ambient motion.
 * Dark mode also keeps a tiny particle field. Motion is decorative, ignores pointer
 * input for interaction, pauses when hidden, and respects reduced-motion settings.
 */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const hasPointer = useHasPointer()
  const { effectiveTheme } = useSession()
  const dark = effectiveTheme === 'dark'

  useEffect(() => {
    if (!dark || reduced) return
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
    const count = width < 700 ? 10 : width < 1200 ? 16 : 22
    const particles = Array.from({ length: count }, (_, index) => {
      const seed = (index * 9301 + 49297) % 233280
      const rand = seed / 233280
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.1,
        vy: -0.04 - Math.random() * 0.12,
        r: 0.5 + rand * 1.1,
        alpha: 0.1 + rand * 0.22,
        accent: rand > 0.78,
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
          if (distance < 140 && distance > 0.01) {
            const push = (1 - distance / 140) * 0.22
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
          ? `rgba(139, 92, 246, ${particle.alpha})`
          : `rgba(109, 139, 255, ${particle.alpha})`
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
    if (hasPointer) window.addEventListener('pointermove', onPointerMove, { passive: true })
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [dark, hasPointer, reduced])

  if (!dark) {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-white">
        <div className={`ambient-wash ambient-wash-light ambient-wash-one${reduced ? ' ambient-static' : ''}`} />
        <div className={`ambient-wash ambient-wash-light ambient-wash-two${reduced ? ' ambient-static' : ''}`} />
        <div className="ambient-grain-light" />
        <div className="ambient-grid-light" />
      </div>
    )
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'var(--color-ink-950)' }} />
      <div className={`ambient-wash ambient-wash-dark ambient-wash-one${reduced ? ' ambient-static' : ''}`} />
      <div className={`ambient-wash ambient-wash-dark ambient-wash-two${reduced ? ' ambient-static' : ''}`} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="ambient-grid-dark" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, transparent 30%, rgba(5,7,14,0.52) 88%)' }}
      />
    </div>
  )
}
