// Partner — edit Services & Pricing on its own screen (reached from the
// "Manage services & pricing" button on the profile edit page). Keeps the main
// Edit My Details form focused on personal info + location.

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import * as api from '@/services/api'
import { updateMyPartnerThunk } from '@/features/partner/partnerSlice'
import { selectDynamicWorks } from '@/features/config/configSlice'
import { pushToast } from '@/features/app/appSlice'
import ProfileCard from '@/components/profile/ProfileCard'
import Loader from '@/components/Loader'
import { FormSkeleton } from '@/components/Skeleton'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'

const groupWorks = (works) => {
  const m = {}
  for (const w of works) {
    const cat = w.category_name || w.category || 'Other'
    ;(m[cat] ||= []).push(w)
  }
  return m
}

export default function PartnerServicesEditPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const works    = useSelector(selectDynamicWorks)
  const cats     = (works && works.length) ? works : FALLBACK_WORKS
  const grouped  = useMemo(() => groupWorks(cats), [cats])

  const [selected, setSelected] = useState([])
  const [prices,   setPrices]   = useState({})
  const [fetching, setFetching] = useState(true)
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    let alive = true
    api.fetchMyPartner()
      .then(({ partner }) => {
        if (!alive) return
        const cps = partner?.work_prices || partner?.category_prices || []
        const nameOf = (c) => c.work_name || c.category_name
        setSelected(cps.map(nameOf))
        setPrices(Object.fromEntries(cps.map((c) => [nameOf(c), String(c.base_price || '')])))
      })
      .catch(() => {})
      .finally(() => { if (alive) setFetching(false) })
    return () => { alive = false }
  }, [])

  const toggleCat = (name) =>
    setSelected((s) => s.includes(name) ? s.filter((x) => x !== name) : [...s, name])

  const goBack = () => nav('/partner/profile')

  const save = async () => {
    if (!selected.length) {
      return dispatch(pushToast({ text: 'Select at least one service', type: 'error' }))
    }
    if (selected.some((c) => !(Number(prices[c]) > 0))) {
      return dispatch(pushToast({ text: 'Set a price for every selected service', type: 'error' }))
    }
    setBusy(true)
    try {
      await dispatch(updateMyPartnerThunk({
        works: selected,
        primary_work: selected[0],
        work_prices: selected.map((name) => ({ work_name: name, base_price: Number(prices[name]) })),
      })).unwrap()
      dispatch(pushToast({ text: 'Services updated ✓', type: 'success' }))
      nav('/partner/profile', { replace: true })
    } catch (e) {
      dispatch(pushToast({ text: e?.message || 'Failed to save', type: 'error' }))
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="max-w-[1000px] mx-auto p-4 lg:p-6 animate-pgIn">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 lg:mb-5">
          <button onClick={goBack}
            className="w-9 h-9 rounded-full flex items-center justify-center
                       bg-card border border-border text-text text-lg
                       hover:border-accent hover:text-accent transition shrink-0">
            ←
          </button>
          <div>
            <h1 className="font-display font-extrabold text-text text-[18px] lg:text-xl leading-tight">
              Services &amp; Pricing
            </h1>
            <p className="text-[11px] text-muted mt-[1px]">
              Pick the services you offer and set a base visit price for each.
            </p>
          </div>
        </div>

        {fetching ? (
          <FormSkeleton fields={6} />
        ) : (
          <div className="space-y-4">
            {/* Services picker */}
            <ProfileCard icon="🔧" title="Your Services">
              <div className="space-y-3">
                {Object.entries(grouped).map(([cat, list]) => (
                  <div key={cat}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted mb-1">{cat}</div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
                      {list.map((c) => {
                        const on = selected.includes(c.name)
                        return (
                          <button type="button" key={c.name} onClick={() => toggleCat(c.name)}
                            className={`px-2 py-2.5 text-center font-semibold text-[11px]
                                        rounded-[var(--rs)] bg-card border-[1.5px] transition-all
                                        ${on
                                          ? 'border-accent bg-[#fff5f2] dark:bg-[#241a18] text-accent'
                                          : 'border-border text-muted hover:border-accent hover:bg-[#fff5f2] dark:hover:bg-[#241a18] hover:text-accent'}`}>
                            <div className="text-xl mb-1">{c.icon}</div>
                            {c.display_name || c.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ProfileCard>

            {/* Pricing */}
            {selected.length > 0 && (
              <ProfileCard icon="💰" title="Pricing Per Service">
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {selected.map((name) => {
                    const cat = cats.find((c) => c.name === name)
                    return (
                      <div key={name}
                        className="bg-card border-[1.5px] border-border rounded-[var(--r)] p-4 shadow-card">
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <span className="text-[26px]">{cat?.icon || '🔧'}</span>
                          <span className="font-bold text-sm">{name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-surface border-[1.5px] border-border
                                        rounded-[var(--rs)] px-3.5 py-2.5 focus-within:border-accent transition">
                          <span className="font-display font-extrabold text-xl">₹</span>
                          <input type="number" min="0" max="99999"
                            placeholder="e.g. 500"
                            value={prices[name] || ''}
                            onChange={(e) => setPrices((s) => ({ ...s, [name]: e.target.value.replace(/\D/g, '') }))}
                            className="flex-1 bg-transparent outline-none font-bold text-xl min-w-0
                                       placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]" />
                          <span className="text-xs text-muted">/visit</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ProfileCard>
            )}

            {/* Actions */}
            <div className="flex gap-2.5">
              <button type="button" onClick={goBack}
                className="flex-1 py-3 rounded-[var(--rs)] bg-surface border-[1.5px] border-border
                           text-sm font-semibold text-text hover:border-muted transition">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={busy}
                className="flex-[2] py-3 rounded-[var(--rs)] bg-accent text-white
                           font-display font-bold text-sm
                           shadow-[0_4px_16px_rgba(232,65,26,0.25)]
                           hover:brightness-90 disabled:opacity-60 transition">
                {busy ? 'Saving…' : 'Save services'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
