// H26 — address confirmation sheet shown before a request goes out.
// Renders the user's saved addresses + an "Add new" path, and resolves
// to the address string the request payload should carry.
//
// Usage:
//   const [open, setOpen] = useState(false)
//   <AddressConfirmSheet open={open}
//      currentAddress={resolved}
//      onClose={() => setOpen(false)}
//      onPick={(addr) => { setOpen(false); setResolved(addr) }} />

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from '@/services/api'

const COMMON_LABELS = ['Home', 'Office', 'Other']

export default function AddressConfirmSheet ({
  open, currentAddress, onClose, onPick,
}) {
  const [list, setList]   = useState([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding]   = useState(false)
  const [label, setLabel]     = useState('Home')
  const [addr,  setAddr]      = useState('')
  const [err,   setErr]       = useState('')
  const [busy,  setBusy]      = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.fetchSavedAddresses()
      .then((r) => setList(r.addresses || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const submitNew = async () => {
    const trimmed = addr.trim()
    if (!trimmed) { setErr('Please enter an address.'); return }
    setBusy(true)
    try {
      const r = await api.createSavedAddress({ label, address: trimmed })
      // The server returns the full row; pass only the address STRING to
      // the caller so it can be rendered directly. (Previously this
      // forwarded the whole row object and broke React rendering.)
      const addressString = r?.address?.address || trimmed
      onPick?.(addressString)
      setAdding(false)
      setAddr('')
      setErr('')
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Could not save')
    } finally { setBusy(false) }
  }

  return createPortal(
    <div onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose?.() }}
         className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center
                    bg-[rgba(10,15,30,0.55)] backdrop-blur-[3px] animate-pgIn">
      <div className="bg-card w-full sm:max-w-[460px] rounded-t-[20px] sm:rounded-[20px]
                      shadow-[0_-12px_40px_rgba(0,0,0,0.2)]
                      max-h-[88vh] overflow-y-auto animate-popIn">
        <div className="px-6 pt-5 pb-2 flex items-start gap-3">
          <div className="flex-1">
            <h2 className="font-display font-extrabold text-[16px] text-text">
              Send partner to…
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              Pick a saved address, or add a new one for this booking.
            </p>
          </div>
          <button onClick={onClose} disabled={busy}
            className="text-muted hover:text-text leading-none text-[18px]">✕</button>
        </div>

        {/* Saved addresses */}
        <div className="px-6 py-2">
          {loading && <div className="text-[12px] text-muted py-2">Loading…</div>}
          {!loading && list.length === 0 && !adding && (
            <div className="text-[12px] text-muted py-3">
              No saved addresses yet. Add one below.
            </div>
          )}
          {list.map((a) => {
            const matches = currentAddress && a.address === currentAddress
            return (
              <button key={a.id} type="button"
                onClick={() => onPick?.(a.address)}
                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-[var(--rs)]
                            border-[1.5px] transition mb-1.5
                            ${matches
                              ? 'border-accent bg-accent/5'
                              : 'border-border bg-card hover:border-muted'}`}>
                <span className="mt-0.5 text-[15px] leading-none">
                  {a.label === 'Home' ? '🏠' : a.label === 'Office' ? '🏢' : '📍'}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-bold text-text">
                    {a.label}
                    {a.is_default && <span className="ml-2 text-[10px] text-accent">default</span>}
                  </span>
                  <span className="block text-[12px] text-muted leading-[1.45] truncate">
                    {a.address}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Add new */}
        <div className="px-6 pb-5 pt-2">
          {!adding
            ? (
              <button onClick={() => setAdding(true)}
                className="w-full py-2.5 rounded-[var(--rs)] border border-dashed border-border
                           text-[13px] font-semibold text-text hover:border-accent hover:text-accent transition">
                + Add a new address
              </button>
            )
            : (
              <div className="bg-surface border border-border rounded-[var(--rs)] p-3">
                <div className="text-[10px] uppercase font-bold tracking-[0.5px] text-muted mb-1.5">
                  Label
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {COMMON_LABELS.map((l) => (
                    <button key={l} type="button" onClick={() => setLabel(l)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold
                                  border transition
                                  ${label === l
                                    ? 'border-accent bg-accent/10 text-accent'
                                    : 'border-border text-muted hover:border-muted'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <textarea value={addr} onChange={(e) => { setAddr(e.target.value); setErr('') }}
                  rows={3} maxLength={500}
                  placeholder="24, Lotus Ave, Anna Nagar, Madurai 625020"
                  className="w-full px-3 py-2 rounded-[var(--rs)] border border-border
                             bg-card text-[13px] text-text outline-none focus:border-accent
                             leading-[1.5] resize-none" />
                {err && <div className="text-[11px] text-[#ef4444] mt-1">{err}</div>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setAdding(false); setErr('') }}
                    disabled={busy}
                    className="flex-1 py-2 rounded-[var(--rs)] border border-border bg-card
                               text-text text-[12px] font-semibold hover:border-muted transition">
                    Cancel
                  </button>
                  <button onClick={submitNew} disabled={busy}
                    className="flex-[2] py-2 rounded-[var(--rs)] bg-accent text-white
                               text-[12px] font-bold hover:brightness-90 transition
                               disabled:opacity-60">
                    {busy ? 'Saving…' : 'Save & use'}
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
