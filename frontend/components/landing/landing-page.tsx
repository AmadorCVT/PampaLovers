"use client"

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  CloudRain,
  History,
  Landmark,
  Layers,
  Leaf,
  MapPinned,
  Satellite,
  ShieldCheck,
  Sprout,
  Tractor,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PLAN_AUDIENCE_SUBTITLE,
  PLAN_FEATURES,
  PLAN_LIMITS,
  PLAN_ORDER,
  type UserPlan,
} from "@/lib/plan-limits"
import { CountUp, Reveal, SpotlightCard, WhenVisible, useScrollProgress } from "@/components/landing/motion"
import { ParticleField } from "@/components/landing/particle-field"
import { FieldMap, NdviChart, ProductPreview, ndviColor } from "@/components/landing/product-preview"

const CROPS = ["Trigo", "Maíz", "Soja", "Girasol", "Sorgo", "Cebada", "Arroz", "Algodón"]

const NAV_LINKS = [
  { href: "#producto", label: "Producto" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#para-quien", label: "Para quién" },
  { href: "#planes", label: "Planes" },
]

interface Cta {
  href: string
  label: string
}

function getCtas(isAuthenticated: boolean): { primary: Cta; secondary: Cta } {
  return isAuthenticated
    ? {
        primary: { href: "/lotes", label: "Ir a mis lotes" },
        secondary: { href: "/analytics", label: "Ver rendimientos" },
      }
    : {
        primary: { href: "/login?mode=register", label: "Empezar gratis" },
        secondary: { href: "/login", label: "Iniciar sesión" },
      }
}

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const ctas = getCtas(isAuthenticated)

  return (
    <div data-landing className="dark min-h-screen overflow-x-clip bg-[#060906] text-foreground selection:bg-lime-300/30">
      <LandingNav ctas={ctas} isAuthenticated={isAuthenticated} />
      <main>
        <Hero ctas={ctas} />
        <CropMarquee />
        <section id="producto" className="relative scroll-mt-24 px-4 pb-24 pt-8 sm:px-6 sm:pb-32">
          <ProductPreview />
        </section>
        <Manifesto />
        <HowItWorks />
        <FeatureBento />
        <Audiences />
        <Pricing ctas={ctas} />
        <Faq />
        <FinalCta ctas={ctas} />
      </main>
      <Footer />
    </div>
  )
}

/* ───────────────────────────── Nav ───────────────────────────── */

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="EvoAgro, inicio">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-lime-300 to-green-600 shadow-[0_0_24px_rgb(163_230_53/0.35)]">
        <Leaf className="h-4.5 w-4.5 text-[#0b1a07]" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">EvoAgro</span>
    </Link>
  )
}

function LandingNav({
  ctas,
  isAuthenticated,
}: {
  ctas: ReturnType<typeof getCtas>
  isAuthenticated: boolean
}) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500",
        scrolled
          ? "border-b border-white/10 bg-[#060906]/70 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Secciones">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {!isAuthenticated && (
            <Link
              href={ctas.secondary.href}
              className="hidden rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:text-white sm:inline-flex"
            >
              {ctas.secondary.label}
            </Link>
          )}
          <PillButton href={ctas.primary.href} size="sm">
            {ctas.primary.label}
          </PillButton>
        </div>
      </div>
    </header>
  )
}

function PillButton({
  href,
  children,
  variant = "primary",
  size = "md",
}: {
  href: string
  children: ReactNode
  variant?: "primary" | "ghost"
  size?: "sm" | "md" | "lg"
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060906]",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-12 px-6 text-sm sm:text-base",
        size === "lg" && "h-14 px-8 text-base sm:text-lg",
        variant === "primary"
          ? "bg-lime-300 text-[#0b1a07] shadow-[0_0_0_0_rgb(190_242_100/0.5)] hover:bg-lime-200 hover:shadow-[0_0_40px_4px_rgb(190_242_100/0.35)]"
          : "border border-white/15 bg-white/5 text-white backdrop-blur hover:border-white/30 hover:bg-white/10",
      )}
    >
      {children}
      {variant === "primary" && (
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      )}
    </Link>
  )
}

/* ───────────────────────────── Hero ───────────────────────────── */

const HERO_LINES = [["Tu", "campo,"], ["visto", "desde", "el"], ["espacio."]]

function Hero({ ctas }: { ctas: ReturnType<typeof getCtas> }) {
  let wordIndex = 0

  return (
    <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-4 pt-16 sm:px-6">
      <div className="absolute inset-0">
        <ParticleField />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_45%,transparent_0%,#060906_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#060906]"
      />

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <div
          className="landing-rise mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/5 px-4 py-1.5 text-xs text-lime-100/90 backdrop-blur sm:text-sm"
          style={{ animationDelay: "0ms" }}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-300" />
          </span>
          Satélite + clima + machine learning
        </div>

        <h1 className="text-[clamp(2.9rem,10vw,8.5rem)] font-semibold leading-[0.92] tracking-[-0.045em] text-white">
          {HERO_LINES.map((line, lineIndex) => (
            <span key={lineIndex} className="block">
              {line.map((word) => {
                const delay = 120 + wordIndex++ * 90
                const isLast = lineIndex === HERO_LINES.length - 1
                return (
                  <Fragment key={word}>
                    <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                      <span
                        className={cn("landing-rise inline-block", isLast && "landing-gradient-text")}
                        style={{ animationDelay: `${delay}ms` }}
                      >
                        {word}
                      </span>
                    </span>{" "}
                  </Fragment>
                )
              })}
            </span>
          ))}
        </h1>

        <p
          className="landing-rise mx-auto mt-8 max-w-2xl text-balance text-base leading-relaxed text-white/60 sm:text-xl"
          style={{ animationDelay: "800ms" }}
        >
          EvoAgro combina imágenes satelitales, datos climáticos y un modelo de machine learning para
          predecir el rinde de cada lote <span className="text-white">antes de la cosecha</span>.
        </p>

        <div
          className="landing-rise mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "950ms" }}
        >
          <PillButton href={ctas.primary.href} size="lg">
            {ctas.primary.label}
          </PillButton>
          <PillButton href="#como-funciona" variant="ghost" size="lg">
            Ver cómo funciona
          </PillButton>
        </div>
      </div>

      <a
        href="#producto"
        aria-label="Bajar al producto"
        className="landing-rise absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-white/40 transition-colors hover:text-white"
        style={{ animationDelay: "1300ms" }}
      >
        <ChevronDown className="h-6 w-6 animate-bounce motion-reduce:animate-none" />
      </a>
    </section>
  )
}

/* ───────────────────────────── Marquee ───────────────────────────── */

function CropMarquee() {
  const items = [...CROPS, ...CROPS]
  return (
    <div className="relative border-y border-white/5 py-6 [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
      <div className="landing-marquee flex w-max gap-12">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-12" aria-hidden={copy === 1}>
            {items.map((crop, i) => (
              <span
                key={`${crop}-${i}`}
                className="flex items-center gap-12 whitespace-nowrap text-2xl font-medium tracking-tight text-white/25 sm:text-3xl"
              >
                {crop}
                <Sprout className="h-5 w-5 text-lime-300/40" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────────── Manifesto (texto que se ilumina) ───────────────────────────── */

const MANIFESTO =
  "Cada lote cuenta una historia. Nosotros la leemos desde el espacio, la cruzamos con el clima y la convertimos en una cifra: cuántos kilos por hectárea vas a cosechar."

function Manifesto() {
  const ref = useScrollProgress<HTMLElement>("sticky")
  const words = MANIFESTO.split(" ")
  const span = words.length + 6

  return (
    <section ref={ref} className="relative h-[220vh]">
      <div className="sticky top-0 flex h-[100svh] items-center px-4 sm:px-6">
        <p className="mx-auto max-w-5xl text-[clamp(1.9rem,4.6vw,4rem)] font-medium leading-[1.12] tracking-[-0.03em]">
          {words.map((word, i) => {
            const highlight = word.startsWith("espacio") || word.startsWith("clima") || word === "cifra:"
            return (
              <span
                key={i}
                className={cn(
                  "transition-opacity duration-150 motion-reduce:!opacity-100",
                  highlight ? "text-lime-300" : "text-white",
                )}
                style={{ opacity: `clamp(0.12, calc(var(--p, 0) * ${span} - ${i}), 1)` }}
              >
                {word}{" "}
              </span>
            )
          })}
        </p>
      </div>
    </section>
  )
}

/* ───────────────────────────── Cómo funciona (sticky) ───────────────────────────── */

const STEPS = [
  {
    icon: MapPinned,
    kicker: "01",
    title: "Dibujá tu lote",
    body: "Marcá el perímetro sobre el mapa satelital. Calculamos la superficie al instante y guardamos cultivo, fecha de siembra y manejo.",
  },
  {
    icon: Satellite,
    kicker: "02",
    title: "Leemos el satélite",
    body: "Obtenemos los índices NDVI y EVI de cada lote a partir de imágenes satelitales para seguir el vigor del cultivo durante toda la campaña.",
  },
  {
    icon: CloudRain,
    kicker: "03",
    title: "Sumamos el clima",
    body: "Temperatura y precipitaciones del lote, cruzadas con el ciclo del cultivo para entender qué está pasando y por qué.",
  },
  {
    icon: BrainCircuit,
    kicker: "04",
    title: "Predecimos tu rinde",
    body: "Un modelo de machine learning entrenado con datos agronómicos estima los kg/ha de cada lote antes de la cosecha.",
  },
]

function StepVisual({ index }: { index: number }) {
  switch (index) {
    case 0:
      return <DrawVisual />
    case 1:
      return <NdviGridVisual />
    case 2:
      return <WeatherVisual />
    default:
      return <PredictionVisual />
  }
}

function HowItWorks() {
  const [active, setActive] = useState(0)
  const onProgress = useCallback((p: number) => {
    setActive(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)))
  }, [])
  const ref = useScrollProgress<HTMLDivElement>("sticky", onProgress)

  return (
    <section id="como-funciona" className="relative scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 pt-24 sm:px-6 sm:pt-32">
        <SectionHeading
          eyebrow="Cómo funciona"
          title={
            <>
              De un polígono a una <span className="landing-gradient-text">predicción</span>.
            </>
          }
          body="Cuatro pasos. Sin hardware, sin sensores, sin planillas."
        />
      </div>

      {/* Desktop: panel fijo que cambia con el scroll */}
      <div ref={ref} className="relative hidden h-[400vh] lg:block">
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_1.15fr] items-center gap-16 px-6">
            <ol className="space-y-2">
              {STEPS.map((step, i) => {
                const isActive = i === active
                return (
                  <li
                    key={step.title}
                    className={cn(
                      "relative rounded-2xl border p-6 transition-all duration-500",
                      isActive
                        ? "border-white/10 bg-white/[0.04]"
                        : "border-transparent opacity-40 hover:opacity-70",
                    )}
                  >
                    <div className="flex items-start gap-5">
                      <span
                        className={cn(
                          "font-mono text-sm transition-colors duration-500",
                          isActive ? "text-lime-300" : "text-white/40",
                        )}
                      >
                        {step.kicker}
                      </span>
                      <div className="flex-1">
                        <h3 className="text-2xl font-semibold tracking-tight text-white">{step.title}</h3>
                        <div
                          className={cn(
                            "grid transition-all duration-500",
                            isActive ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                          )}
                        >
                          <p className="overflow-hidden text-white/60">{step.body}</p>
                        </div>
                      </div>
                      <step.icon
                        className={cn(
                          "h-5 w-5 transition-colors duration-500",
                          isActive ? "text-lime-300" : "text-white/30",
                        )}
                      />
                    </div>
                    {isActive && (
                      <div className="absolute inset-x-6 bottom-0 h-px overflow-hidden bg-white/5">
                        <div
                          className="h-full origin-left bg-lime-300"
                          style={{
                            transform: `scaleX(clamp(0, calc(var(--p, 0) * ${STEPS.length} - ${i}), 1))`,
                          }}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>

            <div className="relative aspect-[5/4] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] shadow-[0_30px_100px_-40px_rgb(163_230_53/0.4)]">
              {STEPS.map((step, i) => (
                <div
                  key={step.title}
                  className={cn(
                    "absolute inset-0 p-6 transition-all duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
                    i === active ? "scale-100 opacity-100" : "pointer-events-none scale-[0.96] opacity-0",
                  )}
                >
                  {/* Remontar al activarse para que las animaciones del visual se repitan. */}
                  <div key={i === active ? "on" : "off"} className="h-full">
                    <StepVisual index={i} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet: pasos apilados */}
      <div className="mx-auto max-w-2xl space-y-14 px-4 pb-24 pt-14 sm:px-6 lg:hidden">
        {STEPS.map((step, i) => (
          <Reveal key={step.title}>
            <div className="mb-5 flex items-center gap-3">
              <span className="font-mono text-sm text-lime-300">{step.kicker}</span>
              <h3 className="text-2xl font-semibold tracking-tight text-white">{step.title}</h3>
            </div>
            <p className="mb-6 text-white/60">{step.body}</p>
            <WhenVisible className="aspect-[5/4] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <StepVisual index={i} />
            </WhenVisible>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function DrawVisual() {
  const points = [
    [90, 70],
    [400, 52],
    [430, 300],
    [120, 330],
  ]
  const path = `M${points.map((p) => p.join(" ")).join(" L")} Z`
  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-[#1c2214]">
      <svg viewBox="0 0 520 400" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <rect width="520" height="400" fill="#262817" />
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={i} x1={i * 40} y1="0" x2={i * 40 - 60} y2="400" stroke="rgb(255 255 255 / 0.03)" strokeWidth="14" />
        ))}
        <path d={path} fill="rgb(190 242 100 / 0.12)" className="landing-fade-in" />
        <path
          d={path}
          fill="none"
          stroke="#bef264"
          strokeWidth="3"
          strokeLinejoin="round"
          pathLength={1}
          className="landing-draw"
        />
        {points.map(([x, y], i) => (
          <g key={i} className="landing-pop" style={{ animationDelay: `${i * 280}ms` }}>
            <circle cx={x} cy={y} r="14" fill="rgb(190 242 100 / 0.15)" />
            <circle cx={x} cy={y} r="6" fill="#0b1a07" stroke="#bef264" strokeWidth="3" />
          </g>
        ))}
      </svg>
      <div className="absolute bottom-4 left-4 rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur">
        <p className="text-xs text-white/50">Superficie</p>
        <p className="text-xl font-semibold text-white">
          <CountUp value={128.4} decimals={1} /> <span className="text-sm font-normal text-white/50">ha</span>
        </p>
      </div>
    </div>
  )
}

function NdviGridVisual() {
  const cols = 16
  const rows = 12
  return (
    <div className="flex h-full flex-col gap-4">
      <div
        className="grid flex-1 gap-[3px] overflow-hidden rounded-2xl"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols * rows }).map((_, i) => {
          const x = i % cols
          const y = Math.floor(i / cols)
          // Campo de vigor sintético, estable entre renders.
          const v = 0.55 + 0.25 * Math.sin(x * 0.55 + y * 0.2) * Math.cos(y * 0.45 - x * 0.1) + 0.08 * Math.sin(i * 12.9898)
          return (
            <div
              key={i}
              className="landing-cell rounded-[3px]"
              style={{ backgroundColor: ndviColor(v), animationDelay: `${(x + y) * 35}ms` }}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-3 text-xs text-white/50">
        <span>NDVI</span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{ background: `linear-gradient(90deg, ${ndviColor(0.2)}, ${ndviColor(0.5)}, ${ndviColor(0.85)})` }}
        />
        <span className="font-mono">0.2 — 0.9</span>
      </div>
    </div>
  )
}

const RAIN = [12, 4, 28, 40, 18, 6, 0, 22, 35, 14, 9, 30]
const TEMP = [19, 21, 23, 26, 27, 25, 24, 22, 20, 18, 21, 24]

function WeatherVisual() {
  const maxRain = Math.max(...RAIN)
  const tempLine = TEMP.map((t, i) => `${i ? "L" : "M"}${(i + 0.5) * (100 / TEMP.length)} ${100 - ((t - 14) / 16) * 100}`).join(" ")
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <CloudRain className="h-4 w-4 text-sky-300" />
          <p className="mt-2 text-2xl font-semibold text-white">
            <CountUp value={218} /> mm
          </p>
          <p className="text-xs text-white/45">Lluvia acumulada</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <span className="text-sm text-amber-300">°C</span>
          <p className="mt-2 text-2xl font-semibold text-white">
            <CountUp value={22.5} decimals={1} />°
          </p>
          <p className="text-xs text-white/45">Temperatura media</p>
        </div>
      </div>
      <div className="relative flex-1 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex h-full items-end gap-[6%]">
          {RAIN.map((r, i) => (
            <div
              key={i}
              className="landing-grow flex-1 origin-bottom rounded-t-md bg-gradient-to-t from-sky-500/40 to-sky-300/80"
              style={{ height: `${Math.max(4, (r / maxRain) * 85)}%`, animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] overflow-visible">
          <path
            d={tempLine}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className="landing-fade-in"
            style={{ animationDelay: "500ms" }}
          />
        </svg>
      </div>
    </div>
  )
}

function PredictionVisual() {
  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">Rinde estimado · Soja</p>
        <p className="mt-3 text-[clamp(3rem,6vw,5.5rem)] font-semibold leading-none tracking-tight text-white">
          <CountUp value={3420} />
          <span className="ml-2 text-xl font-normal text-white/45">kg/ha</span>
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-lime-300/10 px-3 py-1 text-sm text-lime-300">
          <BrainCircuit className="h-4 w-4" />
          Calculado con NDVI, EVI, clima y manejo del lote
        </p>
      </div>
      <div className="min-h-0 flex-1 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <NdviChart className="h-full w-full" />
      </div>
    </div>
  )
}

/* ───────────────────────────── Bento ───────────────────────────── */

const FEATURES = [
  {
    icon: Satellite,
    title: "Mapa satelital por capas",
    body: "Todos tus lotes sobre imagen satelital o mapa de calles, con su nombre y estado de un vistazo.",
    className: "lg:col-span-2 lg:row-span-2",
    visual: true,
  },
  {
    icon: BarChart3,
    title: "Rendimientos",
    body: "Comparás predicción vs. realidad y la evolución entre campañas.",
  },
  {
    icon: History,
    title: "Historial de cosechas",
    body: "Registrá cada cosecha y construí la memoria productiva de tu campo.",
  },
  {
    icon: Layers,
    title: "Múltiples campos",
    body: "Organizá lotes por establecimiento y cambiá de campo con un clic.",
  },
  {
    icon: Sprout,
    title: "8 cultivos",
    body: CROPS.join(", ") + ".",
  },
]

function FeatureBento() {
  return (
    <section className="relative px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Todo en un lugar"
          title={
            <>
              Tu campo entero, <span className="landing-gradient-text">en una pantalla</span>.
            </>
          }
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:auto-rows-[minmax(220px,auto)] lg:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 80} className={feature.className}>
              <SpotlightCard className="h-full">
                <div className="flex h-full flex-col p-6">
                  <feature.icon className="h-6 w-6 text-lime-300" />
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-white">{feature.title}</h3>
                  <p className="mt-2 text-white/55">{feature.body}</p>
                  {feature.visual && (
                    <div className="mt-6 aspect-[600/380] flex-1 overflow-hidden rounded-xl border border-white/10">
                      <FieldMap scanning={false} />
                    </div>
                  )}
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
          <Reveal delay={FEATURES.length * 80} className="sm:col-span-2 lg:col-span-4">
            <SpotlightCard className="h-full">
              <div className="grid h-full grid-cols-3 divide-x divide-white/10 p-6 lg:py-10">
                <Stat value={8} label="cultivos soportados" />
                <Stat value={2} label="índices satelitales" />
                <Stat value={0} label="sensores para instalar" />
              </div>
            </SpotlightCard>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col justify-center px-3 text-center first:pl-0 last:pr-0">
      <p className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        <CountUp value={value} />
      </p>
      <p className="mt-2 text-xs text-white/50 sm:text-sm">{label}</p>
    </div>
  )
}

/* ───────────────────────────── Para quién ───────────────────────────── */

const AUDIENCES = [
  {
    icon: Tractor,
    title: "Productores",
    body: "Seguí el vigor de cada lote y anticipá el rinde para decidir comercialización y logística con tiempo.",
  },
  {
    icon: Landmark,
    title: "Terratenientes",
    body: "Monitoreá la productividad de tus campos arrendados con datos objetivos, campaña tras campaña.",
  },
  {
    icon: ShieldCheck,
    title: "Aseguradoras",
    body: "Evaluá riesgo por lote con evidencia satelital y climática, a escala de miles de hectáreas.",
  },
]

function Audiences() {
  return (
    <section id="para-quien" className="relative scroll-mt-16 px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Para quién" title="Hecho para quienes viven del campo." />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((audience, i) => (
            <Reveal key={audience.title} delay={i * 120}>
              <SpotlightCard className="h-full">
                <div className="p-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-lime-300/20 bg-lime-300/10">
                    <audience.icon className="h-6 w-6 text-lime-300" />
                  </div>
                  <h3 className="mt-8 text-2xl font-semibold tracking-tight text-white">{audience.title}</h3>
                  <p className="mt-3 leading-relaxed text-white/55">{audience.body}</p>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────────── Planes ───────────────────────────── */

const PLAN_TAGLINE: Record<UserPlan, string> = {
  free: "Para probar con tus primeros lotes",
  premium: PLAN_AUDIENCE_SUBTITLE.premium ?? "",
  pro: PLAN_AUDIENCE_SUBTITLE.pro ?? "",
}

function Pricing({ ctas }: { ctas: ReturnType<typeof getCtas> }) {
  return (
    <section id="planes" className="relative scroll-mt-16 px-4 py-24 sm:px-6 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/3 -z-0 h-[500px] bg-[radial-gradient(ellipse_at_center,rgb(163_230_53/0.10),transparent_60%)]"
      />
      <div className="relative mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Planes"
          title="Empezá gratis. Escalá cuando quieras."
          body="Precios en USD por mes."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {PLAN_ORDER.map((tier, i) => {
            const limits = PLAN_LIMITS[tier]
            const featured = tier === "premium"
            return (
              <Reveal key={tier} delay={i * 120}>
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-3xl border p-8",
                    featured
                      ? "border-lime-300/40 bg-gradient-to-b from-lime-300/[0.09] to-white/[0.02] shadow-[0_30px_80px_-30px_rgb(163_230_53/0.45)]"
                      : "border-white/10 bg-white/[0.03]",
                  )}
                >
                  {featured && (
                    <span className="absolute -top-3 left-8 rounded-full bg-lime-300 px-3 py-1 text-xs font-semibold text-[#0b1a07]">
                      Recomendado
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-white">{limits.label}</h3>
                  <p className="mt-1 text-sm text-white/50">{PLAN_TAGLINE[tier]}</p>
                  <p className="mt-6 text-5xl font-semibold tracking-tight text-white">
                    {limits.priceUsd === 0 ? "Gratis" : `$${limits.priceUsd}`}
                    {limits.priceUsd > 0 && <span className="ml-1 text-base font-normal text-white/45">/mes</span>}
                  </p>
                  <ul className="mt-8 flex-1 space-y-3">
                    {PLAN_FEATURES[tier].map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-white/70">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime-300" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <Link
                      href={ctas.primary.href}
                      className={cn(
                        "flex h-12 w-full items-center justify-center rounded-full text-sm font-medium transition-all duration-300",
                        featured
                          ? "bg-lime-300 text-[#0b1a07] hover:bg-lime-200 hover:shadow-[0_0_30px_rgb(190_242_100/0.35)]"
                          : "border border-white/15 text-white hover:border-white/30 hover:bg-white/5",
                      )}
                    >
                      {tier === "free" ? ctas.primary.label : `Elegir ${limits.label}`}
                    </Link>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────────── FAQ ───────────────────────────── */

const FAQS = [
  {
    q: "¿Necesito instalar sensores o equipos?",
    a: "No. Todo se calcula a partir de imágenes satelitales y datos climáticos del lote. Solo dibujás el lote en el mapa.",
  },
  {
    q: "¿Qué cultivos puedo cargar?",
    a: `Hoy soportamos ${CROPS.slice(0, -1).join(", ")} y ${CROPS[CROPS.length - 1]}.`,
  },
  {
    q: "¿Cómo se calcula la predicción de rinde?",
    a: "Un modelo de machine learning combina la evolución de NDVI y EVI del lote, el clima de la campaña y los datos de manejo que cargás (riego, fertilización, estado sanitario) para estimar los kg/ha.",
  },
  {
    q: "¿Puedo empezar sin pagar?",
    a: "Sí. El plan Free es gratuito y te permite cargar hasta 5 lotes en un campo.",
  },
]

function Faq() {
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Preguntas frecuentes" title="¿Dudas?" />
        <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium text-white">
                {item.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 transition-transform duration-300 group-open:rotate-45">
                  <span className="text-xl leading-none text-white/70">+</span>
                </span>
              </summary>
              <p className="mt-4 pr-14 leading-relaxed text-white/60">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────────── CTA final + footer ───────────────────────────── */

function FinalCta({ ctas }: { ctas: ReturnType<typeof getCtas> }) {
  return (
    <section className="relative overflow-hidden px-4 py-32 sm:px-6 sm:py-44">
      <div className="absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]">
        <ParticleField />
      </div>
      <Reveal className="relative mx-auto max-w-4xl text-center">
        <h2 className="text-[clamp(2.5rem,7vw,6rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-white">
          Sembrá datos.
          <br />
          <span className="landing-gradient-text">Cosechá certezas.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">
          Cargá tu primer lote en minutos y mirá tu campo como nunca antes.
        </p>
        <div className="mt-10 flex justify-center">
          <PillButton href={ctas.primary.href} size="lg">
            {ctas.primary.label}
          </PillButton>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 px-4 pt-16 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm text-white/50">
            Predicción de rendimientos con imágenes satelitales y machine learning. MVP desarrollado en
            HackITBA 2026.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-x-16 gap-y-3 text-sm" aria-label="Pie de página">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-white/55 transition-colors hover:text-white">
              {link.label}
            </a>
          ))}
          <Link href="/login" className="text-white/55 transition-colors hover:text-white">
            Iniciar sesión
          </Link>
          <Link href="/login?mode=register" className="text-white/55 transition-colors hover:text-white">
            Crear cuenta
          </Link>
        </nav>
      </div>
      <p
        aria-hidden
        className="landing-wordmark pointer-events-none mt-16 select-none text-center text-[clamp(5rem,24vw,22rem)] font-semibold leading-[0.78] tracking-[-0.07em]"
      >
        EvoAgro
      </p>
      <p className="relative -mt-4 pb-6 text-center text-xs text-white/30 sm:-mt-8">
        © 2026 EvoAgro · HackITBA
      </p>
    </footer>
  )
}

/* ───────────────────────────── Shared ───────────────────────────── */

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: ReactNode
  body?: string
}) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-lime-300/80">{eyebrow}</p>
      <h2 className="mt-4 text-balance text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.04em] text-white">
        {title}
      </h2>
      {body && <p className="mx-auto mt-5 max-w-xl text-lg text-white/55">{body}</p>}
    </Reveal>
  )
}
