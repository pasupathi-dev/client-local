// Public live-tracking page — opened from the SMS link a customer sent to
// a friend. No auth required: the bearer token in the URL is the auth.
//
// Polls /api/safety/track/:token every 15s while the trip is in progress.
// When the job ends (paid/cancelled) the server stops returning location
// data and we show a "trip ended" stub.

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import * as api from '@/services/api'
import { selectLiveEtaSpeedKmph } from '@/features/config/configSlice'
import Loader from '@/components/Loader'

const TILE_URL  = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
const TILE_ATTR = '© OSM · CartoDB'
const KMPH_AVG_FALLBACK = 22
const POLL_MS   = 15_000

const partnerIcon = L.divIcon({
  className: 'sl-pub-partner',
  html: `<div style="
    width: 38px; height: 38px; border-radius: 50% 50% 50% 4px;
    background: #D85A30; border: 3px solid #fff;
    box-shadow: 0 6px 16px rgba(0,0,0,0.28);
    display: grid; place-items: center;
    font-size: 18px; line-height: 1;">🛵</div>`,
  iconSize:   [38, 38],
  iconAnchor: [19, 38],
})
const customerIcon = L.divIcon({
  className: 'sl-pub-cust',
  html: `<div style="
    width: 32px; height: 32px; border-radius: 50%;
    background: #2563eb; border: 3px solid #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    display: grid; place-items: center;
    font-size: 11px; color: #fff; font-weight: 800;">DEST</div>`,
  iconSize:   [32, 32],
  iconAnchor: [16, 16],
})

function FitToBounds ({ a, b, deps }) {
  const map = useMap()
  useEffect(() => {
    if (!a || !b) return
    map.fitBounds(L.latLngBounds([a, b]), { padding: [50, 50], maxZoom: 16, animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return null
}

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

export default function PublicTrackPage () {
  const { token } = useParams()
  const KMPH_AVG  = useSelector(selectLiveEtaSpeedKmph) || KMPH_AVG_FALLBACK
  const [data, setData]     = useState(null)
  const [error, setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    let timer

    const tick = async () => {
      try {
        const r = await api.publicTrack(token)
        if (!cancelled) {
          setData(r)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || 'Could not load trip')
      } finally {
        if (!cancelled) setLoading(false)
      }
      // Stop polling once the trip ends.
      if (cancelled) return
      const ended = !!data?.ended
      timer = setTimeout(tick, ended ? 60_000 : POLL_MS)
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const partner = useMemo(
    () => (data?.partner_lat != null && data?.partner_lng != null)
      ? [Number(data.partner_lat), Number(data.partner_lng)] : null,
    [data?.partner_lat, data?.partner_lng],
  )
  const customer = useMemo(
    () => (data?.customer_lat != null && data?.customer_lng != null)
      ? [Number(data.customer_lat), Number(data.customer_lng)] : null,
    [data?.customer_lat, data?.customer_lng],
  )

  const distanceKm = useMemo(() => haversineKm(partner, customer), [partner, customer])
  const etaMin = (distanceKm != null && !data?.ended)
    ? Math.max(1, Math.round((distanceKm / KMPH_AVG) * 60)) : null

  if (loading) return <Loader fullScreen label="Loading trip…" />
  if (error)   return <CenterMsg title="Link not valid" body={error} />
  if (data?.ended) {
    return <CenterMsg
      title="Trip ended"
      body={`${data.partner_name || 'The pro'} has finished ${data.service || 'the service'}.`}
    />
  }

  const center = partner || customer
  if (!center) {
    return <CenterMsg title="Waiting for location" body="The pro hasn't started moving yet." />
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-surface">
      <header className="bg-card border-b border-border px-4 py-3">
        <p className="text-[11px] tracking-[0.5px] uppercase font-extrabold text-accent m-0">
          Live trip · ServiceLink
        </p>
        <p className="text-[15px] font-bold text-text m-0 mt-1">
          {data.partner_name || 'Service pro'} → {data.customer_name || 'Customer'}
        </p>
        <p className="text-[12px] text-muted m-0 mt-0.5">
          {data.service ? `For ${data.service}` : 'In progress'}
          {etaMin != null && ` · ETA ~${etaMin} min`}
        </p>
      </header>

      <div className="flex-1 relative">
        <MapContainer center={center} zoom={15} scrollWheelZoom
                      style={{ height: '100%', width: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
          {partner && customer && (
            <Polyline positions={[partner, customer]}
                      pathOptions={{ color: '#D85A30', weight: 4, opacity: 0.7, dashArray: '8, 8' }} />
          )}
          {partner  && <Marker position={partner}  icon={partnerIcon} />}
          {customer && <Marker position={customer} icon={customerIcon} />}
          <FitToBounds a={partner} b={customer}
                       deps={[partner?.[0], partner?.[1], customer?.[0], customer?.[1]]} />
        </MapContainer>
        {data.partner_loc_at && (
          <div className="absolute bottom-3 left-3 bg-black/65 text-white
                          text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm">
            updated {new Date(data.partner_loc_at).toLocaleTimeString('en-IN',
              { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {distanceKm != null && (
          <div className="absolute bottom-3 right-3 bg-card/95 text-text
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

function CenterMsg ({ title, body }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-surface p-6">
      <div className="max-w-[360px] text-center bg-card border border-border
                      rounded-[14px] shadow-card p-6">
        <p className="font-display text-[18px] font-extrabold text-text m-0">{title}</p>
        <p className="text-[13px] text-muted m-0 mt-2 leading-[1.55]">{body}</p>
      </div>
    </div>
  )
}
