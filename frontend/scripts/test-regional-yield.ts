import assert from "node:assert/strict"

import regionalYields from "../data/regional-yields.json"
import {
  campaignForDate,
  estimateRegionalYield,
  type RegionalYieldData,
} from "../lib/ml/regional-yield"

const data = regionalYields as unknown as RegionalYieldData

// Campaña agrícola según fecha de siembra (mayo → abril).
assert.equal(campaignForDate("2026-06-10"), "2026/27", "trigo sembrado en junio")
assert.equal(campaignForDate("2026-10-01"), "2026/27", "maíz temprano")
assert.equal(campaignForDate("2027-01-10"), "2026/27", "soja de segunda en enero sigue en la campaña")
assert.equal(campaignForDate("2026-04-30"), "2025/26")

// Datos: los 8 cultivos de la app, con series nacionales completas.
assert.deepEqual(Object.keys(data.crops).sort(), ["1", "2", "3", "4", "5", "6", "7", "8"])
assert.equal(data.campaigns[0], "2000/01")
assert.ok(data.params, "guarda los parámetros elegidos en la evaluación")

// Jerarquía: departamento → provincia → nacional.
const byDepartment = estimateRegionalYield(data, { crop: 2, departmentId: "06623", campaign: "2026/27" })!
assert.equal(byDepartment.level, "departamento")
assert.equal(byDepartment.areaName, "Pergamino")
const byProvince = estimateRegionalYield(data, { crop: 2, departmentId: "99999", provinceId: "06", campaign: "2026/27" })!
assert.equal(byProvince.level, "provincia")
const byCountry = estimateRegionalYield(data, { crop: 2, campaign: "2026/27" })!
assert.equal(byCountry.level, "nacional")
assert.ok(byDepartment.kgHa > byCountry.kgHa, "Pergamino (zona núcleo) rinde más maíz que el promedio del país")

// Solo usa campañas anteriores: predecir 2022/23 (sequía) no puede ver la caída de ese año.
const drought = estimateRegionalYield(data, { crop: 1, departmentId: "06623", campaign: "2022/23" })!
const actual2022 = data.crops["1"].departments["06623"].yields[22]
assert.ok(actual2022 !== null && drought.kgHa > actual2022 * 1.3, "no mira el dato real de la campaña")

// Cultivo inexistente: sin estimación.
assert.equal(estimateRegionalYield(data, { crop: 99, campaign: "2026/27" }), null)

console.log(
  `maíz 2026/27: Pergamino ${byDepartment.kgHa} · Buenos Aires ${byProvince.kgHa} · país ${byCountry.kgHa} kg/ha`,
)
console.log("test-regional-yield: OK")
