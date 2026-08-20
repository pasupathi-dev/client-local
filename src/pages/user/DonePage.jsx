// Post-payment success + feedback screen for the customer.
//
// Design goals:
//   - Matches the rest of the app (accent orange + success green + font-display).
//   - Combines the "Payment Successful" celebration with the review step so
//     the customer isn't bounced through two screens. One submit, one tap
//     to leave.
//   - Five big tappable stars with live labels ("Great!", "Loved it"),
//     optional one-line feedback note. Hitting Submit writes the review AND
//     navigates home — no separate "Back to home" follow-up.
//   - Celebration polish mirrors the partner payment popup: glow-pulsing
//     success badge, check-draw SVG, and a radial confetti burst.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { selectActiveJob, clearActive } from '@/features/jobs/jobsSlice'
import { pushToast } from '@/features/app/appSlice'
import { formatPrice } from '@/utils/format'

const STAR_LABELS = ['', 'Not great', 'Meh', 'OK', 'Good', 'Loved it!']

export default function DonePage () {
  const { jobId } = useParams()
  const nav       = useNavigate()
  const job       = useSelector(selectActiveJob)
  const dispatch  = useDispatch()

  const [stars,   setStars]   = useState(5)
  const [hover,   setHover]   = useState(0)
  const [comment, setComment] = useState('')
  const [busy,    setBusy]    = useState(false)
  const [displayAmount, setDisplayAmount] = useState(0)

  const amount = Number(job?.agreed_price || 0) + Number(job?.tip_amount || 0)
  const confetti = useMemo(() => buildConfetti(26), [])

  // Count-up on the amount — same easing as the partner popup for
  // consistency across sides.
  useEffect(() => {
    if (!amount) { setDisplayAmount(0); return }
    const start = performance.now()
    const duration = 1200
    let raf = 0
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayAmount(Math.round(amount * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [amount])

  const finish = () => {
    dispatch(clearActive())
    nav('/', { replace: true })
  }

  const submit = async () => {
    setBusy(true)
    try {
      await api.createReview({ job_id: jobId, stars, comment: comment.trim() })
      dispatch(pushToast({ text: 'Thanks — your review helps others.' }))
    } catch (e) {
      // A failed review shouldn't trap the user on this screen — show the
      // error as a toast and still let them go home.
      dispatch(pushToast({ text: e?.response?.data?.message || 'Could not save review' }))
    } finally {
      setBusy(false)
      finish()
    }
  }

  const skip = () => finish()

  const label = STAR_LABELS[hover || stars] || ''

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-5
                    bg-[rgba(6,27,21,0.82)] backdrop-blur-[6px] animate-fadeIn overflow-y-auto">
      <div className="relative bg-card rounded-[22px] px-6 py-7 w-full max-w-[440px]
                      text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] animate-popIn
                      overflow-hidden my-4">
        {/* soft green glow behind the badge */}
        <div aria-hidden className="pointer-events-none absolute inset-0"
             style={{ background:
               'radial-gradient(circle at 50% -10%, rgba(16,185,129,0.22), transparent 55%)' }}/>

        {/* Radial confetti burst out of the success badge. */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[70px]">
          {confetti.map((p, i) => (
            <span key={i}
              className="absolute block w-[6px] h-[10px] rounded-[1px] animate-confettiBurst"
              style={{
                left: 0, top: 0, background: p.color,
                '--cx': `${p.x}px`, '--cy': `${p.y}px`, '--cr': `${p.rot}deg`,
                animationDelay: `${p.delay}s`,
              }}/>
          ))}
        </div>

        {/* success badge */}
        <div className="relative mx-auto w-[88px] h-[88px] mb-3">
          <div className="absolute inset-0 rounded-full bg-success/25 animate-successRing" />
          <div className="absolute inset-0 rounded-full bg-success/20 animate-successRingB" />
          <div className="relative w-[88px] h-[88px] rounded-full bg-success
                          grid place-items-center animate-successBurst animate-glowPulse">
            <svg width="44" height="44" viewBox="0 0 52 52" fill="none" aria-hidden>
              <path d="M14 27 l8 8 l16 -18" stroke="white" strokeWidth="4.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="animate-checkDraw" />
            </svg>
          </div>
        </div>

        <div className="relative">
          <div className="font-display font-extrabold text-[22px] text-text">
            Payment Successful
          </div>
          <div className="font-display font-extrabold text-[28px] text-success mt-2 mb-1
                          animate-moneyPop">
            {formatPrice(displayAmount)}
          </div>

          {job && (
            <div className="text-[12px] text-muted mb-5 leading-[1.55]">
              Paid to <span className="text-text font-semibold">{job.partner_name || 'your partner'}</span>
              {job.service ? <> for <span className="text-text font-semibold">{job.service}</span></> : null}
            </div>
          )}

          {/* Feedback — stars + optional one-liner. One primary action to
              submit and leave, so the user doesn't have to tap twice. */}
          <div className="rounded-[var(--r)] border border-border bg-surface p-4 mb-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted mb-2">
              Rate your experience
            </div>
            <div className="flex justify-center gap-1.5 mb-1"
                 onMouseLeave={() => setHover(0)}>
              {[1,2,3,4,5].map((n) => {
                const active = n <= (hover || stars)
                return (
                  <button key={n} type="button"
                    onClick={() => setStars(n)}
                    onMouseEnter={() => setHover(n)}
                    className={`text-[34px] leading-none transition-transform
                                ${active ? 'text-[#f59e0b] scale-110' : 'text-[#d1d5db] hover:text-[#fbbf24]'}
                                hover:scale-125 active:scale-95`}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}>
                    ★
                  </button>
                )
              })}
            </div>
            <div className="text-[11px] font-semibold text-text h-4 mb-2">{label}</div>

            <textarea rows={2} maxLength={240}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a quick note (optional)"
              className="w-full px-3 py-2 rounded-[var(--rs)] border-[1.5px] border-border
                         bg-card text-[12.5px] text-text leading-[1.5] outline-none
                         focus:border-accent transition resize-none placeholder:text-muted" />
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={submit} disabled={busy}
              className="w-full py-3 rounded-[var(--rs)] bg-accent text-white
                         font-display font-bold text-[13px]
                         shadow-[0_6px_18px_rgba(232,65,26,0.35)]
                         hover:brightness-[1.05] transition disabled:opacity-60">
              {busy ? 'Submitting…' : 'Submit & Go Home'}
            </button>
            <button onClick={skip} disabled={busy}
              className="w-full py-2.5 rounded-[var(--rs)]
                         text-muted text-[12px] font-semibold
                         hover:text-text transition disabled:opacity-60">
              Skip for now
            </button>
          </div>

          {/* H66 — dispute window reminder. Keeps the customer informed
              without nagging — link goes to the job detail which holds
              the actual "Report a problem" button. */}
          <div className="mt-4 text-[11px] text-muted leading-[1.55]">
            Not happy with the service?{' '}
            <button
              type="button"
              onClick={() => nav(`/my-jobs/${jobId}`)}
              className="text-accent font-bold hover:underline">
              Raise a dispute
            </button>{' '}
            within <span className="font-bold">48 hours</span>.
          </div>
        </div>
      </div>
    </div>
  )
}

// Confetti burst out of the success badge. Mirrors the palette from the
// partner payment popup so both sides feel like the same product.
function buildConfetti (n) {
  const palette = ['#10b981', '#34d399', '#f59e0b', '#facc15', '#e8411a', '#38bdf8', '#a855f7']
  const out = []
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + (Math.random() * 0.4)
    const dist  = 170 + Math.random() * 110
    out.push({
      color: palette[i % palette.length],
      x:     Math.cos(angle) * dist,
      y:     Math.sin(angle) * dist - 20,
      rot:   Math.floor(Math.random() * 720 - 360),
      delay: Math.random() * 0.15,
    })
  }
  return out
}
