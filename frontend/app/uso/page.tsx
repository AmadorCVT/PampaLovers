"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { motion, useReducedMotion } from "motion/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart3, Wheat, Map, Crown, Check, CalendarDays, Wallet, Sparkles } from "lucide-react"
import {
  getUserProfile,
  getUserUsage,
  type UserProfile,
  type UserUsage,
} from "@/lib/supabase-api"
import {
  type UserPlan,
  DEFAULT_USER_PLAN,
  PLAN_LIMITS,
  formatLimit,
  getPlanLimits,
  PLAN_AUDIENCE_SUBTITLE,
  PLAN_FEATURES,
  PLAN_ORDER,
} from "@/lib/plan-limits"
import { AnimatedNumber } from "@/components/animated-number"
import { PageHeader } from "@/components/agro-ui"
import { riseIn, spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

function usagePercent(current: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0
  return Math.min(100, Math.round((current / max) * 100))
}

export default function UsoPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [usage, setUsage] = useState<UserUsage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [p, u] = await Promise.all([getUserProfile(), getUserUsage()])
        setProfile(p)
        setUsage(u)
      } catch (err) {
        console.error("Error loading usage:", err)
      }
      setLoading(false)
    }
    load()
  }, [])

  const plan = profile?.plan ?? DEFAULT_USER_PLAN
  const limits = getPlanLimits(plan)

  const plotsPct = usage ? usagePercent(usage.plots, limits.maxPlots) : 0
  const farmsPct = usage ? usagePercent(usage.farms, limits.maxFarms) : 0
  const haPct = usage ? usagePercent(usage.hectares, limits.maxHectares) : 0

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("es-AR", {
        month: "short",
        year: "numeric",
      })
    : "—"

  return (
    <DashboardLayout>
      <div className="space-y-10">
        <PageHeader
          eyebrow="Cuenta"
          title="Uso y Plan"
          description="Revisá el uso de tus recursos y gestioná tu suscripción"
        />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Current usage */}
          <motion.section {...riseIn(1)} className="surface p-5 sm:p-6 lg:col-span-2">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <BarChart3 className="size-[18px]" />
              </span>
              <div>
                <h2 className="text-[17px] font-semibold text-foreground">Uso Actual</h2>
                <p className="text-[13.5px] text-muted-foreground">
                  Recursos utilizados en tu plan {limits.label}
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[188px] w-full rounded-2xl" />
                ))
              ) : (
                <>
                  <UsageRing
                    icon={<Map className="size-4" />}
                    label="Lotes"
                    current={usage?.plots ?? 0}
                    max={limits.maxPlots}
                    percent={plotsPct}
                  />
                  <UsageRing
                    icon={<Wheat className="size-4" />}
                    label="Granjas"
                    current={usage?.farms ?? 0}
                    max={limits.maxFarms}
                    percent={farmsPct}
                  />
                  <UsageRing
                    icon={<BarChart3 className="size-4" />}
                    label="Hectáreas"
                    current={Math.round(usage?.hectares ?? 0)}
                    max={limits.maxHectares}
                    percent={haPct}
                  />
                </>
              )}
            </div>
          </motion.section>

          {/* Summary */}
          <motion.section
            {...riseIn(2)}
            className="relative isolate overflow-hidden rounded-2xl bg-sidebar p-6 text-sidebar-foreground shadow-raised"
          >
            <div
              aria-hidden
              className="field-lines pointer-events-none absolute inset-0 -z-10 text-brand opacity-50 [mask-image:radial-gradient(120%_100%_at_100%_0%,black,transparent_65%)]"
            />
            <h2 className="text-[17px] font-semibold">Resumen</h2>
            <div className="mt-5 space-y-1">
              <p className="text-[12.5px] text-sidebar-foreground/55">Plan actual</p>
              {loading ? (
                <Skeleton className="h-9 w-32 bg-white/10" />
              ) : (
                <p className="flex items-center gap-2 text-[30px] leading-none font-semibold tracking-[-0.035em]">
                  {plan === "pro" ? <Crown className="size-6 text-brand" /> : null}
                  {limits.label}
                </p>
              )}
            </div>
            <dl className="mt-6 divide-y divide-white/[0.08] rounded-xl bg-white/[0.05] ring-1 ring-white/[0.06] ring-inset">
              <div className="flex items-center justify-between gap-3 px-3.5 py-3 text-[13.5px]">
                <dt className="flex items-center gap-2 text-sidebar-foreground/60">
                  <CalendarDays className="size-4" />
                  Miembro desde
                </dt>
                <dd className="font-semibold">
                  {loading ? <Skeleton className="h-5 w-20 bg-white/10" /> : memberSince}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3.5 py-3 text-[13.5px]">
                <dt className="flex items-center gap-2 text-sidebar-foreground/60">
                  <Wallet className="size-4" />
                  Costo mensual
                </dt>
                <dd className="numeric font-mono font-semibold">
                  {loading ? (
                    <Skeleton className="h-5 w-16 bg-white/10" />
                  ) : limits.priceUsd === 0 ? (
                    "Gratis"
                  ) : (
                    `$${limits.priceUsd}/mes`
                  )}
                </dd>
              </div>
            </dl>
          </motion.section>
        </div>

        {/* Plans */}
        <section className="space-y-4">
          <motion.div {...riseIn(3)} className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-muted-foreground">Planes disponibles</p>
              <h2 className="mt-1 text-[24px] font-semibold text-foreground">
                Elegí cuánto campo querés{" "}
                <span className="font-display font-normal italic">medir.</span>
              </h2>
            </div>
          </motion.div>
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_ORDER.map((tier, i) => {
              const tierLimits = PLAN_LIMITS[tier]
              const isActive = tier === plan
              const featured = tier === "pro"
              return (
                <motion.div
                  key={tier}
                  {...riseIn(4 + i)}
                  className={cn(
                    "relative isolate flex flex-col overflow-hidden rounded-3xl p-6",
                    featured
                      ? "bg-sidebar text-sidebar-foreground shadow-raised"
                      : "surface",
                    isActive &&
                      "shadow-[0_0_0_2px_var(--brand),var(--shadow-raised)]",
                  )}
                >
                  {featured ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -top-24 -right-24 -z-10 size-64 rounded-full bg-brand/25 blur-3xl"
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {tier === "pro" && <Crown className="size-[18px] text-brand" />}
                      {tier === "premium" && <Sparkles className="size-[18px] text-brand-ink" />}
                      <h3 className="text-[18px] font-semibold">{tierLimits.label}</h3>
                    </div>
                    {isActive && (
                      <span className="rounded-full bg-brand px-2.5 py-1 text-[11.5px] font-semibold text-brand-foreground">
                        Plan Actual
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-1 min-h-5 text-[13px]",
                      featured ? "text-sidebar-foreground/60" : "text-muted-foreground",
                    )}
                  >
                    {PLAN_AUDIENCE_SUBTITLE[tier] ?? "Para empezar a medir"}
                  </p>
                  <p className="mt-5 flex items-baseline gap-1">
                    {tierLimits.priceUsd === 0 ? (
                      <span className="text-[40px] leading-none font-semibold tracking-[-0.045em]">Gratis</span>
                    ) : (
                      <>
                        <span className="numeric text-[40px] leading-none font-semibold tracking-[-0.045em]">
                          ${tierLimits.priceUsd}
                        </span>
                        <span
                          className={cn(
                            "text-[14px]",
                            featured ? "text-sidebar-foreground/55" : "text-muted-foreground",
                          )}
                        >
                          /mes
                        </span>
                      </>
                    )}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-[13.5px]">
                    {PLAN_FEATURES[tier].map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full",
                            featured ? "bg-brand text-brand-foreground" : "bg-accent text-accent-foreground",
                          )}
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        <span className={featured ? "text-sidebar-foreground/80" : "text-foreground/80"}>
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7">
                    {isActive ? (
                      <Button
                        variant="outline"
                        className={cn("w-full", featured && "bg-white/10 text-sidebar-foreground shadow-none")}
                        disabled
                      >
                        Plan Actual
                      </Button>
                    ) : (
                      <Button
                        variant={featured ? "brand" : "outline"}
                        className="w-full"
                        onClick={() =>
                          toast.info(
                            "La mejora de plan estará disponible próximamente.",
                          )
                        }
                      >
                        {PLAN_ORDER.indexOf(tier) > PLAN_ORDER.indexOf(plan)
                          ? "Mejorar Plan"
                          : "Cambiar Plan"}
                      </Button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

function UsageRing({
  icon,
  label,
  current,
  max,
  percent,
}: {
  icon: React.ReactNode
  label: string
  current: number
  max: number
  percent: number
}) {
  const reduce = useReducedMotion()
  const isHigh = percent >= 80
  const r = 42
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5 rounded-2xl bg-muted/50 p-4 ring-1 ring-border/60 ring-inset sm:flex-col sm:gap-0 sm:p-5">
      <div className="relative size-[84px] shrink-0 sm:size-[112px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={isHigh ? "var(--destructive)" : "var(--chart-1)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - (c * percent) / 100 }}
            transition={reduce ? { duration: 0 } : { ...spring.move, duration: 1 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "numeric text-[22px] leading-none font-semibold tracking-[-0.03em]",
              isHigh ? "text-destructive" : "text-foreground",
            )}
          >
            <AnimatedNumber value={percent} />%
          </span>
        </div>
      </div>
      <div className="sm:text-center">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground sm:mt-4 sm:justify-center">
          {icon}
          {label}
        </p>
        <p
          className={cn(
            "numeric mt-1 font-mono text-[14px] font-semibold",
            isHigh ? "text-destructive" : "text-foreground",
          )}
        >
          {current} / {formatLimit(max)}
        </p>
      </div>
    </div>
  )
}
