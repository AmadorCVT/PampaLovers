/**
 * Genera `data/weather-model.json`: ajuste del rinde regional por el clima de la campaña.
 *
 * 1. Descarga (con caché) el centroide de cada departamento (API Georef) y su clima mensual
 *    2000 → último año completo (NASA POWER, sin clave).
 * 2. Por cultivo, ajusta una regresión del log(rinde real / rinde regional) sobre las anomalías de
 *    lluvia y temperatura del período crítico. Itera "des-climatizando" la historia para que una
 *    sequía pasada no deprima la base de los años siguientes.
 * 3. Elige qué fracción del efecto aplicar sin mirar el período de evaluación: ajusta con campañas
 *    hasta 2015/16, elige con 2016/17–2021/22 y mide en 2022/23 en adelante.
 *
 * Correr después de `npm run data:regional` (depende de esos datos). Uso, desde frontend/:
 *   npm run data:weather
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import regionalYieldsJson from "../data/regional-yields.json"
import {
  campaignFromStartYear,
  campaignStartYear,
  estimateRegionalYield,
  type RegionalYieldData,
} from "../lib/ml/regional-yield"
import {
  CROP_WEATHER_WINDOWS,
  fitRidge,
  logWeatherEffect,
  weatherFeatures,
  type DepartmentNormals,
  type MonthlyWeather,
  type WeatherModelData,
} from "../lib/ml/weather-effect"

const REGIONAL = regionalYieldsJson as unknown as RegionalYieldData
const ROOT = path.join(__dirname, "..")
const OUTPUT = path.join(ROOT, "data", "weather-model.json")
const CACHE_DIR = path.join(ROOT, ".cache", "weather")
const FIRST_YEAR = campaignStartYear(REGIONAL.campaigns[0])
const LAST_WEATHER_YEAR = new Date().getUTCFullYear() - 1
const RIDGE_LAMBDA = 5
const DEWEATHER_ITERATIONS = 2
const SCALES = [0, 0.25, 0.5, 0.75, 1]

/* ───────────── Descarga ───────────── */

interface CachedDepartment {
  lat: number
  lon: number
  months: Record<string, MonthlyWeather>
}

async function fetchJson(url: string, attempts = 4): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      if (attempt + 1 >= attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, 3000 * 2 ** attempt))
    }
  }
}

async function downloadWeather(departmentIds: string[]): Promise<Map<string, CachedDepartment>> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const centroidsFile = path.join(CACHE_DIR, "departamentos.json")
  if (!existsSync(centroidsFile)) {
    const body = await fetchJson(
      "https://apis.datos.gob.ar/georef/api/departamentos?max=1000&campos=id,centroide",
    )
    writeFileSync(centroidsFile, JSON.stringify(body))
  }
  const centroids = new Map(
    (JSON.parse(readFileSync(centroidsFile, "utf8")).departamentos as { id: string; centroide: { lat: number; lon: number } }[]).map(
      (d) => [d.id, d.centroide],
    ),
  )

  const weatherFile = path.join(CACHE_DIR, `nasa-power-${FIRST_YEAR}-${LAST_WEATHER_YEAR}.json`)
  const cache: Record<string, CachedDepartment> = existsSync(weatherFile)
    ? JSON.parse(readFileSync(weatherFile, "utf8"))
    : {}
  const pending = departmentIds.filter((id) => !cache[id] && centroids.has(id))
  if (pending.length) console.log(`Descargando clima de ${pending.length} departamentos (NASA POWER)...`)

  let done = 0
  const worker = async () => {
    while (pending.length) {
      const id = pending.shift()!
      const { lat, lon } = centroids.get(id)!
      const url =
        "https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=PRECTOTCORR_SUM,T2M&community=AG" +
        `&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${FIRST_YEAR}&end=${LAST_WEATHER_YEAR}&format=JSON`
      try {
        const body = (await fetchJson(url)) as {
          properties: { parameter: { PRECTOTCORR_SUM: Record<string, number>; T2M: Record<string, number> } }
        }
        const { PRECTOTCORR_SUM: rain, T2M: temp } = body.properties.parameter
        const months: Record<string, MonthlyWeather> = {}
        for (const key of Object.keys(rain)) {
          // NASA agrega una clave "AAAA13" con el total anual y usa -999 para faltantes.
          if (key.endsWith("13") || rain[key] < 0 || temp[key] < -900) continue
          months[key] = { rain: rain[key], temp: temp[key] }
        }
        cache[id] = { lat, lon, months }
      } catch (error) {
        console.warn(`  sin clima para ${id}: ${error instanceof Error ? error.message : error}`)
      }
      if (++done % 25 === 0) {
        writeFileSync(weatherFile, JSON.stringify(cache))
        console.log(`  ${done}...`)
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  writeFileSync(weatherFile, JSON.stringify(cache))
  return new Map(Object.entries(cache))
}

/* ───────────── Ajuste ───────────── */

interface Row {
  crop: string
  department: string
  year: number
  x: number[]
  actual: number
}

function normalsFor(weather: CachedDepartment): DepartmentNormals {
  const rain = new Array(12).fill(0)
  const temp = new Array(12).fill(0)
  const count = new Array(12).fill(0)
  for (const [key, month] of Object.entries(weather.months)) {
    const m = Number(key.slice(4, 6)) - 1
    rain[m] += month.rain
    temp[m] += month.temp
    count[m]++
  }
  return {
    lat: weather.lat,
    lon: weather.lon,
    rainNormal: rain.map((v, i) => Number((v / count[i]).toFixed(2))),
    tempNormal: temp.map((v, i) => Number((v / count[i]).toFixed(2))),
  }
}

function buildRows(weather: Map<string, CachedDepartment>, normals: Map<string, DepartmentNormals>): Row[] {
  const rows: Row[] = []
  for (const [crop, series] of Object.entries(REGIONAL.crops)) {
    if (!CROP_WEATHER_WINDOWS[crop]) continue
    for (const [department, info] of Object.entries(series.departments)) {
      const w = weather.get(department)
      const n = normals.get(department)
      if (!w || !n) continue
      info.yields.forEach((actual, t) => {
        if (actual === null || t < 3) return
        const year = FIRST_YEAR + t
        let complete = true
        const features = weatherFeatures(crop, year, n, (y, m) => {
          const month = w.months[`${y}${String(m).padStart(2, "0")}`]
          if (!month) complete = false
          return month ?? null
        })
        // Para entrenar solo sirven campañas con todo el clima observado.
        if (features && complete) rows.push({ crop, department, year, x: features.x, actual })
      })
    }
  }
  return rows
}

interface Pipeline {
  coefficients: Record<string, number[]>
  /** Base regional de cada fila, sobre la historia des-climatizada. */
  base: Map<Row, number>
  deweathered: RegionalYieldData
}

/** Ajuste iterativo usando solo campañas anteriores a `untilYear` para estimar coeficientes. */
function fitPipeline(rows: Row[], untilYear: number): Pipeline {
  let data = REGIONAL
  let base = new Map<Row, number>()
  let coefficients: Record<string, number[]> = {}

  for (let iteration = 0; iteration <= DEWEATHER_ITERATIONS; iteration++) {
    base = new Map()
    for (const row of rows) {
      const estimate = estimateRegionalYield(data, {
        crop: Number(row.crop),
        departmentId: row.department,
        campaign: campaignFromStartYear(row.year),
      })
      if (estimate && estimate.kgHa > 0) base.set(row, estimate.kgHa)
    }

    coefficients = {}
    for (const crop of Object.keys(CROP_WEATHER_WINDOWS)) {
      const train = rows.filter((r) => r.crop === crop && r.year < untilYear && base.has(r))
      if (train.length < 30) continue
      coefficients[crop] = fitRidge(
        train.map((r) => r.x),
        train.map((r) => Math.log(r.actual / base.get(r)!)),
        RIDGE_LAMBDA,
      )
    }
    if (iteration === DEWEATHER_ITERATIONS) break

    // Historia "sin clima": cada valor observado dividido por el efecto del clima de su campaña.
    const next = structuredClone(REGIONAL)
    for (const row of rows) {
      const c = coefficients[row.crop]
      if (!c) continue
      next.crops[row.crop].departments[row.department].yields[row.year - FIRST_YEAR] = Math.round(
        row.actual / Math.exp(logWeatherEffect(c, row.x)),
      )
    }
    data = next
  }
  return { coefficients, base, deweathered: data }
}

function wape(rows: Row[], predict: (row: Row) => number | null): number {
  let error = 0
  let actual = 0
  for (const row of rows) {
    const p = predict(row)
    if (p === null) continue
    error += Math.abs(p - row.actual)
    actual += row.actual
  }
  return error / actual
}

const regionalOnly = (rows: Row[]) => {
  const plain = new Map<Row, number>()
  for (const row of rows) {
    const estimate = estimateRegionalYield(REGIONAL, {
      crop: Number(row.crop),
      departmentId: row.department,
      campaign: campaignFromStartYear(row.year),
    })
    if (estimate) plain.set(row, estimate.kgHa)
  }
  return (row: Row) => plain.get(row) ?? null
}

function withWeather(pipeline: Pipeline, scale: number) {
  return (row: Row) => {
    const base = pipeline.base.get(row)
    const c = pipeline.coefficients[row.crop]
    if (!base) return null
    return c ? base * Math.exp(scale * logWeatherEffect(c, row.x)) : base
  }
}

async function main() {
  const departmentIds = [
    ...new Set(Object.values(REGIONAL.crops).flatMap((crop) => Object.keys(crop.departments))),
  ]
  const weather = await downloadWeather(departmentIds)
  const normals = new Map([...weather].map(([id, w]) => [id, normalsFor(w)]))
  const rows = buildRows(weather, normals)
  const plain = regionalOnly(rows)
  console.log(`${rows.length} campañas × departamento × cultivo con clima completo (${weather.size} departamentos)`)

  // Elegir la escala: ajustar hasta 2015/16, validar 2016/17–2021/22.
  const early = fitPipeline(rows, 2016)
  const validation = rows.filter((r) => r.year >= 2016 && r.year < 2022)
  const selection = SCALES.map((scale) => ({ scale, wape: wape(validation, withWeather(early, scale)) }))
  const { scale } = selection.reduce((best, s) => (s.wape < best.wape ? s : best))

  // Medir con lo elegido en campañas no vistas: ajustar hasta 2021/22, evaluar 2022/23 en adelante.
  const late = fitPipeline(rows, 2022)
  const test = rows.filter((r) => r.year >= 2022)
  const byYear: Record<string, { regional: number; weather: number; cases: number }> = {}
  for (const year of [...new Set(test.map((r) => r.year))].sort()) {
    const subset = test.filter((r) => r.year === year)
    byYear[campaignFromStartYear(year)] = {
      regional: wape(subset, plain),
      weather: wape(subset, withWeather(late, scale)),
      cases: subset.length,
    }
  }
  const testResult = { regional: wape(test, plain), weather: wape(test, withWeather(late, scale)) }

  // Modelo final: todas las campañas.
  const final = fitPipeline(rows, Infinity)
  const deweatheredYields: WeatherModelData["deweatheredYields"] = {}
  for (const [crop, series] of Object.entries(final.deweathered.crops)) {
    deweatheredYields[crop] = Object.fromEntries(
      Object.entries(series.departments).map(([id, d]) => [id, d.yields]),
    )
  }

  const model: WeatherModelData = {
    source: "NASA POWER (power.larc.nasa.gov), clima mensual en el centroide de cada departamento (API Georef).",
    generatedAt: new Date().toISOString(),
    regionalGeneratedAt: REGIONAL.generatedAt,
    scale,
    coefficients: Object.fromEntries(
      Object.entries(final.coefficients).map(([crop, c]) => [crop, c.map((v) => Number(v.toFixed(5)))]),
    ),
    departments: Object.fromEntries(normals),
    deweatheredYields,
    backtest: {
      selection: selection.map((s) => ({ scale: s.scale, wape: Number(s.wape.toFixed(4)) })),
      evaluatedOn: "2022/23 en adelante (ajuste con campañas hasta 2021/22)",
      total: testResult,
      byCampaign: byYear,
    },
  }
  const json = JSON.stringify(model)
  writeFileSync(OUTPUT, json)

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(6)
  console.log("\nEscala del efecto, validación 2016/17–2021/22:")
  for (const s of selection) console.log(`  ×${s.scale}: ${pct(s.wape)}${s.scale === scale ? "  ← elegida" : ""}`)
  console.log("\nCampañas no vistas: solo regional → con clima")
  for (const [campaign, r] of Object.entries(byYear))
    console.log(`  ${campaign}: ${pct(r.regional)} → ${pct(r.weather)}  (${r.cases} casos)`)
  console.log(`  TOTAL:   ${pct(testResult.regional)} → ${pct(testResult.weather)}`)
  console.log(`\nGuardado en ${path.relative(process.cwd(), OUTPUT)} (${(json.length / 1024).toFixed(0)} KB)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
