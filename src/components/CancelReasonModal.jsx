// Shared cancel-reason picker used by both the user (MyJobsPage) and partner
// (PartnerWorkPage) sides. Enforces a predefined reason + a non-empty free
// text note so the other party always gets actionable context.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSelector } from 'react-redux'
import { selectFreeCancelWindowSec } from '@/features/config/configSlice'

// M29 — five chips per the booking-flow spec. The free-text note below is
// still required so the analytics dashboard has both a normalised reason
// and the verbatim detail. Order biased toward the most common signals so
// users hit one fewer scroll on mobile.
const USER_REASONS = [
  'Found someone else',
  'Price too high',
  'Wrong service',
  'Personal reason',
  'Other',
]

const PARTNER_REASONS = [
  'Customer unreachable',
  'Wrong address / location',
  'Scope changed unexpectedly',
  'Personal emergency',
  'Unable to complete safely',
  'Duplicate booking',
  'Other',
]

// H27 — free-cancellation window settings (mirror the server's). The window
// + fee are admin-tunable via app_config; we read them from configSlice and
// fall back to the original 90s / ₹50 if config hasn't loaded yet.
const FREE_WINDOW_SECONDS_FALLBACK = 90
const FLAT_FEE_INR = 50

export default function CancelReasonModal ({
  open, role = 'user', busy = false, acceptedAt = null, onClose, onConfirm,
}) {
  const reasons = role === 'partner' ? PARTNER_REASONS : USER_REASONS
  const FREE_WINDOW_SECONDS = useSelector(selectFreeCancelWindowSec) || FREE_WINDOW_SECONDS_FALLBACK
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [feeAck, setFeeAck] = useState(false)
  // Live countdown — only meaningful for customer cancel; partners aren't
  // charged this fee. We tick at 1 Hz which is plenty for a "X seconds left"
  // banner and doesn't burn battery.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [open])
  const secondsSinceAccept = (() => {
    if (!acceptedAt) return null
    return Math.max(0, Math.floor((Date.now() - new Date(acceptedAt).getTime()) / 1000))
  })()
  const withinFreeWindow = role === 'user'
    && secondsSinceAccept != null
    && secondsSinceAccept <= FREE_WINDOW_SECONDS
  const freeSecondsLeft = withinFreeWindow
    ? Math.max(0, FREE_WINDOW_SECONDS - secondsSinceAccept)
    : 0
  const feeApplies = role === 'user' && acceptedAt && !withinFreeWindow

  useEffect(() => {
    if (open) { setReason(''); setNote(''); setErr(''); setFeeAck(false) }
  }, [open])
  // Reset fee-ack whenever the user changes reason — they should reconfirm.
  useEffect(() => { setFeeAck(false) }, [reason])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const submit = () => {
    if (!reason) { setErr('Please pick a reason.'); return }
    if (!note.trim()) { setErr('Please add a short note so the other party understands.'); return }
    // H27 — after the 90s free window, the customer must tick the fee-ack
    // checkbox before we submit. The thunk also receives confirm_fee=true
    // so the server proceeds without bouncing for confirmation.
    if (feeApplies && !feeAck) {
      setErr(`This cancellation costs ₹${FLAT_FEE_INR}. Please confirm to proceed.`)
      return
    }
    onConfirm?.({ reason, note: note.trim(), confirm_fee: feeApplies })
  }

  return createPortal(
    <div onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose?.() }}
         className="fixed inset-0 z-[9999] grid place-items-center p-4
                    bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] animate-pgIn">
      <div className="bg-card rounded-[20px] w-full max-w-[460px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-popIn
                      max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-3">
          <div className="text-center text-[32px] mb-1">⚠️</div>
          <h2 className="font-display font-extrabold text-lg text-text text-center">
            Cancel this job?
          </h2>
          <p className="text-[12px] text-muted text-center leading-[1.55] mt-1">
            Cancelling is final. The other party will be notified instantly.
          </p>
          {/* H27 — Customer-only free-cancel countdown / fee warning. */}
          {withinFreeWindow && (
            <div className="mt-3 rounded-[var(--rs)] bg-[#dcfce7] dark:bg-[#064e3b]/60
                            border border-[#a7f3d0] dark:border-[#065f46]
                            px-3 py-2 text-center">
              <div className="text-[11px] font-bold text-[#065f46] dark:text-[#86efac]">
                Free cancel for {freeSecondsLeft}s
              </div>
              <div className="text-[10px] text-[#065f46]/85 dark:text-[#86efac]/80 mt-0.5">
                Cancel within this window and pay nothing.
              </div>
            </div>
          )}
          {feeApplies && (
            <div className="mt-3 rounded-[var(--rs)] bg-[#fef3c7] dark:bg-[#451a03]
                            border border-[#fcd34d] dark:border-[#92400e]
                            px-3 py-2">
              <div className="text-[11px] font-bold text-[#92400e] dark:text-[#fbbf24]">
                ₹{FLAT_FEE_INR} cancellation fee will apply
              </div>
              <div className="text-[10px] text-[#92400e]/85 dark:text-[#fbbf24]/80 mt-0.5">
                Free-cancel window passed ({Math.floor(secondsSinceAccept / 60)}m ago).
              </div>
            </div>
          )}
          {/* Touch the tick state so lint sees it used. The countdown
              banner above depends on a render each second. */}
          <span className="sr-only" aria-live="polite">{tick}</span>
        </div>

        <div className="px-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mb-2">
            Why are you cancelling?
          </div>
          <div className="flex flex-col gap-1.5 mb-4">
            {reasons.map((r) => {
              const on = reason === r
              return (
                <button key={r} type="button"
                  onClick={() => { setReason(r); setErr('') }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-[var(--rs)]
                              border-[1.5px] text-left text-[13px] transition
                              ${on
                                ? 'border-accent bg-accent/5 text-text font-semibold'
                                : 'border-border bg-card text-text hover:border-muted'}`}>
                  <span className={`w-4 h-4 rounded-full border-[2px] grid place-items-center shrink-0
                                    ${on ? 'border-accent' : 'border-border'}`}>
                    {on && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                  <span className="flex-1 min-w-0">{r}</span>
                </button>
              )
            })}
          </div>

          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mb-2">
            Add a short note <span className="text-[#ef4444] normal-case font-semibold">(required)</span>
          </div>
          <textarea value={note} onChange={(e) => { setNote(e.target.value); setErr('') }}
            rows={3} maxLength={400} placeholder="Tell us a bit more so we can improve…"
            className="w-full px-3 py-2 rounded-[var(--rs)] border-[1.5px] border-border
                       bg-surface text-[13px] text-text leading-[1.5] outline-none
                       focus:border-accent transition resize-none" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-[#ef4444] min-h-[16px]">{err}</span>
            <span className="text-[10px] text-muted">{note.length}/400</span>
          </div>

          {/* H27 — explicit fee acknowledgement when the free window has
              elapsed. Required before the submit handler will fire. */}
          {feeApplies && (
            <label className="mt-2 flex items-start gap-2 text-[12px] text-text cursor-pointer select-none">
              <input type="checkbox" checked={feeAck}
                onChange={(e) => setFeeAck(e.target.checked)}
                className="mt-[3px] accent-accent" />
              <span>I understand a ₹{FLAT_FEE_INR} cancellation fee will apply.</span>
            </label>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-2">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                       bg-card text-text text-[13px] font-semibold hover:border-muted transition
                       disabled:opacity-60">
            Keep Job
          </button>
          <button onClick={submit} disabled={busy}
            className="flex-[2] py-2.5 rounded-[var(--rs)] bg-[#ef4444] text-white
                       text-[13px] font-bold shadow-[0_4px_16px_rgba(239,68,68,0.35)]
                       hover:brightness-90 transition disabled:opacity-60">
            {busy ? 'Cancelling…' : 'Yes, Cancel Job'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
