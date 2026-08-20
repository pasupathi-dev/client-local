// Full transaction history — accessible via the Wallet page's
// "View All →" button. Lists every wallet credit grouped by day.
// Tapping a row opens the end-to-end job detail at
// /partner/transactions/:id.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '@/services/api'
import Loader from '@/components/Loader'
import EmptyState from '@/components/EmptyState'
import ListError from '@/components/ListError'
import { RowSkeleton } from '@/components/Skeleton'

const fmtRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

const relativeDateLabel = (d) => {
  const now = new Date()
  const x = new Date(d)
  const day = (dd) => new Date(dd.getFullYear(), dd.getMonth(), dd.getDate()).getTime()
  if (day(x) === day(now)) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (day(x) === day(y)) return 'Yesterday'
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const timeOf = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

const groupByDay = (items, getDate) => {
  const groups = []
  let cur = null
  items.forEach((it) => {
    const label = relativeDateLabel(getDate(it))
    if (!cur || cur.label !== label) {
      cur = { label, items: [] }
      groups.push(cur)
    }
    cur.items.push(it)
  })
  return groups
}

function TxRow ({ tx, onOpen }) {
  const cleared = !!tx.cleared
  const amount  = tx.total || tx.amount
  return (
    <button onClick={() => onOpen(tx)}
      className="w-full flex items-center gap-3 px-[18px] py-3.5 md:px-[22px] md:py-4
                 border-b border-border last:border-b-0 hover:bg-surface transition-colors text-left">
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0"
           style={{ background: cleared ? '#dcfce7' : '#fef3c7' }}>
        {cleared ? '💰' : '⏳'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-text truncate">
          {tx.service || 'Credit'}{tx.customer_name ? ` — ${tx.customer_name}` : ''}
        </div>
        <div className="text-[10.5px] text-muted mt-0.5">
          {timeOf(tx.created_at)} • {cleared ? 'Credited ✓' : 'Pending clearance'}
        </div>
      </div>
      <div className="font-display font-extrabold text-base shrink-0"
           style={{ color: cleared ? 'var(--success)' : 'var(--warn)' }}>
        {cleared ? `+${fmtRupees(amount)}` : fmtRupees(amount)}
      </div>
      <span className="text-muted shrink-0 ml-1">›</span>
    </button>
  )
}

export default function PartnerTransactionsPage () {
  const nav = useNavigate()
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  // H85 — track fetch failure so we can render <ListError onRetry/>.
  const [loadError, setLoadError] = useState(null)

  const load = () => {
    let cancelled = false
    setLoading(true); setLoadError(null)
    api.fetchTransactions()
      .then((r) => { if (!cancelled) setTxs(r.transactions || []) })
      .catch((err) => {
        if (cancelled) return
        setTxs([])
        setLoadError(err?.response?.data?.message || 'Could not load transactions')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }
  useEffect(() => load(), [])

  const groups = useMemo(() => groupByDay(txs, (t) => t.created_at), [txs])

  const totals = useMemo(() => {
    const cleared = txs.filter((t) => t.cleared).reduce((a, t) => a + Number(t.total || t.amount || 0), 0)
    const pending = txs.filter((t) => !t.cleared).reduce((a, t) => a + Number(t.total || t.amount || 0), 0)
    return { cleared, pending, count: txs.length }
  }, [txs])

  const onOpen = (tx) => nav(`/partner/transactions/${tx.id}`, { state: { tx } })

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[900px] mx-auto p-5 md:p-7">
        {/* Back + title */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)}
            className="w-9 h-9 rounded-full bg-card border border-border
                       flex items-center justify-center hover:border-accent transition">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[18px] text-text">Transaction History</div>
            <div className="text-[11px] text-muted">All credits from completed jobs</div>
          </div>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label="Total Credits" value={fmtRupees(totals.cleared)} color="text-success" />
          <Stat label="Pending" value={fmtRupees(totals.pending)} color="text-[#f59e0b]" />
          <Stat label="Jobs" value={totals.count} color="text-text" />
        </div>

        {/* List */}
        <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
          {/* M86 — row skeletons mirror the eventual transaction rows */}
          {loading && <div className="p-3"><RowSkeleton count={4} /></div>}
          {/* H85 — fetch failed: retry without leaving the page */}
          {!loading && loadError && txs.length === 0 && (
            <ListError onRetry={load} message={loadError} compact />
          )}
          {/* H84 — empty state with action: take partner online */}
          {!loading && !loadError && txs.length === 0 && (
            <EmptyState
              icon="💳"
              title="No transactions yet"
              copy="Once a customer pays for a completed job, the credit will appear here."
              ctaLabel="Go to dashboard"
              onCta={() => nav('/partner')}
              compact
            />
          )}
          {!loading && groups.map((g, gi) => (
            <div key={gi}>
              <div className="px-[18px] pt-[11px] pb-1.5 bg-surface
                              text-[10px] font-extrabold uppercase tracking-[0.6px] text-muted">
                {g.label}
              </div>
              {g.items.map((t) => <TxRow key={t.id} tx={t} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat ({ label, value, color }) {
  return (
    <div className="bg-card border border-border rounded-[var(--rs)] p-3 text-center shadow-card">
      <div className={`font-display font-extrabold text-[16px] leading-none ${color}`}>{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-[0.5px] text-muted mt-1">{label}</div>
    </div>
  )
}
