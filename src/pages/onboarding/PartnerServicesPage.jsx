import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { loadMyPartner, updateMyPartnerThunk, selectPartnerProfile } from '@/features/partner/partnerSlice'
import { selectAvailableDays, selectAvailableHours, selectDynamicWorks } from '@/features/config/configSlice'
import OnboardingShell from './OnboardingShell'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'

// Group a flat works list by its parent category for the picker UI.
const groupWorks = (works) => {
  const m = {}
  for (const w of works) {
    const cat = w.category_name || w.category || 'Other'
    ;(m[cat] ||= []).push(w)
  }
  return m
}

const EXP_SNAPS = [
  [0,  '< 1 year — Just starting'],
  [1,  '1 year — Building experience'],
  [2,  '2 years — Getting confident'],
  [3,  '3 years — Getting established'],
  [5,  '5 years — Skilled professional'],
  [7,  '7 years — Highly experienced'],
  [10, '10 years — Decade of mastery'],
  [15, '15+ years — Industry veteran'],
  [20, '20 years — Master craftsman'],
  [30, '30 years — Legend of the trade'],
]
const snapLabel = (n) => {
  let best = EXP_SNAPS[0]
  for (const s of EXP_SNAPS) if (Math.abs(s[0] - n) < Math.abs(best[0] - n)) best = s
  return best[1]
}

const FALLBACK_DAYS     = ['Mon-Sat','Mon-Sun','Mon-Fri','Weekends only']
const FALLBACK_HOURS    = ['8am-8pm','6am-10pm','9am-6pm','24/7']

// ── Field label (reused) ──────────────────────────────────────────────
function FieldLabel ({ children, required = false, hint }) {
  return (
    <label className="flex items-center gap-1 text-xs lg:text-[13px] font-bold uppercase
                      tracking-[0.5px] text-text mb-[7px] lg:mb-2">
      {children}{required && <span className="text-accent text-sm leading-none">*</span>}
      {hint && <span className="ml-auto text-[10px] lg:text-[11px] font-medium normal-case tracking-normal text-muted">{hint}</span>}
    </label>
  )
}

// ── Toggle switch (no/available) ──────────────────────────────────────
function Toggle ({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors
                  ${on ? 'bg-success' : 'bg-border'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white
                        shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-[left]
                        ${on ? 'left-[calc(100%-22px)]' : ''}`} />
    </button>
  )
}

// ── Styled native select matching .ob-input ──────────────────────────
function OBSelect ({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 lg:px-3.5 lg:py-3 rounded-[var(--rs)] bg-card text-text
                 text-sm lg:text-[15px] border-[1.5px] border-border outline-none
                 focus:border-accent transition-colors">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function PartnerServicesPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const works    = useSelector(selectDynamicWorks)
  const catalog  = (works && works.length) ? works : FALLBACK_WORKS
  const grouped  = useMemo(() => groupWorks(catalog), [catalog])

  const partner      = useSelector(selectPartnerProfile)
  const availDays    = useSelector(selectAvailableDays)    || FALLBACK_DAYS
  const availHours   = useSelector(selectAvailableHours)   || FALLBACK_HOURS

  useEffect(() => { dispatch(loadMyPartner()) }, [dispatch])

  const [selected,  setSelected]  = useState([])
  const [prices,    setPrices]    = useState({})
  const [exp,       setExp]       = useState(3)
  const [days,      setDays]      = useState(availDays[0])
  const [hours,     setHours]     = useState(availHours[0])
  const [emergency, setEmergency] = useState(false)
  const [radius,    setRadius]    = useState(10)
  const [errors,    setErrors]    = useState({})
  const [busy,      setBusy]      = useState(false)
  const hydratedRef = useRef(false)

  // Hydrate from saved partner row once it lands, without clobbering user edits.
  useEffect(() => {
    if (!partner || hydratedRef.current) return
    const cps = partner.work_prices || partner.category_prices || []
    if (cps.length) {
      const nameOf = (c) => c.work_name || c.category_name
      setSelected(cps.map(nameOf))
      setPrices(Object.fromEntries(cps.map((c) => [nameOf(c), String(c.base_price || '')])))
    }
    if (partner.experience_years != null)                      setExp(Number(partner.experience_years))
    if (partner.availability_days)                             setDays(partner.availability_days)
    if (partner.availability_hours)                            setHours(partner.availability_hours)
    setEmergency(!!partner.emergency_service)
    if (partner.service_radius_km != null)                     setRadius(Number(partner.service_radius_km))
    hydratedRef.current = true
  }, [partner])

  const toggleCat = (name) => {
    setErrors((e) => ({ ...e, categories: '' }))
    setSelected((s) => s.includes(name) ? s.filter((x) => x !== name) : [...s, name])
  }

  const onContinue = async () => {
    const e = {}
    if (!selected.length)       e.categories = 'Select at least one service'
    const missingPrice = selected.some((n) => !(Number(prices[n]) > 0))
    if (missingPrice)           e.prices     = 'Please set a price for each service'
    setErrors(e)
    if (Object.keys(e).length) return

    setBusy(true)
    try {
      const work_prices = selected.map((name) => ({ work_name: name, base_price: Number(prices[name]) }))
      await dispatch(updateMyPartnerThunk({
        works: selected,
        primary_work: selected[0],
        experience_years: exp,
        availability_days: days,
        availability_hours: hours,
        emergency_service: emergency,
        service_radius_km: Number(radius),
        work_prices,
      })).unwrap()
      nav('/onboarding/review')
    } finally { setBusy(false) }
  }

  return (
    <OnboardingShell
      step={3} total={4}
      onBack={() => nav('/onboarding/profile')}
      footer={<button onClick={onContinue} disabled={busy} className="ob-cta">{busy ? 'Saving…' : 'Continue →'}</button>}
    >
      <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[28px] mb-1.5">
        Set up your services
      </h1>
      <p className="text-muted text-[13px] md:text-sm lg:text-[15px] leading-relaxed mb-6 lg:mb-7">
        Select your categories, availability, and pricing.
      </p>

      {/* Works grid — grouped under their parent category */}
      <div className="mb-5">
        <FieldLabel required hint="Pick the specific services you do">Your services</FieldLabel>
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted mb-1.5">{cat}</div>
              <div className="grid gap-2 lg:gap-2.5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
                {list.map((c) => {
                  const on = selected.includes(c.name)
                  return (
                    <button type="button" key={c.name} onClick={() => toggleCat(c.name)}
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
        {errors.categories && <p className="text-[11px] text-danger mt-2">{errors.categories}</p>}
      </div>

      {/* Experience slider */}
      <div className="mb-5">
        <FieldLabel required>Years of experience</FieldLabel>
        <div className="flex items-center gap-3.5">
          <input type="range" min="0" max="30" value={exp}
            onChange={(e) => setExp(Number(e.target.value))}
            className="flex-1 h-1 accent-accent bg-border rounded-full"/>
          <div className="font-display font-extrabold text-accent text-[20px] lg:text-[22px] min-w-[50px] text-right">
            {exp} yrs
          </div>
        </div>
        <p className="text-[11px] text-muted mt-1.5">{snapLabel(exp)}</p>
      </div>

      {/* Availability selects */}
      <div className="mb-5">
        <FieldLabel required>📅 Availability</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] text-muted mb-1">Days</div>
            <OBSelect value={days}  onChange={setDays}  options={availDays}/>
          </div>
          <div>
            <div className="text-[11px] text-muted mb-1">Hours</div>
            <OBSelect value={hours} onChange={setHours} options={availHours}/>
          </div>
        </div>
      </div>

      {/* Emergency */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <FieldLabel>🚨 Emergency Service</FieldLabel>
          <p className="text-[11px] text-muted">Enable if you're available for urgent / after-hours jobs</p>
        </div>
        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <Toggle on={emergency} onChange={setEmergency}/>
          <span className="text-[13px] font-semibold text-muted">{emergency ? 'Available' : 'No'}</span>
        </label>
      </div>

      {/* Radius */}
      <div className="mb-5">
        <FieldLabel>📍 Service Radius (km)</FieldLabel>
        <div className="flex items-center gap-3.5">
          <input type="range" min="1" max="100" value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="flex-1 h-1 accent-accent bg-border rounded-full"/>
          <div className="font-display font-extrabold text-accent text-base min-w-[56px] text-right">
            {radius} km
          </div>
        </div>
        <p className="text-[11px] text-muted mt-1.5">0 – 100 km. Customers within this range can see and request you.</p>
      </div>

      {/* Per-service pricing */}
      {selected.length > 0 && (
        <div className="mb-5">
          <FieldLabel required>💰 Pricing per service</FieldLabel>
          <div className="grid gap-3 lg:gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {selected.map((name) => {
              const cat = catalog.find((c) => c.name === name)
              return (
                <div key={name}
                  className="bg-card rounded-[var(--r)] border-[1.5px] border-border p-4 lg:p-5
                             shadow-card focus-within:border-accent transition">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="text-[26px]">{cat?.icon || '🔧'}</div>
                    <div className="font-bold text-sm lg:text-base">{name}</div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface rounded-[var(--rs)] px-3.5 py-2.5
                                  border-[1.5px] border-border focus-within:border-accent transition">
                    <span className="font-display font-extrabold text-xl lg:text-2xl">₹</span>
                    <input
                      type="number" min="0" max="99999"
                      placeholder="e.g. 500"
                      value={prices[name] || ''}
                      onChange={(e) => setPrices((s) => ({ ...s, [name]: e.target.value.replace(/\D/g, '') }))}
                      className="flex-1 bg-transparent outline-none font-bold text-xl lg:text-2xl min-w-0
                                 placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]"
                    />
                    <span className="text-xs font-semibold text-muted">/ visit</span>
                  </div>
                </div>
              )
            })}
          </div>
          {errors.prices && <p className="text-[11px] text-danger mt-2">{errors.prices}</p>}
        </div>
      )}
    </OnboardingShell>
  )
}
