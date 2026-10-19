import type { Transition } from "motion/react"

/**
 * Spring presets (Apple "damping + response" mapped to Motion's bounce + duration).
 * Default UI motion is critically damped — no overshoot. Bounce is reserved for
 * interactions that carried momentum.
 */
export const spring = {
  /** Reposition / layout (damping 1.0, response 0.4) */
  move: { type: "spring", bounce: 0, duration: 0.4 },
  /** Snappy feedback: indicators, pills (damping 1.0, response 0.3) */
  snappy: { type: "spring", bounce: 0, duration: 0.3 },
  /** Sheets & drawers after a flick (damping ~0.8, response 0.3) */
  sheet: { type: "spring", bounce: 0.2, duration: 0.3 },
} satisfies Record<string, Transition>

/** Entrance used by page sections: rise + fade, staggered by index. */
export function riseIn(index = 0) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { ...spring.move, delay: 0.04 * index },
  } as const
}
