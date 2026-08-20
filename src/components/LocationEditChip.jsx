// Manual location override.
//
// Two pieces:
//   1. <LocationEditChip />     — the small "📍 City · ✏️ Edit" pill the
//                                  user sees on home / partner dashboard.
//                                  Opens the picker.
//   2. <LocationPickerModal />  — search-as-you-type place picker backed
//                                  by /api/location/search (Nominatim).
//                                  On confirm it dispatches the existing
//                                  `setCoords` action so the rest of the
//                                  app — partner search, distance calcs,
//                                  request payloads — reacts as if the
//                                  user moved on the map.
//
// We deliberately don't touch the existing GPS auto-pick flow: this layer
// just dispatches the same Redux action with `source: 'manual'`. The
// locationSlice already persists to sessionStorage on every setCoords,
// so the picked location survives navigation until the tab is closed.

import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import * as api from '@/services/api'
import * as locActions from '@/features/location/locationSlice'
import useLocation from '@/hooks/useLocation'
import { pushToast, selectMode } from '@/features/app/appSlice'
import { selectProfile } from '@/features/profile/profileSlice'
import Loader from '@/components/Loader'

const DEBOUNCE_MS = 280
const PAGE_SIZE   = 5

// Normalise what the user typed before sending to the API: collapse runs
// of whitespace (a stray double-space costs a lot on strict matchers),
// strip control characters, and trim surrounding noise. We deliberately
// don't title-case here — the server tries both raw and capitalised
// variants in parallel, so the user's casing is preserved for engines
// that prefer it.
const normaliseQuery = (s) => String(s || '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\x00-\x1f\x7f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// Pick a contextual icon for a result so the dropdown feels closer to
// Google Maps' typed-list. Falls back to a pin for unknown types.
function iconForType (type = '') {
  const t = String(type || '').toLowerCase()
  if (/(train|railway|station|tram)/.test(t))                    return '🚉'
  if (/(bus|coach)/.test(t))                                     return '🚌'
  if (/(airport|aerodrome)/.test(t))                             return '✈️'
  if (/(school|college|university|kindergarten)/.test(t))        return '🏫'
  if (/(hospital|clinic|pharmacy|doctors|dentist)/.test(t))      return '🏥'
  if (/(restaurant|cafe|food_court|fast_food|bar|pub)/.test(t))  return '🍽️'
  if (/(hotel|motel|hostel|guest_house|lodging)/.test(t))        return '🏨'
  if (/(temple|hindu|mosque|church|cathedral|place_of_worship|religious)/.test(t)) return '🛕'
  if (/(bank|atm|finance)/.test(t))                              return '🏦'
  if (/(fuel|gas_station|petrol)/.test(t))                       return '⛽'
  if (/(park|garden|playground|nature|forest)/.test(t))          return '🌳'
  if (/(shop|store|mall|supermarket|market)/.test(t))            return '🛍️'
  if (/(office|company|building|commercial|industrial)/.test(t)) return '🏢'
  if (/(city|town|village|locality|suburb|district|administrative)/.test(t)) return '🏙️'
  if (/(road|highway|street)/.test(t))                           return '🛣️'
  return '📍'
}

// Split a string into segments highlighting every case-insensitive match
// of `q`. Returns an array of { text, match } chunks the renderer can
// style. Mirrors Google's "type-ahead bold" treatment.
function highlightMatches (text, q) {
  const s = String(text || '')
  const needle = String(q || '').trim()
  if (!s) return []
  if (!needle) return [{ text: s, match: false }]
  const tokens = needle.split(/\s+/).filter((t) => t.length >= 2)
  if (!tokens.length) return [{ text: s, match: false }]
  // Escape regex specials in the user's tokens so a stray `(` doesn't
  // blow up the matcher.
  const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(${tokens.map(escape).join('|')})`, 'gi')
  const parts = s.split(pattern)
  return parts.filter(Boolean).map((p) => ({
    text:  p,
    match: pattern.test(p) && (pattern.lastIndex = 0, true),
  }))
}

// Render the highlighted chunks. Matched runs render bold + dark; the
// rest stays in the parent's muted colour.
function HighlightedText ({ text, q, className = '' }) {
  const chunks = highlightMatches(text, q)
  return (
    <span className={className}>
      {chunks.map((c, i) => c.match
        ? <span key={i} className="font-extrabold text-text">{c.text}</span>
        : <span key={i}>{c.text}</span>)}
    </span>
  )
}

// ── The picker modal ────────────────────────────────────────────────────
export function LocationPickerModal ({ open, onClose }) {
  const dispatch = useDispatch()
  const loc      = useLocation()
  // We sync to two server tables on confirm; only fire the partner-side
  // write when the current user actually is a partner — the endpoint is
  // role-gated and would otherwise 403.
  const mode    = useSelector(selectMode)
  const profile = useSelector(selectProfile)
  const isPartner = mode === 'partner' || profile?.role === 'partner'
  const [q, setQ]           = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [picked,  setPicked]  = useState(null)
  // How many of the fetched results we're currently rendering. Bumped by
  // the IntersectionObserver below in PAGE_SIZE chunks so the dropdown
  // grows like the notifications list.
  const [visible, setVisible] = useState(PAGE_SIZE)
  // Separate flag for the device-GPS button so its spinner doesn't fight
  // the Save spinner (`saving`) and so we can show an inline loading
  // banner inside the modal instead of letting the LocationGate take
  // over the whole screen.
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsErr,  setGpsErr]  = useState(null)
  const inputRef    = useRef(null)
  const seqRef      = useRef(0)
  const sentinelRef = useRef(null)
  const listRef     = useRef(null)

  // Focus the input on open + clear stale state from the last session.
  useEffect(() => {
    if (!open) return
    setQ(''); setResults([]); setPicked(null); setVisible(PAGE_SIZE)
    setGpsBusy(false); setGpsErr(null)
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  // Debounced search. We normalise the query before firing so a stray
  // double-space or control char doesn't poison the upstream matcher.
  // The server tries multiple variants of the cleaned string in parallel
  // and returns up to 30 candidates — we paginate locally below.
  useEffect(() => {
    if (!open) return
    const cleaned = normaliseQuery(q)
    if (cleaned.length < 2) { setResults([]); setVisible(PAGE_SIZE); return }
    const mySeq = ++seqRef.current
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.searchPlaces(cleaned)
        if (seqRef.current !== mySeq) return
        setResults(r?.results || [])
        setVisible(PAGE_SIZE)
        // Reset the scroll position so a long previous result list doesn't
        // leave the new one scrolled past the first hit.
        if (listRef.current) listRef.current.scrollTop = 0
      } catch {
        if (seqRef.current === mySeq) setResults([])
      } finally {
        if (seqRef.current === mySeq) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q, open])

  // IntersectionObserver — reveal another PAGE_SIZE rows when the
  // sentinel at the bottom of the visible list scrolls into view.
  // Works inside the scrollable results panel: we pass the panel as
  // `root` so the observer triggers on inner-scroll, not page-scroll.
  useEffect(() => {
    if (!open) return
    const el = sentinelRef.current
    const root = listRef.current
    if (!el || !root) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible((v) => Math.min(results.length, v + PAGE_SIZE))
      }
    }, { root, rootMargin: '40px' })
    io.observe(el)
    return () => io.disconnect()
  }, [open, results.length, visible])

  // Esc closes; Enter confirms when a row is picked.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose?.()
      if (e.key === 'Enter'  && picked && !saving) confirm()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, picked, saving])

  if (!open) return null

  const confirm = async () => {
    if (!picked || saving) return
    setSaving(true)
    try {
      // 1) Update Redux + sessionStorage via the existing setCoords reducer.
      dispatch(locActions.setCoords({
        lat: picked.lat, lng: picked.lng, source: 'manual',
      }))
      dispatch(locActions.setAddress({
        address: picked.display_name, city: picked.city,
      }))
      // 2) Persist to the server. There are TWO tables that store
      //    location and they're consumed by different code paths:
      //
      //      user_locations.lat/lng   — read by customer-side analytics
      //                                 + admin map. Always update.
      //      partners.lat/lng         — what the customer's partner-search
      //                                 + distance Haversine actually reads.
      //                                 ONLY update when the current user
      //                                 is a partner; otherwise the server
      //                                 returns 403 (user role required).
      //
      // Without the partner-side write, a partner who moves via the picker
      // would update only user_locations and still show up at their OLD
      // coords to every customer browsing the list.
      api.saveLocation({
        lat: picked.lat, lng: picked.lng,
        city: picked.city, source: 'manual',
      }).catch(() => {})

      if (isPartner) {
        try {
          // Pass the picked place's address + city so the server doesn't
          // have to reverse-geocode the new lat/lng. Without this, a
          // reverse-geocode failure would leave `partners.location_city`
          // showing the OLD city to every customer browsing the list,
          // even though lat/lng updated — exactly the bug we just hit.
          await api.setPartnerLocation(picked.lat, picked.lng, {
            address: picked.display_name,
            city:    picked.city,
          })
          // eslint-disable-next-line no-console
          console.info('[location-picker] partner discovery location synced',
            { city: picked.city, lat: picked.lat, lng: picked.lng })
        } catch (err) {
          // Surface this so the partner KNOWS customers will still see the
          // old location until they retry. Was a silent warn before — that
          // hid the bug where the picker updated Redux but not the
          // discovery table customers actually query.
          const msg = err?.response?.data?.message
            || err?.message
            || 'Could not sync your new location to the customer-facing map.'
          dispatch(pushToast({
            text: msg + ' Try again or toggle online to retry.',
            type: 'error',
          }))
        }
      }

      dispatch(pushToast({ text: `Location changed to ${picked.city || 'picked place'}` }))
      onClose?.()
    } finally { setSaving(false) }
  }

  // Quietly refresh from device GPS. The LocationGate is now gated on
  // `isKnown` only, so this refresh doesn't trigger a competing full-screen
  // modal — we own the loading UI right here inside the picker.
  const useDeviceGPS = async () => {
    if (gpsBusy || saving) return
    setGpsBusy(true)
    setGpsErr(null)
    try {
      const r = await loc.request({ force: true })
      if (r?.ok) {
        dispatch(pushToast({ text: 'Location updated from your device' }))
        onClose?.()
        return
      }
      // Handle the common denial / unavailable / generic-error outcomes
      // inline so the user knows what to do next.
      const reason = r?.reason || r?.code || 'error'
      const msg = reason === 'denied'
        ? "We couldn't access your device location. Please allow location access in your browser settings and try again."
        : reason === 'insecure'
          ? 'Location needs a secure (HTTPS) connection. Use the search above instead.'
          : reason === 'unavailable'
            ? "Your browser doesn't support location. Use the search above instead."
            : "Couldn't read your device location. Check that GPS is on, then try again."
      setGpsErr(msg)
    } catch (err) {
      setGpsErr(err?.message || "Couldn't read your device location.")
    } finally {
      setGpsBusy(false)
    }
  }

  const busy = saving || gpsBusy

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
      className="fixed inset-0 z-[10003] bg-black/55 backdrop-blur-sm
                 flex items-center justify-center p-4 animate-fadeIn">
      <div className="w-full max-w-[500px] bg-card border border-border rounded-[18px]
                      shadow-[0_24px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="h-[3px] bg-gradient-to-r from-accent via-[#f97316] to-accent w-full" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-center gap-3 border-b border-border/60">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center
                          bg-accent/10 text-accent text-[18px] shrink-0"
               aria-hidden>📍</div>
          <h2 className="flex-1 min-w-0 font-display text-[16px] font-extrabold text-text m-0 tracking-tight">
            Set your location
          </h2>
          <button onClick={() => !busy && onClose?.()}
            aria-label="Close"
            disabled={busy}
            className="w-8 h-8 rounded-full bg-surface border border-border
                       text-muted text-[12px] hover:text-text transition shrink-0
                       disabled:opacity-50">✕</button>
        </div>

        {/* GPS busy banner — sits between header and search so the user
            knows the device is being read; doesn't block the modal. */}
        {gpsBusy && (
          <div className="mx-6 mt-4 px-3.5 py-2.5 rounded-[10px]
                          bg-accent/10 border border-accent/30
                          flex items-center gap-2.5 text-[12.5px]">
            <Loader size={14} />
            <span className="font-bold text-accent">Detecting your location…</span>
            <span className="text-muted">Allow the browser prompt if it appears.</span>
          </div>
        )}

        {/* GPS error banner — inline, dismissible, no full-screen takeover. */}
        {gpsErr && !gpsBusy && (
          <div className="mx-6 mt-4 px-3.5 py-2.5 rounded-[10px]
                          bg-rose-50 border border-rose-200
                          flex items-start gap-2.5 text-[12px] leading-[1.55]">
            <span aria-hidden className="text-rose-600 text-[14px] mt-0.5">⚠</span>
            <span className="flex-1 text-rose-800">{gpsErr}</span>
            <button onClick={() => setGpsErr(null)}
              aria-label="Dismiss"
              className="text-rose-600 text-[11px] font-bold hover:text-rose-800">✕</button>
          </div>
        )}

        <div className="px-6 pt-4">
          <div className="relative">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPicked(null) }}
              placeholder="Try 'Anna Nagar', 'Madurai Junction', or a pincode"
              disabled={busy}
              className="w-full bg-surface border border-border rounded-[12px]
                         pl-10 pr-3 py-3 text-[13.5px] text-text placeholder:text-muted
                         focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15
                         disabled:opacity-60" />
            <span aria-hidden
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">🔍</span>
          </div>

          {/* Results list — scrollable; the sentinel at the bottom is
              what the IntersectionObserver watches to paginate. */}
          <div ref={listRef} className="mt-3 max-h-[340px] overflow-y-auto">
            {loading && q.trim().length >= 2 && (
              <div className="py-4 text-center text-[12px] text-muted inline-flex items-center justify-center gap-2 w-full">
                <Loader size={14}/> <span>Finding places…</span>
              </div>
            )}
            {!loading && q.trim().length >= 2 && results.length === 0 && (
              <div className="py-4 px-3 text-center text-[12px] text-muted leading-[1.55]">
                No matches for &ldquo;<span className="font-bold">{q}</span>&rdquo;.
                Try a shorter query or just the city name — e.g.
                <span className="font-bold"> &ldquo;Nagercoil&rdquo;</span>.
              </div>
            )}
            {results.slice(0, visible).map((r) => {
              const isPicked = picked?.place_id === r.place_id
              // Headline = first segment of display_name (place name),
              // then the city/state tail in the subtitle. This mirrors
              // Google Maps' search dropdown.
              const segments  = String(r.display_name || '').split(',').map((s) => s.trim()).filter(Boolean)
              const headline  = segments[0] || r.city || r.display_name
              const subtitle  = segments.slice(1).join(', ') || (r.city && r.city !== headline ? r.city : '')
              const icon      = iconForType(r.type)
              return (
                <button key={r.place_id}
                  type="button"
                  disabled={busy}
                  onClick={() => setPicked(r)}
                  className={`w-full text-left px-3 py-2.5 rounded-[10px] mb-1 flex items-start gap-3
                              transition border disabled:opacity-60
                              ${isPicked
                                ? 'bg-accent/10 border-accent'
                                : 'bg-card border-transparent hover:bg-surface hover:border-border'}`}>
                  <span aria-hidden
                    className={`mt-0.5 text-[18px] leading-none shrink-0
                                ${isPicked ? 'opacity-100' : 'opacity-90'}`}>
                    {icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <HighlightedText
                      text={headline} q={q}
                      className="block text-[13px] text-muted truncate" />
                    {subtitle && (
                      <HighlightedText
                        text={subtitle} q={q}
                        className="block text-[11px] text-muted leading-[1.45] truncate mt-0.5" />
                    )}
                  </span>
                  {isPicked && <span className="text-accent text-[12px] font-bold mt-0.5">✓</span>}
                </button>
              )
            })}

            {/* Sentinel + "scroll for more" / "no more" footer */}
            {results.length > 0 && visible < results.length && (
              <div ref={sentinelRef} className="py-2 text-center text-[10.5px] text-muted">
                Scroll for more results…
              </div>
            )}
            {results.length > 0 && visible >= results.length && results.length > PAGE_SIZE && (
              <div className="py-2 text-center text-[10.5px] text-light">
                That's all {results.length} matches
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex flex-wrap items-center gap-2 border-t border-border bg-surface/50 mt-3">
          <button onClick={useDeviceGPS} disabled={busy}
            className="text-[12px] font-bold px-3.5 py-2 rounded-[10px]
                       border border-border bg-card text-text
                       hover:border-accent hover:text-accent transition disabled:opacity-60
                       inline-flex items-center gap-2">
            {gpsBusy
              ? <><Loader size={12} /> <span>Detecting…</span></>
              : <><span aria-hidden>🧭</span> <span>Detect my location</span></>}
          </button>
          <div className="flex-1" />
          <button onClick={() => !busy && onClose?.()} disabled={busy}
            className="text-[12px] font-bold px-3.5 py-2 rounded-[10px]
                       bg-card text-muted hover:text-text transition
                       disabled:opacity-60">
            Cancel
          </button>
          <button onClick={confirm} disabled={!picked || busy}
            className="text-[12.5px] font-bold px-5 py-2 rounded-[10px]
                       bg-accent text-white hover:brightness-95 transition
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-[0_4px_14px_rgba(232,65,26,0.32)]
                       inline-flex items-center gap-2">
            {saving
              ? <><Loader size={12} /> <span>Saving…</span></>
              : <span>Set location</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── The chip ───────────────────────────────────────────────────────────
// A 2-line info card the user / partner sees on their home screen. The
// chip reads from Redux (already hydrated from sessionStorage on app
// boot) and shows:
//
//   📍  Madurai                              [ GPS ]
//       Anna Nagar West, Madurai, TN, 625020          ✏️
//
// Tap anywhere on the chip → opens the picker.
//
// We deliberately collapse the address to the first 3 segments so the
// chip stays compact even when Google / Photon returns a very long string.

function shortAddress (address, city) {
  if (!address) return null
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean)
  // Drop the city segment when it's already the headline so we don't
  // repeat ourselves ("Madurai · Madurai, TN, India" → "TN, India").
  const filtered = city
    ? parts.filter((p) => p.toLowerCase() !== city.toLowerCase())
    : parts
  return filtered.slice(0, 3).join(', ')
}

export default function LocationEditChip ({ className = '' }) {
  const city    = useSelector((s) => s.location.city)
  const address = useSelector((s) => s.location.address)
  const coords  = useSelector((s) => s.location.coords)
  const source  = useSelector((s) => s.location.source)
  const status  = useSelector((s) => s.location.status)
  const [open, setOpen] = useState(false)

  // Headline — first thing the user reads:
  //   - city (from reverse-geocode or manual pick) — preferred
  //   - "Locating…" while the GPS fix is in flight and we have nothing yet
  //   - "Current location" once we have coords but the geocode is still pending
  //   - "Set location" if we have nothing at all (gate should catch this)
  const headline = city
    ? city
    : status === 'fetching'
      ? 'Locating…'
      : coords
        ? 'Current location'
        : 'Set location'

  const sub = shortAddress(address, city)

  return (
    <>
      <button type="button"
        onClick={() => setOpen(true)}
        aria-label="Change location"
        className={`group inline-flex items-center gap-2.5 px-3.5 py-2.5
                    bg-surface border border-border rounded-[12px]
                    text-left hover:border-accent hover:bg-card transition
                    max-w-[420px]
                    ${className}`}>
        {/* Flat pin — no box, optically centered with the text. */}
        <span aria-hidden className="text-[16px] leading-none shrink-0">📍</span>

        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-text truncate">
              {headline}
            </span>
            {source === 'manual' && (
              <span className="text-[8.5px] uppercase tracking-[0.4px] font-extrabold
                               px-1.5 py-[1px] rounded-full bg-amber-100 text-amber-700 shrink-0">
                Manual
              </span>
            )}
            {source === 'gps' && city && (
              <span className="text-[8.5px] uppercase tracking-[0.4px] font-extrabold
                               px-1.5 py-[1px] rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                GPS
              </span>
            )}
          </span>
          {sub
            ? <span className="block text-[11px] text-muted truncate mt-0.5">{sub}</span>
            : coords && status !== 'fetching' && (
                <span className="block text-[10.5px] text-light truncate mt-0.5">
                  Tap to set a precise address
                </span>
              )
          }
        </span>

        {/* Flat edit affordance — tints on hover. */}
        <span aria-hidden
          className="shrink-0 text-muted text-[13px] leading-none transition
                     group-hover:text-accent">
          ✏️
        </span>
      </button>

      <LocationPickerModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
