// PartnerShareTripModal — partner-side trip-sharing.
//
// Mirrors the customer SafetyModal share pane: phone + optional name → SMS
// with a public tracking link. Recipient lands on the same /track/:token
// page (which already shows partner location), so no client-side change
// is required there.
//
// Mounted on PartnerWorkPage during travelling/arrived states.

import { useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import Loader from '@/components/Loader'

export default function PartnerShareTripModal ({ open, onClose, job }) {
  const dispatch = useDispatch()
  const [phone, setPhone]     = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy]       = useState(false)
  const [sharedUrl, setSharedUrl] = useState(null)
  const [sentVia, setSentVia] = useState(null)

  if (!open || !job) return null

  const reset = () => {
    setPhone(''); setContact('')
    setBusy(false); setSharedUrl(null); setSentVia(null)
  }
  const close = () => { reset(); onClose?.() }

  const sendShare = async () => {
    if (busy) return
    if (!phone.trim()) {
      dispatch(pushToast({ text: 'Enter a phone number first' }))
      return
    }
    setBusy(true)
    try {
      const r = await api.safetyPartnerShare({
        job_id:        job.id,
        contact_phone: phone.trim(),
        contact_name:  contact.trim() || null,
      })
      setSharedUrl(r.url || null)
      setSentVia(r?.sms?.sent ? 'sms' : 'manual')
      dispatch(pushToast({
        text: r?.sms?.sent
          ? `Live trip sent to ${contact.trim() || phone.trim()}`
          : 'Share link ready — copy it below',
      }))
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Could not share'
      dispatch(pushToast({ text: msg }))
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!sharedUrl) return
    try {
      if (navigator.share) {
        await navigator.share({ url: sharedUrl, text: 'Track my live trip' })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharedUrl)
        dispatch(pushToast({ text: 'Link copied to clipboard' }))
      }
    } catch { /* user cancelled native share */ }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/65 backdrop-blur-sm
                    flex items-center justify-center p-4 animate-fadeIn"
         onClick={close}>
      <div className="w-full max-w-[420px] bg-card border border-border rounded-[16px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="h-1 bg-accent w-full" />

        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] tracking-[0.5px] uppercase font-extrabold text-accent m-0">
                Safety
              </p>
              <h2 className="font-display text-[18px] font-extrabold text-text m-0 mt-1">
                Share my trip
              </h2>
              <p className="text-[12px] text-muted m-0 mt-0.5 leading-[1.5]">
                Let a family member follow your live location during this job.
              </p>
            </div>
            <button onClick={close}
              className="w-8 h-8 rounded-full bg-surface border border-border
                         flex items-center justify-center text-muted text-[12px]
                         hover:text-text transition">✕</button>
          </div>

          <p className="text-[11px] text-muted m-0 mb-3 leading-[1.5]">
            Sends an SMS with a tracking link they can open without an account.
            The link stops working when this job ends.
          </p>

          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.slice(0, 20))}
            placeholder="Phone number (with country code)"
            className="w-full bg-surface border border-border rounded-[8px]
                       px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                       focus:outline-none focus:border-accent" />
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value.slice(0, 60))}
            placeholder="Contact name (optional)"
            className="w-full bg-surface border border-border rounded-[8px]
                       px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                       focus:outline-none focus:border-accent mt-2" />

          <button onClick={sendShare} disabled={busy}
            className="w-full mt-3 bg-accent text-white text-[12.5px] font-bold
                       py-2.5 rounded-[8px] hover:brightness-90 transition
                       disabled:opacity-60 disabled:cursor-not-allowed">
            {busy
              ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Sending…</span>
              : 'Send tracking link →'}
          </button>

          {sharedUrl && (
            <div className="mt-3 bg-surface border border-border rounded-[8px] p-2.5">
              <p className="text-[10px] text-muted m-0 mb-1 uppercase tracking-[0.4px] font-bold">
                {sentVia === 'sms' ? 'SMS sent · also shareable below' : 'SMS not configured · share manually'}
              </p>
              <p className="text-[11px] text-text break-all m-0">{sharedUrl}</p>
              <button onClick={copyLink}
                className="w-full mt-2 bg-card border border-border text-text text-[12px] font-bold
                           py-2 rounded-[8px] hover:border-accent transition">
                {navigator.share ? 'Share via…' : 'Copy link'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
