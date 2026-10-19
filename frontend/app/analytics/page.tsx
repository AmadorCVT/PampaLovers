"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { useFarmScope } from "@/components/farm-scope-context"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  LineChart as LineChartIcon,
  ListOrdered,
  MapPinned,
  Minus,
  Sprout,
  TriangleAlert,
} from "lucide-react"
import {
  fetchLots,
  getPlotPredictionHistory,
  type Lot,
  type PlotPredictionHistoryPoint,
} from "@/lib/supabase-api"
import { AnimatedNumber } from "@/components/animated-number"
import { EmptyState, PageHeader, StatTile } from "@/components/agro-ui"
import { riseIn } from "@/lib/motion"
import { cn } from "@/lib/utils"

type FarmOption = {
  id: string
  name: string
}

type PredictionChartPoint = PlotPredictionHistoryPoint & {
  changeLabel: string | null
}

function buildFarmOptions(lots: Lot[]): FarmOption[] {
  const farmsById = new Map<string, FarmOption>()

  for (const lot of lots) {
    if (!farmsById.has(lot.farmId)) {
      farmsById.set(lot.farmId, {
        id: lot.farmId,
        name: lot.farmName || "Granja sin nombre",
      })
    }
  }

  return [...farmsById.values()].sort((a, b) => a.name.localeCompare(b.name, "es"))
}

function buildLotsForFarm(lots: Lot[], farmId: string): Lot[] {
  return lots
    .filter((lot) => lot.farmId === farmId)
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
}

function formatAxisDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  // es-AR renders "31-ago" / "8-sept."; normalize to "31 ago".
  return date
    .toLocaleDateString("es-AR", { day: "numeric", month: "short" })
    .replace(/[-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatTooltipDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatKgHa(value: number): string {
  return `${Math.round(value).toLocaleString("es-AR")} kg/ha`
}

function normalizeChartNumber(value: number | string | Array<number | string>): number {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0)
  }

  return Number(value)
}

function formatAxisKgHa(value: number | string): string {
  return Math.round(Number(value)).toLocaleString("es-AR")
}

function formatChangePercent(value: number): string {
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

function buildPredictionChartData(
  history: PlotPredictionHistoryPoint[],
): PredictionChartPoint[] {
  return history.map((point, index) => {
    if (index === 0) {
      return { ...point, changeLabel: null }
    }

    const previousValue = history[index - 1]?.predictedKgHa ?? null
    if (previousValue == null || previousValue <= 0) {
      return { ...point, changeLabel: null }
    }

    const deltaPercent =
      ((point.predictedKgHa - previousValue) / previousValue) * 100

    return {
      ...point,
      changeLabel: formatChangePercent(deltaPercent),
    }
  })
}

function pctChange(from: number | undefined, to: number | undefined) {
  if (from == null || to == null || from <= 0) return null
  return ((to - from) / from) * 100
}

function DeltaChip({
  value,
  onDark,
  className,
}: {
  value: number | null
  onDark?: boolean
  className?: string
}) {
  if (value == null) return null
  const up = value > 0.05
  const down = value < -0.05
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus
  return (
    <span
      className={cn(
        "numeric inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold",
        onDark
          ? cn(
              "bg-white/10",
              up && "text-brand",
              down && "text-[oklch(0.78_0.14_35)]",
              !up && !down && "text-sidebar-foreground/70",
            )
          : cn(
              up && "bg-status-growing/15 text-status-growing",
              down && "bg-destructive/12 text-destructive",
              !up && !down && "bg-muted text-muted-foreground",
            ),
        className,
      )}
    >
      <Icon className="size-3.5" />
      {formatChangePercent(value)}
    </span>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number | string | Array<number | string>; payload: PredictionChartPoint }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  return (
    <div className="material-thick rounded-xl px-3.5 py-2.5 shadow-float ring-1 ring-border/60">
      <p className="text-[11.5px] text-muted-foreground">
        {typeof label === "string" ? formatTooltipDate(label) : String(label)}
      </p>
      <p className="mt-1 flex items-center gap-2">
        <span className="numeric font-mono text-[15px] font-semibold text-foreground">
          {formatKgHa(normalizeChartNumber(point.value))}
        </span>
        {point.payload.changeLabel ? (
          <span className="text-[11.5px] font-semibold text-muted-foreground">
            {point.payload.changeLabel}
          </span>
        ) : null}
      </p>
      <p className="text-[11px] text-muted-foreground">Estimación</p>
    </div>
  )
}

function AnalyticsPageInner() {
  const { selectedFarmId: scopedFarmId } = useFarmScope()
  const [lots, setLots] = useState<Lot[]>([])
  const [selectedFarmId, setSelectedFarmId] = useState("")
  const [selectedLotId, setSelectedLotId] = useState("")
  const [history, setHistory] = useState<PlotPredictionHistoryPoint[] | null>(null)
  const [loadingLots, setLoadingLots] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const farms = buildFarmOptions(lots)
  const lotsForSelectedFarm = selectedFarmId ? buildLotsForFarm(lots, selectedFarmId) : []
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? null
  const chartData = history ? buildPredictionChartData(history) : []

  useEffect(() => {
    let active = true

    async function loadLots() {
      setLoadingLots(true)
      setError(null)

      try {
        const lotsData = await fetchLots(
          scopedFarmId === "all" ? undefined : { farmId: scopedFarmId },
        )
        if (!active) return
        setLots(lotsData)
      } catch (err) {
        console.error("Error loading lots for analytics:", err)
        if (!active) return
        setLots([])
        setError("No pudimos cargar granjas y lotes desde Supabase.")
      } finally {
        if (active) setLoadingLots(false)
      }
    }

    void loadLots()

    return () => {
      active = false
    }
  }, [scopedFarmId])

  useEffect(() => {
    if (farms.length === 0) {
      if (selectedFarmId) setSelectedFarmId("")
      return
    }

    if (scopedFarmId !== "all") {
      const scopedExists = farms.some((farm) => farm.id === scopedFarmId)
      if (scopedExists && selectedFarmId !== scopedFarmId) {
        setSelectedFarmId(scopedFarmId)
        return
      }
    }

    const farmExists = farms.some((farm) => farm.id === selectedFarmId)
    if (!farmExists) {
      setSelectedFarmId(farms[0].id)
    }
  }, [farms, scopedFarmId, selectedFarmId])

  useEffect(() => {
    if (!selectedFarmId) {
      if (selectedLotId) setSelectedLotId("")
      return
    }

    const lotExists = lotsForSelectedFarm.some((lot) => lot.id === selectedLotId)
    if (!lotExists) {
      setSelectedLotId(lotsForSelectedFarm[0]?.id ?? "")
    }
  }, [lotsForSelectedFarm, selectedFarmId, selectedLotId])

  useEffect(() => {
    let active = true

    async function loadHistory() {
      if (!selectedLotId) {
        setHistory([])
        setLoadingHistory(false)
        return
      }

      setLoadingHistory(true)
      setHistory(null)
      setError(null)

      try {
        const historyData = await getPlotPredictionHistory(selectedLotId)
        if (!active) return
        setHistory(historyData)
      } catch (err) {
        console.error("Error loading prediction history:", err)
        if (!active) return
        setHistory([])
        setError("No pudimos cargar las estimaciones guardadas para este lote.")
      } finally {
        if (active) setLoadingHistory(false)
      }
    }

    void loadHistory()

    return () => {
      active = false
    }
  }, [selectedLotId])

  const showEmptyLots = !loadingLots && farms.length === 0
  const showEmptyHistory =
    !loadingLots &&
    !loadingHistory &&
    selectedLot != null &&
    Array.isArray(history) &&
    history.length === 0 &&
    !error

  const busy = loadingLots || loadingHistory
  const hasSeries = !busy && !error && history != null && history.length > 0 && selectedLot != null
  const latest = hasSeries ? history![history!.length - 1] : undefined
  const previous = hasSeries && history!.length > 1 ? history![history!.length - 2] : undefined
  const first = hasSeries ? history![0] : undefined
  const values = hasSeries ? history!.map((p) => p.predictedKgHa) : []
  const min = values.length ? Math.min(...values) : null
  const max = values.length ? Math.max(...values) : null

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Inteligencia · Predicción ML"
        title="Rendimientos"
        description="Historial de estimaciones guardadas en Supabase por granja y lote."
      />

      {/* Selector bar */}
      <motion.div {...riseIn(1)} className="surface grid gap-4 p-5 sm:p-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="analytics-farm" className="flex items-center gap-1.5">
            <MapPinned className="size-3.5 text-muted-foreground" />
            Granja
          </Label>
          <Select
            value={selectedFarmId}
            onValueChange={setSelectedFarmId}
            disabled={loadingLots || farms.length === 0}
          >
            <SelectTrigger id="analytics-farm" className="w-full">
              <SelectValue placeholder="Seleccionar granja" />
            </SelectTrigger>
            <SelectContent>
              {farms.map((farm) => (
                <SelectItem key={farm.id} value={farm.id}>
                  {farm.name}
                </SelectItem>
              ))}
              {farms.length === 0 && (
                <SelectItem value="_none" disabled>
                  Sin granjas registradas
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="analytics-lot" className="flex items-center gap-1.5">
            <Sprout className="size-3.5 text-muted-foreground" />
            Lote
          </Label>
          <Select
            value={selectedLotId}
            onValueChange={setSelectedLotId}
            disabled={
              loadingLots ||
              !selectedFarmId ||
              lotsForSelectedFarm.length === 0
            }
          >
            <SelectTrigger id="analytics-lot" className="w-full">
              <SelectValue placeholder="Seleccionar lote" />
            </SelectTrigger>
            <SelectContent>
              {lotsForSelectedFarm.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.name}
                </SelectItem>
              ))}
              {lotsForSelectedFarm.length === 0 && (
                <SelectItem value="_none" disabled>
                  Sin lotes para esta granja
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Headline numbers */}
      {hasSeries ? (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
          <motion.div
            {...riseIn(2)}
            className="relative isolate overflow-hidden rounded-2xl bg-sidebar p-6 text-sidebar-foreground shadow-raised"
          >
            <div
              aria-hidden
              className="field-lines pointer-events-none absolute inset-0 -z-10 text-brand opacity-50 [mask-image:radial-gradient(120%_100%_at_100%_0%,black,transparent_65%)]"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-sidebar-foreground/65">
                Última estimación · {selectedLot!.name}
              </p>
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <BrainCircuit className="size-4" />
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <AnimatedNumber
                value={Math.round(latest!.predictedKgHa)}
                className="numeric text-[clamp(2.4rem,1.8rem+1.6vw,3.25rem)] leading-none font-semibold tracking-[-0.045em]"
              />
              <span className="text-[15px] text-sidebar-foreground/60">kg/ha</span>
              {previous ? (
                <DeltaChip
                  value={pctChange(previous.predictedKgHa, latest!.predictedKgHa)}
                  onDark
                  className="ml-1"
                />
              ) : null}
            </div>
            <p className="mt-3 text-[12.5px] text-sidebar-foreground/55">
              {formatTooltipDate(latest!.createdAt)}
              {previous ? " · vs. estimación anterior" : ""}
            </p>
          </motion.div>
          <StatTile
            index={2}
            label="Estimaciones registradas"
            icon={ListOrdered}
            value={history!.length}
            hint={first ? `Desde ${formatAxisDate(first.createdAt)}` : undefined}
          />
          <StatTile
            index={3}
            label="Variación total"
            icon={LineChartIcon}
            tone="brand"
            value={pctChange(first?.predictedKgHa, latest?.predictedKgHa)}
            decimals={1}
            signed
            unit="%"
            hint={
              min != null && max != null
                ? `Rango ${Math.round(min).toLocaleString("es-AR")}–${Math.round(max).toLocaleString("es-AR")} kg/ha`
                : undefined
            }
          />
        </div>
      ) : null}

      <motion.section {...riseIn(4)} className="surface overflow-hidden">
        <div className="flex flex-col gap-1 p-5 pb-0 sm:p-6 sm:pb-0">
          <h2 className="text-[17px] font-semibold text-foreground">
            Estimaciones a lo largo del tiempo
          </h2>
          <p className="text-[13.5px] text-muted-foreground">
            {hasSeries
              ? `${selectedLot!.farmName} / ${selectedLot!.name} · ${history!.length} ${history!.length === 1 ? "estimación registrada" : "estimaciones registradas"}. Cada punto muestra el cambio porcentual respecto de la estimación anterior.`
              : "Elegí una granja y después un lote para ver sus estimaciones ordenadas por fecha."}
          </p>
        </div>

        <div className="p-5 sm:p-6">
          {busy ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-[360px] w-full rounded-2xl" />
            </div>
          ) : showEmptyLots ? (
            <EmptyState
              icon={Sprout}
              className="min-h-[360px]"
              title="No hay granjas ni lotes cargados."
              description="Crea al menos un lote para ver el historial de estimaciones."
            />
          ) : error ? (
            <EmptyState
              tone="error"
              icon={TriangleAlert}
              className="min-h-[360px]"
              title={error}
              description="Revisa la tabla plot_prediction y la sesion de Supabase."
            />
          ) : showEmptyHistory ? (
            <EmptyState
              icon={BrainCircuit}
              className="min-h-[360px]"
              title="No hay estimaciones guardadas para este lote."
              description="Cuando el modelo genere predicciones para este lote, van a aparecer en este gráfico según su fecha."
            />
          ) : !selectedLot || !history ? (
            <EmptyState
              icon={LineChartIcon}
              className="min-h-[360px]"
              title="Selecciona un lote para ver el historial."
            />
          ) : (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 28, right: 16, left: 4, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="yieldFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="2 4"
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="createdAt"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickFormatter={formatAxisDate}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    dy={8}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickFormatter={(value: number | string) => formatAxisKgHa(value)}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.2, strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="predictedKgHa"
                    name="Estimación"
                    stroke="var(--chart-1)"
                    strokeWidth={2.75}
                    fill="url(#yieldFill)"
                    dot={{
                      fill: "var(--card)",
                      stroke: "var(--chart-1)",
                      strokeWidth: 2.5,
                      r: history.length === 1 ? 5 : 4,
                    }}
                    activeDot={{
                      r: 6.5,
                      fill: "var(--chart-1)",
                      stroke: "var(--card)",
                      strokeWidth: 3,
                    }}
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    <LabelList
                      dataKey="changeLabel"
                      position="top"
                      offset={12}
                      fill="var(--muted-foreground)"
                      fontSize={11}
                      fontWeight={600}
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </motion.section>
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <AnalyticsPageInner />
    </DashboardLayout>
  )
}
