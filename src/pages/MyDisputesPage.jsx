// Disputes list — used for both /my-disputes (customer) and
// /partner/disputes (partner). Same backend endpoint
// (GET /api/disputes/mine) returns rows where the caller is either the
// raising party or named on the underlying job, so a single component
// covers both roles. The role-aware bit is just the row destination.
//
// Tap a row → goes to the job's detail page so the user lands back on
// the ReportProblemButton banner with full context (and the chat,
// payment, etc. nearby).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectMode } from '@/features/app/appSlice'
import * as api from '@/services/api'
import Loader from '@/components/Loader'

const STATUS_TONE = {
  open:      { bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b', label: 'Open' },
  resolved:  { bg: '#dcfce7', fg: '#166534', dot: '#16a34a', label: 'Resolved' },
  dismissed: { bg: '#f3f4f6', fg: '#374151', dot: '#9ca3af', label: 'Dismissed' },
}

const FILTERS = [
  { id: 'open',      label: 'Open' },
  { id: 'resolved',  label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: '',          label: 'All' },
]

function fmtDate (iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// H64 — Derive timeline steps from a dispute row. Each step is either
// done (with a timestamp) or pending. The final "Resolution" step uses
// the existing `resolved_at` / `resolution` columns.
function timelineSteps (d) {
  const resolutionLabel = (() => {
    if (!d.resolved_at) return 'Resolution'
    if (d.resolution === 'refund') return `Resolved — ₹${d.refund_amount || 0} refund`
    if (d.resolution === 'warn_partner') return 'Resolved — partner warned'
    if (d.status === 'dismissed' || d.resolution === 'dismissed') return 'Dismissed'
    return 'Resolved'
  })()
  return [
    {
      key: 'submitted',
      label: 'Submitted',
      actor: d.raised_role === 'partner' ? 'by partner' : 'by you',
      at: d.created_at,
      done: !!d.created_at,
    },
    {
      key: 'under_review',
      label: 'Under review',
      actor: d.under_review_at ? 'support team' : 'waiting…',
      at: d.under_review_at,
      done: !!d.under_review_at,
    },
    {
      key: 'partner_responded',
      label: 'Partner responded',
      actor: d.partner_response_at ? 'partner' : 'waiting…',
      at: d.partner_response_at,
      done: !!d.partner_response_at,
      note: d.partner_response_note,
    },
    {
      key: 'resolution',
      label: resolutionLabel,
      actor: d.resolved_at ? (d.admin_id ? 'admin' : 'system') : 'pending',
      at: d.resolved_at,
      done: !!d.resolved_at,
    },
  ]
}

function Timeline ({ dispute }) {
  const steps = timelineSteps(dispute)
  return (
    <ol className="mt-3 relative pl-5">
      <div className="absolute left-[5px] top-2 bottom-2 w-[2px] bg-border" aria-hidden />
      {steps.map((step) => (
        <li key={step.key} className="relative mb-3 last:mb-0">
          <span aria-hidden
            className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2
                        ${step.done
                          ? 'bg-accent border-accent'
                          : 'bg-card border-border'}`} />
          <div className={`text-[12.5px] font-bold ${step.done ? 'text-text' : 'text-muted'}`}>
            {step.label}
          </div>
          <div className="text-[10.5px] text-muted">
            {step.actor}
            {step.at && <> · {fmtDateTime(step.at)}</>}
          </div>
          {step.note && (
            <div className="text-[11.5px] text-text bg-surface border border-border
                            rounded-[8px] px-2.5 py-1.5 mt-1 leading-[1.55]">
              {step.note}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

export default function MyDisputesPage () {
  const nav   = useNavigate()
  const mode  = useSelector(selectMode)
  const isPartner = mode === 'partner'

  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')

  useEffect(() => {
    let cancelled = false
    api.fetchMyDisputes()
      .then((r) => { if (!cancelled) setList(r?.disputes || []) })
      .catch(() => { if (!cancelled) setList([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(
    () => filter ? list.filter((d) => d.status === filter) : list,
    [list, filter],
  )

  // Tally by status for the filter badges so admins can see at a glance
  // how many sit in each bucket.
  const counts = useMemo(() => {
    const c = { open: 0, resolved: 0, dismissed: 0 }
    list.forEach((d) => { if (c[d.status] != null) c[d.status] += 1 })
    return c
  }, [list])

  // Row destination depends on the viewer's role: customer → user job
  // detail; partner → partner transaction detail (where the
  // ReportProblemButton lives in their app).
  const goToJob = (jobId) => {
    if (isPartner) nav(`/partner/transactions/${jobId}`)
    else           nav(`/my-jobs/${jobId}`)
  }

  // H64 — when the customer (raiser) taps a row, we fetch the full
  // dispute (with under_review/partner_response milestones) and swap that
  // row in place. The first non-raiser GET also bumps the timeline server-side.
  const refreshRow = async (id) => {
    try {
      const { dispute } = await api.fetchDispute(id)
      if (!dispute) return
      setList((arr) => arr.map((d) => d.id === dispute.id
        ? { ...d, ...dispute } // keep joined job fields from /mine
        : d))
    } catch { /* swallow — user can retry */ }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[820px] mx-auto px-4 md:px-6 py-5 md:py-7">

        <header className="flex items-center gap-3 mb-5">
          <button onClick={() => nav(-1)}
            className="w-10 h-10 rounded-full bg-card border border-border
                       flex items-center justify-center hover:border-accent transition">
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] md:text-[26px] font-extrabold leading-tight m-0">
              ⚖️ My disputes
            </h1>
            <p className="text-[12px] text-muted m-0 mt-0.5">
              {isPartner
                ? 'Disputes raised on your jobs (by you or the customer).'
                : 'Disputes you raised on past jobs.'}
            </p>
          </div>
        </header>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto">
          {FILTERS.map((f) => {
            const on   = filter === f.id
            const cnt  = f.id ? counts[f.id] : list.length
            return (
              <button key={f.id || 'all'} onClick={() => setFilter(f.id)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap
                            border transition
                            ${on
                              ? 'bg-accent border-accent text-white shadow-[0_4px_12px_rgba(232,65,26,0.3)]'
                              : 'bg-card border-border text-muted hover:border-accent hover:text-accent'}`}>
                {f.label}{cnt != null ? ` · ${cnt}` : ''}
              </button>
            )
          })}
        </div>

        {/* List */}
        {loading ? (
          <div className="py-10 text-center text-muted text-sm">
            <Loader size={18} /> Loading disputes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-[12px] py-12 px-6 text-center">
            <div className="text-[36px] opacity-50 mb-2">⚖️</div>
            <p className="font-display font-extrabold text-[15px] m-0">
              {filter ? `No ${filter} disputes` : 'No disputes yet'}
            </p>
            <p className="text-[12px] text-muted m-0 mt-1 max-w-[320px] mx-auto leading-[1.55]">
              {isPartner
                ? "When you or a customer flags a paid job, it'll show up here."
                : "If something goes wrong with a paid job, you can flag it from the job detail page."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((d) => (
              <DisputeRow key={d.id} dispute={d}
                isPartner={isPartner}
                onOpenJob={() => goToJob(d.job_id)}
                onExpand={() => refreshRow(d.id)}
                onPatch={(patch) => setList((arr) =>
                  arr.map((row) => row.id === d.id ? { ...row, ...patch } : row))} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PartnerRespondForm ({ dispute, onSaved }) {
  const [text, setText] = useState(dispute.partner_response_note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState(null)
  const isEdit = !!dispute.partner_response_at

  const save = async () => {
    const note = text.trim()
    if (!note || busy) return
    setBusy(true); setErr(null)
    try {
      const { dispute: fresh } = await api.respondToDispute(dispute.id, note)
      onSaved?.(fresh)
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not send')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold text-muted">
        Your response to this dispute
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        placeholder="Explain what happened from your side. The customer will see this."
        rows={3}
        className="w-full bg-card border border-border rounded-[10px]
                   px-3 py-2 text-[12px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent resize-none" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">{text.length}/2000</span>
        <button onClick={save} disabled={busy || !text.trim() || text.trim() === (dispute.partner_response_note || '')}
          className="text-[11px] font-bold px-3 py-1.5 rounded-full
                     bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed
                     hover:brightness-90 transition">
          {busy ? 'Sending…' : (isEdit ? 'Update response' : 'Send response')}
        </button>
      </div>
      {err && <div className="text-[11px] text-danger">{err}</div>}
    </div>
  )
}

function DisputeRow ({ dispute, isPartner, onOpenJob, onExpand, onPatch }) {
  const tone = STATUS_TONE[dispute.status] || STATUS_TONE.open
  const [open, setOpen] = useState(false)
  // Show the OTHER party's name — the viewer already knows their own role.
  const otherName = isPartner
    ? (dispute.customer_name || 'Customer')
    : (dispute.partner_name  || 'Partner')
  // Reason preview — first 220 chars, single line.
  const reasonShort = (dispute.reason || '').replace(/\s+/g, ' ').trim().slice(0, 220)

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) onExpand?.()       // fetch full timeline on first expand
  }

  return (
    <div className="bg-card border border-border rounded-[12px] p-4
                    hover:border-accent transition">
      <button onClick={toggle}
        aria-expanded={open}
        className="w-full text-left focus:outline-none">
        <div className="flex items-start gap-3">
          {/* Status dot column */}
          <div className="shrink-0 mt-1">
            <span className="block w-2 h-2 rounded-full"
                  style={{ background: tone.dot }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.4px]
                               px-2 py-[3px] rounded-full"
                    style={{ background: tone.bg, color: tone.fg }}>
                {tone.label}
              </span>
              <span className="text-[10px] text-muted">
                by {dispute.raised_role === 'partner'
                    ? (isPartner ? 'you' : 'partner')
                    : (isPartner ? 'customer' : 'you')}
              </span>
              <span className="ml-auto text-[10px] text-muted">
                {fmtDate(dispute.created_at)}
              </span>
            </div>

            <p className="font-display font-extrabold text-[14px] text-text leading-tight m-0">
              {(dispute.service_icon || '') + ' '}{dispute.service || 'Service'}
              {dispute.agreed_price != null && (
                <span className="text-muted font-normal text-[12px]"> · ₹{dispute.agreed_price}</span>
              )}
            </p>
            <p className="text-[11px] text-muted m-0 mt-0.5 truncate">
              with {otherName} · job #{dispute.job_id}
            </p>

            {reasonShort && !open && (
              <p className="text-[12px] text-text m-0 mt-2 leading-[1.55] line-clamp-2">
                <span className="text-muted text-[10px] font-bold uppercase tracking-[0.4px] mr-1">
                  Reason:
                </span>
                {reasonShort}
              </p>
            )}
          </div>

          <span aria-hidden className={`shrink-0 text-muted text-[14px] transition-transform
                                        ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {open && (
        <div className="mt-2 pt-2 border-t border-border">
          {dispute.reason && (
            <p className="text-[12px] text-text m-0 leading-[1.55]">
              <span className="text-muted text-[10px] font-bold uppercase tracking-[0.4px] mr-1">
                Reason:
              </span>
              {dispute.reason}
            </p>
          )}

          {/* H64 — timeline */}
          <Timeline dispute={dispute} />

          {dispute.resolution_note && (
            <p className="text-[12px] text-text m-0 mt-2 leading-[1.55] bg-surface
                          border border-border rounded-[8px] px-2.5 py-1.5">
              <span className="text-muted text-[10px] font-bold uppercase tracking-[0.4px] mr-1">
                Admin note:
              </span>
              {dispute.resolution_note}
            </p>
          )}

          {dispute.refund_amount != null && (
            <p className="text-[11px] text-success font-bold m-0 mt-2">
              💸 ₹{dispute.refund_amount} refund issued
            </p>
          )}

          {/* H64 — partner-side response form. Only on open disputes. */}
          {isPartner && dispute.status === 'open' && (
            <PartnerRespondForm dispute={dispute}
              onSaved={(fresh) => onPatch?.(fresh)} />
          )}

          <div className="flex justify-end mt-3">
            <button onClick={(e) => { e.stopPropagation(); onOpenJob?.() }}
              className="text-[11px] font-bold px-3 py-1.5 rounded-full
                         border border-border bg-surface text-text
                         hover:border-accent hover:text-accent transition">
              Open job →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
