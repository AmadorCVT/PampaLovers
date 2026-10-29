/**
 * Modelo de rinde (kg/ha): red neuronal densa 27 → 32 → 16 → 1 con ReLU, entrenada con Adam.
 * Misma arquitectura que el backend Python original, pero en TypeScript puro para correr en las
 * API routes de Next (Vercel) sin TensorFlow. Agrega lo que al original le faltaba: one-hot de
 * categóricos, imputación + normalización de variables numéricas, validación y early stopping.
 *
 * El modelo entrenado es un JSON (`YieldModel`) que se guarda en Supabase Storage.
 */

import {
  CATEGORICAL_FEATURES,
  NUMERIC_FEATURES,
  type CategoricalFeature,
  type NumericFeature,
  type YieldFeatures,
} from "@/lib/yield-features"

export const YIELD_MODEL_VERSION = 1

interface DenseLayer {
  /** weights[salida][entrada] */
  weights: number[][]
  bias: number[]
}

export interface YieldModelMetrics {
  /** Error absoluto medio del modelo, en kg/ha. */
  maeKgHa: number
  /** Error de predecir siempre el promedio: el modelo sirve si mejora esto. */
  baselineMaeKgHa: number
  /**
   * Error de usar directamente el rinde esperable de la zona (variable `regional_kg_ha`), sobre
   * las mismas filas. Si el modelo no lo mejora, conviene quedarse con el regional.
   */
  regionalMaeKgHa: number | null
  r2: number
  /** Filas reservadas para medir; 0 = muy pocos datos, métricas sobre entrenamiento. */
  validationSamples: number
}

export interface YieldModel {
  version: typeof YIELD_MODEL_VERSION
  trainedAt: string
  samples: number
  numericMeans: Record<NumericFeature, number>
  numericStds: Record<NumericFeature, number>
  /** One-hot promedio de cada categórico: se usa cuando el dato falta. */
  categoricalMeans: Record<CategoricalFeature, number[]>
  /** Fracción de filas con código 0. Si es baja, 0 = "faltante" y no una categoría real. */
  categoricalZeroShare: Record<CategoricalFeature, number>
  /** Duración típica del ciclo por código de cultivo (para lotes que todavía no cosecharon). */
  typicalDaysByCrop: Record<string, number>
  targetMean: number
  targetStd: number
  layers: DenseLayer[]
  metrics: YieldModelMetrics
}

export interface TrainingSample {
  features: YieldFeatures
  yieldKgHa: number
}

export interface TrainOptions {
  hiddenLayers?: number[]
  epochs?: number
  batchSize?: number
  learningRate?: number
  l2?: number
  validationFraction?: number
  patience?: number
  seed?: number
}

const CATEGORICAL_ORDER = Object.keys(CATEGORICAL_FEATURES) as CategoricalFeature[]

export const YIELD_MODEL_INPUT_SIZE =
  CATEGORICAL_ORDER.reduce((sum, key) => sum + CATEGORICAL_FEATURES[key], 0) +
  NUMERIC_FEATURES.length

/* ───────────── Vectorización ───────────── */

type FeatureStats = Pick<
  YieldModel,
  | "numericMeans"
  | "numericStds"
  | "categoricalMeans"
  | "categoricalZeroShare"
  | "typicalDaysByCrop"
>

/** Por debajo de esta fracción, un código 0 se imputa en vez de tratarse como categoría. */
const MISSING_CATEGORY_SHARE = 0.05

function oneHot(code: number, size: number): number[] {
  return Array.from({ length: size }, (_, i) => (code === i + 1 ? 1 : 0))
}

function vectorize(features: YieldFeatures, stats: FeatureStats): number[] {
  const x: number[] = []
  for (const key of CATEGORICAL_ORDER) {
    const code = features.categorical[key]
    if (code === 0 && stats.categoricalZeroShare[key] < MISSING_CATEGORY_SHARE) {
      x.push(...stats.categoricalMeans[key])
    } else {
      x.push(...oneHot(code, CATEGORICAL_FEATURES[key]))
    }
  }
  for (const key of NUMERIC_FEATURES) {
    let value = features.numeric[key]
    if (value === null && key === "total_days") {
      value = stats.typicalDaysByCrop[String(features.categorical.crop)] ?? null
    }
    const mean = stats.numericMeans[key]
    x.push(value === null ? 0 : (value - mean) / stats.numericStds[key])
  }
  return x
}

function computeStats(samples: TrainingSample[]): FeatureStats {
  const numericMeans = {} as Record<NumericFeature, number>
  const numericStds = {} as Record<NumericFeature, number>

  for (const key of NUMERIC_FEATURES) {
    const values = samples
      .map((s) => s.features.numeric[key])
      .filter((v): v is number => v !== null)
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    const variance = values.length
      ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
      : 0
    numericMeans[key] = mean
    // Variable constante o sin datos: std 1 para no dividir por 0 (queda en 0 tras centrar).
    numericStds[key] = Math.sqrt(variance) > 1e-9 ? Math.sqrt(variance) : 1
  }

  const categoricalMeans = {} as Record<CategoricalFeature, number[]>
  const categoricalZeroShare = {} as Record<CategoricalFeature, number>
  for (const key of CATEGORICAL_ORDER) {
    const size = CATEGORICAL_FEATURES[key]
    const known = samples.filter((s) => s.features.categorical[key] !== 0)
    const sums = new Array(size).fill(0)
    for (const s of known) sums[s.features.categorical[key] - 1] += 1
    categoricalMeans[key] = sums.map((sum) => (known.length ? sum / known.length : 0))
    categoricalZeroShare[key] = samples.length ? 1 - known.length / samples.length : 1
  }

  const daysByCrop = new Map<number, number[]>()
  for (const s of samples) {
    const days = s.features.numeric.total_days
    if (days === null || s.features.categorical.crop === 0) continue
    const list = daysByCrop.get(s.features.categorical.crop) ?? []
    list.push(days)
    daysByCrop.set(s.features.categorical.crop, list)
  }
  const typicalDaysByCrop: Record<string, number> = {}
  for (const [crop, list] of daysByCrop) {
    typicalDaysByCrop[String(crop)] = list.reduce((a, b) => a + b, 0) / list.length
  }

  return { numericMeans, numericStds, categoricalMeans, categoricalZeroShare, typicalDaysByCrop }
}

/* ───────────── Red ───────────── */

/** PRNG determinista (mulberry32): mismo dataset + seed = mismo modelo. */
function createRandom(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gaussian = () => {
    const u = Math.max(next(), 1e-12)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
  }
  return { next, gaussian }
}

function initLayers(sizes: number[], random: ReturnType<typeof createRandom>): DenseLayer[] {
  const layers: DenseLayer[] = []
  for (let l = 1; l < sizes.length; l++) {
    const fanIn = sizes[l - 1]
    const scale = Math.sqrt(2 / fanIn) // He, para ReLU
    layers.push({
      weights: Array.from({ length: sizes[l] }, () =>
        Array.from({ length: fanIn }, () => random.gaussian() * scale),
      ),
      bias: new Array(sizes[l]).fill(0),
    })
  }
  return layers
}

/** Devuelve las activaciones de cada capa; la última es la salida (lineal). */
function forward(layers: DenseLayer[], x: number[]): number[][] {
  const activations = [x]
  let input = x
  layers.forEach((layer, l) => {
    const isOutput = l === layers.length - 1
    const out = layer.weights.map((row, j) => {
      let z = layer.bias[j]
      for (let i = 0; i < row.length; i++) z += row[i] * input[i]
      return isOutput ? z : Math.max(0, z)
    })
    activations.push(out)
    input = out
  })
  return activations
}

function cloneLayers(layers: DenseLayer[]): DenseLayer[] {
  return layers.map((layer) => ({
    weights: layer.weights.map((row) => row.slice()),
    bias: layer.bias.slice(),
  }))
}

function zerosLike(layers: DenseLayer[]): DenseLayer[] {
  return layers.map((layer) => ({
    weights: layer.weights.map((row) => new Array(row.length).fill(0)),
    bias: new Array(layer.bias.length).fill(0),
  }))
}

function meanSquaredError(layers: DenseLayer[], xs: number[][], ys: number[]): number {
  let sum = 0
  for (let n = 0; n < xs.length; n++) {
    const activations = forward(layers, xs[n])
    sum += (activations[activations.length - 1][0] - ys[n]) ** 2
  }
  return sum / Math.max(1, xs.length)
}

/* ───────────── Entrenamiento ───────────── */

export function trainYieldModel(
  samples: TrainingSample[],
  options: TrainOptions = {},
): YieldModel {
  const {
    hiddenLayers = [32, 16],
    epochs = 400,
    batchSize = 32,
    learningRate = 0.005,
    l2 = 1e-4,
    validationFraction = 0.2,
    patience = 40,
    seed = 42,
  } = options

  if (samples.length < 2) throw new Error("Se necesitan al menos 2 muestras para entrenar.")

  const random = createRandom(seed)
  const shuffled = samples.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Con pocos datos no se reserva validación: se entrena con todo y se mide sobre lo mismo.
  const validationSize =
    shuffled.length >= 25 ? Math.max(5, Math.round(shuffled.length * validationFraction)) : 0
  const validation = shuffled.slice(0, validationSize)
  const training = shuffled.slice(validationSize)

  const stats = computeStats(training)
  const targets = training.map((s) => s.yieldKgHa)
  const targetMean = targets.reduce((a, b) => a + b, 0) / targets.length
  const targetVariance = targets.reduce((a, b) => a + (b - targetMean) ** 2, 0) / targets.length
  const targetStd = Math.sqrt(targetVariance) > 1e-9 ? Math.sqrt(targetVariance) : 1

  const encode = (set: TrainingSample[]) => ({
    xs: set.map((s) => vectorize(s.features, stats)),
    ys: set.map((s) => (s.yieldKgHa - targetMean) / targetStd),
  })
  const train = encode(training)
  const valid = encode(validation)

  let layers = initLayers([YIELD_MODEL_INPUT_SIZE, ...hiddenLayers, 1], random)
  const firstMoment = zerosLike(layers)
  const secondMoment = zerosLike(layers)
  const beta1 = 0.9
  const beta2 = 0.999
  let step = 0

  let best = { layers: cloneLayers(layers), loss: Infinity }
  let epochsWithoutImprovement = 0
  const order = train.xs.map((_, i) => i)

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random.next() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }

    for (let start = 0; start < order.length; start += batchSize) {
      const batch = order.slice(start, start + batchSize)
      const grads = zerosLike(layers)

      for (const n of batch) {
        const activations = forward(layers, train.xs[n])
        const output = activations[activations.length - 1][0]
        // d(MSE)/d(salida), promediado en el batch
        let delta = [(2 * (output - train.ys[n])) / batch.length]

        for (let l = layers.length - 1; l >= 0; l--) {
          const input = activations[l]
          const layer = layers[l]
          const grad = grads[l]
          const nextDelta = l > 0 ? new Array(input.length).fill(0) : null
          for (let j = 0; j < layer.weights.length; j++) {
            const d = delta[j]
            if (d === 0) continue
            grad.bias[j] += d
            const row = layer.weights[j]
            const gradRow = grad.weights[j]
            for (let i = 0; i < row.length; i++) {
              gradRow[i] += d * input[i]
              if (nextDelta) nextDelta[i] += d * row[i]
            }
          }
          if (nextDelta) {
            // ReLU: la derivada es 0 donde la activación quedó en 0
            for (let i = 0; i < nextDelta.length; i++) if (input[i] <= 0) nextDelta[i] = 0
            delta = nextDelta
          }
        }
      }

      step++
      const correction1 = 1 - beta1 ** step
      const correction2 = 1 - beta2 ** step
      const update = (param: number[], grad: number[], m: number[], v: number[], decay: number) => {
        for (let i = 0; i < param.length; i++) {
          const g = grad[i] + decay * param[i]
          m[i] = beta1 * m[i] + (1 - beta1) * g
          v[i] = beta2 * v[i] + (1 - beta2) * g * g
          param[i] -= (learningRate * (m[i] / correction1)) / (Math.sqrt(v[i] / correction2) + 1e-8)
        }
      }
      layers.forEach((layer, l) => {
        layer.weights.forEach((row, j) =>
          update(row, grads[l].weights[j], firstMoment[l].weights[j], secondMoment[l].weights[j], l2),
        )
        update(layer.bias, grads[l].bias, firstMoment[l].bias, secondMoment[l].bias, 0)
      })
    }

    if (valid.xs.length > 0) {
      const loss = meanSquaredError(layers, valid.xs, valid.ys)
      if (loss < best.loss - 1e-6) {
        best = { layers: cloneLayers(layers), loss }
        epochsWithoutImprovement = 0
      } else if (++epochsWithoutImprovement >= patience) {
        break
      }
    }
  }

  if (valid.xs.length > 0) layers = best.layers

  const model: YieldModel = {
    version: YIELD_MODEL_VERSION,
    trainedAt: new Date().toISOString(),
    samples: samples.length,
    ...stats,
    targetMean,
    targetStd,
    layers,
    metrics: {
      maeKgHa: 0,
      baselineMaeKgHa: 0,
      regionalMaeKgHa: null,
      r2: 0,
      validationSamples: validation.length,
    },
  }

  const evaluation = validation.length > 0 ? validation : training
  const actual = evaluation.map((s) => s.yieldKgHa)
  const predicted = evaluation.map((s) => predictYieldKgHa(model, s.features))
  const evalMean = actual.reduce((a, b) => a + b, 0) / actual.length
  const totalSquares = actual.reduce((a, b) => a + (b - evalMean) ** 2, 0)
  const residualSquares = actual.reduce((a, b, i) => a + (b - predicted[i]) ** 2, 0)
  model.metrics.maeKgHa = actual.reduce((a, b, i) => a + Math.abs(b - predicted[i]), 0) / actual.length
  model.metrics.baselineMaeKgHa =
    actual.reduce((a, b) => a + Math.abs(b - targetMean), 0) / actual.length
  model.metrics.r2 = totalSquares > 0 ? 1 - residualSquares / totalSquares : 0
  const withRegional = evaluation.filter((s) => s.features.numeric.regional_kg_ha !== null)
  if (withRegional.length > 0) {
    model.metrics.regionalMaeKgHa =
      withRegional.reduce((a, s) => a + Math.abs(s.yieldKgHa - (s.features.numeric.regional_kg_ha as number)), 0) /
      withRegional.length
  }

  return model
}

/* ───────────── Predicción ───────────── */

export function predictYieldKgHa(model: YieldModel, features: YieldFeatures): number {
  const activations = forward(model.layers, vectorize(features, model))
  const standardized = activations[activations.length - 1][0]
  return Math.max(0, standardized * model.targetStd + model.targetMean)
}

/** Valida un JSON leído de Storage antes de usarlo. */
export function parseYieldModel(value: unknown): YieldModel | null {
  if (!value || typeof value !== "object") return null
  const model = value as Partial<YieldModel>
  if (model.version !== YIELD_MODEL_VERSION) return null
  if (!Array.isArray(model.layers) || model.layers.length === 0) return null
  if (model.layers[0]?.weights?.[0]?.length !== YIELD_MODEL_INPUT_SIZE) return null
  if (typeof model.targetMean !== "number" || typeof model.targetStd !== "number") return null
  if (!model.numericMeans || !model.numericStds || !model.typicalDaysByCrop) return null
  if (!model.categoricalMeans || !model.categoricalZeroShare) return null
  return model as YieldModel
}
