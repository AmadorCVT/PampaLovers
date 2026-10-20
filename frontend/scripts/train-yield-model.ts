/**
 * Entrena el modelo de rinde con las cosechas de `public.logs` y lo sube a Supabase Storage.
 * Uso (desde frontend/, con .env.local completo): npm run ml:train
 */
import { trainAndStoreYieldModel } from "../lib/server/yield-prediction"

async function main() {
  const started = Date.now()
  const { model, backfilled } = await trainAndStoreYieldModel()
  const { maeKgHa, baselineMaeKgHa, r2, validationSamples } = model.metrics

  console.log(`Modelo entrenado con ${model.samples} cosechas en ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(
    `  Error medio: ${Math.round(maeKgHa)} kg/ha (predecir siempre el promedio: ${Math.round(baselineMaeKgHa)} kg/ha)`,
  )
  console.log(
    `  R²: ${r2.toFixed(3)} ${validationSamples > 0 ? `sobre ${validationSamples} cosechas reservadas` : "(sobre los mismos datos: hay pocas cosechas)"}`,
  )
  console.log(`  Predicciones nuevas para lotes sin predicción: ${backfilled}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
