// Single source of truth for browser geolocation + reverse-geocoding.
//
// Usage:
//   const loc = useLocation()
//   loc.request()           → triggers navigator.geolocation.getCurrentPosition
//   loc.startWatch()        → watchPosition (calls clearWatch on unmount/stop)
//   loc.stopWatch()
//   loc.coords / loc.address / loc.city / loc.status / loc.error
//
// On hook init, if we have cached coords but no address, auto-reverse-geocode
// in the background so the UI can show the city name, never raw lat/lng.

import { useCallback, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import * as locActions from '@/features/location/locationSlice'
import * as api from '@/services/api'

// Reverse geocoding is now always on. The server falls back from Google
// (Geocoding API) to Photon (free, OSM) so the call works even without a
// Google key — see server/src/services/geocodeService.js. The UI relies
// on the resolved city + address to render the location chip details.
const REVERSE_GEOCODE_ENABLED = true

const isInsecureLocalhost = () => {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return false
  return location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
}

export default function useLocation () {
  const dispatch = useDispatch()
  const state    = useSelector(locActions.selectLocation)
  const watchIdRef = useRef(null)

  // Stop watch on unmount
  useEffect(() => () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const reverseGeocodeAndStore = useCallback(async (lat, lng) => {
    if (!REVERSE_GEOCODE_ENABLED) return  // feature paused
    try {
      const r = await api.reverseGeocode(lat, lng)
      if (r?.address || r?.city) {
        dispatch(locActions.setAddress({ address: r.address, city: r.city }))
      } else {
        dispatch(locActions.geocodeFailed())
      }
    } catch (err) {
      dispatch(locActions.geocodeFailed())
    }
  }, [dispatch])

  // Fire-and-forget persist to user_locations — used so the server can do
  // distance queries (nearby partners) from the user's real position.
  const persistLocation = useCallback((payload) => {
    api.saveLocation(payload).catch(() => {})
  }, [])

  // ── BACKFILL: only if the feature is on ──
  const lat = state.coords?.lat
  const lng = state.coords?.lng
  const hasCity = !!state.city
  const failed  = !!state.geocodeFailed
  useEffect(() => {
    if (!REVERSE_GEOCODE_ENABLED) return   // feature paused
    if (lat == null || lng == null) return
    if (hasCity)                    return
    if (failed)                     return
    let cancelled = false
    ;(async () => {
      await reverseGeocodeAndStore(lat, lng)
      if (cancelled) return
    })()
    return () => { cancelled = true }
  }, [lat, lng, hasCity, failed, reverseGeocodeAndStore])

  // Manual retry — clears the failed flag and re-fires the geocode
  const retryGeocode = useCallback(() => {
    if (lat == null || lng == null) return
    dispatch(locActions.clearGeocodeFailed())
    reverseGeocodeAndStore(lat, lng)
  }, [lat, lng, dispatch, reverseGeocodeAndStore])

  // Short-circuit: if we already have coords this session, return them
  // without re-prompting the OS. Pass `{ force: true }` to bypass the cache
  // (e.g. user explicitly tapped "Refresh location").
  const request = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      const cached = state.coords
      if (cached && state.status === 'granted' && !opts.force) {
        return resolve({ ok: true, lat: cached.lat, lng: cached.lng, accuracy: state.accuracy, cached: true })
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        dispatch(locActions.unavailable())
        return resolve({ ok: false, reason: 'unavailable' })
      }
      if (isInsecureLocalhost()) {
        dispatch(locActions.unavailable())
        return resolve({ ok: false, reason: 'insecure' })
      }
      dispatch(locActions.requesting())
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords
          dispatch(locActions.setCoords({ lat, lng, accuracy, source: 'gps' }))
          persistLocation({ lat, lng, accuracy, source: 'gps' })
          reverseGeocodeAndStore(lat, lng)
          resolve({ ok: true, lat, lng, accuracy })
        },
        (err) => {
          if (err.code === 1) dispatch(locActions.denied())
          else                dispatch(locActions.errored(err.message || 'Geolocation failed'))
          resolve({ ok: false, code: err.code, reason: err.code === 1 ? 'denied' : 'error' })
        },
        {
          enableHighAccuracy: opts.highAccuracy ?? true,
          timeout: opts.timeoutMs ?? 8000,
          maximumAge: opts.maxAgeMs ?? 60_000,
        },
      )
    })
  }, [dispatch, reverseGeocodeAndStore, persistLocation, state.coords, state.status, state.accuracy])

  const startWatch = useCallback(() => {
    if (watchIdRef.current != null) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        dispatch(locActions.setCoords({ lat, lng, accuracy, source: 'gps' }))
        persistLocation({ lat, lng, accuracy, source: 'gps' })
      },
      (err) => {
        if (err.code === 1) dispatch(locActions.denied())
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    )
  }, [dispatch, persistLocation])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const clear = useCallback(() => dispatch(locActions.clear()), [dispatch])

  const isKnown = !!(state.coords || state.address)
  // Coords are session-scoped — no in-session expiry. Kept exported so the
  // existing call-sites that read `loc.isStale` keep compiling.
  const isStale = false

  return {
    ...state,
    isKnown,
    isStale,
    request,
    startWatch,
    stopWatch,
    clear,
    retryGeocode,
  }
}
