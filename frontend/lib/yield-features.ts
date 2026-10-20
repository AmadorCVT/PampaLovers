/**
 * Variables del modelo de rinde y su codificación numérica.
 *
 * `public.logs` guarda los categóricos como números (ver `encode*`): esta misma codificación se usa
 * para escribir logs al cosechar, para entrenar y para predecir sobre `plots` (que guarda texto),
 * así que un lote y su cosecha siempre se traducen igual.
 */

export const LOG_CROP_CODES = [
  "Soja",
  "Maíz",
  "Trigo",
  "Girasol",
  "Sorgo",
  "Cebada",
  "Arroz",
  "Algodón",
] as const

const IRRIGATION_CODES: Record<string, number> = {
  drip: 1,
  sprinkle: 2,
  sprinkler: 2,
  manual: 3,
  none: 0,
}

const FERTILIZER_CODES: Record<string, number> = {
  organic: 1,
  inorganic: 2,
  mixed: 3,
  none: 0,
}

const DISEASE_CODES: Record<string, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
}

/** Minúsculas y sin tildes: "Maíz", "maiz" y "MAÍZ" son el mismo cultivo. */
function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

const CROP_CODE_BY_KEY = new Map<string, number>(
  LOG_CROP_CODES.map((crop, i) => [normalizeKey(crop), i + 1]),
)

/** 1–8 según `LOG_CROP_CODES`; 0 si no hay cultivo o no se reconoce. */
export function encodeCrop(crop: string | null | undefined): number {
  if (!crop?.trim()) return 0
  return CROP_CODE_BY_KEY.get(normalizeKey(crop)) ?? 0
}

export function encodeIrrigation(value: string | null | undefined): number {
  if (!value?.trim()) return 0
  return IRRIGATION_CODES[normalizeKey(value)] ?? 0
}

export function encodeFertilizer(value: string | null | undefined): number {
  if (!value?.trim()) return 0
  return FERTILIZER_CODES[normalizeKey(value)] ?? 0
}

export function encodeDisease(value: string | null | undefined): number {
  if (!value?.trim()) return 0
  return DISEASE_CODES[normalizeKey(value)] ?? 0
}

/** Variables numéricas, en el orden en que entran al modelo. */
export const NUMERIC_FEATURES = [
  "soil_moisture",
  "soil_ph",
  "temperature_c",
  "rainfall_mm",
  "humidity_percent",
  "sunlight_hours",
  "pesticide_usage_ml",
  "total_days",
  "ndvi_index",
] as const

export type NumericFeature = (typeof NUMERIC_FEATURES)[number]

/**
 * En `logs` un dato faltante se guarda como 0. Para estas variables un 0 no es un valor real
 * (pH 0, 0 mm en toda la campaña...), así que se trata como faltante y se imputa.
 */
const ZERO_MEANS_MISSING = new Set<NumericFeature>([
  "soil_moisture",
  "soil_ph",
  "temperature_c",
  "rainfall_mm",
  "humidity_percent",
  "sunlight_hours",
  "total_days",
])

/** Categóricos: código numérico (0 = sin dato) y cantidad de categorías para one-hot. */
export const CATEGORICAL_FEATURES = {
  crop: LOG_CROP_CODES.length,
  irrigation: 3,
  fertilizer: 3,
  disease: 3,
} as const

export type CategoricalFeature = keyof typeof CATEGORICAL_FEATURES

export interface YieldFeatures {
  categorical: Record<CategoricalFeature, number>
  /** `null` = faltante (se imputa con la media de entrenamiento). */
  numeric: Record<NumericFeature, number | null>
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function cleanNumeric(feature: NumericFeature, value: unknown): number | null {
  const n = toNumber(value)
  if (n === null) return null
  if (n === 0 && ZERO_MEANS_MISSING.has(feature)) return null
  return n
}

function daysBetween(from: unknown, to: unknown): number | null {
  if (typeof from !== "string" || typeof to !== "string") return null
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const days = Math.round((end - start) / 86_400_000)
  return days > 0 ? days : null
}

function toCode(value: unknown, max: number): number {
  const n = toNumber(value)
  return n !== null && Number.isInteger(n) && n >= 1 && n <= max ? n : 0
}

/** Fila de `public.logs` (categóricos ya numéricos; ciclo = siembra → cosecha). */
export function featuresFromLog(row: Record<string, unknown>): YieldFeatures {
  return {
    categorical: {
      crop: toCode(row.crop_type, CATEGORICAL_FEATURES.crop),
      irrigation: toCode(row.irrigation_type, CATEGORICAL_FEATURES.irrigation),
      fertilizer: toCode(row.fertilizer_type, CATEGORICAL_FEATURES.fertilizer),
      disease: toCode(row.crop_disease_status, CATEGORICAL_FEATURES.disease),
    },
    numeric: {
      soil_moisture: cleanNumeric("soil_moisture", row.soil_moisture),
      soil_ph: cleanNumeric("soil_ph", row.soil_ph),
      temperature_c: cleanNumeric("temperature_c", row.temperature_c),
      rainfall_mm: cleanNumeric("rainfall_mm", row.rainfall_mm),
      humidity_percent: cleanNumeric("humidity_percent", row.humidity_percent),
      sunlight_hours: cleanNumeric("sunlight_hours", row.sunlight_hours),
      pesticide_usage_ml: cleanNumeric("pesticide_usage_ml", row.pesticide_usage_ml),
      total_days: cleanNumeric(
        "total_days",
        row.total_days ?? daysBetween(row.sowing_date, row.harvest_date),
      ),
      ndvi_index: cleanNumeric("ndvi_index", row.ndvi_index),
    },
  }
}

/**
 * Fila de `public.plots` (categóricos en texto). La duración del ciclo todavía no se conoce
 * mientras el lote crece: si `total_days` no está cargado, el modelo usa la típica del cultivo.
 */
export function featuresFromPlot(plot: Record<string, unknown>): YieldFeatures {
  return {
    categorical: {
      crop: encodeCrop(plot.crop_type as string | null),
      irrigation: encodeIrrigation(plot.irrigation_type as string | null),
      fertilizer: encodeFertilizer(plot.fertilizer_type as string | null),
      disease: encodeDisease(plot.crop_disease_status as string | null),
    },
    numeric: {
      soil_moisture: cleanNumeric("soil_moisture", plot.soil_moisture_percent),
      soil_ph: cleanNumeric("soil_ph", plot.soil_ph),
      temperature_c: cleanNumeric("temperature_c", plot.temperature_c),
      rainfall_mm: cleanNumeric("rainfall_mm", plot.rainfall_mm),
      humidity_percent: cleanNumeric("humidity_percent", plot.humidity_percent),
      sunlight_hours: cleanNumeric("sunlight_hours", plot.sunlight_hours),
      pesticide_usage_ml: cleanNumeric("pesticide_usage_ml", plot.pesticide_usage_ml),
      total_days: cleanNumeric("total_days", plot.total_days),
      ndvi_index: cleanNumeric("ndvi_index", plot.ndvi_index),
    },
  }
}
