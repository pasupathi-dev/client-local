// Payment / Order Summary — itemised breakdown + tip chips + cash mode +
// failure recovery (H47 / H48 / H49 / M50).
//
// Flow:
//   1. Mount → fetch the server-side bill breakdown (no Razorpay yet)
//   2. Customer picks an optional tip → breakdown re-quotes
//   3. Tap Pay → POST /api/payments/create-order (server creates Razorpay)
//      OR tap Pay cash → POST /api/payments/cash-request (partner confirms)
//   4. Razorpay path: open Checkout → verify signature server-side
//   5. On Razorpay verify failure: show three recovery actions
//        (Try again / Try a different method / Pay in cash)
//
// The server is the only authority that marks a job paid — even if someone
// tampers with the client, they can't forge a success.

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import { setActiveJob, selectActiveJob, fetchActiveJobThunk } from '@/features/jobs/jobsSlice'
import { loadPartnerDetail, selectPartnerDetail, clearDetail } from '@/features/catalog/catalogSlice'
import { selectProfile } from '@/features/profile/profileSlice'
import { pushToast } from '@/features/app/appSlice'
import { formatPrice } from '@/utils/format'
import * as api from '@/services/api'
import { openCheckout } from '@/services/razorpay'
import { getSocket } from '@/services/socket'
import Loader from '@/components/Loader'
import { DetailSkeleton } from '@/components/Skeleton'

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'P'

const shortId = (id) => (!id ? '#—' : String(id).startsWith('#') ? id : `#${id}`)

const STATE_PILL = {
  completed: { bg: '#dcfce7', fg: '#166534', label: 'Completed' },
  paid:      { bg: '#dcfce7', fg: '#166534', label: 'Paid' },
}

const TIP_CHOICES = [0, 20, 50, 100]

export default function PaymentPage () {
  const { jobId }  = useParams()
  const dispatch   = useDispatch()
  const nav        = useNavigate()
  const job        = useSelector(selectActiveJob)
  const profile    = useSelector(selectProfile)
  const partnerEnv = useSelector(selectPartnerDetail)
  const partnerDetail = partnerEnv?.partner || null
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [errorKind, setErrorKind] = useState(null) // null | 'razorpay' | 'cash'
  const [tip, setTip]       = useState(0)
  const [customTip, setCustomTip] = useState('')
  const [breakdown, setBreakdown] = useState(null)
  const [cashPending, setCashPending] = useState(false)

  useEffect(() => {
    if (!job || job.id !== jobId) dispatch(fetchActiveJobThunk('user'))
  }, [jobId, job?.id, dispatch, job])

  useEffect(() => {
    if (job?.partner_id) dispatch(loadPartnerDetail({ id: job.partner_id }))
    return () => dispatch(clearDetail())
  }, [job?.partner_id, dispatch])

  // H47 — re-fetch the breakdown whenever the tip changes. Cheap; the
  // server endpoint does no Razorpay roundtrip.
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    api.fetchJobBill(jobId, tip).then((r) => {
      if (!cancelled) setBreakdown(r.breakdown || null)
    }).catch(() => { /* keep previous on error */ })
    return () => { cancelled = true }
  }, [jobId, tip])

  // M50 — listen for partner's cash confirmation (or decline) socket events.
  useEffect(() => {
    if (!jobId) return undefined
    let sock; let onConf; let onRej; let cancelled = false
    getSocket().then((s) => {
      if (cancelled) return
      sock = s
      onConf = ({ jobId: jid }) => {
        if (jid !== jobId) return
        setCashPending(false)
        setBusy(false)
        nav(`/done/${jobId}`, { replace: true })
      }
      onRej = ({ jobId: jid }) => {
        if (jid !== jobId) return
        setCashPending(false)
        setBusy(false)
        setError('Partner did not confirm cash — please try another payment method.')
        setErrorKind('cash')
      }
      sock.on('payment:cash-confirmed', onConf)
      sock.on('payment:cash-rejected',  onRej)
    }).catch(() => {})
    return () => {
      cancelled = true
      if (sock) {
        if (onConf) sock.off('payment:cash-confirmed', onConf)
        if (onRej)  sock.off('payment:cash-rejected',  onRej)
      }
    }
  }, [jobId, nav])

  const pill = STATE_PILL[job?.state] || STATE_PILL.completed
  const partnerName  = job?.partner_name || partnerDetail?.full_name || 'Partner'
  const partnerIni   = job?.partner_initials || initialsOf(partnerName)
  const partnerAv    = job?.partner_av_class || hashToAv(job?.partner_id || partnerName)
  const partnerRole  = partnerDetail?.primary_category || job?.category_name || 'Service Pro'
  const partnerRating = Number(partnerDetail?.rating_avg || 0)
  const partnerJobs   = Number(partnerDetail?.jobs_completed || 0)
  const partnerVerified = !!partnerDetail?.aadhaar_verified

  // Final tip the customer is committing to: chip + custom-input fallback.
  const effectiveTip = (() => {
    const c = Number(customTip)
    if (Number.isFinite(c) && c > 0 && c <= 10_000) return Math.round(c)
    return Math.round(tip || 0)
  })()
  useEffect(() => {
    // When the user types a custom tip, mirror it into `tip` so the
    // re-quote effect picks it up.
    const c = Number(customTip)
    if (Number.isFinite(c) && c >= 0 && c <= 10_000) setTip(Math.round(c))
  }, [customTip])

  const totalToPay = breakdown?.total ?? Number(job?.agreed_price || 0) + effectiveTip

  const payOnline = async () => {
    if (busy) return
    setBusy(true); setError(''); setErrorKind(null)
    try {
      const order = await api.createPaymentOrder(jobId, effectiveTip)
      if (!order?.order_id || !order?.key_id) throw new Error('Could not create order')

      const resp = await openCheckout({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'ServiceLink',
        description: `${job.service || 'Service'} — ${partnerName}`,
        prefill: {
          name: profile?.full_name || '',
          email: profile?.email || '',
          contact: profile?.phone || '',
        },
        notes: { job_id: String(jobId) },
        theme: { color: '#e8411a' },
      })

      const verified = await api.verifyPayment({
        job_id: jobId,
        razorpay_order_id:   resp.razorpay_order_id,
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature:  resp.razorpay_signature,
      })
      if (verified?.job) dispatch(setActiveJob(verified.job))

      nav(`/done/${jobId}`, { replace: true })
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Payment failed'
      if (/cancelled/i.test(msg)) {
        api.cancelPayment(jobId)
        dispatch(pushToast({ text: 'Payment cancelled' }))
        setBusy(false)
        return
      }
      // H49 — show recovery card. Razorpay signature mismatch or verify
      // failure lands here.
      setError(msg)
      setErrorKind('razorpay')
      setBusy(false)
    }
  }

  const payCash = async () => {
    if (busy) return
    setBusy(true); setError(''); setErrorKind(null)
    try {
      await api.requestCashPayment(jobId, effectiveTip)
      setCashPending(true)
      // We stay busy until the partner socket-confirms (or rejects).
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not request cash payment')
      setErrorKind('cash')
      setBusy(false)
    }
  }

  if (!job || job.id !== jobId) {
    return <div className="p-5 max-w-lg mx-auto"><DetailSkeleton /></div>
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1100px] mx-auto px-5 md:px-7 py-5 md:py-7">
        <div className="grid gap-5 md:gap-6 md:grid-cols-[1.6fr_1fr] items-start">
          {/* ── LEFT COLUMN ─────────────────────────────────────── */}
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-muted uppercase tracking-[0.5px] mb-2">
              Order Summary
            </div>

            {/* Dark job header */}
            <div className="bg-card rounded-[var(--r)] overflow-hidden border border-border shadow-card">
              <div className="bg-[#0a0f1e] text-white p-4 md:p-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display font-extrabold text-[16px] md:text-[17px] leading-tight truncate">
                    {job.service || job.category_name} — {partnerName}
                  </div>
                  <div className="text-[11px] text-white/55 mt-1">Job {shortId(job.id)}</div>
                </div>
                <span className="inline-flex items-center shrink-0 px-2.5 py-1 rounded-xl
                                 text-[11px] font-bold"
                      style={{ background: pill.bg, color: pill.fg }}>
                  {pill.label}
                </span>
              </div>

              {/* H47 — Itemised breakdown */}
              <div className="divide-y divide-border">
                {breakdown ? (
                  <>
                    {breakdown.service > 0 && (
                      <Row label="Service" value={formatPrice(breakdown.service)} />
                    )}
                    {breakdown.materials > 0 && (
                      <Row label="Materials" value={formatPrice(breakdown.materials)} />
                    )}
                    {breakdown.travel > 0 && (
                      <Row label="Travel" value={formatPrice(breakdown.travel)} />
                    )}
                    <Row label={`Platform fee${breakdown.platformFeePct ? ` (${breakdown.platformFeePct}%)` : ''}`}
                         value={breakdown.platformFee > 0 ? formatPrice(breakdown.platformFee) : 'Free'} />
                    <Row label={`GST (${breakdown.gstPct}%)`}
                         value={breakdown.gst > 0 ? formatPrice(breakdown.gst) : '—'} />
                    {breakdown.tip > 0 && (
                      <Row label="Tip for partner"
                           value={<span className="text-success font-bold">{formatPrice(breakdown.tip)}</span>} />
                    )}
                  </>
                ) : (
                  <Row label="Loading…" value={<Loader size={12} />} />
                )}
              </div>
            </div>

            {/* Total */}
            <div className="bg-card border border-border rounded-[var(--r)] mt-3 px-4 py-3.5
                            flex items-center justify-between shadow-card">
              <div className="text-[13px] font-bold text-text">Total Payable</div>
              <div className="font-display font-extrabold text-[24px] text-text">
                {formatPrice(totalToPay)}
              </div>
            </div>

            {/* H48 — Tip chips */}
            {!cashPending && (
              <div className="bg-card border border-border rounded-[var(--r)] p-4 mt-3 shadow-card">
                <div className="text-[11px] font-bold text-muted uppercase tracking-[0.5px] mb-2">
                  Leave a tip? (optional)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TIP_CHOICES.map((t) => {
                    const on = effectiveTip === t && !Number(customTip)
                    return (
                      <button key={t} type="button"
                        onClick={() => { setTip(t); setCustomTip('') }}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border
                                    ${on
                                      ? 'border-accent bg-accent/10 text-accent'
                                      : 'border-border bg-card text-muted hover:border-muted'}`}>
                        {t === 0 ? 'No tip' : `+ ₹${t}`}
                      </button>
                    )
                  })}
                  <input type="number" inputMode="numeric" min={0} max={10000}
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value)}
                    placeholder="Custom"
                    className="px-3 py-1.5 rounded-full border border-border bg-card
                               text-[12px] text-text outline-none focus:border-accent
                               w-[100px]" />
                </div>
              </div>
            )}

            {/* H49 — Failure recovery */}
            {error && (
              <div className="mt-3 rounded-[var(--rs)] border border-[#fecaca] bg-[#fef2f2]
                              px-3 py-3 text-[12px] text-[#991b1b]">
                <div className="font-bold mb-1">Payment couldn't be confirmed</div>
                <div className="mb-2">{error}</div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={payOnline} disabled={busy}
                    className="px-3 py-1.5 rounded-full bg-card border border-border
                               text-text text-[11.5px] font-semibold hover:border-accent transition">
                    🔁 Try again
                  </button>
                  <button type="button" onClick={payOnline} disabled={busy}
                    className="px-3 py-1.5 rounded-full bg-card border border-border
                               text-text text-[11.5px] font-semibold hover:border-accent transition">
                    💳 Try a different method
                  </button>
                  <button type="button" onClick={payCash} disabled={busy}
                    className="px-3 py-1.5 rounded-full bg-card border border-border
                               text-text text-[11.5px] font-semibold hover:border-accent transition">
                    💵 Pay in cash (partner confirms)
                  </button>
                </div>
              </div>
            )}

            {/* M50 — Cash pending state */}
            {cashPending && (
              <div className="mt-3 rounded-[var(--rs)] border border-[#fcd34d] bg-[#fffbeb]
                              px-3 py-3 text-[12px] text-[#92400e]">
                <div className="font-bold mb-1">Waiting for partner to confirm cash</div>
                <div>Hand over ₹{totalToPay} in cash. Your partner will confirm receipt on their app.</div>
                <button type="button" onClick={() => { setCashPending(false); setBusy(false) }}
                  className="mt-2 px-3 py-1.5 rounded-full bg-card border border-border
                             text-text text-[11.5px] font-semibold hover:border-accent transition">
                  Cancel cash payment
                </button>
              </div>
            )}

            {/* Pay CTAs */}
            {!cashPending && (
              <div className="flex flex-col gap-2 mt-4">
                <button onClick={payOnline} disabled={busy}
                  className="w-full py-3.5 rounded-[var(--rs)] bg-accent text-white
                             font-display font-bold text-[14px]
                             shadow-[0_4px_16px_rgba(232,65,26,0.35)]
                             hover:brightness-90 transition disabled:opacity-60
                             flex items-center justify-center gap-2">
                  {busy
                    ? <><Loader size={14} /> <span>Opening checkout…</span></>
                    : <>🔒 Pay {formatPrice(totalToPay)} online</>}
                </button>
                <button onClick={payCash} disabled={busy}
                  className="w-full py-3 rounded-[var(--rs)] border-[1.5px] border-border
                             bg-card text-text font-bold text-[13px]
                             hover:border-accent transition disabled:opacity-60">
                  💵 Pay cash (₹{totalToPay})
                </button>
                <div className="text-[10px] text-muted text-center">
                  Your payment details never touch our servers.
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="bg-card border border-border rounded-[var(--r)] p-4 shadow-card">
              <div className="text-[11px] font-bold text-muted uppercase tracking-[0.5px] mb-3">
                Partner
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center
                                 font-bold text-[14px] shrink-0 ${partnerAv}`}>
                  {partnerIni}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-text truncate">{partnerName}</div>
                  <div className="text-[11px] text-muted mt-0.5 truncate">
                    🔨 {partnerRole}
                    {partnerRating > 0 && <> · <span className="text-[#f59e0b]">★</span> {partnerRating.toFixed(1)}</>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border text-center">
                <MiniStat label="Rating" value={partnerRating ? partnerRating.toFixed(1) : '—'} />
                <MiniStat label="Jobs"   value={partnerJobs || '—'} />
                <MiniStat label="ID"     value={partnerVerified ? '✓' : '—'} />
              </div>
              {(job.partner_phone || partnerDetail?.phone) && (
                <a href={`tel:${job.partner_phone || partnerDetail?.phone}`}
                  className="mt-3 flex items-center justify-center gap-2 w-full py-2.5
                             rounded-[var(--rs)] border-[1.5px] border-border text-[12px]
                             font-semibold text-text hover:border-accent hover:text-accent transition">
                  📞 Call {partnerName.split(' ')[0]}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row ({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 md:px-5 py-3">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[13px] text-text">{value}</span>
    </div>
  )
}

function MiniStat ({ label, value }) {
  return (
    <div>
      <div className="font-display font-extrabold text-[14px] text-text leading-none">
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.5px] text-muted mt-1">{label}</div>
    </div>
  )
}
