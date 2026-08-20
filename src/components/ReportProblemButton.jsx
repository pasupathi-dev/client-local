// ReportProblemButton — drop into a job-detail screen for either side of
// a paid/completed job. Fetches the current dispute (if any) and renders:
//   - nothing while the job state isn't flaggable
//   - a status banner if a dispute already exists
//   - a "Report a problem" CTA + reason modal otherwise
//
// Wraps its own state — the parent just hands over the job.

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import { bumpOpenCount } from '@/features/disputes/disputesSlice'
import Loader from '@/components/Loader'

const FLAGGABLE = ['paid', 'completed']
// H66 — the dispute window closes 48h after the customer paid. Server
// enforces this; the client mirrors it so we don't show a CTA that's about
// to 409. `completed`-but-unpaid jobs stay flaggable regardless (no clock
// to base the window off yet).
const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000
const isWithinDisputeWindow = (job) => {
  if (job?.state !== 'paid') return true
  if (!job?.paid_at) return true
  const paidAt = new Date(job.paid_at).getTime()
  if (Number.isNaN(paidAt)) return true
  return (Date.now() - paidAt) <= DISPUTE_WINDOW_MS
}

const STATUS_TONE = {
  open:      { bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b', label: 'Open' },
  resolved:  { bg: '#dcfce7', fg: '#166534', dot: '#16a34a', label: 'Resolved' },
  dismissed: { bg: '#f3f4f6', fg: '#374151', dot: '#9ca3af', label: 'Dismissed' },
}

export default function ReportProblemButton ({ job }) {
  const dispatch = useDispatch()
  const [dispute, setDispute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState(false)
  const [reason, setReason]   = useState('')
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    if (!job?.id || !FLAGGABLE.includes(job.state)) { setLoading(false); return }
    let cancelled = false
    api.fetchJobDispute(job.id)
      .then((r) => { if (!cancelled) setDispute(r?.dispute || null) })
      .catch(() => { if (!cancelled) setDispute(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [job?.id, job?.state])

  if (!job?.id || !FLAGGABLE.includes(job.state)) return null
  if (loading) return null

  // H66 — past the 48h window AND no existing dispute → swap CTA for a
  // short notice. If a dispute already exists we still render its banner
  // (handled below) regardless of how old the job is.
  if (!dispute && !isWithinDisputeWindow(job)) {
    return (
      <div className="rounded-[12px] border border-border bg-surface px-4 py-3 text-[12px] text-muted leading-[1.55]">
        The 48-hour window to dispute this job has passed.
        Need help anyway? Tap <span className="font-bold text-text">Help &amp; Support</span> from your profile.
      </div>
    )
  }

  // Existing open / resolved dispute → render a status banner instead of the CTA.
  if (dispute) {
    const tone = STATUS_TONE[dispute.status] || STATUS_TONE.open
    return (
      <div className="rounded-[12px] border px-4 py-3 flex items-start gap-3"
           style={{ background: tone.bg, borderColor: tone.fg + '33', color: tone.fg }}>
        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0"
              style={{ background: tone.dot }} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[13px] m-0">
            Dispute · {tone.label}
          </p>
          <p className="text-[11px] m-0 mt-0.5 leading-[1.55] opacity-90">
            {dispute.status === 'open'
              ? 'Our team is reviewing. We\'ll notify you when there\'s an update.'
              : (dispute.resolution_note || `Closed as: ${dispute.resolution || 'resolved'}.`)}
          </p>
        </div>
      </div>
    )
  }

  const submit = async () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      dispatch(pushToast({ text: 'Please describe the problem' }))
      return
    }
    if (busy) return
    setBusy(true)
    try {
      const r = await api.createDispute({ job_id: job.id, reason: trimmed })
      setDispute(r?.dispute || null)
      setOpen(false)
      setReason('')
      // Bump the local nav badge immediately — the push that fires for
      // dispute:opened only reaches the OTHER party, not the raiser.
      dispatch(bumpOpenCount(1))
      dispatch(pushToast({ text: 'Dispute filed — our team will review it' }))
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Could not file dispute'
      dispatch(pushToast({ text: msg }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full bg-card border border-border text-text text-[13px] font-bold
                   py-2.5 rounded-[10px] hover:border-[#dc2626] hover:text-[#dc2626]
                   transition flex items-center justify-center gap-1.5">
        ⚠️ Report a problem
      </button>

      {open && (
        <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm
                        flex items-center justify-center p-4 animate-fadeIn"
             onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-[460px] bg-card border border-border rounded-[16px]
                          shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden"
               onClick={(e) => e.stopPropagation()}>
            <div className="h-1 bg-[#dc2626] w-full" />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[11px] tracking-[0.5px] uppercase font-extrabold text-[#dc2626] m-0">
                    Report a problem
                  </p>
                  <h2 className="font-display text-[18px] font-extrabold text-text m-0 mt-1">
                    {job.service}
                  </h2>
                  <p className="text-[12px] text-muted m-0 mt-0.5">
                    Job #{job.id} · ₹{job.agreed_price}
                  </p>
                </div>
                <button onClick={() => !busy && setOpen(false)}
                  className="w-8 h-8 rounded-full bg-surface border border-border
                             flex items-center justify-center text-muted text-[12px]
                             hover:text-text transition">✕</button>
              </div>

              <p className="text-[12px] text-muted leading-[1.55] m-0 mb-2">
                Tell our team what went wrong. Be specific — this helps us
                resolve faster (refund, warning, or follow-up).
              </p>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 2000))}
                placeholder="Describe the issue…"
                rows={5}
                className="w-full bg-surface border border-border rounded-[10px]
                           px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                           focus:outline-none focus:border-accent resize-none" />
              <p className="text-[10px] text-muted text-right m-0 mt-1">
                {reason.length}/2000
              </p>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <button onClick={() => !busy && setOpen(false)} disabled={busy}
                  className="bg-card border border-border text-muted text-[12px] font-bold
                             py-2.5 rounded-[10px] hover:text-text transition
                             disabled:opacity-60">
                  Cancel
                </button>
                <button onClick={submit} disabled={busy || !reason.trim()}
                  className="col-span-2 bg-[#dc2626] text-white text-[13px] font-bold
                             py-2.5 rounded-[10px] hover:brightness-110 transition
                             disabled:opacity-60 disabled:cursor-not-allowed
                             shadow-[0_4px_12px_rgba(220,38,38,0.3)]">
                  {busy
                    ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Filing…</span>
                    : 'File dispute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
