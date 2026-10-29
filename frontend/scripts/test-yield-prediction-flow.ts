import assert from "node:assert/strict"

import regionalYields from "../data/regional-yields.json"
import { estimateRegionalYield, type RegionalYieldData } from "../lib/ml/regional-yield"
import { lookupAdminLocation, type AdminLocation } from "../lib/server/georef"
import {
  clearYieldModelCache,
  loadYieldModel,
  predictAndStorePlotYield,
  trainAndStoreYieldModel,
  type PlotPredictionResult,
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

const REGIONAL = regionalYields as unknown as RegionalYieldData

let state = 11
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296
  return state / 4294967296
}

/** Georef simulada: dos zonas conocidas por coordenadas; el resto, fuera del mapa. */
const PERGAMINO: AdminLocation = { provinceId: "06", provinceName: "Buenos Aires", departmentId: "06623", departmentName: "Pergamino" }
const RIVADAVIA: AdminLocation = { provinceId: "86", provinceName: "Santiago del Estero", departmentId: "86154", departmentName: "Rivadavia" }
const locate = async (lat: number) => (lat > -34 ? PERGAMINO : lat > -40 ? RIVADAVIA : null)

const expectedRegional = (crop: number, departmentId: string, campaign: string) =>
  estimateRegionalYield(REGIONAL, { crop, departmentId, campaign })!.kgHa

function kgHa(result: PlotPredictionResult): number {
  assert.ok(result.predictedKgHa !== null, "reason" in result ? result.reason : "sin predicción")
  return result.predictedKgHa
}

async function main() {
  // 0. Georef: parsea la respuesta de la API y tolera fallas.
  const georefResponse = {
    ubicacion: {
      departamento: { id: "06623", nombre: "Pergamino" },
      provincia: { id: "06", nombre: "Buenos Aires" },
      lat: -33.89,
      lon: -60.57,
    },
  }
  const okFetch = (async () => new Response(JSON.stringify(georefResponse))) as typeof fetch
  assert.deepEqual(await lookupAdminLocation(-33.89, -60.57, okFetch), PERGAMINO)
  const downFetch = (async () => {
    throw new Error("sin red")
  }) as typeof fetch
  assert.equal(await lookupAdminLocation(-31.1, -64.2, downFetch), null)

  // 1. Sin cosechas propias: predice igual, con el rinde regional del departamento del lote.
  const db = new FakeSupabase()
  db.tables.set("logs", [])
  db.tables.set("plots", [
    { id: "maiz-pergamino", crop_type: "Maíz", status: "Sembrado", sowing_date: "2026-09-20", latitude: -33.9, longitude: -60.6 },
    { id: "soja-rivadavia", crop_type: "soja", status: "Sembrado", sowing_date: "2026-11-15", latitude: -35.5, longitude: -62 },
    { id: "barbecho", crop_type: null, status: "Barbecho" },
    { id: "ya-predicho", crop_type: "Trigo", status: "Sembrado", latitude: -33.9, longitude: -60.6 },
  ])
  db.tables.set("plot_prediction", [{ plot_id: "ya-predicho", ml_predicted_kg_ha: 4100 }])
  const deps = { admin: db as never, locate }

  clearYieldModelCache()
  const first = await trainAndStoreYieldModel(deps)
  assert.equal(first.model, null, "menos de 20 cosechas: no hay modelo por lote")
  assert.equal(first.backfilled, 2, "maíz y soja; el barbecho no tiene cultivo y el trigo ya tenía predicción")
  const prediction = (id: string) =>
    db.tables.get("plot_prediction")!.filter((p) => p.plot_id === id).at(-1)!.ml_predicted_kg_ha as number
  const maizPergamino = expectedRegional(2, "06623", "2026/27")
  const sojaRivadavia = expectedRegional(1, "86154", "2026/27")
  assert.equal(prediction("maiz-pergamino"), maizPergamino)
  assert.equal(prediction("soja-rivadavia"), sojaRivadavia)
  console.log(`regional 2026/27: maíz Pergamino ${maizPergamino} kg/ha · soja Rivadavia ${sojaRivadavia} kg/ha`)
  assert.ok(maizPergamino > 7000 && maizPergamino < 11000, "maíz en Pergamino en el rango real de la zona")
  assert.ok(sojaRivadavia > 1500 && sojaRivadavia < 4000)

  // Sin ubicación (Georef caída o lote sin coordenadas): nivel nacional, no se rompe.
  const national = await predictAndStorePlotYield(db as never, { id: "x", crop_type: "Maíz", latitude: -50, longitude: -70 }, deps)
  assert.ok(national.predictedKgHa !== null && national.basis.level === "nacional")
  const noCrop = await predictAndStorePlotYield(db as never, { id: "y", crop_type: "Quinoa" }, deps)
  assert.equal(noCrop.predictedKgHa, null)

  // 2. Con cosechas propias: en este campo el riego por goteo rinde 25% más que su zona.
  //    La red recibe el regional como variable y tiene que aprender ese desvío.
  const lots = Array.from({ length: 120 }, (_, i) => ({
    id: `lote-${i}`,
    latitude: i % 2 ? -33.9 : -35.5,
    longitude: -61,
  }))
  db.tables.set("plots", [...db.tables.get("plots")!, ...lots])
  db.tables.set(
    "logs",
    Array.from({ length: 1200 }, (_, i) => {
      const lot = lots[i % lots.length]
      const department = i % 2 ? "06623" : "86154"
      const crop = 1 + (i % 3) // soja, maíz, trigo
      const year = 2015 + (i % 10)
      const sowing = `${year}-${crop === 3 ? "06" : "10"}-15`
      const campaign = `${year}/${String((year + 1) % 100).padStart(2, "0")}`
      const irrigation = Math.floor(rand() * 4) // 1 = goteo
      const regional = expectedRegional(crop, department, campaign)
      return {
        id: `log-${i}`,
        plot_id: lot.id,
        crop_type: crop,
        irrigation_type: irrigation,
        fertilizer_type: 1 + Math.floor(rand() * 3),
        crop_disease_status: 0,
        sowing_date: sowing,
        harvest_date: `${year + 1}-04-01`,
        ndvi_index: 0.6,
        // Una fila sin rinde no debe entrar al entrenamiento.
        yield_kg_per_hectare: i === 0 ? 0 : regional * (irrigation === 1 ? 1.25 : 1) * (0.97 + rand() * 0.06),
      }
    }),
  )

  clearYieldModelCache()
  const second = await trainAndStoreYieldModel(deps)
  assert.equal(second.samples, 1199, "descarta la fila con rinde 0")
  assert.ok(second.model, "con 1199 cosechas hay modelo por lote")
  assert.deepEqual(db.bucketsCreated, ["models"], "crea el bucket que faltaba")
  assert.ok(db.files.has("models/yield-model.json"))
  const { maeKgHa, regionalMaeKgHa } = second.model.metrics
  console.log(`modelo por lote: error ${Math.round(maeKgHa)} kg/ha vs solo regional ${Math.round(regionalMaeKgHa!)} kg/ha`)
  assert.ok(second.lotModelInUse, "aprende el desvío del riego, así que mejora al regional y se usa")

  // Un proceso nuevo (sin caché) carga el modelo desde Storage.
  clearYieldModelCache()
  const loaded = await loadYieldModel(db as never)
  assert.deepEqual(loaded?.layers, second.model.layers)

  const plot = { crop_type: "Maíz", sowing_date: "2026-09-20", latitude: -33.9, longitude: -60.6, crop_disease_status: "None", fertilizer_type: "Mixed", ndvi_index: 0.6 }
  const drip = await predictAndStorePlotYield(db as never, { ...plot, id: "goteo", irrigation_type: "Drip" }, deps)
  const dry = await predictAndStorePlotYield(db as never, { ...plot, id: "seco", irrigation_type: "Manual" }, deps)
  assert.ok(drip.predictedKgHa !== null && drip.basis.method === "regional+lotes")
  console.log(`maíz Pergamino 2026/27: goteo ${kgHa(drip)} · manual ${kgHa(dry)} · regional ${maizPergamino} kg/ha`)
  assert.ok(Math.abs(kgHa(drip) / kgHa(dry) - 1.25) < 0.08, "el goteo rinde ~25% más que el manual")
  assert.ok(Math.abs(kgHa(dry) / maizPergamino - 1) < 0.08, "sin goteo, cerca del regional")

  console.log("test-yield-prediction-flow: OK")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
