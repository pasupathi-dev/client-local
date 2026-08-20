// Partner detail — pixel-matches local.html#page-partner-detail.
//
// Layout
//   ┌─ Dark navy hero ──────────────────────────────────────────────┐
//   │  pills        back        ·       avatar + name + price       │
//   │  ┌ rating │ jobs │ exp │ done │ response ┐                    │
//   │  [ Chat ] [ Schedule ] [ Request Now  →────────────────────── ]│
//   └───────────────────────────────────────────────────────────────┘
//   ┌─ 2fr ─────────────────────────────┬─ 1fr ────────────────────┐
//   │ Service Details (3×n grid)        │ Mini-map card            │
//   │ About                             │ Availability box         │
//   │ Skills                            │ Trust & Safety box       │
//   │ Reviews (4.9 + bars + cards)      │                          │
//   └───────────────────────────────────┴──────────────────────────┘

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  loadPartnerDetail, loadPartnerReviewsPage,
  selectPartnerDetail, selectReviewsLoading, clearDetail,
} from '@/features/catalog/catalogSlice'
import {
  createRequestThunk, selectActiveJob, selectCurrentRequest,
} from '@/features/jobs/jobsSlice'
import { selectResponseTimeP50Seconds } from '@/features/config/configSlice'
import { inclusionsFor, estimateRange } from '@/constants/inclusions'
import { selectProfile } from '@/features/profile/profileSlice'
import AddressConfirmSheet from '@/components/AddressConfirmSheet'
import PhotoNoteAttacher from '@/components/PhotoNoteAttacher'
import { getSocket } from '@/services/socket'
import * as api from '@/services/api'
import { resolveAssetUrl } from '@/constants/api'
import useLocation from '@/hooks/useLocation'
import { formatDistance, formatPrice, formatEta, timeAgo } from '@/utils/format'
import FavouriteButton from '@/features/favourites/FavouriteButton'
import ReportPartnerButton from '@/components/ReportPartnerButton'
import Loader from '@/components/Loader'
import { DetailSkeleton } from '@/components/Skeleton'
import { useReviewNag } from '@/features/reviewNag/ReviewNagContext'
import { pushToast, selectIsPartnerBusy, markPartnerBusy, clearPartnerBusy } from '@/features/app/appSlice'

// Category → emoji lookup (from local.html hero).
const CAT_ICON = {
  Carpenter: '🔨', Electrician: '⚡', Plumber: '🚿', Mechanic: '🔧',
  Painter: '🎨',  'AC Repair': '❄️', Cleaning: '🧹', Tiling: '🔲',
  Welding: '🔩', 'Pest Control': '🐛', Laundry: '👕', Gardening: '🌱',
  'TV Repair': '📺', Cooking: '🍳', Driver: '🚗', Security: '🔒',
}

const PIN_COLOR = {
  Carpenter: '#92400e', Electrician: '#065f46', Plumber: '#5b21b6',
  Mechanic: '#1e40af', Painter: '#b45309',  'AC Repair': '#0e7490',
  Cleaning: '#be185d', Gardening: '#15803d', 'TV Repair': '#7c3aed',
  Tiling: '#374151', Welding: '#1f2937', 'Pest Control': '#7c2d12',
  Laundry: '#0369a1', Cooking: '#c2410c', Driver: '#334155', Security: '#111827',
}

// Avatar-class palette (matches .pav-a..e in index.css).
const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'P'

// ── Sub-components ────────────────────────────────────────────────
function Stars ({ value = 0, size = 14 }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(value))))
  return (
    <span style={{ color: '#f59e0b', fontSize: size, letterSpacing: 1 }} aria-label={`${n} of 5`}>
      {'★'.repeat(n)}<span className="text-[#e4e1db]">{'★'.repeat(5 - n)}</span>
    </span>
  )
}

function InfoCell ({ label, value, highlight }) {
  return (
    <div className="bg-surface border border-border rounded-[var(--rs)] px-[13px] py-[11px]">
      <div className="text-[9px] font-bold text-muted uppercase tracking-[0.5px] mb-[3px]">
        {label}
      </div>
      <div className={`text-[13px] font-semibold ${highlight ? 'text-accent' : 'text-text'}`}>
        {value || '—'}
      </div>
    </div>
  )
}

function RatingBars ({ distribution }) {
  const total = distribution?.total || 0
  const counts = distribution?.counts || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  return (
    <div className="flex-1 min-w-0">
      {[5,4,3,2,1].map((star) => {
        const n = counts[star] || 0
        const pct = total > 0 ? Math.round((n / total) * 100) : 0
        return (
          <div key={star} className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-muted w-[14px]">{star}</span>
            <div className="flex-1 h-1.5 bg-border rounded-[3px] overflow-hidden">
              <div className="h-full bg-[#f59e0b] rounded-[3px] transition-all"
                   style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-muted w-8 text-right">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

function ReviewCard ({ review }) {
  const av = AV_CLASSES[(review.stars || 1) % AV_CLASSES.length]
  const name = review.reviewer_name || 'Customer'
  const init = review.reviewer_initials || initials(name)
  // L78 — uploaded reviewer photo (snapshot at review time).
  const photo = resolveAssetUrl(review.reviewer_avatar_url)
  return (
    <div className="bg-surface border border-border rounded-[var(--rs)] p-3 mb-2">
      <div className="flex gap-2.5 items-center mb-1.5">
        {photo ? (
          <img src={photo} alt={name}
            className="w-[30px] h-[30px] rounded-full object-cover border border-card" />
        ) : (
          <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center
                           text-[10px] font-bold ${av}`}>
            {init}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text truncate">{name}</div>
          <Stars value={review.stars} size={11} />
        </div>
        <div className="text-[10px] text-muted shrink-0">
          {review.created_at ? timeAgo(review.created_at) : ''}
        </div>
      </div>
      {review.comment && (
        <div className="text-[12px] text-muted leading-[1.6]">{review.comment}</div>
      )}

      {/* H60 — chip tags the customer ticked. Compact line of pill labels. */}
      {Array.isArray(review.tags) && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {review.tags.map((slug) => (
            <span key={slug}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full
                         bg-card border border-border text-muted">
              {aspectLabel(slug)}
            </span>
          ))}
        </div>
      )}

      {/* M61 — partner's public reply, if any. Shown inset to make the
          attribution obvious to the customer. */}
      {review.partner_reply && (
        <div className="mt-2.5 ml-3 pl-3 border-l-[3px] border-l-accent
                        text-[12px] leading-[1.6]">
          <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold
                          text-muted mb-0.5">
            Reply from the partner
            {review.partner_reply_at && (
              <span className="font-normal normal-case tracking-normal text-light ml-1">
                · {timeAgo(review.partner_reply_at)}
              </span>
            )}
          </div>
          <div className="text-text">{review.partner_reply}</div>
        </div>
      )}
    </div>
  )
}

// H60 — tiny label resolver duplicated here so this file doesn't grow a
// new top-level import inside the legacy section.
function aspectLabel (slug) {
  switch (slug) {
    case 'on_time':     return 'On time'
    case 'clean_work':  return 'Clean work'
    case 'fair_price':  return 'Fair price'
    case 'friendly':    return 'Friendly'
    case 'prepared':    return 'Prepared'
    case 'late':        return 'Late'
    case 'overcharged': return 'Overcharged'
    case 'untidy':      return 'Untidy'
    default:            return slug
  }
}

// Static CSS mini-map — not Leaflet, just two absolutely-positioned pins.
// Matches local.html lines 2868-2879 exactly.
function MiniMap ({ category, distanceKm, address, zones }) {
  const emoji = CAT_ICON[category] || '📌'
  const bg = PIN_COLOR[category] || '#0a0f1e'
  return (
    <div className="bg-card rounded-[var(--r)] border border-border overflow-hidden shadow-card mb-3">
      <div className="relative h-[140px] overflow-hidden"
           style={{ background: 'linear-gradient(145deg,#e8f0e4,#c8dcc4)' }}>
        {/* grid overlay */}
        <div className="absolute inset-0 opacity-30"
             style={{ backgroundImage:
               'linear-gradient(0deg,rgba(0,0,0,.08) 1px,transparent 1px),'
             + 'linear-gradient(90deg,rgba(0,0,0,.08) 1px,transparent 1px)',
               backgroundSize: '20px 20px' }} />
        {/* Partner pin (centered-upper) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
          <div className="w-[38px] h-[38px] grid place-items-center text-white text-[16px]
                          border-[3px] border-white shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
               style={{ background: bg, borderRadius: '50% 50% 50% 4px' }}>
            {emoji}
          </div>
        </div>
        {/* "You" pin */}
        <div className="absolute top-[70%] left-[65%] -translate-x-1/2 -translate-y-full">
          <div className="w-[38px] h-[38px] grid place-items-center text-white text-[16px]
                          bg-[#2563eb] border-[3px] border-white
                          shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
               style={{ borderRadius: '50% 50% 50% 4px' }}>
            📍
          </div>
        </div>
        {distanceKm != null && (
          <div className="absolute bottom-2 left-2 bg-black/50 rounded-md px-[7px] py-[3px]
                          text-[10px] text-white">
            {formatDistance(distanceKm)}
            {formatEta(distanceKm) && <> · {formatEta(distanceKm)}</>}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-[11px] font-bold text-text mb-1">📍 Service Location</div>
        <div className="text-[11px] text-muted leading-[1.5]">
          {address || '—'}
          {zones && <><br />{zones}</>}
        </div>
      </div>
    </div>
  )
}

// C23 — Inline prompt rendered inside RequestOverlay after the parent
// decides 60s have elapsed with no acceptance. Counts down from 10s and
// auto-fires Yes when it hits 0 so the customer never sits on a dead
// spinner past 90s without an offered next step.
function FanoutPrompt ({ category, onYes, onNo }) {
  const [t, setT] = useState(10)
  const ranRef = useRef(false)
  useEffect(() => {
    const id = setInterval(() => setT((v) => v - 1), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (t <= 0 && !ranRef.current) {
      ranRef.current = true
      onYes?.()
    }
  }, [t, onYes])
  return (
    <div className="my-3 px-3 py-3 rounded-[var(--rs)] border-[1.5px] border-accent/40
                    bg-accent/[0.06] text-left">
      <div className="font-display font-bold text-[13px] text-text mb-1">
        Send to 3 more nearby {category}s?
      </div>
      <p className="text-[11.5px] text-muted leading-[1.55] mb-2.5">
        We'll keep your original request open and broadcast to the next nearest
        partners — first to accept wins.
      </p>
      <div className="flex gap-2 items-center">
        <button onClick={onNo}
          className="flex-1 py-2 rounded-[var(--rs)] border border-border
                     bg-card text-text text-[12px] font-semibold hover:border-muted transition">
          Decline
        </button>
        <button onClick={() => { ranRef.current = true; onYes?.() }}
          className="flex-[2] py-2 rounded-[var(--rs)] bg-accent text-white
                     text-[12.5px] font-bold hover:brightness-90 transition">
          Yes — fan out{t > 0 ? ` (${Math.max(0, t)}s)` : ''}
        </button>
      </div>
    </div>
  )
}

// C24 — Estimate range + per-category inclusions. Renders inside the hero
// dark band, so colours assume a white-on-navy context. We keep the copy
// short and bulleted; the goal is to set the customer's expectation, not
// to write a brochure.
function EstimateAndInclusions ({ basePrice, category }) {
  const range = estimateRange(basePrice)
  const inc   = inclusionsFor(category)
  return (
    <div className="mt-3 mb-1 rounded-[var(--rs)] bg-white/[0.07] border border-white/15
                    px-3.5 py-3">
      {range && (
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.5px] font-bold text-white/55">
            Typical range
          </span>
          <span className="font-display font-extrabold text-[15px] text-white">
            ₹{range.low.toLocaleString('en-IN')} – ₹{range.high.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-white/50">based on this partner's base price</span>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.5px] font-bold text-emerald-300 mb-1">
            ✓ Included
          </div>
          <ul className="text-[11px] text-white/75 leading-[1.55] space-y-[2px]">
            {inc.includes.map((line) => <li key={line}>• {line}</li>)}
          </ul>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.5px] font-bold text-amber-300 mb-1">
            + Extra
          </div>
          <ul className="text-[11px] text-white/75 leading-[1.55] space-y-[2px]">
            {inc.extras.map((line) => <li key={line}>• {line}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

// M30 — small hint below the Request now button. Reads the weekly P50
// acceptance time from /api/config (already loaded on boot via configSlice)
// and renders it as "Most partners respond in under N min". We round UP to
// the nearest minute and clamp to 1 min so the smallest visible number is
// trustworthy.
function ResponseTimeHint () {
  const seconds = useSelector(selectResponseTimeP50Seconds)
  const minutes = Math.max(1, Math.ceil(Number(seconds || 120) / 60))
  return (
    <div className="mt-2 text-center text-[11px] text-white/65 leading-snug">
      ⚡ Most partners respond in under {minutes} min
    </div>
  )
}

// ── Request flow overlay ──────────────────────────────────────────
function RequestOverlay ({
  phase, partnerName, partnerAvClass, partnerInitials,
  secondsLeft, totalSeconds,
  onClose, onCancel, onRetry, onFindAnother,
  // C23 — auto-fanout sheet trigger. The parent decides when to flip
  // `fanoutPrompt` on; this component just renders the sheet + the 10s
  // auto-yes countdown, then calls back.
  fanoutPrompt, onFanoutYes, onFanoutNo, fanoutCategory,
}) {
  if (!phase) return null
  const terminal = phase === 'accepted' || phase === 'declined' || phase === 'expired' || phase === 'partner_busy'
  const pct = totalSeconds > 0 && secondsLeft != null
    ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100))
    : null

  let icon, title, body, tint
  if (phase === 'sending') {
    icon = '📡'; title = 'Sending request…'; body = `Letting ${partnerName} know you need help.`
    tint = 'accent'
  } else if (phase === 'waiting') {
    icon = '⏳'; title = `Waiting for ${partnerName}`
    body = "Your request is out. We'll proceed the moment they accept."
    tint = 'accent'
  } else if (phase === 'accepted') {
    icon = '🎉'; title = 'Request accepted!'; body = `${partnerName} is ready to help.`
    tint = 'success'
  } else if (phase === 'declined') {
    icon = '🙅'; title = 'Partner rejected the request'
    body = `${partnerName} isn't available right now. Please pick another service partner to continue.`
    tint = 'danger'
  } else if (phase === 'expired') {
    icon = '⌛'; title = 'Request timed out'; body = `${partnerName} didn't respond in time. Try again or pick another partner.`
    tint = 'warn'
  } else if (phase === 'partner_busy') {
    icon = '🛠️'; title = `${partnerName} took another job`
    body = `${partnerName} just accepted a different customer's request. Pick another pro or schedule for later.`
    tint = 'warn'
  }

  const ring  = tint === 'success' ? 'bg-success/25' : tint === 'danger' ? 'bg-[#ef4444]/25' : tint === 'warn' ? 'bg-[#f59e0b]/25' : 'bg-accent/25'
  const ringB = tint === 'success' ? 'bg-success/15' : tint === 'danger' ? 'bg-[#ef4444]/15' : tint === 'warn' ? 'bg-[#f59e0b]/15' : 'bg-accent/15'

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center p-5
                    bg-[rgba(10,15,30,0.7)] backdrop-blur-[4px] animate-fadeIn"
         onClick={terminal ? onClose : undefined}>
      <div className="relative bg-card rounded-[22px] px-7 py-8 w-full max-w-[400px]
                      text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] animate-popIn overflow-hidden"
           onClick={(e) => e.stopPropagation()}>

        <div className="relative mx-auto w-[130px] h-[130px] mb-4">
          {!terminal && (
            <>
              <div className={`absolute inset-0 rounded-full ${ring}  animate-radarRing`} />
              <div className={`absolute inset-0 rounded-full ${ringB} animate-radarRingB`} />
              <div className={`absolute inset-0 rounded-full ${ringB} animate-radarRingC`} />
              <div className="absolute inset-1 rounded-full border-[2px] border-dashed border-accent/50 animate-rollingRing" />
              <div className="absolute inset-3 rounded-full border-[2px] border-dotted border-accent/30 animate-rollingRingX" />
            </>
          )}
          <div className={`absolute inset-[22px] rounded-full flex items-center justify-center
                           font-bold text-[18px] ${partnerAvClass || 'pav-a'}
                           ${terminal ? '' : 'animate-avatarBreathe'}
                           shadow-[0_8px_24px_rgba(0,0,0,0.2)]`}>
            {terminal ? <span className="text-[32px]">{icon}</span> : partnerInitials}
          </div>
          {phase === 'waiting' && secondsLeft != null && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2
                            bg-card border border-border rounded-full px-2.5 py-[3px]
                            text-[11px] font-bold text-text shadow-card whitespace-nowrap">
              ⏱ {Math.max(0, secondsLeft)}s
            </div>
          )}
        </div>

        <div className="font-display font-extrabold text-[18px] text-text mb-1">{title}</div>
        <div className="text-[13px] text-muted mb-4 leading-[1.55]">{body}</div>

        {(phase === 'sending' || phase === 'waiting') && (
          <>
            <div className="flex items-center justify-center gap-1 mb-3 h-3">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-dotBob" style={{ animationDelay: '0s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-dotBob" style={{ animationDelay: '0.15s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-dotBob" style={{ animationDelay: '0.3s' }} />
            </div>
            {pct != null && (
              <div className="h-1 w-full rounded-full bg-surface overflow-hidden mb-4">
                <div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
              </div>
            )}
          </>
        )}

        {/* C23 — fanout prompt overlays the action row when the parent
            decides 60s of silence has elapsed. Renders inside the same card
            so the customer never sees a "dead spinner". Default after 10s
            is Yes (so the customer who walks away still gets fan-out). */}
        {fanoutPrompt && phase === 'waiting' && (
          <FanoutPrompt category={fanoutCategory}
            onYes={onFanoutYes} onNo={onFanoutNo} />
        )}

        <div className="flex gap-2">
          {phase === 'waiting' && !fanoutPrompt && (
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                         bg-card text-text text-[12.5px] font-semibold hover:border-muted transition">
              Cancel request
            </button>
          )}
          {phase === 'sending' && (
            <div className="flex-1 py-2.5 text-[11px] text-muted">Please wait…</div>
          )}
          {(phase === 'declined' || phase === 'expired') && (
            <>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                           bg-card text-text text-[12.5px] font-semibold hover:border-muted transition">
                Close
              </button>
              <button onClick={onRetry}
                className="flex-[1.5] py-2.5 rounded-[var(--rs)] bg-accent text-white
                           text-[12.5px] font-bold shadow-[0_4px_14px_rgba(232,65,26,0.3)]
                           hover:brightness-90 transition">
                Try again
              </button>
            </>
          )}
          {phase === 'partner_busy' && (
            // Partner just took someone else's job — "Try again" on this
            // partner would just hit the busy-guard, so we route the user
            // to the partners list filtered by the same category instead.
            <button onClick={onFindAnother || onClose}
              className="flex-1 py-2.5 rounded-[var(--rs)] bg-accent text-white
                         text-[12.5px] font-bold shadow-[0_4px_14px_rgba(232,65,26,0.3)]
                         hover:brightness-90 transition">
              Find another pro
            </button>
          )}
          {phase === 'accepted' && (
            <div className="flex-1 py-2.5 text-[12px] font-semibold text-success">
              Going to My Work…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function PartnerDetailPage () {
  const { id }   = useParams()
  const [qp]     = useSearchParams()
  // Work the customer was browsing (taxonomy v2). Falls back to the partner's
  // primary_work below when absent.
  const browseWork = qp.get('work') || null
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const data     = useSelector(selectPartnerDetail)
  const reviewsLoading = useSelector(selectReviewsLoading)
  const activeJob      = useSelector(selectActiveJob)
  const currentRequest = useSelector(selectCurrentRequest)
  // Did the server tell us this partner just took someone else's job?
  // The flag is set in useRealtime when partner:busy / request:resolved
  // (reason='partner_busy') fires for `id`. We use it to disable the
  // "Request now" CTA so the customer can't fire a request at a partner
  // who's no longer pickable.
  const partnerBusy = useSelector(selectIsPartnerBusy(id))
  const loc      = useLocation()
  const { requireReview } = useReviewNag()
  // null | 'sending' | 'waiting' | 'accepted' | 'declined' | 'expired'
  const [phase, setPhase]           = useState(null)
  // expires_at + total are derived from the server's own absolute timestamps so
  // the countdown matches exactly what the partner sees in their toast.
  const [expiresAt, setExpiresAt]   = useState(null) // ms
  const [totalSeconds, setTotalSeconds] = useState(30)
  const [now, setNow]               = useState(Date.now())
  const [reviewPage, setReviewPage] = useState(1)
  // H60 — aspect chip aggregate. One fetch per partner; bypasses Redux
  // since it's only ever read on this page.
  const [aspects, setAspects] = useState(null)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    api.fetchPartnerAspects(id)
      .then((r) => { if (!cancelled) setAspects(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])
  // H26 — resolved address for this request. Defaults to profile.address;
  // the customer can swap it via the AddressConfirmSheet before sending.
  const profile = useSelector(selectProfile)
  const [bookingAddress, setBookingAddress] = useState('')
  const [addressSheetOpen, setAddressSheetOpen] = useState(false)
  useEffect(() => {
    // Initialise from profile once it arrives; user picks override later.
    if (!bookingAddress && profile?.address) setBookingAddress(profile.address)
  }, [profile?.address, bookingAddress])
  // H25 — optional photos + note attached to the request. Photos are
  // uploaded eagerly so the customer sees thumbnails before sending.
  const [photoUrls, setPhotoUrls] = useState([])
  const [requestNote, setRequestNote] = useState('')
  // C23 — fanout sheet state. Flipped on after 60s of waiting silence;
  // dismissed automatically when the customer answers Yes/No or when the
  // phase moves off `waiting` (accepted / declined / expired).
  const [fanoutPrompt, setFanoutPrompt] = useState(false)
  const [fanoutSent,   setFanoutSent]   = useState(false)
  // Derived from absolute timestamps — never drifts from the partner's clock.
  const secondsLeft = expiresAt == null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000))
  // Track the request id we care about so late socket events from a
  // previous attempt can't jump us into 'accepted'.
  const pendingRequestIdRef = useRef(null)

  useEffect(() => {
    dispatch(loadPartnerDetail({ id, lat: loc.coords?.lat, lng: loc.coords?.lng }))
    return () => dispatch(clearDetail())
  }, [id, loc.coords?.lat, loc.coords?.lng, dispatch])

  // Reset review pagination when switching partners.
  useEffect(() => { setReviewPage(1) }, [id])

  // ── Request lifecycle hooks ──────────────────────────────────────
  // These MUST stay above the `if (!data) return` early exits below so
  // the hook call order is stable across renders (React's rules of hooks).
  // They're no-ops while phase !== 'waiting'.

  // Wait-for-accept: react to the activeJob delivered by the server's
  // `request:accepted` socket event.
  useEffect(() => {
    if (phase !== 'waiting') return
    if (!activeJob) return
    const want = pendingRequestIdRef.current
    if (!want) return
    if (activeJob.request_id !== want && activeJob.id !== want) return
    setPhase('accepted')
    setExpiresAt(null)
  }, [activeJob, phase])

  // Separate effect: navigate once phase reaches 'accepted'.
  // Must be its own effect so the cleanup of the effect above (which fires
  // when phase changes away from 'waiting') doesn't cancel the timeout.
  useEffect(() => {
    if (phase !== 'accepted') return
    const t = setTimeout(() => nav('/my-jobs', { replace: true }), 1100)
    return () => clearTimeout(t)
  }, [phase, nav])

  // Listen for `request:declined` AND `request:resolved` so the overlay
  // flips immediately when the partner declines, or accepts a parallel
  // customer's request (server auto-resolves our request with reason
  // 'partner_busy' in that case). Without this, the overlay was sitting
  // on "Waiting for {partner}…" until the timer expired naturally.
  useEffect(() => {
    if (phase !== 'waiting') return
    let sock; let cancelled = false
    getSocket({ role: 'user' }).then((s) => {
      if (cancelled) return
      sock = s
      const onDeclined = ({ requestId }) => {
        if (requestId && requestId === pendingRequestIdRef.current) {
          setPhase('declined')
          setExpiresAt(null)
        }
      }
      const onResolved = ({ requestId, reason } = {}) => {
        if (!requestId || requestId !== pendingRequestIdRef.current) return
        // partner_busy = our partner took someone else's parallel request.
        // Everything else (cancellation, timeout) is already covered by
        // the explicit expiry / decline / accept paths.
        if (reason === 'partner_busy') {
          setPhase('partner_busy')
          setExpiresAt(null)
        }
      }
      s.on('request:declined', onDeclined)
      s.on('request:resolved', onResolved)
      s.on('request:expired',  onResolved)
      s.__partnerDetailDeclined = onDeclined
      s.__partnerDetailResolved = onResolved
    }).catch(() => {})
    return () => {
      cancelled = true
      if (sock?.__partnerDetailDeclined) {
        sock.off('request:declined', sock.__partnerDetailDeclined)
        delete sock.__partnerDetailDeclined
      }
      if (sock?.__partnerDetailResolved) {
        sock.off('request:resolved', sock.__partnerDetailResolved)
        sock.off('request:expired',  sock.__partnerDetailResolved)
        delete sock.__partnerDetailResolved
      }
    }
  }, [phase])

  // Reconcile the local "busy" flag with what the server actually says.
  // The detail endpoint computes `is_busy` from the partner's current jobs
  // table (non-terminal state). If the server says free, drop any stale
  // sessionStorage entry from a previous tab session so we don't keep
  // showing the "took another job" popup for a partner who's free again.
  // If the server says busy, mirror that so the overlay opens even on a
  // fresh tab without a prior socket event.
  useEffect(() => {
    if (!data?.partner) return
    if (data.partner.is_busy === true && !partnerBusy) {
      dispatch(markPartnerBusy(data.partner.user_id))
    }
    if (data.partner.is_busy === false && partnerBusy) {
      dispatch(clearPartnerBusy(data.partner.user_id))
    }
  }, [data, partnerBusy, dispatch])

  // Open the "took another job" overlay once we've confirmed the partner
  // is busy AND we're not already in a different phase (e.g. waiting on
  // a fresh request we just sent before refreshing). The overlay stays
  // put until the user taps "Find another pro" — see `goFindAnother`.
  useEffect(() => {
    if (!data) return
    if (!partnerBusy) return
    if (phase) return                          // don't override an active phase
    setPhase('partner_busy')
  }, [data, partnerBusy, phase])

  // Helper used by the partner_busy overlay's "Find another pro" CTA AND
  // by the backdrop tap. Closes the overlay and routes back to the
  // category-filtered partners list so the customer can pick somebody else.
  const goFindAnother = () => {
    const targetWork = browseWork || p?.primary_work || p?.primary_category
    closeOverlay()
    nav(`/partners${targetWork ? `?work=${encodeURIComponent(targetWork)}` : ''}`, { replace: true })
  }

  // Wall-clock ticker — drives `now` so the derived `secondsLeft` re-renders.
  // Using absolute `expiresAt` (server-authoritative) means the customer view
  // and the partner toast both compute remaining from the same source of truth,
  // so the partner's auto-decline never fires before the customer's countdown.
  useEffect(() => {
    if (phase !== 'waiting' || expiresAt == null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [phase, expiresAt])

  // Flip to 'expired' once the server-set deadline passes.
  useEffect(() => {
    if (phase !== 'waiting' || expiresAt == null) return
    if (now >= expiresAt) setPhase('expired')
  }, [phase, expiresAt, now])

  // C23 — 60s into waiting with no acceptance, surface the fanout sheet.
  // We pin the trigger to the time the customer entered `waiting`, not the
  // remaining countdown, so the prompt always appears at the same wall-clock
  // moment regardless of the timer length.
  const waitingSinceRef = useRef(null)
  useEffect(() => {
    if (phase === 'waiting' && waitingSinceRef.current == null) {
      waitingSinceRef.current = Date.now()
    }
    if (phase !== 'waiting') {
      waitingSinceRef.current = null
      setFanoutPrompt(false)
    }
  }, [phase])
  useEffect(() => {
    if (phase !== 'waiting' || fanoutPrompt || fanoutSent) return
    const since = waitingSinceRef.current
    if (since == null) return
    if (Date.now() - since >= 60_000) setFanoutPrompt(true)
  }, [phase, now, fanoutPrompt, fanoutSent])

  const onFanoutYes = async () => {
    setFanoutPrompt(false)
    const id = pendingRequestIdRef.current
    if (!id || fanoutSent) return
    setFanoutSent(true)
    try {
      await api.fanoutRequest(id)
      dispatch(pushToast({
        type: 'success',
        text: 'Broadcasting to more partners…',
      }))
    } catch (err) {
      dispatch(pushToast({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Could not broadcast',
      }))
      setFanoutSent(false)
    }
  }
  const onFanoutNo = () => setFanoutPrompt(false)

  const p            = data?.partner || null
  const reviews      = data?.reviews || []
  const distribution = data?.distribution || { counts: { 5:0,4:0,3:0,2:0,1:0 }, total: 0 }

  // Effective WORK for this booking: the browsed work (if it's one this partner
  // actually serves) else their primary_work, else any priced work.
  const effectiveWork = useMemo(() => {
    if (!p) return null
    const prices = p.work_prices || []
    const serves = (w) => w && (w === p.primary_work || prices.some((cp) => cp.work_name === w))
    if (serves(browseWork)) return browseWork
    return p.primary_work || prices[0]?.work_name || p.primary_category || null
  }, [p, browseWork])

  const primaryPrice = useMemo(() => {
    if (!p) return null
    const prices = p.work_prices || []
    const own = prices.find((cp) => cp.work_name === effectiveWork)
    return own?.base_price ?? prices[0]?.base_price ?? null
  }, [p, effectiveWork])

  if (!data) return <div className="p-5"><DetailSkeleton /></div>
  if (!p)    return <div className="p-6 text-muted">Partner not found.</div>

  const cat        = effectiveWork || p.primary_work || p.primary_category || 'Service'
  const catIcon    = CAT_ICON[cat] || '🔧'
  const avatarCls  = p.avatar_class || hashToAv(p.user_id || p.full_name)
  const hours      = p.availability_hours || 'Mon–Sat, 8am–8pm'
  const languages  = (p.languages || []).join(', ') || '—'
  const city       = p.location_city || p.city || '—'
  const zone       = p.zone || city
  const radius     = p.service_radius_km || 10
  const emergency  = p.emergency_service ? 'Available ✓' : 'Not available'
  const ownTools   = p.own_tools ? 'Own tools ✓' : 'Customer provides'
  const materials  = p.materials_extra ? 'Charged extra' : 'Included'

  const requestNow = async () => {
    if (phase && phase !== 'declined' && phase !== 'expired') return
    // Partner just accepted someone else's parallel request — fail loud
    // here instead of letting the API 409 with "partner busy" half a
    // second later. The CTA's UI also greys out via `partnerBusy`, so
    // most users won't even reach this guard.
    if (partnerBusy) {
      dispatch(pushToast({
        type: 'warn',
        text: 'This pro just took another job. Pick a different pro or schedule for later.',
      }))
      return
    }
    // Offline partners can't receive a live request — don't even hit the API.
    // The server enforces this too (409 partner_offline); this is the friendly
    // upfront guard so the customer isn't left waiting on someone who's away.
    if (!p.is_online) {
      dispatch(pushToast({
        type: 'warn',
        text: 'This pro is offline right now. Pick another pro or schedule for later.',
      }))
      return
    }
    // Review-nag gate — if there's an unrated paid job from > 1h ago, the
    // modal blocks here until the user submits or skips. Booking proceeds
    // once `requireReview` resolves true.
    const ok = await requireReview()
    if (!ok) return
    setPhase('sending')
    setExpiresAt(null)
    try {
      // Distance + match must come from the customer's ACTUAL location.
      // No silent fallback to Madurai — if coords are somehow missing
      // here the request would carry the wrong origin and the partner
      // would see a fake distance. Refuse to send when we don't know
      // where the customer is.
      if (loc.coords?.lat == null || loc.coords?.lng == null) {
        dispatch(pushToast({
          text: 'Set your location first — the request needs your real coordinates.',
          type: 'error',
        }))
        return
      }
      const request = await dispatch(createRequestThunk({
        partner_id:    p.user_id,
        work_name:     cat,
        service:       cat,
        base_price:    primaryPrice || 0,
        lat: loc.coords.lat,
        lng: loc.coords.lng,
        // Pass the precomputed customer↔partner distance so the partner's
        // incoming-request toast can surface "📍 X km" without re-deriving
        // it server-side.
        distance_km: p.distance_km != null ? Number(p.distance_km) : null,
        // H26 — booking address (override the customer's profile address
        // if they picked a different saved address for this booking).
        customer_address: (bookingAddress || profile?.address || '').trim() || undefined,
        // H25 — optional note + uploaded photo URLs.
        notes:  requestNote.trim() || undefined,
        photos: photoUrls.length ? photoUrls : undefined,
      })).unwrap()
      // We intentionally do NOT flip to 'accepted' here. The server has only
      // CREATED the request — it's not accepted until the partner clicks accept.
      pendingRequestIdRef.current = request.id
      const timer = Number(request.timer_seconds) || 30
      // Use the server's own expires_at so our countdown lines up exactly
      // with the partner's IncomingRequestToast (no drift from network RTT).
      const exp = request.expires_at
        ? new Date(request.expires_at).getTime()
        : Date.now() + timer * 1000
      setTotalSeconds(timer)
      setExpiresAt(exp)
      setNow(Date.now())
      setPhase('waiting')
    } catch (err) {
      setPhase(null)
      dispatch(pushToast({ text: err?.message || 'Failed to send request', type: 'error' }))
    }
  }

  const closeOverlay = () => {
    setPhase(null)
    setExpiresAt(null)
    pendingRequestIdRef.current = null
  }
  // Tell the server to cancel the live request so the partner's incoming-
  // request toast disappears immediately (via the `request:resolved` socket
  // event emitted from requestController.cancel). We optimistically close
  // the overlay on the customer side — even if the API call fails, the
  // request will time out on the server shortly anyway.
  const cancelWaiting = async () => {
    const id = pendingRequestIdRef.current
    closeOverlay()
    if (!id) return
    try { await api.cancelRequest(id) } catch { /* best-effort; server will expire it */ }
  }

  return (
    <div className="min-h-full bg-surface">
      {/* ── Hero ── */}
      <div className="relative text-white overflow-hidden"
           style={{ background: 'linear-gradient(160deg, var(--brand) 0%, #1e2d4a 100%)' }}>
        {/* Decorations */}
        <div className="pointer-events-none absolute -top-8 -right-8 w-[180px] h-[180px]
                        rounded-full bg-[rgba(232,65,26,0.07)]" />
        <div className="pointer-events-none absolute -bottom-12 right-[50px] w-[120px] h-[120px]
                        rounded-full bg-[rgba(232,65,26,0.04)]" />

        <div className="relative z-[2] max-w-[1200px] mx-auto px-6 md:px-8 pt-7 pb-6">
          {/* Top row: online pill only + back */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex gap-1.5 flex-wrap">
              {p.is_online && (
                <span className="inline-flex items-center px-2 py-[3px] rounded-xl
                                 text-[10px] font-bold bg-[#dcfce7] text-[#166534]">● Online</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-white/10 border border-white/20 rounded-full
                               w-8 h-8 grid place-items-center">
                <FavouriteButton partnerId={p.user_id} size={18}
                  className="text-white/70 hover:text-yellow-400" stopProp={false} />
              </span>
              <button onClick={() => nav(-1)}
                className="bg-white/10 border border-white/20 text-white/80 rounded-[20px]
                           px-3 py-[5px] text-[11px] font-semibold hover:bg-white/20 transition">
                ← Back
              </button>
            </div>
          </div>

          {/* Avatar + name + price */}
          <div className="flex gap-4 items-center mb-[14px]">
            <div className={`w-[72px] h-[72px] rounded-full font-extrabold text-[24px] shrink-0
                             flex items-center justify-center border-[3px] border-white/25
                             ${avatarCls}`}>
              {initials(p.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-[20px] md:text-[22px] leading-tight mb-[3px] truncate">
                {p.full_name || 'Partner'}
              </div>
              <div className="text-[12px] text-white/55 mb-1.5 truncate">
                Expert {cat}
                {p.experience_years ? ` · ${p.experience_years} yrs exp` : ''}
                {city && ` · ${city}`}
              </div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-display font-extrabold text-[22px]">
                  {formatPrice(primaryPrice)}
                </span>
                <span className="text-[11px] text-white/45">/ visit</span>
                {/* Firm price badge — sits inline so it's the first thing the
                    customer reads next to the number. Reassures them the
                    figure won't change unless they agree to a scope change
                    mid-job. */}
                <span className="ml-1 inline-flex items-center gap-1 px-2 py-[3px]
                                 rounded-full bg-white/15 text-white text-[10px]
                                 font-bold whitespace-nowrap">
                  🔒 Firm price
                </span>
              </div>
            </div>
          </div>

          {/* Stats bar (5 cells) */}
          <div className="flex bg-white/[0.07] rounded-xl overflow-hidden">
            {[
              { n: `${Number(p.rating_avg || 0).toFixed(1)}★`, l: 'Rating' },
              { n: p.jobs_completed || 0,                     l: 'Jobs' },
              { n: p.experience_years ? `${p.experience_years}y` : '—', l: 'Exp' },
              { n: p.completion_rate ? `${p.completion_rate}%` : '—',   l: 'Done' },
            ].map((s, i, arr) => (
              <div key={s.l} className={`flex-1 text-center py-3 px-2
                                         ${i < arr.length - 1 ? 'border-r border-white/[0.08]' : ''}`}>
                <div className="font-display font-extrabold text-[18px] whitespace-nowrap">{s.n}</div>
                <div className="text-[9px] uppercase tracking-[0.5px] text-white/40 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>

          {/* C24 — Estimate range + inclusions, surfaced inline with the
              request CTA so the customer can't pay without seeing what the
              price covers. Range is base ±50%, snapped to the nearest ₹50. */}
          <EstimateAndInclusions basePrice={primaryPrice} category={cat} />

          {/* H26 — Address confirmation. Tapping "Change" opens the sheet,
              so a customer can book for a friend's address without
              touching their profile. */}
          <div className="mt-2.5 flex items-start gap-2 text-[12px] text-white/85">
            <span className="mt-[2px]">📍</span>
            <div className="flex-1 min-w-0">
              <span className="font-semibold">Send {p.full_name || 'partner'} to:</span>{' '}
              <span className="text-white/75 break-words">
                {bookingAddress || profile?.address || 'no address on file'}
              </span>{' '}
              <button onClick={() => setAddressSheetOpen(true)}
                className="text-white underline underline-offset-2 hover:text-accent-300 font-bold">
                Change
              </button>
            </div>
          </div>

          {/* H25 — Optional photo (up to 3) + 1-line note. Collapsed to a
              single "Add photo / note" disclosure so it doesn't dominate
              the hero when unused. */}
          <PhotoNoteAttacher
            photoUrls={photoUrls} setPhotoUrls={setPhotoUrls}
            note={requestNote} setNote={setRequestNote} />

          {/* CTA row — H28: Schedule and Request now have equal prominence so
              scheduling stops being the buried "B" option. Both buttons share
              the same width, padding, and emphasis weight; Request is the
              filled accent and Schedule is a high-contrast outline. */}
          <div className="flex gap-2 mt-[14px]">
            <button onClick={() => nav(`/schedule/${p.user_id}${effectiveWork ? `?work=${encodeURIComponent(effectiveWork)}` : ''}`)}
              className="flex-1 px-5 py-3 rounded-[var(--rs)] border-[1.5px] border-white/30
                         bg-white/12 text-white text-[14px] font-display font-bold
                         hover:bg-white/20 transition">
              📅 Schedule for later
            </button>
            <button onClick={requestNow}
              disabled={phase === 'sending' || partnerBusy || !p.is_online}
              title={partnerBusy ? 'This partner just accepted another job' : (!p.is_online ? 'This partner is offline right now' : undefined)}
              className={`flex-1 px-5 py-3 rounded-[var(--rs)] text-white
                         text-[14px] font-display font-bold transition disabled:cursor-not-allowed
                         ${(partnerBusy || !p.is_online)
                           ? 'bg-slate-500/60 shadow-none cursor-not-allowed'
                           : 'bg-accent shadow-[0_4px_16px_rgba(232,65,26,0.35)] hover:brightness-90 disabled:opacity-70'}`}>
              {partnerBusy
                ? '🛠️ On another job'
                : !p.is_online ? '🌙 Offline now'
                : phase === 'sending' ? 'Sending…' : '⚡ Request now'}
            </button>
          </div>
          {partnerBusy ? (
            <p className="mt-3 text-[12px] text-white/85 leading-snug flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              {(data?.partner?.full_name || 'This pro').split(' ')[0]} just accepted another customer's job — pick a different pro or schedule for later.
            </p>
          ) : !p.is_online ? (
            <p className="mt-3 text-[12px] text-white/85 leading-snug flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400" />
              {(data?.partner?.full_name || 'This pro').split(' ')[0]} is offline right now — schedule for later, or pick a pro who's online.
            </p>
          ) : (
            // M30 — wait-time expectation, P50 from /api/config. Falls back to
            // a sensible "2 min" copy until the config row exists.
            <ResponseTimeHint />
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-[1200px] mx-auto px-6 md:px-8 py-5">
        <div className="grid gap-5 grid-cols-1 md:grid-cols-[2fr_1fr] items-start">
          {/* LEFT column */}
          <div>
            {/* Service Details */}
            <section className="mb-5">
              <div className="font-display font-bold text-[13px] text-muted uppercase tracking-[0.8px] mb-2.5">
                Service Details
              </div>
              <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
                <InfoCell label="Service"        value={`${catIcon} ${cat}`} />
                <InfoCell label="Base Price"     value={`${formatPrice(primaryPrice)} / visit`} highlight />
                <InfoCell label="Distance"       value={p.distance_km != null
                  ? `${formatDistance(p.distance_km)}${formatEta(p.distance_km) ? ` · ${formatEta(p.distance_km)}` : ''}`
                  : '—'} />
                <InfoCell label="Languages"      value={languages} />
                <InfoCell label="Zone"           value={zone} />
                <InfoCell label="Availability"   value={hours} />
                <InfoCell label="Tools"          value={ownTools} />
                <InfoCell label="Materials"      value={materials} />
                <InfoCell label="Emergency"      value={emergency} />
                <InfoCell label="Completed Jobs" value={`${p.jobs_completed || 0} total`} />
                <InfoCell label="ID Verified"    value={p.aadhaar_verified ? 'Aadhaar ✓' : 'Pending'} />
              </div>
            </section>

            {/* About */}
            <section className="mb-5">
              <div className="font-display font-bold text-[13px] text-muted uppercase tracking-[0.8px] mb-2.5">
                About
              </div>
              <div className="bg-surface border border-border rounded-[var(--rs)] p-3.5
                              text-[13px] text-muted leading-[1.7]">
                {p.about || 'This partner has not added a bio yet.'}
              </div>
            </section>

            {/* Reviews */}
            <section className="mb-5">
              <div className="font-display font-bold text-[13px] text-muted uppercase tracking-[0.8px] mb-2.5">
                Reviews ({data.reviews_total ?? distribution.total ?? reviews.length})
              </div>

              {/* Summary: big rating + distribution bars */}
              <div className="bg-surface border border-border rounded-[var(--rs)] p-3.5 mb-3">
                <div className="flex gap-5 items-center">
                  <div className="text-center shrink-0">
                    <div className="font-display font-extrabold text-[36px] text-text leading-none">
                      {Number(p.rating_avg || 0).toFixed(1)}
                    </div>
                    <Stars value={p.rating_avg} size={16} />
                    <div className="text-[10px] text-muted mt-0.5">
                      {data.reviews_total ?? distribution.total ?? reviews.length} reviews
                    </div>
                  </div>
                  <RatingBars distribution={distribution} />
                </div>
              </div>

              {/* H60 — Aspect aggregate. Only renders when we have at least
                  one chip recorded; tiny pill grid so a partner with all
                  five "On time / Friendly / …" badges fits on two lines. */}
              {aspects?.stats && Object.keys(aspects.stats).length > 0 && (
                <div className="bg-surface border border-border rounded-[var(--rs)] p-3 mb-3">
                  <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold
                                  text-muted mb-2">
                    What customers say
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(aspects.stats)
                      .sort((a, b) => b[1].pct - a[1].pct)
                      .map(([slug, info]) => (
                        <span key={slug}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-full
                                     bg-card border border-border text-text">
                          {aspectLabel(slug)} <span className="text-accent">({info.pct}%)</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {reviews.length === 0 && (
                <div className="text-[13px] text-muted">No reviews yet.</div>
              )}
              {(() => {
                // Server is the source of truth for pagination — `reviews`
                // holds only the visible page, `data.reviews_total` is the
                // grand total, `data.reviews_limit` is the page size.
                const pageSize = data.reviews_limit || 5
                const total    = data.reviews_total != null ? data.reviews_total
                                : (data.reviews_total ?? distribution.total ?? reviews.length)
                const totalPages = Math.max(1, Math.ceil(total / pageSize))
                const safePage = Math.min(Math.max(1, reviewPage), totalPages)
                const goToPage = (n) => {
                  if (reviewsLoading) return
                  const target = Math.min(Math.max(1, n), totalPages)
                  if (target === safePage) return
                  setReviewPage(target)
                  dispatch(loadPartnerReviewsPage({
                    id, offset: (target - 1) * pageSize, limit: pageSize,
                  }))
                }
                return (
                  <>
                    <div className={reviewsLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                      {reviews.map((r) => <ReviewCard key={r.id || r.job_id} review={r} />)}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between gap-2 mt-3">
                        <button
                          onClick={() => goToPage(safePage - 1)}
                          disabled={safePage === 1 || reviewsLoading}
                          className="px-3 py-1.5 rounded-[var(--rs)] border border-border bg-surface
                                     text-[11px] font-semibold text-text hover:border-muted transition
                                     disabled:opacity-40 disabled:cursor-not-allowed">
                          ← Prev
                        </button>
                        <div className="flex items-center gap-1 flex-wrap justify-center">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                            <button
                              key={n}
                              onClick={() => goToPage(n)}
                              disabled={reviewsLoading}
                              aria-current={n === safePage ? 'page' : undefined}
                              className={`min-w-[28px] h-7 px-2 rounded-[var(--rs)] text-[11px] font-semibold transition
                                disabled:cursor-not-allowed
                                ${n === safePage
                                  ? 'bg-accent text-white border border-accent'
                                  : 'bg-surface border border-border text-muted hover:border-muted hover:text-text'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => goToPage(safePage + 1)}
                          disabled={safePage === totalPages || reviewsLoading}
                          className="px-3 py-1.5 rounded-[var(--rs)] border border-border bg-surface
                                     text-[11px] font-semibold text-text hover:border-muted transition
                                     disabled:opacity-40 disabled:cursor-not-allowed">
                          Next →
                        </button>
                      </div>
                    )}
                    {reviewsLoading && (
                      <div className="text-[11px] text-muted text-center mt-2">Loading reviews…</div>
                    )}
                  </>
                )
              })()}
            </section>

            {/* M68 — Report this partner. Lightweight link, not a CTA —
                most customers will never need this, and it shouldn't
                compete visually with the book/chat actions. */}
            <section className="mb-5 flex justify-start">
              <ReportPartnerButton partnerId={id} />
            </section>
          </div>

          {/* RIGHT sidebar */}
          <div>
            <MiniMap
              category={cat}
              distanceKm={p.distance_km}
              address={p.location_address || city}
              zones={p.zone ? `Covers ${p.zone}` : null}
            />

            {/* Availability */}
            <div className="bg-card rounded-[var(--r)] border border-border p-3.5 shadow-card">
              <div className="text-[11px] font-bold text-muted uppercase tracking-[0.5px] mb-2.5">
                Availability
              </div>
              <div className="text-[12px] text-text mb-1">📅 {hours}</div>
              <div className="text-[12px] text-text mb-1">🚨 Emergency: {emergency}</div>
              <div className="text-[12px] text-text">📍 Radius: up to {radius} km</div>
            </div>
          </div>
        </div>
      </div>

      <RequestOverlay
        phase={phase}
        partnerName={p.full_name || 'Partner'}
        partnerAvClass={avatarCls}
        partnerInitials={initials(p.full_name)}
        secondsLeft={secondsLeft}
        totalSeconds={totalSeconds}
        onClose={phase === 'partner_busy' ? goFindAnother : closeOverlay}
        onCancel={cancelWaiting}
        onRetry={() => { closeOverlay(); requestNow() }}
        onFindAnother={goFindAnother}
        fanoutPrompt={fanoutPrompt}
        fanoutCategory={cat}
        onFanoutYes={onFanoutYes}
        onFanoutNo={onFanoutNo} />

      {/* H26 — address picker sheet */}
      <AddressConfirmSheet
        open={addressSheetOpen}
        currentAddress={bookingAddress}
        onClose={() => setAddressSheetOpen(false)}
        onPick={(addr) => { setBookingAddress(addr); setAddressSheetOpen(false) }} />
    </div>
  )
}
