// Partner-rates-customer card. Drops onto any post-paid partner view
// (currently PartnerTransactionDetailPage). One rating per job — if the
// server already has a customer_ratings row for this job, we render the
// saved rating in read-only mode instead of the form.
//
// Server contract:
//   GET  /api/reviews/customer/:job_id  → { rating } | { rating: null }
//   POST /api/reviews/customer          → 201 with { rating }, 409 if dup
//
// We don't push the rating into the customer's rating aggregate yet —
// that's a separate trust-payout fairness gate (future PR). For now the
// row just persists.

import { useEffect, useState } from 'react'
import * as api from '@/services/api'

function StarRow ({ value, onChange, readOnly = false, size = 28 }) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <div className="flex items-center gap-1.5">
      {stars.map((n) => {
        const filled = n <= value
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange?.(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={`leading-none transition ${readOnly ? 'cursor-default' : 'hover:scale-110'}`}
            style={{ fontSize: size, color: filled ? '#f59e0b' : '#e2e8f0' }}>
            ★
          </button>
        )
      })}
    </div>
  )
}

export default function RateCustomerCard ({ jobId, customerName }) {
  const [loading, setLoading]   = useState(true)
  const [rating, setRating]     = useState(null)        // existing row from server
  const [stars, setStars]       = useState(0)
  const [comment, setComment]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]           = useState(null)

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    setLoading(true); setErr(null)
    api.fetchCustomerRating(jobId)
      .then((r) => { if (!cancelled) setRating(r?.rating || null) })
      .catch((e) => { if (!cancelled) setErr(e?.response?.data?.message || e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [jobId])

  const submit = async () => {
    if (!stars) { setErr('Pick a star rating'); return }
    setSubmitting(true); setErr(null)
    try {
      const r = await api.rateCustomer({ job_id: jobId, stars, comment: comment.trim() || null })
      setRating(r?.rating || { job_id: jobId, stars, comment, created_at: new Date().toISOString() })
    } catch (e) {
      // 409 means somebody (maybe another tab) already rated — show that row.
      const dup = e?.response?.status === 409 && e?.response?.data?.rating
      if (dup) setRating(e.response.data.rating)
      else setErr(e?.response?.data?.message || e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!jobId) return null
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-[var(--r)] shadow-card p-4">
        <div className="text-[12px] text-muted">Loading rating…</div>
      </div>
    )
  }

  // Read-only mode — already rated.
  if (rating) {
    return (
      <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
        <div className="px-[18px] py-3 border-b border-border font-display font-bold text-[13px] text-text">
          ⭐ Your rating for {customerName || 'this customer'}
        </div>
        <div className="p-[18px]">
          <div className="flex items-center gap-3 mb-2">
            <StarRow value={Number(rating.stars) || 0} readOnly size={24} />
            <span className="text-[13px] font-bold text-text">
              {Number(rating.stars).toFixed(0)}/5
            </span>
          </div>
          {rating.comment ? (
            <p className="text-[13px] text-text leading-[1.55] whitespace-pre-wrap">
              {rating.comment}
            </p>
          ) : (
            <p className="text-[12px] text-muted italic">No comment.</p>
          )}
          <p className="text-[10px] text-muted mt-2">
            Submitted · {rating.created_at ? new Date(rating.created_at).toLocaleString() : '—'}
          </p>
        </div>
      </div>
    )
  }

  // Form mode.
  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
      <div className="px-[18px] py-3 border-b border-border font-display font-bold text-[13px] text-text">
        ⭐ Rate this customer
      </div>
      <div className="p-[18px]">
        <p className="text-[12px] text-muted mb-3">
          How was {customerName || 'this customer'}? Helps us flag patterns of
          rude or unsafe behaviour. Only you and admins see this.
        </p>
        <StarRow value={stars} onChange={setStars} />
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="Optional — what stood out? (max 500 chars)"
          className="mt-3 w-full text-[13px] p-2.5 rounded-lg border border-border
                     focus:border-accent outline-none resize-none bg-surface text-text" />
        {err && (
          <div className="mt-2 text-[12px] text-rose-600">{err}</div>
        )}
        <button
          onClick={submit}
          disabled={submitting || !stars}
          className="mt-3 bg-accent text-white text-[13px] font-bold px-4 py-2 rounded-lg
                     hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed">
          {submitting ? 'Submitting…' : 'Submit rating'}
        </button>
      </div>
    </div>
  )
}
