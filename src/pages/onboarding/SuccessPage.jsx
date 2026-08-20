import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { selectProfile } from '@/features/profile/profileSlice'
import { selectPartnerProfile } from '@/features/partner/partnerSlice'
import OnboardingShell from './OnboardingShell'

export default function SuccessPage () {
  const nav     = useNavigate()
  const profile = useSelector(selectProfile)
  const partner = useSelector(selectPartnerProfile)
  const isPartner = profile?.role === 'partner'

  // 9.9s auto-redirect
  useEffect(() => {
    const t = setTimeout(() => nav(isPartner ? '/partner' : '/', { replace: true }), 9900)
    return () => clearTimeout(t)
  }, [isPartner, nav])

  const title = isPartner ? 'Profile Created!' : 'Welcome to ServiceLink!'
  const sub   = isPartner
    ? 'Your partner profile is now live. Customers near you can find and book you.'
    : 'Your account is ready. Find trusted service partners near you.'

  const nextSteps = isPartner ? [
    { mark: '✓', ok: true,  label: 'Profile is live and visible to customers' },
    { mark: '1', ok: false, label: 'Opening your partner dashboard…' },
    { mark: '2', ok: false, label: "You'll receive job requests shortly" },
  ] : [
    { mark: '✓', ok: true,  label: 'Account created successfully' },
    { mark: '1', ok: false, label: 'Opening the map to explore services…' },
    { mark: '2', ok: false, label: 'Search, compare, and book partners' },
  ]

  return (
    <OnboardingShell
      step={isPartner ? 4 : 3}
      total={isPartner ? 4 : 3}
      onBack={() => {}}
      hideFooter hideProgress
    >
      <div className="relative min-h-[70vh] md:min-h-[80vh] flex flex-col items-center justify-center text-center
                      px-6 md:px-10 py-10 md:py-16 lg:py-20 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-[-40px] right-[-40px] w-40 h-40 rounded-full pointer-events-none"
             style={{ background: 'rgba(5,150,105,0.06)' }} />
        <div className="absolute bottom-[-30px] left-[-30px] w-[120px] h-[120px] rounded-full pointer-events-none"
             style={{ background: 'rgba(232,65,26,0.05)' }} />

        <div className="w-[90px] h-[90px] md:w-[100px] md:h-[100px] lg:w-[110px] lg:h-[110px]
                        rounded-full grid place-items-center text-[42px] md:text-[46px] lg:text-[50px]
                        bg-[#dcfce7] border-4 border-success animate-popIn mb-5 lg:mb-6">
          🎉
        </div>

        <h1 className="font-display font-extrabold text-text text-[26px] md:text-[28px] lg:text-[32px] mb-2.5">
          {title}
        </h1>
        <p className="text-muted text-sm lg:text-base leading-relaxed mb-5 lg:mb-6 max-w-md">
          {sub}
        </p>

        {/* Partner stats row */}
        {isPartner && (
          <div className="grid grid-cols-2 gap-2.5 max-w-sm w-full mb-5">
            {[
              { icon: '🔧', value: (partner?.work_prices || partner?.category_prices)?.length || 0, label: 'SERVICES' },
              { icon: '📍', value: partner?.service_radius_km || 0,       label: 'KM RADIUS' },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-[var(--rs)] p-3 text-center">
                <div className="text-base">{s.icon}</div>
                <div className="font-display font-extrabold text-lg text-accent">{s.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* What happens next */}
        <div className="bg-surface border border-border rounded-[var(--rs)] p-4 text-left max-w-sm w-full mb-4">
          <div className="text-center text-[10px] font-bold uppercase tracking-wider text-muted mb-2.5">
            What happens next
          </div>
          <div className="flex flex-col gap-2">
            {nextSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-xs lg:text-[13px]">
                <span className={`w-[22px] h-[22px] rounded-full text-white font-extrabold text-[10px]
                                  grid place-items-center shrink-0
                                  ${s.ok ? 'bg-success' : 'bg-accent'}`}>
                  {s.mark}
                </span>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[12px] text-muted">
          <div className="w-[18px] h-[18px] border-2 border-border border-t-accent rounded-full animate-spin" />
          Redirecting…
        </div>
      </div>
    </OnboardingShell>
  )
}
