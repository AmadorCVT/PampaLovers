import type { SupabaseClient } from "@supabase/supabase-js"

import regionalYieldsJson from "@/data/regional-yields.json"
import {
  campaignForDate,
  estimateRegionalYield,
  type RegionalEstimate,
  type RegionalYieldData,
} from "@/lib/ml/regional-yield"
import {
  parseYieldModel,
  predictYieldKgHa,
  trainYieldModel,
  type TrainingSample,
  type YieldModel,
} from "@/lib/ml/yield-model"
import { lookupAdminLocation, type AdminLocation } from "@/lib/server/georef"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { encodeCrop, featuresFromLog, featuresFromPlot } from "@/lib/yield-features"

/**
 * Predicción de rinde en dos capas:
 * 1. Regional (siempre): rinde esperable del cultivo en el departamento del lote para su campaña,
 *    calculado con las Estimaciones Agrícolas del MAGyP (`data/regional-yields.json`).
 * 2. Por lote (opcional): red neuronal entrenada con las cosechas reales de la app (`logs`), que
 *    recibe el regional como variable y aprende cuánto se desvía cada lote. Solo se usa si en
 *    validación mejora al regional solo.
 */

const REGIONAL_DATA = regionalYieldsJson as unknown as RegionalYieldData

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
  backfilled: number
}

/**
 * Entrena el modelo por lote con las cosechas registradas (si alcanzan), lo guarda y completa la
 * predicción de los lotes que todavía no tenían.
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

  const backfilled = await backfillMissingPredictions(admin, model, deps)
  return { model, samples: samples.length, lotModelInUse: lotModelIsUseful(model), backfilled }
}

/* ───────────── Predicción ───────────── */

export interface PredictionBasis {
  method: "regional" | "regional+lotes"
  level: RegionalEstimate["level"]
  /** Departamento, provincia o "Argentina", según el nivel con datos. */
  areaName: string
  campaign: string
}

export type PlotPredictionResult =
  | { predictedKgHa: number; basis: PredictionBasis }
  | { predictedKgHa: null; reason: string }

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

  const basis: PredictionBasis = {
    method: "regional",
    level: regional.level,
    areaName: regional.areaName,
    campaign,
  }
  if (!lotModelIsUseful(model)) return { predictedKgHa: regional.kgHa, basis }

  const kgHa = predictYieldKgHa(model, featuresFromPlot(plot, regional.kgHa))
  return { predictedKgHa: Math.round(kgHa), basis: { ...basis, method: "regional+lotes" } }
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

/** Lotes con cultivo en curso que nunca recibieron una predicción. */
async function backfillMissingPredictions(
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

  // En tandas: cada id viaja en la URL del filtro `in`.
  const predicted = new Set<string>()
  for (let i = 0; i < plots.length; i += 200) {
    const { data: existing, error: existingError } = await admin
      .from("plot_prediction")
      .select("plot_id")
      .in(
        "plot_id",
        plots.slice(i, i + 200).map((p) => p.id),
      )
    if (existingError) throw new Error(`No se pudieron leer las predicciones: ${existingError.message}`)
    for (const row of existing ?? []) predicted.add(row.plot_id)
  }

  const pending = plots.filter((plot) => !predicted.has(plot.id))
  const results = await mapWithConcurrency(pending, LOCATE_CONCURRENCY, (plot) => predictForPlot(model, plot, deps))
  const rows = pending
    .map((plot, i) => ({ plot_id: plot.id, ml_predicted_kg_ha: results[i].predictedKgHa }))
    .filter((row) => row.ml_predicted_kg_ha !== null)

  if (rows.length === 0) return 0
  const { error: insertError } = await admin.from("plot_prediction").insert(rows)
  if (insertError) throw new Error(`No se pudieron guardar las predicciones: ${insertError.message}`)
  return rows.length
}
