// M61 — Partner-facing reviews feed. Lives at /partner/reviews so a partner
// has a focused space to read every review and post a single public reply
// per review (max 280 chars). The same row/reply UI used to live inline on
// the profile page; moved here so the profile stays compact and so we can
// paginate properly.
//
// Pagination: IntersectionObserver-based infinite scroll, 10 rows per page,
// dedupes by id when a realtime `review:submitted` arrives mid-scroll.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import * as api from '@/services/api'
import { selectProfile } from '@/features/profile/profileSlice'
import { pushToast } from '@/features/app/appSlice'
import { timeAgo } from '@/utils/format'
import { resolveAssetUrl } from '@/constants/api'
import { getSocket } from '@/services/socket'
import Loader from '@/components/Loader'
import { RowSkeleton } from '@/components/Skeleton'

const PAGE_SIZE = 10
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2)
  .map((p) => p[0] || '').join('').toUpperCase() || 'C'

function Stars ({ value, size = 12 }) {
  return (
    <span style={{ fontSize: size, color: '#f59e0b', letterSpacing: '1px' }}>
      {[1, 2, 3, 4, 5].map((n) => (n <= value ? '★' : <span key={n} style={{ color: '#e4e1db' }}>★</span>))}
    </span>
  )
}

function ReplyForm ({ review, onSaved }) {
  const dispatch = useDispatch()
  const [text, setText] = useState(review.partner_reply || '')
  const [busy, setBusy] = useState(false)
  const isEdit = !!review.partner_reply

  const save = async () => {
    const reply = text.trim()
    if (!reply || busy) return
    setBusy(true)
    try {
      const { review: updated } = await api.replyToReview(review.id, reply)
      dispatch(pushToast({ text: isEdit ? 'Reply updated' : 'Reply posted' }))
      onSaved?.(updated)
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not post', type: 'error' }))
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 280))}
        placeholder={isEdit ? 'Edit your reply…' : 'Write a public reply (280 chars max)…'}
        rows={2}
        className="w-full bg-card border border-border rounded-[10px]
                   px-3 py-2 text-[12px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent resize-none" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">{text.length}/280</span>
        <button onClick={save} disabled={busy || !text.trim() || text.trim() === (review.partner_reply || '')}
          className="text-[11px] font-bold px-3 py-1.5 rounded-full
                     bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed
                     hover:brightness-90 transition">
          {busy ? 'Saving…' : (isEdit ? 'Update reply' : 'Post reply')}
        </button>
      </div>
    </div>
  )
}

function ReviewRow ({ review, onPatch }) {
  const name = review.reviewer_name || 'Customer'
  const init = review.reviewer_initials || initials(name)
  // L78 — uploaded reviewer photo (snapshot at review time).
  const photo = resolveAssetUrl(review.reviewer_avatar_url)
  const [editing, setEditing] = useState(false)

  return (
    <div className="bg-card border border-border rounded-[var(--r)] p-3.5 shadow-card">
      <div className="flex gap-2.5 items-center mb-1">
        {photo ? (
          <img src={photo} alt={name}
            className="w-[32px] h-[32px] rounded-full object-cover border border-border" />
        ) : (
          <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center
                          text-[11px] font-bold bg-surface border border-border">
            {init}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text truncate">{name}</div>
          <Stars value={review.stars} size={11} />
        </div>
        <div className="text-[10px] text-muted shrink-0">
          {review.created_at ? timeAgo(review.created_at) : ''}
        </div>
      </div>
      {review.comment && (
        <div className="text-[12.5px] text-muted leading-[1.6] mt-1">{review.comment}</div>
      )}

      {/* H60 — chip tags surfaced for context */}
      {Array.isArray(review.tags) && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {review.tags.map((slug) => (
            <span key={slug}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full
                         bg-surface border border-border text-muted">
              {labelFor(slug)}
            </span>
          ))}
        </div>
      )}

      {review.partner_reply && !editing && (
        <div className="mt-2.5 ml-3 pl-3 border-l-[3px] border-l-accent text-[12px] leading-[1.6]">
          <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold text-muted mb-0.5">
            Your reply
            {review.partner_reply_at && (
              <span className="font-normal normal-case tracking-normal text-light ml-1">
                · {timeAgo(review.partner_reply_at)}
              </span>
            )}
          </div>
          <div className="text-text">{review.partner_reply}</div>
          <button onClick={() => setEditing(true)}
            className="mt-1 text-[10.5px] text-accent font-bold hover:underline">
            Edit reply
          </button>
        </div>
      )}

      {(!review.partner_reply || editing) && (
        <ReplyForm review={review} onSaved={(u) => { onPatch?.(u); setEditing(false) }} />
      )}
    </div>
  )
}

function labelFor (slug) {
  switch (slug) {
    case 'on_time':     return 'On time'
    case 'clean_work':  return 'Clean work'
    case 'fair_price':  return 'Fair price'
    case 'friendly':    return 'Friendly'
    case 'prepared':    return 'Prepared'
    case 'late':        return 'Late'
    case 'overcharged': return 'Overcharged'
    case 'untidy':      return 'Untidy'
    default:            return slug
  }
}

export default function PartnerReviewsPage () {
  const profile = useSelector(selectProfile)
  const partnerId = profile?.user_id
  const nav = useNavigate()

  const [list, setList]         = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [loadingMore, setMore]  = useState(false)
  const [error, setError]       = useState(null)
  const sentinelRef = useRef(null)
  // Used to ignore stale page responses that resolve after a remount.
  const seqRef = useRef(0)

  const hasMore = list.length < total

  const loadFirstPage = useCallback(async () => {
    if (!partnerId) return
    const mySeq = ++seqRef.current
    setLoading(true); setError(null)
    try {
      const r = await api.fetchReviewsForPartner(partnerId, { limit: PAGE_SIZE, offset: 0 })
      if (seqRef.current !== mySeq) return
      setList(Array.isArray(r?.reviews) ? r.reviews : [])
      setTotal(Number(r?.total || r?.reviews?.length || 0))
    } catch (err) {
      if (seqRef.current !== mySeq) return
      setError(err?.response?.data?.message || 'Could not load reviews')
    } finally {
      if (seqRef.current === mySeq) setLoading(false)
    }
  }, [partnerId])

  useEffect(() => { loadFirstPage() }, [loadFirstPage])

  const loadNext = useCallback(async () => {
    if (!partnerId || loading || loadingMore || !hasMore) return
    const mySeq = seqRef.current
    setMore(true)
    try {
      const r = await api.fetchReviewsForPartner(partnerId, {
        limit: PAGE_SIZE, offset: list.length,
      })
      if (seqRef.current !== mySeq) return
      const seen = new Set(list.map((x) => x.id))
      const fresh = (r?.reviews || []).filter((x) => !seen.has(x.id))
      setList((arr) => [...arr, ...fresh])
      if (typeof r?.total === 'number') setTotal(r.total)
    } catch {
      // Surface failure as a banner only — keep the existing list.
      setError('Could not load more — try again.')
    } finally {
      if (seqRef.current === mySeq) setMore(false)
    }
  }, [partnerId, loading, loadingMore, hasMore, list])

  // IntersectionObserver — fires loadNext whenever the sentinel scrolls in.
  useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver((entries) => {
      const e = entries[0]
      if (e.isIntersecting) loadNext()
    }, { rootMargin: '160px' })
    io.observe(el)
    return () => io.disconnect()
  }, [loadNext])

  // Live insert when a customer rates a new job. The server already emits
  // `review:submitted` to the partner; we just splice the new row in at the
  // top so it shows up without a manual refresh.
  useEffect(() => {
    if (!partnerId) return
    let detach = null
    getSocket({ role: 'partner' }).then((s) => {
      const onSubmitted = (payload = {}) => {
        const row = payload?.review
        if (!row || !row.id) return
        setList((arr) => arr.some((x) => x.id === row.id) ? arr : [row, ...arr])
        setTotal((n) => n + 1)
      }
      s.on('review:submitted', onSubmitted)
      detach = () => s.off('review:submitted', onSubmitted)
    }).catch(() => {})
    return () => { if (detach) detach() }
  }, [partnerId])

  const patch = (updated) =>
    setList((arr) => arr.map((r) => r.id === updated.id ? updated : r))

  return (
    <div className="min-h-full animate-pgIn">
      <div className="px-5 py-4 flex items-center gap-3">
        <button onClick={() => nav(-1)}
          className="w-[34px] h-[34px] rounded-full bg-surface border-[1.5px] border-border
                     flex items-center justify-center text-muted hover:text-text transition">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-extrabold text-[17px]">My Reviews</h1>
          {total > 0 && (
            <div className="text-[10.5px] text-muted">
              {total} review{total === 1 ? '' : 's'}
              {Number(profile?.rating_avg) > 0 && (
                <> · ⭐ {Number(profile.rating_avg).toFixed(1)} avg</>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-5 lg:p-7 max-w-[720px] mx-auto flex flex-col gap-2.5">
        {loading && list.length === 0 && <RowSkeleton count={5} />}

        {!loading && error && list.length === 0 && (
          <div className="card p-6 text-center text-[12.5px] text-muted">
            {error}
            <div className="mt-3">
              <button onClick={loadFirstPage}
                className="text-[11.5px] font-bold px-4 py-2 rounded-full
                           bg-accent text-white hover:brightness-90 transition">
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && list.length === 0 && (
          <div className="card p-6 text-center text-[12.5px] text-muted">
            No reviews yet — your first one will land here once a customer
            rates a paid job.
          </div>
        )}

        {list.map((r) => <ReviewRow key={r.id} review={r} onPatch={patch} />)}

        {hasMore && (
          <div ref={sentinelRef} className="py-3 flex justify-center">
            {loadingMore
              ? <Loader size={16}/>
              : <span className="text-[11px] text-muted">Scroll for more…</span>}
          </div>
        )}

        {!hasMore && list.length > 0 && (
          <div className="py-3 text-center text-[11px] text-muted">
            That's everything ({total})
          </div>
        )}
      </div>
    </div>
  )
}
