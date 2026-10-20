import assert from "node:assert/strict"

import {
  parseYieldModel,
  predictYieldKgHa,
  trainYieldModel,
  type TrainingSample,
} from "../lib/ml/yield-model"
import { featuresFromLog, featuresFromPlot } from "../lib/yield-features"

/** Dataset sintético con una relación conocida: el modelo tiene que aprenderla. */
function syntheticSamples(count: number, seed = 7): TrainingSample[] {
  let state = seed
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  const baseByCrop = [0, 3200, 7500, 4200, 2400, 5000, 4100, 6800, 2600]

  return Array.from({ length: count }, () => {
    const crop = 1 + Math.floor(rand() * 8)
    const ndvi = 0.2 + rand() * 0.7
    const rainfall = 200 + rand() * 600
    const disease = Math.floor(rand() * 4)
    const irrigation = Math.floor(rand() * 4)
    const yieldKgHa =
      baseByCrop[crop] * (0.55 + 0.7 * ndvi) +
      1.4 * (rainfall - 500) -
      350 * disease +
      (irrigation === 1 ? 300 : 0) +
      (rand() - 0.5) * 200

    // Fila con la forma de `public.logs` (0 = dato faltante en varias columnas).
    const row = {
      crop_type: crop,
      irrigation_type: irrigation,
      fertilizer_type: 1 + Math.floor(rand() * 3),
      crop_disease_status: disease,
      soil_moisture: rand() < 0.3 ? 0 : 20 + rand() * 30,
      soil_ph: 5.5 + rand() * 2,
      temperature_c: 18 + rand() * 10,
      rainfall_mm: rainfall,
      humidity_percent: 50 + rand() * 30,
      sunlight_hours: 8,
      pesticide_usage_ml: rand() * 500,
      sowing_date: "2025-10-01",
      harvest_date: rand() < 0.5 ? "2026-03-15" : "2026-04-10",
      ndvi_index: ndvi,
      yield_kg_per_hectare: yieldKgHa,
    }
    return { features: featuresFromLog(row), yieldKgHa }
  })
}

// 1. Codificación: texto de `plots` y números de `logs` tienen que coincidir.
const fromPlot = featuresFromPlot({
  crop_type: "maiz",
  irrigation_type: "Drip",
  fertilizer_type: "Mixed",
  crop_disease_status: "Severe",
  soil_ph: 0,
  total_days: null,
  ndvi_index: 0.71,
})
assert.deepEqual(fromPlot.categorical, { crop: 2, irrigation: 1, fertilizer: 3, disease: 3 })
assert.equal(fromPlot.numeric.soil_ph, null, "pH 0 se trata como faltante")
assert.equal(fromPlot.numeric.ndvi_index, 0.71)
const fromLog = featuresFromLog({ crop_type: 2, sowing_date: "2025-10-01", harvest_date: "2026-03-01" })
assert.equal(fromLog.categorical.crop, 2)
assert.equal(fromLog.numeric.total_days, 151)

// 2. Entrenamiento: tiene que mejorar claramente a "predecir siempre el promedio".
const samples = syntheticSamples(600)
const started = Date.now()
const model = trainYieldModel(samples)
const seconds = (Date.now() - started) / 1000
console.log(
  `entrenado con ${model.samples} muestras en ${seconds.toFixed(1)}s — MAE ${model.metrics.maeKgHa.toFixed(0)} kg/ha` +
    ` (baseline ${model.metrics.baselineMaeKgHa.toFixed(0)}), R² ${model.metrics.r2.toFixed(3)}`,
)
assert.equal(model.metrics.validationSamples, 120)
assert.ok(model.metrics.r2 > 0.85, `R² esperado > 0.85, obtuvo ${model.metrics.r2}`)
assert.ok(model.metrics.maeKgHa < model.metrics.baselineMaeKgHa * 0.4)

// 3. Determinismo y serialización: el JSON guardado predice igual que el modelo en memoria.
const again = trainYieldModel(samples)
assert.deepEqual(again.layers, model.layers, "mismo dataset + seed = mismo modelo")
const restored = parseYieldModel(JSON.parse(JSON.stringify(model)))
assert.ok(restored, "el modelo serializado es válido")
const corn = featuresFromPlot({ crop_type: "Maíz", ndvi_index: 0.8, rainfall_mm: 600, crop_disease_status: "None" })
const cornSick = featuresFromPlot({ crop_type: "Maíz", ndvi_index: 0.8, rainfall_mm: 600, crop_disease_status: "Severe" })
const soy = featuresFromPlot({ crop_type: "Soja", ndvi_index: 0.8, rainfall_mm: 600, crop_disease_status: "None" })
assert.equal(predictYieldKgHa(restored, corn), predictYieldKgHa(model, corn))

// 4. Sentido agronómico de lo aprendido (según la relación sintética).
const cornKg = predictYieldKgHa(model, corn)
console.log(`maíz sano ${cornKg.toFixed(0)} · maíz severo ${predictYieldKgHa(model, cornSick).toFixed(0)} · soja ${predictYieldKgHa(model, soy).toFixed(0)} kg/ha`)
assert.ok(cornKg > predictYieldKgHa(model, soy), "maíz rinde más que soja")
assert.ok(cornKg > predictYieldKgHa(model, cornSick), "enfermedad severa baja el rinde")

// 5. Con pocos datos entrena igual (sin validación) y no rompe.
const small = trainYieldModel(syntheticSamples(20, 3))
assert.equal(small.metrics.validationSamples, 0)
assert.ok(Number.isFinite(predictYieldKgHa(small, corn)))
assert.equal(parseYieldModel({ version: 99 }), null)

console.log("test-yield-model: OK")
