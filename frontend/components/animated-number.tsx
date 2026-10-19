"use client"

import { useEffect, useRef } from "react"
import { animate, useReducedMotion } from "motion/react"

/**
 * Counts toward `value`, always starting from what is currently on screen so an
 * update mid-animation re-targets smoothly instead of jumping.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  signed = false,
  className,
}: {
  value: number
  decimals?: number
  /** Show "+" on positive values (e.g. percentage change). */
  signed?: boolean
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const format = (n: number) =>
      n.toLocaleString("es-AR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        signDisplay: signed ? "exceptZero" : "auto",
      })

    if (reduce || !Number.isFinite(value)) {
      current.current = value
      el.textContent = Number.isFinite(value) ? format(value) : "—"
      return
    }

    const controls = animate(current.current, value, {
      type: "spring",
      bounce: 0,
      duration: 0.9,
      onUpdate: (v) => {
        current.current = v
        el.textContent = format(v)
      },
    })
    return () => controls.stop()
  }, [value, decimals, signed, reduce])

  return (
    <span ref={ref} className={className}>
      {(0).toLocaleString("es-AR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}
