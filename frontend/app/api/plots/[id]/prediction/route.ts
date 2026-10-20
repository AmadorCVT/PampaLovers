import { NextResponse } from "next/server"

import { predictAndStorePlotYield } from "@/lib/server/yield-prediction"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/** Recalcula la predicción de rinde de un lote propio (p. ej. al iniciar un nuevo ciclo). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  // Con el cliente del usuario: RLS solo devuelve el lote si es suyo.
  const { data: plot, error: plotError } = await supabase
    .from("plots")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (plotError) return NextResponse.json({ error: plotError.message }, { status: 400 })
  if (!plot) return NextResponse.json({ error: "Lote no encontrado." }, { status: 404 })

  try {
    const result = await predictAndStorePlotYield(supabase, plot)
    return NextResponse.json(result, { status: result.predictedKgHa === null ? 422 : 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo predecir el rinde." },
      { status: 500 },
    )
  }
}
