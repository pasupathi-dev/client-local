// H38 — Watches the partner's GPS while they're traveling and flips
// `inside` to true the moment they're within `radiusM` of the customer's
// coords. The component decides what to do (typically: show a "Mark as
// Arrived?" prompt). We deliberately do NOT auto-fire any state change —
// the spec says "prompt, don't auto-fire" so the partner stays in control.
//
// Usage:
//   const inside = useGeofenceArrival({
//     enabled: job.state === 'travelling',
//     targetLat: job.customer_lat,
//     targetLng: job.customer_lng,
//     radiusM:  80,
//   })
//
//   useEffect(() => { if (inside) setArriveModalOpen(true) }, [inside])

import { useEffect, useState } from 'react'

// Haversine in metres. Cheap enough to run on every position fix.
function haversineMeters (lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
          * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export default function useGeofenceArrival ({
  enabled, targetLat, targetLng, radiusM = 80,
}) {
  const [inside, setInside] = useState(false)

  useEffect(() => {
    if (!enabled || targetLat == null || targetLng == null) {
      setInside(false)
      return undefined
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined

    let watchId = null
    let intervalId = null

    const check = (pos) => {
      if (!pos?.coords) return
      const m = haversineMeters(
        Number(pos.coords.latitude), Number(pos.coords.longitude),
        Number(targetLat), Number(targetLng),
      )
      if (m <= radiusM) setInside(true)
      // We don't flip back to false once we've entered — if the partner
      // walks out of the geofence (e.g. went next door first), don't keep
      // re-opening the prompt every time they re-enter. The dialog itself
      // can be dismissed and re-triggered manually.
    }

    if (navigator.geolocation.watchPosition) {
      watchId = navigator.geolocation.watchPosition(
        check, () => { /* ignore */ },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      )
    }
    // Fallback poll — same cadence as the live-location-stream hook so
    // they share GPS fixes via the browser's cache.
    intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(check, () => {}, {
        enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000,
      })
    }, 15_000)

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [enabled, targetLat, targetLng, radiusM])

  return inside
}
