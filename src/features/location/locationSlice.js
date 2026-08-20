// Global location state — shared by every screen that needs a position.
//
// status:
//   'idle'        — never asked
//   'fetching'    — getCurrentPosition in flight
//   'granted'     — coords + (eventually) address available
//   'denied'      — user said No to permission (or browser blocks it)
//   'unavailable' — no Geolocation API at all (insecure context, old browser)
//   'error'       — getCurrentPosition errored for another reason (timeout, etc.)
// Manual entry is intentionally NOT supported — partners must grant device location.
//
// Caching: coords are kept in sessionStorage so the GPS prompt fires AT MOST
// once per browser session (per tab). Closing the tab / browser clears the
// cache so the next session re-asks. No TTL inside the session — once we have
// a fix, we trust it for the whole session unless the caller explicitly forces
// a refresh via request({ force: true }).

import { createSlice } from '@reduxjs/toolkit'

const KEY = 'sl_location_v1'

const storage = (() => {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch { return null }
})()

const loadCache = () => {
  if (!storage) return null
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt) return null
    return parsed
  } catch { return null }
}

const initial = (() => {
  const cached = loadCache()
  return cached
    ? {
        status: 'granted',
        coords: cached.coords,
        address: cached.address,
        city: cached.city,
        accuracy: cached.accuracy,
        savedAt: cached.savedAt,
        error: null,
        source: cached.source || 'gps',
        geocodeFailed: false,
      }
    : {
        status: 'idle',
        coords: null,
        address: null,
        city: null,
        accuracy: null,
        savedAt: null,
        error: null,
        source: null,
        geocodeFailed: false,
      }
})()

const persist = (state) => {
  if (!storage) return
  try {
    if (state.status === 'granted') {
      storage.setItem(KEY, JSON.stringify({
        coords: state.coords, address: state.address, city: state.city,
        accuracy: state.accuracy, savedAt: state.savedAt, source: state.source,
      }))
    }
  } catch {}
}

const slice = createSlice({
  name: 'location',
  initialState: initial,
  reducers: {
    requesting: (s) => { s.status = 'fetching'; s.error = null },
    setCoords: (s, { payload }) => {
      s.status   = 'granted'
      s.coords   = { lat: payload.lat, lng: payload.lng }
      s.accuracy = payload.accuracy ?? null
      s.savedAt  = Date.now()
      s.source   = payload.source || 'gps'
      s.error    = null
      // Fresh coords → reset geocode state so the auto-fetch re-fires.
      s.address  = null
      s.city     = null
      s.geocodeFailed = false
      persist(s)
    },
    setAddress: (s, { payload }) => {
      if (payload.address) s.address = payload.address
      if (payload.city)    s.city    = payload.city
      s.geocodeFailed = false
      persist(s)
    },
    geocodeFailed:      (s) => { s.geocodeFailed = true },
    clearGeocodeFailed: (s) => { s.geocodeFailed = false },
    denied:      (s) => { s.status = 'denied';      s.error = 'Permission denied' },
    unavailable: (s) => { s.status = 'unavailable'; s.error = 'Geolocation not supported' },
    errored:     (s, { payload }) => { s.status = 'error'; s.error = payload || 'Unknown error' },
    clear:       () => {
      try { storage && storage.removeItem(KEY) } catch {}
      return {
        status: 'idle', coords: null, address: null, city: null,
        accuracy: null, savedAt: null, source: null, error: null,
        geocodeFailed: false,
      }
    },
  },
})

export const {
  requesting, setCoords, setAddress,
  geocodeFailed, clearGeocodeFailed,
  denied, unavailable, errored, clear,
} = slice.actions

export const selectLocation = (s) => s.location
export const selectCoords   = (s) => s.location.coords
export const selectAddress  = (s) => s.location.address
export const selectCity     = (s) => s.location.city
export const selectStatus   = (s) => s.location.status
export const selectIsKnown  = (s) => !!(s.location.coords || s.location.address)
// Coords are session-scoped — never go "stale" within a session unless the
// caller explicitly clear()s them. Kept exported for back-compat; always false.
export const selectIsStale  = () => false
export default slice.reducer
