"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import {
  Map,
  Satellite,
  BarChart3,
  CreditCard,
  Settings,
  History,
  type LucideIcon,
} from "lucide-react"
import { BrandMark, BrandWordmark } from "@/components/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

type NavItem = { name: string; href: string; icon: LucideIcon }

const navigation: { section: string; items: NavItem[] }[] = [
  {
    section: "Campo",
    items: [
      { name: "Mis Lotes", href: "/lotes", icon: Map },
      { name: "Historial", href: "/historial", icon: History },
      { name: "Vista Satelital", href: "/satelite", icon: Satellite },
    ],
  },
  {
    section: "Inteligencia",
    items: [{ name: "Rendimientos", href: "/analytics", icon: BarChart3 }],
  },
  {
    section: "Cuenta",
    items: [
      { name: "Uso y Plan", href: "/uso", icon: CreditCard },
      { name: "Configuración", href: "/settings", icon: Settings },
    ],
  },
]

export function SidebarContent({
  onNavigate,
  layoutId = "sidebar-active",
}: {
  onNavigate?: () => void
  layoutId?: string
}) {
  const pathname = usePathname()

  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden">
      {/* Field rows catching light — fades out under the logo */}
      <div
        aria-hidden
        className="field-lines pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 text-brand opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 -z-10 size-64 rounded-full bg-brand/20 blur-3xl"
      />

      <Link
        href="/lotes"
        onClick={onNavigate}
        className="flex h-[72px] items-center gap-3 px-5 outline-none"
      >
        <BrandMark />
        <BrandWordmark className="text-sidebar-foreground" />
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pt-2 pb-4" aria-label="Principal">
        {navigation.map(({ section, items }) => (
          <div key={section} className="space-y-1">
            <p className="eyebrow px-3 pb-1 text-sidebar-foreground/40">{section}</p>
            {items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative z-0 flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium outline-none transition-[color,transform] duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                    isActive
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId={layoutId}
                      transition={spring.move}
                      className="absolute inset-0 -z-10 rounded-xl bg-sidebar-accent shadow-[inset_0_1px_0_oklch(1_0_0/7%)]"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg transition-colors duration-200",
                      isActive ? "bg-brand text-brand-foreground" : "text-current",
                    )}
                  >
                    <item.icon className="size-[17px]" strokeWidth={isActive ? 2.2 : 1.9} />
                  </span>
                  {item.name}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-sidebar-foreground/50">Apariencia</span>
          <ThemeToggle className="w-[108px]" layoutId={`${layoutId}-theme`} />
        </div>
      </div>
    </div>
  )
}

/** Desktop: a floating forest panel inset from the window edge. */
export function AppSidebar() {
  return (
    <aside className="fixed inset-y-3 left-3 z-40 hidden w-[236px] overflow-hidden rounded-[22px] bg-sidebar text-sidebar-foreground shadow-[inset_0_1px_0_oklch(1_0_0/6%),var(--shadow-raised)] lg:block">
      <SidebarContent />
    </aside>
  )
}
