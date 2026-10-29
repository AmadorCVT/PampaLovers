/**
 * Entrena el modelo por lote con las cosechas de `public.logs` (si hay al menos 20), lo sube a
 * Supabase Storage y recalcula la predicción de todos los lotes activos (regional + clima).
 * Uso (desde frontend/, con .env.local completo): npm run ml:train
 */
import { MIN_TRAINING_SAMPLES, trainAndStoreYieldModel } from "../lib/server/yield-prediction"

async function main() {
  const started = Date.now()
  const { model, samples, lotModelInUse, updatedPredictions } = await trainAndStoreYieldModel()

  console.log(`Cosechas con rinde en logs: ${samples}`)
  if (!model) {
    console.log(
      `  Menos de ${MIN_TRAINING_SAMPLES}: no se entrena el modelo por lote, se predice solo con el rinde regional (MAGyP).`,
    )
  } else {
    const { maeKgHa, regionalMaeKgHa, r2, validationSamples } = model.metrics
    console.log(`Modelo por lote entrenado en ${((Date.now() - started) / 1000).toFixed(1)}s`)
    console.log(
      `  Error medio: ${Math.round(maeKgHa)} kg/ha · solo regional: ${regionalMaeKgHa == null ? "—" : `${Math.round(regionalMaeKgHa)} kg/ha`} · R² ${r2.toFixed(3)}` +
        (validationSamples > 0 ? ` (sobre ${validationSamples} cosechas reservadas)` : " (sobre los mismos datos)"),
    )
    console.log(
      lotModelInUse
        ? "  Mejora al regional: se usa para predecir."
        : "  No mejora al regional: se sigue prediciendo solo con el rinde regional.",
    )
  }
  console.log(`Lotes con predicción nueva o actualizada: ${updatedPredictions}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
