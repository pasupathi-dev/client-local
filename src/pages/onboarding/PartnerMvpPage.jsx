// C8: Minimum-viable partner onboarding.
// Before this page existed the partner had to fill categories + skills +
// pricing + availability + radius in one go before reaching the dashboard,
// which is where most drop-off happened. Now we ask for the absolute minimum
// (which categories you serve) and let them land on the dashboard. Pricing /
// availability / radius / skills are progressive — a nag card on the
// dashboard points to the full Services page when they're ready.

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { selectDynamicWorks } from '@/features/config/configSlice'
import {
  loadMyPartner, updateMyPartnerThunk, selectPartnerProfile,
} from '@/features/partner/partnerSlice'
import { finishOnboardingThunk } from '@/features/profile/profileSlice'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'
import OnboardingShell from './OnboardingShell'

const groupWorks = (works) => {
  const m = {}
  for (const w of works) {
    const cat = w.category_name || w.category || 'Other'
    ;(m[cat] ||= []).push(w)
  }
  return m
}

export default function PartnerMvpPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const works    = useSelector(selectDynamicWorks)
  const partner  = useSelector(selectPartnerProfile)
  const catalog  = (works && works.length) ? works : FALLBACK_WORKS
  const grouped  = useMemo(() => groupWorks(catalog), [catalog])

  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { dispatch(loadMyPartner()) }, [dispatch])

  // Hydrate from saved partner row (e.g. partner reloads the page mid-flow).
  useEffect(() => {
    if (!partner) return
    const cps = partner.work_prices || partner.category_prices || []
    if (cps.length) setSelected(cps.map((c) => c.work_name || c.category_name))
    else if (partner.primary_work || partner.primary_category) {
      setSelected([partner.primary_work || partner.primary_category])
    }
  }, [partner])

  const toggle = (name) => {
    setErr('')
    setSelected((s) => s.includes(name) ? s.filter((x) => x !== name) : [...s, name])
  }

  const onContinue = async () => {
    if (!selected.length) {
      setErr('Pick at least one service so customers know what you offer.')
      return
    }
    setBusy(true)
    try {
      // Seed `work_prices` with the chosen works but no price yet — the
      // dashboard nag card will prompt for prices later. This lets the partner
      // appear in browse lists immediately without a number.
      const existing = partner?.work_prices || partner?.category_prices || []
      const byName = Object.fromEntries(existing.map((c) => [c.work_name || c.category_name, c]))
      const work_prices = selected.map((name) => {
        const e = byName[name]
        return e ? { work_name: name, base_price: e.base_price || 0 } : { work_name: name, base_price: 0 }
      })

      await dispatch(updateMyPartnerThunk({
        works: selected,
        primary_work: selected[0],
        work_prices,
      })).unwrap()
      // Skip the review step — finishOnboarding flips the flag and the gate
      // lets them through to /partner.
      await dispatch(finishOnboardingThunk()).unwrap().catch(() => {})
      nav('/partner', { replace: true })
    } finally { setBusy(false) }
  }

  return (
    <OnboardingShell
      step={2} total={2}
      onBack={() => nav('/onboarding/profile')}
      footer={
        <button onClick={onContinue} disabled={busy} className="ob-cta">
          {busy ? 'Setting up…' : 'Take me to the dashboard →'}
        </button>
      }
    >
      <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[28px] mb-1.5">
        What do you do?
      </h1>
      <p className="text-muted text-[13px] md:text-sm lg:text-[15px] leading-relaxed mb-5 lg:mb-6">
        Pick the services you offer. You can set pricing, availability and a
        service radius from your dashboard once you're in — no need to fill
        everything right now.
      </p>

      <div className="space-y-4 mb-3">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted mb-1.5">{cat}</div>
            <div className="grid gap-2 lg:gap-2.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
              {list.map((c) => {
                const on = selected.includes(c.name)
                return (
                  <button type="button" key={c.name} onClick={() => toggle(c.name)}
                    className={`px-2 py-2.5 lg:px-2.5 lg:py-3 text-center font-semibold
                                text-[11px] lg:text-[12px] rounded-[var(--rs)] lg:rounded-[10px]
                                bg-card border-[1.5px] transition-all
                                ${on ? 'border-accent bg-[#fff5f2] dark:bg-[#241a18] text-accent'
                                     : 'border-border text-muted hover:border-accent hover:bg-[#fff5f2] dark:hover:bg-[#241a18] hover:text-accent'}`}>
                    <div className="text-[20px] lg:text-[24px] mb-1">{c.icon}</div>
                    {c.display_name || c.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {err && <p className="text-[12px] text-danger mt-2">{err}</p>}

      <div className="mt-6 rounded-[var(--rs)] border border-border bg-surface p-3.5 text-[12px] text-muted leading-relaxed">
        <div className="font-bold text-text mb-1">What happens next?</div>
        You'll land on your dashboard. Add pricing whenever you're ready —
        customers will only see you for booking once a price is set.
      </div>
    </OnboardingShell>
  )
}
