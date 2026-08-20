// H39 — "Share live tracking" modal. Mints a public-track URL via
// /api/safety/track-link and shows it with Copy + native Share buttons.
// The URL works without an account; the recipient sees the partner's
// pin + ETA only, no chat / no PII.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from '@/services/api'

export default function ShareTrackLinkModal ({ open, job, onClose }) {
  const [url,    setUrl]   = useState('')
  const [loading, setLoading] = useState(false)
  const [err,    setErr]   = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !job?.id) return
    setLoading(true); setErr(''); setUrl(''); setCopied(false)
    api.safetyTrackLink(job.id)
      .then((r) => setUrl(r.url || ''))
      .catch((e) => setErr(e?.response?.data?.message || e?.message || 'Could not mint link'))
      .finally(() => setLoading(false))
  }, [open, job?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const onCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard denied — user can still long-press the URL */ }
  }

  const onNativeShare = async () => {
    if (!url || !navigator.share) return
    try {
      await navigator.share({
        title: 'Track my service partner',
        text:  `Follow my ${job?.service || 'service'} job live`,
        url,
      })
    } catch { /* user cancelled or denied */ }
  }

  return createPortal(
    <div onClick={onClose}
         className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center
                    bg-[rgba(10,15,30,0.55)] backdrop-blur-[3px] animate-pgIn">
      <div onClick={(e) => e.stopPropagation()}
           className="bg-card w-full sm:max-w-[420px] rounded-t-[20px] sm:rounded-[20px]
                      shadow-[0_-12px_40px_rgba(0,0,0,0.2)] animate-popIn p-6">
        <div className="text-center mb-4">
          <div className="text-[36px] mb-1">📍</div>
          <h2 className="font-display font-extrabold text-[17px] text-text">
            Share live tracking
          </h2>
          <p className="text-[12px] text-muted leading-[1.55] mt-1">
            Anyone with this link can see the partner's location until the job is paid or cancelled.
            No login required.
          </p>
        </div>

        {loading && (
          <div className="text-[12px] text-muted text-center py-3">Generating link…</div>
        )}
        {err && (
          <div className="text-[12px] text-[#ef4444] text-center py-2">{err}</div>
        )}
        {url && (
          <>
            <div className="bg-surface border border-border rounded-[var(--rs)]
                            px-3 py-2 text-[12px] text-text break-all font-mono mb-3">
              {url}
            </div>
            <div className="flex gap-2">
              <button onClick={onCopy}
                className="flex-1 py-2.5 rounded-[var(--rs)] border border-border bg-card
                           text-text text-[13px] font-semibold hover:border-accent transition">
                {copied ? '✓ Copied' : '📋 Copy link'}
              </button>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button onClick={onNativeShare}
                  className="flex-1 py-2.5 rounded-[var(--rs)] bg-accent text-white
                             text-[13px] font-bold hover:brightness-90 transition">
                  Share…
                </button>
              )}
            </div>
          </>
        )}

        <button onClick={onClose}
          className="w-full mt-3 py-2 text-[12px] text-muted hover:text-text transition">
          Done
        </button>
      </div>
    </div>,
    document.body,
  )
}
