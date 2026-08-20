// M76 — One-time prompt to add a trusted contact during the customer's
// first active job. Triggers when:
//   - role = customer + onboarding done
//   - there's an active job (selectActiveJob)
//   - the customer has ZERO trusted contacts
//   - they haven't dismissed this prompt in the last 30 days
//
// One-tap import from the device's contacts picker (Android Chrome
// supports navigator.contacts.select). On platforms without the picker we
// fall back to a manual name + phone form.
//
// Mounted globally inside <AppShell> so it can fire on any page during
// the active job — not just on the profile page.

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { selectIsAuthenticated } from '@/features/auth/authSlice'
import { selectProfile } from '@/features/profile/profileSlice'
import { selectMode, pushToast } from '@/features/app/appSlice'
import { selectActiveJob } from '@/features/jobs/jobsSlice'
import * as api from '@/services/api'
import Loader from '@/components/Loader'

const DISMISS_KEY  = 'sl_trusted_prompt_dismissed_at'
const DISMISS_DAYS = 30
const DISMISS_MS   = DISMISS_DAYS * 24 * 60 * 60 * 1000

const isValidPhone = (s) => /^\+?\d[\d\s-]{6,18}\d$/.test(String(s || '').trim())

// Some browsers expose navigator.contacts (Contacts Picker API) — Android
// Chrome is the main one today. The select() returns the requested fields
// for the contacts the user picks; we only ask for name + phone.
const hasContactsPicker = () =>
  typeof navigator !== 'undefined'
  && navigator.contacts
  && typeof navigator.contacts.select === 'function'

async function pickFromDevice () {
  if (!hasContactsPicker()) return null
  try {
    const picked = await navigator.contacts.select(['name', 'tel'], { multiple: false })
    const c = picked?.[0]
    if (!c) return null
    const name  = (c.name?.[0] || '').trim()
    const phone = (c.tel?.[0]  || '').trim()
    if (!name || !phone) return null
    return { name, phone }
  } catch {
    // User cancelled or browser denied — fall back to manual entry.
    return null
  }
}

function PromptBody ({ onClose, onSaved }) {
  const dispatch = useDispatch()
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy]   = useState(false)
  const supported = hasContactsPicker()

  const importFromPhone = async () => {
    if (busy) return
    setBusy(true)
    try {
      const c = await pickFromDevice()
      if (c) {
        setName(c.name)
        setPhone(c.phone)
      } else {
        dispatch(pushToast({ text: 'No contact picked' }))
      }
    } finally { setBusy(false) }
  }

  const save = async () => {
    const n = name.trim(); const p = phone.trim()
    if (!n || !isValidPhone(p)) {
      dispatch(pushToast({ text: 'Need a name and a valid phone number' }))
      return
    }
    setBusy(true)
    try {
      await api.createTrustedContact({ name: n, phone: p, is_default: true })
      dispatch(pushToast({ text: 'Trusted contact added' }))
      onSaved?.()
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not add contact',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  return (
    <div className="p-5">
      <div className="text-[24px] text-center mb-2">🛟</div>
      <p className="text-[11px] tracking-[0.5px] uppercase font-extrabold
                    text-muted text-center m-0">
        Stay safe
      </p>
      <h2 className="font-display text-[17px] font-extrabold text-text text-center m-0 mt-1">
        Add a trusted contact
      </h2>
      <p className="text-[12px] text-muted text-center m-0 mt-1 leading-[1.55]">
        We notify them during your jobs and they can track your live trip if
        you tap SOS. Takes 10 seconds.
      </p>

      {supported && (
        <button onClick={importFromPhone} disabled={busy}
          className="w-full mt-4 py-2.5 rounded-[10px] bg-card border border-border
                     text-[12.5px] font-bold text-text
                     hover:border-accent transition disabled:opacity-60
                     flex items-center justify-center gap-2">
          📒 Pick from phonebook
        </button>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 120))}
          placeholder="Name (e.g. Mom)"
          className="w-full bg-surface border border-border rounded-[10px]
                     px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                     focus:outline-none focus:border-accent" />
        <input
          type="tel" value={phone}
          onChange={(e) => setPhone(e.target.value.slice(0, 20))}
          placeholder="Phone (with +91)"
          className="w-full bg-surface border border-border rounded-[10px]
                     px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                     focus:outline-none focus:border-accent" />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <button onClick={onClose} disabled={busy}
          className="bg-card border border-border text-muted text-[12px] font-bold
                     py-2.5 rounded-[10px] hover:text-text transition
                     disabled:opacity-60">
          Not now
        </button>
        <button onClick={save} disabled={busy || !name.trim() || !isValidPhone(phone)}
          className="col-span-2 bg-accent text-white text-[13px] font-bold
                     py-2.5 rounded-[10px] hover:brightness-90 transition
                     disabled:opacity-50 disabled:cursor-not-allowed
                     shadow-[0_4px_12px_rgba(232,65,26,0.3)]">
          {busy
            ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Saving…</span>
            : 'Add contact'}
        </button>
      </div>
    </div>
  )
}

export default function TrustedContactPrompt () {
  const authed   = useSelector(selectIsAuthenticated)
  const mode     = useSelector(selectMode)
  const profile  = useSelector(selectProfile)
  const job      = useSelector(selectActiveJob)
  const nav      = useNavigate()
  const isCustomer = mode !== 'partner' && profile?.role !== 'partner'

  const [shouldShow, setShouldShow] = useState(false)

  // Check eligibility whenever the inputs change. We deliberately don't poll
  // — the trigger is the active job arriving, which already causes a state
  // change via Redux.
  useEffect(() => {
    if (!authed || !isCustomer || !profile?.onboarding_done || !job?.id) {
      setShouldShow(false)
      return
    }
    // Dismissal check first — saves the API call when the user has already
    // tapped "Not now" recently.
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (dismissedAt && (Date.now() - dismissedAt) < DISMISS_MS) {
      setShouldShow(false)
      return
    }
    let cancelled = false
    api.fetchTrustedContacts()
      .then((r) => {
        if (cancelled) return
        const list = r?.contacts || []
        setShouldShow(list.length === 0)
      })
      .catch(() => { /* silent — never block on this */ })
    return () => { cancelled = true }
  }, [authed, isCustomer, profile?.onboarding_done, job?.id])

  if (!shouldShow) return null

  const close = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setShouldShow(false)
  }
  const saved = () => {
    // Once they've added one, never re-prompt — we just clear the show flag
    // (next eligibility check will see list.length > 0 and stay false).
    setShouldShow(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9000] p-3 pointer-events-none animate-slideUp">
      <div className="pointer-events-auto max-w-[440px] mx-auto
                      bg-card border border-border rounded-[16px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="h-1 bg-accent w-full" />
        <PromptBody onClose={close} onSaved={saved} />
      </div>
    </div>
  )
}
