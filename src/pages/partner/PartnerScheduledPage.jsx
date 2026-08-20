// Partner's Scheduled Jobs list — pixel-matches local.html#page-p-scheduled.
// Header summary (Upcoming / Pending Review counts), filter chips,
// card grid with pending / accepted / history states.

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  loadSchedules,
  acceptScheduleThunk, declineScheduleThunk, cancelScheduleThunk, startScheduleThunk,
  selectScheduleList, selectScheduleLoading,
} from '@/features/schedule/scheduleSlice'
import { pushToast } from '@/features/app/appSlice'
import ScheduledJobCard from '@/components/ScheduledJobCard'
import ScheduledDetailModal from '@/components/ScheduledDetailModal'
import PartnerScheduleCalendar from '@/components/PartnerScheduleCalendar'
import Loader from '@/components/Loader'
import { CardSkeleton } from '@/components/Skeleton'
import { useNavigate } from 'react-router-dom'

export default function PartnerScheduledPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const list     = useSelector(selectScheduleList)
  const loading  = useSelector(selectScheduleLoading)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState(null)
  // H81 — view toggle. List is the default (existing behaviour); Calendar
  // is the new week/day picker. Stored in localStorage so the partner's
  // preferred view sticks across sessions.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('sl_partner_sched_view') || 'list' }
    catch { return 'list' }
  })
  const pickView = (v) => {
    setView(v)
    try { localStorage.setItem('sl_partner_sched_view', v) } catch { /* private mode */ }
  }

  useEffect(() => { dispatch(loadSchedules('partner')) }, [dispatch])

  // Pending bookings live in the Requests page until the partner accepts.
  // Once accepted, they move into the Scheduled section here.
  const visible = list.filter((j) => j.status === 'accepted' || j.status === 'converted')

  const onStart = async (j) => {
    if (busy) return
    setBusy(true)
    try {
      await dispatch(startScheduleThunk(j.id)).unwrap()
      setDetail(null)
      nav('/partner/work')
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Could not start job', type: 'error' })) }
    finally { setBusy(false) }
  }

  const onAccept = async (j) => {
    if (busy) return
    setBusy(true)
    try {
      await dispatch(acceptScheduleThunk(j.id)).unwrap()
      setDetail(null)
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to accept', type: 'error' })) }
    finally { setBusy(false) }
  }
  const onDecline = async (j) => {
    if (busy) return
    setBusy(true)
    try {
      await dispatch(declineScheduleThunk({ id: j.id, reason: 'Not available' })).unwrap()
      setDetail(null)
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to decline', type: 'error' })) }
    finally { setBusy(false) }
  }
  const onCancel = async (j) => {
    if (busy) return
    setBusy(true)
    try {
      await dispatch(cancelScheduleThunk({ id: j.id, reason: 'Partner cancelled' })).unwrap()
      setDetail(null)
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to cancel', type: 'error' })) }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1400px] mx-auto p-5 md:p-7">
        {/* H81 — view toggle */}
        <div className="flex items-center justify-end gap-2 mb-4">
          <div className="inline-flex rounded-full bg-card border border-border p-0.5">
            <button onClick={() => pickView('list')}
              className={`text-[11.5px] font-bold px-3 py-1.5 rounded-full transition
                          ${view === 'list'
                            ? 'bg-accent text-white shadow-[0_4px_12px_rgba(232,65,26,0.25)]'
                            : 'text-muted hover:text-text'}`}>
              📋 List
            </button>
            <button onClick={() => pickView('calendar')}
              className={`text-[11.5px] font-bold px-3 py-1.5 rounded-full transition
                          ${view === 'calendar'
                            ? 'bg-accent text-white shadow-[0_4px_12px_rgba(232,65,26,0.25)]'
                            : 'text-muted hover:text-text'}`}>
              📅 Calendar
            </button>
          </div>
        </div>

        {view === 'calendar' ? (
          <PartnerScheduleCalendar jobs={visible} onPick={setDetail} />
        ) : (
          <div className="grid gap-3.5 md:gap-4 lg:gap-5
                          grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {loading && list.length === 0 && (
              <div className="col-span-full"><CardSkeleton count={4} /></div>
            )}
            {!loading && visible.length === 0 && (
              <div className="col-span-full bg-card border border-border rounded-[var(--r)]
                              py-14 px-6 text-center">
                <div className="text-[40px] mb-2">📅</div>
                <div className="font-display font-extrabold text-text mb-1">
                  No scheduled bookings yet
                </div>
                <div className="text-[12px] text-muted">
                  New bookings from customers will appear here.
                </div>
              </div>
            )}
            {visible.map((j) => (
              <ScheduledJobCard key={j.id} job={j} viewer="partner" busy={busy}
                onAccept={onAccept} onDecline={onDecline} onCancel={onCancel}
                onStart={onStart} onView={setDetail} />
            ))}
          </div>
        )}
      </div>

      <ScheduledDetailModal open={!!detail} job={detail} viewer="partner"
        busy={busy} onClose={() => setDetail(null)}
        onAccept={onAccept} onDecline={onDecline} onCancel={onCancel} />
    </div>
  )
}
