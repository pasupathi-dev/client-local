// M83 — Partner day-off block card. Mounted in Settings (partner only).
//
// Lists every blocked date the partner has saved, with a date picker to
// add a new one and a per-row delete. Customers hitting a blocked date on
// the booking flow get a friendly 409 from the server; the picker on the
// customer side calls /api/partners/:id/blocked-dates to grey out those
// days before they even pick.

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import ConfirmModal from '@/components/profile/ConfirmModal'

function fmt (date) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return String(date)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// Today as YYYY-MM-DD for the date-input min attribute. Local-time math
// so the picker won't allow yesterday because of a UTC slip.
function todayISO () {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default function BlockedDatesCard () {
  const dispatch = useDispatch()
  const [list, setList]   = useState(null)
  const [date, setDate]   = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy]   = useState(false)
  // M88 — Row pending unblock-confirmation. Replaces window.confirm().
  const [pendingRemove, setPendingRemove] = useState(null)

  const load = async () => {
    try {
      const r = await api.fetchMyBlockedDates()
      setList(r?.blocked || [])
    } catch { setList([]) }
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!date || busy) return
    setBusy(true)
    try {
      await api.addBlockedDate({ date, reason: reason.trim() || null })
      setDate(''); setReason('')
      await load()
      dispatch(pushToast({ text: 'Date blocked' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not block date',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  // M88 — Two-step unblock with in-app confirm.
  const remove = (row) => setPendingRemove(row)
  const confirmRemove = async () => {
    const row = pendingRemove
    if (!row || busy) return
    setBusy(true)
    try {
      await api.removeBlockedDate(row.id)
      await load()
      dispatch(pushToast({ text: 'Date unblocked' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not unblock',
        type: 'error',
      }))
    } finally {
      setBusy(false)
      setPendingRemove(null)
    }
  }

  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-border flex items-center gap-2">
        <span className="text-[17px]" aria-hidden>🚫</span>
        <div className="font-display font-bold text-[13px] lg:text-[14px] text-text">
          Block dates
        </div>
      </div>

      {/* Add row */}
      <div className="px-[18px] py-3 border-b border-border flex flex-col gap-2">
        <div className="flex gap-2">
          <input type="date" value={date}
            min={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="input flex-1 text-[12.5px]" />
          <button onClick={add} disabled={busy || !date}
            className="text-[11.5px] font-bold px-4 py-1.5 rounded-full
                       bg-accent text-white hover:brightness-90 transition
                       disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? '…' : 'Block'}
          </button>
        </div>
        <input type="text" value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 200))}
          placeholder="Reason (optional, e.g. travel)"
          className="input w-full text-[12px]" />
        <div className="text-[10.5px] text-muted leading-[1.5]">
          Customers won't see scheduling slots on these days.
        </div>
      </div>

      {/* List */}
      {list === null && (
        <div className="px-[18px] py-5 text-center text-[12px] text-muted">Loading…</div>
      )}
      {list?.length === 0 && (
        <div className="px-[18px] py-5 text-center text-[12px] text-muted">
          No blocked dates yet.
        </div>
      )}
      {list?.map((row) => (
        <div key={row.id} className="flex items-center gap-3 px-[18px] py-3 border-t border-border first:border-t-0">
          <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[17px] shrink-0
                          bg-surface text-text">📅</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-text">{fmt(row.blocked_date)}</div>
            {row.reason && (
              <div className="text-[11px] text-muted mt-0.5 truncate">{row.reason}</div>
            )}
          </div>
          <button onClick={() => remove(row)} disabled={busy}
            className="text-[11px] font-bold text-muted hover:text-[#dc2626] transition disabled:opacity-60">
            Remove
          </button>
        </div>
      ))}

      {/* M88 — In-app confirm replaces window.confirm. */}
      <ConfirmModal
        open={!!pendingRemove}
        icon="📅"
        variant="danger"
        title="Unblock this date?"
        body={pendingRemove ? `${fmt(pendingRemove.blocked_date)} will be bookable again.` : ''}
        cancelLabel="Keep blocked"
        confirmLabel={busy ? 'Unblocking…' : 'Unblock'}
        onCancel={() => !busy && setPendingRemove(null)}
        onConfirm={confirmRemove} />
    </div>
  )
}
