import { isMissingGroupColumnError, withoutGroup } from "@/lib/plot-group-compat"
import type { SupabaseClient, User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/client"
import {
  type UserPlan,
  DEFAULT_USER_PLAN,
  getPlanLimits,
} from "@/lib/plan-limits"
import {
  encodeCrop,
  encodeDisease,
  encodeFertilizer,
  encodeIrrigation,
} from "@/lib/yield-features"

/** Horas de sol por defecto hasta tener una fuente confiable. */
const DEFAULT_SUNLIGHT_HOURS = 8

/** Asegura fila en profiles: farms.user_id referencia profiles(id), no auth.users. */
async function ensureUserProfile(supabase: SupabaseClient, user: User) {
  const { data, error: selErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message)
  if (data) return

  const meta = user.user_metadata as Record<string, unknown> | undefined
  const fromMeta =
    (typeof meta?.name === "string" && meta.name) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    null

  const { error: insErr } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? null,
    name: fromMeta,
  })

  // Carrera con el trigger on_auth_user_created
  if (insErr && insErr.code !== "23505") throw new Error(insErr.message)
}

// ──────────────────────────────────────────────
// Database row types
// ──────────────────────────────────────────────

export interface DbPlot {
  id: string
  farm_id: string
  name: string
  description: string | null
  area_ha: number | null
  status: "Sembrado" | "Crecimiento" | "Cosechado" | "Barbecho"
  latitude: number | null
  longitude: number | null
  crop_type: string | null
  soil_moisture_percent: number | null
  soil_ph: number | null
  temperature_c: number | null
  rainfall_mm: number | null
  humidity_percent: number | null
  sunlight_hours: number | null
  irrigation_type: string | null
  fertilizer_type: string | null
  pesticide_usage_ml: number | null
  total_days: number | null
  ndvi_index: number | null
  crop_disease_status: string | null
  notes: string | null
  /** ISO yyyy-mm-dd desde columna `date` en Postgres */
  sowing_date: string | null
  created_at: string
  updated_at: string
  group: number
  /** jsonb: [[lon, lat], ...] contorno guardado en BD */
  polygon?: unknown | null
  /** GeoJSON Polygon (type + coordinates); columna en BD: "geoJSON" */
  geoJSON?: unknown | null
}

type DbPlotWithFarm = DbPlot & {
  farms?: { id: string; name: string } | { id: string; name: string }[] | null
}

export interface DbFarm {
  id: string
  user_id: string
  name: string
  description: string | null
  location_name: string | null
  size_ha: number | null
  timezone: string | null
  currency: string | null
  created_at: string
  updated_at: string
}

/** Fila en plot_previous_yields: position 1 = cosecha más reciente. */
export interface DbPlotPreviousYield {
  position: number
  yield_value: number
  yield_unit: "kg_ha" | "tn_ha"
}

// ──────────────────────────────────────────────
// Frontend-facing types (mapped from DB rows)
// ──────────────────────────────────────────────

/** Contorno [longitud, latitud] desde columna `polygon` o aproximado por centroide. */
export type LotPolygon = [number, number][]

export interface Lot {
  id: string
  farmId: string
  farmName: string
  plotGroup: number
  name: string
  crop: string
  area: number
  status: "Sembrado" | "Crecimiento" | "Cosechado" | "Barbecho"
  ndvi: number
  /** Predicción ML desde `plot_prediction.ml_predicted_kg_ha` (kg/ha). */
  mlPredictedKgHa: number | null
  lastUpdated: string
  polygon?: LotPolygon
  /** true si no hay `polygon` en BD y se usó cuadrado por ubicación + superficie (lotes viejos). */
  polygonApproximated?: boolean
}

export interface UserProfile {
  name: string
  email: string
  plan: UserPlan
  createdAt: string
}

export interface UserUsage {
  farms: number
  plots: number
  hectares: number
}

export interface FarmSettings {
  id: string
  name: string
  size: number
  location: string
  timezone: string
  currency: string
}

/** Rendimiento agregado por cultivo (t/ha), p. ej. vista Rendimientos. */
export interface YieldByCrop {
  crop: string
  actual: number | null
  prediction: number | null
}

export interface SoilMetric {
  id: string
  title: string
  value: string
  unit: string
  status: "Óptimo" | "Normal" | "Alto" | "Ideal" | "Moderado" | "Bajo"
  description: string
  trend: string
}

export interface PlotPredictionHistoryPoint {
  id: string
  plotId: string
  createdAt: string
  predictedKgHa: number
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const METERS_PER_DEG_LAT = 111_320

function metersToLatDelta(m: number): number {
  return m / METERS_PER_DEG_LAT
}

function metersToLonDelta(m: number, latDeg: number): number {
  const cos = Math.cos((latDeg * Math.PI) / 180)
  const denom = METERS_PER_DEG_LAT * (Math.abs(cos) < 1e-6 ? 1e-6 : cos)
  return m / denom
}

/**
 * Cuadrado alineado N-S / E-O en torno a `latitude`/`longitude`.
 * Lado ≈ √área si hay `area_ha`; si no, ~90 m de lado (solo referencia visual en mapa).
 */
function parsePlotPolygon(raw: unknown): LotPolygon | undefined {
  if (!Array.isArray(raw) || raw.length < 3) return undefined
  const out: LotPolygon = []
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) return undefined
    const lon = Number(item[0])
    const lat = Number(item[1])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined
    out.push([lon, lat])
  }
  return out
}

function lotPolygonFromCentroidAndArea(
  lat: number,
  lon: number,
  areaHa: number | null,
): LotPolygon {
  const areaM2 =
    areaHa != null && Number.isFinite(areaHa) && areaHa > 0 ? areaHa * 10_000 : 0
  const sideM = areaM2 > 0 ? Math.sqrt(areaM2) : 0
  let halfSideM = sideM > 0 ? sideM / 2 : 45
  halfSideM = Math.min(400, Math.max(20, halfSideM))
  const dLat = metersToLatDelta(halfSideM)
  const dLon = metersToLonDelta(halfSideM, lat)
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
  ]
}

function mapPlotToLot(plot: DbPlotWithFarm): Lot {
  const farmEmbed = plot.farms
  const farmRow = Array.isArray(farmEmbed) ? farmEmbed[0] : farmEmbed
  const lat =
    plot.latitude != null && Number.isFinite(Number(plot.latitude))
      ? Number(plot.latitude)
      : null
  const lon =
    plot.longitude != null && Number.isFinite(Number(plot.longitude))
      ? Number(plot.longitude)
      : null
  const stored = parsePlotPolygon(plot.polygon)
  let polygon: LotPolygon | undefined
  let polygonApproximated = false
  if (stored && stored.length >= 3) {
    polygon = stored
  } else if (lat != null && lon != null) {
    polygon = lotPolygonFromCentroidAndArea(lat, lon, plot.area_ha)
    polygonApproximated = true
  }
  return {
    id: plot.id,
    farmId: plot.farm_id,
    farmName: farmRow?.name ?? "",
    plotGroup: Number.isFinite(plot.group) ? plot.group : 1,
    name: plot.name,
    crop: plot.crop_type ?? "Sin cultivo",
    area: Number(plot.area_ha) || 0,
    status: plot.status,
    ndvi: Number(plot.ndvi_index) || 0,
    mlPredictedKgHa: null,
    lastUpdated: plot.updated_at,
    ...(polygon
      ? {
          polygon,
          ...(polygonApproximated ? { polygonApproximated: true } : {}),
        }
      : {}),
  }
}

function soilStatus(
  value: number,
  min: number,
  max: number,
): "Óptimo" | "Normal" | "Alto" | "Bajo" {
  if (value < min) return "Bajo"
  if (value > max) return "Alto"
  return "Óptimo"
}

const PREFERRED_CROP_ORDER = ["Soja", "Maíz", "Trigo", "Girasol"] as const

function yieldToTnHa(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  if (unit === "tn_ha") return value
  if (unit === "kg_ha") return value / 1000
  return null
}

/** H = sum((1/p) * y_p) / sum(1/p); p más alto = más antiguo, menos peso. */
function weightedHistoricalTnHa(
  rows: DbPlotPreviousYield[],
): number | null {
  let sumWY = 0
  let sumW = 0
  for (const r of rows) {
    const p = r.position
    if (p < 1 || p > 10) continue
    const y = yieldToTnHa(Number(r.yield_value), r.yield_unit)
    if (y == null) continue
    const w = 1 / p
    sumWY += w * y
    sumW += w
  }
  if (sumW === 0) return null
  return sumWY / sumW
}

function lastHarvestTnHa(rows: DbPlotPreviousYield[]): number | null {
  const row = rows.find((r) => r.position === 1)
  if (!row) return null
  return yieldToTnHa(Number(row.yield_value), row.yield_unit)
}

function blendMlAndHistorical(
  mlTnHa: number | null,
  historicalHTnHa: number | null,
): number | null {
  const hasMl = mlTnHa != null && Number.isFinite(mlTnHa)
  const hasH =
    historicalHTnHa != null && Number.isFinite(historicalHTnHa)
  if (hasMl && hasH) return 0.7 * mlTnHa! + 0.3 * historicalHTnHa!
  if (hasMl) return mlTnHa!
  if (hasH) return historicalHTnHa!
  return null
}

/** Valida `ml_predicted_kg_ha` desde la fila de `plot_prediction`. */
function parseMlPredictedKgHa(raw: unknown): number | null {
  if (raw == null) return null
  const v = Number(raw)
  return Number.isFinite(v) && v >= 0 ? v : null
}

async function fetchMlPredictedKgHaByPlotIds(
  supabase: SupabaseClient,
  plotIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>()
  if (plotIds.length === 0) return map

  const { data, error } = await supabase
    .from("plot_prediction")
    .select("plot_id, ml_predicted_kg_ha, created_at")
    .in("plot_id", plotIds)
    .order("created_at", { ascending: false })

  if (error) throw error
  for (const row of data ?? []) {
    const id = (row as { plot_id: string }).plot_id
    if (map.has(id)) continue
    const kg = parseMlPredictedKgHa(
      (row as { ml_predicted_kg_ha: unknown }).ml_predicted_kg_ha,
    )
    map.set(id, kg)
  }
  return map
}

export async function getPlotPredictionHistory(
  plotId: string,
): Promise<PlotPredictionHistoryPoint[]> {
  if (!plotId) return []

  const supabase = createClient()
  const { data, error } = await supabase
    .from("plot_prediction")
    .select("id, plot_id, ml_predicted_kg_ha, created_at")
    .eq("plot_id", plotId)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const history: PlotPredictionHistoryPoint[] = []
  for (const row of data ?? []) {
    const predictedKgHa = parseMlPredictedKgHa(
      (row as { ml_predicted_kg_ha: unknown }).ml_predicted_kg_ha,
    )
    if (predictedKgHa == null) continue

    history.push({
      id: String((row as { id: string }).id),
      plotId: String((row as { plot_id: string }).plot_id),
      createdAt: String((row as { created_at: string }).created_at),
      predictedKgHa,
    })
  }

  return history
}

function sortCropLabels(crops: string[]): string[] {
  const remaining = new Set(crops)
  const ordered: string[] = []
  for (const c of PREFERRED_CROP_ORDER) {
    if (remaining.has(c)) {
      ordered.push(c)
      remaining.delete(c)
    }
  }
  const rest = [...remaining].sort((a, b) => a.localeCompare(b, "es"))
  return [...ordered, ...rest]
}

// ──────────────────────────────────────────────
// LOTS
// ──────────────────────────────────────────────

/** IDs de granjas del usuario autenticado (RLS en farms ya filtra; esto asegura el alcance en el cliente). */
async function getUserFarmIds(
  supabase: SupabaseClient,
): Promise<string[] | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data, error } = await supabase
    .from("farms")
    .select("id")
    .eq("user_id", user.id)

  if (error) throw error
  return (data ?? []).map((row: { id: string }) => row.id)
}

/** IDs de `farms` para consultas: un campo concreto (si pertenece al usuario) o todos. */
async function getFarmIdsForScope(
  supabase: SupabaseClient,
  farmId?: string,
): Promise<string[]> {
  const farmIds = await getUserFarmIds(supabase)
  if (!farmIds || farmIds.length === 0) return []
  if (farmId != null && farmId !== "") {
    return farmIds.includes(farmId) ? [farmId] : []
  }
  return farmIds
}

export interface FarmScopeOptions {
  /** Si se pasa, solo datos de este campo (debe ser del usuario). */
  farmId?: string
}

export async function fetchLots(options?: FarmScopeOptions): Promise<Lot[]> {
  const supabase = createClient()
  const farmIds = await getFarmIdsForScope(supabase, options?.farmId)
  if (farmIds.length === 0) return []

  const { data, error } = await supabase
    .from("plots")
    .select("*, farms(name)")
    .in("farm_id", farmIds)
    .order("created_at", { ascending: false })

  if (error) throw error
  const lots = (data ?? []).map((row) => mapPlotToLot(row as DbPlotWithFarm))
  const pred = await fetchMlPredictedKgHaByPlotIds(
    supabase,
    lots.map((l) => l.id),
  )
  return lots.map((l) => ({
    ...l,
    mlPredictedKgHa: pred.get(l.id) ?? null,
  }))
}

export async function getLotById(id: string): Promise<Lot | null> {
  const supabase = createClient()
  const farmIds = await getUserFarmIds(supabase)
  if (!farmIds || farmIds.length === 0) return null

  const { data, error } = await supabase
    .from("plots")
    .select("*, farms(name)")
    .eq("id", id)
    .in("farm_id", farmIds)
    .maybeSingle()

  if (error || !data) return null
  const lot = mapPlotToLot(data as DbPlotWithFarm)
  const pred = await fetchMlPredictedKgHaByPlotIds(supabase, [id])
  return { ...lot, mlPredictedKgHa: pred.get(id) ?? null }
}

/** Fila completa de `plots` solo si el lote pertenece a una granja del usuario. */
export async function getPlotRow(id: string): Promise<DbPlot | null> {
  const supabase = createClient()
  const farmIds = await getUserFarmIds(supabase)
  if (!farmIds || farmIds.length === 0) return null

  const { data, error } = await supabase
    .from("plots")
    .select("*")
    .eq("id", id)
    .in("farm_id", farmIds)
    .maybeSingle()

  if (error || !data) return null
  return data as DbPlot
}

export interface UpdatePlotInput {
  name?: string
  crop_type?: string | null
  area_ha?: number | null
  status?: DbPlot["status"]
  description?: string | null
  notes?: string | null
  group?: number
  sowing_date?: string | null
  soil_ph?: number | null
  irrigation_type?: string | null
  fertilizer_type?: string | null
  pesticide_usage_ml?: number | null
  crop_disease_status?: string | null
  sunlight_hours?: number | null
}

export async function updatePlot(
  id: string,
  updates: UpdatePlotInput,
): Promise<DbPlot> {
  const supabase = createClient()
  const farmIds = await getUserFarmIds(supabase)
  if (!farmIds || farmIds.length === 0) throw new Error("No autenticado")

  const patch: Record<string, unknown> = {}
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.crop_type !== undefined) patch.crop_type = updates.crop_type
  if (updates.area_ha !== undefined) patch.area_ha = updates.area_ha
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.description !== undefined) patch.description = updates.description
  if (updates.notes !== undefined) patch.notes = updates.notes
  if (updates.group !== undefined) patch.group = updates.group
  if (updates.sowing_date !== undefined) patch.sowing_date = updates.sowing_date
  if (updates.soil_ph !== undefined) patch.soil_ph = updates.soil_ph
  if (updates.irrigation_type !== undefined) {
    patch.irrigation_type = updates.irrigation_type
  }
  if (updates.fertilizer_type !== undefined) {
    patch.fertilizer_type = updates.fertilizer_type
  }
  if (updates.pesticide_usage_ml !== undefined) {
    patch.pesticide_usage_ml = updates.pesticide_usage_ml
  }
  if (updates.crop_disease_status !== undefined) {
    patch.crop_disease_status = updates.crop_disease_status
  }
  if (updates.sunlight_hours !== undefined) {
    patch.sunlight_hours = updates.sunlight_hours
  }

  if (Object.keys(patch).length === 0) {
    const row = await getPlotRow(id)
    if (!row) throw new Error("Lote no encontrado")
    return row
  }

  const runUpdate = (values: Record<string, unknown>) =>
    supabase
      .from("plots")
      .update(values)
      .eq("id", id)
      .in("farm_id", farmIds)
      .select()
      .single()

  let { data, error } = await runUpdate(patch)
  if (error && isMissingGroupColumnError(error)) {
    ;({ data, error } = await runUpdate(withoutGroup(patch)))
  }

  if (error) throw error
  if (!data) throw new Error("Lote no encontrado")
  return data as DbPlot
}

export interface CreatePlotInput {
  farm_id: string
  name: string
  group: number
  crop_type?: string
  area_ha?: number
  status?: string
  latitude?: number
  longitude?: number
  /** Vértices [lon, lat]; se guardan en `plots.polygon` (jsonb). */
  polygon?: LotPolygon
  description?: string
  soil_ph?: number
  irrigation_type?: string
  fertilizer_type?: string
  pesticide_usage_ml?: number
  crop_disease_status?: string
  /** yyyy-mm-dd (input type=date) */
  sowing_date?: string
}

export interface CreatePlotWithEnrichmentResult {
  plot: DbPlot
  enrichment: {
    dateFrom: string | null
    dateTo: string | null
    appliedFields: string[]
    warnings: string[]
  }
  /** Rinde estimado guardado en `plot_prediction`, o por qué no se pudo calcular. */
  prediction?: { predictedKgHa: number | null; reason?: string }
}

function roundGeographicCoord(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

/**
 * Convierte vértices [lon, lat] (como en el mapa del form) a GeoJSON Polygon RFC 7946.
 * Cierra el anillo exterior si hace falta; misma precisión que lat/lon del insert.
 */
function lotPolygonToGeoJsonPolygon(
  parsed: LotPolygon,
): { type: "Polygon"; coordinates: number[][][] } | null {
  if (parsed.length < 3) return null
  const ring = parsed.map(([lon, lat]) => [
    roundGeographicCoord(lon, 6),
    roundGeographicCoord(lat, 6),
  ])
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed =
    first[0] === last[0] && first[1] === last[1]
      ? ring
      : [...ring, [first[0], first[1]]]
  return {
    type: "Polygon",
    coordinates: [closed],
  }
}

export async function createPlot(input: CreatePlotInput): Promise<DbPlot> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("No autenticado")

  await ensureUserProfile(supabase, user)
  await checkPlanLimit(supabase, user.id, "plot")

  const row: {
    farm_id: string
    name: string
    group: number
    status: string
    crop_type?: string
    description?: string | null
    area_ha?: number
    latitude?: number
    longitude?: number
    polygon?: LotPolygon
    geoJSON?: { type: "Polygon"; coordinates: number[][][] }
    soil_ph?: number
    irrigation_type?: string
    fertilizer_type?: string
    pesticide_usage_ml?: number
    crop_disease_status?: string
    sowing_date?: string
    sunlight_hours?: number
  } = {
    farm_id: input.farm_id,
    name: input.name,
    group: input.group,
    status: input.status ?? "Sembrado",
    sunlight_hours: DEFAULT_SUNLIGHT_HOURS,
  }

  if (input.crop_type) row.crop_type = input.crop_type
  if (input.description) row.description = input.description
  if (
    input.area_ha != null &&
    Number.isFinite(input.area_ha) &&
    input.area_ha > 0
  ) {
    row.area_ha = input.area_ha
  }
  if (input.latitude != null && Number.isFinite(input.latitude)) {
    row.latitude = roundGeographicCoord(input.latitude, 6)
  }
  if (input.longitude != null && Number.isFinite(input.longitude)) {
    row.longitude = roundGeographicCoord(input.longitude, 6)
  }
  if (input.polygon && input.polygon.length >= 3) {
    const parsed = parsePlotPolygon(input.polygon)
    if (parsed) {
      row.polygon = parsed
      const gj = lotPolygonToGeoJsonPolygon(parsed)
      if (gj) row.geoJSON = gj
    }
  }
  if (input.soil_ph != null && Number.isFinite(input.soil_ph)) {
    row.soil_ph = input.soil_ph
  }
  if (input.irrigation_type) row.irrigation_type = input.irrigation_type
  if (input.fertilizer_type) row.fertilizer_type = input.fertilizer_type
  if (input.pesticide_usage_ml != null && Number.isFinite(input.pesticide_usage_ml)) {
    row.pesticide_usage_ml = input.pesticide_usage_ml
  }
  if (input.crop_disease_status) row.crop_disease_status = input.crop_disease_status
  const sd = input.sowing_date?.trim()
  if (sd) row.sowing_date = sd

  const { data: ownedFarm, error: farmCheckErr } = await supabase
    .from("farms")
    .select("id")
    .eq("id", input.farm_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (farmCheckErr) throw new Error(farmCheckErr.message)
  if (!ownedFarm) {
    throw new Error("La granja no existe o no pertenece a tu cuenta")
  }

  let { data, error } = await supabase
    .from("plots")
    .insert(row)
    .select()
    .single()
  if (error && isMissingGroupColumnError(error)) {
    ;({ data, error } = await supabase
      .from("plots")
      .insert(withoutGroup(row))
      .select()
      .single())
  }

  if (error) throw error
  return data
}

export async function createPlotWithEnrichment(
  input: CreatePlotInput,
): Promise<CreatePlotWithEnrichmentResult> {
  const response = await fetch("/api/plots/enriched", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  const raw = await response.text()
  const parsed = tryParseJson(raw)

  if (!response.ok) {
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof parsed.error === "string"
    ) {
      throw new Error(parsed.error)
    }
    throw new Error("No se pudo crear el lote")
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("plot" in parsed) ||
    !("enrichment" in parsed)
  ) {
    throw new Error("La respuesta del servidor fue invalida")
  }

  return parsed as CreatePlotWithEnrichmentResult
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function deletePlot(id: string): Promise<void> {
  const supabase = createClient()
  const farmIds = await getUserFarmIds(supabase)
  if (!farmIds || farmIds.length === 0) throw new Error("No autenticado")

  const { error } = await supabase
    .from("plots")
    .delete()
    .eq("id", id)
    .in("farm_id", farmIds)

  if (error) throw error
}

// ──────────────────────────────────────────────
// USER PROFILE
// ──────────────────────────────────────────────

export async function getUserProfile(): Promise<UserProfile> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("No autenticado")

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (error) throw error
  return {
    name: data.name ?? "",
    email: data.email ?? user.email ?? "",
    plan: (data.plan as UserPlan) ?? DEFAULT_USER_PLAN,
    createdAt: data.created_at ?? new Date().toISOString(),
  }
}

export async function updateProfile(updates: {
  name?: string
  email?: string
}): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("No autenticado")

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)

  if (error) throw error
}

// ──────────────────────────────────────────────
// USAGE & PLAN LIMITS
// ──────────────────────────────────────────────

export async function getUserUsage(): Promise<UserUsage> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("No autenticado")

  const { data: farms, error: farmsErr } = await supabase
    .from("farms")
    .select("id")
    .eq("user_id", user.id)

  if (farmsErr) throw new Error(farmsErr.message)

  const farmIds = (farms ?? []).map((f) => f.id)
  if (farmIds.length === 0) {
    return { farms: 0, plots: 0, hectares: 0 }
  }

  const { data: plots, error: plotsErr } = await supabase
    .from("plots")
    .select("area_ha")
    .in("farm_id", farmIds)

  if (plotsErr) throw new Error(plotsErr.message)

  const hectares = (plots ?? []).reduce(
    (sum, p) => sum + (Number(p.area_ha) || 0),
    0,
  )

  return {
    farms: farmIds.length,
    plots: (plots ?? []).length,
    hectares,
  }
}

async function checkPlanLimit(
  supabase: SupabaseClient,
  userId: string,
  action: "farm" | "plot",
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single()

  const plan: UserPlan = (profile?.plan as UserPlan) ?? DEFAULT_USER_PLAN
  const limits = getPlanLimits(plan)

  const { data: farms } = await supabase
    .from("farms")
    .select("id")
    .eq("user_id", userId)

  const farmIds = (farms ?? []).map((f) => f.id)

  if (action === "farm") {
    if (farmIds.length >= limits.maxFarms) {
      throw new Error(
        `Tu plan ${limits.label} permite un máximo de ${limits.maxFarms} granja(s). Mejorá tu plan para continuar.`,
      )
    }
    return
  }

  if (farmIds.length === 0) return

  const { data: plots } = await supabase
    .from("plots")
    .select("area_ha")
    .in("farm_id", farmIds)

  const plotCount = (plots ?? []).length
  if (plotCount >= limits.maxPlots) {
    throw new Error(
      `Tu plan ${limits.label} permite un máximo de ${Number.isFinite(limits.maxPlots) ? limits.maxPlots : "ilimitados"} lotes. Mejorá tu plan para continuar.`,
    )
  }

  const totalHa = (plots ?? []).reduce(
    (sum, p) => sum + (Number(p.area_ha) || 0),
    0,
  )
  if (totalHa >= limits.maxHectares) {
    throw new Error(
      `Tu plan ${limits.label} permite un máximo de ${limits.maxHectares} hectáreas totales. Mejorá tu plan para continuar.`,
    )
  }
}

// ──────────────────────────────────────────────
// FARM
// ──────────────────────────────────────────────

export async function fetchUserFarms(): Promise<DbFarm[]> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return []

  const { data, error } = await supabase
    .from("farms")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true })

  if (error) throw error
  return (data ?? []) as DbFarm[]
}

/** Campo del usuario por id, o null si no existe o no es tuyo. */
export async function getFarmById(farmId: string): Promise<DbFarm | null> {
  const supabase = createClient()
  const allowed = await getFarmIdsForScope(supabase, farmId)
  if (allowed.length !== 1) return null

  const { data, error } = await supabase
    .from("farms")
    .select("*")
    .eq("id", farmId)
    .maybeSingle()

  if (error || !data) return null
  return data as DbFarm
}

/** Suma `plots.area_ha` del campo (hectáreas), redondeada a 2 decimales. */
async function sumPlotAreaHaForFarm(farmId: string): Promise<number> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("plots")
    .select("area_ha")
    .eq("farm_id", farmId)

  if (error) throw new Error(error.message)

  const raw = (data ?? []).reduce(
    (sum, p) => sum + (Number(p.area_ha) || 0),
    0,
  )
  return Math.round(raw * 100) / 100
}

export async function getFarmSettingsForFarm(
  farmId: string,
): Promise<FarmSettings | null> {
  const farm = await getFarmById(farmId)
  if (!farm) return null
  const size = await sumPlotAreaHaForFarm(farmId)
  return {
    id: farm.id,
    name: farm.name,
    size,
    location: farm.location_name ?? "",
    timezone: farm.timezone ?? "america-buenos-aires",
    currency: farm.currency ?? "ars",
  }
}

export async function getUserFarm(): Promise<DbFarm | null> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data, error } = await supabase
    .from("farms")
    .select("*")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data
}

export async function getFarmSettings(): Promise<FarmSettings | null> {
  const farm = await getUserFarm()
  if (!farm) return null
  const size = await sumPlotAreaHaForFarm(farm.id)
  return {
    id: farm.id,
    name: farm.name,
    size,
    location: farm.location_name ?? "",
    timezone: farm.timezone ?? "america-buenos-aires",
    currency: farm.currency ?? "ars",
  }
}

export interface CreateFarmInput {
  name: string
  description?: string
  location_name?: string
  size_ha?: number
}

export async function createFarm(input: CreateFarmInput): Promise<DbFarm> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new Error("No autenticado")

  await ensureUserProfile(supabase, user)
  await checkPlanLimit(supabase, user.id, "farm")

  // Solo columnas de la migración base (001). Incluir size_ha en el INSERT rompe
  // con 400 si en Supabase remoto no corriste 202603280002 (columna inexistente).
  const row: {
    user_id: string
    name: string
    description?: string | null
    location_name?: string | null
  } = {
    user_id: user.id,
    name: input.name,
  }
  if (input.description) row.description = input.description
  if (input.location_name) row.location_name = input.location_name

  const { data, error } = await supabase.from("farms").insert(row).select().single()

  if (error) throw new Error(error.message)

  if (input.size_ha != null && !Number.isNaN(input.size_ha) && input.size_ha > 0) {
    const { error: sizeErr } = await supabase
      .from("farms")
      .update({ size_ha: input.size_ha })
      .eq("id", data.id)
    // Sin migración 002: ignorar fallo por columna ausente
    if (
      sizeErr &&
      !/size_ha|column|schema cache/i.test(sizeErr.message)
    ) {
      throw new Error(sizeErr.message)
    }
  }

  return data
}

export async function updateFarm(
  farmId: string,
  updates: {
    name?: string
    location_name?: string
    size_ha?: number
    timezone?: string
    currency?: string
  },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from("farms")
    .update(updates)
    .eq("id", farmId)

  if (error) throw error
}

// ──────────────────────────────────────────────
// YIELD BY CROP (plots + plot_previous_yields + plot_prediction)
// ──────────────────────────────────────────────

export async function getYieldComparisonByCrop(
  options?: FarmScopeOptions,
): Promise<YieldByCrop[]> {
  const supabase = createClient()
  const farmIds = await getFarmIdsForScope(supabase, options?.farmId)
  if (farmIds.length === 0) return []

  // `plot_prediction` se consulta aparte: el embed desde plots puede fallar si PostgREST no tiene la relación inversa.
  const { data: plots, error } = await supabase
    .from("plots")
    .select(
      `
    id,
    crop_type,
    area_ha,
    plot_previous_yields ( position, yield_value, yield_unit )
  `,
    )
    .in("farm_id", farmIds)

  if (error) throw new Error(error.message)

  type PlotRow = {
    id: string
    crop_type: string | null
    area_ha: number | null
    plot_previous_yields: DbPlotPreviousYield[] | null
  }

  const rows = (plots ?? []) as PlotRow[]

  /** Rendimiento ML en t/ha (histórico ya está en t/ha vía yield_unit). */
  const predMlTnHaByPlotId = new Map<string, number | null>()
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id)
    let predKg = new Map<string, number | null>()
    try {
      predKg = await fetchMlPredictedKgHaByPlotIds(supabase, ids)
    } catch {
      // Tabla o columna ausente: seguir solo con histórico
    }
    for (const id of ids) {
      const kg = predKg.get(id) ?? null
      predMlTnHaByPlotId.set(id, kg == null ? null : kg / 1000)
    }
  }

  const byCrop = new Map<
    string,
    { actualNum: number; actualDen: number; predNum: number; predDen: number }
  >()

  for (const plot of rows) {
    const crop = plot.crop_type?.trim()
    if (!crop) continue

    const area = Number(plot.area_ha)
    const weight = Number.isFinite(area) && area > 0 ? area : 1

    const prevRows = plot.plot_previous_yields ?? []
    const H = weightedHistoricalTnHa(prevRows)
    const actualOne = lastHarvestTnHa(prevRows)
    const ml = predMlTnHaByPlotId.get(plot.id) ?? null
    const prediction = blendMlAndHistorical(ml, H)

    let acc = byCrop.get(crop)
    if (!acc) {
      acc = { actualNum: 0, actualDen: 0, predNum: 0, predDen: 0 }
      byCrop.set(crop, acc)
    }
    if (actualOne != null) {
      acc.actualNum += actualOne * weight
      acc.actualDen += weight
    }
    if (prediction != null) {
      acc.predNum += prediction * weight
      acc.predDen += weight
    }
  }

  const labels = sortCropLabels([...byCrop.keys()])
  return labels.map((crop) => {
    const acc = byCrop.get(crop)!
    return {
      crop,
      actual: acc.actualDen > 0 ? acc.actualNum / acc.actualDen : null,
      prediction: acc.predDen > 0 ? acc.predNum / acc.predDen : null,
    }
  })
}

// ──────────────────────────────────────────────
// SOIL METRICS (read from a specific plot row)
// ──────────────────────────────────────────────

export async function getSoilMetrics(plotId: string): Promise<SoilMetric[]> {
  const supabase = createClient()
  const farmIds = await getUserFarmIds(supabase)
  if (!farmIds || farmIds.length === 0) return []

  const { data, error } = await supabase
    .from("plots")
    .select(
      "soil_ph, soil_moisture_percent, temperature_c, rainfall_mm, humidity_percent, ndvi_index",
    )
    .eq("id", plotId)
    .in("farm_id", farmIds)
    .maybeSingle()

  if (error || !data) return []

  const metrics: SoilMetric[] = []

  if (data.soil_ph != null) {
    metrics.push({
      id: "ph",
      title: "pH del Suelo",
      value: String(data.soil_ph),
      unit: "",
      status: soilStatus(Number(data.soil_ph), 6.0, 7.5),
      description: "Rango ideal: 6.0 - 7.5",
      trend: "",
    })
  }

  if (data.soil_moisture_percent != null) {
    metrics.push({
      id: "moisture",
      title: "Humedad del Suelo",
      value: String(data.soil_moisture_percent),
      unit: "%",
      status: soilStatus(Number(data.soil_moisture_percent), 30, 60),
      description: "Capacidad de campo",
      trend: "",
    })
  }

  if (data.temperature_c != null) {
    metrics.push({
      id: "temp",
      title: "Temperatura Suelo",
      value: String(data.temperature_c),
      unit: "°C",
      status: soilStatus(Number(data.temperature_c), 15, 30),
      description: "A 10cm de profundidad",
      trend: "",
    })
  }

  if (data.humidity_percent != null) {
    metrics.push({
      id: "humidity",
      title: "Humedad Ambiente",
      value: String(data.humidity_percent),
      unit: "%",
      status: soilStatus(Number(data.humidity_percent), 40, 70),
      description: "Humedad relativa del aire",
      trend: "",
    })
  }

  if (data.rainfall_mm != null) {
    metrics.push({
      id: "rainfall",
      title: "Precipitaciones",
      value: String(data.rainfall_mm),
      unit: "mm",
      status: "Normal",
      description: "Acumulado del período",
      trend: "",
    })
  }

  if (data.ndvi_index != null) {
    metrics.push({
      id: "ndvi",
      title: "NDVI",
      value: String(data.ndvi_index),
      unit: "",
      status: soilStatus(Number(data.ndvi_index), 0.4, 1.0),
      description: "Índice de vegetación normalizado",
      trend: "",
    })
  }

  return metrics
}

// ──────────────────────────────────────────────
// LOGS (tabla public.logs — campos numéricos para ML / histórico)
// ──────────────────────────────────────────────

/** Fila para `public.logs` al cosechar (snapshot del plot + datos ingresados). */
function buildLogsRowFromHarvest(
  plot: DbPlot,
  harvestDate: string,
  yieldKgPerHa: number,
): Record<string, unknown> {
  return {
    plot_id: plot.id,
    crop_type: encodeCrop(plot.crop_type),
    soil_moisture:
      plot.soil_moisture_percent != null ? Number(plot.soil_moisture_percent) : 0,
    soil_ph: plot.soil_ph != null ? Number(plot.soil_ph) : 0,
    temperature_c: plot.temperature_c != null ? Number(plot.temperature_c) : 0,
    rainfall_mm: plot.rainfall_mm != null ? Number(plot.rainfall_mm) : 0,
    humidity_percent:
      plot.humidity_percent != null ? Number(plot.humidity_percent) : 0,
    sunlight_hours: DEFAULT_SUNLIGHT_HOURS,
    irrigation_type: encodeIrrigation(plot.irrigation_type),
    fertilizer_type: encodeFertilizer(plot.fertilizer_type),
    pesticide_usage_ml:
      plot.pesticide_usage_ml != null ? Number(plot.pesticide_usage_ml) : 0,
    sowing_date: plot.sowing_date,
    harvest_date: harvestDate,
    yield_kg_per_hectare: yieldKgPerHa,
    ndvi_index: plot.ndvi_index != null ? Number(plot.ndvi_index) : 0.1,
    crop_disease_status: encodeDisease(plot.crop_disease_status),
  }
}

export interface StartPlotNewCycleInput {
  crop_type: string
  sowing_date: string
  soil_ph?: number | null
  irrigation_type?: string | null
  fertilizer_type?: string | null
  pesticide_usage_ml?: number | null
  crop_disease_status?: string | null
}

/** Lote en Barbecho: nuevo cultivo y siembra; pasa a Sembrado. */
export async function startPlotNewCycle(
  plotId: string,
  input: StartPlotNewCycleInput,
): Promise<DbPlot> {
  const plot = await getPlotRow(plotId)
  if (!plot) throw new Error("Lote no encontrado")
  if (plot.status !== "Barbecho") {
    throw new Error(
      "Solo podés iniciar un nuevo ciclo cuando el lote está en Barbecho",
    )
  }
  const crop = input.crop_type.trim()
  if (!crop) throw new Error("Elegí un cultivo")
  const sd = input.sowing_date.trim()
  if (!sd) throw new Error("La fecha de siembra es obligatoria")

  const ph =
    input.soil_ph != null && Number.isFinite(input.soil_ph)
      ? input.soil_ph
      : null
  const pest =
    input.pesticide_usage_ml != null && Number.isFinite(input.pesticide_usage_ml)
      ? input.pesticide_usage_ml
      : null

  const updated = await updatePlot(plotId, {
    crop_type: crop,
    sowing_date: sd,
    status: "Sembrado",
    soil_ph: ph,
    irrigation_type: input.irrigation_type?.trim() || null,
    fertilizer_type: input.fertilizer_type?.trim() || null,
    pesticide_usage_ml: pest,
    crop_disease_status: input.crop_disease_status?.trim() || null,
    sunlight_hours: DEFAULT_SUNLIGHT_HOURS,
  })
  // Cultivo nuevo = rinde nuevo. Si no hay modelo todavía, el ciclo arranca igual.
  await requestPlotPrediction(plotId).catch(() => null)
  return updated
}

/**
 * Pide al servidor que recalcule y guarde la predicción de rinde del lote.
 * Devuelve los kg/ha estimados, o `null` si no se pudo (sin modelo entrenado, sin cultivo...).
 */
export async function requestPlotPrediction(plotId: string): Promise<number | null> {
  const response = await fetch(`/api/plots/${encodeURIComponent(plotId)}/prediction`, {
    method: "POST",
  })
  const parsed = tryParseJson(await response.text()) as { predictedKgHa?: unknown } | null
  return typeof parsed?.predictedKgHa === "number" ? parsed.predictedKgHa : null
}

// ──────────────────────────────────────────────
// HARVEST LOGS
// ──────────────────────────────────────────────

export interface HarvestLog {
  id: string
  plot_id: string
  farm_id: string
  plot_name: string
  crop_type: string | null
  area_ha: number | null
  sowing_date: string | null
  harvest_date: string
  yield_kg_per_hectare: number
  soil_moisture_percent: number | null
  soil_ph: number | null
  temperature_c: number | null
  rainfall_mm: number | null
  humidity_percent: number | null
  sunlight_hours: number | null
  ndvi_index: number | null
  irrigation_type: string | null
  fertilizer_type: string | null
  pesticide_usage_ml: number | null
  crop_disease_status: string | null
  notes: string | null
  created_at: string
}

export interface HarvestPlotInput {
  harvest_date: string
  yield_kg_per_hectare: number
}

export async function harvestPlot(
  plotId: string,
  input: HarvestPlotInput,
): Promise<DbPlot> {
  const supabase = createClient()
  const farmIds = await getUserFarmIds(supabase)
  if (!farmIds || farmIds.length === 0) throw new Error("No autenticado")

  const plot = await getPlotRow(plotId)
  if (!plot) throw new Error("Lote no encontrado")

  const { error: logError } = await supabase.from("harvest_logs").insert({
    plot_id: plot.id,
    farm_id: plot.farm_id,
    plot_name: plot.name,
    crop_type: plot.crop_type,
    area_ha: plot.area_ha,
    sowing_date: plot.sowing_date,
    harvest_date: input.harvest_date,
    yield_kg_per_hectare: input.yield_kg_per_hectare,
    soil_moisture_percent: plot.soil_moisture_percent,
    soil_ph: plot.soil_ph,
    temperature_c: plot.temperature_c,
    rainfall_mm: plot.rainfall_mm,
    humidity_percent: plot.humidity_percent,
    sunlight_hours: DEFAULT_SUNLIGHT_HOURS,
    ndvi_index: plot.ndvi_index,
    irrigation_type: plot.irrigation_type,
    fertilizer_type: plot.fertilizer_type,
    pesticide_usage_ml: plot.pesticide_usage_ml,
    crop_disease_status: plot.crop_disease_status,
    notes: plot.notes,
  })

  if (logError) throw new Error(logError.message)

  const legacyLogRow = buildLogsRowFromHarvest(
    plot,
    input.harvest_date,
    input.yield_kg_per_hectare,
  )
  const { error: legacyLogError } = await supabase.from("logs").insert(legacyLogRow)
  if (legacyLogError) throw new Error(legacyLogError.message)

  const { data: updated, error: updateError } = await supabase
    .from("plots")
    .update({
      status: "Barbecho",
      crop_type: null,
      sowing_date: null,
      sunlight_hours: DEFAULT_SUNLIGHT_HOURS,
    })
    .eq("id", plotId)
    .in("farm_id", farmIds)
    .select()
    .single()

  if (updateError) throw new Error(updateError.message)
  return updated as DbPlot
}

export async function fetchHarvestLogs(
  options?: FarmScopeOptions,
): Promise<HarvestLog[]> {
  const supabase = createClient()
  const farmIds = await getFarmIdsForScope(supabase, options?.farmId)
  if (farmIds.length === 0) return []

  const { data, error } = await supabase
    .from("harvest_logs")
    .select("*")
    .in("farm_id", farmIds)
    .order("harvest_date", { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as HarvestLog[]
}
