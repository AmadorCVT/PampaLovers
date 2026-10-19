"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  MapPin,
  Calendar,
  Wheat,
  Loader2,
  FlaskConical,
  type LucideIcon,
} from "lucide-react"
import { createPlotWithEnrichment } from "@/lib/supabase-api"
import {
  LotPolygonMapPicker,
  type LngLatTuple,
} from "@/components/lot-polygon-map-picker"
import { InlineMessage } from "@/components/agro-ui"

function formatSubmitError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const o = err as { message?: string; details?: string }
    if (o.message) {
      return o.details ? `${o.message} (${o.details})` : o.message
    }
  }
  return "Error al crear el lote"
}

export interface NewLotFormData {
  name: string
  group: string
  cropType: string
  sowingDate: string
  polygonPoints: LngLatTuple[]
  soilPh: string
  irrigationType: string
  fertilizerType: string
  pesticideUsageMl: string
  cropDiseaseStatus: string
}

const cropTypes = [
  "Soja",
  "Maíz",
  "Trigo",
  "Girasol",
  "Sorgo",
  "Cebada",
  "Arroz",
  "Algodón",
]

/** Valores en inglés para BD/API; `label` es solo lo que ve el usuario. */
const irrigationOptions = [
  { value: "Drip", label: "Goteo" },
  { value: "Sprinkle", label: "Aspersión" },
  { value: "Manual", label: "Manual" },
  { value: "None", label: "Sin riego" },
] as const

const fertilizerOptions = [
  { value: "Organic", label: "Orgánico" },
  { value: "Inorganic", label: "Inorgánico" },
  { value: "Mixed", label: "Mixto" },
] as const

const cropDiseaseOptions = [
  { value: "None", label: "Sin problemas" },
  { value: "Mild", label: "Leve" },
  { value: "Moderate", label: "Moderado" },
  { value: "Severe", label: "Severo" },
] as const

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getLatestAllowedSowingDate(): string {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - 7)
  return formatDateInputValue(date)
}

function formatDisplayDate(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-AR")
}

function emptyForm(): NewLotFormData {
  return {
    name: "",
    group: "",
    cropType: "",
    sowingDate: "",
    polygonPoints: [],
    soilPh: "",
    irrigationType: "",
    fertilizerType: "",
    pesticideUsageMl: "",
    cropDiseaseStatus: "",
  }
}

interface NewLotFormProps {
  farmId: string | null
  disabledReason?: string | null
  onSuccess?: () => void
}

export function NewLotForm({
  farmId,
  disabledReason = null,
  onSuccess,
}: NewLotFormProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<NewLotFormData>(emptyForm)
  const latestAllowedSowingDate = getLatestAllowedSowingDate()

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setFormData(emptyForm())
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!farmId) {
      setError("No se encontró un establecimiento asociado.")
      return
    }

    const pts = formData.polygonPoints
    if (pts.length !== 4) {
      setError("Marcá exactamente 4 vértices en el mapa.")
      return
    }
    if (!pts.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))) {
      setError("Coordenadas del polígono inválidas.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const parsedGroup = parseInt(formData.group, 10)
      if (!Number.isFinite(parsedGroup) || parsedGroup < 1) {
        setError("El grupo debe ser un número válido.")
        setSubmitting(false)
        return
      }

      if (
        formData.sowingDate.trim() !== "" &&
        formData.sowingDate > latestAllowedSowingDate
      ) {
        setError(
          `La fecha de siembra debe ser igual o anterior al ${formatDisplayDate(latestAllowedSowingDate)}.`,
        )
        setSubmitting(false)
        return
      }

      const latSum = pts.reduce((s, [, lat]) => s + lat, 0)
      const lonSum = pts.reduce((s, [lon]) => s + lon, 0)
      const n = pts.length
      const descriptionParts = [
        formData.sowingDate && `Siembra ${formData.sowingDate}`,
      ].filter(Boolean)

      const parsedPh = parseFloat(formData.soilPh)
      const parsedPesticide = parseFloat(formData.pesticideUsageMl)

      const result = await createPlotWithEnrichment({
        farm_id: farmId,
        name: formData.name,
        group: parsedGroup,
        crop_type: formData.cropType || undefined,
        description: descriptionParts.length ? descriptionParts.join(" · ") : undefined,
        sowing_date: formData.sowingDate.trim() || undefined,
        status: "Sembrado",
        latitude: latSum / n,
        longitude: lonSum / n,
        polygon: pts,
        soil_ph: Number.isFinite(parsedPh) && parsedPh > 0 ? parsedPh : undefined,
        irrigation_type: formData.irrigationType || undefined,
        fertilizer_type: formData.fertilizerType || undefined,
        pesticide_usage_ml: Number.isFinite(parsedPesticide) && parsedPesticide >= 0 ? parsedPesticide : undefined,
        crop_disease_status: formData.cropDiseaseStatus || undefined,
      })

      toast.success("Lote creado")
      if (result.enrichment.warnings.length > 0) {
        toast.info(
          `El lote se guardó, pero faltaron métricas automáticas. ${result.enrichment.warnings.join(" ")}`,
        )
      }

      onSuccess?.()
      handleOpenChange(false)
    } catch (err) {
      setError(formatSubmitError(err))
    }
    setSubmitting(false)
  }

  const polygonComplete = formData.polygonPoints.length === 4
  const canCreateLot = farmId != null && farmId.trim() !== ""
  const missingPoints = 4 - formData.polygonPoints.length

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next && !canCreateLot) return
          handleOpenChange(next)
        }}
      >
        {canCreateLot ? (
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2">
              <Plus className="size-[18px]" />
              Nuevo Lote
            </Button>
          </DialogTrigger>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled
            className="gap-2"
            title={disabledReason ?? "Selecciona una granja arriba para crear un lote"}
          >
            <Plus className="size-[18px]" />
            Nuevo Lote
          </Button>
        )}
        <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden overflow-y-hidden p-0 sm:max-w-3xl sm:p-0">
          <DialogHeader className="border-b border-border/70 px-6 pt-6 pb-5 sm:px-7">
            <DialogTitle className="text-foreground">Crear Nuevo Lote</DialogTitle>
            <DialogDescription>
              Ingresa los datos del lote y marcá cuatro vértices en el mapa en orden
              (contorno del polígono).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6 sm:px-7">
              <FormSection n={1} icon={Wheat} title="Información del Lote">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-foreground">
                      Nombre del Lote <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="ej: Lote A1"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                      disabled={submitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="group" className="text-foreground">
                      Grupo <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="group"
                      type="number"
                      step="1"
                      min="1"
                      placeholder="ej: 1"
                      value={formData.group}
                      onChange={(e) =>
                        setFormData({ ...formData, group: e.target.value })
                      }
                      className="font-mono"
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection n={2} icon={Calendar} title="Información del Cultivo">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cropType" className="text-foreground">
                      Tipo de Cultivo <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.cropType}
                      onValueChange={(value) =>
                        setFormData({ ...formData, cropType: value })
                      }
                      required
                      disabled={submitting}
                    >
                      <SelectTrigger id="cropType" className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {cropTypes.map((crop) => (
                          <SelectItem key={crop} value={crop}>
                            {crop}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sowingDate" className="text-foreground">
                      Fecha de Siembra <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="sowingDate"
                      type="date"
                      max={latestAllowedSowingDate}
                      value={formData.sowingDate}
                      onChange={(e) =>
                        setFormData({ ...formData, sowingDate: e.target.value })
                      }
                      required
                      disabled={submitting}
                      aria-describedby="sowingDate-help"
                    />
                    <p id="sowingDate-help" className="text-xs text-muted-foreground">
                      Solo se permiten fechas hasta el {formatDisplayDate(latestAllowedSowingDate)}.
                    </p>
                  </div>
                </div>
              </FormSection>

              <FormSection n={3} icon={FlaskConical} title="Datos Agronómicos" optional>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="soilPh" className="text-foreground">
                      pH del Suelo
                    </Label>
                    <Input
                      id="soilPh"
                      type="number"
                      step="0.1"
                      min="0"
                      max="14"
                      placeholder="ej: 6.5"
                      value={formData.soilPh}
                      onChange={(e) =>
                        setFormData({ ...formData, soilPh: e.target.value })
                      }
                      className="font-mono"
                      disabled={submitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="irrigationType" className="text-foreground">
                      Tipo de Riego
                    </Label>
                    <Select
                      value={formData.irrigationType}
                      onValueChange={(value) =>
                        setFormData({ ...formData, irrigationType: value })
                      }
                      disabled={submitting}
                    >
                      <SelectTrigger id="irrigationType" className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {irrigationOptions.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fertilizerType" className="text-foreground">
                      Tipo de Fertilizante
                    </Label>
                    <Select
                      value={formData.fertilizerType}
                      onValueChange={(value) =>
                        setFormData({ ...formData, fertilizerType: value })
                      }
                      disabled={submitting}
                    >
                      <SelectTrigger id="fertilizerType" className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {fertilizerOptions.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pesticideUsageMl" className="text-foreground">
                      Uso de Pesticida (ml/día)
                    </Label>
                    <Input
                      id="pesticideUsageMl"
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="ej: 50"
                      value={formData.pesticideUsageMl}
                      onChange={(e) =>
                        setFormData({ ...formData, pesticideUsageMl: e.target.value })
                      }
                      className="font-mono"
                      disabled={submitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cropDiseaseStatus" className="text-foreground">
                      Estado Sanitario
                    </Label>
                    <Select
                      value={formData.cropDiseaseStatus}
                      onValueChange={(value) =>
                        setFormData({ ...formData, cropDiseaseStatus: value })
                      }
                      disabled={submitting}
                    >
                      <SelectTrigger id="cropDiseaseStatus" className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {cropDiseaseOptions.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </FormSection>

              <FormSection n={4} icon={MapPin} title="Contorno del lote en el mapa">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Hacé clic en el mapa cuatro veces, en el orden de los vértices del
                  polígono. El primero debe coincidir con el sentido que querés para
                  el perímetro (como un rectángulo: esquina 1 → 2 → 3 → 4).
                </p>
                <LotPolygonMapPicker
                  points={formData.polygonPoints}
                  onPointsChange={(polygonPoints) =>
                    setFormData((prev) => ({ ...prev, polygonPoints }))
                  }
                  active={open}
                  className="z-0 overflow-hidden rounded-2xl ring-1 ring-border [&_.leaflet-container]:h-[340px] [&_.leaflet-container]:w-full [&_.leaflet-container]:bg-muted"
                />
              </FormSection>

              {error && <InlineMessage>{error}</InlineMessage>}
            </div>

            <DialogFooter className="border-t sm:items-center border-border/70 bg-muted/40 px-6 py-4 sm:px-7">
              <p className="mr-auto hidden text-[12.5px] text-muted-foreground sm:block">
                {polygonComplete
                  ? "Contorno listo para crear el lote."
                  : `Puntos marcados: ${formData.polygonPoints.length} / 4 — necesitás ${missingPoints} más`}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting || !polygonComplete}
                className="inline-flex gap-2"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                )}
                {submitting ? "Consultando APIs..." : "Crear Lote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {!canCreateLot && disabledReason ? (
        <p className="max-w-72 text-left text-[12px] leading-snug text-muted-foreground sm:text-right">
          {disabledReason}
        </p>
      ) : null}
    </div>
  )
}

function FormSection({
  n,
  icon: Icon,
  title,
  optional,
  children,
}: {
  n: number
  icon: LucideIcon
  title: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-3 text-[14px] font-semibold text-foreground">
        <span className="numeric flex size-7 items-center justify-center rounded-full bg-foreground text-[11.5px] font-semibold text-background">
          {n}
        </span>
        <Icon className="size-4 text-muted-foreground" />
        {title}
        {optional ? (
          <span className="text-[12px] font-normal text-muted-foreground">Opcional</span>
        ) : null}
      </h3>
      <div className="space-y-4 sm:pl-10">{children}</div>
    </section>
  )
}
