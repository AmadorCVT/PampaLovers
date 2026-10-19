"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

/** `true` la primera vez que el elemento entra en pantalla (no vuelve a `false`). */
export function useInView<T extends Element>(rootMargin = "0px 0px -10% 0px") {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return { ref, inView }
}

/**
 * Progreso de scroll (0–1) escrito como `--p` en el elemento, sin re-renderizar.
 * - `through`: desde que el borde superior entra por abajo hasta que el inferior sale por arriba.
 * - `sticky`: mientras un contenedor alto recorre su hijo `sticky` (0 al fijarse, 1 al soltarse).
 */
export function useScrollProgress<T extends HTMLElement>(
  mode: "through" | "sticky",
  onProgress?: (progress: number) => void,
) {
  const ref = useRef<T>(null)
  const callbackRef = useRef(onProgress)

  useEffect(() => {
    callbackRef.current = onProgress
  }, [onProgress])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0

    const update = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const progress =
        mode === "sticky"
          ? clamp01(-rect.top / Math.max(1, rect.height - vh))
          : clamp01((vh - rect.top) / (vh + rect.height))
      el.style.setProperty("--p", progress.toFixed(4))
      callbackRef.current?.(progress)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      cancelAnimationFrame(frame)
    }
  }, [mode])

  return ref
}

/** Aparece con fade + blur + desplazamiento al entrar en pantalla. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform,filter] duration-1000 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none",
        inView
          ? "translate-y-0 opacity-100 blur-0"
          : "translate-y-10 opacity-0 blur-sm motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:blur-0",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Monta los hijos recién al entrar en pantalla, para que sus animaciones CSS se vean. */
export function WhenVisible({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={className}>
      {inView ? children : null}
    </div>
  )
}

/** Número que cuenta desde 0 cuando entra en pantalla. */
export function CountUp({
  value,
  decimals = 0,
  duration = 1600,
  className,
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
}) {
  const { ref, inView } = useInView<HTMLSpanElement>()
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCurrent(value)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = clamp01((now - start) / duration)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setCurrent(value * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, value, duration])

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {current.toLocaleString("es-AR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}

/** Tarjeta con un halo que sigue al puntero. */
export function SpotlightCard({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`)
        event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`)
      }}
      style={style}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm transition-colors duration-500 hover:border-lime-300/30",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), rgb(190 242 100 / 0.12), transparent 45%)",
        }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  )
}
