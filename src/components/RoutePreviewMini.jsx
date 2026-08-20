// L37 — Tiny "is this trip worth it?" mini-map for the partner's incoming
// request toast. Renders two pins (partner, customer) inside a 120px-tall
// tile-textured rectangle, with an SVG line between them and an estimated
// drive time in the corner.
//
// We deliberately don't pull in Leaflet for this — a 120px sliver inside a
// 380px toast doesn't need real tiles, and the extra weight + Leaflet's
// mount/unmount cost would make the toast feel sluggish.
//
// Coordinates are projected onto the rect by normalising the (partner,
// customer) pair so each pin sits at ~20% margin from the box edges. This
// keeps both pins visible and the line readable regardless of true distance.

import { useMemo } from 'react'
import { formatDistance, formatEta } from '@/utils/format'

export default function RoutePreviewMini ({
  partnerLat, partnerLng, customerLat, customerLng, distanceKm,
}) {
  const haveBoth = [partnerLat, partnerLng, customerLat, customerLng]
    .every((v) => v != null && Number.isFinite(Number(v)))
  if (!haveBoth) return null

  // Normalise to a 100×100 SVG viewBox so we can drop two pins with a 15%
  // border. We pick the orientation that keeps the line longer (more
  // readable) — landscape projection is the default. The straight-line
  // segment is fine as a "rough trip" indicator; real road routing would
  // bloat the toast.
  const { pX, pY, cX, cY } = useMemo(() => {
    const pLat = Number(partnerLat); const pLng = Number(partnerLng)
    const cLat = Number(customerLat); const cLng = Number(customerLng)
    // Map lng → X, lat → Y. Invert Y because SVG (0,0) is top-left.
    const minLng = Math.min(pLng, cLng); const maxLng = Math.max(pLng, cLng)
    const minLat = Math.min(pLat, cLat); const maxLat = Math.max(pLat, cLat)
    const xRange = maxLng - minLng || 1e-6
    const yRange = maxLat - minLat || 1e-6
    const mapX = (lng) => 15 + ((lng - minLng) / xRange) * 70
    const mapY = (lat) => 85 - ((lat - minLat) / yRange) * 70
    return {
      pX: mapX(pLng), pY: mapY(pLat),
      cX: mapX(cLng), cY: mapY(cLat),
    }
  }, [partnerLat, partnerLng, customerLat, customerLng])

  const eta = formatEta(distanceKm)

  return (
    <div className="mx-4 mb-2 relative h-[120px] rounded-[var(--rs)] overflow-hidden
                    border border-border bg-[#eef2ee]">
      {/* Subtle grid texture — fakes the look of a map tile without loading one. */}
      <div className="absolute inset-0 opacity-50"
           style={{ backgroundImage:
             'linear-gradient(0deg,rgba(0,0,0,.06) 1px,transparent 1px),'
           + 'linear-gradient(90deg,rgba(0,0,0,.06) 1px,transparent 1px)',
             backgroundSize: '18px 18px' }} />

      {/* The route + pins are one SVG so the line scales with the box. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
           className="absolute inset-0 w-full h-full">
        <line x1={pX} y1={pY} x2={cX} y2={cY}
              stroke="#0a0f1e" strokeOpacity="0.55" strokeWidth="1.2"
              strokeDasharray="2 1.5" />
      </svg>

      {/* Partner pin (left) */}
      <div className="absolute" style={{ left: `${pX}%`, top: `${pY}%`,
           transform: 'translate(-50%, -100%)' }}>
        <div className="w-[26px] h-[26px] grid place-items-center rounded-full
                        bg-[#2563eb] text-white text-[12px] border-[2px] border-white
                        shadow-[0_3px_8px_rgba(0,0,0,0.25)]">
          🧰
        </div>
      </div>
      {/* Customer pin (right) */}
      <div className="absolute" style={{ left: `${cX}%`, top: `${cY}%`,
           transform: 'translate(-50%, -100%)' }}>
        <div className="w-[26px] h-[26px] grid place-items-center rounded-full
                        bg-accent text-white text-[12px] border-[2px] border-white
                        shadow-[0_3px_8px_rgba(0,0,0,0.25)]">
          📍
        </div>
      </div>

      {/* Distance + ETA chip — corner overlay */}
      <div className="absolute bottom-1.5 right-1.5 bg-black/55 text-white
                      rounded-md px-2 py-[3px] text-[10.5px] font-semibold tabular-nums">
        {distanceKm != null && formatDistance(distanceKm)}
        {eta && <span className="ml-1.5 opacity-90">· {eta}</span>}
      </div>
    </div>
  )
}
