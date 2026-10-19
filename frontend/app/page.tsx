import type { Metadata } from "next"

import { LandingPage } from "@/components/landing/landing-page"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "EvoAgro — Tu campo, visto desde el espacio",
  description:
    "Imágenes satelitales, clima y machine learning para predecir el rinde de cada lote antes de la cosecha.",
}

/** Landing pública: accesible sin cuenta. Con sesión, los CTA llevan directo a Mis Lotes. */
export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <LandingPage isAuthenticated={Boolean(user)} />
}
