"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ChevronsUpDown,
  CreditCard,
  Layers,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Settings,
  Tractor,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { SidebarContent } from "@/components/app-sidebar"
import { BrandMark } from "@/components/brand-mark"
import { useFarmScope } from "@/components/farm-scope-context"
import { createFarm } from "@/lib/supabase-api"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function AppHeader() {
  const router = useRouter()
  const {
    farms,
    loading: farmsLoading,
    selectedFarmId,
    setSelectedFarmId,
    refreshFarms,
  } = useFarmScope()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [newFarmOpen, setNewFarmOpen] = useState(false)
  const [newFarmName, setNewFarmName] = useState("")
  const [creating, setCreating] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  // Material only appears once content actually scrolls beneath the bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  function getInitials(email: string | null): string {
    if (!email) return "??"
    const name = email.split("@")[0]
    return name.slice(0, 2).toUpperCase()
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  async function handleCreateFarm(e: React.FormEvent) {
    e.preventDefault()
    const name = newFarmName.trim()
    if (!name) {
      toast.error("Ingresá un nombre")
      return
    }
    setCreating(true)
    try {
      const farm = await createFarm({ name })
      await refreshFarms()
      setSelectedFarmId(farm.id)
      setNewFarmName("")
      setNewFarmOpen(false)
      toast.success("Campo creado")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al crear el campo",
      )
    }
    setCreating(false)
  }

  const selectValue =
    selectedFarmId === "all" ||
    farms.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : "all"
  const selectedFarmName =
    selectValue === "all"
      ? "Todos los campos"
      : (farms.find((f) => f.id === selectValue)?.name ?? "Campo")

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 transition-[background-color,box-shadow,backdrop-filter] duration-300",
          scrolled
            ? "material shadow-[0_1px_0_var(--border)]"
            : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-1 shrink-0 lg:hidden"
              aria-label="Abrir navegación"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <Link href="/lotes" className="shrink-0 lg:hidden" aria-label="EvoAgro — inicio">
              <BrandMark className="size-8 rounded-[10px]" />
            </Link>

            {farmsLoading ? (
              <div className="flex h-11 min-w-0 items-center gap-2.5 rounded-2xl px-3 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="truncate">Cargando campos…</span>
              </div>
            ) : (
              <>
                <Select
                  value={selectValue}
                  onValueChange={(v) =>
                    setSelectedFarmId(v === "all" ? "all" : v)
                  }
                >
                  <SelectTrigger
                    className="group h-11 w-full min-w-0 max-w-[260px] gap-3 rounded-2xl border-0 bg-card py-1.5 pr-3 pl-1.5 shadow-[var(--shadow-hairline),var(--shadow-soft)] hover:bg-card/80 sm:max-w-[300px] [&>svg:last-child]:hidden"
                    aria-label="Campo activo"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        {selectValue === "all" ? (
                          <Layers className="size-4" />
                        ) : (
                          <Tractor className="size-4" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col items-start leading-tight">
                        <span className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                          Campo activo
                        </span>
                        <span className="w-full truncate text-left text-[13.5px] font-semibold text-foreground">
                          {selectedFarmName}
                        </span>
                      </span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:scale-110" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[240px]">
                    <SelectItem value="all">
                      <Layers className="size-4" />
                      Todos los campos
                    </SelectItem>
                    {farms.length > 0 ? <SelectSeparator /> : null}
                    {farms.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        <Tractor className="size-4" />
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:inline-flex"
                  onClick={() => setNewFarmOpen(true)}
                >
                  <Plus />
                  Nuevo campo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground sm:hidden"
                  aria-label="Nuevo campo"
                  onClick={() => setNewFarmOpen(true)}
                >
                  <Plus />
                </Button>
              </>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="group flex shrink-0 items-center gap-2 rounded-full p-0.5 outline-none transition-transform active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                aria-label="Menú de cuenta"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary)_70%,var(--brand))] text-[12px] font-semibold tracking-wide text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/20%),0_0_0_2px_var(--background),0_0_0_3.5px_var(--border)] transition-shadow group-hover:shadow-[inset_0_1px_0_oklch(1_0_0/20%),0_0_0_2px_var(--background),0_0_0_3.5px_var(--ring)]">
                  {getInitials(userEmail)}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="end" sideOffset={8} forceMount>
              <DropdownMenuLabel className="px-2.5 py-2 font-normal">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
                    {getInitials(userEmail)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">Sesión iniciada como</p>
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {userEmail ?? "Usuario"}
                    </p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings />
                  Configuración
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/uso">
                  <CreditCard />
                  Uso y Plan
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOut />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-[284px] gap-0 rounded-r-[24px] border-0 bg-sidebar p-0 text-sidebar-foreground sm:max-w-[284px]"
        >
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <SidebarContent
            layoutId="sidebar-active-mobile"
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={newFarmOpen} onOpenChange={setNewFarmOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateFarm} className="grid gap-5">
            <DialogHeader>
              <span className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-foreground">
                <Tractor className="size-5" />
              </span>
              <DialogTitle>Nuevo campo</DialogTitle>
              <DialogDescription>
                Creá un campo para organizar lotes e historial por ubicación.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-farm-name">Nombre</Label>
              <Input
                id="new-farm-name"
                value={newFarmName}
                onChange={(e) => setNewFarmName(e.target.value)}
                placeholder="Ej. Campo Norte"
                autoComplete="off"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewFarmOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : null}
                {creating ? "Creando…" : "Crear campo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
