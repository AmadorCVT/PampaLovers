"use client"

import type { ReactNode } from "react"
import { motion } from "motion/react"
import { Crosshair } from "lucide-react"
import { BrandMark, BrandWordmark } from "@/components/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import { spring } from "@/lib/motion"

/* Parcels on a 520×360 grid, seen from orbit. tone = NDVI-ish vigor 0..1 */
const PARCELS: { x: number; y: number; w: number; h: number; tone: number; rows: number }[] = [
  { x: 0, y: 0, w: 150, h: 110, tone: 0.82, rows: 0 },
  { x: 156, y: 0, w: 144, h: 110, tone: 0.45, rows: 90 },
  { x: 306, y: 0, w: 214, h: 110, tone: 0.7, rows: 0 },
  { x: 0, y: 116, w: 210, h: 114, tone: 0.58, rows: 90 },
  { x: 216, y: 116, w: 124, h: 114, tone: 0.9, rows: 0 },
  { x: 346, y: 116, w: 174, h: 114, tone: 0.3, rows: 90 },
  { x: 0, y: 236, w: 120, h: 124, tone: 0.66, rows: 0 },
  { x: 126, y: 236, w: 194, h: 124, tone: 0.78, rows: 90 },
  { x: 326, y: 236, w: 194, h: 124, tone: 0.52, rows: 0 },
]

function toneFill(t: number) {
  // low vigor → earth/wheat, high vigor → deep green
  if (t > 0.75) return "oklch(0.52 0.13 145)"
  if (t > 0.6) return "oklch(0.6 0.13 132)"
  if (t > 0.45) return "oklch(0.7 0.12 105)"
  return "oklch(0.66 0.09 70)"
}

export function FieldIllustration() {
  const focus = PARCELS[4]
  return (
    <div className="relative mx-auto aspect-[680/535] w-full max-w-[min(540px,56svh)]">
      <svg
        viewBox="-10 -25 680 535"
        className="absolute inset-0 size-full overflow-visible [mask-image:radial-gradient(closest-side,black_78%,transparent)]"
        aria-hidden
      >
        <defs>
          <pattern id="rows-0" width="7" height="7" patternUnits="userSpaceOnUse">
            <path d="M0 3.5h7" stroke="oklch(0 0 0 / 18%)" strokeWidth="1.4" />
          </pattern>
          <pattern id="rows-90" width="7" height="7" patternUnits="userSpaceOnUse">
            <path d="M3.5 0v7" stroke="oklch(0 0 0 / 18%)" strokeWidth="1.4" />
          </pattern>
          <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.16" />
            <stop offset="60%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform="translate(250 10) rotate(32) skewX(-12) scale(0.86)">
          <rect x="-14" y="-14" width="548" height="388" rx="18" fill="oklch(0.3 0.04 150)" />
          {PARCELS.map((p, i) => (
            <g key={i}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill={toneFill(p.tone)} />
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill={`url(#rows-${p.rows})`} />
            </g>
          ))}
          <rect x="-14" y="-14" width="548" height="388" rx="18" fill="url(#sheen)" />
          {/* Selected lot: outline draws in once, then holds still */}
          <rect
            x={focus.x - 3}
            y={focus.y - 3}
            width={focus.w + 6}
            height={focus.h + 6}
            rx="7"
            fill="oklch(0.885 0.19 125 / 16%)"
            stroke="oklch(0.885 0.19 125)"
            strokeWidth="2.5"
            className="draw-in"
            style={{ ["--path-length" as string]: 490 }}
          />
          {[
            [focus.x - 10, focus.y - 10, 1, 1],
            [focus.x + focus.w + 10, focus.y - 10, -1, 1],
            [focus.x - 10, focus.y + focus.h + 10, 1, -1],
            [focus.x + focus.w + 10, focus.y + focus.h + 10, -1, -1],
          ].map(([x, y, dx, dy], i) => (
            <path
              key={i}
              d={`M${x} ${y + 14 * dy}V${y}H${x + 14 * dx}`}
              stroke="white"
              strokeOpacity="0.85"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          ))}
        </g>
      </svg>

      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...spring.move, delay: 0.9 }}
        className="absolute top-[34%] left-[60%] flex items-center gap-2 rounded-full bg-black/35 py-1.5 pr-3.5 pl-1.5 text-[12px] font-semibold text-white shadow-[0_8px_24px_oklch(0_0_0/35%)] ring-1 ring-white/15 backdrop-blur-xl"
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Crosshair className="size-3.5" />
        </span>
        Lote seleccionado
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.move, delay: 1.05 }}
        className="absolute bottom-[4%] left-[2%] w-[190px] rounded-2xl bg-black/30 p-3 text-white shadow-[0_8px_24px_oklch(0_0_0/30%)] ring-1 ring-white/12 backdrop-blur-xl"
      >
        <p className="eyebrow text-white/60">Índice NDVI</p>
        <div className="mt-2 h-1.5 rounded-full bg-[linear-gradient(90deg,oklch(0.66_0.09_70),oklch(0.7_0.12_105),oklch(0.6_0.13_132),oklch(0.52_0.13_145))]" />
        <div className="mt-1.5 flex justify-between text-[10.5px] font-medium text-white/55">
          <span>Bajo vigor</span>
          <span>Alto vigor</span>
        </div>
      </motion.div>
    </div>
  )
}

export function AuthShell({
  aside,
  children,
}: {
  aside: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-svh bg-background">
      {/* Immersive panel */}
      <aside className="sticky top-0 isolate hidden h-svh w-[52%] max-w-[860px] flex-col overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex xl:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 -z-10 size-[520px] rounded-full bg-brand/15 blur-[120px]"
        />
        <div
          aria-hidden
          className="field-lines pointer-events-none absolute inset-0 -z-10 text-brand opacity-25 [mask-image:radial-gradient(80%_60%_at_20%_100%,black,transparent)]"
        />
        <div className="flex items-center gap-3">
          <BrandMark />
          <BrandWordmark className="text-sidebar-foreground" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-7 pt-8">{aside}</div>
      </aside>

      {/* Form column */}
      <main className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between p-5 sm:p-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <BrandMark className="size-8 rounded-[10px]" />
            <BrandWordmark />
          </div>
          <ThemeToggle tone="surface" className="w-[108px]" layoutId="auth-theme" />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </main>
    </div>
  )
}
