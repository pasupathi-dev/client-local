// H33 — Partner-side decline reason picker. Five chips per the spec.
// Submits { reason, note } back to the caller, which forwards to the
// /requests/:id/decline endpoint.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const REASONS = [
  'Busy now',
  'Too far',
  'Out of scope',
  'Equipment needed',
  'Other',
]

export default function DeclineReasonSheet ({
  open, busy = false, onClose, onConfirm,
}) {
  const [reason, setReason] = useState('')
  const [note, setNote]     = useState('')

  useEffect(() => {
    if (open) { setReason(''); setNote('') }
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  // We allow declining without picking a chip — it's a soft signal, not a
  // hard requirement. The note is bonus context for admins.
  const submit = () => onConfirm?.({ reason: reason || null, note: note.trim() || null })

  return createPortal(
    <div onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose?.() }}
         className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center
                    bg-[rgba(10,15,30,0.55)] backdrop-blur-[3px] animate-pgIn">
      <div className="bg-card w-full sm:max-w-[400px] rounded-t-[20px] sm:rounded-[20px]
                      shadow-[0_-12px_40px_rgba(0,0,0,0.2)] animate-popIn">
        <div className="px-6 pt-5 pb-3">
          <h2 className="font-display font-extrabold text-[16px] text-text">
            Why are you declining?
          </h2>
          <p className="text-[12px] text-muted mt-0.5">
            We use this to match you with better-fitting requests next time.
          </p>
        </div>

        <div className="px-6 pb-2 flex flex-col gap-1.5">
          {REASONS.map((r) => {
            const on = reason === r
            return (
              <button key={r} type="button"
                onClick={() => setReason(r)}
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

        <div className="px-6 pb-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 400))}
            rows={2} placeholder="Add a note (optional)"
            className="w-full px-3 py-2 rounded-[var(--rs)] border border-border bg-surface
                       text-[13px] text-text outline-none focus:border-accent resize-none" />
          <div className="text-right text-[10px] text-muted">{note.length}/400</div>
        </div>

        <div className="flex gap-2 px-6 pb-5 pt-1">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2.5 rounded-[var(--rs)] border border-border bg-card
                       text-text text-[13px] font-semibold hover:border-muted transition
                       disabled:opacity-60">
            Keep
          </button>
          <button onClick={submit} disabled={busy}
            className="flex-[2] py-2.5 rounded-[var(--rs)] bg-[#ef4444] text-white
                       text-[13px] font-bold hover:brightness-90 transition
                       disabled:opacity-60">
            {busy ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
