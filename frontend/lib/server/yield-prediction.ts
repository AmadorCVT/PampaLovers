import type { SupabaseClient } from "@supabase/supabase-js"

import {
  parseYieldModel,
  predictYieldKgHa,
  trainYieldModel,
  type TrainingSample,
  type YieldModel,
} from "@/lib/ml/yield-model"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { featuresFromLog, featuresFromPlot } from "@/lib/yield-features"

/** Mismo bucket que usaba el backend Python para `model-1.keras`. */
const MODEL_BUCKET = "models"
const MODEL_PATH = "yield-model.json"
const MODEL_CACHE_MS = 5 * 60 * 1000
const LOGS_PAGE_SIZE = 1000

/** Por debajo de esto la red no tiene de dónde aprender. */
export const MIN_TRAINING_SAMPLES = 20

let cachedModel: { model: YieldModel | null; loadedAt: number } | null = null

/** Olvida el modelo cacheado (tests, o tras reemplazar el archivo a mano). */
export function clearYieldModelCache() {
  cachedModel = null
}

function requireAdminClient(): SupabaseClient {
  const admin = createSupabaseAdminClient()
  if (!admin) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor: se necesita para leer y guardar el modelo de rinde.",
    )
  }
  return admin
}

/* ───────────── Entrenamiento ───────────── */

/** Todas las cosechas de `public.logs` (de todos los usuarios) con rinde válido. */
export async function fetchTrainingSamples(admin: SupabaseClient): Promise<TrainingSample[]> {
  const samples: TrainingSample[] = []
  for (let offset = 0; ; offset += LOGS_PAGE_SIZE) {
    const { data, error } = await admin
      .from("logs")
      .select("*")
      .range(offset, offset + LOGS_PAGE_SIZE - 1)
    if (error) throw new Error(`No se pudo leer logs: ${error.message}`)
    for (const row of data ?? []) {
      const yieldKgHa = Number(row.yield_kg_per_hectare)
      if (!Number.isFinite(yieldKgHa) || yieldKgHa <= 0) continue
      samples.push({ features: featuresFromLog(row), yieldKgHa })
    }
    if (!data || data.length < LOGS_PAGE_SIZE) break
  }
  return samples
}

async function saveYieldModel(admin: SupabaseClient, model: YieldModel) {
  const upload = () =>
    admin.storage
      .from(MODEL_BUCKET)
      .upload(MODEL_PATH, JSON.stringify(model), {
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

export interface TrainingResult {
  model: YieldModel
  backfilled: number
}

/** Entrena con todas las cosechas registradas, guarda el modelo y predice los lotes que no tienen predicción. */
export async function trainAndStoreYieldModel(
  admin: SupabaseClient = requireAdminClient(),
): Promise<TrainingResult> {
  const samples = await fetchTrainingSamples(admin)
  if (samples.length < MIN_TRAINING_SAMPLES) {
    throw new Error(
      `Hay ${samples.length} cosechas con rinde en la tabla logs; se necesitan al menos ${MIN_TRAINING_SAMPLES} para entrenar.`,
    )
  }

  const model = trainYieldModel(samples)
  await saveYieldModel(admin, model)
  cachedModel = { model, loadedAt: Date.now() }

  const backfilled = await backfillMissingPredictions(admin, model)
  return { model, backfilled }
}

/* ───────────── Predicción ───────────── */

/** Modelo vigente desde Storage (cacheado unos minutos). `null` si todavía no se entrenó. */
export async function loadYieldModel(admin?: SupabaseClient): Promise<YieldModel | null> {
  if (cachedModel && Date.now() - cachedModel.loadedAt < MODEL_CACHE_MS) return cachedModel.model

  const { data, error } = await (admin ?? requireAdminClient()).storage.from(MODEL_BUCKET).download(MODEL_PATH)
  if (error || !data) {
    // Sin archivo (o sin bucket) = todavía no hay modelo entrenado.
    cachedModel = { model: null, loadedAt: Date.now() }
    return null
  }

  let model: YieldModel | null = null
  try {
    model = parseYieldModel(JSON.parse(await data.text()))
  } catch {
    model = null
  }
  cachedModel = { model, loadedAt: Date.now() }
  return model
}

export type PlotPredictionResult =
  | { predictedKgHa: number }
  | { predictedKgHa: null; reason: string }

function predictForPlot(model: YieldModel, plot: Record<string, unknown>): PlotPredictionResult {
  const features = featuresFromPlot(plot)
  if (features.categorical.crop === 0) {
    return { predictedKgHa: null, reason: "El lote no tiene un cultivo reconocido para predecir." }
  }
  return { predictedKgHa: Math.round(predictYieldKgHa(model, features)) }
}

/**
 * Predice el rinde de un lote y lo guarda como nueva fila en `plot_prediction` (se conserva el
 * historial). `supabase` es el cliente del usuario: RLS garantiza que el lote sea suyo.
 */
export async function predictAndStorePlotYield(
  supabase: Pick<SupabaseClient, "from">,
  plot: Record<string, unknown>,
  admin?: SupabaseClient,
): Promise<PlotPredictionResult> {
  const model = await loadYieldModel(admin)
  if (!model) {
    return {
      predictedKgHa: null,
      reason: "Todavía no hay un modelo de rinde entrenado (ver POST /api/ml/train).",
    }
  }

  const result = predictForPlot(model, plot)
  if (result.predictedKgHa === null) return result

  const { error } = await supabase
    .from("plot_prediction")
    .insert({ plot_id: plot.id, ml_predicted_kg_ha: result.predictedKgHa })
  if (error) throw new Error(`No se pudo guardar la predicción: ${error.message}`)
  return result
}

/** Lotes con cultivo en curso que nunca recibieron una predicción. */
async function backfillMissingPredictions(admin: SupabaseClient, model: YieldModel): Promise<number> {
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
  const rows = plots
    .filter((plot) => !predicted.has(plot.id))
    .map((plot) => ({ plot, result: predictForPlot(model, plot) }))
    .filter(({ result }) => result.predictedKgHa !== null)
    .map(({ plot, result }) => ({ plot_id: plot.id, ml_predicted_kg_ha: result.predictedKgHa }))

  if (rows.length === 0) return 0
  const { error: insertError } = await admin.from("plot_prediction").insert(rows)
  if (insertError) throw new Error(`No se pudieron guardar las predicciones: ${insertError.message}`)
  return rows.length
}
