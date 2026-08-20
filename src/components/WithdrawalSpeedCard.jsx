// Collapsible "Withdrawal speed" panel — fetches the trust-gate breakdown
// from GET /api/wallet/payout-eligibility and shows the partner what's
// blocking auto-payout (or a green confirmation when nothing is).
//
// Self-contained: drop it on the Wallet page, no extra props beyond an
// optional refresh-trigger key (so the host can refetch after a withdrawal
// or any other balance-changing event).

import { useEffect, useState } from 'react'
import * as api from '@/services/api'
import Loader from '@/components/Loader'

export default function WithdrawalSpeedCard ({ refreshKey = 0, defaultOpen = true }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState(defaultOpen)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.fetchPayoutEligibility()
      .then((r) => { if (!cancelled) setData(r) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  // Visual treatment: green when eligible, amber when blocked, neutral while
  // loading or on error so the page never flashes red.
  const eligible = !!data?.eligible
  const tone = eligible
    ? { bg: '#dcfce7', fg: '#166534', dot: '#16a34a', stripe: '#16a34a' }
    : { bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b', stripe: '#f59e0b' }

  const headline = eligible
    ? 'Auto-paid in seconds'
    : 'Manual review (1–2 business days)'
  const sub = eligible
    ? 'You\'ve earned trusted-partner status. Withdrawals skip the admin queue and land in your bank instantly.'
    : 'A few criteria still to clear before withdrawals auto-approve.'

  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
      {/* Top stripe — green or amber, doubles as a status indicator while
          the panel is collapsed. */}
      <div className="h-1 w-full" style={{ background: loading ? '#e5e7eb' : tone.stripe }} />

      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 md:px-5 py-3.5
                   hover:bg-surface transition focus:outline-none">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[14px]"
             style={{ background: loading ? '#e5e7eb' : tone.bg, color: tone.fg }}>
          {loading ? '…' : (eligible ? '✓' : '⏳')}
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-[13px] font-bold text-text m-0">Withdrawal speed</p>
          <p className="text-[11px] text-muted m-0 mt-0.5 truncate">
            {loading ? 'Checking eligibility…' : headline}
          </p>
        </div>
        <span className={`text-muted text-[14px] transition-transform shrink-0
                          ${open ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {open && (
        <div className="px-4 md:px-5 pb-4 pt-1">
          {loading ? (
            <div className="py-6 text-center text-muted text-sm">
              <Loader size={14} /> Loading eligibility…
            </div>
          ) : !data ? (
            <p className="text-[12px] text-muted m-0">
              Couldn't load eligibility right now. Try refreshing.
            </p>
          ) : eligible ? (
            <EligibleBody data={data} sub={sub} />
          ) : (
            <BlockedBody data={data} sub={sub} />
          )}
        </div>
      )}
    </div>
  )
}

function EligibleBody ({ data, sub }) {
  return (
    <>
      <p className="text-[12px] text-muted m-0 mb-3 leading-[1.55]">{sub}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Jobs done"      value={data.jobs_completed} />
        <Stat label="Cancels (7d)"   value={data.recent_cancels} good={data.recent_cancels === 0} />
        <Stat label="Disputes (30d)" value={data.dispute_count}  good={data.dispute_count === 0} />
      </div>
      <div className="mt-3 bg-[#dcfce7] dark:bg-[#064e3b] border border-[#bbf7d0] dark:border-[#065f46]
                      text-[#166534] dark:text-[#86efac]
                      rounded-[var(--rs)] px-3 py-2.5 flex items-start gap-2">
        <span className="text-[14px] leading-none mt-0.5">✓</span>
        <p className="text-[11px] m-0 leading-[1.55] font-bold">
          Trusted partner — your next withdrawal lands in your bank in seconds.
        </p>
      </div>
    </>
  )
}

function BlockedBody ({ data, sub }) {
  return (
    <>
      <p className="text-[12px] text-muted m-0 mb-3 leading-[1.55]">{sub}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Jobs done"
              value={`${data.jobs_completed}/${data.jobs_threshold + 1}`}
              good={data.jobs_completed > data.jobs_threshold} />
        <Stat label="Cancels (7d)"   value={data.recent_cancels} good={data.recent_cancels === 0} />
        <Stat label="Disputes (30d)" value={data.dispute_count}  good={data.dispute_count === 0} />
      </div>

      {data.blockers?.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 m-0 p-0 list-none">
          {data.blockers.map((b) => (
            <li key={b.key}
                className="bg-[#fffbeb] dark:bg-[#2d1f05]
                           border border-[#fcd34d] dark:border-[#78350f]
                           rounded-[var(--rs)] px-3 py-2.5
                           flex items-start gap-2.5">
              <span className="text-[14px] leading-none mt-0.5"
                    style={{ color: '#92400e' }}>⚠️</span>
              <div className="min-w-0">
                <p className="text-[12px] font-bold m-0"
                   style={{ color: '#92400e' }}>{b.label}</p>
                {b.action && (
                  <p className="text-[11px] m-0 mt-0.5"
                     style={{ color: '#78350f' }}>{b.action}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-muted m-0 mt-3 leading-[1.55]">
        Until then, your withdrawals go to admin review and typically land in your bank within
        1–2 business days.
      </p>
    </>
  )
}

function Stat ({ label, value, good }) {
  const color = good === true ? '#16a34a' : good === false ? '#92400e' : 'var(--text)'
  return (
    <div className="bg-surface border border-border rounded-[var(--rs)] px-2.5 py-2 text-center">
      <p className="font-display font-extrabold text-[16px] m-0 leading-none" style={{ color }}>
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-[0.4px] font-bold text-muted m-0 mt-1">
        {label}
      </p>
    </div>
  )
}
