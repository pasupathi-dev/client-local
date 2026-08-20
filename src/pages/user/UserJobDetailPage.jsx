// End-to-end detail for a single past / active job, from the customer side.
// Mirrors the partner Transaction Detail page but from the customer's POV:
// their partner + service + full timeline + pricing + contact / map.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectActiveJob } from '@/features/jobs/jobsSlice'
import * as api from '@/services/api'
import { formatDistance, formatPrice } from '@/utils/format'
import Loader from '@/components/Loader'
import { DetailSkeleton } from '@/components/Skeleton'
import ReportProblemButton from '@/components/ReportProblemButton'
import SelfServePanel      from '@/components/SelfServePanel'
import ShareTrackLinkModal from '@/components/ShareTrackLinkModal'
import ExtraWorkSummary from '@/components/ExtraWorkSummary'
import useLivePartnerEta from '@/hooks/useLivePartnerEta'

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '—'

const shortId = (id) => (!id ? '#—' : String(id).startsWith('#') ? id : `#${id}`)

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const durationBetween = (a, b) => {
  if (!a || !b) return '—'
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

const STATE_PILL = {
  paid:      { bg: '#dcfce7', fg: '#166534', label: 'Paid' },
  completed: { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting payment' },
  cancelled: { bg: '#fee2e2', fg: '#b91c1c', label: 'Cancelled' },
  working:   { bg: '#fef3c7', fg: '#92400e', label: 'In progress' },
  arrived:   { bg: '#fef3c7', fg: '#92400e', label: 'Arrived' },
  travelling:{ bg: '#dbeafe', fg: '#1e40af', label: 'Travelling' },
  accepted:  { bg: '#fef3c7', fg: '#92400e', label: 'Active' },
  priceConfirmed:{ bg: '#fef3c7', fg: '#92400e', label: 'Active' },
}

export default function UserJobDetailPage () {
  const { id }   = useParams()
  const nav      = useNavigate()
  const activeJob = useSelector(selectActiveJob)
  const [fetched, setFetched] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.fetchJob(id)
      .then((r) => { if (!cancelled) setFetched(r.job || null) })
      .catch((e) => { if (!cancelled) setErr(e?.response?.data?.message || e?.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  // Prefer the Redux-tracked active job when its id matches — that copy
  // receives live state patches via the global useRealtime hook, so the
  // LivePartnerMap appears the moment the partner taps "Travelling"
  // without us having to poll.
  const job = (activeJob && activeJob.id === id)
    ? { ...fetched, ...activeJob }
    : fetched

  const mapUrl = useMemo(() => {
    if (!job) return null
    if (job.customer_lat != null && job.customer_lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${job.customer_lat},${job.customer_lng}`
    }
    if (job.customer_address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.customer_address)}`
    }
    return null
  }, [job])

  // H40 — live ETA. MUST be called every render (Rules of Hooks), so it
  // sits above the early returns. The hook itself short-circuits to null
  // when there's no job yet or the state isn't in motion.
  const { etaText: liveEtaText } = useLivePartnerEta({ job })

  if (loading) return <div className="p-5"><DetailSkeleton /></div>
  if (err || !job) {
    return (
      <div className="p-8">
        <button onClick={() => nav(-1)}
          className="text-[12px] text-muted font-semibold mb-3">← Back</button>
        <div className="bg-card border border-border rounded-[var(--r)] p-8 text-center">
          <div className="text-[32px] mb-2">🔍</div>
          <div className="font-display font-extrabold">{err || 'Job not found'}</div>
        </div>
      </div>
    )
  }

  const pill = STATE_PILL[job.state] || { bg: '#e5e7eb', fg: '#374151', label: job.state }
  const partnerName = job.partner_name || 'Partner'
  // Booleans for the Call + Share + ETA badge.
  // H41 — Row stays visible across every active state; only Call disables
  // until the partner is en route. Share is meaningful only while location
  // is streaming (travelling+).
  const isActive   = ['accepted', 'priceConfirmed', 'travelling', 'arrived', 'working'].includes(job.state)
  const canCall    = ['travelling', 'arrived', 'working'].includes(job.state)
  const canShare   = ['travelling', 'arrived', 'working'].includes(job.state)
  const partnerAv   = job.partner_av_class || hashToAv(job.partner_id || partnerName)
  const partnerIni  = job.partner_initials || initialsOf(partnerName)
  const base    = Number(job.base_price || 0)
  const agreed  = Number(job.agreed_price || 0)
  const savings = Math.max(0, base - agreed)

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1100px] mx-auto p-5 md:p-7">
        {/* Back */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nav(-1)}
            className="w-9 h-9 rounded-full bg-card border border-border
                       flex items-center justify-center hover:border-accent transition">
            ←
          </button>
          <div className="font-display font-extrabold text-[18px] text-text">Job Detail</div>
        </div>

        {/* Hero */}
        <div className="bg-card rounded-[var(--r)] border border-border shadow-card overflow-hidden mb-4">
          <div className="bg-[#0a0f1e] text-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display font-extrabold text-[17px] truncate">
                  {job.service || job.category_name} — {partnerName}
                </div>
                <div className="text-[11px] text-white/55 mt-1 flex items-center gap-2 flex-wrap">
                  <span>Job {shortId(job.id)}</span>
                  {/* H40 — live ETA. Shown when we have one from the location
                      stream; falls back to the partner's promised eta_min
                      (M35) if no ping yet. */}
                  {liveEtaText && (
                    <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full
                                     bg-white/10 text-white font-bold">
                      ⏱ {liveEtaText}
                    </span>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center shrink-0 px-2.5 py-1 rounded-xl
                               text-[11px] font-bold"
                    style={{ background: pill.bg, color: pill.fg }}>
                {pill.label}
              </span>
            </div>

            {/* H41 — Prominent Call + Chat row. Mounted at the top of the
                hero so the customer doesn't dig through menus. Call is
                disabled until the partner is on the way (travelling+),
                Chat is always available once the job is accepted. */}
            {isActive && (
              <div className="mt-4 flex gap-2">
                <a href={canCall && job.partner_phone ? `tel:${job.partner_phone}` : undefined}
                   onClick={(e) => { if (!canCall || !job.partner_phone) e.preventDefault() }}
                   aria-disabled={!canCall || !job.partner_phone}
                   className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5
                              rounded-[var(--rs)] font-bold text-[13px] transition
                              ${canCall && job.partner_phone
                                ? 'bg-[#2563eb] text-white hover:brightness-110'
                                : 'bg-white/10 text-white/40 cursor-not-allowed'}`}>
                  📞 Call
                </a>
                <button onClick={() => nav(`/chat/${job.id}`)}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5
                             rounded-[var(--rs)] bg-success text-white font-bold text-[13px]
                             hover:brightness-[1.05] transition">
                  💬 Chat
                </button>
                {/* H39 — Share live tracking. Only meaningful in motion states. */}
                {canShare && (
                  <button onClick={() => setShareOpen(true)}
                    className="inline-flex items-center justify-center px-3 py-2.5
                               rounded-[var(--rs)] bg-white/10 text-white text-[13px]
                               font-bold hover:bg-white/20 transition"
                    title="Share live tracking with family">
                    📍 Share
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* H39 modal */}
        <ShareTrackLinkModal
          open={shareOpen}
          job={job}
          onClose={() => setShareOpen(false)} />

        <div className="grid gap-4 md:grid-cols-2">
          {/* Partner */}
          <Card title="👤 Partner">
            <div className="flex items-center gap-3 px-[18px] py-[14px] border-b border-border">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center
                               font-bold text-[13px] shrink-0 ${partnerAv}`}>{partnerIni}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-text truncate">{partnerName}</div>
                <div className="text-[11px] text-muted truncate">{job.category_name || 'Partner'}</div>
              </div>
              {job.partner_phone && (
                <a href={`tel:${job.partner_phone}`}
                  className="w-9 h-9 rounded-full bg-[#2563eb] text-white
                             grid place-items-center text-[14px]">📞</a>
              )}
            </div>
            {job.partner_phone && <InfoRow icon="📞" bg="#dbeafe" fg="#1e40af" label="Phone"
                                           value={<a href={`tel:${job.partner_phone}`} className="text-text">{job.partner_phone}</a>} />}
            {job.partner_city && <InfoRow icon="🏙" bg="#ede9fe" fg="#6d28d9" label="City" value={job.partner_city} />}
          </Card>

          {/* Service address / location */}
          <Card title="📍 Service Address">
            <InfoRow icon="🏠" bg="#fee2e2" fg="#b91c1c" label="Address" value={job.customer_address || '—'} />
            {job.distance_km != null && (
              <InfoRow icon="📐" bg="#dbeafe" fg="#1e40af" label="Distance"
                       value={formatDistance(job.distance_km)} />
            )}
            {mapUrl && (
              <div className="px-[18px] pb-3">
                <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block text-[11px] font-bold text-accent hover:underline">
                  🗺 Open in Maps
                </a>
              </div>
            )}
          </Card>
        </div>

        {/* M44 — Extra-work proposals. Empty list is invisible; otherwise
            shows pending rows with Approve/Decline buttons and historical
            approved/declined rows for reference. */}
        {['priceConfirmed','travelling','arrived','working','completed'].includes(job.state) && (
          <div className="mt-4 bg-card border border-border rounded-[var(--r)] shadow-card p-3">
            <ExtraWorkSummary jobId={job.id} role="customer" />
          </div>
        )}

        {/* Price + payment breakdown */}
        <Card title="💰 Pricing" className="mt-4">
          <Row label="Base price" value={base ? formatPrice(base) : '—'} />
          <Row label="Agreed price"
               value={<span className="text-success font-bold">{formatPrice(agreed)}</span>} />
          {savings > 0 && (
            <Row label="You saved"
                 value={<span className="text-success font-bold">{formatPrice(savings)} 🎉</span>} />
          )}
          <Row label="Platform fee" value={<span className="text-success">Free</span>} />
        </Card>

        {/* Job Details */}
        <Card title="📋 Job Details" className="mt-4">
          <InfoRow icon="🔧" bg="#fef3c7" fg="#92400e" label="Service"
                   value={job.service || job.category_name || '—'} />
          <InfoRow icon="🆔" bg="#ede9fe" fg="#6d28d9" label="Job ID" value={shortId(job.id)} />
          {job.notes && (
            <div className="px-[18px] py-3 border-b border-border text-[12px] text-muted italic leading-[1.6]">
              📝 {job.notes}
            </div>
          )}
        </Card>

        {/* M51 — Receipt download. Only meaningful after payment. */}
        {job.state === 'paid' && (
          <div className="mt-4">
            <ReceiptDownloadButton jobId={job.id} />
          </div>
        )}

        {/* Timeline */}
        <Card title="🕒 Timeline" className="mt-4">
          <Timeline row={[
            { label: 'Accepted',  at: job.accepted_at },
            { label: 'Started',   at: job.started_at },
            { label: 'Completed', at: job.completed_at },
            { label: 'Paid',      at: job.paid_at },
          ]} />
          {job.started_at && job.completed_at && (
            <div className="px-[18px] py-3 border-t border-border text-[12px] text-muted">
              Job duration: <span className="text-text font-semibold">
                {durationBetween(job.started_at, job.completed_at)}
              </span>
            </div>
          )}
        </Card>

        {job.cancel_reason && (
          <Card title="⚠ Cancellation" className="mt-4">
            <InfoRow icon="✖️" bg="#fee2e2" fg="#b91c1c" label="Reason" value={job.cancel_reason} />
            {job.cancelled_by && <InfoRow icon="👤" bg="#e5e7eb" fg="#374151" label="Cancelled by" value={job.cancelled_by} />}
          </Card>
        )}

        {/* Action row */}
        <div className="mt-4 flex gap-2">
          <button onClick={() => nav(`/chat/${job.id}`)}
            className="flex-1 py-3 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                       text-[13px] font-semibold text-text hover:border-accent hover:text-accent transition">
            💬 Open Chat
          </button>
          {job.state === 'completed' && (
            <button onClick={() => nav(`/pay/${job.id}`)}
              className="flex-1 py-3 rounded-[var(--rs)] bg-accent text-white text-[13px] font-bold
                         shadow-[0_4px_16px_rgba(232,65,26,0.35)] hover:brightness-90 transition">
              💳 Pay Now
            </button>
          )}
        </div>

        {/* M67 — self-serve panel: reschedule / refund / no-show */}
        <SelfServePanel job={job} />

        {/* Dispute — renders nothing unless state is paid/completed. */}
        <div className="mt-4">
          <ReportProblemButton job={job} />
        </div>
      </div>
    </div>
  )
}

// M51 — Click-to-download receipt PDF. We fetch via the apiClient (so the
// bearer token is attached automatically), turn the blob into a temp URL,
// and synthesise a click on a hidden anchor with the `download` attribute.
function ReceiptDownloadButton ({ jobId }) {
  const [busy, setBusy] = useState(false)
  const onClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const url = await api.downloadJobReceipt(jobId)
      const a = document.createElement('a')
      a.href = url
      a.download = `servicelink-receipt-${String(jobId).slice(-6)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoke after a tick so the browser has the URL while it begins
      // streaming the download.
      setTimeout(() => URL.revokeObjectURL(url), 5_000)
    } catch { /* swallow — caller can retry */ }
    finally { setBusy(false) }
  }
  return (
    <button onClick={onClick} disabled={busy}
      className="w-full px-4 py-3 rounded-[var(--r)] border border-border bg-card
                 hover:border-accent transition flex items-center justify-center gap-2
                 text-[13px] font-bold text-text shadow-card disabled:opacity-60">
      📄 {busy ? 'Preparing receipt…' : 'Download receipt (PDF)'}
    </button>
  )
}

function Row ({ label, value }) {
  return (
    <div className="flex items-center justify-between px-[18px] py-3 border-b border-border last:border-b-0">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[13px] text-text font-semibold text-right break-all ml-3">{value}</span>
    </div>
  )
}

function Card ({ title, children, className = '' }) {
  return (
    <div className={`bg-card border border-border rounded-[var(--r)] overflow-hidden shadow-card ${className}`}>
      <div className="px-[18px] py-3 border-b border-border font-display font-bold text-[13px] text-text">
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

function InfoRow ({ icon, bg, fg, label, value, valueClassName = '' }) {
  return (
    <div className="flex items-center gap-3 px-[18px] py-3 border-b border-border last:border-b-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[15px] shrink-0"
           style={{ background: bg, color: fg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mb-0.5">
          {label}
        </div>
        <div className={`text-[13px] font-semibold text-text ${valueClassName}`}>{value}</div>
      </div>
    </div>
  )
}

function Timeline ({ row }) {
  return (
    <div className="px-[18px] py-4 flex flex-col gap-0">
      {row.map((r, i) => {
        const done = !!r.at
        const isLast = i === row.length - 1
        return (
          <div key={r.label} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold
                               border-[2px] ${done
                                 ? 'bg-success border-success text-white'
                                 : 'bg-card border-border text-muted'}`}>
                {done ? '✓' : i + 1}
              </div>
              {!isLast && (
                <div className={`w-[2px] flex-1 min-h-[22px] ${done ? 'bg-success' : 'bg-border'}`} />
              )}
            </div>
            <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
              <div className={`text-[13px] font-bold ${done ? 'text-text' : 'text-muted'}`}>
                {r.label}
              </div>
              <div className="text-[11px] text-muted">{done ? fmtDateTime(r.at) : '—'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
