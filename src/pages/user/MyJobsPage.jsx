// Customer's "My Work" dashboard.
//
// Active card mirrors PartnerWorkPage: a compact 2-column layout with the
// vertical stepper on the left and a live status panel on the right. All
// transitions flow through sockets — when the partner bumps state, the
// customer sees it without a refresh; when the customer cancels or pays,
// the partner gets the overlay on their side via the same channel.
//
// Actions on the user side:
//   - Chat / Call (icon buttons in the header, same language as partner)
//   - Confirm Price (when state=accepted and a new price was proposed)
//   - Cancel Job (any non-terminal state → opens CancelReasonModal)
//   - Accept Payment / Pay Now (when state=completed → /pay/:id)
//   - Go to Dashboard (terminal overlays only: paid, cancelled)
//
// Past Jobs: first 10 here; "See More →" deep-links to /my-jobs/all which is
// the paginated, API-driven full history.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import * as api from '@/services/api'
import { formatPrice, formatDistance } from '@/utils/format'
import Loader from '@/components/Loader'
import EmptyState from '@/components/EmptyState'
import ListError from '@/components/ListError'
import { RowSkeleton } from '@/components/Skeleton'
import CancelReasonModal from '@/components/CancelReasonModal'
import ConfirmModal from '@/components/profile/ConfirmModal'
import LivePartnerMap from '@/components/LivePartnerMap'
import ExtraWorkSummary from '@/components/ExtraWorkSummary'
import { pushToast } from '@/features/app/appSlice'
import {
  fetchActiveJobThunk, setStateThunk, cancelJobThunk,
  selectActiveJob, clearActive,
} from '@/features/jobs/jobsSlice'
import { getSocket } from '@/services/socket'

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'P'

const shortId = (id) => (!id ? '#—' : String(id).startsWith('#') ? id : `#${id}`)

const PREVIEW_LIMIT = 10

const fmtSince = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `Since ${time} today` : `Since ${time} · ${d.toLocaleDateString(undefined, { day:'2-digit', month:'short' })}`
}

const fmtHistoryDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' })
}

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// Happy-path sequence. Cancelled lives outside — we render it as a terminal
// 7th row on the stepper so the UI communicates "this path also exists".
const STEPS = ['accepted','priceConfirmed','travelling','arrived','working','completed']
const stepIndex = (state) => state === 'cancelled' ? 6 : STEPS.indexOf(state)

// Right-panel copy per current state — friendly, customer-facing.
const NEXT_STEP_INFO = {
  accepted: {
    step: 1, icon: '💬', title: 'Confirm the price',
    desc:  'Your partner proposed a price. Discuss via chat or phone — tap Confirm Price once you agree.',
    badgeBg: '#fef3c7', badgeFg: '#92400e',
  },
  priceConfirmed: {
    step: 2, icon: '🚗', title: 'Partner is getting ready',
    desc:  'Price confirmed. Your partner will start travelling to you shortly.',
    badgeBg: '#dbeafe', badgeFg: '#1e40af',
  },
  travelling: {
    step: 3, icon: '🗺️', title: 'Partner on the way',
    desc:  "Your partner is en route. We'll notify you when they arrive.",
    badgeBg: '#dbeafe', badgeFg: '#1e40af',
  },
  arrived: {
    step: 4, icon: '📍', title: 'Partner has arrived',
    desc:  'Your partner is at your location. They will start the work shortly.',
    badgeBg: '#ede9fe', badgeFg: '#6d28d9',
  },
  working: {
    step: 5, icon: '🔨', title: 'Work in progress',
    desc:  'Your partner is working on the job. Sit tight — this will update when complete.',
    badgeBg: '#dbeafe', badgeFg: '#1e40af',
  },
  completed: {
    step: 6, icon: '✅', title: 'Work completed',
    desc:  'Your partner marked the job complete. Review and accept the payment to finish.',
    badgeBg: '#dcfce7', badgeFg: '#166534',
  },
  cancelled: {
    step: 7, icon: '✖', title: 'Job cancelled',
    desc:  'This job was cancelled. You can head back to the home page.',
    badgeBg: '#fee2e2', badgeFg: '#b91c1c',
  },
}

export default function MyJobsPage () {
  const nav       = useNavigate()
  const dispatch  = useDispatch()
  const active    = useSelector(selectActiveJob)
  const [jobs, setJobs]     = useState([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // H85 — surfaces a Retry block when the initial fetch errored.
  const [loadError, setLoadError] = useState(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [confirmPriceOpen, setConfirmPriceOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const sentinelRef = useRef(null)

  // Initial fetch: first 10 past jobs + the active job (via Redux so socket
  // patches flow into this view automatically).
  const loadInitial = () => {
    setLoading(true); setLoadError(null)
    let cancelled = false
    Promise.all([
      api.fetchMyJobs('user', { status: 'history', limit: PREVIEW_LIMIT, offset: 0 }),
      dispatch(fetchActiveJobThunk('user')).unwrap().catch(() => null),
    ]).then(([h]) => {
      if (cancelled) return
      setJobs(h.jobs || [])
      setTotal(Number(h.total || (h.jobs || []).length))
    }).catch((err) => {
      if (!cancelled) setLoadError(err?.response?.data?.message || 'Could not load your jobs')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }
  useEffect(() => loadInitial(), [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Join the job room — this is what delivers job:state-changed / job:cancelled
  // / payment:succeeded live. The socket middleware is mounted once at the app
  // shell; we only need the room join here.
  const jobId = active?.id
  useEffect(() => {
    if (!jobId) return
    let sock; let cancelled = false
    getSocket({ role: 'user' }).then((s) => {
      if (cancelled) return
      sock = s; s.emit('join-job', jobId)
    }).catch(() => {})
    return () => { cancelled = true; sock?.emit?.('leave-job', jobId) }
  }, [jobId])

  // When a job flips paid/cancelled we want the past-jobs list to eventually
  // include it — reload on terminal transitions so "See More" etc. stay fresh.
  const terminalState = active?.state === 'paid' || active?.state === 'cancelled'
  useEffect(() => {
    if (!terminalState) return
    api.fetchMyJobs('user', { status: 'history', limit: PREVIEW_LIMIT, offset: 0 })
      .then((r) => {
        setJobs(r.jobs || [])
        setTotal(Number(r.total || (r.jobs || []).length))
      })
      .catch(() => {})
  }, [terminalState])

  const hasMore = total > jobs.length

  // Infinite scroll for the Past Jobs strip.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      if (!hasMore || loading || loadingMore) return
      setLoadingMore(true)
      api.fetchMyJobs('user', {
        status: 'history',
        limit: PREVIEW_LIMIT,
        offset: jobs.length,
      })
        .then((r) => {
          const incoming = r.jobs || []
          setJobs((prev) => {
            const seen = new Set(prev.map((j) => j.id))
            return [...prev, ...incoming.filter((j) => !seen.has(j.id))]
          })
          setTotal(Number(r.total || 0))
        })
        .catch(() => {})
        .finally(() => setLoadingMore(false))
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loading, loadingMore, jobs.length])

  // ── Active-job actions ──
  const onChat = () => active && nav(`/chat/${active.id}`)
  const onPay  = () => active && nav(`/pay/${active.id}`)
  const onDetail = () => active && nav(`/my-jobs/${active.id}`)
  const onConfirmPrice = () => { if (active) setConfirmPriceOpen(true) }
  const doConfirmPrice = async () => {
    if (!active) return
    setBusy(true)
    try {
      await dispatch(setStateThunk({ id: active.id, to: 'priceConfirmed' })).unwrap()
      setConfirmPriceOpen(false)
    } catch (e) { dispatch(pushToast({ text: e?.message || 'Failed to confirm price', type: 'error' })) }
    finally { setBusy(false) }
  }
  const onCancel = () => setCancelOpen(true)
  const onCancelConfirm = async ({ reason, note, confirm_fee }) => {
    if (!active) return
    setBusy(true)
    try {
      await dispatch(cancelJobThunk({ id: active.id, reason, note, confirm_fee })).unwrap()
      setCancelOpen(false)
    } catch (e) {
      // H27 — if the server bounces for fee confirmation (e.g. the user's
      // countdown crossed 90s while the modal was open), surface the prompt
      // so they can tick the acknowledge box.
      if (e?.code === 'fee_confirmation_required') {
        dispatch(pushToast({
          type: 'warn',
          text: `Free-cancel window just ended — please confirm the ₹${e.fee_inr} fee.`,
        }))
      } else {
        dispatch(pushToast({ text: e?.message || 'Failed to cancel', type: 'error' }))
      }
    }
    finally { setBusy(false) }
  }
  const onGoDashboard = () => {
    dispatch(clearActive())
    nav('/')
  }

  // Pre-limit the "past" list to 10 — the strip below the active card is a
  // preview, not the full history. Everything else hangs off "See More →".
  const pastPreview = useMemo(() => jobs.slice(0, PREVIEW_LIMIT), [jobs])

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 md:py-5">
        {/* ── ACTIVE / ONGOING ───────────────────────────────────── */}
        <div className="text-[11px] font-bold text-muted uppercase tracking-[0.5px] mb-2">
          Active / Ongoing
        </div>

        {loading && !active && !jobs.length ? (
          // M86 — skeleton instead of a centre spinner so the layout feels
          // like content is shaping up.
          <RowSkeleton count={2} />
        ) : !loading && loadError && !active ? (
          // H85 — initial fetch failed; offer a one-tap retry.
          <ListError onRetry={loadInitial} message={loadError} />
        ) : active ? (
          // Page-level 2-col grid (mirrors PartnerWorkPage).
          //   LEFT  ≈ 1.6fr — the active job card with stepper + step panel
          //   RIGHT ≈ 1fr   — partner mini-card + live map (when in motion) +
          //                   trip details strip
          // On <lg screens it stacks to a single column.
          <div className="grid gap-3 lg:gap-4 lg:grid-cols-[1.6fr_1fr] items-start mb-4">
            <div>
              <ActiveJobCard
                job={active}
                busy={busy}
                onChat={onChat}
                onPay={onPay}
                onDetail={onDetail}
                onCancel={onCancel}
                onConfirmPrice={onConfirmPrice}
                onGoDashboard={onGoDashboard} />
              {/* M44 — Show running extra-work proposals here so the
                  customer doesn't have to dig into the job detail page. */}
              {['priceConfirmed','travelling','arrived','working','completed'].includes(active.state) && (
                <div className="mt-3 bg-card border border-border rounded-[var(--r)] shadow-card p-3">
                  <ExtraWorkSummary jobId={active.id} role="customer" />
                </div>
              )}
            </div>
            <TripSidePanel job={active} onChat={onChat} />
          </div>
        ) : (
          <EmptyActive />
        )}

        {/* ── PAST JOBS ──────────────────────────────────────────── */}
        <div className="flex items-center mt-6 mb-2">
          <div className="text-[11px] font-bold text-muted uppercase tracking-[0.5px]">
            Past Jobs
          </div>
          {total > PREVIEW_LIMIT && (
            <button onClick={() => nav('/my-jobs/all')}
              className="ml-auto text-[12px] font-bold text-accent px-2.5 py-1 rounded-lg
                         hover:bg-accent/10 transition">
              View All ({total}) →
            </button>
          )}
          {total > 0 && total <= PREVIEW_LIMIT && (
            <span className="ml-auto text-[11px] text-muted">{total} total</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {pastPreview.map((j) => <PastJob key={j.id} j={j} nav={nav} />)}

          {!loading && jobs.length === 0 && !loadError && (
            // H84 — actionable empty state: send the customer to start a job.
            <EmptyState
              icon="📋"
              title="No past jobs yet"
              copy="Once you complete a service, it'll show up here."
              ctaLabel="Find a partner"
              onCta={() => nav('/categories')}
            />
          )}

          {/* Only show the infinite-scroll sentinel if the full history is NOT
              off-loaded to /my-jobs/all. In the preview section we want a
              hard cap at 10 so the page stays compact. */}
          {total <= PREVIEW_LIMIT && hasMore && (
            <div ref={sentinelRef} className="py-3 flex justify-center">
              {loadingMore
                ? <Loader size={16}/>
                : <span className="text-[11px] text-muted">Scroll for more…</span>}
            </div>
          )}
        </div>
      </div>

      <CancelReasonModal
        open={cancelOpen}
        role="user"
        busy={busy}
        acceptedAt={active?.accepted_at}
        onClose={() => !busy && setCancelOpen(false)}
        onConfirm={onCancelConfirm} />

      <ConfirmModal
        open={confirmPriceOpen}
        icon="✓"
        title="Confirm this price?"
        body={active
          ? `You're about to lock in ${formatPrice(active.agreed_price)} for ${active.service || 'this job'}. The partner will start travelling once you confirm.`
          : ''}
        cancelLabel="Not yet"
        confirmLabel={busy ? 'Confirming…' : 'Yes, confirm price'}
        onCancel={() => !busy && setConfirmPriceOpen(false)}
        onConfirm={doConfirmPrice} />
    </div>
  )
}

// ── Active job card (dense, no-waste 2-column) ─────────────────────
// H27 — Free-cancel countdown chip. Renders inside the active-job card when
// the customer is still within the 90s grace period after acceptance.
function FreeCancelChip ({ acceptedAt }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 500)
    return () => clearInterval(id)
  }, [])
  if (!acceptedAt) return null
  const elapsed = Math.floor((Date.now() - new Date(acceptedAt).getTime()) / 1000)
  const left = 90 - elapsed
  if (left <= 0) return null
  return (
    <div className="mx-4 mt-3 mb-1 rounded-[var(--rs)] bg-[#dcfce7] dark:bg-[#064e3b]/60
                    border border-[#a7f3d0] dark:border-[#065f46]
                    px-3 py-1.5 flex items-center gap-2 text-[11.5px] font-semibold
                    text-[#065f46] dark:text-[#86efac]" role="status" aria-live="polite">
      <span>⏱ Free cancel for {left}s</span>
      <span className="text-[10px] text-[#065f46]/80 dark:text-[#86efac]/80">
        — change your mind? Tap ✕ above, no fee.
      </span>
    </div>
  )
}

function ActiveJobCard ({
  job, busy, onChat, onPay, onDetail, onCancel, onConfirmPrice, onGoDashboard,
}) {
  const name  = job.partner_name || 'Partner'
  const av    = job.partner_av_class || hashToAv(job.partner_id || name)
  const ini   = job.partner_initials || initialsOf(name)
  const svc   = job.service || job.category_name || '—'
  const icon  = job.service_icon || '🔨'
  const price = Number(job.agreed_price || job.base_price || 0)
  const basePrice = Number(job.base_price || 0)
  const savings = Math.max(0, basePrice - price)
  const phone = job.partner_phone || ''

  const stepIdx = stepIndex(job.state)
  const info = NEXT_STEP_INFO[job.state] || NEXT_STEP_INFO.accepted
  const isCancelled = job.state === 'cancelled'
  const isPaid      = job.state === 'paid'
  const isCompleted = job.state === 'completed'
  const isAccepted  = job.state === 'accepted'
  const canCancel   = !isPaid && !isCancelled && job.state !== 'completed'

  return (
    <div className="relative bg-card rounded-[var(--r)] border-[1.5px] border-accent
                    shadow-[0_2px_10px_rgba(232,65,26,0.08)] overflow-hidden">
      {/* ── Single-row header: avatar + name/service + price + actions ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center
                         font-bold text-[13px] shrink-0 ${av}`}>{ini}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-text truncate">{name}</span>
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-xl text-[11px] font-bold"
                  style={{ background: info.badgeBg, color: info.badgeFg }}>
              <span className={`w-1.5 h-1.5 rounded-full ${isCancelled ? 'bg-[#b91c1c]' : 'bg-current'} animate-pulse`} />
              {info.title}
            </span>
          </div>
          <div className="text-[12px] text-muted truncate mt-0.5">
            {icon} {svc} · {shortId(job.id)} · {fmtSince(job.accepted_at || job.created_at)}
          </div>
        </div>

        {/* Price block + save */}
        <div className="text-right shrink-0 leading-tight pr-1 hidden sm:block">
          <div className="font-display font-extrabold text-[17px] text-text">{formatPrice(price)}</div>
          {savings > 0 && (
            <div className="text-[11px] font-bold text-success">save {formatPrice(savings)}</div>
          )}
        </div>

        {/* Compact icon CTAs */}
        <div className="flex items-center gap-1.5 shrink-0">
          {phone && (
            <a href={`tel:${phone}`}
              className="w-9 h-9 rounded-full bg-[#2563eb] text-white grid place-items-center
                         text-[14px] hover:brightness-90 transition"
              aria-label={`Call ${name}`}>📞</a>
          )}
          <button onClick={onChat}
            className="w-9 h-9 rounded-full bg-success text-white grid place-items-center
                       text-[14px] hover:brightness-90 transition"
            aria-label={`Chat with ${name}`}>💬</button>
          {canCancel && (
            <button onClick={onCancel}
              className="w-9 h-9 rounded-full bg-[#fee2e2] text-[#b91c1c] grid place-items-center
                         text-[14px] hover:bg-[#fecaca] transition"
              aria-label="Cancel job" title="Cancel job">✕</button>
          )}
        </div>
      </div>

      {/* On narrow screens show the price as a slim row instead of the right block */}
      <div className="flex sm:hidden items-baseline gap-2 px-4 pt-2 text-[13px]">
        <span className="text-muted">Agreed</span>
        <span className="font-display font-extrabold text-[16px] text-text">{formatPrice(price)}</span>
        {savings > 0 && (
          <span className="text-[11px] font-bold text-success">save {formatPrice(savings)}</span>
        )}
      </div>

      {/* H27 — visible 90s free-cancel countdown */}
      {canCancel && isAccepted && <FreeCancelChip acceptedAt={job.accepted_at} />}

      {/* Inner 2-column: vertical stepper on the left + live status/action
          panel on the right. The live tracking map used to live here as an
          optional 3rd column — it now sits in its own page-level right
          column (TripSidePanel) so the active card stays a focused unit. */}
      <div className="grid gap-0 md:grid-cols-[minmax(200px,240px)_1fr]">
        <CompactStepper job={job} stepIdx={stepIdx}
          className="px-4 py-4 md:border-r md:border-border" />

        <div className={`px-4 py-4 md:border-l-0 border-t md:border-t-0 border-border
                         ${isCancelled ? 'bg-[#fef2f2]' : ''}`}>
          {/* Step header line — single row, no big icon block */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[20px] leading-none">{info.icon}</span>
            <span className={`font-display font-extrabold text-[16px] leading-none
                             ${isCancelled ? 'text-[#b91c1c]' : 'text-text'}`}>
              {info.title}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-[2px] rounded-xl
                             text-[11px] font-bold"
                  style={{ background: info.badgeBg, color: info.badgeFg }}>
              <span className="font-extrabold">{info.step}</span>
              <span className="opacity-70">/7</span>
            </span>
          </div>

          <div className="text-[12.5px] text-muted leading-[1.55] mb-3">{info.desc}</div>

          {/* Negotiation prompt — same banner style the partner sees so
              both sides have a matching call-to-action surface during the
              discuss-then-confirm step. */}
          {isAccepted && (
            <PriceConfirmBanner
              message={`Call or chat with ${name} to confirm the price. The next step unlocks once you agree.`}
              phone={phone} onChat={onChat} />
          )}

          {isCancelled && (job.cancel_reason || job.cancel_note) && (
            <div className="mb-3 px-3 py-2 rounded-[var(--rs)] border border-[#fecaca] bg-white
                            text-[12px] text-[#7f1d1d] leading-[1.55]">
              {job.cancel_reason && (
                <div><span className="font-bold">Reason:</span> {job.cancel_reason}</div>
              )}
              {job.cancel_note && (
                <div className="mt-0.5"><span className="font-bold">Note:</span> {job.cancel_note}</div>
              )}
              {job.cancelled_by && (
                <div className="mt-0.5 text-[11px] opacity-70">
                  Cancelled by {job.cancelled_by === 'user' ? 'you' : 'the partner'}
                </div>
              )}
            </div>
          )}

          {/* Action row — primary + secondary buttons inline, no full-width waste */}
          <div className="flex flex-wrap items-center gap-2">
            {isAccepted && (
              <button onClick={onConfirmPrice} disabled={busy}
                className="px-4 py-2 rounded-[var(--rs)] bg-accent text-white
                           font-bold text-[13px] shadow-[0_2px_8px_rgba(232,65,26,0.30)]
                           hover:brightness-90 transition disabled:opacity-60">
                ✓ Confirm Price · {formatPrice(price)}
              </button>
            )}
            {isCompleted && (
              <button onClick={onPay}
                className="px-4 py-2 rounded-[var(--rs)] bg-success text-white
                           font-bold text-[13px] shadow-[0_2px_8px_rgba(16,185,129,0.30)]
                           hover:brightness-90 transition">
                💳 Pay {formatPrice(price)}
              </button>
            )}
            {(isCancelled || isPaid) && (
              <button onClick={onGoDashboard}
                className="px-4 py-2 rounded-[var(--rs)] bg-accent text-white
                           font-bold text-[13px] shadow-[0_2px_8px_rgba(232,65,26,0.30)]
                           hover:brightness-90 transition">
                🏠 Dashboard
              </button>
            )}
            <button onClick={onDetail}
              className="px-3 py-2 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                         text-text text-[12.5px] font-semibold
                         hover:border-accent hover:text-accent transition">
              Details →
            </button>
          </div>

          {/* Footer KV strip */}
          <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap gap-x-5 gap-y-1
                          text-[12px] text-muted">
            <KvInline label="Service" value={svc} />
            {job.distance_km != null && (
              <KvInline label="Distance" value={formatDistance(job.distance_km)} />
            )}
            <KvInline label="Accepted" value={fmtTime(job.accepted_at)} />
          </div>
        </div>
      </div>

      {isPaid && (
        <PaymentSuccessOverlay amount={price} onGoDashboard={onGoDashboard} />
      )}
    </div>
  )
}

// Right-hand side panel that pairs with ActiveJobCard in the page-level grid.
//   - During motion states (travelling/arrived) the LivePartnerMap is the
//     visual focus, so the partner mini-card collapses to a slim header.
//   - Outside motion states the map self-hides and the panel becomes a quiet
//     "trip details" card with partner info + a chat shortcut.
function TripSidePanel ({ job, onChat }) {
  const showMap = job.state === 'travelling' || job.state === 'arrived'
  const name  = job.partner_name || 'Partner'
  const av    = job.partner_av_class || hashToAv(job.partner_id || name)
  const ini   = job.partner_initials || initialsOf(name)
  const phone = job.partner_phone || ''
  const rating = Number(job.partner_rating || 0)

  return (
    <div className="bg-card rounded-[var(--r)] border border-border overflow-hidden
                    shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
      {/* Slim partner header — always visible so the customer always knows
          who they hired, even when the map is hidden. */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className={`w-10 h-10 rounded-full grid place-items-center
                         font-bold text-[12px] shrink-0 ${av}`}>{ini}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-text truncate">{name}</div>
          <div className="text-[11.5px] text-muted truncate">
            {rating > 0 ? `★ ${rating.toFixed(1)} · ` : ''}
            {job.service || job.category_name || 'Partner'}
          </div>
        </div>
        {phone && (
          <a href={`tel:${phone}`}
            className="w-9 h-9 rounded-full bg-[#2563eb] text-white grid place-items-center
                       text-[14px] hover:brightness-90 transition"
            aria-label={`Call ${name}`}>📞</a>
        )}
        <button onClick={onChat}
          className="w-9 h-9 rounded-full bg-success text-white grid place-items-center
                     text-[14px] hover:brightness-90 transition"
          aria-label={`Chat with ${name}`}>💬</button>
      </div>

      {showMap ? (
        <div className="bg-surface">
          <LivePartnerMap job={job} />
        </div>
      ) : (
        <div className="px-4 py-4 text-[12.5px] text-muted leading-[1.6]">
          <div className="font-bold text-text text-[13px] mb-1.5">Trip details</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            <SideKv label="Service" value={job.service || job.category_name || '—'} />
            {job.distance_km != null && (
              <SideKv label="Distance" value={formatDistance(job.distance_km)} />
            )}
            <SideKv label="Accepted" value={fmtTime(job.accepted_at)} />
            {job.agreed_price != null && (
              <SideKv label="Agreed" value={formatPrice(job.agreed_price)} />
            )}
          </div>
          <div className="mt-4 text-[11.5px] text-muted/80 leading-[1.55]">
            Live tracking will appear here once {name.split(' ')[0]} starts travelling to you.
          </div>
        </div>
      )}
    </div>
  )
}

function SideKv ({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] uppercase tracking-[0.4px] text-muted/80 font-bold">{label}</div>
      <div className="text-[12.5px] text-text font-semibold truncate">{value}</div>
    </div>
  )
}

function KvInline ({ label, value }) {
  return (
    <span className="inline-flex gap-1.5">
      <span>{label}:</span>
      <span className="text-text font-semibold truncate max-w-[160px]">{value}</span>
    </span>
  )
}

// Customer-side mirror of the partner's price-confirm banner. Same visual
// treatment so the two parties recognise the prompt as paired sides of the
// same negotiation step.
function PriceConfirmBanner ({ message, phone, onChat }) {
  return (
    <div className="mb-3 rounded-[var(--rs)] overflow-hidden border border-[#c7d2fe]
                    bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)]">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-lg grid place-items-center text-[16px] shrink-0
                        bg-[#4338ca] text-white shadow-[0_3px_10px_rgba(67,56,202,0.35)]">
          💬
        </div>
        <div className="flex-1 min-w-0 text-[12px] text-[#1e1b4b] leading-[1.55]">
          <div className="font-bold text-[12.5px] mb-0.5">Confirm the price</div>
          <div className="text-[#4c4974]">{message}</div>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        {phone && (
          <a href={`tel:${phone}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-[var(--rs)]
                       bg-[#1e40af] text-white text-[12px] font-bold
                       shadow-[0_3px_12px_rgba(30,64,175,0.35)]
                       hover:brightness-[1.05] transition">
            📞 Call
          </a>
        )}
        <button onClick={onChat}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-[var(--rs)]
                     bg-[#4338ca] text-white text-[12px] font-bold
                     shadow-[0_3px_12px_rgba(67,56,202,0.35)]
                     hover:brightness-[1.05] transition">
          💬 Chat
        </button>
      </div>
    </div>
  )
}

function CompactStepper ({ job, stepIdx, className = '' }) {
  const isCancelled = job.state === 'cancelled'
  const rows = [
    { title: 'Request Accepted',  at: job.accepted_at },
    { title: 'Price Confirmed' },
    { title: 'Travelling' },
    { title: 'Arrived' },
    { title: 'Work in Progress',  at: job.started_at },
    { title: 'Completed',         at: job.completed_at },
    { title: 'Cancelled',         variant: 'cancel' },
  ]

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      {rows.map((r, i) => {
        const isLast = i === rows.length - 1
        const cancelRow = r.variant === 'cancel'

        let done   = !cancelRow && !isCancelled && i < stepIdx
        let active = !cancelRow && !isCancelled && i === stepIdx

        if (cancelRow) {
          active = isCancelled
          done = false
        }
        if (!cancelRow && isCancelled) {
          done = i <= (stepIdx - 1)
          active = false
        }

        const dotCls = cancelRow
          ? active
            ? 'bg-[#ef4444] border-[#ef4444] text-white animate-pulse'
            : 'bg-card border-dashed border-[#fecaca] text-[#ef4444] opacity-60'
          : done
            ? 'bg-success border-success text-white'
            : active
              ? 'bg-accent border-accent text-white animate-pulse'
              : 'bg-card border-border text-muted'

        const dotGlyph = cancelRow ? '✖' : (done ? '✓' : active ? '➤' : i + 1)

        const titleCls = cancelRow
          ? active ? 'text-[#b91c1c]' : 'text-muted opacity-70'
          : (done || active) ? 'text-text' : 'text-muted'

        return (
          <div key={r.title} className={`flex gap-2.5 ${isLast ? '' : 'pb-2.5'}`}>
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold
                               border-[2px] ${dotCls}`}>
                {dotGlyph}
              </div>
              {!isLast && (
                <div className={`w-[2px] flex-1 min-h-[14px]
                                 ${done ? 'bg-success' : cancelRow ? 'bg-transparent' : 'bg-border'}`} />
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <div className={`text-[12px] font-bold leading-tight truncate ${titleCls}`}>
                {r.title}
              </div>
              {!cancelRow && done && r.at && (
                <div className="text-[10px] font-semibold text-success shrink-0">{fmtTime(r.at)}</div>
              )}
              {!cancelRow && active && (
                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-[2px] rounded-xl
                                 text-[10px] font-bold bg-[#dbeafe] text-[#1e40af]">
                  <span className="w-1 h-1 rounded-full bg-[#1e40af] animate-pulse" />
                  Now
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Fullscreen green success surface for the customer — mirrors the partner's
// PaymentReceivedOverlay. State-driven so a refresh keeps it up.
function PaymentSuccessOverlay ({ amount, onGoDashboard }) {
  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-5
                    bg-[rgba(6,27,21,0.82)] backdrop-blur-[6px] animate-fadeIn">
      <div className="relative bg-card rounded-[22px] px-7 py-8 w-full max-w-[400px]
                      text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] animate-popIn
                      overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0"
             style={{ background:
               'radial-gradient(circle at 50% -10%, rgba(16,185,129,0.22), transparent 55%)' }}/>
        <div className="relative mx-auto w-[96px] h-[96px] mb-4">
          <div className="absolute inset-0 rounded-full bg-success/25 animate-successRing" />
          <div className="absolute inset-0 rounded-full bg-success/20 animate-successRingB" />
          <div className="relative w-[96px] h-[96px] rounded-full bg-success
                          grid place-items-center shadow-[0_12px_32px_rgba(16,185,129,0.45)]
                          animate-successBurst">
            <svg width="48" height="48" viewBox="0 0 52 52" fill="none" aria-hidden>
              <path d="M14 27 l8 8 l16 -18" stroke="white" strokeWidth="4.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="animate-checkDraw" />
            </svg>
          </div>
        </div>
        <div className="relative">
          <div className="font-display font-extrabold text-[22px] text-text mb-1">
            Payment Successful!
          </div>
          <div className="text-[13px] text-muted mb-3">
            Your payment has been received. Thanks for using ServiceLink!
          </div>
          <div className="font-display font-extrabold text-[28px] text-success mb-5">
            {formatPrice(amount)}
          </div>
          <button onClick={onGoDashboard}
            className="w-full py-3 rounded-[var(--rs)] bg-accent text-white
                       font-bold text-[13px] shadow-[0_6px_18px_rgba(232,65,26,0.35)]
                       hover:brightness-[1.05] transition">
            🏠 Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyActive () {
  const nav = useNavigate()
  return (
    <div className="bg-card border border-dashed border-border rounded-[var(--r)] mb-4">
      <EmptyState
        icon="🧰"
        title="No active job"
        copy="When you request a service, it'll show up here with live status."
        ctaLabel="Browse categories"
        onCta={() => nav('/categories')}
      />
    </div>
  )
}

function PastJob ({ j, nav }) {
  const icon = j.service_icon || '🧰'
  const name = j.partner_name || '—'
  const price = Number(j.agreed_price || j.base_price || 0)
  const isPaid = j.state === 'paid'
  const isCancel = j.state === 'cancelled'
  const badge = isPaid ? { bg: '#dcfce7', fg: '#166534', label: 'Paid' }
                       : isCancel ? { bg: '#fee2e2', fg: '#b91c1c', label: 'Cancelled' }
                                  : { bg: '#e5e7eb', fg: '#374151', label: j.state }

  return (
    <button onClick={() => nav(`/my-jobs/${j.id}`)}
      className="bg-card border border-border rounded-[var(--r)] p-3 flex items-center gap-3
                 hover:border-accent transition text-left">
      <div className="w-10 h-10 rounded-lg bg-surface grid place-items-center text-[18px] shrink-0">
        {isPaid ? '✅' : isCancel ? '⚠️' : icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-text truncate">
          {j.service || j.category_name} — {name}
        </div>
        <div className="text-[11px] text-muted truncate">
          {fmtHistoryDate(j.completed_at || j.created_at)} · {formatPrice(price)} {isPaid ? 'paid' : ''}
        </div>
      </div>
      <span className="inline-flex items-center px-2 py-[3px] rounded-xl text-[10px] font-bold"
            style={{ background: badge.bg, color: badge.fg }}>
        {badge.label}
      </span>
      <span className="text-muted ml-1">›</span>
    </button>
  )
}
