// WorksPage — step 2 of the two-step drill-down (taxonomy v2).
// Mounted at /category/:name where :name is a PARENT category. Lists the
// works under it; tapping a work goes to /work/:work (the decision page).

import { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import { loadWorks, selectWorksFor } from '@/features/catalog/catalogSlice'
import { selectCategories } from '@/features/catalog/catalogSlice'
import { WORKS as FALLBACK_WORKS, CATEGORIES as FALLBACK_CATS } from '@/constants/catalog'

export default function WorksPage () {
  const { name }  = useParams()
  const dispatch  = useDispatch()
  const nav       = useNavigate()
  const category  = decodeURIComponent(name || '')

  const cats   = useSelector(selectCategories)
  const works  = useSelector(selectWorksFor(category))

  useEffect(() => { dispatch(loadWorks(category)) }, [category, dispatch])

  // Fallback to the bundled catalog until the API responds (or if it fails).
  const list = useMemo(() => {
    if (works && works.length) return works
    return FALLBACK_WORKS.filter((w) => w.category === category)
      .map((w) => ({ ...w, display_name: w.name, online_count: 0 }))
  }, [works, category])

  const catMeta = (cats || []).find((c) => c.name === category)
    || FALLBACK_CATS.find((c) => c.name === category)
    || null
  const catIcon = catMeta?.icon || '🗂️'

  return (
    <div className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => nav(-1)}
          className="w-9 h-9 rounded-full card flex items-center justify-center">←</button>
        <span className="text-2xl">{catIcon}</span>
        <h1 className="font-display text-xl font-extrabold">{catMeta?.display_name || category}</h1>
      </div>
      <p className="text-[12px] text-muted mb-4 -mt-2">Pick a service to book</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {list.map((w) => {
          const count = Number(w.online_count || 0)
          return (
            <button key={w.name} onClick={() => nav(`/work/${encodeURIComponent(w.name)}`)}
              className="card p-4 flex flex-col items-center text-center hover:border-accent transition relative">
              {count > 0 && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-[2px]
                                 rounded-xl text-[10px] font-bold bg-[#dcfce7] text-[#166534]">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  {count}
                </span>
              )}
              <span className="text-3xl">{w.icon}</span>
              <span className="mt-2 font-bold text-sm">{w.display_name || w.name}</span>
              <span className={`text-[10px] mt-0.5 ${count > 0 ? 'text-muted' : 'text-accent font-semibold'}`}>
                {count > 0 ? `${count} online` : 'No one online — schedule instead'}
              </span>
              {Number(w.weekly_bookings || 0) >= 3 && (
                <span className="text-[10px] text-muted mt-0.5">
                  Booked {w.weekly_bookings} times this week
                </span>
              )}
            </button>
          )
        })}
        {list.length === 0 && (
          <div className="col-span-full bg-card border border-border rounded-[var(--r)] py-10 text-center">
            <div className="text-[32px] mb-1 opacity-50">🗂️</div>
            <div className="font-bold text-[14px] text-text">No services in this category yet</div>
          </div>
        )}
      </div>
    </div>
  )
}
