// M68 — "Report this partner" button + reasons modal. Mounts on the
// customer-facing partner detail page.
//
// Independent of disputes (which are job-specific). If the customer has
// already flagged this partner in the last 24h we surface the existing
// flag's status as a banner instead of the button — the server enforces
// the same cooldown so a stale UI can't double-submit.

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import Loader from '@/components/Loader'

const REASONS = [
  { id: 'inappropriate',        label: 'Inappropriate behaviour' },
  { id: 'misleading',           label: 'Misleading profile' },
  { id: 'off_platform_payment', label: 'Asked for off-platform payment' },
  { id: 'other',                label: 'Other' },
]

const STATUS_TONE = {
  open:      { bg: '#fef3c7', fg: '#92400e', label: 'Under review' },
  reviewed:  { bg: '#dcfce7', fg: '#166534', label: 'Reviewed' },
  dismissed: { bg: '#f3f4f6', fg: '#374151', label: 'Closed' },
}

export default function ReportPartnerButton ({ partnerId }) {
  const dispatch = useDispatch()
  const [existing, setExisting] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [open, setOpen]         = useState(false)
  const [reason, setReason]     = useState('')
  const [note, setNote]         = useState('')
  const [busy, setBusy]         = useState(false)

  useEffect(() => {
    if (!partnerId) return
    let cancelled = false
    api.fetchMyPartnerFlag(partnerId)
      .then((r) => { if (!cancelled) setExisting(r?.flag || null) })
      .catch(() => { if (!cancelled) setExisting(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [partnerId])

  if (loading || !partnerId) return null

  // Existing flag — show banner instead of the button so the customer
  // knows the report is in flight. Hides the button regardless of status.
  if (existing) {
    const tone = STATUS_TONE[existing.status] || STATUS_TONE.open
    return (
      <div className="rounded-[12px] px-3.5 py-2.5 flex items-start gap-2.5 text-[12px]"
           style={{ background: tone.bg, color: tone.fg }}>
        <span aria-hidden className="leading-none text-[14px] mt-0.5">🚩</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold">You reported this partner</div>
          <div className="opacity-90 mt-0.5">
            Status: {tone.label}. Our team will follow up if needed.
          </div>
        </div>
      </div>
    )
  }

  const canSubmit = !!reason && (reason !== 'other' || note.trim().length > 0)

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    try {
      const r = await api.flagPartner(partnerId, {
        reason, note: note.trim() || null,
      })
      setExisting(r?.flag || null)
      setOpen(false); setReason(''); setNote('')
      dispatch(pushToast({ text: 'Reported — our team will review' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not report',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-[11.5px] font-semibold text-muted hover:text-[#dc2626] transition
                   inline-flex items-center gap-1">
        <span aria-hidden>🚩</span> Report this partner
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
                    Report this partner
                  </p>
                  <h2 className="font-display text-[17px] font-extrabold text-text m-0 mt-1">
                    What's the problem?
                  </h2>
                  <p className="text-[11.5px] text-muted m-0 mt-1 leading-[1.55]">
                    Reports go to our safety team. We never share your identity with the partner.
                  </p>
                </div>
                <button onClick={() => !busy && setOpen(false)}
                  className="w-8 h-8 rounded-full bg-surface border border-border
                             flex items-center justify-center text-muted text-[12px]
                             hover:text-text transition">✕</button>
              </div>

              <div className="flex flex-col gap-1.5 mt-3">
                {REASONS.map((r) => (
                  <label key={r.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px]
                                border cursor-pointer transition
                                ${reason === r.id
                                  ? 'bg-surface border-accent'
                                  : 'bg-card border-border hover:border-muted'}`}>
                    <input type="radio" name="report-reason"
                      value={r.id} checked={reason === r.id}
                      onChange={() => setReason(r.id)}
                      className="accent-accent" />
                    <span className="text-[12.5px] font-semibold text-text">{r.label}</span>
                  </label>
                ))}
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                placeholder={reason === 'other'
                  ? 'Required — tell us what happened…'
                  : 'Optional note (extra context helps us decide)…'}
                rows={3}
                className="w-full bg-surface border border-border rounded-[10px]
                           px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                           focus:outline-none focus:border-accent resize-none mt-3" />
              <p className="text-[10px] text-muted text-right m-0 mt-1">
                {note.length}/1000
              </p>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <button onClick={() => !busy && setOpen(false)} disabled={busy}
                  className="bg-card border border-border text-muted text-[12px] font-bold
                             py-2.5 rounded-[10px] hover:text-text transition
                             disabled:opacity-60">
                  Cancel
                </button>
                <button onClick={submit} disabled={busy || !canSubmit}
                  className="col-span-2 bg-[#dc2626] text-white text-[13px] font-bold
                             py-2.5 rounded-[10px] hover:brightness-110 transition
                             disabled:opacity-60 disabled:cursor-not-allowed
                             shadow-[0_4px_12px_rgba(220,38,38,0.3)]">
                  {busy
                    ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Reporting…</span>
                    : 'Submit report'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
