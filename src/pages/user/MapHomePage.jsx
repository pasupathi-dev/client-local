// Customer map home — Swiggy-style in-app map:
//  - Full-bleed Leaflet map with a clean CartoDB "Voyager" basemap
//  - Professional SVG pin markers with a circular badge, drop shadow, and
//    colored ring per category
//  - 5 km radius circle + pulsing "you are here" marker
//  - Top overlay:   location badge (above) + pill search bar
//  - Search dropdown is server-driven (API hit on every keystroke, no local
//    filtering) showing top 5 matches + "Browse all services →"
//  - Bottom overlay: horizontal category chip strip + "All Services" dark button

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import * as api from '@/services/api'
import {
  loadCategories, loadPartners,
  selectCategories, selectPartners, selectCategoryCounts,
} from '@/features/catalog/catalogSlice'
import {
  loadFavourites, selectFavouriteList,
} from '@/features/favourites/favouritesSlice'
import { CATEGORIES as FALLBACK_CATS } from '@/constants/catalog'
import { searchCommonQueries } from '@/constants/searchAliases'
import useLocation from '@/hooks/useLocation'
import LocationPromptModal, { readLocationRationaleResponse } from '@/components/LocationPromptModal'
import Loader from '@/components/Loader'

// ── Constants (match local.html) ──────────────────────────────────────
const MAP_CENTER = [9.9252, 78.1198]
const MAP_ZOOM   = 14
const RADIUS_M   = 5000

// Per-category pin color (from local.html:9064 createPinIcon)
const PIN_COLOR = {
  'Carpenter':    '#92400e',
  'Electrician':  '#065f46',
  'Plumber':      '#5b21b6',
  'Mechanic':     '#1e40af',
  'Painter':      '#b45309',
  'AC Repair':    '#0e7490',
  'Cleaning':     '#be185d',
  'Gardening':    '#15803d',
  'TV Repair':    '#7c3aed',
  'Tiling':       '#374151',
  'Welding':      '#1f2937',
  'Pest Control': '#7c2d12',
  'Laundry':      '#0369a1',
  'Cooking':      '#c2410c',
  'Driver':       '#334155',
  'Security':     '#111827',
}

// Avatar class palette for preview popup
const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const avClass = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const deriveInitials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'P'

// ── Custom Leaflet icons ──────────────────────────────────────────────
// Swiggy-style professional pin. The marker is an SVG "teardrop" with:
//  - A category-tinted circular head (white badge holding the emoji).
//  - A subtle colored outer ring for at-a-glance category coding.
//  - A dark drop pointer with a soft shadow that follows the ring color.
//  - A small white dot at the tip to bite into lighter map tiles.
// Rendered as a divIcon so we can keep the CSS shadow and hover scale.
const pinIcon = (cat = 'Carpenter', emoji = '🔧') => {
  const bg = PIN_COLOR[cat] || '#0a0f1e'
  const html = `
    <div class="sl-pro-pin" style="--pin-c:${bg}">
      <svg width="42" height="54" viewBox="0 0 42 54" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 6px 12px rgba(0,0,0,0.28))">
        <path d="M21 53 C 21 53, 4 32, 4 20 a17 17 0 1 1 34 0 c 0 12 -17 33 -17 33 z"
              fill="${bg}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="21" cy="19" r="11" fill="#ffffff"/>
      </svg>
      <span class="sl-pro-pin__emoji">${emoji}</span>
    </div>`
  return L.divIcon({
    className: 'sl-pro-pin-wrap',
    html,
    iconSize:    [42, 54],
    iconAnchor:  [21, 52],
    popupAnchor: [0, -48],
  })
}

const youIcon = L.divIcon({
  className: 'sl-you',
  html: `
    <div style="position:relative;width:48px;height:48px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,0.15);
                   animation:mapPulse 2s ease infinite;"></div>
      <div style="position:absolute;left:50%;top:50%;width:20px;height:20px;
                   transform:translate(-50%,-50%);border-radius:50%;
                   background:#2563eb;border:3px solid #fff;
                   box-shadow:0 2px 8px rgba(37,99,235,0.5);"></div>
    </div>`,
  iconSize:   [48, 48],
  iconAnchor: [24, 24],
})

// Pan/zoom to the user's current position whenever it changes.
// Leaflet's MapContainer only uses `center` on mount, so we need an
// imperative `setView` to follow a live GPS fix.
function RecenterOnCoords ({ lat, lng, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (lat == null || lng == null) return
    map.flyTo([lat, lng], zoom, { duration: 0.6 })
  }, [lat, lng, zoom, map])
  return null
}

// Fit the viewport around both the user and any nearby partners so the
// user pin is always visible even when partners cluster off to one side.
function FitBounds ({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length < 2) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
    map.fitBounds(bounds.pad(0.25), { animate: true })
  }, [points, map])
  return null
}

// ── API-driven search suggestions dropdown ────────────────────────────
// Debounces keystrokes to ~200ms, hits /api/categories/search, and renders
// the top 5 results server-side. The "Browse all services →" footer is
// always shown so the user can bail out to the full grid.
const SEARCH_DEBOUNCE_MS = 200

function Suggestions ({ query, onPick, onBrowseAll }) {
  const [hits, setHits] = useState([])
  const [loading, setLoading] = useState(false)
  const q = query.trim()
  const reqSeq = useRef(0)
  const timer  = useRef(null)

  useEffect(() => {
    if (!q) { setHits([]); setLoading(false); return }
    clearTimeout(timer.current)
    const id = ++reqSeq.current
    setLoading(true)
    // Merge curated "common query" + skill aliases with the server's category
    // hits. Aliases resolve instantly (in-memory) so the dropdown feels
    // responsive even before the API call completes.
    const aliasHits = searchCommonQueries(q, 5)
    setHits(aliasHits)
    timer.current = setTimeout(() => {
      api.searchCategories(q, 5)
        .then((r) => {
          if (id !== reqSeq.current) return
          const serverHits = r.hits || []
          // De-duplicate by category — alias hits already cover the category,
          // so the server hit is redundant. We keep the alias one because
          // it carries the skill / phrasing the user typed.
          const seen = new Set(aliasHits.map((h) => h.category))
          const merged = [
            ...aliasHits,
            ...serverHits.filter((h) => !seen.has(h.category)),
          ].slice(0, 7)
          setHits(merged)
        })
        .catch(() => { /* keep alias-only hits on failure */ })
        .finally(() => { if (id === reqSeq.current) setLoading(false) })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer.current)
  }, [q])

  if (!q) return null

  return (
    <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-card border border-border
                    rounded-[var(--r)] shadow-cardLg overflow-hidden z-[200] animate-pgIn">
      {loading && hits.length === 0 && (
        <div className="px-4 py-4 flex items-center gap-2 text-[12px] text-muted">
          <Loader size={14} />
          <span>Searching…</span>
        </div>
      )}

      {!loading && hits.length === 0 && (
        <div className="px-4 py-4 text-[12px] text-muted">
          No matches for <span className="text-text font-semibold">“{q}”</span>.
        </div>
      )}

      {hits.map((h, i) => {
        const primary = h.type === 'common'
          ? (h.label || h.skill || h.category)
          : (h.type === 'skill' ? h.skill : h.category)
        const secondary = h.type === 'common'
          ? `${h.category}${h.skill ? ` · ${h.skill}` : ''}`
          : (h.type === 'skill' ? h.category : 'Category')
        return (
          <button
            key={`${h.type}-${i}-${h.skill || h.category}`}
            type="button"
            onClick={() => onPick(h)}
            className="w-full flex items-center gap-3 px-4 py-[11px] cursor-pointer transition-colors
                       border-b border-border last:border-b-0
                       text-left hover:bg-surface dark:hover:bg-[#1e2538]">
            <div className="w-8 h-8 rounded-lg bg-surface dark:bg-[#1e2538]
                            flex items-center justify-center text-[18px] shrink-0">
              {h.icon || (h.type === 'common' ? '🔎' : '🔧')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-text truncate">{primary}</div>
              <div className="text-[11px] text-muted truncate">
                {secondary}
                {h.online_count > 0 && <> · <span className="text-success">{h.online_count} online</span></>}
              </div>
            </div>
          </button>
        )
      })}

      <button
        type="button"
        onClick={onBrowseAll}
        className="w-full flex items-center gap-2.5 px-4 py-[11px] cursor-pointer
                   border-t border-border
                   bg-gradient-to-r from-[#fff5f2] to-white hover:from-[#fff5f2]
                   dark:from-[#241a18] dark:to-[#161c2e] dark:hover:bg-[#241a18]">
        <span className="text-[18px]">🔍</span>
        <span className="text-[13px] font-bold text-accent">Browse all services →</span>
      </button>
    </div>
  )
}

// ── Partner preview popup ─────────────────────────────────────────────
function PartnerPreview ({ partner, onClose, onView }) {
  if (!partner) return null
  const av = avClass(partner.user_id || partner.full_name)
  const initials = deriveInitials(partner.full_name || '')
  return (
    <div className="absolute bottom-[130px] left-1/2 -translate-x-1/2 z-[60]
                    bg-card rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.18)]
                    border border-border px-[18px] py-4
                    w-[min(340px,calc(100%-32px))]">
      <div className="flex gap-3 items-start">
        <div className={`w-[46px] h-[46px] rounded-full font-bold text-sm shrink-0
                         flex items-center justify-center ${av}`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-text truncate">{partner.full_name}</div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted mt-0.5">
            <span>{partner.primary_category}</span>
            <span>·</span>
            <span className="text-yellow-500">★ {Number(partner.rating_avg || 0).toFixed(1)}</span>
            {partner.distance_km != null && <>
              <span>·</span>
              <span>{Number(partner.distance_km).toFixed(1)} km</span>
            </>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-extrabold text-[17px] text-text">
            ₹{partner.base_price || '—'}
          </div>
          <div className="inline-flex px-2 py-[3px] mt-[3px] rounded-xl text-[10px] font-bold
                          bg-[#dcfce7] text-[#166534] dark:bg-[#064e3b] dark:text-[#86efac]">
            Online
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onClose}
          className="flex-1 px-3 py-[9px] rounded-lg border-[1.5px] border-border bg-card
                     text-[12px] font-semibold text-text hover:border-muted transition">
          Close
        </button>
        <button onClick={onView}
          className="flex-[2] px-3 py-[9px] rounded-lg bg-accent text-white
                     text-[12px] font-bold hover:brightness-90 transition">
          View Profile →
        </button>
      </div>
    </div>
  )
}

// ── Map Legend (hidden below 481px) ───────────────────────────────────
function MapLegend ({ partners }) {
  // Group counts per category
  const groups = useMemo(() => {
    const m = new Map()
    partners.forEach((p) => {
      const k = p.primary_category || 'Other'
      m.set(k, (m.get(k) || 0) + 1)
    })
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [partners])

  return (
    <div className="hidden min-[481px]:block absolute left-[14px] bottom-[90px] z-[50]
                    bg-card/95 backdrop-blur-sm rounded-xl px-[14px] py-2.5
                    shadow-card border border-border max-w-[160px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-text mb-1.5">
        Within 5 km
      </div>
      <div className="flex flex-col gap-1">
        {groups.map(([cat, count]) => (
          <div key={cat} className="flex items-center gap-1.5 text-[11px] text-muted font-medium">
            <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: PIN_COLOR[cat] || '#0a0f1e' }} />
            <span className="truncate">{cat}</span>
            <span className="ml-auto text-[10px] font-bold text-text">{count}</span>
          </div>
        ))}
        {!groups.length && (
          <div className="text-[11px] text-muted">No partners nearby</div>
        )}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-border text-[10px] font-bold text-success">
        {partners.length} partners online
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function MapHomePage () {
  const dispatch   = useDispatch()
  const navigate   = useNavigate()
  const categories = useSelector(selectCategories)
  const counts     = useSelector(selectCategoryCounts)
  const partners   = useSelector(selectPartners)
  const favourites = useSelector(selectFavouriteList)
  const loc        = useLocation()
  const [recent, setRecent] = useState([])  // M21 — last 5 booked partners

  const catalog = categories.length ? categories : FALLBACK_CATS

  const [search,    setSearch]    = useState('')
  const [focused,   setFocused]   = useState(false)
  const [activeCat, setActiveCat] = useState(null)
  const [preview,   setPreview]   = useState(null)
  const [locModalOpen, setLocModalOpen] = useState(false)
  const [manualMode,   setManualMode]   = useState(
    () => readLocationRationaleResponse() === 'manual',
  )
  const suggestionsRef = useRef(null)

  // Soft gate: ask once per visit, and skip entirely if the user already
  // chose "manual address" within the rationale TTL (7 days). Re-prompting
  // people who explicitly said no is what drives ban rates up.
  useEffect(() => {
    if (loc.isKnown || loc.status !== 'idle') return
    const prior = readLocationRationaleResponse()
    if (prior === 'manual' || prior === 'denied') return
    setLocModalOpen(true)
  }, [loc.isKnown, loc.status])

  // Effective center — user's location if known, otherwise Madurai default.
  const center = loc.coords ? [loc.coords.lat, loc.coords.lng] : MAP_CENTER
  // Address resolution is paused — show city if we have it, else formatted coords, else default.
  const cityLabel = loc.city
    || (loc.coords ? `${loc.coords.lat.toFixed(4)}, ${loc.coords.lng.toFixed(4)}` : 'Madurai, Tamil Nadu')

  useEffect(() => { if (!categories.length) dispatch(loadCategories()) }, [categories.length, dispatch])
  // Real-time online counts come in via the global `useRealtime` hook — it
  // wires `categories:counts` → `applyCategoryCounts` so every chip badge
  // here updates within ~1s of a partner toggling online/offline.

  // M21 — load saved partners + recent bookings for the Recent/Saved rail.
  useEffect(() => {
    dispatch(loadFavourites({ lat: center[0], lng: center[1] }))
    api.fetchMyJobs('user', { limit: 10, offset: 0, status: 'all' })
      .then((r) => {
        const seen = new Set()
        const top = []
        for (const j of (r.jobs || [])) {
          if (!j.partner_id || seen.has(j.partner_id)) continue
          seen.add(j.partner_id)
          top.push({
            user_id:        j.partner_id,
            full_name:      j.partner_name,
            avatar_class:   j.partner_av_class,
            primary_category: j.category_name,
            base_price:     j.agreed_price || j.base_price,
            last_job_id:    j.id,
          })
          if (top.length >= 5) break
        }
        setRecent(top)
      })
      .catch(() => setRecent([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])

  useEffect(() => {
    dispatch(loadPartners({
      category: activeCat || undefined,
      lat: center[0], lng: center[1],
      radiusKm: 5, onlineOnly: true,
      // Map view shows every pin at once — pagination doesn't apply here.
      limit: 100,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat, center[0], center[1]])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!suggestionsRef.current) return
      if (!suggestionsRef.current.contains(e.target)) setFocused(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const mapPartners = partners.filter((p) => p.lat && p.lng)
  // Include the user point so FitBounds keeps "you are here" in view.
  const fitPoints = loc.coords
    ? [{ lat: loc.coords.lat, lng: loc.coords.lng }, ...mapPartners]
    : mapPartners

  const onSuggestPick = (hit) => {
    setFocused(false)
    setSearch('')
    // Common-query / skill hits carry a sub-skill we forward so the list
    // page can pre-filter or render a hint chip. Plain category hits just
    // open the filtered list.
    const params = new URLSearchParams({ category: hit.category })
    if (hit.skill) params.set('skill', hit.skill)
    navigate(`/partners?${params.toString()}`)
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {/* Map layer */}
      <MapContainer
        center={center} zoom={MAP_ZOOM}
        zoomControl
        attributionControl={false}
        className="absolute inset-0 z-[1]"
        style={{ background: '#f2efe9' }}>
        {/* CartoDB "Voyager" — cleaner, brighter base layer that reads closer
            to food-delivery apps' in-app maps than raw OSM tiles. */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a','b','c','d']}
          maxZoom={19}
          attribution="&copy; OpenStreetMap &copy; CartoDB" />
        <Circle center={center} radius={RADIUS_M}
          pathOptions={{ color: '#2563eb', weight: 2, opacity: 0.25,
                         fillColor: '#2563eb', fillOpacity: 0.04, interactive: false }} />
        <Marker position={center} icon={youIcon} zIndexOffset={1000} />
        {mapPartners.map((p) => {
          const cat = p.primary_category || 'Carpenter'
          const emoji = catalog.find((c) => c.name === cat)?.icon || '🔧'
          return (
            <Marker
              key={p.user_id}
              position={[p.lat, p.lng]}
              icon={pinIcon(cat, emoji)}
              zIndexOffset={500}
              eventHandlers={{ click: () => setPreview(p) }}
            />
          )
        })}
        <RecenterOnCoords lat={loc.coords?.lat} lng={loc.coords?.lng} zoom={MAP_ZOOM} />
        {fitPoints.length >= 2 && <FitBounds points={fitPoints} />}
      </MapContainer>

      {/* ── TOP OVERLAY: location badge + search ── */}
      <div
        ref={suggestionsRef}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[50]
                   flex flex-col items-center gap-2
                   w-[min(580px,calc(100%-32px))]
                   md:w-[min(560px,calc(100%-48px))]
                   lg:w-[min(700px,calc(100%-64px))]">
        {/* Location badge — click to re-open the location prompt */}
        <button
          onClick={() => setLocModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-[5px] rounded-full
                     bg-card/95 dark:bg-card/95 border border-border/0
                     shadow-card text-[11px] font-semibold text-text
                     hover:brightness-95 transition cursor-pointer">
          📍 {cityLabel}
          {loc.status === 'fetching' && <span className="ml-1 text-muted text-[10px]">…locating</span>}
        </button>

        {/* Search pill */}
        <div className="relative w-full">
          <div
            className={`flex items-center gap-2 bg-card rounded-[28px] md:rounded-[32px]
                        px-[14px] py-[9px] md:px-[18px] md:py-[11px] lg:px-5 lg:py-3
                        shadow-cardLg border-[1.5px] transition-colors
                        ${focused ? 'border-accent' : 'border-border'}`}>
            <span className="text-[15px] text-muted shrink-0">🔍</span>
            <input
              type="text"
              value={search}
              placeholder="What do you need?"
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setFocused(true)}
              className="flex-1 bg-transparent outline-none text-sm md:text-[15px]
                         text-text placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]
                         min-w-0"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="text-[18px] text-muted hover:text-accent transition px-0.5 leading-none">
                ×
              </button>
            )}
          </div>

          {focused && <Suggestions
            query={search}
            onPick={onSuggestPick}
            onBrowseAll={() => { setFocused(false); navigate('/categories') }}
          />}
        </div>
      </div>

      {/* ── Recent + Saved rail (M21) — only renders when there's something
           to show. Sits above the category strip so it's visible without
           scrolling but doesn't dominate the map. ── */}
      {(recent.length > 0 || favourites.length > 0) && (
        <div className="absolute bottom-[68px] left-0 right-0 z-[49]
                        px-4 md:px-7 lg:px-8 pointer-events-none">
          <div className="bg-card/95 backdrop-blur-sm rounded-2xl shadow-card border border-border
                          px-3 py-2 pointer-events-auto max-w-[640px] mx-auto">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-text">
                Recent + Saved
              </div>
              <button onClick={() => navigate('/my-jobs')}
                className="text-[10px] font-bold text-accent hover:underline">
                See all
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {[...recent, ...favourites.filter((f) => !recent.some((r) => r.user_id === f.user_id))]
                .slice(0, 8)
                .map((p) => {
                const av = p.avatar_class || avClass(p.user_id || p.full_name)
                const init = deriveInitials(p.full_name || '')
                const isSaved = favourites.some((f) => f.user_id === p.user_id)
                return (
                  <button key={p.user_id}
                    onClick={() => navigate(`/partners/${p.user_id}`)}
                    title={`${p.full_name}${isSaved ? ' (saved)' : ' (recent)'}`}
                    className="shrink-0 flex items-center gap-2 px-2 py-1.5
                               rounded-xl bg-surface border border-border
                               hover:border-accent transition">
                    <div className={`w-8 h-8 rounded-full font-bold text-[11px]
                                     flex items-center justify-center ${av}`}>
                      {init}
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-[12px] font-bold text-text truncate max-w-[90px]">
                        {(p.full_name || 'Partner').split(' ')[0]}
                      </div>
                      <div className="text-[10px] text-muted truncate max-w-[90px]">
                        {isSaved ? '★ Saved' : `${p.primary_category || ''}`}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM OVERLAY: category strip ── */}
      <div className="absolute bottom-0 left-0 right-0 z-[50]
                      pt-3 pb-3.5 px-4 md:px-7 lg:px-8
                      bg-gradient-to-t from-card/95 via-card/80 to-transparent">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveCat(null)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-[14px] py-[9px] md:px-4 md:py-2.5
                        rounded-full text-xs md:text-[13px] font-semibold whitespace-nowrap
                        border-[1.5px] transition-all
                        shadow-[0_1px_4px_rgba(0,0,0,0.06)]
                        ${!activeCat
                          ? 'bg-accent border-accent text-white shadow-[0_4px_12px_rgba(232,65,26,0.3)]'
                          : 'bg-card border-border text-muted dark:text-text hover:bg-accent hover:border-accent hover:text-white'}`}>
            ✨ All
          </button>
          {catalog.slice(0, 7).map((c) => {
            const on    = activeCat === c.name
            // Real-time count: prefer the socket-fed `counts` map, fall back
            // to whatever `loadCategories` baked into the category row.
            const count = Number(counts?.[c.name] ?? c.online_count ?? 0)
            const empty = count === 0
            const onClick = () => {
              if (empty) {
                // Schedule fallback — nobody's online for this category, so
                // jump the customer into the partners list pre-flagged for
                // scheduling. PartnersListPage relaxes the `online only`
                // filter when it sees `schedule=1`.
                navigate(`/partners?category=${encodeURIComponent(c.name)}&schedule=1`)
              } else {
                setActiveCat(on ? null : c.name)
              }
            }
            return (
              <button key={c.name}
                onClick={onClick}
                title={empty ? 'No one online — schedule instead' : `${count} online`}
                className={`relative shrink-0 inline-flex items-center gap-1.5 px-[14px] py-[9px] md:px-4 md:py-2.5
                            rounded-full text-xs md:text-[13px] font-semibold whitespace-nowrap
                            border-[1.5px] transition-all
                            shadow-[0_1px_4px_rgba(0,0,0,0.06)]
                            ${on
                              ? 'bg-accent border-accent text-white shadow-[0_4px_12px_rgba(232,65,26,0.3)]'
                              : empty
                                ? 'bg-card border-border text-muted hover:border-accent hover:text-accent'
                                : 'bg-card border-border text-muted dark:text-text hover:bg-accent hover:border-accent hover:text-white'}`}>
                <span className="text-[15px]">{c.icon}</span>
                {c.display_name || c.name}
                {empty
                  ? <span className="ml-1 inline-flex items-center px-1.5 py-[1px] rounded-full
                                    bg-surface text-[9px] font-bold text-muted">
                      📅 Schedule
                    </span>
                  : <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full
                                    bg-[#dcfce7] text-[#166534] dark:bg-[#064e3b] dark:text-[#86efac]
                                    text-[9px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      {count} online
                    </span>}
              </button>
            )
          })}
          <button
            onClick={() => navigate('/categories')}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-[9px] md:py-2.5
                       rounded-full bg-brand text-white text-xs md:text-[13px] font-bold whitespace-nowrap
                       shadow-[0_4px_12px_rgba(10,15,30,0.3)]">
            All Services →
          </button>
        </div>
      </div>

      {/* ── Legend (481+ only) ── */}
      <MapLegend partners={mapPartners} />

      {/* ── Partner preview popup ── */}
      {preview && (
        <PartnerPreview
          partner={preview}
          onClose={() => setPreview(null)}
          onView={() => { setPreview(null); navigate(`/partners/${preview.user_id}`) }}
        />
      )}

      {/* ── Location prompt (rationale sheet — H16) ── */}
      <LocationPromptModal
        open={locModalOpen}
        onClose={() => setLocModalOpen(false)}
        onGranted={() => { setManualMode(false); setLocModalOpen(false) }}
        onManual={() => setManualMode(true)}
      />
      {/* When the user picked "manual address", surface a small banner so
          they have an obvious way back to the OS prompt. We don't auto-show
          the modal again — that's the point of the rationale TTL. */}
      {manualMode && !loc.isKnown && (
        <div className="absolute top-[110px] left-1/2 -translate-x-1/2 z-[55]
                        bg-card border border-border rounded-full px-3 py-1.5
                        shadow-card flex items-center gap-2 text-[11px]">
          <span className="text-muted">Browsing Madurai by default.</span>
          <button onClick={() => setLocModalOpen(true)}
            className="font-bold text-accent hover:underline">Use my location</button>
        </div>
      )}
    </div>
  )
}
