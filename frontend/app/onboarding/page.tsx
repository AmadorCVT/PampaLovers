"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { createFarm } from "@/lib/supabase-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth-shell"
import { InlineMessage } from "@/components/agro-ui"
import { spring } from "@/lib/motion"
import { ArrowRight, FileText, Loader2, MapPin, Tractor } from "lucide-react"

const NEXT_STEPS = [
  { n: "01", title: "Creá tu establecimiento", text: "Nombre y ubicación del campo." },
  { n: "02", title: "Dibujá tus lotes", text: "Marcá el contorno sobre el mapa satelital." },
  { n: "03", title: "Seguí cada ciclo", text: "NDVI, predicción ML y cosechas en un solo lugar." },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("El nombre del establecimiento es obligatorio.")
      return
    }

    setLoading(true)
    try {
      await createFarm({
        name: name.trim(),
        location_name: location.trim() || undefined,
        description: description.trim() || undefined,
      })
      router.push("/lotes")
      router.refresh()
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : err &&
              typeof err === "object" &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "Error al crear el establecimiento."
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <AuthShell
      aside={
        <div className="max-w-xl space-y-10">
          <div className="space-y-5">
            <p className="eyebrow flex items-center gap-2 text-brand">
              <span className="size-1.5 rounded-full bg-brand" />
              Primeros pasos
            </p>
            <h1 className="text-[clamp(2.4rem,1rem+2.4vw,3.6rem)] leading-[1.03] font-semibold tracking-[-0.04em] text-balance">
              Todo empieza{" "}
              <span className="font-display font-normal tracking-[-0.015em] text-brand italic">
                con un campo.
              </span>
            </h1>
          </div>
          <ol className="relative space-y-1">
            <span
              aria-hidden
              className="absolute top-6 bottom-6 left-[19px] w-px bg-gradient-to-b from-brand/70 via-white/15 to-transparent"
            />
            {NEXT_STEPS.map((step, i) => (
              <motion.li
                key={step.n}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring.move, delay: 0.1 + i * 0.06 }}
                className="relative flex gap-4 rounded-2xl p-1.5"
              >
                <span
                  className={
                    i === 0
                      ? "relative flex size-[38px] shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-brand-foreground shadow-[0_0_0_5px_color-mix(in_oklch,var(--brand)_18%,transparent)]"
                      : "relative flex size-[38px] shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[12px] font-semibold text-sidebar-foreground/60 ring-1 ring-white/10"
                  }
                >
                  {step.n}
                </span>
                <div className="pt-1.5">
                  <p className="text-[15px] font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-[13.5px] text-sidebar-foreground/55">{step.text}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      }
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.move}
        className="space-y-8"
      >
        <div className="space-y-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-[inset_0_1px_0_oklch(1_0_0/40%)]">
            <Tractor className="size-6" />
          </span>
          <h2 className="pt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground">
            Bienvenido a EvoAgro
          </h2>
          <p className="text-[15px] text-muted-foreground">
            Configurá tu establecimiento para comenzar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nombre del Establecimiento <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Tractor className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="name"
                placeholder="ej: Estancia La Esperanza"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                className="h-12 pl-10 text-[15px]"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Ubicación</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="location"
                placeholder="ej: Pergamino, Buenos Aires"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={loading}
                className="h-12 pl-10 text-[15px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <div className="relative">
              <FileText className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="description"
                placeholder="ej: Campo agrícola mixto"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                className="h-12 pl-10 text-[15px]"
              />
            </div>
          </div>

          {error && <InlineMessage>{error}</InlineMessage>}

          <Button type="submit" className="group h-12 w-full text-[15px]" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            Crear Establecimiento
            {!loading ? (
              <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
            ) : null}
          </Button>
        </form>
      </motion.div>
    </AuthShell>
  )
}
