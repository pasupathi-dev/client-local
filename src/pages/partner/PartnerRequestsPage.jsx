// Partner Incoming Requests — pixel-matches local.html#page-p-requests.
//
// Grid of cards, two variants:
//   • LIVE      — orange accent border, countdown timer bar, Decline/Accept
//   • SCHEDULED — blue accent border, date/time instead of timer, View + Accept/Decline
//
// The "N Live" pill in the header and the sidebar's Requests badge
// both read from the same `incoming` list in Redux, so they stay in sync.

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  loadLiveRequests, selectIncoming, resolveIncoming,
} from '@/features/partner/partnerSlice'
import {
  loadSchedules, selectScheduleList,
  acceptScheduleThunk, declineScheduleThunk,
} from '@/features/schedule/scheduleSlice'
import { acceptRequestThunk } from '@/features/jobs/jobsSlice'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import ScheduledDetailModal from '@/components/ScheduledDetailModal'
import DeclineReasonSheet from '@/components/DeclineReasonSheet'
import RoutePreviewMini from '@/components/RoutePreviewMini'
import { formatDistance, formatPrice } from '@/utils/format'
import { resolveAssetUrl } from '@/constants/api'
import useLocation from '@/hooks/useLocation'

const LIVE_TIMER_SECS = 30   // fallback when the server doesn't send expires_at

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'C'

const CAT_ICON = {
  Carpenter: '🔨', Electrician: '⚡', Plumber: '🚿', Mechanic: '🔧',
  Painter: '🎨', 'AC Repair': '❄️', Cleaning: '🧹', Tiling: '🔲',
  Welding: '🔩', 'Pest Control': '🐛', Laundry: '👕', Gardening: '🌱',
  'TV Repair': '📺', Cooking: '🍳', Driver: '🚗', Security: '🔒',
}

// Compact mm:ss for the timer pill.
const mmss = (secs) => {
  const s = Math.max(0, Math.floor(secs))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// "03 Apr 2026" — short, unambiguous, i18n-free.
const shortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── LIVE card — matches IncomingRequestToast 1:1 (photos, mini-map,
//     Snooze, ETA chip picker on accept, decline-reason chips). ───────
function LiveCard ({ r, now, busy, partnerLoc, onAcceptWithEta, onSnooze, onDeclineWithReason }) {
  const icon = r.service_icon || CAT_ICON[r.category_name] || '🧰'
  const av   = r.customer_av_class || hashToAv(r.customer_id || r.customer_name)
  const ini  = r.customer_initials || initials(r.customer_name)

  // Anchor the countdown on the local `_receivedAt` stamp set by partnerSlice
  // (matches the IncomingRequestToast formula) so this card and the toast
  // never disagree, and so neither is vulnerable to clock skew between the
  // partner's device and the server.
  const total = Math.max(1, Number(r.timer_seconds) || LIVE_TIMER_SECS)
  let remaining
  if (r._receivedAt) {
    remaining = Math.max(0, total - (now - r._receivedAt) / 1000)
  } else if (r.expires_at) {
    remaining = Math.max(0, (new Date(r.expires_at).getTime() - now) / 1000)
  } else {
    remaining = total
  }
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))

  const [showDeclineSheet, setShowDeclineSheet] = useState(false)
  const [showEtaPicker,    setShowEtaPicker]    = useState(false)
  const [customEta,        setCustomEta]        = useState('')

  return (
    <div className="bg-card rounded-[18px] overflow-hidden
                    shadow-[0_8px_40px_rgba(0,0,0,0.12)]
                    border-[2px] border-[rgba(232,65,26,0.25)]">

      {/* Badge + timer + progress */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl
                         text-[11px] font-bold text-white bg-accent animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          🔔 NEW REQUEST
        </span>
        <span className="ml-auto text-[13px] font-bold tabular-nums text-accent">
          ⏱ {mmss(remaining)}
        </span>
      </div>
      <div className="h-1 bg-border mx-4 rounded-[2px] overflow-hidden mb-3">
        <div className="h-full bg-accent rounded-[2px]"
             style={{ width: `${pct}%`, transition: 'width 300ms linear' }} />
      </div>

      {/* Service header — service name + customer subtitle + distance pill */}
      <div className="flex items-center gap-2.5 px-4 pb-2">
        <div className="w-11 h-11 rounded-[var(--rs)] flex items-center justify-center
                        text-[22px] shrink-0
                        bg-[#fff7ed] border border-[#fed7aa]">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[15px] text-text truncate leading-tight">
            {r.service || r.category_name || 'Service'}
          </div>
          <div className="text-[10.5px] text-muted truncate flex items-center gap-1.5 mt-0.5">
            <span className={`inline-flex w-[18px] h-[18px] rounded-full items-center justify-center
                              font-bold text-[9px] ${av}`}>
              {ini}
            </span>
            <span>by <span className="text-text font-semibold">{r.customer_name || 'Customer'}</span></span>
          </div>
        </div>
        {r.distance_km != null && (
          <div className="shrink-0 flex flex-col items-center justify-center
                          rounded-[var(--rs)] border border-[#fed7aa] bg-[#fff7ed]
                          px-2.5 py-1 leading-tight">
            <span className="text-[9px] font-bold uppercase tracking-[0.5px] text-[#9a3412]">
              Distance
            </span>
            <span className="text-[13px] font-extrabold text-accent tabular-nums">
              📍 {formatDistance(r.distance_km)}
            </span>
          </div>
        )}
      </div>

      {/* Price box */}
      <div className="mx-4 mb-2 rounded-[var(--rs)] border border-[#a7f3d0]
                      bg-[#ecfdf5] px-4 py-2.5 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#065f46]">
          Customer's offer
        </div>
        <div className="font-display font-extrabold text-[26px] text-success leading-none mt-0.5">
          {r.base_price != null ? formatPrice(r.base_price) : '—'}
        </div>
        <div className="text-[10px] text-[#065f46]/80 mt-0.5">
          You can negotiate the final price in chat after accepting.
        </div>
      </div>

      {/* L37 — Inline route preview */}
      <RoutePreviewMini
        partnerLat={partnerLoc?.coords?.lat}
        partnerLng={partnerLoc?.coords?.lng}
        customerLat={r.lat}
        customerLng={r.lng}
        distanceKm={r.distance_km} />

      {r.notes && (
        <div className="mx-4 mb-2 text-[11px] italic leading-[1.5] text-muted
                        border-l-[3px] border-accent pl-3">
          📝 {r.notes}
        </div>
      )}

      {/* H25 — Photo thumbnails */}
      {Array.isArray(r.photos) && r.photos.length > 0 && (
        <div className="mx-4 mb-2 flex gap-1.5">
          {r.photos.slice(0, 3).map((u) => (
            <a key={u} href={resolveAssetUrl(u)} target="_blank" rel="noreferrer"
               className="block w-12 h-12 rounded-md overflow-hidden
                          border border-border hover:border-accent transition">
              <img src={resolveAssetUrl(u)} alt="Attached"
                   className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {/* Actions — Decline / Snooze / Accept (replaced by ETA picker after Accept) */}
      {showEtaPicker ? (
        <EtaPickerInline busy={busy} customEta={customEta} setCustomEta={setCustomEta}
          onCancel={() => setShowEtaPicker(false)}
          onPick={(eta) => { setShowEtaPicker(false); onAcceptWithEta(r, eta) }} />
      ) : (
        <div className="flex gap-1.5 px-4 pb-4 pt-1">
          <button onClick={() => setShowDeclineSheet(true)} disabled={busy}
            className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-[#fecaca]
                       bg-card text-[#b91c1c] font-bold text-[12px]
                       hover:border-[#ef4444] hover:bg-[#fef2f2] transition disabled:opacity-60">
            ✗ Decline
          </button>
          <button onClick={() => onSnooze(r)} disabled={busy}
            title="Stays live for everyone — you can still claim it within 5 min"
            className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                       bg-card text-text font-bold text-[12px]
                       hover:border-accent hover:text-accent transition disabled:opacity-60">
            ⏸ Snooze 5m
          </button>
          <button onClick={() => { setShowEtaPicker(true); setCustomEta('') }} disabled={busy}
            className="flex-[2] py-2.5 rounded-[var(--rs)] bg-success text-white font-bold text-[12.5px]
                       shadow-[0_4px_14px_rgba(16,185,129,0.3)]
                       hover:brightness-[1.05] transition disabled:opacity-60">
            {busy ? '…' : '✓ Accept'}
          </button>
        </div>
      )}

      <DeclineReasonSheet
        open={showDeclineSheet}
        busy={busy}
        onClose={() => setShowDeclineSheet(false)}
        onConfirm={(payload) => { setShowDeclineSheet(false); onDeclineWithReason(r, payload) }} />
    </div>
  )
}

// Inline ETA chip picker — same shape as the one in IncomingRequestToast.
function EtaPickerInline ({ busy, customEta, setCustomEta, onCancel, onPick }) {
  const presets = [15, 30, 45, 60]
  const submitCustom = () => {
    const n = Number(customEta)
    if (Number.isFinite(n) && n > 0 && n <= 240) onPick(Math.round(n))
  }
  return (
    <div className="px-4 pb-4 pt-1">
      <div className="text-[11px] font-bold text-text mb-1.5">When will you arrive?</div>
      <div className="flex gap-1.5 mb-2">
        {presets.map((m) => (
          <button key={m} type="button" disabled={busy} onClick={() => onPick(m)}
            className="flex-1 py-2 rounded-[var(--rs)] border border-border bg-card
                       text-[12.5px] font-semibold text-text
                       hover:border-accent hover:text-accent transition disabled:opacity-60">
            {m} min
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 items-center">
        <input type="number" inputMode="numeric" min={1} max={240}
          value={customEta} onChange={(e) => setCustomEta(e.target.value)}
          placeholder="Custom (min)"
          className="flex-1 px-3 py-2 rounded-[var(--rs)] border border-border bg-card
                     text-[12.5px] text-text outline-none focus:border-accent disabled:opacity-60"
          disabled={busy} />
        <button type="button" disabled={busy || !Number(customEta)} onClick={submitCustom}
          className="px-3 py-2 rounded-[var(--rs)] bg-success text-white
                     text-[12.5px] font-bold hover:brightness-[1.05] transition disabled:opacity-50">
          Confirm
        </button>
      </div>
      <div className="flex gap-1.5 mt-1.5">
        <button type="button" onClick={onCancel} disabled={busy}
          className="flex-1 py-1.5 text-[11px] text-muted hover:text-text transition">
          Back
        </button>
        <button type="button" onClick={() => onPick(null)} disabled={busy}
          className="flex-1 py-1.5 text-[11px] text-muted hover:text-text transition underline">
          Skip — accept without ETA
        </button>
      </div>
    </div>
  )
}

// ── SCHEDULED card ────────────────────────────────────────────────
function ScheduledCard ({ j, onView, onAccept, onDecline }) {
  const icon = j.service_icon || CAT_ICON[j.category_name] || '📅'
  const av   = j.customer_av_class || hashToAv(j.customer_id || j.customer_name)
  const ini  = j.customer_initials || initials(j.customer_name)

  return (
    <div className="bg-card rounded-[18px] overflow-hidden
                    shadow-[0_8px_40px_rgba(0,0,0,0.12)]
                    border-[2px] border-[rgba(59,130,246,0.30)]">

      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl
                         text-[11px] font-bold text-white bg-[#3b82f6]">
          📅 NEW BOOKING
        </span>
        <span className="ml-auto text-[11px] font-bold text-[#3b82f6]">
          {shortDate(j.scheduled_at)}{j.time_slot ? ` · ${j.time_slot}` : ''}
        </span>
        <button onClick={() => onView(j)}
          className="shrink-0 px-2.5 py-1 rounded-[var(--rs)]
                     border border-[#3b82f6] text-[#3b82f6]
                     text-[11px] font-bold hover:bg-[#3b82f6] hover:text-white transition">
          👁 View
        </button>
      </div>

      <div className="flex items-center gap-3 px-4 pb-3">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center
                         font-bold text-[13px] shrink-0 ${av}`}>
          {ini}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[14px] text-text truncate">
            {j.customer_name || 'Customer'}
          </div>
          <div className="text-[11px] text-muted truncate">
            {icon} {j.service || j.category_name} · {formatPrice(j.base_price)}
            {/* Address is NOT shown to the partner on a pending booking.
                It's revealed only after acceptance + price confirmation,
                gated inside the active-job flow. */}
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <button onClick={() => onDecline(j)}
          className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-[#fecaca]
                     bg-card text-[#b91c1c] font-bold text-[12.5px]
                     hover:border-[#ef4444] hover:bg-[#fef2f2] transition">
          ✗ Decline
        </button>
        <button onClick={() => onAccept(j)}
          className="flex-[2] py-2.5 rounded-[var(--rs)] text-white font-bold text-[12.5px]
                     hover:brightness-90 transition"
          style={{ background: '#3b82f6' }}>
          ✓ Accept Booking
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function PartnerRequestsPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const incoming = useSelector(selectIncoming)
  const allSchedules = useSelector(selectScheduleList)
  const scheduled = useMemo(
    () => allSchedules.filter((s) => s.status === 'pending'),
    [allSchedules],
  )
  const [now, setNow] = useState(Date.now())
  const [detail, setDetail] = useState(null)
  const [busy,   setBusy]   = useState(false)
  const partnerLoc = useLocation()

  // Live requests come from their own slice; scheduled are shared with the
  // Scheduled tab + sidebar badge + incoming toast, so they live in Redux.
  useEffect(() => {
    dispatch(loadLiveRequests())
    dispatch(loadSchedules('partner'))
  }, [dispatch])

  // Single 1-sec ticker drives every card's timer.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // M35 — accept carries the partner's promised ETA (or null if skipped).
  // 409 means another partner just took it — treat as a clean dismiss
  // instead of a hard error, matching the toast's behaviour.
  const acceptLiveWithEta = async (r, eta_min) => {
    if (busy) return
    setBusy(true)
    try {
      await dispatch(acceptRequestThunk({ id: r.id, eta_min })).unwrap()
      dispatch(resolveIncoming(r.id))
      nav('/partner/work')
    } catch (e) {
      dispatch(resolveIncoming(r.id))
      if (e?.status === 409) {
        dispatch(pushToast({ type: 'info', text: 'Another partner just took this one.' }))
      } else {
        dispatch(pushToast({ text: e?.message || 'Failed to accept', type: 'error' }))
      }
    } finally { setBusy(false) }
  }
  // H33 — Decline carries a reason chip + optional note.
  const declineLiveWithReason = async (r, { reason, note }) => {
    try { await api.declineRequest(r.id, { reason, note }) } catch { /* server expires */ }
    dispatch(resolveIncoming(r.id))
  }
  // H34 — Snooze: convert to broadcast on the server, hide on this device.
  const snoozeLive = async (r) => {
    if (busy) return
    setBusy(true)
    try {
      await api.snoozeRequest(r.id)
      dispatch(resolveIncoming(r.id))
      dispatch(pushToast({
        type: 'info',
        text: 'Snoozed for 5 min — we\'ll show it again if nobody else takes it.',
      }))
    } catch (e) {
      dispatch(pushToast({ text: e?.response?.data?.message || e?.message || 'Could not snooze', type: 'error' }))
    } finally { setBusy(false) }
  }

  const acceptScheduled = async (j) => {
    try {
      await dispatch(acceptScheduleThunk(j.id)).unwrap()
      setDetail(null)
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to accept schedule', type: 'error' })) }
  }
  const declineScheduled = async (j) => {
    try { await dispatch(declineScheduleThunk({ id: j.id, reason: 'Not available' })).unwrap() }
    catch {}
    setDetail(null)
  }
  const viewScheduled = (j) => setDetail(j)

  const totalCount = incoming.length + scheduled.length

  return (
    <div className="min-h-full bg-surface relative">
      {/* Grid */}
      <div className="p-[18px] md:p-6 lg:p-8
                      grid gap-3.5 md:gap-4 lg:gap-5
                      grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {incoming.map((r) => (
          <LiveCard key={`live-${r.id}`} r={r} now={now}
            busy={busy} partnerLoc={partnerLoc}
            onAcceptWithEta={acceptLiveWithEta}
            onSnooze={snoozeLive}
            onDeclineWithReason={declineLiveWithReason} />
        ))}

        {scheduled.map((j) => (
          <ScheduledCard key={`sch-${j.id}`} j={j}
            onView={viewScheduled}
            onAccept={acceptScheduled}
            onDecline={declineScheduled} />
        ))}

        {totalCount === 0 && (
          <div className="col-span-full bg-card border border-border rounded-[var(--r)]
                          py-16 px-6 text-center">
            <div className="w-3 h-3 rounded-full bg-success mx-auto mb-4 animate-pulse" />
            <div className="font-display font-extrabold text-[16px] text-text mb-1">
              You're all caught up
            </div>
            <div className="text-[12px] text-muted">
              Listening for new jobs nearby. We'll notify you the moment one arrives.
            </div>
          </div>
        )}
      </div>

      <ScheduledDetailModal open={!!detail} job={detail} viewer="partner"
        busy={false} onClose={() => setDetail(null)}
        onAccept={acceptScheduled} onDecline={declineScheduled} />
    </div>
  )
}
