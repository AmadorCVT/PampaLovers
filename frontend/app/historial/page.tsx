"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowRight,
  ChevronRight,
  CloudRain,
  Droplets,
  Eye,
  History,
  Ruler,
  Search,
  Sun,
  Thermometer,
  Trophy,
  Wheat,
} from "lucide-react"
import { fetchHarvestLogs, type HarvestLog } from "@/lib/supabase-api"
import { useFarmScope } from "@/components/farm-scope-context"
import {
  CropTag,
  DetailList,
  DetailRow,
  EmptyState,
  NdviMeter,
  PageHeader,
  StatTile,
  cropLabel,
} from "@/components/agro-ui"
import { riseIn } from "@/lib/motion"

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="ml-auto h-4 w-10" /></TableCell>
          <TableCell><Skeleton className="h-4 w-36" /></TableCell>
          <TableCell><Skeleton className="ml-auto h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="ml-auto h-2 w-20 rounded-full" /></TableCell>
          <TableCell><Skeleton className="ml-auto h-8 w-8 rounded-[10px]" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-AR", { dateStyle: "short" })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function HistorialPageInner() {
  const { selectedFarmId, farms } = useFarmScope()
  const [logs, setLogs] = useState<HarvestLog[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLog, setDetailLog] = useState<HarvestLog | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const data = await fetchHarvestLogs(
          selectedFarmId === "all"
            ? undefined
            : { farmId: selectedFarmId },
        )
        setLogs(data)
      } catch (err) {
        console.error("Error loading harvest logs:", err)
        setLogs([])
      }
      setLoading(false)
    }
    void loadData()
  }, [selectedFarmId])

  const filteredLogs = logs?.filter(
    (log) =>
      log.plot_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.crop_type ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const stats = useMemo(() => {
    const list = logs ?? []
    const yields = list
      .map((l) => Number(l.yield_kg_per_hectare))
      .filter((v) => Number.isFinite(v))
    const avg = yields.length ? yields.reduce((s, v) => s + v, 0) / yields.length : null
    let best: HarvestLog | null = null
    for (const l of list) {
      if (!best || Number(l.yield_kg_per_hectare) > Number(best.yield_kg_per_hectare)) best = l
    }
    const area = list.reduce((s, l) => s + (l.area_ha != null ? Number(l.area_ha) : 0), 0)
    return { count: list.length, avg, best, area }
  }, [logs])

  const selectedFarm = farms.find((f) => f.id === selectedFarmId)

  function openLog(log: HarvestLog) {
    setDetailLog(log)
    setDetailOpen(true)
  }

  const environment = detailLog
    ? [
        detailLog.soil_moisture_percent != null && {
          icon: Droplets,
          label: "Humedad suelo",
          value: `${String(detailLog.soil_moisture_percent)}%`,
        },
        detailLog.temperature_c != null && {
          icon: Thermometer,
          label: "Temperatura",
          value: `${String(detailLog.temperature_c)} °C`,
        },
        detailLog.humidity_percent != null && {
          icon: Droplets,
          label: "Humedad ambiente",
          value: `${String(detailLog.humidity_percent)}%`,
        },
        detailLog.rainfall_mm != null && {
          icon: CloudRain,
          label: "Precipitaciones",
          value: `${String(detailLog.rainfall_mm)} mm`,
        },
        detailLog.sunlight_hours != null && {
          icon: Sun,
          label: "Horas de sol",
          value: `${String(detailLog.sunlight_hours)} hs`,
        },
      ].filter(Boolean) as { icon: typeof Sun; label: string; value: string }[]
    : []

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={selectedFarm ? selectedFarm.name : "Todos los campos"}
        title="Historial de Cosechas"
        description={
          selectedFarmId === "all"
            ? "Registro histórico de todas las cosechas realizadas"
            : "Cosechas del campo seleccionado en la barra superior"
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          index={0}
          tone="forest"
          label="Cosechas registradas"
          icon={History}
          value={loading ? null : stats.count}
          loading={loading}
        />
        <StatTile
          index={1}
          label="Rendimiento promedio"
          icon={Wheat}
          value={loading ? null : stats.avg}
          unit="kg/ha"
          loading={loading}
        />
        <StatTile
          index={2}
          label="Mejor cosecha"
          icon={Trophy}
          tone="brand"
          value={loading ? null : stats.best ? Number(stats.best.yield_kg_per_hectare) : null}
          unit="kg/ha"
          loading={loading}
          hint={
            !loading && stats.best
              ? `${stats.best.plot_name} · ${formatDate(stats.best.harvest_date)}`
              : undefined
          }
        />
        <StatTile
          index={3}
          label="Superficie cosechada"
          icon={Ruler}
          value={loading ? null : stats.area}
          decimals={stats.area < 100 ? 1 : 0}
          unit="ha"
          loading={loading}
        />
      </div>

      <motion.section {...riseIn(5)} className="surface overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-[17px] font-semibold text-foreground">Cosechas Registradas</h2>
            <p className="text-[13.5px] text-muted-foreground">
              {loading
                ? "Cargando..."
                : `${filteredLogs?.length || 0} ${filteredLogs?.length === 1 ? "cosecha" : "cosechas"} en tu historial`}
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por lote o cultivo..."
              className="h-9 w-full rounded-[10px] pl-9 sm:w-[260px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar cosecha"
            />
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden border-t border-border/70 md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Lote</TableHead>
                <TableHead>Cultivo</TableHead>
                <TableHead className="text-right">Área (ha)</TableHead>
                <TableHead>Siembra → Cosecha</TableHead>
                <TableHead className="text-right">Rend. (kg/ha)</TableHead>
                <TableHead className="text-right">NDVI</TableHead>
                <TableHead className="w-[64px]">
                  <span className="sr-only">Detalle</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton />
              ) : filteredLogs && filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="group cursor-pointer"
                    onClick={() => openLog(log)}
                  >
                    <TableCell className="text-[14px] font-semibold text-foreground">
                      {log.plot_name}
                    </TableCell>
                    <TableCell>
                      <CropTag crop={log.crop_type} />
                    </TableCell>
                    <TableCell className="numeric text-right font-mono text-foreground">
                      {log.area_ha != null ? Number(log.area_ha) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-[13px]">
                        <span className="text-muted-foreground">{formatDate(log.sowing_date)}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground/60" />
                        <span className="font-medium text-foreground">{formatDate(log.harvest_date)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="numeric inline-flex items-center rounded-lg bg-status-harvested/12 px-2 py-1 font-mono text-[13px] font-semibold text-foreground">
                        {Number(log.yield_kg_per_hectare).toLocaleString("es-AR")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <NdviMeter value={log.ndvi_index != null ? Number(log.ndvi_index) : null} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto flex text-muted-foreground group-hover:text-foreground"
                        aria-label={`Ver detalle de ${log.plot_name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          openLog(log)
                        }}
                      >
                        <Eye />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-auto p-5">
                    <EmptyState
                      icon={Wheat}
                      title="No hay cosechas registradas."
                      description="Cuando coseches un lote desde «Mis Lotes», va a aparecer acá con el contexto ambiental del momento."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile */}
        <div className="space-y-2 border-t border-border/70 p-3 md:hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px] w-full rounded-2xl" />
            ))
          ) : filteredLogs && filteredLogs.length > 0 ? (
            filteredLogs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => openLog(log)}
                className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 p-4 text-left ring-1 ring-border/60 ring-inset transition-transform active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-foreground">{log.plot_name}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                    {cropLabel(log.crop_type)} · {formatDate(log.harvest_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="numeric font-mono text-[15px] font-semibold text-foreground">
                    {Number(log.yield_kg_per_hectare).toLocaleString("es-AR")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">kg/ha</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))
          ) : (
            <EmptyState icon={Wheat} title="No hay cosechas registradas." />
          )}
        </div>
      </motion.section>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de cosecha</DialogTitle>
            <DialogDescription>Snapshot del lote al momento de la cosecha.</DialogDescription>
          </DialogHeader>
          {detailLog ? (
            <div className="space-y-4">
              {/* Hero: yield */}
              <div className="relative isolate overflow-hidden rounded-2xl bg-sidebar p-5 text-sidebar-foreground">
                <div
                  aria-hidden
                  className="field-lines pointer-events-none absolute inset-0 -z-10 text-status-harvested opacity-50 [mask-image:radial-gradient(100%_100%_at_100%_0%,black,transparent_70%)]"
                />
                <p className="text-[13px] text-sidebar-foreground/60">
                  {detailLog.plot_name} · {cropLabel(detailLog.crop_type)}
                </p>
                <p className="mt-2 flex items-baseline gap-1.5">
                  <span className="numeric text-[38px] leading-none font-semibold tracking-[-0.04em]">
                    {Number(detailLog.yield_kg_per_hectare).toLocaleString("es-AR")}
                  </span>
                  <span className="text-[14px] text-sidebar-foreground/60">kg/ha</span>
                </p>
                <div className="mt-4 flex items-center gap-2 text-[12.5px]">
                  <span className="rounded-full bg-white/10 px-2.5 py-1">
                    Siembra {formatDate(detailLog.sowing_date)}
                  </span>
                  <ArrowRight className="size-3.5 text-sidebar-foreground/40" />
                  <span className="rounded-full bg-status-harvested px-2.5 py-1 font-semibold text-[oklch(0.25_0.05_70)]">
                    Cosecha {formatDate(detailLog.harvest_date)}
                  </span>
                </div>
              </div>

              <DetailList>
                <DetailRow label="Lote">{detailLog.plot_name}</DetailRow>
                <DetailRow label="Cultivo">{cropLabel(detailLog.crop_type)}</DetailRow>
                <DetailRow label="Área (ha)" mono>
                  {detailLog.area_ha != null ? String(detailLog.area_ha) : "—"}
                </DetailRow>
              </DetailList>

              <div className="space-y-2">
                <p className="eyebrow text-muted-foreground">Datos ambientales al cosechar</p>
                {detailLog.ndvi_index != null || environment.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {detailLog.ndvi_index != null ? (
                      <div className="col-span-2 rounded-xl bg-muted/60 p-3 ring-1 ring-border/60 ring-inset">
                        <p className="text-[12px] text-muted-foreground">NDVI</p>
                        <NdviMeter
                          value={Number(detailLog.ndvi_index)}
                          className="mt-1 justify-start [&>div:first-child]:w-full [&>div:first-child]:flex-1"
                        />
                      </div>
                    ) : null}
                    {environment.map(({ icon: Icon, label, value }) => (
                      <div key={label} className="rounded-xl bg-muted/60 p-3 ring-1 ring-border/60 ring-inset">
                        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                          <Icon className="size-3.5" />
                          {label}
                        </p>
                        <p className="numeric mt-1 font-mono text-[15px] font-semibold text-foreground">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">Sin datos ambientales.</p>
                )}
              </div>

              {(detailLog.soil_ph != null ||
                detailLog.irrigation_type ||
                detailLog.fertilizer_type ||
                detailLog.pesticide_usage_ml != null ||
                detailLog.crop_disease_status) && (
                <div className="space-y-2">
                  <p className="eyebrow text-muted-foreground">Manejo del cultivo</p>
                  <DetailList>
                    {detailLog.soil_ph != null && (
                      <DetailRow label="pH del suelo" mono>{String(detailLog.soil_ph)}</DetailRow>
                    )}
                    {detailLog.irrigation_type && (
                      <DetailRow label="Riego">{detailLog.irrigation_type}</DetailRow>
                    )}
                    {detailLog.fertilizer_type && (
                      <DetailRow label="Fertilizante">{detailLog.fertilizer_type}</DetailRow>
                    )}
                    {detailLog.pesticide_usage_ml != null && (
                      <DetailRow label="Pesticida" mono>{String(detailLog.pesticide_usage_ml)} ml</DetailRow>
                    )}
                    {detailLog.crop_disease_status && (
                      <DetailRow label="Estado sanitario">{detailLog.crop_disease_status}</DetailRow>
                    )}
                  </DetailList>
                </div>
              )}

              {detailLog.notes && (
                <div className="space-y-1">
                  <p className="eyebrow text-muted-foreground">Notas</p>
                  <p className="text-[13.5px] leading-relaxed text-foreground">{detailLog.notes}</p>
                </div>
              )}
              <p className="text-right text-[12px] text-muted-foreground">
                Registrado {formatDateTime(detailLog.created_at)}
              </p>
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Sin datos.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDetailOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function HistorialPage() {
  return (
    <DashboardLayout>
      <HistorialPageInner />
    </DashboardLayout>
  )
}
