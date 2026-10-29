/**
 * Rinde esperable por zona a partir de las Estimaciones Agrícolas del MAGyP (rinde real por
 * cultivo, campaña y departamento). Es la base de la predicción: dice cuánto rinde un cultivo en
 * el departamento del lote, proyectado a la campaña de siembra.
 *
 * Método (para una campaña objetivo T, usando solo campañas anteriores a T):
 * 1. Tendencia nacional del cultivo: regresión lineal ponderada (más peso a lo reciente).
 * 2. Nivel de cada serie: promedio ponderado de las últimas campañas, llevando cada valor a T
 *    con esa tendencia.
 * 3. Contracción jerárquica: un departamento con pocas campañas se acerca al nivel de su
 *    provincia, y la provincia al nacional.
 *
 * Los datos procesados viven en `data/regional-yields.json` (ver scripts/build-regional-yields.ts).
 */

export type YieldSeries = (number | null)[]

export interface RegionalYieldData {
  source: string
  generatedAt: string
  /** Campañas consecutivas ("2006/07", "2007/08", ...); las series se indexan igual. */
  campaigns: string[]
  provinceNames: Record<string, string>
  /** Clave: código de cultivo de `lib/yield-features` (1 = Soja, 2 = Maíz, ...). */
  crops: Record<string, CropSeries>
  /** Parámetros elegidos al generar los datos (evaluación histórica); si faltan, los por defecto. */
  params?: RegionalParams
  /** Resultado de la evaluación histórica al generar los datos (informativo). */
  backtest?: unknown
}

export interface CropSeries {
  national: YieldSeries
  /** Clave: código INDEC de provincia ("06" = Buenos Aires). */
  provinces: Record<string, YieldSeries>
  /** Clave: código INDEC de departamento ("06623" = Pergamino). */
  departments: Record<string, { name: string; province: string; yields: YieldSeries }>
}

export interface RegionalParams {
  /** Campañas que entran al nivel de cada serie. */
  window: number
  /** Vida media del peso por antigüedad (campañas). */
  halfLife: number
  /** Campañas usadas para la tendencia nacional. */
  trendWindow: number
  /** Cuántas campañas "vale" el nivel provincial al contraer un departamento. */
  departmentShrinkage: number
  provinceShrinkage: number
}

export const DEFAULT_REGIONAL_PARAMS: RegionalParams = {
  window: 5,
  halfLife: 4,
  trendWindow: 20,
  departmentShrinkage: 0.5,
  provinceShrinkage: 1,
}

export interface RegionalQuery {
  crop: number
  departmentId?: string | null
  provinceId?: string | null
  campaign: string
}

export interface RegionalEstimate {
  kgHa: number
  /** Nivel geográfico más fino con datos para el cultivo. */
  level: "departamento" | "provincia" | "nacional"
  areaName: string
  campaign: string
  /** Campañas con dato en la serie de ese nivel. */
  campaignsUsed: number
}

/** "2025/26" → 2025 */
export function campaignStartYear(campaign: string): number {
  return Number.parseInt(campaign.slice(0, 4), 10)
}

export function campaignFromStartYear(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`
}

/**
 * Campaña agrícola de una fecha de siembra. La campaña Y/Y+1 abarca de mayo de Y (siembra de
 * trigo y cebada) a abril de Y+1 (soja de segunda, maíz tardío).
 */
export function campaignForDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : date
  const year = d.getUTCFullYear()
  return campaignFromStartYear(d.getUTCMonth() >= 4 ? year : year - 1)
}

/** Índice de la campaña en las series; puede caer después del último dato (proyección). */
export function campaignIndex(data: RegionalYieldData, campaign: string): number {
  return campaignStartYear(campaign) - campaignStartYear(data.campaigns[0])
}

function weight(target: number, t: number, halfLife: number) {
  return 0.5 ** ((target - 1 - t) / halfLife)
}

/** Pendiente (kg/ha por campaña) de la serie nacional antes de `target`. */
export function nationalTrend(series: YieldSeries, target: number, params: RegionalParams): number {
  let sw = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  let points = 0
  for (let t = Math.max(0, target - params.trendWindow); t < Math.min(target, series.length); t++) {
    const y = series[t]
    if (y === null || y === undefined) continue
    const w = weight(target, t, params.trendWindow / 2)
    sw += w
    sx += w * t
    sy += w * y
    sxx += w * t * t
    sxy += w * t * y
    points++
  }
  if (points < 5) return 0
  const denominator = sw * sxx - sx * sx
  return Math.abs(denominator) < 1e-9 ? 0 : (sw * sxy - sx * sy) / denominator
}

/** Nivel de una serie proyectado a `target`, y cuántas campañas aportaron. */
function seriesLevel(
  series: YieldSeries | undefined,
  target: number,
  slope: number,
  params: RegionalParams,
): { level: number; count: number } | null {
  if (!series) return null
  let sw = 0
  let sum = 0
  let count = 0
  for (let t = Math.max(0, target - params.window); t < Math.min(target, series.length); t++) {
    const y = series[t]
    if (y === null || y === undefined || y <= 0) continue
    const w = weight(target, t, params.halfLife)
    sw += w
    sum += w * (y + slope * (target - t))
    count++
  }
  return count === 0 ? null : { level: sum / sw, count }
}

export function estimateRegionalYield(
  data: RegionalYieldData,
  query: RegionalQuery,
  params: RegionalParams = data.params ?? DEFAULT_REGIONAL_PARAMS,
): RegionalEstimate | null {
  const crop = data.crops[String(query.crop)]
  if (!crop) return null

  const target = campaignIndex(data, query.campaign)
  const slope = nationalTrend(crop.national, target, params)
  const national = seriesLevel(crop.national, target, slope, params)
  if (!national) return null

  const department = query.departmentId ? crop.departments[query.departmentId] : undefined
  const provinceId = department?.province ?? query.provinceId ?? null

  let estimate: RegionalEstimate = {
    kgHa: national.level,
    level: "nacional",
    areaName: "Argentina",
    campaign: query.campaign,
    campaignsUsed: national.count,
  }

  const province = provinceId ? seriesLevel(crop.provinces[provinceId], target, slope, params) : null
  let provinceLevel = national.level
  if (province && provinceId) {
    const k = params.provinceShrinkage
    provinceLevel = (province.count * province.level + k * national.level) / (province.count + k)
    estimate = {
      kgHa: provinceLevel,
      level: "provincia",
      areaName: data.provinceNames[provinceId] ?? provinceId,
      campaign: query.campaign,
      campaignsUsed: province.count,
    }
  }

  const departmentLevel = department ? seriesLevel(department.yields, target, slope, params) : null
  if (department && departmentLevel) {
    const k = params.departmentShrinkage
    estimate = {
      kgHa: (departmentLevel.count * departmentLevel.level + k * provinceLevel) / (departmentLevel.count + k),
      level: "departamento",
      areaName: department.name,
      campaign: query.campaign,
      campaignsUsed: departmentLevel.count,
    }
  }

  return { ...estimate, kgHa: Math.max(0, Math.round(estimate.kgHa)) }
}
