/**
 * Ubica un punto en su provincia y departamento con la API de Georreferenciación del Estado
 * (apis.datos.gob.ar/georef, pública y sin clave). Los ids son los códigos INDEC: los mismos que
 * usan las Estimaciones Agrícolas del MAGyP ("06" Buenos Aires, "06623" Pergamino).
 */

const GEOREF_URL = "https://apis.datos.gob.ar/georef/api/ubicacion"
const TIMEOUT_MS = 5000

export interface AdminLocation {
  provinceId: string
  provinceName: string
  /** `null` en zonas sin departamento (p. ej. CABA en algunas respuestas). */
  departmentId: string | null
  departmentName: string | null
}

const cache = new Map<string, AdminLocation | null>()

interface GeorefEntity {
  id?: unknown
  nombre?: unknown
}

function entity(value: unknown): { id: string; name: string } | null {
  const e = value as GeorefEntity | null | undefined
  if (!e || typeof e.id !== "string" || !e.id) return null
  return { id: e.id, name: typeof e.nombre === "string" ? e.nombre : e.id }
}

/** `null` si el punto cae fuera del país o la API no responde (la predicción usa el nivel nacional). */
export async function lookupAdminLocation(
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminLocation | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`
  if (cache.has(key)) return cache.get(key) ?? null

  let location: AdminLocation | null = null
  try {
    const url = `${GEOREF_URL}?lat=${latitude}&lon=${longitude}`
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return null
    const body = (await response.json()) as { ubicacion?: Record<string, unknown> }
    const province = entity(body.ubicacion?.provincia)
    const department = entity(body.ubicacion?.departamento)
    location = province
      ? {
          provinceId: province.id,
          provinceName: province.name,
          departmentId: department?.id ?? null,
          departmentName: department?.name ?? null,
        }
      : null
  } catch {
    // Red caída o timeout: no se cachea, el próximo intento vuelve a consultar.
    return null
  }

  cache.set(key, location)
  return location
}
