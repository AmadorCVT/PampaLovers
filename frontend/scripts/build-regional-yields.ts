/**
 * Genera `data/regional-yields.json` a partir del CSV de Estimaciones Agrícolas del MAGyP
 * (datosestimaciones.magyp.gob.ar → descarga de todos los cultivos a nivel departamento).
 *
 * Además evalúa el método con campañas pasadas: ajusta parámetros en 2016/17–2021/22 y mide en
 * 2022/23 en adelante, que el ajuste no vio.
 *
 * Uso (desde frontend/): npm run data:regional -- /ruta/a/Estimaciones.csv
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import {
  DEFAULT_REGIONAL_PARAMS,
  campaignFromStartYear,
  campaignStartYear,
  estimateRegionalYield,
  type CropSeries,
  type RegionalParams,
  type RegionalYieldData,
} from "../lib/ml/regional-yield"
import { encodeCrop } from "../lib/yield-features"

const FIRST_CAMPAIGN = "2000/01"
const TUNE_FROM = "2016/17"
const TUNE_TO = "2021/22"
const OUTPUT = path.join(__dirname, "..", "data", "regional-yields.json")

/** Cultivo del CSV → cultivo de la app. La cebada viene separada hasta 2015/16 y como total después. */
const CROP_ALIASES: Record<string, string> = {
  "Soja total": "Soja",
  Maíz: "Maíz",
  "Trigo total": "Trigo",
  Girasol: "Girasol",
  Sorgo: "Sorgo",
  "Cebada total": "Cebada",
  "Cebada cervecera": "Cebada",
  "Cebada forrajera": "Cebada",
  Arroz: "Arroz",
  Algodón: "Algodón",
}

const SMALL_WORDS = new Set(["de", "del", "la", "las", "los", "y", "el"])

function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ")
}

interface Cell {
  areaHa: number
  productionTn: number
}

function parseCsv(file: string) {
  // El MAGyP exporta en Latin-1, separado por ";" y con una línea en blanco al principio.
  const lines = readFileSync(file, "latin1").split(/\r?\n/).filter((line) => line.trim())
  const header = lines[0].split(";").map((h) => h.replace(/"/g, "").trim())
  const col = (name: string) => {
    const i = header.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()))
    if (i < 0) throw new Error(`Falta la columna "${name}" en el CSV. Columnas: ${header.join(", ")}`)
    return i
  }
  const idx = {
    provinceId: col("ID Provincia"),
    province: col("Provincia"),
    departmentId: col("ID Departamento"),
    department: col("Departamento"),
    crop: col("Cultivo"),
    campaign: col("Campa"),
    harvestedArea: col("Sup. Cosechada"),
    production: col("Producci"),
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(";").map((c) => c.replace(/"/g, "").trim())
    return {
      provinceId: cells[idx.provinceId].padStart(2, "0"),
      province: cells[idx.province],
      departmentId: cells[idx.provinceId].padStart(2, "0") + cells[idx.departmentId].padStart(3, "0"),
      department: cells[idx.department],
      crop: cells[idx.crop],
      campaign: cells[idx.campaign],
      areaHa: Number(cells[idx.harvestedArea]) || 0,
      productionTn: Number(cells[idx.production]) || 0,
    }
  })
}

function build(file: string) {
  const rows = parseCsv(file)
  const firstYear = campaignStartYear(FIRST_CAMPAIGN)
  const lastYear = rows.reduce((max, r) => Math.max(max, campaignStartYear(r.campaign)), firstYear)
  const campaigns = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => campaignFromStartYear(firstYear + i))

  // crop → nivel → id → índice de campaña → área y producción acumuladas
  const totals = new Map<number, Map<string, Map<number, Cell>>>()
  const departmentInfo = new Map<string, { name: string; province: string }>()
  const provinceNames: Record<string, string> = {}

  const add = (crop: number, key: string, t: number, areaHa: number, productionTn: number) => {
    const byKey = totals.get(crop) ?? new Map<string, Map<number, Cell>>()
    totals.set(crop, byKey)
    const byCampaign = byKey.get(key) ?? new Map<number, Cell>()
    byKey.set(key, byCampaign)
    const cell = byCampaign.get(t) ?? { areaHa: 0, productionTn: 0 }
    cell.areaHa += areaHa
    cell.productionTn += productionTn
    byCampaign.set(t, cell)
  }

  for (const row of rows) {
    const alias = CROP_ALIASES[row.crop]
    if (!alias) continue
    const t = campaignStartYear(row.campaign) - firstYear
    if (t < 0 || row.areaHa <= 0 || row.productionTn <= 0) continue
    const crop = encodeCrop(alias)
    add(crop, `D${row.departmentId}`, t, row.areaHa, row.productionTn)
    add(crop, `P${row.provinceId}`, t, row.areaHa, row.productionTn)
    add(crop, "N", t, row.areaHa, row.productionTn)
    departmentInfo.set(row.departmentId, { name: titleCase(row.department), province: row.provinceId })
    provinceNames[row.provinceId] = titleCase(row.province)
  }

  const toSeries = (byCampaign: Map<number, Cell> | undefined) =>
    campaigns.map((_, t) => {
      const cell = byCampaign?.get(t)
      return cell && cell.areaHa > 0 ? Math.round((cell.productionTn / cell.areaHa) * 1000) : null
    })

  const crops: Record<string, CropSeries> = {}
  const areas = new Map<string, Map<number, number>>() // `${crop}:${departmentId}` → área cosechada (solo evaluación)
  for (const [crop, byKey] of totals) {
    const series: CropSeries = { national: toSeries(byKey.get("N")), provinces: {}, departments: {} }
    for (const [key, byCampaign] of byKey) {
      if (key.startsWith("P")) series.provinces[key.slice(1)] = toSeries(byCampaign)
      if (key.startsWith("D")) {
        const id = key.slice(1)
        const info = departmentInfo.get(id)!
        series.departments[id] = { ...info, yields: toSeries(byCampaign) }
        areas.set(`${crop}:${id}`, new Map([...byCampaign].map(([t, c]) => [t, c.areaHa])))
      }
    }
    crops[String(crop)] = series
  }

  const data: RegionalYieldData = {
    source:
      "Ministerio de Agricultura, Ganadería y Pesca (MAGyP) – Dirección de Estimaciones Agrícolas. datosestimaciones.magyp.gob.ar",
    generatedAt: new Date().toISOString(),
    campaigns,
    provinceNames,
    crops,
  }
  return { data, areas }
}

/* ───────────── Evaluación ───────────── */

interface Score {
  /** Error absoluto medio ponderado por superficie cosechada (kg/ha). */
  mae: number
  /** Error porcentual ponderado por superficie: Σ área·|pred − real| / Σ área·real. */
  wape: number
  cases: number
}

type Predictor = (crop: string, departmentId: string, t: number) => number | null

function score(
  data: RegionalYieldData,
  areas: Map<string, Map<number, number>>,
  from: string,
  to: string,
  predict: Predictor,
  onlyCrop?: string,
): Score {
  const tFrom = campaignStartYear(from) - campaignStartYear(data.campaigns[0])
  const tTo = campaignStartYear(to) - campaignStartYear(data.campaigns[0])
  let weightedError = 0
  let weightedActual = 0
  let totalArea = 0
  let cases = 0
  for (const [crop, series] of Object.entries(data.crops)) {
    if (onlyCrop && crop !== onlyCrop) continue
    for (const [id, department] of Object.entries(series.departments)) {
      for (let t = tFrom; t <= Math.min(tTo, data.campaigns.length - 1); t++) {
        const actual = department.yields[t]
        const area = areas.get(`${crop}:${id}`)?.get(t) ?? 0
        if (actual === null || area <= 0) continue
        const predicted = predict(crop, id, t)
        if (predicted === null) continue
        weightedError += area * Math.abs(predicted - actual)
        weightedActual += area * actual
        totalArea += area
        cases++
      }
    }
  }
  return { mae: weightedError / totalArea, wape: weightedError / weightedActual, cases }
}

function modelPredictor(data: RegionalYieldData, params: RegionalParams): Predictor {
  return (crop, departmentId, t) =>
    estimateRegionalYield(
      data,
      { crop: Number(crop), departmentId, campaign: campaignFromStartYear(campaignStartYear(data.campaigns[0]) + t) },
      params,
    )?.kgHa ?? null
}

/** Métodos simples para comparar: si el modelo no les gana, no sirve. */
function baselines(data: RegionalYieldData): Record<string, Predictor> {
  const lastValue = (series: (number | null)[], t: number) => {
    for (let s = t - 1; s >= 0; s--) if (series[s] !== null) return series[s]
    return null
  }
  const mean = (series: (number | null)[], t: number, n: number) => {
    const values = series.slice(Math.max(0, t - n), t).filter((v): v is number => v !== null)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }
  return {
    "Igual que la campaña anterior del departamento": (crop, id, t) =>
      lastValue(data.crops[crop].departments[id].yields, t),
    "Promedio del departamento, últimas 5 campañas": (crop, id, t) =>
      mean(data.crops[crop].departments[id].yields, t, 5),
    "Promedio nacional del cultivo, últimas 5 campañas": (crop, _id, t) => mean(data.crops[crop].national, t, 5),
  }
}

function main() {
  const file = process.argv[2]
  if (!file) {
    console.error("Uso: npm run data:regional -- /ruta/a/Estimaciones.csv")
    process.exit(1)
  }

  const { data, areas } = build(file)
  const last = data.campaigns[data.campaigns.length - 1]
  const holdoutFrom = campaignFromStartYear(campaignStartYear(TUNE_TO) + 1)

  // Ajuste de parámetros solo con campañas de ajuste.
  let best = { params: DEFAULT_REGIONAL_PARAMS, wape: Infinity }
  for (const window of [5, 8, 10, 15])
    for (const halfLife of [2, 3, 4, 6, 10])
      for (const departmentShrinkage of [0.5, 1, 2, 4]) {
        const params = { ...DEFAULT_REGIONAL_PARAMS, window, halfLife, departmentShrinkage }
        const { wape } = score(data, areas, TUNE_FROM, TUNE_TO, modelPredictor(data, params))
        if (wape < best.wape) best = { params, wape }
      }

  const evaluate = (predict: Predictor, crop?: string) => score(data, areas, holdoutFrom, last, predict, crop)
  const model = modelPredictor(data, best.params)
  const results: Record<string, Score> = { "Modelo regional": evaluate(model) }
  for (const [name, predict] of Object.entries(baselines(data))) results[name] = evaluate(predict)

  const cropNames: Record<string, string> = { "1": "Soja", "2": "Maíz", "3": "Trigo", "4": "Girasol", "5": "Sorgo", "6": "Cebada", "7": "Arroz", "8": "Algodón" }
  const byCrop: Record<string, Score> = {}
  for (const crop of Object.keys(data.crops)) byCrop[cropNames[crop] ?? crop] = evaluate(model, crop)

  data.params = best.params
  data.backtest = {
    tunedOn: `${TUNE_FROM} – ${TUNE_TO}`,
    evaluatedOn: `${holdoutFrom} – ${last}`,
    params: best.params,
    results,
    modelByCrop: byCrop,
  }

  const json = JSON.stringify(data)
  writeFileSync(OUTPUT, json)

  const pct = (s: Score) => `${(s.wape * 100).toFixed(1)}%`.padStart(6)
  console.log(`Campañas ${data.campaigns[0]} – ${last} · ${Object.keys(data.crops).length} cultivos`)
  console.log(`Parámetros elegidos con ${TUNE_FROM}–${TUNE_TO}: ${JSON.stringify(best.params)}`)
  console.log(`\nError en campañas no vistas (${holdoutFrom} – ${last}), ponderado por superficie:`)
  for (const [name, s] of Object.entries(results))
    console.log(`  ${pct(s)}  ±${Math.round(s.mae).toString().padStart(5)} kg/ha  ${name} (${s.cases} casos)`)
  console.log("\nModelo regional por cultivo:")
  for (const [name, s] of Object.entries(byCrop))
    console.log(`  ${name.padEnd(8)} ${pct(s)}  ±${Math.round(s.mae)} kg/ha  (${s.cases} casos)`)
  console.log(`\nGuardado en ${path.relative(process.cwd(), OUTPUT)} (${(json.length / 1024).toFixed(0)} KB)`)
}

main()
