// M44 — Compact list of extra-work proposals for a job, shown on BOTH
// the partner active-job page and the customer's job detail page so each
// side can see what's been proposed, approved, or declined without having
// to scroll through chat.
//
// Refetches when the parent passes a new `refreshKey` (bump after submit).
// Subscribes to `chat:message` / `chat:message-edited` socket events so
// new proposals + status flips appear live.
//
// Customer side: status='pending' rows include Approve / Decline buttons.
// Partner side:  the same rows are read-only ("Waiting for customer").

import { useCallback, useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { getSocket } from '@/services/socket'
import { pushToast } from '@/features/app/appSlice'
import { formatPrice } from '@/utils/format'

export default function ExtraWorkSummary ({ jobId, role, refreshKey = 0 }) {
  const dispatch = useDispatch()
  const [proposals, setProposals] = useState([])
  const [loading, setLoading]     = useState(false)
  const [busyId, setBusyId]       = useState(null)

  const reload = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    try {
      const r = await api.listExtraWork(jobId)
      setProposals(r.proposals || [])
    } catch { /* swallow — empty list is fine */ }
    finally { setLoading(false) }
  }, [jobId])

  // Initial load + on refreshKey bump (parent signals a fresh submit).
  useEffect(() => { reload() }, [reload, refreshKey])

  // Live updates — re-fetch when new chat messages land or are edited.
  // Cheap because the endpoint just reads from the messages table.
  useEffect(() => {
    if (!jobId) return undefined
    let sock; let onMsg; let onEdit; let cancelled = false
    getSocket().then((s) => {
      if (cancelled) return
      sock = s
      onMsg  = (m) => { if (m?.job_id === jobId && m?.attachment?.type === 'extra-work-proposal') reload() }
      onEdit = (m) => { if (m?.job_id === jobId && m?.attachment?.type === 'extra-work-proposal') reload() }
      sock.on('chat:message', onMsg)
      sock.on('chat:message-edited', onEdit)
    }).catch(() => {})
    return () => {
      cancelled = true
      if (sock) {
        if (onMsg)  sock.off('chat:message', onMsg)
        if (onEdit) sock.off('chat:message-edited', onEdit)
      }
    }
  }, [jobId, reload])

  const respond = async (p, accepted) => {
    if (busyId) return
    setBusyId(p.message_id)
    try {
      await api.respondExtraWork(jobId, { message_id: p.message_id, accepted })
      dispatch(pushToast({
        type: 'info',
        text: accepted
          ? `Approved ₹${p.extra_price} extra. The agreed price has been updated.`
          : 'Declined the extra work.',
      }))
      // Server emits chat:message-edited which triggers reload via the
      // socket listener above; refresh now too so UI doesn't lag.
      reload()
    } catch (e) {
      dispatch(pushToast({
        text: e?.response?.data?.message || e?.message || 'Could not respond',
        type: 'error',
      }))
    } finally { setBusyId(null) }
  }

  if (loading && proposals.length === 0) {
    return (
      <div className="text-[11.5px] text-muted px-1 py-2">Checking for extra-work updates…</div>
    )
  }
  if (proposals.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted px-1">
        Extra work
      </div>
      {proposals.map((p) => {
        const tone = p.status === 'accepted'
          ? { bg: '#dcfce7', border: '#a7f3d0', fg: '#065f46', tag: '✅ Approved' }
          : p.status === 'declined'
            ? { bg: '#fee2e2', border: '#fecaca', fg: '#991b1b', tag: '✖ Declined' }
            : { bg: '#fff7ed', border: '#fed7aa', fg: '#9a3412', tag: '⏳ Pending' }
        return (
          <div key={p.message_id}
               className="rounded-[var(--rs)] px-3 py-2 border"
               style={{ background: tone.bg, borderColor: tone.border }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-bold text-text truncate">
                  {p.description || '—'}
                </div>
                <div className="text-[11px]" style={{ color: tone.fg }}>
                  {tone.tag} · {formatPrice(p.extra_price)}
                </div>
              </div>
              {p.status === 'pending' && role === 'customer' && (
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" disabled={busyId === p.message_id}
                    onClick={() => respond(p, false)}
                    className="px-2.5 py-1.5 rounded-md bg-card border border-border
                               text-[#b91c1c] text-[11px] font-bold
                               hover:border-[#ef4444] transition disabled:opacity-60">
                    Decline
                  </button>
                  <button type="button" disabled={busyId === p.message_id}
                    onClick={() => respond(p, true)}
                    className="px-2.5 py-1.5 rounded-md bg-success text-white
                               text-[11px] font-bold hover:brightness-105 transition
                               disabled:opacity-60">
                    {busyId === p.message_id ? '…' : `Approve ${formatPrice(p.extra_price)}`}
                  </button>
                </div>
              )}
              {p.status === 'pending' && role === 'partner' && (
                <span className="text-[10px] font-bold text-muted shrink-0">
                  Waiting for customer
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
