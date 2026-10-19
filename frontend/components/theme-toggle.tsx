"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { Monitor, Moon, Sun } from "lucide-react"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "dark", label: "Oscuro", icon: Moon },
] as const

/** Segmented control: the selection pill travels between options on a spring. */
export function ThemeToggle({
  className,
  layoutId = "theme-toggle-pill",
  tone = "sidebar",
}: {
  className?: string
  layoutId?: string
  tone?: "sidebar" | "surface"
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : "system"

  return (
    <div
      role="radiogroup"
      aria-label="Apariencia"
      className={cn(
        "relative grid grid-cols-3 rounded-full p-1",
        tone === "sidebar" ? "bg-sidebar-accent/70" : "bg-muted",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "relative z-0 flex h-7 items-center justify-center rounded-full transition-colors duration-200 active:scale-95",
              tone === "sidebar"
                ? active
                  ? "text-sidebar-foreground"
                  : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                : active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={spring.snappy}
                className={cn(
                  "absolute inset-0 -z-10 rounded-full",
                  tone === "sidebar"
                    ? "bg-sidebar shadow-[inset_0_1px_0_oklch(1_0_0/8%),0_1px_3px_oklch(0_0_0/30%)]"
                    : "bg-card shadow-soft",
                )}
              />
            )}
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}
