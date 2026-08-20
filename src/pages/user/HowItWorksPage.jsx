// How ServiceLink works — a full-width, interactive explainer.
//   • A "cloud" actors diagram (You → ServiceLink → a Pro) with animated
//     flowing connector dots, so the matching idea reads at a glance.
//   • An auto-advancing, clickable step flow with a detail panel — the full
//     A-to-Z journey, explained one step at a time.
//   • Trust + pricing breakdown, and a CTA.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = [
  { icon: '🧭', short: 'Pick',     actor: 'You',        title: 'Pick what you need',
    desc: 'Choose a category, then the exact service — Electrician, AC Repair, Cleaning, and more.' },
  { icon: '⚡', short: 'Match',    actor: 'ServiceLink', title: 'Get matched in ~60 seconds',
    desc: 'Tap “Request now” and we instantly find the closest available, verified partner near you. Prefer to choose yourself? Browse partners with ratings, prices and distance, then pick one.' },
  { icon: '🤝', short: 'Accept',   actor: 'Your partner', title: 'A partner accepts',
    desc: 'The first available partner to accept takes the job. You immediately see their profile, rating and live ETA.' },
  { icon: '🔒', short: 'Price',    actor: 'Your partner', title: 'Firm price, up front',
    desc: 'Before any work begins the partner confirms the price. What you see is what you pay — no haggling. You only pay extra for scope changes you agree to.' },
  { icon: '📍', short: 'On the way', actor: 'Your partner', title: 'Track on the live map',
    desc: 'Watch your partner head to your door in real time. Share the trip with a trusted contact in one tap for added safety.' },
  { icon: '🛠️', short: 'Work',     actor: 'Your partner', title: 'The work gets done',
    desc: 'Your verified partner completes the job. You confirm when it’s finished.' },
  { icon: '💳', short: 'Pay',      actor: 'You',        title: 'Pay securely',
    desc: 'Pay through the app once you’re happy. Your payment is handled securely and settled for the completed work.' },
  { icon: '⭐', short: 'Review',   actor: 'You',        title: 'Rate & review',
    desc: 'Leave a rating and review. Your honest feedback keeps quality high and helps the next customer choose.' },
]

const TRUST = [
  { icon: '✓', title: 'Verified partners', desc: 'Every partner is identity- and skill-checked before they can take jobs.' },
  { icon: '🔒', title: 'Firm, upfront pricing', desc: 'The rate is shown and agreed before work starts — never a surprise bill.' },
  { icon: '🛡️', title: 'Safety built in', desc: 'Live trip tracking, SOS, and trusted-contact sharing on every job.' },
  { icon: '💬', title: 'Real ratings', desc: 'Genuine reviews from real bookings — quality you can rely on.' },
]

function Actor ({ emoji, label, sub, big }) {
  return (
    <div className="flex flex-col items-center text-center shrink-0">
      <div className={`rounded-full border-2 grid place-items-center
        ${big
          ? 'w-16 h-16 lg:w-24 lg:h-24 text-[30px] lg:text-[44px] bg-accent/10 border-accent/40'
          : 'w-14 h-14 lg:w-20 lg:h-20 text-[26px] lg:text-[38px] bg-surface border-border'}`}>
        <Emoji e={emoji} className={`animate-avatarBreathe ${big ? 'w-9 h-9 lg:w-14 lg:h-14' : 'w-8 h-8 lg:w-12 lg:h-12'}`} />
      </div>
      <div className="mt-2 text-[12px] lg:text-[14px] font-extrabold text-text">{label}</div>
      <div className="text-[10px] lg:text-[12px] text-muted">{sub}</div>
    </div>
  )
}

function Connector ({ label }) {
  return (
    <div className="relative flex-1 min-w-[40px] sm:min-w-[70px] h-12 flex items-center">
      <div className="h-[2px] w-full rounded-full
                      bg-gradient-to-r from-accent/20 via-accent/60 to-accent/20" />
      <span className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent
                       shadow-[0_0_10px_rgba(232,65,26,0.7)] animate-travelX" />
      <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] lg:text-[11px]
                       font-extrabold text-accent whitespace-nowrap">{label}</span>
    </div>
  )
}

// Rich, polished emoji art rendered as an image so it looks the same (and like
// a proper character) on every device — not the flat/garbled system glyph.
// Falls back to the native emoji if the image can't load.
function Emoji ({ e, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className={`inline-flex items-center justify-center leading-none ${className}`}>{e}</span>
  }
  return (
    <img src={`https://emojicdn.elk.sh/${e}?style=apple`} alt="" loading="lazy" draggable={false}
      onError={() => setFailed(true)}
      className={`object-contain select-none ${className}`} />
  )
}

// Circular cycle diagram — all steps arranged around a ring, a dashed
// connecting circle, and a "pro" character that travels the loop to you.
function CircleFlow () {
  const N = STEPS.length
  const R = 38 // % radius of the ring the nodes sit on
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      {/* dashed connecting ring */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#E8411A" strokeOpacity="0.25"
          strokeWidth="0.6" strokeDasharray="2 2.6" />
      </svg>

      {/* the pro travels the loop to you (stays upright via counter-spin) */}
      <div className="absolute inset-0 animate-orbit">
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: `${50 - R}%` }}>
          <div className="animate-orbit-rev w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-card
                          border-2 border-accent grid place-items-center
                          shadow-[0_3px_12px_rgba(232,65,26,0.4)]">
            <Emoji e="🧑‍🔧" className="w-6 h-6 lg:w-7 lg:h-7" />
          </div>
        </div>
      </div>

      {/* centre hub — you; the pro comes to you */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                      w-[40%] aspect-square rounded-full bg-card border-2 border-accent/30 shadow-card
                      flex flex-col items-center justify-center text-center px-2">
        <div className="w-11 h-11 lg:w-14 lg:h-14 rounded-full bg-accent/15 grid place-items-center">
          <Emoji e="🙋" className="w-7 h-7 lg:w-9 lg:h-9 animate-avatarBreathe" />
        </div>
        <div className="font-display font-extrabold text-text text-[11px] lg:text-[14px] leading-tight mt-1.5">
          You
        </div>
        <div className="text-[8.5px] lg:text-[10px] text-muted leading-tight mt-0.5">
          we bring the partner to you
        </div>
      </div>

      {/* step nodes around the ring */}
      {STEPS.map((s, i) => {
        const ang = (i / N) * 2 * Math.PI - Math.PI / 2  // start at top, clockwise
        const x = 50 + R * Math.cos(ang)
        const y = 50 + R * Math.sin(ang)
        return (
          <div key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-[84px]"
            style={{ left: `${x}%`, top: `${y}%` }}>
            <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-card border-2 border-accent
                            grid place-items-center shadow-card">
              <Emoji e={s.icon} className="w-7 h-7 lg:w-8 lg:h-8" />
            </div>
            <div className="mt-1 text-[10px] font-bold text-text text-center leading-tight">
              <span className="text-accent">{i + 1}.</span> {s.short}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HowItWorksPage () {
  const nav = useNavigate()

  return (
    <div className="min-h-full bg-surface">
      <div className="w-full max-w-[1400px] mx-auto px-4 lg:px-5 py-4 lg:py-6 space-y-5 animate-pgIn">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} aria-label="Back"
            className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center
                       text-text hover:border-accent hover:text-accent transition shrink-0">
            ←
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-[20px] lg:text-[26px] font-extrabold text-text leading-tight">
              How ServiceLink works
            </h1>
            <p className="text-[12px] lg:text-[13px] text-muted mt-0.5">
              See exactly how we connect you to a trusted partner — step by step.
            </p>
          </div>
        </div>

        {/* How it works — the quick actors summary AND the full step journey,
            combined into one section so the story reads top to bottom. */}
        <div className="bg-card border border-border rounded-[var(--r)] p-5 lg:p-8">
          {/* Quick summary: you → ServiceLink → a pro */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 lg:gap-8 max-w-[760px] mx-auto">
            <Actor emoji="🙋" label="You" sub="need a service" />
            <Connector label="① request" />
            <Actor emoji="☁️" label="ServiceLink" sub="finds the match" big />
            <Connector label="② match" />
            <Actor emoji="🧑‍🔧" label="A verified partner" sub="accepts & arrives" />
          </div>
          <p className="text-center text-[12px] lg:text-[13px] text-muted mt-6 max-w-[620px] mx-auto leading-[1.6]">
            You request → we instantly find the nearest available verified partner → they accept and
            head to your door. All in about a minute.
          </p>

          {/* Divider into the detailed journey */}
          <div className="border-t border-border my-6 lg:my-8" />

          {/* Full step journey */}
          <h2 className="font-display font-extrabold text-text text-[15px] lg:text-[17px] text-center">
            Your journey, step by step
          </h2>
          <p className="text-center text-[12px] text-muted mt-1 mb-6 max-w-[560px] mx-auto">
            Every stage from booking to review — one smooth loop.
          </p>

          {/* Circle (md+) */}
          <div className="hidden md:block">
            <CircleFlow />
          </div>

          {/* Card grid (mobile) */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STEPS.map((s, i) => (
              <div key={i} className="bg-surface border border-border rounded-[var(--r)] p-4 flex flex-col">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-8 h-8 rounded-full bg-accent text-white grid place-items-center
                                   font-extrabold text-[13px] shrink-0">{i + 1}</span>
                  <Emoji e={s.icon} className="w-8 h-8" />
                </div>
                <span className="self-start text-[9px] font-extrabold uppercase tracking-[0.5px]
                                 text-accent bg-accent/10 px-2 py-0.5 rounded-full mb-1.5">
                  {s.actor}
                </span>
                <h3 className="font-display font-extrabold text-text text-[14px] leading-tight">{s.title}</h3>
                <p className="text-[12px] text-muted leading-[1.55] mt-1.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust — full-width grid */}
        <div>
          <h2 className="font-display font-extrabold text-text text-[15px] lg:text-[16px] mb-3 px-1">
            Why you can trust us
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {TRUST.map((t, i) => (
              <div key={i} className="bg-card border border-border rounded-[var(--r)] p-4">
                <div className="w-10 h-10 rounded-[12px] bg-accent/10 text-accent grid place-items-center text-[18px] mb-2.5">
                  {t.icon}
                </div>
                <div className="font-bold text-text text-[13.5px]">{t.title}</div>
                <p className="text-[12px] text-muted leading-[1.55] mt-1">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-card border border-border rounded-[var(--r)] p-5 lg:p-6">
          <h2 className="font-display font-extrabold text-text text-[15px] lg:text-[16px] mb-3 flex items-center gap-2">
            <span>💰</span> How pricing works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-[13px] text-muted leading-[1.55]">
            <p className="flex gap-2.5"><span className="text-accent font-bold shrink-0">•</span> Each service shows an indicative base price up front.</p>
            <p className="flex gap-2.5"><span className="text-accent font-bold shrink-0">•</span> Your matched partner confirms the firm price before starting — you approve it first.</p>
            <p className="flex gap-2.5"><span className="text-accent font-bold shrink-0">•</span> No haggling, no hidden fees. Extra only for scope changes you agree to.</p>
            <p className="flex gap-2.5"><span className="text-accent font-bold shrink-0">•</span> You pay securely in the app after the work is done.</p>
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => nav('/')}
          className="w-full py-3.5 rounded-[var(--rs)] bg-accent text-white
                     font-display font-bold text-[15px]
                     shadow-[0_4px_16px_rgba(232,65,26,0.25)] hover:brightness-90 transition">
          Find a service →
        </button>
      </div>
    </div>
  )
}
