"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/dashboard-layout"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart3, Wheat, Map, Crown, Check } from "lucide-react"
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Uso y Plan
          </h1>
          <p className="text-muted-foreground">
            Revisá el uso de tus recursos y gestioná tu suscripción
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ── Main column ── */}
          <div className="space-y-6 lg:col-span-2">
            {/* Current usage */}
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-foreground">
                      Uso Actual
                    </CardTitle>
                    <CardDescription>
                      Recursos utilizados en tu plan {limits.label}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? (
                  <div className="space-y-6">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (
                  <>
                    <UsageRow
                      icon={<Map className="h-4 w-4" />}
                      label="Lotes"
                      current={usage?.plots ?? 0}
                      max={limits.maxPlots}
                      percent={plotsPct}
                    />
                    <UsageRow
                      icon={<Wheat className="h-4 w-4" />}
                      label="Granjas"
                      current={usage?.farms ?? 0}
                      max={limits.maxFarms}
                      percent={farmsPct}
                    />
                    <UsageRow
                      icon={<BarChart3 className="h-4 w-4" />}
                      label="Hectáreas"
                      current={Math.round(usage?.hectares ?? 0)}
                      max={limits.maxHectares}
                      percent={haPct}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Summary */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-foreground">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Plan actual</span>
                  {loading ? (
                    <Skeleton className="h-5 w-20" />
                  ) : (
                    <Badge variant={plan === "free" ? "secondary" : "default"}>
                      {limits.label}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Miembro desde</span>
                  {loading ? (
                    <Skeleton className="h-5 w-24" />
                  ) : (
                    <span className="font-medium text-foreground">
                      {memberSince}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Costo mensual</span>
                  {loading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <span className="font-mono font-medium text-foreground">
                      {limits.priceUsd === 0
                        ? "Gratis"
                        : `$${limits.priceUsd}/mes`}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Sidebar: plan cards ── */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">
              Planes disponibles
            </p>
            {PLAN_ORDER.map((tier) => {
              const tierLimits = PLAN_LIMITS[tier]
              const isActive = tier === plan
              return (
                <Card
                  key={tier}
                  className={
                    isActive
                      ? "border-primary border-2"
                      : "border-border/60"
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {tier === "pro" && (
                          <Crown className="h-4 w-4 text-yellow-500" />
                        )}
                        <CardTitle className="text-base text-foreground">
                          {tierLimits.label}
                        </CardTitle>
                      </div>
                      {isActive && <Badge variant="default">Plan Actual</Badge>}
                    </div>
                    {PLAN_AUDIENCE_SUBTITLE[tier] ? (
                      <p className="text-sm text-muted-foreground">
                        {PLAN_AUDIENCE_SUBTITLE[tier]}
                      </p>
                    ) : null}
                    <p className="text-2xl font-bold text-foreground">
                      {tierLimits.priceUsd === 0 ? (
                        "Gratis"
                      ) : (
                        <>
                          ${tierLimits.priceUsd}
                          <span className="text-sm font-normal text-muted-foreground">
                            /mes
                          </span>
                        </>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Separator />
                    <ul className="space-y-2 text-sm">
                      {PLAN_FEATURES[tier].map((feat) => (
                        <li key={feat} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span className="text-muted-foreground">{feat}</span>
                        </li>
                      ))}
                    </ul>
                    <Separator />
                    {isActive ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled
                      >
                        Plan Actual
                      </Button>
                    ) : (
                      <Button
                        variant={tier === "pro" ? "default" : "outline"}
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
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function UsageRow({
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
  const isHigh = percent >= 80
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span
          className={`font-mono font-medium ${isHigh ? "text-destructive" : "text-foreground"}`}
        >
          {current} / {formatLimit(max)}
        </span>
      </div>
      <Progress
        value={percent}
        className={isHigh ? "[&>[data-slot=progress-indicator]]:bg-destructive" : ""}
      />
    </div>
  )
}
