// PartnerServicesModal — popup for partners to set up their services.
// Replaces the old onboarding /partner-services step. Shown automatically on
// the partner dashboard until they've filled in: at least one category with
// price + experience + availability_days/hours + radius.
// Without these, partners cannot go online.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loadMyPartner, updateMyPartnerThunk, selectPartnerProfile } from '@/features/partner/partnerSlice'
import { selectAvailableDays, selectAvailableHours, selectDynamicWorks } from '@/features/config/configSlice'
import { pushToast } from '@/features/app/appSlice'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'

const groupWorks = (works) => {
  const m = {}
  for (const w of works) {
    const cat = w.category_name || w.category || 'Other'
    ;(m[cat] ||= []).push(w)
  }
  return m
}

const FALLBACK_DAYS     = ['Mon-Sat','Mon-Sun','Mon-Fri','Weekends only']
const FALLBACK_HOURS    = ['8am-8pm','6am-10pm','9am-6pm','24/7']

const EXP_SNAPS = [
  [0,'< 1 year'], [1,'1 year'], [2,'2 years'], [3,'3 years'], [5,'5 years'],
  [7,'7 years'], [10,'10 years'], [15,'15+ years'], [20,'20 years'], [30,'30 years'],
]
const snapLabel = (n) => {
  let best = EXP_SNAPS[0]
  for (const s of EXP_SNAPS) if (Math.abs(s[0] - n) < Math.abs(best[0] - n)) best = s
  return best[1]
}

// Centralised "is this partner profile complete?" check — used by the dashboard
// to decide whether to show this modal and whether to enforce the online block.
export function isPartnerProfileComplete (p) {
  if (!p) return false
  const cps = p.work_prices || p.category_prices || []
  if (!cps.length) return false
  if (cps.some((c) => !(Number(c.base_price) > 0))) return false
  if (!(p.primary_work || p.primary_category)) return false
  if (!p.availability_days || !p.availability_hours) return false
  if (!(Number(p.service_radius_km) > 0)) return false
  if (p.experience_years == null) return false
  return true
}

function FieldLabel ({ children, required = false, hint }) {
  return (
    <label className="flex items-center gap-1 text-xs font-bold uppercase
                      tracking-[0.5px] text-text mb-2">
      {children}{required && <span className="text-accent text-sm leading-none">*</span>}
      {hint && <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted">{hint}</span>}
    </label>
  )
}

function Toggle ({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-success' : 'bg-border'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white
                        shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-[left]
                        ${on ? 'left-[calc(100%-22px)]' : ''}`} />
    </button>
  )
}

function OBSelect ({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-[var(--rs)] bg-card text-text
                 text-sm border-[1.5px] border-border outline-none
                 focus:border-accent transition-colors">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function PartnerServicesModal ({ open, onClose, dismissible = false }) {
  const dispatch = useDispatch()
  const works    = useSelector(selectDynamicWorks)
  const partner  = useSelector(selectPartnerProfile)
  const catalog  = (works && works.length) ? works : FALLBACK_WORKS
  const grouped  = useMemo(() => groupWorks(catalog), [catalog])

  const availDays    = useSelector(selectAvailableDays)    || FALLBACK_DAYS
  const availHours   = useSelector(selectAvailableHours)   || FALLBACK_HOURS

  useEffect(() => { if (open) dispatch(loadMyPartner()) }, [open, dispatch])

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

  // Hydrate from partner row — once per modal open
  useEffect(() => {
    if (!open) { hydratedRef.current = false; return }
    if (!partner || hydratedRef.current) return
    const cps = partner.work_prices || partner.category_prices || []
    if (cps.length) {
      const nameOf = (c) => c.work_name || c.category_name
      setSelected(cps.map(nameOf))
      setPrices(Object.fromEntries(cps.map((c) => [nameOf(c), String(c.base_price || '')])))
    }
    if (partner.experience_years != null) setExp(Number(partner.experience_years))
    if (partner.availability_days)        setDays(partner.availability_days)
    if (partner.availability_hours)       setHours(partner.availability_hours)
    setEmergency(!!partner.emergency_service)
    if (partner.service_radius_km != null) setRadius(Number(partner.service_radius_km))
    hydratedRef.current = true
  }, [open, partner])

  const toggleCat = (name) => {
    setErrors((e) => ({ ...e, categories: '' }))
    setSelected((s) => s.includes(name) ? s.filter((x) => x !== name) : [...s, name])
  }

  const onSave = async () => {
    const e = {}
    if (!selected.length) e.categories = 'Select at least one service'
    const missingPrice = selected.some((n) => !(Number(prices[n]) > 0))
    if (missingPrice)     e.prices = 'Please set a price for each service'
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
      // M87 — confirm save so the partner gets the same feedback they get
      // everywhere else (profile, bank, settings).
      dispatch(pushToast({ text: 'Services updated', type: 'success' }))
      onClose?.()
    } catch (err) {
      dispatch(pushToast({
        text: err?.message || 'Could not save services',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-3 md:p-6">
        <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-xl
                        max-h-[90vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-shrink-0">
            <div>
              <h2 className="font-display font-extrabold text-text text-lg md:text-xl">
                Set up your services
              </h2>
              <p className="text-muted text-xs md:text-[13px] mt-0.5">
                Required to go online. Select services, pricing, availability.
              </p>
            </div>
            {dismissible && (
              <button onClick={onClose}
                className="w-8 h-8 rounded-full bg-card border border-border text-muted hover:text-text
                           flex items-center justify-center text-sm flex-shrink-0">✕</button>
            )}
          </div>

          {/* Body — scrollable */}
          <div className="overflow-y-auto px-5 py-4 space-y-5">

            {/* Works — grouped under their parent category */}
            <div>
              <FieldLabel required hint="Pick the services you do">Your services</FieldLabel>
              <div className="space-y-3">
                {Object.entries(grouped).map(([cat, list]) => (
                  <div key={cat}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mb-1">{cat}</div>
                    <div className="grid gap-2"
                      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                      {list.map((c) => {
                        const on = selected.includes(c.name)
                        return (
                          <button type="button" key={c.name} onClick={() => toggleCat(c.name)}
                            className={`px-2 py-2.5 text-center font-semibold text-[11px]
                                        rounded-[var(--rs)] bg-card border-[1.5px] transition-all
                                        ${on ? 'border-accent bg-[#fff5f2] dark:bg-[#241a18] text-accent'
                                             : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
                            <div className="text-[20px] mb-1">{c.icon}</div>
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

            {/* Pricing */}
            {selected.length > 0 && (
              <div>
                <FieldLabel required>💰 Pricing per service</FieldLabel>
                <div className="grid gap-2.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {selected.map((name) => {
                    const cat = catalog.find((c) => c.name === name)
                    return (
                      <div key={name} className="bg-card rounded-[var(--rs)] border-[1.5px] border-border p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-lg">{cat?.icon || '🔧'}</div>
                          <div className="font-bold text-xs">{cat?.display_name || name}</div>
                        </div>
                        <div className="flex items-center gap-1 bg-surface rounded-[var(--rs)] px-2.5 py-1.5
                                        border-[1.5px] border-border focus-within:border-accent">
                          <span className="font-display font-extrabold text-base">₹</span>
                          <input
                            type="number" min="0" max="99999"
                            placeholder="500"
                            value={prices[name] || ''}
                            onChange={(e) => setPrices((s) => ({ ...s, [name]: e.target.value.replace(/\D/g, '') }))}
                            className="flex-1 bg-transparent outline-none font-bold text-base min-w-0
                                       placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]"
                          />
                          <span className="text-[10px] font-semibold text-muted">/visit</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {errors.prices && <p className="text-[11px] text-danger mt-2">{errors.prices}</p>}
              </div>
            )}

            {/* Experience */}
            <div>
              <FieldLabel required>Years of experience</FieldLabel>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="30" value={exp}
                  onChange={(e) => setExp(Number(e.target.value))}
                  className="flex-1 h-1 accent-accent bg-border rounded-full"/>
                <div className="font-display font-extrabold text-accent text-base min-w-[44px] text-right">
                  {exp} yrs
                </div>
              </div>
              <p className="text-[11px] text-muted mt-1">{snapLabel(exp)}</p>
            </div>

            {/* Availability */}
            <div>
              <FieldLabel required>📅 Availability</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-muted mb-1">Days</div>
                  <OBSelect value={days}  onChange={setDays}  options={availDays}/>
                </div>
                <div>
                  <div className="text-[10px] text-muted mb-1">Hours</div>
                  <OBSelect value={hours} onChange={setHours} options={availHours}/>
                </div>
              </div>
            </div>

            {/* Emergency */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <FieldLabel>🚨 Emergency Service</FieldLabel>
                <p className="text-[11px] text-muted">Enable for urgent / after-hours jobs</p>
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer pt-1">
                <Toggle on={emergency} onChange={setEmergency}/>
                <span className="text-xs font-semibold text-muted">{emergency ? 'On' : 'Off'}</span>
              </label>
            </div>

            {/* Radius */}
            <div>
              <FieldLabel required>📍 Service Radius (km)</FieldLabel>
              <div className="flex items-center gap-3">
                <input type="range" min="1" max="100" value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="flex-1 h-1 accent-accent bg-border rounded-full"/>
                <div className="font-display font-extrabold text-accent text-base min-w-[56px] text-right">
                  {radius} km
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-border bg-card flex items-center gap-2 flex-shrink-0">
            {dismissible && (
              <button onClick={onClose} className="ob-cta !bg-surface !text-text border-[1.5px] border-border flex-1">
                Later
              </button>
            )}
            <button onClick={onSave} disabled={busy} className="ob-cta flex-[2]">
              {busy ? 'Saving…' : 'Save Services'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
