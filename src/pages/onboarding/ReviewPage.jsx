// Step 3 (user) / Step 4 (partner) — read-only profile review before Finish.

import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { selectProfile, finishOnboardingThunk } from '@/features/profile/profileSlice'
import { selectPartnerProfile, loadMyPartner } from '@/features/partner/partnerSlice'
import OnboardingShell from './OnboardingShell'
import { WORKS as CATEGORIES } from '@/constants/catalog'

const DETAIL_ICONS = {
  phone:   { bg: '#dcfce7', fg: '#166534', icon: '📞', label: 'Mobile',  wide: true  },
  email:   { bg: '#dbeafe', fg: '#1e40af', icon: '✉',  label: 'Email',   wide: true  },
  address: { bg: '#fef3c7', fg: '#92400e', icon: '📍', label: 'Address', wide: true  },
  city:    { bg: '#ede9fe', fg: '#6d28d9', icon: '🏙', label: 'City',    wide: false },
  pincode: { bg: '#dcfce7', fg: '#166534', icon: '📮', label: 'Pincode', wide: false },
}

function ProfileHero ({ profile, roleLabel, badgeClass }) {
  const initials = (profile.full_name || 'U').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'ME'
  return (
    <div className="bg-card rounded-[var(--r)] border-[1.5px] border-border shadow-card overflow-hidden mb-4">
      {/* Gradient header */}
      <div className="p-4 md:p-[18px_20px] flex items-center gap-3.5
                      bg-gradient-to-br from-brand to-[#1e2d4a] text-white">
        <div className="w-[52px] h-[52px] lg:w-[60px] lg:h-[60px] rounded-full
                        flex items-center justify-center font-display font-extrabold
                        text-[17px] lg:text-xl
                        border-[3px] border-white/25
                        bg-gradient-to-br from-accent to-[#ff6b47]">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[17px] lg:text-xl truncate">{profile.full_name}</div>
          <div className="text-[11px] lg:text-xs text-white/55 font-medium">{roleLabel}</div>
        </div>
        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${badgeClass}`}>New</span>
      </div>

      {/* Detail grid — 1-col mobile, 2-col desktop with wide rows spanning both */}
      <div className="md:grid md:grid-cols-2">
        {Object.entries(DETAIL_ICONS).map(([key, def]) => (
          <div key={key}
            className={`flex items-center gap-3 px-5 py-3 lg:py-4
                        border-b border-border last:border-b-0
                        ${def.wide ? 'md:col-span-2' : ''}`}>
            <div className="w-[34px] h-[34px] rounded-[var(--rs)] grid place-items-center text-base shrink-0"
              style={{ background: def.bg, color: def.fg }}>
              {def.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{def.label}</div>
              <div className="text-sm lg:text-[15px] font-semibold truncate">{profile[key] || '—'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── User variant ─────────────────────────────────────────────────────
function UserReview ({ profile }) {
  return (
    <>
      <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[28px] mb-1.5">
        Almost there!
      </h1>
      <p className="text-muted text-[13px] md:text-sm lg:text-[15px] leading-relaxed mb-6 lg:mb-7">
        Review your profile before we get you started.
      </p>

      <ProfileHero profile={profile} roleLabel="ServiceLink User"
        badgeClass="bg-[#dcfce7] text-[#166534] dark:bg-[#064e3b] dark:text-[#86efac]" />

      <div className="bg-card rounded-[var(--r)] border-[1.5px] border-border shadow-card p-5 lg:p-6 mb-4">
        <div className="text-center text-[12px] font-bold uppercase tracking-[0.5px] text-text mb-3.5">
          What you'll get
        </div>
        <ul className="flex flex-col gap-2.5 lg:gap-3">
          {[
            'Browse trusted service partners near you',
            'Compare prices and read real reviews',
            'Chat and negotiate directly with partners',
            'Secure payments through ServiceLink',
            'Rate and review after every job',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5 lg:gap-3 text-[13px] lg:text-sm">
              <span className="w-6 h-6 rounded-full bg-[#dcfce7] text-[#166534]
                               font-extrabold text-xs grid place-items-center shrink-0">✓</span>
              {line}
            </li>
          ))}
        </ul>

        <div className="mt-4 bg-[#f0fdf4] border border-[#86efac] rounded-[var(--rs)]
                        px-3.5 py-3 text-[12px] leading-relaxed text-[#166534]">
          ✅ You're all set! Tap <b>Finish</b> to start exploring services.
        </div>
      </div>
    </>
  )
}

// ── Partner variant ──────────────────────────────────────────────────
function PartnerReview ({ profile, partner }) {
  const cats = partner?.work_prices || partner?.category_prices || []

  return (
    <>
      <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[28px] mb-1.5">
        Review your profile
      </h1>
      <p className="text-muted text-[13px] md:text-sm lg:text-[15px] leading-relaxed mb-6 lg:mb-7">
        This is how customers will see you. Make sure everything looks right.
      </p>

      <ProfileHero profile={profile} roleLabel="ServiceLink Partner"
        badgeClass="bg-[#dbeafe] text-[#1e40af] dark:bg-[#1e3a8a] dark:text-[#bfdbfe]" />

      {/* Services */}
      <div className="mb-4">
        <div className="bg-card rounded-[var(--r)] border-[1.5px] border-border shadow-card p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2.5">🔧 Services</div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((p) => {
              const name = p.work_name || p.category_name
              const cat = CATEGORIES.find((c) => c.name === name)
              return (
                <span key={name}
                  className="inline-flex items-center gap-1 bg-accent text-white rounded-2xl
                             px-2.5 py-1 text-[11px] font-semibold">
                  {cat?.icon} {name}
                </span>
              )
            })}
            {!cats.length && <span className="text-xs text-muted">—</span>}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {[
          { icon: '📅', label: 'Experience', value: `${partner?.experience_years || 0} yrs` },
          { icon: '📍', label: 'Radius',     value: `${partner?.service_radius_km || 0} km` },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-[var(--r)] border-[1.5px] border-border
                                        shadow-card p-3.5 text-center">
            <div className="text-xl">{s.icon}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted mt-0.5">{s.label}</div>
            <div className="font-display font-extrabold text-lg">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Availability + Emergency */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-card rounded-[var(--r)] border-[1.5px] border-border shadow-card p-3.5
                        flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-[var(--rs)] grid place-items-center text-base shrink-0"
               style={{ background: '#dbeafe', color: '#1e40af' }}>🕐</div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Availability</div>
            <div className="text-[13px] font-semibold truncate">
              {partner?.availability_days || '—'}, {partner?.availability_hours || '—'}
            </div>
          </div>
        </div>
        <div className="bg-card rounded-[var(--r)] border-[1.5px] border-border shadow-card p-3.5
                        flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-[var(--rs)] grid place-items-center text-base shrink-0"
               style={{
                 background: partner?.emergency_service ? '#dcfce7' : '#fee2e2',
                 color:      partner?.emergency_service ? '#166534' : '#991b1b',
               }}>🚨</div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Emergency</div>
            <div className="text-[13px] font-semibold">{partner?.emergency_service ? 'Available' : 'Not available'}</div>
          </div>
        </div>
      </div>

      {/* Pricing list */}
      <div className="bg-card rounded-[var(--r)] border-[1.5px] border-border shadow-card overflow-hidden mb-4">
        <div className="bg-brand text-white px-4 py-3.5 font-display font-bold text-[13px]">
          💰 Your Pricing
        </div>
        {cats.map((p, i) => {
          const name = p.work_name || p.category_name
          const cat = CATEGORIES.find((c) => c.name === name)
          return (
            <div key={name}
              className={`flex items-center gap-3 px-4 lg:px-[18px] py-2.5 lg:py-3
                          ${i < cats.length - 1 ? 'border-b border-border' : ''}`}>
              <div className="text-lg">{cat?.icon}</div>
              <div className="flex-1 text-[13px] font-semibold">{name}</div>
              <div className="font-display font-extrabold text-accent text-base">₹{p.base_price}</div>
              <div className="text-[10px] text-muted">/visit</div>
            </div>
          )
        })}
      </div>

      <div className="bg-[#f0fdf4] border border-[#86efac] rounded-[var(--rs)]
                      px-3.5 py-3 text-[12px] leading-relaxed text-[#166534]">
        ✅ Your profile looks great! Tap <b>Finish</b> to go live and start receiving job requests.
      </div>
    </>
  )
}

export default function ReviewPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const profile  = useSelector(selectProfile)
  const partner  = useSelector(selectPartnerProfile)

  const isPartner = profile?.role === 'partner'

  // Pull fresh partner data every time this page opens (covers page refresh).
  useEffect(() => {
    if (isPartner) dispatch(loadMyPartner())
  }, [isPartner, dispatch])

  if (!profile) return null
  // Partner review needs partner row loaded before it can render — show a brief shell.
  if (isPartner && !partner) {
    return (
      <OnboardingShell step={4} total={4} onBack={() => nav('/onboarding/partner-services')} hideFooter>
        <div className="flex items-center gap-3 text-muted text-sm py-10">
          <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
          Loading your profile…
        </div>
      </OnboardingShell>
    )
  }

  const total = isPartner ? 4 : 3
  const step  = isPartner ? 4 : 3

  const onFinish = async () => {
    // Fire & forget — navigate immediately, no "Saving…" button state, no success screen.
    dispatch(finishOnboardingThunk())
    nav(isPartner ? '/partner' : '/', { replace: true })
  }

  return (
    <OnboardingShell
      step={step} total={total}
      onBack={() => nav(isPartner ? '/onboarding/partner-services' : '/onboarding/profile')}
      footer={<button onClick={onFinish} className="ob-cta">Finish →</button>}
    >
      {isPartner ? <PartnerReview profile={profile} partner={partner} /> : <UserReview profile={profile} />}
    </OnboardingShell>
  )
}
