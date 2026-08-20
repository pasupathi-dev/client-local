// WorkDecisionView — the fork after a customer picks a WORK (taxonomy v2).
//
// Shared by BOTH:
//   - the /work/:name route page (CategoryDecisionPage), and
//   - the in-popup flow on the home page (CategoryWorksModal step 2),
// so the logic lives in one place and never drifts.
//
// Two paths:
//   ⚡ Request now  → POST /api/requests/auto with work_name; server picks the
//                    closest available partner. On 201 → /waiting/:id. On 404 →
//                    a broaden panel.
//   👀 Browse pros  → /partners?work=X so the user picks a partner.
//
// Auto-match needs the customer's coords; if location isn't known we open the
// LocationPromptModal and retry on grant. `onBack`/`onClose` are optional — the
// header renders a back arrow / close button only when given.

import { useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  selectDynamicWorks, selectDefaultBasePriceInr, selectDefaultSearchRadiusKm,
} from '@/features/config/configSlice'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'
import useLocation from '@/hooks/useLocation'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import Loader from '@/components/Loader'
import LocationPromptModal from '@/components/LocationPromptModal'
import { useReviewNag } from '@/features/reviewNag/ReviewNagContext'

const THEME = {
  Electrician:    { bg: '#FAEEDA', fg: '#BA7517' },
  Plumber:        { bg: '#E6F1FB', fg: '#378ADD' },
  Carpenter:      { bg: '#FAECE7', fg: '#D85A30' },
  'AC Repair':    { bg: '#EEEDFE', fg: '#534AB7' },
  Mechanic:       { bg: '#F1EFE8', fg: '#5F5E5A' },
  Painter:        { bg: '#FBEAF0', fg: '#D4537E' },
  Cleaning:       { bg: '#E1F5EE', fg: '#1D9E75' },
  'Pest Control': { bg: '#EAF3DE', fg: '#639922' },
  Tiling:         { bg: '#F1EFE8', fg: '#374151' },
  Welding:        { bg: '#F1EFE8', fg: '#1f2937' },
  Laundry:        { bg: '#E6F1FB', fg: '#0369a1' },
  'TV Repair':    { bg: '#EEEDFE', fg: '#7c3aed' },
  Cooking:        { bg: '#FCEBEB', fg: '#c2410c' },
  Gardening:      { bg: '#EAF3DE', fg: '#3B6D11' },
  Driver:         { bg: '#F1EFE8', fg: '#334155' },
  Security:       { bg: '#F1EFE8', fg: '#111827' },
}
const themeFor = (name) => THEME[name] || { bg: '#F1EFE8', fg: '#5F5E5A' }
const DEFAULT_BASE_PRICE_FALLBACK = 299
const DEFAULT_RADIUS_KM_FALLBACK = 10

export default function WorkDecisionView ({ work, onBack, onClose }) {
  const dispatch   = useDispatch()
  const nav        = useNavigate()
  const loc        = useLocation()
  const works      = useSelector(selectDynamicWorks)
  const defaultBasePrice = useSelector(selectDefaultBasePriceInr) || DEFAULT_BASE_PRICE_FALLBACK
  const defaultRadiusKm  = useSelector(selectDefaultSearchRadiusKm) || DEFAULT_RADIUS_KM_FALLBACK
  const { requireReview } = useReviewNag()

  const [busy, setBusy]                 = useState(false)   // auto-match in flight
  const [noMatch, setNoMatch]           = useState(false)   // 404 from /requests/auto
  const [radius, setRadius]             = useState(defaultRadiusKm)
  const [locModalOpen, setLocModalOpen] = useState(false)

  const workMeta = useMemo(
    () => (works || []).find((w) => w.name === work)
       || FALLBACK_WORKS.find((w) => w.name === work)
       || null,
    [works, work],
  )
  const display = workMeta?.display_name || work || 'Service'
  const icon    = workMeta?.icon || '🔧'
  const theme   = themeFor(work)
  const basePriceHint = Number(workMeta?.base_price_suggestion) || null

  const goBrowse = async () => {
    const ok = await requireReview()
    if (!ok) return
    nav(`/partners?work=${encodeURIComponent(work)}`)
  }

  const requestNow = async () => {
    if (busy) return
    const ok = await requireReview()
    if (!ok) return
    if (!loc.isKnown) { setLocModalOpen(true); return }
    await tryAutoMatch(loc.coords)
  }

  const tryAutoMatch = async (coords, overrideRadius) => {
    if (!coords) return
    setBusy(true); setNoMatch(false)
    try {
      const { request } = await api.autoMatchRequest({
        work_name: work,
        service: display,
        base_price: basePriceHint || defaultBasePrice,
        lat: coords.lat,
        lng: coords.lng,
        radiusKm: overrideRadius || radius,
        notes: null,
      })
      if (!request?.id) throw new Error('Server did not return a request id')
      nav(`/waiting/${request.id}`)
    } catch (err) {
      const status = err?.response?.status
      const reason = err?.response?.data?.reason
      if (status === 404 || reason === 'no_match') {
        setNoMatch(true)
      } else {
        const msg = err?.response?.data?.message || err.message || 'Could not start request'
        dispatch(pushToast({ text: msg }))
      }
    } finally {
      setBusy(false)
    }
  }

  const broadenAndRetry = async () => {
    const next = Math.min(50, (radius || defaultRadiusKm) * 2)
    setRadius(next)
    await tryAutoMatch(loc.coords, next)
  }

  return (
    <div>
      {/* Header — back / icon / name / indicative price / close */}
      <div className="flex items-center gap-3 mb-5">
        {onBack && (
          <button onClick={onBack} aria-label="Back"
            className="w-9 h-9 rounded-full bg-card border border-border shrink-0
                       flex items-center justify-center hover:border-accent transition">
            ←
          </button>
        )}
        <div className="w-11 h-11 rounded-[13px] flex items-center justify-center shrink-0"
             style={{ background: theme.bg }}>
          <span className="text-[22px]" style={{ color: theme.fg }}>{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[18px] md:text-[22px] font-extrabold leading-tight truncate">
            {display}
          </h2>
          <p className="text-[11.5px] text-muted mt-0.5 truncate">
            {basePriceHint ? 'Typical price for this service' : 'Pick how you want to find a partner'}
          </p>
        </div>
        {basePriceHint != null && (
          <div className="text-right shrink-0">
            <p className="font-display text-[20px] md:text-[24px] font-extrabold text-accent leading-none m-0">
              ₹{basePriceHint}
            </p>
            <p className="text-[10px] text-muted mt-1 m-0">indicative</p>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-full bg-surface border border-border text-muted text-[14px]
                       hover:text-text transition shrink-0">
            ✕
          </button>
        )}
      </div>

      {/* The fork */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {/* Request now */}
        <button onClick={requestNow} disabled={busy}
          className="text-left bg-card border-[1.5px] border-accent rounded-[14px]
                     p-4 md:p-5 shadow-card hover:shadow-cardLg hover:-translate-y-[1px]
                     transition disabled:opacity-60 disabled:cursor-not-allowed">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] tracking-[0.6px] uppercase font-extrabold
                             bg-accent text-white px-2 py-[3px] rounded-full">
              Fastest
            </span>
            <span className="text-[10px] text-muted">~60s response</span>
          </div>
          <p className="font-display text-[18px] font-extrabold text-text mb-1">⚡ Request now</p>
          <p className="text-[12px] text-muted leading-[1.55] mb-4">
            We'll send your request to the closest available {display.toLowerCase()}.
            First one to accept does the job.
          </p>
          <span className="inline-flex items-center gap-1.5 bg-accent text-white
                           text-[12px] font-bold px-4 py-2 rounded-[8px]">
            {busy ? <><Loader size={12} /> Finding a partner…</> : 'Auto-match a partner →'}
          </span>
        </button>

        {/* Browse pros */}
        <button onClick={goBrowse}
          className="text-left bg-card border border-border rounded-[14px]
                     p-4 md:p-5 shadow-card hover:border-accent hover:-translate-y-[1px] transition">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] tracking-[0.6px] uppercase font-extrabold
                             bg-surface border border-border text-muted px-2 py-[3px] rounded-full">
              Compare
            </span>
            <span className="text-[10px] text-muted">Pick yourself</span>
          </div>
          <p className="font-display text-[18px] font-extrabold text-text mb-1">👀 Browse partners</p>
          <p className="text-[12px] text-muted leading-[1.55] mb-4">
            See ratings, reviews, prices and distance for every available
            {' '}{display.toLowerCase()} near you, then pick one.
          </p>
          <span className="inline-flex items-center gap-1.5 bg-surface border border-border
                           text-text text-[12px] font-bold px-4 py-2 rounded-[8px]">
            See all partners →
          </span>
        </button>
      </div>

      {/* No-match fallback — shows after a 404 from /requests/auto */}
      {noMatch && (
        <div className="mt-4 border border-[#fcd34d] bg-[#fffbeb]
                        dark:bg-[#2d1f05] dark:border-[#78350f] rounded-[12px] p-4">
          <p className="text-[14px] font-extrabold text-[#92400e] dark:text-[#fcd34d] m-0">
            No partners available within {radius} km right now
          </p>
          <p className="text-[12px] text-[#78350f] dark:text-[#fbbf24] m-0 mt-1.5 leading-[1.55]">
            We couldn't find an online {display.toLowerCase()} in your area. Try a wider radius,
            or browse the full list — some partners may be busy but visible in browse mode.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={broadenAndRetry} disabled={busy}
              className="bg-[#92400e] text-white text-[12px] font-bold px-4 py-2 rounded-[8px]
                         hover:brightness-110 transition disabled:opacity-60">
              {busy ? 'Retrying…' : `Broaden to ${Math.min(50, radius * 2)} km`}
            </button>
            <button onClick={goBrowse}
              className="bg-card border border-border text-text text-[12px] font-bold
                         px-4 py-2 rounded-[8px] hover:border-accent transition">
              Browse partners instead
            </button>
          </div>
        </div>
      )}

      <LocationPromptModal
        open={locModalOpen}
        onClose={() => setLocModalOpen(false)}
        onGranted={() => {
          setLocModalOpen(false)
          // Geolocation hook state propagates async — poll a tick later.
          setTimeout(() => tryAutoMatch(loc.coords), 50)
        }}
        title="Where should we send a partner?"
        body="We use your location only to find the closest available partner and to help them find you."
      />
    </div>
  )
}
