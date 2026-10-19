/**
 * La columna `plots.group` llega con la migración 202610190001_add_plots_group.
 * Mientras una base no la tenga, PostgREST rechaza cualquier escritura que la incluya
 * ("Could not find the 'group' column of 'plots' in the schema cache"). En ese caso se
 * reintenta sin el campo: el lote se guarda y la UI usa el grupo 1 por defecto.
 */
export function isMissingGroupColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return (
    (code === "PGRST204" || code === undefined || code === null) &&
    typeof message === "string" &&
    message.includes("'group' column")
  )
}

export function withoutGroup<T extends Record<string, unknown>>(row: T): Omit<T, "group"> {
  const { group: _omit, ...rest } = row
  return rest
}
