// Partner dashboard — rebuilt against the warm-beige bento mock.
//
// Layout (≥lg, 12-col bento):
//   ┌─────────────────────────────┬───────────────┐
//   │  Status Hero (col 8, dark)  │   KPI stack   │
//   │                             │   (col 4)     │
//   ├─────────────────────────────┴───────────────┤
//   │  Earnings — last 7 days (col 8)  │ Upcoming  │
//   ├──────────────────────────────────┴───────────┤
//   │  Today's jobs (col 12)                       │
//   └──────────────────────────────────────────────┘
//
// All data sources, Redux selectors, side effects, gating logic, location
// flow, stuck-job detection, and KYC banner behavior are preserved 1:1
// from the previous implementation — only the visual structure changed.

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  loadMyPartner, loadDashboard, loadLiveRequests, loadWallet,
  toggleOnlineThunk,
  selectPartnerProfile, selectPartnerOnline, selectIncoming, selectWallet,
} from '@/features/partner/partnerSlice'
import { fetchActiveJobThunk, selectActiveJob } from '@/features/jobs/jobsSlice'
import { getSocket } from '@/services/socket'
import * as api from '@/services/api'
import useLocation from '@/hooks/useLocation'
import LocationPromptModal from '@/components/LocationPromptModal'
import ConfirmModal from '@/components/profile/ConfirmModal'
import ActiveJobBanner from '@/components/ActiveJobBanner'
import LocationEditChip from '@/components/LocationEditChip'
import { pushToast } from '@/features/app/appSlice'

// ── Utils ─────────────────────────────────────────────────────────────
const fmtRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const isSameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const getLast7Days = () => {
  const days = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i)
    days.push({
      iso: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3),
      total: 0,
    })
  }
  return days
}

// Map a service/category name to one of the colored job-icon palettes that
// the mock uses on the today's-jobs list. Falls back to "carp" (warm tan).
const ICON_PALETTE = {
  'AC Repair':   'ac',
  'AC':          'ac',
  'Carpenters':  'carp',
  'Carpenter':   'carp',
  'Electrician': 'elec',
  'Electrical':  'elec',
  'Plumber':     'plumb',
  'Plumbing':    'plumb',
}
const paletteFor = (name = '') => ICON_PALETTE[name] || 'carp'
const PALETTE_BG = {
  ac:    { bg: 'linear-gradient(135deg, #E0F2FE, #BAE6FD)', fg: '#0369A1' },
  carp:  { bg: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', fg: '#92400E' },
  elec:  { bg: 'linear-gradient(135deg, #FCE7F3, #FBCFE8)', fg: '#9D174D' },
  plumb: { bg: 'linear-gradient(135deg, #DBEAFE, #BFDBFE)', fg: '#1E40AF' },
}

// ── Status Hero — dark gradient panel that anchors the dashboard ──────
// `locked` (boolean) — when true, the toggle pill is disabled and rendered
// in a "locked offline" state. Clicking it bubbles up via onLockedTap so the
// page can show a contextual toast ("Finish your active job first").
function StatusHero ({ online, onToggle, locValue, locLabel, customerArea,
                      locked = false, onLockedTap }) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const dayStr  = today.toLocaleDateString('en-GB', { weekday: 'short' })

  return (
    <section className="relative overflow-hidden rounded-ds-lg p-7 text-white col-span-12 lg:col-span-8
                        bg-ink-gradient">
      {/* Soft brand gradient wash + dotted halo (matches mock ::before/::after) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0"
           style={{ background:
             'radial-gradient(600px 300px at 100% 0%, rgba(255,90,31,0.22), transparent 60%),' +
             'radial-gradient(400px 200px at 0% 100%, rgba(255,153,51,0.10), transparent 60%)' }} />
      <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 w-[220px] h-[220px] rounded-full opacity-60"
           style={{
             backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.04) 1px, transparent 1.5px)',
             backgroundSize: '16px 16px',
           }} />

      <div className="relative z-[1] flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* Left: tag + title + description */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                          text-[11.5px] font-semibold uppercase tracking-[0.08em]
                          bg-white/[0.08] border border-white/[0.12] text-white/85 mb-3.5">
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-[#34D399]' : 'bg-[#6B6F78]'}`}
                  style={online ? { boxShadow: '0 0 0 0 rgba(52,211,153,0.6)', animation: 'pulse 1.8s infinite' } : undefined} />
            <span>Availability · {online ? 'Online' : 'Offline'}</span>
          </div>
          <h2 className="font-display font-semibold text-[28px] md:text-[38px] tracking-[-0.025em] leading-[1.05]">
            Local services,<br />
            <span className="font-serif-italic text-accent">instantly.</span>
          </h2>
          <p className="mt-2.5 text-[14.5px] text-white/65 max-w-[460px] leading-[1.55]">
            {locked
              ? 'You have an active job — going online is locked until it wraps up. Customers won\'t see you in the queue while you\'re busy.'
              : online
                ? 'You are visible to nearby customers. Auto-pause kicks in after each accepted job.'
                : 'Go online to receive live requests from customers near you. Average response under a minute keeps you on top.'}
          </p>
        </div>

        {/* Right: pill toggle (rebuilt to match mock — same logic via onToggle).
            When `locked` we paint a slate background and a 🔒 glyph in place
            of the slider knob; tapping bubbles up to onLockedTap so the page
            can explain why the partner can't go online right now. */}
        <div className="flex flex-col items-start md:items-end gap-2.5 shrink-0">
          <button type="button" role="switch" aria-checked={online}
            aria-disabled={locked}
            onClick={() => locked ? onLockedTap?.() : onToggle(!online)}
            className={`relative w-[76px] h-[38px] rounded-full transition-all duration-300
                        border focus:outline-none ${locked ? 'cursor-not-allowed' : ''}`}
            style={{
              background: locked
                ? 'rgba(255,255,255,0.04)'
                : online
                  ? 'linear-gradient(135deg, var(--accent), var(--accent2))'
                  : 'rgba(255,255,255,0.08)',
              borderColor: locked
                ? 'rgba(255,255,255,0.10)'
                : online ? 'transparent' : 'rgba(255,255,255,0.14)',
              opacity: locked ? 0.85 : 1,
            }}>
            <span aria-hidden="true"
              className="absolute top-[3px] w-[30px] h-[30px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)]
                         transition-all duration-300 grid place-items-center text-[13px]"
              style={{ left: locked ? '3px' : (online ? '41px' : '3px'),
                       transitionTimingFunction: 'cubic-bezier(.4,0,.2,1)',
                       color: locked ? '#6B6F78' : 'transparent' }}>
              {locked ? '🔒' : ''}
            </span>
          </button>
          <div className={`flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.02em]
                           ${online && !locked ? 'text-white' : 'text-white/80'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              locked ? 'bg-white/40'
                     : online ? 'bg-[#34D399]' : 'bg-[#6B6F78]'}`} />
            {locked ? 'Locked · on a job' : online ? "You're online" : "You're offline"}
          </div>
        </div>
      </div>

      {/* Meta strip — 2 columns separated by hairline dividers */}
      <div className="relative z-[1] mt-7 pt-5 border-t border-white/10
                      grid grid-cols-1 md:grid-cols-2 gap-y-3.5">
        <MetaCell label="Today">
          <span>{dateStr}</span>
          <span className="text-white/60 text-[14px] font-medium ml-1">· {dayStr}</span>
        </MetaCell>
        <MetaCell label={locLabel || 'My location'} mono divider>
          {locValue || (customerArea ? customerArea : '—')}
        </MetaCell>
      </div>
    </section>
  )
}

function MetaCell ({ label, children, mono = false, divider = false }) {
  return (
    <div className={`px-0 md:px-[18px] ${divider ? 'md:border-l border-white/[0.08]' : ''}
                     ${divider ? 'pb-3.5 md:pb-0 border-t md:border-t-0 border-white/[0.08] pt-3.5 md:pt-0' : ''}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 mb-1.5">
        {label}
      </div>
      <div className={`font-display font-semibold text-[22px] tracking-[-0.015em] leading-[1.1]
                       ${mono ? 'font-mono !font-medium !text-[16px]' : ''}`}>
        {children}
      </div>
    </div>
  )
}

// ── KPI cards (warm earnings + white jobs) ───────────────────────────
function EarningsKpi ({ amount, jobs }) {
  return (
    <div className="relative overflow-hidden p-[22px] rounded-ds-lg flex flex-col justify-between
                    border bg-warm-wash"
         style={{ borderColor: '#F5E0CD' }}>
      <span aria-hidden="true"
        className="absolute -bottom-[30px] -right-[10px] font-serif-italic select-none pointer-events-none"
        style={{ fontSize: '180px', lineHeight: 1, color: 'rgba(255, 90, 31, 0.08)' }}>₹</span>
      <div className="flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">
        <span>Today's Earnings</span>
        <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full
                         text-[11px] font-bold normal-case tracking-normal
                         bg-success-soft text-success">▲ live</span>
      </div>
      <div className="font-display font-bold text-[44px] tracking-[-0.03em] leading-none mt-2.5 text-ink">
        <span className="font-serif-italic text-accent text-[38px] mr-0.5">₹</span>
        {Number(amount || 0).toLocaleString('en-IN')}
      </div>
      <div className="mt-3.5 text-[12.5px] text-muted">
        <b className="text-text font-semibold">{jobs} {jobs === 1 ? 'job' : 'jobs'}</b> · settled to wallet
      </div>
    </div>
  )
}

function JobsKpi ({ jobs, queue }) {
  return (
    <div className="relative overflow-hidden p-[22px] rounded-ds-lg flex flex-col justify-between
                    bg-card border border-border">
      <div className="flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">
        <span>Jobs Today</span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                         text-[11.5px] font-semibold normal-case tracking-normal"
              style={{ background: 'var(--brand-soft)', color: 'var(--accent-deep)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          {queue} in queue
        </span>
      </div>
      <div className="font-display font-bold text-[44px] tracking-[-0.03em] leading-none mt-2.5 text-ink">
        {jobs}
      </div>
      <div className="mt-3.5 text-[12.5px] text-muted">
        {jobs > 0
          ? <>All <b className="text-text font-semibold">completed</b> · no pending tasks</>
          : <>Accept a request to get started</>}
      </div>
    </div>
  )
}

// ── Card primitive ────────────────────────────────────────────────────
function Card ({ children, className = '', as = 'section' }) {
  const Tag = as
  return (
    <Tag className={`bg-card border border-border rounded-ds-lg p-[22px] transition
                     hover:shadow-ds-md ${className}`}>
      {children}
    </Tag>
  )
}

function CardHead ({ title, action, sub }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="font-display font-semibold text-[16px] tracking-[-0.01em] text-ink
                      flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-[3px] bg-accent" />
        <span>{title}</span>
        {sub && <span className="font-sans font-medium text-[13px] text-muted">· {sub}</span>}
      </div>
      {action}
    </div>
  )
}

function CardLink ({ children, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="text-[12.5px] font-semibold text-accent inline-flex items-center gap-1
                 px-2.5 py-1 rounded-lg transition hover:bg-brand-soft">
      {children}
    </button>
  )
}

// ── Earnings bar chart (mock-style gradient bars) ─────────────────────
function EarningsChart ({ days, weekTotal, onViewAll }) {
  const max = Math.max(1, ...days.map((d) => d.total || 0))
  const todayIso = new Date().toISOString().slice(0, 10)
  // Mark the top-2 non-today days as "high" so the gradient pops a second bar.
  const ranked = [...days].sort((a, b) => b.total - a.total).slice(0, 2).map((d) => d.iso)
  const hasAny = days.some((d) => d.total > 0)

  return (
    <Card className="col-span-12 lg:col-span-8">
      <CardHead title="Earnings — Last 7 days" action={
        <div className="flex items-center gap-4">
          <div className="font-display font-semibold text-[22px] tracking-[-0.02em] text-ink">
            <span className="font-serif-italic text-accent mr-0.5">₹</span>
            {Number(weekTotal || 0).toLocaleString('en-IN')}
          </div>
          <CardLink onClick={onViewAll}>View all →</CardLink>
        </div>
      }/>
      {hasAny ? (
        <div className="grid grid-cols-7 gap-3.5 items-end h-[200px] px-2 pt-2">
          {days.map((d) => {
            const pct = d.total ? Math.max(4, (d.total / max) * 96) : 4
            const isToday = d.iso === todayIso
            const isHigh  = ranked.includes(d.iso) && !isToday
            const tone = isToday ? 'today' : isHigh ? 'high' : 'low'
            return (
              <div key={d.iso} className="flex flex-col items-center gap-2 h-full justify-end relative group cursor-default">
                <span className={`absolute -top-[22px] font-mono text-[11px] font-semibold text-text
                                  bg-card px-1.5 py-0.5 rounded-[5px] border border-border whitespace-nowrap
                                  transition-opacity ${isToday ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {fmtRupees(d.total)}
                </span>
                <div className="w-full"
                  style={{
                    height: `${pct}%`,
                    minHeight: '6px',
                    borderRadius: '10px 10px 4px 4px',
                    background: tone === 'today'
                      ? 'linear-gradient(180deg, var(--accent) 0%, var(--accent-deep) 100%)'
                      : tone === 'high'
                        ? 'linear-gradient(180deg, var(--accent2) 0%, var(--accent) 100%)'
                        : 'linear-gradient(180deg, #FFE5D2 0%, #FFCFA8 100%)',
                    boxShadow: tone === 'today'
                      ? '0 12px 28px -10px var(--brand-glow)'
                      : tone === 'high'
                        ? '0 8px 20px -8px var(--brand-glow)'
                        : 'none',
                    transition: 'transform .25s ease',
                    transformOrigin: 'bottom',
                  }} />
                <span className={`text-[11px] font-semibold uppercase tracking-[0.06em]
                                  ${isToday ? 'text-accent' : 'text-muted'}`}>
                  {d.label}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="h-[200px] flex flex-col items-center justify-center text-center text-muted">
          <div className="text-[40px] opacity-40 mb-2">📈</div>
          <div className="text-[13px] max-w-[280px]">No earnings yet — your weekly chart will appear here once jobs start completing.</div>
        </div>
      )}
    </Card>
  )
}

// ── Upcoming card ─────────────────────────────────────────────────────
function UpcomingCard ({ jobs, onViewAll, onBrowse }) {
  return (
    <Card className="col-span-12 lg:col-span-4 flex flex-col">
      <CardHead title="Upcoming scheduled" action={<CardLink onClick={onViewAll}>View all →</CardLink>} />
      {jobs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-3 py-7">
          <div className="relative w-16 h-16 mb-4 rounded-[18px] grid place-items-center
                          border border-dashed"
               style={{ background: 'linear-gradient(135deg, var(--surface-2), #fff)',
                        borderColor: 'var(--border-strong)' }}>
            <span aria-hidden="true" className="absolute inset-[-1px] rounded-[18px] opacity-25 pointer-events-none"
                  style={{ background: 'radial-gradient(circle at 30% 30%, var(--brand-glow), transparent 60%)' }} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                 className="w-[26px] h-[26px] text-muted">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </div>
          <div className="font-display font-semibold text-[16px] text-ink mb-1">All caught up</div>
          <div className="text-[13px] text-muted max-w-[220px]">
            No scheduled jobs ahead. Go online to pick up live requests.
          </div>
          <button onClick={onBrowse}
            className="mt-3.5 px-3.5 py-2 rounded-full bg-ink text-white text-[12.5px] font-semibold
                       hover:bg-black transition">
            Browse requests →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-1">
          {jobs.map((j) => (
            <div key={j.id}
              className="flex items-center gap-3 px-2 py-2 rounded-ds-md hover:bg-surface-2 transition cursor-pointer">
              <div className={`w-9 h-9 rounded-full grid place-items-center text-[11px] font-bold
                               ${j.customer_av_class || 'pav-a'}`}>
                {j.customer_initials || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-ink truncate">
                  {j.customer_name || 'Customer'} — {j.service_icon || '🔧'} {j.service}
                </div>
                <div className="text-[11.5px] text-muted truncate">
                  📅 {(j.schedule_date && new Date(j.schedule_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) || '—'}
                  {j.time_slot ? ` · 🕐 ${j.time_slot}` : ''}
                </div>
              </div>
              <span className={`shrink-0 text-[10px] font-bold px-2.5 py-[3px] rounded-full
                                ${j.status === 'accepted'
                                  ? 'bg-success-soft text-success'
                                  : 'bg-[#fef3c7] text-[#92400e]'}`}>
                {j.status === 'accepted' ? '✓' : '⏳'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Today's jobs row + list ──────────────────────────────────────────
function JobRow ({ tx, onOpen }) {
  const time = new Date(tx.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const palette = paletteFor(tx.service)
  const colors = PALETTE_BG[palette]
  const clickable = !!onOpen
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpen(tx) : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(tx) }
      } : undefined}
      className={`grid grid-cols-[48px_1fr_auto_auto_auto] gap-4 items-center
                  p-3.5 rounded-ds-md border border-transparent
                  hover:bg-surface-2 hover:border-border transition
                  ${clickable ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30' : 'cursor-default'}`}>
      <div className="w-12 h-12 rounded-[14px] grid place-items-center shrink-0"
           style={{ background: colors.bg, color: colors.fg }}>
        <span className="text-[18px]">💼</span>
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[14.5px] text-ink mb-0.5 truncate">
          {tx.service || 'Service'} — {tx.customer_name || 'Customer'}
        </div>
        <div className="text-[12.5px] text-muted flex items-center gap-2 min-w-0">
          <span className="truncate font-mono">#{String(tx.job_id || tx.id || '').slice(-6).toUpperCase() || '——'}</span>
          <span className="w-[3px] h-[3px] rounded-full bg-border-strong shrink-0" />
          <span className="truncate">Wallet credit</span>
        </div>
      </div>
      <div className="font-mono text-[12.5px] font-medium text-muted hidden md:block">{time}</div>
      <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                      bg-success-soft text-success text-[11.5px] font-semibold">
        <span className="w-3 h-3 rounded-full bg-success grid place-items-center text-white text-[8px]">✓</span>
        Credited
      </div>
      <div className="font-display font-bold text-[18px] text-success tracking-[-0.02em] text-right min-w-[80px]">
        <span className="font-serif-italic font-normal">+₹</span>{Number(tx.total || tx.amount || 0).toLocaleString('en-IN')}
      </div>
    </div>
  )
}

// ── Page head — greeting only (quick actions removed; the availability
// toggle in the status hero is the single source of going on/off-shift). ──
// Bottom margin lives on the wrapper row so the banner sibling can share it.
function PageHead ({ name, todayJobs, online }) {
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return (
    <div>
      <h1 className="font-display font-semibold text-[28px] md:text-[36px] tracking-[-0.025em] leading-[1.05] text-ink">
        {greeting()}, {name || 'there'} <span className="font-serif-italic text-accent">—</span>
      </h1>
      <div className="text-[14.5px] text-muted mt-1.5">
        {today} · {todayJobs} {todayJobs === 1 ? 'job' : 'jobs'} done today
        {online ? ' · You are visible to nearby customers.' : ' · Go online to pick up live requests.'}
      </div>
    </div>
  )
}

// M36 — Auto-pause explanation banner. Renders only while:
//   • the partner is offline (auto-flipped on accept), AND
//   • a live job is locking the toggle.
// The Override button hides the banner for that specific job_id via
// sessionStorage so it stays cleared until they reload — never destructive,
// the partner is still locked offline by the active job itself.
function AutoPauseBanner ({ active, job }) {
  const [overridden, setOverridden] = useState(false)
  // Reset the override flag when the job id changes (next job's banner).
  useEffect(() => { setOverridden(false) }, [job?.id])
  // Pre-seed from sessionStorage so the dismiss survives nav within the tab.
  useEffect(() => {
    if (!job?.id) return
    try {
      const dismissed = sessionStorage.getItem(`sl:autoPauseDismiss:${job.id}`) === '1'
      if (dismissed) setOverridden(true)
    } catch { /* sessionStorage disabled — non-fatal */ }
  }, [job?.id])
  if (!active || overridden) return null
  const onOverride = () => {
    setOverridden(true)
    try { sessionStorage.setItem(`sl:autoPauseDismiss:${job?.id || 'unknown'}`, '1') }
    catch { /* non-fatal */ }
  }
  return (
    <div className="mb-4 rounded-ds-lg border border-border bg-[#fff5f2] dark:bg-[#241a18]
                    px-4 py-2.5 flex items-center gap-3">
      <span className="text-[18px] shrink-0">⏸</span>
      <div className="flex-1 min-w-0 text-[12.5px] leading-[1.5] text-text">
        <b>You're paused.</b> You won't receive new requests until this job is paid.
      </div>
      <button onClick={onOverride}
        className="text-[12px] font-bold text-accent hover:underline shrink-0 underline-offset-2">
        Override
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function PartnerDashboardPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const profile  = useSelector(selectPartnerProfile)
  const online   = useSelector(selectPartnerOnline)
  const incoming = useSelector(selectIncoming)
  const wallet   = useSelector(selectWallet)
  // Redux-backed active job — kept in sync by useRealtime's `job:state-changed`
  // socket listener (applyJobPatch). Drives the banner + the toggle lock so
  // they react live when the job is paid / cancelled, without needing a
  // dashboard remount. The page also keeps a separate local `activeJob`
  // below for the stuck-job warning, which has its own retry semantics.
  const reduxActiveJob = useSelector(selectActiveJob)

  const [scheduled, setScheduled] = useState([])
  const [locModalOpen, setLocModalOpen] = useState(false)
  const [activeJob, setActiveJob] = useState(null)
  const [activeJobReload, setActiveJobReload] = useState(0)
  const [stuckBusy, setStuckBusy] = useState(false)
  // Confirmation flow for the availability toggle. We stage the desired next
  // state here so flipping the pill no longer fires immediately — it opens a
  // ConfirmModal first. `null` means no confirm modal is open; `true` means
  // the user is being asked to confirm going online; `false` going offline.
  const [pendingToggle, setPendingToggle] = useState(null)
  const [toggleBusy, setToggleBusy] = useState(false)

  const loc = useLocation()

  useEffect(() => { dispatch(loadMyPartner()) },     [dispatch])
  useEffect(() => { dispatch(loadDashboard()) },     [dispatch])
  useEffect(() => { dispatch(loadLiveRequests()) },  [dispatch])
  useEffect(() => { dispatch(loadWallet()) },        [dispatch])
  useEffect(() => { dispatch(fetchActiveJobThunk('partner')) }, [dispatch])
  useEffect(() => {
    api.fetchSchedules('partner').then(({ scheduled }) => setScheduled(scheduled || []))
      .catch(() => setScheduled([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    api.fetchActiveJob('partner')
      .then(({ job }) => { if (!cancelled) setActiveJob(job || null) })
      .catch(() => { if (!cancelled) setActiveJob(null) })
    return () => { cancelled = true }
  }, [activeJobReload])

  useEffect(() => {
    if (!loc.isKnown && loc.status === 'idle') {
      loc.request({ highAccuracy: false }).catch(() => {})
    }
  }, [loc.isKnown, loc.status, loc.request])

  // Status-hero meta — third cell (location). Address resolution paused, so
  // we show city when known else raw lat/lng.
  const locMeta = (() => {
    if (loc.status === 'fetching')    return { value: '…',   label: 'Locating',    onTap: null }
    if (loc.status === 'denied')      return { value: '—',   label: 'No access',   onTap: () => setLocModalOpen(true) }
    if (loc.status === 'unavailable') return { value: '—',   label: 'Unavailable', onTap: null }
    if (loc.city) {
      const v = loc.city.length > 14 ? loc.city.slice(0, 13) + '…' : loc.city
      return { value: v, label: 'My area',     onTap: null }
    }
    if (loc.coords) {
      return {
        value: `${loc.coords.lat.toFixed(2)}, ${loc.coords.lng.toFixed(2)}`,
        label: 'My location',
        onTap: null,
      }
    }
    return { value: '—', label: 'My location', onTap: () => setLocModalOpen(true) }
  })()

  const { todayEarn, todayJobs, weekDays, queue } = useMemo(() => {
    const tx = wallet?.transactions || []
    const today = new Date().toDateString()
    let earn = 0, jobs = 0
    tx.forEach((t) => {
      if (t.type === 'credit' && new Date(t.created_at).toDateString() === today) {
        earn += Number(t.total || t.amount || 0); jobs += 1
      }
    })
    const days = getLast7Days()
    tx.forEach((t) => {
      if (t.type !== 'credit' || !t.created_at) return
      const iso = new Date(t.created_at).toISOString().slice(0, 10)
      const bucket = days.find((d) => d.iso === iso)
      if (bucket) bucket.total += Number(t.total || t.amount || 0)
    })
    return {
      todayEarn: earn, todayJobs: jobs,
      weekDays: days,
      queue: (incoming || []).length,
    }
  }, [wallet?.transactions, incoming])

  const weekTotal = weekDays.reduce((s, d) => s + d.total, 0)

  const persistLocation = async () => {
    if (!loc.coords) return
    // Forward the slice's resolved address + city so the server doesn't
    // have to reverse-geocode again (which can fail and leave
    // `partners.location_city` showing a stale value to every customer
    // browsing the list).
    try {
      await api.setPartnerLocation(loc.coords.lat, loc.coords.lng, {
        address: loc.address,
        city:    loc.city,
      })
    } catch { /* swallow — best-effort sync */ }
  }

  // The actual dispatch — kept identical to the previous direct flow, just
  // separated from the click handler so the confirm modal can call it after
  // the partner says yes. Flipping the toggle pill no longer side-effects.
  const applyToggle = async (next) => {
    setToggleBusy(true)
    try {
      if (!next) {
        await dispatch(toggleOnlineThunk(false))
        getSocket({ role: 'partner' }).then((s) => s.emit('partner:online', {
          online: false,
          works: Array.from(new Set([
            profile?.primary_work,
            ...((profile?.work_prices || []).map((w) => w.work_name)),
          ].filter(Boolean))),
        })).catch(() => {})
        dispatch(pushToast({ text: "You're now offline" }))
      } else {
        await persistLocation()
        await dispatch(toggleOnlineThunk(true))
        getSocket({ role: 'partner' }).then((s) => s.emit('partner:online', {
          online: true,
          works: Array.from(new Set([
            profile?.primary_work,
            ...((profile?.work_prices || []).map((w) => w.work_name)),
          ].filter(Boolean))),
        })).catch(() => {})
        dispatch(loadLiveRequests())
        dispatch(pushToast({ text: 'You are now online' }))
      }
      setPendingToggle(null)
    } catch (e) {
      dispatch(pushToast({ text: e.message || 'Failed to change status', type: 'error' }))
    } finally {
      setToggleBusy(false)
    }
  }

  // A non-terminal active job locks the partner offline. The server already
  // flips them offline on accept (requestController) and back online on payment
  // (paymentController) — this is the matching client-side guard so the toggle
  // can't desync those server states even on stale UI.
  // Sources Redux's activeJob (live via socket) so the lock clears the moment
  // a paid / cancelled state arrives — no dashboard remount required.
  const TOGGLE_LOCK_STATES = new Set(['accepted','priceConfirmed','travelling','arrived','working','completed'])
  const toggleLocked = !!(reduxActiveJob && TOGGLE_LOCK_STATES.has(reduxActiveJob.state))

  // Click handler for the pill toggle.
  //   Going ONLINE  → no confirm; just gate on location and apply directly.
  //                   BLOCKED entirely while a job is active.
  //   Going OFFLINE → always confirm (one stray tap shouldn't cut off live
  //                   requests while the partner is on shift).
  const onToggle = (next) => {
    if (next) {
      if (toggleLocked) { onLockedTap(); return }
      if (!loc.isKnown) { setLocModalOpen(true); return }
      applyToggle(true)
      return
    }
    setPendingToggle(false)
  }
  const onLockedTap = () => {
    dispatch(pushToast({
      text: 'Finish your active job before going online',
      type: 'warn',
    }))
  }
  const cancelPendingToggle = () => { if (!toggleBusy) setPendingToggle(null) }

  const onLocationGranted = async () => {
    setLocModalOpen(false)
    setTimeout(async () => {
      await persistLocation()
      try {
        await dispatch(toggleOnlineThunk(true))
        getSocket({ role: 'partner' }).then((s) => s.emit('partner:online', {
          online: true,
          works: Array.from(new Set([
            profile?.primary_work,
            ...((profile?.work_prices || []).map((w) => w.work_name)),
          ].filter(Boolean))),
        })).catch(() => {})
        dispatch(loadLiveRequests())
        dispatch(pushToast({ text: 'You are now online' }))
      } catch (e) { dispatch(pushToast({ text: e.message || 'Failed to change status', type: 'error' })) }
    }, 50)
  }

  const schedVisible = (scheduled || []).filter((j) => j.status === 'pending' || j.status === 'accepted').slice(0, 3)
  const todaysTx = (wallet?.transactions || []).filter((t) => t.type === 'credit' && isSameDay(t.created_at, new Date())).slice(0, 5)

  // Stuck-job detection (preserved)
  const STUCK_STATES = ['priceConfirmed', 'travelling', 'arrived', 'working', 'completed']
  const STUCK_HOURS  = 6
  const stuckHours = (() => {
    if (!activeJob || !STUCK_STATES.includes(activeJob.state)) return 0
    const updated = new Date(activeJob.updated_at || activeJob.accepted_at || 0).getTime()
    if (!Number.isFinite(updated) || updated <= 0) return 0
    const h = Math.floor((Date.now() - updated) / (60 * 60 * 1000))
    return h >= STUCK_HOURS ? h : 0
  })()
  const stuck = stuckHours > 0

  const cancelStuck = async () => {
    if (!activeJob || stuckBusy) return
    setStuckBusy(true)
    try {
      await api.cancelJob(activeJob.id, 'partner unable to complete', null)
      dispatch(pushToast({ text: 'Job marked cancelled' }))
      setActiveJob(null)
      setActiveJobReload((n) => n + 1)
    } catch (e) {
      dispatch(pushToast({ text: e?.response?.data?.message || 'Could not cancel' }))
    } finally { setStuckBusy(false) }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-7 py-6 md:py-7 animate-pgIn">
      {/* Active job — small floating pill pinned bottom-right (portaled to
          body), matching the customer home. Collapsed by default; expands on
          hover to show full detail. Renders nothing when there's no job. */}
      <ActiveJobBanner job={reduxActiveJob} role="partner" floating />

      {/* Page-head row — greeting on the left, location chip on the
          right. Always a clean two-column row regardless of whether a
          job's in flight (the banner above handles that context). */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 lg:gap-6 items-center">
        <PageHead
          name={profile?.full_name?.split(' ')[0]}
          todayJobs={todayJobs}
          online={online} />
        <div className="flex justify-end">
          <LocationEditChip />
        </div>
      </div>

      {/* M36 — Auto-pause explainer. When the partner has been auto-set
           offline because they have a live job in progress, surface the
           reason so they don't ping support asking "why am I not getting
           requests?". The Override link just clears the banner locally
           (no destructive action) — toggle stays locked by the active job. */}
      <AutoPauseBanner active={!online && toggleLocked} job={reduxActiveJob} />

      {/* Stuck-job warning — preserved, just restyled to match the warm system */}
      {stuck && (
        <div className="mb-4 rounded-ds-lg border bg-[#fffbeb] dark:bg-[#2d1f05]
                        dark:border-[#78350f] p-4 flex items-start gap-3"
             style={{ borderColor: '#fcd34d' }}>
          <div className="text-2xl shrink-0 mt-0.5">⏱</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[14px] text-[#92400e] dark:text-[#fcd34d]">
              Stuck job · no activity for {stuckHours}h
            </div>
            <div className="text-[12.5px] leading-[1.55] text-[#78350f] dark:text-[#fbbf24] mt-1">
              <strong>{activeJob.service || 'A job'}</strong>
              {activeJob.customer_name ? ` for ${activeJob.customer_name}` : ''}
              {' '}is sitting in <span className="font-mono">{activeJob.state}</span>.
              Customer-facing listings hide you at 24h and the system auto-cancels at 48h —
              clear it now to stay visible.
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => nav('/partner/work')}
                className="bg-[#92400e] text-white text-[12px] font-extrabold
                           px-3.5 py-1.5 rounded-[10px] hover:brightness-110 transition">
                Open job →
              </button>
              <button onClick={cancelStuck} disabled={stuckBusy}
                className="bg-card border border-border text-text text-[12px] font-bold
                           px-3.5 py-1.5 rounded-[10px] hover:border-[#dc2626]
                           hover:text-[#dc2626] transition
                           disabled:opacity-60 disabled:cursor-not-allowed">
                {stuckBusy ? 'Cancelling…' : 'Mark cancelled'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC banner — preserved */}
      {wallet && !wallet.bank && (
        <button type="button" onClick={() => nav('/partner/bank')}
          className="group mb-4 w-full text-left rounded-ds-lg border bg-[#fffbeb]
                     dark:bg-[#2d1f05] dark:border-[#78350f]
                     p-4 flex items-start gap-3 hover:brightness-[1.02] transition"
          style={{ borderColor: '#fcd34d' }}>
          <div className="text-2xl shrink-0">🏦</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[14px] text-[#92400e] dark:text-[#fcd34d]">
              Link your bank account to enable withdrawals
            </div>
            <div className="text-[12.5px] leading-relaxed text-[#78350f] dark:text-[#fbbf24] mt-1">
              KYC required · Minimum withdrawal is ₹1,500. Earnings will sit in Pending until you add a bank.
            </div>
          </div>
          <span className="shrink-0 mt-0.5 px-3 py-1.5 rounded-[10px] bg-[#92400e] text-white
                           text-[11px] font-extrabold group-hover:brightness-110 transition">
            Link now →
          </span>
        </button>
      )}

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-4">
        <StatusHero
          online={online}
          onToggle={onToggle}
          locValue={locMeta.value}
          locLabel={locMeta.label}
          locked={toggleLocked}
          onLockedTap={onLockedTap} />

        {/* KPI stack — col 4 on lg, side-by-side on md, stacked on sm */}
        <div className="col-span-12 lg:col-span-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-1">
          <EarningsKpi amount={todayEarn} jobs={todayJobs} />
          <JobsKpi jobs={todayJobs} queue={queue} />
        </div>

        <EarningsChart days={weekDays} weekTotal={weekTotal}
                       onViewAll={() => nav('/partner/earnings')} />

        <UpcomingCard jobs={schedVisible}
                      onViewAll={() => nav('/partner/scheduled')}
                      onBrowse={() => nav('/partner/requests')} />

        {/* Today's jobs — full width. Rows route to the transaction detail
            page (the same target the Wallet's transaction list uses) so the
            partner can drill into the credit / job that produced it. */}
        <Card className="col-span-12">
          <CardHead
            title="Today's jobs"
            sub={todayJobs > 0 ? `${todayJobs} completed` : 'no completed jobs yet'}
            action={<CardLink onClick={() => nav('/partner/transactions')}>View all →</CardLink>} />
          {todaysTx.length === 0 ? (
            <div className="text-center px-6 py-8">
              <div className="text-[40px] opacity-45 mb-2">📭</div>
              <div className="font-display font-semibold text-[15px] mb-1 text-ink">No completed jobs yet today</div>
              <div className="text-[13px] text-muted max-w-[320px] mx-auto leading-relaxed">
                Accept a request and mark it complete — it'll show up here.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {todaysTx.map((tx, i) => (
                <div key={tx.id}>
                  <JobRow tx={tx}
                    onOpen={(t) => nav(`/partner/transactions/${t.id}`, { state: { tx: t } })} />
                  {i < todaysTx.length - 1 && (
                    <div className="h-px my-1"
                         style={{ background: 'linear-gradient(90deg, transparent, var(--border) 20%, var(--border) 80%, transparent)' }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <LocationPromptModal
        open={locModalOpen}
        onClose={() => setLocModalOpen(false)}
        onGranted={onLocationGranted}
        requireSuccess
        title="Location required to go online"
        body="Customers can only find you on the map if we know where you are. We use your location only while you're online."
      />

      {/* Availability confirm — fires for BOTH directions (online + offline)
          so the partner never accidentally flips status with a stray tap. */}
      <ConfirmModal
        open={pendingToggle !== null}
        icon={pendingToggle ? '📡' : '🌙'}
        title={pendingToggle ? 'Go online?' : 'Go offline?'}
        body={pendingToggle
          ? 'You will start receiving live requests from nearby customers. Auto-pause kicks in after each accepted job.'
          : "You won't receive new requests until you go online again. Any in-progress job stays unaffected."}
        cancelLabel="Stay"
        confirmLabel={toggleBusy
          ? (pendingToggle ? 'Going online…' : 'Going offline…')
          : (pendingToggle ? 'Yes, go online' : 'Yes, go offline')}
        variant={pendingToggle ? 'primary' : 'danger'}
        onCancel={cancelPendingToggle}
        onConfirm={() => applyToggle(pendingToggle)} />
    </div>
  )
}
