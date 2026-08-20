// LivePartnerMap — customer-side widget on the active-job screen showing
// the partner's marker moving toward the customer in real time.
//
// Subscribes to the dedicated `job:<id>:location` socket room (joined via
// the party-checked `join-job-location` event on the server), and seeds
// the marker from the job's stored coords on first render so we don't
// flash a blank map waiting for the first ping.
//
// Visual treatment is "active-job" sized — a tall (300px) prominent card
// with a big ETA pill, a polyline showing the route, and a soft pulse the
// moment the state flips to `arrived`.
//
// Marker movement is interpolated over ~1.5s instead of teleporting so the
// motion reads naturally; falls back to a hard set if no previous position.
//
// Props:
//   job — active job from Redux. Needs id, state, customer_lat/lng, and any
//         partner snapshot fields if present.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getSocket } from '@/services/socket'
import { selectLiveEtaSpeedKmph } from '@/features/config/configSlice'
import * as api from '@/services/api'

// Cleaner, dimmer base — keeps the markers + route line as the visual focus.
const TILE_URL  = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png'
const TILE_LABELS_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png'
const TILE_ATTR = '© OSM · CartoDB'

// Two-wheeler avg speed in Indian-city traffic. Used for ETA when we have
// distance but no real-time speed feed. Admin-tunable via app_config
// (live_eta_speed_kmph) — useSelector below pulls the live value.
const KMPH_AVG_FALLBACK = 22

// Partner pin — circular halo + pulse ring + scooter glyph. The halo is a
// separate ring beneath the badge so the pulse animation can scale outward
// without warping the icon. Heading rotates the inner glyph wedge.
const buildPartnerIcon = (heading = 0, arrived = false) => {
  const accent = arrived ? '#1d9e75' : '#E8411A'
  const accentSoft = arrived ? 'rgba(29,158,117,0.32)' : 'rgba(232,65,26,0.28)'
  // Heading from the geolocation API: degrees clockwise from north. CSS
  // rotate is also clockwise from "up", so we can apply directly. Default 0.
  const rot = Number.isFinite(Number(heading)) ? Number(heading) : 0
  return L.divIcon({
    className: 'sl-live-partner-pin',
    html: `
      <div style="position:relative; width:64px; height:64px;">
        <div style="
          position:absolute; inset:0; border-radius:50%;
          background:${accentSoft};
          animation: sl-pulse 2.2s ease-out infinite;
          will-change: transform, opacity;"></div>
        <div style="
          position:absolute; inset:8px; border-radius:50%;
          background:${accentSoft}; opacity:.6;
          animation: sl-pulse 2.2s ease-out infinite .9s;"></div>
        <div style="
          position:absolute; inset:18px; width:28px; height:28px;
          border-radius:50%; background:#fff;
          border:3px solid ${accent};
          box-shadow:0 6px 14px rgba(0,0,0,.22);
          display:grid; place-items:center;">
          <div style="
            transform: rotate(${rot}deg); transition: transform .8s ease-out;
            font-size:14px; line-height:1;">🛵</div>
        </div>
      </div>
      <style>
        @keyframes sl-pulse {
          0%   { transform: scale(0.55); opacity: .85; }
          70%  { transform: scale(1.15); opacity: 0;   }
          100% { transform: scale(1.15); opacity: 0;   }
        }
      </style>
    `,
    iconSize:   [64, 64],
    iconAnchor: [32, 32],
  })
}

// Customer pin — drop-style. Tall pin with a circular badge on top and a
// pointed tail anchored at the actual coordinate. Reads as a "destination"
// at any zoom, contrasts with the partner halo.
const customerIcon = L.divIcon({
  className: 'sl-live-customer-pin',
  html: `
    <div style="
      position:relative; width:36px; height:48px;
      filter: drop-shadow(0 6px 10px rgba(0,0,0,.30));">
      <svg viewBox="0 0 36 48" width="36" height="48"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M18 47 C18 47 33 28 33 16 A15 15 0 1 0 3 16 C3 28 18 47 18 47 Z"
              fill="#2563eb" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
      </svg>
      <div style="
        position:absolute; left:50%; top:13px; transform:translateX(-50%);
        width:18px; height:18px; border-radius:50%; background:#fff;
        display:grid; place-items:center;
        font-size:10px; color:#2563eb; font-weight:900;">📍</div>
    </div>`,
  iconSize:   [36, 48],
  iconAnchor: [18, 46],
})

// Re-measures the leaflet map whenever the parent's size changes. Critical
// for the fullscreen toggle — without invalidateSize() the tiles render
// for the old container dimensions and you get a half-painted map.
function MapInvalidator ({ trigger }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 220)
    return () => clearTimeout(t)
  }, [trigger, map])
  return null
}

// Auto-fits the map to include both pins on first render and whenever the
// partner's pin moves. When state flips to 'arrived', we tighten to a
// single-pin zoom on the customer.
function FitToBounds ({ partner, customer, arrived, deps }) {
  const map = useMap()
  useEffect(() => {
    if (!customer) return
    if (arrived) {
      map.flyTo(customer, 17, { duration: 0.6 })
      return
    }
    if (!partner) return
    const bounds = L.latLngBounds([partner, customer])
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return null
}

// Initial-bearing between two coords in degrees clockwise from north.
// Used as a fallback when the geolocation feed has no heading value, so
// the scooter glyph rotates to face the direction of travel.
const bearingDeg = (from, to) => {
  if (!from || !to) return 0
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const φ1 = toRad(from[0])
  const φ2 = toRad(to[0])
  const Δλ = toRad(to[1] - from[1])
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// Haversine distance (km).
const haversineKm = (a, b) => {
  if (!a || !b) return null
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const aa = Math.sin(dLat / 2) ** 2
           + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0]))
           * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(aa))
}

// Animate a marker position from `from` → `to` over `durationMs` using
// requestAnimationFrame. Returns a cancel function.
function tweenPosition (from, to, durationMs, onTick, onDone) {
  const start = performance.now()
  let raf
  const step = (now) => {
    const t = Math.min(1, (now - start) / durationMs)
    // Ease-out cubic — feels natural for vehicle motion.
    const eased = 1 - Math.pow(1 - t, 3)
    onTick([
      from[0] + (to[0] - from[0]) * eased,
      from[1] + (to[1] - from[1]) * eased,
    ])
    if (t < 1) raf = requestAnimationFrame(step)
    else onDone?.()
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

export default function LivePartnerMap ({ job }) {
  const isStreaming = job?.state === 'travelling' || job?.state === 'arrived'
  const arrived     = job?.state === 'arrived'
  const KMPH_AVG    = useSelector(selectLiveEtaSpeedKmph) || KMPH_AVG_FALLBACK

  const seedCustomer = (job?.customer_lat != null && job?.customer_lng != null)
    ? [Number(job.customer_lat), Number(job.customer_lng)]
    : null
  const seedPartner = (job?.partner_lat != null && job?.partner_lng != null)
    ? [Number(job.partner_lat), Number(job.partner_lng)]
    : null

  // partnerPos is the *currently rendered* position (interpolated). targetPos
  // is the latest server value we're animating toward.
  const [partnerPos, setPartnerPos] = useState(seedPartner)
  const targetPosRef = useRef(seedPartner)
  const tweenCancelRef = useRef(null)

  const [lastTs, setLastTs] = useState(null)
  const [lastSpeedKmph, setLastSpeedKmph] = useState(null)
  const [lastHeading, setLastHeading] = useState(0)

  // Fullscreen toggle — when true the map's wrapper jumps to a fixed
  // viewport-size overlay. Esc key + the toggle button both close it.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    // Lock body scroll while overlaying — leaves the chat / job page intact
    // when we exit, so we restore the original overflow value.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [fullscreen])

  // Pulse animation tick when state flips to 'arrived'.
  const [arrivedPulse, setArrivedPulse] = useState(false)
  useEffect(() => {
    if (!arrived) return
    setArrivedPulse(true)
    const t = setTimeout(() => setArrivedPulse(false), 2400)
    return () => clearTimeout(t)
  }, [arrived])

  // Cold-start seed: pull the partner's last-known coords on mount (and
  // whenever job id changes) so the marker renders before the first stream
  // tick. Without this the map sits with only the customer pin until the
  // next ~15s ping — which is exactly the bug after a re-login.
  useEffect(() => {
    if (!isStreaming || !job?.id) return
    let cancelled = false
    api.fetchJobLastLocation(job.id).then((r) => {
      if (cancelled) return
      const lat = Number(r?.lat)
      const lng = Number(r?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const next = [lat, lng]
      // Only seed if we don't already have one from the job snapshot — we
      // don't want to overwrite an in-flight tween with a stale value.
      if (!targetPosRef.current) {
        targetPosRef.current = next
        setPartnerPos(next)
        if (r?.ts) setLastTs(r.ts)
      }
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, job?.id])

  // Subscribe to the dedicated location room — server validates party
  // membership in the join handler. We re-join on every socket connect
  // (covers initial mount, logout/login, and socket reconnects) so the
  // customer always lands back in the room without waiting for the next
  // stream tick to discover they were dropped.
  useEffect(() => {
    if (!isStreaming || !job?.id) return undefined
    let sock
    let cancelled = false

    const onLoc = (payload = {}) => {
      if (payload.jobId !== job.id) return
      const lat = Number(payload.lat)
      const lng = Number(payload.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      const next = [lat, lng]
      const prev = targetPosRef.current
      targetPosRef.current = next
      setLastTs(payload.ts || new Date().toISOString())
      if (Number.isFinite(payload.speed)) {
        // Geolocation `speed` is m/s — convert to km/h for the ETA card.
        setLastSpeedKmph(payload.speed * 3.6)
      }
      if (Number.isFinite(payload.heading)) {
        setLastHeading(payload.heading)
      } else if (prev) {
        // No heading from the device — derive bearing from prev → next so
        // the scooter glyph still points the right way.
        setLastHeading(bearingDeg(prev, next))
      }

      if (!prev) {
        setPartnerPos(next)
        return
      }
      // Interpolate over 1.5s for smooth motion. Cancel any in-flight tween
      // so we always animate from the *currently rendered* position to the
      // newest target — never from a stale halfway point.
      if (tweenCancelRef.current) tweenCancelRef.current()
      const fromForTween = partnerPos || prev
      tweenCancelRef.current = tweenPosition(fromForTween, next, 1500, setPartnerPos)
    }

    const joinRoom = () => {
      if (!sock) return
      sock.emit('join-job-location', job.id, () => { /* ack ignored */ })
    }

    getSocket({ role: 'user' }).then((s) => {
      if (cancelled) return
      sock = s
      s.on('job:location', onLoc)
      // socket.io fires `connect` again after a reconnect — re-emit so the
      // server puts us back in the location room.
      s.on('connect', joinRoom)
      // Initial join — covers the case where socket was already connected
      // by the time we subscribed (so `connect` won't fire here).
      if (s.connected) joinRoom()
      else s.once('connect', joinRoom)
    }).catch(() => {})

    return () => {
      cancelled = true
      if (sock) {
        sock.off('job:location', onLoc)
        sock.off('connect', joinRoom)
        try { sock.emit('leave-job-location', job.id) } catch { /* ignore */ }
      }
      if (tweenCancelRef.current) {
        tweenCancelRef.current()
        tweenCancelRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, job?.id])

  const distanceKm = useMemo(
    () => haversineKm(partnerPos, seedCustomer),
    [partnerPos, seedCustomer],
  )
  const speedForEta = (lastSpeedKmph && lastSpeedKmph > 5) ? lastSpeedKmph : KMPH_AVG
  const etaMin = (distanceKm != null)
    ? Math.max(1, Math.round((distanceKm / speedForEta) * 60))
    : null

  if (!isStreaming || !seedCustomer) return null

  const center = partnerPos || seedCustomer
  const zoom   = arrived ? 17 : 15

  const headline = arrived
    ? `${job.partner_name || 'Your partner'} has arrived 🎉`
    : `${job.partner_name || 'Your partner'} is on the way`
  const subline = arrived
    ? 'Open the door — they’re right outside.'
    : (etaMin != null
        ? `${distanceKm.toFixed(1)} km away · live tracking`
        : 'Live tracking — updates every ~15s')

  // Fullscreen wrapper — fixed to the viewport with a high z-index. Inline
  // styles instead of utility classes so Tailwind purging never strips them.
  const wrapperClass = fullscreen
    ? 'fixed inset-0 z-[9999] bg-card flex flex-col'
    : `bg-card overflow-hidden h-full flex flex-col transition-shadow duration-500
       ${arrivedPulse ? 'ring-4 ring-success/40' : ''}`

  return (
    <div className={wrapperClass}>
      {/* Header — partner name + headline + ETA pill */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
        <div className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-text m-0 truncate">{headline}</p>
          <p className="text-[11px] text-muted m-0 mt-0.5 truncate">{subline}</p>
        </div>
        {etaMin != null && !arrived && (
          <div className="shrink-0 text-right bg-accent text-white
                          px-3 py-1.5 rounded-[10px]
                          shadow-[0_4px_12px_rgba(232,65,26,0.3)]">
            <div className="font-display font-extrabold text-[18px] leading-none">
              {etaMin}
            </div>
            <div className="text-[9px] uppercase tracking-[0.4px] font-bold opacity-90 mt-0.5">
              min
            </div>
          </div>
        )}
        {arrived && (
          <div className="shrink-0 bg-success text-white
                          px-3 py-2 rounded-[10px] text-[11px] font-extrabold
                          shadow-[0_4px_12px_rgba(29,158,117,0.35)]
                          uppercase tracking-[0.4px]">
            Here ✓
          </div>
        )}
      </div>

      {/* Map */}
      <div className={fullscreen
        ? 'flex-1 min-h-0 relative'
        : 'h-[280px] md:h-[340px] lg:h-[420px] relative'}>
        {/* Fullscreen toggle — square button, top-right above all map layers. */}
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          className="absolute top-2.5 right-2.5 z-[1001] w-9 h-9 rounded-md bg-card
                     border border-border shadow-card flex items-center justify-center
                     text-text hover:border-accent hover:text-accent transition">
          {fullscreen ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v4h4M2 10h4v4M14 6h-4V2M6 14v-4H2"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/>
            </svg>
          )}
        </button>

        <MapContainer center={center} zoom={zoom} scrollWheelZoom={true}
                      style={{ height: '100%', width: '100%' }}
                      zoomControl={false} attributionControl={false}>
          <ZoomControl position="topleft" />
          {/* Two-layer basemap — no-labels tiles painted first, then a
              dedicated labels overlay on top of the route line. Reads
              cleaner than a single labelled tileset because the polyline
              never collides with road names. */}
          <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
          {/* Layered route — wide soft white halo + bold accent line on top
              for a "Lyft / Uber" tracker look. Skipped after arrival. */}
          {partnerPos && seedCustomer && !arrived && (
            <>
              <Polyline
                positions={[partnerPos, seedCustomer]}
                pathOptions={{
                  color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round',
                }}
              />
              <Polyline
                positions={[partnerPos, seedCustomer]}
                pathOptions={{
                  color: '#E8411A', weight: 5, opacity: 1, lineCap: 'round',
                }}
              />
            </>
          )}
          <TileLayer url={TILE_LABELS_URL} attribution="" />
          {partnerPos && <Marker position={partnerPos} icon={buildPartnerIcon(lastHeading, arrived)} />}
          {seedCustomer && <Marker position={seedCustomer} icon={customerIcon} />}
          <FitToBounds
            partner={partnerPos}
            customer={seedCustomer}
            arrived={arrived}
            deps={[job.id, partnerPos?.[0], partnerPos?.[1], arrived]}
          />
          <MapInvalidator trigger={fullscreen} />
        </MapContainer>

        {/* Updated-at stamp bottom-left */}
        {lastTs && (
          <div className="absolute bottom-2 left-2 bg-black/65 text-white
                          text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm">
            updated {new Date(lastTs).toLocaleTimeString('en-IN',
              { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {/* Distance pill bottom-right (skipped on arrived) */}
        {!arrived && distanceKm != null && (
          <div className="absolute bottom-2 right-2 bg-card/95 text-text
                          text-[11px] font-extrabold px-2.5 py-1 rounded-md
                          border border-border shadow-card">
            {distanceKm < 0.5
              ? `${Math.round(distanceKm * 1000)} m away`
              : `${distanceKm.toFixed(1)} km away`}
          </div>
        )}
      </div>
    </div>
  )
}
