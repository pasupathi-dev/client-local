// Partner Active Job — pixel-matches local.html#page-p-work + #page-p-completed.
//
// One page, two modes:
//   state ∈ [accepted..working]  → 3-tab work screen (Progress · Chat · Customer)
//   state === 'completed'        → Completed / Awaiting Payment summary screen
//
// Right sidebar (desktop) / sticky card (mobile) drives the state machine:
//   accepted       → Update Price + [test] Customer Confirms Price
//   priceConfirmed → Navigate to Customer
//   travelling     → Reached Customer
//   arrived        → (auto-advances to working — no separate button)
//   working        → Mark as Complete
//   completed      → Awaiting Payment (payment summary view takes over)
//   paid           → Done — redirect back to dashboard
//
// All transitions go through /api/jobs/:id/state so the server-side state
// machine (accepted → priceConfirmed → … → paid) stays authoritative.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  fetchActiveJobThunk, setStateThunk, proposePriceThunk, cancelJobThunk,
  selectActiveJob, clearActive,
} from '@/features/jobs/jobsSlice'
import { toggleOnlineThunk } from '@/features/partner/partnerSlice'
import { formatDistance, formatPrice } from '@/utils/format'
import { getSocket } from '@/services/socket'
import CancelReasonModal from '@/components/CancelReasonModal'
import { pushToast } from '@/features/app/appSlice'
import useLiveLocationStream from '@/hooks/useLiveLocationStream'
import useGeofenceArrival from '@/hooks/useGeofenceArrival'
import PartnerShareTripModal from '@/components/PartnerShareTripModal'
import ExtraWorkSummary from '@/components/ExtraWorkSummary'
import * as api from '@/services/api'
import { resolveAssetUrl } from '@/constants/api'

// ── Constants ─────────────────────────────────────────────────────
// Happy-path sequence. "cancelled" is treated as step 7 outside this array —
// stepIndex() below maps it to 6 so the stepper can show it as a terminal
// red row while leaving the 0..5 progress intact.
const STEPS = ['accepted','priceConfirmed','travelling','arrived','working','completed']
const stepIndex = (state) => state === 'cancelled' ? 6 : STEPS.indexOf(state)

// Per-phase sidebar card + button config. Mirrors local.html:6744-6787.
const NEXT_STEP_INFO = {
  accepted: {
    step: 1, icon: '💬',
    title: 'Awaiting Price Confirmation',
    desc:  'Discuss the price with the customer via chat or call. Once they accept the agreed amount, the next step will unlock.',
    tip:   '💡 Tip: Use the Chat tab to negotiate quickly with the customer.',
    badgeBg: '#fef3c7', badgeFg: '#92400e',
  },
  priceConfirmed: {
    step: 2, icon: '🚗',
    title: 'Ready to Travel',
    desc:  'Price is confirmed. When you leave for the job, mark yourself as travelling so the customer can track progress.',
    tip:   '💡 Tip: Check the customer address in the Customer tab before heading out.',
    badgeBg: '#dbeafe', badgeFg: '#1e40af',
  },
  travelling: {
    step: 3, icon: '🗺️',
    title: 'On the Way',
    desc:  "You're en route to the customer. Tap below as soon as you arrive.",
    tip:   '💡 Tip: Drive safe — the customer can see your status in real time.',
    badgeBg: '#dbeafe', badgeFg: '#1e40af',
  },
  arrived: {
    step: 4, icon: '📍',
    title: 'Arrived at Location',
    desc:  "You've reached the customer. Confirm the scope of work, then start.",
    tip:   '💡 Tip: Confirm pricing and scope before starting the work.',
    badgeBg: '#ede9fe', badgeFg: '#6d28d9',
  },
  working: {
    step: 5, icon: '🔨',
    title: 'Work in Progress',
    desc:  'Finish the work, then mark it complete. The customer will be notified to make payment.',
    tip:   '💡 Tip: Show the finished work to the customer before marking complete.',
    badgeBg: '#dbeafe', badgeFg: '#1e40af',
  },
  completed: {
    step: 6, icon: '✅',
    title: 'Work Completed',
    desc:  'Waiting for the customer to pay. Stay on this page until the payment confirms.',
    tip:   '💡 Tip: The wallet updates automatically once payment settles.',
    badgeBg: '#dcfce7', badgeFg: '#166534',
  },
  cancelled: {
    step: 7, icon: '✖',
    title: 'Job Cancelled',
    desc:  'This job was cancelled. Head back to the dashboard to pick up new requests.',
    tip:   '',
    badgeBg: '#fee2e2', badgeFg: '#b91c1c',
  },
}

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}

// Last-resort click handler: attaches a NATIVE DOM `click` listener via
// useEffect + ref, bypassing React's synthetic event delegation completely.
// We also defer the activation by one tick (setTimeout 0) so the current
// click event is fully resolved before a portal modal mounts — otherwise
// the synthesized click on touch can bleed through to the new modal's
// backdrop and close it immediately ("click-through" bug).
function NativeClickButton ({ onActivate, label, className }) {
  const ref = useRef(null)
  // Keep the latest onActivate in a ref so the native listener (attached
  // once) always calls the current handler, even after re-renders give
  // us a new function identity.
  const handlerRef = useRef(onActivate)
  useEffect(() => { handlerRef.current = onActivate }, [onActivate])
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const fire = (e) => {
      e.stopPropagation()
      e.preventDefault()
      // eslint-disable-next-line no-console
      console.log('[NativeClickButton] fired via', e.type, label, 'handler?', typeof handlerRef.current)
      // Defer so any in-flight pointer/touch event finishes draining
      // before the modal mounts. Without this, a touch-screen tap on the
      // button can synthesize a click whose final coords land on top of
      // the freshly-mounted modal backdrop, which then auto-closes the
      // modal as if the user tapped outside.
      setTimeout(() => {
        if (typeof handlerRef.current === 'function') {
          // eslint-disable-next-line no-console
          console.log('[NativeClickButton] calling handler for', label)
          handlerRef.current()
        } else {
          // eslint-disable-next-line no-console
          console.warn('[NativeClickButton] handler missing for', label)
        }
      }, 0)
    }
    el.addEventListener('click', fire)
    return () => {
      el.removeEventListener('click', fire)
    }
  }, [label])
  return (
    <button ref={ref} type="button" className={className}>
      {label}
    </button>
  )
}

// L45 — Press-and-hold SOS for the partner. Opens the existing
// PartnerShareTripModal which shares the partner's live location with a
// trusted contact. Rewritten without `requestAnimationFrame` because the
// previous rAF loop on touchstart/preventDefault was suspected of
// starving pointer-event delivery to neighbouring buttons. The setTimeout
// version fires the activation after HOLD_MS without re-rendering 60×/s.
function PartnerSosLongPress ({ onActivate, onTap }) {
  const HOLD_MS = 1200
  const [holding, setHolding] = useState(false)
  const startRef = useRef(0)
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const start = () => {
    firedRef.current = false
    startRef.current = Date.now()
    setHolding(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      setHolding(false)
      onActivate?.()
    }, HOLD_MS)
  }
  const stop = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const wasShort = startRef.current > 0
      && Date.now() - startRef.current < HOLD_MS - 50
    setHolding(false)
    if (wasShort && !firedRef.current) onTap?.()
    startRef.current = 0
  }
  // Clean up on unmount so a held-button that never released doesn't
  // keep a stale timer alive.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])
  return (
    <button type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      aria-label="I feel unsafe (press and hold)"
      className={`relative shrink-0 inline-flex items-center justify-center gap-1.5
                  px-4 py-2.5 rounded-[var(--rs)] text-white font-bold text-[13px]
                  bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#7f1d1d]
                  shadow-[0_4px_14px_rgba(220,38,38,0.35)] transition-transform duration-150
                  touch-manipulation select-none
                  ${holding ? 'scale-105' : ''}`}>
      🚨 {holding ? 'Hold…' : 'SOS'}
    </button>
  )
}

// M43 — Before/after photo picker shown when the partner taps "Mark
// Complete". Up to 3 photos. Photos upload eagerly so the partner sees
// thumbnails before confirming. "Skip" completes without photos.
function CompletionPhotoModal ({ open, onClose, onConfirm }) {
  const inputRef = useRef(null)
  const [urls, setUrls] = useState([])
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  useEffect(() => { if (open) { setUrls([]); setErr(''); setBusy(false) } }, [open])
  if (!open) return null
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (urls.length >= 3) { setErr('Up to 3 photos.'); return }
    if (file.size > 5 * 1024 * 1024) { setErr('Photo must be under 5 MB.'); return }
    setBusy(true); setErr('')
    try {
      const r = await api.uploadJobPhoto(file)
      setUrls([...urls, r.url])
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2?.message || 'Upload failed')
    } finally { setBusy(false) }
  }
  const remove = (i) => setUrls(urls.filter((_, idx) => idx !== i))
  return createPortal(
    <div onClick={onClose}
         className="fixed inset-0 z-[9999] grid place-items-center p-4
                    bg-[rgba(10,15,30,0.55)] backdrop-blur-[3px] animate-pgIn">
      <div onClick={(e) => e.stopPropagation()}
           className="bg-card rounded-[20px] w-full max-w-[400px] p-6 animate-popIn">
        <div className="text-center mb-3">
          <div className="text-[36px] mb-1">📸</div>
          <h2 className="font-display font-extrabold text-[17px] text-text">
            Add a before/after photo?
          </h2>
          <p className="text-[12px] text-muted leading-[1.55] mt-1">
            Optional. The customer sees these on their job detail. Great work has receipts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {urls.map((u, i) => (
            <div key={u} className="relative w-20 h-20 rounded-md overflow-hidden border border-border">
              <img src={resolveAssetUrl(u)} alt={`Photo ${i + 1}`}
                   className="w-full h-full object-cover" />
              <button onClick={() => remove(i)} aria-label="Remove"
                className="absolute -top-1 -right-1 bg-card text-text rounded-full
                           w-5 h-5 text-[11px] font-bold border border-border
                           shadow-card grid place-items-center">×</button>
            </div>
          ))}
          {urls.length < 3 && (
            <button onClick={() => inputRef.current?.click()} disabled={busy}
              className="w-20 h-20 rounded-md border border-dashed border-border
                         grid place-items-center text-[24px] text-muted
                         hover:border-accent hover:text-accent transition disabled:opacity-60">
              {busy ? '…' : '+'}
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*"
            onChange={pick} className="hidden" />
        </div>
        {err && <div className="text-[12px] text-[#ef4444] text-center mb-2">{err}</div>}
        <div className="flex gap-2">
          <button onClick={() => onConfirm([])}
            className="flex-1 py-2.5 rounded-[var(--rs)] border border-border bg-card
                       text-text text-[13px] font-semibold hover:border-muted transition">
            Skip & complete
          </button>
          <button onClick={() => onConfirm(urls)} disabled={busy}
            className="flex-[2] py-2.5 rounded-[var(--rs)] bg-success text-white
                       text-[13px] font-bold hover:brightness-[1.05] transition
                       disabled:opacity-60">
            {urls.length ? `✓ Complete with ${urls.length} photo${urls.length > 1 ? 's' : ''}` : '✓ Complete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// M44 — Extra-work proposal sheet. Now busy-aware so a slow API call
// doesn't leave the partner staring at an unresponsive modal.
function ExtraWorkModal ({ open, onClose, onSubmit }) {
  const [desc, setDesc]   = useState('')
  const [price, setPrice] = useState('')
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)
  useEffect(() => {
    if (open) { setDesc(''); setPrice(''); setErr(''); setBusy(false) }
  }, [open])
  if (!open) return null
  const safeClose = () => { if (!busy) onClose?.() }
  const submit = async () => {
    if (busy) return
    const trimmed = desc.trim()
    const p = Number(price)
    if (!trimmed) { setErr('Describe the extra work briefly.'); return }
    if (!Number.isFinite(p) || p <= 0) { setErr('Enter a valid price.'); return }
    setBusy(true)
    try {
      // Hand the request to the parent. The parent's handler owns the
      // dispatch + toast; we just keep the modal's `busy` flag on long
      // enough that double-taps don't fire a second proposal.
      await onSubmit({ description: trimmed, extra_price: Math.round(p) })
    } catch { /* parent already toasted; we close either way */ }
    finally {
      // Close unconditionally — the user always wants the modal gone once
      // they've tapped Send. Errors surface via toast, not by hanging here.
      setBusy(false)
      onClose?.()
    }
  }
  return createPortal(
    <div onClick={safeClose}
         className="fixed inset-0 z-[9999] grid place-items-center p-4
                    bg-[rgba(10,15,30,0.55)] backdrop-blur-[3px] animate-pgIn">
      <div onClick={(e) => e.stopPropagation()}
           className="bg-card rounded-[20px] w-full max-w-[400px] p-6 animate-popIn">
        <div className="text-center mb-3">
          <div className="text-[34px] mb-1">➕</div>
          <h2 className="font-display font-extrabold text-[17px] text-text">
            Add extra work
          </h2>
          <p className="text-[12px] text-muted leading-[1.55] mt-1">
            Tell the customer what's needed and the extra price. They'll see Approve / Decline buttons in chat. One payment at the end.
          </p>
        </div>
        <label className="block text-[10px] uppercase tracking-[0.5px] font-bold text-muted mb-1">
          What's the extra work?
        </label>
        <input type="text" value={desc} onChange={(e) => { setDesc(e.target.value); setErr('') }}
          placeholder="e.g. Replace switchboard"
          maxLength={200}
          disabled={busy}
          className="w-full px-3 py-2 rounded-[var(--rs)] border border-border bg-surface
                     text-[13px] text-text outline-none focus:border-accent mb-3
                     disabled:opacity-60" />
        <label className="block text-[10px] uppercase tracking-[0.5px] font-bold text-muted mb-1">
          Extra price (₹)
        </label>
        <input type="number" inputMode="numeric" min={1} value={price}
          onChange={(e) => { setPrice(e.target.value); setErr('') }}
          placeholder="500"
          disabled={busy}
          className="w-full px-3 py-2 rounded-[var(--rs)] border border-border bg-surface
                     text-[13px] text-text outline-none focus:border-accent mb-2
                     disabled:opacity-60" />
        {err && <div className="text-[12px] text-[#ef4444] mb-2">{err}</div>}
        <div className="flex gap-2">
          <button onClick={safeClose} disabled={busy}
            className="flex-1 py-2.5 rounded-[var(--rs)] border border-border bg-card
                       text-text text-[13px] font-semibold hover:border-muted transition
                       disabled:opacity-60">
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            className="flex-[2] py-2.5 rounded-[var(--rs)] bg-accent text-white
                       text-[13px] font-bold hover:brightness-90 transition
                       disabled:opacity-60">
            {busy ? 'Sending…' : 'Send to customer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'C'

// "#SL-2024-0847" style short id — strips pseudo-UUID prefixes if server stores them.
const shortId = (id) => {
  if (!id) return '#—'
  if (String(id).startsWith('#')) return id
  return `#${id}`
}

const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const durationBetween = (a, b) => {
  if (!a || !b) return '—'
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `~${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`
}

// ── Shared primitives ─────────────────────────────────────────────
function Modal ({ open, onClose, children, allowBackdrop = true }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && allowBackdrop) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, allowBackdrop])
  if (!open) return null
  return createPortal(
    <div onClick={(e) => { if (allowBackdrop && e.target === e.currentTarget) onClose?.() }}
         className="fixed inset-0 z-[9999] grid place-items-center p-4
                    bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] animate-pgIn">
      <div className="bg-card rounded-[20px] px-7 py-7 w-full max-w-[400px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-popIn">
        {children}
      </div>
    </div>,
    document.body,
  )
}

function ConfirmModal ({ open, icon, title, message, confirmText = 'Confirm',
                        confirmColor = 'accent', onConfirm, onClose, busy }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center text-[32px] mb-2">{icon}</div>
      <h2 className="font-display font-extrabold text-lg text-text text-center mb-2">{title}</h2>
      <p className="text-[13px] text-muted text-center leading-[1.6] mb-6">{message}</p>
      <div className="flex gap-2">
        <button onClick={onClose} disabled={busy}
          className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                     bg-card text-text text-[13px] font-semibold hover:border-muted transition">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy}
          className={`flex-[2] py-2.5 rounded-[var(--rs)] text-white text-[13px] font-bold
                      shadow-[0_4px_16px_rgba(232,65,26,0.35)] hover:brightness-90 transition
                      disabled:opacity-60
                      ${confirmColor === 'danger' ? 'bg-[#ef4444]' : 'bg-accent'}`}>
          {busy ? 'Working…' : confirmText}
        </button>
      </div>
    </Modal>
  )
}

function PriceModal ({ open, initial, onSave, onClose, busy }) {
  const [value, setValue]   = useState(String(initial || ''))
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) { setValue(String(initial || '')); setReason('') }
  }, [open, initial])
  const numericValue = Number(value)
  const sameAsCurrent = Number.isFinite(numericValue)
    && Number.isFinite(Number(initial))
    && numericValue === Number(initial)
  const invalid = !Number.isFinite(numericValue) || numericValue <= 0
  const disabled = busy || invalid || sameAsCurrent
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center text-[32px] mb-2">💰</div>
      <h2 className="font-display font-extrabold text-lg text-text text-center mb-1">
        Propose New Price
      </h2>
      <p className="text-[13px] text-muted text-center mb-4">
        C46 — Price only changes after the customer approves. They'll see
        your reason in chat and tap Accept / Reject.
      </p>
      <div className="flex items-center gap-2 mb-3 border-[1.5px] border-border rounded-[var(--rs)]
                      bg-surface px-3 py-2.5 focus-within:border-accent transition-colors">
        <span className="text-muted font-semibold">₹</span>
        <input type="number" min="0" step="10" value={value} autoFocus
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[15px] font-semibold text-text" />
      </div>
      <input type="text" value={reason} maxLength={300}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (e.g. 'second trip needed', 'extra materials')"
        className="w-full mb-3 px-3 py-2 rounded-[var(--rs)] border-[1.5px] border-border
                   bg-surface text-[13px] text-text outline-none focus:border-accent
                   disabled:opacity-60" />
      {sameAsCurrent && (
        <div className="text-[11.5px] text-muted mb-2">
          That's the same as the current price — change the amount to propose a new one.
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} disabled={busy}
          className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                     bg-card text-text text-[13px] font-semibold hover:border-muted transition">
          Cancel
        </button>
        <button onClick={() => onSave(numericValue, reason.trim() || undefined)}
          disabled={disabled}
          className="flex-[2] py-2.5 rounded-[var(--rs)] bg-accent text-white text-[13px] font-bold
                     shadow-[0_4px_16px_rgba(232,65,26,0.35)] hover:brightness-90 transition
                     disabled:opacity-60">
          {busy ? 'Sending…' : 'Send to customer'}
        </button>
      </div>
    </Modal>
  )
}

// ── Small atoms ───────────────────────────────────────────────────
function SectionCard ({ title, action, children, className = '' }) {
  return (
    <div className={`bg-card border border-border rounded-[var(--r)] overflow-hidden
                     shadow-card mb-3 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="font-display font-bold text-[13px] text-text">{title}</span>
          {action}
        </div>
      )}
      <div>{children}</div>
    </div>
  )
}

function InfoRow ({ iconBg, iconFg, icon, label, value, valueClassName = '' }) {
  return (
    <div className="flex items-center gap-3 px-[18px] py-[13px] border-b border-border last:border-b-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[16px] shrink-0"
           style={{ background: iconBg, color: iconFg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mb-0.5">
          {label}
        </div>
        <div className={`text-[13px] font-semibold text-text break-words ${valueClassName}`}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ── Inline Extra-Work form (M44) ──────────────────────────────────
// Replaces the modal approach. Lives directly inside JobProgressPanel as
// a collapsible panel so there's no portal / no z-index battles / no
// click-through issues. Opens via local boolean, submits via direct API
// call, shows feedback inline.
function InlineExtraWorkForm ({ jobId, onClose, onSent }) {
  const dispatch = useDispatch()
  const [desc, setDesc]   = useState('')
  const [price, setPrice] = useState('')
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)
  const submit = async () => {
    if (busy) return
    const trimmed = desc.trim()
    const p = Number(price)
    if (!trimmed) { setErr('Describe the extra work briefly.'); return }
    if (!Number.isFinite(p) || p <= 0) { setErr('Enter a valid price.'); return }
    setBusy(true); setErr('')
    try {
      await api.proposeExtraWork(jobId, { description: trimmed, extra_price: Math.round(p) })
      dispatch(pushToast({
        type: 'info',
        text: `Asked customer for ₹${Math.round(p)} extra — they'll see it in chat.`,
      }))
      setDesc(''); setPrice('')
      onSent?.()
      onClose?.()
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Could not send')
    } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 rounded-[var(--rs)] border-[1.5px] border-accent/40 bg-accent/[0.05] p-3">
      <div className="font-display font-bold text-[13px] text-text mb-2">
        ➕ Add extra work
      </div>
      <div className="text-[11px] text-muted mb-2 leading-[1.5]">
        The customer will see Approve / Decline buttons in chat. Approving bumps
        the agreed price; you both pay once at the end.
      </div>
      <label className="block text-[10px] uppercase tracking-[0.5px] font-bold text-muted mb-1">
        What's the extra work?
      </label>
      <input type="text" value={desc} maxLength={200}
        onChange={(e) => { setDesc(e.target.value); setErr('') }}
        placeholder="e.g. Replace switchboard"
        disabled={busy}
        className="w-full px-3 py-2 mb-2 rounded-[var(--rs)] border border-border bg-card
                   text-[13px] text-text outline-none focus:border-accent
                   disabled:opacity-60" />
      <label className="block text-[10px] uppercase tracking-[0.5px] font-bold text-muted mb-1">
        Extra price (₹)
      </label>
      <input type="number" inputMode="numeric" min={1} value={price}
        onChange={(e) => { setPrice(e.target.value); setErr('') }}
        placeholder="500"
        disabled={busy}
        className="w-full px-3 py-2 mb-2 rounded-[var(--rs)] border border-border bg-card
                   text-[13px] text-text outline-none focus:border-accent
                   disabled:opacity-60" />
      {err && <div className="text-[12px] text-[#ef4444] mb-2">{err}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy}
          className="flex-1 py-2 rounded-[var(--rs)] border border-border bg-card
                     text-text text-[12.5px] font-semibold hover:border-muted transition
                     disabled:opacity-60">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy}
          className="flex-[2] py-2 rounded-[var(--rs)] bg-accent text-white
                     text-[12.5px] font-bold hover:brightness-90 transition
                     disabled:opacity-60">
          {busy ? 'Sending…' : 'Send to customer'}
        </button>
      </div>
    </div>
  )
}

// H47 — Inline line-items form. Partner enters per-line amounts so the
// customer's payment screen shows what they're paying for. `agreed_price`
// is auto-bumped server-side to service+materials+travel.
function InlineLineItemsForm ({ job, onSaved }) {
  const dispatch = useDispatch()
  const initial = (() => {
    if (!job?.line_items) return { service: job?.agreed_price || 0, materials: 0, travel: 0 }
    if (typeof job.line_items === 'object') return job.line_items
    try { return JSON.parse(job.line_items) } catch { return { service: 0, materials: 0, travel: 0 } }
  })()
  const [service,   setService]   = useState(String(initial.service ?? ''))
  const [materials, setMaterials] = useState(String(initial.materials ?? ''))
  const [travel,    setTravel]    = useState(String(initial.travel ?? ''))
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  const labour = (Number(service) || 0) + (Number(materials) || 0) + (Number(travel) || 0)
  const submit = async () => {
    if (busy) return
    if (labour <= 0) { setErr('Total must be > 0'); return }
    setBusy(true); setErr('')
    try {
      await api.setJobLineItems(job.id, {
        service:   Number(service)   || 0,
        materials: Number(materials) || 0,
        travel:    Number(travel)    || 0,
      })
      dispatch(pushToast({ type: 'info', text: 'Line items saved.' }))
      onSaved?.()
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Could not save')
    } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 rounded-[var(--rs)] border border-border bg-surface p-3">
      <div className="font-display font-bold text-[13px] text-text mb-1">
        🧾 Line items (customer sees these)
      </div>
      <div className="text-[11px] text-muted mb-2">
        Platform fee + GST are added on top automatically.
      </div>
      <LineInput label="Service / labour" value={service} onChange={setService} disabled={busy} />
      <LineInput label="Materials"        value={materials} onChange={setMaterials} disabled={busy} />
      <LineInput label="Travel"           value={travel} onChange={setTravel} disabled={busy} />
      <div className="flex items-center justify-between mt-2 mb-2 text-[12px]">
        <span className="text-muted">Labour subtotal</span>
        <span className="font-display font-extrabold text-[14px] text-text">₹{labour}</span>
      </div>
      {err && <div className="text-[12px] text-[#ef4444] mb-2">{err}</div>}
      <button type="button" onClick={submit} disabled={busy || labour <= 0}
        className="w-full py-2 rounded-[var(--rs)] bg-accent text-white
                   text-[12.5px] font-bold hover:brightness-90 transition
                   disabled:opacity-60">
        {busy ? 'Saving…' : 'Save line items'}
      </button>
    </div>
  )
}
function LineInput ({ label, value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[11.5px] text-muted flex-1">{label}</span>
      <span className="text-[12px] text-muted">₹</span>
      <input type="number" inputMode="numeric" min={0} value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-[100px] px-2 py-1.5 rounded-md border border-border bg-card
                   text-[13px] text-right text-text outline-none focus:border-accent
                   disabled:opacity-60" />
    </div>
  )
}

// M43 — Inline "Complete the job?" panel. Replaces the portal modal. Opens
// below the action chips when the partner taps Mark as Complete. Lets them
// optionally attach up to 3 before/after photos, then either Skip or
// Complete with photos. Either path transitions the job to 'completed'.
function InlineCompletionForm ({ jobId, onCancel, onCompleted }) {
  const dispatch = useDispatch()
  const inputRef = useRef(null)
  const [urls, setUrls] = useState([])
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (urls.length >= 3) { setErr('Up to 3 photos.'); return }
    if (file.size > 5 * 1024 * 1024) { setErr('Photo must be under 5 MB.'); return }
    setBusy(true); setErr('')
    try {
      const r = await api.uploadJobPhoto(file)
      setUrls([...urls, r.url])
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2?.message || 'Upload failed')
    } finally { setBusy(false) }
  }
  const remove = (i) => setUrls(urls.filter((_, idx) => idx !== i))
  const complete = async (photos) => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      if (photos && photos.length) {
        await api.setJobCompletionPhotos(jobId, photos)
      }
      await onCompleted?.()
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Could not complete')
      dispatch(pushToast({ text: e?.message || 'Could not complete', type: 'error' }))
    } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 rounded-[var(--rs)] border-[1.5px] border-success/40 bg-success/[0.05] p-3">
      <div className="font-display font-bold text-[13px] text-text mb-1">
        📸 Add a before/after photo?
      </div>
      <div className="text-[11px] text-muted mb-2 leading-[1.5]">
        Optional. The customer sees these on their job detail. Great work has receipts.
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {urls.map((u, i) => (
          <div key={u} className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
            <img src={resolveAssetUrl(u)} alt={`Photo ${i + 1}`}
                 className="w-full h-full object-cover" />
            <button type="button" onClick={() => remove(i)}
              aria-label="Remove" disabled={busy}
              className="absolute -top-1 -right-1 bg-card text-text rounded-full
                         w-5 h-5 text-[11px] font-bold border border-border
                         shadow-card grid place-items-center">×</button>
          </div>
        ))}
        {urls.length < 3 && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="w-16 h-16 rounded-md border border-dashed border-border
                       grid place-items-center text-[20px] text-muted
                       hover:border-success hover:text-success transition disabled:opacity-60">
            {busy ? '…' : '+'}
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*"
          onChange={pick} className="hidden" />
      </div>
      {err && <div className="text-[12px] text-[#ef4444] mb-2">{err}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy}
          className="flex-1 py-2 rounded-[var(--rs)] border border-border bg-card
                     text-text text-[12.5px] font-semibold hover:border-muted transition
                     disabled:opacity-60">
          Cancel
        </button>
        <button type="button" onClick={() => complete([])} disabled={busy}
          className="flex-1 py-2 rounded-[var(--rs)] border border-border bg-card
                     text-text text-[12.5px] font-semibold hover:border-muted transition
                     disabled:opacity-60">
          {busy && !urls.length ? '…' : 'Skip & Complete'}
        </button>
        <button type="button" onClick={() => complete(urls)} disabled={busy}
          className="flex-[2] py-2 rounded-[var(--rs)] bg-success text-white
                     text-[12.5px] font-bold hover:brightness-105 transition
                     disabled:opacity-60">
          {busy
            ? 'Completing…'
            : (urls.length ? `✓ Complete with ${urls.length} photo${urls.length > 1 ? 's' : ''}` : '✓ Complete')}
        </button>
      </div>
    </div>
  )
}

// ── Job Progress — 2-column: compact stepper + live action panel ──
// Absorbs what used to be the separate NextStepCard sidebar so the Job
// Progress card now fills the full content width and the wasted space on
// the right side is gone. On narrow screens it stacks vertically.
function JobProgressPanel ({
  job, stepIdx, onChat,
  onUpdatePrice, onNavigate, onReached, onMarkComplete,
  onGoDashboard,
}) {
  const phone = job.customer_phone || ''
  const counterparty = job.customer_name || 'customer'
  const info = NEXT_STEP_INFO[job.state] || NEXT_STEP_INFO.accepted
  const isCancelled = job.state === 'cancelled'
  // M44 — inline extra-work form. Local to this panel; no parent state.
  const [extraOpen, setExtraOpen]       = useState(false)
  const [extraRefresh, setExtraRefresh] = useState(0)
  const [linesOpen, setLinesOpen]       = useState(false)
  // M43 — inline completion-photo prompt. When the partner taps Mark as
  // Complete, instead of opening a portal modal we drop down a panel
  // right here in the action area. Cleaner click chain, no z-index drama.
  const [completeOpen, setCompleteOpen] = useState(false)
  // Auto-close the forms if state moves away from an active state.
  useEffect(() => {
    if (!['priceConfirmed','travelling','arrived','working'].includes(job.state)) {
      setExtraOpen(false)
    }
    if (job.state !== 'working') setCompleteOpen(false)
  }, [job.state])

  return (
    <div className="grid gap-0 md:grid-cols-[minmax(200px,240px)_1fr]">
      {/* ── Left: vertical stepper ── */}
      <CompactStepper job={job} stepIdx={stepIdx}
        className="px-4 py-4 md:border-r md:border-border" />

      {/* ── Right: live action panel for the active step ── */}
      <div className={`px-4 py-4 border-t md:border-t-0 border-border
                       ${isCancelled ? 'bg-[#fef2f2]' : ''}`}>
        {/* Step header — single row: icon + title + step pill */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[20px] leading-none">{info.icon}</span>
          <span className={`font-display font-extrabold text-[16px] leading-none
                           ${isCancelled ? 'text-[#b91c1c]' : 'text-text'}`}>
            {info.title}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-[2px] rounded-xl
                           text-[11px] font-bold"
                style={{ background: info.badgeBg, color: info.badgeFg }}>
            <span className="font-extrabold">{info.step}</span>
            <span className="opacity-70">/7</span>
          </span>
        </div>

        <div className="text-[12.5px] text-muted leading-[1.55] mb-3">{info.desc}</div>

        {isCancelled && (job.cancel_reason || job.cancel_note) && (
          <div className="mb-3 px-3 py-2 rounded-[var(--rs)] border border-[#fecaca] bg-white
                          text-[12px] text-[#7f1d1d] leading-[1.55]">
            {job.cancel_reason && (
              <div><span className="font-bold">Reason:</span> {job.cancel_reason}</div>
            )}
            {job.cancel_note && (
              <div className="mt-0.5"><span className="font-bold">Note:</span> {job.cancel_note}</div>
            )}
            {job.cancelled_by && (
              <div className="mt-0.5 text-[11px] opacity-70">
                Cancelled by {job.cancelled_by === 'partner' ? 'you' : 'the customer'}
              </div>
            )}
          </div>
        )}

        {/* Price-confirm banner replaces the generic CTA while state=accepted */}
        {job.state === 'accepted' && (
          <PriceConfirmBanner
            message={`Call or chat with ${counterparty} to confirm the price. The next step unlocks once they agree.`}
            phone={phone} onChat={onChat} />
        )}

        {/* Phase-specific action chips — inline, no full-width waste. */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {job.state === 'accepted' && (
            <button onClick={onUpdatePrice}
              className="px-4 py-2 rounded-[var(--rs)] bg-accent text-white
                         font-bold text-[13px] shadow-[0_2px_8px_rgba(232,65,26,0.30)]
                         hover:brightness-90 transition">
              💰 Update Price
            </button>
          )}
          {job.state === 'priceConfirmed' && (
            <button onClick={onNavigate}
              className="px-4 py-2 rounded-[var(--rs)] bg-accent text-white
                         font-bold text-[13px] shadow-[0_2px_8px_rgba(232,65,26,0.30)]
                         hover:brightness-90 transition">
              🗺 Open Maps & Start →
            </button>
          )}
          {job.state === 'travelling' && (
            <button onClick={onReached}
              className="px-4 py-2 rounded-[var(--rs)] bg-accent text-white
                         font-bold text-[13px] shadow-[0_2px_8px_rgba(232,65,26,0.30)]
                         hover:brightness-90 transition">
              📍 Reached & Start Work
            </button>
          )}
          {/* H47 — Line items toggle. Lets the partner enter the breakdown
              the customer will see on PaymentPage. */}
          {['priceConfirmed','travelling','arrived','working','completed'].includes(job.state) && (
            <button type="button"
              onClick={() => setLinesOpen((v) => !v)}
              className="px-3 py-2 rounded-[var(--rs)] border-[1.5px] border-border
                         bg-card text-text font-bold text-[12.5px]
                         hover:border-accent hover:text-accent transition cursor-pointer">
              {linesOpen ? '✕ Close' : '🧾 Line items'}
            </button>
          )}
          {/* M44 — Mid-job extra-work proposal. Toggles the inline form
              below (no modal, no portal — keeps the click pipeline clean). */}
          {['priceConfirmed','travelling','arrived','working'].includes(job.state) && (
            <button type="button"
              onClick={() => setExtraOpen((v) => !v)}
              className="px-3 py-2 rounded-[var(--rs)] border-[1.5px] border-accent
                         bg-card text-accent font-bold text-[12.5px]
                         hover:bg-accent hover:text-white transition cursor-pointer">
              {extraOpen ? '✕ Close' : '➕ Extra work'}
            </button>
          )}
          {job.state === 'working' && (
            <button type="button"
              onClick={() => setCompleteOpen((v) => !v)}
              className="px-4 py-2 rounded-[var(--rs)] bg-success text-white
                         font-bold text-[13px] shadow-[0_2px_8px_rgba(16,185,129,0.30)]
                         hover:brightness-90 transition cursor-pointer">
              {completeOpen ? '✕ Close' : '✓ Mark as Complete'}
            </button>
          )}
          {isCancelled && (
            <button onClick={onGoDashboard}
              className="px-4 py-2 rounded-[var(--rs)] bg-accent text-white
                         font-bold text-[13px] shadow-[0_2px_8px_rgba(232,65,26,0.30)]
                         hover:brightness-90 transition">
              🏠 Dashboard
            </button>
          )}
        </div>

        {/* H47 — Line-items inline form. */}
        {linesOpen && (
          <InlineLineItemsForm job={job} onSaved={() => setLinesOpen(false)} />
        )}

        {/* M44 — Inline form that drops out below the action chips when
            the partner taps "+ Extra work". Self-contained, no modal. */}
        {extraOpen && (
          <InlineExtraWorkForm jobId={job.id}
            onClose={() => setExtraOpen(false)}
            onSent={() => setExtraRefresh((n) => n + 1)} />
        )}

        {/* M43 — Inline "complete the job" prompt with optional photos. */}
        {completeOpen && (
          <InlineCompletionForm jobId={job.id}
            onCancel={() => setCompleteOpen(false)}
            onCompleted={async () => {
              setCompleteOpen(false)
              // onMarkComplete from the parent does the actual state
              // transition to 'completed'. Wait for it so we surface
              // errors to the inline form's try/catch.
              await onMarkComplete?.()
            }} />
        )}

        {/* M44 — Running list of proposals (pending + approved + declined)
            so the partner can see what they've sent at a glance. */}
        {['priceConfirmed','travelling','arrived','working','completed'].includes(job.state) && (
          <div className="mt-3">
            <ExtraWorkSummary jobId={job.id} role="partner" refreshKey={extraRefresh} />
          </div>
        )}

        {/* Footer KV strip */}
        <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap gap-x-5 gap-y-1
                        text-[12px] text-muted">
          <KvInline label="Customer" value={job.customer_name || '—'} />
          <KvInline label="Job" value={shortId(job.id)} />
          {job.distance_km != null && (
            <KvInline label="Distance" value={formatDistance(job.distance_km)} />
          )}
          <KvInline label="Agreed"
            value={<span className="text-success font-extrabold">{formatPrice(job.agreed_price)}</span>} />
        </div>

        {info.tip && <div className="mt-2 text-[11.5px] text-muted leading-[1.55]">{info.tip}</div>}
      </div>
    </div>
  )
}

function KvInline ({ label, value }) {
  return (
    <span className="inline-flex gap-1.5">
      <span>{label}:</span>
      <span className="text-text font-semibold truncate max-w-[160px]">{value}</span>
    </span>
  )
}

// Compact vertical stepper — 7 rows (happy-path 1..6 + terminal Cancelled).
// The Cancelled row is always present so the stepper communicates "this is
// the other path the job can end on". While the job is healthy it's muted;
// if the job actually gets cancelled it becomes the active/terminal step.
function CompactStepper ({ job, stepIdx, className = '' }) {
  const isCancelled = job.state === 'cancelled'
  const rows = [
    { title: 'Request Accepted',  at: job.accepted_at },
    { title: 'Price Confirmed' },
    { title: 'Travelling' },
    { title: 'Arrived' },
    { title: 'Work in Progress',  at: job.started_at },
    { title: 'Completed',         at: job.completed_at },
    { title: 'Cancelled',         variant: 'cancel' },
  ]

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      {rows.map((r, i) => {
        const isLast = i === rows.length - 1
        const cancelRow = r.variant === 'cancel'

        // Happy-path rows
        let done   = !cancelRow && !isCancelled && i < stepIdx
        let active = !cancelRow && !isCancelled && i === stepIdx

        // Cancel row
        if (cancelRow) {
          active = isCancelled
          done   = false
        }
        // When cancelled, rows before the cancel point are still "done"
        if (cancelRow === false && isCancelled) {
          done = i <= (stepIdx - 1)   // whatever happened before cancel stays green
          active = false
        }

        const dotCls = cancelRow
          ? active
            ? 'bg-[#ef4444] border-[#ef4444] text-white animate-pulse'
            : 'bg-card border-dashed border-[#fecaca] text-[#ef4444] opacity-60'
          : done
            ? 'bg-success border-success text-white'
            : active
              ? 'bg-accent border-accent text-white animate-pulse'
              : 'bg-card border-border text-muted'

        const dotGlyph = cancelRow ? '✖' : (done ? '✓' : active ? '➤' : i + 1)

        const titleCls = cancelRow
          ? active ? 'text-[#b91c1c]' : 'text-muted opacity-70'
          : (done || active) ? 'text-text' : 'text-muted'

        return (
          <div key={r.title} className={`flex gap-2.5 ${isLast ? '' : 'pb-2.5'}`}>
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold
                               border-[2px] ${dotCls}`}>
                {dotGlyph}
              </div>
              {!isLast && (
                <div className={`w-[2px] flex-1 min-h-[14px]
                                 ${done ? 'bg-success' : cancelRow ? 'bg-transparent' : 'bg-border'}`} />
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <div className={`text-[12px] font-bold leading-tight truncate ${titleCls}`}>
                {r.title}
              </div>
              {!cancelRow && done && r.at && (
                <div className="text-[10px] font-semibold text-success shrink-0">{fmtTime(r.at)}</div>
              )}
              {!cancelRow && active && (
                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-[2px] rounded-xl
                                 text-[10px] font-bold bg-[#dbeafe] text-[#1e40af]">
                  <span className="w-1 h-1 rounded-full bg-[#1e40af] animate-pulse" />
                  Now
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Professional deep-indigo banner with contact CTAs. Used inline at the
// Price Confirmed step so both parties know exactly what to do right now.
function PriceConfirmBanner ({ message, phone, onChat, onCall }) {
  return (
    <div className="mt-3 rounded-[var(--rs)] overflow-hidden border border-[#c7d2fe]
                    bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)]">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-lg grid place-items-center text-[16px] shrink-0
                        bg-[#4338ca] text-white shadow-[0_3px_10px_rgba(67,56,202,0.35)]">
          💬
        </div>
        <div className="flex-1 min-w-0 text-[12px] text-[#1e1b4b] leading-[1.55]">
          <div className="font-bold text-[12.5px] mb-0.5">Confirm the price</div>
          <div className="text-[#4c4974]">{message}</div>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        {phone && (
          <a href={`tel:${phone}`} onClick={onCall}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-[var(--rs)]
                       bg-[#1e40af] text-white text-[12px] font-bold
                       shadow-[0_3px_12px_rgba(30,64,175,0.35)]
                       hover:brightness-[1.05] transition">
            📞 Call
          </a>
        )}
        <button onClick={onChat}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-[var(--rs)]
                     bg-[#4338ca] text-white text-[12px] font-bold
                     shadow-[0_3px_12px_rgba(67,56,202,0.35)]
                     hover:brightness-[1.05] transition">
          💬 Chat
        </button>
      </div>
    </div>
  )
}

// Consolidated customer card. Customer location/contact is gated behind the
// "priceConfirmed" state — the partner sees a masked placeholder until the
// customer has agreed to the price. Once unlocked, the prominent
// "Navigate to Customer" CTA opens turn-by-turn Google Maps directions AND
// flips the job state to `travelling` in a single tap (no confirm popup).
function CustomerCard ({ job, onChat, onNavigateToCustomer }) {
  const name = job.customer_name || 'Customer'
  const av = job.customer_av_class || hashToAv(job.customer_id || name)
  const ini = job.customer_initials || initialsOf(name)
  const phone = job.customer_phone || ''
  const email = job.customer_email || ''
  const addr = job.customer_address || job.address || '—'
  // Address / phone / map deep-links unlock only after the price is
  // confirmed. Explicit allow-list (vs `state !== 'accepted'`) so any new
  // pre-confirmed state also stays locked by default.
  const POST_CONFIRMED = ['priceConfirmed', 'travelling', 'arrived', 'working', 'completed', 'paid']
  const locationUnlocked = POST_CONFIRMED.includes(job.state)
  const canNavigate = job.state === 'priceConfirmed'

  return (
    <div className="bg-card border border-border rounded-[var(--r)] overflow-hidden shadow-card
                    flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border"
           style={{ background: 'linear-gradient(135deg,#fff5f0,#fff)' }}>
        <div className={`w-11 h-11 rounded-full flex items-center justify-center
                         font-bold text-[13px] shrink-0 ${av}`}>{ini}</div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[15px] text-text truncate">{name}</div>
          <div className="text-[11px] text-muted truncate">Job {shortId(job.id)}</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {locationUnlocked && phone && (
            <a href={`tel:${phone}`}
              className="w-9 h-9 rounded-full bg-[#2563eb] text-white grid place-items-center
                         text-[14px] hover:brightness-90 transition"
              aria-label={`Call ${name}`}>📞</a>
          )}
          <button onClick={onChat}
            className="w-9 h-9 rounded-full bg-success text-white grid place-items-center
                       text-[14px] hover:brightness-90 transition"
            aria-label={`Chat with ${name}`}>💬</button>
        </div>
      </div>

      {!locationUnlocked ? (
        <div className="px-4 py-4 text-center">
          <div className="text-[22px] mb-1.5">🔒</div>
          <div className="font-display font-extrabold text-[13px] text-text mb-1">
            Location locked
          </div>
          <div className="text-[12px] text-muted leading-[1.55]">
            Phone, address and map directions are shared after the price is confirmed.
          </div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#92400e]
                          bg-[#fef3c7] border border-[#fde68a] rounded-xl px-2.5 py-1">
            ⏳ Waiting for price
          </div>
        </div>
      ) : (
        <>
          {/* Slim info rows — single line each */}
          <div className="px-4 py-3 text-[13px] flex flex-col gap-2">
            {phone && (
              <SlimRow icon="📞" label="Phone"
                value={<a href={`tel:${phone}`} className="text-text">{phone}</a>} />
            )}
            {email && (
              <SlimRow icon="✉️" label="Email" value={email} mono />
            )}
            <SlimRow icon="🏠" label="Address" value={addr} />
            {job.distance_km != null && (
              <SlimRow icon="📐" label="Distance" value={formatDistance(job.distance_km)} />
            )}
          </div>

          {!canNavigate && (
            <div className="px-4 pb-3 pt-1 border-t border-border">
              <button onClick={onNavigateToCustomer}
                className="block w-full py-2 rounded-[var(--rs)] border-[1.5px] border-dashed border-accent
                           text-accent text-[12px] font-bold text-center
                           hover:bg-accent hover:text-white transition">
                🗺 Open Directions in Maps
              </button>
              {job.notes && (
                <div className="mt-2 text-[12px] text-muted italic leading-[1.55]
                                border-l-[3px] border-accent pl-3">
                  📝 {job.notes}
                </div>
              )}
            </div>
          )}
          {canNavigate && job.notes && (
            <div className="px-4 py-3 border-t border-border">
              <div className="text-[12px] text-muted italic leading-[1.55]
                              border-l-[3px] border-accent pl-3">
                📝 {job.notes}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SlimRow ({ icon, label, value, mono = false }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="shrink-0 text-[14px]">{icon}</span>
      <span className="text-muted text-[11px] uppercase tracking-[0.5px] shrink-0 w-[68px] font-bold">
        {label}
      </span>
      <span className={`text-text font-semibold truncate min-w-0 ${mono ? 'break-all' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// Preserved in case another place still imports it. Not used by the main
// active view anymore — CustomerCard replaces it.
function CustomerSnapshot ({ job, onChat }) {
  const name = job.customer_name || 'Customer'
  const av = job.customer_av_class || hashToAv(job.customer_id || name)
  const ini = job.customer_initials || initialsOf(name)
  const addr = job.customer_address || job.address || '—'
  const phone = job.customer_phone || ''
  return (
    <SectionCard title="Customer Snapshot">
      <div className="px-[18px] py-[14px]">
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center
                           font-bold text-[13px] shrink-0 ${av}`}>{ini}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-text truncate">{name}</div>
            <div className="text-[11px] text-muted truncate">📍 {addr}</div>
          </div>
          {phone && (
            <a href={`tel:${phone}`}
              className="shrink-0 w-9 h-9 rounded-full bg-[#2563eb] text-white
                         grid place-items-center text-[14px] hover:brightness-90 transition"
              title={`Call ${name}`}>
              📞
            </a>
          )}
          <button onClick={onChat}
            className="shrink-0 px-3.5 py-[7px] rounded-[var(--rs)] bg-accent text-white
                       text-[11px] font-bold hover:brightness-90 transition">
            💬 Chat
          </button>
        </div>
        <div className="text-[12px] text-muted border-t border-border pt-2.5 leading-[1.7]">
          🔧 Service: <span className="text-text font-semibold">{job.service || job.category_name || '—'}</span>
          <br />
          💰 Agreed Price: <span className="text-text font-semibold">{formatPrice(job.agreed_price)}</span>
        </div>
      </div>
    </SectionCard>
  )
}

// ── Customer tab content ──────────────────────────────────────────
function CustomerTab ({ job, onChat }) {
  const name = job.customer_name || 'Customer'
  const av  = job.customer_av_class || hashToAv(job.customer_id || name)
  const ini = job.customer_initials || initialsOf(name)
  const phone = job.customer_phone || ''
  const email = job.customer_email || ''
  const address = job.customer_address || job.address || '—'
  // Deep-link to Google Maps. Prefer exact coordinates from the job (these
  // come from the customer's own GPS fix at request-creation time) — fall
  // back to the written address only if coords are missing.
  const mapUrl = (job.customer_lat != null && job.customer_lng != null)
    ? `https://www.google.com/maps/search/?api=1&query=${job.customer_lat},${job.customer_lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

  return (
    <div>
      {/* Header card */}
      <SectionCard title="" className="!mb-[18px]">
        <div className="flex items-center gap-3 px-[18px] py-4"
             style={{ background: 'linear-gradient(135deg,#fff5f0,#fff)' }}>
          <div className={`w-[52px] h-[52px] rounded-full flex items-center justify-center
                           font-bold text-[15px] shrink-0 ${av}`}>{ini}</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[16px] text-text truncate">{name}</div>
            <div className="text-[11px] text-muted">Job {shortId(job.id)}</div>
          </div>
          <div className="flex gap-2 shrink-0">
            {phone && (
              <a href={`tel:${phone}`}
                className="w-10 h-10 rounded-full bg-[#2563eb] text-white
                           grid place-items-center text-[16px] shadow-card">📞</a>
            )}
            <button onClick={onChat}
              className="w-10 h-10 rounded-full bg-success text-white
                         grid place-items-center text-[16px] shadow-card">💬</button>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-0 md:grid-cols-2 md:gap-[18px]">
        {/* Contact */}
        <SectionCard title="📇 Contact">
          <InfoRow iconBg="#dbeafe" iconFg="#1e40af" icon="📞" label="Phone"
                   value={phone ? <a href={`tel:${phone}`} className="text-text">{phone}</a> : '—'} />
          <InfoRow iconBg="#fce7f3" iconFg="#be185d" icon="✉️" label="Email"
                   value={email || '—'} valueClassName="break-all" />
        </SectionCard>

        {/* Service Address */}
        <SectionCard title="📍 Service Address">
          <InfoRow iconBg="#fee2e2" iconFg="#b91c1c" icon="🏠" label="Address" value={address} />
          <InfoRow iconBg="#ede9fe" iconFg="#6d28d9" icon="📐" label="Distance from you"
                   value={job.distance_km != null ? formatDistance(job.distance_km) : '—'} />
          <div className="px-[18px] py-3">
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className="block w-full py-2.5 rounded-[var(--rs)] border-[1.5px] border-dashed border-accent
                         text-accent text-[12px] font-bold text-center hover:bg-accent hover:text-white transition">
              🗺 Open in Maps
            </a>
          </div>
        </SectionCard>
      </div>

      {/* Notes from Customer */}
      {job.notes && (
        <SectionCard title="📝 Notes from Customer">
          <div className="px-[18px] py-4 text-[13px] text-muted italic leading-[1.7]
                          border-l-[3px] border-accent ml-[18px] my-3">
            {job.notes}
          </div>
        </SectionCard>
      )}
    </div>
  )
}


// ── Completed / Awaiting Payment view ─────────────────────────────
function CompletedView ({ job, onBackToWorking, onGoDashboard, busy }) {
  const name = job.customer_name || 'Customer'
  const av  = job.customer_av_class || hashToAv(job.customer_id || name)
  const ini = job.customer_initials || initialsOf(name)
  const phone = job.customer_phone || ''
  const email = job.customer_email || ''
  const address = job.customer_address || job.address || '—'
  const agreed = Number(job.agreed_price || 0)
  const platformFee = 0   // MVP: free
  const receives = agreed - platformFee
  const isPaid = job.state === 'paid'

  return (
    <div className="min-h-full bg-surface p-5 md:p-7">
      {/* 1. Payment Breakdown — lifted to the top so the partner immediately
            sees what they're being paid and the payment status. */}
      <div className="bg-card border border-border rounded-[var(--r)] overflow-hidden shadow-card">
        <div className="px-[18px] py-[13px] border-b border-border
                        font-display font-bold text-[13px] text-text">
          💰 Payment Breakdown
        </div>
        <div className="px-[18px] py-4 flex flex-col gap-2.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-muted">Service charge</span>
            <span className="font-semibold text-text">{formatPrice(agreed)}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-muted">Platform fee</span>
            <span className="font-semibold text-success">{platformFee === 0 ? 'Free' : `-${formatPrice(platformFee)}`}</span>
          </div>
          <div className="flex justify-between text-[13px] border-t border-border pt-2.5">
            <span className="text-muted">You'll receive in wallet</span>
            <span className="font-semibold text-text">{formatPrice(receives)}</span>
          </div>
        </div>
        <div className="bg-surface px-[18px] py-4 flex items-center justify-between
                        border-t border-border">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mb-0.5">
              Customer will pay
            </div>
            <div className="font-display font-extrabold text-[28px] text-text leading-none">
              {formatPrice(agreed)}
            </div>
          </div>
          {isPaid ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                             text-[11px] font-bold border-[1.5px] border-success text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Paid
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                             text-[11px] font-bold border-[1.5px] border-[#f59e0b] text-[#92400e]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
              Awaiting Payment
            </span>
          )}
        </div>
      </div>

      {/* 2. Customer Details + Job Details side-by-side */}
      <div className="grid gap-[18px] md:grid-cols-[2fr_2fr] mt-[18px]">
        <SectionCard title="👤 Customer Details">
          <div className="px-[18px] py-[14px] flex items-center gap-3 border-b border-border">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center
                             font-bold text-[13px] shrink-0 ${av}`}>{ini}</div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-text truncate">{name}</div>
              <div className="text-[11px] text-muted">Job ID {shortId(job.id)}</div>
            </div>
          </div>
          {phone && (
            <InfoRow iconBg="#dbeafe" iconFg="#1e40af" icon="📞" label="Phone"
                     value={<a href={`tel:${phone}`} className="text-text">{phone}</a>} />
          )}
          {email && (
            <InfoRow iconBg="#fce7f3" iconFg="#be185d" icon="✉️" label="Email"
                     value={email} valueClassName="break-all" />
          )}
          <InfoRow iconBg="#fee2e2" iconFg="#b91c1c" icon="🏠" label="Service Address" value={address} />
          {job.distance_km != null && (
            <InfoRow iconBg="#ede9fe" iconFg="#6d28d9" icon="📐" label="Distance from you"
                     value={formatDistance(job.distance_km)} />
          )}
        </SectionCard>

        <SectionCard title="📋 Job Details">
          <InfoRow iconBg="#fef3c7" iconFg="#92400e" icon="🔧" label="Service"
                   value={job.service || job.category_name || '—'} />
          <InfoRow iconBg="#ede9fe" iconFg="#6d28d9" icon="🆔" label="Job ID" value={shortId(job.id)} />
          <InfoRow iconBg="#dbeafe" iconFg="#1e40af" icon="📅" label="Started → Completed"
                   value={`${fmtTime(job.started_at)} → ${fmtTime(job.completed_at)}`} />
          <InfoRow iconBg="#dcfce7" iconFg="#166534" icon="⏱" label="Duration"
                   value={durationBetween(job.started_at, job.completed_at)} />
        </SectionCard>
      </div>

      {/* 3. Actions — Back-to-working (pre-pay) + Dashboard */}
      <div className="grid gap-2 md:grid-cols-2 mt-[18px]">
        <button onClick={onBackToWorking} disabled={busy || isPaid}
          className="py-3 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                     text-[13px] font-semibold text-text hover:border-muted transition
                     disabled:opacity-50">
          ← Back (Work Pending)
        </button>
        <button onClick={onGoDashboard}
          className="py-3 rounded-[var(--rs)] bg-accent text-white text-[13px] font-bold
                     shadow-[0_4px_16px_rgba(232,65,26,0.35)] hover:brightness-90 transition">
          🏠 Go to Dashboard
        </button>
      </div>
    </div>
  )
}

// Synthesises a 3-second cash-register / coin cascade using Web Audio API
// so we don't need to ship an audio asset. Returns a cleanup function that
// stops playback immediately. Autoplay restrictions are not usually a
// problem here since the partner has already interacted with the page to
// get to /partner/work — but we still swallow failures just in case.
function playMoneyCelebration (ctx) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.35
  master.connect(ctx.destination)

  const blip = (freq, at, dur, vol = 0.6, type = 'sine') => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(vol, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(gain); gain.connect(master)
    osc.start(at); osc.stop(at + dur + 0.05)
  }

  // Cha-ching opening at t=0 — two bright ringing tones.
  blip(1320, now,        0.35, 0.7)
  blip(1760, now + 0.06, 0.45, 0.55)
  blip(2640, now + 0.18, 0.6,  0.35)

  // Coin cascade: staggered clinks at descending pitches.
  const COINS = [0.55, 0.80, 1.05, 1.30, 1.60, 1.90, 2.20]
  COINS.forEach((t, i) => {
    const f = 1800 - i * 120
    blip(f,      now + t, 0.2, 0.45, 'triangle')
    blip(f * 2,  now + t + 0.02, 0.12, 0.2)
  })

  // Final ring-out bell at ~t=2.5s so it decays inside the 3-second window.
  blip(880,  now + 2.45, 0.6,  0.4)
  blip(1320, now + 2.45, 0.6,  0.3)
  blip(1760, now + 2.5,  0.5,  0.2)

  return () => {
    try { master.disconnect() } catch {}
  }
}

// ── Payment Received overlay ─────────────────────────────────────
// Non-dismissable success screen that appears the moment the customer
// pays (socket-driven). Plays a 3-second cash-register sound, rains
// coins across the backdrop, counts the amount up from zero, and locks
// the view until the partner taps one of the two actions.
function PaymentReceivedOverlay ({ amount = 0, customerName, onDashboard, onKeepSearching, busy }) {
  const effectiveAmount = Number(amount || 0)
  const [displayAmount, setDisplayAmount] = useState(0)
  const audioCtxRef = useRef(null)

  // Play the 3-second celebration sound exactly once on mount.
  useEffect(() => {
    let ctx
    let stop
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) {
        ctx = new AC()
        audioCtxRef.current = ctx
        // Some browsers start the context suspended — resume() is a no-op
        // if it's already running.
        const start = () => {
          stop = playMoneyCelebration(ctx)
          // Auto-close after the celebration ends so we don't leak.
          setTimeout(() => { try { ctx.close() } catch {} }, 3200)
        }
        if (ctx.state === 'suspended') ctx.resume().then(start, () => {})
        else start()
      }
    } catch { /* audio unavailable — fail quiet */ }
    return () => {
      try { stop?.() } catch {}
      try { ctx?.close() } catch {}
    }
  }, [])

  // Count-up on the amount over ~1.4s using rAF so it stays smooth.
  useEffect(() => {
    if (!effectiveAmount) { setDisplayAmount(0); return }
    const duration = 1400
    const start = performance.now()
    let raf = 0
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayAmount(Math.round(effectiveAmount * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [effectiveAmount])

  // Deterministic coin/confetti particles. We want stable positions per
  // render so the animation doesn't re-shuffle on state updates.
  const coins = useMemo(() => buildCoins(18), [])
  const confetti = useMemo(() => buildConfetti(26), [])

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-5
                    bg-[rgba(6,27,21,0.82)] backdrop-blur-[6px] animate-fadeIn">
      {/* Rain of emoji coins across the entire viewport behind the card. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {coins.map((c, i) => (
          <span key={i}
            className="absolute text-[22px] animate-coinRain select-none"
            style={{
              left: `${c.left}%`,
              top: '-10%',
              '--dx': `${c.drift}px`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))',
            }}>
            {c.glyph}
          </span>
        ))}
      </div>

      <div className="relative bg-card rounded-[22px] px-7 py-8 w-full max-w-[420px]
                      text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] animate-popIn
                      overflow-hidden">
        {/* green glow backdrop */}
        <div aria-hidden className="pointer-events-none absolute inset-0"
             style={{ background:
               'radial-gradient(circle at 50% -10%, rgba(16,185,129,0.22), transparent 55%)' }}/>

        {/* Confetti particles bursting out of the success badge. */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[70px]">
          {confetti.map((p, i) => (
            <span key={i}
              className="absolute block w-[6px] h-[10px] rounded-[1px] animate-confettiBurst"
              style={{
                left: 0, top: 0,
                background: p.color,
                '--cx': `${p.x}px`,
                '--cy': `${p.y}px`,
                '--cr': `${p.rot}deg`,
                animationDelay: `${p.delay}s`,
              }}/>
          ))}
        </div>

        {/* success badge with pulsing rings + checkmark draw */}
        <div className="relative mx-auto w-[96px] h-[96px] mb-4">
          <div className="absolute inset-0 rounded-full bg-success/25 animate-successRing" />
          <div className="absolute inset-0 rounded-full bg-success/20 animate-successRingB" />
          <div className="relative w-[96px] h-[96px] rounded-full bg-success
                          grid place-items-center animate-successBurst animate-glowPulse">
            <svg width="48" height="48" viewBox="0 0 52 52" fill="none" aria-hidden>
              <path d="M14 27 l8 8 l16 -18" stroke="white" strokeWidth="4.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="animate-checkDraw" />
            </svg>
          </div>
        </div>

        <div className="relative">
          <div className="font-display font-extrabold text-[22px] text-text mb-1">
            Payment Completed!
          </div>
          <div className="text-[13px] text-muted mb-4 leading-[1.55]">
            {customerName ? `${customerName} just paid for this job.` : 'The customer just paid for this job.'}
            <br/>Funds are on their way to your wallet.
          </div>

          {/* Single highlighted amount with count-up + shake kick-off. */}
          <div className="inline-flex items-baseline gap-2 mb-5 animate-moneyPop">
            <span className="font-display font-extrabold text-[40px] text-success leading-none
                             animate-moneyShake inline-block">
              + {formatPrice(displayAmount)}
            </span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.6px] text-muted mb-5">
            Credited to your wallet
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={onKeepSearching} disabled={busy}
              className="w-full py-3 rounded-[var(--rs)] bg-success text-white
                         font-bold text-[13px] shadow-[0_6px_18px_rgba(16,185,129,0.35)]
                         hover:brightness-[1.05] transition disabled:opacity-60">
              🔎 Search for New Job
            </button>
            <button onClick={onDashboard} disabled={busy}
              className="w-full py-3 rounded-[var(--rs)] border-[1.5px] border-border
                         bg-card text-text text-[13px] font-semibold
                         hover:border-accent hover:text-accent transition disabled:opacity-60">
              🏠 Go Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Pre-baked coin particles — enough variety to feel alive, few enough to
// stay cheap. `left` is the viewport x-percentage, `drift` is how far the
// coin slides horizontally while falling.
function buildCoins (n) {
  const glyphs = ['💰','💵','💸','🪙','🤑']
  const out = []
  const rand = (seed) => {
    const x = Math.sin(seed * 9973) * 10000
    return x - Math.floor(x)
  }
  for (let i = 0; i < n; i++) {
    out.push({
      glyph:    glyphs[i % glyphs.length],
      left:     rand(i + 1) * 100,
      drift:    (rand(i + 17) - 0.5) * 120,
      delay:    rand(i + 37) * 1.6,
      duration: 1.8 + rand(i + 71) * 1.2,
    })
  }
  return out
}

// Confetti bursts out from behind the success badge in a radial pattern.
function buildConfetti (n) {
  const palette = ['#10b981', '#34d399', '#f59e0b', '#facc15', '#38bdf8', '#ef4444', '#a855f7']
  const out = []
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + (Math.random() * 0.4)
    const dist  = 180 + Math.random() * 120
    out.push({
      color: palette[i % palette.length],
      x:     Math.cos(angle) * dist,
      y:     Math.sin(angle) * dist - 20,
      rot:   Math.floor(Math.random() * 720 - 360),
      delay: Math.random() * 0.15,
    })
  }
  return out
}

// ── Root ──────────────────────────────────────────────────────────
export default function PartnerWorkPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const job      = useSelector(selectActiveJob)
  const [confirm, setConfirm] = useState(null)
  const [priceOpen, setPriceOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [priceAck, setPriceAck] = useState(false)
  // Track previous job state so we only fire the "price confirmed" alert on
  // the actual transition (accepted → priceConfirmed) — not when the partner
  // navigates to this page after the fact.
  const prevStateRef = useRef(null)
  const canShareTrip = job?.state === 'travelling' || job?.state === 'arrived'

  useEffect(() => { dispatch(fetchActiveJobThunk('partner')) }, [dispatch])

  // Live partner-location streaming. Server only accepts pings during
  // travelling/arrived; the hook is a safe no-op outside those states.
  useLiveLocationStream({
    jobId: job?.id,
    enabled: job?.state === 'travelling' || job?.state === 'arrived',
  })

  // H38 — Geofence arrival. While travelling, watch GPS; when within 80m
  // of the customer, surface a prompt asking the partner to flip to
  // 'arrived'. We don't auto-fire so they stay in control (they may be
  // looking for parking, etc.).
  const insideGeofence = useGeofenceArrival({
    enabled:   job?.state === 'travelling',
    targetLat: job?.customer_lat,
    targetLng: job?.customer_lng,
    radiusM:   80,
  })
  const [arrivePromptOpen, setArrivePromptOpen] = useState(false)
  const [arrivePromptDismissed, setArrivePromptDismissed] = useState(false)
  useEffect(() => {
    if (insideGeofence && !arrivePromptDismissed && job?.state === 'travelling') {
      setArrivePromptOpen(true)
    }
  }, [insideGeofence, arrivePromptDismissed, job?.state])
  // Reset the dismissal flag whenever the partner moves on to a new job
  // or away from travelling — fresh geofence triggers a fresh prompt.
  // Also close the prompt itself if it's still open from a stale state
  // (e.g. server transitioned to 'arrived' while the modal was up).
  useEffect(() => {
    if (job?.state !== 'travelling') {
      setArrivePromptDismissed(false)
      setArrivePromptOpen(false)
    }
  }, [job?.id, job?.state])
  const confirmArrived = async () => {
    setArrivePromptOpen(false)
    setArrivePromptDismissed(true)
    try {
      await dispatch(setStateThunk({ id: job.id, to: 'arrived' })).unwrap()
    } catch (e) {
      dispatch(pushToast({ text: e?.message || 'Could not mark arrived', type: 'error' }))
    }
  }
  const dismissArrivePrompt = () => {
    setArrivePromptOpen(false)
    setArrivePromptDismissed(true)
  }

  // Join the job room so state-change broadcasts from the server
  // (customer confirming price, payment arriving, …) reach us live.
  // useRealtime handles the listeners; we only need the room join here.
  const jobId = job?.id
  useEffect(() => {
    if (!jobId) return
    let sock
    let cancelled = false
    getSocket({ role: 'partner' }).then((s) => {
      if (cancelled) return
      sock = s
      s.emit('join-job', jobId)
    }).catch(() => {})
    return () => {
      cancelled = true
      sock?.emit?.('leave-job', jobId)
    }
  }, [jobId])

  // When the customer confirms the price (state flips to priceConfirmed)
  // we refetch so the response carries the latest timestamps + live distance.
  //
  // NOTE: we intentionally do NOT refetch on 'paid'. The server's
  // `findActiveForPartner` excludes paid/cancelled jobs, so a refetch here
  // returns null and Redux would clear `activeJob` — making the "Payment
  // Received" popup disappear before the partner ever sees it. The socket
  // `job:state-changed` / `payment:succeeded` events already carry every
  // field the overlay needs (amount, tip, total, paid_at).
  const jobState = job?.state
  useEffect(() => {
    if (jobState === 'priceConfirmed') {
      dispatch(fetchActiveJobThunk('partner'))
    }
    // Fire the "price confirmed" alert only on transition INTO priceConfirmed
    // from another state — not on initial mount (e.g. partner refreshes the
    // page when the job is already past Confirm Price).
    const prev = prevStateRef.current
    if (prev && prev !== 'priceConfirmed' && jobState === 'priceConfirmed') {
      setPriceAck(true)
    }
    prevStateRef.current = jobState
  }, [jobState, dispatch])

  const stepIdx = useMemo(() => (job ? stepIndex(job.state) : -1), [job])

  // ── State transition helpers ────────────────────────────────────
  // Throws on failure so callers (e.g. InlineCompletionForm) can decide
  // whether to keep their UI open. Confirm modal still closes via finally.
  const transition = async (to) => {
    if (!job) return
    setBusy(true)
    try {
      await dispatch(setStateThunk({ id: job.id, to })).unwrap()
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || `Failed to transition to ${to}`
      dispatch(pushToast({ text: msg, type: 'error' }))
      throw e
    } finally { setBusy(false); setConfirm(null) }
  }

  const confirmAnd = (opts) => setConfirm(opts)

  const onUpdatePrice = () => setPriceOpen(true)
  const onSavePrice = async (value, reason) => {
    if (!job) return
    setBusy(true)
    try {
      await dispatch(proposePriceThunk({ id: job.id, agreed_price: value, reason })).unwrap()
      setPriceOpen(false)
      dispatch(pushToast({
        type: 'info',
        text: `Proposed ₹${value}. Waiting for customer to approve.`,
      }))
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to propose price', type: 'error' })) }
    finally { setBusy(false) }
  }
  // No popup. Tapping "Navigate" opens Google Maps with turn-by-turn directions
  // from the partner's current location to the customer's coordinates AND
  // immediately flips state to 'travelling' so the customer sees progress.
  // Once already travelling/arrived/etc the button becomes passive and only
  // re-opens the map (no extra state flip).
  const onNavigateToCustomer = () => {
    if (!job) return
    const dest = (job.customer_lat != null && job.customer_lng != null)
      ? `${job.customer_lat},${job.customer_lng}`
      : job.customer_address || job.address
    if (dest) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`
      // Open in a new tab. On mobile this hands off to the Google Maps app.
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    if (job.state === 'priceConfirmed') {
      // Fire-and-forget: don't block the map open if the network is slow.
      transition('travelling')
    }
  }
  // Reached → arrived → working in a single confirm. Server's state machine
  // still requires `travelling → arrived → working`, so we chain the two
  // transitions; the customer briefly sees "arrived" and then "working" in
  // the timeline. There's no separate Start Work step anymore — the partner
  // confirms arrival and work starts immediately.
  const onReached = () => confirmAnd({
    icon: '📍', title: 'Reached Customer & Start Work?',
    message: "Confirm you're at the customer's location and ready to begin. Work will start immediately.",
    confirmText: "Yes, I'm Here",
    run: async () => {
      await transition('arrived')
      await transition('working')
    },
  })
  // M43 — Mark as Complete now uses an inline form inside JobProgressPanel
  // (see InlineCompletionForm). The form handles optional photo uploads
  // itself; once the user confirms, it calls back here to fire the actual
  // state transition. No modal/portal layer.
  const onMarkComplete = async () => {
    setBusy(true)
    try {
      await transition('completed')
    } catch (e) {
      dispatch(pushToast({ text: e?.message || 'Could not complete', type: 'error' }))
      throw e
    } finally { setBusy(false) }
  }

  // M44 — Extra-work flow has been moved INLINE into JobProgressPanel
  // (see InlineExtraWorkForm). No modal state needed at the page level.
  const onBackToWorking = () => confirmAnd({
    icon: '↩', title: 'Revert to Work Pending?',
    message: 'This will move the job back from Completed to In Progress. The payment request to the customer will be cancelled.',
    confirmText: 'Yes, Revert',
    run: () => transition('working'),
  })
  const onCancel = () => setCancelOpen(true)
  const onCancelConfirm = async ({ reason, note }) => {
    if (!job) return
    setBusy(true)
    try {
      await dispatch(cancelJobThunk({ id: job.id, reason, note })).unwrap()
      setCancelOpen(false)
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to cancel', type: 'error' })) }
    finally { setBusy(false) }
  }

  const onGoDashboard = () => {
    // Clear the active-job cache so the dashboard / work page don't keep
    // re-rendering a paid job after the partner leaves.
    if (job?.state === 'paid' || job?.state === 'cancelled') dispatch(clearActive())
    nav('/partner')
  }
  // After a paid job the partner was auto-offlined on accept — flip them
  // back online so they immediately start receiving new requests.
  const onKeepSearching = async () => {
    try { await dispatch(toggleOnlineThunk(true)).unwrap() } catch {}
    dispatch(clearActive())
    nav('/partner/requests')
  }
  const onChat = () => { if (job) nav(`/chat/${job.id}`) }

  // ── Render ──────────────────────────────────────────────────────
  if (!job) return (
    <div className="p-8">
      <div className="bg-card border border-border rounded-[var(--r)] p-10 text-center
                      shadow-card">
        <div className="text-[32px] mb-3">🔧</div>
        <div className="font-display font-extrabold text-text mb-1">No active job</div>
        <div className="text-[13px] text-muted">Accept a request to get started.</div>
      </div>
    </div>
  )

  // Paid → breakdown view with persistent success overlay on top.
  // State is server-driven, so a refresh keeps the overlay up until the
  // partner explicitly taps Dashboard or Keep Searching.
  if (job.state === 'paid') {
    return (
      <>
        <CompletedView job={job}
          onBackToWorking={onBackToWorking}
          onGoDashboard={onGoDashboard}
          busy={busy} />
        <PaymentReceivedOverlay
          amount={Number(job.agreed_price || 0)}
          customerName={job.customer_name}
          busy={busy}
          onDashboard={onGoDashboard}
          onKeepSearching={onKeepSearching} />
      </>
    )
  }

  // completed → payment breakdown view (awaiting payment)
  if (job.state === 'completed') {
    return (
      <>
        <CompletedView job={job}
          onBackToWorking={onBackToWorking}
          onGoDashboard={onGoDashboard}
          busy={busy} />
        <ConfirmModal open={!!confirm} busy={busy} {...(confirm || {})}
          onClose={() => !busy && setConfirm(null)}
          onConfirm={() => confirm?.run?.()} />
      </>
    )
  }

  // Active / Cancelled → dense 2-column layout that fits on a laptop screen
  // without outer scroll. On mobile it stacks to a single column and only
  // the page itself scrolls.
  const isCancelled = job.state === 'cancelled'
  // H41 — Call is enabled during motion + working (matches the customer
  // side). Chat is always available once the job is accepted.
  const canCallCustomer = ['travelling', 'arrived', 'working'].includes(job.state) && !!job.customer_phone
  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1400px] mx-auto px-3 md:px-5 py-3 md:py-4 space-y-3">
        {/* H41 — Prominent Call + Chat row. Same row order as the customer
            side so muscle memory transfers between roles.
            L45 — partner-side SOS sits next to it during motion states. */}
        {!isCancelled && (
          <div className="flex gap-2">
            <a href={canCallCustomer ? `tel:${job.customer_phone}` : undefined}
               onClick={(e) => { if (!canCallCustomer) e.preventDefault() }}
               aria-disabled={!canCallCustomer}
               className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5
                          rounded-[var(--rs)] font-bold text-[13px] transition
                          ${canCallCustomer
                            ? 'bg-[#2563eb] text-white hover:brightness-110'
                            : 'bg-card border border-border text-muted cursor-not-allowed'}`}>
              📞 Call customer
            </a>
            <button onClick={onChat}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5
                         rounded-[var(--rs)] bg-success text-white font-bold text-[13px]
                         hover:brightness-[1.05] transition">
              💬 Chat
            </button>
            {['travelling', 'arrived', 'working'].includes(job.state) && (
              <PartnerSosLongPress
                onActivate={() => setShareOpen(true)}
                onTap={() => dispatch(pushToast({
                  type: 'info',
                  text: 'Press and hold the SOS button to feel-unsafe.',
                }))} />
            )}
          </div>
        )}

      <div className="grid gap-3 lg:gap-4 lg:grid-cols-[1.6fr_1fr] items-start">
        {/* ── LEFT: Job Progress (stepper + live action) ── */}
        <SectionCard
          title="Job Progress"
          className="!mb-0"
          action={
            !isCancelled && (
              <div className="flex items-center gap-1.5">
                {/* Share my trip — only meaningful while location is actually
                    streaming (travelling/arrived). Lets a partner notify a
                    family member they're heading to a job site. */}
                {canShareTrip && (
                  <button onClick={() => setShareOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl
                               text-[11px] font-bold text-[#185FA5]
                               bg-[#dbeafe] hover:bg-[#bfdbfe] transition"
                    title="Share live location with a contact">
                    📍 Share my trip
                  </button>
                )}
                <button onClick={onCancel}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl
                             text-[11px] font-bold text-[#b91c1c]
                             bg-[#fee2e2] hover:bg-[#fecaca] transition">
                  ⚠ Cancel Job
                </button>
              </div>
            )
          }>
          <JobProgressPanel
            job={job}
            stepIdx={stepIdx}
            onChat={onChat}
            onUpdatePrice={onUpdatePrice}
            onNavigate={onNavigateToCustomer}
            onReached={onReached}
            onMarkComplete={onMarkComplete}
            onGoDashboard={onGoDashboard}
          />
        </SectionCard>

        {/* ── RIGHT: unified customer card (locked until priceConfirmed) ── */}
        <div className="lg:sticky lg:top-4">
          <CustomerCard
            job={job}
            onChat={onChat}
            onNavigateToCustomer={onNavigateToCustomer}
          />
        </div>
      </div>
      </div>

      <ConfirmModal open={!!confirm} busy={busy} {...(confirm || {})}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={() => confirm?.run?.()} />

      {/* Customer just confirmed the price — single-button alert that nudges
          the partner to start travelling. Backed by Modal so it portals above
          everything and dismisses on Escape / backdrop tap. */}
      <Modal open={priceAck} onClose={() => setPriceAck(false)}>
        <div className="text-center text-[36px] mb-2">✅</div>
        <h2 className="font-display font-extrabold text-lg text-text text-center mb-2">
          Price confirmed by customer
        </h2>
        <p className="text-[13px] text-muted text-center leading-[1.6] mb-6">
          {job?.customer_name || 'The customer'} confirmed
          {job?.agreed_price ? ` ₹${job.agreed_price}` : ' the price'} for {job?.service || 'the job'}.
          You can head over to the customer's location now.
        </p>
        <button onClick={() => setPriceAck(false)}
          className="w-full py-2.5 rounded-[var(--rs)] bg-accent text-white text-[13px] font-bold
                     shadow-[0_4px_16px_rgba(232,65,26,0.35)] hover:brightness-90 transition">
          Got it — Next step →
        </button>
      </Modal>

      <PriceModal open={priceOpen} busy={busy}
        initial={job.agreed_price || job.base_price}
        onSave={onSavePrice}
        onClose={() => !busy && setPriceOpen(false)} />
      <CancelReasonModal
        open={cancelOpen}
        role="partner"
        busy={busy}
        onClose={() => !busy && setCancelOpen(false)}
        onConfirm={onCancelConfirm} />
      {/* Instant popup when the *customer* cancels the job. State-driven so
          a refresh keeps it up until the partner taps Go to Dashboard. */}
      {isCancelled && job.cancelled_by === 'user' && (
        <JobCancelledByCustomerOverlay
          job={job}
          onGoDashboard={onGoDashboard} />
      )}
    </div>
  )
}

// Fullscreen red overlay for the partner when the customer cancels mid-job.
// Matches PaymentReceivedOverlay's visual language (backdrop + burst circle)
// but in the danger palette so there's no ambiguity about what happened.
function JobCancelledByCustomerOverlay ({ job, onGoDashboard }) {
  const name = job.customer_name || 'The customer'
  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-5
                    bg-[rgba(60,10,10,0.82)] backdrop-blur-[6px] animate-fadeIn">
      <div className="relative bg-card rounded-[22px] px-7 py-8 w-full max-w-[420px]
                      text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] animate-popIn
                      overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0"
             style={{ background:
               'radial-gradient(circle at 50% -10%, rgba(239,68,68,0.22), transparent 55%)' }}/>
        <div className="relative mx-auto w-[88px] h-[88px] mb-4
                        rounded-full bg-[#ef4444] grid place-items-center
                        shadow-[0_12px_32px_rgba(239,68,68,0.45)]">
          <span className="text-[40px] text-white font-display font-extrabold leading-none">✖</span>
        </div>
        <div className="relative">
          <div className="font-display font-extrabold text-[20px] text-text mb-1">
            Job cancelled
          </div>
          <div className="text-[13px] text-muted mb-3 leading-[1.55]">
            {name} cancelled the job. You can head back to the dashboard to pick up new requests.
          </div>
          {(job.cancel_reason || job.cancel_note) && (
            <div className="text-left mb-5 px-3.5 py-2.5 rounded-[var(--rs)]
                            border border-[#fecaca] bg-[#fff5f5]
                            text-[12px] text-[#7f1d1d] leading-[1.55]">
              {job.cancel_reason && (
                <div><span className="font-bold">Reason:</span> {job.cancel_reason}</div>
              )}
              {job.cancel_note && (
                <div className="mt-0.5"><span className="font-bold">Note:</span> {job.cancel_note}</div>
              )}
            </div>
          )}
          <button onClick={onGoDashboard}
            className="w-full py-3 rounded-[var(--rs)] bg-accent text-white
                       font-bold text-[13px] shadow-[0_6px_18px_rgba(232,65,26,0.35)]
                       hover:brightness-[1.05] transition">
            🏠 Go to Dashboard
          </button>
        </div>
      </div>

      {/* Partner-side share-trip modal — only renders when toggled. The button
          above only shows during travelling/arrived, so the modal can't be
          opened in a state where the server would reject the share. */}
      <PartnerShareTripModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        job={job}
      />

      {/* M43 — Completion-photo prompt is now inline inside the action
          panel (see InlineCompletionForm). No modal mount here anymore. */}

      {/* M44 — Extra-work form is now inline inside JobProgressPanel.
          No modal mount here anymore. */}

      {/* H38 — Geofence arrival prompt. Asks for confirmation rather than
          auto-firing because the partner might be looking for parking, or
          the customer's pinned lat/lng might be slightly off. */}
      {arrivePromptOpen && createPortal(
        <div onClick={dismissArrivePrompt}
             className="fixed inset-0 z-[9999] grid place-items-center p-4
                        bg-[rgba(10,15,30,0.55)] backdrop-blur-[3px] animate-pgIn">
          <div onClick={(e) => e.stopPropagation()}
               className="bg-card rounded-[20px] w-full max-w-[380px] p-6 text-center
                          shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-popIn">
            <div className="text-[40px] mb-1">📍</div>
            <h2 className="font-display font-extrabold text-[18px] text-text mb-1">
              You're at the customer
            </h2>
            <p className="text-[13px] text-muted leading-[1.55] mb-4">
              We detected you're within 80 m of the customer's address.
              Mark yourself as arrived?
            </p>
            <div className="flex gap-2">
              <button onClick={dismissArrivePrompt}
                className="flex-1 py-2.5 rounded-[var(--rs)] border border-border bg-card
                           text-text text-[13px] font-semibold hover:border-muted transition">
                Not yet
              </button>
              <button onClick={confirmArrived}
                className="flex-[2] py-2.5 rounded-[var(--rs)] bg-accent text-white
                           text-[13px] font-bold hover:brightness-90 transition">
                Yes, I'm here
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
