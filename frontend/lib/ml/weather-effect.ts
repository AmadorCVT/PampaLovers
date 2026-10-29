/**
 * Ajuste por clima de la campaña: cuánto se aparta el rinde de lo esperable para la zona según la
 * lluvia y la temperatura del período crítico del cultivo, comparadas con lo normal del departamento.
 *
 * El modelo es una regresión por cultivo sobre el logaritmo de (rinde real / rinde regional), con
 * datos mensuales de NASA POWER en el centroide de cada departamento. Se entrena con
 * scripts/build-weather-model.ts y se guarda en `data/weather-model.json`.
 *
 * Mientras la campaña avanza, los meses que todavía no pasaron se completan con lo normal, así que el
 * ajuste arranca en ~0 al sembrar y se define a medida que llega el clima real.
 */

/** [mes 1–12, años después del inicio de la campaña]: campaña 2025/26 → [1, 1] = enero de 2026. */
export type MonthRef = [number, number]

function span(from: MonthRef, to: MonthRef): MonthRef[] {
  const months: MonthRef[] = []
  let [month, offset] = from
  for (;;) {
    months.push([month, offset])
    if (month === to[0] && offset === to[1]) return months
    month++
    if (month > 12) {
      month = 1
      offset++
    }
  }
}

/**
 * Temporada y período crítico (floración / llenado) típicos en Argentina, por código de cultivo
 * de `lib/yield-features`. Es donde la falta de agua o el calor más pegan en el rinde.
 */
export const CROP_WEATHER_WINDOWS: Record<string, { season: MonthRef[]; critical: MonthRef[] }> = {
  "1": { season: span([11, 0], [3, 1]), critical: span([1, 1], [2, 1]) }, // Soja
  "2": { season: span([10, 0], [2, 1]), critical: span([12, 0], [1, 1]) }, // Maíz
  "3": { season: span([6, 0], [11, 0]), critical: span([9, 0], [10, 0]) }, // Trigo
  "4": { season: span([9, 0], [1, 1]), critical: span([12, 0], [1, 1]) }, // Girasol
  "5": { season: span([11, 0], [3, 1]), critical: span([1, 1], [2, 1]) }, // Sorgo
  "6": { season: span([6, 0], [11, 0]), critical: span([9, 0], [10, 0]) }, // Cebada
  "7": { season: span([10, 0], [3, 1]), critical: span([1, 1], [2, 1]) }, // Arroz
  "8": { season: span([11, 0], [4, 1]), critical: span([1, 1], [2, 1]) }, // Algodón
}

export interface MonthlyWeather {
  /** Lluvia del mes (mm). */
  rain: number
  /** Temperatura media del mes (°C). */
  temp: number
}

export interface DepartmentNormals {
  lat: number
  lon: number
  /** Promedio 2000–último año, índice 0 = enero. */
  rainNormal: number[]
  tempNormal: number[]
}

export interface WeatherModelData {
  source: string
  generatedAt: string
  /** `generatedAt` de `regional-yields.json` con el que se entrenó: si no coincide, no se usa. */
  regionalGeneratedAt: string
  /** Fracción del efecto que se aplica (elegida en validación: el efecto completo sobreajusta). */
  scale: number
  /** Por código de cultivo: [intercepto, lluvia crítica, lluvia crítica², lluvia temporada, temp. crítica]. */
  coefficients: Record<string, number[]>
  departments: Record<string, DepartmentNormals>
  /**
   * Rinde de cada departamento "sin el clima": el real dividido por el efecto del clima de esa
   * campaña. La base regional se calcula sobre esto, para que una sequía pasada no baje el esperable.
   */
  deweatheredYields: Record<string, Record<string, (number | null)[]>>
  backtest?: unknown
}

/** El efecto se acota: ni el peor clima lleva el rinde a menos del 30 %, ni el mejor a más del 165 %. */
const MIN_LOG_EFFECT = -1.2
const MAX_LOG_EFFECT = 0.5

/**
 * Variables de clima de una campaña: anomalías respecto de lo normal del departamento.
 * `observed(year, month)` devuelve el mes observado o `null` si todavía no hay dato (se usa lo normal).
 */
export function weatherFeatures(
  crop: string,
  campaignStartYear: number,
  normals: Pick<DepartmentNormals, "rainNormal" | "tempNormal">,
  observed: (year: number, month: number) => MonthlyWeather | null,
): { x: number[]; observedMonths: number } | null {
  const windows = CROP_WEATHER_WINDOWS[crop]
  if (!windows) return null

  let observedMonths = 0
  const sum = (months: MonthRef[]) => {
    let rain = 0
    let temp = 0
    let rainNormal = 0
    let tempNormal = 0
    for (const [month, offset] of months) {
      const actual = observed(campaignStartYear + offset, month)
      rain += actual ? actual.rain : normals.rainNormal[month - 1]
      temp += actual ? actual.temp : normals.tempNormal[month - 1]
      rainNormal += normals.rainNormal[month - 1]
      tempNormal += normals.tempNormal[month - 1]
    }
    return { rain, temp: temp / months.length, rainNormal, tempNormal: tempNormal / months.length }
  }

  for (const [month, offset] of windows.season) if (observed(campaignStartYear + offset, month)) observedMonths++

  const critical = sum(windows.critical)
  const season = sum(windows.season)
  const criticalRain = Math.log((critical.rain + 10) / (critical.rainNormal + 10))
  const seasonRain = Math.log((season.rain + 10) / (season.rainNormal + 10))
  return {
    x: [criticalRain, criticalRain * criticalRain, seasonRain, critical.temp - critical.tempNormal],
    observedMonths,
  }
}

/** Logaritmo del efecto del clima (sin escalar), acotado. */
export function logWeatherEffect(coefficients: number[], x: number[]): number {
  const value = coefficients[0] + x.reduce((sum, v, i) => sum + v * coefficients[i + 1], 0)
  return Math.max(MIN_LOG_EFFECT, Math.min(MAX_LOG_EFFECT, value))
}

/** Regresión ridge (sin penalizar el intercepto). Devuelve [intercepto, ...coeficientes]. */
export function fitRidge(xs: number[][], ys: number[], lambda: number): number[] {
  const n = xs[0].length + 1
  const a = Array.from({ length: n }, () => new Array(n).fill(0))
  const b = new Array(n).fill(0)
  xs.forEach((row, i) => {
    const v = [1, ...row]
    for (let p = 0; p < n; p++) {
      b[p] += v[p] * ys[i]
      for (let q = 0; q < n; q++) a[p][q] += v[p] * v[q]
    }
  })
  for (let p = 1; p < n; p++) a[p][p] += lambda

  // Gauss-Jordan con pivoteo parcial
  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r
    ;[a[i], a[pivot]] = [a[pivot], a[i]]
    ;[b[i], b[pivot]] = [b[pivot], b[i]]
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const factor = a[r][i] / a[i][i]
      for (let c = i; c < n; c++) a[r][c] -= factor * a[i][c]
      b[r] -= factor * b[i]
    }
  }
  return b.map((value, i) => value / a[i][i])
}
