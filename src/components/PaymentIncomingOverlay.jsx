// Partner-side payment popup. Mounted globally inside Shell so it appears
// over whatever page the partner is on the moment a customer hits Pay.
//
// Lifecycle:
//   payment:initiated → open in `incoming` stage (animated, "customer is
//                       paying now" copy + spinner)
//   payment:succeeded → flip to `success` stage (green ✓, ₹X received)
//                       and auto-dismiss after 2.5s
//   payment:failed    → flip to `failed` stage with reason and a manual
//                       Close button (no auto-dismiss; partner should see)
//
// Anti-stuck guard: if `incoming` sits >90s with no follow-up event (the
// customer probably abandoned the Razorpay sheet), auto-close the popup.

import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { getSocket } from '@/services/socket'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'

const STALE_AFTER_MS = 90_000

export default function PaymentIncomingOverlay () {
  const [state, setState] = useState(null)   // null | { stage, jobId, ...payload }
  const [busy, setBusy]   = useState(false)
  const staleTimer = useRef(null)
  const dispatch = useDispatch()

  useEffect(() => {
    let detach = () => {}
    let cancelled = false
    getSocket({ role: 'partner' }).then((s) => {
      if (cancelled || !s) return

      const onInitiated = (p = {}) => {
        // Replace any previous in-flight popup (e.g. customer retried after
        // a failure) so we always reflect the most recent attempt.
        setState({ stage: 'incoming', ...p })
        if (staleTimer.current) clearTimeout(staleTimer.current)
        staleTimer.current = setTimeout(() => {
          setState((cur) => (cur && cur.stage === 'incoming' ? null : cur))
        }, STALE_AFTER_MS)
      }

      const onSucceeded = (p = {}) => {
        setState((cur) => {
          // Only react if it's the SAME job we were already showing — or
          // if no popup is open yet (cold-start celebration).
          if (cur && cur.jobId && p.jobId && cur.jobId !== p.jobId) return cur
          return { ...cur, ...p, stage: 'success' }
        })
        if (staleTimer.current) clearTimeout(staleTimer.current)
        // Auto-dismiss the celebration after a beat.
        setTimeout(() => setState((cur) => (cur && cur.stage === 'success' ? null : cur)), 2500)
      }

      const onFailed = (p = {}) => {
        setState((cur) => {
          if (cur && cur.jobId && p.jobId && cur.jobId !== p.jobId) return cur
          return { ...cur, ...p, stage: 'failed' }
        })
        if (staleTimer.current) clearTimeout(staleTimer.current)
      }

      const onCancelled = (p = {}) => {
        setState((cur) => {
          if (cur && cur.jobId && p.jobId && cur.jobId !== p.jobId) return cur
          return { ...cur, ...p, stage: 'cancelled' }
        })
        if (staleTimer.current) clearTimeout(staleTimer.current)
      }

      // M50 — customer requested cash. Open the popup in `cash-pending`
      // so the partner can confirm / decline they actually got the cash.
      const onCashRequested = (p = {}) => {
        setState({ stage: 'cash-pending', ...p })
        if (staleTimer.current) clearTimeout(staleTimer.current)
      }

      s.on('payment:initiated',     onInitiated)
      s.on('payment:succeeded',     onSucceeded)
      s.on('payment:failed',        onFailed)
      s.on('payment:cancelled',     onCancelled)
      s.on('payment:cash-requested', onCashRequested)
      detach = () => {
        s.off('payment:initiated',     onInitiated)
        s.off('payment:succeeded',     onSucceeded)
        s.off('payment:failed',        onFailed)
        s.off('payment:cancelled',     onCancelled)
        s.off('payment:cash-requested', onCashRequested)
      }
    }).catch(() => {})

    return () => {
      cancelled = true
      detach()
      if (staleTimer.current) clearTimeout(staleTimer.current)
    }
  }, [])

  const respondCash = async (accepted) => {
    if (!state?.jobId || busy) return
    setBusy(true)
    try {
      await api.confirmCashPayment(state.jobId, accepted)
      // The server emits payment:succeeded (on accept) or payment:cash-rejected
      // (on decline). On reject we close the popup manually since there's no
      // follow-up event from the server beyond the customer-side one.
      if (!accepted) setState(null)
    } catch (e) {
      dispatch(pushToast({
        text: e?.response?.data?.message || e?.message || 'Could not confirm cash',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  if (!state) return null

  const { stage } = state
  const isSuccess     = stage === 'success'
  const isFailed      = stage === 'failed'
  const isCancelled   = stage === 'cancelled'
  const isCashPending = stage === 'cash-pending'
  const isResolved    = isSuccess || isFailed || isCancelled
  const customer    = state.customer_name || 'Customer'
  const amount      = state.total ?? state.amount ?? 0
  const service     = state.service || 'service'

  const COPY = isSuccess
    ? { icon: '✅', title: 'Payment received!',         body: `₹${amount} from ${customer} · pending wallet clearance.` }
    : isFailed
      ? { icon: '⚠️', title: 'Payment failed',          body: state.reason === 'invalid_signature'
          ? 'The bank rejected the verification. The customer may try again.'
          : `The payment didn't go through. ${customer} may try again.` }
      : isCancelled
        ? { icon: '✕', title: 'Payment cancelled',     body: `${customer} closed the payment window. They may try again.` }
        : isCashPending
          ? { icon: '💵', title: `Cash payment from ${customer}`,
              body: `${customer} says they're paying ₹${amount} in cash for ${service}. Confirm you received it.` }
          : { icon: '💳', title: `${customer} is paying now`, body: `₹${amount} for ${service}. Verifying with the bank…` }

  const accent = isSuccess ? '#10b981'
    : (isFailed || isCancelled) ? '#ef4444'
    : '#e8411a'

  return (
    <div className="fixed inset-0 z-[9998] bg-[rgba(8,12,28,0.55)] backdrop-blur-sm
                    flex items-center justify-center p-5"
         role="dialog" aria-modal="true" aria-live="polite">
      <div className="relative bg-card rounded-[var(--r)] shadow-[0_30px_80px_rgba(0,0,0,0.35)]
                      w-full max-w-[400px] p-6 text-center animate-slideUp">
        {/* Always-visible X close — partner can dismiss any state, even
            mid-spinner if they don't want to be interrupted. */}
        <button onClick={() => setState(null)} aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface
                     border border-border text-muted hover:text-text hover:border-accent
                     flex items-center justify-center text-[14px] leading-none transition">
          ✕
        </button>

        {/* Animated badge */}
        <div className="relative mx-auto w-[88px] h-[88px] mb-4">
          {!isResolved && (
            <>
              <span className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
              <span className="absolute inset-2 rounded-full bg-accent/10" />
              <span className="absolute inset-0 rounded-full border-[4px] border-transparent
                                border-t-accent border-r-accent animate-spin" />
            </>
          )}
          {isSuccess && (
            <span className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
          )}
          {(isFailed || isCancelled) && (
            <span className="absolute inset-0 rounded-full bg-rose-500/15" />
          )}
          <span className="absolute inset-2 rounded-full flex items-center justify-center
                            text-[36px] shadow-[0_10px_24px_rgba(0,0,0,0.18)] text-white"
                style={{ background: accent }}>
            {COPY.icon}
          </span>
        </div>

        <div className="font-display font-extrabold text-[18px] text-text mb-1.5">
          {COPY.title}
        </div>
        <div className="text-[13px] text-muted leading-[1.55]">
          {COPY.body}
        </div>

        {/* Sub-strip showing job context */}
        {amount > 0 && !isFailed && !isCancelled && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl
                          bg-surface border border-border">
            <span className="text-[11px] uppercase tracking-[0.4px] text-muted font-bold">
              Amount
            </span>
            <span className="font-display font-extrabold text-[16px] text-text">
              ₹{amount}
            </span>
          </div>
        )}

        {/* Failed/cancelled need a clear close action — the X at the top
            still works, but a primary "Got it" button is more obvious. */}
        {(isFailed || isCancelled) && (
          <button onClick={() => setState(null)}
            className="mt-4 w-full py-2.5 rounded-[var(--rs)] bg-rose-600 text-white
                       text-[13px] font-bold hover:brightness-110 transition">
            Got it
          </button>
        )}

        {/* M50 — Confirm-cash action row. Yes flips the job to paid (and
            credits the partner wallet for labour+tip). No marks the cash
            payment failed so the customer can try another method. */}
        {isCashPending && (
          <div className="mt-4 flex gap-2">
            <button onClick={() => respondCash(false)} disabled={busy}
              className="flex-1 py-2.5 rounded-[var(--rs)] border border-border
                         bg-card text-[#b91c1c] text-[13px] font-bold
                         hover:border-[#ef4444] transition disabled:opacity-60">
              Not received
            </button>
            <button onClick={() => respondCash(true)} disabled={busy}
              className="flex-[2] py-2.5 rounded-[var(--rs)] bg-success text-white
                         text-[13px] font-bold hover:brightness-105 transition
                         disabled:opacity-60">
              {busy ? 'Confirming…' : `✓ Received ₹${amount}`}
            </button>
          </div>
        )}

        {!isResolved && (
          <div className="text-[10px] text-muted mt-4">
            🔒 Money is being verified with Razorpay — this usually takes a few seconds.
          </div>
        )}
      </div>
    </div>
  )
}
