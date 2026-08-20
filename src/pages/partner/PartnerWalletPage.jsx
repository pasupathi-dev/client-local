// Partner wallet — pixel-close to #page-p-wallet from local.html.
//
// Sections left-col:   Hero (balance + pending + min-note + Withdraw CTA) → This Month stat → Bank status row
// Sections right-col:  Transaction history preview (10) → Withdrawal history preview (10)
//
// NOT on this page (by design): jobs-completed stat · tax export · activity history · bank form.
// Bank linking lives on /partner/bank (its own page, reached from Profile or from this bank status row).

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  loadWallet, selectWallet,
} from '@/features/partner/partnerSlice'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import ConfirmModal from '@/components/profile/ConfirmModal'
import EmptyState from '@/components/EmptyState'
import WithdrawalSpeedCard from '@/components/WithdrawalSpeedCard'

const MIN_WITHDRAW = 1500
const WALLET_PREVIEW_LIMIT = 10

const fmtRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

const relativeDateLabel = (d) => {
  const now = new Date()
  const x = new Date(d)
  const day = (dd) => new Date(dd.getFullYear(), dd.getMonth(), dd.getDate()).getTime()
  if (day(x) === day(now)) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (day(x) === day(y)) return 'Yesterday'
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const timeOf = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

// Group items by relative date label, preserving order.
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

// ── Hero ───────────────────────────────────────────────────────────────
function Hero ({ balance, pending, bank, onWithdraw, disabled }) {
  const hasBank  = !!bank
  const meetsMin = balance >= MIN_WITHDRAW
  const eligible = hasBank && meetsMin

  let noteText, noteMet = false
  if (!hasBank) {
    noteText = 'Link a bank account to enable withdrawals'
  } else if (!meetsMin) {
    const need = MIN_WITHDRAW - balance
    noteText = `Earn ${fmtRupees(need)} more to unlock withdrawals (min ₹1,500)`
  } else {
    noteText = 'Eligible to withdraw — minimum ₹1,500 met'
    noteMet  = true
  }

  return (
    <div
      className="relative rounded-[20px] p-[26px] md:p-7 lg:p-[34px] overflow-hidden shadow-cardLg
                 bg-[linear-gradient(135deg,#0f2744,#1a1a2e)]
                 dark:bg-[linear-gradient(135deg,#1a2033,#0a0f1e)]">
      {/* glow blob */}
      <div aria-hidden="true"
        className="absolute -right-10 -top-10 w-[180px] h-[180px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle at center, rgba(232,65,26,0.18), rgba(232,65,26,0.02))' }}/>

      <div className="relative z-[1]">
        <div className="text-[10px] font-bold uppercase tracking-[1px] text-white/55 mb-1.5">
          Available Balance
        </div>
        <div className="font-display font-extrabold text-white leading-none
                        text-[38px] md:text-[42px] lg:text-[48px] mb-1">
          {fmtRupees(balance)}
        </div>
        {pending > 0 && (
          <div className="inline-flex items-center gap-1.5 text-[11px] text-white/60 mt-1">
            <span>⏳</span>
            <span>+ {fmtRupees(pending)} pending clearance</span>
          </div>
        )}

        {/* Min-withdraw note */}
        <div
          className={`inline-flex items-center gap-1.5 mt-3 px-3 py-2 rounded-[10px]
                      text-[11px] font-bold border
                      ${noteMet
                        ? 'bg-[rgba(16,185,129,0.12)] border-[rgba(134,239,172,0.35)] text-[#86efac]'
                        : 'bg-white/[0.07] border-dashed border-white/20 text-white/70'}`}>
          <span>{noteMet ? '✓' : 'ℹ️'}</span>
          {noteText}
        </div>

        {/* Withdraw CTA */}
        <div className="flex gap-2.5 mt-[18px]">
          <button
            type="button"
            onClick={onWithdraw}
            disabled={disabled || !eligible}
            className={`flex-1 px-3.5 py-3 rounded-[9px] text-white text-[13px] font-bold transition
                        ${eligible
                          ? 'bg-accent shadow-[0_4px_14px_rgba(232,65,26,0.35)] hover:brightness-[1.05] hover:-translate-y-px'
                          : 'bg-white/20 text-white/50 cursor-not-allowed'}`}>
            Withdraw to Bank →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── This-month stat ────────────────────────────────────────────────────
function MonthStat ({ value }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:gap-4">
      <div className="bg-card border border-border rounded-[var(--r)] shadow-card p-4 md:p-[18px] lg:p-[22px] text-center">
        <div className="font-display font-extrabold text-[22px] md:text-[24px] lg:text-[26px] text-success">
          {fmtRupees(value)}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mt-[3px]">
          This Month
        </div>
      </div>
      {/* Placeholder filler — keeps the 2-col grid rhythm when only one stat exists */}
      <div className="hidden"/>
    </div>
  )
}

// ── Bank status row (replaces full bank form here) ─────────────────────
function BankStatusRow ({ bank, onLink, onChange }) {
  const linked = !!bank
  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card
                    flex items-center gap-3 px-4 py-3.5">
      <div className="w-[38px] h-[38px] rounded-[10px] shrink-0
                      flex items-center justify-center text-lg"
           style={{ background: '#dbeafe', color: '#1e40af' }}>
        🏦
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-extrabold text-[13px] truncate">
          {linked ? bank.bank_name : 'No bank account linked'}
        </div>
        <div className="text-[11px] text-muted truncate mt-0.5">
          {linked
            ? <>Holder: <span className="font-semibold text-text">{bank.holder}</span> · <span className="font-mono font-bold">••{bank.last4}</span></>
            : 'Set one up in Profile → Bank Account to enable withdrawals.'}
        </div>
      </div>
      {linked
        ? <button onClick={onChange}
            className="shrink-0 px-3 py-2 rounded-[9px] bg-card border-[1.5px] border-border
                       text-[11px] font-bold text-text hover:border-accent transition">
            Change
          </button>
        : <button onClick={onLink}
            className="shrink-0 px-3 py-2 rounded-[9px] bg-accent text-white
                       text-[11px] font-extrabold
                       shadow-[0_4px_14px_rgba(232,65,26,0.3)]
                       hover:brightness-[1.05] transition">
            Link Bank
          </button>}
    </div>
  )
}

// ── History row primitive ──────────────────────────────────────────────
function DayHeader ({ label }) {
  return (
    <div className="px-[18px] pt-[11px] pb-1.5 bg-surface dark:bg-brand2
                    text-[10px] font-extrabold uppercase tracking-[0.6px] text-muted">
      {label}
    </div>
  )
}

// H84 — Thin shim that re-uses the shared EmptyState so wallet/withdrawal
// empties match the rest of the app. Accepts an optional onCta in case a
// future caller wants a button (today both callers are pure empty).
function HistoryEmpty ({ icon, title, sub, ctaLabel, onCta }) {
  return (
    <EmptyState icon={icon} title={title} copy={sub}
      ctaLabel={ctaLabel} onCta={onCta} compact />
  )
}

function HistoryCard ({ title, action, children }) {
  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
      <div className="px-[18px] py-3.5 flex items-center justify-between border-b border-border">
        <span className="font-display font-bold text-[13px]">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function TxRow ({ tx, onOpen }) {
  const cleared = !!tx.cleared
  const amount  = tx.total || tx.amount
  return (
    <button onClick={() => onOpen?.(tx)}
      className="w-full flex items-center gap-3 px-[18px] py-3.5 md:px-[22px] md:py-4
                 border-b border-border last:border-b-0
                 hover:bg-surface transition-colors text-left">
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

function WdRow ({ wd }) {
  const statusMap = {
    processing: { bg: '#fef3c7', color: 'var(--warn)',  icon: '⏳', badge: 'bg-[#fef3c7] text-[#92400e]', label: 'Processing' },
    completed:  { bg: '#dbeafe', color: 'var(--text)',  icon: '🏦', badge: 'bg-[#dcfce7] text-[#166534]', label: 'Completed' },
    cancelled:  { bg: '#fee2e2', color: '#b91c1c',      icon: '✗',  badge: 'bg-[#fee2e2] text-[#b91c1c]', label: 'Cancelled' },
  }
  const s = statusMap[wd.status] || statusMap.processing
  return (
    <div className="flex items-center gap-3 px-[18px] py-3.5 md:px-[22px] md:py-4
                    border-b border-border last:border-b-0
                    hover:bg-surface transition-colors">
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0"
           style={{ background: s.bg }}>
        {s.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-text truncate flex items-center gap-1.5">
          Withdrawal to Bank
          <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-[10px]
                            text-[9px] font-extrabold uppercase tracking-[0.5px] ${s.badge}`}>
            {s.label}
          </span>
        </div>
        <div className="text-[10.5px] text-muted mt-0.5 truncate">
          {timeOf(wd.created_at)} • Ref {wd.ref || '—'}
          {wd.bank_short ? ` • ${wd.bank_short}` : ''}
        </div>
      </div>
      <div className="font-display font-extrabold text-base shrink-0"
           style={{
             color: s.color,
             textDecoration: wd.status === 'cancelled' ? 'line-through' : 'none',
           }}>
        −{fmtRupees(wd.amount)}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────
export default function PartnerWalletPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const wallet   = useSelector(selectWallet)

  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { dispatch(loadWallet()) }, [dispatch])

  const summary     = wallet?.summary || {}
  const bank        = wallet?.bank
  const txs         = (wallet?.transactions || []).slice(0, WALLET_PREVIEW_LIMIT)
  const wds         = (wallet?.withdrawals  || []).slice(0, WALLET_PREVIEW_LIMIT)
  const balance     = Number(summary.balance || 0)
  const pending     = Number(summary.pendingClearance || 0)
  const monthEarned = Number(summary.monthEarned || 0)

  const txGroups = useMemo(() => groupByDay(txs, (t) => t.created_at), [txs])
  const wdGroups = useMemo(() => groupByDay(wds, (w) => w.created_at), [wds])

  // Bumped after a successful withdraw / wallet reload so the speed card
  // re-checks eligibility (cancel rate, dispute count, etc. can have changed).
  const [eligibilityRefresh, setEligibilityRefresh] = useState(0)

  const onWithdraw = () => {
    if (!bank)                   return dispatch(pushToast({ text: 'Link a bank account first' }))
    if (balance < MIN_WITHDRAW)  return dispatch(pushToast({ text: `Need ${fmtRupees(MIN_WITHDRAW - balance)} more to withdraw` }))
    setWithdrawOpen(true)
  }

  const confirmWithdraw = async () => {
    setWithdrawOpen(false)
    setBusy(true)
    try {
      await api.withdraw(balance)
      dispatch(pushToast({ text: 'Withdrawal initiated' }))
      dispatch(loadWallet())
      setEligibilityRefresh((n) => n + 1)
    } catch (e) {
      dispatch(pushToast({ text: e.response?.data?.message || 'Failed to withdraw', type: 'error' }))
    } finally { setBusy(false) }
  }

  return (
    <div className="p-5 md:p-6 lg:p-8 animate-pgIn
                    grid grid-cols-1 md:grid-cols-[1.05fr_1fr] lg:grid-cols-[minmax(340px,1fr)_minmax(0,1.55fr)]
                    gap-[14px] md:gap-6 lg:gap-7 items-start">

      {/* LEFT column */}
      <div className="flex flex-col gap-[14px] md:gap-4 lg:gap-[18px] min-w-0">
        <Hero
          balance={balance}
          pending={pending}
          bank={bank}
          disabled={busy}
          onWithdraw={onWithdraw}
        />
        <MonthStat value={monthEarned}/>
        {/* Withdrawal speed — collapsible trust-gate breakdown. Sits between
            the month-stat and bank-status row so a partner who's just hit
            "Withdraw" sees why their request did/didn't auto-approve. */}
        <WithdrawalSpeedCard refreshKey={eligibilityRefresh} />
        <BankStatusRow
          bank={bank}
          onLink={() => nav('/partner/bank')}
          onChange={() => nav('/partner/bank')}
        />
      </div>

      {/* RIGHT column */}
      <div className="flex flex-col gap-[14px] md:gap-4 lg:gap-[18px] min-w-0">
        <HistoryCard
          title="Transaction History"
          action={
            <button
              onClick={() => nav('/partner/transactions')}
              className="text-[12px] font-extrabold text-accent px-2 py-1 rounded-lg hover:bg-accent/10 transition">
              View All <span className="text-sm">→</span>
            </button>
          }>
          {txs.length === 0
            ? <HistoryEmpty icon="💳"
                title="No transactions yet"
                sub="Once a customer pays for a completed job, the credit will appear here."/>
            : txGroups.map((g, gi) => (
              <div key={gi}>
                <DayHeader label={g.label}/>
                {g.items.map((t) => (
                  <TxRow key={t.id} tx={t}
                    onOpen={(tx) => nav(`/partner/transactions/${tx.id}`, { state: { tx } })}/>
                ))}
              </div>
            ))
          }
        </HistoryCard>

        <HistoryCard
          title="Withdrawal History"
          action={
            <button
              className="text-[12px] font-extrabold text-accent px-2 py-1 rounded-lg hover:bg-accent/10 transition">
              View All <span className="text-sm">→</span>
            </button>
          }>
          {wds.length === 0
            ? <HistoryEmpty icon="🏦"
                title="No withdrawals yet"
                sub="Once you withdraw your wallet balance to a bank account, the entry will appear here."/>
            : wdGroups.map((g, gi) => (
              <div key={gi}>
                <DayHeader label={g.label}/>
                {g.items.map((w) => (
                  <WdRow key={w.id} wd={w}/>
                ))}
              </div>
            ))
          }
        </HistoryCard>
      </div>

      {/* Confirm: withdraw */}
      <ConfirmModal
        open={withdrawOpen}
        icon="🏦"
        title="Withdraw to Bank?"
        body={
          bank ? (
            <>{fmtRupees(balance)} will be transferred to <strong className="text-text">{bank.bank_name}</strong> account
            ending in <span className="font-mono font-bold text-text">••{bank.last4}</span>. Funds typically arrive within 24 hours.</>
          ) : null
        }
        cancelLabel="Cancel"
        confirmLabel="Yes, Withdraw"
        onCancel={() => setWithdrawOpen(false)}
        onConfirm={confirmWithdraw}
      />

    </div>
  )
}
