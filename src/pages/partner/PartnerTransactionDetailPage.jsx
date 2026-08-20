// End-to-end detail for a single wallet transaction.
//
// Shows: transaction (ref, amount, cleared state, timestamps) + the job it
// credited (service, base/agreed price, distance, notes, full timeline) +
// both parties (partner = current user, customer snapshot from the job).

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as api from '@/services/api'
import { loadMyPartner, selectPartnerProfile } from '@/features/partner/partnerSlice'
import { formatDistance, formatPrice } from '@/utils/format'
import Loader from '@/components/Loader'
import { DetailSkeleton } from '@/components/Skeleton'
import ReportProblemButton from '@/components/ReportProblemButton'
import RateCustomerCard from '@/components/RateCustomerCard'

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

export default function PartnerTransactionDetailPage () {
  const { id }     = useParams()
  const nav        = useNavigate()
  const loc        = useLocation()
  const dispatch   = useDispatch()
  const partner    = useSelector(selectPartnerProfile)

  const [tx, setTx]       = useState(loc.state?.tx || null)
  const [job, setJob]     = useState(null)
  const [loading, setLoading] = useState(true)

  // If landed here directly (e.g. deep link / refresh) we don't have the tx
  // in route state — refetch the full list and pick the right row.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        let currentTx = tx
        if (!currentTx) {
          const r = await api.fetchTransactions()
          currentTx = (r.transactions || []).find((t) => t.id === id) || null
          if (!cancelled) setTx(currentTx)
        }
        if (currentTx?.job_id) {
          const j = await api.fetchJob(currentTx.job_id).catch(() => null)
          if (!cancelled) setJob(j?.job || null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Ensure we have the logged-in partner's profile for the Partner card.
  useEffect(() => {
    if (!partner) dispatch(loadMyPartner())
  }, [partner, dispatch])

  const amount = Number(tx?.total || tx?.amount || 0)
  const tip    = Number(tx?.tip || 0)
  const cleared = !!tx?.cleared

  const partnerName = partner?.full_name || tx?.partner_name || 'You'
  const partnerAv   = partner?.avatar_class || hashToAv(partnerName)
  const partnerIni  = initialsOf(partnerName)
  const partnerRole = partner?.primary_category || job?.category_name || 'Partner'

  const customerName = job?.customer_name || tx?.customer_name || 'Customer'
  const customerAv   = job?.customer_av_class || hashToAv(customerName)
  const customerIni  = job?.customer_initials || initialsOf(customerName)
  const customerPhone = job?.customer_phone || ''
  const customerAddress = job?.customer_address || '—'

  const mapUrl = useMemo(() => {
    if (job?.customer_lat != null && job?.customer_lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${job.customer_lat},${job.customer_lng}`
    }
    if (customerAddress && customerAddress !== '—') {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}`
    }
    return null
  }, [job, customerAddress])

  if (loading && !tx) {
    return <div className="p-5 max-w-lg mx-auto"><DetailSkeleton /></div>
  }
  if (!tx) {
    return (
      <div className="p-8">
        <button onClick={() => nav(-1)} className="text-[12px] text-muted font-semibold mb-3">← Back</button>
        <div className="bg-card border border-border rounded-[var(--r)] p-8 text-center">
          <div className="text-[32px] mb-2">💳</div>
          <div className="font-display font-extrabold">Transaction not found</div>
        </div>
      </div>
    )
  }

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
          <div className="font-display font-extrabold text-[18px] text-text">Transaction Detail</div>
        </div>

        {/* Amount hero */}
        <div className="bg-card rounded-[var(--r)] border border-border shadow-card overflow-hidden mb-4">
          <div className="bg-[#0a0f1e] text-white p-5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[1px] text-white/55 mb-1">
                Amount Credited
              </div>
              <div className="font-display font-extrabold text-[32px] leading-none">
                {cleared ? '+' : ''}{formatPrice(amount)}
              </div>
              {tip > 0 && (
                <div className="text-[11px] text-white/60 mt-1.5">Includes tip {formatPrice(tip)}</div>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl
                             text-[11px] font-bold"
                  style={{
                    background: cleared ? '#dcfce7' : '#fef3c7',
                    color: cleared ? '#166534' : '#92400e',
                  }}>
              <span className="w-1.5 h-1.5 rounded-full"
                    style={{ background: cleared ? '#16a34a' : '#f59e0b' }} />
              {cleared ? 'Credited' : 'Pending clearance'}
            </span>
          </div>

          <Row label="Transaction ID" value={<span className="font-mono">{tx.id}</span>} />
          <Row label="Service" value={tx.service || job?.service || '—'} />
          <Row label="Job ID" value={job?.id ? shortId(job.id) : '—'} />
          <Row label="Credited on" value={fmtDateTime(tx.created_at)} />
          {!cleared && tx.eligible_at && (
            <Row label="Clears on" value={fmtDateTime(tx.eligible_at)} />
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Partner (you) */}
          <Card title="👷 Partner">
            <div className="flex items-center gap-3 px-[18px] py-[14px] border-b border-border">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center
                               font-bold text-[13px] shrink-0 ${partnerAv}`}>{partnerIni}</div>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-text truncate">{partnerName}</div>
                <div className="text-[11px] text-muted truncate">{partnerRole} (you)</div>
              </div>
            </div>
            {partner?.phone && (
              <InfoRow icon="📞" bg="#dbeafe" fg="#1e40af" label="Phone" value={partner.phone} />
            )}
            {partner?.location_city && (
              <InfoRow icon="🏙" bg="#ede9fe" fg="#6d28d9" label="City" value={partner.location_city} />
            )}
            {partner?.rating_avg != null && (
              <InfoRow icon="⭐" bg="#fef3c7" fg="#92400e"
                       label="Rating"
                       value={`${Number(partner.rating_avg).toFixed(1)} · ${partner.jobs_completed || 0} jobs`} />
            )}
          </Card>

          {/* Customer */}
          <Card title="👤 Customer">
            <div className="flex items-center gap-3 px-[18px] py-[14px] border-b border-border">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center
                               font-bold text-[13px] shrink-0 ${customerAv}`}>{customerIni}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-text truncate">{customerName}</div>
                <div className="text-[11px] text-muted truncate">Customer</div>
              </div>
              {customerPhone && (
                <a href={`tel:${customerPhone}`}
                  className="w-9 h-9 rounded-full bg-[#2563eb] text-white
                             grid place-items-center text-[14px] hover:brightness-90 transition">
                  📞
                </a>
              )}
            </div>
            {customerPhone && (
              <InfoRow icon="📞" bg="#dbeafe" fg="#1e40af" label="Phone"
                       value={<a href={`tel:${customerPhone}`} className="text-text">{customerPhone}</a>} />
            )}
            {job?.customer_email && (
              <InfoRow icon="✉️" bg="#fce7f3" fg="#be185d" label="Email"
                       value={job.customer_email} valueClassName="break-all" />
            )}
            <InfoRow icon="🏠" bg="#fee2e2" fg="#b91c1c" label="Service Address" value={customerAddress} />
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

        {/* Job Details */}
        <Card title="📋 Job Details" className="mt-4">
          <InfoRow icon="🔧" bg="#fef3c7" fg="#92400e" label="Service"
                   value={job?.service || job?.category_name || tx.service || '—'} />
          <InfoRow icon="💰" bg="#dcfce7" fg="#166534" label="Base price"
                   value={job?.base_price != null ? formatPrice(job.base_price) : '—'} />
          <InfoRow icon="✨" bg="#ede9fe" fg="#6d28d9" label="Agreed price"
                   value={job?.agreed_price != null ? formatPrice(job.agreed_price) : formatPrice(amount)} />
          {job?.distance_km != null && (
            <InfoRow icon="📐" bg="#dbeafe" fg="#1e40af" label="Distance" value={formatDistance(job.distance_km)} />
          )}
          {job?.notes && (
            <div className="px-[18px] py-3 border-b border-border text-[12px] text-muted italic leading-[1.6]">
              📝 {job.notes}
            </div>
          )}
        </Card>

        {/* Timeline */}
        <Card title="🕒 Timeline" className="mt-4">
          <Timeline row={[
            { label: 'Accepted',  at: job?.accepted_at },
            { label: 'Started',   at: job?.started_at },
            { label: 'Completed', at: job?.completed_at },
            { label: 'Paid',      at: job?.paid_at },
            { label: 'Credited',  at: tx.created_at },
          ]} />
          {job?.started_at && job?.completed_at && (
            <div className="px-[18px] py-3 border-t border-border text-[12px] text-muted">
              Job duration: <span className="text-text font-semibold">
                {durationBetween(job.started_at, job.completed_at)}
              </span>
            </div>
          )}
        </Card>

        {/* Rate the customer — only meaningful once the job has actually
            been done. Card hides itself by reading server state, so it's
            safe to mount whenever we have a job_id. */}
        {job?.id && (
          <div className="mt-4">
            <RateCustomerCard jobId={job.id} customerName={customerName} />
          </div>
        )}

        {/* Dispute — partner can also flag a paid/completed job (e.g.
            customer was abusive). Renders nothing on non-flaggable states. */}
        {job && (
          <div className="mt-4">
            <ReportProblemButton job={job} />
          </div>
        )}
      </div>
    </div>
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
        <div className={`text-[13px] font-semibold text-text ${valueClassName}`}>
          {value}
        </div>
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
