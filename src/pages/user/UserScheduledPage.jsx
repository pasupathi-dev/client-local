// Customer's Scheduled Jobs list — pixel-matches local.html#page-user-scheduled.
// Filters: All · Upcoming (accepted) · History (declined + cancelled).

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  loadSchedules, cancelScheduleThunk,
  selectScheduleList, selectScheduleLoading,
} from '@/features/schedule/scheduleSlice'
import ScheduledJobCard from '@/components/ScheduledJobCard'
import ScheduledDetailModal from '@/components/ScheduledDetailModal'
import Loader from '@/components/Loader'
import { CardSkeleton } from '@/components/Skeleton'
import { pushToast } from '@/features/app/appSlice'

export default function UserScheduledPage () {
  const dispatch = useDispatch()
  const list     = useSelector(selectScheduleList)
  const loading  = useSelector(selectScheduleLoading)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState(null)

  useEffect(() => { dispatch(loadSchedules('customer')) }, [dispatch])

  // Filters + header removed by design — show every schedule.
  const visible = list

  const onCancel = async (j) => {
    if (busy) return
    // Cancellation confirmed by the card's own cancel button click
    setBusy(true)
    try {
      await dispatch(cancelScheduleThunk({ id: j.id, reason: 'Customer cancelled' })).unwrap()
      setDetail(null)
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to cancel', type: 'error' })) }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1200px] mx-auto p-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && list.length === 0 && (
          <div className="col-span-full"><CardSkeleton count={3} /></div>
        )}
        {!loading && visible.length === 0 && (
          <div className="col-span-full bg-card border border-border rounded-[var(--r)]
                          py-12 px-6 text-center">
            <div className="text-[40px] mb-2">📅</div>
            <div className="font-display font-extrabold text-text mb-1">
              No scheduled jobs yet
            </div>
            <div className="text-[12px] text-muted">
              Book a service from any partner's profile to schedule for later.
            </div>
          </div>
        )}
        {visible.map((j) => (
          <ScheduledJobCard key={j.id} job={j} viewer="customer" busy={busy}
            onCancel={onCancel} onView={setDetail} />
        ))}
      </div>

      <ScheduledDetailModal open={!!detail} job={detail} viewer="customer"
        busy={busy} onClose={() => setDetail(null)} onCancel={onCancel} />
    </div>
  )
}
