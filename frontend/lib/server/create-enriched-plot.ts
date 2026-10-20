import { isMissingGroupColumnError, withoutGroup } from "@/lib/plot-group-compat"
import { type User } from "@supabase/supabase-js"

import { getPlanLimits, type UserPlan } from "@/lib/plan-limits"
import { polygonAreaHectares } from "@/lib/polygon-area"
import {
  centroidFromPolygon,
  collectPlotExternalData,
  parseLotPolygon,
  polygonToGeoJson,
} from "@/lib/server/plot-external-data"
import { predictAndStorePlotYield, type PlotPredictionResult } from "@/lib/server/yield-prediction"

const PLOT_STATUSES = new Set(["Sembrado", "Crecimiento", "Cosechado", "Barbecho"])

export interface CreatePlotRequestBody {
  farm_id?: unknown
  name?: unknown
  group?: unknown
  crop_type?: unknown
  area_ha?: unknown
  status?: unknown
  polygon?: unknown
  description?: unknown
  soil_ph?: unknown
  irrigation_type?: unknown
  fertilizer_type?: unknown
  pesticide_usage_ml?: unknown
  crop_disease_status?: unknown
  sowing_date?: unknown
}

export interface EnrichedPlotCreationResult {
  plot: unknown
  enrichment: {
    dateFrom: string | null
    dateTo: string | null
    appliedFields: string[]
    warnings: string[]
  }
  prediction: PlotPredictionResult
}

interface SupabaseLike {
  from(table: string): any
}

export async function createEnrichedPlot(
  supabase: SupabaseLike,
  user: Pick<User, "id" | "email" | "user_metadata">,
  body: CreatePlotRequestBody,
): Promise<EnrichedPlotCreationResult> {
  const farmId = normalizeString(body.farm_id)
  const name = normalizeString(body.name)
  const sowingDate = normalizeString(body.sowing_date)
  const group = normalizeInteger(body.group)
  const polygon = parseLotPolygon(body.polygon)
  const geoJSON = polygon ? polygonToGeoJson(polygon) : null
  const centroid = polygon ? centroidFromPolygon(polygon) : null

  if (!farmId) throw new Error("farm_id es obligatorio.")
  if (!name) throw new Error("El nombre del lote es obligatorio.")
  if (!sowingDate) throw new Error("sowing_date es obligatorio.")
  if (!group || group < 1) throw new Error("El grupo debe ser un numero entero valido.")
  if (!polygon || polygon.length < 3) {
    throw new Error("El formulario debe incluir un poligono valido.")
  }
  if (!geoJSON || !centroid) {
    throw new Error("No se pudo convertir el poligono a GeoJSON valido.")
  }

  const requestedStatus = normalizeString(body.status)
  const status =
    requestedStatus && PLOT_STATUSES.has(requestedStatus) ? requestedStatus : "Sembrado"

  const computedArea = polygonAreaHectares(polygon)
  if (!Number.isFinite(computedArea) || computedArea <= 0) {
    throw new Error(
      "No se pudo calcular la superficie del poligono. Verificá los cuatro puntos en el mapa.",
    )
  }
  const areaHa = Number(computedArea.toFixed(2))

  await ensureUserProfile(supabase, user)
  await checkPlotCreationLimit(supabase, user.id, areaHa)

  const { data: ownedFarm, error: farmError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (farmError) throw new Error(farmError.message)
  if (!ownedFarm) {
    throw new Error("La granja no existe o no pertenece a tu cuenta.")
  }

  const enrichment = await collectPlotExternalData({
    polygon,
    latitude: centroid.latitude,
    longitude: centroid.longitude,
    sowingDate,
  })

  const metricsPatch = buildMetricsPatch(enrichment.metrics)
  const row: Record<string, unknown> = {
    farm_id: farmId,
    name,
    group,
    status,
    latitude: roundGeographicCoord(centroid.latitude, 6),
    longitude: roundGeographicCoord(centroid.longitude, 6),
    polygon,
    geoJSON,
    sowing_date: sowingDate,
    ...metricsPatch,
    sunlight_hours: 8,
  }

  row.area_ha = areaHa

  const cropType = normalizeString(body.crop_type)
  if (cropType) row.crop_type = cropType

  const description = normalizeString(body.description)
  if (description) row.description = description

  const soilPh = normalizeNumber(body.soil_ph)
  if (soilPh != null) row.soil_ph = soilPh

  const irrigationType = normalizeString(body.irrigation_type)
  if (irrigationType) row.irrigation_type = irrigationType

  const fertilizerType = normalizeString(body.fertilizer_type)
  if (fertilizerType) row.fertilizer_type = fertilizerType

  const pesticideUsage = normalizeNumber(body.pesticide_usage_ml)
  if (pesticideUsage != null && pesticideUsage >= 0) {
    row.pesticide_usage_ml = pesticideUsage
  }

  const cropDiseaseStatus = normalizeString(body.crop_disease_status)
  if (cropDiseaseStatus) row.crop_disease_status = cropDiseaseStatus

  let { data, error } = await supabase.from("plots").insert(row).select().single()
  if (error && isMissingGroupColumnError(error)) {
    ;({ data, error } = await supabase
      .from("plots")
      .insert(withoutGroup(row))
      .select()
      .single())
  }

  if (error) throw new Error(error.message)

  // El lote ya está guardado: si la predicción falla, se informa pero no se revierte la creación.
  let prediction: PlotPredictionResult
  try {
    prediction = await predictAndStorePlotYield(supabase, data)
  } catch (predictionError) {
    prediction = {
      predictedKgHa: null,
      reason:
        predictionError instanceof Error ? predictionError.message : "No se pudo predecir el rinde.",
    }
  }

  return {
    plot: data,
    prediction,
    enrichment: {
      dateFrom: enrichment.dateFrom,
      dateTo: enrichment.dateTo,
      appliedFields: Object.keys(metricsPatch),
      warnings: enrichment.warnings,
    },
  }
}

async function ensureUserProfile(
  supabase: SupabaseLike,
  user: Pick<User, "id" | "email" | "user_metadata">,
) {
  const { data, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message)
  if (data) return

  const meta = user.user_metadata as Record<string, unknown> | undefined
  const fromMeta =
    (typeof meta?.name === "string" && meta.name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    null

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? null,
    name: fromMeta,
  })

  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message)
  }
}

async function checkPlotCreationLimit(
  supabase: SupabaseLike,
  userId: string,
  areaHa: number | null,
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single()

  if (profileError) throw new Error(profileError.message)

  const plan: UserPlan = (profile?.plan as UserPlan) ?? "free"
  const limits = getPlanLimits(plan)

  const { data: farms, error: farmsError } = await supabase
    .from("farms")
    .select("id")
    .eq("user_id", userId)

  if (farmsError) throw new Error(farmsError.message)

  const farmIds = (farms ?? []).map((farm: { id: string }) => farm.id)
  if (farmIds.length === 0) return

  const { data: plots, error: plotsError } = await supabase
    .from("plots")
    .select("area_ha")
    .in("farm_id", farmIds)

  if (plotsError) throw new Error(plotsError.message)

  const plotCount = (plots ?? []).length
  if (plotCount >= limits.maxPlots) {
    throw new Error(
      `Tu plan ${limits.label} permite un maximo de ${Number.isFinite(limits.maxPlots) ? limits.maxPlots : "ilimitados"} lotes. Mejora tu plan para continuar.`,
    )
  }

  const currentTotalHa = (plots ?? []).reduce(
    (sum: number, plot: { area_ha?: unknown }) => sum + (Number(plot.area_ha) || 0),
    0,
  )
  const nextTotalHa = currentTotalHa + (areaHa ?? 0)
  if (nextTotalHa > limits.maxHectares) {
    throw new Error(
      `Tu plan ${limits.label} permite un maximo de ${limits.maxHectares} hectareas totales. Mejora tu plan para continuar.`,
    )
  }
}

function buildMetricsPatch(metrics: {
  ndvi_index?: unknown
  soil_moisture_percent?: unknown
  temperature_c?: unknown
  rainfall_mm?: unknown
  humidity_percent?: unknown
}) {
  const patch: Record<string, number> = {}

  const ndvi = normalizeNumber(metrics.ndvi_index)
  if (ndvi != null && ndvi >= -1 && ndvi <= 1) {
    patch.ndvi_index = Number(ndvi.toFixed(4))
  }

  const soilMoisture = normalizeNumber(metrics.soil_moisture_percent)
  if (soilMoisture != null && soilMoisture >= 0 && soilMoisture <= 100) {
    patch.soil_moisture_percent = Number(soilMoisture.toFixed(2))
  }

  const temperature = normalizeNumber(metrics.temperature_c)
  if (temperature != null) {
    patch.temperature_c = Number(temperature.toFixed(2))
  }

  const rainfall = normalizeNumber(metrics.rainfall_mm)
  if (rainfall != null && rainfall >= 0) {
    patch.rainfall_mm = Number(rainfall.toFixed(2))
  }

  const humidity = normalizeNumber(metrics.humidity_percent)
  if (humidity != null && humidity >= 0 && humidity <= 100) {
    patch.humidity_percent = Number(humidity.toFixed(2))
  }

  return patch
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10)
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function roundGeographicCoord(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
