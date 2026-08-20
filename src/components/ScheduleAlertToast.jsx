// Scheduling alert toasts — shown to both parties at T-24h, T-1h, T-15m,
// T=0 (now), and overdue. The partner's T=0 variant carries a "Start Now"
// action button that converts the scheduled booking into a live job.
//
// Positioning matches IncomingRequestToast: bottom-right on desktop, full-width
// bottom on mobile. Uses the same animate-slideUp animation.

import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  selectActiveAlert, dismissAlert,
  selectStartNow, dismissStartNow,
  startScheduleThunk,
} from '@/features/schedule/scheduleSlice'
import { selectMode, pushToast } from '@/features/app/appSlice'
import { useState } from 'react'

// Alert type → display config
const ALERT_CONFIG = {
  '24h':    { color: '#8b5cf6', bg: '#f5f3ff', icon: '⏰', label: 'Tomorrow'      },
  '1h':     { color: '#8b5cf6', bg: '#f5f3ff', icon: '⏰', label: 'In 1 Hour'     },
  '15m':    { color: '#f59e0b', bg: '#fffbeb', icon: '⏳', label: 'In 15 Minutes' },
  'now':    { color: '#10b981', bg: '#ecfdf5', icon: '🚀', label: 'Starting Now'  },
  'overdue':{ color: '#ef4444', bg: '#fef2f2', icon: '⚠️', label: 'Overdue'       },
}

const shortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── Reminder toast (24h / 1h / 15m / now / overdue) ──────────────────────────
function ReminderToast ({ alert, onDismiss }) {
  const cfg = ALERT_CONFIG[alert.type] || ALERT_CONFIG['now']
  return createPortal(
    <div role="alert" aria-live="polite"
         className="fixed z-[9400]
                    bottom-4 left-4 right-4
                    md:left-auto md:right-5 md:bottom-5 md:w-[360px]
                    bg-card rounded-[18px] overflow-hidden
                    shadow-[0_8px_40px_rgba(0,0,0,0.18)]
                    animate-slideUp"
         style={{ border: `2px solid ${cfg.color}20` }}>

      {/* Accent bar */}
      <div className="h-[3px] w-full" style={{ background: cfg.color }} />

      <div className="px-4 pt-3 pb-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl
                           text-[11px] font-bold text-white"
                style={{ background: cfg.color }}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="ml-auto text-[11px] text-muted">
            {shortDate(alert.scheduled_at)}
          </span>
          <button onClick={onDismiss} aria-label="Dismiss"
            className="text-muted text-[16px] leading-none hover:text-text transition ml-1">
            ✕
          </button>
        </div>

        {/* Service info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center
                          text-[20px] shrink-0"
               style={{ background: cfg.bg }}>
            📅
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[13px] text-text truncate">
              {alert.service || 'Scheduled Job'}
            </div>
            <div className="text-[11px] text-muted truncate">
              {alert.partner_name && `with ${alert.partner_name}`}
              {alert.customer_name && `for ${alert.customer_name}`}
            </div>
          </div>
        </div>

        {alert.type === 'overdue' && (
          <div className="mt-2.5 text-[11px] text-[#b91c1c] bg-[#fef2f2]
                          rounded-[var(--rs)] px-3 py-2">
            Job hasn't started yet — please follow up.
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── Start Now toast (partner T=0) ─────────────────────────────────────────────
function StartNowToast ({ sn, onDismiss }) {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const [busy, setBusy] = useState(false)

  const handleStart = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await dispatch(startScheduleThunk(sn.id)).unwrap()
      onDismiss()
      if (result?.job) nav('/partner/work')
    } catch (e) {
      dispatch(pushToast({ text: e?.message || 'Could not start job. Try again.', type: 'error' }))
      setBusy(false)
    }
  }

  return createPortal(
    <div role="alert" aria-live="assertive"
         className="fixed z-[9450]
                    bottom-4 left-4 right-4
                    md:left-auto md:right-5 md:bottom-5 md:w-[380px]
                    bg-card rounded-[18px] overflow-hidden
                    shadow-[0_8px_40px_rgba(0,0,0,0.22)]
                    animate-slideUp"
         style={{ border: '2px solid rgba(59,130,246,0.30)' }}>

      {/* Blue accent bar */}
      <div className="h-[3px] w-full bg-[#3b82f6]" />

      {/* Badge row */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl
                         text-[11px] font-bold text-white bg-[#3b82f6] animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          📅 SCHEDULED JOB — TIME TO START
        </span>
        <button onClick={onDismiss} aria-label="Dismiss"
          className="ml-auto text-muted text-[16px] leading-none hover:text-text transition">
          ✕
        </button>
      </div>

      {/* Customer + service row */}
      <div className="flex items-center gap-3 px-4 pb-2">
        <div className="w-11 h-11 rounded-full bg-[#dbeafe] flex items-center justify-center
                        font-bold text-[13px] text-[#1d4ed8] shrink-0">
          {(sn.customer_name || 'C').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[14px] text-text truncate">
            {sn.customer_name || 'Customer'}
          </div>
          <div className="text-[11px] text-muted truncate">
            {sn.service || sn.category_name || '—'}
            {sn.base_price ? ` · ₹${sn.base_price}` : ''}
          </div>
        </div>
      </div>

      {/* Address */}
      {sn.customer_address && (
        <div className="mx-4 mb-2 text-[11px] text-muted bg-surface rounded-[var(--rs)] px-3 py-2">
          📍 {sn.customer_address}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 px-4 pb-4 pt-1">
        <button onClick={onDismiss} disabled={busy}
          className="flex-1 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                     bg-card text-text font-bold text-[12.5px]
                     hover:border-muted transition disabled:opacity-60">
          Later
        </button>
        <button onClick={handleStart} disabled={busy}
          className="flex-[2] py-2.5 rounded-[var(--rs)] text-white font-bold text-[12.5px]
                     shadow-[0_4px_14px_rgba(59,130,246,0.3)]
                     hover:brightness-90 transition disabled:opacity-60"
          style={{ background: '#3b82f6' }}>
          {busy ? 'Starting…' : '▶ Start Now'}
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ── Main export — renders whichever toast is active ───────────────────────────
export default function ScheduleAlertToast () {
  const dispatch   = useDispatch()
  const mode       = useSelector(selectMode)
  const alert      = useSelector(selectActiveAlert)
  const startNow   = useSelector(selectStartNow)

  // Start-now only for partners; reminder alerts for everyone
  const showStart  = mode === 'partner' && !!startNow
  const showAlert  = !showStart && !!alert

  if (!showStart && !showAlert) return null

  if (showStart) {
    return (
      <StartNowToast
        sn={startNow}
        onDismiss={() => dispatch(dismissStartNow())}
      />
    )
  }

  return (
    <ReminderToast
      alert={alert}
      onDismiss={() => dispatch(dismissAlert())}
    />
  )
}
