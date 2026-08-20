import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { pickRoleThunk } from '@/features/profile/profileSlice'
import { setMode, pushToast } from '@/features/app/appSlice'
import OnboardingShell from './OnboardingShell'

const CARDS = [
  { role: 'user',    icon: '🏠', name: 'User',
    desc: "I need home services like plumbing, electrical, carpentry etc." },
  { role: 'partner', icon: '🔧', name: 'Partner',
    desc: "I provide services and want to earn through ServiceLink." },
]

export default function RolePickPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  // Always start with NO role selected — user must click a card explicitly.
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)

  // Partner flow = 4 steps visible, user flow = 3 visible. We're on step 1 regardless.
  const total = sel === 'partner' ? 4 : (sel === 'user' ? 3 : 4)

  const onContinue = async () => {
    if (!sel) return dispatch(pushToast({ text: 'Please select whether you are a User or Partner.', type: 'warn' }))
    setBusy(true)
    try {
      await dispatch(pickRoleThunk(sel)).unwrap()
      dispatch(setMode(sel))
      nav('/onboarding/profile')
    } finally { setBusy(false) }
  }

  return (
    <OnboardingShell
      step={1} total={total}
      onBack={() => nav('/login')}
      footer={
        <button onClick={onContinue} disabled={!sel || busy} className="ob-cta">
          {busy ? 'Saving…' : 'Continue →'}
        </button>
      }
    >
      <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[28px] mb-1.5">
        Who are you?
      </h1>
      <p className="text-muted text-[13px] md:text-sm lg:text-[15px] leading-relaxed mb-6 lg:mb-8">
        Tell us how you'll use ServiceLink. You can always switch later.
      </p>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-5 mb-5">
        {CARDS.map(({ role, icon, name, desc }) => {
          const on = sel === role
          return (
            <button key={role} type="button" onClick={() => setSel(role)}
              className={`text-center cursor-pointer rounded-[var(--r)] bg-card
                          px-4 py-5 md:px-5 md:py-6 lg:px-6 lg:py-8
                          border-2 transition-all
                          ${on ? 'border-accent bg-[#fff5f2] dark:bg-[#241a18]' : 'border-border hover:border-accent hover:bg-[#fff5f2] dark:hover:bg-[#241a18]'}`}>
              <div className="text-[36px] md:text-[42px] lg:text-5xl mb-2 lg:mb-3.5">{icon}</div>
              <div className={`font-display font-extrabold text-[15px] md:text-base lg:text-lg
                               ${on ? 'text-accent' : 'text-text'}`}>
                {name}
              </div>
              <div className="text-[11px] md:text-xs lg:text-[13px] text-muted leading-relaxed mt-1">
                {desc}
              </div>
              <div className={`w-5 h-5 lg:w-[22px] lg:h-[22px] rounded-full border-2 mx-auto mt-2.5 lg:mt-3.5
                               transition-all
                               ${on ? 'border-accent bg-accent' : 'border-border'}`} />
            </button>
          )
        })}
      </div>
    </OnboardingShell>
  )
}
