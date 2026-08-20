// Centralised Socket.IO → Redux bridge. Mount once near the top of the app.
import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { getSocket, disconnectSocket } from '@/services/socket'
import { selectMode, pushToast, markPartnerBusy } from '@/features/app/appSlice'
import { selectIsAuthenticated } from '@/features/auth/authSlice'
import { receiveMessage, applyMessageEdit } from '@/features/chat/chatSlice'
import { applyJobPatch, setActiveJob, loadActiveSearch, clearCurrentRequest } from '@/features/jobs/jobsSlice'
import { receive as receiveNotification } from '@/features/notifications/notificationsSlice'
import { loadWallet } from '@/features/partner/partnerSlice'
import { receiveIncoming, resolveIncoming, applyOnlineState, loadLiveRequests, selectPartnerOnline } from '@/features/partner/partnerSlice'
import { applyCategoryCounts } from '@/features/catalog/catalogSlice'
import {
  receiveIncoming as receiveSchedIncoming,
  patchStatus as patchSchedStatus,
  receiveAlert as receiveSchedAlert,
  receiveStartNow,
} from '@/features/schedule/scheduleSlice'
import { loadNotifications } from '@/features/notifications/notificationsSlice'

export default function useRealtime () {
  const dispatch = useDispatch()
  const authed   = useSelector(selectIsAuthenticated)
  const mode     = useSelector(selectMode)
  const partnerOnline = useSelector(selectPartnerOnline)

  // Latest online flag in a ref so the socket handlers (registered once) can
  // read it without re-subscribing the socket on every toggle.
  const onlineRef = useRef(partnerOnline)
  useEffect(() => { onlineRef.current = partnerOnline }, [partnerOnline])

  useEffect(() => {
    if (!authed) { disconnectSocket(); return }

    let sock
    let cancelled = false

    ;(async () => {
      try {
        sock = await getSocket({ role: mode === 'partner' ? 'partner' : 'user' })
        if (cancelled) return

        // Bug #27: re-fetch notifications on reconnect so missed push events
        // while the socket was down appear in the notification list.
        sock.on('connect', () => dispatch(loadNotifications()))
        // Bug #14: re-sync live requests on reconnect so the partner's incoming
        // list is accurate after any connectivity gap.
        sock.on('connect', () => {
          if (mode === 'partner') dispatch(loadLiveRequests())
          // Customer: restore any in-flight search (server-truth) so the
          // global "searching" bar reappears after a refresh/reconnect.
          else dispatch(loadActiveSearch())
        })
        // Also restore immediately on mount (not just on the next reconnect).
        if (mode !== 'partner') dispatch(loadActiveSearch())

        sock.on('chat:message', (m)   => dispatch(receiveMessage(m)))
        // Edited message — same room as chat:message; swap the bubble in place.
        sock.on('chat:message-edited', (m) => dispatch(applyMessageEdit(m)))
        // State flips carry optional extras (amount/tip/total on `paid`,
        // reason/note/cancelled_by on `cancelled`) — merge the whole payload
        // so the UI can show "Paid · ₹X" or cancellation details without a
        // refetch.
        sock.on('job:state-changed', (payload = {}) => {
          const { jobId, ...rest } = payload
          // Bug #13: ignore patches for jobs the current user isn't tracking.
          // The socket room join is best-effort — validate the id before patching.
          if (!jobId) return
          dispatch(applyJobPatch({ id: jobId, ...rest }))
        })
        sock.on('job:cancelled', ({ jobId, reason, note, cancelled_by }) => {
          if (!jobId) return
          dispatch(applyJobPatch({
            id: jobId, state: 'cancelled',
            cancel_reason: reason || null,
            cancel_note:   note   || null,
            cancelled_by:  cancelled_by || null,
          }))
        })
        sock.on('price:proposed', ({ jobId, newPrice }) => dispatch(applyJobPatch({ id: jobId, agreed_price: newPrice })))
        sock.on('request:accepted', ({ job }) => { dispatch(setActiveJob(job)); dispatch(clearCurrentRequest()) })
        // Customer-side terminal outcomes — the search is over, clear the bar.
        // (Reassign keeps the same request id, so re-pull the active search to
        // refresh the partner without dropping the indicator.)
        sock.on('request:expired',    () => dispatch(clearCurrentRequest()))
        sock.on('request:declined',   () => dispatch(clearCurrentRequest()))
        sock.on('request:reassigned', () => dispatch(loadActiveSearch()))
        sock.on('request:incoming', (r) => {
          // Never surface a live request while the partner is offline. The
          // server shouldn't route to offline partners, but a stale work-room
          // membership could still leak one through — this is the hard gate.
          if (mode === 'partner' && !onlineRef.current) return
          dispatch(receiveIncoming(r))
        })
        sock.on('request:resolved', (payload = {}) => {
          // Partner-side: drop the toast from the incoming list.
          if (payload.requestId) dispatch(resolveIncoming(payload.requestId))
          // Customer-side: if my pending request was resolved because the
          // partner took someone else's job, mark them busy so any partner
          // detail page I'm on disables its CTA.
          if (payload.reason === 'partner_busy' && payload.partner_id) {
            dispatch(markPartnerBusy(payload.partner_id))
          }
        })
        // Global broadcast — fires for every customer the moment ANY partner
        // accepts a job. Lets PartnerDetailPage flip its "Request now" CTA
        // to "Partner is on another job" without waiting for a refetch.
        sock.on('partner:busy', ({ partner_id }) => {
          if (partner_id) dispatch(markPartnerBusy(partner_id))
        })
        sock.on('partner:online-ack', ({ online }) => dispatch(applyOnlineState(!!online)))
        sock.on('categories:counts', (payload) => dispatch(applyCategoryCounts(payload)))
        sock.on('payment:succeeded', (payload = {}) => {
          // Partner-only detail event — merge the amount/tip/total so the
          // partner's payment-received overlay can render instantly.
          if (payload?.jobId) {
            dispatch(applyJobPatch({
              id: payload.jobId, state: 'paid',
              paid_at: payload.paid_at || new Date().toISOString(),
              tip_amount: payload.tip,
              total_paid: payload.total,
            }))
          }
        })
        sock.on('notification:new', (n) => dispatch(receiveNotification(n)))

        // H55 — Live updates for events the server already emits but no
        // page-scoped listener consumes globally.
        // review:submitted — partner sees a toast when a customer rates a job
        sock.on('review:submitted', (payload = {}) => {
          if (mode !== 'partner') return
          const stars = payload?.review?.stars
          dispatch(pushToast({
            type: 'ok',
            text: stars ? `New ${stars}★ review` : 'New review received',
          }))
        })
        // wallet:withdrawal-* — refetch the wallet so balance + history are
        // current, and toast the new status so the partner doesn't need to
        // refresh manually.
        const onWithdrawalEvent = (label) => () => {
          if (mode !== 'partner') return
          dispatch(loadWallet())
          dispatch(pushToast({ type: 'ok', text: label }))
        }
        sock.on('wallet:withdrawal-pending',   onWithdrawalEvent('Withdrawal initiated'))
        sock.on('wallet:withdrawal-completed', onWithdrawalEvent('Withdrawal completed'))
        sock.on('wallet:withdrawal-cancelled', onWithdrawalEvent('Withdrawal cancelled'))
        // Proximity alert — fired by the server once when partner crosses
        // 100m from the customer. Server emits role-specific copy directly
        // to each user via emitToUser, so we just surface what we receive.
        sock.on('job:proximity', (payload = {}) => {
          if (!payload.title && !payload.body) return
          dispatch(pushToast({
            type: 'warn',
            text: payload.body ? `${payload.title} — ${payload.body}` : payload.title,
          }))
        })
        // ── Scheduled bookings ──────────────────────────────
        sock.on('schedule:incoming',  (sj)      => dispatch(receiveSchedIncoming(sj)))
        sock.on('schedule:accepted',  ({ id })  => dispatch(patchSchedStatus({ id, status: 'accepted' })))
        sock.on('schedule:declined',  ({ id, reason }) =>
          dispatch(patchSchedStatus({ id, status: 'declined', cancel_reason: reason || null })))
        sock.on('schedule:cancelled', ({ id, reason, cancelled_by }) =>
          dispatch(patchSchedStatus({ id, status: 'cancelled', cancel_reason: reason || null, cancelled_by })))
        // Alert cron events (24h/1h/15m/now/overdue reminders)
        sock.on('schedule:alert',     (payload) => dispatch(receiveSchedAlert(payload)))
        // Partner's T=0 prompt — shows Start Now button
        sock.on('schedule:start-now', (payload) => dispatch(receiveStartNow(payload)))
        // Scheduled job converted to live job
        sock.on('schedule:converted', ({ id, job }) => {
          dispatch(patchSchedStatus({ id, status: 'converted' }))
          if (job) dispatch(setActiveJob(job))
        })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('socket connect failed', err.message)
      }
    })()

    return () => {
      cancelled = true
      disconnectSocket()
    }
  }, [authed, mode, dispatch])
}
