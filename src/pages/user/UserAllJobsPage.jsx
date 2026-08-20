// Customer's full job history.
//
// Design notes:
//   - No more page-style pagination. Scroll to the bottom → next 10 fetched.
//   - All filtering is server-side (/api/jobs/mine supports status, q, from,
//     to, limit, offset). The client never does a local .filter().
//   - Search is debounced 300ms; chip + date-range changes fire immediately.
//   - Authoritative total count comes from the server and is shown next to
//     the title — reflects the *current* filter, not the whole table.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '@/services/api'
import { formatPrice } from '@/utils/format'
import Loader from '@/components/Loader'
import { RowSkeleton } from '@/components/Skeleton'
import ListFilterBar from '@/components/ListFilterBar'
import useInfiniteList from '@/hooks/useInfiniteList'

const PAGE_SIZE = 10

const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'Active' },
  { id: 'history',   label: 'Completed' },
  { id: 'paid',      label: 'Paid' },
  { id: 'cancelled', label: 'Cancelled' },
]

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

const toApiFrom = (s) => (s ? `${s}T00:00:00.000Z` : undefined)
const toApiTo   = (s) => (s ? `${s}T23:59:59.999Z` : undefined)

// Today as YYYY-MM-DD for the date-picker `max` — no future selections.
const todayStr = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const STATE_BADGE = {
  paid:      { bg: '#dcfce7', fg: '#166534', label: 'Paid' },
  cancelled: { bg: '#fee2e2', fg: '#b91c1c', label: 'Cancelled' },
  completed: { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting payment' },
  working:   { bg: '#fef3c7', fg: '#92400e', label: 'Working' },
  arrived:   { bg: '#fef3c7', fg: '#92400e', label: 'Arrived' },
  travelling:{ bg: '#dbeafe', fg: '#1e40af', label: 'Travelling' },
  accepted:  { bg: '#fef3c7', fg: '#92400e', label: 'Active' },
  priceConfirmed:{ bg: '#fef3c7', fg: '#92400e', label: 'Active' },
}

export default function UserAllJobsPage () {
  const nav = useNavigate()
  const [qp, setQp] = useSearchParams()

  const status = qp.get('status') || 'all'
  const q      = qp.get('q') || ''
  const from   = qp.get('from') || ''
  const to     = qp.get('to')   || ''

  // Search is debounced into the URL so refreshes preserve the query but
  // typing doesn't hammer the server.
  const [searchInput, setSearchInput] = useState(q)
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(qp)
      if (searchInput.trim()) next.set('q', searchInput.trim())
      else next.delete('q')
      setQp(next, { replace: true })
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const params = useMemo(() => ({
    status,
    q: q || undefined,
    from: toApiFrom(from),
    to:   toApiTo(to),
  }), [status, q, from, to])

  const fetchPage = useMemo(() => async (p) => {
    const r = await api.fetchMyJobs('user', p)
    return { rows: r.jobs || [], total: Number(r.total || 0) }
  }, [])

  const { items: jobs, total, loading, loadingMore, sentinelRef, hasMore } =
    useInfiniteList({ fetchPage, params, pageSize: PAGE_SIZE })

  const setStatus = (id) => {
    const next = new URLSearchParams(qp)
    if (id === 'all') next.delete('status')
    else next.set('status', id)
    setQp(next, { replace: true })
  }
  const setFrom = (v) => { const n = new URLSearchParams(qp); v ? n.set('from', v) : n.delete('from'); setQp(n, { replace: true }) }
  const setTo   = (v) => { const n = new URLSearchParams(qp); v ? n.set('to', v)   : n.delete('to');   setQp(n, { replace: true }) }
  const clearDates = () => {
    const n = new URLSearchParams(qp); n.delete('from'); n.delete('to'); setQp(n, { replace: true })
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1000px] mx-auto px-5 md:px-7 py-5">
        <ListFilterBar
          title="All My Jobs"
          total={total} totalLabel="jobs" loading={loading}
          onBack={() => nav(-1)}
          search={searchInput} onSearchChange={setSearchInput}
          searchPlaceholder="Search by service, partner, or category"
          chipOptions={FILTERS} chipValue={status} onChipChange={setStatus}
          from={from} to={to}
          onFromChange={setFrom} onToChange={setTo} onClearDates={clearDates}
          maxDate={todayStr()} />

        {/* List */}
        {loading && jobs.length === 0 ? (
          <RowSkeleton count={6} />
        ) : jobs.length === 0 ? (
          <div className="bg-card border border-border rounded-[var(--r)] py-12 text-center">
            <div className="text-[32px] mb-1 opacity-50">📭</div>
            <div className="font-display font-extrabold text-[14px] text-text">No jobs match</div>
            <div className="text-[11px] text-muted mt-1">
              Try a different filter or clear the date range.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((j) => <JobRow key={j.id} j={j} nav={nav} />)}
          </div>
        )}

        {/* Infinite-scroll sentinel + bottom loader */}
        {hasMore && (
          <div ref={sentinelRef} className="py-4 flex justify-center">
            {loadingMore
              ? <Loader size={18} />
              : <span className="text-[11px] text-muted">Scroll for more…</span>}
          </div>
        )}

        {!hasMore && jobs.length > 0 && (
          <div className="py-4 text-center text-[11px] text-muted">
            That's everything ({total})
          </div>
        )}
      </div>
    </div>
  )
}

function JobRow ({ j, nav }) {
  const icon = j.service_icon || '🧰'
  const name = j.partner_name || '—'
  const price = Number(j.agreed_price || j.base_price || 0)
  const badge = STATE_BADGE[j.state] || { bg: '#e5e7eb', fg: '#374151', label: j.state }
  return (
    <button onClick={() => nav(`/my-jobs/${j.id}`)}
      className="bg-card border border-border rounded-[var(--r)] p-3.5 flex items-center gap-3
                 hover:border-accent transition text-left">
      <div className="w-10 h-10 rounded-lg bg-surface grid place-items-center text-[18px] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-text truncate">
          {j.service || j.category_name} — {name}
        </div>
        <div className="text-[11px] text-muted truncate">
          {fmtDate(j.completed_at || j.created_at)} · {formatPrice(price)}
        </div>
      </div>
      <span className="inline-flex items-center px-2 py-[3px] rounded-xl text-[10px] font-bold"
            style={{ background: badge.bg, color: badge.fg }}>
        {badge.label}
      </span>
      <span className="text-muted ml-1">›</span>
    </button>
  )
}
