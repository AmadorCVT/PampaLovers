"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface Particle {
  /** Posición de reposo (grilla con jitter). */
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  weight: number
}

/**
 * Campo de partículas tipo "surcos": cientos de trazos cortos que se ordenan en un anillo
 * alrededor del puntero y giran hacia él. Sin puntero (mobile / inactivo) el foco recorre
 * la pantalla solo. Respeta `prefers-reduced-motion` dibujando un único cuadro estático.
 */
export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, lastMove: -Infinity }
    let particles: Particle[] = []
    let width = 0
    let height = 0
    let frame = 0
    let running = false
    const startedAt = performance.now()

    function build() {
      const rect = canvas!.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      const gap = width < 640 ? 24 : 28
      particles = []
      for (let y = gap / 2; y < height; y += gap) {
        for (let x = gap / 2; x < width; x += gap) {
          const hx = x + (Math.random() - 0.5) * gap * 0.9
          const hy = y + (Math.random() - 0.5) * gap * 0.9
          particles.push({
            hx,
            hy,
            x: hx,
            y: hy,
            vx: 0,
            vy: 0,
            phase: Math.random() * Math.PI * 2,
            weight: 0.7 + Math.random() * 0.8,
          })
        }
      }
      if (!Number.isFinite(pointer.lastMove)) {
        pointer.x = pointer.tx = width * 0.5
        pointer.y = pointer.ty = height * 0.55
      }
    }

    function draw(now: number) {
      const t = (now - startedAt) / 1000

      // Sin interacción reciente, el foco "pasea" en una curva de Lissajous.
      if (now - pointer.lastMove > 3500) {
        pointer.tx = width * (0.5 + 0.24 * Math.sin(t * 0.33))
        pointer.ty = height * (0.55 + 0.16 * Math.sin(t * 0.47 + 1.2))
      }
      pointer.x += (pointer.tx - pointer.x) * 0.07
      pointer.y += (pointer.ty - pointer.y) * 0.07

      const radius = Math.max(110, Math.min(240, Math.min(width, height) * 0.24))
      const swirl = Math.sin(t * 0.8) * 14

      ctx!.clearRect(0, 0, width, height)
      ctx!.lineCap = "round"

      for (const p of particles) {
        // Destino: reposo + leve deriva orgánica.
        let tx = p.hx + Math.sin(t * 0.6 + p.phase) * 3
        let ty = p.hy + Math.cos(t * 0.5 + p.phase) * 3

        const dx = p.hx - pointer.x
        const dy = p.hy - pointer.y
        const dist = Math.hypot(dx, dy) || 0.001
        const nx = dx / dist
        const ny = dy / dist

        // Empuja hacia el anillo: desde adentro hacia afuera, y atrae un poco desde afuera.
        const push =
          dist < radius
            ? (radius - dist) * 0.92
            : -(dist - radius) * 0.28 * Math.exp(-(dist - radius) / radius)
        const ring = Math.exp(-(((dist - radius) / (radius * 0.6)) ** 2))
        tx += nx * push - ny * swirl * ring
        ty += ny * push + nx * swirl * ring

        p.vx = (p.vx + (tx - p.x) * 0.06) * 0.82
        p.vy = (p.vy + (ty - p.y) * 0.06) * 0.82
        p.x += p.vx
        p.y += p.vy

        const cx = p.x - pointer.x
        const cy = p.y - pointer.y
        const cDist = Math.hypot(cx, cy)
        const glow = Math.exp(-(((cDist - radius) / (radius * 0.42)) ** 2))
        const angle = Math.atan2(cy, cx)
        const len = (1.6 + 7 * glow) * p.weight
        const ux = Math.cos(angle) * len * 0.5
        const uy = Math.sin(angle) * len * 0.5

        // Paleta de cultivo: verde → lima → dorado, rotando alrededor del anillo.
        const hue = 98 + 48 * Math.sin(angle + t * 0.4)
        const alpha = 0.1 + 0.85 * glow
        ctx!.strokeStyle = `hsla(${hue.toFixed(0)}, ${(45 + 45 * glow).toFixed(0)}%, ${(
          48 +
          18 * glow
        ).toFixed(0)}%, ${alpha.toFixed(3)})`
        ctx!.lineWidth = (1 + glow * 1.2) * p.weight
        ctx!.beginPath()
        ctx!.moveTo(p.x - ux, p.y - uy)
        ctx!.lineTo(p.x + ux, p.y + uy)
        ctx!.stroke()
      }
    }

    function loop(now: number) {
      draw(now)
      frame = requestAnimationFrame(loop)
    }
    function start() {
      if (running || reduceMotion) return
      running = true
      frame = requestAnimationFrame(loop)
    }
    function stop() {
      running = false
      cancelAnimationFrame(frame)
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
      pointer.tx = x
      pointer.ty = y
      pointer.lastMove = performance.now()
    }

    build()
    if (reduceMotion) {
      // Asentar las partículas en el anillo y dibujar un cuadro estático.
      for (let i = 0; i < 90; i++) draw(startedAt)
    }

    const resizeObserver = new ResizeObserver(() => {
      build()
      if (reduceMotion) for (let i = 0; i < 90; i++) draw(startedAt)
    })
    resizeObserver.observe(canvas)

    const visibility = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) start()
      else stop()
    })
    visibility.observe(canvas)

    window.addEventListener("pointermove", onPointerMove, { passive: true })

    return () => {
      stop()
      resizeObserver.disconnect()
      visibility.disconnect()
      window.removeEventListener("pointermove", onPointerMove)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className={cn("h-full w-full", className)} />
}
