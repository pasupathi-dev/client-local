import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  saveProfileThunk, selectProfile, finishOnboardingThunk,
} from '@/features/profile/profileSlice'
import OnboardingShell from './OnboardingShell'

function FieldLabel ({ children, required = false }) {
  return (
    <label className="flex items-center gap-1 text-xs lg:text-[13px] font-bold uppercase
                      tracking-[0.5px] text-text mb-[7px] lg:mb-2">
      {children}{required && <span className="text-accent text-sm leading-none">*</span>}
    </label>
  )
}

function InputShell ({ error, ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-4 py-3 lg:py-[15px] rounded-[var(--rs)] lg:rounded-[10px]
                  bg-card text-text text-sm lg:text-[15px]
                  border-[1.5px] outline-none transition-colors
                  placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]
                  ${error ? 'border-danger' : 'border-border focus:border-accent'}`}
    />
  )
}

const FIELDS = [
  { key: 'full_name', label: 'Full Name',     placeholder: 'e.g. Murugan Kumar',     required: true,
    err: 'Name is required',                  validate: (v) => !!v.trim() },
  { key: 'email',     label: 'Email Address', placeholder: 'e.g. murugan@email.com', required: true,
    type: 'email',
    err: 'Enter a valid email address',       validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) },
  { key: 'address',   label: 'Address',       placeholder: 'e.g. 14, Anna Nagar Main Road', required: true,
    err: 'Address is required',               validate: (v) => !!v.trim() },
]

export default function BasicProfilePage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const profile  = useSelector(selectProfile)
  const isPartner = profile?.role === 'partner'
  const total = isPartner ? 4 : 3

  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    email:     profile?.email     || '',
    phone:     profile?.phone     || '',
    address:   profile?.address   || '',
    city:      profile?.city      || '',
    pincode:   profile?.pincode   || '',
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k, v) => { setForm((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })) }

  const onContinue = async () => {
    const e = {}
    FIELDS.forEach((f) => { if (f.required && !f.validate(form[f.key])) e[f.key] = f.err })
    if (!form.city.trim()) e.city = 'City is required'
    if (!/^\d{6}$/.test(form.pincode)) e.pincode = 'Enter a valid 6-digit pincode'
    setErrors(e)
    if (Object.keys(e).length) return

    setBusy(true)
    try {
      await dispatch(saveProfileThunk(form)).unwrap()
      if (isPartner) nav('/onboarding/partner-services')
      else {
        // User flow: review (step 3) — we'll skip to /onboarding/review
        nav('/onboarding/review')
      }
    } finally { setBusy(false) }
  }

  return (
    <OnboardingShell
      step={2} total={total}
      onBack={() => nav('/onboarding/role')}
      footer={<button onClick={onContinue} disabled={busy} className="ob-cta">{busy ? 'Saving…' : 'Continue →'}</button>}
    >
      <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[28px] mb-1.5">
        {isPartner ? 'Your basic info' : 'Tell us about you'}
      </h1>
      <p className="text-muted text-[13px] md:text-sm lg:text-[15px] leading-relaxed mb-6 lg:mb-7">
        {isPartner
          ? 'Customers will see this on your profile. Fields marked * are required.'
          : 'Help us personalise your ServiceLink experience.'}
      </p>

      {FIELDS.map((f) => (
        <div key={f.key} className="mb-[18px]">
          <FieldLabel required={f.required}>{f.label}</FieldLabel>
          <InputShell
            type={f.type || 'text'}
            placeholder={f.placeholder}
            value={form[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            error={errors[f.key]}
          />
          {errors[f.key] && <p className="text-[11px] text-danger mt-1.5">{errors[f.key]}</p>}
        </div>
      ))}

      <div className="mb-[18px]">
        <FieldLabel required>Phone</FieldLabel>
        <InputShell
          type="tel" inputMode="numeric" maxLength={10}
          placeholder="10-digit number"
          value={form.phone.replace(/^\+91/, '')}
          onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-[18px]">
        <div>
          <FieldLabel required>City</FieldLabel>
          <InputShell placeholder="e.g. Madurai" value={form.city}
            onChange={(e) => set('city', e.target.value)} error={errors.city}/>
          {errors.city && <p className="text-[11px] text-danger mt-1.5">{errors.city}</p>}
        </div>
        <div>
          <FieldLabel required>Pincode</FieldLabel>
          <InputShell
            inputMode="numeric" maxLength={6}
            placeholder="e.g. 625020"
            value={form.pincode}
            onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={errors.pincode}
          />
          {errors.pincode && <p className="text-[11px] text-danger mt-1.5">{errors.pincode}</p>}
        </div>
      </div>
    </OnboardingShell>
  )
}
