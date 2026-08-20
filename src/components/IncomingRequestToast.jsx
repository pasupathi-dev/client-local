// Partner-side "NEW REQUEST" toast — bottom-right corner (desktop) / bottom (mobile).
// Key behaviours:
//   • Chime plays ONCE per request ID — module-level Set survives navigation.
//   • Popup stays visible when the partner navigates away and returns
//     (incoming list lives in Redux; dismissed Set is module-level).
//   • When the timer hits zero the request is auto-declined server-side
//     so the customer's waiting popup flips to "declined/expired" instantly.
//   • Timer is dynamic: driven by expires_at sent from the server.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { selectMode, pushToast } from '@/features/app/appSlice'
import { selectIncoming, resolveIncoming } from '@/features/partner/partnerSlice'
import { selectPartnerSnoozeMin } from '@/features/config/configSlice'
import {
  selectScheduleList, acceptScheduleThunk, declineScheduleThunk,
  loadSchedules,
} from '@/features/schedule/scheduleSlice'
import { acceptRequestThunk } from '@/features/jobs/jobsSlice'
import * as api from '@/services/api'
import { formatDistance, formatPrice } from '@/utils/format'
import { resolveAssetUrl } from '@/constants/api'
import DeclineReasonSheet from './DeclineReasonSheet'
import RoutePreviewMini from './RoutePreviewMini'
import useLocation from '@/hooks/useLocation'

// ── Module-level persistence ──────────────────────────────────────
// These survive React re-mounts / navigation so we never re-chime or
// re-show a request the partner already explicitly dismissed.
const _chimedIds    = new Set()   // request IDs whose chime has played
const _dismissedIds = new Set()   // request IDs the partner ✕-closed
const _cancelledIds = new Set()   // request IDs we already sent decline for
const _snoozedIds   = new Set()   // request IDs snoozed for 5 min (H34)

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'C'

const CAT_ICON = {
  Carpenter: '🔨', Electrician: '⚡', Plumber: '🚿', Mechanic: '🔧',
  Painter: '🎨',  'AC Repair': '❄️', Cleaning: '🧹', Tiling: '🔲',
  Welding: '🔩', 'Pest Control': '🐛', Laundry: '👕', Gardening: '🌱',
  'TV Repair': '📺', Cooking: '🍳', Driver: '🚗', Security: '🔒',
}

const mmss = (s) => {
  const v = Math.max(0, Math.floor(s))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

function playChime () {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const tone = (freq, start, dur) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.02)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur + 0.05)
    }
    tone(880,  0,    0.18)
    tone(1175, 0.16, 0.22)
    setTimeout(() => ctx.close?.(), 600)
  } catch { /* audio is nice-to-have */ }
}

export default function IncomingRequestToast () {
  const mode     = useSelector(selectMode)
  const incoming = useSelector(selectIncoming)
  const schedule = useSelector(selectScheduleList)
  const snoozeMin = useSelector(selectPartnerSnoozeMin) || 5
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const partnerLoc = useLocation()
  // Local render tick so the component re-renders when module-level sets
  // (`_dismissedIds`, `_snoozedIds`) change. The tick value is also fed
  // into the `toast` useMemo deps so a forceUpdate after a dismiss / snooze
  // actually invalidates the cached choice.
  const [tick, forceUpdate] = useState(0)
  const [now, setNow]   = useState(Date.now())
  const [busy, setBusy] = useState(false)
  // H33 — open the decline-reason sheet before firing the API call.
  const [declineFor, setDeclineFor] = useState(null)  // toast.id while open
  // M35 — show ETA chip picker before firing accept.
  const [etaPickFor, setEtaPickFor] = useState(null)  // toast.id while open
  const [customEta, setCustomEta]   = useState('')    // free-text minutes

  useEffect(() => {
    if (mode === 'partner') dispatch(loadSchedules('partner'))
  }, [mode, dispatch])

  // Pick the first visible item:
  //   live instant requests first (time-critical), then pending schedules.
  // H34 — snoozed live requests are hidden for the duration of the snooze
  // window. The `_snoozedIds` Set is cleared by a setTimeout in onSnooze.
  const toast = useMemo(() => {
    if (mode !== 'partner') return null
    const live = incoming
      .filter((r) => !_dismissedIds.has(`live:${r.id}`) && !_snoozedIds.has(r.id))
      .map((r) => ({ kind: 'live', ...r, _key: `live:${r.id}` }))
    const sched = schedule
      .filter((j) => j.status === 'pending' && !_dismissedIds.has(`sched:${j.id}`))
      .map((j) => ({ kind: 'schedule', ...j, _key: `sched:${j.id}` }))
    return live[0] || sched[0] || null
    // `tick` is in deps so a forceUpdate after dismiss/snooze re-runs the
    // filter; the Sets themselves are module-level and don't trigger React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, schedule, mode, tick])

  // C31 — Chime on first appearance, then re-chime every 20s for up to 2 min
  // if the partner hasn't decided. The Set tracks which IDs have started a
  // chime loop so navigation away and back doesn't double-up; the interval
  // is cleared if the toast resolves or the partner navigates the component
  // out (cleanup on unmount).
  useEffect(() => {
    if (!toast || toast.kind !== 'live') return
    if (_chimedIds.has(toast.id)) return
    _chimedIds.add(toast.id)
    playChime()
    const startedAt = Date.now()
    const id = setInterval(() => {
      if (Date.now() - startedAt > 120_000) { clearInterval(id); return }
      // If the toast resolved or was dismissed, stop.
      if (_cancelledIds.has(toast.id) || _dismissedIds.has(toast._key)) {
        clearInterval(id); return
      }
      playChime()
    }, 20_000)
    return () => clearInterval(id)
  }, [toast])

  // Countdown ticker — live only. Seed `now` synchronously when the toast
  // changes so the very first render uses a fresh value (not a stale `now`
  // left over from a previous toast or from initial mount).
  useEffect(() => {
    if (!toast || toast.kind !== 'live') return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [toast])

  const { remaining, pct, hasTimer } = useMemo(() => {
    if (!toast || toast.kind !== 'live') return { remaining: 0, pct: 100, hasTimer: false }
    const total = Math.max(1, Number(toast.timer_seconds) || 30)
    // Prefer the local `_receivedAt` stamp set by partnerSlice — anchoring on
    // it makes the countdown robust against clock skew between the partner's
    // device and the server (the previous formula compared server `expires_at`
    // against local `Date.now()` and could collapse to 0 instantly when those
    // clocks disagreed). Fall back to `expires_at` for entries hydrated from
    // the REST endpoint on reconnect, where no local stamp exists.
    let rem
    if (toast._receivedAt) {
      rem = Math.max(0, total - (now - toast._receivedAt) / 1000)
    } else if (toast.expires_at) {
      rem = Math.max(0, (new Date(toast.expires_at).getTime() - now) / 1000)
    } else {
      rem = total
    }
    return { remaining: rem, pct: Math.max(0, Math.min(100, (rem / total) * 100)), hasTimer: true }
  }, [toast, now])

  // Auto-decline when timer hits 0 — notifies the customer immediately
  // instead of leaving them on a "waiting" spinner until server expiry.
  useEffect(() => {
    if (!toast || !hasTimer || remaining > 0) return
    if (_cancelledIds.has(toast.id)) return
    // The local-clock anchor is REQUIRED for a safe auto-decline. Without it
    // we'd fall back to comparing the server's expires_at against this
    // device's wall clock, which can collapse `remaining` to 0 instantly on
    // any clock skew and dismiss the request before the partner sees it.
    // If the anchor is missing for any reason (rare — only if the request
    // bypassed both the socket and the API hydration paths), defer to the
    // server's 60s expiry cron instead of risking a false dismissal here.
    if (!toast._receivedAt) return
    // Even with an anchor, never auto-decline within the first second after
    // the toast appears — guards against first-render math edge cases.
    if (Date.now() - toast._receivedAt < 1000) return
    _cancelledIds.add(toast.id)
    // Fire-and-forget: optimistically remove from Redux so the toast
    // disappears; even if the API call fails the server will expire it.
    dispatch(resolveIncoming(toast.id))
    api.declineRequest(toast.id).catch(() => {})
  }, [toast, hasTimer, remaining, dispatch])

  if (!toast) return null

  const isSched = toast.kind === 'schedule'
  const name    = toast.customer_name || 'Customer'
  const ini     = toast.customer_initials || initialsOf(name)
  const av      = toast.customer_av_class || hashToAv(toast.customer_id || name)
  const icon    = toast.service_icon || CAT_ICON[toast.category_name] || '🧰'

  const ringColor  = isSched ? 'rgba(59,130,246,0.30)' : 'rgba(232,65,26,0.25)'
  const badgeBg    = isSched ? '#3b82f6' : 'var(--accent)'
  const badgeLabel = isSched ? '📅 NEW BOOKING' : '🔔 NEW REQUEST'

  const close = () => {
    // Tapping ✕ on the toast is a SOFT dismiss — hide the popup on this
    // device for the session, but keep the request in Redux so:
    //   • the bottom-nav "Requests" badge keeps pulsing (partner can still
    //     see something is waiting)
    //   • the /partner/requests page still lists it
    //   • a real resolution (accept / decline / expire) cleans up
    //     properly later via the socket event handlers
    // We deliberately do NOT call `resolveIncoming` here — that would lie
    // to Redux and the partner would lose all trace of an active request.
    _dismissedIds.add(toast._key)
    forceUpdate((n) => n + 1)
  }

  const onDecline = async () => {
    if (busy) return
    // Scheduled bookings still decline immediately — chip flow is only for
    // live instant requests where the auto-fanout retry uses the reason.
    if (isSched) {
      setBusy(true)
      try {
        await dispatch(declineScheduleThunk({ id: toast.id, reason: 'Declined from toast' })).unwrap()
      } catch (e) {
        dispatch(pushToast({ text: e?.message || 'Failed to decline', type: 'error' }))
      } finally { setBusy(false) }
      return
    }
    // H33 — open the reason sheet first; actual API call fires in submit.
    setDeclineFor(toast.id)
  }

  // H34 — partner snoozes for 5 minutes: keep the request live + broadcast,
  // hide the toast on this device for the snooze window. The snoozing
  // partner can still claim it via the dashboard / requests page in the
  // meantime, and the toast re-surfaces when the window elapses.
  const onSnooze = async () => {
    if (busy || isSched) return
    const id = toast.id
    setBusy(true)
    try {
      await api.snoozeRequest(id)
      _snoozedIds.add(id)
      forceUpdate((n) => n + 1)
      dispatch(pushToast({
        type: 'info',
        text: `Snoozed for ${snoozeMin} min — we'll show it again if nobody else takes it.`,
      }))
      setTimeout(() => {
        _snoozedIds.delete(id)
        forceUpdate((n) => n + 1)
      }, snoozeMin * 60 * 1000)
    } catch (e) {
      dispatch(pushToast({ text: e?.response?.data?.message || e?.message || 'Could not snooze', type: 'error' }))
    } finally { setBusy(false) }
  }

  const submitDecline = async ({ reason, note }) => {
    const id = declineFor
    setDeclineFor(null)
    if (!id) return
    setBusy(true)
    try {
      _cancelledIds.add(id)
      try { await api.declineRequest(id, { reason, note }) } catch { /* server will expire */ }
      dispatch(resolveIncoming(id))
    } finally { setBusy(false) }
  }

  const onAccept = async () => {
    if (busy) return
    // M35 — for live requests, open the ETA chip picker first so the
    // customer's header gets pinned with the partner's promised arrival.
    // Scheduled bookings already have a fixed time, so we accept directly.
    if (!isSched) {
      setEtaPickFor(toast.id)
      setCustomEta('')
      return
    }
    setBusy(true)
    try {
      await dispatch(acceptScheduleThunk(toast.id)).unwrap()
      nav('/partner/scheduled')
    } catch (e) {
      dispatch(pushToast({ text: e?.message || 'Failed to accept', type: 'error' }))
    } finally { setBusy(false) }
  }

  // Actually fire the accept with the chosen ETA. `eta_min` may be null
  // (the partner skipped the chips); the server treats null as "unknown".
  // 409 here means someone else accepted (or the customer cancelled)
  // between the partner seeing the toast and tapping Confirm — we treat
  // that as a clean "already resolved" instead of a scary error.
  const confirmAccept = async (eta_min) => {
    const id = etaPickFor
    setEtaPickFor(null)
    if (!id) return
    setBusy(true)
    try {
      await dispatch(acceptRequestThunk({ id, eta_min })).unwrap()
      dispatch(resolveIncoming(id))
      nav('/partner/work')
    } catch (e) {
      _cancelledIds.add(id)
      dispatch(resolveIncoming(id))
      if (e?.status === 409) {
        dispatch(pushToast({
          type: 'info',
          text: 'Another partner just took this one.',
        }))
      } else {
        dispatch(pushToast({ text: e?.message || 'Failed to accept', type: 'error' }))
      }
    } finally { setBusy(false) }
  }

  const scheduledWhen = isSched
    ? `${toast.schedule_date || ''}${toast.time_slot ? ` · ${toast.time_slot}` : ''}`
    : null

  // ── LIVE request — bottom-right corner toast ──────────────────────
  if (!isSched) {
    return createPortal(
      <>
      <DeclineReasonSheet
        open={!!declineFor}
        busy={busy}
        onClose={() => setDeclineFor(null)}
        onConfirm={submitDecline} />
      <div role="alert" aria-live="assertive"
           className="fixed z-[9500]
                      bottom-4 left-4 right-4
                      md:left-auto md:right-5 md:bottom-5 md:w-[380px]
                      bg-card rounded-[18px] overflow-hidden
                      shadow-[0_8px_40px_rgba(0,0,0,0.22)]
                      animate-slideUp"
           style={{ border: `2px solid ${ringColor}` }}>

        {/* Badge + timer + close */}
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl
                           text-[11px] font-bold text-white animate-pulse"
                style={{ background: badgeBg }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            {badgeLabel}
          </span>
          <span className="ml-auto text-[13px] font-bold tabular-nums text-accent">
            ⏱ {mmss(remaining)}
          </span>
          <button onClick={close} aria-label="Dismiss"
            className="text-muted text-[16px] leading-none hover:text-text transition ml-1">
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-border mx-4 rounded-[2px] overflow-hidden mb-3">
          <div className="h-full bg-accent rounded-[2px]"
               style={{ width: `${pct}%`, transition: 'width 300ms linear' }} />
        </div>

        {/* Service header — the partner's first question is "what is being
            requested?", so the service name owns the largest typography slot.
            Customer identity is demoted to a "requested by" subtitle since
            it's only relevant after the partner has decided to engage. */}
        <div className="flex items-center gap-2.5 px-4 pb-2">
          <div className="w-11 h-11 rounded-[var(--rs)] flex items-center justify-center
                          text-[22px] shrink-0
                          bg-[#fff7ed] border border-[#fed7aa]">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[15px] text-text truncate leading-tight">
              {toast.service || toast.category_name || 'Service'}
            </div>
            <div className="text-[10.5px] text-muted truncate flex items-center gap-1.5 mt-0.5">
              <span className={`inline-flex w-[18px] h-[18px] rounded-full items-center justify-center
                                font-bold text-[9px] ${av}`}>
                {ini}
              </span>
              <span>by <span className="text-text font-semibold">{name}</span></span>
            </div>
          </div>
          {/* Distance chip — co-prominent with the service header so the
              partner can size up the trip at a glance. */}
          {toast.distance_km != null && (
            <div className="shrink-0 flex flex-col items-center justify-center
                            rounded-[var(--rs)] border border-[#fed7aa] bg-[#fff7ed]
                            px-2.5 py-1 leading-tight">
              <span className="text-[9px] font-bold uppercase tracking-[0.5px] text-[#9a3412]">
                Distance
              </span>
              <span className="text-[13px] font-extrabold text-accent tabular-nums">
                📍 {formatDistance(toast.distance_km)}
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
            {toast.base_price != null ? formatPrice(toast.base_price) : '—'}
          </div>
          <div className="text-[10px] text-[#065f46]/80 mt-0.5">
            You can negotiate the final price in chat after accepting.
          </div>
        </div>

        {/* L37 — 120px route preview: partner pin · customer pin · dashed
            line · distance/ETA chip. Hidden when either side is missing
            coordinates (e.g. partner hasn't granted location yet). */}
        <RoutePreviewMini
          partnerLat={partnerLoc.coords?.lat}
          partnerLng={partnerLoc.coords?.lng}
          customerLat={toast.lat}
          customerLng={toast.lng}
          distanceKm={toast.distance_km} />

        {toast.notes && (
          <div className="mx-4 mb-2 text-[11px] italic leading-[1.5] text-muted
                          border-l-[3px] border-accent pl-3">
            📝 {toast.notes}
          </div>
        )}

        {/* H25 — photo thumbnails. Up to 3, square 48px, click to open
            the original in a new tab so the partner can size up the job. */}
        {Array.isArray(toast.photos) && toast.photos.length > 0 && (
          <div className="mx-4 mb-2 flex gap-1.5">
            {toast.photos.slice(0, 3).map((u) => (
              <a key={u} href={resolveAssetUrl(u)} target="_blank" rel="noreferrer"
                 className="block w-12 h-12 rounded-md overflow-hidden
                            border border-border hover:border-accent transition">
                <img src={resolveAssetUrl(u)} alt="Attached"
                     className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}

        {/* Actions — H34 adds Snooze between Reject and Accept. Accept stays
            the most prominent target so the muscle memory survives.
            M35: when the partner taps Accept, the action row is replaced
            with an inline ETA chip picker until they pick (or skip). */}
        {etaPickFor ? (
          <EtaPicker busy={busy} customEta={customEta} setCustomEta={setCustomEta}
            onCancel={() => setEtaPickFor(null)}
            onPick={confirmAccept} />
        ) : (
          <div className="flex gap-1.5 px-4 pb-4 pt-1">
            <button onClick={onDecline} disabled={busy}
              className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-[#fecaca]
                         bg-card text-[#b91c1c] font-bold text-[12px]
                         hover:border-[#ef4444] hover:bg-[#fef2f2] transition disabled:opacity-60">
              ✗ Decline
            </button>
            <button onClick={onSnooze} disabled={busy}
              title="Stays live for everyone — you can still claim it within 5 min"
              className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                         bg-card text-text font-bold text-[12px]
                         hover:border-accent hover:text-accent transition disabled:opacity-60">
              ⏸ Snooze 5m
            </button>
            <button onClick={onAccept} disabled={busy}
              className="flex-[2] py-2.5 rounded-[var(--rs)] bg-success text-white font-bold text-[12.5px]
                         shadow-[0_4px_14px_rgba(16,185,129,0.3)]
                         hover:brightness-[1.05] transition disabled:opacity-60">
              {busy ? '…' : '✓ Accept'}
            </button>
          </div>
        )}
      </div>
      </>,
      document.body,
    )
  }

  // ── SCHEDULED booking — corner toast ─────────────────────────────
  return createPortal(
    <div role="alert" aria-live="assertive"
         className="fixed z-[9000]
                    top-4 left-1/2 -translate-x-1/2
                    lg:top-auto lg:left-auto lg:bottom-6 lg:right-6 lg:translate-x-0
                    w-[min(360px,calc(100%-32px))]
                    bg-card rounded-2xl overflow-hidden
                    shadow-[0_20px_60px_rgba(0,0,0,0.25)]
                    animate-pgIn"
         style={{ border: `1px solid ${ringColor}` }}>
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-xl
                         text-[10px] font-bold text-white"
              style={{ background: badgeBg }}>
          {badgeLabel}
        </span>
        <span className="ml-auto text-[12px] font-bold tabular-nums text-[#3b82f6]">
          📅 {scheduledWhen}
        </span>
        <button onClick={close} aria-label="Dismiss"
          className="text-muted text-[16px] leading-none hover:text-text transition">
          ✕
        </button>
      </div>

      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className={`w-[42px] h-[42px] rounded-full flex items-center justify-center
                         font-bold text-[13px] shrink-0 ${av}`}>
          {ini}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[14px] text-text truncate">{name}</div>
          <div className="text-[11px] text-muted truncate">
            {icon} {toast.service || toast.category_name || 'Service'}
            {toast.base_price != null && <> • {formatPrice(toast.base_price)}</>}
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-3.5 pb-3.5">
        <button onClick={onDecline} disabled={busy}
          className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-[#fee2e2]
                     bg-card text-[#ef4444] font-bold text-[12px]
                     hover:border-[#ef4444] transition disabled:opacity-60">
          ✗ Decline
        </button>
        <button onClick={onAccept} disabled={busy}
          className="flex-[2] py-2.5 rounded-[var(--rs)] text-white font-bold text-[12px]
                     hover:brightness-90 transition disabled:opacity-60"
          style={{ background: '#3b82f6' }}>
          {busy ? 'Working…' : '✓ Accept Booking'}
        </button>
      </div>
    </div>,
    document.body,
  )
}

// M35 — Inline ETA chip picker shown after the partner taps Accept. Five
// presets plus a 1–240 custom input. "Skip" accepts without pinning an
// ETA (the customer just doesn't see the "Arriving in ~X min" header).
function EtaPicker ({ busy, customEta, setCustomEta, onCancel, onPick }) {
  const presets = [15, 30, 45, 60]
  const submitCustom = () => {
    const n = Number(customEta)
    if (Number.isFinite(n) && n > 0 && n <= 240) onPick(Math.round(n))
  }
  return (
    <div className="px-4 pb-4 pt-1">
      <div className="text-[11px] font-bold text-text mb-1.5">
        When will you arrive?
      </div>
      <div className="flex gap-1.5 mb-2">
        {presets.map((m) => (
          <button key={m} type="button" disabled={busy}
            onClick={() => onPick(m)}
            className="flex-1 py-2 rounded-[var(--rs)] border border-border bg-card
                       text-[12.5px] font-semibold text-text
                       hover:border-accent hover:text-accent transition
                       disabled:opacity-60">
            {m} min
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 items-center">
        <input type="number" inputMode="numeric" min={1} max={240}
          value={customEta} onChange={(e) => setCustomEta(e.target.value)}
          placeholder="Custom (min)"
          className="flex-1 px-3 py-2 rounded-[var(--rs)] border border-border bg-card
                     text-[12.5px] text-text outline-none focus:border-accent
                     disabled:opacity-60" disabled={busy} />
        <button type="button" disabled={busy || !Number(customEta)}
          onClick={submitCustom}
          className="px-3 py-2 rounded-[var(--rs)] bg-success text-white
                     text-[12.5px] font-bold hover:brightness-[1.05] transition
                     disabled:opacity-50">
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
