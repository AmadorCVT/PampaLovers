"use client"

import { useId } from "react"
import { BarChart3, CloudRain, History, Map, Satellite, Thermometer, TrendingUp } from "lucide-react"
import { CountUp, WhenVisible, useScrollProgress } from "@/components/landing/motion"

/** Lotes de la vista ilustrativa (coordenadas en el viewBox 600×380). */
const DEMO_PLOTS = [
  { name: "Lote Norte", crop: "Soja", ndvi: 0.78, points: "40,40 252,28 272,172 58,190", label: [26, 22], rows: 18 },
  { name: "La Loma", crop: "Maíz", ndvi: 0.64, points: "292,40 562,58 542,198 302,182", label: [70, 26], rows: -12 },
  { name: "Bajo Sur", crop: "Trigo", ndvi: 0.49, points: "48,214 282,200 300,350 70,356", label: [28, 72], rows: 4 },
  { name: "El Molino", crop: "Girasol", ndvi: 0.71, points: "322,214 546,230 560,350 332,344", label: [72, 75], rows: -24 },
] as const

/** Escala NDVI aproximada: suelo desnudo → vegetación densa. */
export function ndviColor(ndvi: number) {
  const hue = 30 + Math.max(0, Math.min(1, (ndvi - 0.2) / 0.65)) * 95
  return `hsl(${hue.toFixed(0)} 58% 38%)`
}

export function FieldMap({ scanning = true }: { scanning?: boolean }) {
  // IDs únicos: el mapa puede aparecer más de una vez en la página.
  const uid = useId().replace(/:/g, "")
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#1c2214]">
      <svg viewBox="0 0 600 380" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          {DEMO_PLOTS.map((plot, i) => (
            <pattern
              key={plot.name}
              id={`${uid}-rows-${i}`}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${plot.rows})`}
            >
              <rect width="7" height="7" fill={ndviColor(plot.ndvi)} />
              <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(0 0 0 / 0.22)" strokeWidth="2.5" />
            </pattern>
          ))}
          <radialGradient id={`${uid}-vignette`} cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgb(0 0 0 / 0.55)" />
          </radialGradient>
        </defs>
        {/* Caminos rurales y parcelas vecinas */}
        <rect width="600" height="380" fill="#2a2a1a" />
        <path d="M0 196 C 180 205, 420 190, 600 214" stroke="#6b6248" strokeWidth="9" fill="none" opacity="0.7" />
        <path d="M287 0 C 290 120, 300 260, 316 380" stroke="#6b6248" strokeWidth="7" fill="none" opacity="0.7" />
        <path d="M0 330 Q 60 300 30 250 T 10 120" stroke="#2f4a5c" strokeWidth="5" fill="none" opacity="0.8" />
        {DEMO_PLOTS.map((plot, i) => (
          <polygon
            key={plot.name}
            points={plot.points}
            fill={`url(#${uid}-rows-${i})`}
            stroke="rgb(217 249 157 / 0.85)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
        <rect width="600" height="380" fill={`url(#${uid}-vignette)`} />
      </svg>

      {scanning && (
        <div aria-hidden className="landing-scan pointer-events-none absolute inset-x-0 top-0 h-1/4">
          <div className="h-full w-full bg-gradient-to-b from-transparent via-lime-300/15 to-lime-200/40" />
          <div className="h-px w-full bg-lime-200/80 shadow-[0_0_18px_4px_rgb(190_242_100/0.5)]" />
        </div>
      )}

      {DEMO_PLOTS.map((plot) => (
        <div
          key={plot.name}
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white backdrop-blur-md sm:px-2 sm:py-1 sm:text-xs"
          style={{ left: `${plot.label[0]}%`, top: `${plot.label[1]}%` }}
        >
          <p className="font-semibold">{plot.name}</p>
          <p className="text-white/70">
            {plot.crop} · NDVI <span className="font-mono text-lime-200">{plot.ndvi.toFixed(2)}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

const NDVI_SERIES = [0.18, 0.22, 0.31, 0.42, 0.55, 0.63, 0.7, 0.76, 0.78, 0.74, 0.69, 0.6]

export function NdviChart({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "")
  const w = 320
  const h = 120
  const points = NDVI_SERIES.map((v, i) => [
    (i / (NDVI_SERIES.length - 1)) * w,
    h - 8 - v * (h - 16),
  ])
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(190 242 100 / 0.35)" />
          <stop offset="100%" stopColor="rgb(190 242 100 / 0)" />
        </linearGradient>
        <linearGradient id={`${uid}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="55%" stopColor="#a3e635" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="rgb(255 255 255 / 0.06)" />
      ))}
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${uid}-area)`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#${uid}-line)`}
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        className="landing-draw"
      />
    </svg>
  )
}

const MINI_NAV = [Map, History, Satellite, BarChart3]

/** Ventana del producto que se "acuesta" en perspectiva a medida que entra en pantalla. */
export function ProductPreview() {
  const ref = useScrollProgress<HTMLDivElement>("through")

  return (
    <div ref={ref} className="relative mx-auto max-w-6xl [perspective:1800px]">
      <div
        aria-hidden
        className="absolute -inset-x-10 -top-20 bottom-0 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,rgb(163_230_53/0.22),transparent_65%)] blur-2xl"
      />
      <div
        className="origin-top rounded-2xl border border-white/10 bg-[#0b100a]/90 p-2 shadow-[0_40px_120px_-30px_rgb(163_230_53/0.35)] will-change-transform motion-reduce:!transform-none sm:p-3"
        style={{
          transform:
            "rotateX(calc((1 - min(1, var(--p, 0) * 2.6)) * 32deg)) scale(calc(0.86 + min(1, var(--p, 0) * 2.6) * 0.14))",
        }}
      >
        {/* Barra de ventana */}
        <div className="flex items-center gap-2 px-2 pb-2 sm:px-3 sm:pb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <div className="mx-auto hidden rounded-md bg-white/5 px-4 py-1 font-mono text-[11px] text-white/40 sm:block">
            evoagro.app/lotes
          </div>
        </div>

        <div className="grid gap-2 rounded-xl bg-black/30 p-2 sm:gap-3 sm:p-3 lg:grid-cols-[52px_1fr_300px]">
          <div className="hidden flex-col items-center gap-3 rounded-lg bg-white/[0.03] py-3 lg:flex">
            {MINI_NAV.map((Icon, i) => (
              <div
                key={i}
                className={
                  i === 0
                    ? "rounded-md bg-lime-300/15 p-2 text-lime-300"
                    : "rounded-md p-2 text-white/35"
                }
              >
                <Icon className="h-4 w-4" />
              </div>
            ))}
          </div>

          <div className="aspect-[600/380] min-h-0">
            <FieldMap />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Rinde estimado · Lote Norte</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
                <CountUp value={3420} />
                <span className="ml-1 text-base font-normal text-white/50">kg/ha</span>
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-lime-300">
                <TrendingUp className="h-3.5 w-3.5" />
                +12,4% vs. campaña anterior
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">NDVI · campaña</p>
                <p className="font-mono text-xs text-lime-200">0.78</p>
              </div>
              <WhenVisible className="mt-3 h-20">
                <NdviChart className="h-full w-full" />
              </WhenVisible>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <Thermometer className="h-4 w-4 text-amber-300" />
                <p className="mt-2 text-lg font-semibold text-white">24°C</p>
                <p className="text-xs text-white/45">Temp. media</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <CloudRain className="h-4 w-4 text-sky-300" />
                <p className="mt-2 text-lg font-semibold text-white">38 mm</p>
                <p className="text-xs text-white/45">Lluvia 30 días</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-white/35">Vista ilustrativa con datos de ejemplo.</p>
    </div>
  )
}
