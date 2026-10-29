import { CROP_WEATHER_WINDOWS, type MonthlyWeather } from "@/lib/ml/weather-effect"

/**
 * Clima observado de la campaña en curso (NASA POWER, diario, sin clave), agregado por mes.
 * Solo cuenta un mes cuando todos sus días tienen dato: NASA publica con ~1 semana de demora.
 */

const POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
const TIMEOUT_MS = 8000
const CACHE_MS = 6 * 60 * 60 * 1000

const cache = new Map<string, { months: Map<string, MonthlyWeather>; loadedAt: number }>()

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`

/** "AAAAMM" → clima del mes, para los meses ya completos de la temporada del cultivo. */
export async function fetchSeasonWeather(
  crop: string,
  campaignStartYear: number,
  latitude: number,
  longitude: number,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<Map<string, MonthlyWeather>> {
  const windows = CROP_WEATHER_WINDOWS[crop]
  const now = options.now ?? new Date()
  if (!windows) return new Map()

  const [firstMonth, firstOffset] = windows.season[0]
  const [lastMonth, lastOffset] = windows.season[windows.season.length - 1]
  const from = new Date(Date.UTC(campaignStartYear + firstOffset, firstMonth - 1, 1))
  const seasonEnd = new Date(Date.UTC(campaignStartYear + lastOffset, lastMonth, 0))
  const yesterday = new Date(now.getTime() - 86_400_000)
  const to = seasonEnd < yesterday ? seasonEnd : yesterday
  if (to < from) return new Map() // la temporada todavía no empezó

  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${ymd(from)},${ymd(to)}`
  const hit = cache.get(key)
  if (hit && now.getTime() - hit.loadedAt < CACHE_MS) return hit.months

  const url =
    `${POWER_DAILY_URL}?parameters=PRECTOTCORR,T2M&community=AG` +
    `&longitude=${longitude.toFixed(4)}&latitude=${latitude.toFixed(4)}` +
    `&start=${ymd(from)}&end=${ymd(to)}&format=JSON`
  const response = await (options.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`NASA POWER respondió ${response.status}`)
  const body = (await response.json()) as {
    properties?: { parameter?: { PRECTOTCORR?: Record<string, number>; T2M?: Record<string, number> } }
  }
  const rain = body.properties?.parameter?.PRECTOTCORR ?? {}
  const temp = body.properties?.parameter?.T2M ?? {}

  const byMonth = new Map<string, { rain: number; temp: number; days: number; missing: boolean }>()
  for (const day of Object.keys(rain)) {
    const month = day.slice(0, 6)
    const entry = byMonth.get(month) ?? { rain: 0, temp: 0, days: 0, missing: false }
    if (rain[day] < 0 || temp[day] === undefined || temp[day] < -900) entry.missing = true
    else {
      entry.rain += rain[day]
      entry.temp += temp[day]
    }
    entry.days++
    byMonth.set(month, entry)
  }

  const months = new Map<string, MonthlyWeather>()
  for (const [month, entry] of byMonth) {
    const year = Number(month.slice(0, 4))
    const monthIndex = Number(month.slice(4, 6))
    const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
    if (entry.missing || entry.days < daysInMonth) continue
    months.set(month, { rain: entry.rain, temp: entry.temp / entry.days })
  }

  cache.set(key, { months, loadedAt: now.getTime() })
  return months
}
