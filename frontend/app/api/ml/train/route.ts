import { NextResponse } from "next/server"

import { trainAndStoreYieldModel } from "@/lib/server/yield-prediction"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Re-entrena el modelo por lote con las cosechas de `logs` (si alcanzan) y recalcula la predicción
 * de todos los lotes activos con el clima observado hasta hoy (aunque no haya modelo por lote).
 * Protegido por secreto: `Authorization: Bearer <ML_ADMIN_SECRET>` (manual) o `<CRON_SECRET>`,
 * que Vercel Cron envía solo (ver `vercel.json`).
 */
async function handle(request: Request) {
  const secrets = [process.env.ML_ADMIN_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (secrets.length === 0) {
    return jsonError(503, "Configurá ML_ADMIN_SECRET (o CRON_SECRET) para habilitar el entrenamiento.")
  }

  const authorization = request.headers.get("authorization") ?? ""
  if (!secrets.some((secret) => authorization === `Bearer ${secret}`)) {
    return jsonError(401, "No autorizado.")
  }

  try {
    const { model, samples, lotModelInUse, updatedPredictions } = await trainAndStoreYieldModel()
    return NextResponse.json({
      harvestSamples: samples,
      lotModel: model ? { trainedAt: model.trainedAt, metrics: model.metrics, inUse: lotModelInUse } : null,
      updatedPredictions,
    })
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : "No se pudo entrenar el modelo.")
  }
}

export const GET = handle
export const POST = handle

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}
