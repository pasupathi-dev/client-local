// Quick-look modal for a scheduled booking. Used from both the user and
// partner scheduled lists — replaces the old "Chat" / "Details" buttons
// that tried to open /chat/:scheduleId (scheduled jobs don't have a chat
// thread until they're accepted AND promoted to a real job).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch } from 'react-redux'
import { formatPrice } from '@/utils/format'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'

const CAT_ICON = {
  Carpenter: '🔨', Electrician: '⚡', Plumber: '🚿', Mechanic: '🔧',
  Painter: '🎨', 'AC Repair': '❄️', Cleaning: '🧹', Tiling: '🔲',
  Welding: '🔩', 'Pest Control': '🐛', Laundry: '👕', Gardening: '🌱',
  'TV Repair': '📺', Cooking: '🍳', Driver: '🚗', Security: '🔒',
}

const formatDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?'

const STATUS_BADGE = {
  pending:   { bg: '#fef3c7', fg: '#92400e', label: '⏳ Pending Review' },
  accepted:  { bg: '#dcfce7', fg: '#166534', label: '✓ Confirmed' },
  declined:  { bg: '#fee2e2', fg: '#b91c1c', label: '✗ Declined' },
  cancelled: { bg: '#f3f4f6', fg: '#4b5563', label: '🚫 Cancelled' },
}

function Row ({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0">
      <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center
                      text-[15px] shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">{label}</div>
        <div className="text-[13px] font-semibold text-text break-words">{value}</div>
      </div>
    </div>
  )
}

// M82 — Rescheduling allowed up to 4 hours before scheduled_at. Server
// enforces the same window; this gate just hides the button when there's
// no point in showing it.
const RESCHEDULE_LOCK_MS = 4 * 60 * 60 * 1000
function canRescheduleNow (job) {
  if (!job || job.status !== 'accepted') return false
  if (!job.scheduled_at) return true        // no clock to gate on — allow
  const t = new Date(job.scheduled_at).getTime()
  if (Number.isNaN(t)) return true
  return (t - Date.now()) > RESCHEDULE_LOCK_MS
}

function ReschedulePanel ({ job, viewer, onPatched }) {
  const dispatch = useDispatch()
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy || !date || !slot) return
    setBusy(true)
    try {
      const r = await api.proposeReschedule(job.id, { date, slot, note: note.trim() || null })
      dispatch(pushToast({ text: 'Reschedule sent — waiting for the other side' }))
      onPatched?.(r?.schedule || null)
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not send', type: 'error',
      }))
    } finally { setBusy(false) }
  }

  return (
    <div className="bg-surface border-t border-border px-5 py-3 flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold text-muted">
        Propose new time
      </div>
      <div className="flex gap-2">
        <input type="date" value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input flex-1 text-[12px]" />
        <select value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="input flex-1 text-[12px]">
          <option value="">Pick a slot</option>
          <option>09:00 AM</option>
          <option>10:00 AM</option>
          <option>11:00 AM</option>
          <option>12:00 PM</option>
          <option>02:00 PM</option>
          <option>03:00 PM</option>
          <option>04:00 PM</option>
          <option>05:00 PM</option>
          <option>06:00 PM</option>
        </select>
      </div>
      <input type="text" value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder="Optional note (why this works better)"
        className="input w-full text-[12px]" />
      <div className="flex justify-end">
        <button onClick={submit} disabled={busy || !date || !slot}
          className="text-[11.5px] font-bold px-4 py-1.5 rounded-full
                     bg-accent text-white hover:brightness-90 transition
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? 'Sending…' : 'Send proposal'}
        </button>
      </div>
    </div>
  )
}

function ReschedulePendingBanner ({ job, viewer, onPatched }) {
  const dispatch = useDispatch()
  const [busy, setBusy] = useState(false)
  const myRole = viewer === 'partner' ? 'partner' : 'user'
  const iAmProposer = job.reschedule_proposed_by === myRole

  const respond = async (action) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await api.respondReschedule(job.id, action)
      dispatch(pushToast({
        text: action === 'accept' ? 'New time confirmed' : 'Reschedule declined',
      }))
      onPatched?.(r?.schedule || null)
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not respond', type: 'error',
      }))
    } finally { setBusy(false) }
  }

  return (
    <div className="px-5 py-3 bg-[#dbeafe] border-t border-b border-[#bfdbfe]">
      <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold text-[#1e40af]">
        Reschedule pending
      </div>
      <div className="text-[12.5px] font-bold text-[#1e40af] mt-0.5">
        New time: {job.reschedule_proposed_date} · {job.reschedule_proposed_slot}
      </div>
      {job.reschedule_note && (
        <div className="text-[11.5px] text-[#1e40af] opacity-90 mt-1 leading-[1.5]">
          {job.reschedule_note}
        </div>
      )}
      {iAmProposer ? (
        <div className="text-[11px] text-[#1e40af] mt-1 italic">
          Waiting for the other side to respond…
        </div>
      ) : (
        <div className="flex gap-2 mt-2">
          <button onClick={() => respond('decline')} disabled={busy}
            className="flex-1 py-1.5 rounded-full bg-card border border-[#1e40af]/30
                       text-[11.5px] font-bold text-[#1e40af]
                       hover:bg-white transition disabled:opacity-60">
            ↩️ Keep original
          </button>
          <button onClick={() => respond('accept')} disabled={busy}
            className="flex-1 py-1.5 rounded-full bg-accent text-white
                       text-[11.5px] font-bold hover:brightness-90 transition
                       disabled:opacity-60">
            ✓ Accept new time
          </button>
        </div>
      )}
    </div>
  )
}

export default function ScheduledDetailModal ({
  job: jobProp, viewer = 'customer', open, onClose,
  onAccept, onDecline, onCancel, busy,
}) {
  // Local mirror so reschedule responses can patch the modal in place
  // without forcing a full list refresh.
  const [job, setJob] = useState(jobProp)
  useEffect(() => { setJob(jobProp) }, [jobProp])

  const [rescheduleOpen, setRescheduleOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !job) return null

  const status = job.status || 'pending'
  const badge  = STATUS_BADGE[status] || STATUS_BADGE.pending
  const isTerminal = status === 'declined' || status === 'cancelled'

  const otherName = viewer === 'partner' ? job.customer_name : job.partner_name
  const otherAv   = (viewer === 'partner' ? job.customer_av_class : job.partner_av_class)
                    || hashToAv(otherName)
  const otherIni  = (viewer === 'partner' ? job.customer_initials : job.partner_initials)
                    || initialsOf(otherName)
  const icon      = job.service_icon || CAT_ICON[job.category_name] || '🧰'
  // Partner only gets directions after they start the job AND the price is
  // confirmed (handled in PartnerWorkPage). In this modal we surface the map
  // link only to the customer (showing their own saved address).
  const mapUrl    = (viewer === 'user' && job.customer_address)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.customer_address)}`
    : null

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
         className="fixed inset-0 z-[9999] flex items-end lg:items-center justify-center p-0 lg:p-4
                    bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] animate-pgIn">
      <div className="bg-card w-full max-w-[460px] rounded-t-[24px] lg:rounded-[20px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden animate-popIn">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center
                             font-bold text-[14px] shrink-0 ${otherAv}`}>
              {otherIni}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-[16px] text-text truncate">
                {otherName || (viewer === 'partner' ? 'Customer' : 'Partner')}
              </div>
              <div className="text-[11px] text-muted">
                {icon} {job.service || job.category_name}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="w-8 h-8 rounded-full bg-surface border border-border
                         text-muted text-[16px] hover:text-text hover:border-muted transition">✕</button>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center px-2 py-[3px] rounded-xl text-[10px] font-bold"
                  style={{ background: badge.bg, color: badge.fg }}>
              {badge.label}
            </span>
            <span className="text-[11px] font-bold text-[#3b82f6]">
              📅 {formatDate(job.schedule_date)}{job.time_slot ? ` · ${job.time_slot}` : ''}
            </span>
          </div>
        </div>

        {/* M82 — pending reschedule banner. Visible above the row list so
            both sides see it the moment the modal opens. */}
        {job.reschedule_proposed_at && (
          <ReschedulePendingBanner job={job} viewer={viewer}
            onPatched={(fresh) => fresh && setJob(fresh)} />
        )}

        {/* Body */}
        <div className="px-5 py-2 max-h-[60vh] overflow-y-auto">
          <Row icon="💰" label="Base price" value={formatPrice(job.base_price)} />
          {/* Address + phone are NOT shown to the partner here. Customer
              location and contact are only revealed inside the active-job
              flow once the price is confirmed (PartnerWorkPage gate). */}
          {viewer === 'user' && (
            <Row icon="🏠" label="Service address" value={job.customer_address} />
          )}
          {viewer === 'partner' && job.status === 'pending' && (
            <Row icon="🔒" label="Customer location"
                 value={<span className="text-[#92400e]">Shared after you accept and the price is confirmed</span>} />
          )}
          {job.notes && <Row icon="📝" label="Notes" value={job.notes} />}
          {job.cancel_reason && (
            <Row icon="⚠️" label={status === 'declined' ? 'Decline reason' : 'Cancel reason'}
                 value={job.cancel_reason} />
          )}
        </div>

        {/* Actions */}
        {!isTerminal && (
          <div className="px-5 py-4 border-t border-border flex gap-2 flex-wrap">
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-[120px] py-2.5 rounded-[var(--rs)] border-[1.5px] border-dashed
                           border-accent text-accent text-[12px] font-bold text-center
                           hover:bg-accent hover:text-white transition">
                🗺 Open in Maps
              </a>
            )}
            {viewer === 'partner' && status === 'pending' && (
              <>
                <button onClick={() => onDecline?.(job)} disabled={busy}
                  className="flex-1 min-w-[110px] py-2.5 rounded-[var(--rs)]
                             border-[1.5px] border-[#fee2e2] bg-card text-[#ef4444]
                             text-[12px] font-bold hover:border-[#ef4444] transition
                             disabled:opacity-60">
                  ✗ Decline
                </button>
                <button onClick={() => onAccept?.(job)} disabled={busy}
                  className="flex-[1.4] py-2.5 rounded-[var(--rs)] bg-success text-white
                             text-[12px] font-bold hover:brightness-90 transition
                             disabled:opacity-60">
                  ✓ Accept
                </button>
              </>
            )}
            {status === 'accepted' && (
              <>
                {/* M82 — Reschedule, gated on the 4-hour window. */}
                {canRescheduleNow(job) && !job.reschedule_proposed_at && (
                  <button onClick={() => setRescheduleOpen((v) => !v)} disabled={busy}
                    className="flex-1 py-2.5 rounded-[var(--rs)]
                               border-[1.5px] border-border bg-card text-text
                               text-[12px] font-bold hover:border-accent hover:text-accent transition
                               disabled:opacity-60">
                    🔁 Reschedule
                  </button>
                )}
                <button onClick={() => onCancel?.(job)} disabled={busy}
                  className="flex-1 py-2.5 rounded-[var(--rs)]
                             border-[1.5px] border-[#fee2e2] bg-card text-[#ef4444]
                             text-[12px] font-bold hover:border-[#ef4444] transition
                             disabled:opacity-60">
                  ✗ Cancel booking
                </button>
              </>
            )}
            {viewer === 'customer' && status === 'pending' && (
              <button onClick={() => onCancel?.(job)} disabled={busy}
                className="flex-1 py-2.5 rounded-[var(--rs)]
                           border-[1.5px] border-[#fee2e2] bg-card text-[#ef4444]
                           text-[12px] font-bold hover:border-[#ef4444] transition
                           disabled:opacity-60">
                ✗ Cancel booking
              </button>
            )}
          </div>
        )}

        {/* M82 — inline reschedule form */}
        {rescheduleOpen && status === 'accepted' && !job.reschedule_proposed_at && (
          <ReschedulePanel job={job} viewer={viewer}
            onPatched={(fresh) => {
              if (fresh) setJob(fresh)
              setRescheduleOpen(false)
            }} />
        )}
      </div>
    </div>,
    document.body,
  )
}
