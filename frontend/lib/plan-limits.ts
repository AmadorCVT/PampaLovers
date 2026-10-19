export type UserPlan = "free" | "premium" | "pro"

/** MVP: sin pelear con la BD; si no hay plan, se asume Premium (límites amplios). */
export const DEFAULT_USER_PLAN: UserPlan = "premium"

export interface PlanLimits {
  label: string
  maxPlots: number
  maxFarms: number
  maxHectares: number
  priceUsd: number
}

export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  free: {
    label: "Free",
    maxPlots: 5,
    maxFarms: 1,
    maxHectares: 50,
    priceUsd: 0,
  },
  premium: {
    label: "Premium",
    maxPlots: 30,
    maxFarms: 5,
    maxHectares: 10_000,
    priceUsd: 20,
  },
  pro: {
    label: "Pro",
    maxPlots: Infinity,
    maxFarms: 100,
    maxHectares: 500_000,
    priceUsd: 200,
  },
}

export const PLAN_ORDER: UserPlan[] = ["free", "premium", "pro"]

export const PLAN_AUDIENCE_SUBTITLE: Partial<Record<UserPlan, string>> = {
  premium: "Orientado a terratenientes",
  pro: "Pensado para aseguradoras",
}

export const PLAN_FEATURES: Record<UserPlan, string[]> = {
  free: [
    "Hasta 5 lotes",
    "1 granja",
    "50 hectáreas totales",
    "Vista satelital básica",
  ],
  premium: [
    "Hasta 30 lotes",
    "Hasta 5 granjas",
    "Hasta 3.000 hectáreas totales",
    "Vista satelital avanzada",
    "Predicciones ML",
  ],
  pro: [
    "Lotes ilimitados",
    "Hasta 30 granjas",
    "Hasta 20.000 hectáreas totales",
    "Vista satelital avanzada",
    "Predicciones ML prioritarias",
    "Soporte dedicado",
  ],
}

export function getPlanLimits(plan: UserPlan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS[DEFAULT_USER_PLAN]
}

export function formatLimit(value: number): string {
  return Number.isFinite(value) ? String(value) : "Ilimitado"
}
