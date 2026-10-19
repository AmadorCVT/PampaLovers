"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ArrowLeft, Leaf, Loader2 } from "lucide-react"

type AuthMode = "login" | "register"

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // La landing enlaza a /login?mode=register para abrir directo el registro.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "register") {
      setMode("register")
    }
  }, [])

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
      // --- LÓGICA DE LOGIN (Sin cambios) ---
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
      // --- NUEVA LÓGICA DE REGISTRO ---
      
      // 1. Usamos supabase.auth.signUp en lugar de fetch('/api/auth/register')
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      // 2. Manejamos los errores del registro
      if (signUpError) {
        setError(translateAuthError(signUpError.message))
        setLoading(false)
        return
      }

      // 3. Verificamos si la cuenta se creó pero requiere confirmación (aunque lo desactivamos, es buena práctica)
      if (data.user && data.user.identities && data.user.identities.length === 0) {
         setError("Este correo ya está registrado. Intenta iniciar sesión.")
         setLoading(false)
         return;
      }

      // 4. Si llegamos aquí, el usuario se registró y (como desactivamos la confirmación) ya debería tener sesión.
      // Solo nos queda redirigirlo.
      const { data: farms } = await supabase.from("farms").select("id").limit(1)
      if (!farms || farms.length === 0) {
        router.push("/onboarding")
      } else {
        router.push("/lotes")
      }
      router.refresh()
    }
  }

  function toggleMode() {
    setMode(mode === "login" ? "register" : "login")
    setError(null)
    setMessage(null)
    setConfirmPassword("")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Leaf className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">EvoAgro</h1>
            <p className="text-sm text-muted-foreground">
              Plataforma de Gestión Agrícola Inteligente
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <Card className="border-border/60">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Ingresá tus credenciales para acceder"
                : "Completá los datos para registrarte"}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={loading}
                />
              </div>

              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>
              )}

              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {message && (
                <div className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                  {message}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {mode === "login" ? "¿No tenés cuenta?" : "¿Ya tenés cuenta?"}{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  disabled={loading}
                >
                  {mode === "login" ? "Registrate" : "Iniciá sesión"}
                </button>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
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
