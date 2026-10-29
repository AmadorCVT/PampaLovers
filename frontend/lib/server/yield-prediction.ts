import type { SupabaseClient } from "@supabase/supabase-js"

import regionalYieldsJson from "@/data/regional-yields.json"
import weatherModelJson from "@/data/weather-model.json"
import {
  campaignForDate,
  campaignStartYear,
  estimateRegionalYield,
  type RegionalEstimate,
  type RegionalYieldData,
} from "@/lib/ml/regional-yield"
import { logWeatherEffect, weatherFeatures, type MonthlyWeather, type WeatherModelData } from "@/lib/ml/weather-effect"
import {
  parseYieldModel,
  predictYieldKgHa,
  trainYieldModel,
  type TrainingSample,
  type YieldModel,
} from "@/lib/ml/yield-model"
import { lookupAdminLocation, type AdminLocation } from "@/lib/server/georef"
import { fetchSeasonWeather } from "@/lib/server/weather"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { encodeCrop, featuresFromLog, featuresFromPlot } from "@/lib/yield-features"

/**
 * Predicción de rinde en tres capas:
 * 1. Regional (siempre): rinde esperable del cultivo en el departamento del lote para su campaña,
 *    calculado con las Estimaciones Agrícolas del MAGyP (`data/regional-yields.json`).
 * 2. Por lote (opcional): red neuronal entrenada con las cosechas reales de la app (`logs`), que
 *    recibe el regional como variable y aprende cuánto se desvía cada lote. Solo se usa si en
 *    validación mejora al regional solo.
 * 3. Clima de la campaña (`data/weather-model.json`): ajusta según la lluvia y temperatura ya
 *    observadas del período crítico (NASA POWER). Arranca neutro al sembrar y se define a medida
 *    que avanza la campaña: por eso las predicciones se recalculan cada semana.
 */

const WEATHER_MODEL_RAW = weatherModelJson as unknown as WeatherModelData

/** El ajuste por clima se entrenó contra estos datos regionales; si se regeneraron, no aplica. */
const WEATHER_MODEL: WeatherModelData | null =
  WEATHER_MODEL_RAW.regionalGeneratedAt === (regionalYieldsJson as unknown as RegionalYieldData).generatedAt
    ? WEATHER_MODEL_RAW
    : null

/**
 * Base regional sobre la historia "sin clima" (si hay modelo de clima): una sequía pasada no debe
 * bajar el esperable de las campañas siguientes, el clima de cada campaña se aplica aparte.
 */
const REGIONAL_DATA: RegionalYieldData = (() => {
  const plain = regionalYieldsJson as unknown as RegionalYieldData
  if (!WEATHER_MODEL) return plain
  const crops = Object.fromEntries(
    Object.entries(plain.crops).map(([crop, series]) => {
      const deweathered = WEATHER_MODEL.deweatheredYields[crop] ?? {}
      const departments = Object.fromEntries(
        Object.entries(series.departments).map(([id, d]) => [id, { ...d, yields: deweathered[id] ?? d.yields }]),
      )
      return [crop, { ...series, departments }]
    }),
  )
  return { ...plain, crops }
})()

/** Mismo bucket que usaba el backend Python para `model-1.keras`. */
const MODEL_BUCKET = "models"
const MODEL_PATH = "yield-model.json"
const MODEL_CACHE_MS = 5 * 60 * 1000
const LOGS_PAGE_SIZE = 1000
const LOCATE_CONCURRENCY = 8

/** Por debajo de esto la red no tiene de dónde aprender. */
export const MIN_TRAINING_SAMPLES = 20

export interface PredictionDeps {
  /** Cliente service role (Storage del modelo, entrenamiento). Por defecto, el de las env vars. */
  admin?: SupabaseClient
  /** Ubicación administrativa de un punto. Por defecto, la API Georef. */
  locate?: (latitude: number, longitude: number) => Promise<AdminLocation | null>
  /** Clima observado de la temporada ("AAAAMM" → mes). Por defecto, NASA POWER. */
  seasonWeather?: (
    crop: string,
    campaignStartYear: number,
    latitude: number,
    longitude: number,
  ) => Promise<Map<string, MonthlyWeather>>
}

let cachedModel: { model: YieldModel | null; loadedAt: number } | null = null

/** Olvida el modelo cacheado (tests, o tras reemplazar el archivo a mano). */
export function clearYieldModelCache() {
  cachedModel = null
}

function requireAdminClient(): SupabaseClient {
  const admin = createSupabaseAdminClient()
  if (!admin) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor: se necesita para entrenar y guardar el modelo de rinde.",
    )
  }
  return admin
}

/* ───────────── Capa regional ───────────── */

function toCoordinate(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? null : n
}

async function locatePoint(
  latitude: unknown,
  longitude: unknown,
  deps: PredictionDeps,
): Promise<AdminLocation | null> {
  const lat = toCoordinate(latitude)
  const lon = toCoordinate(longitude)
  if (lat === null || lon === null) return null
  return (deps.locate ?? lookupAdminLocation)(lat, lon)
}

function regionalEstimate(
  crop: number,
  campaign: string,
  location: AdminLocation | null,
): RegionalEstimate | null {
  return estimateRegionalYield(REGIONAL_DATA, {
    crop,
    campaign,
    departmentId: location?.departmentId,
    provinceId: location?.provinceId,
  })
}

/** Campaña del lote: la de su siembra, o la actual si todavía no tiene fecha. */
function plotCampaign(plot: Record<string, unknown>): string {
  return typeof plot.sowing_date === "string" && plot.sowing_date
    ? campaignForDate(plot.sowing_date)
    : campaignForDate(new Date())
}

/* ───────────── Modelo por lote ───────────── */

/** Usar la red solo si en validación le ganó al rinde regional solo. */
function lotModelIsUseful(model: YieldModel | null): model is YieldModel {
  const { validationSamples, maeKgHa, regionalMaeKgHa } = model?.metrics ?? {}
  return Boolean(
    model && validationSamples && regionalMaeKgHa != null && maeKgHa != null && maeKgHa < regionalMaeKgHa,
  )
}

/** Modelo por lote desde Storage (cacheado unos minutos). `null` si no hay o no hay credenciales. */
export async function loadYieldModel(admin?: SupabaseClient): Promise<YieldModel | null> {
  if (cachedModel && Date.now() - cachedModel.loadedAt < MODEL_CACHE_MS) return cachedModel.model

  const client = admin ?? createSupabaseAdminClient()
  if (!client) return null

  const { data, error } = await client.storage.from(MODEL_BUCKET).download(MODEL_PATH)
  let model: YieldModel | null = null
  if (!error && data) {
    try {
      model = parseYieldModel(JSON.parse(await data.text()))
    } catch {
      model = null
    }
  }
  cachedModel = { model, loadedAt: Date.now() }
  return model
}

async function saveYieldModel(admin: SupabaseClient, model: YieldModel) {
  const upload = () =>
    admin.storage.from(MODEL_BUCKET).upload(MODEL_PATH, JSON.stringify(model), {
      upsert: true,
      contentType: "application/json",
    })

  let { error } = await upload()
  if (error && /bucket not found/i.test(error.message)) {
    const { error: bucketError } = await admin.storage.createBucket(MODEL_BUCKET, { public: false })
    if (bucketError) throw new Error(`No se pudo crear el bucket "${MODEL_BUCKET}": ${bucketError.message}`)
    ;({ error } = await upload())
  }
  if (error) throw new Error(`No se pudo guardar el modelo: ${error.message}`)
}

/** Ejecuta `task` sobre cada elemento con a lo sumo `limit` en paralelo. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await task(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Todas las cosechas de `public.logs` con rinde válido, cada una con el rinde regional de su lote
 * y campaña como variable (así la red aprende el desvío del lote respecto de su zona).
 */
export async function fetchTrainingSamples(
  admin: SupabaseClient,
  deps: PredictionDeps = {},
): Promise<TrainingSample[]> {
  const logs: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += LOGS_PAGE_SIZE) {
    const { data, error } = await admin
      .from("logs")
      .select("*")
      .range(offset, offset + LOGS_PAGE_SIZE - 1)
    if (error) throw new Error(`No se pudo leer logs: ${error.message}`)
    logs.push(...(data ?? []))
    if (!data || data.length < LOGS_PAGE_SIZE) break
  }

  const valid = logs.filter((row) => {
    const y = Number(row.yield_kg_per_hectare)
    return Number.isFinite(y) && y > 0
  })

  // Ubicación de cada lote cosechado (una consulta por lote, no por cosecha).
  const plotIds = [...new Set(valid.map((row) => String(row.plot_id)))]
  const locations = new Map<string, AdminLocation | null>()
  for (let i = 0; i < plotIds.length; i += 200) {
    const { data: plots, error } = await admin
      .from("plots")
      .select("id, latitude, longitude")
      .in("id", plotIds.slice(i, i + 200))
    if (error) throw new Error(`No se pudieron leer los lotes: ${error.message}`)
    const found = await mapWithConcurrency(plots ?? [], LOCATE_CONCURRENCY, (plot) =>
      locatePoint(plot.latitude, plot.longitude, deps),
    )
    ;(plots ?? []).forEach((plot, j) => locations.set(String(plot.id), found[j]))
  }

  return valid.map((row) => {
    const date = (row.sowing_date ?? row.harvest_date) as string | null
    const regional = date
      ? regionalEstimate(Number(row.crop_type), campaignForDate(date), locations.get(String(row.plot_id)) ?? null)
      : null
    return {
      features: featuresFromLog(row, regional?.kgHa ?? null),
      yieldKgHa: Number(row.yield_kg_per_hectare),
    }
  })
}

export interface TrainingResult {
  /** `null` si todavía no hay suficientes cosechas: se predice solo con la capa regional. */
  model: YieldModel | null
  samples: number
  /** La red mejora al regional en validación y se usa al predecir. */
  lotModelInUse: boolean
  /** Lotes con una predicción nueva o distinta de la anterior. */
  updatedPredictions: number
}

/**
 * Entrena el modelo por lote con las cosechas registradas (si alcanzan), lo guarda y recalcula la
 * predicción de todos los lotes activos (con el clima observado hasta hoy).
 */
export async function trainAndStoreYieldModel(deps: PredictionDeps = {}): Promise<TrainingResult> {
  const admin = deps.admin ?? requireAdminClient()
  const samples = await fetchTrainingSamples(admin, deps)

  let model: YieldModel | null = null
  if (samples.length >= MIN_TRAINING_SAMPLES) {
    model = trainYieldModel(samples)
    await saveYieldModel(admin, model)
    cachedModel = { model, loadedAt: Date.now() }
  }

  const updatedPredictions = await refreshPredictions(admin, model, deps)
  return { model, samples: samples.length, lotModelInUse: lotModelIsUseful(model), updatedPredictions }
}

/* ───────────── Predicción ───────────── */

export interface PredictionBasis {
  method: "regional" | "regional+lotes"
  level: RegionalEstimate["level"]
  /** Departamento, provincia o "Argentina", según el nivel con datos. */
  areaName: string
  campaign: string
  /** Ajuste por el clima ya observado de la campaña, o `null` si no aplica / no hubo dato. */
  weather: { factor: number; observedMonths: number } | null
}

export type PlotPredictionResult =
  | { predictedKgHa: number; basis: PredictionBasis }
  | { predictedKgHa: null; reason: string }

/** Factor multiplicativo por el clima observado de la campaña en el departamento. */
async function weatherAdjustment(
  crop: number,
  campaign: string,
  location: AdminLocation | null,
  deps: PredictionDeps,
): Promise<PredictionBasis["weather"]> {
  const departmentId = location?.departmentId
  const normals = departmentId ? WEATHER_MODEL?.departments[departmentId] : undefined
  const coefficients = WEATHER_MODEL?.coefficients[String(crop)]
  if (!WEATHER_MODEL || !normals || !coefficients) return null

  const startYear = campaignStartYear(campaign)
  let observed: Map<string, MonthlyWeather>
  try {
    observed = await (deps.seasonWeather ?? fetchSeasonWeather)(String(crop), startYear, normals.lat, normals.lon)
  } catch {
    return null // NASA no respondió: se predice sin ajuste y se reintenta en el próximo recálculo
  }

  const features = weatherFeatures(String(crop), startYear, normals, (year, month) =>
    observed.get(`${year}${String(month).padStart(2, "0")}`) ?? null,
  )
  if (!features) return null
  const factor = Math.exp(WEATHER_MODEL.scale * logWeatherEffect(coefficients, features.x))
  return { factor: Number(factor.toFixed(4)), observedMonths: features.observedMonths }
}

async function predictForPlot(
  model: YieldModel | null,
  plot: Record<string, unknown>,
  deps: PredictionDeps,
): Promise<PlotPredictionResult> {
  const crop = encodeCrop(plot.crop_type as string | null)
  if (crop === 0) {
    return { predictedKgHa: null, reason: "El lote no tiene un cultivo reconocido para predecir." }
  }

  const campaign = plotCampaign(plot)
  const location = await locatePoint(plot.latitude, plot.longitude, deps)
  const regional = regionalEstimate(crop, campaign, location)
  if (!regional) {
    return { predictedKgHa: null, reason: "No hay datos regionales para este cultivo." }
  }

  const weather = await weatherAdjustment(crop, campaign, location, deps)
  const useLotModel = lotModelIsUseful(model)
  const base = useLotModel ? predictYieldKgHa(model, featuresFromPlot(plot, regional.kgHa)) : regional.kgHa

  return {
    predictedKgHa: Math.max(0, Math.round(base * (weather?.factor ?? 1))),
    basis: {
      method: useLotModel ? "regional+lotes" : "regional",
      level: regional.level,
      areaName: regional.areaName,
      campaign,
      weather,
    },
  }
}

/**
 * Predice el rinde de un lote y lo guarda como nueva fila en `plot_prediction` (se conserva el
 * historial). `supabase` es el cliente del usuario: RLS garantiza que el lote sea suyo.
 */
export async function predictAndStorePlotYield(
  supabase: Pick<SupabaseClient, "from">,
  plot: Record<string, unknown>,
  deps: PredictionDeps = {},
): Promise<PlotPredictionResult> {
  const model = await loadYieldModel(deps.admin)
  const result = await predictForPlot(model, plot, deps)
  if (result.predictedKgHa === null) return result

  const { error } = await supabase
    .from("plot_prediction")
    .insert({ plot_id: plot.id, ml_predicted_kg_ha: result.predictedKgHa })
  if (error) throw new Error(`No se pudo guardar la predicción: ${error.message}`)
  return result
}

/** Un cambio menor a esto no amerita una fila nueva en el historial. */
const MIN_RELATIVE_CHANGE = 0.01

/**
 * Recalcula todos los lotes con cultivo en curso (corre cada semana con el cron) y agrega una fila
 * al historial cuando la predicción es nueva o cambió: así refleja el clima que va llegando.
 */
async function refreshPredictions(
  admin: SupabaseClient,
  model: YieldModel | null,
  deps: PredictionDeps,
): Promise<number> {
  const { data: plots, error } = await admin
    .from("plots")
    .select("*")
    .not("crop_type", "is", null)
    .neq("status", "Barbecho")
  if (error) throw new Error(`No se pudieron leer los lotes: ${error.message}`)
  if (!plots?.length) return 0

  // Última predicción de cada lote. En tandas: cada id viaja en la URL del filtro `in`.
  const latest = new Map<string, { value: number; at: string }>()
  for (let i = 0; i < plots.length; i += 200) {
    const { data: existing, error: existingError } = await admin
      .from("plot_prediction")
      .select("plot_id, ml_predicted_kg_ha, created_at")
      .in(
        "plot_id",
        plots.slice(i, i + 200).map((p) => p.id),
      )
    if (existingError) throw new Error(`No se pudieron leer las predicciones: ${existingError.message}`)
    for (const row of existing ?? []) {
      const previous = latest.get(row.plot_id)
      const at = String(row.created_at ?? "")
      if (!previous || at >= previous.at) latest.set(row.plot_id, { value: Number(row.ml_predicted_kg_ha), at })
    }
  }

  const results = await mapWithConcurrency(plots, LOCATE_CONCURRENCY, (plot) => predictForPlot(model, plot, deps))
  const rows = plots
    .map((plot, i) => ({ plot_id: plot.id, ml_predicted_kg_ha: results[i].predictedKgHa }))
    .filter((row): row is { plot_id: string; ml_predicted_kg_ha: number } => {
      if (row.ml_predicted_kg_ha === null) return false
      const previous = latest.get(row.plot_id)?.value
      return (
        previous === undefined ||
        !Number.isFinite(previous) ||
        Math.abs(row.ml_predicted_kg_ha - previous) / Math.max(previous, 1) >= MIN_RELATIVE_CHANGE
      )
    })

  if (rows.length === 0) return 0
  const { error: insertError } = await admin.from("plot_prediction").insert(rows)
  if (insertError) throw new Error(`No se pudieron guardar las predicciones: ${insertError.message}`)
  return rows.length
}
