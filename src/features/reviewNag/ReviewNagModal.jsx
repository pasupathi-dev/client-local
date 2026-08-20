// ReviewNagModal — non-dismissable rating modal that fires whenever the
// customer has a paid job from > 1h ago they haven't rated. Two exits:
//   1. Submit a 1-5 star rating (+ optional comment) → POST /api/reviews.
//   2. Tap "Skip" → POST /api/reviews/skip so we don't ask again for that job.
//
// Mounted once at the top of the app via <ReviewNagMount /> below. The modal
// owns a single piece of UI; the gating logic lives in ReviewNagContext.

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useReviewNag } from './ReviewNagContext'
import { pushToast } from '@/features/app/appSlice'
import * as api from '@/services/api'
import Loader from '@/components/Loader'
import { chipsFor } from '@/utils/reviewAspects'

function StarRow ({ value, onChange }) {
  return (
    <div className="flex items-center justify-center gap-1.5 my-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        return (
          <button key={n} type="button" onClick={() => onChange(n)}
            className="text-[36px] leading-none transition-transform
                       hover:scale-110 focus:outline-none"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}>
            <span style={{ color: filled ? '#f59e0b' : '#e4e1db' }}>★</span>
          </button>
        )
      })}
    </div>
  )
}

// H60 — Chip row that swaps positive ↔ negative based on the star pick.
// Multi-select; selected slugs flow back via `onToggle`.
function ChipRow ({ stars, selected, onToggle }) {
  const chips = chipsFor(stars)
  return (
    <div className="flex flex-wrap gap-1.5 justify-center my-2">
      {chips.map((c) => {
        const on = selected.includes(c.slug)
        return (
          <button key={c.slug} type="button" onClick={() => onToggle(c.slug)}
            className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold border transition
                        ${on
                          ? 'bg-accent text-white border-accent'
                          : 'bg-card text-text border-border hover:border-accent'}`}>
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

export default function ReviewNagModal () {
  const dispatch = useDispatch()
  const { open, pending, submitted, skipped } = useReviewNag()
  const [stars, setStars]     = useState(5)
  const [comment, setComment] = useState('')
  const [tags, setTags]       = useState([])
  const [busy, setBusy]       = useState(false)
  // M62 — second-step "what went wrong" form for ≤2★ submissions. Holds the
  // saved review id so the support-followup POST can attach to it.
  const [supportFor, setSupportFor] = useState(null) // { reviewId, stars }
  const [supportNote, setSupportNote] = useState('')

  // Reset chip selection whenever the star pick crosses the 4★ boundary —
  // a customer who clicked "On time" at 5★ then dropped to 2★ shouldn't
  // accidentally tag a negative review with positive chips.
  useEffect(() => {
    setTags((prev) => {
      const allowed = new Set(chipsFor(stars).map((c) => c.slug))
      return prev.filter((s) => allowed.has(s))
    })
  }, [stars])

  if (!open || !pending) return null

  const toggleTag = (slug) => {
    setTags((prev) => prev.includes(slug)
      ? prev.filter((s) => s !== slug)
      : [...prev, slug].slice(0, 5))
  }

  const submit = async () => {
    if (busy) return
    if (stars < 1 || stars > 5) {
      dispatch(pushToast({ text: 'Pick a rating between 1 and 5 stars' }))
      return
    }
    setBusy(true)
    try {
      const { review } = await api.createReview({
        job_id:  pending.id,
        stars,
        comment: comment.trim() || null,
        tags:    tags.length ? tags : null,
      })
      dispatch(pushToast({ text: 'Thanks for the review!' }))
      // M62 — open the private follow-up form for ≤2★ before closing the
      // nag. The public review is already saved; the follow-up note is
      // optional but strongly encouraged.
      if (stars <= 2 && review?.id) {
        setSupportFor({ reviewId: review.id, stars })
        setBusy(false)
        return
      }
      setStars(5); setComment(''); setTags([])
      submitted()
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Could not submit'
      dispatch(pushToast({ text: msg }))
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    if (busy) return
    setBusy(true)
    try { await skipped() }
    finally { setBusy(false) }
  }

  // M62 — submit the optional "what went wrong" follow-up. We still let the
  // user dismiss without filling it in — the public review is the canonical
  // record, the follow-up just helps support do better.
  const submitSupport = async () => {
    if (busy || !supportFor?.reviewId) return
    const note = supportNote.trim()
    if (!note) return // disabled by the button anyway, defensive
    setBusy(true)
    try {
      await api.submitReviewSupport(supportFor.reviewId, note)
      dispatch(pushToast({ text: 'Thanks — our team will follow up' }))
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not save', type: 'error' }))
    } finally {
      setBusy(false)
      setSupportFor(null)
      setSupportNote('')
      setStars(5); setComment(''); setTags([])
      submitted()
    }
  }

  const dismissSupport = async () => {
    if (busy) return
    setSupportFor(null)
    setSupportNote('')
    setStars(5); setComment(''); setTags([])
    submitted()
  }

  const partnerName = pending.partner_name || 'your pro'
  const partnerInit = pending.partner_initials || (partnerName[0] || 'P').toUpperCase()
  const partnerAv   = pending.partner_av_class || 'pav-a'

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm
                    flex items-center justify-center p-4 animate-fadeIn">
      <div className="w-full max-w-[420px] bg-card border border-border rounded-[16px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="h-1 bg-accent w-full" />

        {/* M62 — second-step support form for ≤2★ reviews. Replaces the
            review form once a low rating is saved; closes the nag entirely
            on Submit or Skip. */}
        {supportFor ? (
          <div className="p-5">
            <p className="text-[11px] tracking-[0.5px] uppercase font-extrabold
                          text-muted text-center mb-3">
              Sorry to hear that
            </p>
            <p className="text-[14px] font-bold text-text text-center m-0">
              Tell us what went wrong
            </p>
            <p className="text-[11.5px] text-muted text-center mt-1 leading-[1.5]">
              This is private — only our support team will see it. We'll follow
              up if there's anything we can do.
            </p>
            <textarea
              value={supportNote}
              onChange={(e) => setSupportNote(e.target.value.slice(0, 1000))}
              placeholder="What happened? Was anything unsafe, broken, or unfair?"
              rows={5}
              className="w-full bg-surface border border-border rounded-[10px]
                         px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                         focus:outline-none focus:border-accent resize-none mt-4" />
            <div className="grid grid-cols-3 gap-2 mt-4">
              <button onClick={dismissSupport} disabled={busy}
                className="bg-card border border-border text-muted text-[12px] font-bold
                           py-2.5 rounded-[10px] hover:text-text hover:border-text
                           transition disabled:opacity-60">
                Not now
              </button>
              <button onClick={submitSupport} disabled={busy || !supportNote.trim()}
                className="col-span-2 bg-accent text-white text-[13px] font-bold
                           py-2.5 rounded-[10px] hover:brightness-90 transition
                           shadow-[0_4px_12px_rgba(232,65,26,0.3)]
                           disabled:opacity-60 disabled:cursor-not-allowed">
                {busy
                  ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Sending…</span>
                  : 'Send to support'}
              </button>
            </div>
          </div>
        ) : (
        <div className="p-5">
          <p className="text-[11px] tracking-[0.5px] uppercase font-extrabold
                        text-muted text-center mb-3">
            Rate your last service
          </p>

          {/* Job summary chip */}
          <div className="bg-surface border border-border rounded-[12px] p-3
                          flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center
                             text-[12px] font-extrabold ${partnerAv}`}>
              {partnerInit}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-text m-0 truncate">
                {pending.service_icon ? `${pending.service_icon} ` : ''}{pending.service}
              </p>
              <p className="text-[11px] text-muted m-0 mt-0.5 truncate">
                with {partnerName} · ₹{pending.agreed_price}
              </p>
            </div>
          </div>

          <p className="text-[14px] font-bold text-text text-center m-0">
            How was your experience?
          </p>
          <StarRow value={stars} onChange={setStars} />

          {/* H60 — aspect chips. Vocabulary swaps based on star pick. */}
          <p className="text-[10.5px] text-muted text-center mt-2 mb-0.5">
            {stars >= 4 ? 'What did they do well?' : 'What could have been better?'}
          </p>
          <ChipRow stars={stars} selected={tags} onToggle={toggleTag} />

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 280))}
            placeholder="Add a comment (optional)…"
            rows={3}
            className="w-full bg-surface border border-border rounded-[10px]
                       px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                       focus:outline-none focus:border-accent resize-none mt-2" />

          <div className="grid grid-cols-3 gap-2 mt-4">
            <button onClick={skip} disabled={busy}
              className="bg-card border border-border text-muted text-[12px] font-bold
                         py-2.5 rounded-[10px] hover:text-text hover:border-text
                         transition disabled:opacity-60">
              Skip
            </button>
            <button onClick={submit} disabled={busy}
              className="col-span-2 bg-accent text-white text-[13px] font-bold
                         py-2.5 rounded-[10px] hover:brightness-90 transition
                         shadow-[0_4px_12px_rgba(232,65,26,0.3)]
                         disabled:opacity-60 disabled:cursor-not-allowed">
              {busy
                ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> Submitting…</span>
                : `Submit ${stars}★ rating`}
            </button>
          </div>

          <p className="text-[10px] text-muted text-center mt-3 leading-[1.5]">
            We ask once per job. Skip and we won't ask again — you can still
            rate from My Jobs.
          </p>
        </div>
        )}
      </div>
    </div>
  )
}
