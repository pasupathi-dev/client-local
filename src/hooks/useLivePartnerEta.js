// H40 — Customer-side hook: subscribes to the partner's live-location
// stream while the job is in motion and exposes a refreshed ETA derived
// from the most recent ping.
//
// Returns:
//   { partnerCoords, etaText, distanceM }
//
//   partnerCoords  — { lat, lng } from the latest socket ping, or null.
//   etaText        — "~12 min away" / "Inside the area" / null.
//   distanceM      — straight-line distance in metres, for callers that
//                    want their own threshold logic.
//
// We pin the ETA computation on a 30s wall-clock tick so the text refreshes
// even when the partner's GPS hasn't sent a new ping (the server throttles
// pings to 1/15s). The text always uses the latest known position.

import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { getSocket } from '@/services/socket'
import { selectLiveEtaSpeedKmph, selectEtaInsideAreaM } from '@/features/config/configSlice'

// Average urban two-wheeler speed + "inside the area" threshold. Both come
// from app_config (live_eta_speed_kmph / eta_inside_area_m). LivePartnerMap
// reads the same Redux selectors so the numbers match across the page.
const KMPH_AVG_FALLBACK = 22
const INSIDE_AREA_M_FALLBACK = 200

function haversineMeters (a, b, c, d) {
  if ([a, b, c, d].some((v) => v == null)) return null
  const toRad = (x) => x * Math.PI / 180
  const R = 6371000
  const dLat = toRad(c - a)
  const dLng = toRad(d - b)
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(a)) * Math.cos(toRad(c))
          * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

export default function useLivePartnerEta ({ job }) {
  const inMotion = job?.state === 'travelling' || job?.state === 'arrived'
  const KMPH_AVG     = useSelector(selectLiveEtaSpeedKmph) || KMPH_AVG_FALLBACK
  const INSIDE_AREA_M = useSelector(selectEtaInsideAreaM)  || INSIDE_AREA_M_FALLBACK

  const [partnerCoords, setPartnerCoords] = useState(null)
  const [tick, setTick] = useState(0)

  // Subscribe to the job's live-location room and update partnerCoords on
  // every ping. The room join is party-checked on the server.
  useEffect(() => {
    if (!inMotion || !job?.id) {
      setPartnerCoords(null)
      return undefined
    }
    let sock
    let onLocation
    let cancelled = false
    getSocket().then((s) => {
      if (cancelled) return
      sock = s
      sock.emit('join-job-location', job.id, () => {})
      onLocation = (payload) => {
        if (!payload || payload.jobId !== job.id) return
        const lat = Number(payload.lat); const lng = Number(payload.lng)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setPartnerCoords({ lat, lng })
        }
      }
      sock.on('job:location', onLocation)
    }).catch(() => { /* socket not ready — degrade silently */ })

    return () => {
      cancelled = true
      if (sock) {
        sock.emit('leave-job-location', job.id)
        if (onLocation) sock.off('job:location', onLocation)
      }
    }
  }, [inMotion, job?.id])

  // 30s tick → forces re-render so etaText refreshes even when there's no
  // new ping. Without this the customer would see a frozen ETA between
  // pings (server throttles to 1/15s; refreshing every 30s is enough).
  useEffect(() => {
    if (!inMotion) return undefined
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [inMotion])

  const result = useMemo(() => {
    if (!inMotion) return { partnerCoords: null, etaText: null, distanceM: null }
    const target = (partnerCoords?.lat != null) ? partnerCoords : null
    if (!target || job?.customer_lat == null || job?.customer_lng == null) {
      // No live ping yet — fall back to the partner's stored ETA (M35)
      // if there is one, otherwise show nothing.
      const fallback = Number(job?.eta_min)
      return {
        partnerCoords: null,
        etaText: Number.isFinite(fallback) && fallback > 0 ? `~${fallback} min away` : null,
        distanceM: null,
      }
    }
    const m = haversineMeters(target.lat, target.lng, Number(job.customer_lat), Number(job.customer_lng))
    if (m == null) return { partnerCoords: target, etaText: null, distanceM: null }
    if (m <= INSIDE_AREA_M) {
      return { partnerCoords: target, etaText: 'Inside the area', distanceM: m }
    }
    const km = m / 1000
    const minutes = Math.max(1, Math.round((km / KMPH_AVG) * 60))
    const capped = minutes >= 120 ? '2 hr+ away' : `~${minutes} min away`
    return { partnerCoords: target, etaText: capped, distanceM: m }
    // tick is a deliberate dep so the 30s heartbeat refreshes the text
    // even when partnerCoords hasn't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerCoords, job?.customer_lat, job?.customer_lng, job?.eta_min, inMotion, tick])

  return result
}
