"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { motion } from "motion/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { User, Building2, MapPin, Palette, Loader2, Lock, Info } from "lucide-react"
import {
  getUserProfile,
  getFarmSettingsForFarm,
  updateProfile,
  updateFarm,
  type FarmSettings,
} from "@/lib/supabase-api"
import { useFarmScope } from "@/components/farm-scope-context"
import { PageHeader, Section } from "@/components/agro-ui"
import { ThemeToggle } from "@/components/theme-toggle"
import { riseIn } from "@/lib/motion"

function SettingsPageInner() {
  const { selectedFarmId } = useFarmScope()
  const [farmSettings, setFarmSettings] = useState<FarmSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [farmName, setFarmName] = useState("")
  const [farmSize, setFarmSize] = useState("")
  const [location, setLocation] = useState("")

  const farmScopeLocked = selectedFarmId === "all"

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const profile = await getUserProfile()
        setName(profile.name)
        setEmail(profile.email)

        if (selectedFarmId === "all") {
          setFarmSettings(null)
          setFarmName("")
          setFarmSize("")
          setLocation("")
        } else {
          const farm = await getFarmSettingsForFarm(selectedFarmId)
          setFarmSettings(farm)
          if (farm) {
            setFarmName(farm.name)
            setFarmSize(String(farm.size))
            setLocation(farm.location)
          } else {
            setFarmName("")
            setFarmSize("")
            setLocation("")
          }
        }
      } catch (err) {
        console.error("Error loading settings:", err)
      }
      setLoading(false)
    }
    void loadData()
  }, [selectedFarmId])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile({ name })
      if (farmSettings && !farmScopeLocked) {
        await updateFarm(farmSettings.id, {
          name: farmName,
          location_name: location,
          timezone: farmSettings.timezone,
          currency: farmSettings.currency,
        })
      }
      toast.success("Cambios guardados")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar los cambios",
      )
    }
    setSaving(false)
  }

  // Same fallback as the header avatar: first two letters of the email's local part.
  const initials = name.trim()
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join("")
    : email
      ? email.split("@")[0].slice(0, 2).toUpperCase()
      : "??"

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cuenta"
        title="Configuración"
        description="Perfil y datos del campo elegido en la barra superior (no «Todos los campos»)."
      />

      <form className="max-w-3xl space-y-5" onSubmit={handleSave}>
        <Section
          index={1}
          icon={User}
          title="Información Personal"
          description="El email no se puede cambiar desde aquí"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-center">
              {loading ? (
                <Skeleton className="size-20 rounded-full" />
              ) : (
                <span className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary)_65%,var(--brand))] text-[26px] font-semibold tracking-wide text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/22%),var(--shadow-soft)]">
                  {initials}
                </span>
              )}
            </div>
            <div className="grid flex-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">Nombre Completo</Label>
                {loading ? (
                  <Skeleton className="h-10 w-full rounded-xl" />
                ) : (
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-1.5 text-foreground">
                  Email
                  <Lock className="size-3 text-muted-foreground" />
                </Label>
                {loading ? (
                  <Skeleton className="h-10 w-full rounded-xl" />
                ) : (
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    readOnly
                    tabIndex={-1}
                    className="cursor-default text-muted-foreground"
                    autoComplete="email"
                    aria-readonly="true"
                  />
                )}
              </div>
            </div>
          </div>
        </Section>

        <Section
          index={2}
          icon={Building2}
          title="Detalles del campo"
          description={
            farmScopeLocked
              ? "Seleccioná un campo en la barra superior para editar nombre y ubicación."
              : "La superficie total es la suma de los lotes; el resto es del establecimiento seleccionado"
          }
        >
          {farmScopeLocked && !loading ? (
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-status-sown/10 p-3.5 text-[13px] text-foreground ring-1 ring-status-sown/25 ring-inset">
              <Info className="mt-0.5 size-4 shrink-0 text-status-sown" />
              Estás viendo «Todos los campos». Elegí un campo concreto en el selector de arriba para editarlo.
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="farmName" className="text-foreground">Nombre del campo</Label>
              {loading ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : (
                <Input
                  id="farmName"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  disabled={farmScopeLocked || !farmSettings}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="farmSize" className="text-foreground">Superficie Total (ha)</Label>
              {loading ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : (
                <>
                  <Input
                    id="farmSize"
                    readOnly
                    tabIndex={-1}
                    value={farmScopeLocked || !farmSettings ? "—" : farmSize}
                    className="numeric cursor-default font-mono"
                    disabled={farmScopeLocked || !farmSettings}
                    aria-readonly="true"
                  />
                  <p className="text-xs text-muted-foreground">
                    Suma de la superficie de todos los lotes del campo.
                  </p>
                </>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="location" className="text-foreground">Ubicación</Label>
              {loading ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : (
                <div className="relative">
                  <MapPin className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="location"
                    className="pl-10"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={farmScopeLocked || !farmSettings}
                  />
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section
          index={3}
          icon={Palette}
          title="Apariencia"
          description="Claro, oscuro o el que use tu sistema."
        >
          <ThemeToggle tone="surface" className="h-10 w-full max-w-[260px] [&_button]:h-8" layoutId="settings-theme" />
        </Section>

        {/* Save bar floats over content as you scroll */}
        <motion.div
          {...riseIn(4)}
          className="material-thick material-edge sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl p-3 pl-5 shadow-float sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-[13px] text-muted-foreground">
            Guarda perfil siempre; datos del campo solo con un campo concreto seleccionado arriba.
          </p>
          <Button
            type="submit"
            size="lg"
            className="w-full shrink-0 sm:w-auto sm:min-w-[180px]"
            disabled={loading || saving}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </motion.div>
      </form>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <SettingsPageInner />
    </DashboardLayout>
  )
}
