"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AnimatePresence, motion } from "motion/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BrainCircuit,
  Eye,
  Filter,
  Leaf,
  Map as MapIcon,
  MoreHorizontal,
  Pencil,
  Ruler,
  Search,
  Sprout,
  Trash2,
  Wheat,
  X,
} from "lucide-react"
import {
  fetchLots,
  getPlotRow,
  updatePlot,
  deletePlot,
  harvestPlot,
  startPlotNewCycle,
  type Lot,
  type DbPlot,
} from "@/lib/supabase-api"
import { NewLotForm } from "@/components/new-lot-form"
import { useFarmScope } from "@/components/farm-scope-context"
import {
  CropTag,
  DetailList,
  DetailRow,
  EmptyState,
  NdviMeter,
  PageHeader,
  StatTile,
  StatusPill,
  cropKey,
  cropLabel,
  ndviColor,
} from "@/components/agro-ui"
import { riseIn, spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

const PLOT_STATUSES = [
  "Sembrado",
  "Crecimiento",
  "Cosechado",
  "Barbecho",
] as const satisfies readonly DbPlot["status"][]

const STATUS_BAR: Record<(typeof PLOT_STATUSES)[number], string> = {
  Sembrado: "bg-status-sown",
  Crecimiento: "bg-status-growing",
  Cosechado: "bg-status-harvested",
  Barbecho: "bg-status-fallow",
}

const CROP_TYPES = [
  "Soja",
  "Maíz",
  "Trigo",
  "Girasol",
  "Sorgo",
  "Cebada",
  "Arroz",
  "Algodón",
] as const

const NEW_CYCLE_IRRIGATION = ["Drip", "Sprinkle", "Manual", "None"] as const
const NEW_CYCLE_FERTILIZER = ["Organic", "Inorganic", "Mixed", "None"] as const
const NEW_CYCLE_DISEASE = ["None", "Mild", "Moderate", "Severe"] as const

const IRRIGATION_LABELS: Record<(typeof NEW_CYCLE_IRRIGATION)[number], string> = {
  Drip: "Goteo",
  Sprinkle: "Aspersión",
  Manual: "Manual",
  None: "Sin riego",
}
const FERTILIZER_LABELS: Record<(typeof NEW_CYCLE_FERTILIZER)[number], string> = {
  Organic: "Orgánico",
  Inorganic: "Inorgánico",
  Mixed: "Mixto",
  None: "Ninguno",
}
const DISEASE_LABELS: Record<(typeof NEW_CYCLE_DISEASE)[number], string> = {
  None: "Sin problemas",
  Mild: "Leve",
  Moderate: "Moderado",
  Severe: "Severo",
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2 h-3 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-10" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-2 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-8 w-24 rounded-[10px]" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
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

function formatKg(value: number | null) {
  return value != null
    ? `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg/ha`
    : "—"
}

type LotTarget = { id: string; name: string }

function LotActions({
  lot,
  disabled,
  onHarvest,
  onNewCycle,
  onDetail,
  onEdit,
  onDelete,
}: {
  lot: Lot
  disabled: boolean
  onHarvest: (lot: LotTarget) => void
  onNewCycle: (lot: LotTarget) => void
  onDetail: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (lot: LotTarget) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {(lot.status === "Sembrado" || lot.status === "Crecimiento") && (
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          title="Cosechar"
          aria-label="Cosechar lote"
          onClick={() => onHarvest({ id: lot.id, name: lot.name })}
          className="bg-status-harvested/15 text-[color-mix(in_oklch,var(--status-harvested)_55%,var(--foreground))] shadow-none ring-1 ring-status-harvested/30 ring-inset hover:bg-status-harvested/25"
        >
          <Wheat />
          <span className="hidden sm:inline">Cosechar</span>
        </Button>
      )}
      {lot.status === "Barbecho" && (
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          title="Nuevo ciclo"
          aria-label="Iniciar nuevo ciclo de siembra"
          onClick={() => onNewCycle({ id: lot.id, name: lot.name })}
          className="bg-status-growing/15 text-[color-mix(in_oklch,var(--status-growing)_55%,var(--foreground))] shadow-none ring-1 ring-status-growing/30 ring-inset hover:bg-status-growing/25"
        >
          <Sprout />
          <span className="hidden sm:inline">Plantar</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground data-[state=open]:bg-accent"
            disabled={disabled}
            aria-label={`Más acciones para ${lot.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={(ev) => ev.preventDefault()}
            onClick={() => void onDetail(lot.id)}
          >
            <Eye /> Ver detalles
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(ev) => ev.preventDefault()}
            onClick={() => void onEdit(lot.id)}
          >
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(ev) => ev.preventDefault()}
            onClick={() => onDelete({ id: lot.id, name: lot.name })}
          >
            <Trash2 /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function LotesPageInner() {
  const {
    farms,
    loading: farmsLoading,
    selectedFarmId,
  } = useFarmScope()
  const [lots, setLots] = useState<Lot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | DbPlot["status"]>("all")
  const [cropFilter, setCropFilter] = useState<string>("all")

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailPlot, setDetailPlot] = useState<DbPlot | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editName, setEditName] = useState("")
  const [editCrop, setEditCrop] = useState("")
  const [editArea, setEditArea] = useState("")
  const [editStatus, setEditStatus] = useState<DbPlot["status"]>("Sembrado")
  const [editDescription, setEditDescription] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editGroup, setEditGroup] = useState("")

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [harvestOpen, setHarvestOpen] = useState(false)
  const [harvestTarget, setHarvestTarget] = useState<{ id: string; name: string } | null>(null)
  const [harvestLoading, setHarvestLoading] = useState(false)
  const [harvestDate, setHarvestDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [harvestYield, setHarvestYield] = useState("")

  const [cycleOpen, setCycleOpen] = useState(false)
  const [cycleTarget, setCycleTarget] = useState<{ id: string; name: string } | null>(null)
  const [cycleLoading, setCycleLoading] = useState(false)
  const [cycleCrop, setCycleCrop] = useState("")
  const [cycleSowingDate, setCycleSowingDate] = useState("")
  const [cycleSoilPh, setCycleSoilPh] = useState("")
  const [cycleIrrigation, setCycleIrrigation] = useState<string>("None")
  const [cycleFertilizer, setCycleFertilizer] = useState<string>("None")
  const [cyclePesticideMl, setCyclePesticideMl] = useState("")
  const [cycleDisease, setCycleDisease] = useState<string>("None")

  function lotsScope() {
    return selectedFarmId === "all"
      ? undefined
      : { farmId: selectedFarmId }
  }

  async function refreshLots() {
    const data = await fetchLots(lotsScope())
    setLots(data)
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const lotsData = await fetchLots(lotsScope())
        setLots(lotsData)
      } catch (err) {
        console.error("Error loading lots:", err)
        setLots([])
      }
      setLoading(false)
    }
    void loadData()
  }, [selectedFarmId])

  async function openDetail(lotId: string) {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailPlot(null)
    try {
      const row = await getPlotRow(lotId)
      setDetailPlot(row)
      if (!row) toast.error("No se pudo cargar el lote")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar el lote")
    }
    setDetailLoading(false)
  }

  async function openEdit(lotId: string) {
    setEditOpen(true)
    setEditId(lotId)
    setEditLoading(true)
    try {
      const row = await getPlotRow(lotId)
      if (!row) {
        toast.error("No se pudo cargar el lote")
        setEditOpen(false)
        setEditId(null)
        return
      }
      setEditName(row.name)
      setEditCrop(
        CROP_TYPES.find((c) => cropKey(c) === cropKey(row.crop_type)) ??
          row.crop_type ??
          "",
      )
      setEditArea(
        row.area_ha != null && Number(row.area_ha) > 0
          ? String(row.area_ha)
          : "",
      )
      setEditStatus(row.status)
      setEditDescription(row.description ?? "")
      setEditNotes(row.notes ?? "")
      setEditGroup(String(row.group ?? 1))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar el lote")
      setEditOpen(false)
      setEditId(null)
    }
    setEditLoading(false)
  }

  function closeEdit() {
    setEditOpen(false)
    setEditId(null)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const parsedGroup = parseInt(editGroup, 10)
    if (!editName.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }
    if (!Number.isFinite(parsedGroup)) {
      toast.error("El grupo debe ser un número válido")
      return
    }
    let areaHa: number | null | undefined
    if (editArea.trim() === "") {
      areaHa = null
    } else {
      const a = parseFloat(editArea.replace(",", "."))
      if (!Number.isFinite(a) || a <= 0) {
        toast.error("El área debe ser un número mayor a 0")
        return
      }
      areaHa = a
    }

    setEditSaving(true)
    try {
      await updatePlot(editId, {
        name: editName.trim(),
        crop_type: editCrop.trim() ? editCrop.trim() : null,
        area_ha: areaHa,
        status: editStatus,
        description: editDescription.trim() || null,
        notes: editNotes.trim() || null,
        group: parsedGroup,
      })
      toast.success("Lote actualizado")
      closeEdit()
      await refreshLots()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar el lote",
      )
    }
    setEditSaving(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await deletePlot(deleteTarget.id)
      toast.success("Lote eliminado")
      setDeleteOpen(false)
      await refreshLots()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar el lote",
      )
    }
    setDeleteLoading(false)
  }

  function openHarvest(lot: { id: string; name: string }) {
    setHarvestTarget(lot)
    setHarvestDate(new Date().toISOString().slice(0, 10))
    setHarvestYield("")
    setHarvestOpen(true)
  }

  async function confirmHarvest() {
    if (!harvestTarget) return
    const parsedYield = parseFloat(harvestYield.replace(",", "."))
    if (!Number.isFinite(parsedYield) || parsedYield < 0) {
      toast.error("El rendimiento debe ser un número válido mayor o igual a 0")
      return
    }
    if (!harvestDate) {
      toast.error("La fecha de cosecha es obligatoria")
      return
    }
    setHarvestLoading(true)
    try {
      await harvestPlot(harvestTarget.id, {
        harvest_date: harvestDate,
        yield_kg_per_hectare: parsedYield,
      })
      toast.success(`"${harvestTarget.name}" cosechado y registrado en historial`)
      setHarvestOpen(false)
      await refreshLots()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al cosechar el lote",
      )
    }
    setHarvestLoading(false)
  }

  function openNewCycle(lot: { id: string; name: string }) {
    setCycleTarget(lot)
    setCycleCrop("")
    setCycleSowingDate(new Date().toISOString().slice(0, 10))
    setCycleSoilPh("")
    setCycleIrrigation("None")
    setCycleFertilizer("None")
    setCyclePesticideMl("")
    setCycleDisease("None")
    setCycleOpen(true)
  }

  async function confirmNewCycle() {
    if (!cycleTarget) return
    if (!cycleCrop.trim()) {
      toast.error("Elegí un cultivo")
      return
    }
    if (!cycleSowingDate.trim()) {
      toast.error("La fecha de siembra es obligatoria")
      return
    }
    let soilPh: number | null = null
    if (cycleSoilPh.trim() !== "") {
      const p = parseFloat(cycleSoilPh.replace(",", "."))
      if (!Number.isFinite(p) || p < 0 || p > 14) {
        toast.error("El pH debe estar entre 0 y 14")
        return
      }
      soilPh = p
    }
    let pestMl: number | null = null
    if (cyclePesticideMl.trim() !== "") {
      const m = parseFloat(cyclePesticideMl.replace(",", "."))
      if (!Number.isFinite(m) || m < 0) {
        toast.error("El pesticida debe ser un número mayor o igual a 0")
        return
      }
      pestMl = m
    }
    setCycleLoading(true)
    try {
      await startPlotNewCycle(cycleTarget.id, {
        crop_type: cycleCrop.trim(),
        sowing_date: cycleSowingDate.trim(),
        soil_ph: soilPh,
        irrigation_type: cycleIrrigation,
        fertilizer_type: cycleFertilizer,
        pesticide_usage_ml: pestMl,
        crop_disease_status: cycleDisease,
      })
      toast.success(`Nuevo ciclo iniciado en "${cycleTarget.name}"`)
      setCycleOpen(false)
      await refreshLots()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al iniciar el ciclo",
      )
    }
    setCycleLoading(false)
  }

  function requestDelete(lot: LotTarget) {
    setDeleteTarget(lot)
    setDeleteOpen(true)
  }

  const query = searchQuery.toLowerCase()
  const filteredLots = lots?.filter(
    (lot) =>
      (lot.name.toLowerCase().includes(query) ||
        lot.crop.toLowerCase().includes(query)) &&
      (statusFilter === "all" || lot.status === statusFilter) &&
      (cropFilter === "all" || cropKey(lot.crop) === cropFilter),
  )

  const stats = useMemo(() => {
    const list = lots ?? []
    const active = list.filter(
      (l) => l.status === "Sembrado" || l.status === "Crecimiento",
    ).length
    const area = list.reduce((s, l) => s + (Number(l.area) || 0), 0)
    const withNdvi = list.filter((l) => Number.isFinite(l.ndvi) && l.ndvi > 0)
    const ndvi = withNdvi.length
      ? withNdvi.reduce((s, l) => s + l.ndvi, 0) / withNdvi.length
      : null
    const withMl = list.filter((l) => l.mlPredictedKgHa != null)
    const ml = withMl.length
      ? withMl.reduce((s, l) => s + (l.mlPredictedKgHa ?? 0), 0) / withMl.length
      : null
    const byStatus = Object.fromEntries(
      PLOT_STATUSES.map((s) => [s, list.filter((l) => l.status === s).length]),
    ) as Record<(typeof PLOT_STATUSES)[number], number>
    const crops = new Map<string, string>()
    for (const l of list) {
      const k = cropKey(l.crop)
      if (k && !crops.has(k)) crops.set(k, cropLabel(l.crop))
    }
    return {
      count: list.length,
      active,
      area,
      ndvi,
      ml,
      mlCount: withMl.length,
      byStatus,
      crops: [...crops.entries()].sort((a, b) => a[1].localeCompare(b[1], "es")),
    }
  }, [lots])

  const filtersActive =
    statusFilter !== "all" || cropFilter !== "all" || searchQuery.trim() !== ""

  function clearFilters() {
    setStatusFilter("all")
    setCropFilter("all")
    setSearchQuery("")
  }

  const selectedFarm = farms.find((farm) => farm.id === selectedFarmId) ?? null
  const newLotFarmId = selectedFarm?.id ?? null
  const newLotDisabledReason = farmsLoading
    ? "Estamos cargando tus granjas. En un momento vas a poder crear un lote."
    : farms.length === 0
      ? "Todavía no tenés ninguna granja creada. Crea una desde el selector superior para habilitar Nuevo Lote."
      : "Selecciona una granja en el selector superior para habilitar Nuevo Lote."

  const showFarmColumn = selectedFarmId === "all"

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={selectedFarm ? selectedFarm.name : "Todos los campos"}
        title="Administrar Lotes"
        description={
          selectedFarmId === "all"
            ? "Gestiona y monitorea todos tus lotes agrícolas"
            : "Lotes del campo seleccionado en la barra superior"
        }
        actions={
          <NewLotForm
            farmId={newLotFarmId}
            disabledReason={newLotFarmId ? null : newLotDisabledReason}
            onSuccess={refreshLots}
          />
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          index={0}
          tone="forest"
          label="Lotes"
          icon={MapIcon}
          value={loading ? null : stats.count}
          loading={loading}
          hint={loading ? undefined : `${stats.active} en ciclo activo`}
        />
        <StatTile
          index={1}
          label="Superficie total"
          icon={Ruler}
          value={loading ? null : stats.area}
          decimals={stats.area < 100 ? 1 : 0}
          unit="ha"
          loading={loading}
          hint="Suma del área de los lotes"
        />
        <StatTile
          index={2}
          label="NDVI promedio"
          icon={Leaf}
          tone="brand"
          value={loading ? null : stats.ndvi}
          decimals={2}
          loading={loading}
        >
          {!loading && stats.ndvi != null ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(1, stats.ndvi)) * 100}%` }}
                transition={{ ...spring.move, duration: 0.9 }}
                className="h-full rounded-full"
                style={{ backgroundColor: ndviColor(stats.ndvi) }}
              />
            </div>
          ) : !loading ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">Sin datos de NDVI</p>
          ) : null}
        </StatTile>
        <StatTile
          index={3}
          label="Estimado ML promedio"
          icon={BrainCircuit}
          value={loading ? null : stats.ml}
          unit="kg/ha"
          loading={loading}
          hint={
            loading
              ? undefined
              : stats.mlCount > 0
                ? `Sobre ${stats.mlCount} lote${stats.mlCount === 1 ? "" : "s"} con predicción`
                : "Todavía sin predicciones"
          }
        />
      </div>

      <motion.section {...riseIn(5)} className="surface overflow-hidden">
        {/* Toolbar */}
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[17px] font-semibold text-foreground">Todos los Lotes</h2>
              <p className="text-[13.5px] text-muted-foreground">
                {loading
                  ? "Cargando..."
                  : filtersActive
                    ? `${filteredLots?.length || 0} de ${stats.count} lotes ${filteredLots?.length === 1 ? "coincide" : "coinciden"} con los filtros`
                    : `${filteredLots?.length || 0} ${filteredLots?.length === 1 ? "lote registrado" : "lotes registrados"} en tu cuenta`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar lote o cultivo..."
                  className="h-9 w-full rounded-[10px] pl-9 sm:w-[240px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar lote"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 gap-2",
                      cropFilter !== "all" && "shadow-[0_0_0_1.5px_var(--ring)]",
                    )}
                  >
                    <Filter />
                    {cropFilter === "all"
                      ? "Filtrar"
                      : (stats.crops.find(([k]) => k === cropFilter)?.[1] ?? "Cultivo")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="eyebrow px-2.5 text-muted-foreground">
                    Cultivo
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={cropFilter} onValueChange={setCropFilter}>
                    <DropdownMenuRadioItem value="all">Todos los cultivos</DropdownMenuRadioItem>
                    {stats.crops.map(([key, label]) => (
                      <DropdownMenuRadioItem key={key} value={key}>
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <AnimatePresence initial={false}>
                {filtersActive ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={spring.snappy}
                  >
                    <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
                      <X />
                      Limpiar
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {/* Status distribution doubles as a filter */}
          {!loading && stats.count > 0 ? (
            <div className="space-y-3">
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                {PLOT_STATUSES.map((s) =>
                  stats.byStatus[s] > 0 ? (
                    <motion.div
                      key={s}
                      initial={{ flexGrow: 0 }}
                      animate={{ flexGrow: stats.byStatus[s] }}
                      transition={{ ...spring.move, duration: 0.8 }}
                      className={cn(
                        "h-full min-w-1 transition-opacity duration-200",
                        STATUS_BAR[s],
                        statusFilter !== "all" && statusFilter !== s && "opacity-25",
                      )}
                    />
                  ) : null,
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrar por estado">
                {(["all", ...PLOT_STATUSES] as const).map((s) => {
                  const active = statusFilter === s
                  const count = s === "all" ? stats.count : stats.byStatus[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStatusFilter(s)}
                      className={cn(
                        "relative z-0 inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] font-semibold transition-[color,transform] duration-150 active:scale-95",
                        active
                          ? "text-background"
                          : "text-muted-foreground ring-1 ring-border ring-inset hover:text-foreground",
                      )}
                    >
                      {active ? (
                        <motion.span
                          layoutId="lot-status-filter"
                          transition={spring.snappy}
                          className="absolute inset-0 -z-10 rounded-full bg-foreground"
                        />
                      ) : null}
                      {s !== "all" ? (
                        <span className={cn("size-2 rounded-full", STATUS_BAR[s])} />
                      ) : null}
                      {s === "all" ? "Todos" : s}
                      <span className={cn("numeric", active ? "opacity-70" : "opacity-60")}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Desktop table */}
        <div className="hidden border-t border-border/70 md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Lote</TableHead>
                <TableHead>Cultivo</TableHead>
                <TableHead className="text-right">Área (ha)</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">NDVI</TableHead>
                <TableHead className="text-right">Estimado ML (kg/ha)</TableHead>
                <TableHead className="w-[150px]">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton />
              ) : filteredLots && filteredLots.length > 0 ? (
                filteredLots.map((lot) => (
                  <TableRow key={lot.id} className="group">
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => void openDetail(lot.id)}
                        className="block max-w-[240px] text-left outline-none focus-visible:underline"
                      >
                        <span className="block truncate text-[14px] font-semibold text-foreground transition-colors group-hover:text-brand-ink">
                          {lot.name}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          Grupo {lot.plotGroup}
                          {showFarmColumn && lot.farmName ? ` · ${lot.farmName}` : ""}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <CropTag crop={lot.crop} />
                    </TableCell>
                    <TableCell className="numeric text-right font-mono text-foreground">
                      {lot.area}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={lot.status} />
                    </TableCell>
                    <TableCell>
                      <NdviMeter value={lot.ndvi} />
                    </TableCell>
                    <TableCell className="numeric text-right font-mono text-foreground">
                      {formatKg(lot.mlPredictedKgHa)}
                    </TableCell>
                    <TableCell>
                      <LotActions
                        lot={lot}
                        disabled={loading}
                        onHarvest={openHarvest}
                        onNewCycle={openNewCycle}
                        onDetail={openDetail}
                        onEdit={openEdit}
                        onDelete={requestDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-auto p-5">
                    <EmptyState
                      icon={MapIcon}
                      title="No se encontraron lotes."
                      description={
                        filtersActive
                          ? "Probá con otra búsqueda o limpiá los filtros."
                          : "Creá tu primer lote con «Nuevo Lote» y dibujá su contorno en el mapa."
                      }
                      action={
                        filtersActive ? (
                          <Button variant="outline" size="sm" onClick={clearFilters}>
                            Limpiar filtros
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-2.5 border-t border-border/70 p-3 md:hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[132px] w-full rounded-2xl" />
            ))
          ) : filteredLots && filteredLots.length > 0 ? (
            filteredLots.map((lot) => (
              <div key={lot.id} className="rounded-2xl bg-muted/50 p-4 ring-1 ring-border/60 ring-inset">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void openDetail(lot.id)}
                    className="min-w-0 text-left"
                  >
                    <p className="truncate text-[15px] font-semibold text-foreground">{lot.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      Grupo {lot.plotGroup}
                      {showFarmColumn && lot.farmName ? ` · ${lot.farmName}` : ""}
                    </p>
                  </button>
                  <StatusPill status={lot.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                  <div>
                    <p className="text-muted-foreground">Cultivo</p>
                    <CropTag crop={lot.crop} className="mt-0.5 text-[13px]" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Área</p>
                    <p className="numeric mt-0.5 font-mono text-[13px] text-foreground">{lot.area} ha</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">NDVI</p>
                    <NdviMeter value={lot.ndvi} className="mt-0.5 justify-start" />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <p className="text-[12px] text-muted-foreground">
                    ML{" "}
                    <span className="numeric font-mono font-medium text-foreground">
                      {formatKg(lot.mlPredictedKgHa)}
                    </span>
                  </p>
                  <LotActions
                    lot={lot}
                    disabled={loading}
                    onHarvest={openHarvest}
                    onNewCycle={openNewCycle}
                    onDetail={openDetail}
                    onEdit={openEdit}
                    onDelete={requestDelete}
                  />
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={MapIcon}
              title="No se encontraron lotes."
              description={
                filtersActive
                  ? "Probá con otra búsqueda o limpiá los filtros."
                  : "Creá tu primer lote con «Nuevo Lote»."
              }
            />
          )}
        </div>
      </motion.section>

      {/* ── Detail ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle del lote</DialogTitle>
            <DialogDescription>Información registrada en tu cuenta.</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : detailPlot ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-sidebar p-4 text-sidebar-foreground">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[18px] font-semibold tracking-[-0.02em]">
                      {detailPlot.name}
                    </p>
                    <p className="mt-0.5 text-[13px] text-sidebar-foreground/60">
                      {cropLabel(detailPlot.crop_type)}
                    </p>
                  </div>
                  <StatusPill status={detailPlot.status} className="bg-white/10" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    {
                      k: "Área (ha)",
                      v: detailPlot.area_ha != null ? String(detailPlot.area_ha) : "—",
                    },
                    {
                      k: "NDVI",
                      v:
                        detailPlot.ndvi_index != null
                          ? Number(detailPlot.ndvi_index).toFixed(2)
                          : "—",
                    },
                    { k: "Grupo", v: String(detailPlot.group ?? 1) },
                  ].map(({ k, v }) => (
                    <div key={k} className="rounded-xl bg-white/[0.06] px-3 py-2.5">
                      <p className="text-[11px] text-sidebar-foreground/55">{k}</p>
                      <p className="numeric mt-0.5 font-mono text-[16px] font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              <DetailList>
                <DetailRow label="Nombre">{detailPlot.name}</DetailRow>
                <DetailRow label="Cultivo">{cropLabel(detailPlot.crop_type)}</DetailRow>
                {(detailPlot.latitude != null || detailPlot.longitude != null) && (
                  <DetailRow label="Ubicación" mono>
                    <span className="text-[12px]">
                      {detailPlot.latitude != null && detailPlot.longitude != null
                        ? `${Number(detailPlot.latitude).toFixed(5)}, ${Number(detailPlot.longitude).toFixed(5)}`
                        : "—"}
                    </span>
                  </DetailRow>
                )}
                <DetailRow label="Creado">
                  <span className="font-normal text-muted-foreground">
                    {formatDateTime(detailPlot.created_at)}
                  </span>
                </DetailRow>
                <DetailRow label="Actualizado">
                  <span className="font-normal text-muted-foreground">
                    {formatDateTime(detailPlot.updated_at)}
                  </span>
                </DetailRow>
              </DetailList>

              {detailPlot.description ? (
                <div className="space-y-1">
                  <p className="eyebrow text-muted-foreground">Descripción</p>
                  <p className="text-[13.5px] leading-relaxed text-foreground">{detailPlot.description}</p>
                </div>
              ) : null}
              {detailPlot.notes ? (
                <div className="space-y-1">
                  <p className="eyebrow text-muted-foreground">Notas</p>
                  <p className="text-[13.5px] leading-relaxed text-foreground">{detailPlot.notes}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Sin datos.</p>
          )}
          <DialogFooter>
            {detailPlot && !detailLoading ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDetailOpen(false)
                  void openEdit(detailPlot.id)
                }}
              >
                <Pencil />
                Editar
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setDetailOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit ── */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar lote</DialogTitle>
            <DialogDescription>Modificá los datos del lote y guardá los cambios.</DialogDescription>
          </DialogHeader>
          {editLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <form onSubmit={(e) => void submitEdit(e)} className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-name">Nombre</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    disabled={editSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-group">Grupo</Label>
                  <Input
                    id="edit-group"
                    type="number"
                    value={editGroup}
                    onChange={(e) => setEditGroup(e.target.value)}
                    className="font-mono"
                    required
                    disabled={editSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-area">Área (ha)</Label>
                  <Input
                    id="edit-area"
                    type="text"
                    inputMode="decimal"
                    placeholder="Opcional"
                    value={editArea}
                    onChange={(e) => setEditArea(e.target.value)}
                    className="font-mono"
                    disabled={editSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-crop">Cultivo</Label>
                  <Select
                    value={editCrop || "__none__"}
                    onValueChange={(v) => setEditCrop(v === "__none__" ? "" : v)}
                    disabled={editSaving}
                  >
                    <SelectTrigger id="edit-crop" className="w-full">
                      <SelectValue placeholder="Sin cultivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin cultivo</SelectItem>
                      {editCrop && !CROP_TYPES.includes(editCrop as (typeof CROP_TYPES)[number]) ? (
                        <SelectItem value={editCrop}>{cropLabel(editCrop)}</SelectItem>
                      ) : null}
                      {CROP_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Estado</Label>
                  <Select
                    value={editStatus}
                    onValueChange={(v) => setEditStatus(v as DbPlot["status"])}
                    disabled={editSaving}
                  >
                    <SelectTrigger id="edit-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLOT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className={cn("size-2 rounded-full", STATUS_BAR[s])} />
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-desc">Descripción</Label>
                  <Input
                    id="edit-desc"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    disabled={editSaving}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-notes">Notas</Label>
                  <Input
                    id="edit-notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    disabled={editSaving}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEdit}
                  disabled={editSaving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving ? "Guardando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <span className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </span>
            <AlertDialogTitle>¿Eliminar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name ?? "el lote"}
              </span>
              . Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white shadow-none hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── New cycle ── */}
      <Dialog
        open={cycleOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCycleOpen(false)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <span className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-status-growing/15 text-status-growing">
              <Sprout className="size-5" />
            </span>
            <DialogTitle>Nuevo ciclo de siembra</DialogTitle>
            <DialogDescription>
              Registrá el cultivo y la fecha de siembra para{" "}
              <span className="font-semibold text-foreground">
                {cycleTarget?.name ?? "el lote"}
              </span>
              . El lote pasará a estado Sembrado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cycle-crop">Cultivo</Label>
              <Select
                value={cycleCrop || "__none__"}
                onValueChange={(v) => setCycleCrop(v === "__none__" ? "" : v)}
                disabled={cycleLoading}
              >
                <SelectTrigger id="cycle-crop" className="w-full">
                  <SelectValue placeholder="Elegir cultivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Elegir…</SelectItem>
                  {CROP_TYPES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-sowing">Fecha de siembra</Label>
              <Input
                id="cycle-sowing"
                type="date"
                value={cycleSowingDate}
                onChange={(e) => setCycleSowingDate(e.target.value)}
                disabled={cycleLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-ph">pH del suelo (opcional)</Label>
              <Input
                id="cycle-ph"
                type="text"
                inputMode="decimal"
                placeholder="Ej: 6.5"
                value={cycleSoilPh}
                onChange={(e) => setCycleSoilPh(e.target.value)}
                className="font-mono"
                disabled={cycleLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-pest">Pesticida (ml, opcional)</Label>
              <Input
                id="cycle-pest"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={cyclePesticideMl}
                onChange={(e) => setCyclePesticideMl(e.target.value)}
                className="font-mono"
                disabled={cycleLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-irrigation">Riego</Label>
              <Select
                value={cycleIrrigation}
                onValueChange={setCycleIrrigation}
                disabled={cycleLoading}
              >
                <SelectTrigger id="cycle-irrigation" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEW_CYCLE_IRRIGATION.map((v) => (
                    <SelectItem key={v} value={v}>
                      {IRRIGATION_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-fertilizer">Fertilizante</Label>
              <Select
                value={cycleFertilizer}
                onValueChange={setCycleFertilizer}
                disabled={cycleLoading}
              >
                <SelectTrigger id="cycle-fertilizer" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEW_CYCLE_FERTILIZER.map((v) => (
                    <SelectItem key={v} value={v}>
                      {FERTILIZER_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cycle-disease">Estado sanitario del cultivo</Label>
              <Select
                value={cycleDisease}
                onValueChange={setCycleDisease}
                disabled={cycleLoading}
              >
                <SelectTrigger id="cycle-disease" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEW_CYCLE_DISEASE.map((v) => (
                    <SelectItem key={v} value={v}>
                      {DISEASE_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCycleOpen(false)
              }}
              disabled={cycleLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmNewCycle()}
              disabled={cycleLoading}
              className="bg-status-growing text-white hover:bg-status-growing/90 dark:text-brand-foreground"
            >
              <Sprout />
              {cycleLoading ? "Guardando…" : "Iniciar ciclo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Harvest ── */}
      <Dialog open={harvestOpen} onOpenChange={(o) => { if (!o) setHarvestOpen(false) }}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <span className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-status-harvested/15 text-status-harvested">
              <Wheat className="size-5" />
            </span>
            <DialogTitle>Cosechar lote</DialogTitle>
            <DialogDescription>
              Registrá la cosecha de{" "}
              <span className="font-semibold text-foreground">
                {harvestTarget?.name ?? "el lote"}
              </span>
              . El lote pasará a estado Barbecho y quedará listo para un nuevo ciclo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="harvest-date">Fecha de cosecha</Label>
              <Input
                id="harvest-date"
                type="date"
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                disabled={harvestLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="harvest-yield">Rendimiento (kg/ha)</Label>
              <Input
                id="harvest-yield"
                type="text"
                inputMode="decimal"
                placeholder="Ej: 3500"
                value={harvestYield}
                onChange={(e) => setHarvestYield(e.target.value)}
                className="font-mono"
                disabled={harvestLoading}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHarvestOpen(false)}
              disabled={harvestLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmHarvest()}
              disabled={harvestLoading}
              className="bg-status-harvested text-[oklch(0.25_0.05_70)] hover:bg-status-harvested/90"
            >
              <Wheat />
              {harvestLoading ? "Cosechando…" : "Confirmar cosecha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function LotesPage() {
  return (
    <DashboardLayout>
      <LotesPageInner />
    </DashboardLayout>
  )
}
