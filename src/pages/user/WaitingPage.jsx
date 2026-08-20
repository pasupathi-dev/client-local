// WaitingPage — what the customer sees between firing a request and a partner
// accepting it. We don't just spin forever; people give up after ~60s. So:
//
//   T+0s    — animated spinner + "Looking for partners…"
//   T+60s   — surface the broaden CTA (manual)
//   T+120s  — auto-broaden the radius (cancel current, recreate at 2× radius)
//   T+180s  — offer "Schedule for later" instead, link to /schedule/:partnerId
//
// On `request:accepted` (via useRealtime → setActiveJob) we redirect to the
// chat. On expiry / cancel / decline we redirect home with a toast.
//
// The original request payload (category, base_price, lat, lng, radius) is
// fetched from GET /api/requests/:id so this page is robust to a refresh,
// not just a clean nav from CategoryDecisionPage.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { selectActiveJob, setCurrentRequest, clearCurrentRequest } from '@/features/jobs/jobsSlice'
import { selectMaxUserRadiusKm } from '@/features/config/configSlice'
import { pushToast } from '@/features/app/appSlice'
import { getSocket } from '@/services/socket'
import * as api from '@/services/api'
import Loader from '@/components/Loader'
import { motion, AnimatePresence } from 'framer-motion'

const PHASE_BROADEN_AT_MS  = 60_000
const PHASE_AUTO_BROADEN_MS = 120_000
const PHASE_SCHEDULE_AT_MS = 180_000
const MAX_RADIUS_KM_FALLBACK = 50

// Nearby partner dots scattered on the radar. `a` = angle (deg from top),
// `r` = fraction of the radius. `active` ones get a connecting "signal" line
// from the centre (the closest pros we're reaching out to); `dyn` ones pulse.
const PARTNERS = [
  { a: 25,  r: 0.50, active: true,  dyn: true  },
  { a: 80,  r: 0.82, active: false, dyn: true  },
  { a: 150, r: 0.42, active: true,  dyn: false },
  { a: 200, r: 0.70, active: false, dyn: false },
  { a: 255, r: 0.90, active: false, dyn: true  },
  { a: 300, r: 0.55, active: true,  dyn: true  },
  { a: 120, r: 0.92, active: false, dyn: false },
  { a: 340, r: 0.78, active: false, dyn: true  },
]
const C = 200, MAXR = 168
const polar = (a, r) => ({
  x: C + MAXR * r * Math.cos((a - 90) * Math.PI / 180),
  y: C + MAXR * r * Math.sin((a - 90) * Math.PI / 180),
})

// Full radar map: concentric range rings, expanding pulses, a rotating sweep,
// nearby partner dots (static + pulsing), and animated "signal" lines reaching
// the closest pros — with the customer (service icon) pinned at the centre.
function RadarMap ({ icon }) {
  return (
    <div className="relative w-full max-w-[400px] aspect-square mx-auto select-none">
      {/* rotating sweep */}
      <motion.div className="absolute inset-[6%] rounded-full"
        style={{ background: 'conic-gradient(from 0deg, transparent 0deg, var(--accent) 55deg, transparent 85deg)', opacity: 0.13 }}
        animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} />

      <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full">
        {/* soft fill + range rings */}
        <circle cx={C} cy={C} r={MAXR} fill="var(--accent)" opacity="0.04" />
        {[0.33, 0.66, 1].map((f, i) => (
          <circle key={i} cx={C} cy={C} r={MAXR * f} fill="none"
            stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" opacity="0.8" />
        ))}

        {/* expanding pulse rings */}
        {[0, 1, 2].map((i) => (
          <motion.circle key={`p${i}`} cx={C} cy={C} fill="none" stroke="var(--accent)" strokeWidth="1.5"
            initial={{ r: 28, opacity: 0.5 }} animate={{ r: MAXR, opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: 'easeOut' }} />
        ))}

        {/* signal lines + travelling pulse to the closest pros */}
        {PARTNERS.filter((p) => p.active).map((p, i) => {
          const { x, y } = polar(p.a, p.r)
          return (
            <g key={`l${i}`}>
              <line x1={C} y1={C} x2={x} y2={y} stroke="var(--accent)" strokeWidth="1.4" strokeDasharray="2 4" opacity="0.35" />
              <motion.circle r="3.2" fill="var(--accent)"
                initial={{ cx: C, cy: C, opacity: 0 }}
                animate={{ cx: [C, x], cy: [C, y], opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }} />
            </g>
          )
        })}

        {/* partner dots */}
        {PARTNERS.map((p, i) => {
          const { x, y } = polar(p.a, p.r)
          return (
            <g key={`d${i}`}>
              {p.dyn && (
                <motion.circle cx={x} cy={y} fill="none" stroke="var(--accent)" strokeWidth="1.2"
                  initial={{ r: 5, opacity: 0.6 }} animate={{ r: 15, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3, ease: 'easeOut' }} />
              )}
              <circle cx={x} cy={y} r={p.active ? 5.5 : 4}
                fill={p.active ? 'var(--accent)' : 'var(--muted)'} opacity={p.active ? 1 : 0.45} />
            </g>
          )
        })}

      </svg>

      {/* centre — clearly "You" (your location); the orange dots reaching out
          are nearby pros we're pinging. The map metaphor reads instantly. */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <motion.div
          className="w-[52px] h-[52px] rounded-full bg-card border border-border shadow-card grid place-items-center text-[22px]"
          animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
          📍
        </motion.div>
        <span className="mt-1 text-[10px] font-extrabold text-muted tracking-wide">YOU</span>
      </div>
    </div>
  )
}

export default function WaitingPage () {
  const { requestId }   = useParams()
  const nav             = useNavigate()
  const dispatch        = useDispatch()
  const job             = useSelector(selectActiveJob)
  const MAX_RADIUS_KM   = useSelector(selectMaxUserRadiusKm) || MAX_RADIUS_KM_FALLBACK

  const [request, setRequest]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [phase, setPhase]         = useState('searching')   // searching | broaden | scheduling
  const [busy, setBusy]           = useState(false)         // a recreate is in flight
  const [secs, setSecs]           = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false) // ✕ confirmation gate
  // Which phase's overlay prompt the user dismissed (so the broaden/schedule
  // popup can be closed without nagging, yet re-appears on a fresh search).
  const [alertDismissedFor, setAlertDismissedFor] = useState(null)

  // Active request id mirrors the URL — but we mutate it locally during
  // auto-broaden (cancel old, create new). On a successful recreate we
  // replace the URL too, so a refresh lands on the new request.
  const activeIdRef    = useRef(requestId)
  const startedAtRef   = useRef(Date.now())
  const autoBroadenedRef = useRef(false)

  useEffect(() => { activeIdRef.current = requestId }, [requestId])

  // Pull request details once on mount (and after each recreate).
  const loadRequest = useCallback(async (id) => {
    setLoading(true)
    try {
      const { request: r } = await api.fetchRequest(id)
      setRequest(r)
      // If the request was already resolved before we even got here, bail
      // out so we don't sit in a fake spinner forever.
      if (r.status === 'expired' || r.status === 'cancelled' || r.status === 'declined') {
        dispatch(clearCurrentRequest())
        dispatch(pushToast({ text: `Request ${r.status}` }))
        nav('/', { replace: true })
        return null
      }
      // Mark this as the in-flight search so the global bar knows about it.
      dispatch(setCurrentRequest(r))
      return r
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Could not load request'
      dispatch(pushToast({ text: msg }))
      nav('/', { replace: true })
      return null
    } finally {
      setLoading(false)
    }
  }, [dispatch, nav])

  useEffect(() => { loadRequest(requestId) }, [requestId, loadRequest])

  // Redirect to chat when the partner accepts (job lands in Redux via socket).
  useEffect(() => {
    if (job?.request_id === activeIdRef.current || (job?.id && job.state && job.state !== 'cancelled')) {
      nav(`/chat/${job.id}`, { replace: true })
    }
  }, [job, nav])

  // Auto-match fall-through: server reassigned this request to the
  // next-best partner. We just refetch + reset the timer so the user
  // sees a fresh search on the new partner without losing their place.
  //
  // We also listen here for `request:resolved` with reason='partner_busy'
  // — that fires when the partner we were waiting on accepted someone
  // else's parallel request. We flip to the 'partner_busy' phase so the
  // user sees a clear "they took another job" state instead of the bare
  // "no longer live" toast that used to surface from a stale API call.
  useEffect(() => {
    let detachReassigned = () => {}
    let detachResolved   = () => {}
    let cancelled = false
    getSocket({ role: 'user' }).then((s) => {
      if (cancelled || !s) return
      const onReassigned = ({ requestId: rid, partner }) => {
        if (rid !== activeIdRef.current) return
        startedAtRef.current = Date.now()
        setSecs(0)
        setPhase('searching')
        autoBroadenedRef.current = false
        loadRequest(activeIdRef.current)
        dispatch(pushToast({
          text: partner?.full_name
            ? `Trying ${partner.full_name} next…`
            : 'Trying the next available partner…',
        }))
      }
      const onResolved = ({ requestId: rid, reason }) => {
        if (rid !== activeIdRef.current) return
        if (reason !== 'partner_busy') return
        setPhase('partner_busy')
      }
      s.on('request:reassigned', onReassigned)
      s.on('request:resolved',   onResolved)
      s.on('request:expired',    onResolved)
      detachReassigned = () => s.off('request:reassigned', onReassigned)
      detachResolved   = () => { s.off('request:resolved', onResolved); s.off('request:expired', onResolved) }
    })
    return () => { cancelled = true; detachReassigned(); detachResolved() }
  }, [dispatch, loadRequest])

  // Wallclock since the user landed on this page. Used to drive phase ticks.
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Phase transitions — kept declarative so the UI just reads `phase`.
  useEffect(() => {
    const ms = secs * 1000
    if (ms >= PHASE_SCHEDULE_AT_MS && phase !== 'scheduling') setPhase('scheduling')
    else if (ms >= PHASE_BROADEN_AT_MS && phase === 'searching') setPhase('broaden')
  }, [secs, phase])

  // Re-arm the overlay prompt whenever we're back to actively searching (e.g.
  // after an auto-broaden or reassignment) so it can pop again next time.
  useEffect(() => { if (phase === 'searching') setAlertDismissedFor(null) }, [phase])

  // T+120s — auto-broaden once. Skipped if the user already manually
  // broadened (we move to 'scheduling' phase directly in that case).
  useEffect(() => {
    if (autoBroadenedRef.current) return
    if (secs * 1000 < PHASE_AUTO_BROADEN_MS) return
    if (!request) return
    autoBroadenedRef.current = true
    broadenAndRetry({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, request])

  // Cancel current, fire a fresh auto-match with a wider radius.
  const broadenAndRetry = useCallback(async ({ silent = false } = {}) => {
    if (busy || !request) return
    const currentRadius = Number(request.distance_km && request.distance_km > 0
      ? Math.ceil(request.distance_km * 2)   // bump from current actual distance
      : 10)
    const nextRadius = Math.min(MAX_RADIUS_KM, Math.max(currentRadius, 10) * 2)
    if (nextRadius === currentRadius) {
      if (!silent) dispatch(pushToast({ text: `Already at max radius (${MAX_RADIUS_KM} km)` }))
      return
    }
    setBusy(true)
    try {
      // Best-effort cancel of the current pending request. If it already
      // expired / was accepted by someone, the server returns "already
      // resolved" and we just continue.
      try { await api.cancelRequest(activeIdRef.current) } catch { /* ignore */ }

      const { request: fresh } = await api.autoMatchRequest({
        work_name:     request.work_name || request.category_name,
        service:       request.service,
        base_price:    request.base_price,
        lat:           Number(request.lat),
        lng:           Number(request.lng),
        radiusKm:      nextRadius,
        notes:         request.notes,
      })
      if (!fresh?.id) throw new Error('Server did not return a request id')
      // Reset timers so the new search gets its own 60s/120s/180s windows.
      startedAtRef.current = Date.now()
      setSecs(0)
      setPhase('searching')
      autoBroadenedRef.current = true        // already used the auto slot
      activeIdRef.current = fresh.id
      nav(`/waiting/${fresh.id}`, { replace: true })
      setRequest(fresh)
      dispatch(setCurrentRequest(fresh))
      if (!silent) dispatch(pushToast({ text: `Searching wider (${nextRadius} km)` }))
    } catch (err) {
      const status = err?.response?.status
      const reason = err?.response?.data?.reason
      if (status === 404 || reason === 'no_match') {
        // No-one in the wider radius either — push the user toward scheduling.
        setPhase('scheduling')
        if (!silent) dispatch(pushToast({ text: 'No partners available — try scheduling instead' }))
      } else {
        const msg = err?.response?.data?.message || err.message || 'Could not broaden'
        dispatch(pushToast({ text: msg }))
      }
    } finally {
      setBusy(false)
    }
  }, [busy, request, dispatch, nav])

  // Drop the request and bail.
  const cancelAndExit = async () => {
    try { await api.cancelRequest(activeIdRef.current) } catch { /* ignore */ }
    dispatch(clearCurrentRequest())
    nav('/', { replace: true })
  }

  // Convert to a scheduled booking. We need a partner to schedule with —
  // for an auto-matched request that's the partner_id stored on the request.
  // For broadcast requests there's no partner, so we send the user to the
  // category browse page instead.
  const goSchedule = async () => {
    try { await api.cancelRequest(activeIdRef.current) } catch { /* ignore */ }
    dispatch(clearCurrentRequest())
    if (request?.partner_id) {
      const w = request.work_name || request.category_name
      nav(`/schedule/${request.partner_id}${w ? `?work=${encodeURIComponent(w)}` : ''}`, { replace: true })
    } else if (request?.work_name || request?.category_name) {
      nav(`/partners?work=${encodeURIComponent(request.work_name || request.category_name)}`, { replace: true })
      dispatch(pushToast({ text: 'Pick a partner to schedule with' }))
    } else {
      nav('/', { replace: true })
    }
  }

  if (loading) return <Loader fullScreen label="Loading request…" />

  const m = String(Math.floor(secs / 60)).padStart(1, '0')
  const s = String(secs % 60).padStart(2, '0')
  const elapsedLabel = `${m}:${s}`

  // Partner-busy phase has a totally different layout — no spinner, clear
  // explanation, prominent "try other pros" CTA. We return early so the
  // searching/broaden/scheduling UI below doesn't conflict.
  if (phase === 'partner_busy') {
    const partnerName = request?.partner_name || 'The partner'
    return (
      <div className="min-h-full bg-surface flex items-start justify-center p-5">
        <div className="w-full max-w-[460px] mt-10 flex flex-col items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center text-4xl">
            🛠️
          </div>
          <div className="text-center">
            <p className="font-display text-[20px] font-extrabold text-text m-0">
              {partnerName} just took another job
            </p>
            <p className="text-[13px] text-muted mt-2 max-w-[340px] mx-auto leading-[1.55]">
              They accepted a different customer's request a moment ago. We'll find you the next available partner nearby.
            </p>
          </div>
          <div className="w-full bg-card border border-border rounded-[12px] p-4 shadow-card space-y-3">
            <button onClick={() => broadenAndRetry()} disabled={busy}
              className="w-full bg-accent text-white text-[13px] font-bold
                         py-3 rounded-[8px] hover:brightness-90 transition
                         disabled:opacity-60 disabled:cursor-not-allowed">
              {busy ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Searching…</span> : '🔍 Find another partner nearby'}
            </button>
            <button onClick={goSchedule}
              className="w-full bg-card border border-border text-text text-[13px] font-bold
                         py-3 rounded-[8px] hover:border-accent transition">
              📅 Schedule for later instead
            </button>
            <button onClick={cancelAndExit}
              className="w-full text-[12px] text-muted font-medium hover:text-accent transition">
              Cancel & exit
            </button>
          </div>
        </div>
      </div>
    )
  }

  const workLabel = request?.service || request?.work_name || 'partner'
  const svcIcon   = request?.service_icon || '🔧'
  const headline =
    phase === 'scheduling' ? 'No partners available right now'
      : phase === 'broaden' ? 'Still searching…'
        : 'Looking for a partner…'

  return (
    <div className="min-h-full bg-surface flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">

      {/* Top bar — close (cancels), the service you're booking, and elapsed.
          Keeps the radar the focus and moves the exit out of the bottom. */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 z-10">
        <button onClick={() => setConfirmCancel(true)} aria-label="Cancel search"
          className="w-10 h-10 rounded-full bg-card border border-border grid place-items-center
                     text-[15px] text-muted hover:text-accent hover:border-accent transition shrink-0">✕</button>
        <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 shadow-card min-w-0">
          <span className="text-[15px] shrink-0">{svcIcon}</span>
          <span className="text-[12px] font-bold text-text truncate max-w-[150px]">{workLabel}</span>
        </div>
        <div className="text-[12px] text-muted font-semibold tabular-nums w-10 text-right shrink-0">{elapsedLabel}</div>
      </div>

      {/* Radar — the hero of the screen */}
      <RadarMap icon={svcIcon} />

      {/* Just the headline — minimal, reassuring */}
      <AnimatePresence mode="wait">
        <motion.p key={headline}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="font-display text-[22px] md:text-[26px] font-extrabold text-text mt-1 text-center">
          {headline}
        </motion.p>
      </AnimatePresence>

      {/* Proactive overlay popup — pops over the radar when the search is
          taking long (broaden) or no one's available (scheduling). Dismissible
          so the user can keep watching the radar. */}
      <AnimatePresence>
        {(phase === 'broaden' || phase === 'scheduling') && alertDismissedFor !== phase && !confirmCancel && (
          <motion.div key="alert-overlay"
            className="fixed inset-0 z-[65] bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] flex items-center justify-center p-5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAlertDismissedFor(phase)}>
            <motion.div onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.92, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="w-full max-w-[400px] bg-card rounded-[20px] border border-border shadow-cardLg p-6">

              {phase === 'broaden' ? (
                <>
                  <motion.div className="w-14 h-14 rounded-full bg-accent/15 grid place-items-center text-2xl mx-auto"
                    animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.3, repeat: Infinity }}>⏱️</motion.div>
                  <p className="font-display text-[18px] font-extrabold text-text text-center mt-3 m-0">Taking longer than usual</p>
                  <p className="text-[12.5px] text-muted text-center mt-1.5 m-0 leading-[1.55]">
                    No one's accepted yet. Widen the radius to reach more partners nearby.
                  </p>
                  <button onClick={() => broadenAndRetry()} disabled={busy}
                    className="mt-5 w-full bg-accent text-white text-[13.5px] font-bold py-3 rounded-[12px]
                               hover:brightness-90 transition disabled:opacity-60 disabled:cursor-not-allowed">
                    {busy ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Widening…</span> : '📡 Broaden the radius →'}
                  </button>
                  <button onClick={() => setAlertDismissedFor('broaden')}
                    className="mt-2 w-full text-[12px] text-muted font-bold py-2 hover:text-accent transition">
                    Keep searching
                  </button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-accent/15 grid place-items-center text-2xl mx-auto">📅</div>
                  <p className="font-display text-[18px] font-extrabold text-text text-center mt-3 m-0">No partners available right now</p>
                  <p className="text-[12.5px] text-muted text-center mt-1.5 m-0 leading-[1.55]">
                    Book a time instead — your partner confirms in advance.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-5">
                    <button onClick={goSchedule} disabled={busy}
                      className="bg-accent text-white text-[13px] font-bold py-3 rounded-[12px] hover:brightness-90 transition disabled:opacity-60">
                      Schedule instead
                    </button>
                    <button onClick={() => broadenAndRetry()} disabled={busy}
                      className="bg-surface border border-border text-text text-[13px] font-bold py-3 rounded-[12px] hover:border-accent transition disabled:opacity-60">
                      Keep searching
                    </button>
                  </div>
                  <button onClick={() => setAlertDismissedFor('scheduling')}
                    className="mt-2 w-full text-[12px] text-muted font-bold py-2 hover:text-accent transition">
                    Dismiss
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm before the ✕ actually cancels the search */}
      <AnimatePresence>
        {confirmCancel && (
          <motion.div key="confirm-cancel"
            className="fixed inset-0 z-[70] bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] flex items-center justify-center p-5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setConfirmCancel(false)}>
            <motion.div onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="w-full max-w-[340px] bg-card rounded-[18px] border border-border shadow-cardLg p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-surface grid place-items-center text-2xl mx-auto">🛑</div>
              <p className="font-display text-[17px] font-extrabold text-text mt-3 m-0">Stop searching?</p>
              <p className="text-[12.5px] text-muted mt-1.5 m-0 leading-[1.55]">
                You'll lose your place in the queue and we'll stop looking for a partner.
              </p>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setConfirmCancel(false)}
                  className="flex-1 bg-surface border border-border text-text text-[13px] font-bold py-2.5 rounded-[10px] hover:border-accent transition">
                  Keep searching
                </button>
                <button onClick={cancelAndExit}
                  className="flex-1 bg-accent text-white text-[13px] font-bold py-2.5 rounded-[10px] hover:brightness-90 transition">
                  Yes, cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
