"use client"

import type { ReactNode } from "react"
import { motion } from "motion/react"
import type { LucideIcon } from "lucide-react"
import { AnimatedNumber } from "@/components/animated-number"
import { riseIn } from "@/lib/motion"
import { cn } from "@/lib/utils"

/* ───────────── Page header ───────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <motion.header
      {...riseIn(0)}
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="eyebrow flex items-center gap-2 text-brand-ink">
            <span className="size-1.5 rounded-full bg-brand shadow-[0_0_0_3px_color-mix(in_oklch,var(--brand)_25%,transparent)]" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[clamp(1.75rem,1.35rem+1.4vw,2.5rem)] font-semibold text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-start gap-2 sm:items-center">{actions}</div> : null}
    </motion.header>
  )
}

/* ───────────── Section (surface card) ───────────── */

export function Section({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
  index = 1,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  index?: number
}) {
  return (
    <motion.section {...riseIn(index)} className={cn("surface overflow-hidden", className)}>
      {title || actions ? (
        <div className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-[18px]" />
              </span>
            ) : null}
            <div className="min-w-0 space-y-1">
              {title ? (
                <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
              ) : null}
              {description ? (
                <p className="text-[13.5px] leading-snug text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-5 sm:p-6", bodyClassName)}>{children}</div>
    </motion.section>
  )
}

/* ───────────── Stat tile ───────────── */

type StatTone = "default" | "brand" | "forest"

export function StatTile({
  label,
  value,
  decimals = 0,
  signed,
  unit,
  hint,
  icon: Icon,
  tone = "default",
  loading,
  index = 0,
  children,
}: {
  label: string
  value: number | null
  decimals?: number
  signed?: boolean
  unit?: string
  hint?: ReactNode
  icon?: LucideIcon
  tone?: StatTone
  loading?: boolean
  index?: number
  children?: ReactNode
}) {
  const forest = tone === "forest"
  return (
    <motion.div
      {...riseIn(index + 1)}
      className={cn(
        "group relative isolate overflow-hidden rounded-2xl p-5",
        forest
          ? "bg-sidebar text-sidebar-foreground shadow-raised"
          : "surface",
      )}
    >
      {forest ? (
        <div
          aria-hidden
          className="field-lines pointer-events-none absolute inset-0 -z-10 text-brand opacity-60 [mask-image:radial-gradient(120%_90%_at_100%_0%,black,transparent_70%)]"
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-[13px] font-medium",
            forest ? "text-sidebar-foreground/70" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              forest
                ? "bg-brand text-brand-foreground"
                : tone === "brand"
                  ? "bg-brand/25 text-brand-ink"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        {loading ? (
          <span className="h-9 w-24 animate-pulse rounded-lg bg-current/10" />
        ) : value == null ? (
          <span className="numeric text-[32px] font-semibold leading-none tracking-[-0.035em]">—</span>
        ) : (
          <AnimatedNumber
            value={value}
            decimals={decimals}
            signed={signed}
            className="numeric text-[32px] font-semibold leading-none tracking-[-0.035em]"
          />
        )}
        {unit && !loading && value != null ? (
          <span
            className={cn(
              "text-[13px] font-medium",
              forest ? "text-sidebar-foreground/60" : "text-muted-foreground",
            )}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <div
          className={cn(
            "mt-2 text-[12.5px]",
            forest ? "text-sidebar-foreground/60" : "text-muted-foreground",
          )}
        >
          {hint}
        </div>
      ) : null}
      {children}
    </motion.div>
  )
}

/* ───────────── Status pill ───────────── */

const STATUS_STYLE: Record<string, string> = {
  Sembrado: "text-status-sown bg-status-sown/12 ring-status-sown/25",
  Crecimiento: "text-status-growing bg-status-growing/12 ring-status-growing/25",
  Cosechado: "text-status-harvested bg-status-harvested/14 ring-status-harvested/30",
  Barbecho: "text-status-fallow bg-status-fallow/12 ring-status-fallow/25",
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none ring-1 ring-inset",
        STATUS_STYLE[status] ?? "bg-muted text-muted-foreground ring-border",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

/* ───────────── Crops ───────────── */

const CROP_COLOR: Record<string, string> = {
  soja: "oklch(0.62 0.15 145)",
  maiz: "oklch(0.8 0.16 90)",
  trigo: "oklch(0.74 0.13 70)",
  girasol: "oklch(0.82 0.17 95)",
  sorgo: "oklch(0.6 0.14 40)",
  cebada: "oklch(0.78 0.1 80)",
  arroz: "oklch(0.75 0.06 120)",
  algodon: "oklch(0.8 0.02 250)",
}

export function cropKey(crop: string | null | undefined) {
  return (crop ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

/** Display label; the stored value may be lowercase ("soja"). */
export function cropLabel(crop: string | null | undefined) {
  const c = (crop ?? "").trim()
  if (!c) return "Sin cultivo"
  return c.charAt(0).toUpperCase() + c.slice(1)
}

export function cropColor(crop: string | null | undefined) {
  return CROP_COLOR[cropKey(crop)] ?? "var(--muted-foreground)"
}

export function CropTag({ crop, className }: { crop: string | null | undefined; className?: string }) {
  const empty = !crop || cropKey(crop) === "sin cultivo"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[13.5px]",
        empty ? "text-muted-foreground" : "font-medium text-foreground",
        className,
      )}
    >
      <span
        className="size-2.5 shrink-0 rounded-[4px] ring-1 ring-black/5 ring-inset"
        style={{ backgroundColor: empty ? "var(--muted)" : cropColor(crop) }}
      />
      {cropLabel(crop)}
    </span>
  )
}

/* ───────────── NDVI meter ───────────── */

export function ndviColor(v: number) {
  return v > 0.6 ? "var(--ndvi-high)" : v > 0.4 ? "var(--ndvi-mid)" : "var(--ndvi-low)"
}

export function NdviMeter({ value, className }: { value: number | null; className?: string }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>
  }
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={cn("flex items-center justify-end gap-2.5", className)}>
      <div className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-spring"
          style={{ width: `${pct}%`, backgroundColor: ndviColor(value) }}
        />
      </div>
      <span className="numeric w-9 text-right font-mono text-[13px] text-foreground">
        {value.toFixed(2)}
      </span>
    </div>
  )
}

/* ───────────── Empty state ───────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  tone?: "default" | "error"
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[280px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-12 text-center",
        tone === "error"
          ? "border-destructive/35 bg-destructive/[0.04]"
          : "border-border bg-muted/40",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "mb-4 flex size-12 items-center justify-center rounded-2xl",
            tone === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-card text-muted-foreground shadow-soft",
          )}
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

/* ───────────── Key/value list (detail sheets) ───────────── */

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl bg-muted/50 ring-1 ring-inset ring-border/70",
        className,
      )}
    >
      {children}
    </dl>
  )
}

export function DetailRow({
  label,
  children,
  mono,
}: {
  label: ReactNode
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right font-medium text-foreground", mono && "numeric font-mono")}>
        {children}
      </dd>
    </div>
  )
}

/* ───────────── Inline message ───────────── */

export function InlineMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "success"
  children: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-3.5 py-2.5 text-[13px] leading-snug ring-1 ring-inset",
        tone === "error"
          ? "bg-destructive/8 text-destructive ring-destructive/20"
          : "bg-status-growing/10 text-status-growing ring-status-growing/25",
      )}
    >
      {children}
    </motion.div>
  )
}
