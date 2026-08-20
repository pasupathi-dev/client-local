// Shared confirm overlay — .role-confirm-overlay + .role-confirm-card pattern.
// variant='primary' (orange) | 'danger' (red) swap icon bubble + confirm button.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function ConfirmModal ({
  open, icon = '🔄', title, body,
  cancelLabel = 'Cancel', confirmLabel = 'Confirm',
  variant = 'primary',
  onCancel, onConfirm,
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const isDanger = variant === 'danger'
  const iconBg = isDanger
    ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))'
    : 'linear-gradient(135deg, rgba(232,65,26,0.12), rgba(232,65,26,0.05))'
  const iconBorder = isDanger ? 'rgba(239,68,68,0.15)' : 'rgba(232,65,26,0.15)'
  const confirmStyle = isDanger
    ? { background: '#ef4444', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }
    : { background: 'var(--accent)', boxShadow: '0 4px 16px rgba(232,65,26,0.3)' }

  const node = (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4
                 bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] animate-pgIn">
      <div
        className="bg-card text-text rounded-[20px] px-7 py-8 w-full max-w-[380px]
                   text-center shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-popIn">
        <div
          className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-[28px]"
          style={{ background: iconBg, border: `2px solid ${iconBorder}` }}>
          {icon}
        </div>
        <div className="font-display font-extrabold text-lg mb-1.5">{title}</div>
        {body && <div className="text-[13px] text-muted leading-[1.6] mb-6">{body}</div>}
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                       text-[13px] font-bold text-muted hover:text-text transition">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={confirmStyle}
            className="flex-[2] py-3 rounded-[var(--rs)] text-white
                       font-display font-bold text-[13px]">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}
