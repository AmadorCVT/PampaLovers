import assert from "node:assert/strict"

import {
  createEnrichedPlot,
  type CreatePlotRequestBody,
} from "../lib/server/create-enriched-plot"

const EOS_STATS_TASK_URL = "https://api-connect.eos.com/api/gdw/api"
const EOS_WEATHER_HISTORY_URL = "https://api-connect.eos.com/weather/forecast-history"

type Row = Record<string, unknown>

class FakeQueryBuilder {
  private readonly filters: Array<(row: Row) => boolean> = []
  private insertedRow: Row | null = null

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(_columns?: string) {
    return this
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value)
    return this
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]))
    return this
  }

  insert(payload: Row) {
    const row = {
      id: `${this.table}-${this.db.nextId()}`,
      ...payload,
    }
    this.db.pushRow(this.table, row)
    this.insertedRow = row
    return this
  }

  async maybeSingle() {
    if (this.insertedRow) {
      return { data: this.insertedRow, error: null }
    }

    const rows = this.resolveRows()
    return { data: rows[0] ?? null, error: null }
  }

  async single() {
    if (this.insertedRow) {
      return { data: this.insertedRow, error: null }
    }

    const rows = this.resolveRows()
    return { data: rows[0] ?? null, error: null }
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.resolveRows(), error: null }).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    )
  }

  private resolveRows() {
    return this.db
      .rowsFor(this.table)
      .filter((row) => this.filters.every((filter) => filter(row)))
  }
}

class FakeSupabase {
  private sequence = 1

  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string) {
    return new FakeQueryBuilder(this, table)
  }

  nextId() {
    const id = this.sequence
    this.sequence += 1
    return id
  }

  pushRow(table: string, row: Row) {
    if (!this.tables[table]) {
      this.tables[table] = []
    }
    this.tables[table].push(row)
  }

  rowsFor(table: string) {
    return this.tables[table] ?? []
  }
}

async function main() {
  process.env.EOS_API_KEY = "test-eos-key"

  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const calls: Array<{ url: string; method: string; body: unknown }> = []

  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, _ms?: number, ...args: unknown[]) => {
    callback(...args)
    return 0 as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? "GET"
    const body = parseBody(init?.body)
    calls.push({ url, method, body })

    if (url.startsWith(EOS_WEATHER_HISTORY_URL) && method === "POST") {
      return jsonResponse([
        {
          temperature_min: 10,
          temperature_max: 20,
          rainfall: 2.2,
          humidity: 60,
          ignored_field: "weather-extra",
        },
        {
          temperature_min: 14,
          temperature_max: 26,
          rainfall: 3.3,
          humidity: 80,
        },
      ])
    }

    if (url.startsWith(EOS_STATS_TASK_URL) && method === "POST") {
      const taskType =
        body &&
        typeof body === "object" &&
        "params" in body &&
        typeof body.params === "object" &&
        body.params &&
        "bm_type" in body.params
          ? body.params.bm_type
          : null

      if (Array.isArray(taskType) && taskType.includes("NDVI")) {
        return jsonResponse({ task_id: "ndvi-task", status: "submitted" })
      }

      if (taskType === "soilmoisture") {
        return jsonResponse({ task_id: "soil-task", status: "submitted" })
      }
    }

    if (url.startsWith(`${EOS_STATS_TASK_URL}/ndvi-task`) && method === "GET") {
      return jsonResponse({
        result: [
          {
            indexes: {
              NDVI: { average: 0.8 },
            },
            ignored_field: "ndvi-extra",
          },
          {
            indexes: {
              NDVI: { average: 0.7 },
            },
          },
        ],
      })
    }

    if (url.startsWith(`${EOS_STATS_TASK_URL}/soil-task`) && method === "GET") {
      return jsonResponse({
        result: [
          { average: 44.444, ignored_field: "soil-extra" },
          { average: 55.556 },
        ],
      })
    }

    // Predicción de rinde: ubicación del lote (Georef) y clima de la campaña (NASA POWER).
    if (url.startsWith("https://apis.datos.gob.ar/georef/api/ubicacion")) {
      return jsonResponse({
        ubicacion: {
          departamento: { id: "06854", nombre: "25 de Mayo" },
          provincia: { id: "06", nombre: "Buenos Aires" },
        },
      })
    }

    if (url.startsWith("https://power.larc.nasa.gov/api/temporal/daily/point")) {
      return jsonResponse({ properties: { parameter: { PRECTOTCORR: {}, T2M: {} } } })
    }

    throw new Error(`Unexpected fetch call: ${method} ${url}`)
  }) as typeof fetch

  try {
    const supabase = new FakeSupabase({
      profiles: [{ id: "user-1", plan: "premium" }],
      farms: [{ id: "farm-1", user_id: "user-1", name: "Mi Campo" }],
      plots: [{ id: "existing-plot", farm_id: "farm-1", area_ha: 12 }],
    })

    const user = {
      id: "user-1",
      email: "tester@example.com",
      user_metadata: { name: "Tester" },
    }

    const body: CreatePlotRequestBody = {
      farm_id: "farm-1",
      name: "Lote Test",
      group: 2,
      crop_type: "soja",
      status: "Sembrado",
      description: "Alta automatica",
      soil_ph: 6.5,
      irrigation_type: "Drip",
      fertilizer_type: "Organic",
      pesticide_usage_ml: 12.5,
      crop_disease_status: "None",
      sowing_date: "2026-02-10",
      polygon: [
        [-60.495, -35.166],
        [-60.485, -35.166],
        [-60.485, -35.156],
        [-60.495, -35.156],
      ],
    }

    const result = await createEnrichedPlot(supabase as never, user, body)
    const insertedPlot = supabase.rowsFor("plots").at(-1)

    assert.ok(insertedPlot, "Debe existir una fila insertada en plots")

    const eosCalls = calls.filter((call) => call.url.startsWith("https://api-connect.eos.com"))
    assert.equal(eosCalls.length, 5, "Deben ejecutarse 5 llamadas EOS en el flujo polygon")
    assert.ok(
      calls.some(
        (call) =>
          call.url.startsWith(EOS_STATS_TASK_URL) &&
          call.method === "POST" &&
          hasBodyValue(call.body, "type", "mt_stats"),
      ),
      "Debe existir una creacion de tarea contra EOS stats",
    )
    assert.ok(
      calls.some((call) => call.url.startsWith(EOS_WEATHER_HISTORY_URL) && call.method === "POST"),
      "Debe existir la llamada al endpoint de weather history",
    )
    assert.ok(
      calls.some((call) => call.url.includes("/ndvi-task") && call.method === "GET"),
      "Debe existir el polling de la tarea NDVI",
    )
    assert.ok(
      calls.some((call) => call.url.includes("/soil-task") && call.method === "GET"),
      "Debe existir el polling de la tarea de soil moisture",
    )

    assert.equal(insertedPlot.farm_id, "farm-1")
    assert.equal(insertedPlot.name, "Lote Test")
    assert.equal(insertedPlot.group, 2)
    assert.equal(insertedPlot.crop_type, "soja")
    assert.equal(insertedPlot.status, "Sembrado")
    assert.equal(insertedPlot.sowing_date, "2026-02-10")
    assert.equal(insertedPlot.soil_ph, 6.5)
    assert.equal(insertedPlot.irrigation_type, "Drip")
    assert.equal(insertedPlot.fertilizer_type, "Organic")
    assert.equal(insertedPlot.pesticide_usage_ml, 12.5)
    assert.equal(insertedPlot.crop_disease_status, "None")
    assert.equal(insertedPlot.ndvi_index, 0.75)
    assert.equal(insertedPlot.soil_moisture_percent, 50)
    assert.equal(insertedPlot.temperature_c, 17.5)
    assert.equal(insertedPlot.rainfall_mm, 5.5)
    assert.equal(insertedPlot.humidity_percent, 70)
    assert.deepEqual(result.enrichment.appliedFields.sort(), [
      "humidity_percent",
      "ndvi_index",
      "rainfall_mm",
      "soil_moisture_percent",
      "temperature_c",
    ])
    assert.deepEqual(result.enrichment.warnings, [])
    assert.ok(result.prediction.predictedKgHa !== null, "Debe predecir el rinde del lote nuevo")
    assert.equal(result.prediction.basis.level, "departamento")
    assert.equal(result.prediction.basis.areaName, "25 de Mayo")
    assert.deepEqual(supabase.rowsFor("plot_prediction").map((row) => row.plot_id), [insertedPlot.id])
    assert.ok("geoJSON" in insertedPlot, "La fila insertada debe incluir geoJSON")
    assert.ok("polygon" in insertedPlot, "La fila insertada debe incluir polygon")

    for (const unexpectedKey of [
      "weather",
      "ndvi",
      "eosData",
      "source",
      "task_id",
      "ignored_field",
    ]) {
      assert.equal(
        unexpectedKey in insertedPlot,
        false,
        `No debe guardarse la clave irrelevante ${unexpectedKey} en plots`,
      )
    }

    console.log("Smoke test passed: createEnrichedPlot llama EOS, interpreta la respuesta y sube solo los campos esperados a Supabase.")
  } finally {
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
  }
}

function parseBody(body: RequestInit["body"]): unknown {
  if (typeof body !== "string") return null
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

function hasBodyValue(body: unknown, key: string, value: unknown) {
  return !!body && typeof body === "object" && key in body && body[key as keyof typeof body] === value
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
