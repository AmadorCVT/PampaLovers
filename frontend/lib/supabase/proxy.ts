import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

import { getSupabaseBrowserEnv } from "@/lib/supabase/config"

const AUTH_ROUTES = ["/login"]
/** Rutas abiertas a todo visitante (la landing), con o sin sesión. */
const OPEN_ROUTES = ["/"]

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  const { supabaseUrl, supabasePublishableKey } = getSupabaseBrowserEnv()

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

        response = NextResponse.next({
          request,
        })

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))
  const isPublicRoute = isAuthRoute || OPEN_ROUTES.includes(pathname)

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthRoute) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = "/lotes"
    return NextResponse.redirect(homeUrl)
  }

  return response
}
