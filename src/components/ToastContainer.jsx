// Global toast notifications — reads from app.toasts (pushed via pushToast action).
// Supports type: 'success' | 'error' | 'info' (default).
// Auto-dismisses after 4 seconds. Max 3 shown at once (enforced by slice).

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { selectToasts, dismissToast } from '@/features/app/appSlice'

const TYPE_STYLE = {
  success: { bar: '#10b981', icon: '✓', bg: '#ecfdf5', border: 'rgba(16,185,129,0.25)', text: '#065f46' },
  error:   { bar: '#ef4444', icon: '✕', bg: '#fef2f2', border: 'rgba(239,68,68,0.25)',  text: '#991b1b' },
  info:    { bar: '#3b82f6', icon: 'ℹ', bg: '#eff6ff', border: 'rgba(59,130,246,0.25)', text: '#1e40af' },
  warn:    { bar: '#f59e0b', icon: '!', bg: '#fffbeb', border: 'rgba(245,158,11,0.25)',  text: '#92400e' },
}

function ToastItem ({ toast, onDismiss }) {
  const s = TYPE_STYLE[toast.type] || TYPE_STYLE.info

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <div role="alert" aria-live="polite"
         className="w-full max-w-[340px] rounded-[14px] overflow-hidden shadow-[0_6px_30px_rgba(0,0,0,0.14)]
                    animate-slideUp"
         style={{ background: toast.type ? s.bg : 'var(--card)', border: `1.5px solid ${s.border}` }}>
      {/* top accent bar */}
      <div className="h-[3px]" style={{ background: s.bar }} />

      <div className="flex items-start gap-3 px-4 py-3">
        <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                         font-extrabold text-[12px] text-white mt-px"
              style={{ background: s.bar }}>
          {s.icon}
        </span>
        <p className="flex-1 text-[13px] font-semibold leading-[1.45]"
           style={{ color: toast.type ? s.text : 'var(--text)' }}>
          {toast.text}
        </p>
        <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss"
          className="shrink-0 text-[16px] leading-none text-muted hover:text-text transition ml-1 -mr-1 mt-px">
          ✕
        </button>
      </div>
    </div>
  )
}

export default function ToastContainer () {
  const dispatch = useDispatch()
  const toasts   = useSelector(selectToasts)

  const dismiss  = (id) => dispatch(dismissToast(id))

  if (!toasts.length) return null

  return createPortal(
    <div className="fixed z-[9999] bottom-4 right-4 left-4
                    md:left-auto md:right-5 md:bottom-5
                    flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full md:w-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
