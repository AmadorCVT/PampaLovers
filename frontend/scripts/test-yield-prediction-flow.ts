import assert from "node:assert/strict"

import {
  clearYieldModelCache,
  loadYieldModel,
  predictAndStorePlotYield,
  trainAndStoreYieldModel,
} from "../lib/server/yield-prediction"

type Row = Record<string, unknown>

/** Supabase en memoria: solo lo que usa `yield-prediction` (select/range/not/neq/in/insert + Storage). */
class FakeQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
  private filters: Array<(row: Row) => boolean> = []
  private window: [number, number] | null = null
  private pendingInsert: Row[] | null = null

  constructor(
    private readonly tables: Map<string, Row[]>,
    private readonly table: string,
  ) {}

  select() {
    return this
  }
  range(from: number, to: number) {
    this.window = [from, to]
    return this
  }
  not(field: string, _op: "is", value: null) {
    this.filters.push((row) => row[field] !== value && row[field] !== undefined)
    return this
  }
  neq(field: string, value: unknown) {
    this.filters.push((row) => row[field] !== value)
    return this
  }
  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]))
    return this
  }
  insert(rows: Row | Row[]) {
    this.pendingInsert = Array.isArray(rows) ? rows : [rows]
    return this
  }

  then<T1, T2>(
    onfulfilled?: ((value: { data: Row[] | null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    const rows = this.tables.get(this.table) ?? []
    if (this.pendingInsert) {
      rows.push(...this.pendingInsert)
      this.tables.set(this.table, rows)
      return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected)
    }
    let result = rows.filter((row) => this.filters.every((f) => f(row)))
    if (this.window) result = result.slice(this.window[0], this.window[1] + 1)
    return Promise.resolve({ data: result, error: null }).then(onfulfilled, onrejected)
  }
}

class FakeSupabase {
  tables = new Map<string, Row[]>()
  files = new Map<string, string>()
  buckets = new Set<string>()
  bucketsCreated: string[] = []

  from(table: string) {
    return new FakeQuery(this.tables, table)
  }

  storage = {
    createBucket: async (name: string) => {
      this.buckets.add(name)
      this.bucketsCreated.push(name)
      return { data: { name }, error: null }
    },
    from: (bucket: string) => ({
      upload: async (path: string, body: string) => {
        if (!this.buckets.has(bucket)) return { data: null, error: { message: "Bucket not found" } }
        this.files.set(`${bucket}/${path}`, body)
        return { data: { path }, error: null }
      },
      download: async (path: string) => {
        const body = this.files.get(`${bucket}/${path}`)
        if (body === undefined) return { data: null, error: { message: "Object not found" } }
        return { data: new Blob([body], { type: "application/json" }), error: null }
      },
    }),
  }
}

let state = 11
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296
  return state / 4294967296
}

const db = new FakeSupabase()
// 1500 cosechas (más de una página de 1000) con la forma real de `public.logs`.
db.tables.set(
  "logs",
  Array.from({ length: 1500 }, (_, i) => {
    const crop = 1 + (i % 8)
    const ndvi = 0.2 + rand() * 0.7
    return {
      id: `log-${i}`,
      plot_id: `old-${i}`,
      crop_type: crop,
      irrigation_type: Math.floor(rand() * 4),
      fertilizer_type: 1 + Math.floor(rand() * 3),
      crop_disease_status: Math.floor(rand() * 4),
      soil_moisture: 0,
      soil_ph: 6.5,
      temperature_c: 22,
      rainfall_mm: 300 + rand() * 400,
      humidity_percent: 60,
      sunlight_hours: 8,
      pesticide_usage_ml: 0,
      sowing_date: "2025-10-01",
      harvest_date: "2026-03-20",
      ndvi_index: ndvi,
      // Una fila sin rinde no debe entrar al entrenamiento.
      yield_kg_per_hectare: i === 0 ? 0 : (crop === 2 ? 7000 : 3200) * (0.6 + ndvi * 0.6),
    }
  }),
)
db.tables.set("plots", [
  { id: "p-maiz", crop_type: "Maíz", status: "Sembrado", ndvi_index: 0.8 },
  { id: "p-soja", crop_type: "soja", status: "Crecimiento", ndvi_index: 0.8 },
  { id: "p-barbecho", crop_type: null, status: "Barbecho" },
  { id: "p-con-prediccion", crop_type: "Trigo", status: "Sembrado" },
])
db.tables.set("plot_prediction", [{ plot_id: "p-con-prediccion", ml_predicted_kg_ha: 4100 }])

const admin = db as never

async function main() {
  // Sin modelo todavía: la predicción se saltea con un motivo, sin romper.
  clearYieldModelCache()
  assert.equal(await loadYieldModel(admin), null)
  const before = await predictAndStorePlotYield(db as never, { id: "p-maiz", crop_type: "Maíz" }, admin)
  assert.equal(before.predictedKgHa, null)
  clearYieldModelCache()

  // Entrenar: lee las 2 páginas de logs, crea el bucket que falta, guarda el JSON y completa predicciones.
  const { model, backfilled } = await trainAndStoreYieldModel(admin)
  assert.equal(model.samples, 1499, "descarta la fila con rinde 0")
  assert.deepEqual(db.bucketsCreated, ["models"])
  assert.ok(db.files.has("models/yield-model.json"))
  assert.equal(backfilled, 2, "solo maíz y soja: barbecho no tiene cultivo y trigo ya tenía predicción")
  const predictions = db.tables.get("plot_prediction")!
  const maiz = predictions.find((p) => p.plot_id === "p-maiz")!.ml_predicted_kg_ha as number
  const soja = predictions.find((p) => p.plot_id === "p-soja")!.ml_predicted_kg_ha as number
  console.log(`backfill: maíz ${maiz} kg/ha, soja ${soja} kg/ha — R² ${model.metrics.r2.toFixed(3)}`)
  assert.ok(maiz > soja, "maíz > soja según los datos")
  // Esperado por la fórmula con NDVI 0.8: maíz 7000·1.08 = 7560, soja 3200·1.08 = 3456. Los datos que
  // faltan en el lote (fertilizante, lluvia...) se imputan y no lo sacan de lo aprendido.
  assert.ok(Math.abs(maiz - 7560) < 400, `maíz ~7560, obtuvo ${maiz}`)
  assert.ok(Math.abs(soja - 3456) < 300, `soja ~3456, obtuvo ${soja}`)

  // Un proceso nuevo (sin caché) carga el modelo desde Storage y predice lo mismo.
  clearYieldModelCache()
  const loaded = await loadYieldModel(admin)
  assert.deepEqual(loaded?.layers, model.layers)
  const again = await predictAndStorePlotYield(db as never, { id: "p-maiz", crop_type: "Maíz", ndvi_index: 0.8 }, admin)
  assert.equal(again.predictedKgHa, maiz)
  assert.equal(predictions.filter((p) => p.plot_id === "p-maiz").length, 2, "se agrega al historial")

  // Sin cultivo reconocido no se inventa una predicción.
  const unknown = await predictAndStorePlotYield(db as never, { id: "x", crop_type: "Quinoa" }, admin)
  assert.equal(unknown.predictedKgHa, null)

  console.log("test-yield-prediction-flow: OK")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
