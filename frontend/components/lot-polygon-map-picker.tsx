"use client"

import { useEffect, useRef, useState } from "react"
import type { LayerGroup, Map as LeafletMap, TileLayer } from "leaflet"
import { motion } from "motion/react"
import { Eraser, Map as MapIcon, Satellite, Undo2 } from "lucide-react"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  ESRI_ATTRIBUTION,
  ESRI_TILES,
  OSM_ATTRIBUTION,
  OSM_TILES,
  PAMPA_DEMO_CENTER,
} from "@/components/satellite-map"
import "leaflet/dist/leaflet.css"

const MAX_POINTS = 4
/** Chlorophyll — reads clearly over both satellite imagery and street tiles. */
const LOT_COLOR = "#c8f04a"

export type LngLatTuple = [number, number]

type LotPolygonMapPickerProps = {
  points: LngLatTuple[]
  onPointsChange: (next: LngLatTuple[]) => void
  className?: string
  /** When the host dialog is open, triggers invalidateSize so tiles render correctly */
  active?: boolean
}

function vertexIcon(L: typeof import("leaflet"), index: number) {
  return L.divIcon({
    className: "lot-vertex-marker border-0 bg-transparent",
    html: `<div style="background:${LOT_COLOR};color:#1d2a12;border:2.5px solid #fff;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font:700 12px/1 var(--font-geist),system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.4)">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

export function LotPolygonMapPicker({
  points,
  onPointsChange,
  className,
  active = true,
}: LotPolygonMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const groupRef = useRef<LayerGroup | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const layerRef = useRef<TileLayer | null>(null)
  const layersRef = useRef<{
    streets: TileLayer
    satellite: TileLayer
  } | null>(null)
  const pointsRef = useRef(points)
  const onPointsChangeRef = useRef(onPointsChange)
  const [mapReady, setMapReady] = useState(false)
  const [mapType, setMapType] = useState<"satellite" | "streets">("satellite")

  pointsRef.current = points
  onPointsChangeRef.current = onPointsChange

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    let cancelled = false

    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return

      leafletRef.current = L
      const map = L.map(containerRef.current, {
        center: PAMPA_DEMO_CENTER,
        zoom: 7,
        zoomControl: true,
      })

      const streets = L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION })
      const satellite = L.tileLayer(ESRI_TILES, {
        attribution: ESRI_ATTRIBUTION,
      })
      layersRef.current = { streets, satellite }
      satellite.addTo(map)
      layerRef.current = satellite

      const fg = L.layerGroup().addTo(map)
      groupRef.current = fg
      mapRef.current = map

      map.on("click", (e) => {
        const current = pointsRef.current
        if (current.length >= MAX_POINTS) return
        const next: LngLatTuple[] = [
          ...current,
          [e.latlng.lng, e.latlng.lat],
        ]
        onPointsChangeRef.current(next)
      })

      setMapReady(true)
    })

    return () => {
      cancelled = true
      setMapReady(false)
      mapRef.current?.remove()
      mapRef.current = null
      groupRef.current = null
      leafletRef.current = null
      layerRef.current = null
      layersRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    const current = layerRef.current
    if (!mapReady || !map || !layers || !current) return

    const next = mapType === "satellite" ? layers.satellite : layers.streets
    if (next === current) return

    map.removeLayer(current)
    next.addTo(map)
    layerRef.current = next
  }, [mapType, mapReady])

  useEffect(() => {
    if (!mapReady) return
    const L = leafletRef.current
    const fg = groupRef.current
    if (!L || !fg) return

    fg.clearLayers()
    const latLngs: [number, number][] = points.map(([lon, lat]) => [lat, lon])

    points.forEach(([lon, lat], i) => {
      L.marker([lat, lon], { icon: vertexIcon(L, i) }).addTo(fg)
    })

    if (points.length >= 2 && points.length < 3) {
      L.polyline(latLngs, { color: LOT_COLOR, weight: 2.5, opacity: 0.95, dashArray: "6 6" }).addTo(
        fg
      )
    }

    if (points.length >= 3) {
      L.polygon(latLngs, {
        color: LOT_COLOR,
        weight: 2.5,
        fillColor: LOT_COLOR,
        fillOpacity: 0.22,
      }).addTo(fg)
    }
  }, [points, mapReady])

  useEffect(() => {
    if (!active || !mapReady || !mapRef.current) return
    const map = mapRef.current
    const raf = requestAnimationFrame(() => map.invalidateSize())
    const t = window.setTimeout(() => map.invalidateSize(), 200)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [active, mapReady])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn("cursor-crosshair", className)}
        style={{ minHeight: 340, height: 340, width: "100%" }}
        aria-label="Mapa para marcar vértices del lote"
      />

      {/* Map type — floating segmented control */}
      <div className="absolute top-3 right-3 z-10">
        <MapTypeSegmented value={mapType} onChange={setMapType} layoutId="picker-map-type" />
      </div>

      {/* Vertex progress + edits */}
      <div className="material-thick material-edge absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-2xl p-1 pl-3 shadow-raised">
        <div className="flex items-center gap-1.5 pr-1" aria-live="polite">
          {Array.from({ length: MAX_POINTS }).map((_, i) => (
            <motion.span
              key={i}
              animate={{
                scale: i < points.length ? 1 : 0.7,
                backgroundColor: i < points.length ? LOT_COLOR : "rgba(127,127,127,0.35)",
              }}
              transition={spring.snappy}
              className="size-2.5 rounded-full"
            />
          ))}
          <span className="numeric ml-1.5 text-[12px] font-semibold text-foreground">
            <span className="hidden sm:inline">Puntos marcados: </span>{points.length} / {MAX_POINTS}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onPointsChange(points.slice(0, -1))}
          aria-label="Deshacer último"
          disabled={points.length === 0}
          className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold text-foreground transition-[background-color,transform,opacity] hover:bg-foreground/[0.07] active:scale-95 disabled:opacity-35"
        >
          <Undo2 className="size-3.5" />
          <span className="hidden sm:inline">Deshacer último</span>
        </button>
        <button
          type="button"
          onClick={() => onPointsChange([])}
          aria-label="Limpiar puntos"
          disabled={points.length === 0}
          className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold text-foreground transition-[background-color,transform,opacity] hover:bg-foreground/[0.07] active:scale-95 disabled:opacity-35"
        >
          <Eraser className="size-3.5" />
          <span className="hidden sm:inline">Limpiar puntos</span>
        </button>
      </div>
    </div>
  )
}

/** Shared by the picker and the satellite page. */
export function MapTypeSegmented({
  value,
  onChange,
  layoutId,
}: {
  value: "satellite" | "streets"
  onChange: (v: "satellite" | "streets") => void
  layoutId: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de mapa"
      className="material-thick material-edge flex rounded-full p-1 shadow-raised"
    >
      {(
        [
          { v: "satellite", label: "Satelital", icon: Satellite },
          { v: "streets", label: "Calles", icon: MapIcon },
        ] as const
      ).map(({ v, label, icon: Icon }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              "relative z-0 flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors duration-200 active:scale-95",
              active ? "text-primary-foreground" : "text-foreground/70 hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={spring.snappy}
                className="absolute inset-0 -z-10 rounded-full bg-primary shadow-soft"
              />
            ) : null}
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
}
