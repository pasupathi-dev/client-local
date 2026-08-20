// All Categories — taxonomy v2.
//   • Empty query → the parent CATEGORY grid (tap → /category/:name works list).
//   • Typed query → server WORK search (tap → /work/:work decision page).
// Every keystroke hits the server so results always reflect the backend.

import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import * as api from '@/services/api'
import { loadCategories, selectCategories } from '@/features/catalog/catalogSlice'
import Loader from '@/components/Loader'

const DEBOUNCE_MS = 250

export default function AllCategoriesPage () {
  const dispatch   = useDispatch()
  const nav        = useNavigate()
  const allCats    = useSelector(selectCategories)
  const [q, setQ]          = useState('')
  const [hits, setHits]    = useState([])   // work search results
  const [loading, setLoading] = useState(false)
  const reqSeq = useRef(0)
  const timer  = useRef(null)

  const searching = !!q.trim()

  useEffect(() => { if (!allCats.length) dispatch(loadCategories()) }, [allCats.length, dispatch])

  // Debounced server WORK search on every keystroke.
  useEffect(() => {
    const needle = q.trim()
    if (!needle) { setLoading(false); setHits([]); return }

    clearTimeout(timer.current)
    const id = ++reqSeq.current
    setLoading(true)
    timer.current = setTimeout(() => {
      api.searchCategories(needle, 24)
        .then((r) => { if (id === reqSeq.current) setHits(r.hits || []) })
        .catch(() => { if (id === reqSeq.current) setHits([]) })
        .finally(() => { if (id === reqSeq.current) setLoading(false) })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer.current)
  }, [q])

  return (
    <div className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => nav(-1)}
          className="w-9 h-9 rounded-full card flex items-center justify-center">←</button>
        <h1 className="font-display text-xl font-extrabold">All Categories</h1>
      </div>

      {/* Search — every change triggers the API (searches works) */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔎</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search services (e.g. AC repair, Wiring, Cleaning…)"
          className="w-full h-11 pl-9 pr-10 rounded-[var(--r)] bg-card border border-border
                     text-[13px] text-text placeholder:text-muted
                     focus:outline-none focus:border-accent transition" />
        {loading && (
          <span className="absolute right-10 top-1/2 -translate-y-1/2"><Loader size={14} /></span>
        )}
        {q && (
          <button onClick={() => setQ('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full
                       text-muted hover:text-text hover:bg-surface transition">
            ✕
          </button>
        )}
      </div>

      {/* Search results — WORKS */}
      {searching ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {hits.map((h) => {
            const count = Number(h.online_count || 0)
            return (
              <button key={h.work} onClick={() => nav(`/work/${encodeURIComponent(h.work)}`)}
                className="card p-4 flex flex-col items-center text-center hover:border-accent transition relative">
                {count > 0 && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-[2px]
                                   rounded-xl text-[10px] font-bold bg-[#dcfce7] text-[#166534]">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    {count}
                  </span>
                )}
                <span className="text-3xl">{h.icon}</span>
                <span className="mt-2 font-bold text-sm">{h.display_name || h.work}</span>
                <span className="text-[10px] mt-0.5 text-muted">{h.category}</span>
              </button>
            )
          })}
          {!loading && hits.length === 0 && (
            <div className="col-span-full bg-card border border-border rounded-[var(--r)] py-10 text-center">
              <div className="text-[32px] mb-1 opacity-50">🔍</div>
              <div className="font-bold text-[14px] text-text">No services match "{q}"</div>
              <div className="text-[11px] text-muted mt-1">Try a different keyword.</div>
            </div>
          )}
        </div>
      ) : (
        /* Default — PARENT category grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {allCats.map((c) => {
            const count = Number(c.online_count || 0)
            return (
              <button key={c.name} onClick={() => nav(`/category/${encodeURIComponent(c.name)}`)}
                className="card p-4 flex flex-col items-center text-center hover:border-accent transition relative">
                {count > 0 && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-[2px]
                                   rounded-xl text-[10px] font-bold bg-[#dcfce7] text-[#166534]">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    {count}
                  </span>
                )}
                <span className="text-3xl">{c.icon}</span>
                <span className="mt-2 font-bold text-sm">{c.display_name || c.name}</span>
                <span className={`text-[10px] mt-0.5 ${count > 0 ? 'text-muted' : 'text-accent font-semibold'}`}>
                  {count > 0 ? `${count} online` : 'Browse services'}
                </span>
                {Number(c.weekly_bookings || 0) >= 3 && (
                  <span className="text-[10px] text-muted mt-0.5">
                    Booked {c.weekly_bookings} times this week in your area
                  </span>
                )}
              </button>
            )
          })}
          {allCats.length === 0 && (
            <div className="col-span-full bg-card border border-border rounded-[var(--r)] py-10 text-center">
              <div className="text-[32px] mb-1 opacity-50">🗂️</div>
              <div className="font-bold text-[14px] text-text">No categories yet</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
