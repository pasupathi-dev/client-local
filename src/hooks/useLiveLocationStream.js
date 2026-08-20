// Partner-side hook: while `enabled` is true, watch the GPS and POST the
// partner's lat/lng to /api/jobs/:id/location every ~15s. Auto-stops when
// `enabled` flips false (e.g. job state moves to `working`/`completed`/etc.)
// or when the component unmounts.
//
// Uses watchPosition (continuous) but throttles uploads to one per
// MIN_INTERVAL_MS so we don't hammer the server when the GPS fix updates
// every second. Falls back to a setInterval+getCurrentPosition pair when
// watchPosition isn't available.

import { useEffect, useRef } from 'react'
import * as api from '@/services/api'

const MIN_INTERVAL_MS = 15_000

export default function useLiveLocationStream ({ jobId, enabled }) {
  const lastSentAt = useRef(0)
  const inFlight   = useRef(false)
  const watchId    = useRef(null)
  const intervalId = useRef(null)

  useEffect(() => {
    if (!enabled || !jobId) return undefined
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined

    const send = async (coords) => {
      const now = Date.now()
      if (inFlight.current) return
      if (now - lastSentAt.current < MIN_INTERVAL_MS) return
      inFlight.current = true
      lastSentAt.current = now
      try {
        await api.streamJobLocation(jobId, {
          lat: coords.latitude,
          lng: coords.longitude,
          heading: Number.isFinite(coords.heading) ? coords.heading : null,
          speed:   Number.isFinite(coords.speed)   ? coords.speed   : null,
        })
      } catch {
        // Don't reset lastSentAt — we'd rather skip a tick than spam retries.
      } finally {
        inFlight.current = false
      }
    }

    const onPosition = (pos) => { if (pos?.coords) send(pos.coords) }
    const onError    = () => { /* swallow — geolocation sometimes throws */ }

    if (navigator.geolocation.watchPosition) {
      watchId.current = navigator.geolocation.watchPosition(
        onPosition,
        onError,
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      )
    }

    // Belt-and-braces interval — guarantees a ping even if watchPosition
    // doesn't fire (some browsers are stingy on backgrounded tabs).
    intervalId.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(onPosition, onError, {
        enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000,
      })
    }, MIN_INTERVAL_MS)

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      if (intervalId.current) {
        clearInterval(intervalId.current)
        intervalId.current = null
      }
    }
  }, [enabled, jobId])
}
