// Category partners list — pixel-matches local.html#page-category-partners.
//  - Header:   {icon} {Category} Near You / Sorted by {sort} / N available
//  - Sort:     Nearest · Top rated · Cheapest · Fastest   (persisted in localStorage)
//  - Filters:  4★+ · Verified only · Available now · Accepts emergency
//  - Radius:   📍 Within: [slider] N km
//  - Grid:     3-col desktop / 1-col mobile, dense cards
//  - Paged:    first 10 rows, "Load more" button fetches the next page
//
// Online-only is on by default; the `schedule=1` URL flag from the home page
// flips it off so the customer can still browse offline partners for a
// scheduled visit (the C15 "no one online — schedule instead" fallback).

import { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  loadPartners, loadMorePartners, clearPartners,
  selectPartners, selectPartnersTotal, selectPartnersOffset,
  selectPartnersLimit, selectPartnersLoading, selectPartnersLoadingMore,
  selectPartnersError,
} from '@/features/catalog/catalogSlice'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'
import { selectDynamicWorks } from '@/features/config/configSlice'
import useLocation from '@/hooks/useLocation'
import { formatDistance, formatPrice, formatEta } from '@/utils/format'
import Loader from '@/components/Loader'
import EmptyState from '@/components/EmptyState'
import ListError from '@/components/ListError'
import { CardSkeleton } from '@/components/Skeleton'
import FavouriteButton from '@/features/favourites/FavouriteButton'

// IMPORTANT: no static fallback. Distance must be computed from the
// user's ACTUAL location — either GPS or the manually-picked place.
// The LocationGate forces a fix before any protected route renders, so
// by the time we reach this page `loc.coords` should always be set.
// If for any reason it isn't, we send undefined lat/lng — the server
// gracefully skips the distance + radius filters on missing coords
// instead of pretending the user is in Madurai.
const PAGE_SIZE    = 10

// H18 sort chips. `Fastest` proxies on rating since the partner doesn't
// publish a response-time field today — closest stable signal we have.
const SORTS = [
  { id: 'distance', label: 'Nearest' },
  { id: 'rating',   label: 'Top rated' },
  { id: 'priceAsc', label: 'Cheapest' },
  { id: 'rating',   label: 'Fastest', alias: 'fastest' },
]

const SORT_SUB = {
  distance: 'Sorted by distance',
  rating:   'Sorted by rating',
  priceAsc: 'Sorted by price (low → high)',
  fastest:  'Sorted by response (top-rated first)',
}

// Persist last-used sort per-user. Hydrated on mount via the `sort` URL
// param if missing; written on every chip tap.
const SORT_KEY = 'sl:partnersList:sort'
const readStoredSort = () => {
  try { return localStorage.getItem(SORT_KEY) || null } catch { return null }
}
const writeStoredSort = (v) => {
  try { v ? localStorage.setItem(SORT_KEY, v) : localStorage.removeItem(SORT_KEY) }
  catch { /* localStorage disabled — non-fatal */ }
}

// Stable deterministic pick from the 5 avatar palettes in local.html.
const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initials = (name) =>
  (name ?? '').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'P'

// Star row: full ★ up to Math.round(rating), hollow ☆ for the rest, capped at 5.
function Stars ({ value = 0 }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(value))))
  return (
    <span className="text-yellow-500 tracking-[1px] text-[11px]" aria-label={`${n} out of 5 stars`}>
      {'★'.repeat(n)}<span className="text-[#e4e1db]">{'★'.repeat(5 - n)}</span>
    </span>
  )
}

export default function PartnersListPage () {
  const [qp]     = useSearchParams()
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const partners     = useSelector(selectPartners)
  const total        = useSelector(selectPartnersTotal)
  const offset       = useSelector(selectPartnersOffset)
  const limit        = useSelector(selectPartnersLimit)
  const loading      = useSelector(selectPartnersLoading)
  const loadingMore  = useSelector(selectPartnersLoadingMore)
  const loadError    = useSelector(selectPartnersError)
  const loc          = useLocation()
  const dynWorks     = useSelector(selectDynamicWorks)

  // Taxonomy v2 — browse is keyed by WORK. `category` accepted as legacy alias.
  const work     = qp.get('work') || qp.get('category') || null
  const skill    = qp.get('skill')    || null
  // C15 schedule fallback — the home page tags the URL when no partner is
  // online so we flip `onlineOnly` off and surface a scheduling hint.
  const scheduleMode = qp.get('schedule') === '1'
  // H18 — sort lookup with localStorage fallback. URL beats storage so a
  // user explicit click always wins; on first render we fall back to the
  // user's prior preference, then to 'distance'.
  const sortParam = qp.get('sort')
  const sort = sortParam || readStoredSort() || 'distance'
  const radius = Number(qp.get('radius')) || 100

  // H18 filter chips. URL is the source of truth so links + history work.
  const minRating     = Number(qp.get('minRating'))    || 0
  const verifiedOnly  = qp.get('verifiedOnly')  === '1'
  const availableNow  = qp.get('availableNow')  === '1'
  const emergencyOnly = qp.get('emergencyOnly') === '1'

  // Coords come ONLY from the user's actual location (GPS or manual
  // pick stored in the location slice). No static fallback — passing
  // undefined to the server is fine: it skips the Haversine column +
  // radius filter when coords are missing.
  const lat = loc.coords?.lat
  const lng = loc.coords?.lng

  const workMeta = useMemo(() => {
    const ws = (dynWorks && dynWorks.length) ? dynWorks : FALLBACK_WORKS
    return ws.find((w) => w.name === work) || null
  }, [work, dynWorks])

  const setParam = (key, value) => {
    const next = new URLSearchParams(qp)
    if (value == null || value === '' || value === false) next.delete(key)
    else                                                  next.set(key, String(value))
    navigate(`/partners?${next.toString()}`, { replace: true })
  }

  const setSort = (id, alias) => {
    const target = alias || id
    writeStoredSort(target)
    setParam('sort', target === 'distance' ? null : target)
  }

  // Schedule mode flips online-only off and relaxes the "currently online"
  // server filter; the partners come back with `is_online: false` and the
  // card just shows the "Schedule" CTA instead of "Online".
  const onlineOnly = scheduleMode ? false : (availableNow || !scheduleMode)

  // Build the params for the current filter set — used by both the initial
  // load and the H85 retry CTA, so they always match.
  const loadParams = () => ({
    work:       work || undefined,
    lat, lng,
    radiusKm:   radius,
    onlineOnly,
    sortBy:     sort === 'fastest' ? 'rating' : sort,
    limit:      PAGE_SIZE,
    offset:     0,
    minRating:  minRating || undefined,
    verifiedOnly:  verifiedOnly  || undefined,
    emergencyOnly: emergencyOnly || undefined,
  })

  // Load page 1 whenever filters/coords change.
  useEffect(() => {
    dispatch(clearPartners())
    dispatch(loadPartners(loadParams()))
  }, [dispatch, work, sort, radius, lat, lng, onlineOnly,
      minRating, verifiedOnly, emergencyOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasMore = partners.length < total

  const loadNext = () => {
    if (loadingMore || !hasMore) return
    dispatch(loadMorePartners({
      work:       work || undefined,
      lat, lng,
      radiusKm:   radius,
      onlineOnly,
      sortBy:     sort === 'fastest' ? 'rating' : sort,
      limit:      PAGE_SIZE,
      offset,
      minRating:  minRating || undefined,
      verifiedOnly:  verifiedOnly  || undefined,
      emergencyOnly: emergencyOnly || undefined,
    }))
  }

  const titleIcon = workMeta?.icon || '🔍'
  const displayWork = workMeta ? (workMeta.display_name || workMeta.name) : work
  const titleWord = displayWork
    ? (displayWork.endsWith('s') ? displayWork : `${displayWork}s`)
    : 'Partners'

  return (
    <div className="min-h-full bg-surface">
      {/* ── Header (back · title · count) ── */}
      <div className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="flex items-center gap-3 px-5 py-3 max-w-[1400px] mx-auto">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-surface border border-border
                       flex items-center justify-center hover:border-accent transition">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[18px] md:text-[20px] text-text truncate">
              <span className="mr-1.5">{titleIcon}</span>{titleWord} Near You
              {skill && <span className="ml-2 text-[12px] font-semibold text-accent">· {skill}</span>}
            </div>
            <div className="text-[11px] text-muted mt-0.5">{SORT_SUB[sort] || SORT_SUB.distance}</div>
          </div>
          <div className="text-xs text-muted font-semibold shrink-0">
            {loading ? '…' : `${total} available`}
          </div>
        </div>

        {/* Schedule-mode banner (C15 fallback) */}
        {scheduleMode && (
          <div className="px-5 pb-2 max-w-[1400px] mx-auto">
            <div className="text-[11px] text-text bg-[#fff5f2] dark:bg-[#241a18]
                            border border-[#fcd9cc] dark:border-[#3a1f17] rounded-full
                            px-3 py-1.5 inline-flex items-center gap-2">
              <span>📅</span>
              <span><b>No one online right now.</b> Pick a partner to schedule for later.</span>
            </div>
          </div>
        )}

        {/* ── Sort chips ── */}
        <div className="flex flex-wrap gap-1.5 px-5 pb-2 max-w-[1400px] mx-auto">
          {SORTS.map((s) => {
            const id = s.alias || s.id
            const on = sort === id
            return (
              <button key={s.label} onClick={() => setSort(s.id, s.alias)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap
                            border-[1.5px] transition-colors
                            ${on ? 'bg-accent border-accent text-white shadow-[0_2px_8px_rgba(232,65,26,0.25)]'
                                 : 'bg-card border-border text-muted hover:border-accent hover:text-accent'}`}>
                {s.label}
              </button>
            )
          })}
        </div>

        {/* ── Filter chips ── */}
        <div className="flex flex-wrap gap-1.5 px-5 pb-2 max-w-[1400px] mx-auto">
          <FilterChip on={minRating === 4}
            onClick={() => setParam('minRating', minRating === 4 ? null : 4)}>
            4★+
          </FilterChip>
          <FilterChip on={verifiedOnly}
            onClick={() => setParam('verifiedOnly', verifiedOnly ? null : 1)}>
            ✓ Verified only
          </FilterChip>
          <FilterChip on={availableNow}
            onClick={() => setParam('availableNow', availableNow ? null : 1)}>
            ● Available now
          </FilterChip>
          <FilterChip on={emergencyOnly}
            onClick={() => setParam('emergencyOnly', emergencyOnly ? null : 1)}>
            🚨 Accepts emergency
          </FilterChip>
        </div>

        {/* ── Radius slider ── */}
        <div className="flex items-center gap-3 px-5 pb-3 max-w-[1400px] mx-auto">
          <span className="text-[11px] font-bold text-accent whitespace-nowrap">📍 Within:</span>
          <input
            type="range" min="1" max="100" step="1" value={radius}
            onChange={(e) => setParam('radius', e.target.value)}
            className="flex-1 accent-accent h-1" />
          <span className="text-[12px] font-bold text-text tabular-nums min-w-[62px] text-right">
            {radius} km
          </span>
        </div>
      </div>

      {/* ── Card grid — M19 denser layout: ~5 cards above the fold on a 390px
           phone. Reduced padding, smaller avatar, secondary info merged into
           a single 11px row under the name. ── */}
      <div className="max-w-[1400px] mx-auto px-3 py-3
                      grid gap-2
                      grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {/* M86 — card skeletons mirror the actual card layout */}
        {loading && partners.length === 0 && (
          <div className="col-span-full"><CardSkeleton count={4} /></div>
        )}

        {/* H85 — initial load failed; retry runs the same loader with current filters */}
        {!loading && loadError && partners.length === 0 && (
          <div className="col-span-full">
            <ListError onRetry={() => dispatch(loadPartners(loadParams()))} />
          </div>
        )}

        {/* H84 — empty state with two clear next actions: widen the radius
            or clear filters. */}
        {!loading && !loadError && partners.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon="🔎"
              title="No partners match those filters"
              copy="Try widening the radius or clearing the filter chips above."
              ctaLabel="Browse all categories"
              onCta={() => nav('/categories')}
            />
          </div>
        )}

        {partners.map((p) => {
          const av  = p.avatar_class || hashToAv(p.user_id || p.full_name)
          const eta = formatEta(p.distance_km)
          // M19 — secondary line under the name: zone · completion-rate
          const sub = [
            p.location_city || p.zone,
            p.completion_rate ? `${p.completion_rate}% complete` : null,
          ].filter(Boolean).join(' · ')
          // Carry the browsed work into the detail page so a direct booking
          // targets the work the customer was shopping for.
          const openDetail = () => navigate(`/partners/${p.user_id}${work ? `?work=${encodeURIComponent(work)}` : ''}`)
          return (
            // Card is a `<div role="button">` rather than a real <button> so
            // the FavouriteButton inside stays a valid nested control. We
            // wire keyboard activation manually since divs don't get
            // Enter/Space → click for free.
            <div key={p.user_id} role="button" tabIndex={0}
              onClick={openDetail}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail() }
              }}
              className="cursor-pointer bg-card border border-border rounded-[12px]
                         px-3 py-2.5 flex gap-2.5 items-center text-left
                         hover:border-accent hover:shadow-card transition-all
                         focus:outline-none focus:ring-2 focus:ring-accent/40">
              <div className={`w-10 h-10 rounded-full font-bold text-[13px] shrink-0
                               flex items-center justify-center ${av}`}>
                {initials(p.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="font-bold text-[14px] text-text truncate">
                    {p.full_name || 'Partner'}
                  </div>
                  {p.is_verified && (
                    <span className="text-[10px] text-[#166534] font-bold shrink-0"
                          title="Verified">✓</span>
                  )}
                  {p.is_online
                    ? <span className="ml-auto inline-flex items-center px-1.5 py-[1px] rounded-xl
                                       text-[9px] font-bold bg-[#dcfce7] text-[#166534]
                                       dark:bg-[#064e3b] dark:text-[#86efac] shrink-0">●</span>
                    : <span className="ml-auto inline-flex items-center px-1.5 py-[1px] rounded-xl
                                       text-[9px] font-bold bg-surface text-muted shrink-0">○</span>}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted leading-tight mt-0.5">
                  <Stars value={p.rating_avg} />
                  <span className="font-semibold text-text">{Number(p.rating_avg || 0).toFixed(1)}</span>
                  <span>({p.rating_count || 0})</span>
                </div>
                {sub && <div className="text-[11px] text-muted truncate mt-0.5">{sub}</div>}
                {/* L63 — top review quote. Server denormalises the first
                    sentence of the most-recent 4★/5★ review onto the
                    partners row. We only render when present so brand-new
                    partners don't get an empty quote balloon. */}
                {p.top_review_quote && (
                  <div className="flex items-start gap-1 text-[11px] text-muted
                                  italic leading-snug mt-1 truncate">
                    <span className="text-accent shrink-0 leading-none" aria-hidden>“</span>
                    <span className="truncate">{p.top_review_quote}</span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0 self-stretch flex flex-col justify-between items-end">
                <div className="flex items-center gap-1">
                  <FavouriteButton partnerId={p.user_id} size={16} />
                  <div className="font-display font-extrabold text-[15px] text-text leading-none">
                    {formatPrice(p.base_price)}
                  </div>
                </div>
                <div className="text-[10px] text-muted leading-tight">
                  {p.distance_km != null && <div>{formatDistance(p.distance_km)}</div>}
                  {eta && <div className="text-[10px] text-accent font-semibold">{eta}</div>}
                </div>
              </div>
            </div>
          )
        })}

        {/* ── Load more ── */}
        {hasMore && (
          <div className="col-span-full flex justify-center mt-2">
            <button onClick={loadNext} disabled={loadingMore}
              className="px-6 py-3 rounded-full bg-card border-[1.5px] border-border
                         text-[13px] font-semibold text-text
                         hover:border-accent hover:text-accent transition
                         disabled:opacity-60 disabled:cursor-not-allowed">
              {loadingMore
                ? <span className="inline-flex items-center gap-2"><Loader size={14}/> Loading…</span>
                : `Load more (${total - partners.length} left)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip ({ on, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap
                  border transition-colors
                  ${on
                    ? 'bg-[#fff5f2] border-accent text-accent dark:bg-[#241a18]'
                    : 'bg-card border-border text-muted hover:border-accent hover:text-accent'}`}>
      {children}
    </button>
  )
}
