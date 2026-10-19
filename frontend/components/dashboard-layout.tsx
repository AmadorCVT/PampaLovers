"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { FarmScopeProvider } from "@/components/farm-scope-context"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="relative min-h-screen bg-background">
      {/* Ambient light from the top edge — static, so nothing moves behind content */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_60%_0%,color-mix(in_oklch,var(--brand)_14%,transparent),transparent_70%)] dark:bg-[radial-gradient(60%_100%_at_60%_0%,color-mix(in_oklch,var(--brand)_7%,transparent),transparent_70%)]"
      />
      <FarmScopeProvider>
        <AppSidebar />
        <div className="relative lg:pl-[248px]">
          <AppHeader />
          <main className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-20 sm:px-6 lg:px-8 lg:pt-6">
            {children}
          </main>
        </div>
      </FarmScopeProvider>
    </div>
  )
}
