// SafetyModal — opens from the SOS button on the customer's active job.
// Two distinct paths:
//
//   1. Share live trip with a contact
//      Customer types a phone number (+ optional name) → server sends an
//      SMS with a public tracking link. If no SMS provider is configured
//      we still show the link so the user can copy / native-share it.
//
//   2. Emergency
//      Single big red button → POST /api/safety/sos → server records the
//      alert, notifies every admin via push + in-app + socket. Shows
//      confirmation + a "call your local emergency number" line.
//
// The two sections live side-by-side at md+, stacked on mobile.

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import Loader from '@/components/Loader'

export default function SafetyModal ({ open, onClose, job }) {
  const dispatch = useDispatch()
  const [phone, setPhone]       = useState('')
  const [contact, setContact]   = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [sosBusy, setSosBusy]   = useState(false)
  const [sosSent, setSosSent]   = useState(false)
  const [sharedUrl, setSharedUrl] = useState(null)
  const [shareSentVia, setShareSentVia] = useState(null)  // 'sms' | 'manual'

  // Saved trusted contacts — fetched lazily when the modal opens. Default
  // contact (if any) auto-fills the form so the partner can hit Send in
  // one tap. We re-fetch every open so a contact added in the meantime
  // shows up without a hard refresh.
  const [contacts, setContacts] = useState([])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.fetchTrustedContacts()
      .then((r) => {
        if (cancelled) return
        const list = r?.contacts || []
        setContacts(list)
        const def = list.find((c) => c.is_default)
        if (def) { setPhone(def.phone); setContact(def.name || '') }
      })
      .catch(() => { if (!cancelled) setContacts([]) })
    return () => { cancelled = true }
  }, [open])

  if (!open || !job) return null

  const useChip = (c) => {
    setPhone(c.phone)
    setContact(c.name || '')
  }

  const reset = () => {
    setPhone(''); setContact('')
    setShareBusy(false); setSosBusy(false); setSosSent(false)
    setSharedUrl(null); setShareSentVia(null)
  }
  const close = () => { reset(); onClose() }

  const sendShare = async () => {
    if (shareBusy) return
    if (!phone.trim()) {
      dispatch(pushToast({ text: 'Enter a phone number first' }))
      return
    }
    setShareBusy(true)
    try {
      const r = await api.safetyShareTrip({
        job_id:        job.id,
        contact_phone: phone.trim(),
        contact_name:  contact.trim() || null,
      })
      setSharedUrl(r.url || null)
      setShareSentVia(r?.sms?.sent ? 'sms' : 'manual')
      dispatch(pushToast({
        text: r?.sms?.sent
          ? `Live trip sent to ${contact.trim() || phone.trim()}`
          : 'Share link ready — copy it below',
      }))
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Could not share'
      dispatch(pushToast({ text: msg }))
    } finally {
      setShareBusy(false)
    }
  }

  const copyLink = async () => {
    if (!sharedUrl) return
    try {
      if (navigator.share) {
        await navigator.share({ url: sharedUrl, text: 'Track my service trip live' })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharedUrl)
        dispatch(pushToast({ text: 'Link copied to clipboard' }))
      }
    } catch { /* user cancelled native share */ }
  }

  const fireSos = async () => {
    if (sosBusy || sosSent) return
    setSosBusy(true)
    let coords = null
    try {
      // Best-effort coords — don't block on permission denial.
      const pos = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null)
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          ()  => resolve(null),
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 },
        )
      })
      if (pos?.coords) coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch { /* ignore */ }

    try {
      await api.safetySos({ job_id: job.id, ...(coords || {}) })
      setSosSent(true)
      dispatch(pushToast({ text: 'Help notified · stay safe' }))
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Could not send SOS'
      dispatch(pushToast({ text: msg }))
    } finally {
      setSosBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/65 backdrop-blur-sm
                    flex items-center justify-center p-4 animate-fadeIn"
         onClick={close}>
      <div className="w-full max-w-[640px] bg-card border border-border rounded-[16px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden"
           onClick={(e) => e.stopPropagation()}>

        <div className="h-1 bg-[#dc2626] w-full" />

        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] tracking-[0.5px] uppercase font-extrabold text-[#dc2626] m-0">
                Safety
              </p>
              <h2 className="font-display text-[18px] font-extrabold text-text m-0 mt-1">
                Get help fast
              </h2>
              <p className="text-[12px] text-muted m-0 mt-0.5 leading-[1.5]">
                During an active trip with {job.partner_name || 'your pro'}.
              </p>
            </div>
            <button onClick={close}
              className="w-8 h-8 rounded-full bg-surface border border-border
                         flex items-center justify-center text-muted text-[12px]
                         hover:text-text transition">✕</button>
          </div>

          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">

            {/* ── Share live trip ─────────────────────────────── */}
            <section className="bg-card border border-border rounded-[12px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[18px]">📍</span>
                <p className="text-[13px] font-bold text-text m-0">Share live trip</p>
              </div>
              <p className="text-[11px] text-muted m-0 mb-3 leading-[1.5]">
                Sends a tracking link to a friend or family member by SMS.
                They'll see your pro's live location on a map until the trip ends.
              </p>

              {/* Saved trusted contacts as one-tap chips. Tapping a chip
                  fills the form below; the user can still adjust before
                  Send if they want. Default contact is highlighted. */}
              {contacts.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted uppercase tracking-[0.4px] font-bold m-0 mb-1.5">
                    Saved contacts
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {contacts.map((c) => {
                      const active = phone === c.phone
                      return (
                        <button key={c.id} type="button" onClick={() => useChip(c)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                                      text-[11px] font-bold border transition
                                      ${active
                                        ? 'bg-accent border-accent text-white shadow-[0_3px_10px_rgba(232,65,26,0.3)]'
                                        : 'bg-surface border-border text-text hover:border-accent hover:text-accent'}`}>
                          {c.is_default && <span aria-hidden>⭐</span>}
                          <span className="truncate max-w-[140px]">{c.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

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

              <button onClick={sendShare} disabled={shareBusy}
                className="w-full mt-3 bg-accent text-white text-[12.5px] font-bold
                           py-2.5 rounded-[8px] hover:brightness-90 transition
                           disabled:opacity-60 disabled:cursor-not-allowed">
                {shareBusy
                  ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Sending…</span>
                  : 'Send tracking link →'}
              </button>

              {sharedUrl && (
                <div className="mt-3 bg-surface border border-border rounded-[8px] p-2.5">
                  <p className="text-[10px] text-muted m-0 mb-1 uppercase tracking-[0.4px] font-bold">
                    {shareSentVia === 'sms' ? 'SMS sent · also shareable below' : 'SMS not configured · share manually'}
                  </p>
                  <p className="text-[11px] text-text break-all m-0">{sharedUrl}</p>
                  <button onClick={copyLink}
                    className="w-full mt-2 bg-card border border-border text-text text-[12px] font-bold
                               py-2 rounded-[8px] hover:border-accent transition">
                    {navigator.share ? 'Share via…' : 'Copy link'}
                  </button>
                </div>
              )}
            </section>

            {/* ── Emergency ───────────────────────────────────── */}
            <section className="rounded-[12px] p-4 text-white"
                     style={{ background: '#7f1d1d' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[18px]">🚨</span>
                <p className="text-[13px] font-bold m-0">Emergency</p>
              </div>
              <p className="text-[11px] m-0 mb-3 leading-[1.5]"
                 style={{ color: 'rgba(255,255,255,0.8)' }}>
                Pressing this notifies our admin team immediately with your job
                details and last-known location. For life-threatening
                emergencies, also dial your local emergency number (112 in India).
              </p>

              {sosSent ? (
                <div className="bg-white/10 border border-white/20 rounded-[8px] p-3 text-center">
                  <p className="text-[12px] font-extrabold m-0">✓ SOS sent</p>
                  <p className="text-[11px] m-0 mt-1"
                     style={{ color: 'rgba(255,255,255,0.75)' }}>
                    Our team has been notified. Stay where you are if it's safe to.
                  </p>
                  <a href="tel:112"
                     className="mt-3 inline-block bg-white text-[#7f1d1d] text-[12px] font-bold
                                px-4 py-2 rounded-[8px]">
                    📞 Call 112
                  </a>
                </div>
              ) : (
                <>
                  <button onClick={fireSos} disabled={sosBusy}
                    className="w-full bg-[#dc2626] text-white text-[14px] font-extrabold
                               py-3 rounded-[8px] hover:brightness-110 transition
                               disabled:opacity-60 disabled:cursor-not-allowed
                               shadow-[0_4px_16px_rgba(220,38,38,0.45)]">
                    {sosBusy
                      ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Sending SOS…</span>
                      : '🚨 Send SOS to admin team'}
                  </button>
                  <a href="tel:112"
                     className="block mt-2 text-center bg-white/10 border border-white/20
                                text-white text-[12px] font-bold
                                py-2.5 rounded-[8px] hover:bg-white/20 transition">
                    📞 Or call 112 directly
                  </a>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
