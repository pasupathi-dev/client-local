// M67 — Self-serve resolutions strip for the customer's job detail page.
//
// Three actions in one collapsible card:
//   - Reschedule        (any active or completed job)
//   - Request refund    (paid jobs only; auto-issues ≤₹500 within 24h)
//   - Report no-show    (accepted / travelling / arrived jobs)
//
// Each action expands inline into a small form so we never leave the page.

import { useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import { bumpOpenCount } from '@/features/disputes/disputesSlice'

const ACTIVE_STATES   = ['accepted', 'priceConfirmed', 'travelling', 'arrived', 'working', 'completed']
const NOSHOW_STATES   = ['accepted', 'priceConfirmed', 'travelling', 'arrived']
const REFUND_STATES   = ['paid']

const AUTO_REFUND_MAX_RUPEES = 500
const AUTO_REFUND_WINDOW_MS  = 24 * 60 * 60 * 1000

function withinAutoRefundWindow (job) {
  if (job?.state !== 'paid' || !job?.paid_at) return false
  const t = new Date(job.paid_at).getTime()
  if (Number.isNaN(t)) return false
  return (Date.now() - t) <= AUTO_REFUND_WINDOW_MS
}

function ActionRow ({ icon, title, sub, open, onClick, danger }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition
                  ${open ? 'bg-surface' : 'bg-card hover:bg-surface'}
                  border-t border-border first:border-t-0`}>
      <span className="text-[18px] shrink-0 leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-bold ${danger ? 'text-[#dc2626]' : 'text-text'}`}>{title}</div>
        <div className="text-[11px] text-muted mt-0.5 leading-[1.4]">{sub}</div>
      </div>
      <span aria-hidden className={`text-muted text-[14px] transition-transform shrink-0
                                    ${open ? 'rotate-180' : ''}`}>▾</span>
    </button>
  )
}

function RescheduleForm ({ job, onClose }) {
  const dispatch = useDispatch()
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy || (!date && !slot && !note.trim())) return
    setBusy(true)
    try {
      await api.selfServeReschedule(job.id, { date, slot, note: note.trim() })
      dispatch(pushToast({ text: 'Sent — your partner will reply in chat' }))
      onClose?.()
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not send', type: 'error' }))
    } finally { setBusy(false) }
  }
  return (
    <div className="px-4 pb-4 bg-surface flex flex-col gap-2 border-t border-border">
      <div className="text-[10.5px] text-muted leading-[1.55]">
        We'll send your partner a request in chat. They can accept or propose a different time.
      </div>
      <div className="flex gap-2">
        <input type="date" value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input flex-1 text-[12px]" />
        <select value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="input flex-1 text-[12px]">
          <option value="">Any time</option>
          <option>Morning (8am–12pm)</option>
          <option>Afternoon (12pm–4pm)</option>
          <option>Evening (4pm–8pm)</option>
        </select>
      </div>
      <textarea value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder="Optional note (e.g. building access, parking)"
        rows={2}
        className="w-full bg-card border border-border rounded-[10px] px-3 py-2
                   text-[12px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent resize-none" />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={busy}
          className="text-[11.5px] font-bold px-3 py-1.5 rounded-full
                     border border-border bg-card text-muted hover:text-text transition
                     disabled:opacity-60">
          Cancel
        </button>
        <button onClick={submit} disabled={busy || (!date && !slot && !note.trim())}
          className="text-[11.5px] font-bold px-4 py-1.5 rounded-full
                     bg-accent text-white hover:brightness-90 transition
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </div>
  )
}

function RefundForm ({ job, onClose, onRefunded }) {
  const dispatch = useDispatch()
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const eligible = withinAutoRefundWindow(job)
    && Number(job.agreed_price || 0) <= AUTO_REFUND_MAX_RUPEES

  const submit = async () => {
    if (!reason.trim() || busy) return
    setBusy(true)
    try {
      const r = await api.selfServeRefund(job.id, { reason: reason.trim() })
      if (r?.auto) {
        dispatch(pushToast({ text: `Refund of ₹${r.refundAmount} issued` }))
      } else {
        dispatch(pushToast({ text: 'Sent to support — they\'ll review and follow up.' }))
        dispatch(bumpOpenCount(1))
      }
      onRefunded?.(r)
      onClose?.()
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not request refund', type: 'error' }))
    } finally { setBusy(false) }
  }

  return (
    <div className="px-4 pb-4 bg-surface flex flex-col gap-2 border-t border-border">
      <div className={`text-[10.5px] leading-[1.55] ${eligible ? 'text-success' : 'text-muted'}`}>
        {eligible
          ? `✓ Eligible for instant refund (under ₹${AUTO_REFUND_MAX_RUPEES}, within 24 hours of payment).`
          : `Auto-refund covers bills under ₹${AUTO_REFUND_MAX_RUPEES} within 24 hours of payment. Anything else goes to support for review.`}
      </div>
      <textarea value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 2000))}
        placeholder="Why do you want a refund?"
        rows={3}
        className="w-full bg-card border border-border rounded-[10px] px-3 py-2
                   text-[12.5px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent resize-none" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">{reason.length}/2000</span>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy}
            className="text-[11.5px] font-bold px-3 py-1.5 rounded-full
                       border border-border bg-card text-muted hover:text-text transition
                       disabled:opacity-60">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !reason.trim()}
            className="text-[11.5px] font-bold px-4 py-1.5 rounded-full
                       bg-accent text-white hover:brightness-90 transition
                       disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? 'Submitting…' : (eligible ? `Refund ₹${job.agreed_price}` : 'Send to support')}
          </button>
        </div>
      </div>
    </div>
  )
}

function NoShowForm ({ job, onClose }) {
  const dispatch = useDispatch()
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const submit = async () => {
    if (!reason.trim() || busy) return
    setBusy(true)
    try {
      await api.selfServeNoShow(job.id, { reason: reason.trim() })
      dispatch(pushToast({ text: 'No-show reported — our team will follow up' }))
      dispatch(bumpOpenCount(1))
      onClose?.()
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not report', type: 'error' }))
    } finally { setBusy(false) }
  }
  return (
    <div className="px-4 pb-4 bg-surface flex flex-col gap-2 border-t border-border">
      <div className="text-[10.5px] text-muted leading-[1.55]">
        Use this if your partner never showed up after accepting. We open a dispute and our team handles it.
      </div>
      <textarea value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 2000))}
        placeholder="What happened? When were they supposed to arrive?"
        rows={3}
        className="w-full bg-card border border-border rounded-[10px] px-3 py-2
                   text-[12.5px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent resize-none" />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={busy}
          className="text-[11.5px] font-bold px-3 py-1.5 rounded-full
                     border border-border bg-card text-muted hover:text-text transition
                     disabled:opacity-60">
          Cancel
        </button>
        <button onClick={submit} disabled={busy || !reason.trim()}
          className="text-[11.5px] font-bold px-4 py-1.5 rounded-full
                     bg-[#dc2626] text-white hover:brightness-110 transition
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? 'Submitting…' : 'Report no-show'}
        </button>
      </div>
    </div>
  )
}

// Default export — drop into UserJobDetailPage. Renders null for states
// where no self-serve action makes sense (cancelled, etc.).
export default function SelfServePanel ({ job }) {
  const [openId, setOpenId] = useState(null)
  if (!job?.id || !ACTIVE_STATES.includes(job.state)) return null

  const showReschedule = true
  const showRefund     = REFUND_STATES.includes(job.state)
  const showNoShow     = NOSHOW_STATES.includes(job.state)

  if (!showReschedule && !showRefund && !showNoShow) return null

  const toggle = (id) => setOpenId((cur) => cur === id ? null : id)

  return (
    <div className="mt-4 bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold text-muted">
          Need help?
        </div>
        <div className="text-[12px] text-muted leading-[1.55] mt-0.5">
          Quick fixes — no support ticket needed.
        </div>
      </div>

      {showReschedule && (
        <>
          <ActionRow icon="🔁" title="Reschedule"
            sub="Ask your partner to come at a different time."
            open={openId === 'reschedule'} onClick={() => toggle('reschedule')} />
          {openId === 'reschedule' && (
            <RescheduleForm job={job} onClose={() => setOpenId(null)} />
          )}
        </>
      )}

      {showRefund && (
        <>
          <ActionRow icon="💸" title={`Request a refund (< ₹${AUTO_REFUND_MAX_RUPEES})`}
            sub={`Instant for bills under ₹${AUTO_REFUND_MAX_RUPEES} within 24h. Otherwise our team reviews.`}
            open={openId === 'refund'} onClick={() => toggle('refund')} />
          {openId === 'refund' && (
            <RefundForm job={job}
              onClose={() => setOpenId(null)}
              onRefunded={() => setOpenId(null)} />
          )}
        </>
      )}

      {showNoShow && (
        <>
          <ActionRow icon="🚫" title="Report a no-show" danger
            sub="Partner accepted but never arrived."
            open={openId === 'no-show'} onClick={() => toggle('no-show')} />
          {openId === 'no-show' && (
            <NoShowForm job={job} onClose={() => setOpenId(null)} />
          )}
        </>
      )}
    </div>
  )
}
