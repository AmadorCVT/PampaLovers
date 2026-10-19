"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Plus,
  Minus,
  Crosshair,
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  TriangleAlert,
} from "lucide-react"
import { fetchLots, type Lot } from "@/lib/supabase-api"
import { useFarmScope } from "@/components/farm-scope-context"
import {
  SatelliteMap,
  type SatelliteMapHandle,
} from "@/components/satellite-map"
import { MapTypeSegmented } from "@/components/lot-polygon-map-picker"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { CropTag, PageHeader } from "@/components/agro-ui"
import { riseIn } from "@/lib/motion"

function lotHasPolygon(lot: Lot): boolean {
  return !!(lot.polygon && lot.polygon.length >= 3)
}

function MapButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center text-foreground transition-[background-color,transform,opacity] hover:bg-foreground/[0.06] active:scale-90 disabled:opacity-35"
    >
      {children}
    </button>
  )
}

function SatelitePageInner() {
  const { selectedFarmId, farms } = useFarmScope()
  const mapRef = useRef<SatelliteMapHandle>(null)
  const [mapType, setMapType] = useState<"satellite" | "streets">("satellite")
  const [lots, setLots] = useState<Lot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [hiddenPlotIds, setHiddenPlotIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        setLots(
          await fetchLots(
            selectedFarmId === "all"
              ? undefined
              : { farmId: selectedFarmId },
          ),
        )
      } catch {
        setLots([])
      }
      setLoading(false)
    }
    void loadData()
  }, [selectedFarmId])

  const satellitePlots = useMemo(() => {
    if (!lots) return []
    return lots
      .filter((l) => lotHasPolygon(l))
      .map((l) => ({
        id: l.id,
        name: l.name,
        polygon: l.polygon!,
      }))
  }, [lots])

  const visiblePlotsOnMap = useMemo(
    () => satellitePlots.filter((p) => !hiddenPlotIds.has(p.id)),
    [satellitePlots, hiddenPlotIds],
  )

  const lotsByGroup = useMemo(() => {
    if (!lots) return []
    const m = new Map<number, Lot[]>()
    for (const lot of lots) {
      const g = lot.plotGroup
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(lot)
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([group, items]) => ({
        group,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name, "es")),
      }))
  }, [lots])

  const mappablePlotIds = useMemo(() => satellitePlots.map((p) => p.id), [satellitePlots])

  function togglePlotOnMap(id: string) {
    setHiddenPlotIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setGroupOnMap(groupLots: Lot[], visible: boolean) {
    const ids = groupLots.filter(lotHasPolygon).map((l) => l.id)
    if (ids.length === 0) return
    setHiddenPlotIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (visible) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  function showAllPlotsOnMap() {
    setHiddenPlotIds(new Set())
  }

  function hideAllPlotsOnMap() {
    setHiddenPlotIds(new Set(mappablePlotIds))
  }

  const showPolygonApproximationNotice = useMemo(
    () => lots?.some((l) => l.polygonApproximated) ?? false,
    [lots],
  )

  const selectedFarm = farms.find((f) => f.id === selectedFarmId)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={selectedFarm ? selectedFarm.name : "Todos los campos"}
        title="Vista Satelital"
        description={
          selectedFarmId === "all"
            ? "Mapa base con tus lotes dibujados cuando tengan polígono guardado en la base."
            : "Lotes del campo seleccionado en la barra superior."
        }
      />

      {showPolygonApproximationNotice ? (
        <motion.div
          {...riseIn(1)}
          role="status"
          className="flex gap-3 rounded-2xl bg-status-harvested/10 p-4 ring-1 ring-status-harvested/30 ring-inset"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-status-harvested/20 text-[color-mix(in_oklch,var(--status-harvested)_60%,var(--foreground))]">
            <TriangleAlert className="size-4" aria-hidden />
          </span>
          <div className="space-y-0.5">
            <p className="text-[14px] font-semibold text-foreground">Algunos lotes sin contorno guardado</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Tenés al menos un lote cargado antes de guardar el polígono en la base: en el mapa se muestra un cuadrado
              aproximado por ubicación y superficie. Los lotes nuevos usan el trazo real que marcaste.
            </p>
          </div>
        </motion.div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <motion.div
          {...riseIn(2)}
          className="relative isolate h-[min(72svh,720px)] min-h-[440px] overflow-hidden rounded-3xl bg-muted shadow-raised ring-1 ring-border/60"
        >
          <SatelliteMap
            ref={mapRef}
            mapType={mapType}
            plots={visiblePlotsOnMap}
            navigationPlots={satellitePlots}
            autoFit
            className="absolute inset-0 z-0 h-full w-full [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:bg-muted"
          />

          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="pointer-events-auto absolute top-4 left-4">
              <MapTypeSegmented value={mapType} onChange={setMapType} layoutId="satellite-map-type" />
            </div>

            <div className="pointer-events-auto absolute top-4 right-4 flex flex-col items-end gap-2">
              <div className="material-thick material-edge flex flex-col divide-y divide-border/70 overflow-hidden rounded-2xl shadow-raised">
                <MapButton label="Acercar mapa" onClick={() => mapRef.current?.zoomIn()}>
                  <Plus className="size-[18px]" />
                </MapButton>
                <MapButton label="Alejar mapa" onClick={() => mapRef.current?.zoomOut()}>
                  <Minus className="size-[18px]" />
                </MapButton>
              </div>
            </div>

            <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={satellitePlots.length === 0}
                onClick={() => mapRef.current?.fitToPlots()}
                aria-label="Centrar mapa en mis lotes"
                className="flex h-10 items-center gap-2 rounded-full bg-primary pr-4 pl-3 text-[13px] font-semibold text-primary-foreground shadow-raised transition-[transform,opacity] active:scale-95 disabled:opacity-50"
              >
                <Crosshair className="size-4" />
                Ir a mis lotes
              </button>
              <span className="material-thick material-edge numeric flex h-10 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold text-foreground shadow-raised">
                <Layers className="size-3.5 text-muted-foreground" />
                {loading ? "Cargando…" : `${visiblePlotsOnMap.length} de ${satellitePlots.length} lotes visibles`}
              </span>
            </div>
          </div>
        </motion.div>

        <motion.aside {...riseIn(3)} className="surface flex max-h-[min(72svh,720px)] min-h-[320px] flex-col overflow-hidden">
          <div className="space-y-3 border-b border-border/70 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold text-foreground">Lotes en el mapa</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={mappablePlotIds.length === 0 || loading}
                  onClick={showAllPlotsOnMap}
                  className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-muted-foreground ring-1 ring-border ring-inset transition-[color,transform] hover:text-foreground active:scale-95 disabled:opacity-40"
                >
                  <Eye className="size-3.5" />
                  Mostrar todos
                </button>
                <button
                  type="button"
                  disabled={mappablePlotIds.length === 0 || loading}
                  onClick={hideAllPlotsOnMap}
                  className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-muted-foreground ring-1 ring-border ring-inset transition-[color,transform] hover:text-foreground active:scale-95 disabled:opacity-40"
                >
                  <EyeOff className="size-3.5" />
                  Ocultar todos
                </button>
              </div>
            </div>
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Activá o desactivá lotes por grupo. El mapa usa el polígono guardado en la base; los lotes viejos sin
              ese dato se muestran con una vista aproximada.
            </p>
          </div>

          <div className="scroll-fade-b min-h-0 flex-1 overflow-y-auto p-3">
            {loading || !lots ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : lotsByGroup.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No hay lotes en tu cuenta.</p>
            ) : (
              <div className="space-y-2 pb-4">
                {lotsByGroup.map(({ group, items }) => {
                  const mappable = items.filter(lotHasPolygon)
                  const groupChecked =
                    mappable.length === 0
                      ? true
                      : mappable.every((l) => !hiddenPlotIds.has(l.id))
                  const farmLabel =
                    items.length > 0 &&
                    Boolean(items[0].farmName) &&
                    items.every((l) => l.farmName === items[0].farmName)
                      ? items[0].farmName
                      : null

                  return (
                    <Collapsible key={group} defaultOpen className="overflow-hidden rounded-2xl bg-muted/50 ring-1 ring-border/60 ring-inset">
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <CollapsibleTrigger className="group/trigger flex min-w-0 flex-1 items-center gap-2 text-left text-[13.5px] font-semibold text-foreground outline-none">
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-spring-fast group-data-[state=closed]/trigger:-rotate-90" />
                          <span className="truncate">Grupo {group}</span>
                          <span className="numeric text-[12px] font-medium text-muted-foreground">{items.length}</span>
                          {farmLabel ? (
                            <span className="ml-1 max-w-[8rem] truncate rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border/60">
                              {farmLabel}
                            </span>
                          ) : null}
                        </CollapsibleTrigger>
                        <Switch
                          checked={groupChecked}
                          disabled={mappable.length === 0}
                          onCheckedChange={(v) => setGroupOnMap(items, v)}
                          aria-label={
                            mappable.length === 0
                              ? `Grupo ${group} sin polígonos en mapa`
                              : groupChecked
                                ? `Ocultar todos los lotes del grupo ${group}`
                                : `Mostrar todos los lotes del grupo ${group}`
                          }
                        />
                      </div>
                      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                        <ul className="space-y-0.5 px-1.5 pb-1.5">
                          {items.map((lot) => {
                            const mappableLot = lotHasPolygon(lot)
                            const onMap = mappableLot && !hiddenPlotIds.has(lot.id)
                            return (
                              <li
                                key={lot.id}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-xl bg-card px-2.5 py-2 transition-opacity duration-200",
                                  !onMap && mappableLot && "opacity-60",
                                )}
                              >
                                <Switch
                                  checked={onMap}
                                  disabled={!mappableLot}
                                  onCheckedChange={() => mappableLot && togglePlotOnMap(lot.id)}
                                  aria-label={
                                    mappableLot
                                      ? onMap
                                        ? `Ocultar ${lot.name} del mapa`
                                        : `Mostrar ${lot.name} en el mapa`
                                      : `${lot.name} sin polígono`
                                  }
                                />
                                <button
                                  type="button"
                                  disabled={!mappableLot}
                                  onClick={() => mappableLot && mapRef.current?.flyToLot(lot.id)}
                                  className={cn(
                                    "min-w-0 flex-1 text-left",
                                    !mappableLot && "cursor-not-allowed opacity-50",
                                  )}
                                >
                                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                                    {lot.name}
                                  </span>
                                  <CropTag crop={lot.crop} className="text-[12px] font-normal text-muted-foreground" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!mappableLot}
                                  aria-label={`Centrar mapa en ${lot.name}`}
                                  onClick={() => mapRef.current?.flyToLot(lot.id)}
                                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground active:scale-90 disabled:opacity-30"
                                >
                                  <Crosshair className="size-4" />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
              </div>
            )}
          </div>
        </motion.aside>
      </div>
    </div>
  )
}

export default function SatelitePage() {
  return (
    <DashboardLayout>
      <SatelitePageInner />
    </DashboardLayout>
  )
}
