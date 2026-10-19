"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell, FieldIllustration } from "@/components/auth-shell"
import { InlineMessage } from "@/components/agro-ui"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  BrainCircuit,
  Eye,
  EyeOff,
  History,
  Loader2,
  Lock,
  Mail,
  Satellite,
} from "lucide-react"

type AuthMode = "login" | "register"

const FEATURES = [
  { icon: Satellite, title: "Satélite", text: "Imagen y NDVI de cada lote" },
  { icon: BrainCircuit, title: "Predicción ML", text: "Rendimiento estimado por ciclo" },
  { icon: History, title: "Historial", text: "Cada cosecha, con su contexto" },
]

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setMessage(null)

    if (mode === "register" && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.")
      return
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.")
      return
    }

    setLoading(true)
    const supabase = createClient()

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(translateAuthError(error.message))
        setLoading(false)
        return
      }
      const { data: farms } = await supabase.from("farms").select("id").limit(1)
      if (!farms || farms.length === 0) {
        router.push("/onboarding")
      } else {
        router.push("/lotes")
      }
      router.refresh()
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) {
        setError(translateAuthError(signUpError.message))
        setLoading(false)
        return
      }

      // Cuenta existente: Supabase devuelve un usuario sin identidades.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError("Este correo ya está registrado. Intenta iniciar sesión.")
        setLoading(false)
        return
      }

      const { data: farms } = await supabase.from("farms").select("id").limit(1)
      if (!farms || farms.length === 0) {
        router.push("/onboarding")
      } else {
        router.push("/lotes")
      }
      router.refresh()
    }
  }

  function switchMode(next: AuthMode) {
    if (next === mode || loading) return
    setMode(next)
    setError(null)
    setMessage(null)
    setConfirmPassword("")
  }

  function toggleMode() {
    switchMode(mode === "login" ? "register" : "login")
  }

  return (
    <AuthShell
      aside={
        <>
          <div className="max-w-xl space-y-5">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.move}
              className="eyebrow flex items-center gap-2 text-brand"
            >
              <span className="size-1.5 rounded-full bg-brand" />
              Plataforma de Gestión Agrícola Inteligente
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.move, delay: 0.06 }}
              className="text-[clamp(2.4rem,1rem+2.4vw,3.7rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance"
            >
              Tu campo, visto{" "}
              <span className="font-display font-normal tracking-[-0.015em] text-brand italic">
                desde el espacio.
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.move, delay: 0.12 }}
              className="max-w-md text-[16px] leading-relaxed text-sidebar-foreground/65"
            >
              Predicción de rendimientos con ML e imágenes satelitales para optimizar tu
              producción agrícola.
            </motion.p>
          </div>

          <FieldIllustration />

          <ul className="grid grid-cols-3 gap-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.move, delay: 0.2 + i * 0.05 }}
                className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.07] ring-inset"
              >
                <Icon className="size-[18px] text-brand" />
                <p className="mt-3 text-[13.5px] font-semibold">{title}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-sidebar-foreground/55">
                  {text}
                </p>
              </motion.li>
            ))}
          </ul>
        </>
      }
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.move}
        className="space-y-8"
      >
        {/* Segmented control — the pill slides between modes */}
        <div
          role="tablist"
          aria-label="Modo de acceso"
          className="grid grid-cols-2 rounded-2xl bg-muted p-1 ring-1 ring-border/60 ring-inset"
        >
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              disabled={loading}
              className={cn(
                "relative z-0 h-10 rounded-xl text-[13.5px] font-semibold transition-colors duration-200",
                mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === m ? (
                <motion.span
                  layoutId="auth-mode-pill"
                  transition={spring.snappy}
                  className="absolute inset-0 -z-10 rounded-xl bg-card shadow-soft ring-1 ring-border/50"
                />
              ) : null}
              {m === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: mode === "register" ? 12 : -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === "register" ? -12 : 12 }}
            transition={spring.snappy}
            className="space-y-2"
          >
            <h2 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground">
              {mode === "login" ? "Bienvenido de nuevo" : "Empezá a medir tu campo"}
            </h2>
            <p className="text-[15px] text-muted-foreground">
              {mode === "login"
                ? "Ingresá tus credenciales para acceder"
                : "Completá los datos para registrarte"}
            </p>
          </motion.div>
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
                className="h-12 pl-10 text-[15px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={loading}
                className="h-12 pr-11 pl-10 text-[15px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-90"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring.move}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-0.5 pb-0.5">
                  <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={loading}
                      className="h-12 pl-10 text-[15px]"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <InlineMessage>{error}</InlineMessage>}
          {message && <InlineMessage tone="success">{message}</InlineMessage>}

          <Button type="submit" className="group h-12 w-full text-[15px]" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
            {!loading ? (
              <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
            ) : null}
          </Button>

          <p className="text-center text-[13.5px] text-muted-foreground">
            {mode === "login" ? "¿No tenés cuenta?" : "¿Ya tenés cuenta?"}{" "}
            <button
              type="button"
              onClick={toggleMode}
              className="font-semibold text-foreground underline decoration-brand decoration-2 underline-offset-4 transition-colors hover:text-brand-ink"
              disabled={loading}
            >
              {mode === "login" ? "Registrate" : "Iniciá sesión"}
            </button>
          </p>
        </form>
      </motion.div>
    </AuthShell>
  )
}

const RATE_LIMIT_HINT =
  "Hubo demasiados intentos en poco tiempo. Esperá unos minutos antes de volver a intentar. Si tu proyecto usa confirmación por correo, el límite también puede afectar el envío de emails."

function translateAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("over_email_send")
  ) {
    return RATE_LIMIT_HINT
  }

  const translations: Record<string, string> = {
    "Invalid login credentials": "Credenciales inválidas. Verificá tu email y contraseña.",
    "Email not confirmed": "Tu email no fue confirmado. Revisá tu bandeja de entrada.",
    "User already registered": "Ya existe una cuenta con ese email.",
    "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres.",
    "Signup requires a valid password": "Se requiere una contraseña válida.",
    "Unable to validate email address: invalid format": "El formato del email no es válido.",
    "email rate limit exceeded": RATE_LIMIT_HINT,
    "Email rate limit exceeded": RATE_LIMIT_HINT,
    over_email_send_rate_limit: RATE_LIMIT_HINT,
  }
  return translations[message] ?? message
}
